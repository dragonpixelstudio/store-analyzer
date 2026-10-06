import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { getClientIp, normalizeNetwork } from "../lib/clientIdentity";
import { reserveAnalysis } from "../lib/analysisQuota";
import { MemoryCreditStore, getCreditStore, signClaim, CLAIM_COOKIE, callerKey, ensureTrialSeed } from "../lib/credits";
import { POST as analyze } from "../app/api/analyze/route";
import { POST as prepareWallet } from "../app/api/account/recovery/route";
import { GET as status } from "../app/api/account/status/route";
import { ipRatelimit, globalRatelimit, walletWriteLimit, accountReadLimit, redis } from "../lib/ratelimit";

test.describe.configure({ mode: "serial" });
const initial = { ...process.env };
test.beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "test", CREDIT_SESSION_SECRET: "identity-unit-tests-only", GEMINI_API_KEY: "no-model-calls" });
  delete process.env.VERCEL;
  delete process.env.DPX_HOST_PROVIDER;
});
test.afterEach(() => {
  for (const key of ["NODE_ENV","CREDIT_SESSION_SECRET","GEMINI_API_KEY","VERCEL","DPX_HOST_PROVIDER","DODO_PAYMENTS_ENVIRONMENT","DPX_LOCAL_FIXTURES"]) {
    if (initial[key] === undefined) delete process.env[key]; else process.env[key] = initial[key];
  }
});
function request(ip = "192.0.2.45", wallet?: string, agent = "Chrome") {
  return new Request("https://example.com/api/analyze", { headers: { "x-forwarded-for": ip, "user-agent": agent, ...(wallet ? { cookie: `${CLAIM_COOKIE}=${signClaim(wallet)}` } : {}) } });
}
const wallet = "acct:abcdefghijklmnopqrstuvwx";

test("IP spellings and IPv6 privacy addresses cannot create extra network identities", () => {
  expect(normalizeNetwork("192.0.2.45")).toBe("192.0.2.45");
  expect(normalizeNetwork("::ffff:192.0.2.45")).toBe("192.0.2.45");
  expect(normalizeNetwork("::ffff:c000:22d")).toBe("192.0.2.45");
  expect(normalizeNetwork("2001:DB8:1:2:0000:0000:0000:1")).toBe(normalizeNetwork("2001:db8:1:2::abcd"));
  for (const invalid of ["", "fake", "192.0.2.45, 203.0.113.1", "192.0.2.45:1234"]) expect(normalizeNetwork(invalid)).toBeNull();
});

test("production trusts only the Vercel edge address, not caller-supplied forwarding aliases", () => {
  Object.assign(process.env, { NODE_ENV: "production", VERCEL: "1" });
  const make = (xff: string) => new Request("https://example.com", { headers: { "x-vercel-forwarded-for": "192.0.2.45", "x-forwarded-for": xff, "x-real-ip": xff, "x-user-id": xff } });
  expect(callerKey(make("203.0.113.1"))).toBe("ip:192.0.2.45");
  expect(callerKey(make("203.0.113.2"))).toBe("ip:192.0.2.45");
  expect(getClientIp(request())).toBe("unknown");
  delete process.env.VERCEL;
  delete process.env.DPX_HOST_PROVIDER;
  expect(getClientIp(request())).toBe("unknown");
  Object.assign(process.env, { NODE_ENV: "development" });
  expect(getClientIp(request("203.0.113.1"))).toBe("local");
  expect(getClientIp(request("203.0.113.2"))).toBe("local");
});

test("Chrome, Edge, cleared cookies and new wallets share the same daily free allowance", async () => {
  const store = new MemoryCreditStore(), day = new Date("2026-09-25T10:00:00Z");
  expect((await reserveAnalysis(request(),store,day)).success).toBe(true);
  expect((await reserveAnalysis(request(undefined,wallet),store,day)).success).toBe(true);
  expect((await reserveAnalysis(request(undefined,undefined,"Edge"),store,day)).success).toBe(true);
  expect((await reserveAnalysis(request(undefined,"acct:anotherwalletabcdefghijkl"),store,day)).success).toBe(false);
  expect((await reserveAnalysis(request(),store,day)).success).toBe(false);
  expect((await reserveAnalysis(request(),store,new Date("2026-09-26T00:00:00Z"))).success).toBe(true);
});

