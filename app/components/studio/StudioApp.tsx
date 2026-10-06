"use client";
/* eslint-disable @next/next/no-img-element -- generated data URLs and local object URLs throughout */

import { artworkRequest } from "@/lib/artworkRequest";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StudioHeader from "@/app/components/StudioHeader";
import { saveHandoff, readHandoff, clearHandoff } from "@/lib/studioHandoff";
import { SquaresFour, Monitor, ImageSquare, Camera, UploadSimple, Sparkle, PencilSimple, Download, CircleNotch, ChartBar, ArrowClockwise } from "@phosphor-icons/react";
import AssetExporter from "./AssetExporter";
import dynamic from "next/dynamic";
import type { EditorSource, EditorSave } from "./ArtworkEditor";
const ArtworkEditor = dynamic(() => import("./ArtworkEditor"), { ssr: false });
import LayeredGallery from "./LayeredGallery";
import { layeredArtwork, type LayeredTemplate } from "@/lib/layeredTemplates";
import { makeArtwork, newText, type ArtworkDocument } from "@/lib/artworkDocument";
import { importArtworkFile, renderArtwork } from "./renderArtwork";
import { readStudioHistory, writeStudioHistory } from "@/lib/studioHistory";
import { STUDIO_FORMATS, studioFormat } from "@/lib/studioFormats";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { track } from "@/app/track";
import { ScoreRing } from "@/app/components/reportFx";
import StudioGallery from "@/app/components/studio/StudioGallery";
import {
  brandFontFamily,
  composeScreenshot,
  loadImage,
} from "@/app/components/studio/composeScreenshot";
import {
  EDIT_CHIPS,
  galleryImagePath,
  SCREENSHOT_TEMPLATES,
  SHOT_DEMO_CAPTURES,
  SHOT_PALETTES,
  SHOT_SIZES,
  STUDIO_RECIPES,
  STUDIO_STYLES,
  type ScreenshotTemplate,
  type StudioAiType,
  type StudioAssetType,
  type StudioRecipe,
  type StudioStyleId,
} from "@/lib/studio";

/* ---------------------------------- types --------------------------------- */

type Score = {
  demo?: boolean;
  launchScore: number;
  potential: number;
  decisionLabel: string;
  decisionTone: "good" | "warn" | "bad";
  summaryLine: string;
  topFix: string;
  reportId?: string;
};

type StudioResult = {
  id: string;
  type: StudioAssetType;
  document?: ArtworkDocument;
  formatId?: string;
  base64: string;
  dataUrl: string;
  width: number;
  height: number;
  gameName: string;
  reviewContext?: string;
  label: string;
  example?: boolean;
  score?: Score;
  scoring?: boolean;
  scoreError?: string;
};

type Capture = { url: string; img: HTMLImageElement; name: string; isDemo: boolean };

const STORAGE_KEY = "dpx-studio-game";

/* --------------------------------- helpers -------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Downscale an image file and re-encode as WebP (keeps alpha, small upload). */
async function fileToWebp(file: File, maxEdge = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.92);
    return { base64: dataUrl.split(",")[1] ?? "", mimeType: dataUrl.slice(5, dataUrl.indexOf(";")), previewUrl: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function dataUrlToWebpBase64(dataUrl: string) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  return canvas.toDataURL("image/webp", 0.95).split(",")[1] ?? "";
}

function base64ToFile(base64: string, mime: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "game"
  );
}

