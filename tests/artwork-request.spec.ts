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
