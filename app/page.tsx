"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteNav } from "@/app/components/SiteChrome";
import GenerateVariants, { type GenerateSource } from "@/app/components/GenerateVariants";
import ShelfSimulator, {
  ScreenshotCarousel,
  SteamCapsuleShelf,
} from "@/app/components/ShelfSimulator";
import BenchmarkDossier, {
  referenceRoleLabel,
  type BenchmarkEvidence,
} from "@/app/components/BenchmarkDossier";
import {
  BENCHMARK_GENRES,
  type BenchmarkGenre,
  type BenchmarkReferenceRole,
} from "@/lib/benchmarkCatalog";
import { identifyAsset, inferPlatform } from "@/lib/storeSpecs";
import {
  RevealFlow,
  ScoreRadar,
  ScoreRing,
  type RadarRow,
} from "@/app/components/reportFx";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_SCREENSHOTS = 3;
const MAX_CREATIVES = 3;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];

/* ---------- paid offer: self-serve analysis + generation plans ---------- */
type PackId = "quick" | "indie" | "pro";

const PACKS: {
  id: PackId;
  name: string;
  price: string;
  anchor: string;
  bullets: string[];
  cta: string;
  flagship?: boolean;
}[] = [
  {
    id: "quick",
    name: "Quick Fix",
    price: "$5",
    anchor: "6 generation credits, one-time",
    bullets: [
      "For one icon or screenshot",
      "Generate 2-3 focused variants",
      "No subscription required",
      "Upgrade later if you keep polishing",
    ],
    cta: "View one-time option",
  },
  {
    id: "indie",
    name: "Indie",
    price: "$19/mo",
    anchor: "50 generation credits + 100 reports/month",
    bullets: [
      "Fix icons, screenshots, capsules, and feature graphics",
      "Full-resolution exports in platform-ready sizes",
      "Before/after saved projects",
      "Credit cost shown before generation",
    ],
    cta: "View Indie pricing",
    flagship: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49/mo",
    anchor: "200 generation credits + 500 reports/month",
    bullets: [
      "Batch screenshot fixing",
      "Priority generation queue",
      "Platform export bundles",
      "Unlimited projects and brand presets",
    ],
    cta: "View Pro pricing",
  },
];

type AccountPlan = "free" | "quick" | "indie" | "pro";

