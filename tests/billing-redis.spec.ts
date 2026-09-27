import { test, expect } from "@playwright/test";
import { Redis } from "@upstash/redis";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "crypto";
import { RedisCreditStore } from "../lib/credits";
import { BillingStore, type Payment } from "../lib/billingStore";

// Explicit opt-in; all data lives under a fresh test prefix, never a customer key.
test.skip(process.env.RUN_REDIS_BILLING_TESTS !== "1", "Set RUN_REDIS_BILLING_TESTS=1 for isolated Redis integration checks");
test("real Redis transactions prevent duplicate grants, overspending and duplicate refunds", async () => {
  test.setTimeout(90000);
  loadEnvConfig(process.cwd());
  const redis = Redis.fromEnv();
  const store = new BillingStore(redis, `dpx:test:${randomUUID()}:`);
  const account = "acct:test-account";
  const order = { id: "test-order", accountKey: account, productId: "test-product", productKey: "test", credits: 6, cents: 500, currency: "USD", state: "pending" as const, createdAt: new Date().toISOString() };
  const payment: Payment = { id: "test-payment", accountKey: account, credits: 6, amount: 500, currency: "USD", orderId: order.id, refundedAmount: 0, revokedCredits: 0 };
  const keys = [store.key("order", order.id), store.key("payment", payment.id), store.key("bal", account), store.key("ledger", account), store.key("refund", "refund-half"), store.key("refund", "refund-rest"), store.key("pending", account), store.key("op", `${account}:operation-A`), store.key("op", `${account}:operation-B`), store.key("op", `${account}:operation-C`)];
  try {
    await store.putOrder(order);
    await expect(store.settlePayment({ ...payment, amount: 1 })).rejects.toThrow("Payment order does not match");
    await expect(store.settlePayment({ ...payment, currency: "EUR" })).rejects.toThrow("Payment order does not match");
    expect(await redis.get(store.key("bal", account))).toBeNull();
    expect((await store.getOrder(order.id))?.state).toBe("pending");
    expect(await store.markCheckoutInterrupted(order.id, "different-owner", "failed")).toBe(-1);
    expect(await store.markCheckoutInterrupted(order.id, account, "failed")).toBe(1);
    expect((await store.getOrder(order.id))?.state).toBe("failed");
    expect(await redis.get(store.key("bal", account))).toBeNull();
    expect(await Promise.all([store.settlePayment(payment), store.settlePayment(payment), store.settlePayment(payment)])).toEqual(expect.arrayContaining([true, false, false]));
    expect(await redis.get(store.key("bal", account))).toBe(6);
    expect((await store.getOrder(order.id))?.state).toBe("paid");
    expect(await store.markCheckoutInterrupted(order.id, account, "failed")).toBe(0);
    expect((await store.getOrder(order.id))?.state).toBe("paid");
    expect(await store.beginGeneration(account, "operation-A", 3)).toBe(1);
    expect(await store.beginGeneration(account, "operation-A", 3)).toBe(-1);
    expect(await store.beginGeneration(account, "operation-B", 3)).toBe(1);
    expect(await store.beginGeneration(account, "operation-C", 1)).toBe(0);
    await store.finishGeneration(account, "operation-A", 2);
    await store.finishGeneration(account, "operation-A", 0);
    expect(await redis.get(store.key("bal", account))).toBe(1);
    await redis.zadd(store.key("pending", account), { score: Date.now() - 16 * 60000, member: "operation-B" });
    await store.recoverStaleGenerations(account);
    await store.recoverStaleGenerations(account);
    expect(await redis.get(store.key("bal", account))).toBe(4);
    await store.settleRefund("refund-half", payment, 250);
    await store.settleRefund("refund-half", payment, 250);
    expect(await redis.get(store.key("bal", account))).toBe(1);
    await store.settleRefund("refund-rest", payment, 250);
    expect(await redis.get(store.key("bal", account))).toBe(-2);
    expect(await store.beginGeneration(account, "operation-C", 1)).toBe(0);
    expect((await store.getPayment(payment.id))?.revokedCredits).toBe(6);
    expect((await store.history(account)).length).toBe(5);
  } finally {
    // Exact test keys only; no wildcard scans, live account data, or global flushes.
    await redis.del(...keys);
  }
});

test("real Redis shares free quota across wallets and transfers only one trial under concurrency", async()=>{
 test.setTimeout(90000);loadEnvConfig(process.cwd());
 const redis=Redis.fromEnv(), prefix=`dpx:test:${randomUUID()}:`;
 const credits=new RedisCreditStore(redis,prefix),billing=new BillingStore(redis,prefix);
 const network="ip:192.0.2.45",a="acct:wallet-a",b="acct:wallet-b",period="free:2026-09-25";
 const actors=Array.from({length:24},(_,i)=>`acct:browser-${i}`);
 const keys=[...actors.map(id=>`${prefix}rep:${id}:${period}`),`${prefix}rep:${network}:${period}`,...[network,a,b].map(id=>billing.key("bal",id))];
 try {
  const results=await Promise.all(actors.map(id=>credits.reserveReports([id,network],3,period)));
  expect(results.filter(x=>x.success)).toHaveLength(3);
  expect(await redis.get(`${prefix}rep:${network}:${period}`)).toBe(3);
  expect(await redis.ttl(`${prefix}rep:${network}:${period}`)).toBeGreaterThan(0);
  const rejected=results.findIndex(x=>!x.success);
  expect(await redis.get(`${prefix}rep:${actors[rejected]}:${period}`)).toBeNull();
  await credits.seedIfNew(network,3);
  await Promise.all([billing.createWallet(network,a),billing.createWallet(network,b)]);
  await credits.seedIfNew(network,3);
  expect(await credits.getBalance(network)).toBe(0);
  expect(await credits.getBalance(a)+await credits.getBalance(b)).toBe(3);
 }finally{await redis.del(...keys);}
});
