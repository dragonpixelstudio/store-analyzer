import { getClientIp } from "./clientIdentity";
export { getClientIp } from "./clientIdentity";
import { storagePrefix } from "@/lib/storageScope";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: `${storagePrefix()}analyze:ip`,
  analytics: true,
});

export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(300, "1 d"),
  prefix: `${storagePrefix()}analyze:global`,
});

// Generation limits: tighter than analysis because each call spends real
// Gemini image budget. Per-IP hourly plus a global daily spend cap.
export const fixIpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: `${storagePrefix()}fix:ip`,
  analytics: true,
});

export const fixGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(400, "1 d"),
  prefix: `${storagePrefix()}fix:global`,
});

// Studio generation: every image is real Gemini spend. Per-IP hourly cap plus
// a global daily ceiling bound the worst case even if trial credits are farmed.
export const studioIpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(12, "1 h"),
  prefix: `${storagePrefix()}studio:ip`,
  analytics: true,
});

export const studioGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(300, "1 d"),
  prefix: `${storagePrefix()}studio:global`,
});

export const accountReadLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "10 m"), prefix: storagePrefix() + "account:read" });
export const walletWriteLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, "1 h"), prefix: storagePrefix() + "account:write" });
export async function accountRequestAllowed(req: Request, write = false) {
  const result = await (write ? walletWriteLimit : accountReadLimit).limit(getClientIp(req));
  return result.success && result.reason !== "timeout";
}
// Hard ceiling on actual image requests, including retries, across both APIs.
export const imageProviderLimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(300, "1 d"), prefix: storagePrefix() + "provider:image" });
export const checkoutIpLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, "1 h"), prefix: storagePrefix() + "checkout:ip" });
export const eventIpLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 h"), prefix: storagePrefix() + "event:ip" });
export const eventGlobalLimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10000, "1 d"), prefix: storagePrefix() + "event:global" });
export async function reserveImageProviderCall() {
  const result = await imageProviderLimit.limit("global");
  // Upstash can allow requests on timeout; paid model calls must fail closed.
  if (!result.success || result.reason === "timeout") throw new Error("Image capacity reached");
}
