import { boundedText } from "@/lib/requestBody";
import { NextRequest, NextResponse } from "next/server";
import { billingStore, type Payment } from "@/lib/billingStore";
import { productGrants } from "@/lib/billingCatalog";
import { dodoRequest, isRecord, paymentItems, verifyDodoSignature } from "@/lib/dodo";
import { emailKey } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  const raw = await boundedText(req, 1048576).catch(() => null);
  if (raw === null) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (Buffer.byteLength(raw) > 1048576) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyDodoSignature(raw, req.headers, process.env.DODO_PAYMENTS_WEBHOOK_SECRET || "")) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const event: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!isRecord(event) || typeof event.type !== "string" || !isRecord(event.data)) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const data = event.data;
  const type = event.type;
  if (!["payment.succeeded", "payment.failed", "payment.cancelled", "refund.succeeded", "subscription.active", "subscription.renewed", "subscription.expired", "subscription.failed", "subscription.revoked"].includes(type)) return NextResponse.json({ received: true, ignored: true });
  try {
    const store = billingStore();
    // Honor delivery markers written by the previous implementation during migration.
    const legacySeen = await store.redis.get(store.key("once", `wh:${req.headers.get("webhook-id")}`));
    if (legacySeen) return NextResponse.json({ received: true, duplicate: true });
    if (type === "payment.failed" || type === "payment.cancelled") {
      const metadata = isRecord(data.metadata) ? data.metadata : {};
      if (typeof metadata.dpx_order_id !== "string" || typeof metadata.dpx_account_key !== "string") return NextResponse.json({ received: true, ignored: true });
      const changed = await store.markCheckoutInterrupted(metadata.dpx_order_id, metadata.dpx_account_key, type === "payment.failed" ? "failed" : "cancelled");
      if (changed < 0) throw new Error("Checkout failure owner mismatch");
    } else if (type === "refund.succeeded") {
      if (typeof data.refund_id !== "string" || typeof data.payment_id !== "string") throw new Error("Refund identifiers missing");
      const payment = await store.getPayment(data.payment_id);
      if (!payment) throw new Error("Refund arrived before payment; retry required");
      if (data.currency && data.currency !== payment.currency) throw new Error("Refund currency mismatch");
      const amount = typeof data.amount === "number" ? data.amount : data.is_partial === false ? null : NaN;
      await store.settleRefund(data.refund_id, payment, amount);
    } else {
      const metadata = isRecord(data.metadata) ? data.metadata : {};
      const customer = isRecord(data.customer) ? data.customer : {};
      const account = typeof metadata.dpx_account_key === "string" && /^(acct|em):[A-Za-z0-9_-]{20,64}$/.test(metadata.dpx_account_key)
        ? metadata.dpx_account_key : typeof customer.email === "string" ? emailKey(customer.email) : null;
      const grants = productGrants();
      let items = paymentItems(data);
      if (!items.length && typeof data.product_id === "string") items = [{ id: data.product_id, quantity: 1 }];
      // Subscription payments identify the subscription; resolve its canonical product.
      if (!items.length && typeof data.subscription_id === "string" && type === "payment.succeeded") {
        const subscription = await dodoRequest(`/subscriptions/${encodeURIComponent(data.subscription_id)}`);
        if (typeof subscription.product_id === "string") items = [{ id: subscription.product_id, quantity: 1 }];
      }
      const matched = items.filter(item => grants[item.id]);
      if (!matched.length) {
        if (metadata.dpx_order_id || metadata.dpx_source) throw new Error("Store product configuration missing");
        return NextResponse.json({ received: true, ignored: true });
      }
      if (!account) throw new Error("Account identity missing");
      if (type === "payment.succeeded") {
        if (typeof data.payment_id !== "string" || typeof data.currency !== "string" || typeof data.total_amount !== "number") throw new Error("Payment fields missing");
        const credits = matched.reduce((sum, item) => sum + grants[item.id].credits * item.quantity, 0);
        const orderId = typeof metadata.dpx_order_id === "string" ? metadata.dpx_order_id : undefined;
        // Legacy deliveries lack permanent payment IDs in the old ledger. Never
        // mint again from a replay: reconcile old receipts before migrating them.
        if (await store.getPayment(data.payment_id)) return NextResponse.json({ received: true, duplicate: true });
        if (!orderId) throw new Error("Legacy payment requires reconciliation before credit migration");
        if (orderId) {
          const order = await store.getOrder(orderId);
          if (!order || items.length !== 1 || items[0].id !== order.productId || items[0].quantity !== 1) throw new Error("Checkout product mismatch");
        }
        const payment: Payment = { id: data.payment_id, accountKey: account, credits, amount: data.total_amount, currency: data.currency, orderId, refundedAmount: 0, revokedCredits: 0 };
        await store.settlePayment(payment);
      } else {
        // Subscription lifecycle changes plan only; payment.succeeded is the sole credit grant.
        const plan = type === "subscription.active" || type === "subscription.renewed" ? matched.map(item => grants[item.id].plan).find(Boolean) : "free";
        const stamp = typeof event.timestamp === "string" ? Date.parse(event.timestamp) : NaN;
        if (!Number.isFinite(stamp) || typeof data.subscription_id !== "string" || !plan) throw new Error("Subscription event fields missing");
        await store.redis.eval(`local old=redis.call('GET',KEYS[1]); if old then local s=cjson.decode(old); if s.at>tonumber(ARGV[1]) or (ARGV[3]=='free' and s.id~=ARGV[2]) then return 0 end end redis.call('SET',KEYS[1],cjson.encode({at=tonumber(ARGV[1]),id=ARGV[2]})); redis.call('SET',KEYS[2],ARGV[3]); return 1`, [store.key("subscription-state", account), store.key("plan", account)], [stamp, data.subscription_id, plan]);
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Dodo webhook needs retry:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Event could not be reconciled; retry required" }, { status: 503 });
  }
}
