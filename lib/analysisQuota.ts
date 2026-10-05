import { randomUUID } from "node:crypto";
import { currentJobBilling } from "./jobContext";
import { ArtworkJobStore, JOB_DEADLINE, jobId } from "./artworkJobs";
import { callerKey, dailyReportPeriod, getCreditStore, type CreditStore } from "./credits";
import { getClientIp } from "./clientIdentity";

export async function reserveAnalysis(req: Request, store: CreditStore = getCreditStore(), now = new Date()) {
  const account = callerKey(req);
  const plan = await store.getPlan(account);
  const free = plan === "free";
  const limit = free ? 3 : plan === "pro" ? 500 : 100;
  const period = free ? `free:${dailyReportPeriod(now)}` : `${plan}:${now.toISOString().slice(0, 7)}`;
  const keys = free ? [account, `ip:${getClientIp(req)}`] : [account];
  const job = currentJobBilling();
  // Recover interrupted work before evaluating this wallet's allowance.
  if (job) {
    const jobs = new ArtworkJobStore();
    await Promise.all((await jobs.recent(account)).filter(recent => recent.state !== "done" && Date.now() - recent.created >= JOB_DEADLINE).map(recent => jobs.expire(recent)));
  }
  const reservation = job ? jobId(account, "analyze", job.operation) : randomUUID();
  const meter = await store.reserveReports(keys, limit, period, reservation);
  const reset = free
    ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { ...meter, reservation, retryAfter: Math.max(1, Math.ceil((reset - now.getTime()) / 1000)), error: free
    ? "All 3 free review slots are used or processing. Failed reviews return their slot. Resets at 00:00 UTC; shared across browsers on this network."
    : `You've used this month's ${limit} ${plan === "pro" ? "Pro" : "Indie"} analyses. Generation credits do not reset analysis limits.` };
}