function downloadHref(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

function parseScore(data: unknown): Score | { error: string } {
  if (!isRecord(data)) return { error: "Unexpected response." };
  if (typeof data.error === "string" && data.error) return { error: data.error };
  const c = isRecord(data.calculated) ? data.calculated : null;
  if (!c || typeof c.launchScore !== "number") return { error: "Unexpected response." };
  const decision = isRecord(c.decision) ? c.decision : {};
  const fixes = Array.isArray(c.topFixes) ? c.topFixes : [];
  const first = isRecord(fixes[0]) ? fixes[0] : {};
  return {
    demo: data.demo === true,
    launchScore: c.launchScore,
    potential: typeof c.potentialAfterFixes === "number" ? c.potentialAfterFixes : c.launchScore,
    decisionLabel: typeof decision.label === "string" ? decision.label : "",
    decisionTone: decision.tone === "good" || decision.tone === "bad" ? decision.tone : "warn",
    summaryLine: typeof c.summaryLine === "string" ? c.summaryLine : "",
    topFix: typeof first.action === "string" ? first.action : "",
    reportId: typeof data.reportId === "string" ? data.reportId : undefined,
  };
}

/** Score any image with the same analyzer engine as /analyze. */
async function scoreImage(file: File, kind: StudioAssetType, context = "") {
  const fd = new FormData();
  if (kind === "icon") {
    fd.append("icon", file);
  } else if (kind === "capsule" || kind === "thumbnail") {
    fd.append("creatives", file);
    fd.append("creativeKinds", kind === "thumbnail" ? "keyArt" : "steamCapsule");
    fd.append("platform", kind === "thumbnail" ? "unknown" : "steam");
  } else {
    fd.append("screenshots", file);
  }
  fd.append("gameContext", context.slice(0,2000));
  const res = await artworkRequest("/api/analyze", { method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  return parseScore(data);
}

const toneColor = (tone: "good" | "warn" | "bad") =>
  tone === "good" ? "var(--green)" : tone === "bad" ? "var(--magenta)" : "var(--gold)";

/* ------------------------------- small pieces ------------------------------ */

const MODE_TABS: { id: StudioAssetType; label: string; hint: string }[] = [
  { id: "icon", label: "Icon", hint: "AI · 1 credit" },
  { id: "capsule", label: "Steam capsule", hint: "AI · 1 credit" },
  { id: "thumbnail", label: "Thumbnail", hint: "AI · 1 credit" },
  { id: "screenshot", label: "Screenshot", hint: "Your gameplay · free" },
];

function ScoreBlock({ score }: { score: Score }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--edge)] bg-[var(--well)] p-4">
      <ScoreRing score={score.launchScore} potential={score.potential} size={96} />
      <div className="min-w-[200px] flex-1">
        <div className="font-brand text-[16px] font-black" style={{ color: toneColor(score.decisionTone) }}>
          {score.decisionLabel}
        </div>
        {score.demo && <p className="studio-notice">LOCAL SAMPLE REVIEW · Example feedback, not an AI assessment of this artwork.</p>}
        {score.summaryLine && (
          <p className="mt-1 text-[12.5px] font-semibold text-[var(--muted)]">{score.summaryLine}</p>
        )}
        {score.topFix && (
          <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--foreground)]">
            <span className="mr-1.5 text-[10px] font-black uppercase tracking-[.1em] text-[var(--green)]">
              Top fix
            </span>
            {score.topFix}
          </p>
        )}
        {score.reportId && (
          <a
            href={`/report/${score.reportId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[12px] font-bold text-[var(--cyan)] hover:underline"
          >
            Full report ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- main ---------------------------------- */

export default function StudioApp({ availableImages }: { availableImages: string[] }) {
  const router = useRouter();
  const createRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [toolPanel, setToolPanel] = useState<"" | "ai" | "export">("");
  const [editorSource, setEditorSource] = useState<(EditorSource & { type: StudioAssetType; formatId?: string }) | null>(null);
  const artworkInput = useRef<HTMLInputElement>(null);
  const selectionSequence = useRef(0);
  const editEntryOpened = useRef(false);
  const [opening, setOpening] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(-1);

  const [mode, setMode] = useState<StudioAssetType>("capsule");
  const [storageReady, setStorageReady] = useState(false);
  const [formatId, setFormatId] = useState("");
  const [gameName, setGameName] = useState("");
  const [gamePitch, setGamePitch] = useState("");
  const [styleId, setStyleId] = useState<StudioStyleId>("cinematic");
  const [recipeId, setRecipeId] = useState("");
  const [reference, setReference] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null);

  const [credits, setCredits] = useState<number | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [galleryNotice, setGalleryNotice] = useState("");
  const [busy, setBusy] = useState<"" | "create" | "edit">("");
  const [error, setError] = useState("");
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const analysisInFlight = useRef(false);
  const [needsGameInfo, setNeedsGameInfo] = useState(false);

  const [results, setResults] = useState<StudioResult[]>([]);
  const [activeId, setActiveId] = useState("");
  const [editText, setEditText] = useState("");

  // screenshot editor
  const [capture, setCapture] = useState<Capture | null>(null);
  const [templateId, setTemplateId] = useState(SCREENSHOT_TEMPLATES[0].id);
  const [sizeId, setSizeId] = useState(SHOT_SIZES.landscape[0].id);
  const [paletteId, setPaletteId] = useState(SHOT_PALETTES[0].id);
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [shotPreview, setShotPreview] = useState("");
  const [shotError, setShotError] = useState("");

  const active = results.find((r) => r.id === activeId) ?? null;
  const aiType: StudioAiType = mode === "screenshot" ? "icon" : mode;
  const outputFormat = studioFormat(aiType, formatId);
  const template = SCREENSHOT_TEMPLATES.find((t) => t.id === templateId) ?? SCREENSHOT_TEMPLATES[0];
  const sizes = SHOT_SIZES[template.orientation];
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0];
  const palette = SHOT_PALETTES.find((p) => p.id === paletteId) ?? SHOT_PALETTES[0];

  /* ------------------------------ lifecycle ------------------------------ */

  useEffect(() => {
    // Per-viewer convenience only: remember the game description.
    const id = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        if (typeof saved.name === "string" && saved.name !== "Hollowmere") setGameName(saved.name);
        if (typeof saved.pitch === "string" && !saved.pitch.includes("where light reveals secrets and something ancient stirs")) setGamePitch(saved.pitch);
      } catch {
        // storage unavailable or empty
      } finally {
        setStorageReady(true);
      }
    }, 0);
    const refreshCredits = () => { void fetch("/api/account/status", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("Balance unavailable"); return r.json(); })
      .then((d) => {
        if (typeof d?.credits?.remaining === "number") { setCredits(d.credits.remaining); setCreditError(false); }
      })
      .catch(() => setCreditError(true)); };
    refreshCredits();
    window.addEventListener("dpx-wallet-changed", refreshCredits);
    return () => { clearTimeout(id); window.removeEventListener("dpx-wallet-changed", refreshCredits); };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: gameName, pitch: gamePitch }));
    } catch {
      // storage unavailable
    }
  }, [gameName, gamePitch, storageReady]);

  useEffect(() => () => {
    if (capture?.url.startsWith("blob:")) URL.revokeObjectURL(capture.url);
  }, [capture]);

  // Live screenshot preview (debounced, preview-sized for snappy typing).
  useEffect(() => {
    if (!capture) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const family = await brandFontFamily();
        const scale = Math.min(1, 960 / Math.max(size.width, size.height));
        const canvas = composeScreenshot({
          capture: capture.img,
          template,
          size: { ...size, width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
          palette,
          headline: headline.trim() || "Your headline here",
          subline: subline.trim() || undefined,
          fontFamily: family,
        });
        if (!cancelled) {
          setShotPreview(canvas.toDataURL("image/webp", 0.9));
        }
      } catch {
        if (!cancelled) setShotError("Couldn't render that capture - try a PNG or JPEG.");
      }
    }, 140);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [capture, template, size, palette, headline, subline]);

  useEffect(() => {
    let cancelled = false;
    void readStudioHistory<StudioResult>().then(saved => { if (!cancelled && saved.length) { setResults(saved); setActiveId(saved[0].id); setMode(saved[0].type); setFormatId(saved[0].formatId || ""); } }).catch(() => undefined).finally(() => { if (!cancelled) setHistoryReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (historyReady) void writeStudioHistory(results.filter(result => !result.example).map(result => ({ ...result, scoring: false }))).catch(() => setGalleryNotice("Your browser could not save recent artwork. Download images you want to keep."));
  }, [results, historyReady]);
  useEffect(() => {
    if (!historyReady || !storageReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const transfer = readHandoff("studio"); if (!transfer) return;
      try {
        const img = await loadImage(transfer.dataUrl); if (cancelled) return;
        setGameName(transfer.gameName); setGamePitch(transfer.gamePitch);
        if (transfer.role === "screenshot") {
          setMode("screenshot"); setActiveId(""); setCapture({ url: transfer.dataUrl, img, name: transfer.name, isDemo: false });
          if (transfer.platform === "steam") setSizeId("steam-1080");
          setGalleryNotice("Your real gameplay is ready to frame. Screenshot layouts and exports are free.");
        } else {
          const type: StudioAiType = transfer.role === "icon" ? "icon" : "capsule";
          const options = STUDIO_FORMATS.filter(f => f.type === type);
          const format = options.find(f => f.id === transfer.formatId) || options.find(f => type === "icon" && transfer.platform === "google-play" && f.id === "play-icon") || options.find(f => f.width === transfer.width && f.height === transfer.height) || [...options].sort((a,b) => Math.abs(a.width/a.height - transfer.width/transfer.height) - Math.abs(b.width/b.height - transfer.width/transfer.height))[0];
          const id = crypto.randomUUID();
          setMode(type); setFormatId(format.id);
          setResults(prev => [{ id, type, formatId: format.id, dataUrl: transfer.dataUrl, base64: transfer.dataUrl.split(",")[1], width: img.width, height: img.height, gameName: transfer.gameName, reviewContext: [transfer.gameName, transfer.gamePitch].filter(Boolean).join(" - "), label: "Original from Analyze" }, ...prev].slice(0,12));
          setActiveId(id); setEditText(transfer.instruction); setToolPanel("ai");
          setGalleryNotice("Review your analysis brief in the edit panel. Nothing has been generated or charged. Applying an edit costs 1 credit.");
        }
        clearHandoff();
      } catch { if (!cancelled) setError("Could not open the image from Analyze. Try sending it again."); }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [historyReady, storageReady]);
  async function openAnalyzer(result: StudioResult) {
    if (result.type === "thumbnail") return;
    try {
      const file = base64ToFile(result.base64, result.dataUrl.slice(5,result.dataUrl.indexOf(";")), "studio-artwork.webp");
      const resized = file.size <= 2 * 1024 * 1024 && /image\/(png|jpeg|webp)/.test(file.type) ? { previewUrl: result.dataUrl } : await fileToWebp(file, 1600); const img = await loadImage(resized.previewUrl);
      const context = result.reviewContext;
      const reviewName = context === undefined || context === result.gameName || context.startsWith(result.gameName + " - ") ? result.gameName : "";
      const reviewPitch = context === undefined ? gamePitch : reviewName ? context.slice(reviewName.length).replace(/^ - /, "") : context;
      saveHandoff({ destination: "analyze", dataUrl: resized.previewUrl, name: result.gameName + ".webp", width: img.width, height: img.height, role: result.type === "icon" ? "icon" : result.type === "screenshot" ? "screenshot" : "steamCapsule", gameName: reviewName, gamePitch: reviewPitch, instruction: "", formatId: result.formatId, platform: result.type === "capsule" ? "steam" : result.formatId === "play-icon" ? "google-play" : "app-store" });
      router.push("/analyze?from=studio");
    } catch { setError("Could not send artwork to Analyze. Download the image and upload it on the Analyze page."); }
  }
  async function downloadOriginal(result: StudioResult) {
    const img = await loadImage(result.dataUrl); const canvas = document.createElement("canvas");
    canvas.width = result.width; canvas.height = result.height; canvas.getContext("2d")?.drawImage(img, 0, 0);
    downloadHref(canvas.toDataURL("image/png"), `${slug(result.gameName)}-${result.type}-${result.width}x${result.height}.png`);
  }

  /* ------------------------------- actions ------------------------------- */

  const scrollToCreate = () =>
    createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const addResult = (result: StudioResult) => {
    setResults((prev) => [result, ...prev].slice(0, 12));
    setActiveId(result.id);
  };

  const generate = useCallback(
    async (opts: { type: StudioAiType; recipeId: string; styleId: StudioStyleId; formatId?: string }) => {
      if (busy) return;
      setError("");
      setOutOfCredits(false);
      if (!gameName.trim() || gamePitch.trim().length < 8) {
        setNeedsGameInfo(true);
        scrollToCreate();
        setTimeout(() => nameRef.current?.focus(), 400);
        return;
      }
      setNeedsGameInfo(false);
      setBusy("create");
      try {
        const res = await artworkRequest("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            mode: "create",
            assetType: opts.type,
            formatId: studioFormat(opts.type, opts.formatId ?? formatId).id,
            gameName,
            gamePitch,
            styleId: opts.styleId,
            recipeId: opts.recipeId,
            referenceBase64: reference?.base64,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (typeof data?.credits?.remaining === "number") setCredits(data.credits.remaining);
        if (!res.ok || !data.image) {
          if (data?.outOfCredits) setOutOfCredits(true);
          setError(data?.error || "Generation failed. Nothing was charged.");
          return;
        }
        const recipe = STUDIO_RECIPES.find((r) => r.id === opts.recipeId);
        addResult({
          id: crypto.randomUUID(),
          type: opts.type,
          formatId: studioFormat(opts.type, opts.formatId ?? formatId).id,
          base64: data.image.base64,
          dataUrl: `data:${data.image.mimeType};base64,${data.image.base64}`,
          width: data.image.width,
          height: data.image.height,
          gameName,
          reviewContext: [gameName, gamePitch].filter(Boolean).join(" - "),
          label: recipe ? recipe.title : "Auto composition",
        });
        track("studio_generate");
      } catch {
        setError("Couldn't reach the studio. Check your connection and try again.");
      } finally {
        setBusy("");
      }
    },
    [busy, gameName, gamePitch, reference, formatId]
  );

  const applyEdit = async (instruction: string) => {
    if (!active || active.type === "screenshot" || busy || !instruction.trim()) return;
    setError("");
    setOutOfCredits(false);
    setBusy("edit");
    try {
      const sourceBase64 = await dataUrlToWebpBase64(active.dataUrl);
      const res = await artworkRequest("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          mode: "edit",
          assetType: active.type,
          formatId: active.formatId,
          gameName: active.gameName,
          instruction,
          sourceBase64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.credits?.remaining === "number") setCredits(data.credits.remaining);
      if (!res.ok || !data.image) {
        if (data?.outOfCredits) setOutOfCredits(true);
        setError(data?.error || "Edit failed. Nothing was charged.");
        return;
      }
      addResult({
        id: crypto.randomUUID(),
        type: active.type,
        formatId: active.formatId,
        base64: data.image.base64,
        dataUrl: `data:${data.image.mimeType};base64,${data.image.base64}`,
        width: data.image.width,
        height: data.image.height,
        gameName: active.gameName,
        reviewContext: active.reviewContext ?? "",
        label: `Edit: ${instruction}`,
      });
      setEditText("");
      track("studio_edit");
    } catch {
      setError("Couldn't reach the studio. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  };

  const scoreResult = async (result: StudioResult) => {
    if (analysisInFlight.current) return;
    analysisInFlight.current = true; setAnalyzing(true);
    setResults(prev => prev.map(r => r.id === result.id ? { ...r, scoring: true, scoreError: "", score: undefined } : r));
    try {
      const file = base64ToFile(result.base64, result.dataUrl.slice(5, result.dataUrl.indexOf(";")), "artwork.png");
      // Preserve pixels for analysis when the existing artwork fits the upload budget.
      const compressed = file.size <= 2 * 1024 * 1024 && /image\/(png|jpeg|webp)/.test(file.type) ? { base64: result.base64, mimeType: file.type } : await fileToWebp(file, 1024);
      const outcome = await scoreImage(base64ToFile(compressed.base64, compressed.mimeType, compressed.mimeType === "image/png" ? "review.png" : "review.webp"), result.type, result.reviewContext ?? [result.gameName, gamePitch].filter(Boolean).join(" - "));
      setResults(prev => prev.map(r => r.id === result.id ? "error" in outcome ? { ...r, scoring: false, scoreError: outcome.error } : { ...r, scoring: false, score: outcome } : r));
      if (!("error" in outcome)) track("studio_score");
    } catch { setResults(prev => prev.map(r => r.id === result.id ? { ...r, scoring: false, scoreError: "Could not analyze this artwork. Please retry." } : r)); }
    finally { analysisInFlight.current = false; setAnalyzing(false); }
  };

  const onPickReference = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Use a reference smaller than 20 MB."); return; }
    try {
      setReference(await fileToWebp(file, 1024));
    } catch {
      setError("Couldn't read that image - try a PNG or JPEG.");
    }
  };

  const onPickCapture = async (file: File | undefined, demoUrl?: string) => {
    setShotError("");
    try {
      if (demoUrl) {
        const img = await loadImage(demoUrl);
        setActiveId(""); setCapture({ url: demoUrl, img, name: "Sample gameplay (demo)", isDemo: true });
      } else if (file) {
        const url = URL.createObjectURL(file);
        let img: HTMLImageElement;
        try { img = await loadImage(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
        setActiveId(""); setCapture({ url, img, name: file.name, isDemo: false });
        // Default the layout to the capture's own orientation.
        const portrait = img.height > img.width;
        const match = SCREENSHOT_TEMPLATES.find((t) => t.orientation === (portrait ? "portrait" : "landscape"));
        if (match && match.orientation !== template.orientation) {
          setTemplateId(match.id);
          setSizeId(SHOT_SIZES[match.orientation][0].id);
        }
        track("shot_create");
      }
    } catch {
      setShotError("Couldn't read that capture - try a PNG or JPEG.");
    }
  };

  const renderShotFull = async () => {
    if (active?.type === "screenshot" && mode === "screenshot") { const img = await loadImage(active.dataUrl); const canvas = document.createElement("canvas"); canvas.width = active.width; canvas.height = active.height; canvas.getContext("2d")?.drawImage(img,0,0); return canvas; }
    if (!capture) return null;
    const family = await brandFontFamily();
    return composeScreenshot({
      capture: capture.img,
      template,
      size,
      palette,
      headline: headline.trim() || "Your headline here",
      subline: subline.trim() || undefined,
      fontFamily: family,
    });
  };

  const downloadShot = async () => {
    const canvas = await renderShotFull();
    if (!canvas) return;
    downloadHref(
      canvas.toDataURL("image/png"),
      `${slug(gameName || "game")}-screenshot-${canvas.width}x${canvas.height}.png`
    );
    track("studio_download");
  };

  /* ------------------------------ gallery hooks ------------------------------ */

  async function openLayered(template: LayeredTemplate) {
    if (busy || opening || !historyReady) return;
    setOpening(true); setError("");
    try {
      const document = layeredArtwork(template), canvas = await renderArtwork(document);
      const dataUrl = canvas.toDataURL("image/png");
      const result: StudioResult = { id: crypto.randomUUID(), type: template.type, formatId: template.formatId, dataUrl, base64: dataUrl.split(",")[1], width: document.width, height: document.height, gameName: template.game, label: template.title, document };
      addResult(result); setMode(template.type); setFormatId(template.formatId); setGameName(template.game); setToolPanel("");
      setEditorSource({ ...result, name: result.gameName });
      setGalleryNotice("Artwork, text and accents are separate layers. Edit and export free.");
    } catch { setError("Could not open that composition. Please retry."); }
    finally { setOpening(false); }
  }

  const onRecipe = async (recipe: StudioRecipe) => {
    if (busy || !historyReady) return;
    const token = ++selectionSequence.current; setOpening(true); setError("");
    try {
      const img = await loadImage(galleryImagePath(recipe.id));
      if (token !== selectionSequence.current) return;
      const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height; canvas.getContext("2d")?.drawImage(img,0,0);
      const dataUrl = canvas.toDataURL("image/png");
      const format = STUDIO_FORMATS.find(f => f.type === recipe.type)!;
      const result: StudioResult = { id: crypto.randomUUID(), type: recipe.type, formatId: format.id, dataUrl, base64: dataUrl.split(",")[1], width: img.width, height: img.height, gameName: recipe.example.game, label: recipe.title };
      addResult(result); setMode(recipe.type); setFormatId(format.id); setRecipeId(recipe.id); setStyleId(recipe.style); setToolPanel("");
      setGalleryNotice(recipe.title + " loaded. Edit and export free, or generate a new version for 1 credit.");
      scrollToCreate(); track("gallery_select");
    } catch { if (token === selectionSequence.current) setError("Could not load that composition. Please try again."); }
    finally { if (token === selectionSequence.current) setOpening(false); }
  };

  const onTemplate = (t: ScreenshotTemplate) => {
    if (busy || opening) return;
    if (!capture) { const index = SCREENSHOT_TEMPLATES.findIndex(item => item.id === t.id); void onPickCapture(undefined, SHOT_DEMO_CAPTURES[index % SHOT_DEMO_CAPTURES.length]); setPaletteId(SHOT_PALETTES[index].id); setHeadline(t.orientation === "portrait" ? "Survive the swarm" : "Turn the tide"); setSubline("Your gameplay. Your story."); }
    track("gallery_generate");
    setMode("screenshot");
    setActiveId("");
    setTemplateId(t.id);
    setSizeId(SHOT_SIZES[t.orientation][0].id);
    scrollToCreate();
  };

  const onStyle = (id: StudioStyleId) => {
    setStyleId(id);
    if (mode === "screenshot") setMode("icon");
    scrollToCreate();
  };

  const examples = [
    { image: "/studio/hollowmere-forest.webp", label: "Misty kingdom" },
    { image: "/studio/hollowmere-sunset.webp", label: "Golden hour" },
    { image: "/studio/hollowmere-moon.webp", label: "Moonlit ruins" },
  ];
  const example = examples[exampleIndex] ?? { image: "/studio/hollowmere-main.webp", label: "Castle approach" };
  const previewSource = active?.dataUrl ?? example.image;
  const shownName = active?.gameName ?? "Hollowmere";
  const shownFormat = active && active.type !== "screenshot" ? studioFormat(active.type, active.formatId) : studioFormat("capsule", "steam-header");
  const realResults = results.filter(r => !r.example);
  const modes = { icon: SquaresFour, capsule: Monitor, thumbnail: ImageSquare, screenshot: Camera };
  const styles: { id: StudioStyleId; label: string; image: string }[] = [
    { id: "cinematic", label: "Cinematic", image: examples[0].image },
    { id: "painterly", label: "Illustration", image: examples[1].image },
    { id: "pixel", label: "Pixel Art", image: "/studio/hollowmere-pixel.webp" },
  ];
  async function openEdit() {
    if (busy || opening || !historyReady) return;
    setOpening(true); setError("");
    try {
      if (mode === "screenshot" && active?.type !== "screenshot") {
        if (!capture) return;
        const textLayers: import("./composeScreenshot").ScreenshotText[] = [];
        const rendered = composeScreenshot({ capture: capture.img, template, size, palette, headline: headline.trim() || "Your headline here", subline: subline.trim() || undefined, fontFamily: await brandFontFamily(), textLayers });
        const dataUrl = rendered.toDataURL("image/png"); const document = makeArtwork(dataUrl, size.width, size.height);
        for (const text of textLayers) document.layers.push({ ...newText(document), name: text.name, text: text.text, x: text.x, y: text.y, width: text.width, height: text.height, font: "sora", fontSize: text.fontSize, align: text.align, color: text.color, lineHeight: text.lineHeight, shadow: text.name === "Headline" });
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ dataUrl, headline, subline, templateId, sizeId, paletteId })));
        const draftId = "shot-" + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,"0")).join("");
        setEditorSource({ id: draftId, name: gameName + " screenshot", dataUrl, width: size.width, height: size.height, document, type: "screenshot" });
      } else if (active) setEditorSource({ id: active.id, name: active.gameName, dataUrl: active.dataUrl, width: active.width, height: active.height, document: active.document, type: active.type, formatId: active.formatId });
      else {
        const img = await loadImage(example.image); const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height; canvas.getContext("2d")?.drawImage(img,0,0);
        setEditorSource({ id: example.image, name: "Hollowmere", dataUrl: canvas.toDataURL("image/png"), width: img.width, height: img.height, type: "capsule", formatId: "steam-header" });
      }
    } catch { setError("Could not open that artwork. Try importing a PNG, JPEG or WebP."); } finally { setOpening(false); }
  }
  // A marketing link can open the free editor once saved artwork is restored.
  // Reuse the normal Edit action so image selection and failures stay consistent.
  const openEditEntry = useEffectEvent(() => { void openEdit(); });
  useEffect(() => {
    if (!historyReady || !storageReady || editEntryOpened.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") !== "edit" || params.has("from")) return;
    const timer = setTimeout(() => {
      if (editEntryOpened.current) return;
      editEntryOpened.current = true;
      openEditEntry();
    }, 0);
    return () => clearTimeout(timer);
  }, [historyReady, storageReady]);
  async function importArtwork(file?: File) {
    if (!file || busy) return; setOpening(true); setError("");
    try {
      const art = await importArtworkFile(file); const type: StudioAiType = art.width === art.height ? "icon" : "capsule";
      const result: StudioResult = { id: crypto.randomUUID(), type, dataUrl: art.src, base64: art.src.split(",")[1], width: art.width, height: art.height, gameName: file.name.replace(/\.[^.]+$/, ""), label: "Imported artwork", reviewContext: "" };
      addResult(result); setMode(type); setToolPanel(""); setEditorSource({ id: result.id, name: result.gameName, dataUrl: result.dataUrl, width: result.width, height: result.height, type });
    } catch (e) { setError((e as Error).message); } finally { setOpening(false); }
  }
  async function analyzeCurrent() {
    if (busy || opening || !historyReady || analysisInFlight.current) return;
    if (active && (mode !== "screenshot" || active.type === "screenshot")) { await scoreResult(active); return; }
    setOpening(true); setError("");
    try {
      let canvas: HTMLCanvasElement | null, artwork: ArtworkDocument | undefined;
      if (mode === "screenshot") {
        if (!capture) return;
        const textLayers: import("./composeScreenshot").ScreenshotText[] = [];
        const base = composeScreenshot({ capture: capture.img, template, size, palette, headline: headline.trim() || "Your headline here", subline: subline.trim() || undefined, fontFamily: await brandFontFamily(), textLayers });
        artwork = makeArtwork(base.toDataURL("image/png"), size.width, size.height);
        for (const text of textLayers) artwork.layers.push({ ...newText(artwork), name: text.name, text: text.text, x: text.x, y: text.y, width: text.width, height: text.height, font: "sora", fontSize: text.fontSize, align: text.align, color: text.color, lineHeight: text.lineHeight, shadow: text.name === "Headline" });
        canvas = await renderArtwork(artwork);
      }
      else { const img = await loadImage(example.image); canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height; canvas.getContext("2d")?.drawImage(img, 0, 0); }
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      const result: StudioResult = { id: crypto.randomUUID(), type: mode === "screenshot" ? "screenshot" : "capsule", formatId: mode === "screenshot" ? undefined : "steam-header", dataUrl, base64: dataUrl.split(",")[1], width: canvas.width, height: canvas.height, gameName: mode === "screenshot" ? gameName : "Hollowmere", label: "Analyzed artwork", document: artwork };
      addResult(result); await scoreResult(result);
    } catch { setError("Could not prepare the current image for analysis."); }
    finally { setOpening(false); }
  }
  function saveManual(value: EditorSave) {
    if (!editorSource) return;
    const result: StudioResult = { id: crypto.randomUUID(), type: editorSource.type, formatId: editorSource.formatId, gameName: editorSource.name, reviewContext: results.find(item => item.id === editorSource.id)?.reviewContext, label: "Manual edit", dataUrl: value.dataUrl, base64: value.dataUrl.split(",")[1], width: value.width, height: value.height, document: value.document };
    addResult(result);
    setMode(editorSource.type); setEditorSource(null); setToolPanel(""); setGalleryNotice("Edits saved with editable layers. Export is free.");
    return result;
  }
  return (
    <main className="canvas-studio">
      {editorSource && <ArtworkEditor key={editorSource.id} source={editorSource} onClose={() => setEditorSource(null)} onSave={saveManual} onAnalyze={value => { const result = saveManual(value); if (result) void scoreResult(result); }} />}
      <input ref={artworkInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" aria-label="Open artwork file" onChange={e => { void importArtwork(e.target.files?.[0]); e.target.value = ""; }} />
      <StudioHeader creditLabel={credits === null ? (creditError ? "View credits" : "Credits…") : `${credits} credit${credits === 1 ? "" : "s"}`} />
      <div className="studio-layout">
        <aside className="studio-sidebar" ref={createRef}>
          <h1>Canvas Workspace</h1>
          <p className="studio-intro">Create game artwork for your store in minutes.</p>
          <div className="studio-mode-tabs" aria-label="Artwork type">
            {MODE_TABS.map(tab => { const Icon = modes[tab.id]; return <button key={tab.id} disabled={!!busy || opening} aria-pressed={mode === tab.id} title={tab.hint} onClick={() => { setMode(tab.id); setActiveId(results.find(r => r.type === tab.id)?.id || ""); setToolPanel(""); setError(""); }}><Icon size={23} weight="regular" /><span>{tab.id === "capsule" ? "Capsule" : tab.label}</span></button>; })}
          </div>
          {mode !== "screenshot" ? <div className="studio-form">
            <label htmlFor="studio-name">Game Name<input ref={nameRef} id="studio-name" maxLength={80} value={gameName} onChange={e => setGameName(e.target.value)} placeholder="Your game's name" /></label>
            <label htmlFor="studio-pitch">What’s your game?<textarea aria-describedby="pitch-counter" id="studio-pitch" maxLength={300} value={gamePitch} onChange={e => setGamePitch(e.target.value)} placeholder="Describe the world, the player and what makes your game stand out." /><span id="pitch-counter" className="studio-counter">{gamePitch.length}/300</span></label>
            {needsGameInfo && <p className="studio-notice" role="alert">Add a game name and a description of at least 8 characters.</p>}
            <label htmlFor="studio-format">Output Format<select id="studio-format" value={outputFormat.id} onChange={e => setFormatId(e.target.value)}>{STUDIO_FORMATS.filter(f => f.type === aiType).map(f => <option key={f.id} value={f.id}>{f.id === "steam-header" ? "Steam Header" : f.label} ({f.width} × {f.height})</option>)}</select></label>
            <fieldset className="studio-styles"><legend>Visual Style</legend><div>{styles.map(s => <button key={s.id} type="button" aria-pressed={styleId === s.id} onClick={() => setStyleId(s.id)}><img src={s.image} alt="" /><span>{s.label}</span></button>)}</div></fieldset>
            <div className="studio-reference"><span>Reference Art <span className="studio-dim">(optional)</span></span><button className="studio-upload" onClick={() => refInput.current?.click()}>{reference ? <img src={reference.previewUrl} alt="Reference artwork" /> : <ImageSquare size={32} />}<span>{reference ? "Replace image" : "Upload image"}<small>JPG, PNG or WEBP</small></span></button>{reference && <button className="studio-text-button" onClick={() => setReference(null)}>Remove reference</button>}<input ref={refInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Reference art file" onChange={e => { void onPickReference(e.target.files?.[0]); e.target.value = ""; }} /></div>
            <button className="studio-generate" disabled={!!busy || opening} onClick={() => void generate({ type: aiType, recipeId, styleId })}><Sparkle size={25} weight="fill" /><strong>{busy ? (busy === "edit" ? "Editing artwork…" : "Creating artwork…") : "Generate with AI"}</strong><span>1 credit</span></button>
            {aiType === "capsule" && <p className="studio-intro">Publishing AI-generated artwork on Steam? <a href="https://partner.steamgames.com/doc/gettingstarted/contentsurvey#5" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Review Steam’s AI disclosure requirements.</a></p>}
            <details className="studio-advanced"><summary>More styles & composition</summary><label>Art direction<select value={styleId} onChange={e => setStyleId(e.target.value as StudioStyleId)}>{STUDIO_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label>Composition<select value={recipeId} onChange={e => setRecipeId(e.target.value)}><option value="">Let the studio choose</option>{STUDIO_RECIPES.filter(r => r.type === aiType).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label></details>
          </div> : <div className="studio-form studio-shot-controls">
            <p className="studio-intro">Frame your real gameplay. Free, in your browser.</p>
            <button className="studio-upload" onClick={() => captureInput.current?.click()}><UploadSimple size={28} /><span>{capture ? "Replace gameplay" : "Upload gameplay"}<small>{capture?.name ?? "JPG, PNG or WEBP"}</small></span></button>
            <input ref={captureInput} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" aria-label="Gameplay capture file" onChange={e => { void onPickCapture(e.target.files?.[0]); e.target.value = ""; }} />
            {!capture && <button className="studio-text-button" onClick={() => void onPickCapture(undefined, SHOT_DEMO_CAPTURES[0])}>Try with demo gameplay</button>}
            <label>Layout<select value={templateId} onChange={e => { const t = SCREENSHOT_TEMPLATES.find(t => t.id === e.target.value)!; setActiveId(""); setTemplateId(t.id); setSizeId(SHOT_SIZES[t.orientation][0].id); }}>{SCREENSHOT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
            <label>Output Format<select value={size.id} onChange={e => { setActiveId(""); setSizeId(e.target.value); }}>{sizes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Headline<input value={headline} maxLength={48} disabled={size.id === "steam-1080"} onChange={e => { setActiveId(""); setHeadline(e.target.value); }} placeholder="Your strongest feature" /></label>
            <label>Subline (optional)<input value={subline} maxLength={70} disabled={size.id === "steam-1080"} onChange={e => { setActiveId(""); setSubline(e.target.value); }} placeholder="Give players a reason to try it" /></label>
            <label>Color palette<select value={paletteId} disabled={size.id === "steam-1080"} onChange={e => { setActiveId(""); setPaletteId(e.target.value); }}>{SHOT_PALETTES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <p className="studio-intro">{size.id === "steam-1080" ? "Steam exports keep the full gameplay capture, without captions or decoration." : "Mobile store layouts add your caption around a real gameplay capture."}</p>
            <button className="studio-generate" disabled={!capture && active?.type !== "screenshot"} onClick={() => void downloadShot()}><Download size={22} /><strong>Export screenshot</strong><span>Free</span></button>
          </div>}
          {error && <p className="studio-notice" role="alert">{error}</p>}
          {outOfCredits && <Link href="/pricing" className="studio-text-button">View credit packs</Link>}
        </aside>
        <section className="studio-preview-area" aria-label="Artwork workspace">
          {galleryNotice && <p role="status" className="analysis-brief-notice">{galleryNotice}</p>}
          <div className="studio-preview-heading"><div><h2>Preview</h2><p>{mode === "screenshot" ? "Check your screenshot, adjust the layout and export when you’re ready." : "Review your artwork. Make edits or export when you’re happy with the result."}</p></div><span>{mode === "screenshot" ? `${active?.type === "screenshot" ? active.width : size.width} × ${active?.type === "screenshot" ? active.height : size.height}` : `${shownFormat.id === "steam-header" ? "Steam Header" : shownFormat.label} · ${active?.width ?? 920} × ${active?.height ?? 430}`}</span></div>
          <button className="studio-import-action" disabled={!!busy || opening} onClick={() => artworkInput.current?.click()}>Open image to edit · free</button>
          <div className={`studio-canvas studio-canvas-flex ${mode === "screenshot" ? "studio-canvas-shot" : ""}`} aria-busy={!!busy || opening}>
            {mode === "screenshot" ? (active?.type === "screenshot" ? <img src={active.dataUrl} alt="Edited screenshot preview" /> : shotPreview && capture ? <img src={shotPreview} alt="Live screenshot preview" /> : <div className="studio-empty"><Camera size={44} /><h3>Your gameplay goes here</h3><p>Upload a capture to see a live preview.</p><button className="studio-secondary" onClick={() => captureInput.current?.click()}>Upload gameplay capture</button></div>) : <img className={!active || active.example ? "studio-example-image" : ""} src={previewSource} alt={`${shownName} ${active?.example || !active ? "example artwork" : "artwork"}`} />}
            {busy && mode !== "screenshot" && <div className="studio-working" role="status"><CircleNotch size={30} className="studio-spin" /><strong>{busy === "edit" ? "Refining your artwork" : "Creating your artwork"}</strong><span>This can take a minute. Keep this page open.</span></div>}
          </div>
          <div className="studio-preview-actions">
            <button className="studio-secondary" disabled={!!busy || opening || !historyReady || analyzing || (mode === "screenshot" && !capture && active?.type !== "screenshot")} onClick={() => void analyzeCurrent()}><ChartBar size={22} />{analyzing ? "Analyzing…" : "Analyze artwork"}</button>
            <button className="studio-secondary" disabled={!!busy || opening || !historyReady || (mode === "screenshot" && !capture && active?.type !== "screenshot")} onClick={() => void openEdit()}><PencilSimple size={22} />{opening ? "Opening…" : "Edit · free"}</button>
            <button className="studio-secondary" aria-expanded={toolPanel === "export"} disabled={opening || (mode === "screenshot" && !capture && active?.type !== "screenshot")} onClick={() => { if (mode === "screenshot") { if (active?.type === "screenshot") void downloadOriginal(active); else void downloadShot(); } else setToolPanel(toolPanel === "export" ? "" : "export"); }}><Download size={22} />Export · free</button>
            {mode !== "screenshot" && <button className="studio-secondary" aria-expanded={toolPanel === "ai"} disabled={!active || !!busy} onClick={() => setToolPanel(toolPanel === "ai" ? "" : "ai")}><Sparkle size={22} />AI edit · 1 credit</button>}
          </div>
          {mode !== "screenshot" && toolPanel === "ai" && <section className="studio-tool-panel" aria-label="Edit artwork"><div className="studio-section-title"><h3>AI edit</h3><span>1 credit per edit</span></div>{active?.example && <p className="studio-intro">You’re editing the Hollowmere example. To create art for your game, use the workspace on the left.</p>}<label htmlFor="edit-instruction">What would you like to change?<textarea id="edit-instruction" maxLength={600} value={editText} onChange={e => setEditText(e.target.value)} placeholder="For example, move the title higher and brighten the lantern." /></label><div className="studio-edit-chips">{EDIT_CHIPS[active?.type === "screenshot" ? aiType : active?.type ?? aiType].map(chip => <button key={chip} onClick={() => setEditText(chip)}>{chip}</button>)}</div><button className="studio-generate" disabled={!active || !editText.trim() || !!busy} onClick={() => void applyEdit(editText)}><Sparkle size={22} /><strong>{busy ? "Applying edit…" : "Apply edit"}</strong><span>1 credit</span></button></section>}
          {mode !== "screenshot" && toolPanel === "export" && <AssetExporter source={{ dataUrl: previewSource, gameName: shownName }} />}
          {mode === "screenshot" && shotError && <p className="studio-notice" role="alert">{shotError}</p>}
            <div className="studio-analysis-result" aria-live="polite">{active?.scoring && <p role="status">Analyzing the current artwork…</p>}{active?.score && <ScoreBlock score={active.score} />}{active?.scoreError && <p role="alert" className="studio-notice">{active.scoreError}</p>}</div>

          {<><div className="studio-section-title studio-variants-title"><h3>{realResults.length ? "Recent Variants" : "Example Variants"}</h3><span>{realResults.length ? "Saved on this device" : "Hollowmere · sample project"}</span></div><div className="studio-variants">{realResults.length ? realResults.map(r => <button key={r.id} disabled={!!busy || opening} aria-label={`Preview ${r.gameName}: ${r.label}`} aria-pressed={activeId === r.id} onClick={() => { setActiveId(r.id); setMode(r.type); setFormatId(r.formatId || ""); setToolPanel(""); }}><img src={r.dataUrl} alt={`${r.gameName} ${r.label}`} /></button>) : examples.map((ex, i) => <button key={ex.image} aria-label={`Preview example: ${ex.label}`} aria-pressed={exampleIndex === i} onClick={() => { setExampleIndex(i); setActiveId(""); setToolPanel(""); }}><img src={ex.image} alt={`Hollowmere: ${ex.label}`} /></button>)}</div>
          {active && !active.example && <div className="studio-result-tools">{active.type !== "screenshot" && <button className="studio-text-button" disabled={!!busy} onClick={() => void generate({ type: active.type as StudioAiType, recipeId, styleId, formatId: active.formatId })}><ArrowClockwise size={18} />Generate another · 1 credit</button>}<button className="studio-text-button" onClick={() => void downloadOriginal(active)}><Download size={18} />Original PNG</button>{active.type !== "thumbnail" && <button className="studio-text-button" onClick={() => void openAnalyzer(active)}><ChartBar size={18} />Open in Analyze →</button>}</div>}</>}
          <LayeredGallery onUse={template => void openLayered(template)} disabled={!!busy || opening || !historyReady} />
          <StudioGallery availableImages={availableImages} onRecipe={recipe => void onRecipe(recipe)} onTemplate={onTemplate} onStyle={onStyle} />
        </section>
      </div>
    </main>
  );
}
