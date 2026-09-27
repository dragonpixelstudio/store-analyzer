import { GET as accountStatus } from "@/app/api/account/status/route";
import { localFixturesEnabled } from "@/lib/storageScope";
import { sandboxImage } from "@/lib/sandboxImage";
import { sameOrigin } from "@/lib/wallet";
import { validateImageInput } from "@/lib/imageInput";
import { boundedJson } from "@/lib/requestBody";
import { randomUUID } from "crypto";
import { billingStore } from "@/lib/billingStore";
import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore, isDeveloperRequest } from "@/lib/credits";
import { getClientIp, studioGlobalRatelimit, studioIpRatelimit } from "@/lib/ratelimit";
import { editStudioImage, generateStudioImage, studioGuard } from "@/lib/studioGenerate";
import { STUDIO_FORMATS } from "@/lib/studioFormats";
import type { StudioAiType } from "@/lib/studio";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CREDITS_PER_IMAGE = 1;

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Decode + verify an uploaded image; never trusts the declared MIME. */
async function readImage(value: unknown): Promise<{ base64: string; mimeType: string } | { error: string } | null> {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { error: "Invalid image." };
  let buffer: Buffer;
  try {
    buffer = Buffer.from(value, "base64");
  } catch {
    return { error: "Invalid image." };
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { error: "Image too large. Max size is 4 MB." };
  }
  const mimeType = sniffImageMime(buffer);
  if (!mimeType) return { error: "Use a PNG, JPEG, or WebP image." };
  try { await validateImageInput(buffer); } catch { return { error: "Invalid image. Use a single image up to 12 megapixels." }; }
  return { base64: value, mimeType };
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Studio is not configured yet." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await boundedJson(req, 4 * 1024 * 1024);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const formatId = clean(body.formatId, 40);
  if (formatId && !STUDIO_FORMATS.some(f => f.id === formatId && f.type === body.assetType)) {
    return NextResponse.json({ error: "Choose a valid output format." }, { status: 400 });
  }
  const mode = body.mode === "edit" ? "edit" : "create";
  const type: StudioAiType | null =
    body.assetType === "icon" || body.assetType === "capsule" || body.assetType === "thumbnail" ? body.assetType : null;
  if (!type) {
    return NextResponse.json({ error: "Choose an icon, Steam capsule, or thumbnail." }, { status: 400 });
  }

  const gameName = clean(body.gameName, 80);
  const gamePitch = clean(body.gamePitch, 300);
  const instruction = clean(body.instruction, 600);
  if (!gameName) {
    return NextResponse.json({ error: "Add your game's name." }, { status: 400 });
  }
  if (mode === "create" && gamePitch.length < 8) {
    return NextResponse.json(
      { error: "Describe your game in a sentence - genre, hero, and hook." },
      { status: 400 }
    );
  }
  if (mode === "edit" && !instruction) {
    return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });
  }

  const guard = studioGuard(gameName, gamePitch, instruction);
  if (guard) return NextResponse.json({ error: guard }, { status: 422 });

  const reference = await readImage(body.referenceBase64);
  if (reference && "error" in reference) {
    return NextResponse.json({ error: reference.error }, { status: 400 });
  }
  const source = await readImage(body.sourceBase64);
  if (source && "error" in source) {
    return NextResponse.json({ error: source.error }, { status: 400 });
  }
  if (mode === "edit" && !source) {
    return NextResponse.json({ error: "Missing the image to edit." }, { status: 400 });
  }

  const [ipCheck, globalCheck] = await Promise.all([
    studioIpRatelimit.limit(getClientIp(req)),
    studioGlobalRatelimit.limit("global"),
  ]);
  if (!globalCheck.success || globalCheck.reason === "timeout") {
    return NextResponse.json(
      { error: "The studio is at today's capacity. Please try again tomorrow." },
      { status: 429 }
    );
  }
  if (!ipCheck.success || ipCheck.reason === "timeout") {
    return NextResponse.json(
      { error: "You're generating fast - take a breather and try again shortly." },
      { status: 429 }
    );
  }

  const credits = getCreditStore();
  const key = callerKey(req);
  await ensureTrialSeed(key, isDeveloperRequest(req));
  const billing = billingStore();
  await billing.recoverStaleGenerations(key);
  const operationId = req.headers.get("idempotency-key") || randomUUID();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) return NextResponse.json({ error: "Invalid generation request ID" }, { status: 400 });
  const reserved = await billing.beginGeneration(key, operationId, CREDITS_PER_IMAGE);
  if (reserved === -1) return NextResponse.json({ error: "This generation request was already received. Check your recent artwork and credit activity before trying again." }, { status: 409 });
  if (reserved === 0) {
    return NextResponse.json(
      {
        error: "You're out of generation credits.",
        outOfCredits: true,
        credits: { remaining: await credits.getBalance(key) },
      },
      { status: 402 }
    );
  }

  try {
    const image = localFixturesEnabled() ? await sandboxImage(type, formatId, req.headers.get("x-qa-fail") === "1") :
      mode === "edit" && source
        ? await editStudioImage({ type, gameName, instruction, source, formatId }, apiKey)
        : await generateStudioImage(
            {
              type,
              formatId,
              gameName,
              gamePitch,
              styleId: clean(body.styleId, 20),
              recipeId: clean(body.recipeId, 60),
              reference: reference ?? undefined,
            },
            apiKey
          );
    // Always deliver a completed image even if the accounting acknowledgement is delayed.
    const completed = await billing.finishGeneration(key, operationId, CREDITS_PER_IMAGE).catch(() => null);
    return NextResponse.json({
      image,
      credits: { charged: completed === null ? null : completed === 1 ? CREDITS_PER_IMAGE : 0, remaining: await credits.getBalance(key).catch(() => null), pending: completed === null },
    });
  } catch (err) {
    // Never charge for a failed generation.
    const refundRecorded = await billing.finishGeneration(key, operationId, 0).then(() => true).catch(() => false);
    const message = err instanceof Error ? err.message : "unknown";
    console.error("studio generation failed:", message);
    const busy = /503|UNAVAILABLE|overloaded|high demand/i.test(message);
    return NextResponse.json(
      {
        error: !refundRecorded ? "Generation failed. Your reserved credit will be recovered when you check your wallet after 15 minutes." : busy
          ? "The image model is busy right now. Nothing was charged - try again in a minute."
          : "Generation failed. Nothing was charged - please try again.",
        credits: { remaining: await credits.getBalance(key).catch(() => null) },
      },
      { status: busy ? 503 : 502 }
    );
  }
}

export async function GET(req: NextRequest) { return accountStatus(req); }
