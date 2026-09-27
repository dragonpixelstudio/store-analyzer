"use client";
/* eslint-disable @next/next/no-img-element -- local art and canvas previews */
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDIO_FORMATS } from "@/lib/studioFormats";
import { loadImage } from "./composeScreenshot";
const formats = [...STUDIO_FORMATS, { id: "play-feature", label: "Google Play feature graphic", sizeNote: "1024×500 · Google Play feature graphic", width: 1024, height: 500 }];
export default function AssetExporter({ source }: { source?: { dataUrl: string; gameName: string } | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [art, setArt] = useState<{ image: HTMLImageElement; name: string } | null>(null);
  const [formatId, setFormatId] = useState("original");
  const [fit, setFit] = useState("contain");
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const format = useMemo(() => formatId === "original" ? { id: "original", width: art?.image.width || 920, height: art?.image.height || 430 } : formats.find(f => f.id === formatId)!, [formatId, art]);
  const fullCanvas = useRef<HTMLCanvasElement | null>(null);
  const sequence = useRef(0);
  async function openArt(url: string, name: string) {
    const id = ++sequence.current;
    setError("");
    try { const image = await loadImage(url); if (id === sequence.current) setArt({ image, name }); }
    catch { if (id === sequence.current) setError("Could not open that image. Use PNG, JPEG or WebP."); }
  }
  useEffect(() => {
    if (!source?.dataUrl) return;
    let cancelled = false;
    const id = ++sequence.current;
    loadImage(source.dataUrl).then(image => {
      if (!cancelled && id === sequence.current) setArt({ image, name: source.gameName });
    }).catch(() => { if (!cancelled) setError("Could not load the artwork."); });
    return () => { cancelled = true; };
  }, [source?.dataUrl, source?.gameName]);
  useEffect(() => {
    if (!art) return;
    const canvas = document.createElement("canvas");
    canvas.width = format.width; canvas.height = format.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (formatId !== "original") { ctx.fillStyle = "#080b16"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    const scale = (fit === "cover" ? Math.max : Math.min)(canvas.width/art.image.width, canvas.height/art.image.height);
    const w = art.image.width*scale, h = art.image.height*scale;
    ctx.drawImage(art.image, (canvas.width-w)*(fit === "cover" ? focusX/100 : .5), (canvas.height-h)*(fit === "cover" ? focusY/100 : .5), w, h);
    fullCanvas.current = canvas;
    const small = document.createElement("canvas");
    const ratio = Math.min(1, 900/Math.max(canvas.width,canvas.height));
    small.width = Math.round(canvas.width*ratio); small.height = Math.round(canvas.height*ratio);
    small.getContext("2d")?.drawImage(canvas,0,0,small.width,small.height);
    const timer = setTimeout(() => setPreview(small.toDataURL("image/webp",.9)),0);
    return () => clearTimeout(timer);
  }, [art, format, formatId, fit, focusX, focusY]);
  async function download(mime: "image/png" | "image/jpeg") {
    if (!fullCanvas.current || !art || exporting) return;
    setExporting(true); setError("");
    try {
      const exported = document.createElement("canvas"); exported.width = fullCanvas.current.width; exported.height = fullCanvas.current.height; const ctx = exported.getContext("2d")!; if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,exported.width,exported.height); } ctx.drawImage(fullCanvas.current,0,0);
      const blob = await new Promise<Blob | null>(resolve => exported.toBlob(resolve,mime,.95));
      if (!blob) throw new Error("Could not encode image.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href=url;
      const name = art.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi,"-").slice(0,50) || "game";
      link.download=name+"-"+format.id+"-"+format.width+"x"+format.height+(mime === "image/png" ? ".png" : ".jpg");
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),30000);
    } catch { setError("Export failed. Try a smaller format or another image."); }
    finally { setExporting(false); }
  }
  const field = "w-full rounded-xl border border-[var(--edge)] bg-[var(--well)] p-3 text-sm text-[var(--foreground)]";
  const button = "rounded-xl border border-[var(--edge)] px-4 py-3 text-sm font-bold text-[var(--cyan)] disabled:opacity-50";
  return <section aria-label="Export existing artwork" className="studio-exporter mx-auto mt-5 max-w-full rounded-xl border border-[var(--edge)] bg-[var(--panel)] p-5 md:p-7">
    <p className="text-xs font-bold uppercase tracking-widest text-[var(--green)]">Free · no generation credits</p>
    <h2 className="font-brand mt-2 text-2xl font-bold">Export artwork</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Export at the original size, or choose a store format.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className={button} onClick={() => input.current?.click()}>Upload finished artwork</button>
      {source && <button className={button} onClick={() => void openArt(source.dataUrl,source.gameName)}>Use preview artwork</button>}
      <input ref={input} aria-label="Finished artwork file" className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value=""; if (!file) return;
        if (file.size > 20*1024*1024) { setError("Use an image smaller than 20 MB."); return; }
        const url = URL.createObjectURL(file); try { await openArt(url,file.name); } finally { URL.revokeObjectURL(url); }
      }}/>
    </div>
    {art && <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <label className="block text-sm font-bold">Export format<select aria-label="Export format" className={field} value={formatId} onChange={e=>setFormatId(e.target.value)} style={{colorScheme:"dark"}}><option value="original">Original size · {art?.image.width} × {art?.image.height}</option>{formats.map(f=><option key={f.id} value={f.id}>{f.sizeNote}</option>)}</select></label>
        <label className="block text-sm font-bold">Artwork fit<select aria-label="Artwork fit" className={field} value={fit} onChange={e=>setFit(e.target.value)} style={{colorScheme:"dark"}}><option value="contain">Keep full artwork · dark padding</option><option value="cover">Fill canvas · crop edges</option></select></label>
        {fit === "cover" && <><label className="block text-sm">Horizontal crop position<input className="block w-full" type="range" min="0" max="100" value={focusX} onChange={e=>setFocusX(+e.target.value)}/></label><label className="block text-sm">Vertical crop position<input className="block w-full" type="range" min="0" max="100" value={focusY} onChange={e=>setFocusY(+e.target.value)}/></label></>}
        <p className="text-xs text-[var(--faint)]">Original-size PNG keeps transparency. Other sizes add padding or crop as selected. JPEG uses a white background where transparent.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={exporting} onClick={()=>void download("image/png")}>Export PNG</button><button className={button} disabled={exporting} onClick={()=>void download("image/jpeg")}>Export JPEG</button></div>
        <p className="text-xs text-[var(--faint)]">For YouTube mobile uploads, check that the downloaded thumbnail is under 2 MB. Desktop allows up to 50 MB.</p>
      </div>
      <div className="flex items-center justify-center rounded-2xl bg-black/30 p-3">{preview && <img src={preview} alt="Artwork export preview" className="max-h-[440px] max-w-full object-contain"/>}</div>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--magenta)]">{error}</p>}
  </section>;
}
