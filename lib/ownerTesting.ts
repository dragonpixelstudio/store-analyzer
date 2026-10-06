import { Redis } from "@upstash/redis";
import { storagePrefix } from "./storageScope";
import { walletKey } from "./wallet";

export type OwnerTestAccess = { scope: "analysis"; expiresAt: number };
// Provisioned by the owner maintenance script only. No public route can grant
// this role. A signed wallet credential and an unexpired server record are required.
export async function ownerTestAccess(req: Request, store?: Pick<Redis, "get">, prefix = storagePrefix(), now = Date.now()): Promise<OwnerTestAccess | null> {
  const account = walletKey(req);
  if (!account) return null;
  if (!store && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) return null;
  const record = await (store ?? Redis.fromEnv()).get<OwnerTestAccess>(prefix + "owner-test:" + account);
  if (!record || record.scope !== "analysis" || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= now) return null;
  return { scope: "analysis", expiresAt: record.expiresAt };
}
