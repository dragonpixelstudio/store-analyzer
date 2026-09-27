import { NextRequest } from "next/server";
import { readArtworkJob } from "@/lib/jobGateway";
export const runtime="nodejs";
export async function GET(req:NextRequest, context:{params:Promise<{id:string}>}) {return readArtworkJob(req,(await context.params).id);}
