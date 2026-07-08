import sharp from "sharp";

export type IconPolishMode = "controlled" | "strong";

export type PolishedIcon = {
  base64: string;
  mimeType: "image/png";
  debug: {
    mode: IconPolishMode;
    sourceWidth: number;
    sourceHeight: number;
    crop: { left: number; top: number; width: number; height: number };
  };
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function emptyBounds(width: number, height: number): Bounds {
  return { minX: width, minY: height, maxX: 0, maxY: 0 };
}

function include(bounds: Bounds, x: number, y: number) {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
}

function isValidBounds(bounds: Bounds) {
  return bounds.maxX > bounds.minX && bounds.maxY > bounds.minY;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function squareCropAroundBounds(
  bounds: Bounds,
  width: number,
  height: number,
  mode: IconPolishMode
) {
  const maxAllowedSide = Math.min(width, height);
  // HARD ZOOM GUARANTEE: the crop must always be meaningfully tighter than
  // the source, or the "polish" is invisible. This is the correction for the
  // no-op case where salient pixels span the frame diagonally (e.g. orb
  // bottom-left + diamond top-right) and a plain bounding box degrades to a
  // full-frame crop. Controlled keeps more atmosphere; strong reads bigger.
  const maxCoverage = mode === "controlled" ? 0.88 : 0.78;
  const minCoverage = mode === "controlled" ? 0.72 : 0.6;

  if (!isValidBounds(bounds)) {
    const side = Math.round(maxAllowedSide * maxCoverage);
    return {
      left: Math.floor((width - side) / 2),
      top: Math.floor((height - side) / 2),
      width: side,
      height: side,
    };
  }

  const boxW = bounds.maxX - bounds.minX + 1;
  const boxH = bounds.maxY - bounds.minY + 1;
  const cx = bounds.minX + boxW / 2;
  const cy = bounds.minY + boxH / 2;

  const padding = mode === "controlled" ? 0.22 : 0.12;
  const wantedSide = Math.max(boxW, boxH) * (1 + padding * 2);
  const side = Math.round(
    clamp(wantedSide, maxAllowedSide * minCoverage, maxAllowedSide * maxCoverage)
  );

  let left = Math.round(cx - side / 2);
  let top = Math.round(cy - side / 2);
  left = clamp(left, 0, width - side);
  top = clamp(top, 0, height - side);

  return { left, top, width: side, height: side };
}

function percentileInterval(
  weights: Float64Array,
  lo: number,
  hi: number
): { start: number; end: number } | null {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return null;

  let acc = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (start < 0 && acc >= total * lo) start = i;
    if (acc >= total * hi) {
      end = i;
      break;
    }
  }
  if (start < 0) start = 0;
  if (end < 0) end = weights.length - 1;
  return { start, end };
}

async function findSalientBounds(buffer: Buffer): Promise<{
  width: number;
  height: number;
  bounds: Bounds;
}> {
  const probeSize = 256;
  const meta = await sharp(buffer).metadata();
  const sourceWidth = meta.width ?? probeSize;
  const sourceHeight = meta.height ?? probeSize;

  const { data, info } = await sharp(buffer)
    .resize(probeSize, probeSize, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Accumulate salient weight per column and per row, then take the
  // 4th-96th percentile mass interval. Sparse streaks and stray sparks can
  // no longer stretch the bounds to the full frame, which previously made
  // the crop a no-op on diagonal compositions.
  const colWeight = new Float64Array(info.width);
  const rowWeight = new Float64Array(info.height);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 24) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Focus on the real readable neon subject group, not faint atmosphere.
      const strongNeon = max >= 142 && (saturation >= 46 || luma >= 150);
      const whiteCore = luma >= 178 && saturation <= 96;
      if (!strongNeon && !whiteCore) continue;

      // Weight by luminance so bright cores anchor the crop more than glow.
      const w = luma / 255;
      colWeight[x] += w;
      rowWeight[y] += w;
    }
  }

  const xi = percentileInterval(colWeight, 0.04, 0.96);
  const yi = percentileInterval(rowWeight, 0.04, 0.96);

  const bounds = emptyBounds(info.width, info.height);
  if (xi && yi) {
    include(bounds, xi.start, yi.start);
    include(bounds, xi.end, yi.end);
  }

  if (!isValidBounds(bounds)) {
    return {
      width: sourceWidth,
      height: sourceHeight,
      bounds: { minX: 0, minY: 0, maxX: -1, maxY: -1 },
    };
  }

  const scaleX = sourceWidth / info.width;
  const scaleY = sourceHeight / info.height;
  return {
    width: sourceWidth,
    height: sourceHeight,
    bounds: {
      minX: Math.floor(bounds.minX * scaleX),
      minY: Math.floor(bounds.minY * scaleY),
      maxX: Math.ceil(bounds.maxX * scaleX),
      maxY: Math.ceil(bounds.maxY * scaleY),
    },
  };
}

