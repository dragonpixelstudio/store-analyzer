import type { ArtworkJob, JobResult } from "./artworkJobs";
export function summarizeJob(job: ArtworkJob, result: JobResult | null) {
  let reportId: string | undefined;
  let outcome = job.state === "done" ? "unavailable" : job.state;
  if (job.state === "done" && result) {
    outcome = result.status >= 200 && result.status < 300 ? "succeeded" : "failed";
    if (outcome === "succeeded") {
      try { const data = JSON.parse(result.body); if (typeof data.reportId === "string" && /^[A-Za-z0-9_-]{8,24}$/.test(data.reportId)) reportId = data.reportId; } catch { outcome = "unavailable"; }
    }
  }
  return { id: job.id, kind: job.kind, state: job.state, created: job.created, outcome, reportId, analysisReturned: job.analysisReturned === true };
}
