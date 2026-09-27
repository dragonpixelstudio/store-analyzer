import { NextRequest } from "next/server";
import { backgroundJobsEnabled, enqueueArtwork } from "@/lib/jobGateway";
import { POST as run } from "@/lib/server/studioHandler";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(req:NextRequest) { return backgroundJobsEnabled() ? enqueueArtwork(req,"studio") : run(req); }
export { GET } from "@/lib/server/studioHandler";
