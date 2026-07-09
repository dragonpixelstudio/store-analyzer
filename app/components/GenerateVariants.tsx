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

type Variant = { base64: string; mimeType: string };

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
          <span className="text-[12px] font-semibold text-[var(--magenta)]">
            Not enough credits for this generation.
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
        Both variants apply your top 3 ranked fixes in priority order. The Precision fix makes exact algorithmic corrections, guaranteed visible. The Designer pass acts like a senior game artist: refining if the asset already works, recomposing boldly within the same concept if the shelf read is weak. You are only charged for delivered images. Works on your game&apos;s own art; people and faces are out of scope.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-300">
          {error}
        </p>
      )}

      {variants.length > 0 && selected && (
        <div className="mt-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(180px,260px)_1fr] lg:items-start">
            {/* Reference original: small, for side-by-side checking */}
            <figure className="lg:sticky lg:top-4">
              <div className="mb-1.5 text-[10.5px] font-black uppercase tracking-[.12em] text-[var(--faint)]">
                Your original
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview */}
              <img
                src={selected.url}
                alt="Original asset"
                className="w-full rounded-lg border border-[var(--edge)] opacity-90"
              />
              <figcaption className="mt-1.5 text-[11px] font-semibold text-[var(--faint)]">
                Reference. Compare the improved versions against this.
              </figcaption>
            </figure>

            {/* Improved outputs: larger, the focus of the card */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {variants.map((v, i) => {
                const title = i === 0 ? "Precision fix" : i === 1 ? "Designer pass" : `Variant ${i + 1}`;
                const blurb =
                  i === 0
                    ? "Exact algorithmic corrections, guaranteed visible."
                    : i === 1
                      ? "Senior-artist pass on the same concept."
                      : "Alternative take.";
                return (
                  <figure
                    key={i}
                    className="group overflow-hidden rounded-xl border border-[var(--edge)] bg-black/30 transition hover:border-[rgba(24,224,255,.42)]"
                  >
                    <div className="flex items-center justify-between px-3 pt-2.5">
                      <span className="text-[12px] font-black uppercase tracking-[.06em] text-[var(--cyan)]">
                        {title}
                      </span>
                      <button
                        type="button"
                        onClick={() => download(v, i)}
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(24,224,255,.34)] bg-[rgba(24,224,255,.08)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--cyan)] transition hover:border-[rgba(24,224,255,.56)] hover:bg-[rgba(24,224,255,.14)]"
                      >
                        <span aria-hidden="true">↓</span>
                        Download
                      </button>
                    </div>
                    <div className="mt-2 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- base64 AI output rendered inline */}
                      <img
                        src={`data:${v.mimeType};base64,${v.base64}`}
                        alt={`${title} of your asset`}
                        className="w-full transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    <figcaption className="px-3 py-2 text-[11.5px] font-semibold text-[var(--faint)]">
                      {blurb}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
