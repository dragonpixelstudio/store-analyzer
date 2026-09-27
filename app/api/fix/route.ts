import { NextRequest } from "next/server";
import { backgroundJobsEnabled, enqueueArtwork } from "@/lib/jobGateway";
import { POST as run } from "@/lib/server/fixHandler";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(req:NextRequest) { return backgroundJobsEnabled() ? enqueueArtwork(req,"fix") : run(req); }
export { GET } from "@/lib/server/fixHandler";
