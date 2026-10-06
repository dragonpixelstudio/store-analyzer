import { test, expect } from "@playwright/test";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { reserveReview } from "../lib/reviewBilling";
import { ownerTestAccess } from "../lib/ownerTesting";
import { BillingStore } from "../lib/billingStore";
import { CLAIM_COOKIE, signClaim } from "../lib/credits";
import { ArtworkJobStore, jobId, type ArtworkJob } from "../lib/artworkJobs";
import { withJobBilling, type JobBilling } from "../lib/jobContext";

const account = "acct:review-security-test-account";
const access = { account, balance: 1, owner: false };
const request = () => new Request("https://example.com/api/analyze", { headers: { "idempotency-key": randomUUID() } });
const full = async () => ({ success: false, remaining: 0, reservation: "unused", retryAfter: 60, error: "Daily limit" });
const free = async () => ({ success: true, remaining: 2, reservation: "free-reservation", retryAfter: 60, error: "" });

test("extra reviews require explicit consent and free slots always win", async () => {
 let calls = 0;
 const billing = () => ({ beginGeneration: async () => { calls++; return 1; } }) as unknown as BillingStore;
 expect(await reserveReview(request(), false, access, full, billing)).toMatchObject({ success: false, code: "ANALYSIS_LIMIT", canUseCredits: true });
 expect(await reserveReview(request(), false, { ...access, balance: 0 }, full, billing)).toMatchObject({ success: false, canUseCredits: false });
 expect(await reserveReview(request(), true, { account: null, balance: 0, owner: false }, full, billing)).toMatchObject({ success: false, canUseCredits: false });
 expect(calls).toBe(0);
 expect(await reserveReview(request(), true, access, free, billing)).toMatchObject({ success: true, reservation: { mode: "free" } });
 expect(calls).toBe(0);
 expect(await reserveReview(request(), true, access, full, billing)).toMatchObject({ success: true, reservation: { mode: "credit", account } });
 expect(calls).toBe(1);
});

test("insufficient funds and duplicate operations never start paid reviews", async () => {
 for (const [result, status] of [[0, 402], [-1, 409]]) {
  const billing = () => ({ beginGeneration: async () => result }) as unknown as BillingStore;
  expect(await reserveReview(request(), true, access, full, billing)).toMatchObject({ success: false, status });
 }
 const never = () => { throw new Error("Owner review must not debit a wallet"); };
 expect(await reserveReview(request(), false, { ...access, owner: true }, full, never)).toMatchObject({ success: true, reservation: { mode: "owner" } });
});

test("owner access requires a signed wallet and a live server grant", async () => {
 const saved = process.env.CREDIT_SESSION_SECRET; process.env.CREDIT_SESSION_SECRET = "test-only-owner-signing";
 let reads = 0; let record: unknown = { scope: "analysis", expiresAt: 2000 };
 const store = { get: async (key: string) => { reads++; expect(key).toBe("test:owner-test:" + account); return record; } } as Pick<Redis, "get">;
 const signed = new Request("https://example.com", { headers: { cookie: CLAIM_COOKIE + "=" + signClaim(account) } });
 try {
  expect(await ownerTestAccess(new Request("https://example.com?owner=true", { headers: { "x-owner": "true", cookie: CLAIM_COOKIE + "=" + account } }), store, "test:", 1000)).toBeNull();
  expect(reads).toBe(0);
  expect(await ownerTestAccess(signed, store, "test:", 1000)).toEqual(record);
  expect(await ownerTestAccess(signed, store, "test:", 2000)).toBeNull();
  for (const value of [null, { scope: "admin", expiresAt: 2000 }, { scope: "analysis", expiresAt: "2000" }]) { record = value; expect(await ownerTestAccess(signed, store, "test:", 1000)).toBeNull(); }
 } finally { if (saved === undefined) delete process.env.CREDIT_SESSION_SECRET; else process.env.CREDIT_SESSION_SECRET = saved; }
});

test("paid review publication is atomic, refunds failures and cannot reserve after expiration", async () => {
 test.skip(process.env.RUN_REDIS_BILLING_TESTS !== "1", "Opt-in isolated Redis integration"); test.setTimeout(120000); loadEnvConfig(process.cwd());
 const redis = Redis.fromEnv(), prefix = "dpx:test:paid-review:" + randomUUID() + ":";
 const store = new ArtworkJobStore(redis, prefix), billing = new BillingStore(redis, prefix);
 const make = (): ArtworkJob => { const operation = randomUUID(); return { id: jobId(account, "analyze", operation), account, operation, kind: "analyze", fingerprint: "test", created: Date.now(), state: "queued", network: "192.0.2.9", contentType: "multipart/form-data", dispatched: 0, attempts: 0 }; };
 try {
  await redis.set(billing.key("bal", account), 1);
  const a = make(), b = make();
  for (const job of [a, b]) { await store.create(job, "input"); await store.claim(job.id); }
  const charges = await Promise.all([a, b].map(job => billing.beginGeneration(account, job.operation, 1, job.id)));
  expect(charges.sort()).toEqual([0, 1]);
  const winner = await redis.get(billing.key("op", account + ":" + a.operation)) ? a : b;
  const scope: JobBilling = { account, operation: winner.operation, reserved: 1, charged: 1 };
  await Promise.all([store.complete(winner, { status: 200, body: '{"reportId":"review-result"}' }, scope), store.complete(winner, { status: 200, body: '{}' }, scope)]);
  expect(await redis.get(billing.key("bal", account))).toBe(0);
  expect(await billing.beginGeneration(account, winner.operation, 1, winner.id)).toBe(-1);
  expect(await billing.history(account)).toMatchObject([{ kind: "analysis", amount: -1, label: "Artwork review" }]);
  await redis.set(billing.key("bal", account), 1);
  for (const outcome of ["failed", "interrupted"] as const) {
   const job = make(), context: JobBilling = { account, operation: job.operation };
   await store.create(job, "input"); await store.claim(job.id);
   await withJobBilling(context, async () => { expect(await billing.beginGeneration(account, job.operation, 1, job.id)).toBe(1); await billing.finishGeneration(account, job.operation, 0, "analysis"); });
   if (outcome === "failed") await store.complete(job, { status: 502, body: '{"error":"Provider failed"}' }, context);
   else await store.expire(job, job.created + 600001);
   await store.expire(job, job.created + 600002);
   expect(await redis.get(billing.key("bal", account))).toBe(1);
  }
  const late = make(); await store.create(late, "input"); await store.claim(late.id); await store.expire(late, late.created + 600001);
  expect(await billing.beginGeneration(account, late.operation, 1, late.id)).toBe(-1);
  expect(await redis.get(billing.key("bal", account))).toBe(1);
 } finally { let cursor = 0; do { const page = await redis.scan(cursor, { match: prefix + "*", count: 100 }); cursor = Number(page[0]); if (page[1].length) await redis.del(...page[1]); } while (cursor); }
});

