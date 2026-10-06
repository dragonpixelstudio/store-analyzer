import { checkoutIpLimit, getClientIp } from "@/lib/ratelimit";
import { boundedJson } from "@/lib/requestBody";
import { isRecord as isBodyRecord } from "@/lib/dodo";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { CREDIT_PACKS } from "@/lib/billingCatalog";
import { billingStore } from "@/lib/billingStore";
import { dodoRequest, isRecord } from "@/lib/dodo";
import { sameOrigin, walletKey } from "@/lib/wallet";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const parsed = await boundedJson(req).catch(() => null);
  const body = isBodyRecord(parsed) ? parsed : null;
  const pack = CREDIT_PACKS.find(pack => pack.key === body?.product);
  if (!pack) return NextResponse.json({ error: "Choose an available credit pack." }, { status: 400 });
  const key = walletKey(req);
  if (!key || body?.recoveryAcknowledged !== true) return NextResponse.json({ error: "Save your wallet recovery code before checkout." }, { status: 400 });
  if (process.env.DODO_PAYMENTS_ENVIRONMENT !== "test_mode" && process.env.DODO_LIVE_PAYMENTS_ENABLED !== "true") return NextResponse.json({ error: "Paid checkout is not open yet. Your free credits and free export tools are still available." }, { status: 503 });
  const productId = process.env[pack.env];
  if (!productId) return NextResponse.json({ error: "This credit pack is temporarily unavailable." }, { status: 503 });
  try {
    const ipCheck = await checkoutIpLimit.limit(getClientIp(req));
    if (!ipCheck.success || ipCheck.reason === "timeout") return NextResponse.json({ error: "Too many checkout attempts. Please try again later." }, { status: 429 });
    const store = billingStore();
    const allowed = await store.redis.set(store.key("checkout-throttle", key), 1, { nx: true, ex: 15 });
    if (!allowed) return NextResponse.json({ error: "Please wait a few seconds before opening another checkout." }, { status: 429 });
    // Fail closed if the live catalog changes. The customer sees the same price here and at Dodo.
    const product = await dodoRequest(`/products/${encodeURIComponent(productId)}`);
    const price = product.price;
    if (!isRecord(price) || price.type !== "one_time_price" || price.currency !== "USD" || price.price !== pack.cents || price.pay_what_you_want === true || Number(price.discount || price.discount_bps || 0) !== 0) throw new Error("Catalog price mismatch");
    const id = randomUUID();
    await store.putOrder({ id, accountKey: key, productId, productKey: pack.key, credits: pack.credits, cents: pack.cents, currency: "USD", state: "pending", createdAt: new Date().toISOString() });
    const origin = process.env.NODE_ENV === "production" ? (process.env.APP_URL || "https://launch.dragonpixelstudio.com") : req.headers.get("origin")!;
    const data = await dodoRequest("/checkouts", {
      product_cart: [{ product_id: productId, quantity: 1 }],
      // Dodo validates discount eligibility; the webhook verifies discounted totals.
      billing_currency: "USD",
      feature_flags: { allow_discount_code: true, allow_currency_selection: false },
      return_url: `${origin}/checkout/success?order=${id}`,
      metadata: { dpx_account_key: key, dpx_order_id: id, dpx_product_key: pack.key, dpx_source: "credit_wallet" },
    });
    if (typeof data.checkout_url !== "string") throw new Error("Missing checkout URL");
    const url = new URL(data.checkout_url);
    if (url.protocol !== "https:" || !(url.hostname === "dodopayments.com" || url.hostname.endsWith(".dodopayments.com"))) throw new Error("Unexpected checkout host");
    return NextResponse.json({ checkoutUrl: url.href, orderId: id });
  } catch (error) {
    console.error("Checkout unavailable:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Checkout could not be opened. No payment was taken here. Please retry shortly." }, { status: 502 });
  }
}
