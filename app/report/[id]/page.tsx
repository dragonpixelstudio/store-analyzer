import ResultsOverview, { ResultPriorities } from "@/app/components/ResultsOverview";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BenchmarkDossier from "@/app/components/BenchmarkDossier";
import ShareBeacon from "@/app/report/[id]/ShareBeacon";
import StudioHeader from "@/app/components/StudioHeader";
import {
  RevealFlow,
  type RadarRow,
} from "@/app/components/reportFx";
import { loadReport, type StoredReport } from "@/lib/reportStore";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) {
    return { title: "Report not found - Dragon Pixel Store Analyzer" };
  }
  return {
    title: `Launch score ${report.calculated.launchScore}/100 - Dragon Pixel Store Analyzer`,
    description:
      report.calculated.summaryLine ||
      "A scored conversion review of game store assets.",
    // Shared reports contain user assets; keep them out of search indexes.
    robots: { index: false, follow: false },
  };
}

const scoreColor = (v: number) =>
  v >= 80 ? "var(--green)" : v >= 50 ? "var(--gold)" : "var(--magenta)";

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

function ChecklistItem({ text, ok }: { text: string; ok: boolean }) {
  return (
    <div
      className="mb-1.5 flex items-start gap-2 text-[13.5px] leading-snug"
      style={{ color: ok ? "var(--muted)" : "#c8aab2" }}
    >
      <span className="mt-px flex-none font-bold" style={{ color: ok ? "var(--green)" : "var(--magenta)" }}>
        {ok ? "✓" : "✗"}
      </span>
      <span>{text}</span>
    </div>
  );
}

function ScoreBars({ report }: { report: StoredReport }) {
  const { breakdown, scores } = report.calculated;
  const ordered = [...breakdown].sort((a, b) => {
    if (a.assessed !== b.assessed) return a.assessed ? -1 : 1;
    const av = scores[a.key as keyof typeof scores] ?? 999;
    const bv = scores[b.key as keyof typeof scores] ?? 999;
    return av - bv;
  });

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((row, i) => {
        const v = scores[row.key as keyof typeof scores];
        return (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-4 flex-none text-[11px] font-semibold text-[var(--faint)]">{i + 1}</span>
            <span className="w-[122px] flex-none text-[13px] font-semibold text-[var(--muted)]">
              {row.label}
            </span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-md border border-[var(--edge)] bg-[var(--well)]">
              {row.assessed && v != null ? (
                <div className="h-full rounded-[3px]" style={{ width: `${v}%`, background: scoreColor(v) }} />
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
  );
}

export default async function SharedReportPage({ params }: { params: Params }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) notFound();

  const c = report.calculated;
  const RADAR_LABELS: Record<string, string> = {
    shelfReadability: "Shelf",
    clickPull: "Click",
    gameplayClarity: "Gameplay",
    emotionalSignal: "Emotion",
    marketingConfidence: "Marketing",
    visualPolish: "Polish",
  };
  const radarRows: RadarRow[] = c.breakdown.map((row) => ({
    label: RADAR_LABELS[row.key] ?? row.label,
    value: row.assessed
      ? c.scores[row.key as keyof typeof c.scores] ?? null
      : null,
  }));
  const createdAt = new Date(report.createdAt);
  const createdLabel = Number.isNaN(createdAt.getTime())
    ? ""
    : createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <><StudioHeader /><main className="analysis-page">
      <ShareBeacon />
      <header className="pt-8 pb-1 text-center">
        <div className="mt-8 flex justify-center">
          <div className="dpx-kicker" data-tone="cyan">
            Shared report{createdLabel ? ` · ${createdLabel}` : ""}
          </div>
        </div>
      </header>

      <RevealFlow className="mt-6 flex flex-col gap-4">
        <ResultsOverview score={c.launchScore} rows={radarRows} mode={c.reviewModeLabel} priorities={c.topFixes.length} risk={c.conversionRisk} />
        <ResultPriorities fixes={c.topFixes} />
        <details className="result-evidence"><summary>Reviewed artwork & evidence</summary><div>
        {/* Reviewed assets */}
        {report.assets.some((a) => a.thumb) && (
          <ReportCard title="Reviewed assets">
            <div className="flex flex-wrap gap-4">
              {report.assets.map(
                (asset, i) =>
                  asset.thumb && (
                    <figure key={`${i}-${asset.label}`} className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- stored data-URL thumbnail */}
                      <img
                        src={asset.thumb}
                        alt={asset.label}
                        className="h-24 w-auto rounded-lg border border-[var(--edge)] bg-black object-contain"
                      />
                      <figcaption className="mt-1.5 text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                        {asset.label} · {asset.widthPx}×{asset.heightPx}
                      </figcaption>
                    </figure>
                  )
              )}
            </div>
          </ReportCard>
        )}

        {report.benchmarkEvidence?.map((evidence) => (
          <BenchmarkDossier
            key={`${evidence.platform}-${evidence.assetKind}`}
            evidence={evidence}
          />
        ))}

        {/* Why it scored this */}
        {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
          <ReportCard title="Why it scored this">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {c.strengths.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--green)]">
                    Visual strengths
                  </div>
                  {c.strengths.map((t, i) => (
                    <ChecklistItem key={`s-${i}`} text={t} ok />
                  ))}
                </div>
              )}
              {c.weaknesses.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--magenta)]">
                    Visual weaknesses
                  </div>
                  {c.weaknesses.map((t, i) => (
                    <ChecklistItem key={`w-${i}`} text={t} ok={false} />
                  ))}
                </div>
              )}
            </div>
          </ReportCard>
        )}

        </div></details>
        {/* Score breakdown */}
        <details className="result-evidence"><summary>Detailed scores</summary><div><ReportCard title="Scores">
          <ScoreBars report={report} />
        </ReportCard></div></details>

        <div className="result-tools"><Link href="/analyze">New analysis</Link><Link href="/">Open Studio →</Link></div>
      </RevealFlow>
    </main></>
  );
}
