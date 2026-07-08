import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "dpx:analyze:ip",
  analytics: true,
});

export const globalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(300, "1 d"),
  prefix: "dpx:analyze:global",
});

// Generation limits: tighter than analysis because each call spends real
// Gemini image budget. Per-IP hourly plus a global daily spend cap.
export const fixIpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "dpx:fix:ip",
  analytics: true,
});

export const fixGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(400, "1 d"),
  prefix: "dpx:fix:global",
});

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return req.headers.get("x-real-ip") || "unknown";
}