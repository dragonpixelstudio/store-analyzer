import type { BenchmarkReferenceRole } from "@/lib/benchmarkCatalog";

export type BenchmarkReference = {
  id: string;
  title: string;
  platform: string;
  assetKind: "icon" | "screenshot";
  sourceUrl: string;
  thumb: string;
  pattern: string;
  visiblePrinciple: string;
  matchedGenres?: string[];
  role?: BenchmarkReferenceRole;
};

export type BenchmarkEvidence = {
  platform: string;
  assetKind: "icon" | "screenshot";
  genre: {
    primary: string;
    secondary: string[];
    confidence: string;
    visibleSignals: string[];
    selectionSource: "inferred" | "user-confirmed";
  };
  measurementConfidence?: string;
  measurements?: Array<{
    sizePx: number;
    activePixelCoveragePct: number;
    activeBoundsCoveragePct: number;
    edgeDensityPct: number;
  }>;
  smallSizeRetentionPct?: number;
  references: BenchmarkReference[];
  referenceFetch?: {
    requested: number;
    resolved: number;
    failed: number;
    status: "complete" | "partial" | "unavailable";
    failures: Array<{
      id: string;
      title: string;
      platform: string;
      reason: string;
    }>;
  };
  comparison?: {
    attemptedPattern?: string;
    nearestReferenceIds: string[];
    sharedPrinciples: string[];
    importantDifferences: string[];
    measuredFacts: string[];
    visualObservations: string[];
    inferences: string[];
    recommendation?: string;
    cropOnlyEnough?: boolean;
    confidence?: string;
  };
  caveats: string[];
};

export function referenceRoleLabel(role?: BenchmarkReferenceRole) {
  if (role === "closest-mechanic") return "Closest mechanic";
  if (role === "closest-icon-structure") return "Closest icon structure";
  return "Adjacent shelf competitor";
}

function ReportCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

function ReferenceFetchState({
  evidence,
}: {
  evidence: BenchmarkEvidence;
}) {
  const fetch = evidence.referenceFetch || {
    requested: evidence.references.length,
    resolved: evidence.references.length,
    failed: 0,
    status: evidence.references.length > 0 ? ("complete" as const) : ("unavailable" as const),
    failures: [],
  };
  if (fetch.status === "complete") {
    return (
      <div className="mb-4 rounded-xl border border-[rgba(105,255,0,.2)] bg-[rgba(105,255,0,.035)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)]">
        <span className="font-bold text-[var(--green)]">
          Reference set complete
        </span>{" "}
        · {fetch.resolved}/{fetch.requested} published assets resolved
      </div>
    );
  }

  const unavailable = fetch.status === "unavailable";
  return (
    <div
      className={`mb-4 rounded-xl border px-3 py-2 ${
        unavailable
          ? "border-[rgba(255,61,180,.32)] bg-[rgba(255,61,180,.06)]"
          : "border-[rgba(255,194,61,.3)] bg-[rgba(255,194,61,.05)]"
      }`}
      role="status"
    >
      <div
        className={`text-[11px] font-bold ${
          unavailable ? "text-[var(--magenta)]" : "text-[var(--gold)]"
        }`}
      >
        {unavailable
          ? "Published references unavailable"
          : "Partial reference set"}
      </div>
      <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
        {unavailable
          ? "No suitable published asset resolved. Visual benchmark claims are omitted; deterministic upload measurements remain."
          : `${fetch.resolved}/${fetch.requested} selected assets resolved. The comparison uses only those available references.`}
      </p>
    </div>
  );
}

