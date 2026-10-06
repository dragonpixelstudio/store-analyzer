import { currentJobBilling } from "@/lib/jobContext";
import { reviewAccess, reserveReview, settleReview, type ReviewReservation } from "@/lib/reviewBilling";
import { AnalyzerProviderError } from "@/lib/analyzerProvider";
import { analyzeArtwork, AnalysisCapacityError } from "@/lib/analysisEngine";
import { ReviewBusyError, ReviewStorageError } from "@/lib/analysisConsistency";
import { sandboxAnalysis } from "@/lib/sandboxAnalysis";
import { validateImageInput } from "@/lib/imageInput";
import { sameOrigin } from "@/lib/wallet";
import { localFixturesEnabled } from "@/lib/storageScope";
import { boundedFormData } from "@/lib/requestBody";
import sharp from "sharp";
import {
  type AnalyzerAssetMeta,
  type AnalyzerPlatform,
} from "@/lib/analyzerPrompt";
import {
  stringValue,
  MAX_CREATIVES,
  MAX_SCREENSHOTS,
  type CalculatedReport,
  type Observations,
} from "@/lib/analyzerCore";
import { saveReport, type StoredReportAsset } from "@/lib/reportStore";
import { identifyAsset, ROLE_LABEL } from "@/lib/storeSpecs";
import type { BenchmarkEvidence } from "@/lib/iconEvidence";
import {
  isBenchmarkGenre,
  type BenchmarkGenre,
} from "@/lib/benchmarkCatalog";
import { reviewWalletLimit, ipRatelimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;



const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per image
const MAX_IMAGE_PIXELS = 12_000_000;
type JsonBody =
  | {
      error: string;
      code?: string;
      canUseCredits?: boolean;
    }
  | {
      observations: Observations;
      calculated: CalculatedReport;
      verdict: string;
      reportId?: string;
      specNotes?: string[];
      benchmarkEvidence?: BenchmarkEvidence[];
    };

function jsonResponse(body: JsonBody, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Vary", "Origin");

  return Response.json(body, {
    ...init,
    headers,
  });
}

function platformValue(value: FormDataEntryValue | null): AnalyzerPlatform {
  if (value === "steam" || value === "google-play" || value === "app-store") {
    return value;
  }

  return "unknown";
}

function genreOverrideValue(
  value: FormDataEntryValue | null
): BenchmarkGenre | null {
  return isBenchmarkGenre(value) ? value : null;
}

function sniffImageMime(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function readUInt24LE(buf: Buffer, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

function getImageDimensions(
  buf: Buffer,
  mime: string
): { width: number; height: number } | null {
  if (mime === "image/png" && buf.length >= 24) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (mime === "image/jpeg") {
    let offset = 2;
    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
      0xce, 0xcf,
    ]);

    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);

      if (sofMarkers.has(marker)) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }

      if (length < 2) return null;
      offset += 2 + length;
    }
  }

  if (
    mime === "image/webp" &&
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);

    if (chunk === "VP8X" && buf.length >= 30) {
      return {
        width: readUInt24LE(buf, 24) + 1,
        height: readUInt24LE(buf, 27) + 1,
      };
    }

    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    if (chunk === "VP8 " && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  return null;
}

type ImagePartResult =
  | {
      dimensions: { width: number; height: number };
      buffer: Buffer;
    }
  | { error: string };

// Deterministic export-size guidance, computed server-side so it can never
// leak into the model's observations and shift the score. Driven by the
// store-spec database: dimensions that exactly match a known store size (or a
// clean multiple) identify the asset, so a 920×430 upload is recognised as a
// native Steam header capsule instead of being lectured about Play sizes.
function specNoteFor(meta: AnalyzerAssetMeta): string | null {
  const { providedKind, widthPx, heightPx } = meta;
  const match = identifyAsset(widthPx, heightPx);

  if (match && match.confidence === "exact" && match.spec.role !== providedKind) {
    const scaleNote =
      Math.abs(match.scale - 1) > 0.01 ? ` (${match.spec.baseW}×${match.spec.baseH} ×${+match.scale.toFixed(2)})` : "";
    return `${widthPx}×${heightPx} is exactly the ${match.spec.name} size${scaleNote}, but it was reviewed as a ${ROLE_LABEL[providedKind].toLowerCase()}. If it's really a ${match.spec.name}, switch its type and re-analyze for a platform-accurate review.`;
  }

  if (match && match.spec.role === providedKind && match.scale < 0.99) {
    return `${ROLE_LABEL[providedKind]} uploaded at ${widthPx}×${heightPx} - export at least ${match.spec.baseW}×${match.spec.baseH} for the ${match.spec.name}. This does not affect the score.`;
  }

  if (!match) {
    if (providedKind === "icon" && (widthPx < 512 || heightPx < 512)) {
      return `Icon uploaded at ${widthPx}×${heightPx} - export at 512×512 for Google Play (1024×1024 for the App Store). This does not affect the score.`;
    }
    if (providedKind === "steamCapsule" && widthPx < 920) {
      return `Capsule uploaded at ${widthPx}×${heightPx} - Steam's header capsule needs 920×430. This does not affect the score.`;
    }
    if (providedKind === "featureGraphic" && widthPx < 1024) {
      return `Feature graphic uploaded at ${widthPx}×${heightPx} - Google Play expects 1024×500. This does not affect the score.`;
    }
  }
  return null;
}

