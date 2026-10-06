import { recordJobReservation, deferJobSettlement, withoutJobBilling } from "./jobContext";
import { storagePrefix } from "@/lib/storageScope";
import { Redis } from "@upstash/redis";

export type Order = { id: string; accountKey: string; productId: string; productKey: string; credits: number; cents: number; currency: string; state: "pending" | "paid" | "refunded" | "failed" | "cancelled"; createdAt: string; paymentId?: string };
export type Payment = { id: string; accountKey: string; credits: number; amount: number; currency: string; orderId?: string; refundedAmount: number; revokedCredits: number; plan?: string; providerVerifiedAmount?: number };
export type LedgerEntry = { id: string; kind: "purchase" | "refund" | "generation"; amount: number; at: string; label: string };

// Payment IDs and refund IDs have no expiry: a delayed retry must never mint credits.
export const SETTLE_PAYMENT = `
if redis.call('EXISTS',KEYS[1])==1 then return 0 end
local p=cjson.decode(ARGV[1])
if KEYS[4]~='' then
 local raw=redis.call('GET',KEYS[4]); if not raw then return -1 end
 local o=cjson.decode(raw)
 if o.accountKey~=p.accountKey or o.credits~=p.credits or o.currency~=p.currency or (p.amount<o.cents and p.providerVerifiedAmount~=p.amount) or (o.paymentId and o.paymentId~=p.id) then return -2 end
 o.state='paid'; o.paymentId=p.id; redis.call('SET',KEYS[4],cjson.encode(o))
end
redis.call('SET',KEYS[1],ARGV[1]); redis.call('INCRBY',KEYS[2],p.credits)
redis.call('LPUSH',KEYS[3],ARGV[2]); redis.call('LTRIM',KEYS[3],0,99)
return 1`;

export const SETTLE_REFUND = `
if redis.call('EXISTS',KEYS[2])==1 then return 0 end
local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end
local p=cjson.decode(raw)
local amount=tonumber(ARGV[1]); if ARGV[4]=='full' then amount=p.amount-p.refundedAmount end
if amount<0 or p.refundedAmount+amount>p.amount then return -2 end
local refunded=p.refundedAmount+amount
local revoke=p.credits
if p.amount>0 then revoke=math.min(p.credits,math.ceil(p.credits*refunded/p.amount)) end
local delta=revoke-p.revokedCredits
p.refundedAmount=refunded; p.revokedCredits=revoke
redis.call('SET',KEYS[1],cjson.encode(p)); redis.call('SET',KEYS[2],amount)
redis.call('DECRBY',KEYS[3],delta)
local entry=cjson.decode(ARGV[2]); entry.amount=-delta
redis.call('LPUSH',KEYS[4],cjson.encode(entry)); redis.call('LTRIM',KEYS[4],0,99)
if KEYS[5]~='' then
 local o=redis.call('GET',KEYS[5]); if o then local order=cjson.decode(o); order.state='refunded'; redis.call('SET',KEYS[5],cjson.encode(order)) end
end
return delta+1`;

export const START_GENERATION = `
if redis.call('EXISTS',KEYS[2])==1 then return -1 end
local balance=tonumber(redis.call('GET',KEYS[1]) or '0'); local cost=tonumber(ARGV[1])
if balance<cost then return 0 end
redis.call('DECRBY',KEYS[1],cost)
redis.call('SET',KEYS[2],cjson.encode({amount=cost,state='pending',started=tonumber(ARGV[2])}))
redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]); return 1`;
export const FINISH_GENERATION = `
local raw=redis.call('GET',KEYS[2]); if not raw then return -1 end
local op=cjson.decode(raw); if op.state~='pending' then return 0 end
local charged=tonumber(ARGV[1]); if charged<0 or charged>op.amount then return -2 end
redis.call('INCRBY',KEYS[1],op.amount-charged)
op.state='complete'; op.charged=charged; redis.call('SET',KEYS[2],cjson.encode(op))
redis.call('ZREM',KEYS[3],ARGV[2])
redis.call('LPUSH',KEYS[4],ARGV[3]); redis.call('LTRIM',KEYS[4],0,99); return 1`;

