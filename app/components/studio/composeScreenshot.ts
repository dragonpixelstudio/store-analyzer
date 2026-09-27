"use client";

import type { ScreenshotTemplate, ShotPalette, ShotSize } from "@/lib/studio";

// Renders a store screenshot from the developer's REAL gameplay capture plus a
// caption, entirely in the browser. The gameplay pixels are placed, never
// regenerated - so the screenshot stays an honest picture of the game.

export type ScreenshotText = { name: string; text: string; x: number; y: number; width: number; height: number; fontSize: number; color: string; align: "center" | "left"; lineHeight: number };
export type ComposeOptions = {
  textLayers?: ScreenshotText[];
  capture: CanvasImageSource & { width: number; height: number };
  template: ScreenshotTemplate;
  size: ShotSize;
  palette: ShotPalette;
  headline: string;
  subline?: string;
  fontFamily: string;
};

type Rect = { x: number; y: number; w: number; h: number };

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

/** Draw the capture into rect with cover-fit (center crop). */
function drawCover(ctx: CanvasRenderingContext2D, img: ComposeOptions["capture"], r: Rect) {
  const scale = Math.max(r.w / img.width, r.h / img.height);
  const sw = r.w / scale;
  const sh = r.h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
}

function framedCapture(
  ctx: CanvasRenderingContext2D,
  img: ComposeOptions["capture"],
  r: Rect,
  radius: number,
  accent: string,
  unit: number
) {
  // soft glow behind the frame (canvas shadow - no SVG filter box artifacts)
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = unit * 3.2;
  ctx.fillStyle = "#000";
  roundRectPath(ctx, r, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, r, radius);
  ctx.clip();
  drawCover(ctx, img, r);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, unit * 0.28);
  roundRectPath(ctx, r, radius);
  ctx.stroke();
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (<= startSize) at which text fits in maxLines lines. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  startSize: number,
  maxWidth: number,
  maxLines: number
) {
  let size = startSize;
  let lines: string[] = [];
  while (size > 12) {
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
    lines = wrapLines(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (lines.length <= maxLines && widest <= maxWidth) break;
    size *= 0.92;
  }
  return { size: Math.round(size), lines };
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  opts: {
    layers?: ScreenshotText[];
    headline: string;
    subline?: string;
    family: string;
    accent: string;
    box: Rect;
    align: "center" | "left";
    headSize: number;
    maxLines: number;
    unit: number;
  }
) {
  const { box, align, family, unit } = opts;
  const head = fitText(ctx, opts.headline, family, 800, opts.headSize, box.w, opts.maxLines);
  const lineGap = head.size * 1.08;
  const sub = opts.subline
    ? fitText(ctx, opts.subline, family, 600, head.size * 0.42, box.w, 2)
    : null;
  const subGap = sub ? sub.size * 1.3 : 0;
  const barH = Math.max(4, unit * 0.45);
  const total = barH + unit * 1.6 + head.lines.length * lineGap + (sub ? unit * 1.2 + sub.lines.length * subGap : 0);

  let y = box.y + (box.h - total) / 2;
  const x = align === "center" ? box.x + box.w / 2 : box.x;

  // accent bar
  const barW = unit * 7;
  ctx.fillStyle = opts.accent;
  ctx.beginPath();
  ctx.roundRect(align === "center" ? x - barW / 2 : x, y, barW, barH, barH / 2);
  ctx.fill();
  y += barH + unit * 1.6;

  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = `800 ${head.size}px ${family}`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = unit * 1.2;
  if (opts.layers) opts.layers.push({ name: "Headline", text: head.lines.join("\n"), x: box.x, y, width: box.w, height: head.lines.length * lineGap + head.size * .2, fontSize: head.size, color: "#ffffff", align, lineHeight: 1.08 });
  for (const line of head.lines) {
    if (!opts.layers) ctx.fillText(line, x, y);
    y += lineGap;
  }
  ctx.shadowBlur = 0;

  if (sub) {
    y += unit * 1.2;
    ctx.font = `600 ${sub.size}px ${family}`;
    ctx.fillStyle = opts.accent;
    if (opts.layers) opts.layers.push({ name: "Subline", text: sub.lines.join("\n"), x: box.x, y, width: box.w, height: sub.lines.length * subGap + sub.size * .2, fontSize: sub.size, color: opts.accent, align, lineHeight: 1.3 });
    for (const line of sub.lines) {
      if (!opts.layers) ctx.fillText(line, x, y);
      y += subGap;
    }
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, p: ShotPalette) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, p.from);
  g.addColorStop(1, p.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, Math.max(W, H) * 0.7);
  glow.addColorStop(0, `${p.accent}33`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

export function composeScreenshot(opts: ComposeOptions): HTMLCanvasElement {
  const { width: W, height: H } = opts.size;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  if (opts.size.id === "steam-1080") {
    const scale = Math.min(W / opts.capture.width, H / opts.capture.height);
    const width = opts.capture.width * scale;
    const height = opts.capture.height * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(opts.capture, (W-width)/2, (H-height)/2, width, height);
    return canvas;
  }
  const unit = Math.min(W, H) / 100;
  const { palette: p, capture: img, fontFamily: family } = opts;
  paintBackground(ctx, W, H, p);

  switch (opts.template.layout) {
    case "headline-top": {
      const band = H * 0.2;
      drawTextBlock(ctx, {
        layers: opts.textLayers,
        headline: opts.headline,
        subline: opts.subline,
        family,
        accent: p.accent,
        box: { x: W * 0.06, y: 0, w: W * 0.88, h: band },
        align: "center",
        headSize: H * 0.072,
        maxLines: 1,
        unit,
      });
      const fh = H * 0.72;
      const fw = Math.min(W * 0.92, (fh * 16) / 9);
      framedCapture(ctx, img, { x: (W - fw) / 2, y: band + H * 0.02, w: fw, h: fh }, unit * 1.8, p.accent, unit);
      break;
    }
    case "side-panel": {
      const panelW = W * 0.34;
      drawTextBlock(ctx, {
        layers: opts.textLayers,
        headline: opts.headline,
        subline: opts.subline,
        family,
        accent: p.accent,
        box: { x: W * 0.045, y: H * 0.1, w: panelW - W * 0.07, h: H * 0.8 },
        align: "left",
        headSize: H * 0.085,
        maxLines: 4,
        unit,
      });
      framedCapture(
        ctx,
        img,
        { x: W * 0.36, y: H * 0.07, w: W * 0.6, h: H * 0.86 },
        unit * 1.8,
        p.accent,
        unit
      );
      break;
    }
    case "caption-top": {
      const band = H * 0.27;
      drawTextBlock(ctx, {
        layers: opts.textLayers,
        headline: opts.headline,
        subline: opts.subline,
        family,
        accent: p.accent,
        box: { x: W * 0.08, y: H * 0.02, w: W * 0.84, h: band },
        align: "center",
        headSize: W * 0.1,
        maxLines: 3,
        unit,
      });
      framedCapture(
        ctx,
        img,
        { x: W * 0.06, y: band + H * 0.02, w: W * 0.88, h: H * 0.66 },
        unit * 3.5,
        p.accent,
        unit
      );
      break;
    }
    case "caption-bottom": {
      const imgH = H * 0.74;
      drawCover(ctx, img, { x: 0, y: 0, w: W, h: imgH });
      const fade = ctx.createLinearGradient(0, imgH - H * 0.14, 0, imgH + 2);
      fade.addColorStop(0, "transparent");
      fade.addColorStop(1, p.to);
      ctx.fillStyle = fade;
      ctx.fillRect(0, imgH - H * 0.14, W, H * 0.14 + 2);
      ctx.fillStyle = p.to;
      ctx.fillRect(0, imgH, W, H - imgH);
      drawTextBlock(ctx, {
        layers: opts.textLayers,
        headline: opts.headline,
        subline: opts.subline,
        family,
        accent: p.accent,
        box: { x: W * 0.08, y: imgH, w: W * 0.84, h: H - imgH },
        align: "center",
        headSize: W * 0.095,
        maxLines: 2,
        unit,
      });
      break;
    }
  }

  return canvas;
}

/** The site's brand font family (next/font generates a hashed name). */
export async function brandFontFamily(): Promise<string> {
  const probe = document.createElement("span");
  probe.className = "font-brand";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.textContent = "Aa";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || "sans-serif";
  probe.remove();
  try {
    await document.fonts.load(`800 48px ${family}`);
    await document.fonts.load(`600 24px ${family}`);
  } catch {
    // falls back to the next family in the stack
  }
  return family;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
