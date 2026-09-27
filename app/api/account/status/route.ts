import { accountRequestAllowed } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore, isDeveloperRequest } from "@/lib/credits";
import { billingStore } from "@/lib/billingStore";
import { sameOrigin, walletKey } from "@/lib/wallet";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (req.headers.get("origin") && !sameOrigin(req)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    if (!await accountRequestAllowed(req, false)) return NextResponse.json({ error: "Too many wallet requests. Please try again later." }, { status: 429 });
    const key = callerKey(req);
    await ensureTrialSeed(key, isDeveloperRequest(req));
    const billing = billingStore();
    await billing.recoverStaleGenerations(key);
    const store = getCreditStore();
    const [remaining, plan, history] = await Promise.all([store.getBalance(key), store.getPlan(key), billing.history(key)]);
    return NextResponse.json({ account: { plan, isSubscriber: plan !== "free", hasWallet: !!walletKey(req) }, credits: { remaining }, history }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Credit balance is temporarily unavailable. Please retry." }, { status: 503 });
  }
}