test("analyzer handler bills delivered paid reviews, returns failed credits and keeps owner capacity limits", async () => {
 const { POST: analyze } = await import("../lib/server/analyzeHandler");
 const { getCreditStore } = await import("../lib/credits");
 const limits = await import("../lib/ratelimit");

 const sharp = (await import("sharp")).default;
 const env = { NODE_ENV: process.env.NODE_ENV, DODO_PAYMENTS_ENVIRONMENT: process.env.DODO_PAYMENTS_ENVIRONMENT, DPX_LOCAL_FIXTURES: process.env.DPX_LOCAL_FIXTURES, GEMINI_API_KEY: process.env.GEMINI_API_KEY, CREDIT_SESSION_SECRET: process.env.CREDIT_SESSION_SECRET, UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN };
 const restore: (() => void)[] = [];
 const substitute = (object: object, key: string, value: unknown) => { const descriptor = Object.getOwnPropertyDescriptor(object, key); Object.defineProperty(object, key, { configurable: true, writable: true, value }); restore.push(() => { if (descriptor) Object.defineProperty(object, key, descriptor); else Reflect.deleteProperty(object, key); }); };
 Object.assign(process.env, { NODE_ENV: "development", DODO_PAYMENTS_ENVIRONMENT: "test_mode", DPX_LOCAL_FIXTURES: "1", GEMINI_API_KEY: "test", CREDIT_SESSION_SECRET: "test-only", UPSTASH_REDIS_REST_URL: "https://example.invalid", UPSTASH_REDIS_REST_TOKEN: "test" });
 const store = getCreditStore(), debits: number[] = [], settlements: number[] = [];
 let ownerEnabled = false, quotaCalls = 0;

 substitute(store, "getBalance", async () => 1);
 substitute(store, "getPlan", async () => "free");
 substitute(store, "reserveReports", async () => { quotaCalls++; return { success: false, remaining: 0 }; });
 substitute(limits.reviewWalletLimit, "limit", async () => ({ success: true }));
 substitute(limits.globalRatelimit, "limit", async () => ({ success: false }));
 substitute(BillingStore.prototype, "beginGeneration", async (_account: string, _id: string, amount: number) => { debits.push(amount); return 1; });
 substitute(BillingStore.prototype, "finishGeneration", async (_account: string, _id: string, amount: number) => { settlements.push(amount); return 1; });
 substitute(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { const commands = JSON.parse(String(init?.body)); const reply = (command: string[]) => ({ result: command[1]?.includes("owner-test:") && ownerEnabled ? JSON.stringify({ scope: "analysis", expiresAt: Date.now() + 60000 }) : command[0].toLowerCase() === "hgetall" ? [] : command[0].toLowerCase() === "set" ? "OK" : null }); return Response.json(Array.isArray(commands[0]) ? commands.map(reply) : reply(commands)); });
 const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
 const upload = (consent: boolean) => { const form = new FormData(); form.set("icon", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "image.png"); if (consent) form.set("creditConsent", "1"); return new Request("http://localhost/api/analyze", { method: "POST", headers: { origin: "http://localhost", cookie: CLAIM_COOKIE + "=" + signClaim(account), "idempotency-key": randomUUID() }, body: form }); };
 try {
  const denied = await analyze(upload(false)); expect(denied.status).toBe(429); expect((await denied.json()).canUseCredits).toBe(true); expect(debits).toEqual([]);
  const paid = await analyze(upload(true)); expect(paid.status).toBe(200); expect(await paid.json()).toMatchObject({ reviewBilling: "credit", credits: { charged: 1, refunded: 0 } }); expect(settlements).toEqual([1]);
  delete process.env.DPX_LOCAL_FIXTURES;
  const failed = await analyze(upload(true)); expect(failed.status).toBe(429); expect(await failed.json()).toMatchObject({ credits: { charged: 0, refunded: 1 } }); expect(settlements).toEqual([1, 0]);
  ownerEnabled = true; const quotaBefore = quotaCalls;
  const limitedOwner = await analyze(upload(false)); expect(limitedOwner.status).toBe(429); expect((await limitedOwner.json()).error).toContain("daily capacity"); expect(quotaCalls).toBe(quotaBefore);
  process.env.DPX_LOCAL_FIXTURES = "1";
  const ownerReview = await analyze(upload(false)); expect(ownerReview.status).toBe(200); expect(await ownerReview.json()).toMatchObject({ reviewBilling: "owner" }); expect(debits).toEqual([1, 1]);
 } finally { restore.reverse().forEach(action => action()); for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