async function prepareImagePart(
  file: File,
  label: string
): Promise<ImagePartResult> {
  if (file.size === 0) {
    return { error: `${label} is empty.` };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: `${label} is too large. Max size is 2 MB.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(buffer);

  if (!mime) {
    return {
      error: `${label} must be a real PNG, JPEG, or WebP image.`,
    };
  }
  try {
    await validateImageInput(buffer);
  } catch {
    return { error: `${label} must be a valid single PNG, JPEG, or WebP image up to 12 megapixels.` };
  }
  const dimensions = getImageDimensions(buffer, mime);
  if (!dimensions) {
    return {
      error: `${label} dimensions could not be read. Try exporting as PNG, JPEG, or WebP again.`,
    };
  }

  if (
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    return {
      error: `${label} is too large in pixel dimensions. Max is 12 megapixels.`,
    };
  }

  return {
    dimensions,
    buffer,
  };
}

// Small preview thumbnails embedded in the shareable report. Kept tiny so the
// whole stored report stays well under Upstash request limits.
async function makeReportThumb(buffer: Buffer): Promise<string> {
  try {
    const webp = await sharp(buffer)
      .rotate().toColourspace("srgb")
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return `data:image/webp;base64,${webp.toString("base64")}`;
  } catch (err) {
    console.error(
      "report thumb failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return "";
  }
}

export async function OPTIONS(req: Request) {
  if (!sameOrigin(req)) {
    return new Response(null, {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Origin",
      },
    });
  }

  const origin =
    req.headers.get("origin") || "https://launch.dragonpixelstudio.com";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Origin",
    },
  });
}

export async function POST(req: Request) {
  let reservation: ReviewReservation | undefined;
  const response = await analyzeRequest(req, value => { reservation = value; });
  if (!reservation) return response;
  await settleReview(reservation, response.ok);
  const paid = reservation.mode === "credit";
  return Response.json({ ...await response.json(), reviewBilling: reservation.mode, ...(paid ? { credits: { charged: response.ok ? 1 : 0, refunded: response.ok ? 0 : 1, pending: !!currentJobBilling() } } : {}) }, { status: response.status, headers: response.headers });
}

async function analyzeRequest(req: Request, reserved: (value: ReviewReservation) => void) {
  try {
    if (!sameOrigin(req)) {
      return jsonResponse(
        { error: "Requests must come from Dragon Pixel Studio." },
        { status: 403 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return jsonResponse(
        { error: "Analyzer service is not configured yet." },
        { status: 500 }
      );
    }

    const ip = getClientIp(req);

    const access = await reviewAccess(req);
    const perIp = access.account && (access.owner || access.balance >= 1)
      ? await reviewWalletLimit.limit(access.account)
      : await ipRatelimit.limit(ip);
    if (!perIp.success || perIp.reason === "timeout") {
      return jsonResponse(
        { error: "You've hit the hourly limit. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await boundedFormData(req, 4 * 1024 * 1024).catch(() => null);
    if (!formData) return jsonResponse({ error: "Invalid upload or combined upload exceeds 4 MB." }, { status: 413 });
    const rawIcon = formData.get("icon");
    const rawScreenshots = formData.getAll("screenshots");

    const icon = rawIcon instanceof File ? rawIcon : null;

    if (rawIcon && !(rawIcon instanceof File)) {
      return jsonResponse({ error: "Invalid icon upload." }, { status: 400 });
    }

    const invalidScreenshot = rawScreenshots.find(
      (item) => !(item instanceof File)
    );
    if (invalidScreenshot) {
      return jsonResponse(
        { error: "Invalid screenshot upload." },
        { status: 400 }
      );
    }

    const screenshots = rawScreenshots as File[];

    // creative marketing assets (feature graphic / steam capsule / key art)
    const rawCreatives = formData.getAll("creatives");
    const rawCreativeKinds = formData.getAll("creativeKinds");
    const invalidCreative = rawCreatives.find((item) => !(item instanceof File));
    if (invalidCreative) {
      return jsonResponse({ error: "Invalid creative upload." }, { status: 400 });
    }
    const creatives = rawCreatives as File[];
    const CREATIVE_LABELS: Record<string, string> = {
      featureGraphic: "FEATURE GRAPHIC",
      steamCapsule: "STEAM CAPSULE",
      keyArt: "KEY ART",
    };
    const creativeKinds = creatives.map((_, i) => {
      const k = rawCreativeKinds[i];
      return typeof k === "string" && CREATIVE_LABELS[k] ? CREATIVE_LABELS[k] : "KEY ART";
    });

    if (!icon && screenshots.length === 0 && creatives.length === 0) {
      return jsonResponse(
        { error: "Upload at least one icon, screenshot, or creative." },
        { status: 400 }
      );
    }

    if (screenshots.length > MAX_SCREENSHOTS) {
      return jsonResponse(
        { error: `Upload at most ${MAX_SCREENSHOTS} screenshots.` },
        { status: 400 }
      );
    }

    if (creatives.length > MAX_CREATIVES) {
      return jsonResponse(
        { error: `Upload at most ${MAX_CREATIVES} marketing creatives.` },
        { status: 400 }
      );
    }

    const platform = platformValue(formData.get("platform"));
    const gameContext = stringValue(formData.get("gameContext")) || "";
    if (gameContext.length > 2000) return jsonResponse({ error: "Keep the game description within 2,000 characters." }, { status: 400 });
    const genreOverride = genreOverrideValue(
      formData.get("benchmarkGenre")
    );

    const assetMetas: AnalyzerAssetMeta[] = [];
    const assetBuffers: Buffer[] = [];

    const addPreparedAsset = async (
      meta: AnalyzerAssetMeta,
      buffer: Buffer
    ) => {
      assetMetas.push(meta);
      assetBuffers.push(buffer);

    };

    if (icon) {
      const result = await prepareImagePart(icon, "Icon");
      if ("error" in result) {
        return jsonResponse({ error: result.error }, { status: 400 });
      }
      await addPreparedAsset(
        {
          label: "APP ICON",
          providedKind: "icon",
          widthPx: result.dimensions.width,
          heightPx: result.dimensions.height,
          fileName: icon.name,
        },
        result.buffer
      );
    }

    for (let i = 0; i < screenshots.length; i++) {
      const result = await prepareImagePart(screenshots[i], `Screenshot ${i + 1}`);
      if ("error" in result) {
        return jsonResponse({ error: result.error }, { status: 400 });
      }
      await addPreparedAsset(
        {
          label: `SCREENSHOT ${i + 1}`,
          providedKind: "screenshot",
          widthPx: result.dimensions.width,
          heightPx: result.dimensions.height,
          fileName: screenshots[i].name,
        },
        result.buffer
      );
    }

    for (let i = 0; i < creatives.length; i++) {
      const label = creativeKinds[i];
      const result = await prepareImagePart(creatives[i], label);
      if ("error" in result) {
        return jsonResponse({ error: result.error }, { status: 400 });
      }
      await addPreparedAsset(
        {
          label: `${label} ${i + 1}`,
          providedKind:
            label === "FEATURE GRAPHIC"
              ? "featureGraphic"
              : label === "STEAM CAPSULE"
                ? "steamCapsule"
                : "keyArt",
          widthPx: result.dimensions.width,
          heightPx: result.dimensions.height,
          fileName: creatives[i].name,
        },
        result.buffer
      );
    }

    // Every response gets a persisted, shareable report - including cache
    // hits, which mint a fresh link from the cached payload.
    // Enforce both identities before fixtures, caches, report writes or AI calls.
    const allowance = await reserveReview(req, formData.get("creditConsent") === "1", access);
    if (!allowance.success) return jsonResponse({ error: allowance.error, code: allowance.code, canUseCredits: allowance.canUseCredits }, { status: allowance.status, ...(allowance.retryAfter ? { headers: { "Retry-After": String(allowance.retryAfter) } } : {}) });
    reserved(allowance.reservation);
    if (localFixturesEnabled()) return jsonResponse(sandboxAnalysis(assetMetas));

    const payload = await analyzeArtwork({ assets: assetMetas.map((meta, i) => ({ meta, buffer: assetBuffers[i] })), platform, context: gameContext, genreOverride });
    const reportAssets: StoredReportAsset[] = await Promise.all(assetMetas.map(async (meta, i) => ({ label: meta.label, kind: meta.providedKind, widthPx: meta.widthPx, heightPx: meta.heightPx, thumb: await makeReportThumb(assetBuffers[i]) })));
    const reportId = await saveReport({ platform: payload.reviewIdentity.platform, ...payload, assets: reportAssets });
    if (!reportId) throw new ReviewStorageError();
    const specNotes = assetMetas.map(specNoteFor).filter((note): note is string => note !== null);
    return jsonResponse({ ...payload, reportId, specNotes });
  } catch (err: unknown) {
    if (err instanceof ReviewStorageError || err instanceof ReviewBusyError || err instanceof AnalysisCapacityError) return jsonResponse({ error: err.message }, { status: err instanceof AnalysisCapacityError ? 429 : 503, headers: { "Retry-After": "30" } });
    if (err instanceof AnalyzerProviderError) {
      console.error("Analyze provider failure", { kind: err.kind, status: err.upstreamStatus });
      return jsonResponse({ error: err.message }, { status: err.status, ...(err.status === 503 || err.status === 504 ? { headers: { "Retry-After": "60" } } : {}) });
    }
    console.error("Analyze API error:", err instanceof Error ? err.name : "unknown");

    const msg =
      err instanceof Error ? err.message : JSON.stringify(err);

    if (
      msg.includes("503") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("high demand")
    ) {
      return jsonResponse(
        {
          error:
            "The AI review service is temporarily busy. Please try again in a minute.",
        },
        { status: 503 }
      );
    }

    return jsonResponse(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
