import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed, getCreditStore } from "@/lib/credits";

export const runtime = "nodejs";

type AccountPlan = "free" | "quick" | "indie" | "pro";

type AccountStatus = {
  plan: AccountPlan;
  isSubscriber: boolean;
};

// TODO(paid launch): replace with a durable DB lookup keyed by the
// authenticated user. The Paddle webhook writes plan/subscription status into
// that DB; this endpoint only reads it. The frontend must never decide
// subscription state on its own.
//
// Paddle webhook -> account behavior:
//   subscription created   -> set plan indie/pro, status active
//   subscription renewed   -> grant monthly credits
//   subscription canceled  -> keep active until period end
//   subscription past due  -> keep or restrict per policy
//   subscription ended     -> plan back to free
//   top-up purchased       -> add credits to ledger
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- key becomes the DB lookup key at paid launch
async function getAccountStatus(_key: string): Promise<AccountStatus> {
  return { plan: "free", isSubscriber: false };
}

export async function GET(req: NextRequest) {
  const key = callerKey(req);
  await ensureTrialSeed(key);

  const credits = getCreditStore();
  const remaining = await credits.getBalance(key);
  const account = await getAccountStatus(key);

  return NextResponse.json({
    account,
    credits: { remaining },
  });
}
