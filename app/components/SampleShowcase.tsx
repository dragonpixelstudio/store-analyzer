"use client";

import { useEffect, useState } from "react";
import { ScoreRing } from "@/app/components/reportFx";

// A real saved report (SAMPLE_REPORT_ID), never a mock. If no sample is
// configured or it can't be loaded, the section renders nothing rather than
// inventing numbers.

type SampleData = {
  id: string;
  launchScore: number;
  potentialAfterFixes: number;
  decisionLabel: string;
  decisionTone: "good" | "warn" | "bad";
  summaryLine: string;
  reviewModeLabel: string;
  strengths: string[];
  weaknesses: string[];
  topFixAction: string;
  thumb: string;
  assetLabel: string;
  assetKind: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function parseSample(v: unknown): SampleData | null {
  if (!isRecord(v) || !isRecord(v.sample)) return null;
  const s = v.sample;
  if (typeof s.launchScore !== "number" || typeof s.id !== "string") return null;
  return {
    id: s.id,
    launchScore: s.launchScore,
    potentialAfterFixes:
      typeof s.potentialAfterFixes === "number" ? s.potentialAfterFixes : s.launchScore,
    decisionLabel: str(s.decisionLabel),
    decisionTone:
      s.decisionTone === "good" || s.decisionTone === "bad" ? s.decisionTone : "warn",
    summaryLine: str(s.summaryLine),
    reviewModeLabel: str(s.reviewModeLabel),
    strengths: list(s.strengths),
    weaknesses: list(s.weaknesses),
    topFixAction: str(s.topFixAction),
    thumb: str(s.thumb),
    assetLabel: str(s.assetLabel),
    assetKind: str(s.assetKind),
  };
}

const toneColor = (tone: "good" | "warn" | "bad") =>
  tone === "good" ? "var(--green)" : tone === "bad" ? "var(--magenta)" : "var(--gold)";

export default function SampleShowcase({
  className = "mx-auto mt-12 w-full max-w-[880px]",
  children,
}: {
  className?: string;
  /** Extra content rendered at the bottom of the card. */
  children?: React.ReactNode;
}) {
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

  if (!sample) return null;

  return (
    <section className={className} aria-label="Sample readout">
      <div
        className="relative rounded-2xl border border-[rgba(255,182,78,.28)] p-5 md:p-6"
        style={{
          background:
            "radial-gradient(circle at 16% 12%,rgba(255,182,78,.16),transparent 40%),radial-gradient(circle at 86% 84%,rgba(244,151,151,.14),transparent 42%),var(--panel)",
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <div className="dpx-kicker" data-tone="cyan">
            Real report
          </div>
          <span className="text-[12.5px] font-semibold text-[var(--faint)]">
            {sample.reviewModeLabel} review · live data, not a mockup
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_1.4fr]">
          {sample.thumb && (
            <div className="flex items-center justify-center gap-4 rounded-2xl border border-[var(--edge)] bg-[var(--well)] px-5 py-3.5">
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

          <div className="flex items-center justify-center gap-4 rounded-2xl border border-[var(--edge)] bg-[var(--well)] px-4 py-3.5">
            <ScoreRing score={sample.launchScore} potential={sample.potentialAfterFixes} size={108} />
            {sample.potentialAfterFixes > sample.launchScore && (
              <div className="max-w-[110px] text-[11px] font-bold leading-snug text-[var(--green)]">
                Illustrative scenario: {sample.potentialAfterFixes}/100 · not a forecast
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-[var(--edge)] bg-[var(--well)] px-4 py-3.5">
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
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-[var(--edge)] bg-[var(--well)] px-4 py-3.5 sm:grid-cols-2">
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
              <span className="font-brand mr-1.5 rounded-full border border-[rgba(155,206,167,.35)] bg-[rgba(155,206,167,.08)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[.08em] text-[var(--green)]">
                Top fix
              </span>
              {sample.topFixAction}
            </span>
          )}
          <a
            href={`/report/${sample.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-brand flex-none rounded-full border border-[rgba(255,182,78,.4)] bg-[rgba(255,182,78,.08)] px-4 py-2 text-[12px] font-bold text-[var(--cyan)] transition hover:-translate-y-0.5 hover:bg-[rgba(255,182,78,.15)]"
          >
            Open the full report →
          </a>
        </div>

        {children}
      </div>
    </section>
  );
}
