import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore, isDeveloperRequest } from "@/lib/credits";
import { fixAsset, type FixRequest, violatesGuardrails } from "@/lib/gemini";
import { fixIpRatelimit, fixGlobalRatelimit, getClientIp } from "@/lib/ratelimit";
import sharp from "sharp";
import { makeDeterministicIconPolish, makeDeterministicWidePolish, visibleDifferenceScore } from "@/lib/iconPolish";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["icon", "screenshot", "capsule", "feature-graphic"]);
const ALLOWED_PLATFORMS = new Set(["steam", "google-play", "app-store"]);

const ALLOWED_ORIGINS = new Set([
  "https://launch.dragonpixelstudio.com",
  "https://www.dragonpixelstudio.com",
  "https://dragonpixelstudio.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

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

// Same magic-byte sniffing as /api/analyze: never trust the declared MIME.
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function isAssetType(value: unknown): value is FixRequest["assetType"] {
  return typeof value === "string" && ALLOWED_TYPES.has(value);
}

function isPlatform(value: unknown): value is FixRequest["platform"] {
  return typeof value === "string" && ALLOWED_PLATFORMS.has(value);
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function makeIconReadTest(buffer: Buffer) {
  const png = await sharp(buffer)
    .resize(32, 32, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return {
    base64: png.toString("base64"),
    mimeType: "image/png",
  };
}

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // Rate limits: generation costs real money, so limits are tighter than
  // analysis. Per-IP hourly plus a global daily spend cap.
  const ip = getClientIp(req);
  const [ipCheck, globalCheck] = await Promise.all([
    fixIpRatelimit.limit(ip),
    fixGlobalRatelimit.limit("global"),
  ]);
  if (!globalCheck.success) {
    return NextResponse.json(
      { error: "Generation is at capacity right now. Please try again later." },
      { status: 429 }
    );
  }
  if (!ipCheck.success) {
    return NextResponse.json(
      { error: "Generation limit reached for now. Please try again in a bit." },
      { status: 429 }
    );
  }

  let body: Partial<FixRequest> & { variants?: number; assetScore?: number };
  try {
    body = (await req.json()) as Partial<FixRequest> & { variants?: number; assetScore?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { assetType, platform, imageBase64 } = body;
  if (!isAssetType(assetType)) {
    return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
  }
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  // Decode once, sniff real type, enforce real size. The declared mimeType in
  // the body is ignored in favor of the sniffed one.
  let buffer: Buffer;
  try {
    buffer = Buffer.from(imageBase64, "base64");
  } catch {
    return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large. Max size is 4 MB." }, { status: 413 });
  }
  const sniffedMime = sniffImageMime(buffer);
  if (!sniffedMime) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPEG, or WebP." },
      { status: 400 }
    );
  }

  const guardMessage = violatesGuardrails(body.userInstruction);
  if (guardMessage) {
    return NextResponse.json({ error: guardMessage }, { status: 422 });
  }

  const requested = Math.min(Math.max(numberValue(body.variants, 2), 1), 3);
  const iconReadTest =
    assetType === "icon"
      ? await makeIconReadTest(buffer).catch((err: unknown) => {
          console.error(
            "icon read-test generation failed:",
            err instanceof Error ? err.message : "unknown error"
          );
          return null;
        })
      : null;
  const credits = getCreditStore();
  const key = callerKey(req);
  await ensureTrialSeed(key, isDeveloperRequest(req));

  const reserved = await credits.reserve(key, requested);
  if (!reserved) {
    const remaining = await credits.getBalance(key);
    return NextResponse.json(
      {
        error:
          remaining > 0
            ? `This needs ${requested} credits but you have ${remaining}. Lower the variant count or top up.`
            : "You are out of generation credits. Upgrade or top up to keep generating.",
        credits: { remaining },
      },
      { status: 402 }
    );
  }

  const variants: { base64: string; mimeType: string }[] = [];
  let hardError: string | null = null;

  // Every visual asset gets one deterministic, guaranteed-visible fix as
  // Variant 1 (icons: square saliency crop; capsules/feature graphics:
  // aspect-preserving saliency crop). Screenshots are excluded because
  // cropping risks cutting gameplay UI. Remaining slots go to the Gemini
  // designer pass behind a visible-difference gate.
  if (assetType !== "screenshot" && requested > 0) {
    try {
      const polished =
        assetType === "icon"
          ? await makeDeterministicIconPolish(buffer, "controlled")
          : await makeDeterministicWidePolish(buffer, "controlled");
      variants.push({ base64: polished.base64, mimeType: polished.mimeType });
    } catch (err: unknown) {
      console.error(
        "deterministic polish failed:",
        err instanceof Error ? err.message : "unknown error"
      );
    }
  }

  const MIN_VISIBLE_DIFF = 7; // near-copies score <5 on 0-255; real edits score 10+

  for (let i = variants.length; i < requested; i++) {
    try {
      let output: { base64: string; mimeType: string } | null = null;
      // Visible-difference gate with one escalation retry: a near-copy is a
      // failed result, never delivered, never charged.
      for (let attempt = 0; attempt < 2 && !output; attempt++) {
        const candidate = await fixAsset(
          {
            assetType,
            platform,
            imageBase64,
            mimeType: sniffedMime,
            iconReadTestBase64: iconReadTest?.base64,
            iconReadTestMimeType: iconReadTest?.mimeType,
            analysisNotes: body.analysisNotes,
            userInstruction:
              attempt === 0
                ? body.userInstruction
                : [
                    body.userInstruction,
                    "PREVIOUS ATTEMPT FAILED: the output was a near-copy of the input. Apply every mandatory edit dramatically; the result must be unmistakably different at a glance.",
                  ]
                    .filter(Boolean)
                    .join(" "),
            variantIndex: i,
            assetScore: typeof body.assetScore === "number" ? body.assetScore : undefined,
          },
          apiKey
        );
        const diff = await visibleDifferenceScore(buffer, candidate.base64).catch(() => 99);
        if (diff >= MIN_VISIBLE_DIFF) {
          output = candidate;
        } else {
          console.warn(
            `variant ${i} attempt ${attempt} near-copy (diff=${diff.toFixed(1)}), ${attempt === 0 ? "retrying with escalation" : "dropping for refund"}`
          );
        }
      }
      if (output) {
        variants.push(output);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("fix variant error:", message);
      if (typeof err === "object" && err !== null && "code" in err && err.code === "GUARDRAIL") {
        hardError = message;
        break;
      }
    }
  }

  const delivered = variants.length;
  const refunded = requested - delivered;
  if (refunded > 0) {
    await credits.refund(key, refunded);
  }

  const remaining = await credits.getBalance(key);
  if (delivered === 0) {
    return NextResponse.json(
      {
        error: hardError ?? "Generation failed. Nothing was charged. Please retry.",
        credits: { charged: 0, refunded: requested, remaining },
      },
      { status: hardError ? 422 : 502 }
    );
  }

  return NextResponse.json({
    variants,
    credits: { charged: delivered, refunded, remaining },
  });
}

export async function GET(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const credits = getCreditStore();
  const key = callerKey(req);
  await ensureTrialSeed(key, isDeveloperRequest(req));
  const remaining = await credits.getBalance(key);
  return NextResponse.json({ credits: { remaining } });
}
