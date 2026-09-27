import { callerKey, dailyReportPeriod, getCreditStore, type CreditStore } from "./credits";
import { getClientIp } from "./clientIdentity";

export async function reserveAnalysis(req: Request, store: CreditStore = getCreditStore(), now = new Date()) {
  const account = callerKey(req);
  const plan = await store.getPlan(account);
  const free = plan === "free";
  const limit = free ? 3 : plan === "pro" ? 500 : 100;
  const period = free ? `free:${dailyReportPeriod(now)}` : `${plan}:${now.toISOString().slice(0, 7)}`;
  const keys = free ? [account, `ip:${getClientIp(req)}`] : [account];
  const meter = await store.reserveReports(keys, limit, period);
  const reset = free
    ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { ...meter, retryAfter: Math.max(1, Math.ceil((reset - now.getTime()) / 1000)), error: free
    ? "Today's 3 free analyses have been used for this wallet or network. The allowance is shared across browsers and resets at 00:00 UTC. Generation credits do not reset it."
    : `You've used this month's ${limit} ${plan === "pro" ? "Pro" : "Indie"} analyses. Generation credits do not reset analysis limits.` };
}
