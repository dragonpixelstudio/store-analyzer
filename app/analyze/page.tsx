"use client";
import { artworkRequest } from "@/lib/artworkRequest";
import StorePreview from "@/app/components/StorePreview";
import ReviewSettings from "@/app/components/ReviewSettings";
import type { ReviewIdentity } from "@/lib/analysisConsistency";
import ResultsOverview, { ResultPriorities } from "@/app/components/ResultsOverview";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import StudioHeader from "@/app/components/StudioHeader";
import { saveHandoff, readHandoff, clearHandoff, handoffFile, fileDataUrl } from "@/lib/studioHandoff";
import type { AnalysisStep } from "@/lib/analysisWorkflow";

import BenchmarkDossier, { type BenchmarkEvidence } from "@/app/components/BenchmarkDossier";
import {
  BENCHMARK_GENRES,
  type BenchmarkGenre,
  type BenchmarkReferenceRole,
} from "@/lib/benchmarkCatalog";
import { identifyAsset, inferPlatform } from "@/lib/storeSpecs";
import { track } from "@/app/track";
import SampleShowcase from "@/app/components/SampleShowcase";
import {
  RevealFlow,
  type RadarRow,
} from "@/app/components/reportFx";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_SCREENSHOTS = 3;
const MAX_CREATIVES = 3;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];

type AccountPlan = "free" | "quick" | "indie" | "pro";

type AccountStatus = {
  plan: AccountPlan;
  isSubscriber: boolean;
  ownerTestingUntil?: number | null;
  credits?: { remaining?: number };
};

type Role = "icon" | "screenshot" | "featureGraphic" | "steamCapsule" | "keyArt";

const ROLE_LABELS: Record<Role, string> = {
  icon: "Icon",
  screenshot: "Screenshot",
  featureGraphic: "Feature graphic",
  steamCapsule: "Steam capsule",
  keyArt: "Key art",
};
const CREATIVE_ROLES: Role[] = ["featureGraphic", "steamCapsule", "keyArt"];
const isCreative = (r: Role) => CREATIVE_ROLES.includes(r);

type Asset = {
  id: string;
  file: File;
  url: string;
  w: number;
  h: number;
  role: Role;
  error: string | null;
  overflow?: boolean;
};

type ScoreKey =
  | "shelfReadability"
  | "clickPull"
  | "gameplayClarity"
  | "emotionalSignal"
  | "marketingConfidence"
  | "visualPolish";

type BreakdownRow = { key: string; label: string; value: string; assessed: boolean };

type ConversionRisk = {
  assessed: boolean;
  level: string;
  position: number;
  reason: string;
};

type StoreImpact = { headline: string; tone: "good" | "warn" | "bad" };
type ShipDecision = { label: string; tone: "good" | "warn" | "bad"; sub: string };
type DragonPixelFix = { action: string; why: string; change: string };

type ClickReads = {
  curiosity: string[];
  reward: string[];
  danger: string[];
  urgency: string[];
  blockers: string[];
};
type GameplayReads = { clear: string[]; unclear: string[] };
type EmotionReads = { present: string[]; missing: string[] };

type EditPlan = {
  mode?: "conservative_polish" | "concept_upgrade";
  editStrength?: "subtle" | "clear" | "strong";
  preserve?: string[];
  requiredEdits?: string[];
  forbiddenChanges?: string[];
  successChecks?: string[];
  variant1Mode?: string;
  variant2Mode?: string;
};

type BenchmarkGenreChoice = "auto" | BenchmarkGenre;

const GENRE_LABELS: Record<BenchmarkGenre, string> = {
  action: "Action",
  survivor: "Survivor / bullet heaven",
  roguelite: "Roguelite",
  shooter: "Shooter",
  platformer: "Platformer",
  rpg: "RPG",
  puzzle: "Puzzle",
  strategy: "Strategy",
  simulation: "Simulation",
  racing: "Racing",
  sports: "Sports",
  horror: "Horror",
  casual: "Casual",
};

type AnalyzePayload = {
  reviewIdentity?: ReviewIdentity;
  reliability?: { reads: number; min: number; max: number };
  demo?: boolean;
  workflow?: AnalysisStep[];
  error?: string;
  verdict?: string;
  reportId?: string;
  specNotes?: string[];
  benchmarkEvidence?: BenchmarkEvidence[];
  calculated?: {
    launchScore?: number;
    potentialAfterFixes?: number;
    reviewModeLabel?: string;
    reviewModeNote?: string;
    scores?: Partial<Record<ScoreKey, number>>;
    breakdown?: BreakdownRow[];
    conversionRisk?: ConversionRisk;
    storeImpact?: StoreImpact;
    decision?: ShipDecision;
    reviewNoun?: string;
    summaryLine?: string;
    strengths?: string[];
    weaknesses?: string[];
    biggestProblem?: string;
    topFixes?: DragonPixelFix[];
    revisionBrief?: string;
    editPlan?: EditPlan;
  };
  shelf?: { visible: string[]; lost: string[] };
  click?: ClickReads;
  gameplay?: GameplayReads;
  emotion?: EmotionReads;
};

/* ---------- response parsing (kept strict) ---------- */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown) {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function parseScores(v: unknown): Partial<Record<ScoreKey, number>> | undefined {
  if (!isRecord(v)) return undefined;
  const keys: ScoreKey[] = [
    "shelfReadability",
    "clickPull",
    "gameplayClarity",
    "emotionalSignal",
    "marketingConfidence",
    "visualPolish",
  ];
  const out: Partial<Record<ScoreKey, number>> = {};
  for (const k of keys) {
    const n = num(v[k]);
    if (n != null) out[k] = n;
  }
  return out;
}
function parseBreakdown(v: unknown): BreakdownRow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const rows = v.filter(isRecord).map((r) => ({
    key: str(r.key) || "",
    label: str(r.label) || "",
    value: str(r.value) || "",
    assessed: typeof r.assessed === "boolean" ? r.assessed : false,
  }));
  return rows.length ? rows : undefined;
}
function parseRisk(v: unknown): ConversionRisk | undefined {
  if (!isRecord(v)) return undefined;
  return {
    assessed: typeof v.assessed === "boolean" ? v.assessed : false,
    level: str(v.level) || "",
    position: num(v.position) ?? 50,
    reason: str(v.reason) || "",
  };
}
function parseImpact(v: unknown): StoreImpact | undefined {
  if (!isRecord(v)) return undefined;
  const tone = v.tone === "good" || v.tone === "warn" || v.tone === "bad" ? v.tone : "warn";
  return { headline: str(v.headline) || "", tone };
}
function parseDecision(v: unknown): ShipDecision | undefined {
  if (!isRecord(v)) return undefined;
  const tone = v.tone === "good" || v.tone === "warn" || v.tone === "bad" ? v.tone : "warn";
  return { label: str(v.label) || "", tone, sub: str(v.sub) || "" };
}
function parseFixes(v: unknown): DragonPixelFix[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return { action: item, why: "", change: "" };
      if (isRecord(item)) {
        return {
          action: str(item.action) || "",
          why: str(item.why) || "",
          change: str(item.change) || "",
        };
      }
      return null;
    })
    .filter((f): f is DragonPixelFix => f !== null && f.action.length > 0);
}

