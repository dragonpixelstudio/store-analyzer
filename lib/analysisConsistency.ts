import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { storagePrefix } from "./storageScope";
import type { AnalyzerPlatform, AnalyzerAssetMeta } from "./analyzerPrompt";

export const REVIEW_VERSION = "2026.10.06.1";
export const REVIEW_TTL = 90 * 86400;
export type ReviewIdentity = { id: string; version: string; platform: AnalyzerPlatform; roles: string[]; context: string; benchmarkGenre: string | null };
export const normalizeReviewContext = (value: string) => value.normalize("NFKC").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
export function resolveReviewPlatform(platform: AnalyzerPlatform, roles: string[]): AnalyzerPlatform {
  if (platform !== "unknown") return platform;
  if (roles.includes("steamCapsule")) return "steam";
  if (roles.includes("featureGraphic")) return "google-play";
  return "unknown";
}
export function reviewIdentity(assets: { kind: AnalyzerAssetMeta["providedKind"]; aspect: string; normalized: string }[], platform: AnalyzerPlatform, context: string, benchmarkGenre: string | null): ReviewIdentity {
  const roles = assets.map(asset => asset.kind);
  const settings = { version: REVIEW_VERSION, platform: resolveReviewPlatform(platform, roles), roles, context: normalizeReviewContext(context), benchmarkGenre };
  const pixels = assets.map(asset => ({ kind: asset.kind, aspect: asset.aspect, pixels: createHash("sha256").update(Buffer.from(asset.normalized, "base64")).digest("hex") }));
  const id = createHash("sha256").update(JSON.stringify({ ...settings, pixels })).digest("hex");
  return { id, ...settings };
}
export class ReviewStorageError extends Error { constructor() { super("Review history is temporarily unavailable. Please retry shortly. Your review slot or credit will be returned."); } }
export class ReviewBusyError extends Error { constructor() { super("This artwork is already being reviewed. Please retry shortly or check Recent jobs. Your review slot or credit will be returned."); } }
type Cache = Pick<Redis, "get" | "set" | "eval">;
const PUBLISH = `if redis.call('GET',KEYS[2])~=ARGV[1] then return 0 end
if redis.call('EXISTS',KEYS[1])==0 then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]) end
redis.call('DEL',KEYS[2]); return 1`;
const RELEASE = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
// Identical inputs share one provider run and one published result. Storage
// failures never fall through to a new opinion. Similar images are not matches.
export async function consistentReview<T>(id: string, store: Cache, valid: (value: unknown) => value is T, compute: () => Promise<T>, options: { prefix?: string; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ReviewStorageError();
  const prefix = options.prefix ?? storagePrefix(), key = prefix + "review:" + id, lock = key + ":lock", token = randomUUID();
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + (options.waitMs ?? 220000);
  const read = async () => { try { const value = await store.get(key); if (value !== null && !valid(value)) throw new Error("Invalid stored review"); return value as T | null; } catch { throw new ReviewStorageError(); } };
  let acquired = false;
  do {
    const existing = await read(); if (existing !== null) return existing;
    try { acquired = await store.set(lock, token, { nx: true, ex: 420 }) === "OK"; } catch { throw new ReviewStorageError(); }
    if (acquired) break;
    if (Date.now() >= deadline) throw new ReviewBusyError();
    await sleep(2000);
  } while (true);
  try {
    // Close the read/acquire race with the previous lease holder.
    const existing = await read(); if (existing !== null) return existing;
    const result = await compute();
    if (!valid(result)) throw new ReviewStorageError();
    let published;
    try { published = await store.eval(PUBLISH, [key, lock], [token, JSON.stringify(result), REVIEW_TTL]); } catch { throw new ReviewStorageError(); }
    if (published !== 1) { const winner = await read(); if (winner !== null) return winner; throw new ReviewBusyError(); }
    return result;
  } finally { await store.eval(RELEASE, [lock], [token]).catch(() => {}); }
}
