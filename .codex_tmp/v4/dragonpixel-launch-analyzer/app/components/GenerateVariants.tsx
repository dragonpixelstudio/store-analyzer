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

export default function GenerateVariants({ sources, platform, revisionBrief }: Props) {
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
  }, [selected, platform, revisionBrief, instruction]);

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

  const costLine =
    remaining === null
      ? `Cost: ${VARIANTS_PER_RUN} credits`
      : `Cost: ${VARIANTS_PER_RUN} credits · ${remaining} remaining`;

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
          onClick={run}
          disabled={busy || !selected}
          className="rounded-lg bg-[var(--cyan)] px-4 py-2 text-[13px] font-bold text-black transition disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate improved versions"}
        </button>
        <span className="text-[12px] font-semibold text-[var(--faint)]">{costLine}</span>
      </div>

      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        maxLength={200}
        placeholder="Optional steer, e.g. keep the purple palette"
        className="mt-3 w-full rounded-lg border border-[var(--edge)] bg-black/30 px-3 py-2 text-[13px] font-semibold text-[var(--foreground)] placeholder:text-[var(--faint)]"
      />

      <p className="mt-2 text-[12px] font-semibold text-[var(--faint)]">
        Each variant applies the revision brief above as mandatory edits: Variant 1 is a faithful pass, Variant 2 pushes the changes harder. You are only charged for images that are delivered. Works on your game&apos;s own art; people and faces are out of scope.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-300">
          {error}
        </p>
      )}

      {variants.length > 0 && selected && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, not an optimizable remote asset */}
              <img
                src={selected.url}
                alt="Original asset"
                className="w-full rounded-lg border border-[var(--edge)]"
              />
              <figcaption className="mt-1 text-center text-[11px] font-semibold text-[var(--faint)]">
                Original
              </figcaption>
            </figure>
            {variants.map((v, i) => (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element -- base64 AI output rendered inline */}
                <img
                  src={`data:${v.mimeType};base64,${v.base64}`}
                  alt={`Improved variant ${i + 1}`}
                  className="w-full rounded-lg border border-[var(--edge)]"
                />
                <figcaption className="mt-1 flex items-center justify-center gap-2 text-[11px] font-semibold text-[var(--faint)]">
                  Variant {i + 1}
                  <button
                    onClick={() => download(v, i)}
                    className="rounded border border-[var(--edge)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--cyan)] transition hover:bg-white/5"
                  >
                    Download
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
