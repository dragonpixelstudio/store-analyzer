import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore, isDeveloperRequest } from "@/lib/credits";
import { fixAsset, type FixRequest, violatesGuardrails } from "@/lib/gemini";
import { fixIpRatelimit, fixGlobalRatelimit, getClientIp } from "@/lib/ratelimit";
import sharp from "sharp";
import { makeDeterministicIconPolish, makeDeterministicWidePolish, visibleDifferenceScore } from "@/lib/iconPolish";
import { rescoreSingleAsset } from "@/lib/rescore";

export const runtime = "nodejs";
// Worst case per request: up to 3 image generations plus their re-scores on
// the designer slot (near-copy retry + score-gated corrective retry).
export const maxDuration = 120;

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

  // -------------------------------------------------------------------------
  // Self-correcting generation: every candidate is re-scored (median of 3)
  // BEFORE delivery, and a candidate that lands below the original's score
  // gets one corrective retry with the reviewer's verdict fed back into the
  // prompt. A re-score costs ~1/40th of an image generation, so catching a
  // loser server-side and retrying once is far cheaper than eating the
  // refund: one converted retry pays for itself roughly 20x.
  // -------------------------------------------------------------------------
  const baseline = typeof body.assetScore === "number" ? body.assetScore : null;
  const MIN_VISIBLE_DIFF = 7; // near-copies score <5 on 0-255; real edits score 10+
  const MAX_IMAGE_CALLS_PER_SLOT = 3; // hard spend cap per designer slot

  type ScoredVariant = {
    base64: string;
    mimeType: string;
    score?: number;
    scoreSummary?: string;
    charged: boolean;
  };

  let hardError: string | null = null;

  const scoreCandidate = (candidate: { base64: string; mimeType: string }) =>
    rescoreSingleAsset({
      base64: candidate.base64,
      mimeType: candidate.mimeType,
      assetType,
      platform,
      apiKey,
    });

  const finishVariant = (
    candidate: { base64: string; mimeType: string },
    result: { score: number; summaryLine: string } | null
  ): ScoredVariant => ({
    base64: candidate.base64,
    mimeType: candidate.mimeType,
    score: result?.score,
    scoreSummary: result?.summaryLine,
    charged: !(
      baseline !== null &&
      typeof result?.score === "number" &&
      result.score < baseline
    ),
  });

  // Deterministic pass (icons: square saliency crop; capsules/feature
  // graphics: aspect-preserving crop). Screenshots are excluded because
  // cropping risks cutting gameplay UI. If the controlled crop scores below
  // the original, escalate to the "strong" crop - sharp-only, zero API cost -
  // and keep whichever scores higher.
  const buildDeterministicVariant = async (): Promise<ScoredVariant | null> => {
    try {
      const make = (mode: "controlled" | "strong") =>
        assetType === "icon"
          ? makeDeterministicIconPolish(buffer, mode)
          : makeDeterministicWidePolish(buffer, mode);

      const first = await make("controlled");
      const firstResult = await scoreCandidate(first);
      let best = { candidate: first, result: firstResult };

      if (baseline !== null && firstResult && firstResult.score < baseline) {
        const second = await make("strong").catch(() => null);
        if (second) {
          const secondResult = await scoreCandidate(second);
          if (secondResult && secondResult.score > firstResult.score) {
            best = { candidate: second, result: secondResult };
          }
        }
      }

      return finishVariant(best.candidate, best.result);
    } catch (err: unknown) {
      console.error(
        "deterministic polish failed:",
        err instanceof Error ? err.message : "unknown error"
      );
      return null;
    }
  };

  // Gemini designer pass: near-copy gate first, then a score-gated corrective
  // retry that feeds the reviewer's verdict back into the prompt. The better
  // of the two attempts is delivered.
  const buildDesignerVariant = async (
    variantIndex: number
  ): Promise<ScoredVariant | null> => {
    let imageCalls = 0;

    const generate = (extraInstruction?: string) => {
      imageCalls++;
      return fixAsset(
        {
          assetType,
          platform,
          imageBase64,
          mimeType: sniffedMime,
          iconReadTestBase64: iconReadTest?.base64,
          iconReadTestMimeType: iconReadTest?.mimeType,
          analysisNotes: body.analysisNotes,
          userInstruction: [body.userInstruction, extraInstruction]
            .filter(Boolean)
            .join(" "),
          variantIndex,
          assetScore: baseline ?? undefined,
        },
        apiKey
      );
    };

    try {
      // Near-copy gate with one escalation retry.
      let output: { base64: string; mimeType: string } | null = null;
      for (
        let attempt = 0;
        attempt < 2 && !output && imageCalls < MAX_IMAGE_CALLS_PER_SLOT;
        attempt++
      ) {
        const candidate = await generate(
          attempt === 0
            ? undefined
            : "PREVIOUS ATTEMPT FAILED: the output was a near-copy of the input. Apply every mandatory edit dramatically; the result must be unmistakably different at a glance."
        );
        const diff = await visibleDifferenceScore(buffer, candidate.base64).catch(() => 99);
        if (diff >= MIN_VISIBLE_DIFF) {
          output = candidate;
        } else {
          console.warn(
            `variant ${variantIndex} attempt ${attempt} near-copy (diff=${diff.toFixed(1)}), ${attempt === 0 ? "retrying with escalation" : "dropping for refund"}`
          );
        }
      }
      if (!output) return null;

      let result = await scoreCandidate(output);

      // Score-gated corrective retry: tell the model exactly why the reviewer
      // rejected the first attempt, then keep whichever attempt scores higher.
      // Only fires on a CLEAR miss (10+ points below the original): a 5-point
      // gap sits inside re-score noise, where a retry is likely wasted image
      // spend - the refund logic handles those borderline cases instead.
      const RETRY_MISS_THRESHOLD = 10;
      if (
        baseline !== null &&
        result &&
        baseline - result.score >= RETRY_MISS_THRESHOLD &&
        imageCalls < MAX_IMAGE_CALLS_PER_SLOT
      ) {
        try {
          const retry = await generate(
            `PREVIOUS ATTEMPT REJECTED: an independent reviewer re-scored it ${result.score}/100, below the original's ${baseline}/100. Reviewer verdict: "${result.summaryLine}". Correct course now: remove every added effect (no glow, beams, flares, particles, haze), enlarge the focal subject harder, simplify the background further, and cut anything that fails at 32px. The output must beat ${baseline}/100.`
          );
          const retryDiff = await visibleDifferenceScore(buffer, retry.base64).catch(() => 99);
          if (retryDiff >= MIN_VISIBLE_DIFF) {
            const retryResult = await scoreCandidate(retry);
            if (retryResult && retryResult.score > result.score) {
              output = retry;
              result = retryResult;
            }
          }
        } catch (err: unknown) {
          console.error(
            "score-gated retry failed:",
            err instanceof Error ? err.message : "unknown error"
          );
        }
      }

      return finishVariant(output, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("fix variant error:", message);
      if (typeof err === "object" && err !== null && "code" in err && err.code === "GUARDRAIL") {
        hardError = message;
      }
      return null;
    }
  };

  // Run the deterministic and designer pipelines concurrently; each already
  // carries its own score, so total latency stays close to the slowest
  // single pipeline instead of the sum.
  const pipelines: Promise<ScoredVariant | null>[] = [];
  if (assetType !== "screenshot" && requested > 0) {
    pipelines.push(buildDeterministicVariant());
  }
  for (let i = pipelines.length; i < requested; i++) {
    pipelines.push(buildDesignerVariant(i));
  }

  const settled = await Promise.all(pipelines);
  const variants = settled.filter((v): v is ScoredVariant => v !== null);

  const delivered = variants.length;
  const failureRefunds = requested - delivered;
  const scoreRefunds = variants.filter((v) => !v.charged).length;
  const totalRefunds = failureRefunds + scoreRefunds;
  if (totalRefunds > 0) {
    await credits.refund(key, totalRefunds);
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
    credits: {
      charged: delivered - scoreRefunds,
      refunded: totalRefunds,
      remaining,
    },
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
