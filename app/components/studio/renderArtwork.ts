import type { ArtworkDocument, TextLayer } from "@/lib/artworkDocument";
const images = new Map<string, Promise<HTMLImageElement>>();
export function editorImage(src: string) {
  if (!/^(data:image\/(png|jpeg|webp|avif|bmp);base64,|\/(?!\/))/.test(src)) return Promise.reject(new Error("Use a local PNG, JPEG, WebP, AVIF or BMP image."));
  let promise = images.get(src);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => { images.delete(src); reject(new Error("Could not decode the image.")); }; image.src = src; });
    if (images.size >= 40) images.delete(images.keys().next().value!);
    images.set(src, promise);
  }
  return promise;
}
async function fonts() {
  const style = getComputedStyle(document.body);
  const inter = style.getPropertyValue("--font-body").trim() || "sans-serif", sora = style.getPropertyValue("--font-brand").trim() || "sans-serif";
  await Promise.all([document.fonts.load(`700 24px ${inter}`), document.fonts.load(`400 24px ${inter}`), document.fonts.load(`700 24px ${sora}`)]);
  return { inter, sora, serif: "Georgia, serif", mono: "monospace" };
}
// Both on-screen canvas and exported bitmap use this exact renderer.
export async function renderArtwork(doc: ArtworkDocument, target?: HTMLCanvasElement, jpeg = false, maxEdge?: number): Promise<HTMLCanvasElement> {
  const family = await fonts();
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(doc.layers.filter(layer => layer.kind === "image" && layer.visible).map(async layer => { if (layer.kind === "image") loaded.set(layer.src, await editorImage(layer.src)); }));
  // Render offscreen first so an older async render cannot leave a half-painted preview.
  const canvas = document.createElement("canvas"); const scale = maxEdge ? Math.min(1, maxEdge / Math.max(doc.width, doc.height)) : 1; canvas.width = Math.max(1, Math.round(doc.width * scale)); canvas.height = Math.max(1, Math.round(doc.height * scale));
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.scale(scale, scale);
  if (doc.background !== "transparent" || jpeg) { ctx.fillStyle = doc.background === "transparent" ? "#ffffff" : doc.background; ctx.fillRect(0, 0, doc.width, doc.height); }
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    ctx.save(); ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2); ctx.rotate(layer.rotation * Math.PI / 180); ctx.translate(-layer.width / 2, -layer.height / 2);
    if (layer.kind === "image") ctx.drawImage(loaded.get(layer.src)!, 0, 0, layer.width, layer.height);
    else if (layer.kind === "shape") { ctx.fillStyle = layer.color; ctx.fillRect(0, 0, layer.width, layer.height); }
    else drawText(ctx, layer, family[layer.font]);
    ctx.restore();
  }
  if (target) { target.width = canvas.width; target.height = canvas.height; target.getContext("2d")?.drawImage(canvas, 0, 0); }
  return canvas;
}
function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer, family: string) {
  ctx.font = `${layer.bold ? 700 : 400} ${layer.fontSize}px ${family}`;
  ctx.textBaseline = "top"; ctx.textAlign = layer.align; ctx.fillStyle = layer.color;
  const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
  const lines: string[] = [];
  for (const paragraph of layer.text.split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const token of paragraph.match(/\S+|\s+/g) || []) {
      if (line && ctx.measureText(line + token).width > layer.width) { lines.push(line.trimEnd()); line = ""; }
      if (!line && !token.trim()) continue;
      // Keep words together; only split a word that cannot fit on its own.
      for (const char of token) {
        if (line && ctx.measureText(line + char).width > layer.width) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  // The text box clips overflow identically in the preview and export.
  ctx.beginPath(); ctx.rect(-layer.outline, -layer.outline, layer.width + layer.outline * 2, layer.height + layer.outline * 2); ctx.clip();
  if (layer.shadow) { ctx.shadowColor = "rgba(0,0,0,.75)"; ctx.shadowBlur = layer.fontSize * .12; ctx.shadowOffsetY = layer.fontSize * .035; }
  lines.forEach((line, i) => { const y = i * layer.fontSize * layer.lineHeight; if (layer.outline) { ctx.strokeStyle = "#000000"; ctx.lineWidth = layer.outline * 2; ctx.lineJoin = "round"; ctx.strokeText(line, x, y); } ctx.fillText(line, x, y); });
}
export async function importArtworkFile(file: File) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Use PNG, JPEG, WebP, AVIF or BMP, up to 20 MB.");
  // Some browsers leave File.type empty. Inspect bytes instead of trusting the extension.
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const mime = bytes[0] === 137 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? "image/webp"
    : ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 32)) ? "image/avif"
    : ascii(0, 2) === "BM" ? "image/bmp" : "";
  if (!mime) throw new Error("Use PNG, JPEG, WebP, AVIF or BMP, up to 20 MB.");
  const normalized = new Blob([file], { type: mime });
  const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(normalized); });
  const image = await editorImage(src);
  if (image.width * image.height > 12_000_000 || Math.max(image.width, image.height) > 6000 || Math.min(image.width, image.height) < 32) throw new Error("Use images from 32 to 6,000 px, up to 12 megapixels.");
  return { src, width: image.width, height: image.height };
}
export async function artworkBlob(doc: ArtworkDocument, mime: "image/png" | "image/jpeg" | "image/webp") {
  const canvas = await renderArtwork(doc, undefined, mime === "image/jpeg");
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, .95));
  if (!blob) throw new Error("Could not encode image.");
  return blob;
}
