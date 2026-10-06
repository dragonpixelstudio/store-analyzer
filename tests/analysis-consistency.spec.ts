import { analyzeArtwork } from "../lib/analysisEngine";
import { test, expect } from "@playwright/test";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { consistentReview, reviewIdentity, ReviewBusyError, ReviewStorageError, REVIEW_TTL } from "../lib/analysisConsistency";
import { normalizeForAnalysis } from "../lib/imageNormalize";
import { buildAnalyzerPrompt } from "../lib/analyzerPrompt";
import { isActionableFix } from "../lib/analyzerCore";
type Result = { score: number };
const valid = (value: unknown): value is Result => !!value && typeof value === "object" && Number.isFinite((value as Result).score);
const id = "a".repeat(64), prefix = "test:";
function memory() {
  const data = new Map<string, unknown>();
  const store = {
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: unknown) => { if (data.has(key)) return null; data.set(key, value); return "OK"; },
    eval: async (_script: string, keys: string[], args: unknown[]) => {
      if (keys.length === 1) { if (data.get(keys[0]) !== args[0]) return 0; data.delete(keys[0]); return 1; }
      if (data.get(keys[1]) !== args[0]) return 0;
      if (!data.has(keys[0])) data.set(keys[0], JSON.parse(String(args[1])));
      data.delete(keys[1]); return 1;
    },
  } as unknown as Pick<Redis, "get" | "set" | "eval">;
  return { data, store };
}
const options = { prefix, sleep: async () => { await new Promise(resolve => setTimeout(resolve, 1)); }, waitMs: 1000 };
test("identity ignores filenames, browser and wallet, but separates actual pixels and review settings", async () => {
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "red" } }).png().toBuffer();
  const annotated = await sharp(png).withMetadata({ density: 144 }).png().toBuffer();
  const webp = await sharp(png).webp({ lossless: true }).toBuffer();
  const normalized = (await normalizeForAnalysis(png)).base64;
  expect((await normalizeForAnalysis(annotated)).base64).toBe(normalized);
  expect((await normalizeForAnalysis(webp)).base64).toBe(normalized);
  const assets = [{ kind: "steamCapsule" as const, aspect: "1:1", normalized }];
  const original = reviewIdentity(assets, "unknown", "Grid  Demon — action", null);
  expect(reviewIdentity(assets, "steam", "Grid Demon - action", null)).toEqual(original);
  expect(reviewIdentity(assets, "steam", "Different context", null).id).not.toBe(original.id);
  expect(reviewIdentity(assets, "app-store", original.context, null).id).not.toBe(original.id);
  expect(reviewIdentity(assets, "steam", original.context, "action").id).not.toBe(original.id);
  expect(reviewIdentity([{ ...assets[0], kind: "keyArt" }], "steam", original.context, null).id).not.toBe(original.id);
  const edited = await sharp(png).composite([{ input: Buffer.from([0, 0, 255]), raw: { width: 1, height: 1, channels: 3 }, left: 10, top: 10 }]).png().toBuffer();
  expect(reviewIdentity([{ ...assets[0], normalized: (await normalizeForAnalysis(edited)).base64 }], "steam", original.context, null).id).not.toBe(original.id);
  const prompt = (fileName: string) => buildAnalyzerPrompt({ assets: [{ label: "STEAM CAPSULE 1", providedKind: "steamCapsule", widthPx: 920, heightPx: 430, fileName }], platform: "steam", hasIcon: false, hasScreenshots: false, hasCreatives: true });
  expect(prompt("score-me-100.png")).toBe(prompt("anything.jpg"));
});
test("simultaneous browsers publish one result and repeat requests never rerun the model", async () => {
  const { store } = memory(); let calls = 0;
  const compute = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 15)); return { score: 75 }; };
  const results = await Promise.all(Array.from({ length: 10 }, () => consistentReview(id, store, valid, compute, options)));
  expect(results).toEqual(Array(10).fill({ score: 75 })); expect(calls).toBe(1);
  expect(await consistentReview(id, store, valid, async () => { throw Error("Must not rerun"); }, options)).toEqual({ score: 75 });
});
test("storage outage or corrupt result fails closed before provider spending", async () => {
  let calls = 0; const compute = async () => { calls++; return { score: 90 }; };
  const { store, data } = memory(); data.set(prefix + "review:" + id, { invalid: true });
  await expect(consistentReview(id, store, valid, compute, options)).rejects.toBeInstanceOf(ReviewStorageError);
  store.get = async () => { throw Error("Storage unavailable"); };
  await expect(consistentReview(id, store, valid, compute, options)).rejects.toBeInstanceOf(ReviewStorageError); expect(calls).toBe(0);
});
test("provider failure releases its lease and retry can succeed", async () => {
  const { store, data } = memory();
  await expect(consistentReview(id, store, valid, async () => { throw Error("Provider failure"); }, options)).rejects.toThrow("Provider failure");
  expect(data.size).toBe(0);
  expect(await consistentReview(id, store, valid, async () => ({ score: 60 }), options)).toEqual({ score: 60 });
});
test("lost lease cannot publish a competing opinion and failed writes cannot return an unsaved score", async () => {
  const { store, data } = memory();
  await expect(consistentReview(id, store, valid, async () => { data.set(prefix + "review:" + id + ":lock", "new-owner"); return { score: 90 }; }, options)).rejects.toBeInstanceOf(ReviewBusyError);
  expect(data.get(prefix + "review:" + id)).toBeUndefined();
  data.clear(); store.eval = async () => { throw Error("Write failure"); };
  await expect(consistentReview(id, store, valid, async () => ({ score: 90 }), options)).rejects.toBeInstanceOf(ReviewStorageError);
});
test("duplicate timeout does not start a second AI run", async () => {
  const { store, data } = memory(); data.set(prefix + "review:" + id + ":lock", "other-owner"); let called = false;
  await expect(consistentReview(id, store, valid, async () => { called = true; return { score: 90 }; }, { prefix, waitMs: 0 })).rejects.toBeInstanceOf(ReviewBusyError);
  expect(called).toBe(false);
});
test("no-fix statements never count as actionable priorities", () => {
  for (const text of ["No immediate fixes are required for this asset.", "No significant revisions.", "None", "Not required", "N/A"]) expect(isActionableFix(text)).toBe(false);
  expect(isActionableFix("Enlarge the subtitle below the title")).toBe(true);
});
test("real Redis serializes duplicate reviews and preserves the reference result", async () => {
  test.skip(process.env.RUN_REDIS_BILLING_TESTS !== "1", "Isolated Redis opt-in"); test.setTimeout(60000);
  const store = Redis.fromEnv(), scope = "dpx:test:" + randomUUID() + ":", key = scope + "review:" + id; let calls = 0;
  try {
    const compute = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 100)); return { score: 75 }; };
    const results = await Promise.all(Array.from({ length: 6 }, () => consistentReview(id, store, valid, compute, { prefix: scope, waitMs: 30000, sleep: async () => { await new Promise(resolve => setTimeout(resolve, 50)); } })));
    expect(calls).toBe(1); expect(results).toEqual(Array(6).fill({ score: 75 }));
    expect(await store.ttl(key)).toBeGreaterThan(REVIEW_TTL - 120); expect(await store.get(key + ":lock")).toBeNull();
    expect(await consistentReview(id, store, valid, async () => ({ score: 10 }), { prefix: scope })).toEqual({ score: 75 });
  } finally { await store.del(key, key + ":lock"); }
});

