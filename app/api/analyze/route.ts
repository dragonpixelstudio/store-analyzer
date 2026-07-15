import { GoogleGenAI, type Part } from "@google/genai";
import sharp from "sharp";
import {
  buildAnalyzerPrompt,
  parseAnalyzerReply,
  type AnalyzerAssetMeta,
  type AnalyzerPlatform,
} from "@/lib/analyzerPrompt";
import {
  calculateDragonPixelScores,
  clientReadout,
  getReviewMode,
  sanitizeObservations,
  stringValue,
  verdictFromScore,
  MAX_CREATIVES,
  MAX_SCREENSHOTS,
  type CalculatedReport,
  type Observations,
  type ReviewMode,
} from "@/lib/analyzerCore";
import { saveReport, type StoredReportAsset } from "@/lib/reportStore";
import {
  aspectLabel,
  normalizeForAnalysis,
  perceptualSignature,
  signaturesClose,
} from "@/lib/imageNormalize";
import { callerKey, dailyReportPeriod, getCreditStore } from "@/lib/credits";
import crypto from "node:crypto";
import { ipRatelimit, globalRatelimit, getClientIp, redis } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per image
const MAX_IMAGE_PIXELS = 12_000_000;
const ALLOWED_ORIGINS = new Set([
  "https://launch.dragonpixelstudio.com",
  "https://www.dragonpixelstudio.com",
  "https://dragonpixelstudio.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

type JsonBody =
  | {
      error: string;
    }
  | {
      observations: Observations;
      calculated: CalculatedReport;
      verdict: string;
      reportId?: string;
      specNotes?: string[];
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

function isAllowedRequestOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  const host = req.headers.get("host");
  if (host && origin === `https://${host}`) return true;

  if (ALLOWED_ORIGINS.has(origin)) return true;

  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://")) {
    return true;
  }

  return false;
}

function platformValue(value: FormDataEntryValue | null): AnalyzerPlatform {
  if (value === "steam" || value === "google-play" || value === "app-store") {
    return value;
  }

  return "unknown";
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

// Bump this whenever prompt/scoring logic changes so stale cached reports
// are naturally invalidated.
const ANALYZER_PROMPT_VERSION = "consistency-v7c-2026-07-15";
const ANALYSIS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Keyed on the perceptual signature of the pixels, not a byte hash - the same
// capsule exported at 460px and 920px resolves to the same cached report, so
// re-uploads at a different size cannot score differently.
function makeAnalysisCacheKey(args: {
  platform: AnalyzerPlatform;
  gameContext: string;
  reviewMode: ReviewMode;
  assets: {
    kind: AnalyzerAssetMeta["providedKind"];
    aspect: string;
    psig: string;
  }[];
}) {
  return `dpx:analysis:${ANALYZER_PROMPT_VERSION}:${stableHash(args)}`;
}

// Deterministic export-size guidance, computed server-side so it can never
// leak into the model's observations and shift the score.
function specNoteFor(meta: AnalyzerAssetMeta): string | null {
  const { providedKind, widthPx, heightPx } = meta;
  if (providedKind === "icon" && (widthPx < 512 || heightPx < 512)) {
    return `Icon uploaded at ${widthPx}×${heightPx} - export at 512×512 for Google Play (1024×1024 for the App Store). This does not affect the score.`;
  }
  if (providedKind === "steamCapsule" && widthPx < 460) {
    return `Capsule uploaded at ${widthPx}×${heightPx} - Steam's header capsule needs at least 460×215. This does not affect the score.`;
  }
  if (providedKind === "featureGraphic" && widthPx < 1024) {
    return `Feature graphic uploaded at ${widthPx}×${heightPx} - Google Play expects 1024×500. This does not affect the score.`;
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
      .resize(192, 192, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
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
  if (!isAllowedRequestOrigin(req)) {
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
  try {
    if (!isAllowedRequestOrigin(req)) {
      return jsonResponse(
        { error: "Requests must come from Dragon Pixel Store Analyzer." },
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

    const perIp = await ipRatelimit.limit(ip);
    if (!perIp.success) {
      return jsonResponse(
        { error: "You've hit the hourly limit. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
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

    const assetMetas: AnalyzerAssetMeta[] = [];
    const assetSigs: string[] = [];
    const assetBuffers: Buffer[] = [];
    const imageParts: Part[] = [];

    const addPreparedAsset = async (
      meta: AnalyzerAssetMeta,
      buffer: Buffer
    ) => {
      assetMetas.push(meta);
      assetBuffers.push(buffer);
      // Gemini only ever sees the normalized review-scale image and the
      // aspect ratio - never the export resolution - so the same art at any
      // size produces the same observations.
      const [normalized, psig] = await Promise.all([
        normalizeForAnalysis(buffer),
        perceptualSignature(buffer),
      ]);
      assetSigs.push(psig);
      imageParts.push({
        text: `IMAGE ${assetMetas.length}: ${meta.label}. Declared type: ${meta.providedKind}. Aspect ratio: ${aspectLabel(meta.widthPx, meta.heightPx)}.`,
      });
      imageParts.push({
        inlineData: { mimeType: normalized.mimeType, data: normalized.base64 },
      });
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
          label,
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
    const persistReport = async (
      observations: Observations,
      calculated: CalculatedReport,
      verdict: string
    ): Promise<string | undefined> => {
      const reportAssets: StoredReportAsset[] = await Promise.all(
        assetMetas.map(async (meta, i) => ({
          label: meta.label,
          kind: meta.providedKind,
          widthPx: meta.widthPx,
          heightPx: meta.heightPx,
          thumb: await makeReportThumb(assetBuffers[i]),
        }))
      );
      const id = await saveReport({
        platform,
        verdict,
        calculated,
        observations,
        assets: reportAssets,
      });
      return id ?? undefined;
    };

    // Same image(s) + role + platform + context => identical report, served
    // from cache. This is the real consistency fix: a re-run of the same asset
    // no longer re-queries Gemini, so the score cannot drift between runs.
    const reviewMode = getReviewMode(
      Boolean(icon),
      screenshots.length + creatives.length
    );
    const cacheKey = makeAnalysisCacheKey({
      platform,
      gameContext: gameContext.trim(),
      reviewMode,
      assets: assetMetas.map((meta, i) => ({
        kind: meta.providedKind,
        aspect: aspectLabel(meta.widthPx, meta.heightPx),
        psig: assetSigs[i],
      })),
    });

    const specNotes = assetMetas
      .map(specNoteFor)
      .filter((note): note is string => note !== null);

    // Fuzzy fallback index: resampling shifts a few signature bits, so the
    // same art re-uploaded at another size rarely produces the exact same
    // key. The bucket groups uploads by everything except pixels; a
    // near-match within hamming tolerance reuses the earlier report, which
    // is what guarantees "same capsule, different export size, same score".
    const psigJoined = assetSigs.join("|");
    const bucketKey = `dpx:psigidx:${ANALYZER_PROMPT_VERSION}:${stableHash({
      platform,
      gameContext: gameContext.trim(),
      reviewMode,
      assets: assetMetas.map((meta) => ({
        kind: meta.providedKind,
        aspect: aspectLabel(meta.widthPx, meta.heightPx),
      })),
    })}`;

    const isReportPayload = (
      value: unknown
    ): value is Extract<JsonBody, { calculated: CalculatedReport }> =>
      Boolean(value) &&
      typeof value === "object" &&
      typeof (value as { calculated?: { launchScore?: unknown } }).calculated
        ?.launchScore === "number";

    let cached = await redis
      .get<Record<string, unknown>>(cacheKey)
      .catch((err) => {
        console.error("analysis cache read failed", err);
        return null;
      });

    if (!isReportPayload(cached)) {
      const index = await redis
        .hgetall<Record<string, string>>(bucketKey)
        .catch((err) => {
          console.error("psig index read failed", err);
          return null;
        });
      if (index) {
        const nearKey = Object.entries(index).find(([storedPsig]) =>
          signaturesClose(psigJoined, storedPsig)
        )?.[1];
        if (nearKey) {
          cached = await redis
            .get<Record<string, unknown>>(nearKey)
            .catch(() => null);
          if (isReportPayload(cached)) {
            // Promote to an exact hit and index this size's signature too,
            // so a third export size can match against either upload.
            await redis
              .set(cacheKey, cached, { ex: ANALYSIS_CACHE_TTL_SECONDS })
              .catch(() => {});
            await redis
              .hset(bucketKey, { [psigJoined]: cacheKey })
              .catch(() => {});
          }
        }
      }
    }

    if (isReportPayload(cached)) {
      const cachedBody = cached;
      const reportId = await persistReport(
        cachedBody.observations,
        cachedBody.calculated,
        cachedBody.verdict
      );
      return jsonResponse({ ...cachedBody, reportId, specNotes });
    }

    const parts: Part[] = [
      {
        text: buildAnalyzerPrompt({
          assets: assetMetas,
          platform,
          gameContext,
          hasIcon: Boolean(icon),
          hasScreenshots: screenshots.length > 0,
          hasCreatives: creatives.length > 0,
        }),
      },
      ...imageParts,
    ];

    const global = await globalRatelimit.limit("global");
    if (!global.success) {
      return jsonResponse(
        {
          error:
            "The analyzer is at daily capacity. Please try again tomorrow.",
        },
        { status: 429 }
      );
    }

    const accountKey = callerKey(req);
    const store = getCreditStore();
    const plan = await store.getPlan(accountKey);
    const reportLimit = plan === "pro" ? 500 : plan === "indie" ? 100 : 3;
    const reportPeriod =
      plan === "free"
        ? `free:${dailyReportPeriod()}`
        : `${plan}:${new Date().toISOString().slice(0, 7)}`;

    const reportMeter = await store.reserveReport(accountKey, reportLimit, reportPeriod);
    if (!reportMeter.success) {
      const limitText =
        plan === "pro"
          ? "500 Pro analysis reports this month"
          : plan === "indie"
            ? "100 Indie analysis reports this month"
            : "today's 3 free analysis reports";
      return jsonResponse(
        {
          error: `You've used ${limitText}. Upgrade, top up your plan, or try again when the meter resets.`,
        },
        { status: 429 }
      );
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0,
        topP: 0.1,
        topK: 1,
        candidateCount: 1,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text || "";

    let parsed: unknown;

    try {
      parsed = parseAnalyzerReply(rawText);
    } catch {
      return jsonResponse(
        {
          error:
            "The AI review returned an unreadable response. Please try again.",
        },
        { status: 502 }
      );
    }

    const observations = sanitizeObservations(parsed);
    if (!observations) {
      return jsonResponse(
        {
          error:
            "The AI review returned an unexpected structure. Please try again.",
        },
        { status: 502 }
      );
    }

    const calculated = calculateDragonPixelScores(observations, reviewMode, {
      hasIcon: Boolean(icon),
      hasScreens: screenshots.length > 0,
      hasCreatives: creatives.length > 0,
    });
    const verdict = verdictFromScore(calculated.launchScore);

    const payload = {
      observations,
      calculated,
      verdict,
      ...clientReadout(observations),
    };

    await redis
      .set(cacheKey, payload, { ex: ANALYSIS_CACHE_TTL_SECONDS })
      .catch((err) => {
        console.error("analysis cache write failed", err);
      });

    await redis
      .hset(bucketKey, { [psigJoined]: cacheKey })
      .then(() => redis.expire(bucketKey, ANALYSIS_CACHE_TTL_SECONDS))
      .catch((err) => {
        console.error("psig index write failed", err);
      });

    const reportId = await persistReport(observations, calculated, verdict);

    return jsonResponse({ ...payload, reportId, specNotes });
  } catch (err: unknown) {
    console.error("Analyze API error:", err);

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
