// All analysis entry points share the same explicit consent step. Cancellation
// returns the free-limit response and never submits paid work.
export async function artworkRequest(url: string, init: RequestInit, confirmSpend = (message: string) => typeof window !== "undefined" && window.confirm(message)): Promise<Response> {
  const response = await singleArtworkRequest(url, init);
  if (url !== "/api/analyze" || response.status !== 429 || !(init.body instanceof FormData) || init.body.has("creditConsent")) return response;
  const data = await response.clone().json().catch(() => null);
  if (data?.code !== "ANALYSIS_LIMIT" || data.canUseCredits !== true) return response;
  if (!confirmSpend("Free reviews are used or processing. Use 1 credit for another review? Failed reviews return the credit.")) return response;
  const body = new FormData();
  init.body.forEach((value, key) => body.append(key, value));
  body.set("creditConsent", "1");
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", crypto.randomUUID());
  const paid = await singleArtworkRequest(url, { ...init, headers, body });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("dpx-wallet-changed"));
  return paid;
}

async function singleArtworkRequest(url: string, init: RequestInit): Promise<Response> {
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
