import { POST as analyze } from "../app/api/analyze/route";
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { signClaim } from "../lib/credits";
import { POST as checkout } from "../app/api/checkout/route";
import { POST as fix } from "../app/api/fix/route";
import { POST as generate } from "../app/api/studio/generate/route";
import { POST as telemetry } from "../app/api/event/route";
import { checkoutIpLimit, eventIpLimit, eventGlobalLimit, fixIpRatelimit, fixGlobalRatelimit, studioIpRatelimit, studioGlobalRatelimit, ipRatelimit } from "../lib/ratelimit";

test.describe.configure({ mode: "serial" });
const env = { ...process.env };
test.beforeEach(() => {
  Object.assign(process.env, { GEMINI_API_KEY: "unit-test-only", CREDIT_SESSION_SECRET: "unit-test-only", DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PRODUCT_QUICKFIX: "pdt_test" });
  delete process.env.DPX_LOCAL_FIXTURES;
});
test.afterEach(() => {
  for (const key of ["GEMINI_API_KEY", "CREDIT_SESSION_SECRET", "DODO_PAYMENTS_ENVIRONMENT", "DODO_PRODUCT_QUICKFIX", "DPX_LOCAL_FIXTURES"]) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
});
const limited = (timeout = false) => ({ success: true, ...(timeout ? { reason: "timeout" as const } : {}), limit: 12, remaining: 0, reset: Date.now() + 60000, pending: Promise.resolve() });
const request = (body: unknown) => new NextRequest("http://localhost:3100/api", {
  method: "POST", headers: { origin: "http://localhost:3100", cookie: "dpx_uid=" + signClaim("acct:0123456789abcdefghijklmn") }, body: JSON.stringify(body),
});
for (const scope of ["ip", "global"] as const) {
  test(`generation and telemetry stop before credit or provider access on ${scope} limit timeout`, async () => {
    const limiters = [fixIpRatelimit, fixGlobalRatelimit, studioIpRatelimit, studioGlobalRatelimit, eventIpLimit, eventGlobalLimit];
    const originals = limiters.map(l => l.limit);
    const fetch = globalThis.fetch;
    limiters.forEach((limiter, index) => { limiter.limit = async () => limited(index % 2 === (scope === "ip" ? 0 : 1)); });
    globalThis.fetch = async () => { throw new Error("No network request should escape a timed-out rate check"); };
    try {
      expect((await fix(request({}))).status).toBe(429);
      expect((await generate(request({ assetType: "capsule", gameName: "Test", gamePitch: "A fox explores a forest", formatId: "steam-header" }))).status).toBe(429);
      expect((await telemetry(request({ event: "upload" }))).status).toBe(429);
    } finally { globalThis.fetch = fetch; limiters.forEach((l, i) => { l.limit = originals[i]; }); }
  });
}
test("checkout rejects a rate-limit timeout before creating an order or contacting Dodo", async () => {
  const original = checkoutIpLimit.limit, fetch = globalThis.fetch;
  checkoutIpLimit.limit = async () => limited(true);
  globalThis.fetch = async () => { throw new Error("Dodo/Redis must not be contacted"); };
  try { expect((await checkout(request({ product: "quickfix", recoveryAcknowledged: true }))).status).toBe(429); }
  finally { checkoutIpLimit.limit = original; globalThis.fetch = fetch; }
});
test("analysis rejects truncated and animated images before model or cache access", async () => {

  const original = ipRatelimit.limit, fetch = globalThis.fetch;
  ipRatelimit.limit = async () => limited();
  globalThis.fetch = async () => { throw new Error("No network access before image validation"); };
  try {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "black" } }).png().toBuffer();
    const animated = await sharp(Buffer.concat([Buffer.alloc(8 * 8 * 3), Buffer.alloc(8 * 8 * 3, 255)]), { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    for (const [bytes, mime] of [[png.subarray(0, 24), "image/png"], [animated, "image/webp"]] as const) {
      const form = new FormData(); form.set("icon", new Blob([new Uint8Array(bytes)], { type: mime }), "upload");
      const result = await analyze(new Request("http://localhost:3100/api/analyze", { method: "POST", headers: { origin: "http://localhost:3100" }, body: form }));
      expect(result.status).toBe(400);
      expect((await result.json()).error).toContain("valid single");
    }
  } finally { ipRatelimit.limit = original; globalThis.fetch = fetch; }
});
test("analysis stops on a limit timeout before decoding any upload", async () => {

  const original = ipRatelimit.limit;
  ipRatelimit.limit = async () => limited(true);
  try { expect((await analyze(request({}))).status).toBe(429); }
  finally { ipRatelimit.limit = original; }
});
