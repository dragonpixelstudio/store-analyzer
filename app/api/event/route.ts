import { NextRequest, NextResponse } from "next/server";
import { isFunnelEvent, recordEvent } from "@/lib/funnel";

export const runtime = "nodejs";

// Fire-and-forget funnel beacon. Same-origin only and event name allow-listed.
// Deliberately NOT rate-limited: a real session fires several events, and
// throttling would undercount the exact funnel the experiment needs to measure.
// At this traffic, same-origin + allowlist is sufficient.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let event: unknown;
  try {
    event = (await req.json())?.event;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isFunnelEvent(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await recordEvent(event);
  return NextResponse.json({ ok: true });
}
