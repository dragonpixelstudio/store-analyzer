"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

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

  const screenshotNames = useMemo(
    () => screenshots.map((file) => file.name).join(", "),
    [screenshots]
  );

  async function analyze() {
    if (!icon && screenshots.length === 0) return;

    const formData = new FormData();
    if (icon) formData.append("icon", icon);
    screenshots.forEach((file) => formData.append("screenshots", file));

    setLoading(true);
    setReport("");
    setScore(null);
    setPotential(null);
    setVerdict("");
    setHelpStatus("");

    const res = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const raw = await res.text();

    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      setReport("Server returned invalid JSON:\n\n" + raw);
      setLoading(false);
      return;
    }

    setReport(data.report || data.error || "No report returned.");
    setScore(data.calculated?.launchScore ?? null);
    setPotential(data.calculated?.potentialAfterFixes ?? null);
    setVerdict(data.verdict || "");
    setLoading(false);
  }

  async function requestHelp() {
    if (!clientEmail || !report) {
      setHelpStatus("Enter your email first.");
      return;
    }

    setHelpStatus("Sending...");

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
      setHelpStatus("Could not send. Try emailing contact@dragonpixelstudio.com.");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050D20] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute left-[-20%] top-[-20%] h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-[-25%] right-[-20%] h-[620px] w-[620px] rounded-full bg-fuchsia-500/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <section className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
<div>
  <img
    src="/logo.png"
    alt="Dragon Pixel Studio"
    className="mb-5 h-auto w-56 opacity-90"
  />

  <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">
    Dragon Pixel Studio
  </p>

  <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
    Store Analyzer
  </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
Upload your game icon and store assets. Get a conversion-focused
review powered by the Dragon Pixel scoring engine.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Analyze Store Assets</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Best test: one icon plus 3–5 real store screenshots.
              </p>
            </div>

            <div className="space-y-5">
              <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
                <span className="mb-2 block text-sm font-bold text-cyan-200">
                  App Icon
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setIcon(e.target.files?.[0] || null)}
                  className="block w-full cursor-pointer text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-bold file:text-black"
                />
                {icon && (
                  <p className="mt-3 truncate text-xs text-slate-400">
                    Selected: {icon.name}
                  </p>
                )}
              </label>

              <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
                <span className="mb-2 block text-sm font-bold text-fuchsia-200">
                  Store Screenshots
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    setScreenshots(Array.from(e.target.files || []))
                  }
                  className="block w-full cursor-pointer text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-fuchsia-300 file:px-4 file:py-2 file:font-bold file:text-black"
                />
                {screenshots.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs text-slate-400">
                    {screenshots.length} selected: {screenshotNames}
                  </p>
                )}
              </label>

              <button
                onClick={analyze}
                disabled={loading || (!icon && screenshots.length === 0)}
                className="w-full rounded-2xl bg-cyan-300 px-6 py-6 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_0_38px_rgba(34,211,238,0.38)] transition hover:bg-white hover:shadow-[0_0_55px_rgba(34,211,238,0.58)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Analyzing..." : "Analyze Assets"}
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400">
              <p className="font-bold text-slate-200">Scoring Engine</p>
              <p className="mt-2">
                Gemini observes the assets. Dragon Pixel calculates the score
                using fixed rules for shelf readability, click pull, gameplay
                clarity, emotional signal, risk, and polish.
              </p>
            </div>
          </aside>

          <section className="min-h-[560px] rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur">
            {!report && !loading && (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-6 h-24 w-24 rounded-full border border-cyan-300/30 bg-cyan-300/10 shadow-[0_0_60px_rgba(34,211,238,0.25)]" />
                <h2 className="text-3xl font-black">No review generated yet</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                  Upload assets and run the analyzer. The report will appear here
                  with a launch score, asset-by-asset review, and priority fixes.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-6 h-16 w-16 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_80px_rgba(34,211,238,0.8)]" />
                <h2 className="text-2xl font-black">Running Dragon Pixel review</h2>
                <p className="mt-3 text-sm text-slate-400">
                  Checking shelf readability, click pull, gameplay clarity, and marketing risk.
                </p>
              </div>
            )}

            {report && !loading && (
              <div>
                <div className="mb-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">
                      Launch Score
                    </p>
                    <p className="mt-2 text-4xl font-black">
                      {score ?? "--"}
                      <span className="text-lg text-slate-400">/100</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-200">
                      Potential
                    </p>
                    <p className="mt-2 text-4xl font-black">
                      {potential ?? "--"}
                      <span className="text-lg text-slate-400">/100</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-300">
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
                        <h1 className="mb-5 mt-0 text-3xl font-black text-white">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="mb-3 mt-9 border-t border-white/10 pt-6 text-xl font-black text-cyan-300">
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
                  <h3 className="text-xl font-black text-white">
                    Need help fixing this?
                  </h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Send the report to Dragon Pixel with your email.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-cyan-300"
                    />

                    <button
                      onClick={requestHelp}
                      className="rounded-xl bg-cyan-300 px-6 py-3 font-black text-black transition hover:bg-white"
                    >
                      Need our help?
                    </button>
                  </div>

                  {helpStatus && (
                    <p className="mt-3 text-sm text-cyan-200">{helpStatus}</p>
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