import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {Redis} from "@upstash/redis";
import {loadEnvConfig} from "@next/env";
import {ArtworkJobStore,jobId,jobSignature,verifyJobSignature,type ArtworkJob} from "../lib/artworkJobs";
import {withJobBilling,recordJobReservation,deferJobSettlement,type JobBilling} from "../lib/jobContext";
import {BillingStore} from "../lib/billingStore";
import {artworkWorker} from "../lib/jobWorker";
import {enqueueArtwork,readArtworkJob} from "../lib/jobGateway";
import {NextRequest} from "next/server";

test("worker tickets bind to job and payment environment",()=>{
 const secret=process.env.DPX_JOB_SECRET,environment=process.env.DODO_PAYMENTS_ENVIRONMENT;
 try{
  process.env.DPX_JOB_SECRET="test-worker-dispatch-only";process.env.DODO_PAYMENTS_ENVIRONMENT="test_mode";
  const id=jobId("acct:one","studio","operation-123456789"),signature=jobSignature(id);
  expect(verifyJobSignature(id,signature)).toBe(true);
  expect(verifyJobSignature(jobId("acct:two","studio","operation-123456789"),signature)).toBe(false);
  expect(verifyJobSignature(id,"x".repeat(43))).toBe(false);
  process.env.DODO_PAYMENTS_ENVIRONMENT="live_mode";expect(verifyJobSignature(id,signature)).toBe(false);
 }finally{if(secret===undefined)delete process.env.DPX_JOB_SECRET;else process.env.DPX_JOB_SECRET=secret;if(environment===undefined)delete process.env.DODO_PAYMENTS_ENVIRONMENT;else process.env.DODO_PAYMENTS_ENVIRONMENT=environment;}
});
test("job billing stays isolated across concurrent workers",async()=>{
 const a:JobBilling={account:"a",operation:"op-a"},b:JobBilling={account:"b",operation:"op-b"};
 await Promise.all([a,b].map((scope,index)=>withJobBilling(scope,async()=>{
  recordJobReservation(scope.account,scope.operation,3);
  await new Promise(resolve=>setTimeout(resolve,index?1:5));
  expect(()=>deferJobSettlement("other",scope.operation,1)).toThrow();
  expect(deferJobSettlement(scope.account,scope.operation,index)).toBe(true);
 })));
 expect(a.charged).toBe(0);expect(b.charged).toBe(1);
 expect(deferJobSettlement("a","op-a",1)).toBe(false);
});
test("queue rejects foreign origins and job results require a signed owner",async()=>{
 const req=new NextRequest("https://example.com/api/studio/generate",{method:"POST",headers:{origin:"https://evil.example"}});
 expect((await enqueueArtwork(req,"studio")).status).toBe(403);
 expect((await readArtworkJob(new NextRequest("https://example.com/api/jobs/"+"a".repeat(64)),"a".repeat(64))).status).toBe(404);
});

test("real Redis background jobs publish and settle atomically, prevent duplicate work, and refund interruptions",async()=>{
 test.skip(process.env.RUN_REDIS_BILLING_TESTS!=="1","Opt-in isolated Redis integration");test.setTimeout(120000);loadEnvConfig(process.cwd());
 const redis=Redis.fromEnv(),prefix=`dpx:test:jobs:${randomUUID()}:`,store=new ArtworkJobStore(redis,prefix),billing=new BillingStore(redis,prefix);
 const account="acct:background-test-owner",keys:string[]=[];
 const secret=process.env.DPX_JOB_SECRET,origin=process.env.APP_URL;
 process.env.DPX_JOB_SECRET="test-worker-dispatch-only";process.env.APP_URL="https://staging.example.com";
 function make(operation:string):ArtworkJob {
  const id=jobId(account,"studio",operation);
  keys.push(store.key("artwork-job",id),store.key("artwork-input",id),store.key("artwork-result",id),billing.key("op",`${account}:${operation}`));
  return {id,account,operation,kind:"studio",fingerprint:"identical-input",created:Date.now(),state:"queued",network:"192.0.2.5",contentType:"application/json",dispatched:0,attempts:0};
 }
 keys.push(billing.key("bal",account),billing.key("ledger",account),billing.key("pending",account),store.key("artwork-recent",account));
 try{
  await redis.set(billing.key("bal",account),6);
  const job=make("operation-123456789");
  expect(await store.create(job,"e30=")).toBe(1);expect(await store.create(job,"e30=")).toBe(0);
  expect(await store.create({...job,fingerprint:"changed"},"e30=")).toBe(-1);
  let calls=0;
  const runner=async()=>{calls++;expect(await billing.beginGeneration(account,job.operation,3)).toBe(1);await billing.finishGeneration(account,job.operation,1);expect(await store.result(job.id)).toBeNull();expect(await redis.get(billing.key("bal",account))).toBe(3);return Response.json({image:{base64:"sample"},credits:{charged:1}});};
  const request=()=>new Request("https://staging.example.com/.netlify/functions/artwork-background",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:job.id,signature:jobSignature(job.id)})});
  await Promise.all([artworkWorker(request(),store,{analyze:runner,studio:runner,fix:runner}),artworkWorker(request(),store,{analyze:runner,studio:runner,fix:runner})]);
  expect(calls).toBe(1);expect(await redis.get(billing.key("bal",account))).toBe(5);expect((await store.get(job.id))?.state).toBe("done");expect(await store.input(job.id)).toBeNull();expect(JSON.parse((await store.result(job.id))!.body).image.base64).toBe("sample");
  expect(await store.complete(job,{status:200,body:"{}"},{account,operation:job.operation,reserved:3,charged:3})).toBe(0);expect(await redis.get(billing.key("bal",account))).toBe(5);
  const failed=make("operation-failed-123");await store.create(failed,"e30=");await store.claim(failed.id);await billing.beginGeneration(account,failed.operation,2);
  expect(await store.expire(failed,failed.created+600001)).toBe(1);expect(await store.expire(failed,failed.created+600002)).toBe(0);expect(await redis.get(billing.key("bal",account))).toBe(5);
  expect(await store.complete(failed,{status:200,body:"{}"},{account,operation:failed.operation,reserved:2,charged:2})).toBe(0);
  const thrown=make("operation-throw-1234");await store.create(thrown,"e30=");
  const failRunner=async()=>{await billing.beginGeneration(account,thrown.operation,1);throw new Error("Provider failed");};
  await artworkWorker(new Request("https://staging.example.com/worker",{method:"POST",body:JSON.stringify({id:thrown.id,signature:jobSignature(thrown.id)})}),store,{analyze:failRunner,studio:failRunner,fix:failRunner});
  expect((await store.result(thrown.id))?.status).toBe(502);expect(await redis.get(billing.key("bal",account))).toBe(5);
  expect((await store.recent(account)).length).toBe(3);
 }finally{await redis.del(...keys);if(secret===undefined)delete process.env.DPX_JOB_SECRET;else process.env.DPX_JOB_SECRET=secret;if(origin===undefined)delete process.env.APP_URL;else process.env.APP_URL=origin;}
});
