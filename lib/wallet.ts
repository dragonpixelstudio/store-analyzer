import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { CLAIM_COOKIE, callerKey, signClaim, verifyClaim } from "./credits";
import type { NextResponse } from "next/server";

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.NODE_ENV === "production" && process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(req.url).origin;
  if (!origin) return false;
  if (origin === expected) return true;
  // Next dev may normalize 127.0.0.1 to localhost in req.url. Compare the
  // browser Origin against the actual Host, never an arbitrary forwarded host.
  if (process.env.NODE_ENV !== "production") {
    const url = new URL(req.url);
    return origin === `${url.protocol}//${req.headers.get("host") || url.host}`;
  }
  return false;
}
export function walletKey(req: Request): string | null {
  const key = callerKey(req);
  return /^(acct|em):[A-Za-z0-9_-]{20,64}$/.test(key) ? key : null;
}
export const newWalletKey = () => `acct:${randomBytes(24).toString("base64url")}`;
export function setWalletCookie(res: NextResponse, key: string) {
  res.cookies.set(CLAIM_COOKIE, signClaim(key), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 });
}
function recoverySecret() {
  const secret = process.env.CREDIT_SESSION_SECRET || process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) throw new Error("Wallet signing secret is not configured");
  return secret;
}
export function recoveryCode(key: string) {
  if (!/^(acct|em):[A-Za-z0-9_-]{20,64}$/.test(key)) throw new Error("Invalid wallet");
  const encoded = Buffer.from(key).toString("base64url");
  const signature = createHmac("sha256", recoverySecret()).update(`recovery-v1:${encoded}`).digest("base64url");
  return `DPX1.${encoded}.${signature}`;
}
export function verifyRecovery(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 220) return null;
  const match = value.trim().match(/^DPX1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  const key = Buffer.from(match[1], "base64url").toString();
  if (!/^(acct|em):[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const expected = recoveryCode(key);
  const input = Buffer.from(value.trim());
  return input.length === Buffer.byteLength(expected) && timingSafeEqual(input, Buffer.from(expected)) ? key : null;
}
// Cookie and recovery credentials are deliberately separate purposes.
export { verifyClaim };
