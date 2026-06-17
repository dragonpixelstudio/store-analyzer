"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_SCREENSHOTS = 3;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FORMSPREE = "https://formspree.io/f/xeedbrla";

type Role = "icon" | "screenshot";

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

type AnalyzePayload = {
  error?: string;
  report?: string;
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
    biggestProblem?: string;
    topFixes?: string[];
  };
  shelf?: { visible: string[]; lost: string[] };
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
        biggestProblem: str(rawCalc.biggestProblem),
        topFixes: strList(rawCalc.topFixes),
      }
    : undefined;
  const obs = isRecord(parsed.observations) ? parsed.observations : undefined;
  const shelfObs = obs && isRecord(obs.shelfTest) ? obs.shelfTest : undefined;
  const shelf = shelfObs
    ? { visible: strList(shelfObs.visibleElements), lost: strList(shelfObs.lostElements) }
    : undefined;
  return {
    error: str(parsed.error),
    report: str(parsed.report),
    verdict: str(parsed.verdict),
    calculated: c,
    shelf,
  };
}


/* ---------- helpers ---------- */
function formatSize(bytes: number) {
  return (bytes / 1048576).toFixed(2) + " MB";
}
// square-ish => icon, otherwise screenshot
function classify(w: number, h: number): Role {
  const ar = w / h;
  return ar >= 0.9 && ar <= 1.15 ? "icon" : "screenshot";
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

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [potential, setPotential] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("");
  const [mode, setMode] = useState("");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>> | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [risk, setRisk] = useState<ConversionRisk | null>(null);
  const [impact, setImpact] = useState<StoreImpact | null>(null);
  const [biggestProblem, setBiggestProblem] = useState("");
  const [topFixes, setTopFixes] = useState<string[]>([]);
  const [shelf, setShelf] = useState<{ visible: string[]; lost: string[] } | null>(null);
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

    const fd = new FormData();
    if (icon) fd.append("icon", icon.file);
    shots.forEach((s) => fd.append("screenshots", s.file));

    setLoading(true);
    setError("");
    setReport("");
    setScore(null);
    setPotential(null);
    setVerdict("");
    setMode("");
    setScores(null);
    setBreakdown([]);
    setRisk(null);
    setImpact(null);
    setBiggestProblem("");
    setTopFixes([]);
    setShelf(null);
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

      setReport(data.report || "No report returned.");
      setScore(data.calculated?.launchScore ?? null);
      setPotential(data.calculated?.potentialAfterFixes ?? null);
      setVerdict(data.verdict || "");
      setMode(data.calculated?.reviewModeLabel || "");
      setScores(data.calculated?.scores ?? null);
      setBreakdown(data.calculated?.breakdown ?? []);
      setRisk(data.calculated?.conversionRisk ?? null);
      setImpact(data.calculated?.storeImpact ?? null);
      setBiggestProblem(data.calculated?.biggestProblem ?? "");
      setTopFixes(data.calculated?.topFixes ?? []);
      setShelf(data.shelf ?? null);
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
      const res = await fetch(FORMSPREE, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: JSON.stringify({ email, verdict, report }),
      });
      setHelpStatus(res.ok ? "Sent — we'll be in touch." : "Something went wrong. Try again.");
    } catch {
      setHelpStatus("Couldn't send right now. Try again.");
    }
  }

  const hasUsable = assets.some((a) => !a.error && !a.overflow);
  const hasResult = Boolean(report) && score != null;

  // worst-first priority order; assessed categories first, unassessed last
  const orderedBars = [...breakdown].sort((a, b) => {
    if (a.assessed !== b.assessed) return a.assessed ? -1 : 1;
    const av = scores?.[a.key as ScoreKey] ?? 999;
    const bv = scores?.[b.key as ScoreKey] ?? 999;
    return av - bv;
  });
  const scoreColor = (v: number) =>
    v >= 80 ? "var(--green)" : v >= 50 ? "var(--gold)" : "var(--magenta)";
  // the real asset to shrink for the 32px test: icon if present, else first screenshot
  const previewAsset =
    assets.find((a) => a.role === "icon" && !a.error) ||
    assets.find((a) => a.role === "screenshot" && !a.error && !a.overflow) ||
    null;
  const impactTone =
    impact?.tone === "good" ? "var(--green)" : impact?.tone === "bad" ? "var(--magenta)" : "var(--gold)";

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
            <h2 className="font-brand text-[22px] font-bold">Drop your assets</h2>
            <p className="mb-4 mt-1.5 text-[15px] font-semibold text-[var(--muted)]">
              Drop your icon and screenshots together — the analyzer sorts them for you.
            </p>

            {/* dropzone */}
            <label
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`dpx-pulse relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed px-5 py-8 text-center transition-all ${
                dragOver
                  ? "-translate-y-0.5 border-[var(--cyan)] bg-[rgba(24,224,255,.1)] shadow-[0_0_36px_rgba(24,224,255,.28)]"
                  : "border-[rgba(24,224,255,.4)] bg-[rgba(24,224,255,.04)]"
              }`}
            >
              <svg className="h-10 w-10 text-[var(--cyan)] opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V6" /><path d="m8 10 4-4 4 4" /><rect x="4" y="16" width="16" height="4" rx="1.5" />
              </svg>
              <span className="font-brand text-base font-bold">Drop images here</span>
              <span className="text-[var(--muted)]">
                or <span className="text-[var(--cyan)] underline underline-offset-[3px]">browse files</span>
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="absolute h-px w-px overflow-hidden opacity-0"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles([...e.target.files]);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-3 text-center text-[13px] font-semibold text-[var(--faint)]">
              One icon + up to 3 screenshots · PNG, JPEG, WebP · 2&nbsp;MB each
            </p>

            {/* detected assets */}
            {assets.length > 0 && (
              <div className="mt-4 flex flex-col gap-2.5">
                {assets.map((a) => {
                  const bad = Boolean(a.error) || a.overflow;
                  const detail = a.error
                    ? a.error
                    : a.overflow
                    ? "Extra screenshot — max 3"
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
  onChange={(e) => setRole(a.id, e.target.value as Role)}
  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white outline-none ${
    a.role === "screenshot"
      ? "border-[rgba(255,61,180,.35)] bg-[#24132b]"
      : "border-[rgba(24,224,255,.35)] bg-[#102636]"
  }`}
  style={{
    colorScheme: "dark",
  }}
>
                          <option value="icon">Icon</option>
                          <option value="screenshot">Screenshot</option>
                        </select>
                      )}
                      <button
                        onClick={() => removeAsset(a.id)}
                        aria-label="Remove"
                        className="flex-none px-1 text-xl leading-none text-[var(--faint)] hover:text-[var(--magenta)]"
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

      {/* result dashboard */}
      {hasResult && (
        <section className="mt-6 flex flex-col gap-4">
          {/* STORE IMPACT — the "why care" outcome line */}
          {impact && (
            <div
              className="rounded-3xl border p-6 shadow-[0_22px_70px_rgba(0,0,0,.4)]"
              style={{
                borderColor:
                  impact.tone === "bad"
                    ? "rgba(255,61,180,.34)"
                    : impact.tone === "good"
                    ? "rgba(105,255,0,.3)"
                    : "rgba(255,194,61,.3)",
                background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))",
              }}
            >
              <div className="font-brand text-[11px] font-bold uppercase tracking-[.2em]" style={{ color: impactTone }}>
                Store impact
              </div>
              <div className="font-brand mt-2 text-[22px] font-black" style={{ color: impactTone }}>
                {impact.headline}
              </div>
              {risk?.reason && (
                <p className="mt-2 text-[15px] font-semibold text-[var(--muted)]">{risk.reason}</p>
              )}
              {risk && (
                <div className="mt-4 flex items-center gap-3">
                  <span className="font-brand text-[9px] font-bold uppercase tracking-[.14em] text-[var(--faint)]">
                    Click → convert
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-[var(--edge)] bg-black/40">
                    <span
                      className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-sm bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]"
                      style={{ left: `${Math.max(2, Math.min(98, risk.position))}%` }}
                    />
                  </div>
                  <span className="font-brand text-[12px] font-black" style={{ color: impactTone }}>
                    {risk.level}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TOP 3 FIXES — action-first */}
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
                Your move
              </div>
              <h2 className="font-brand mt-1 text-[22px] font-black">Do these first</h2>
              <p className="mb-5 mt-1.5 text-sm font-semibold text-[var(--muted)]">
                Ranked priority — start at the top.
              </p>
              <div className="flex flex-col gap-3">
                {topFixes.map((fix, i) => (
                  <div
                    key={`${i}-${fix.slice(0, 24)}`}
                    className="flex gap-4 rounded-2xl border border-[var(--edge)] bg-white/[.03] p-4"
                  >
                    <span className="font-brand text-[26px] font-black leading-none text-[var(--green)] opacity-60">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[15px] font-semibold leading-snug">{fix}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORY BARS — worst first */}
          {orderedBars.length > 0 && (
            <div
              className="rounded-3xl border border-[var(--edge)] p-6"
              style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
            >
              <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
                Weakest first
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

          {/* 32px SHELF PREVIEW — real uploaded asset */}
          {previewAsset && (
            <div
              className="rounded-3xl border border-[var(--edge)] p-6"
              style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
            >
              <div className="mb-4 font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">
                Shelf test · 32px
              </div>
              <ShelfPreview asset={previewAsset} shelf={shelf} />
              <p className="mt-4 text-[13px] font-semibold italic text-[var(--faint)]">
                Your actual asset, shrunk to store-icon size. Whatever survives here is your real first impression.
              </p>
            </div>
          )}

          {/* ADVANCED — full written report, collapsed */}
          <details className="rounded-3xl border border-[var(--edge)]"
            style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}>
            <summary className="font-brand cursor-pointer list-none px-6 py-5 text-[12px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">
              Full written report
            </summary>
            <div className="report-prose max-w-none px-6 pb-6 text-[var(--foreground)]">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="font-brand mb-3 text-2xl font-black">{children}</h1>,
                  h2: ({ children }) => <h2 className="font-brand mb-2 mt-6 text-lg font-bold text-[var(--cyan)]">{children}</h2>,
                  h3: ({ children }) => <h3 className="font-brand mb-1.5 mt-4 text-[15px] font-bold text-[var(--muted)]">{children}</h3>,
                  p: ({ children }) => <p className="mb-3 text-[15px] leading-relaxed text-[var(--muted)]">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 ml-1 list-disc space-y-1 pl-4 text-[15px] text-[var(--muted)]">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 ml-1 list-decimal space-y-1 pl-4 text-[15px] text-[var(--muted)]">{children}</ol>,
                  strong: ({ children }) => <strong className="font-bold text-[var(--foreground)]">{children}</strong>,
                  em: ({ children }) => <em className="not-italic text-[var(--cyan)]">{children}</em>,
                  hr: () => <hr className="my-5 border-[var(--edge)]" />,
                }}
              >
                {report}
              </ReactMarkdown>
            </div>
          </details>

          {/* lead capture */}
          <div className="rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.05)] p-5">
            <h3 className="font-brand text-base font-bold">Want Dragon Pixel to fix the weak spots?</h3>
            <p className="mb-3 mt-1 text-sm font-semibold text-[var(--muted)]">
              Send this report with your email and we&apos;ll quote a focused icon, screenshot, or store-page polish pass.
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
      <footer className="mt-4 pt-6">
        <div className="mb-5 grid grid-cols-1 gap-4 opacity-60 md:grid-cols-2">
          <div>
            <h4 className="font-brand text-center text-[11px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">Scoring engine</h4>
            <p className="text-[13px] font-semibold text-[var(--faint)]">
              The AI observes the visuals. Dragon Pixel calculates the score with fixed conversion rules — clarity, click pull, emotion, confidence, polish.
            </p>
          </div>
          <div>
            <h4 className="font-brand text-center text-[11px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">Upload privacy</h4>
            <p className="text-[13px] font-semibold text-[var(--faint)]">
              Your files aren&apos;t saved. Images are sent to the AI review service for the analysis request only.
            </p>
          </div>
        </div>
        <div className="text-center text-[13px] font-semibold text-[var(--faint)]">
          © 2026 Dragon Pixel Studio
          <span className="mx-2 opacity-45">·</span>
          <a href="https://www.dragonpixelstudio.com" target="_blank" rel="noopener noreferrer" className="text-[var(--cyan)] hover:underline">
            dragonpixelstudio.com
          </a>
        </div>
      </footer>
    </main>
  );
}