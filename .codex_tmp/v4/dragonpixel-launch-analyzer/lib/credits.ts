export interface CreditStore {
  getBalance(key: string): Promise<number>;
  reserve(key: string, amount: number): Promise<boolean>;
  refund(key: string, amount: number): Promise<void>;
  seedIfNew(key: string, amount: number): Promise<void>;
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

let store: CreditStore | null = null;

export function getCreditStore(): CreditStore {
  if (!store) {
    // TODO(paid launch): replace with a durable user/account credit table.
    store = new MemoryCreditStore();
  }

  return store;
}

export function callerKey(req: Request): string {
  const userId = req.headers.get("x-user-id");
  if (userId) return `user:${userId}`;

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : "local";
  return `ip:${ip || "local"}`;
}

export async function ensureTrialSeed(key: string) {
  await getCreditStore().seedIfNew(key, TRIAL_CREDITS);
}

export function dailyReportPeriod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
