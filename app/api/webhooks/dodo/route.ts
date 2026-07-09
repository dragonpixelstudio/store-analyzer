import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { emailKey, getCreditStore, type AccountPlan } from "@/lib/credits";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Product mapping. Set these env vars to the product IDs from the Dodo
// dashboard (Products page). Subscriptions grant a plan + monthly credits;
// one-time products grant credits only.
// ---------------------------------------------------------------------------
type Grant = { plan?: AccountPlan; credits: number };

function productGrants(): Record<string, Grant> {
  const map: Record<string, Grant> = {};
  const add = (envName: string, grant: Grant) => {
    const id = process.env[envName];
    if (id) map[id] = grant;
  };
  add("DODO_PRODUCT_INDIE", { plan: "indie", credits: 50 });
  add("DODO_PRODUCT_PRO", { plan: "pro", credits: 200 });
  add("DODO_PRODUCT_QUICKFIX", { credits: 6 });
  add("DODO_PRODUCT_TOPUP_25", { credits: 25 });
  add("DODO_PRODUCT_TOPUP_100", { credits: 100 });
  add("DODO_PRODUCT_TOPUP_250", { credits: 250 });
  return map;
}

// ---------------------------------------------------------------------------
// Standard Webhooks signature verification (Dodo follows this spec).
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Secret: `whsec_` + base64 key. Header may hold several space-separated
// `v1,<base64sig>` entries; any match passes.
// ---------------------------------------------------------------------------
function verifySignature(rawBody: string, req: NextRequest): boolean {
  const secretRaw = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secretRaw) return false;

  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject stale deliveries (replay protection, 5 minutes).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = secretRaw.startsWith("whsec_")
    ? Buffer.from(secretRaw.slice(6), "base64")
    : Buffer.from(secretRaw, "utf8");

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of signatureHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Payload helpers: Dodo event bodies vary by type; read defensively.
// ---------------------------------------------------------------------------
type DodoEvent = {
  type?: string;
  data?: {
    payload_type?: string;
    product_id?: string;
    product_cart?: Array<{ product_id?: string; quantity?: number }>;
    customer?: { email?: string; customer_id?: string };
    metadata?: Record<string, string>;
  };
};

function extractEmail(event: DodoEvent): string | null {
  const email = event.data?.customer?.email;
  return typeof email === "string" && email.includes("@") ? email : null;
}

function extractProductIds(event: DodoEvent): string[] {
  const ids: string[] = [];
  if (typeof event.data?.product_id === "string") ids.push(event.data.product_id);
  for (const item of event.data?.product_cart ?? []) {
    if (typeof item?.product_id === "string") ids.push(item.product_id);
  }
  return ids;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(rawBody) as DodoEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const store = getCreditStore();

  // Idempotency: Dodo delivers at-least-once; process each webhook-id once.
  const webhookId = req.headers.get("webhook-id") ?? "";
  const firstTime = await store.markOnce(`wh:${webhookId}`, 60 * 60 * 24 * 3);
  if (!firstTime) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const type = event.type ?? "";
  const email = extractEmail(event);
  const grants = productGrants();

  if (!email) {
    // Nothing to key the account on; acknowledge so Dodo stops retrying.
    console.warn(`dodo webhook ${type}: no customer email in payload`);
    return NextResponse.json({ received: true });
  }

  const key = emailKey(email);

  try {
    switch (type) {
      // Subscription lifecycle: plan + monthly credit grant.
      case "subscription.active":
      case "subscription.renewed": {
        for (const productId of extractProductIds(event)) {
          const grant = grants[productId];
          if (!grant) continue;
          if (grant.plan) await store.setPlan(key, grant.plan);
          if (grant.credits > 0) await store.addCredits(key, grant.credits);
          console.log(`dodo ${type}: ${key} -> plan=${grant.plan ?? "-"} +${grant.credits} credits`);
        }
        break;
      }

      // Loss of subscription: back to free. (Simple policy for launch:
      // access ends on cancellation event. Soften later if needed by keeping
      // the plan until period end from the payload's expiry field.)
      case "subscription.cancelled":
      case "subscription.canceled":
      case "subscription.expired":
      case "subscription.failed":
      case "subscription.revoked": {
        await store.setPlan(key, "free");
        console.log(`dodo ${type}: ${key} -> plan=free`);
        break;
      }

      // One-time purchases (Quick Fix, top-ups). Subscription invoices also
      // emit payment.succeeded, so only credit products that are NOT plans -
      // plan products are credited by the subscription events above.
      case "payment.succeeded": {
        for (const productId of extractProductIds(event)) {
          const grant = grants[productId];
          if (!grant || grant.plan) continue;
          await store.addCredits(key, grant.credits);
          console.log(`dodo payment.succeeded: ${key} +${grant.credits} credits (${productId})`);
        }
        break;
      }

      // Refund: pull the credits back for one-time products.
      case "refund.succeeded": {
        for (const productId of extractProductIds(event)) {
          const grant = grants[productId];
          if (!grant || grant.plan) continue;
          await store.reserve(key, grant.credits); // best-effort clawback
          console.log(`dodo refund.succeeded: ${key} -${grant.credits} credits`);
        }
        break;
      }

      default:
        console.log(`dodo webhook unhandled type: ${type}`);
    }
  } catch (err: unknown) {
    console.error("dodo webhook processing error:", err instanceof Error ? err.message : err);
    // Still 200: signature was valid and the id is marked; retries would be
    // no-ops. Errors here are visible in logs for manual reconciliation.
  }

  return NextResponse.json({ received: true });
}
