import { NextRequest, NextResponse } from "next/server";
import {
  CLAIM_COOKIE,
  emailKey,
  getCreditStore,
  signClaim,
} from "@/lib/credits";

export const runtime = "nodejs";

// POST /api/account/claim  { email }
// Links this browser to a purchase: if the email has a plan or credits from
// a Dodo webhook, set the signed identity cookie so callerKey resolves to
// the purchase account instead of the anonymous IP identity.
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const key = emailKey(email);
  const store = getCreditStore();
  const [plan, balance] = await Promise.all([store.getPlan(key), store.getBalance(key)]);

  if (plan === "free" && balance <= 0) {
    return NextResponse.json(
      {
        error:
          "No purchase found for this email yet. Use the exact email from your checkout receipt; new purchases can take a minute to arrive.",
      },
      { status: 404 }
    );
  }

  const res = NextResponse.json({
    account: { plan, isSubscriber: plan === "indie" || plan === "pro" },
    credits: { remaining: balance },
  });
  res.cookies.set(CLAIM_COOKIE, signClaim(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
