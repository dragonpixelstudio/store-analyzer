import { createHmac, timingSafeEqual } from "crypto";

export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function verifyDodoSignature(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("webhook-id");
  const stamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!secret || !id || id.length > 200 || !stamp || !/^\d+$/.test(stamp) || !signatures || Math.abs(now / 1000 - Number(stamp)) > 300) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${stamp}.${raw}`).digest("base64");
  return signatures.split(/\s+/).some(part => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && /^[A-Za-z0-9+/]+={0,2}$/.test(sig) && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}
export function dodoBase() {
  if (process.env.DODO_PAYMENTS_ENVIRONMENT && !["test_mode", "live_mode"].includes(process.env.DODO_PAYMENTS_ENVIRONMENT)) throw new Error("Invalid payment environment");
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "https://test.dodopayments.com" : "https://live.dodopayments.com";
}
export async function dodoRequest(path: string, body?: unknown) {
  if (!process.env.DODO_PAYMENTS_API_KEY) throw new Error("Dodo is not configured");
  const response = await fetch(`${dodoBase()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000), cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok || !isRecord(result)) throw new Error(`Dodo request failed (${response.status})`);
  return result;
}
export function paymentItems(data: Record<string, unknown>): { id: string; quantity: number }[] {
  if (!Array.isArray(data.product_cart)) return [];
  return data.product_cart.map(item => {
    if (!isRecord(item) || typeof item.product_id !== "string" || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 100) throw new Error("Invalid payment cart");
    return { id: item.product_id, quantity: Number(item.quantity) };
  });
}
