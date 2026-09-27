import { NextRequest, NextResponse } from "next/server";
import { isFunnelEvent, recordEvent } from "@/lib/funnel";
import { sameOrigin } from "@/lib/wallet";
import { boundedJson } from "@/lib/requestBody";
import { eventIpLimit, eventGlobalLimit, getClientIp } from "@/lib/ratelimit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await boundedJson(req, 1024).catch(() => null);
  const event = body && typeof body === "object" && "event" in body ? body.event : null;
  if (!isFunnelEvent(event)) return NextResponse.json({ ok: false }, { status: 400 });
  const [ip, global] = await Promise.all([eventIpLimit.limit(getClientIp(req)), eventGlobalLimit.limit("global")]);
  if (!ip.success || ip.reason === "timeout" || !global.success || global.reason === "timeout") return NextResponse.json({ ok: false }, { status: 429 });
  await recordEvent(event);
  return NextResponse.json({ ok: true });
}
