import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore } from "@/lib/credits";

export const runtime = "nodejs";

// Plan and credits are written by the Dodo Payments webhook
// (app/api/webhooks/dodo/route.ts) into the durable credit store, keyed by
// the purchaser's email hash. Browsers link to that account via
// /api/account/claim, which sets the signed identity cookie that callerKey
// resolves. This endpoint only reads; the frontend never decides
// subscription state on its own.
export async function GET(req: NextRequest) {
  const key = callerKey(req);
  await ensureTrialSeed(key);

  const store = getCreditStore();
  const [remaining, plan] = await Promise.all([
    store.getBalance(key),
    store.getPlan(key),
  ]);

  return NextResponse.json({
    account: { plan, isSubscriber: plan === "indie" || plan === "pro" },
    credits: { remaining },
  });
}
