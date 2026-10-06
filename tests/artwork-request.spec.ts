import { test, expect } from "@playwright/test";
import { artworkRequest } from "../lib/artworkRequest";

test("completed capacity and daily-limit errors are returned instead of polled forever", async () => {
  const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
  try {
    globalThis.setTimeout = ((callback: () => void) => { queueMicrotask(callback); return 0; }) as unknown as typeof setTimeout;
    for (const status of [429, 503, 504]) {
      let calls=0;
      globalThis.fetch = async () => {
        calls++;
        if(calls===1)return Response.json({job:{statusUrl:"/api/jobs/"+"a".repeat(64)}},{status:202});
        if(calls===2)return Response.json({error:"Final provider error"},{status,headers:{"X-Artwork-Job-State":"done"}});
        return Response.json({error:"Unexpected extra poll"},{status:400});
      };
      const response=await artworkRequest("/api/analyze",{method:"POST"});
      expect(response.status).toBe(status);expect(calls).toBe(2);expect((await response.json()).error).toBe("Final provider error");
    }
  } finally { globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer; }
});
test("temporary poll outages still recover without resubmitting model work", async () => {
  const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
  try {
    globalThis.setTimeout=((callback:()=>void)=>{queueMicrotask(callback);return 0;}) as unknown as typeof setTimeout;
    const responses=[Response.json({job:{statusUrl:"/api/jobs/"+"b".repeat(64)}},{status:202}),Response.json({error:"Polling unavailable"},{status:503}),Response.json({score:75},{headers:{"X-Artwork-Job-State":"done"}})];
    const methods:string[]=[];
    globalThis.fetch=async(_url,init)=>{methods.push(init?.method||"GET");return responses.shift()!;};
    expect((await(await artworkRequest("/api/analyze",{method:"POST"})).json()).score).toBe(75);expect(methods).toEqual(["POST","GET","GET"]);
  }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}
});

test("review credit confirmation resubmits once with consent and a new request ID", async () => {
 const original = globalThis.fetch;
 try {
  for (const consent of [false, true]) {
   const calls: RequestInit[] = []; let prompts = 0;
   globalThis.fetch = async (_url, init) => { calls.push(init!); return calls.length === 1 ? Response.json({ code: "ANALYSIS_LIMIT", canUseCredits: true, error: "Free slots used" }, { status: 429 }) : Response.json({ reportId: "paid-review" }); };
   const form = new FormData(); form.set("gameContext", "Keep my context"); form.append("creatives", new Blob(["test"]), "art.png");
   const result = await artworkRequest("/api/analyze", { method: "POST", headers: { "Idempotency-Key": "original-request-id" }, body: form }, message => { prompts++; expect(message).toContain("1 credit"); return consent; });
   expect(prompts).toBe(1); expect(calls.length).toBe(consent ? 2 : 1); expect(form.has("creditConsent")).toBe(false);
   if (consent) { const body = calls[1].body as FormData; expect(body.get("creditConsent")).toBe("1"); expect(body.get("gameContext")).toBe("Keep my context"); expect((body.get("creatives") as File).name).toBe("art.png"); expect(new Headers(calls[1].headers).get("Idempotency-Key")).not.toBe("original-request-id"); expect((await result.json()).reportId).toBe("paid-review"); }
   else expect(result.status).toBe(429);
  }
 } finally { globalThis.fetch = original; }
});

test("hourly and provider limits never prompt for payment or retry automatically", async () => {
 const original = globalThis.fetch;
 try {
  for (const data of [{ error: "Hourly limit" }, { code: "ANALYSIS_LIMIT", canUseCredits: false }]) {
   let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(data, { status: 429 }); };
   await artworkRequest("/api/analyze", { method: "POST", body: new FormData() }, () => { throw new Error("Unexpected payment prompt"); }); expect(calls).toBe(1);
  }
 } finally { globalThis.fetch = original; }
});
