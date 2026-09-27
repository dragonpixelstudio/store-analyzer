import { newText, type ArtworkDocument, type ImageLayer, type ShapeLayer, type TextLayer } from "./artworkDocument";
import { studioFormat } from "./studioFormats";

export type LayeredTemplate = { id: string; title: string; game: string; tagline: string; type: "capsule" | "icon" | "thumbnail"; formatId: string; theme: "ember" | "orbit"; accent: string };
export const LAYERED_TEMPLATES: LayeredTemplate[] = [
  { id: "ember-capsule", title: "Lantern & ruins", game: "EMBERFALL", tagline: "Find the light beyond the ruins", type: "capsule", formatId: "steam-header", theme: "ember", accent: "#ffc978" },
  { id: "orbit-capsule", title: "Beyond the horizon", game: "ORBIT ZERO", tagline: "One pilot. An uncharted universe.", type: "capsule", formatId: "steam-header", theme: "orbit", accent: "#8ae8ee" },
  { id: "ember-icon", title: "Ranger emblem", game: "EMBER", tagline: "", type: "icon", formatId: "play-icon", theme: "ember", accent: "#ffc978" },
  { id: "orbit-icon", title: "Starship emblem", game: "ORBIT", tagline: "", type: "icon", formatId: "play-icon", theme: "orbit", accent: "#8ae8ee" },
  { id: "ember-thumbnail", title: "Into the ruins", game: "INTO THE RUINS", tagline: "A new adventure begins", type: "thumbnail", formatId: "video-hd", theme: "ember", accent: "#ffc978" },
  { id: "orbit-thumbnail", title: "First contact", game: "FIRST CONTACT", tagline: "Explore beyond the known stars", type: "thumbnail", formatId: "video-hd", theme: "orbit", accent: "#8ae8ee" },
];

// The bitmap assets contain no lettering. Every title and accent below stays editable.
export function layeredArtwork(template: LayeredTemplate): ArtworkDocument {
  const { width, height } = studioFormat(template.type, template.formatId);
  const doc: ArtworkDocument = { version: 1, width, height, background: "#101318", layers: [] };
  const base = { rotation: 0, opacity: 1, visible: true, locked: false };
  const image = (name: string, src: string, x: number, y: number, w: number, h: number): ImageLayer => ({ ...base, id: crypto.randomUUID(), kind: "image", name, src, x, y, width: w, height: h });
  const panel = (name: string, color: string, x: number, y: number, w: number, h: number, opacity = 1): ShapeLayer => ({ ...base, id: crypto.randomUUID(), kind: "shape", name, color, x, y, width: w, height: h, opacity });
  const text = (name: string, value: string, x: number, y: number, w: number, size: number, color: string): TextLayer => ({ ...newText(doc, value), name, x, y, width: w, height: size * 2.6, fontSize: size, color, align: "left", font: template.theme === "ember" ? "serif" : "sora", lineHeight: 1.1, shadow: true });
  const scale = Math.max(width / 1536, height / 1024);
  doc.layers.push(image("Background", `/gallery/layers/${template.theme}-background.webp`, (width - 1536 * scale) / 2, (height - 1024 * scale) / 2, 1536 * scale, 1024 * scale));
  const icon = template.type === "icon";
  doc.layers.push(panel("Contrast panel", "#0b1019", 0, 0, icon ? width : width * .57, height, icon ? .25 : .68));
  const ratio = template.theme === "ember" ? 2 / 3 : 1.5; const heroHeight = icon ? Math.min(height * .78, width * .9 / ratio) : height * (template.theme === "ember" ? 1.06 : .8), heroWidth = heroHeight * ratio;
  doc.layers.push(image(template.theme === "ember" ? "Ranger" : "Starship", `/gallery/layers/${template.theme}-subject.webp`, icon ? (width - heroWidth) / 2 : width * .7 - heroWidth / 2, icon ? height * .04 : height - heroHeight, heroWidth, heroHeight));
  const x = icon ? width * .06 : width * .055, titleY = icon ? height * .77 : height * .3;
  if (icon) doc.layers.push(panel("Title backing", "#0b1019", 0, height * .75, width, height * .25, .84));
  doc.layers.push(panel("Accent", template.accent, x, icon ? height * .735 : height * .23, width * .13, Math.max(3, height * .008)));
  const title = text("Title", template.game, x, titleY, width * (icon ? .88 : .52), height * (icon ? .105 : .115), template.accent);
  if (icon) title.align = "center";
  doc.layers.push(title);
  if (template.tagline) doc.layers.push({ ...text("Subtitle", template.tagline, x, height * .64, width * .48, height * .038, "#edf0f4"), font: "inter", bold: false });
  return doc;
}
