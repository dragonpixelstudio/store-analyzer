import { ANALYZER_TIMEOUT_MS, ANALYZER_CONFIG, collectAnalysisRuns, readAnalyzerObservations } from "./analyzerProvider";
import { GoogleGenAI, type Part } from "@google/genai";
import sharp from "sharp";
import {
  buildAnalyzerPrompt,
  type AnalyzerAssetMeta,
  type AnalyzerPlatform,
} from "@/lib/analyzerPrompt";
import {
  calculateDragonPixelScores,
  getReviewMode,
} from "@/lib/analyzerCore";
import { aspectLabel, normalizeForAnalysis } from "@/lib/imageNormalize";

// Re-score a single generated variant with the SAME observation prompt and the
// SAME deterministic scoring engine as /api/analyze, so "61 -> 74" is a real
// like-for-like comparison, not a second opinion from a different rubric.
//
// The score is the median of several independent runs: even at temperature 0
// a single vision pass can flip one observation boolean, which moves the
// weighted score by 10-15 points. The median absorbs that, so a variant is
// never refunded (or crowned "top pick") off one flaky read. Runs execute in
// parallel, so 5 costs the same latency as 1 and pennies in tokens.

const RESCORE_RUNS = 5;

export type RescoreAssetType = "icon" | "screenshot" | "capsule" | "feature-graphic";

const KIND_BY_TYPE: Record<RescoreAssetType, AnalyzerAssetMeta["providedKind"]> = {
  icon: "icon",
  screenshot: "screenshot",
  capsule: "steamCapsule",
  "feature-graphic": "featureGraphic",
};

const LABEL_BY_TYPE: Record<RescoreAssetType, string> = {
  icon: "APP ICON",
  screenshot: "SCREENSHOT 1",
  capsule: "STEAM CAPSULE",
  "feature-graphic": "FEATURE GRAPHIC",
};

export type RescoreResult = {
  score: number;
  summaryLine: string;
};

export async function rescoreSingleAsset(args: {
  base64: string;
  mimeType: string;
  assetType: RescoreAssetType;
  platform: AnalyzerPlatform;
  apiKey: string;
}): Promise<RescoreResult | null> {
  try {
    const buffer = Buffer.from(args.base64, "base64");
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;

    const assetMeta: AnalyzerAssetMeta = {
      label: LABEL_BY_TYPE[args.assetType],
      providedKind: KIND_BY_TYPE[args.assetType],
      widthPx: meta.width,
      heightPx: meta.height,
    };

    const hasIcon = args.assetType === "icon";
    const hasScreenshots = args.assetType === "screenshot";
    const hasCreatives = !hasIcon && !hasScreenshots;

    // Same normalization as /api/analyze so before/after scores compare the
    // same way regardless of the resolution Gemini generated at.
    const normalized = await normalizeForAnalysis(buffer);

    const parts: Part[] = [
      {
        text: buildAnalyzerPrompt({
          assets: [assetMeta],
          platform: args.platform,
          hasIcon,
          hasScreenshots,
          hasCreatives,
        }),
      },
      {
        text: `IMAGE 1: ${assetMeta.label}. Declared type: ${assetMeta.providedKind}. Aspect ratio: ${aspectLabel(assetMeta.widthPx, assetMeta.heightPx)}.`,
      },
      { inlineData: { mimeType: normalized.mimeType, data: normalized.base64 } },
    ];

    const ai = new GoogleGenAI({ apiKey: args.apiKey, httpOptions: { timeout: ANALYZER_TIMEOUT_MS } });

    const runOnce = async (): Promise<RescoreResult | null> => {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
        config: ANALYZER_CONFIG,
      });

      const observations = readAnalyzerObservations(response);
      if (!observations || observations.notGameAsset) return null;

      const calculated = calculateDragonPixelScores(
        observations,
        getReviewMode(hasIcon, hasIcon ? 0 : 1),
        { hasIcon, hasScreens: hasScreenshots, hasCreatives }
      );

      return {
        score: calculated.launchScore,
        summaryLine: calculated.summaryLine,
      };
    };

    const runs = (await collectAnalysisRuns(runOnce, RESCORE_RUNS))
      .filter((run): run is RescoreResult => run !== null)
      .sort((a, b) => a.score - b.score);

    if (runs.length === 0) return null;
    return runs[Math.floor(runs.length / 2)];
  } catch (err) {
    console.error(
      "variant rescore failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return null;
  }
}