function parseEditPlan(v: unknown): EditPlan | undefined {
  if (!isRecord(v)) return undefined;

  const preserve = strList(v.preserve);
  const requiredEdits = strList(v.requiredEdits);
  const forbiddenChanges = strList(v.forbiddenChanges);
  const successChecks = strList(v.successChecks);
  const mode = str(v.mode);
  const editStrength = str(v.editStrength);
  const variant1Mode = str(v.variant1Mode);
  const variant2Mode = str(v.variant2Mode);

  if (
    !preserve.length &&
    !requiredEdits.length &&
    !forbiddenChanges.length &&
    !successChecks.length &&
    !mode &&
    !editStrength &&
    !variant1Mode &&
    !variant2Mode
  ) {
    return undefined;
  }

  return {
    mode:
      mode === "conservative_polish" || mode === "concept_upgrade"
        ? mode
        : undefined,
    editStrength:
      editStrength === "subtle" || editStrength === "clear" || editStrength === "strong"
        ? editStrength
        : undefined,
    preserve,
    requiredEdits,
    forbiddenChanges,
    successChecks,
    variant1Mode,
    variant2Mode,
  };
}

function parseBenchmarkEvidence(v: unknown): BenchmarkEvidence[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((item) => {
      const genre = isRecord(item.genre) ? item.genre : {};
      const references = Array.isArray(item.references)
        ? item.references.filter(isRecord).map((ref) => ({
            id: str(ref.id) || "",
            title: str(ref.title) || "Published reference",
            platform: str(ref.platform) || "unknown",
            assetKind:
              ref.assetKind === "screenshot"
                ? ("screenshot" as const)
                : ("icon" as const),
            sourceUrl: str(ref.sourceUrl) || "",
            thumb: str(ref.thumb) || "",
            pattern: str(ref.pattern) || "",
            visiblePrinciple: str(ref.visiblePrinciple) || "",
            matchedGenres: strList(ref.matchedGenres),
            role:
              ref.role === "closest-mechanic" ||
              ref.role === "closest-icon-structure" ||
              ref.role === "adjacent-shelf-competitor"
                ? (ref.role as BenchmarkReferenceRole)
                : ("adjacent-shelf-competitor" as BenchmarkReferenceRole),
          }))
        : [];
      const fetchRaw = isRecord(item.referenceFetch)
        ? item.referenceFetch
        : {};
      const fetchStatus: "complete" | "partial" | "unavailable" =
        fetchRaw.status === "complete" ||
        fetchRaw.status === "partial" ||
        fetchRaw.status === "unavailable"
          ? fetchRaw.status
          : references.length > 0
            ? "complete"
            : "unavailable";
      const fetchFailures = Array.isArray(fetchRaw.failures)
        ? fetchRaw.failures.filter(isRecord).map((failure) => ({
            id: str(failure.id) || "",
            title: str(failure.title) || "Published reference",
            platform: str(failure.platform) || "unknown",
            reason: str(failure.reason) || "unknown",
          }))
        : [];
      const comparisonRaw = isRecord(item.comparison) ? item.comparison : null;
      const measurements = Array.isArray(item.measurements)
        ? item.measurements
            .filter(isRecord)
            .map((measurement) => ({
              sizePx: num(measurement.sizePx) ?? 0,
              activePixelCoveragePct:
                num(measurement.activePixelCoveragePct) ?? 0,
              activeBoundsCoveragePct:
                num(measurement.activeBoundsCoveragePct) ?? 0,
              edgeDensityPct: num(measurement.edgeDensityPct) ?? 0,
            }))
        : undefined;

      return {
        platform: str(item.platform) || "unknown",
        assetKind:
          item.assetKind === "screenshot"
            ? ("screenshot" as const)
            : ("icon" as const),
        genre: {
          primary: str(genre.primary) || "unknown",
          secondary: strList(genre.secondary),
          confidence: str(genre.confidence) || "low",
          visibleSignals: strList(genre.visibleSignals),
          selectionSource:
            genre.selectionSource === "user-confirmed"
              ? ("user-confirmed" as const)
              : ("inferred" as const),
        },
        measurementConfidence: str(item.measurementConfidence),
        measurements,
        smallSizeRetentionPct: num(item.smallSizeRetentionPct),
        references,
        referenceFetch: {
          requested: num(fetchRaw.requested) ?? references.length,
          resolved: num(fetchRaw.resolved) ?? references.length,
          failed: num(fetchRaw.failed) ?? fetchFailures.length,
          status: fetchStatus,
          failures: fetchFailures,
        },
        comparison: comparisonRaw
          ? {
              attemptedPattern: str(comparisonRaw.attemptedPattern),
              nearestReferenceIds: strList(
                comparisonRaw.nearestReferenceIds
              ),
              sharedPrinciples: strList(comparisonRaw.sharedPrinciples),
              importantDifferences: strList(
                comparisonRaw.importantDifferences
              ),
              measuredFacts: strList(comparisonRaw.measuredFacts),
              visualObservations: strList(
                comparisonRaw.visualObservations
              ),
              inferences: strList(comparisonRaw.inferences),
              recommendation: str(comparisonRaw.recommendation),
              cropOnlyEnough:
                typeof comparisonRaw.cropOnlyEnough === "boolean"
                  ? comparisonRaw.cropOnlyEnough
                  : undefined,
              confidence: str(comparisonRaw.confidence),
            }
          : undefined,
        caveats: strList(item.caveats),
      };
    })
    .filter(
      (item) =>
        item.references.length > 0 ||
        item.measurements?.length ||
        item.referenceFetch?.status === "unavailable"
    );
}

