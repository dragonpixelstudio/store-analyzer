import { GET as accountStatus } from "@/app/api/account/status/route";
import { sameOrigin } from "@/lib/wallet";
import { localFixturesEnabled } from "@/lib/storageScope";
import { validateImageInput } from "@/lib/imageInput";
import { boundedJson } from "@/lib/requestBody";
import { randomUUID } from "crypto";
import { billingStore } from "@/lib/billingStore";
import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore, isDeveloperRequest } from "@/lib/credits";
import { fixAsset, type FixRequest, violatesGuardrails } from "@/lib/gemini";
import { fixIpRatelimit, fixGlobalRatelimit, getClientIp } from "@/lib/ratelimit";
import sharp from "sharp";
import { makeDeterministicIconPolish, makeDeterministicWidePolish, visibleDifferenceScore } from "@/lib/iconPolish";
import { rescoreSingleAsset } from "@/lib/rescore";

export const runtime = "nodejs";
// Two image attempts at most per slot (25s each), then a bounded 20s review.
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["icon", "screenshot", "capsule", "feature-graphic"]);
const ALLOWED_PLATFORMS = new Set(["steam", "google-play", "app-store"]);

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
  if (localFixturesEnabled()) return NextResponse.json({ error: "Analyzer improvements use the real model. Use Studio to test sample-image generation in this local sandbox." }, { status: 503 });
  if (!sameOrigin(req)) {
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
  if (!globalCheck.success || globalCheck.reason === "timeout") {
    return NextResponse.json(
      { error: "Generation is at capacity right now. Please try again later." },
      { status: 429 }
    );
  }
  if (!ipCheck.success || ipCheck.reason === "timeout") {
    return NextResponse.json(
      { error: "Generation limit reached for now. Please try again in a bit." },
      { status: 429 }
    );
  }

  let body: Partial<FixRequest> & { variants?: number; assetScore?: number };
  try {
    body = (await boundedJson(req, 4 * 1024 * 1024)) as Partial<FixRequest> & { variants?: number; assetScore?: number };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
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

  for (const field of ["userInstruction", "analysisNotes"] as const) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || body[field]!.length > (field === "analysisNotes" ? 12000 : 1000))) return NextResponse.json({ error: "Invalid edit instructions" }, { status: 400 });
  }
  try { await validateImageInput(buffer); } catch { return NextResponse.json({ error: "Invalid image. Use a single image up to 12 megapixels." }, { status: 400 }); }
  const guardMessage = violatesGuardrails(body.userInstruction);
  if (guardMessage) {
    return NextResponse.json({ error: guardMessage }, { status: 422 });
  }

  const requested = Math.min(Math.max(Math.floor(numberValue(body.variants, 2)), 1), 3);
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

  const billing = billingStore();
  await billing.recoverStaleGenerations(key);
  const operationId = req.headers.get("idempotency-key") || randomUUID();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) return NextResponse.json({ error: "Invalid generation request ID" }, { status: 400 });
  const reserved = await billing.beginGeneration(key, operationId, requested);
  if (reserved === -1) return NextResponse.json({ error: "This generation request was already received. Check your recent artwork and credit activity before trying again." }, { status: 409 });
  if (reserved === 0) {
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

  // Scores guide art direction only. Each delivered image costs one credit.
  const baseline = typeof body.assetScore === "number" && Number.isFinite(body.assetScore) ? Math.max(0, Math.min(100, body.assetScore)) : null;
  const MIN_VISIBLE_DIFF = 7; // near-copies score <5 on 0-255; real edits score 10+
  const MAX_IMAGE_CALLS_PER_SLOT = 2; // hard spend cap per designer slot

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
    // A browser-provided score cannot authorize a credit refund.
    charged: true,
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

      const result = await scoreCandidate(output);

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
  // Keep the entire JSON response below the serverless response-size limit.
  // Encode before settlement so undeliverable images never consume credits.
  const packed = await Promise.all(settled.map(async v => {
    if (!v) return null;
    try {
      const input = Buffer.from(v.base64, "base64");
      for (const quality of [92, 80, 65]) {
        const output = await sharp(input, { limitInputPixels: 40000000 }).webp({ quality }).toBuffer();
        if (output.length <= 900000) return { ...v, base64: output.toString("base64"), mimeType: "image/webp" };
      }
    } catch { /* Return the reserved credit when delivery encoding fails. */ }
    return null;
  }));
  const variants = packed.filter((v): v is ScoredVariant => v !== null);

  const delivered = variants.length;
  const failureRefunds = requested - delivered;
  const scoreRefunds = 0; // Only missing/undeliverable images are refunded.
  const totalRefunds = failureRefunds + scoreRefunds;
  const accountingPending = await billing.finishGeneration(key, operationId, requested - totalRefunds).then(() => false).catch(() => true);

  const remaining = await credits.getBalance(key).catch(() => null);
  if (delivered === 0) {
    return NextResponse.json(
      {
        error: hardError ?? (accountingPending ? "Generation failed. Reserved credits will return within 15 minutes; refresh your wallet to check." : "Generation failed. Nothing was charged. Please retry."),
        credits: { charged: accountingPending ? null : 0, pending: accountingPending, refunded: accountingPending ? null : requested, remaining },
      },
      { status: hardError ? 422 : 502 }
    );
  }

  return NextResponse.json({
    variants,
    credits: {
      charged: accountingPending ? null : delivered - scoreRefunds,
      pending: accountingPending,
      refunded: totalRefunds,
      remaining,
    },
  });
}

export async function GET(req: NextRequest) { return accountStatus(req); }
