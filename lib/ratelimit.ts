import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

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

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return req.headers.get("x-real-ip") || "unknown";
}