test("restored wallet stays limited when the network changes; parallel requests cannot overspend quota", async () => {
  const store = new MemoryCreditStore();
  const answers = await Promise.all(Array.from({length:20},(_,i)=>reserveAnalysis(request(`192.0.2.${i+1}`,wallet),store)));
  expect(answers.filter(x=>x.success)).toHaveLength(3);
});

test("paid monthly analysis plans preserve account limits independently of free network quota", async () => {
  const store = new MemoryCreditStore();
  for(let i=0;i<3;i++) await reserveAnalysis(request(),store);
  await store.setPlan(wallet,"indie");
  expect((await reserveAnalysis(request(undefined,wallet),store)).remaining).toBe(99);
});

test("a signed wallet without a balance cannot seed another trial grant", async () => {
  const store=getCreditStore(), original=store.seedIfNew;let seeded=0;
  store.seedIfNew=async()=>{seeded++;};
  try { await ensureTrialSeed(wallet); expect(seeded).toBe(0); await ensureTrialSeed("ip:192.0.2.45"); expect(seeded).toBe(1); }
  finally { store.seedIfNew=original; }
});

test("actual analyzer route meters fixtures and rejects exhausted cache paths before model/storage access", async () => {
  Object.assign(process.env,{NODE_ENV:"development",DODO_PAYMENTS_ENVIRONMENT:"test_mode",DPX_LOCAL_FIXTURES:"1"});
  const store=getCreditStore(), memory=new MemoryCreditStore();
  const originals={plan:store.getPlan,reserve:store.reserveReports,limit:ipRatelimit.limit,get:redis.get};
  store.getPlan=async()=>"free";
  store.reserveReports=memory.reserveReports.bind(memory);
  ipRatelimit.limit=async()=>({success:true,limit:5,remaining:5,reset:Date.now()+60000,pending:Promise.resolve()});
  redis.get=async()=>{throw new Error("Exhausted requests must not read cached reports");};
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:"red"}}).png().toBuffer();
  const upload=()=>{const form=new FormData();form.set("icon",new Blob([new Uint8Array(bytes)],{type:"image/png"}),"image.png");return new Request("http://localhost/api/analyze",{method:"POST",headers:{origin:"http://localhost"},body:form});};
  try {
    for(let i=0;i<3;i++) expect((await analyze(upload())).status).toBe(200);
    delete process.env.DPX_LOCAL_FIXTURES;
    const exhausted=await analyze(upload());
    expect(exhausted.status).toBe(429);
    expect(Number(exhausted.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await exhausted.json()).error).toContain("shared across browsers");
  } finally {store.getPlan=originals.plan;store.reserveReports=originals.reserve;ipRatelimit.limit=originals.limit;redis.get=originals.get;}
});

test("wallet creation and balance APIs reject rate-limit timeout before seeding or transferring credits", async()=>{
  const read=accountReadLimit.limit,write=walletWriteLimit.limit;
  const timeout=async()=>({success:true,reason:"timeout" as const,limit:15,remaining:0,reset:Date.now()+60000,pending:Promise.resolve()});
  accountReadLimit.limit=timeout;walletWriteLimit.limit=timeout;
  try {
    expect((await status(new NextRequest("https://example.com/api/account/status"))).status).toBe(429);
    expect((await prepareWallet(new NextRequest("https://example.com/api/account/recovery",{method:"POST",headers:{origin:"https://example.com"}}))).status).toBe(429);
  }finally{accountReadLimit.limit=read;walletWriteLimit.limit=write;}
});

