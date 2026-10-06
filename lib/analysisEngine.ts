import { inferPlatform } from "./storeSpecs";
import { GoogleGenAI, type Part } from "@google/genai";
import { ANALYZER_TIMEOUT_MS, ANALYZER_CONFIG, GENRE_CONFIG, collectAnalysisRuns, readAnalyzerObservations } from "./analyzerProvider";
import { buildAnalyzerPrompt, parseAnalyzerReply, type AnalyzerAssetMeta, type AnalyzerPlatform } from "./analyzerPrompt";
import { calculateDragonPixelScores, clientReadout, getReviewMode, verdictFromScore } from "./analyzerCore";
import { analysisWorkflow } from "./analysisWorkflow";
import { aspectLabel, normalizeForAnalysis } from "./imageNormalize";
import { consistentReview, reviewIdentity, normalizeReviewContext, resolveReviewPlatform } from "./analysisConsistency";
import { globalRatelimit, redis } from "./ratelimit";
import { attachBenchmarkComparison, benchmarkEvidencePrompt, buildBenchmarkEvidence, genreClassifierPrompt, sanitizeGenreClassification } from "./iconEvidence";
import type { BenchmarkGenre } from "./benchmarkCatalog";

export class AnalysisCapacityError extends Error { constructor() { super("The analyzer is at daily capacity. Please try again tomorrow."); } }
export async function analyzeArtwork(args: { assets: { meta: AnalyzerAssetMeta; buffer: Buffer }[]; platform: AnalyzerPlatform; context?: string; genreOverride?: BenchmarkGenre | null }) {
  const assetMetas = args.assets.map(asset => asset.meta), assetBuffers = args.assets.map(asset => asset.buffer);
  const gameContext = normalizeReviewContext(args.context ?? ""), genreOverride = args.genreOverride ?? null;
  const prepared = await Promise.all(assetBuffers.map(normalizeForAnalysis));
  const explicitPlatform = resolveReviewPlatform(args.platform, assetMetas.map(meta => meta.providedKind));
  const resolvedPlatform = explicitPlatform === "unknown" ? inferPlatform(assetMetas) ?? "unknown" : explicitPlatform;
  const identity = reviewIdentity(assetMetas.map((meta, i) => ({ kind: meta.providedKind, aspect: aspectLabel(meta.widthPx, meta.heightPx), normalized: prepared[i].base64 })), resolvedPlatform, gameContext, genreOverride);
  const platform = identity.platform;
  const icon = assetMetas.some(meta => meta.providedKind === "icon");
  const screenshots = assetMetas.filter(meta => meta.providedKind === "screenshot"), creatives = assetMetas.filter(meta => !["icon", "screenshot"].includes(meta.providedKind));
  const reviewMode = getReviewMode(icon, screenshots.length + creatives.length);
  const imageParts: Part[] = assetMetas.flatMap((meta, i) => [{ text: `IMAGE ${i + 1}: ${meta.label}. Declared type: ${meta.providedKind}. Aspect ratio: ${aspectLabel(meta.widthPx, meta.heightPx)}.` }, { inlineData: { mimeType: prepared[i].mimeType, data: prepared[i].base64 } }]);
  const compute = async () => {
    const global = await globalRatelimit.limit("global");
    if (!global.success || global.reason === "timeout") {
      throw new AnalysisCapacityError();
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      httpOptions: { timeout: ANALYZER_TIMEOUT_MS },
    });
    let genre = sanitizeGenreClassification({});
    try {
      const representativeParts = imageParts.slice(0, 2);
      const genreResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: genreClassifierPrompt(gameContext) },
              ...representativeParts,
            ],
          },
        ],
        config: GENRE_CONFIG,
      });
      genre = sanitizeGenreClassification(
        parseAnalyzerReply(genreResponse.text || "{}")
      );
    } catch (err) {
      console.error(
        "benchmark genre classification failed:",
        err instanceof Error ? err.message : "unknown error"
      );
    }
    if (genreOverride) {
      genre = {
        ...genre,
        primary: genreOverride,
        secondary: genre.secondary.filter(
          (candidate) => candidate !== genreOverride
        ),
        confidence: "high",
        selectionSource: "user-confirmed",
        visibleSignals: [
          `User confirmed ${genreOverride} for benchmark selection.`,
          ...genre.visibleSignals,
        ].slice(0, 5),
      };
    }

    const benchmarkTargets: Array<{
      userAsset: Buffer;
      assetKind: "icon" | "screenshot";
    }> = [];
    const iconIndex = assetMetas.findIndex(meta => meta.providedKind === "icon");
    if (iconIndex >= 0 && assetBuffers[iconIndex]) {
      benchmarkTargets.push({ userAsset: assetBuffers[iconIndex], assetKind: "icon" });
    }
    const firstScreenshotIndex = assetMetas.findIndex(meta => meta.providedKind === "screenshot");
    if (screenshots.length > 0 && assetBuffers[firstScreenshotIndex]) {
      benchmarkTargets.push({
        userAsset: assetBuffers[firstScreenshotIndex],
        assetKind: "screenshot",
      });
    }

    const benchmarkRuns = (
      await Promise.all(
        benchmarkTargets.map((target) =>
          buildBenchmarkEvidence({
            ...target,
            platform,
            genre,
          }).catch((err) => {
            console.error(
              `benchmark ${target.assetKind} evidence failed:`,
              err instanceof Error ? err.message : "unknown error"
            );
            return null;
          })
        )
      )
    ).filter(
      (
        item
      ): item is Awaited<ReturnType<typeof buildBenchmarkEvidence>> =>
        item !== null
    );
    const initialBenchmarkEvidence = benchmarkRuns.map((run) => run.evidence);
    const benchmarkParts: Part[] = benchmarkRuns.flatMap((run) =>
      run.imageParts.flatMap((item) => [
        {
          text: `PUBLISHED BENCHMARK ${item.reference.id}: ${item.reference.title}; platform ${item.reference.platform}; asset type ${item.reference.assetKind}; role ${item.reference.role}; matched genres ${item.reference.matchedGenres.join(", ") || "none"}; pattern ${item.reference.pattern}.`,
        },
        {
          inlineData: {
            mimeType: item.mimeType,
            data: item.base64,
          },
        },
      ])
    );
    const parts: Part[] = [
      {
        text: buildAnalyzerPrompt({
          assets: assetMetas,
          platform,
          gameContext,
          hasIcon: Boolean(icon),
          hasScreenshots: screenshots.length > 0,
          hasCreatives: creatives.length > 0,
          benchmarkContext: initialBenchmarkEvidence
            .map(benchmarkEvidencePrompt)
            .join("\n\n"),
        }),
      },
      ...imageParts,
      ...benchmarkParts,
    ];

    // The pinned score must never be one lucky draw: even at temperature 0 a
    // single vision pass drifts a few observation booleans (worth 5-10 score
    // points). Three independent reads run in parallel and the run whose
    // launch score is the MEDIAN becomes the report - same policy as the
    // variant re-scorer, so the analyzer and re-scorer agree on method.
    const ANALYSIS_RUNS = 3;
    const scoringFlags = {
      hasIcon: Boolean(icon),
      hasScreens: screenshots.length > 0,
      hasCreatives: creatives.length > 0,
    };
    const runAnalysis = async () => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: ANALYZER_CONFIG,
      });
      const observations = readAnalyzerObservations(response);
      return {
        observations,
        calculated: calculateDragonPixelScores(
          observations,
          reviewMode,
          scoringFlags
        ),
      };
    };

    const runs = (await collectAnalysisRuns(runAnalysis, ANALYSIS_RUNS))
      .sort((a, b) => a.calculated.launchScore - b.calculated.launchScore);

    const { observations, calculated } = runs[Math.floor(runs.length / 2)];

    const benchmarkComparisons =
      observations.benchmarkComparisons ||
      (observations.benchmarkComparison
        ? [observations.benchmarkComparison]
        : []);
    const benchmarkEvidence = initialBenchmarkEvidence.map((evidence) =>
      attachBenchmarkComparison(
        evidence,
        benchmarkComparisons.find(
          (comparison) => comparison.assetKind === evidence.assetKind
        ) ||
          (initialBenchmarkEvidence.length === 1
            ? benchmarkComparisons[0]
            : undefined)
      )
    );
    const verdict = verdictFromScore(calculated.launchScore);

    return {
      observations,
      calculated,
      verdict,
      benchmarkEvidence,
      reviewIdentity: identity,
      reliability: { reads: runs.length, min: runs[0].calculated.launchScore, max: runs[runs.length - 1].calculated.launchScore },
      workflow: analysisWorkflow(assetMetas, observations),
      ...clientReadout(observations),
    };


  };
  type Payload = Awaited<ReturnType<typeof compute>>;
  const valid = (value: unknown): value is Payload => {
    const v = value as Payload | null;
    return !!v && v.reviewIdentity?.id === identity.id && v.reviewIdentity?.version === identity.version && Number.isFinite(v.calculated?.launchScore) && !!v.observations && Array.isArray(v.calculated?.breakdown);
  };
  return consistentReview(identity.id, redis, valid, compute);
}
