"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_SCREENSHOTS = 3;
const MAX_CREATIVES = 3;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FORMSPREE = "https://formspree.io/f/xeedbrla";

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

type AnalyzePayload = {
  error?: string;
  verdict?: string;
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
// square-ish => icon, otherwise screenshot
function classify(w: number, h: number): Role {
  if (!w || !h) return "screenshot";
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
function useCountUp(target: number | null, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target == null) {
      const id = requestAnimationFrame(() => setVal(0));
      return () => cancelAnimationFrame(id);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

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
        <div className="font-brand mt-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">Full size</div>
      </div>
      <div className="text-center">
        <canvas ref={tinyRef} className="rounded-md border border-[var(--edge)] bg-black" style={{ width: 32, height: 32, imageRendering: "auto" }} />
        <div className="font-brand mt-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">At 32px</div>
      </div>
      <div className="min-w-[150px] flex-1 text-[13.5px]">
        {visible.map((v) => (
          <div key={`v-${v}`} className="mb-1.5 flex items-center gap-2 text-[var(--muted)]">
            <span className="font-brand flex-none font-black text-[var(--green)]">✓</span> {v}
          </div>
        ))}
        {lost.map((l) => (
          <div key={`l-${l}`} className="mb-1.5 flex items-center gap-2 text-[#c3a0a8]">
            <span className="font-brand flex-none font-black text-[var(--magenta)]">✗</span> {l}
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
      <div className="font-brand mb-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: c }}>
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
      <span className="font-brand mt-px flex-none font-black" style={{ color: ok ? "var(--green)" : "var(--magenta)" }}>
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
          className="font-brand mb-2 text-[10px] font-bold uppercase tracking-[.14em]"
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
        <div className="font-brand mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--green)]">
          {goodLabel}
        </div>
        {good.map((t, i) => (
          <Item key={`g-${i}`} t={t} ok />
        ))}
      </div>
      <div>
        <div className="font-brand mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--magenta)]">
          {badLabel}
        </div>
        {bad.map((t, i) => (
          <Item key={`b-${i}`} t={t} ok={false} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl border border-[var(--edge)] p-6"
      style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
    >
      <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function AnalyzingPanel({ noun }: { noun: string }) {
  const checks = ["Shelf readability", "Click pull", "Genre recognition", "Conversion risk"];
  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-[rgba(24,224,255,.28)] px-6 py-12 text-center shadow-[0_22px_70px_rgba(0,0,0,.45)]"
      style={{
        background:
          "radial-gradient(circle at 50% 0%,rgba(24,224,255,.12),transparent 55%),linear-gradient(160deg,rgba(15,22,42,.97),rgba(9,8,22,.97))",
      }}
    >
      <div className="relative mb-7 h-28 w-28">
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.04)] shadow-[0_0_60px_rgba(24,224,255,.28)]">
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

      <div className="font-brand text-[11px] font-bold uppercase tracking-[.24em] text-[var(--cyan)]">
        Analyzing {noun}
      </div>
      <h2 className="font-brand mt-2 text-2xl font-black">Running Dragon Pixel review</h2>

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

      <div className="font-brand mt-6 text-[12px] font-semibold uppercase tracking-[.16em] text-[var(--muted)]">
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
  const [verdict, setVerdict] = useState("");
  const [mode, setMode] = useState("");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>> | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [risk, setRisk] = useState<ConversionRisk | null>(null);
  const [impact, setImpact] = useState<StoreImpact | null>(null);
  const [decision, setDecision] = useState<ShipDecision | null>(null);
  const [reviewNoun, setReviewNoun] = useState("");
  const [summaryLine, setSummaryLine] = useState("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [biggestProblem, setBiggestProblem] = useState("");
  const [topFixes, setTopFixes] = useState<DragonPixelFix[]>([]);
  const [shelf, setShelf] = useState<{ visible: string[]; lost: string[] } | null>(null);
  const [click, setClick] = useState<ClickReads | null>(null);
  const [gameplay, setGameplay] = useState<GameplayReads | null>(null);
  const [emotion, setEmotion] = useState<EmotionReads | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [email, setEmail] = useState("");
  const [helpStatus, setHelpStatus] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const launchVal = useCountUp(score);
  const potentialVal = useCountUp(potential);

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

    setLoading(true);
    setError("");
    setScore(null);
    setPotential(null);
    setVerdict("");
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setImpact(null);
    setDecision(null);
    setReviewNoun("");
    setSummaryLine("");
    setStrengths([]);
    setWeaknesses([]);
    setBiggestProblem("");
    setTopFixes([]);
    setShelf(null);
    setClick(null);
    setGameplay(null);
    setEmotion(null);
    setHelpStatus("");

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
      setVerdict(data.verdict || "");
      setMode(data.calculated?.reviewModeLabel || "");
      setScores(data.calculated?.scores ?? null);
      setBreakdown(data.calculated?.breakdown ?? []);
      setRisk(data.calculated?.conversionRisk ?? null);
      setImpact(data.calculated?.storeImpact ?? null);
      setDecision(data.calculated?.decision ?? null);
      setReviewNoun(data.calculated?.reviewNoun ?? "");
      setSummaryLine(data.calculated?.summaryLine ?? "");
      setStrengths(data.calculated?.strengths ?? []);
      setWeaknesses(data.calculated?.weaknesses ?? []);
      setBiggestProblem(data.calculated?.biggestProblem ?? "");
      setTopFixes(data.calculated?.topFixes ?? []);
      setShelf(data.shelf ?? null);
      setClick(data.click ?? null);
      setGameplay(data.gameplay ?? null);
      setEmotion(data.emotion ?? null);
    } catch {
      setError("Could not reach the analyzer. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- lead capture ---------- */
  async function requestHelp() {
    if (!email.trim()) {
      setHelpStatus("Enter your email so we can reach you.");
      return;
    }
    setHelpStatus("Sending…");
    try {
      const summary = [
        `Launch score: ${score ?? "—"}/100 (${decision?.label || verdict})`,
        summaryLine && `Reason: ${summaryLine}`,
        topFixes.length > 0 &&
          `Top fixes:\n${topFixes.map((f, i) => `${i + 1}. ${f.action}${f.change ? ` — ${f.change}` : ""}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n");
      const res = await fetch(FORMSPREE, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: JSON.stringify({ email, verdict, summary }),
      });
      setHelpStatus(res.ok ? "Sent — we'll be in touch." : "Something went wrong. Try again.");
    } catch {
      setHelpStatus("Couldn't send right now. Try again.");
    }
  }

  /* ---------- reset for a fresh run ---------- */
  function reset() {
    assets.forEach((a) => URL.revokeObjectURL(a.url));
    setAssets([]);
    setScore(null);
    setPotential(null);
    setVerdict("");
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setImpact(null);
    setDecision(null);
    setReviewNoun("");
    setSummaryLine("");
    setStrengths([]);
    setWeaknesses([]);
    setBiggestProblem("");
    setTopFixes([]);
    setShelf(null);
    setClick(null);
    setGameplay(null);
    setEmotion(null);
    setError("");
    setHelpStatus("");
    setEmail("");
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
  // the 32px shelf test is an icon concept; only show it when an icon was uploaded
  const previewAsset = assets.find((a) => a.role === "icon" && !a.error) || null;
  const impactTone =
    impact?.tone === "good" ? "var(--green)" : impact?.tone === "bad" ? "var(--magenta)" : "var(--gold)";
  const decisionTone =
    decision?.tone === "good" ? "var(--green)" : decision?.tone === "bad" ? "var(--magenta)" : "var(--gold)";
  const loadingNoun = assets.some((a) => a.role === "icon" && !a.error)
    ? "icon"
    : assets.some((a) => a.role === "screenshot" && !a.error && !a.overflow)
    ? "screenshots"
    : "assets";

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
        <h1
          className="font-brand text-[clamp(40px,7vw,72px)] font-black leading-[.98] text-transparent bg-clip-text"
          style={{ backgroundImage: "linear-gradient(180deg,#fff,#cfe9ff 70%,#9fd2ff)" }}
        >
          Store Analyzer
        </h1>
        <p className="mx-auto mt-3 max-w-[560px] text-[clamp(16px,2vw,19px)] font-semibold text-[var(--muted)]">
          Get a conversion review before you spend on launch.
        </p>
      </header>

      {!hasResult && !loading && (
      <div className="mt-10 grid grid-cols-1 items-start gap-5 md:grid-cols-[1.05fr_.95fr]">
        {/* LEFT — upload */}
        <section className="relative overflow-hidden rounded-3xl border border-[var(--edge)] p-6 shadow-[0_22px_70px_rgba(0,0,0,.4)]"
          style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}>
          <div
            className="dpx-drift pointer-events-none absolute -inset-[40%] z-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%,rgba(24,224,255,.16),transparent 38%),radial-gradient(circle at 70% 70%,rgba(255,61,180,.14),transparent 40%)",
            }}
          />
          <div className="relative z-[1]">
            <span className="font-brand mb-3 inline-block text-[11px] font-bold uppercase tracking-[.2em] text-[var(--cyan)]">
              Free store audit
            </span>
            <h2 className="font-brand text-[22px] font-bold">Upload store assets</h2>
            <p className="mb-4 mt-1.5 text-[15px] font-semibold text-[var(--muted)]"></p>

            {/* dropzone */}
            <label
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              aria-disabled={loading}
              className={`dpx-pulse relative flex flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed px-5 py-8 text-center transition-all ${
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
                      ? "Extra screenshot — max 3"
                      : "Extra creative — max 3"
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

            {error && <p className="mt-3 text-sm font-semibold text-[var(--magenta)]">{error}</p>}

            <button
              onClick={analyze}
              disabled={!hasUsable || loading}
              className="font-brand mt-4 min-h-[58px] w-full rounded-2xl text-sm font-black uppercase tracking-[.1em] text-[#05121a] transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
              style={{
                background: "linear-gradient(120deg,var(--cyan),var(--magenta))",
                boxShadow: "0 0 28px rgba(24,224,255,.24),0 16px 44px rgba(255,61,180,.14)",
              }}
            >
              {loading ? "Analyzing…" : "Analyze assets"}
            </button>
          </div>
        </section>

{/* RIGHT — result / sample */}
<aside>
  <div
    className="relative rounded-3xl border border-[rgba(24,224,255,.28)] p-6 shadow-[0_22px_70px_rgba(0,0,0,.4)]"
    style={{
      background:
        "radial-gradient(circle at 16% 12%,rgba(24,224,255,.16),transparent 40%),radial-gradient(circle at 86% 84%,rgba(255,61,180,.14),transparent 42%),linear-gradient(160deg,rgba(15,22,42,.98),rgba(9,8,22,.96))",
    }}
  >
    {loading ? (
<div className="flex min-h-[300px] flex-col items-center justify-center px-4 py-9 text-center">
  {/* scanner window — sweeping scan line over the brand grid, reticle corners */}
  <div className="relative mb-7 h-28 w-28">
    <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.04)] shadow-[0_0_60px_rgba(24,224,255,.28)]">
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

  <h2 className="font-brand text-2xl font-black">Running Dragon Pixel review</h2>

  <p className="mt-3 max-w-xs text-sm font-semibold leading-6 text-[var(--muted)]">
    Scanning shelf readability, click pull, gameplay clarity, and marketing confidence.
  </p>

  {/* indeterminate progress shimmer */}
  <div className="relative mt-5 h-1 w-48 overflow-hidden rounded-full bg-white/10">
    <div
      className="dpx-bar absolute inset-y-0 w-1/3 rounded-full"
      style={{ background: "linear-gradient(90deg,transparent,var(--cyan),transparent)" }}
    />
  </div>
</div>
    ) : (
      <>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--cyan)]">
            {hasResult ? "Your result" : "Sample output"}
          </span>

          {mode && (
            <span className="rounded-full border border-[rgba(24,224,255,.3)] bg-[rgba(24,224,255,.08)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--cyan)]">
              {mode}
            </span>
          )}
        </div>

        <div className="my-2 grid grid-cols-2 gap-3.5">
          <div className="rounded-2xl border border-[var(--edge)] bg-white/[.03] px-4 py-3.5">
            <div className="font-brand text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
              Launch score
            </div>
            <div className="font-brand mt-1 text-[38px] font-black leading-[1.05] text-[var(--cyan)]">
              {hasResult ? launchVal : "72"}
              <span className="text-base font-bold text-[var(--faint)]">/100</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--edge)] bg-white/[.03] px-4 py-3.5">
            <div className="font-brand text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
              Potential
            </div>
            <div className="font-brand mt-1 text-[38px] font-black leading-[1.05] text-[var(--gold)]">
              {hasResult ? potentialVal : "88"}
              <span className="text-base font-bold text-[var(--faint)]">/100</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-[var(--edge)] pt-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)] shadow-[0_0_12px_var(--gold)]" />
          <span className="text-[15px] font-bold">
            Verdict:{" "}
            <b className="text-[var(--gold)]">
              {hasResult ? verdict || "—" : "Strong, needs polish"}
            </b>
          </span>
        </div>

        {hasResult && biggestProblem && (
          <div className="mt-3">
            <div className="font-brand text-[9.5px] font-bold uppercase tracking-[.18em] text-[var(--faint)]">
              Biggest problem
            </div>
            <div className="mt-1 text-[15px] font-bold leading-snug">{biggestProblem}</div>
          </div>
        )}
      </>
    )}
  </div>

{!loading && (
  <div className="mt-4 grid grid-cols-2 gap-2.5">
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
)}
</aside>
      </div>
      )}

      {/* loading — replaces the whole panel */}
      {loading && (
        <div className="mt-10">
          <AnalyzingPanel noun={loadingNoun} />
        </div>
      )}

      {/* result dashboard */}
      {hasResult && (
        <section className="mt-8 flex flex-col gap-4">
          {/* slim re-upload bar */}
          <button
            onClick={reset}
            className="dpx-reupload group flex items-center justify-between rounded-2xl border border-[var(--edge)] bg-white/[.03] px-5 py-3 text-left transition hover:border-[rgba(24,224,255,.4)]"
          >
            <span className="font-brand text-[12px] font-bold uppercase tracking-[.14em] text-[var(--muted)] group-hover:text-[var(--cyan)]">
              ↻ Analyze another asset
            </span>
            <span className="font-brand text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
              {mode}
            </span>
          </button>

          {/* HERO — review noun + score + ship decision + why */}
          <div
            className="relative overflow-hidden rounded-3xl border p-7 shadow-[0_22px_70px_rgba(0,0,0,.45)] md:p-9"
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
            <div className="font-brand mb-3 text-[12px] font-bold uppercase tracking-[.24em] text-[var(--cyan)]">
              {reviewNoun || "Asset"} review
            </div>
            <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
              <div
                className="font-brand font-black leading-[.82]"
                style={{
                  fontSize: "clamp(72px,15vw,120px)",
                  color: score != null ? scoreColor(score) : "var(--cyan)",
                }}
              >
                {launchVal}
                <span className="font-brand text-[26px] font-bold text-[var(--faint)]">/100</span>
              </div>
              <div className="pb-2">
                {decision && (
                  <div
                    className="font-brand text-[clamp(24px,4.6vw,40px)] font-black leading-[.95]"
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
                    +{potential - score} reachable → {potential}/100
                  </div>
                )}
              </div>
            </div>
            {summaryLine && (
              <p className="mt-5 max-w-2xl text-[16px] font-semibold leading-snug text-[var(--foreground)]">
                <span className="font-brand text-[11px] uppercase tracking-[.16em] text-[var(--faint)]">Reason </span>
                {summaryLine}
              </p>
            )}
          </div>

          {/* 32PX STORE TEST — strongest feature, directly under the verdict (icon only) */}
          {previewAsset && (
            <ReportCard title="32px store test">
              <ShelfPreview asset={previewAsset} shelf={shelf} />
              <p className="mt-4 text-[13px] font-semibold italic text-[var(--faint)]">
                Your actual icon, shrunk to store size. Whatever survives here is your real first impression.
              </p>
            </ReportCard>
          )}

          {/* WHY IT SCORED THIS — 3 strengths / 3 weaknesses, no essay */}
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

          {/* WILL PEOPLE CLICK — compact risk line */}
          {risk && (
            <div
              className="rounded-3xl border border-[var(--edge)] p-6"
              style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-brand text-[15px] font-black">Will people click?</span>
                <span className="font-brand text-[15px] font-black" style={{ color: impactTone }}>
                  {risk.level}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="font-brand text-[9px] font-bold uppercase tracking-[.14em] text-[var(--faint)]">
                  Click → convert
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-[var(--edge)] bg-black/40">
                  <span
                    className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-sm bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]"
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
              className="rounded-3xl border-[1.5px] p-6"
              style={{
                borderColor: "rgba(105,255,0,.4)",
                background:
                  "radial-gradient(600px 260px at 50% -20%,rgba(105,255,0,.08),transparent 60%),linear-gradient(160deg,rgba(18,22,18,.96),rgba(7,8,12,.96))",
                boxShadow: "0 18px 50px -28px rgba(105,255,0,.4)",
              }}
            >
              <div className="font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--green)]">
                What to fix
              </div>
              <h2 className="font-brand mt-1 text-[22px] font-black">Top 3 actions</h2>
              <p className="mb-5 mt-1.5 text-sm font-semibold text-[var(--muted)]">
                Ranked by impact — start at the top.
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
                          <span className="font-brand text-[10px] uppercase tracking-[.12em] text-[var(--faint)]">Why </span>
                          {fix.why}
                        </p>
                      )}
                      {fix.change && (
                        <p className="mt-1 text-[13.5px] font-semibold leading-snug text-[var(--foreground)]">
                          <span className="font-brand text-[10px] uppercase tracking-[.12em] text-[var(--green)]">Change </span>
                          {fix.change}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ADVANCED ANALYSIS — everything detailed, collapsed */}
          <details
            className="dpx-details group rounded-3xl border border-[var(--edge)]"
            style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
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
              {/* category bars — weakest first */}
              {orderedBars.length > 0 && (
                <div>
                  <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
                    Score breakdown · weakest first
                  </div>
                  <div className="flex flex-col gap-3">
                    {orderedBars.map((row, i) => {
                      const v = scores?.[row.key as ScoreKey];
                      return (
                        <div key={row.key} className="flex items-center gap-3">
                          <span className="font-brand w-4 flex-none text-[11px] font-black text-[var(--faint)]">
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
                            {row.assessed && v != null ? v : "—"}
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
                    <div className="mb-3 font-brand text-[11px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
                      Click pull — what pulls the tap
                    </div>
                    <ChipGroup label="Curiosity" items={click.curiosity} tone="cyan" />
                    <ChipGroup label="Reward" items={click.reward} tone="green" />
                    <ChipGroup label="Tension" items={[...click.danger, ...click.urgency]} tone="gold" />
                    <ChipGroup label="Blocks the click" items={click.blockers} tone="magenta" />
                  </div>
                )}

              {/* gameplay clarity */}
              {gameplay && (gameplay.clear.length > 0 || gameplay.unclear.length > 0) && (
                <div>
                  <div className="mb-3 font-brand text-[11px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
                    Gameplay clarity — reads in 3 seconds?
                  </div>
                  <ChecklistCols
                    good={gameplay.clear}
                    bad={gameplay.unclear}
                    goodLabel="Clear in 3s"
                    badLabel="Still unclear"
                  />
                </div>
              )}

              {/* emotional signal */}
              {emotion && (emotion.present.length > 0 || emotion.missing.length > 0) && (
                <div>
                  <div className="mb-3 font-brand text-[11px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">
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

          {/* lead capture */}
          <div className="rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.05)] p-5">
            <h3 className="font-brand text-base font-bold">Want Dragon Pixel to fix the weak spots?</h3>
            <p className="mb-3 mt-1 text-sm font-semibold text-[var(--muted)]">
              Send us your email with this review and we&apos;ll quote a focused icon, screenshot, or store-page polish pass.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="min-w-[220px] flex-1 rounded-xl border border-[var(--edge)] bg-black/30 px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--cyan)]"
              />
              <button
                onClick={requestHelp}
                className="font-brand rounded-xl border border-[rgba(24,224,255,.4)] bg-[rgba(24,224,255,.12)] px-5 py-3 text-xs font-black uppercase tracking-[.08em] text-[var(--cyan)] transition hover:bg-[rgba(24,224,255,.2)]"
              >
                Request help
              </button>
            </div>
            {helpStatus && <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{helpStatus}</p>}
          </div>
        </section>
      )}

      {/* footer */}
      <footer className="mt-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-7 py-9 shadow-[0_18px_60px_rgba(0,0,0,.25)]">
          <div className="grid grid-cols-1 gap-9 md:grid-cols-2 md:items-start">
            {/* brand */}
            <div>
              <Image
                src="/logo.png"
                alt="Dragon Pixel Studio"
                width={240}
                height={52}
                className="h-9 w-auto opacity-90"
              />
              <p className="mt-3 max-w-xs text-[13.5px] leading-6 text-[var(--muted)]"> 
                Store Analyzer is our free pre-launch conversion review tool.
              </p>
            </div>

            {/* studio links */}

            {/* how it works */}
            <div>
              <h4 className="font-brand text-[11px] font-bold uppercase tracking-[.18em] text-[var(--cyan)]">
                How it works
              </h4>
              <div className="mt-3.5 space-y-3 text-[13.5px] leading-6 text-[var(--muted)]">
                <p>
                  <span className="font-bold text-[var(--foreground)]">Scoring engine - </span>
                  AI reads the visuals, Dragon Pixel scores clarity, click pull, polish, and conversion
                  risk with our algorithm.
                </p>
                <p>
                  <span className="font-bold text-[var(--foreground)]">Upload privacy - </span>
                  files are used only for this review request. They&apos;re not stored by the analyzer.
                </p>
              </div>
            </div>
          </div>

          {/* bottom bar */}
          <div className="mt-9 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-5 text-[12.5px] font-semibold text-[var(--faint)] md:flex-row">
            <span>© 2026 Dragon Pixel Studio. All rights reserved.</span>
            <a
              href="https://www.dragonpixelstudio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--cyan)] transition hover:underline"
            >
              dragonpixelstudio.com
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}