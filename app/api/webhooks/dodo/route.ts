import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { emailKey, getCreditStore, type AccountPlan } from "@/lib/credits";

export const runtime = "nodejs";

type Grant = { plan?: AccountPlan; credits: number };
type UnknownRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: string[]): unknown {
  let cur = value;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function stringAt(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const v = readPath(value, path);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function recordAt(value: unknown, paths: string[][]): UnknownRecord | null {
  for (const path of paths) {
    const v = readPath(value, path);
    if (isRecord(v)) return v;
  }
  return null;
}

function collectProductIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectProductIds(item, out);
    return out;
  }
  if (!isRecord(value)) return out;

  for (const [key, item] of Object.entries(value)) {
    if (key === "product_id" && typeof item === "string" && item.trim()) {
      out.add(item.trim());
      continue;
    }
    if (key === "product_cart" || key === "items" || key === "line_items" || isRecord(item) || Array.isArray(item)) {
      collectProductIds(item, out);
    }
  }
  return out;
}

function verifySignature(rawBody: string, req: NextRequest): boolean {
  const secretRaw = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secretRaw) return false;

  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

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

function eventType(event: unknown): string {
  return (
    stringAt(event, [["type"], ["event_type"], ["payload_type"], ["data", "payload_type"]]) ?? ""
  );
}

function extractMetadata(event: unknown): UnknownRecord {
  const metadataSources = [
    recordAt(event, [["metadata"]]),
    recordAt(event, [["data", "metadata"]]),
    recordAt(event, [["data", "object", "metadata"]]),
    recordAt(event, [["data", "payment", "metadata"]]),
    recordAt(event, [["data", "subscription", "metadata"]]),
  ];

  return Object.assign({}, ...metadataSources.filter(Boolean));
}

function extractAccountKey(event: unknown): string | null {
  const metadata = extractMetadata(event);
  const key = metadata.dpx_account_key;
  if (typeof key === "string" && /^(acct|em):[A-Za-z0-9:_-]+$/.test(key)) {
    return key;
  }
  return null;
}

function extractEmail(event: unknown): string | null {
  const email = stringAt(event, [
    ["data", "customer", "email"],
    ["data", "object", "customer", "email"],
    ["data", "customer_email"],
    ["data", "object", "customer_email"],
    ["data", "email"],
    ["data", "object", "email"],
    ["data", "payment", "customer", "email"],
    ["data", "subscription", "customer", "email"],
  ]);

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function extractCustomerKey(event: unknown): string | null {
  return extractAccountKey(event) ?? (extractEmail(event) ? emailKey(extractEmail(event)!) : null);
}

function extractProductIds(event: unknown): string[] {
  return [...collectProductIds(event)];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const store = getCreditStore();
  const webhookId = req.headers.get("webhook-id") || stringAt(event, [["id"], ["event_id"]]) || rawBody.slice(0, 64);
  const onceKey = `wh:${webhookId}`;
  const firstTime = await store.markOnce(onceKey, 60 * 60 * 24 * 30);
  if (!firstTime) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const type = eventType(event);
  const key = extractCustomerKey(event);
  const productIds = extractProductIds(event);
  const grants = productGrants();

  if (!key) {
    console.warn(`dodo webhook ${type}: no account metadata or customer email in payload`);
    return NextResponse.json({ received: true, ignored: "missing_customer_key" });
  }

  try {
    switch (type) {
      case "subscription.active":
      case "subscription.renewed": {
        for (const productId of productIds) {
          const grant = grants[productId];
          if (!grant) continue;
          if (grant.plan) await store.setPlan(key, grant.plan);
          if (grant.credits > 0) await store.addCredits(key, grant.credits);
          console.log(`dodo ${type}: ${key} -> plan=${grant.plan ?? "-"} +${grant.credits} credits`);
        }
        break;
      }

      // Keep cancelled subscriptions active until Dodo sends an end-state event.
      // Some providers emit cancellation immediately when the user disables renewal.
      case "subscription.cancelled":
      case "subscription.canceled": {
        console.log(`dodo ${type}: ${key} renewal cancelled; keeping current plan until expiry`);
        break;
      }

      case "subscription.expired":
      case "subscription.failed":
      case "subscription.revoked": {
        await store.setPlan(key, "free");
        console.log(`dodo ${type}: ${key} -> plan=free`);
        break;
      }

      case "payment.succeeded": {
        for (const productId of productIds) {
          const grant = grants[productId];
          if (!grant || grant.plan) continue;
          await store.addCredits(key, grant.credits);
          console.log(`dodo payment.succeeded: ${key} +${grant.credits} credits (${productId})`);
        }
        break;
      }

      case "refund.succeeded": {
        for (const productId of productIds) {
          const grant = grants[productId];
          if (!grant || grant.plan) continue;
          await store.reserve(key, grant.credits);
          console.log(`dodo refund.succeeded: ${key} -${grant.credits} credits`);
        }
        break;
      }

      default:
        console.log(`dodo webhook unhandled type: ${type}`);
    }
  } catch (err: unknown) {
    await store.clearOnce(onceKey).catch(() => undefined);
    console.error("dodo webhook processing error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
