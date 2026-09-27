import { artworkWorker } from "../../lib/jobWorker";
export default async function handler(req: Request) { await artworkWorker(req); }
export const config = { background: true };
