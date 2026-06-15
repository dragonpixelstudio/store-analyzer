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

type AnalyzePayload = {
  error?: string;
  report?: string;
  verdict?: string;
  calculated?: {
    launchScore?: number;
    potentialAfterFixes?: number;
    reviewModeLabel?: string;
  };
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
function parsePayload(raw: string): AnalyzePayload | null {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const c = isRecord(parsed.calculated)
    ? {
        launchScore: num(parsed.calculated.launchScore),
        potentialAfterFixes: num(parsed.calculated.potentialAfterFixes),
        reviewModeLabel: str(parsed.calculated.reviewModeLabel),
      }
    : undefined;
  return {
    error: str(parsed.error),
    report: str(parsed.report),
    verdict: str(parsed.verdict),
    calculated: c,
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

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [potential, setPotential] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("");
  const [mode, setMode] = useState("");
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
  width={232}
  height={58}
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
                          className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                            a.role === "screenshot"
                              ? "border-[rgba(255,61,180,.3)] bg-[rgba(255,61,180,.1)]"
                              : "border-[rgba(24,224,255,.3)] bg-[rgba(24,224,255,.1)]"
                          }`}
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
      <div className="flex min-h-[190px] flex-col items-center justify-center text-center">
        <div className="relative mb-6 h-24 w-24">
          <div className="absolute inset-0 animate-ping rounded-full border border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_70px_rgba(24,224,255,0.45)]" />
          <div className="absolute inset-3 animate-pulse rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 shadow-[0_0_55px_rgba(255,61,180,0.35)]" />
          <div className="absolute inset-7 rounded-full bg-cyan-300 shadow-[0_0_55px_rgba(24,224,255,0.85)]" />
        </div>

        <h2 className="font-brand text-xl font-black">
          Running Dragon Pixel review
        </h2>

        <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-[var(--muted)]">
          Checking shelf readability, click pull, gameplay clarity, and marketing confidence.
        </p>
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
      </>
    )}
  </div>

  {!hasResult && !loading && (
    <div className="mt-4 grid grid-cols-2 gap-2.5">
      {[
        ["Shelf test", "Survives at 32px?"],
        ["Click pull", "Reason to tap"],
        ["Gameplay clarity", "Read in 3 seconds"],
        ["Priority fixes", "What to do first"],
      ].map(([t, d]) => (
        <div
          key={t}
          className="rounded-xl border border-[var(--edge)] bg-white/[.025] px-3.5 py-2.5"
        >
          <span className="block text-[13.5px] font-bold">{t}</span>
          <span className="block text-[11.5px] font-semibold text-[var(--faint)]">
            {d}
          </span>
        </div>
      ))}
    </div>
  )}
</aside>
      </div>

      {/* full report */}
      {hasResult && (
        <section className="mt-6 rounded-3xl border border-[var(--edge)] p-6 shadow-[0_22px_70px_rgba(0,0,0,.4)]"
          style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}>
          <div className="report-prose max-w-none text-[var(--foreground)]">
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

          {/* lead capture */}
          <div className="mt-6 rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.05)] p-5">
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