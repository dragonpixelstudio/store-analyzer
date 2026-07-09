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
  reserveReport(
    key: string,
    limit: number,
    periodKey: string
  ): Promise<{ success: boolean; remaining: number }>;
}

const TRIAL_CREDITS = 3;

class MemoryCreditStore implements CreditStore {
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

  async reserveReport(key: string, limit: number, periodKey: string) {
    const reportKey = `${key}:${periodKey}`;
    const used = this.reports.get(reportKey) ?? 0;
    if (used >= limit) {
      return { success: false, remaining: 0 };
    }

    const next = used + 1;
    this.reports.set(reportKey, next);
    return { success: true, remaining: Math.max(0, limit - next) };
  }
}

class RedisCreditStore implements CreditStore {
  private redis: Redis;
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  private bal(key: string) {
    return `dpx:bal:${key}`;
  }

  async getBalance(key: string) {
    const v = await this.redis.get<number>(this.bal(key));
    return typeof v === "number" ? v : 0;
  }

  async reserve(key: string, amount: number) {
    // Atomic: decrement, and roll back if it went negative.
    const after = await this.redis.decrby(this.bal(key), amount);
    if (after < 0) {
      await this.redis.incrby(this.bal(key), amount);
      return false;
    }
    return true;
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
    const v = await this.redis.get<string>(`dpx:plan:${key}`);
    return v === "indie" || v === "pro" ? v : "free";
  }

  async setPlan(key: string, plan: AccountPlan) {
    await this.redis.set(`dpx:plan:${key}`, plan);
  }

  async markOnce(id: string, ttlSeconds: number) {
    const r = await this.redis.set(`dpx:once:${id}`, 1, { nx: true, ex: ttlSeconds });
    return r === "OK";
  }

  async clearOnce(id: string) {
    await this.redis.del(`dpx:once:${id}`);
  }

  async reserveReport(key: string, limit: number, periodKey: string) {
    const k = `dpx:rep:${key}:${periodKey}`;
    const used = await this.redis.incr(k);
    if (used === 1) await this.redis.expire(k, 60 * 60 * 24 * 35);
    if (used > limit) {
      return { success: false, remaining: 0 };
    }
    return { success: true, remaining: Math.max(0, limit - used) };
  }
}

let store: CreditStore | null = null;

export function getCreditStore(): CreditStore {
  if (!store) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      store = new RedisCreditStore();
      return store;
    }
    // TODO(paid launch): replace with a durable user/account credit table.
    store = new MemoryCreditStore();
  }

  return store;
}

const CLAIM_COOKIE = "dpx_uid";

function claimSecret() {
  return (
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET ||
    process.env.GEMINI_API_KEY ||
    "dpx-dev-secret"
  );
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
  const match = cookieHeader.match(new RegExp(`${CLAIM_COOKIE}=([^;]+)`));
  if (match) {
    const key = verifyClaim(decodeURIComponent(match[1]));
    if (key) return key;
  }

  // 2. Legacy explicit header (dev/testing only).
  const userId = req.headers.get("x-user-id");
  if (userId) return `user:${userId}`;

  // 3. Anonymous trial identity by IP.
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : "local";
  return `ip:${ip || "local"}`;
}

// Anonymous free trial: grant TRIAL_CREDITS at most once per UTC day per
// identity (claimed account, else IP). This is the durable fix for "credits
// reset on every deploy" - the daily marker lives in Redis, not memory, and
// survives redeploys. A paid plan or purchased credits are never affected.
//
// Developer bypass: set DEV_UNLIMITED_KEY in the environment to a long random
// string, then send it as the x-dev-key header (or ?devkey= on GET) during
// live testing to receive a fresh grant every request without limits.
export async function ensureTrialSeed(key: string, isDeveloper = false) {
  const store = getCreditStore();
  if (isDeveloper) {
    // Top the developer up to a comfortable testing balance every call.
    const bal = await store.getBalance(key);
    if (bal < TRIAL_CREDITS) await store.addCredits(key, TRIAL_CREDITS - bal + 20);
    return;
  }
  // Seed a brand-new identity once, ever.
  await store.seedIfNew(key, TRIAL_CREDITS);

  // Then, for returning free users, grant the daily allotment at most once per
  // day - but only if they are not mid-way through spending an existing grant.
  const day = new Date().toISOString().slice(0, 10);
  const firstToday = await store.markOnce(`trial:${key}:${day}`, 60 * 60 * 26);
  if (firstToday) {
    const plan = await store.getPlan(key);
    const bal = await store.getBalance(key);
    // Only refill free users who have run dry; never stack onto a balance.
    if (plan === "free" && bal <= 0) {
      await store.addCredits(key, TRIAL_CREDITS);
    }
  }
}

export function isDeveloperRequest(req: Request): boolean {
  const devKey = process.env.DEV_UNLIMITED_KEY;
  if (!devKey) return false;
  const header = req.headers.get("x-dev-key");
  if (header && header === devKey) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("devkey") === devKey) return true;
  } catch {
    // non-absolute URL in some runtimes; header path already covered
  }
  return false;
}

export function dailyReportPeriod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