export class BillingStore {
  constructor(readonly redis: Redis, readonly prefix = `${storagePrefix()}`) {}
  key(type: string, id: string) { return `${this.prefix}${type}:${id}`; }
  async createWallet(from: string, to: string) {
    await this.redis.eval(`if redis.call('EXISTS',KEYS[2])==1 then return 0 end local b=redis.call('GET',KEYS[1]) or '0'; redis.call('SET',KEYS[2],b); redis.call('SET',KEYS[1],0); return 1`, [this.key("bal", from), this.key("bal", to)], []);
  }
  async putOrder(order: Order) { await this.redis.set(this.key("order", order.id), order, { nx: true }); }
  async getOrder(id: string) { return this.redis.get<Order>(this.key("order", id)); }
  async markCheckoutInterrupted(id: string, account: string, state: "failed" | "cancelled") {
    return this.redis.eval<unknown[], number>(`local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end local o=cjson.decode(raw); if o.accountKey~=ARGV[1] then return -1 end if o.state=='paid' or o.state=='refunded' then return 0 end o.state=ARGV[2]; redis.call('SET',KEYS[1],cjson.encode(o)); return 1`, [this.key("order",id)], [account,state]);
  }
  async getPayment(id: string) { return this.redis.get<Payment>(this.key("payment", id)); }
  async history(account: string) { return this.redis.lrange<LedgerEntry>(this.key("ledger", account), 0, 19); }
  async settlePayment(payment: Payment) {
    if (!Number.isSafeInteger(payment.credits) || payment.credits <= 0 || !Number.isSafeInteger(payment.amount) || payment.amount < 0 || (payment.amount === 0 && (!payment.orderId || payment.providerVerifiedAmount !== 0))) throw new Error("Invalid payment amounts");
    const entry: LedgerEntry = { id: payment.id, kind: "purchase", amount: payment.credits, at: new Date().toISOString(), label: "Credit purchase" };
    const result = await this.redis.eval<unknown[], number>(SETTLE_PAYMENT, [this.key("payment", payment.id), this.key("bal", payment.accountKey), this.key("ledger", payment.accountKey), payment.orderId ? this.key("order", payment.orderId) : ""], [JSON.stringify(payment), JSON.stringify(entry)]);
    if (result < 0) throw new Error("Payment order does not match");
    return result === 1;
  }
  async settleRefund(id: string, payment: Payment, amount: number | null) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || (amount === 0 && payment.amount !== 0))) throw new Error("Invalid refund amount");
    const entry: LedgerEntry = { id, kind: "refund", amount: 0, at: new Date().toISOString(), label: "Refund adjustment" };
    const result = await this.redis.eval<unknown[], number>(SETTLE_REFUND, [this.key("payment", payment.id), this.key("refund", id), this.key("bal", payment.accountKey), this.key("ledger", payment.accountKey), payment.orderId ? this.key("order", payment.orderId) : ""], [amount ?? 0, JSON.stringify(entry), id, amount === null ? "full" : "partial"]);
    if (result < 0) throw new Error("Refund cannot be reconciled");
    return result > 0;
  }
  async beginGeneration(account: string, id: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 3) throw new Error("Invalid generation cost");
    const result = await this.redis.eval<unknown[], number>(START_GENERATION, [this.key("bal", account), this.key("op", `${account}:${id}`), this.key("pending", account)], [amount, Date.now(), id]);
    if (result === 1) recordJobReservation(account, id, amount);
    return result;
  }
  async finishGeneration(account: string, id: string, charged: number) {
    if (!Number.isSafeInteger(charged) || charged < 0 || charged > 3) throw new Error("Invalid generation settlement");
    if (deferJobSettlement(account, id, charged)) return 1;
    const entry: LedgerEntry = { id, kind: "generation", amount: -charged, at: new Date().toISOString(), label: charged ? "Image generation" : "Generation cancelled · credits returned" };
    const result = await this.redis.eval<unknown[], number>(FINISH_GENERATION, [this.key("bal", account), this.key("op", `${account}:${id}`), this.key("pending", account), this.key("ledger", account)], [charged, id, JSON.stringify(entry)]);
    if (result < 0) throw new Error("Generation settlement does not match reservation");
    return result;
  }
  async recoverStaleGenerations(account: string) {
    // Lease exceeds both API execution limits. Interrupted work is returned once.
    const ids = await this.redis.zrange<string[]>(this.key("pending", account), 0, Date.now() - 15 * 60000, { byScore: true });
    await withoutJobBilling(() => Promise.all(ids.map(id => this.finishGeneration(account, id, 0))));
  }
}
let store: BillingStore | undefined;
export function billingStore() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error("Durable billing storage is not configured");
  return store ??= new BillingStore(Redis.fromEnv());
}
