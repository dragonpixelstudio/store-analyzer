import { isIP } from "node:net";

/** One abuse-control identity across browsers. Never an authentication identity. */
export function normalizeNetwork(value: string): string | null {
  const ip = value.trim();
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return null;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const words = halves.length > 1 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  const parts = words.map(word => parseInt(word, 16));
  if (parts.slice(0, 5).every(part => part === 0) && parts[5] === 0xffff) {
    return [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join(".");
  }
  // IPv6 privacy-address rotation within a subnet must not mint a new trial.
  return parts.slice(0, 4).map(part => part.toString(16)).join(":") + "::/64";
}

export function getClientIp(req: Request): string {
  let raw: string | null = null;
  if (process.env.VERCEL === "1") {
    // Vercel overwrites this header at its edge; arbitrary forwarding headers
    // sent to a local/non-Vercel server do not establish client identity.
    raw = req.headers.get("x-vercel-forwarded-for");
  } else if (process.env.DPX_HOST_PROVIDER === "netlify") {
    // Set only in the Netlify function environment. Never trust forwarded
    // aliases or a header sent to a server running on another provider.
    raw = req.headers.get("x-nf-client-connection-ip");
  } else if (process.env.NODE_ENV === "test") {
    raw = req.headers.get("x-forwarded-for");
  } else if (process.env.NODE_ENV !== "production") {
    return "local";
  }
  if (!raw) return process.env.NODE_ENV === "test" ? "local" : "unknown";
  return normalizeNetwork(raw) ?? "unknown";
}
