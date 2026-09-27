import { accountRequestAllowed } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { callerKey, ensureTrialSeed } from "@/lib/credits";
import { billingStore } from "@/lib/billingStore";
import { newWalletKey, recoveryCode, sameOrigin, setWalletCookie, walletKey } from "@/lib/wallet";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    if (!await accountRequestAllowed(req, true)) return NextResponse.json({ error: "Too many wallet requests. Please try again later." }, { status: 429 });
    let key = walletKey(req);
    if (!key) {
      const old = callerKey(req);
      await ensureTrialSeed(old);
      key = newWalletKey();
      await billingStore().createWallet(old, key);
    }
    const response = NextResponse.json({ recoveryCode: recoveryCode(key) }, { headers: { "Cache-Control": "private, no-store" } });
    setWalletCookie(response, key);
    return response;
  } catch {
    return NextResponse.json({ error: "Your wallet is temporarily unavailable. Please retry." }, { status: 503 });
  }
}
