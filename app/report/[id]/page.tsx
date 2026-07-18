import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import BenchmarkDossier from "@/app/components/BenchmarkDossier";
import { SiteNav } from "@/app/components/SiteChrome";
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

const toneColor = (tone: "good" | "warn" | "bad") =>
  tone === "good" ? "var(--green)" : tone === "bad" ? "var(--magenta)" : "var(--gold)";

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
            <div className="h-3.5 flex-1 overflow-hidden rounded-md border border-[var(--edge)] bg-black/40">
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
  const decisionTone = toneColor(c.decision.tone);
  const createdAt = new Date(report.createdAt);
  const createdLabel = Number.isNaN(createdAt.getTime())
    ? ""
    : createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="relative z-[1] mx-auto w-[min(1060px,calc(100%-44px))] pb-16">
      <header className="pt-8 pb-1 text-center">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Dragon Pixel Studio"
            width={300}
            height={64}
            className="h-12 w-auto opacity-95 md:h-14"
          />
        </Link>
        <SiteNav />
        <div className="mt-8 flex justify-center">
          <div className="dpx-kicker" data-tone="cyan">
            Shared report{createdLabel ? ` · ${createdLabel}` : ""}
          </div>
        </div>
      </header>

      <section className="mt-6 flex flex-col gap-4">
        {/* HERO - score + ship decision */}
        <div
          className="relative overflow-hidden rounded-2xl border p-7 md:p-9"
          style={{
            borderColor:
              c.decision.tone === "good"
                ? "rgba(105,255,0,.34)"
                : c.decision.tone === "bad"
                  ? "rgba(255,61,180,.34)"
                  : "rgba(255,194,61,.3)",
            background:
              "radial-gradient(600px 240px at 12% -20%,rgba(24,224,255,.12),transparent 60%),linear-gradient(160deg,rgba(15,19,34,.97),rgba(8,9,18,.97))",
          }}
        >
          <div className="dpx-kicker mb-5" data-tone="gold">
            {c.reviewModeLabel} review
          </div>
          <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
            <div
              className="font-score font-black leading-[.82]"
              style={{ fontSize: "clamp(72px,15vw,120px)", color: scoreColor(c.launchScore) }}
            >
              {c.launchScore}
              <span className="font-brand text-[26px] font-bold text-[var(--faint)]">/100</span>
            </div>
            <div className="pb-2">
              <div
                className="font-brand text-[clamp(24px,4.6vw,40px)] font-bold leading-[.95]"
                style={{ color: decisionTone }}
              >
                {c.decision.label}
              </div>
              {c.decision.sub && (
                <div className="mt-1.5 text-[14px] font-semibold text-[var(--muted)]">{c.decision.sub}</div>
              )}
              {c.potentialAfterFixes > c.launchScore && (
                <div className="font-brand mt-1.5 text-[13px] font-bold text-[var(--green)]">
                  up to {c.potentialAfterFixes}/100 if every fix lands
                </div>
              )}
            </div>
          </div>
          {c.summaryLine && (
            <p className="mt-5 max-w-2xl text-[16px] font-semibold leading-snug text-[var(--foreground)]">
              <span className="text-[11px] uppercase tracking-[.12em] text-[var(--faint)]">Reason </span>
              {c.summaryLine}
            </p>
          )}
        </div>

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

        {/* Conversion risk */}
        {c.conversionRisk && (
          <div
            className="rounded-2xl border border-[var(--edge)] p-6"
            style={{ background: "linear-gradient(160deg,#11182a,#070b14)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-brand text-[15px] font-black">Conversion risk</span>
              <span
                className="font-brand text-[15px] font-black"
                style={{ color: toneColor(c.storeImpact.tone) }}
              >
                {c.conversionRisk.assessed ? c.conversionRisk.level : "Partial read"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--faint)]">
                Click → convert
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-[var(--edge)] bg-black/40">
                <span
                  className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-sm bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]"
                  style={{ left: `${Math.max(2, Math.min(98, c.conversionRisk.position))}%` }}
                />
              </div>
            </div>
            {c.conversionRisk.reason && (
              <p className="mt-3 text-[14px] font-semibold leading-snug text-[var(--muted)]">
                {c.conversionRisk.reason}
              </p>
            )}
          </div>
        )}

        {/* Top fixes */}
        {c.topFixes.length > 0 && (
          <div
            className="rounded-2xl border-[1.5px] p-6"
            style={{
              borderColor: "rgba(105,255,0,.4)",
              background:
                "radial-gradient(600px 260px at 50% -20%,rgba(105,255,0,.08),transparent 60%),linear-gradient(160deg,rgba(18,22,18,.96),rgba(7,8,12,.96))",
            }}
          >
            <div className="font-brand text-[11px] font-bold uppercase tracking-[.2em] text-[var(--green)]">
              What to fix
            </div>
            <h2 className="font-brand mt-1 text-[22px] font-semibold">
              Top {c.topFixes.length} action{c.topFixes.length === 1 ? "" : "s"}
            </h2>
            <p className="mb-5 mt-1.5 text-sm font-semibold text-[var(--muted)]">
              Ranked by impact - start at the top.
            </p>
            <div className="flex flex-col gap-3">
              {c.topFixes.map((fix, i) => (
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
          </div>
        )}

        {/* Score breakdown */}
        <ReportCard title="Score breakdown · weakest first">
          <ScoreBars report={report} />
        </ReportCard>

        {/* CTA - the growth loop */}
        <div
          className="rounded-2xl border border-[rgba(24,224,255,.34)] p-7 text-center"
          style={{
            background:
              "radial-gradient(600px 260px at 50% -20%,rgba(24,224,255,.1),transparent 60%),linear-gradient(160deg,rgba(15,22,42,.96),rgba(8,9,18,.96))",
          }}
        >
          <h2 className="font-brand text-[22px] font-semibold">
            How would your store assets score?
          </h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm font-semibold text-[var(--muted)]">
            Upload your icon, screenshots, or Steam capsule and get the same scored
            conversion readout in seconds. Free.
          </p>
          <Link
            href="/"
            className="font-brand mt-5 inline-flex min-h-[52px] items-center justify-center rounded-2xl px-8 text-sm font-semibold text-[#05121a] transition hover:-translate-y-0.5 hover:brightness-110"
            style={{
              background: "linear-gradient(120deg,var(--cyan),var(--magenta))",
              boxShadow: "0 0 28px rgba(24,224,255,.24),0 16px 44px rgba(255,61,180,.14)",
            }}
          >
            Analyze my assets
          </Link>
        </div>
      </section>
    </main>
  );
}
