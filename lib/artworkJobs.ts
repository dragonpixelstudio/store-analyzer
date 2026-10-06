import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { storagePrefix } from "./storageScope";
import type { JobBilling } from "./jobContext";

export type ArtworkJobKind = "analyze" | "studio" | "fix";
export const JOB_PATHS: Record<ArtworkJobKind, string> = { analyze: "/api/analyze", studio: "/api/studio/generate", fix: "/api/fix" };
export const JOB_TTL = 86400;
export const JOB_DEADLINE = 10 * 60 * 1000;
export type ArtworkJob = { id: string; account: string; operation: string; kind: ArtworkJobKind; fingerprint: string; created: number; state: "queued" | "running" | "done"; network: string; contentType: string; dispatched: number; attempts: number; charged?: number; refunded?: number; analysisReturned?: boolean };
export type JobResult = { status: number; body: string; retryAfter?: string };
export function jobId(account: string, kind: ArtworkJobKind, operation: string) { return createHash("sha256").update(`${account}:${kind}:${operation}`).digest("hex"); }
export const validJobId = (id: string) => /^[a-f0-9]{64}$/.test(id);
export function jobSignature(id: string) {
  if (!process.env.DPX_JOB_SECRET || !validJobId(id)) throw new Error("Background jobs are not configured");
  return createHmac("sha256", process.env.DPX_JOB_SECRET).update(`${storagePrefix()}artwork-worker-v1:${id}`).digest("base64url");
}
export function verifyJobSignature(id: unknown, signature: unknown) {
  if (typeof id !== "string" || !validJobId(id) || typeof signature !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = jobSignature(id);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const CREATE = `
local old=redis.call('GET',KEYS[1]); if old then local j=cjson.decode(old); if j.fingerprint~=ARGV[3] then return -1 end return 0 end
redis.call('SET',KEYS[1],ARGV[1],'EX',86400); redis.call('SET',KEYS[2],ARGV[2],'EX',86400)
redis.call('ZADD',KEYS[3],ARGV[4],ARGV[5]); redis.call('EXPIRE',KEYS[3],86400); return 1`;
const CLAIM = `
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local j=cjson.decode(raw)
if j.state~='queued' or tonumber(ARGV[1])-j.created>120000 then return 0 end
j.state='running'; redis.call('SET',KEYS[1],cjson.encode(j),'KEEPTTL'); return 1`;
const DISPATCH = `
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local j=cjson.decode(raw)
if j.state~='queued' or j.attempts>=3 or tonumber(ARGV[1])-j.created>120000 or (j.dispatched>0 and tonumber(ARGV[1])-j.dispatched<20000) then return 0 end
j.dispatched=tonumber(ARGV[1]); j.attempts=j.attempts+1; redis.call('SET',KEYS[1],cjson.encode(j),'KEEPTTL'); return 1`;
// Result publication and credit settlement are a single transaction. A retry
// cannot publish twice, debit twice, or expose an image whose save failed.
const COMPLETE = `
local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end local j=cjson.decode(raw)
if j.state~='running' or tonumber(ARGV[1])-j.created>600000 then return 0 end
local charged=tonumber(ARGV[3]); local reserved=tonumber(ARGV[4])
if reserved>=0 then
 local opraw=redis.call('GET',KEYS[5]); if not opraw then return -2 end local op=cjson.decode(opraw)
 if op.state~='pending' or op.amount~=reserved or charged<0 or charged>reserved then return -2 end
 redis.call('INCRBY',KEYS[4],reserved-charged); op.state='complete'; op.charged=charged
 redis.call('SET',KEYS[5],cjson.encode(op)); redis.call('ZREM',KEYS[6],j.operation)
 redis.call('LPUSH',KEYS[7],ARGV[5]); redis.call('LTRIM',KEYS[7],0,99)
 j.charged=charged; j.refunded=reserved-charged
end

local analysisRaw=redis.call('GET',KEYS[8])
if analysisRaw then
 local a=cjson.decode(analysisRaw)
 if a.state=='pending' then
  local success=cjson.decode(ARGV[2]).status>=200 and cjson.decode(ARGV[2]).status<300
  if not success then for _,key in ipairs(a.counters) do if tonumber(redis.call('GET',key) or '0')>0 then redis.call('DECR',key) end end end
  a.state=success and 'complete' or 'returned'; j.analysisReturned=not success
  redis.call('SET',KEYS[8],cjson.encode(a),'KEEPTTL')
 end
end
j.state='done'; redis.call('SET',KEYS[2],ARGV[2],'EX',86400)
redis.call('SET',KEYS[1],cjson.encode(j),'KEEPTTL'); redis.call('DEL',KEYS[3]); return 1`;
// Stalled jobs are never executed again. Refund a pending reservation, if any.
const EXPIRE = `
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local j=cjson.decode(raw)
if j.state=='done' or tonumber(ARGV[1])-j.created<600000 then return 0 end
local opraw=redis.call('GET',KEYS[5]); if opraw then local op=cjson.decode(opraw); if op.state=='pending' then
 redis.call('INCRBY',KEYS[4],op.amount); op.state='complete'; op.charged=0; redis.call('SET',KEYS[5],cjson.encode(op))
 redis.call('ZREM',KEYS[6],j.operation); redis.call('LPUSH',KEYS[7],ARGV[3]); redis.call('LTRIM',KEYS[7],0,99)
 j.charged=0; j.refunded=op.amount
end end

local analysisRaw=redis.call('GET',KEYS[8])
if analysisRaw then
 local a=cjson.decode(analysisRaw)
 if a.state=='pending' then
  local success=false
  if not success then for _,key in ipairs(a.counters) do if tonumber(redis.call('GET',key) or '0')>0 then redis.call('DECR',key) end end end
  a.state=success and 'complete' or 'returned'; j.analysisReturned=not success
  redis.call('SET',KEYS[8],cjson.encode(a),'KEEPTTL')
 end
end
j.state='done'; redis.call('SET',KEYS[1],cjson.encode(j),'KEEPTTL'); redis.call('SET',KEYS[2],ARGV[2],'EX',86400); redis.call('DEL',KEYS[3]); return 1`;

export class ArtworkJobStore {
  constructor(readonly redis = Redis.fromEnv(), readonly prefix = storagePrefix()) {}
  key(type: string, id: string) { return `${this.prefix}${type}:${id}`; }
  get(id: string) { return this.redis.get<ArtworkJob>(this.key("artwork-job", id)); }
  input(id: string) { return this.redis.get<string>(this.key("artwork-input", id)); }
  result(id: string) { return this.redis.get<JobResult>(this.key("artwork-result", id)); }
  async recent(account: string) {
    const ids = await this.redis.zrange<string[]>(this.key("artwork-recent", account), 0, 19, { rev: true });
    return (await Promise.all(ids.map(id => this.get(id)))).filter((j): j is ArtworkJob => !!j && j.account === account);
  }
  create(job: ArtworkJob, body: string) { return this.redis.eval<unknown[],number>(CREATE, [this.key("artwork-job",job.id),this.key("artwork-input",job.id),this.key("artwork-recent",job.account)], [JSON.stringify(job),body,job.fingerprint,job.created,job.id]); }
  claim(id: string, now = Date.now()) { return this.redis.eval<unknown[],number>(CLAIM,[this.key("artwork-job",id)],[now]); }
  dispatch(id: string, now = Date.now()) { return this.redis.eval<unknown[],number>(DISPATCH,[this.key("artwork-job",id)],[now]); }
  private keys(job: ArtworkJob) { return [this.key("artwork-job",job.id),this.key("artwork-result",job.id),this.key("artwork-input",job.id),this.key("bal",job.account),this.key("op",`${job.account}:${job.operation}`),this.key("pending",job.account),this.key("ledger",job.account),this.key("analysis-reservation",job.id)]; }
  complete(job: ArtworkJob, result: JobResult, billing: JobBilling, now = Date.now()) {
    if(billing.account !== job.account || billing.operation !== job.operation) throw new Error("Result owner mismatch");
    const charged=billing.charged ?? 0;
    const ledger={id:job.operation,kind:job.kind === "analyze" ? "analysis" : "generation",amount:-charged,at:new Date(now).toISOString(),label:job.kind === "analyze" ? (charged ? "Artwork review" : "Review failed · credit returned") : (charged ? "Image generation" : "Generation cancelled · credits returned")};
    return this.redis.eval<unknown[],number>(COMPLETE,this.keys(job),[now,JSON.stringify(result),charged,billing.reserved ?? -1,JSON.stringify(ledger)]);
  }
  expire(job: ArtworkJob, now = Date.now()) {
    const result: JobResult={status:504,body:JSON.stringify({error:"This job was interrupted. Any pending credits have been returned. You can try again."})};
    const ledger={id:job.operation,kind:job.kind === "analyze" ? "analysis" : "generation",amount:0,at:new Date(now).toISOString(),label:"Interrupted job · credits returned"};
    return this.redis.eval<unknown[],number>(EXPIRE,this.keys(job),[now,JSON.stringify(result),JSON.stringify(ledger)]);
  }
}