// The platform must overwrite its own connection-IP header; verify that again
// on staging with forged headers before trusting the deployed edge boundary.
test("Netlify quotas use only its configured connection address across browser identities", async () => {
  Object.assign(process.env, { NODE_ENV: "production", DPX_HOST_PROVIDER: "netlify" });
  const store = new MemoryCreditStore();
  for (let i = 0; i < 4; i++) {
    const req = new Request("https://staging.example.com/api/analyze", { headers: {
      "x-nf-client-connection-ip": "192.0.2.67",
      "x-forwarded-for": `203.0.113.${i+1}`,
      "x-vercel-forwarded-for": `203.0.113.${i+1}`,
      "user-agent": i % 2 ? "Edge" : "Chrome",
    } });
    expect(getClientIp(req)).toBe("192.0.2.67");
    expect((await reserveAnalysis(req, store)).success).toBe(i < 3);
  }
  expect(getClientIp(new Request("https://staging.example.com", { headers: { "x-forwarded-for": "203.0.113.1" } }))).toBe("unknown");
  const request = new Request("https://example.com", { headers: { "x-nf-client-connection-ip": "192.0.2.67" } });
  delete process.env.DPX_HOST_PROVIDER;
  expect(getClientIp(request)).toBe("unknown");
});
test("failed reviews return both counters once and cannot alter a later day's allowance", async()=>{
  const store=new MemoryCreditStore(), day=new Date("2026-10-05T23:59:50Z"), tomorrow=new Date("2026-10-06T00:00:01Z");
  const a=await reserveAnalysis(request(undefined,wallet),store,day);
  const b=await reserveAnalysis(request(undefined,wallet),store,day);
  const c=await reserveAnalysis(request(undefined,wallet),store,day);
  await store.settleReports(a.reservation,true);
  await Promise.all([store.settleReports(b.reservation,false),store.settleReports(b.reservation,false)]);
  expect((await reserveAnalysis(request(undefined,undefined,"Edge"),store,day)).success).toBe(true);
  expect((await reserveAnalysis(request(),store,day)).success).toBe(false);
  await store.settleReports(a.reservation,false); // delivered reviews cannot be refunded later
  expect((await reserveAnalysis(request(),store,day)).success).toBe(false);
  for(let i=0;i<3;i++)expect((await reserveAnalysis(request(),store,tomorrow)).success).toBe(true);
  await store.settleReports(c.reservation,false);
  expect((await reserveAnalysis(request(),store,tomorrow)).success).toBe(false);
  expect(await store.getBalance(wallet)).toBe(0);
});

test("actual analyzer returns a reserved review slot on capacity failure",async()=>{
 Object.assign(process.env,{NODE_ENV:"development"});delete process.env.DPX_LOCAL_FIXTURES;
 const store=getCreditStore(),memory=new MemoryCreditStore();
 const old={plan:store.getPlan,reserve:store.reserveReports,settle:store.settleReports,ip:ipRatelimit.limit,global:globalRatelimit.limit,fetch:globalThis.fetch};
 store.getPlan=async()=>"free";store.reserveReports=memory.reserveReports.bind(memory);store.settleReports=memory.settleReports.bind(memory);
 ipRatelimit.limit=async()=>({success:true,limit:99,remaining:99,reset:Date.now()+60000,pending:Promise.resolve()});
 globalRatelimit.limit=async()=>({success:false,limit:1,remaining:0,reset:Date.now()+60000,pending:Promise.resolve()});
 globalThis.fetch=async(_url,init)=>{const commands=JSON.parse(String(init?.body));const reply=(command:string[])=>({result:command[0].toLowerCase()==="hgetall"?[]:command[0].toLowerCase()==="set"?"OK":null});return Response.json(Array.isArray(commands[0])?commands.map(reply):reply(commands));};
 const bytes=await sharp({create:{width:32,height:32,channels:3,background:"blue"}}).png().toBuffer();
 try{
  for(let i=0;i<5;i++){
   const form=new FormData();form.set("icon",new Blob([new Uint8Array(bytes)],{type:"image/png"}),"image.png");
   const response=await analyze(new Request("http://localhost/api/analyze",{method:"POST",headers:{origin:"http://localhost"},body:form}));
   expect(response.status).toBe(429);expect((await response.json()).error).toContain("daily capacity");
  }
  expect((await reserveAnalysis(request(),memory)).remaining).toBe(2);
 }finally{store.getPlan=old.plan;store.reserveReports=old.reserve;store.settleReports=old.settle;ipRatelimit.limit=old.ip;globalRatelimit.limit=old.global;globalThis.fetch=old.fetch;}
});
