import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { verifyDodoSignature, paymentItems } from "../lib/dodo";
import { callerKey, signClaim, verifyClaim, isDeveloperRequest } from "../lib/credits";
import { recoveryCode, verifyRecovery, sameOrigin } from "../lib/wallet";
import { NextRequest } from "next/server";
import { POST as claim } from "../app/api/account/claim/route";
import { POST as checkout } from "../app/api/checkout/route";
import { POST as webhook } from "../app/api/webhooks/dodo/route";

test.describe.configure({ mode: "serial" });
const key = "acct:0123456789abcdefghijklmn";
test.beforeAll(() => { process.env.CREDIT_SESSION_SECRET = "unit-test-secret-only-never-used-in-production"; });
test("wallet recovery is authenticated and cannot be used as a session cookie", () => {
  const code = recoveryCode(key);
  expect(verifyRecovery(code)).toBe(key);
  expect(verifyRecovery(code.slice(0, -1) + (code.endsWith("a") ? "b" : "a"))).toBeNull();
  expect(verifyRecovery("customer@example.com")).toBeNull();
  expect(verifyClaim(code)).toBeNull();
  expect(verifyRecovery(signClaim(key))).toBeNull();
  expect(verifyClaim(signClaim(key))).toBe(key);
});
test("malformed cookie cannot crash identity resolution and forged identity header is ignored outside tests", () => {
  const old = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    expect(callerKey(new Request("https://example.com", { headers: { cookie: "dpx_uid=%ZZ", "x-user-id": "someone-else", "x-forwarded-for": "192.0.2.42" } }))).toBe("ip:unknown");
    expect(isDeveloperRequest(new Request("https://example.com/?devkey=anything", { headers: { "x-dev-key": "anything" } }))).toBe(false);
  } finally { Object.assign(process.env, { NODE_ENV: old }); }
});
test("state-changing wallet requests require the same origin", () => {
  expect(sameOrigin(new Request("https://example.com/api", { headers: { Origin: "https://evil.example" } }))).toBe(false);
  expect(sameOrigin(new Request("https://example.com/api"))).toBe(false);
  expect(sameOrigin(new Request("https://example.com/api", { headers: { Origin: "https://example.com" } }))).toBe(true);
});
test("webhook signatures bind the body, timestamp, event ID and supported version", () => {
  const raw = '{"type":"payment.succeeded"}';
  const stamp = String(Math.floor(Date.now() / 1000));
  const secret = Buffer.from("test-webhook-signing-secret");
  const signature = createHmac("sha256", secret).update(`event-1.${stamp}.${raw}`).digest("base64");
  const headers = new Headers({ "webhook-id": "event-1", "webhook-timestamp": stamp, "webhook-signature": `v1,${signature}` });
  expect(verifyDodoSignature(raw, headers, `whsec_${secret.toString("base64")}`)).toBe(true);
  expect(verifyDodoSignature(raw + " ", headers, `whsec_${secret.toString("base64")}`)).toBe(false);
  expect(verifyDodoSignature(raw, headers, `whsec_${secret.toString("base64")}`, (Number(stamp) + 301) * 1000)).toBe(false);
  headers.set("webhook-signature", `v2,${signature}`);
  expect(verifyDodoSignature(raw, headers, `whsec_${secret.toString("base64")}`)).toBe(false);
});
test("payment quantities are counted and invalid quantities rejected", () => {
  expect(paymentItems({ product_cart: [{ product_id: "pdt_test", quantity: 3 }] })).toEqual([{ id: "pdt_test", quantity: 3 }]);
  for (const quantity of [0, -1, 1.5, "2", 101]) expect(() => paymentItems({ product_cart: [{ product_id: "pdt_test", quantity }] })).toThrow();
});
test("email-only claiming is rejected without consulting any account balance", async () => {
  const req = new NextRequest("https://example.com/api/account/claim", { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: JSON.stringify({ email: "victim@example.com" }) });
  const result = await claim(req);
  expect(result.status).toBe(400);
  expect(result.headers.get("set-cookie")).toBeNull();
});
test("checkout cannot be triggered cross-site or without wallet recovery acknowledgement", async () => {
  const cross = await checkout(new NextRequest("https://example.com/api/checkout", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" }));
  expect(cross.status).toBe(403);
  const direct = await checkout(new NextRequest("https://example.com/api/checkout", { method: "POST", headers: { Origin: "https://example.com" }, body: JSON.stringify({ product: "quickfix" }) }));
  expect(direct.status).toBe(400);
});
test("unverified webhooks never reach credit storage", async () => {
  const result = await webhook(new NextRequest("https://example.com/api/webhooks/dodo", { method: "POST", body: JSON.stringify({ type: "payment.succeeded", data: { total_amount: 500 } }) }));
  expect(result.status).toBe(401);
});

test("malformed non-ASCII signatures are rejected without crashing", () => {
  const headers = new Headers({ "webhook-id": "event-1", "webhook-timestamp": String(Math.floor(Date.now() / 1000)), "webhook-signature": "v1," + "é".repeat(44) });
  expect(verifyDodoSignature("{}", headers, "secret")).toBe(false);
});

test("development loopback aliases work without allowing foreign origins", () => {
  const old = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    expect(sameOrigin(new Request("http://localhost:3100/api", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } }))).toBe(true);
    expect(sameOrigin(new Request("http://localhost:3100/api", { headers: { host: "127.0.0.1:3100", origin: "http://evil.example" } }))).toBe(false);
  } finally { Object.assign(process.env, { NODE_ENV: old }); }
});