type AccountStatus = {
  plan: AccountPlan;
  isSubscriber: boolean;
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

/* ---------- landing sample: a real saved report, never a fantasy mock ---------- */
type SampleData = {
  id: string;
  launchScore: number;
  potentialAfterFixes: number;
  decisionLabel: string;
  decisionTone: "good" | "warn" | "bad";
  verdict: string;
  summaryLine: string;
  reviewModeLabel: string;
  strengths: string[];
  weaknesses: string[];
  topFixAction: string;
  thumb: string;
  assetLabel: string;
  assetKind: string;
};

function parseSample(v: unknown): SampleData | null {
  if (!isRecord(v) || !isRecord(v.sample)) return null;
  const s = v.sample;
  if (typeof s.launchScore !== "number" || typeof s.id !== "string") return null;
  return {
    id: s.id,
    launchScore: s.launchScore,
    potentialAfterFixes: num(s.potentialAfterFixes) ?? s.launchScore,
    decisionLabel: str(s.decisionLabel) || "",
    decisionTone:
      s.decisionTone === "good" || s.decisionTone === "bad" ? s.decisionTone : "warn",
    verdict: str(s.verdict) || "",
    summaryLine: str(s.summaryLine) || "",
    reviewModeLabel: str(s.reviewModeLabel) || "",
    strengths: strList(s.strengths),
    weaknesses: strList(s.weaknesses),
    topFixAction: str(s.topFixAction) || "",
    thumb: str(s.thumb) || "",
    assetLabel: str(s.assetLabel) || "",
    assetKind: str(s.assetKind) || "",
  };
}

function SampleShowcase() {
  const [sample, setSample] = useState<SampleData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sample")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSample(parseSample(data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toneColor = (tone: "good" | "warn" | "bad") =>
    tone === "good" ? "var(--green)" : tone === "bad" ? "var(--magenta)" : "var(--gold)";

  return (
    <section className="mx-auto mt-12 w-full max-w-[880px]" aria-label="Sample readout">
      <div
        className="relative rounded-2xl border border-[rgba(24,224,255,.28)] p-5 md:p-6"
        style={{
          background:
            "radial-gradient(circle at 16% 12%,rgba(24,224,255,.16),transparent 40%),radial-gradient(circle at 86% 84%,rgba(255,61,180,.14),transparent 42%),linear-gradient(160deg,rgba(15,22,42,.98),rgba(9,8,22,.96))",
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <div className="dpx-kicker" data-tone="cyan">
            {sample ? "Real report" : "Sample"}
          </div>
          <span className="text-[12.5px] font-semibold text-[var(--faint)]">
            {sample
              ? `${sample.reviewModeLabel} review · live data, not a mockup`
              : "what your readout returns"}
          </span>
        </div>

        {sample ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_1.4fr]">
              {sample.thumb && (
                <div className="flex items-center justify-center gap-4 rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-5 py-3.5">
                  <div className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- stored report thumbnail */}
                    <img
                      src={sample.thumb}
                      alt={sample.assetLabel || "Reviewed asset"}
                      className="mx-auto h-20 w-auto max-w-[120px] rounded-xl border border-white/10 bg-black object-contain"
                    />
                    <div className="mt-1 text-[8.5px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                      Full
                    </div>
                  </div>
                  {sample.assetKind === "icon" && (
                    <div className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- stored report thumbnail at store size */}
                      <img
                        src={sample.thumb}
                        alt=""
                        aria-hidden="true"
                        className="mx-auto h-8 w-8 rounded-md border border-white/10 bg-black object-cover"
                      />
                      <div className="mt-1 text-[8.5px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                        32px
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center gap-4 rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5">
                <ScoreRing
                  score={sample.launchScore}
                  potential={sample.potentialAfterFixes}
                  size={108}
                />
                {sample.potentialAfterFixes > sample.launchScore && (
                  <div className="max-w-[110px] text-[11px] font-bold leading-snug text-[var(--green)]">
                    up to {sample.potentialAfterFixes}/100 if every fix lands
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5">
                <div
                  className="font-brand text-[17px] font-black leading-tight"
                  style={{ color: toneColor(sample.decisionTone) }}
                >
                  {sample.decisionLabel}
                </div>
                {sample.summaryLine && (
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-5 text-[var(--muted)]">
                    {sample.summaryLine}
                  </p>
                )}
              </div>
            </div>

            {(sample.strengths.length > 0 || sample.weaknesses.length > 0) && (
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5 sm:grid-cols-2">
                <div>
                  {sample.strengths.map((t, i) => (
                    <div key={`s-${i}`} className="mb-1 flex items-start gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
                      <span className="flex-none font-bold text-[var(--green)]">✓</span>
                      <span className="leading-snug">{t}</span>
                    </div>
                  ))}
                </div>
                <div>
                  {sample.weaknesses.map((t, i) => (
                    <div key={`w-${i}`} className="mb-1 flex items-start gap-2 text-[12.5px] font-semibold text-[#c8aab2]">
                      <span className="flex-none font-bold text-[var(--magenta)]">✗</span>
                      <span className="leading-snug">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {sample.topFixAction && (
                <span className="min-w-0 text-[12.5px] font-semibold text-[var(--muted)]">
                  <span className="font-brand mr-1.5 rounded-full border border-[rgba(105,255,0,.35)] bg-[rgba(105,255,0,.08)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[.08em] text-[var(--green)]">
                    Top fix
                  </span>
                  {sample.topFixAction}
                </span>
              )}
              <a
                href={`/report/${sample.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-brand flex-none rounded-full border border-[rgba(24,224,255,.4)] bg-[rgba(24,224,255,.08)] px-4 py-2 text-[12px] font-bold text-[var(--cyan)] transition hover:-translate-y-0.5 hover:bg-[rgba(24,224,255,.15)]"
              >
                Open the full report →
              </a>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1.5fr]">
            <div className="rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                Launch score
              </div>
              <div className="font-score mt-1 text-[38px] font-black leading-[1.05] text-[var(--cyan)]">
                72
                <span className="font-brand text-base font-bold text-[var(--faint)]">/100</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                Potential
              </div>
              <div className="font-score mt-1 text-[38px] font-black leading-[1.05] text-[var(--gold)]">
                88
                <span className="font-brand text-base font-bold text-[var(--faint)]">/100</span>
              </div>
            </div>

            <div className="col-span-2 flex flex-col justify-center rounded-2xl border border-[var(--edge)] bg-[rgba(7,10,20,.55)] px-4 py-3.5 md:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)] shadow-[0_0_12px_var(--gold)]" />
                <span className="text-[15px] font-bold">
                  Verdict: <b className="text-[var(--gold)]">Strong, needs polish</b>
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-5 text-[var(--faint)]">
                Every review ends with a ship call and the top fixes, ranked.
              </p>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {REVIEW_DIMENSIONS.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--edge)] bg-white/[.025] px-3.5 py-2.5 transition hover:-translate-y-0.5 hover:border-[rgba(24,224,255,.4)]"
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
      </div>
    </section>
  );
}

function ShareReportBar({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/report/${reportId}` : `/report/${reportId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard can be unavailable; the visible link below still works.
    }
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(24,224,255,.28)] px-5 py-3.5"
      style={{ background: "linear-gradient(160deg,rgba(15,22,42,.96),rgba(8,9,18,.96))" }}
    >
      <div className="min-w-0">
        <span className="font-brand block text-[13px] font-bold text-[var(--foreground)]">
          This report has a permanent link
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
          className="rounded-full border border-[var(--edge)] bg-white/[.03] px-4 py-2 text-[12px] font-bold text-[var(--muted)] transition hover:border-[rgba(24,224,255,.4)] hover:text-[var(--cyan)]"
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
      style={{ background: "linear-gradient(160deg,#11182a,#070b14)" }}
    >
      <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function AnalyzingPanel() {
  const checks = ["Shelf readability", "Click pull", "Genre recognition", "Conversion risk"];
  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-[rgba(24,224,255,.28)] px-6 py-12 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 0%,rgba(24,224,255,.12),transparent 55%),linear-gradient(160deg,rgba(15,22,42,.97),rgba(9,8,22,.97))",
      }}
    >
      <div className="relative mb-7 h-28 w-28">
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.04)] shadow-[inset_0_0_18px_rgba(24,224,255,.08)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%,rgba(24,224,255,.22),transparent 55%),radial-gradient(circle at 72% 74%,rgba(255,61,180,.2),transparent 55%)",
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
              background: "linear-gradient(180deg,transparent,rgba(24,224,255,.55),transparent)",
              boxShadow: "0 0 20px rgba(24,224,255,.6)",
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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [potential, setPotential] = useState<number | null>(null);
  const [mode, setMode] = useState("");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>> | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [risk, setRisk] = useState<ConversionRisk | null>(null);
  const [impact, setImpact] = useState<StoreImpact | null>(null);
  const [decision, setDecision] = useState<ShipDecision | null>(null);
  const [summaryLine, setSummaryLine] = useState("");
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
    // Target platform derived from what the dimensions say the assets are, so
    // the review and generation know whether this is Steam or mobile.
    const detectedPlatform =
      usable.some((a) => a.role === "steamCapsule")
        ? "steam"
        : inferPlatform(usable.map((a) => ({ widthPx: a.w, heightPx: a.h })));
    if (detectedPlatform) fd.append("platform", detectedPlatform);
    if (benchmarkGenre !== "auto") {
      fd.append("benchmarkGenre", benchmarkGenre);
    }

    setLoading(true);
    setError("");
    setScore(null);
    setPotential(null);
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setImpact(null);
    setDecision(null);
    setSummaryLine("");
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
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
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

      setScore(data.calculated?.launchScore ?? null);
      setPotential(data.calculated?.potentialAfterFixes ?? null);
      setMode(data.calculated?.reviewModeLabel || "");
      setScores(data.calculated?.scores ?? null);
      setBreakdown(data.calculated?.breakdown ?? []);
      setRisk(data.calculated?.conversionRisk ?? null);
      setImpact(data.calculated?.storeImpact ?? null);
      setDecision(data.calculated?.decision ?? null);
      setSummaryLine(data.calculated?.summaryLine ?? "");
      setStrengths(data.calculated?.strengths ?? []);
      setWeaknesses(data.calculated?.weaknesses ?? []);
      setTopFixes(data.calculated?.topFixes ?? []);
      setRevisionBrief(data.calculated?.revisionBrief ?? "");
      setEditPlan(data.calculated?.editPlan ?? null);
      setShelf(data.shelf ?? null);
      setClick(data.click ?? null);
      setGameplay(data.gameplay ?? null);
      setEmotion(data.emotion ?? null);
      setReportId(data.reportId ?? null);
      setSpecNotes(data.specNotes ?? []);
      setBenchmarkEvidence(data.benchmarkEvidence ?? []);
    } catch {
      setError("Could not reach the analyzer. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- reset for a fresh run ---------- */
  function reset() {
    assets.forEach((a) => URL.revokeObjectURL(a.url));
    setAssets([]);
    setScore(null);
    setPotential(null);
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setImpact(null);
    setDecision(null);
    setSummaryLine("");
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
  // The generator applies the SAME top-3 actions the user just read, in
  // priority order, so the output visibly matches the review. The structured
  // edit plan follows as reinforcement detail.
  const generatorBrief = [
    ...topFixes
      .slice(0, 3)
      .map((f, i) => `Priority ${i + 1} - ${f.action}: ${f.change}`),
    editPlanText,
  ]
    .filter(Boolean)
    .join("\n");
  const impactTone =
    impact?.tone === "good" ? "var(--green)" : impact?.tone === "bad" ? "var(--magenta)" : "var(--gold)";
  const decisionTone =
    decision?.tone === "good" ? "var(--green)" : decision?.tone === "bad" ? "var(--magenta)" : "var(--gold)";
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
  return (
    <main className="relative z-[1] mx-auto w-[min(1060px,calc(100%-44px))] pb-16">
      {/* header */}
      <header className="pt-8 pb-1 text-center">
        <a
          href="https://www.dragonpixelstudio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 inline-flex items-center gap-2.5"
        >
          <Image
  src="/logo.png"
  alt="Dragon Pixel Studio"
  width={300}
  height={64}
  className="h-12 w-auto opacity-95 md:h-14"
          />
        </a>
        <SiteNav />
        <h1
          className="font-brand mt-8 text-[clamp(40px,7vw,72px)] font-bold leading-[.98] text-transparent bg-clip-text"
          style={{ backgroundImage: "linear-gradient(180deg,#fff,#cfe9ff 70%,#9fd2ff)" }}
        >
          Store Analyzer
        </h1>
        <p className="mx-auto mt-3 max-w-[560px] text-[clamp(16px,2vw,19px)] font-medium text-[var(--text-2)]">
          The Dragon Pixel Algorithm reads your store assets, scores them, and writes the exact correction plan. Before you spend on launch.
        </p>
      </header>

      {!hasResult && !loading && (
      <>
        {/* HERO - the upload is the product */}
        <section
          className="relative mx-auto mt-10 w-full max-w-[780px] overflow-hidden rounded-3xl border border-[rgba(24,224,255,.24)] p-6 md:p-9"
          style={{ background: "linear-gradient(160deg,rgba(18,18,34,.97),rgba(7,8,18,.97))" }}
        >
          <div
            className="dpx-drift pointer-events-none absolute -inset-[40%] z-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%,rgba(24,224,255,.16),transparent 38%),radial-gradient(circle at 70% 70%,rgba(255,61,180,.14),transparent 40%)",
            }}
          />
          <div className="relative z-[1]">
            <div className="mb-4 flex justify-center">
              <div className="dpx-kicker" data-tone="cyan">
                Free asset review
              </div>
            </div>
            <h2 className="font-brand text-center text-[clamp(24px,3.4vw,32px)] font-semibold">
              Upload store assets
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-center text-[15px] font-medium leading-6 text-[var(--text-2)]">
              Drop your icon, screenshots or Steam capsule to get a scored conversion readout in
              seconds.
            </p>

            {/* the whole self-serve journey, spelled out before the first click */}
            <div className="mx-auto mb-6 mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
              {["Upload assets", "Get scored review", "Generate fixes"].map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5 rounded-full border border-[var(--edge)] bg-white/[.03] px-3 py-1.5 text-[11.5px] font-bold text-[var(--muted)]">
                    <span className="flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full bg-[rgba(24,224,255,.14)] text-[10px] font-black text-[var(--cyan)]">
                      {i + 1}
                    </span>
                    {step}
                  </span>
                  {i < 2 && <span className="text-[11px] font-bold text-[var(--faint)]">→</span>}
                </span>
              ))}
            </div>

            {/* dropzone */}
            <label
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              aria-disabled={loading}
              className={`dpx-pulse relative flex flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed px-6 py-12 text-center transition-all ${
                loading
                  ? "pointer-events-none cursor-not-allowed border-[var(--edge)] bg-white/[.02] opacity-50"
                  : dragOver
                  ? "-translate-y-0.5 cursor-pointer border-[var(--cyan)] bg-[rgba(24,224,255,.1)] shadow-[0_0_36px_rgba(24,224,255,.28)]"
                  : "cursor-pointer border-[rgba(24,224,255,.4)] bg-[rgba(24,224,255,.04)]"
              }`}
            >
              <svg className="h-10 w-10 text-[var(--cyan)] opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V6" /><path d="m8 10 4-4 4 4" /><rect x="4" y="16" width="16" height="4" rx="1.5" />
              </svg>
              <span className="font-brand text-base font-bold">Click to upload</span>
              <span className="text-[var(--muted)]">
                your icon, screenshots, or Steam capsule
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
            <p className="mt-3 text-center text-[13px] font-semibold text-[var(--faint)]">
              Icon, screenshots, feature graphics, Steam capsules, key art · PNG, JPEG, WebP · 2&nbsp;MB each
            </p>

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
                        bad ? "border-[rgba(255,61,180,.5)] bg-[rgba(255,61,180,.06)]" : "border-[var(--edge)] bg-white/[.03]"
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
      ? "border-[rgba(24,224,255,.35)] bg-[#102636]"
      : a.role === "screenshot"
      ? "border-[rgba(255,61,180,.35)] bg-[#24132b]"
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
              <div className="mt-4 rounded-xl border border-[var(--edge)] bg-black/20 p-4">
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
                    className="min-h-11 min-w-[230px] rounded-xl border border-[rgba(24,224,255,.3)] bg-[#0b1724] px-3 text-[13px] font-bold text-white outline-none transition focus:border-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="font-brand mt-4 min-h-[58px] w-full rounded-2xl text-sm font-semibold text-[#05121a] transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
              style={{
                background: "linear-gradient(120deg,var(--cyan),var(--magenta))",
                boxShadow: "0 0 28px rgba(24,224,255,.24),0 16px 44px rgba(255,61,180,.14)",
              }}
            >
              {loading ? "Analyzing…" : "Analyze assets"}
            </button>
          </div>
        </section>

        {/* SAMPLE - a real saved report when SAMPLE_REPORT_ID is configured,
            the generic mock otherwise */}
        <SampleShowcase />
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
          {/* slim re-upload bar */}
          <button
            onClick={reset}
            className="dpx-reupload group flex items-center justify-between rounded-2xl border border-[var(--edge)] bg-white/[.03] px-5 py-3 text-left transition hover:border-[rgba(24,224,255,.4)]"
          >
            <span className="text-[12px] font-semibold text-[var(--muted)] group-hover:text-[var(--cyan)]">
              ↻ Analyze another asset
            </span>
            <span className="text-[11px] font-medium text-[var(--faint)]">
              {mode}
            </span>
          </button>

          {/* HERO - review noun + score + ship decision + why */}
          <div
            className="relative overflow-hidden rounded-2xl border p-7 md:p-9"
            style={{
              borderColor:
                decision?.tone === "good"
                  ? "rgba(105,255,0,.34)"
                  : decision?.tone === "bad"
                  ? "rgba(255,61,180,.34)"
                  : "rgba(255,194,61,.3)",
              background:
                "radial-gradient(600px 240px at 12% -20%,rgba(24,224,255,.12),transparent 60%),linear-gradient(160deg,rgba(15,19,34,.97),rgba(8,9,18,.97))",
            }}
          >
            <div className="dpx-kicker mb-5" data-tone="gold">
              Your result
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {score != null && <ScoreRing score={score} potential={potential} />}
              <div className="min-w-[220px] flex-1">
                {decision && (
                  <div
                    className="font-brand text-[clamp(24px,4.6vw,40px)] font-bold leading-[.95]"
                    style={{ color: decisionTone }}
                  >
                    {decision.label}
                  </div>
                )}
                {decision?.sub && (
                  <div className="mt-1.5 text-[14px] font-semibold text-[var(--muted)]">{decision.sub}</div>
                )}
                {potential != null && score != null && potential > score && (
                  <div className="font-brand mt-1.5 text-[13px] font-bold text-[var(--green)]">
                    up to {potential}/100 if every fix below lands
                  </div>
                )}
              </div>
              {radarRows.some((row) => row.value !== null) && (
                <div className="hidden w-[300px] flex-none lg:block">
                  <ScoreRadar rows={radarRows} size={280} />
                </div>
              )}
            </div>
            {summaryLine && (
              <p className="mt-5 max-w-2xl text-[16px] font-semibold leading-snug text-[var(--foreground)]">
                <span className="text-[11px] uppercase tracking-[.12em] text-[var(--faint)]">Reason </span>
                {summaryLine}
              </p>
            )}
            {specNotes.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5">
                {specNotes.map((note, i) => (
                  <p
                    key={`${i}-${note.slice(0, 20)}`}
                    className="rounded-lg border border-[rgba(255,194,61,.3)] bg-[rgba(255,194,61,.06)] px-3 py-2 text-[12.5px] font-semibold text-[#e8cf9a]"
                  >
                    ⚠ {note}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* shareable permalink - persisted server-side, safe to send around */}
          {reportId && <ShareReportBar reportId={reportId} />}

          {/* score radar for viewports where the hero has no room for it */}
          {radarRows.some((row) => row.value !== null) && (
            <div className="lg:hidden">
              <ReportCard title="Score profile">
                <ScoreRadar rows={radarRows} />
              </ReportCard>
            </div>
          )}

          {/* 32PX STORE TEST - strongest feature, directly under the verdict (icon only) */}
          {previewAsset && (
            <ReportCard title="32px store test">
              <ShelfPreview asset={previewAsset} shelf={shelf} />
              <p className="mt-4 text-[13px] font-semibold italic text-[var(--faint)]">
                Your actual icon, shrunk to store size. Whatever survives here is your real first impression.
              </p>
            </ReportCard>
          )}

          {/* STORE CONTEXT - every asset shown where it will actually live */}
          {previewAsset && (
            <ReportCard title="Store shelf simulator">
              <ShelfSimulator
                iconUrl={previewAsset.url}
                references={(
                  benchmarkEvidence.find(
                    (evidence) => evidence.assetKind === "icon"
                  )?.references || []
                ).map((reference) => ({
                  title: reference.title,
                  thumb: reference.thumb,
                  sourceUrl: reference.sourceUrl,
                  roleLabel: referenceRoleLabel(reference.role),
                }))}
              />
            </ReportCard>
          )}
          {(() => {
            const capsule = assets.find(
              (a) => a.role === "steamCapsule" && !a.error && !a.overflow
            );
            return capsule ? (
              <ReportCard title="Steam store preview">
                <SteamCapsuleShelf capsuleUrl={capsule.url} />
              </ReportCard>
            ) : null;
          })()}
          {(() => {
            const shots = assets.filter(
              (a) => a.role === "screenshot" && !a.error && !a.overflow
            );
            return shots.length > 0 ? (
              <ReportCard title="Store listing preview">
                <ScreenshotCarousel shots={shots.map((a) => a.url)} />
              </ReportCard>
            ) : null;
          })()}

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

          {/* WILL PEOPLE CLICK - compact risk line */}
          {risk && (
            <div
              className="rounded-2xl border border-[var(--edge)] p-6"
              style={{ background: "linear-gradient(160deg,#11182a,#070b14)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-brand text-[15px] font-black">Conversion risk</span>
                <span className="font-brand text-[15px] font-black" style={{ color: impactTone }}>
                  {risk.assessed ? risk.level : "Partial read"}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                  Click → convert
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-[var(--edge)] bg-black/40">
                  <span
                    className="dpx-meter-marker absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-sm bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]"
                    style={{ left: `${Math.max(2, Math.min(98, risk.position))}%` }}
                  />
                </div>
              </div>
              {risk.reason && (
                <p className="mt-3 text-[14px] font-semibold leading-snug text-[var(--muted)]">{risk.reason}</p>
              )}
            </div>
          )}

          {/* TOP 3 ACTIONS */}
          {topFixes.length > 0 && (
            <div
              className="rounded-2xl border-[1.5px] p-6"
              style={{
                borderColor: "rgba(105,255,0,.4)",
                background:
                  "radial-gradient(600px 260px at 50% -20%,rgba(105,255,0,.08),transparent 60%),linear-gradient(160deg,rgba(18,22,18,.96),rgba(7,8,12,.96))",
                boxShadow: "0 18px 50px -28px rgba(105,255,0,.4)",
              }}
            >
              <div className="font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--green)]">
                {decision?.tone === "good"
                  ? "What to improve"
                  : decision?.tone === "bad"
                  ? "Fix before launch"
                  : "What to fix"}
              </div>
              <h2 className="font-brand mt-1 text-[22px] font-semibold">
                Top {topFixes.length} action{topFixes.length === 1 ? "" : "s"}
              </h2>
              <p className="mb-5 mt-1.5 text-sm font-semibold text-[var(--muted)]">
                Ranked by impact - start at the top.
              </p>
              <div className="flex flex-col gap-3">
                {topFixes.map((fix, i) => (
                  <div
                    key={`${i}-${fix.action.slice(0, 24)}`}
                    className="flex gap-4 rounded-2xl border border-[var(--edge)] bg-white/[.03] p-4"
                  >
                    <span className="font-brand text-[26px] font-black leading-none text-[var(--green)] opacity-60">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="text-[15px] font-bold leading-snug">{fix.action}</div>
                      {fix.why && (
                        <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-[var(--muted)]">
                          <span className="text-[10px] uppercase tracking-[.12em] text-[var(--faint)]">Why </span>
                          {fix.why}
                        </p>
                      )}
                      {fix.change && (
                        <p className="mt-1 text-[13.5px] font-semibold leading-snug text-[var(--foreground)]">
                          <span className="text-[10px] uppercase tracking-[.12em] text-[var(--green)]">Change </span>
                          {fix.change}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {revisionBrief && (
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("dpx-generate")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="font-brand mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-black text-[#0a1405] transition hover:-translate-y-0.5 hover:brightness-110 sm:w-auto sm:px-8"
                  style={{
                    background: "linear-gradient(120deg,var(--green),#3ddc84)",
                    boxShadow: "0 0 24px rgba(105,255,0,.22)",
                  }}
                >
                  Apply these fixes - generate improved versions
                  <span aria-hidden="true">↓</span>
                </button>
              )}
            </div>
          )}

          {revisionBrief && (
            <div id="dpx-generate" style={{ scrollMarginTop: 16 }}>
            <ReportCard title="Dragon Pixel edit plan">
              <div className="rounded-xl border border-[var(--edge)] bg-black/25 p-4">
                {revisionBriefLines.map((line, index) => (
                  <p
                    key={`${index}-${line.slice(0, 18)}`}
                    className="mb-2 last:mb-0 text-[13.5px] font-semibold leading-snug text-[var(--text-2)]"
                  >
                    {line}
                  </p>
                ))}
              </div>
              <GenerateVariants
                sources={assets
                  .filter((a) => !a.error && !a.overflow)
                  .map<GenerateSource>((a) => ({
                    id: a.id,
                    label: `${ROLE_LABELS[a.role]} · ${a.file.name}`,
                    url: a.url,
                    file: a.file,
                    assetType:
                      a.role === "icon"
                        ? "icon"
                        : a.role === "screenshot"
                          ? "screenshot"
                          : a.role === "steamCapsule"
                            ? "capsule"
                            : "feature-graphic",
                  }))}
                platform={assets.some((a) => a.role === "steamCapsule") ? "steam" : "google-play"}
                revisionBrief={generatorBrief}
                assetScore={score}
              />
            </ReportCard>
            </div>
          )}

          {/* ADVANCED ANALYSIS - everything detailed, collapsed */}
          <details
            className="dpx-details dpx-details-pulse group rounded-2xl border border-[var(--edge)]"
            style={{ background: "linear-gradient(160deg,#11182a,#070b14)" }}
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
              <span className="dpx-chev flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[var(--edge)] text-[var(--cyan)] transition group-hover:border-[rgba(24,224,255,.5)] group-hover:bg-[rgba(24,224,255,.08)]">
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
                          <div className="h-3.5 flex-1 overflow-hidden rounded-md border border-[var(--edge)] bg-black/40">
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
                  <div className="rounded-xl border border-dashed border-[var(--edge)] bg-[#0d1423] px-4 py-3.5">
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
            <div className="rounded-2xl border border-[rgba(105,255,0,.26)] bg-[rgba(105,255,0,.055)] p-4">
              <div className="dpx-kicker" data-tone="cyan">
                Active plan
              </div>
              <p className="mt-1 text-[13.5px] font-semibold text-[var(--muted)]">
                You are on {account?.plan === "pro" ? "Pro" : "Indie"}. Use your generation credits above.
              </p>
            </div>
          )}
          {!isPaidSubscriber && (
          <div
            className="rounded-2xl border-[1.5px] p-6"
            style={{
              borderColor: "rgba(24,224,255,.34)",
              background:
                "radial-gradient(600px 260px at 50% -20%,rgba(24,224,255,.1),transparent 60%),linear-gradient(160deg,rgba(15,22,42,.96),rgba(8,9,18,.96))",
            }}
          >
            <div className="dpx-kicker" data-tone="magenta">
              Action plan
            </div>
            <h2 className="font-brand mt-1 text-[22px] font-semibold">
              Turn this edit plan into finished variants
            </h2>
            <p className="mb-5 mt-1.5 text-sm font-semibold text-[var(--muted)]">
              Generate a one-off fix when you only need one asset, or use a plan when you are
              polishing a full store page.
            </p>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {PACKS.map((p) => (
                <div
                  key={p.id}
                  className="dpx-plan-card flex flex-col rounded-2xl border p-5"
                  style={{
                    borderColor: p.flagship ? "rgba(255,194,61,.4)" : "var(--edge)",
                    background: p.flagship ? "#21190c" : "#0d1423",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-brand text-[15px] font-semibold">{p.name}</span>
                    <span
                      className="font-score text-[22px] font-black"
                      style={{ color: p.flagship ? "var(--gold)" : "var(--cyan)" }}
                    >
                      {p.price}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] font-semibold text-[var(--faint)]">{p.anchor}</p>
                  <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                    {p.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-[13px] font-semibold text-[var(--muted)]"
                      >
                        <span className="font-brand mt-px flex-none font-black text-[var(--green)]">✓</span>
                        <span className="leading-snug">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/pricing"
                    className="font-brand mt-4 inline-flex min-h-[46px] w-full items-center justify-center rounded-xl text-center text-[13px] font-semibold transition hover:-translate-y-0.5 hover:brightness-110"
                    style={
                      p.flagship
                        ? { background: "linear-gradient(120deg,var(--gold),#ff8a3d)", color: "#1a1205" }
                        : { background: "linear-gradient(120deg,var(--cyan),var(--magenta))", color: "#05121a" }
                    }
                  >
                    {p.cta}
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[12px] font-semibold text-[var(--faint)]">
                Secure checkout is handled by Dodo Payments. Every plan is self-serve
                software: analysis reports are included with your plan, and credits
                are only spent when an improved image is delivered to you.
              </span>
            </div>
          </div>
          )}
        </RevealFlow>
      )}

      {!hasResult && !loading && (
      <section className="mt-24 border-t border-white/[0.08] pt-12" aria-label="How Dragon Pixel Store Analyzer works">
        <h2 className="font-brand text-center text-[clamp(26px,4.2vw,40px)] font-bold tracking-[.02em] text-[var(--foreground)]">
          How It Works
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4">
          {[
            {
              step: "01",
              title: "Upload Assets",
              text: "Add your icon and current store screenshots. The analyzer works best with real gameplay captures, not mockups.",
            },
            {
              step: "02",
              title: "Get The Review",
              text: "The report checks the asset like a store visitor, a creative director, and a UA manager looking at conversion risk.",
            },
            {
              step: "03",
              title: "Generate Targeted Fixes",
              text: "The edit plan drives the output: precise algorithmic corrections are applied directly, and AI renders only where new image generation is required. Compare before/after and export the winner.",
            },
          ].map((item) => (
            <article key={item.step} className="dpx-step">
              <span className="dpx-step-num">{item.step}</span>
              <h3 className="font-brand text-[19px] font-semibold text-[var(--foreground)]">
                {item.title}
              </h3>
              <p className="mt-2 max-w-[74ch] text-[16.5px] font-medium leading-6 text-[var(--text-2)]">
                {item.text}
              </p>
            </article>
          ))}
        </div>
      </section>
      )}

    </main>
  );
}
