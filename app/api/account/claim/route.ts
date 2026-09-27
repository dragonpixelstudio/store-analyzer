import { accountRequestAllowed } from "@/lib/ratelimit";
import { boundedJson } from "@/lib/requestBody";
import { isRecord as isBodyRecord } from "@/lib/dodo";
import { NextRequest, NextResponse } from "next/server";
import { getCreditStore } from "@/lib/credits";
import { sameOrigin, setWalletCookie, verifyRecovery } from "@/lib/wallet";

export const runtime = "nodejs";
// An email address is not proof of account ownership. Only a secret recovery code can link a wallet.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const parsed = await boundedJson(req).catch(() => null);
  const body = isBodyRecord(parsed) ? parsed : null;
  const key = verifyRecovery(body?.recoveryCode);
  if (!key) return NextResponse.json({ error: "Enter the complete wallet recovery code you saved before checkout." }, { status: 400 });
  try {
    if (!await accountRequestAllowed(req, true)) return NextResponse.json({ error: "Too many wallet requests. Please try again later." }, { status: 429 });
    const store = getCreditStore();
    const [plan, remaining] = await Promise.all([store.getPlan(key), store.getBalance(key)]);
    const response = NextResponse.json({ account: { plan, isSubscriber: plan !== "free" }, credits: { remaining } });
    setWalletCookie(response, key);
    return response;
  } catch {
    return NextResponse.json({ error: "Could not restore your wallet. Please retry." }, { status: 503 });
  }
}