export async function makeDeterministicIconPolish(
  buffer: Buffer,
  mode: IconPolishMode
): Promise<PolishedIcon> {
  const { width, height, bounds } = await findSalientBounds(buffer);
  const crop = squareCropAroundBounds(bounds, width, height, mode);
  const outputSize = Math.min(Math.max(Math.min(width, height), 512), 2048);

  const contrast = mode === "controlled" ? 1.06 : 1.1;
  const brightness = mode === "controlled" ? 1.015 : 1.025;
  const saturation = mode === "controlled" ? 1.04 : 1.08;
  const sharpenSigma = mode === "controlled" ? 0.75 : 0.95;

  const png = await sharp(buffer)
    .extract(crop)
    .resize(outputSize, outputSize, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
    })
    .modulate({ brightness, saturation })
    .linear(contrast, -(contrast - 1) * 18)
    .sharpen({ sigma: sharpenSigma, m1: 0.8, m2: 1.8, x1: 2, y2: 10, y3: 20 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    base64: png.toString("base64"),
    mimeType: "image/png",
    debug: { mode, sourceWidth: width, sourceHeight: height, crop },
  };
}

// ---------------------------------------------------------------------------
// Aspect-preserving polish for capsules and feature graphics.
// Same saliency + hard-zoom-guarantee approach as icons, but the crop window
// keeps the source aspect ratio so logos and wide compositions survive.
// ---------------------------------------------------------------------------

export async function makeDeterministicWidePolish(
  buffer: Buffer,
  mode: IconPolishMode
): Promise<PolishedIcon> {
  const { width, height, bounds } = await findSalientBounds(buffer);
  const aspect = width / height;

  // Gentler caps than icons: capsules carry logos near edges, so we trim
  // less, but the change must still be visible. 0.92 / 0.84 of frame.
  const maxCoverage = mode === "controlled" ? 0.92 : 0.84;

  let crop: { left: number; top: number; width: number; height: number };
  if (!isValidBounds(bounds)) {
    const w = Math.round(width * maxCoverage);
    const h = Math.round(w / aspect);
    crop = {
      left: Math.floor((width - w) / 2),
      top: Math.floor((height - h) / 2),
      width: w,
      height: h,
    };
  } else {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const w = Math.round(width * maxCoverage);
    const h = Math.round(w / aspect);
    crop = {
      left: Math.round(clamp(cx - w / 2, 0, width - w)),
      top: Math.round(clamp(cy - h / 2, 0, height - h)),
      width: w,
      height: Math.min(h, height),
    };
  }

  const contrast = mode === "controlled" ? 1.07 : 1.11;
  const brightness = mode === "controlled" ? 1.02 : 1.03;
  const saturation = mode === "controlled" ? 1.06 : 1.1;
  const sharpenSigma = mode === "controlled" ? 0.8 : 1.0;

  const png = await sharp(buffer)
    .extract(crop)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .modulate({ brightness, saturation })
    .linear(contrast, -(contrast - 1) * 18)
    .sharpen({ sigma: sharpenSigma, m1: 0.8, m2: 1.8, x1: 2, y2: 10, y3: 20 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    base64: png.toString("base64"),
    mimeType: "image/png",
    debug: { mode, sourceWidth: width, sourceHeight: height, crop },
  };
}

// ---------------------------------------------------------------------------
// Difference gate: measures how visibly a generated variant differs from the
// original. Near-copies score under ~5; clearly edited images score 10+.
// ---------------------------------------------------------------------------

export async function visibleDifferenceScore(
  originalBuffer: Buffer,
  variantBase64: string
): Promise<number> {
  const size = 128;
  const toGray = (b: Buffer) =>
    sharp(b).resize(size, size, { fit: "fill" }).grayscale().raw().toBuffer();
  const [a, b] = await Promise.all([
    toGray(originalBuffer),
    toGray(Buffer.from(variantBase64, "base64")),
  ]);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