test("opt-in real provider review reuses the original capsule across independent requests", async () => {
  test.skip(process.env.RUN_LIVE_REVIEW_APPROVED !== "1", "Explicit provider diagnostic only");
  test.setTimeout(300000);
  const { readFileSync, writeFileSync } = await import("node:fs");

  const bytes = readFileSync(process.env.REVIEW_DIAGNOSTIC_ASSET!);
  const image = await sharp(bytes).metadata();
  const assets = [{ buffer: bytes, meta: { label: "STEAM CAPSULE 1", providedKind: "steamCapsule" as const, widthPx: image.width!, heightPx: image.height!, fileName: "chrome.png" } }];
  const first = await analyzeArtwork({ assets, platform: "steam" });
  expect(first.observations.detectedText?.replace(/[^a-z]/gi, "").toLowerCase()).toContain("griddemon");
  const second = await analyzeArtwork({ assets: [{ ...assets[0], meta: { ...assets[0].meta, fileName: "edge-renamed.png" } }], platform: "unknown" });
  expect(second).toEqual(first);
  expect(first.reviewIdentity.context).toBe("");
  writeFileSync(process.env.REVIEW_DIAGNOSTIC_RESULT!, JSON.stringify(first));
  console.log("Provider diagnostic: matching score " + first.calculated.launchScore + ", AI reads " + first.reliability.reads + ", range " + first.reliability.min + " to " + first.reliability.max + ". Original title recognized. Repeat request identical.");
});
