"use client";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { commitArtwork, hitLayer, localPoint, makeArtwork, MAX_LAYERS, newText, redoArtwork, resizeArtwork, undoArtwork, type ArtworkDocument, type ArtworkHistory, type ArtworkLayer } from "@/lib/artworkDocument";
import { readEditorDraft, writeEditorDraft } from "@/lib/studioHistory";
import { STUDIO_FORMATS } from "@/lib/studioFormats";
import { artworkBlob, importArtworkFile, renderArtwork } from "./renderArtwork";

export type EditorSource = { id: string; name: string; dataUrl: string; width: number; height: number; document?: ArtworkDocument };
export type EditorSave = { dataUrl: string; width: number; height: number; document: ArtworkDocument };
type Gesture = { pointer: number; startX: number; startY: number; layer: ArtworkLayer; before: ArtworkDocument; resize: boolean };
export default function ArtworkEditor({ source, onClose, onSave, onAnalyze }: { source: EditorSource; onClose: () => void; onSave: (value: EditorSave) => void; onAnalyze?: (value: EditorSave) => void }) {
  const [history, setHistory] = useState<ArtworkHistory>(() => ({ past: [], present: source.document || makeArtwork(source.dataUrl, source.width, source.height), future: [] }));
  const doc = history.present;
  const docRef = useRef(doc); useLayoutEffect(() => { docRef.current = doc; }, [doc]);
  const [selectedId, setSelectedId] = useState("");
  const selected = doc.layers.find(layer => layer.id === selectedId);
  const [ready, setReady] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(100), [bounds, setBounds] = useState({ width: 720, height: 520 });
  const [canvasWidth, setCanvasWidth] = useState(String(doc.width)), [canvasHeight, setCanvasHeight] = useState(String(doc.height));
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null), frame = useRef<number | null>(null), uploadAs = useRef<"image" | "replace" | "layer">("image");
  const titleField = useRef<HTMLTextAreaElement>(null);
  const fit = Math.min(Math.max(100, bounds.width - 48) / doc.width, Math.max(180, bounds.height - 48) / doc.height);
  const scale = fit * zoom / 100;
  useEffect(() => {
    const el = dialog.current; el?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; el?.close(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void readEditorDraft<ArtworkDocument>(source.id).then(saved => {
      if (!cancelled && saved?.version === 1 && saved.layers?.length <= MAX_LAYERS) {
        setHistory({ past: [], present: saved, future: [] }); setCanvasWidth(String(saved.width)); setCanvasHeight(String(saved.height)); setNotice("Restored your local draft.");
      }
    }).catch(() => { if (!cancelled) setNotice("Local drafts are unavailable. Save or export before leaving."); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [source.id]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void writeEditorDraft(source.id, doc).catch(() => setNotice("Draft could not be stored. Export or save before leaving.")); }, 400);
    return () => clearTimeout(timer);
  }, [doc, ready, source.id]);
  useEffect(() => {
    let cancelled = false;
    void renderArtwork(doc, undefined, false, 1600).then(image => { if (!cancelled && canvas.current) { canvas.current.width = image.width; canvas.current.height = image.height; canvas.current.getContext("2d")?.drawImage(image, 0, 0); } }).catch(() => { if (!cancelled) setError("Could not render a layer. Replace its image and try again."); });
    return () => { cancelled = true; };
  }, [doc]);
  const commit = (next: ArtworkDocument) => { setHistory(current => commitArtwork(current, next)); setError(""); setNotice(""); };
  function patchSelected(patch: Partial<ArtworkLayer>) { if (!selected || selected.locked) return; commit({ ...doc, layers: doc.layers.map(layer => layer.id === selected.id ? { ...layer, ...patch } as ArtworkLayer : layer) }); }
  function addLayer(layer: ArtworkLayer) { if (doc.layers.length >= MAX_LAYERS) { setError("This artwork supports up to 32 layers."); return; } commit({ ...doc, layers: [...doc.layers, layer] }); setSelectedId(layer.id); }
  function addText() { const layer = newText(doc); addLayer(layer); requestAnimationFrame(() => { titleField.current?.focus(); titleField.current?.select(); }); }
  function addShape() { addLayer({ ...newText(doc), kind: "shape", name: "Color panel", color: "#141618", height: doc.height * .22 }); }
  function removeLayer() { if (!selected || selected.locked) return; commit({ ...doc, layers: doc.layers.filter(layer => layer.id !== selected.id) }); setSelectedId(""); }
  function duplicate() { if (!selected) return; addLayer({ ...selected, id: crypto.randomUUID(), name: selected.name + " copy", x: selected.x + doc.width * .02, y: selected.y + doc.height * .02, locked: false }); }
  function order(direction: number) { if (!selected || selected.locked) return; const layers = [...doc.layers], i = layers.findIndex(layer => layer.id === selected.id), target = i + direction; if (target < 0 || target >= layers.length) return; [layers[i], layers[target]] = [layers[target], layers[i]]; commit({ ...doc, layers }); }
  function resizeCanvas(width = Number(canvasWidth), height = Number(canvasHeight)) { try { const next = resizeArtwork(doc, width, height); commit(next); setCanvasWidth(String(width)); setCanvasHeight(String(height)); } catch (e) { setError((e as Error).message); } }
  function point(event: ReactPointerEvent) { const rect = surface.current!.getBoundingClientRect(); return { x: (event.clientX - rect.left) * doc.width / rect.width, y: (event.clientY - rect.top) * doc.height / rect.height }; }
  function start(event: ReactPointerEvent, resize = false) {
    if (!ready || working || event.button !== 0) return;
    const p = point(event), layer = resize ? selected : hitLayer(doc, p.x, p.y);
    if (!layer || layer.locked) { setSelectedId(""); return; }
    event.preventDefault(); event.stopPropagation(); surface.current?.focus(); setSelectedId(layer.id);
    gesture.current = { pointer: event.pointerId, startX: p.x, startY: p.y, layer, before: doc, resize };
    surface.current?.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent) {
    const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
    const p = point(event); let patch: Partial<ArtworkLayer>;
    if (g.resize) {
      const local = localPoint(g.layer, p.x, p.y), ratio = g.layer.width / g.layer.height;
      const width = Math.max(12, Math.min(12000, local.x)), height = g.layer.kind === "image" ? width / ratio : Math.max(12, Math.min(12000, local.y));
      // Keep the rotated top-left corner fixed while scaling.
      const a = g.layer.rotation * Math.PI / 180, dx = (width - g.layer.width) / 2, dy = (height - g.layer.height) / 2;
      patch = { width, height, x: g.layer.x + dx * Math.cos(a) - dy * Math.sin(a) - dx, y: g.layer.y + dx * Math.sin(a) + dy * Math.cos(a) - dy };
    } else patch = { x: g.layer.x + p.x - g.startX, y: g.layer.y + p.y - g.startY };
    const next = { ...g.before, layers: g.before.layers.map(layer => layer.id === g.layer.id ? { ...g.layer, ...patch } as ArtworkLayer : layer) };
    docRef.current = next;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { setHistory(current => ({ ...current, present: next })); frame.current = null; });
  }
  function finish(cancel = false) {
    const g = gesture.current; if (!g) return; gesture.current = null;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const next = cancel ? g.before : docRef.current;
    setHistory(current => next === g.before ? { ...current, present: g.before } : commitArtwork({ ...current, present: g.before }, next));
  }
  async function upload(file?: File) {
    if (!file) return; setWorking(true); setError("");
    try {
      const art = await importArtworkFile(file);
      if (uploadAs.current === "replace") { const next = makeArtwork(art.src, art.width, art.height); commit(next); setCanvasWidth(String(art.width)); setCanvasHeight(String(art.height)); setSelectedId(""); }
      else if (uploadAs.current === "layer" && selected?.kind === "image" && !selected.locked) { const ratio = Math.min(selected.width / art.width, selected.height / art.height); patchSelected({ src: art.src, width: art.width * ratio, height: art.height * ratio, x: selected.x + (selected.width - art.width * ratio) / 2, y: selected.y + (selected.height - art.height * ratio) / 2 }); }
      else { const ratio = Math.min(doc.width * .65 / art.width, doc.height * .65 / art.height, 1); addLayer({ id: crypto.randomUUID(), kind: "image", name: file.name, src: art.src, width: art.width * ratio, height: art.height * ratio, x: (doc.width - art.width * ratio) / 2, y: (doc.height - art.height * ratio) / 2, rotation: 0, opacity: 1, visible: true, locked: false }); }
    } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  async function download(mime: "image/png" | "image/jpeg" | "image/webp") {
    setWorking(true); setError("");
    try {
      const blob = await artworkBlob(docRef.current, mime), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${source.name.replace(/[^a-z0-9]+/gi, "-").slice(0,50) || "artwork"}-${doc.width}x${doc.height}.${blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1]}`;
      (dialog.current || document.body).appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); setNotice(blob.type === mime ? "Exported with all visible layers. No credits used." : "Your browser exported PNG with all visible layers. No credits used.");
    } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  async function save(analyze = false) {
    setWorking(true); setError("");
    try { const current = docRef.current; const rendered = await renderArtwork(current); await writeEditorDraft(source.id, current).catch(() => undefined); (analyze && onAnalyze ? onAnalyze : onSave)({ dataUrl: rendered.toDataURL("image/png"), width: current.width, height: current.height, document: current }); }
    catch { setError("Could not save this artwork. Try exporting PNG."); setWorking(false); }
  }
  async function close() { if (working || !ready) return; try { await writeEditorDraft(source.id, docRef.current); onClose(); } catch { if (window.confirm("This draft could not be saved. Close and lose the edits?")) onClose(); } }
  function key(event: React.KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input,textarea,select,button")) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); setHistory(current => event.shiftKey ? redoArtwork(current) : undoArtwork(current)); }
    else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); setHistory(redoArtwork); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeLayer(); }
    else if (selected && !selected.locked && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; patchSelected({ x: selected.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y: selected.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) }); }
  }
  const numeric = (label: string, value: number, update: (n: number) => void, min = -12000, max = 12000) => <label>{label}<input type="number" aria-label={label} value={Math.round(value * 10) / 10} min={min} max={max} onChange={e => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) update(Math.min(max, Math.max(min, e.target.valueAsNumber))); }} /></label>;
  return <dialog ref={dialog} className="art-editor" aria-labelledby="editor-title" onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); void close(); }} onKeyDown={key}>
    <header className="editor-header"><div><h2 id="editor-title">Edit artwork <span>Free</span></h2><p>{source.name}</p></div><div><button disabled={working || !ready} onClick={() => void save()}>Save to Studio</button>{onAnalyze && <button disabled={working || !ready} onClick={() => void save(true)}>Analyze edits</button>}<button aria-label="Close editor" disabled={working || !ready} onClick={() => void close()}>✕</button></div></header>
    <div className="editor-toolbar"><button disabled={!ready || working} onClick={() => { uploadAs.current = "replace"; input.current?.click(); }}>Open image</button><button disabled={!ready || working} onClick={addText}>＋ Text</button><button disabled={!ready || working} onClick={() => { uploadAs.current = "image"; input.current?.click(); }}>＋ Image</button><button disabled={!ready || working} onClick={addShape}>＋ Color panel</button><span className="editor-toolbar-divider"/><button disabled={!history.past.length || working} onClick={() => setHistory(undoArtwork)}>Undo</button><button disabled={!history.future.length || working} onClick={() => setHistory(redoArtwork)}>Redo</button><label>Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[50,75,100,150,200].map(z => <option key={z} value={z}>{z === 100 ? "Fit" : z + "%"}</option>)}</select></label></div>
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" aria-label="Editor image file" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }}/>
    <div className="editor-body"><div className="editor-workspace"><div className="editor-stage" ref={stage}><div className="editor-artboard" ref={surface} tabIndex={0} role="group" aria-label="Editable canvas. Drag a layer to move it. Arrow keys move the selected layer." style={{ width: doc.width * scale, height: doc.height * scale }} onPointerDown={start} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()} onDoubleClick={() => { if (selected?.kind === "text") { titleField.current?.focus(); titleField.current?.select(); } }}>
      <canvas ref={canvas} aria-label="Artwork preview" />
      {selected && selected.visible && <div className="editor-selection" style={{ left: selected.x / doc.width * 100 + "%", top: selected.y / doc.height * 100 + "%", width: selected.width / doc.width * 100 + "%", height: selected.height / doc.height * 100 + "%", transform: `rotate(${selected.rotation}deg)` }}><span>{selected.locked ? "Locked · " : ""}{selected.name}</span>{!selected.locked && <button aria-label="Resize selected layer" onPointerDown={event => start(event, true)} />}</div>}
    </div></div><div className="editor-canvas-status"><span>{doc.width} × {doc.height} px</span><span>{doc.layers.length} {doc.layers.length === 1 ? "layer" : "layers"} · Drag to move · Corner to resize</span></div></div>
    <aside className="editor-inspector"><section><h3>Layers</h3><div className="editor-layers">{[...doc.layers].reverse().map(layer => <div key={layer.id}><button className={layer.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(layer.id)}>{layer.kind === "text" ? "T" : layer.kind === "image" ? "▧" : "■"}<span>{layer.kind === "text" ? layer.text.slice(0,24) || "Empty text" : layer.name}</span></button><button aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} onClick={() => commit({ ...doc, layers: doc.layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l) })}>{layer.visible ? "◉" : "○"}</button><button aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} onClick={() => commit({ ...doc, layers: doc.layers.map(l => l.id === layer.id ? { ...l, locked: !l.locked } : l) })}>{layer.locked ? "🔒" : "↕"}</button></div>)}</div></section>
    {selected ? <section><h3>{selected.kind === "text" ? "Text" : selected.kind === "shape" ? "Color panel" : "Image"} properties</h3>{selected.locked && <p className="editor-hint">Unlock this layer to move or resize it.</p>}<fieldset disabled={selected.locked || working}><label>Layer name<input aria-label="Layer name" maxLength={60} value={selected.name} onChange={e => patchSelected({ name: e.target.value })}/></label>
      {selected.kind === "text" && <><label>Text<textarea ref={titleField} aria-label="Layer text" value={selected.text} maxLength={1000} onChange={e => patchSelected({ text: e.target.value })}/></label><div className="editor-fields"><label>Font<select value={selected.font} onChange={e => patchSelected({ font: e.target.value as "inter" })}><option value="inter">Inter</option><option value="sora">Sora</option><option value="serif">Georgia</option><option value="mono">Monospace</option></select></label>{numeric("Font size", selected.fontSize, n => patchSelected({ fontSize: n }), 6, 1200)}</div><div className="editor-fields"><label>Alignment<select value={selected.align} onChange={e => patchSelected({ align: e.target.value as "left" })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Text color<input aria-label="Text color" type="color" value={selected.color} onChange={e => patchSelected({ color: e.target.value })}/></label></div><div className="editor-checks"><label><input type="checkbox" checked={selected.bold} onChange={e => patchSelected({ bold: e.target.checked })}/>Bold</label><label><input type="checkbox" checked={selected.shadow} onChange={e => patchSelected({ shadow: e.target.checked })}/>Shadow</label></div>{numeric("Outline", selected.outline, n => patchSelected({ outline: n }), 0, 30)}<p className="editor-hint">Resize the box if text is clipped. Double-click text on the canvas to type.</p></>}
      {selected.kind === "shape" && <label>Panel color<input type="color" value={selected.color} onChange={e => patchSelected({ color: e.target.value })}/></label>}
      <div className="editor-fields">{numeric("X position", selected.x, n => patchSelected({ x: n }))}{numeric("Y position", selected.y, n => patchSelected({ y: n }))}{numeric("Layer width", selected.width, n => patchSelected({ width: n, ...(selected.kind === "image" ? { height: selected.height * n / selected.width } : {}) }), 12)}{numeric("Layer height", selected.height, n => patchSelected({ height: n, ...(selected.kind === "image" ? { width: selected.width * n / selected.height } : {}) }), 12)}{numeric("Rotation", selected.rotation, n => patchSelected({ rotation: n }), -180, 180)}{numeric("Opacity %", selected.opacity * 100, n => patchSelected({ opacity: n / 100 }), 0, 100)}</div>
      <div className="editor-button-row"><button onClick={() => order(1)}>Forward</button><button onClick={() => order(-1)}>Backward</button><button onClick={() => patchSelected({ x: (doc.width - selected.width) / 2, y: (doc.height - selected.height) / 2 })}>Center</button><button onClick={duplicate}>Duplicate</button><button onClick={removeLayer}>Delete</button></div>
      {selected.kind === "image" && <div className="editor-button-row"><button onClick={() => { uploadAs.current = "layer"; input.current?.click(); }}>Replace image</button><button onClick={() => { const ratio = Math.min(doc.width / selected.width, doc.height / selected.height); patchSelected({ width: selected.width * ratio, height: selected.height * ratio, x: (doc.width - selected.width * ratio) / 2, y: (doc.height - selected.height * ratio) / 2, rotation: 0 }); }}>Fit image</button><button onClick={() => { const ratio = Math.max(doc.width / selected.width, doc.height / selected.height); patchSelected({ width: selected.width * ratio, height: selected.height * ratio, x: (doc.width - selected.width * ratio) / 2, y: (doc.height - selected.height * ratio) / 2, rotation: 0 }); }}>Fill canvas</button></div>}
    </fieldset></section> : <p className="editor-hint">Select a layer, or add text to start.</p>}
    <details className="editor-canvas-options"><summary>Canvas & size</summary><label>Preset<select value="" onChange={e => { const format = STUDIO_FORMATS.find(f => f.id === e.target.value); if (format) resizeCanvas(format.width, format.height); }}><option value="">Choose size…</option>{STUDIO_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label} · {f.width} × {f.height}</option>)}</select></label><div className="editor-fields"><label>Canvas width<input type="number" value={canvasWidth} onChange={e => setCanvasWidth(e.target.value)}/></label><label>Canvas height<input type="number" value={canvasHeight} onChange={e => setCanvasHeight(e.target.value)}/></label></div><button onClick={() => resizeCanvas()}>Apply size</button><p className="editor-hint">Keeps layer proportions. Reposition artwork to fill a different shape.</p><label>Background<input aria-label="Canvas background" type="color" value={doc.background === "transparent" ? "#ffffff" : doc.background} onChange={e => commit({ ...doc, background: e.target.value })}/></label><label className="editor-checkbox"><input type="checkbox" checked={doc.background === "transparent"} onChange={e => commit({ ...doc, background: e.target.checked ? "transparent" : "#141618" })}/>Transparent</label><button onClick={() => { uploadAs.current = "replace"; input.current?.click(); }}>Open another image</button></details>
    <details className="editor-help"><summary>Editing existing lettering</summary><p>Text inside an imported or AI-generated image is flattened pixels. Add a color panel over it and place a new text layer, or remove it with the separate AI tool. Text layers added here remain editable.</p><p>Uploads and drafts stay on this device. PNG and WebP preserve transparency; JPEG uses white behind transparent areas.</p></details></aside></div>
    <footer className="editor-footer"><div role="status">{error ? <span role="alert" className="editor-error">{error}</span> : working ? "Preparing artwork…" : notice || "Manual editing and exports use no credits."}</div><div><button disabled={working || !ready} onClick={() => void download("image/png")}>Export PNG</button><button disabled={working || !ready} onClick={() => void download("image/jpeg")}>JPEG</button><button disabled={working || !ready} onClick={() => void download("image/webp")}>WebP</button></div></footer>
  </dialog>;
}
