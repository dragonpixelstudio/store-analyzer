import { NextRequest } from "next/server";
import { ArtworkJobStore, JOB_PATHS, verifyJobSignature, type ArtworkJobKind } from "./artworkJobs";
import { CLAIM_COOKIE, signClaim } from "./credits";
import { withJobBilling, type JobBilling } from "./jobContext";
import { boundedJson } from "./requestBody";
import { POST as analyze } from "./server/analyzeHandler";
import { POST as studio } from "./server/studioHandler";
import { POST as fix } from "./server/fixHandler";

const handlers:Record<ArtworkJobKind,(req:NextRequest)=>Promise<Response>>={analyze,studio,fix};
export async function artworkWorker(req: Request, store=new ArtworkJobStore(), run=handlers) {
  if(req.method !== "POST") return;
  const ticket=await boundedJson(req,1024).catch(()=>null) as {id?:unknown;signature?:unknown}|null;
  if(!ticket || !verifyJobSignature(ticket.id,ticket.signature)) return;
  const id=ticket.id as string;
  const job=await store.get(id);
  if(!job || !await store.claim(id)) return;
  const billing:JobBilling={account:job.account,operation:job.operation};
  let result;
  try {
    const body=await store.input(id);
    if(!body) throw new Error("Job upload expired");
    const origin=new URL(process.env.APP_URL!).origin;
    // Reconstruct only server-validated identity. Do not persist session cookies
    // or forward arbitrary request headers into the privileged worker.
    const headers={"content-type":job.contentType,origin,cookie:`${CLAIM_COOKIE}=${signClaim(job.account)}`,"idempotency-key":job.operation,"x-nf-client-connection-ip":job.network.replace(/\/64$/,""),"x-vercel-forwarded-for":job.network.replace(/\/64$/,""),"x-forwarded-for":job.network.replace(/\/64$/,"")};
    const request=new NextRequest(new URL(JOB_PATHS[job.kind],origin),{method:"POST",headers,body:new Uint8Array(Buffer.from(body,"base64"))});
    const response=await withJobBilling(billing,()=>run[job.kind](request));
    const text=await response.text();
    if(Buffer.byteLength(text)>4*1024*1024) throw new Error("Artwork response exceeds delivery limit");
    JSON.parse(text);
    result={status:response.status,body:text,retryAfter:response.headers.get("retry-after") || undefined};
  } catch {
    billing.charged=0;
    result={status:502,body:JSON.stringify({error:"Artwork processing failed. Any reserved credits have been returned."})};
  }
  // Retry only publication, not expensive model work. If storage remains down,
  // owner polling eventually expires the job and refunds its reservation.
  for(let attempt=0;attempt<3;attempt++) {
    try { const saved=await store.complete(job,result,billing); if(saved<0) throw new Error("Credit settlement rejected"); return; }
    catch { if(attempt===2) throw new Error("Could not save artwork job result"); await new Promise(resolve=>setTimeout(resolve,1000)); }
  }
}
