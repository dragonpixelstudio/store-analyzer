export async function artworkRequest(url: string, init: RequestInit): Promise<Response> {
  const headers=new Headers(init.headers);
  if(!headers.has("Idempotency-Key")) headers.set("Idempotency-Key",crypto.randomUUID());
  let response=await fetch(url,{...init,headers});
  if(response.status !== 202) return response;
  const data=await response.json();
  const statusUrl=data?.job?.statusUrl;
  if(typeof statusUrl !== "string" || !/^\/api\/jobs\/[a-f0-9]{64}$/.test(statusUrl)) throw new Error("Invalid artwork job response");
  // Jobs stay on the server if this tab closes. The Recent jobs link lets the
  // owner recover a finished image without running or paying for it again.
  const deadline=Date.now()+11*60*1000;
  while(Date.now()<deadline) {
    await new Promise(resolve=>setTimeout(resolve,5000));
    try { response=await fetch(statusUrl,{cache:"no-store"}); } catch { continue; }
    // A completed job may itself return a provider outage or daily-limit error.
    // Only retry temporary failures of the polling endpoint, not final results.
    if(response.status === 202 || ((response.status === 429 || response.status === 503) && response.headers.get("X-Artwork-Job-State") !== "done")) continue;
    return response;
  }
  return Response.json({error:"Your job is taking longer than expected. Open Recent jobs to check or recover it before starting another request."},{status:504});
}