export default function BenchmarkDossier({
  evidence,
}: {
  evidence: BenchmarkEvidence;
}) {
  const comparison = evidence.comparison;
  const measurement32 = evidence.measurements?.find(
    (item) => item.sizePx === 32
  );
  const nearestIds = new Set(comparison?.nearestReferenceIds ?? []);
  const orderedReferences = [...evidence.references].sort(
    (a, b) => Number(nearestIds.has(b.id)) - Number(nearestIds.has(a.id))
  );

  return (
    <ReportCard
      title={`${
        evidence.assetKind === "icon" ? "Icon" : "Screenshot"
      } evidence benchmark`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[rgba(24,224,255,.35)] bg-[rgba(24,224,255,.08)] px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--cyan)]">
          {evidence.platform}
        </span>
        <span className="rounded-full border border-[var(--edge)] bg-white/[.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">
          {evidence.genre.primary}
          {evidence.genre.secondary.length
            ? ` · ${evidence.genre.secondary.join(" · ")}`
            : ""}
        </span>
        <span className="rounded-full border border-[var(--edge)] bg-white/[.02] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[var(--faint)]">
          {evidence.genre.selectionSource === "user-confirmed"
            ? "User confirmed"
            : `Inferred · ${evidence.genre.confidence}`}
        </span>
      </div>

      <ReferenceFetchState evidence={evidence} />

      {evidence.assetKind === "icon" && measurement32 && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--edge)] bg-black/25 p-3">
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
              32px mask coverage
            </div>
            <div className="font-score mt-1 text-[24px] font-black text-[var(--cyan)]">
              {measurement32.activePixelCoveragePct}%
            </div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">
              {evidence.measurementConfidence === "measured"
                ? "measured from alpha"
                : "background-contrast estimate"}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--edge)] bg-black/25 p-3">
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
              Active bounds
            </div>
            <div className="font-score mt-1 text-[24px] font-black text-[var(--cyan)]">
              {measurement32.activeBoundsCoveragePct}%
            </div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">
              occupied square, not face share
            </div>
          </div>
          <div className="rounded-xl border border-[var(--edge)] bg-black/25 p-3">
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
              Downsample occupancy
            </div>
            <div className="font-score mt-1 text-[24px] font-black text-[var(--cyan)]">
              {evidence.smallSizeRetentionPct ?? 0}%
            </div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">
              32px mask ÷ 184px mask; not a clarity score
            </div>
          </div>
        </div>
      )}

      {orderedReferences.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--muted)]">
            Genre-matched published references
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {orderedReferences.map((reference) => (
              <a
                key={reference.id}
                href={reference.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-[var(--edge)] bg-white/[.025] p-3 transition hover:-translate-y-0.5 hover:border-[rgba(24,224,255,.5)]"
              >
                {reference.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element -- benchmark thumbnail is a stored data URL or controlled fixture URL
                  <img
                    src={reference.thumb}
                    alt={`${reference.title} published ${reference.assetKind}`}
                    className={`mx-auto border border-white/10 bg-black object-contain ${
                      reference.assetKind === "icon"
                        ? "h-16 w-16 rounded-xl"
                        : "h-24 w-full rounded-lg"
                    }`}
                  />
                )}
                <div className="mt-2 text-[13px] font-bold text-[var(--foreground)]">
                  {reference.title}
                </div>
                <div className="mt-1 inline-flex rounded-full border border-[rgba(255,194,61,.25)] bg-[rgba(255,194,61,.055)] px-2 py-0.5 text-[8px] font-black uppercase tracking-[.1em] text-[var(--gold)]">
                  {referenceRoleLabel(reference.role)}
                </div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--cyan)]">
                  {reference.platform} · {reference.pattern}
                </div>
                {(reference.matchedGenres?.length ?? 0) > 0 && (
                  <div className="mt-1 text-[9px] font-semibold text-[var(--faint)]">
                    Matches {reference.matchedGenres?.join(" · ")}
                  </div>
                )}
                <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-[var(--muted)]">
                  {reference.visiblePrinciple}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {comparison && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[rgba(105,255,0,.25)] bg-[rgba(105,255,0,.035)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--green)]">
              Observed
            </div>
            {(comparison.visualObservations.length
              ? comparison.visualObservations
              : comparison.sharedPrinciples
            ).map((item) => (
              <p
                key={item}
                className="mt-2 text-[12.5px] font-semibold leading-snug text-[var(--muted)]"
              >
                {item}
              </p>
            ))}
          </div>
          <div className="rounded-xl border border-[rgba(255,194,61,.25)] bg-[rgba(255,194,61,.035)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--gold)]">
              Inferred, not proven
            </div>
            {comparison.inferences.map((item) => (
              <p
                key={item}
                className="mt-2 text-[12.5px] font-semibold leading-snug text-[var(--muted)]"
              >
                {item}
              </p>
            ))}
          </div>
          <div className="rounded-xl border border-[rgba(255,61,180,.28)] bg-[rgba(255,61,180,.04)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--magenta)]">
              Production call
            </div>
            <p className="mt-2 text-[13px] font-semibold leading-snug text-[var(--foreground)]">
              {comparison.recommendation ||
                "Use the nearest reference principle, not its artwork."}
            </p>
            {comparison.cropOnlyEnough === false && (
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[.1em] text-[var(--gold)]">
                Purpose-built composition required; crop alone is insufficient
              </p>
            )}
          </div>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-dashed border-[var(--edge)] bg-black/20 px-4 py-3">
        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
          Evidence limits
        </summary>
        {evidence.caveats.map((caveat) => (
          <p
            key={caveat}
            className="mt-2 text-[11.5px] font-semibold leading-snug text-[var(--muted)]"
          >
            {caveat}
          </p>
        ))}
      </details>
    </ReportCard>
  );
}
