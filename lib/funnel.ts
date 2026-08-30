import { redis } from "@/lib/ratelimit";

// Lightweight funnel instrumentation for the Option-3 free-tool experiment.
// Vercel Analytics gives page views and bounce, but custom events need their
// Pro plan - so the funnel that actually matters (land -> upload -> analyze ->
// share -> return) is counted here in the Redis we already pay for. Daily
// buckets, 45-day TTL, no PII.

export const FUNNEL_EVENTS = [
  "upload", // an asset was added to the dropzone
  "analyze_start", // Analyze button pressed
  "analyze_success", // a scored report came back
  "share_copy", // share link copied
  "share_open", // a /report/<id> page was viewed
  "loop_return", // an analyze that arrived from a shared report (viral loop)
  "generate_click", // paid generation initiated
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const TTL_SECONDS = 60 * 60 * 24 * 45;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return (
    typeof value === "string" &&
    (FUNNEL_EVENTS as readonly string[]).includes(value)
  );
}

export async function recordEvent(event: FunnelEvent): Promise<void> {
  const key = `dpx:funnel:${dayKey()}:${event}`;
  try {
    await redis.incr(key);
    await redis.expire(key, TTL_SECONDS);
  } catch (err) {
    // Instrumentation must never break the product path.
    console.error("funnel event failed", err);
  }
}

export async function readFunnel(days = 14): Promise<{
  days: string[];
  events: FunnelEvent[];
  counts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}> {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  }

  const keys: string[] = [];
  for (const date of dates) {
    for (const event of FUNNEL_EVENTS) {
      keys.push(`dpx:funnel:${date}:${event}`);
    }
  }

  let raw: (number | string | null)[] = [];
  try {
    raw = keys.length ? await redis.mget<(number | string | null)[]>(...keys) : [];
  } catch (err) {
    console.error("funnel read failed", err);
  }

  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const event of FUNNEL_EVENTS) totals[event] = 0;

  let idx = 0;
  for (const date of dates) {
    counts[date] = {};
    for (const event of FUNNEL_EVENTS) {
      const value = Number(raw[idx] ?? 0) || 0;
      counts[date][event] = value;
      totals[event] += value;
      idx++;
    }
  }

  return { days: dates, events: [...FUNNEL_EVENTS], counts, totals };
}
