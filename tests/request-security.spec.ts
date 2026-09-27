import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { callerKey, signClaim, isDeveloperRequest } from "../lib/credits";
import { validateImageInput } from "../lib/imageInput";
import { boundedJson } from "../lib/requestBody";
import { storagePrefix, localFixturesEnabled } from "../lib/storageScope";
import { dodoBase } from "../lib/dodo";
import { POST as generate } from "../app/api/studio/generate/route";
import { POST as fix } from "../app/api/fix/route";
import { BillingStore } from "../lib/billingStore";
import { Redis } from "@upstash/redis";
import * as scoring from "../lib/rescore";
import { fixIpRatelimit, fixGlobalRatelimit } from "../lib/ratelimit";
import { RedisCreditStore } from "../lib/credits";
import { POST as telemetry } from "../app/api/event/route";
import { imageProviderLimit, reserveImageProviderCall } from "../lib/ratelimit";
import { sandboxImage } from "../lib/sandboxImage";
import { boundedFormData } from "../lib/requestBody";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => { process.env.CREDIT_SESSION_SECRET = "test-secret-only"; });
test("cookie names must match exactly, not a suffix controlled by another cookie", () => {
  const signed = signClaim("acct:0123456789abcdefghijklmn");
  expect(callerKey(new Request("http://localhost", { headers: { cookie: `evil_dpx_uid=${signed}` } }))).toBe("ip:local");
  expect(callerKey(new Request("http://localhost", { headers: { cookie: `other=one; dpx_uid=${signed}` } }))).toBe("acct:0123456789abcdefghijklmn");
});
test("non-ASCII developer credentials are rejected without an exception", () => {
  process.env.DEV_UNLIMITED_KEY = "aa";
  try { expect(isDeveloperRequest(new Request("http://localhost", { headers: { "x-dev-key": "éé" } }))).toBe(false); }
  finally { delete process.env.DEV_UNLIMITED_KEY; }
});
for (const origin of [undefined, "http://attacker.example", "https://evil-launch.dragonpixelstudio.com"]) {
  test(`generation and fixes reject untrusted Origin ${origin}`, async () => {
    const request = () => new NextRequest("http://localhost:3100/api", { method: "POST", headers: origin ? { origin } : {}, body: "{}" });
    expect((await generate(request())).status).toBe(403);
    expect((await fix(request())).status).toBe(403);
  });
}
test("bounded input rejects undeclared oversized bodies and invalid JSON", async () => {
  await expect(boundedJson(new Request("http://localhost", { method: "POST", body: JSON.stringify({ x: "x".repeat(100) }) }), 32)).rejects.toThrow();
  await expect(boundedJson(new Request("http://localhost", { method: "POST", body: "{" }))).rejects.toThrow();
});
test("raster decoder accepts normal images and rejects fake headers and decompression bombs", async () => {
  const image = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#ffaa44" } }).png().toBuffer();
  await expect(validateImageInput(image)).resolves.toBeUndefined();
  await expect(validateImageInput(image.subarray(0, 16))).rejects.toThrow();
  const oversized = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "black" } }).png().toBuffer();
  await expect(validateImageInput(oversized)).rejects.toThrow();
});
test("test billing uses a different ledger and fixture mode cannot activate in production", () => {
  const env = process.env.DODO_PAYMENTS_ENVIRONMENT, mode = process.env.NODE_ENV, fixtures = process.env.DPX_LOCAL_FIXTURES;
  try {
    process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";
    expect(storagePrefix()).toBe("dpx:sandbox:v1:");
    expect(dodoBase()).toBe("https://test.dodopayments.com");
    process.env.DPX_LOCAL_FIXTURES = "1";
    Object.assign(process.env, { NODE_ENV: "production" });
    expect(localFixturesEnabled()).toBe(false);
    process.env.DODO_PAYMENTS_ENVIRONMENT = "live_mode";
    expect(storagePrefix()).toBe("dpx:");
    process.env.DODO_PAYMENTS_ENVIRONMENT = "typo";
    expect(() => dodoBase()).toThrow();
  } finally {
    for (const [k,v] of Object.entries({ DODO_PAYMENTS_ENVIRONMENT: env, NODE_ENV: mode, DPX_LOCAL_FIXTURES: fixtures })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
test("invalid generation amounts fail before any storage access", async () => {
  const store = new BillingStore(new Redis({ url: "https://example.invalid", token: "test" }));
  for (const amount of [-1, 0.5, 4, NaN, Infinity]) {
    await expect(store.finishGeneration("acct:test", "test", amount)).rejects.toThrow("Invalid generation settlement");
    await expect(store.beginGeneration("acct:test", "test", amount)).rejects.toThrow("Invalid generation cost");
  }
});

test("tampering with the original score cannot make a delivered fix free", async () => {
  const restore: (() => void)[] = [];
  const substitute = (object: object, name: string, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    Object.defineProperty(object, name, { configurable: true, writable: true, value });
    restore.push(() => { if (descriptor) Object.defineProperty(object, name, descriptor); else Reflect.deleteProperty(object, name); });
  };
  const savedEnv = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN };
  Object.assign(process.env, { GEMINI_API_KEY: "test-only", UPSTASH_REDIS_REST_URL: "https://example.invalid", UPSTASH_REDIS_REST_TOKEN: "test-only" });
  const settlements: number[] = [];
  substitute(fixIpRatelimit, "limit", async () => ({ success: true }));
  substitute(fixGlobalRatelimit, "limit", async () => ({ success: true }));
  substitute(scoring, "rescoreSingleAsset", async () => ({ score: 20, summaryLine: "Fixture score below the client baseline" }));
  substitute(RedisCreditStore.prototype, "seedIfNew", async () => undefined);
  substitute(RedisCreditStore.prototype, "getBalance", async () => 2);
  substitute(BillingStore.prototype, "recoverStaleGenerations", async () => undefined);
  substitute(BillingStore.prototype, "beginGeneration", async () => 1);
  substitute(BillingStore.prototype, "finishGeneration", async (_a: string, _b: string, charged: number) => { settlements.push(charged); return 1; });
  substitute(globalThis, "fetch", async () => { throw new Error("Unexpected network access in regression test"); });
  try {
    const image = await sharp({ create: { width: 920, height: 430, channels: 3, background: "#aabbee" } }).png().toBuffer();
    for (const assetScore of [1000000, 100, 0]) {
      const response = await fix(new NextRequest("http://localhost:3100/api/fix", { method: "POST", headers: { origin: "http://localhost:3100" }, body: JSON.stringify({ assetType: "capsule", platform: "steam", imageBase64: image.toString("base64"), variants: 1, assetScore }) }));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.variants).toHaveLength(1);
      expect(result.credits.charged).toBe(1);
      expect(result.credits.refunded).toBe(0);
    }
    expect(settlements).toEqual([1, 1, 1]);
  } finally {
    restore.reverse().forEach(fn => fn());
    for (const [key,value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("telemetry rejects suffix-host CSRF and oversized event payloads", async () => {
  expect((await telemetry(new NextRequest("https://example.com/api/event", { method: "POST", headers: { origin: "https://evil-example.com", host: "example.com" }, body: '{"event":"upload"}' }))).status).toBe(403);
  expect((await telemetry(new NextRequest("https://example.com/api/event", { method: "POST", headers: { origin: "https://example.com" }, body: JSON.stringify({ event: "upload", padding: "x".repeat(2000) }) }))).status).toBe(400);
});
test("actual provider call budget fails closed before image generation", async () => {
  const original = imageProviderLimit.limit;
  imageProviderLimit.limit = async () => ({ success: false, limit: 300, remaining: 0, reset: Date.now() + 60000, pending: Promise.resolve() });
  try {
    await expect(reserveImageProviderCall()).rejects.toThrow("Image capacity reached");
    imageProviderLimit.limit = async () => ({ success: true, reason: "timeout", limit: 300, remaining: 0, reset: Date.now() + 60000, pending: Promise.resolve() });
    await expect(reserveImageProviderCall()).rejects.toThrow("Image capacity reached");
  }
  finally { imageProviderLimit.limit = original; }
});
test("sandbox images are unavailable in production even with fixture flag enabled", async () => {
  const mode = process.env.NODE_ENV, fixtures = process.env.DPX_LOCAL_FIXTURES, environment = process.env.DODO_PAYMENTS_ENVIRONMENT;
  Object.assign(process.env, { NODE_ENV: "production", DPX_LOCAL_FIXTURES: "1", DODO_PAYMENTS_ENVIRONMENT: "test_mode" });
  try { await expect(sandboxImage("icon")).rejects.toThrow("Local fixtures are disabled"); }
  finally { for (const [k,v] of Object.entries({ NODE_ENV: mode, DPX_LOCAL_FIXTURES: fixtures, DODO_PAYMENTS_ENVIRONMENT: environment })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});
test("multipart uploads are bounded without corrupting binary file bytes", async () => {
  const data = new FormData(); data.set("icon", new Blob([new Uint8Array([0, 255, 128, 13])], { type: "image/png" }), "icon.png");
  const req = new Request("http://localhost", { method: "POST", body: data });
  await expect(boundedFormData(req.clone(), 2)).rejects.toThrow();
  const parsed = await boundedFormData(req, 2048);
  expect([...new Uint8Array(await (parsed.get("icon") as File).arrayBuffer())]).toEqual([0, 255, 128, 13]);
});