function editPlanToText(plan: EditPlan | null): string {
  if (!plan) return "";

  return [
    plan.mode ? `Mode: ${plan.mode}` : "",
    plan.editStrength ? `Edit strength: ${plan.editStrength}` : "",
    ...(plan.preserve ?? []).map((item) => `Preserve: ${item}`),
    ...(plan.requiredEdits ?? []).map((item) => `Edit: ${item}`),
    ...(plan.forbiddenChanges ?? []).map((item) => `Do not: ${item}`),
    ...(plan.successChecks ?? []).map((item) => `Success check: ${item}`),
    plan.variant1Mode ? `Variant 1 mode: ${plan.variant1Mode}` : "",
    plan.variant2Mode ? `Variant 2 mode: ${plan.variant2Mode}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parsePayload(raw: string): AnalyzePayload | null {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const workflow = Array.isArray(parsed.workflow) ? parsed.workflow.filter((v): v is AnalysisStep => isRecord(v) && Number.isSafeInteger(v.index) && [v.label, v.observation, v.issue, v.instruction].every(s => typeof s === "string" && s.length <= 600)) : [];
  const rawCalc = isRecord(parsed.calculated) ? parsed.calculated : undefined;
  const c = rawCalc
    ? {
        launchScore: num(rawCalc.launchScore),
        potentialAfterFixes: num(rawCalc.potentialAfterFixes),
        reviewModeLabel: str(rawCalc.reviewModeLabel),
        reviewModeNote: str(rawCalc.reviewModeNote),
        scores: parseScores(rawCalc.scores),
        breakdown: parseBreakdown(rawCalc.breakdown),
        conversionRisk: parseRisk(rawCalc.conversionRisk),
        storeImpact: parseImpact(rawCalc.storeImpact),
        decision: parseDecision(rawCalc.decision),
        reviewNoun: str(rawCalc.reviewNoun),
        summaryLine: str(rawCalc.summaryLine),
        strengths: strList(rawCalc.strengths),
        weaknesses: strList(rawCalc.weaknesses),
        biggestProblem: str(rawCalc.biggestProblem),
        topFixes: parseFixes(rawCalc.topFixes),
        revisionBrief: str(rawCalc.revisionBrief),
        editPlan: parseEditPlan(rawCalc.editPlan),
      }
    : undefined;
  const obs = isRecord(parsed.observations) ? parsed.observations : undefined;
  const shelfObs = obs && isRecord(obs.shelfTest) ? obs.shelfTest : undefined;
  const shelf = shelfObs
    ? { visible: strList(shelfObs.visibleElements), lost: strList(shelfObs.lostElements) }
    : undefined;
  const clickObs = obs && isRecord(obs.clickTest) ? obs.clickTest : undefined;
  const click: ClickReads | undefined = clickObs
    ? {
        curiosity: strList(clickObs.curiositySignals),
        reward: strList(clickObs.rewardSignals),
        danger: strList(clickObs.dangerSignals),
        urgency: strList(clickObs.urgencySignals),
        blockers: strList(clickObs.clickBlockers),
      }
    : undefined;
  const gpObs = obs && isRecord(obs.gameplayCommunication) ? obs.gameplayCommunication : undefined;
  const gameplay: GameplayReads | undefined = gpObs
    ? {
        clear: strList(gpObs.understoodIn3Seconds),
        unclear: strList(gpObs.unclearIn3Seconds),
      }
    : undefined;
  const emObs = obs && isRecord(obs.emotionalSignal) ? obs.emotionalSignal : undefined;
  const emotion: EmotionReads | undefined = emObs
    ? {
        present: strList(emObs.currentSignals),
        missing: strList(emObs.missingSignals),
      }
    : undefined;
  return {
    workflow,
    demo: parsed.demo === true,
    error: str(parsed.error),
    verdict: str(parsed.verdict),
    reportId: str(parsed.reportId),
    specNotes: strList(parsed.specNotes),
    benchmarkEvidence: parseBenchmarkEvidence(parsed.benchmarkEvidence),
    calculated: c,
    shelf,
    click,
    gameplay,
    emotion,
  };
}


/* ---------- helpers ---------- */
function formatSize(bytes: number) {
  return (bytes / 1048576).toFixed(2) + " MB";
}
// Known store dimensions identify the asset outright (920×430 = 2x Steam
// header capsule, not a Play feature graphic); the aspect-ratio heuristic is
// only the fallback for sizes the spec database doesn't recognise.
function classify(w: number, h: number): Role {
  if (!w || !h) return "screenshot";
  const match = identifyAsset(w, h);
  if (match) return match.spec.role;
  const ar = w / h;
  if (ar >= 0.9 && ar <= 1.15) return "icon"; // square → icon
  if (ar < 0.9) return "screenshot"; // portrait → phone screenshot
  // landscape: ~2:1 is the Play feature graphic; wider/other → key art
  if (ar >= 1.6 && ar <= 2.2) return "featureGraphic";
  return "keyArt";
}
function readImage(file: File): Promise<{ w: number; h: number; broken: boolean; url: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, broken: false, url });
    img.onerror = () => resolve({ w: 0, h: 0, broken: true, url });
    img.src = url;
  });
}

/* count-up for result numbers, respects reduced motion */
/* ---------- review dimensions (icons defined once, reused by the idle
   feature row and the loading scanner so the set never drifts) ---------- */
const REVIEW_DIMENSIONS: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: "Shelf test",
    desc: "Survives at 32px?",
    icon: (
      <svg className="h-[18px] w-[18px] flex-none text-[var(--cyan)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
  {
    title: "Click pull",
    desc: "Reason to tap",
    icon: (
      <svg className="h-[18px] w-[18px] flex-none text-[var(--cyan)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m13 2-9 12h7l-2 8 9-12h-7z" />
      </svg>
    ),
  },
  {
    title: "Gameplay clarity",
    desc: "Read in 3 seconds",
    icon: (
      <svg className="h-[18px] w-[18px] flex-none text-[var(--cyan)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    title: "Priority fixes",
    desc: "What to do first",
    icon: (
      <svg className="h-[18px] w-[18px] flex-none text-[var(--cyan)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h12" />
      </svg>
    ),
  },
];

/* ---------- 32px shelf preview: real uploaded asset, downscaled on canvas ---------- */
function ShelfPreview({
  asset,
  shelf,
}: {
  asset: Asset;
  shelf: { visible: string[]; lost: string[] } | null;
}) {
  const fullRef = useRef<HTMLCanvasElement>(null);
  const tinyRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      const full = fullRef.current;
      if (full) {
        const fw = 150;
        const fh = Math.max(1, Math.round((fw * img.naturalHeight) / img.naturalWidth));
        full.width = fw;
        full.height = fh;
        full.getContext("2d")?.drawImage(img, 0, 0, fw, fh);
      }
      const tiny = tinyRef.current;
      if (tiny) {
        tiny.width = 32;
        tiny.height = 32;
        const ctx = tiny.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0a0612";
          ctx.fillRect(0, 0, 32, 32);
          const s = Math.min(32 / img.naturalWidth, 32 / img.naturalHeight);
          const dw = img.naturalWidth * s;
          const dh = img.naturalHeight * s;
          ctx.drawImage(img, (32 - dw) / 2, (32 - dh) / 2, dw, dh);
        }
      }
    };
    img.src = asset.url;
  }, [asset.url]);

  const visible = (shelf?.visible ?? []).slice(0, 3);
  const lost = (shelf?.lost ?? []).slice(0, 3);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="text-center">
        <canvas ref={fullRef} className="rounded-lg border border-[var(--edge)] bg-black" style={{ width: 150, height: "auto" }} />
        <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">Full size</div>
      </div>
      <div className="text-center">
        <canvas ref={tinyRef} className="rounded-md border border-[var(--edge)] bg-black" style={{ width: 32, height: 32, imageRendering: "auto" }} />
        <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">At 32px</div>
      </div>
      <div className="min-w-[150px] flex-1 text-[13.5px]">
        {visible.map((v) => (
          <div key={`v-${v}`} className="mb-1.5 flex items-center gap-2 text-[var(--muted)]">
            <span className="flex-none font-bold text-[var(--green)]">✓</span> {v}
          </div>
        ))}
        {lost.map((l) => (
          <div key={`l-${l}`} className="mb-1.5 flex items-center gap-2 text-[#c3a0a8]">
            <span className="flex-none font-bold text-[var(--magenta)]">✗</span> {l}
          </div>
        ))}
        {visible.length === 0 && lost.length === 0 && (
          <div className="text-[var(--faint)]">If you can&apos;t tell what the game is at this size, neither can a shopper scrolling past.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- small visual primitives for the result sections ---------- */
function ChipGroup({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "cyan" | "green" | "gold" | "magenta";
}) {
  if (!items.length) return null;
  const c =
    tone === "green"
      ? "var(--green)"
      : tone === "gold"
      ? "var(--gold)"
      : tone === "magenta"
      ? "var(--magenta)"
      : "var(--cyan)";
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: c }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <span
            key={`${i}-${t.slice(0, 16)}`}
            className="rounded-full border bg-white/[.03] px-3 py-1 text-[12.5px] font-semibold text-[var(--foreground)]"
            style={{ borderColor: c }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChecklistCols({
  good,
  bad,
  goodLabel,
  badLabel,
}: {
  good: string[];
  bad: string[];
  goodLabel: string;
  badLabel: string;
}) {
  const Item = ({ t, ok }: { t: string; ok: boolean }) => (
    <div
      className="mb-1.5 flex items-start gap-2 text-[13.5px] leading-snug"
      style={{ color: ok ? "var(--muted)" : "#c8aab2", breakInside: "avoid" }}
    >
      <span className="mt-px flex-none font-bold" style={{ color: ok ? "var(--green)" : "var(--magenta)" }}>
        {ok ? "✓" : "✗"}
      </span>
      <span>{t}</span>
    </div>
  );

  const hasGood = good.length > 0;
  const hasBad = bad.length > 0;

  // one-sided → flow full width in balanced columns, no reserved empty half
  if (hasGood !== hasBad) {
    const items = hasGood ? good : bad;
    const label = hasGood ? goodLabel : badLabel;
    const ok = hasGood;
    return (
      <div>
        <div
          className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em]"
          style={{ color: ok ? "var(--green)" : "var(--magenta)" }}
        >
          {label}
        </div>
        <div className="gap-x-8 sm:columns-2">
          {items.map((t, i) => (
            <Item key={i} t={t} ok={ok} />
          ))}
        </div>
      </div>
    );
  }

  // both sides present → paired two columns
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--green)]">
          {goodLabel}
        </div>
        {good.map((t, i) => (
          <Item key={`g-${i}`} t={t} ok />
        ))}
      </div>
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--magenta)]">
          {badLabel}
        </div>
        {bad.map((t, i) => (
          <Item key={`b-${i}`} t={t} ok={false} />
        ))}
      </div>
    </div>
  );
}

function ShareReportBar({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/report/${reportId}` : `/report/${reportId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      track("share_copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard can be unavailable; the visible link below still works.
    }
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(255,182,78,.28)] px-5 py-3.5"
      style={{ background: "var(--panel)" }}
    >
      <div className="min-w-0">
        <span className="font-brand block text-[13px] font-bold text-[var(--foreground)]">
          Share this report with your team
        </span>
        <span className="block truncate text-[12px] font-semibold text-[var(--faint)]">
          Send it to your team, your artist, or your community - no login needed.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/report/${reportId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[var(--edge)] bg-white/[.03] px-4 py-2 text-[12px] font-bold text-[var(--muted)] transition hover:border-[rgba(255,182,78,.4)] hover:text-[var(--cyan)]"
        >
          Open
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-full px-4 py-2 text-[12px] font-black text-[#05121a] transition hover:-translate-y-0.5 hover:brightness-110"
          style={{ background: "linear-gradient(120deg,var(--cyan),var(--magenta))" }}
        >
          {copied ? "Copied ✓" : "Copy share link"}
        </button>
      </div>
    </div>
  );
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-[var(--edge)] p-6"
      style={{ background: "var(--panel)" }}
    >
      <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function AnalyzingPanel() {
  const checks = ["Shelf readability", "Click pull", "Genre recognition", "Communication risk"];
  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-[rgba(255,182,78,.28)] px-6 py-12 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 0%,rgba(255,182,78,.12),transparent 55%),var(--panel)",
      }}
    >
      <div className="relative mb-7 h-28 w-28">
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[rgba(255,182,78,.28)] bg-[rgba(255,182,78,.04)] shadow-[inset_0_0_18px_rgba(255,182,78,.08)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%,rgba(255,182,78,.22),transparent 55%),radial-gradient(circle at 72% 74%,rgba(244,151,151,.2),transparent 55%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          />
          <div
            className="dpx-scanline absolute inset-x-0 top-0 h-8"
            style={{
              background: "linear-gradient(180deg,transparent,rgba(255,182,78,.55),transparent)",
              boxShadow: "0 0 20px rgba(255,182,78,.6)",
            }}
          />
        </div>
        <span className="dpx-reticle absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-[var(--cyan)]" />
        <span className="dpx-reticle absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-[var(--cyan)]" />
        <span className="dpx-reticle absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-[var(--cyan)]" />
        <span className="dpx-reticle absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-[var(--cyan)]" />
      </div>

      <h2 className="font-brand mt-2 text-2xl font-semibold">Running Dragon Pixel review</h2>

      <ul className="mt-7 w-full max-w-xs list-none space-y-2.5 text-left">
        {checks.map((c, i) => (
          <li
            key={c}
            className="dpx-activate flex items-center gap-3 rounded-xl border border-[var(--edge)] bg-white/[.025] px-3.5 py-2.5"
            style={{ animationDelay: `${i * 0.8}s` }}
          >
            <span className="flex-1 text-[13.5px] font-bold">{c}</span>
            <span className="dpx-check flex-none text-[var(--green)]" style={{ animationDelay: `${i * 0.8}s` }}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5 9-11" />
              </svg>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 text-[12px] font-semibold text-[var(--muted)]">
        Building review…
      </div>
      <div className="relative mt-3 h-1 w-48 overflow-hidden rounded-full bg-white/10">
        <div
          className="dpx-bar absolute inset-y-0 w-1/3 rounded-full"
          style={{ background: "linear-gradient(90deg,transparent,var(--cyan),transparent)" }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [gameName, setGameName] = useState("");
  const [gamePitch, setGamePitch] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("auto");
  const [demoReview, setDemoReview] = useState(false);
  const [workflow, setWorkflow] = useState<AnalysisStep[]>([]);
  const [handoffNotice, setHandoffNotice] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [mode, setMode] = useState("");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>> | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [risk, setRisk] = useState<ConversionRisk | null>(null);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [topFixes, setTopFixes] = useState<DragonPixelFix[]>([]);
  const [revisionBrief, setRevisionBrief] = useState("");
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);
  const [shelf, setShelf] = useState<{ visible: string[]; lost: string[] } | null>(null);
  const [click, setClick] = useState<ClickReads | null>(null);
  const [gameplay, setGameplay] = useState<GameplayReads | null>(null);
  const [emotion, setEmotion] = useState<EmotionReads | null>(null);
  const [error, setError] = useState("");
  const [reviewIdentity, setReviewIdentity] = useState<ReviewIdentity | null>(null);
  const [reliability, setReliability] = useState<{ reads: number; min: number; max: number } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [specNotes, setSpecNotes] = useState<string[]>([]);
  const [benchmarkEvidence, setBenchmarkEvidence] = useState<
    BenchmarkEvidence[]
  >([]);
  const [account, setAccount] = useState<AccountStatus | null>(null);

  const refreshAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/account/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.account) setAccount(data.account);
    } catch {
      // Never block the analyzer on account status.
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refreshAccount(), 0);
    // Re-check when the tab regains focus: after checkout the user returns
    // here and the subscribe panel must disappear immediately.
    const onFocus = () => void refreshAccount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshAccount]);

  const isPaidSubscriber =
    account?.isSubscriber === true ||
    account?.plan === "indie" ||
    account?.plan === "pro";
  const [dragOver, setDragOver] = useState(false);
  const [benchmarkGenre, setBenchmarkGenre] =
    useState<BenchmarkGenreChoice>("auto");

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const RADAR_LABELS: Record<string, string> = {
    shelfReadability: "Shelf",
    clickPull: "Click",
    gameplayClarity: "Gameplay",
    emotionalSignal: "Emotion",
    marketingConfidence: "Marketing",
    visualPolish: "Polish",
  };
  const radarRows: RadarRow[] = breakdown.map((row) => ({
    label: RADAR_LABELS[row.key] ?? row.label,
    value: row.assessed ? scores?.[row.key as ScoreKey] ?? null : null,
  }));

  /* ---------- asset management ---------- */
  const normalize = useCallback((list: Asset[]): Asset[] => {
    let iconSeen = false;
    let shots = 0;
    let creatives = 0;
    return list.map((a) => {
      if (a.error) return a;
      let role = a.role;
      if (role === "icon") {
        if (iconSeen) role = "screenshot";
        else iconSeen = true;
      }
      let overflow = false;
      if (role === "screenshot") {
        shots += 1;
        overflow = shots > MAX_SCREENSHOTS;
      } else if (isCreative(role)) {
        creatives += 1;
        overflow = creatives > MAX_CREATIVES;
      }
      return { ...a, role, overflow };
    });
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      setError("");
      const next: Asset[] = [];
      for (const file of files) {
        let err: string | null = null;
        if (!OK_TYPES.includes(file.type)) err = "Not a PNG, JPEG, or WebP";
        else if (file.size > MAX_FILE_BYTES) err = "Over 2 MB";
        const meta = await readImage(file);
        if (!err && meta.broken) err = "Couldn't read image";
        next.push({
          id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          file,
          url: meta.url,
          w: meta.w,
          h: meta.h,
          role: err ? "screenshot" : classify(meta.w, meta.h),
          error: err,
        });
      }
      if (next.some((a) => !a.error)) track("upload");
      setAssets((prev) => {
        const merged = [...prev];
        for (const a of next) {
          if (merged.some((m) => m.file.name === a.file.name && m.file.size === a.file.size)) {
            URL.revokeObjectURL(a.url);
            continue;
          }
          merged.push(a);
        }
        return normalize(merged);
      });
    },
    [normalize]
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const transfer = readHandoff("analyze");
      if (transfer) {
        const file = handoffFile(transfer);
        const meta = await readImage(file);
        if (cancelled) { URL.revokeObjectURL(meta.url); return; }
        setAssets([{ id: crypto.randomUUID(), file, url: meta.url, w: meta.w, h: meta.h, role: transfer.role, error: meta.broken ? "Could not read image" : null }]);
        setGameName(transfer.gameName); setGamePitch(transfer.gamePitch); setTargetPlatform(transfer.platform || "auto");
        setHandoffNotice("Artwork and game details brought over from Studio. Review the settings, then run your analysis.");
        clearHandoff();
      }
      // Fresh uploads start with explicit context, never an unrelated saved Studio draft.
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const setRole = (id: string, role: Role) => {
    setAssets((prev) =>
      normalize(
        prev.map((a) => {
          if (a.id === id) return { ...a, role };
          // demote any other icon when one is promoted
          if (role === "icon" && a.role === "icon") return { ...a, role: "screenshot" };
          return a;
        })
      )
    );
  };

  const removeAsset = (id: string) =>
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return normalize(prev.filter((a) => a.id !== id));
    });

  /* ---------- drag + drop ---------- */
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (loading) return;
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (loading) return;
    if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  };

  /* ---------- analyze ---------- */
  async function analyze() {
    if (loading) return; // double-submit guard
    const usable = assets.filter((a) => !a.error && !a.overflow);
    if (usable.length === 0) {
      setError("Add at least one valid image.");
      return;
    }

    const icon = assets.find((a) => a.role === "icon" && !a.error);
    const shots = assets.filter((a) => a.role === "screenshot" && !a.error && !a.overflow);
    const creatives = assets.filter((a) => isCreative(a.role) && !a.error && !a.overflow);

    const fd = new FormData();
    if (icon) fd.append("icon", icon.file);
    shots.forEach((s) => fd.append("screenshots", s.file));
    creatives.forEach((c) => {
      fd.append("creatives", c.file);
      fd.append("creativeKinds", c.role);
    });
    // Target platform derived only from UNAMBIGUOUS assets (capsules, feature
    // graphics). A square icon must never vote: the same icon exported at
    // 192/512/1024 would infer different stores, fragmenting the consistency
    // cache and giving the same art different scores.
    const detectedPlatform =
      usable.some((a) => a.role === "steamCapsule")
        ? "steam"
        : inferPlatform(
            usable
              .filter((a) => a.role !== "icon")
              .map((a) => ({ widthPx: a.w, heightPx: a.h }))
          );
    if (usable.reduce((sum, asset) => sum + asset.file.size, 0) > 3.9 * 1024 * 1024) { setError("Keep the combined upload below 3.9 MB, or review fewer images together."); return; }
    if (targetPlatform !== "auto") fd.append("platform", targetPlatform);
    else if (detectedPlatform) fd.append("platform", detectedPlatform);
    fd.append("gameContext", [gameName.trim(), gamePitch.trim()].filter(Boolean).join(" - "));
    if (benchmarkGenre !== "auto") {
      fd.append("benchmarkGenre", benchmarkGenre);
    }

    track("analyze_start");
    setLoading(true);
    setError("");
    setScore(null);
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setStrengths([]);
    setWeaknesses([]);
    setTopFixes([]);
    setRevisionBrief("");
    setEditPlan(null);
    setShelf(null);
    setClick(null);
    setGameplay(null);
    setEmotion(null);
    setReportId(null);
    setSpecNotes([]);
    setBenchmarkEvidence([]);

    try {
      const res = await artworkRequest("/api/analyze", { method: "POST", body: fd });
      const raw = await res.text();
      const data = parsePayload(raw);

      if (!data) {
        setError("The server returned an unexpected response. Please try again.");
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || `Request failed (${res.status}). Please try again.`);
        return;
      }

      setDemoReview(data.demo === true);
      setWorkflow(data.workflow || []);
      setScore(data.calculated?.launchScore ?? null);
      setMode(data.calculated?.reviewModeLabel || "");
      setScores(data.calculated?.scores ?? null);
      setBreakdown(data.calculated?.breakdown ?? []);
      setRisk(data.calculated?.conversionRisk ?? null);
      setStrengths(data.calculated?.strengths ?? []);
      setWeaknesses(data.calculated?.weaknesses ?? []);
      setTopFixes(data.calculated?.topFixes ?? []);
      setRevisionBrief(data.calculated?.revisionBrief ?? "");
      setEditPlan(data.calculated?.editPlan ?? null);
      setShelf(data.shelf ?? null);
      setReviewIdentity(data.reviewIdentity ?? null); setReliability(data.reliability ?? null);
      setClick(data.click ?? null);
      setGameplay(data.gameplay ?? null);
      setEmotion(data.emotion ?? null);
      setReportId(data.reportId ?? null);
      setSpecNotes(data.specNotes ?? []);
      setBenchmarkEvidence(data.benchmarkEvidence ?? []);
      track("analyze_success");
      // Viral-loop attribution: this visitor viewed a shared report earlier
      // this session, then analyzed their own asset. Count it once.
      try {
        if (sessionStorage.getItem("dpx_saw_shared_report")) {
          track("loop_return");
          sessionStorage.removeItem("dpx_saw_shared_report");
        }
      } catch {
        // sessionStorage may be unavailable; loop metric is best-effort.
      }
    } catch {
      setError("Could not reach the analyzer. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- reset for a fresh run ---------- */
  function reset() {
    setWorkflow([]); setHandoffNotice("");
    assets.forEach((a) => URL.revokeObjectURL(a.url));
    setAssets([]);
    setScore(null);
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setStrengths([]);
    setWeaknesses([]);
    setTopFixes([]);
    setRevisionBrief("");
    setEditPlan(null);
    setShelf(null);
    setClick(null);
    setGameplay(null);
    setEmotion(null);
    setReportId(null);
    setSpecNotes([]);
    setBenchmarkEvidence([]);
    setBenchmarkGenre("auto");
    setError("");
  }

  const hasUsable = assets.some((a) => !a.error && !a.overflow);
  const hasResult = score != null;

  // worst-first priority order; assessed categories first, unassessed last
  const orderedBars = [...breakdown].sort((a, b) => {
    if (a.assessed !== b.assessed) return a.assessed ? -1 : 1;
    const av = scores?.[a.key as ScoreKey] ?? 999;
    const bv = scores?.[b.key as ScoreKey] ?? 999;
    return av - bv;
  });
  const scoreColor = (v: number) =>
    v >= 80 ? "var(--green)" : v >= 50 ? "var(--gold)" : "var(--magenta)";
  // server truth: did the input actually let us assess gameplay clarity (needs screenshots)?
  const gameplayAssessed = breakdown.find((r) => r.key === "gameplayClarity")?.assessed ?? false;
  // the 32px shelf test is an icon concept; only show it when an icon was uploaded
  const previewAsset = assets.find((a) => a.role === "icon" && !a.error) || null;
  const editPlanText = editPlanToText(editPlan) || revisionBrief;
  const revisionBriefLines = revisionBrief
    .split(/\n+/)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];
      if (trimmed.length > 130 && trimmed.includes(". ")) {
        return trimmed
          .split(". ")
          .map((part, index, list) => (index < list.length - 1 && !part.endsWith(".") ? `${part}.` : part));
      }
      return [trimmed];
    })
    .map((line) => line.replace(/^[-\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const reviewAssets = [...assets.filter(a => !a.error && !a.overflow)].sort((a,b) => (a.role === "icon" ? 0 : a.role === "screenshot" ? 1 : 2) - (b.role === "icon" ? 0 : b.role === "screenshot" ? 1 : 2));
  async function improveInStudio(asset: Asset, index: number) {
    if (transferring) return;
    setTransferring(true);
    try {
      const instruction = workflow.find(step => step.index === index)?.instruction || (reviewAssets.length === 1 ? editPlanText.slice(0,600) : "");
      if (asset.role === "featureGraphic" || asset.role === "keyArt") {
        await navigator.clipboard.writeText(instruction || "Review the analysis findings and preserve the original artwork identity.");
        setHandoffNotice("Revision brief copied. Use it with your preferred image editor; this asset type has no dedicated Studio format yet."); return;
      }
      await saveHandoff({ destination: "studio", dataUrl: await fileDataUrl(asset.file), name: asset.file.name.slice(0,200), width: asset.w, height: asset.h, role: asset.role, gameName, gamePitch, instruction, platform: targetPlatform === "auto" ? (asset.role === "steamCapsule" ? "steam" : "unknown") : targetPlatform });
      router.push("/?from=analyze");
    } catch { setHandoffNotice("Could not transfer this image. Browser storage may be full or unavailable; download your artwork and copy the edit plan below."); }
    finally { setTransferring(false); }
  }
  return (<>
    <StudioHeader />
    <main className="analysis-page">
      <header className="analysis-heading"><div><p className="product-eyebrow">ANALYZE</p><h1>{hasResult ? "Analysis results" : "Review your artwork"}</h1>{!hasResult && <p>Upload your assets. Review the signals. Edit in Studio.</p>}</div><Link href="/">Back to Studio →</Link></header>
      {account?.ownerTestingUntil && <p className="analysis-brief-notice" role="status"><strong>Owner testing active</strong> · Reviews do not use credits or daily slots. Provider capacity limits still apply.</p>}
      {handoffNotice && !hasResult && <p role="status" className="analysis-brief-notice">{handoffNotice}</p>}

      {!hasResult && !loading && (
      <>
        <div className="analysis-grid">
        <section className="analysis-upload" aria-label="Upload and analysis settings">
          <div>
            <h2 className="font-brand font-semibold">Start with your artwork</h2>
            <p className="upload-intro">Add an image and a little context for a focused review.</p>
            {/* dropzone */}
            <label
              data-dragging={dragOver}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              aria-disabled={loading}
              className={`dpx-pulse relative flex flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed px-6 py-12 text-center transition-all ${
                loading
                  ? "pointer-events-none cursor-not-allowed border-[var(--edge)] bg-white/[.02] opacity-50"
                  : dragOver
                  ? "-translate-y-0.5 cursor-pointer border-[var(--cyan)] bg-[rgba(255,182,78,.1)] shadow-[0_0_36px_rgba(255,182,78,.28)]"
                  : "cursor-pointer border-[rgba(255,182,78,.4)] bg-[rgba(255,182,78,.04)]"
              }`}
            >
              <svg className="h-10 w-10 text-[var(--cyan)] opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V6" /><path d="m8 10 4-4 4 4" /><rect x="4" y="16" width="16" height="4" rx="1.5" />
              </svg>
              <span className="font-brand text-base font-bold">Click to upload</span>
              <span className="upload-subtitle">
                Any image
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={loading}
                className="absolute h-px w-px overflow-hidden opacity-0"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles([...e.target.files]);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="upload-limits">
              PNG, JPEG, WebP · 2&nbsp;MB each · 3.9&nbsp;MB total
            </p>

            <div className="analysis-context">
              <label htmlFor="analysis-game">Game name<input id="analysis-game" maxLength={80} value={gameName} onChange={e => setGameName(e.target.value)} placeholder="Your game" /></label>
              <label htmlFor="analysis-platform">Target store<select id="analysis-platform" value={targetPlatform} onChange={e => setTargetPlatform(e.target.value)}><option value="auto">Auto-detect</option><option value="steam">Steam</option><option value="google-play">Google Play</option><option value="app-store">App Store</option><option value="unknown">General artwork</option></select></label>
              <label htmlFor="analysis-context">What should players understand?<textarea id="analysis-context" value={gamePitch} maxLength={300} onChange={e => setGamePitch(e.target.value)} placeholder="Genre, player action and what makes your game different…" /><span>{gamePitch.length}/300 · Optional, but helps make feedback specific.</span></label>
            </div>
            {/* detected assets */}
            {assets.length > 0 && (
              <div className="mt-4 flex flex-col gap-2.5">
                {assets.map((a) => {
                  const bad = Boolean(a.error) || a.overflow;
                  const detail = a.error
                    ? a.error
                    : a.overflow
                    ? a.role === "screenshot"
                      ? "Extra screenshot - max 3"
                      : "Extra creative - max 3"
                    : `${a.w}×${a.h} · ${formatSize(a.file.size)}`;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                        bad ? "border-[rgba(244,151,151,.5)] bg-[rgba(244,151,151,.06)]" : "border-[var(--edge)] bg-white/[.03]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt="" className="h-11 w-11 flex-none rounded-lg bg-black object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{a.file.name}</div>
                        <div className={`text-xs font-semibold ${bad ? "text-[var(--magenta)]" : "text-[var(--faint)]"}`}>
                          {detail}
                        </div>
                      </div>
                      {!a.error && (
<select
  value={a.role}
  disabled={loading}
  onChange={(e) => setRole(a.id, e.target.value as Role)}
  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
    a.role === "icon"
      ? "border-[rgba(255,182,78,.35)] bg-[#102636]"
      : a.role === "screenshot"
      ? "border-[rgba(244,151,151,.35)] bg-[#24132b]"
      : "border-[rgba(255,194,61,.35)] bg-[#2a2410]"
  }`}
  style={{
    colorScheme: "dark",
  }}
>
                          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => removeAsset(a.id)}
                        disabled={loading}
                        aria-label="Remove"
                        className="flex-none px-1 text-xl leading-none text-[var(--faint)] hover:text-[var(--magenta)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {assets.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--edge)] bg-[var(--well)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label
                      htmlFor="benchmark-genre"
                      className="font-brand text-[12px] font-bold uppercase tracking-[.12em] text-[var(--foreground)]"
                    >
                      Benchmark genre
                    </label>
                    <p className="mt-1 max-w-[52ch] text-[11.5px] font-semibold leading-snug text-[var(--muted)]">
                      Confirm this when the icon cannot reveal the mechanic.
                      It only changes reference selection and not the analysis score.
                    </p>
                  </div>
                  <select
                    id="benchmark-genre"
                    value={benchmarkGenre}
                    disabled={loading}
                    onChange={(event) =>
                      setBenchmarkGenre(
                        event.target.value as BenchmarkGenreChoice
                      )
                    }
                    className="min-h-11 min-w-[230px] rounded-xl border border-[rgba(255,182,78,.3)] bg-[#0b1724] px-3 text-[13px] font-bold text-white outline-none transition focus:border-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="auto">Auto-detect from asset</option>
                    {BENCHMARK_GENRES.map((genre) => (
                      <option key={genre} value={genre}>
                        {GENRE_LABELS[genre]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm font-semibold text-[var(--magenta)]">{error}</p>}

            <button
              onClick={analyze}
              disabled={!hasUsable || loading}
              className="analysis-submit font-brand mt-4 min-h-[58px] w-full rounded-2xl text-sm font-semibold text-[#05121a] transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
              style={{
                background: "linear-gradient(120deg,var(--cyan),var(--magenta))",
                boxShadow: "0 0 28px rgba(255,182,78,.24),0 16px 44px rgba(244,151,151,.14)",
              }}
            >
              {loading ? "Analyzing…" : "Analyze assets"}
            </button>
          </div>
        </section>

        <aside className="analysis-side"><h2>What’s checked</h2><ol><li><strong>Read at a glance</strong><p>Focal point, title and small-size readability.</p></li><li><strong>Understand the evidence</strong><p>Gameplay clarity, when screenshots are supplied.</p></li><li><strong>Bring the brief to Studio</strong><p>Send the image and revision brief to Studio.</p></li></ol><div><p>3 free reviews daily, shared by wallet and network. Extra reviews cost 1 credit with your confirmation. Failed reviews return their slot or credit.</p><Link href="/pricing">How credits work →</Link><p>Scores are AI-assisted estimates, not audience testing or a promise of sales.</p></div></aside>
        </div>
        {/* SAMPLE - a real saved report (SAMPLE_REPORT_ID); renders nothing if unset */}
        <SampleShowcase>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {REVIEW_DIMENSIONS.map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--edge)] bg-white/[.025] px-3.5 py-2.5"
              >
                {item.icon}
                <span>
                  <span className="block text-[13.5px] font-bold">{item.title}</span>
                  <span className="block text-[11.5px] font-semibold text-[var(--faint)]">
                    {item.desc}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </SampleShowcase>
      </>
      )}

      {/* loading - replaces the whole panel */}
      {loading && (
        <div className="mt-10">
          <AnalyzingPanel />
        </div>
      )}

      {/* result dashboard */}
      {hasResult && (
        <RevealFlow className="mt-8 flex flex-col gap-4">
          {demoReview && <p role="status" className="analysis-brief-notice"><strong>LOCAL SAMPLE REVIEW</strong> · Example data, not an AI review.</p>}

          <ResultsOverview score={score!} rows={radarRows} mode={mode} priorities={topFixes.length} risk={risk} />
          {!demoReview && <ReviewSettings identity={reviewIdentity} reliability={reliability} />}
          <StorePreview assets={reviewAssets.map(asset => ({ src: asset.url, kind: asset.role, width: asset.w, height: asset.h, label: asset.file.name }))} title={gameName || "Your game"} platform={reviewIdentity?.platform || targetPlatform} />
          <ResultPriorities fixes={topFixes} />
          <section className="analysis-handoff"><h2>Edit artwork</h2><p>Open a brief for free. Apply an AI edit for 1 credit.</p>{reviewAssets.map((asset,index) => <article key={asset.id}><Image src={asset.url} alt={ROLE_LABELS[asset.role]} width={76} height={64} unoptimized /><div><h3>{asset.file.name}</h3><p>{workflow.find(step => step.index === index)?.issue || "Review the findings below and choose your next change."}</p></div><button disabled={transferring} onClick={() => void improveInStudio(asset,index)}>{asset.role === "screenshot" ? "Frame in Studio · free" : asset.role === "featureGraphic" || asset.role === "keyArt" ? "Copy revision brief" : "Improve in Studio →"}</button></article>)}</section>
          {reportId && <ShareReportBar reportId={reportId} />}
          {specNotes.length > 0 && <div className="analysis-brief-notice">{specNotes.map((note,i) => <p key={i}>{note}</p>)}</div>}
          <details className="result-evidence"><summary>Store previews & visual evidence</summary><div>
          {/* 32PX STORE TEST - strongest feature, directly under the verdict (icon only) */}
          {previewAsset && (
            <ReportCard title="32px store test">
              <ShelfPreview asset={previewAsset} shelf={shelf} />
              <p className="mt-4 text-[13px] font-semibold italic text-[var(--faint)]">
                Your actual icon, shrunk to store size. Whatever survives here is your real first impression.
              </p>
            </ReportCard>
          )}

          {benchmarkEvidence.map((evidence) => (
            <BenchmarkDossier
              key={`${evidence.platform}-${evidence.assetKind}`}
              evidence={evidence}
            />
          ))}

          {/* WHY IT SCORED THIS - 3 strengths / 3 weaknesses, no essay */}
          {(strengths.length > 0 || weaknesses.length > 0) && (
            <ReportCard title="Why it scored this">
              <ChecklistCols
                good={strengths}
                bad={weaknesses}
                goodLabel="Visual strengths"
                badLabel="Visual weaknesses"
              />
            </ReportCard>
          )}

          </div></details>

          {revisionBrief && (
            <details id="dpx-generate" className="result-evidence" style={{ scrollMarginTop: 16 }}><summary>Full revision brief</summary><div>
            <ReportCard title="Revision brief">
              <div className="rounded-xl border border-[var(--edge)] bg-[var(--well)] p-4">
                {revisionBriefLines.map((line, index) => (
                  <p
                    key={`${index}-${line.slice(0, 18)}`}
                    className="mb-2 last:mb-0 text-[13.5px] font-semibold leading-snug text-[var(--text-2)]"
                  >
                    {line}
                  </p>
                ))}
              </div>

            </ReportCard>
            </div></details>
          )}

          {/* ADVANCED ANALYSIS - everything detailed, collapsed */}
          <details
            className="dpx-details dpx-details-pulse group rounded-2xl border border-[var(--edge)]"
            style={{ background: "var(--panel)" }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 transition hover:bg-white/[.02]">
              <span>
                <span className="font-brand block text-[14px] font-bold tracking-[.04em] text-[var(--foreground)]">
                  Advanced analysis
                </span>
                <span className="block text-[12.5px] font-semibold text-[var(--faint)]">
                  Full score breakdown and signal detail
                </span>
              </span>
              <span className="dpx-chev flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[var(--edge)] text-[var(--cyan)] transition group-hover:border-[rgba(255,182,78,.5)] group-hover:bg-[rgba(255,182,78,.08)]">
                <svg className="h-4 w-4 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>

            <div className="flex flex-col gap-7 border-t border-[var(--edge)] px-6 py-6">
              {/* category bars - weakest first */}
              {orderedBars.length > 0 && (
                <div>
                  <div className="mb-4 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                    Score breakdown · weakest first
                  </div>
                  <div className="flex flex-col gap-3">
                    {orderedBars.map((row, i) => {
                      const v = scores?.[row.key as ScoreKey];
                      return (
                        <div key={row.key} className="flex items-center gap-3">
                          <span className="w-4 flex-none text-[11px] font-semibold text-[var(--faint)]">
                            {i + 1}
                          </span>
                          <span className="w-[122px] flex-none text-[13px] font-semibold text-[var(--muted)]">
                            {row.label}
                          </span>
                          <div className="h-3.5 flex-1 overflow-hidden rounded-md border border-[var(--edge)] bg-[var(--well)]">
                            {row.assessed && v != null ? (
                              <div
                                className="h-full rounded-[3px] transition-[width] duration-700"
                                style={{ width: `${v}%`, background: scoreColor(v) }}
                              />
                            ) : (
                              <div
                                className="h-full w-full opacity-70"
                                style={{
                                  background:
                                    "repeating-linear-gradient(135deg,#262b40,#262b40 5px,#1a1e30 5px,#1a1e30 10px)",
                                }}
                              />
                            )}
                          </div>
                          <span
                            className="font-brand w-[42px] flex-none text-right text-[13px] font-bold"
                            style={{ color: row.assessed && v != null ? scoreColor(v) : "var(--faint)" }}
                          >
                            {row.assessed && v != null ? v : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* click pull */}
              {click &&
                (click.curiosity.length > 0 ||
                  click.reward.length > 0 ||
                  click.danger.length > 0 ||
                  click.urgency.length > 0 ||
                  click.blockers.length > 0) && (
                  <div>
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                      Click pull - what pulls the tap
                    </div>
                    <ChipGroup label="Curiosity" items={click.curiosity} tone="cyan" />
                    <ChipGroup label="Reward" items={click.reward} tone="green" />
                    <ChipGroup label="Tension" items={[...click.danger, ...click.urgency]} tone="gold" />
                    <ChipGroup label="Blocks the click" items={click.blockers} tone="magenta" />
                  </div>
                )}

              {/* gameplay clarity - only a real read when screenshots were provided */}
              {gameplayAssessed ? (
                (gameplay?.clear.length || gameplay?.unclear.length) ? (
                  <div>
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                      Gameplay clarity - reads in 3 seconds?
                    </div>
                    <ChecklistCols
                      good={gameplay?.clear ?? []}
                      bad={gameplay?.unclear ?? []}
                      goodLabel="Clear in 3s"
                      badLabel="Still unclear"
                    />
                  </div>
                ) : null
              ) : (
                <div>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                    Gameplay clarity
                  </div>
                  <div className="rounded-xl border border-dashed border-[var(--edge)] bg-[var(--well)] px-4 py-3.5">
                    <span className="text-[12px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                      Not assessed
                    </span>
                    <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-[var(--muted)]">
                      Gameplay clarity needs in-game screenshots. Upload them to evaluate objective,
                      player action, reward, and failure state - the icon alone only shows visual style.
                    </p>
                  </div>
                </div>
              )}

              {/* emotional signal */}
              {emotion && (emotion.present.length > 0 || emotion.missing.length > 0) && (
                <div>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                    Emotional signal
                  </div>
                  <ChecklistCols
                    good={emotion.present}
                    bad={emotion.missing}
                    goodLabel="Lands"
                    badLabel="Missing"
                  />
                </div>
              )}
            </div>
          </details>

          {/* paid offer - self-serve AI fixes; hidden for active subscribers */}
          {isPaidSubscriber && (
            <div className="rounded-2xl border border-[rgba(155,206,167,.26)] bg-[rgba(155,206,167,.055)] p-4">
              <div className="dpx-kicker" data-tone="cyan">
                Active plan
              </div>
              <p className="mt-1 text-[13.5px] font-semibold text-[var(--muted)]">
                You are on {account?.plan === "pro" ? "Pro" : "Indie"}. Use your generation credits above.
              </p>
            </div>
          )}
          <div className="result-tools"><button onClick={reset}>New analysis</button>{reportId && <a href={`/report/${reportId}`} target="_blank" rel="noopener noreferrer">Open report ↗</a>}</div>
        </RevealFlow>
      )}

    </main></>
  );
}
