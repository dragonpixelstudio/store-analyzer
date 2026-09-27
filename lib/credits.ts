import { getClientIp } from "./clientIdentity";
import { storagePrefix } from "@/lib/storageScope";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import { Redis } from "@upstash/redis";

export type AccountPlan = "free" | "indie" | "pro";

export interface CreditStore {
  getBalance(key: string): Promise<number>;
  reserve(key: string, amount: number): Promise<boolean>;
  refund(key: string, amount: number): Promise<void>;
  seedIfNew(key: string, amount: number): Promise<void>;
  addCredits(key: string, amount: number): Promise<void>;
  getPlan(key: string): Promise<AccountPlan>;
  setPlan(key: string, plan: AccountPlan): Promise<void>;
  /** Atomic once-only marker (webhook idempotency). True if first time. */
  markOnce(id: string, ttlSeconds: number): Promise<boolean>;
  clearOnce(id: string): Promise<void>;
  reserveReports(keys: string[], limit: number, periodKey: string): Promise<{ success: boolean; remaining: number }>;
  reserveReport(
    key: string,
    limit: number,
    periodKey: string
  ): Promise<{ success: boolean; remaining: number }>;
}

const TRIAL_CREDITS = 3;

export const RESERVE_REPORTS = `
local limit=tonumber(ARGV[1]); local used=0
for _,key in ipairs(KEYS) do
 local count=tonumber(redis.call('GET',key) or '0')
 if count>=limit then return -1 end
 if count>used then used=count end
end
for _,key in ipairs(KEYS) do
 redis.call('INCR',key)
 if redis.call('TTL',key)<0 then redis.call('EXPIRE',key,3024000) end
end
return limit-used-1`;


export class MemoryCreditStore implements CreditStore {
  private balances = new Map<string, number>();
  private reports = new Map<string, number>();

  async getBalance(key: string) {
    return this.balances.get(key) ?? 0;
  }

  async reserve(key: string, amount: number) {
    const balance = this.balances.get(key) ?? 0;
    if (balance < amount) return false;
    this.balances.set(key, balance - amount);
    return true;
  }

  async refund(key: string, amount: number) {
    this.balances.set(key, (this.balances.get(key) ?? 0) + amount);
  }

  async seedIfNew(key: string, amount: number) {
    if (!this.balances.has(key)) {
      this.balances.set(key, amount);
    }
  }

  private plans = new Map<string, AccountPlan>();
  private seen = new Set<string>();

  async addCredits(key: string, amount: number) {
    this.balances.set(key, (this.balances.get(key) ?? 0) + amount);
  }

  async getPlan(key: string) {
    return this.plans.get(key) ?? "free";
  }

  async setPlan(key: string, plan: AccountPlan) {
    this.plans.set(key, plan);
  }

  async markOnce(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }

  async clearOnce(id: string) {
    this.seen.delete(id);
  }

  async reserveReport(key: string, limit: number, periodKey: string) { return this.reserveReports([key], limit, periodKey); }
  async reserveReports(keys: string[], limit: number, periodKey: string) {
    if (!keys.length || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid report limit");
    const counters = [...new Set(keys)].map(key => `${key}:${periodKey}`);
    const used = Math.max(...counters.map(key => this.reports.get(key) ?? 0));
    if (used >= limit) return { success: false, remaining: 0 };
    counters.forEach(key => this.reports.set(key, (this.reports.get(key) ?? 0) + 1));
    return { success: true, remaining: limit - used - 1 };
  }
}

export class RedisCreditStore implements CreditStore {
  constructor(private redis: Redis = Redis.fromEnv(), private prefix = storagePrefix()) {}
  private bal(key: string) {
    return `${this.prefix}bal:${key}`;
  }

  async getBalance(key: string) {
    const v = await this.redis.get<number>(this.bal(key));
    return typeof v === "number" ? v : 0;
  }

  async reserve(key: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid credit amount");
    return (await this.redis.eval<unknown[], number>("local b=tonumber(redis.call('GET',KEYS[1]) or '0'); if b<tonumber(ARGV[1]) then return 0 end redis.call('DECRBY',KEYS[1],ARGV[1]); return 1", [this.bal(key)], [amount])) === 1;
  }

