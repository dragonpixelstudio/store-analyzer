import { summarizeJob } from "./jobSummary";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { boundedBytes } from "./requestBody";
import { ArtworkJobStore, JOB_DEADLINE, jobId, jobSignature, validJobId, type ArtworkJob, type ArtworkJobKind } from "./artworkJobs";
import { getClientIp, redis } from "./ratelimit";
import { callerKey, ensureTrialSeed, getCreditStore } from "./credits";
import { billingStore } from "./billingStore";
import { newWalletKey, sameOrigin, setWalletCookie, walletKey } from "./wallet";
import { storagePrefix } from "./storageScope";

const submitLimit = new Ratelimit({ redis, limiter:Ratelimit.slidingWindow(30,"1 h"),prefix:storagePrefix()+"jobs:submit" });
const globalLimit = new Ratelimit({ redis, limiter:Ratelimit.fixedWindow(500,"1 d"),prefix:storagePrefix()+"jobs:global" });
const pollLimit = new Ratelimit({ redis, limiter:Ratelimit.slidingWindow(300,"10 m"),prefix:storagePrefix()+"jobs:poll" });
const allowed = (check: {success:boolean;reason?:string}) => check.success && check.reason !== "timeout";
export const backgroundJobsEnabled = () => process.env.DPX_HOST_PROVIDER === "netlify" || process.env.DPX_BACKGROUND_JOBS === "1";
const reply = (value: unknown, status = 200) => NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});

export async function dispatchJob(store: ArtworkJobStore, job: ArtworkJob) {
  if (!await store.dispatch(job.id)) return;
  const url = new URL("/.netlify/functions/artwork-background", process.env.APP_URL);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Invalid worker origin");
  // A timeout is ambiguous: the worker may already be running. Keep the job;
  // its owner can poll/re-dispatch the same id, never mint a second job.
  await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:job.id,signature:jobSignature(job.id)}),signal:AbortSignal.timeout(8000)}).then(response => { if(!response.ok) throw new Error("Dispatch rejected"); }).catch(() => {});
}

export async function enqueueArtwork(req: Request, kind: ArtworkJobKind) {
  if (!sameOrigin(req)) return reply({error:"Origin not allowed"},403);
  if (!process.env.APP_URL || !process.env.DPX_JOB_SECRET || !process.env.GEMINI_API_KEY) return reply({error:"Background artwork processing is not configured yet."},503);
  try {
    const network = getClientIp(req);
    const checks = await Promise.all([submitLimit.limit(network),globalLimit.limit("global")]);
    if(checks.some(check => !allowed(check))) return reply({error:"Too many artwork requests. Please try again later."},429);
    const contentType=req.headers.get("content-type") || "";
    if (kind === "analyze" ? !contentType.startsWith("multipart/form-data;") : !contentType.startsWith("application/json")) return reply({error:"Invalid upload type."},415);
    let bytes:Buffer;
    try { bytes = await boundedBytes(req,4*1024*1024); } catch { return reply({error:"Upload exceeds the 4 MB request limit."},413); }
    const operation=req.headers.get("idempotency-key") || randomUUID();
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(operation)) return reply({error:"Invalid artwork request ID"},400);
    let account = walletKey(req);
    if(!account) {
      const from=callerKey(req);
      await ensureTrialSeed(from);
      account=newWalletKey();
      await billingStore().createWallet(from,account);
    }
    const store=new ArtworkJobStore();
    const id=jobId(account,kind,operation);
    const fingerprint=createHash("sha256").update(contentType).update(bytes).digest("hex");
    const job:ArtworkJob={id,account,operation,kind,fingerprint,created:Date.now(),state:"queued",network,contentType,dispatched:0,attempts:0};
    const created=await store.create(job,bytes.toString("base64"));
    if(created < 0) return reply({error:"This request ID was already used for different artwork."},409);
    await dispatchJob(store,job);
    const response=reply({job:{id,statusUrl:`/api/jobs/${id}`,resultUrl:`/jobs/${id}`}},202);
    setWalletCookie(response,account);
    return response;
  } catch { return reply({error:"Artwork processing is temporarily unavailable. Please try again."},503); }
}

export async function readArtworkJob(req: NextRequest, id: string) {
  const account=walletKey(req);
  if(!account || !validJobId(id)) return reply({error:"Artwork job not found."},404);
  if(req.headers.has("origin") && !sameOrigin(req)) return reply({error:"Origin not allowed"},403);
  try {
    if(!allowed(await pollLimit.limit(account))) return reply({error:"Please wait before checking again."},429);
    const store=new ArtworkJobStore();
    let job=await store.get(id);
    if(!job || job.account !== account) return reply({error:"Artwork job not found."},404);
    await store.expire(job);
    job=await store.get(id);
    if(!job) return reply({error:"Artwork job expired."},410);
    if(job.state !== "done") {
      await dispatchJob(store,job);
      return reply({job:{id,state:job.state,statusUrl:`/api/jobs/${id}`,resultUrl:`/jobs/${id}`}},202);
    }
    const result=await store.result(id);
    if(!result) return reply({error:"Artwork result expired."},410);
    const data=JSON.parse(result.body);
    if (job.kind === "analyze") data.analysisReturned = job.analysisReturned === true;
    if(data.credits && job.charged !== undefined) data.credits={...data.credits,charged:job.charged,refunded:job.refunded,pending:false,remaining:await getCreditStore().getBalance(account).catch(()=>null)};
    const response=reply(data,result.status);
    response.headers.set("X-Artwork-Job-State", "done");
    if(result.retryAfter) response.headers.set("Retry-After",result.retryAfter);
    return response;
  } catch { return reply({error:"Could not check this artwork job. Please retry."},503); }
}

export async function listArtworkJobs(req: NextRequest) {
  const account=walletKey(req);
  if(!account) return reply({jobs:[]});
  if(req.headers.has("origin") && !sameOrigin(req)) return reply({error:"Origin not allowed"},403);
  try {
    if(!allowed(await pollLimit.limit(account))) return reply({error:"Please wait before checking again."},429);
    const store = new ArtworkJobStore();
    const jobs = await store.recent(account);
    const summaries = await Promise.all(jobs.map(async job => {
      const stale = job.state !== "done" && Date.now() - job.created >= JOB_DEADLINE;
      if (stale) await store.expire(job);
      const current = stale ? await store.get(job.id) : job;
      return current ? summarizeJob(current, current.state === "done" ? await store.result(job.id) : null) : null;
    }));
    return reply({jobs: summaries.filter(Boolean)});
  } catch { return reply({error:"Recent jobs are temporarily unavailable."},503); }
}
