"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SCREENSHOTS = 3;

type AnalyzePayload = {
  error?: string;
  report?: string;
  verdict?: string;
  calculated?: {
    launchScore?: number;
    potentialAfterFixes?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseAnalyzePayload(raw: string): AnalyzePayload | null {
  let parsed: unknown;

  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const calculated = isRecord(parsed.calculated)
    ? {
        launchScore: numberValue(parsed.calculated.launchScore),
        potentialAfterFixes: numberValue(parsed.calculated.potentialAfterFixes),
      }
    : undefined;

  return {
    error: stringValue(parsed.error),
    report: stringValue(parsed.report),
    verdict: stringValue(parsed.verdict),
    calculated,
  };
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fileError(file: File) {
  if (!file.type.startsWith("image/")) {
    return `${file.name} is not an image file.`;
  }

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is over 2 MB.`;
  }

  return "";
}

function scoreTone(score: number | null) {
  if (score === null) return "border-white/10 bg-white/[0.06]";
  if (score >= 75) return "border-emerald-300/30 bg-emerald-300/10";
  if (score >= 60) return "border-cyan-300/30 bg-cyan-300/10";
  if (score >= 40) return "border-amber-300/30 bg-amber-300/10";
  return "border-rose-300/30 bg-rose-300/10";
}

export default function Home() {
  const [icon, setIcon] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [potential, setPotential] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [helpStatus, setHelpStatus] = useState("");
  const [uploadNote, setUploadNote] = useState("");

  const selectedFiles = useMemo(
    () => [icon, ...screenshots].filter((file): file is File => Boolean(file)),
    [icon, screenshots]
  );

  function validateFiles(files: File[]) {
    if (screenshots.length > MAX_SCREENSHOTS) {
      return `Upload at most ${MAX_SCREENSHOTS} screenshots.`;
    }

    const invalid = files.map(fileError).find(Boolean);
    return invalid || "";
  }

  function updateIcon(file: File | null) {
    setIcon(file);
    setUploadNote(file ? fileError(file) : "");
  }

  function updateScreenshots(files: File[]) {
    const capped = files.slice(0, MAX_SCREENSHOTS);
    setScreenshots(capped);

    if (files.length > MAX_SCREENSHOTS) {
      setUploadNote(`Only the first ${MAX_SCREENSHOTS} screenshots were kept.`);
      return;
    }

    setUploadNote(validateFiles([icon, ...capped].filter(Boolean) as File[]));
  }

  async function analyze() {
    if (loading || selectedFiles.length === 0) return;

    const validationError = validateFiles(selectedFiles);
    if (validationError) {
      setReport(validationError);
      return;
    }

    const formData = new FormData();
    if (icon) formData.append("icon", icon);
    screenshots.forEach((file) => formData.append("screenshots", file));

    setLoading(true);
    setReport("");
    setScore(null);
    setPotential(null);
    setVerdict("");
    setHelpStatus("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const raw = await res.text();
      const data = parseAnalyzePayload(raw);

      if (!data) {
        console.error("Bad JSON from /api/analyze:", raw);
        setReport("The server returned an unexpected response. Please try again.");
        return;
      }

      if (!res.ok || data.error) {
        setReport(
          data.error ||
            `Request failed (${res.status}). Please try again in a moment.`
        );
        return;
      }

      setReport(data.report || "No report returned.");
      setScore(data.calculated?.launchScore ?? null);
      setPotential(data.calculated?.potentialAfterFixes ?? null);
      setVerdict(data.verdict || "");
    } catch {
      setReport(
        "Could not reach the analyzer. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function requestHelp() {
    if (!clientEmail || !report) {
      setHelpStatus("Enter your email first.");
      return;
    }

    setHelpStatus("Sending...");

    try {
      const res = await fetch("https://formspree.io/f/xeedbrla", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: "Store Analyzer Fix Request",
          email: clientEmail,
          message: report,
          source: "Dragon Pixel Store Analyzer",
        }),
      });

      if (res.ok) {
        setHelpStatus("Sent. Dragon Pixel received the report.");
      } else {
        setHelpStatus(
          "Could not send. Try emailing contact@dragonpixelstudio.com."
        );
      }
    } catch {
      setHelpStatus(
        "Could not send. Try emailing contact@dragonpixelstudio.com."
      );
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050D20] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-18%] top-[-22%] h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-[-25%] right-[-20%] h-[620px] w-[620px] rounded-full bg-fuchsia-500/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <section className="relative mx-auto max-w-6xl px-6 py-8 sm:py-10">
        <header className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Image
              src="/logo.png"
              alt="Dragon Pixel Studio"
              width={560}
              height={250}
              preload
              className="mb-6 h-auto w-48 opacity-90 sm:w-56"
            />

            <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">
              Dragon Pixel Studio
            </p>

            <h1 className="font-brand max-w-3xl text-4xl font-black tracking-normal md:text-6xl">
              Store Analyzer
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-300">
              Upload your game icon and store screenshots. Get a conversion
              review focused on shelf readability, click pull, gameplay clarity,
              and what to fix first.
            </p>
          </div>

          <a
            href="https://www.dragonpixelstudio.com/"
            className="w-fit rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-200"
          >
            Studio Site
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <p className="mb-3 w-fit rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
                Free Store Audit
              </p>
              <h2 className="font-brand text-2xl font-bold">
                Analyze Store Assets
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
                Best test: one icon plus up to 3 real store screenshots. PNG,
                JPEG, and WebP are checked server-side.
              </p>
            </div>

            <div className="space-y-5">
              <label className="block rounded-2xl border border-white/10 bg-black/25 p-4">
                <span className="mb-2 block text-sm font-bold text-cyan-200">
                  App Icon
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => updateIcon(e.target.files?.[0] || null)}
                  className="block w-full cursor-pointer text-sm font-medium text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-bold file:text-black"
                />
              </label>

              <label className="block rounded-2xl border border-white/10 bg-black/25 p-4">
                <span className="mb-2 block text-sm font-bold text-fuchsia-200">
                  Store Screenshots
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(e) =>
                    updateScreenshots(Array.from(e.target.files || []))
                  }
                  className="block w-full cursor-pointer text-sm font-medium text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-fuchsia-300 file:px-4 file:py-2 file:font-bold file:text-black"
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                    Selected assets
                  </p>
                  <div className="space-y-2">
                    {selectedFiles.map((file) => (
                      <div
                        key={`${file.name}-${file.size}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-slate-300"
                      >
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-slate-500">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadNote && (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
                  {uploadNote}
                </p>
              )}

              <button
                type="button"
                onClick={analyze}
                disabled={loading || selectedFiles.length === 0}
                className="w-full rounded-2xl bg-cyan-300 px-6 py-5 text-sm font-black uppercase tracking-[0.22em] text-black shadow-[0_0_38px_rgba(34,211,238,0.38)] transition hover:bg-white hover:shadow-[0_0_55px_rgba(34,211,238,0.58)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Analyzing..." : "Analyze Assets"}
              </button>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs font-medium leading-5 text-slate-400">
              <div>
                <p className="font-bold text-slate-200">Scoring Engine</p>
                <p className="mt-2">
                  AI observes the visuals. Dragon Pixel calculates the score
                  with fixed conversion rules for clarity, click pull, emotion,
                  confidence, and polish.
                </p>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="font-bold text-slate-200">Upload Privacy</p>
                <p className="mt-2">
                  This app does not save your uploaded files; images are sent to
                  the AI review service only for the analysis request.
                </p>
              </div>
            </div>
          </aside>

          <section className="min-h-[560px] rounded-2xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur">
            {!report && !loading && (
              <div className="min-h-[520px]">
                <div className="mb-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                    What your report checks
                  </p>
                <h2 className="font-brand text-3xl font-black">
                    Launch-readiness, not generic art feedback.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                    The analyzer looks at whether a cold store visitor can read
                    the asset quickly, understand the gameplay, and feel a
                    reason to click.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Shelf Test", "What survives at 32px and what disappears."],
                    ["Click Pull", "Curiosity, reward, danger, urgency, blockers."],
                    ["Gameplay Clarity", "Objective, action, reward, and threat."],
                    ["Priority Fixes", "Specific art-direction changes to test next."],
                  ].map(([title, text]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"
                    >
                      <h3 className="font-brand text-lg font-bold text-white">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-[#071126]/80 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-200">
                    Sample output
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">
                        Launch Score
                      </p>
                      <p className="mt-2 text-3xl font-black">--/100</p>
                    </div>
                    <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-200">
                        Potential
                      </p>
                      <p className="mt-2 text-3xl font-black">--/100</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                        Verdict
                      </p>
                      <p className="mt-3 text-lg font-bold text-white">
                        Pending assets
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-6 h-16 w-16 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_80px_rgba(34,211,238,0.8)]" />
                <h2 className="font-brand text-2xl font-black">
                  Running Dragon Pixel review
                </h2>
                <p className="mt-3 text-sm font-medium text-slate-400">
                  Checking shelf readability, click pull, gameplay clarity, and
                  marketing confidence.
                </p>
              </div>
            )}

            {report && !loading && (
              <div>
                <div className="mb-6 grid gap-4 md:grid-cols-3">
                  <div className={`rounded-2xl border p-5 ${scoreTone(score)}`}>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200">
                      Launch Score
                    </p>
                    <p className="mt-2 text-4xl font-black">
                      {score ?? "--"}
                      <span className="text-lg text-slate-400">/100</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-fuchsia-200">
                      Potential
                    </p>
                    <p className="mt-2 text-4xl font-black">
                      {potential ?? "--"}
                      <span className="text-lg text-slate-400">/100</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-300">
                      Verdict
                    </p>
                    <p className="mt-3 text-lg font-bold text-white">
                      {verdict || "Pending"}
                    </p>
                  </div>
                </div>

                <article className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-[#071126]/80 p-6 text-slate-200">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="font-brand mb-5 mt-0 text-3xl font-black text-white">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="font-brand mb-3 mt-9 border-t border-white/10 pt-6 text-xl font-black text-cyan-300">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="mb-2 mt-6 text-lg font-bold text-white">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-4 leading-7 text-slate-300">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-5 ml-5 list-disc space-y-2 text-slate-300">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-5 ml-5 list-decimal space-y-2 text-slate-300">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="pl-1 leading-7">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-black text-white">
                          {children}
                        </strong>
                      ),
                      em: ({ children }) => (
                        <em className="not-italic text-cyan-200">
                          {children}
                        </em>
                      ),
                    }}
                  >
                    {report}
                  </ReactMarkdown>
                </article>

                <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                  <h3 className="font-brand text-xl font-black text-white">
                    Want Dragon Pixel to fix the weak spots?
                  </h3>
                  <p className="mt-2 text-sm font-medium text-slate-300">
                    Send this report with your email and we can quote a focused
                    icon, screenshot, or store-page polish pass.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 font-medium text-white outline-none focus:border-cyan-300"
                    />

                    <button
                      type="button"
                      onClick={requestHelp}
                      className="rounded-xl bg-cyan-300 px-6 py-3 font-black text-black transition hover:bg-white"
                    >
                      Request Help
                    </button>
                  </div>

                  {helpStatus && (
                    <p className="mt-3 text-sm font-semibold text-cyan-200">
                      {helpStatus}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
