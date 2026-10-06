import { randomUUID } from "node:crypto";
import { reserveAnalysis } from "./analysisQuota";
import { getCreditStore } from "./credits";
import { billingStore } from "./billingStore";
import { currentJobBilling } from "./jobContext";
import { jobId } from "./artworkJobs";
import { ownerTestAccess } from "./ownerTesting";
import { walletKey } from "./wallet";

export type ReviewAccess = { account: string | null; owner: boolean; balance: number };
export type ReviewReservation = { mode: "free"; reservation: string } | { mode: "owner" } | { mode: "credit"; account: string; operation: string };
type ReviewDenied = { success: false; status: number; error: string; code?: string; canUseCredits?: boolean; retryAfter?: number };
type ReviewAllowed = { success: true; reservation: ReviewReservation };
export async function reviewAccess(req: Request): Promise<ReviewAccess> {
  const account = walletKey(req);
  if (!account) return { account: null, owner: false, balance: 0 };
  const [owner, balance] = await Promise.all([ownerTestAccess(req), getCreditStore().getBalance(account)]);
  return { account, owner: !!owner, balance };
}

export async function reserveReview(req: Request, consent: boolean, access: ReviewAccess,
  quota = reserveAnalysis, billing = billingStore): Promise<ReviewDenied | ReviewAllowed> {
  if (access.owner) return { success: true, reservation: { mode: "owner" } };
  // Free slots always come first, including when a slot was returned while the
  // customer was deciding whether to pay. Consent is never an automatic charge.
  const allowance = await quota(req);
  if (allowance.success) return { success: true, reservation: { mode: "free", reservation: allowance.reservation } };
  if (!consent || !access.account) return {
    success: false, status: 429, code: "ANALYSIS_LIMIT", canUseCredits: !!access.account && access.balance >= 1,
    retryAfter: allowance.retryAfter,
    error: access.balance >= 1 ? "Free reviews are used or processing, shared across browsers. You can confirm another review for 1 credit, or wait until 00:00 UTC." : "Free reviews are used or processing, shared across browsers. Buy credits for an extra review, or wait until 00:00 UTC. Failed reviews return their slot.",
  };
  const job = currentJobBilling();
  const operation = job?.operation ?? req.headers.get("idempotency-key") ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(operation)) return { success: false, status: 400, error: "Invalid review request ID." };
  const result = await billing().beginGeneration(access.account, operation, 1, job ? jobId(access.account, "analyze", operation) : undefined);
  if (result === 0) return { success: false, status: 402, error: "You need 1 credit for this extra review. No credit was charged." };
  if (result !== 1) return { success: false, status: 409, error: "This review request is already processed or no longer active. Check Recent jobs before trying again." };
  return { success: true, reservation: { mode: "credit", account: access.account, operation } };
}

export async function settleReview(reservation: ReviewReservation, succeeded: boolean) {
  if (reservation.mode === "free" && !currentJobBilling()) await getCreditStore().settleReports(reservation.reservation, succeeded);
  if (reservation.mode === "credit") await billingStore().finishGeneration(reservation.account, reservation.operation, succeeded ? 1 : 0, "analysis");
}