  async refund(key: string, amount: number) {
    await this.redis.incrby(this.bal(key), amount);
  }

  async addCredits(key: string, amount: number) {
    await this.redis.incrby(this.bal(key), amount);
  }

  async seedIfNew(key: string, amount: number) {
    await this.redis.set(this.bal(key), amount, { nx: true });
  }

  async getPlan(key: string) {
    const v = await this.redis.get<string>(`${this.prefix}plan:${key}`);
    return v === "indie" || v === "pro" ? v : "free";
  }

  async setPlan(key: string, plan: AccountPlan) {
    await this.redis.set(`${this.prefix}plan:${key}`, plan);
  }

  async markOnce(id: string, ttlSeconds: number) {
    const r = await this.redis.set(`${this.prefix}once:${id}`, 1, { nx: true, ex: ttlSeconds });
    return r === "OK";
  }

  async clearOnce(id: string) {
    await this.redis.del(`${this.prefix}once:${id}`);
  }

  async reserveReport(key: string, limit: number, periodKey: string) { return this.reserveReports([key], limit, periodKey); }
  async reserveReports(keys: string[], limit: number, periodKey: string) {
    if (!keys.length || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid report limit");
    const counters = [...new Set(keys)].map(key => `${this.prefix}rep:${key}:${periodKey}`);
    const remaining = await this.redis.eval<unknown[], number>(RESERVE_REPORTS, counters, [limit]);
    return { success: remaining >= 0, remaining: Math.max(0, remaining) };
  }
}

let store: CreditStore | null = null;

export function getCreditStore(): CreditStore {
  if (!store) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      store = new RedisCreditStore();
      return store;
    }
    if (process.env.NODE_ENV === "production") throw new Error("Durable credit storage is required in production");
    store = new MemoryCreditStore();
  }

  return store;
}

const CLAIM_COOKIE = process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "dpx_test_uid" : "dpx_uid";

function claimSecret() {
  const secret = process.env.CREDIT_SESSION_SECRET || process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("Wallet signing secret is required");
  return "dpx-development-only-secret";
}

export function emailKey(email: string): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
  return `em:${hash}`;
}

export function signClaim(key: string): string {
  const sig = createHmac("sha256", claimSecret()).update(key).digest("hex").slice(0, 20);
  return `${key}.${sig}`;
}

export function verifyClaim(cookieValue: string): string | null {
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const key = cookieValue.slice(0, dot);
  if (!/^(acct|em):[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const sig = cookieValue.slice(dot + 1);
  const expected = createHmac("sha256", claimSecret()).update(key).digest("hex").slice(0, 20);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return key;
}

export { CLAIM_COOKIE };

export function callerKey(req: Request): string {
  // 1. Purchase identity (signed cookie set by the checkout route before redirect).
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CLAIM_COOKIE}=([^;]+)`));
  if (match) {
    try { const key = verifyClaim(decodeURIComponent(match[1])); if (key) return key; } catch { /* ignore malformed cookies */ }
  }

  // 2. Legacy explicit header (dev/testing only).
  const userId = req.headers.get("x-user-id");
  if (process.env.NODE_ENV === "test" && userId && /^[A-Za-z0-9_-]{1,64}$/.test(userId)) return `user:${userId}`;

  // 3. Anonymous trial identity by IP.
  return `ip:${getClientIp(req)}`;
}

// Trial credits are granted once per anonymous IP identity. Creating a wallet transfers the remainder.
export async function ensureTrialSeed(key: string, isDeveloper = false) {
  const store = getCreditStore();
  if (isDeveloper && process.env.NODE_ENV !== "production") {
    const balance = await store.getBalance(key);
    if (balance < TRIAL_CREDITS) await store.addCredits(key, TRIAL_CREDITS - balance + 20);
    return;
  }
  // Wallets only receive transferred trial balances or verified purchases.
  if (key.startsWith("ip:")) await store.seedIfNew(key, TRIAL_CREDITS);
}
export function isDeveloperRequest(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const expected = process.env.DEV_UNLIMITED_KEY;
  const supplied = req.headers.get("x-dev-key");
  return !!expected && !!supplied && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function dailyReportPeriod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
