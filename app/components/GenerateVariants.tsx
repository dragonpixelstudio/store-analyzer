"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type FixAssetType = "icon" | "screenshot" | "capsule" | "feature-graphic";
type FixPlatform = "steam" | "google-play" | "app-store";

export type GenerateSource = {
  id: string;
  label: string;
  url: string; // object URL of the uploaded file
  file: File;
  assetType: FixAssetType;
};

type Variant = {
  base64: string;
  mimeType: string;
  /** Re-scored with the same engine as the original launch score. */
  score?: number;
  scoreSummary?: string;
  /** False when the variant scored below the original and was refunded. */
  charged?: boolean;
};

type Props = {
  sources: GenerateSource[];
  platform: FixPlatform;
  revisionBrief: string;
  /** Analyzer launch score; steers the designer pass (refine vs recompose). */
  assetScore?: number;
};

const VARIANTS_PER_RUN = 2;

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mimeType: file.type || "image/png" };
}

export default function GenerateVariants({ sources, platform, revisionBrief, assetScore }: Props) {
  const [selectedId, setSelectedId] = useState<string>(sources[0]?.id ?? "");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [instruction, setInstruction] = useState("");

  const selected = useMemo(
    () => sources.find((s) => s.id === selectedId) ?? sources[0],
    [sources, selectedId]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fix")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d?.credits?.remaining === "number") {
          setRemaining(d.credits.remaining);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setVariants([]);
    try {
      const { base64, mimeType } = await fileToBase64(selected.file);
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: selected.assetType,
          platform,
          imageBase64: base64,
          mimeType,
          analysisNotes: revisionBrief,
          userInstruction: instruction.trim() || undefined,
          variants: VARIANTS_PER_RUN,
          assetScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed. Nothing was charged.");
        if (typeof data?.credits?.remaining === "number") {
          setRemaining(data.credits.remaining);
        }
        return;
      }
      setVariants(data.variants ?? []);
      if (typeof data?.credits?.remaining === "number") {
        setRemaining(data.credits.remaining);
      }
    } catch {
      setError("Generation failed. Nothing was charged. Please retry.");
    } finally {
      setBusy(false);
    }
  }, [selected, platform, revisionBrief, instruction, assetScore]);

  const download = useCallback(
    (variant: Variant, index: number) => {
      const link = document.createElement("a");
      link.href = `data:${variant.mimeType};base64,${variant.base64}`;
      link.download = `${selected?.assetType ?? "asset"}-improved-${index + 1}.png`;
      link.click();
    },
    [selected]
  );

  if (sources.length === 0) return null;

  const insufficientCredits = remaining !== null && remaining < VARIANTS_PER_RUN;

  const costLine =
    remaining === null
      ? `Uses ${VARIANTS_PER_RUN} credits`
      : `Uses ${VARIANTS_PER_RUN} credits · ${remaining} available now`;

  return (
    <div className="mt-4 rounded-xl border border-[var(--edge)] bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {sources.length > 1 && (
          <select
            value={selected?.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-[var(--edge)] bg-black/30 px-3 py-2 text-[13px] font-semibold text-[var(--foreground)]"
            aria-label="Asset to improve"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            if (busy || !selected || insufficientCredits) return;
            void run();
          }}
          disabled={busy || !selected || insufficientCredits}
          aria-busy={busy}
          data-busy={busy ? "true" : "false"}
          className="dpx-generate-button rounded-xl px-7 py-3.5 text-[15.5px] font-black transition disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2">
            {busy && <span className="dpx-mini-spinner" aria-hidden="true" />}
            {busy ? "Generating variants" : "Generate improved versions"}
          </span>
        </button>
        <span className="text-[12px] font-semibold text-[var(--faint)]">{costLine}</span>
        {insufficientCredits && (
          <span className="flex items-center gap-2.5">
            <span className="text-[12px] font-semibold text-[var(--magenta)]">
              Not enough credits.
            </span>
            <a
              href="/pricing"
              className="rounded-full px-4 py-2 text-[12px] font-black text-[#1a1205] transition hover:-translate-y-0.5 hover:brightness-110"
              style={{ background: "linear-gradient(120deg,var(--gold),#ff8a3d)" }}
            >
              Get credits
            </a>
          </span>
        )}
      </div>

      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        maxLength={200}
        placeholder="Optional steer, e.g. keep the purple palette"
        className="mt-3 w-full rounded-lg border border-[var(--edge)] bg-black/30 px-3 py-2 text-[13px] font-semibold text-[var(--foreground)] placeholder:text-[var(--faint)]"
      />

      <p className="mt-2 text-[12px] font-semibold text-[var(--faint)]">
        Both variants apply your top 3 ranked fixes in priority order. The Precision fix is a deterministic crop and clarity pass with no AI reinterpretation. The Designer pass acts like a senior game artist: refining if the asset already works, recomposing boldly within the same concept if the shelf read is weak. Every result is re-scored by the same engine that scored your original - and if a variant scores below your original, it&apos;s free. Works on your game&apos;s own art; people and faces are out of scope.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-300">
          {error}
        </p>
      )}

      {variants.length > 0 && selected && (() => {
        const hasBaseline = typeof assetScore === "number";
        const titles = variants.map((_, i) =>
          i === 0 ? "Precision fix" : i === 1 ? "Designer pass" : `Variant ${i + 1}`
        );
        const blurbs = variants.map((_, i) =>
          i === 0
            ? "Deterministic crop and clarity pass. No AI reinterpretation."
            : i === 1
              ? "Senior-artist pass on the same concept."
              : "Alternative take."
        );
        const deltas = variants.map((v) =>
          typeof v.score === "number" && hasBaseline
            ? v.score - (assetScore as number)
            : null
        );
        const deltaColor = (delta: number | null) =>
          delta === null
            ? "var(--faint)"
            : delta > 0
              ? "var(--green)"
              : delta < 0
                ? "var(--magenta)"
                : "var(--gold)";
        // Highest re-scored variant is the recommended pick.
        let bestIndex = -1;
        variants.forEach((v, i) => {
          if (typeof v.score !== "number") return;
          if (bestIndex === -1 || (v.score ?? 0) > (variants[bestIndex].score ?? 0)) {
            bestIndex = i;
          }
        });
        const bestDelta = bestIndex >= 0 ? deltas[bestIndex] : null;
        const refundedCount = variants.filter((v) => v.charged === false).length;

        return (
          <div className="mt-6">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
              Before / after
            </div>
            {/* one honest line instead of a table: the verdict of the run */}
            <p className="mb-4 text-[13px] font-semibold text-[var(--faint)]">
              {bestDelta !== null && bestDelta > 0
                ? `Best result: ${titles[bestIndex]} at ${variants[bestIndex].score}/100 (+${bestDelta} vs your original).`
                : refundedCount > 0
                  ? `No variant beat your original this run - ${refundedCount === variants.length ? "nothing was charged" : `${refundedCount} credit${refundedCount > 1 ? "s" : ""} refunded`}. Try a steer below and regenerate.`
                  : "Each version is re-scored by the same engine that scored your original."}
            </p>

            {/* side-by-side: original first, improved versions after; all
                three stay on one row above mobile so no card is orphaned */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <figure className="overflow-hidden rounded-xl border border-[var(--edge)] bg-black/20">
                <div className="flex min-h-[38px] items-center justify-between px-3 pt-2.5">
                  <span className="text-[12px] font-black uppercase tracking-[.06em] text-[var(--faint)]">
                    Before · your original
                  </span>
                  {hasBaseline && (
                    <span className="font-brand text-[13px] font-black text-[var(--muted)]">
                      {assetScore}<span className="text-[10px] text-[var(--faint)]">/100</span>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview */}
                  <img
                    src={selected.url}
                    alt="Original asset"
                    className="w-full opacity-90"
                  />
                </div>
                <figcaption className="px-3 py-2 text-[11.5px] font-semibold text-[var(--faint)]">
                  Reference. Compare each improved version against this.
                </figcaption>
              </figure>

              {variants.map((v, i) => {
                const isBest = i === bestIndex && deltas[i] !== null && (deltas[i] as number) > 0;
                const notCharged = v.charged === false;
                return (
                  <figure
                    key={i}
                    className="group overflow-hidden rounded-xl bg-black/30 transition"
                    style={{
                      border: isBest
                        ? "1.5px solid rgba(105,255,0,.5)"
                        : "1px solid var(--edge)",
                      boxShadow: isBest ? "0 14px 40px -24px rgba(105,255,0,.5)" : undefined,
                    }}
                  >
                    <div className="flex min-h-[38px] items-center justify-between gap-2 px-3 pt-2.5">
                      <span className="truncate text-[12px] font-black uppercase tracking-[.06em] text-[var(--cyan)]">
                        After · {titles[i]}
                      </span>
                      {typeof v.score === "number" && (
                        <span className="font-brand flex-none whitespace-nowrap text-[13px] font-black" style={{ color: deltaColor(deltas[i]) === "var(--faint)" ? "var(--cyan)" : deltaColor(deltas[i]) }}>
                          {v.score}<span className="text-[10px] text-[var(--faint)]">/100</span>
                          {deltas[i] !== null && deltas[i] !== 0 && (
                            <span className="ml-1">({(deltas[i] as number) > 0 ? "+" : ""}{deltas[i]})</span>
                          )}
                        </span>
                      )}
                    </div>
                    {notCharged && (
                      <div className="mx-3 mt-2 rounded-lg border border-[rgba(255,194,61,.32)] bg-[rgba(255,194,61,.07)] px-3 py-1.5 text-[11px] font-bold text-[#e8cf9a]">
                        Scored below your original - this one&apos;s free, credit refunded.
                      </div>
                    )}
                    <div className="relative mt-2 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- base64 AI output rendered inline */}
                      <img
                        src={`data:${v.mimeType};base64,${v.base64}`}
                        alt={`${titles[i]} of your asset`}
                        className="w-full transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      {isBest && (
                        <span className="absolute left-2 top-2 rounded-full border border-[rgba(105,255,0,.5)] bg-[#0c1606]/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.08em] text-[var(--green)] shadow-[0_2px_10px_rgba(0,0,0,.5)]">
                          ★ Top pick
                        </span>
                      )}
                    </div>
                    <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-[11.5px] font-semibold text-[var(--faint)]">{blurbs[i]}</span>
                      <button
                        type="button"
                        onClick={() => download(v, i)}
                        className="inline-flex flex-none items-center gap-1 rounded-full border border-[rgba(24,224,255,.34)] bg-[rgba(24,224,255,.08)] px-3 py-1.5 text-[11px] font-bold text-[var(--cyan)] transition hover:border-[rgba(24,224,255,.56)] hover:bg-[rgba(24,224,255,.14)]"
                      >
                        <span aria-hidden="true">↓</span>
                        Download
                      </button>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
