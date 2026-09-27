// Serializable artwork model. Geometry is always in export pixels, never CSS pixels.
export type LayerBase = { id: string; name: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean };
export type ImageLayer = LayerBase & { kind: "image"; src: string };
export type TextLayer = LayerBase & { kind: "text"; text: string; font: "inter" | "sora" | "serif" | "mono"; fontSize: number; bold: boolean; color: string; align: "left" | "center" | "right"; lineHeight: number; outline: number; shadow: boolean };
export type ShapeLayer = LayerBase & { kind: "shape"; color: string };
export type ArtworkLayer = ImageLayer | TextLayer | ShapeLayer;
export type ArtworkDocument = { version: 1; width: number; height: number; background: string; layers: ArtworkLayer[] };
export const MAX_PIXELS = 12_000_000;
export const MAX_LAYERS = 32;
export function validDimensions(width: number, height: number) { return Number.isInteger(width) && Number.isInteger(height) && width >= 32 && height >= 32 && width <= 6000 && height <= 6000 && width * height <= MAX_PIXELS; }
export function makeArtwork(src: string, width: number, height: number): ArtworkDocument {
  if (!validDimensions(width, height)) throw new Error("Use dimensions from 32 to 6,000 px, up to 12 megapixels.");
  return { version: 1, width, height, background: "transparent", layers: [{ id: crypto.randomUUID(), name: "Original image", kind: "image", src, x: 0, y: 0, width, height, rotation: 0, opacity: 1, visible: true, locked: true }] };
}
export function newText(doc: ArtworkDocument, text = "Your title"): TextLayer {
  const fontSize = Math.round(Math.min(doc.width, doc.height) * .11);
  return { id: crypto.randomUUID(), name: "Text", kind: "text", text, x: doc.width * .1, y: doc.height * .65, width: doc.width * .8, height: fontSize * 2.5, rotation: 0, opacity: 1, visible: true, locked: false, font: "inter", fontSize, bold: true, color: "#ffffff", align: "center", lineHeight: 1.2, outline: 0, shadow: true };
}
export function localPoint(layer: LayerBase, x: number, y: number) {
  const angle = -layer.rotation * Math.PI / 180, dx = x - layer.x - layer.width / 2, dy = y - layer.y - layer.height / 2;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle) + layer.width / 2, y: dx * Math.sin(angle) + dy * Math.cos(angle) + layer.height / 2 };
}
export function hitLayer(doc: ArtworkDocument, x: number, y: number) {
  return [...doc.layers].reverse().find(layer => { if (!layer.visible || layer.locked) return false; const p = localPoint(layer, x, y); return p.x >= 0 && p.y >= 0 && p.x <= layer.width && p.y <= layer.height; });
}
export function resizeArtwork(doc: ArtworkDocument, width: number, height: number): ArtworkDocument {
  if (!validDimensions(width, height)) throw new Error("Use dimensions from 32 to 6,000 px, up to 12 megapixels.");
  // Uniform scale + center keeps text and artwork undistorted when changing aspect ratio.
  const scale = Math.min(width / doc.width, height / doc.height), dx = (width - doc.width * scale) / 2, dy = (height - doc.height * scale) / 2;
  return { ...doc, width, height, layers: doc.layers.map(layer => ({ ...layer, x: layer.x * scale + dx, y: layer.y * scale + dy, width: layer.width * scale, height: layer.height * scale, ...(layer.kind === "text" ? { fontSize: layer.fontSize * scale, outline: layer.outline * scale } : {}) })) };
}
export type ArtworkHistory = { past: ArtworkDocument[]; present: ArtworkDocument; future: ArtworkDocument[] };
export function commitArtwork(history: ArtworkHistory, next: ArtworkDocument): ArtworkHistory {
  if (history.present === next) return history;
  return { past: [...history.past, history.present].slice(-30), present: next, future: [] };
}
export function undoArtwork(history: ArtworkHistory): ArtworkHistory { const doc = history.past.at(-1); return doc ? { past: history.past.slice(0, -1), present: doc, future: [history.present, ...history.future] } : history; }
export function redoArtwork(history: ArtworkHistory): ArtworkHistory { const doc = history.future[0]; return doc ? { past: [...history.past, history.present].slice(-30), present: doc, future: history.future.slice(1) } : history; }
