import sharp from "sharp";

// Consistency layer: the same artwork exported at different resolutions must
// produce the same review. Every image is resampled to one canonical review
// scale before Gemini sees it, and cache keys use a perceptual signature of
// the normalized pixels instead of a byte hash - so a 460px and a 920px
// export of the same capsule resolve to the same cached report.

export const ANALYSIS_EDGE = 768;

export async function normalizeForAnalysis(
  buffer: Buffer
): Promise<{ base64: string; mimeType: string }> {
  const png = await sharp(buffer)
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return { base64: png.toString("base64"), mimeType: "image/png" };
}

// 256-bit difference hash on 16 rows plus a coarse 4x4 color signature.
// Robust to rescaling and re-encoding; distinct for genuinely different art.
export async function perceptualSignature(buffer: Buffer): Promise<string> {
  // Flatten transparency onto black FIRST: without this, transparent regions
  // carry undefined RGB that shifts with resampling, and the same transparent
  // icon at two export sizes fails the color check.
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(17, 16, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let dhash = "";
  for (let y = 0; y < 16; y++) {
    let nibble = 0;
    let count = 0;
    for (let x = 0; x < 16; x++) {
      nibble = (nibble << 1) | (data[y * 17 + x] > data[y * 17 + x + 1] ? 1 : 0);
      count++;
      if (count === 4) {
        dhash += nibble.toString(16);
        nibble = 0;
        count = 0;
      }
    }
  }

  const { data: rgb } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(4, 4, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let color = "";
  for (let i = 0; i < rgb.length; i++) {
    color += (rgb[i] >> 5).toString(8); // 8 levels per channel
  }

  return `${dhash}-${color}`;
}

export function aspectLabel(widthPx: number, heightPx: number): string {
  if (!widthPx || !heightPx) return "unknown";
  return `${(widthPx / heightPx).toFixed(2)}:1`;
}

// Resampling flips a handful of bits, so cache lookups must be tolerant:
// the same art rescaled measures ~24/256 dhash bits apart, while different
// artworks land at 100+. 48 bits with a one-level color tolerance separates
// the two cleanly.
const MAX_DHASH_BITS = 48;

function singleSignatureClose(a: string, b: string): boolean {
  const [da, ca] = a.split("-");
  const [db, cb] = b.split("-");
  if (!da || !db || !ca || !cb || da.length !== db.length || ca.length !== cb.length) {
    return false;
  }

  let bits = 0;
  for (let i = 0; i < da.length; i++) {
    let x = parseInt(da[i], 16) ^ parseInt(db[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
    if (bits > MAX_DHASH_BITS) return false;
  }

  // One color cell may exceed the one-level tolerance (edge cells straddle
  // quantization boundaries when resampling); genuinely different art fails
  // by a wide margin (~17 violating cells measured).
  let colorViolations = 0;
  for (let i = 0; i < ca.length; i++) {
    if (Math.abs(parseInt(ca[i], 8) - parseInt(cb[i], 8)) > 1) {
      colorViolations++;
      if (colorViolations > 1) return false;
    }
  }

  return true;
}

/** Compare "|"-joined multi-asset signatures; every asset must match. */
export function signaturesClose(a: string, b: string): boolean {
  const as = a.split("|");
  const bs = b.split("|");
  if (as.length !== bs.length) return false;
  return as.every((sig, i) => singleSignatureClose(sig, bs[i]));
}
