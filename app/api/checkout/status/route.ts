import { accountRequestAllowed } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { billingStore } from "@/lib/billingStore";
import { getCreditStore } from "@/lib/credits";
import { walletKey } from "@/lib/wallet";

export async function GET(req: NextRequest) {
  const key = walletKey(req);
  const id = req.nextUrl.searchParams.get("order") || "";
  if (!key || !/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: "This checkout could not be found in your wallet." }, { status: 404 });
  try {
    if (!await accountRequestAllowed(req, false)) return NextResponse.json({ error: "Too many wallet requests. Please try again later." }, { status: 429 });
    const order = await billingStore().getOrder(id);
    if (!order || order.accountKey !== key) return NextResponse.json({ error: "This checkout could not be found in your wallet." }, { status: 404 });
    return NextResponse.json({ state: order.state, credits: order.credits, remaining: await getCreditStore().getBalance(key) });
  } catch {
    return NextResponse.json({ error: "Payment confirmation is temporarily unavailable. Please refresh shortly." }, { status: 503 });
  }
}
