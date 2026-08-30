import { readFunnel } from "@/lib/funnel";

export const dynamic = "force-dynamic";

// Private funnel dashboard for the Option-3 experiment. Gated by the existing
// DEV_UNLIMITED_KEY: visit /funnel?key=<that value>. Not linked anywhere.

type Search = Promise<{ key?: string }>;

const EVENT_LABELS: Record<string, string> = {
  upload: "Uploaded an asset",
  analyze_start: "Pressed Analyze",
  analyze_success: "Got a report",
  share_open: "Opened a shared report",
  loop_return: "Analyzed after a shared report (viral loop)",
  share_copy: "Copied a share link",
  generate_click: "Started a paid generation",
};

// Ordered funnel: each step's rate is measured against the step above it.
const FUNNEL_ORDER = ["upload", "analyze_start", "analyze_success", "share_copy"] as const;

export default async function FunnelPage({ searchParams }: { searchParams: Search }) {
  const { key } = await searchParams;
  const expected = process.env.DEV_UNLIMITED_KEY;

  if (!expected || key !== expected) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-brand text-2xl font-bold text-[var(--foreground)]">Private</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Append <code>?key=…</code> to view the funnel.
        </p>
      </main>
    );
  }

  const { days, counts, totals } = await readFunnel(14);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return (
    <main className="mx-auto w-[min(1000px,calc(100%-40px))] py-12">
      <h1 className="font-brand text-[28px] font-bold text-[var(--foreground)]">
        Experiment funnel
      </h1>
      <p className="mt-1 text-[13px] font-semibold text-[var(--muted)]">
        Last 14 days · updates live · not linked anywhere public
      </p>

      {/* headline funnel */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FUNNEL_ORDER.map((event, i) => {
          const value = totals[event] ?? 0;
          const prev = i === 0 ? value : totals[FUNNEL_ORDER[i - 1]] ?? 0;
          return (
            <div
              key={event}
              className="rounded-2xl border border-[var(--edge)] p-4"
              style={{ background: "linear-gradient(160deg,#11182a,#070b14)" }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
                {EVENT_LABELS[event]}
              </div>
              <div className="font-score mt-1 text-[30px] font-black text-[var(--cyan)]">
                {value}
              </div>
              {i > 0 && (
                <div className="text-[11px] font-bold text-[var(--muted)]">
                  {pct(value, prev)}% of previous step
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* the two numbers that decide the experiment */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(105,255,0,.28)] bg-[rgba(105,255,0,.05)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--green)]">
            Activation · upload → report
          </div>
          <div className="font-score mt-1 text-[30px] font-black text-[var(--green)]">
            {pct(totals.analyze_success ?? 0, totals.upload ?? 0)}%
          </div>
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Share of people who upload that finish a report.
          </div>
        </div>
        <div className="rounded-2xl border border-[rgba(24,224,255,.28)] bg-[rgba(24,224,255,.05)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--cyan)]">
            Viral loop · shared views → new analyses
          </div>
          <div className="font-score mt-1 text-[30px] font-black text-[var(--cyan)]">
            {pct(totals.loop_return ?? 0, totals.share_open ?? 0)}%
          </div>
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Share of shared-report viewers who then analyze their own.
          </div>
        </div>
      </div>

      {/* daily raw table */}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--edge)]">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--edge)] bg-black/30">
              <th className="px-3 py-2 font-bold uppercase tracking-[.1em] text-[var(--faint)]">Day</th>
              {Object.keys(EVENT_LABELS).map((event) => (
                <th key={event} className="px-3 py-2 text-right font-bold text-[var(--faint)]">
                  {event.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day} className="border-b border-[var(--edge)]/60">
                <td className="px-3 py-2 font-semibold text-[var(--muted)]">{day.slice(5)}</td>
                {Object.keys(EVENT_LABELS).map((event) => (
                  <td key={event} className="px-3 py-2 text-right font-semibold text-[var(--foreground)]">
                    {counts[day]?.[event] || "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
