
import { backgroundJobsEnabled, enqueueArtwork } from "@/lib/jobGateway";
import { POST as run } from "@/lib/server/analyzeHandler";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:Request) { return backgroundJobsEnabled() ? enqueueArtwork(req,"analyze") : run(req); }
export { OPTIONS } from "@/lib/server/analyzeHandler";
