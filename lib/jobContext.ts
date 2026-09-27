import { AsyncLocalStorage } from "node:async_hooks";

export type JobBilling = { account: string; operation: string; reserved?: number; charged?: number };
const context = new AsyncLocalStorage<JobBilling>();
export const currentJobBilling = () => context.getStore();
export const withJobBilling = <T>(billing: JobBilling, action: () => Promise<T>) => context.run(billing, action);
export const withoutJobBilling = <T>(action: () => Promise<T>) => context.exit(action);

export function recordJobReservation(account: string, operation: string, amount: number) {
  const job = context.getStore();
  if (!job) return;
  if (job.account !== account || job.operation !== operation) throw new Error("Job reservation identity mismatch");
  job.reserved = amount;
}
export function deferJobSettlement(account: string, operation: string, charged: number): boolean {
  const job = context.getStore();
  if (!job) return false;
  if (job.account !== account || job.operation !== operation || job.reserved === undefined || charged > job.reserved) throw new Error("Job settlement identity mismatch");
  job.charged = charged;
  return true;
}
