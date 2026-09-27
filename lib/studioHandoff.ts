import { STUDIO_FORMATS } from "./studioFormats";
export type Handoff = { version: 1; createdAt: number; destination: "studio" | "analyze"; dataUrl: string; name: string; gameName: string; gamePitch: string; role: "icon" | "steamCapsule" | "screenshot" | "featureGraphic" | "keyArt"; width: number; height: number; instruction: string; formatId?: string; platform?: string };
const KEY = "dpx-artwork-handoff-v1";
export function validHandoff(value: unknown, destination: Handoff["destination"], now = Date.now()): value is Handoff {
  if (!value || typeof value !== "object") return false;
  const v = value as Handoff;
  return v.version === 1 && v.destination === destination && Number.isFinite(v.createdAt) && now - v.createdAt >= 0 && now - v.createdAt < 30 * 60000 &&
    typeof v.dataUrl === "string" && v.dataUrl.length < 4_000_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v.dataUrl) &&
    [v.name, v.gameName, v.gamePitch, v.instruction].every(s => typeof s === "string") && v.name.length <= 200 && v.gameName.length <= 80 && v.gamePitch.length <= 300 && v.instruction.length <= 600 &&
    ["icon", "steamCapsule", "screenshot", "featureGraphic", "keyArt"].includes(v.role) && Number.isSafeInteger(v.width) && Number.isSafeInteger(v.height) && v.width > 0 && v.height > 0 && v.width * v.height <= 12_000_000 &&
    (v.formatId === undefined || STUDIO_FORMATS.some(f => f.id === v.formatId)) && (v.platform === undefined || ["steam", "google-play", "app-store", "unknown"].includes(v.platform));
}
export function saveHandoff(value: Omit<Handoff, "version" | "createdAt">) {
  const handoff: Handoff = { ...value, version: 1, createdAt: Date.now() };
  if (!validHandoff(handoff, value.destination)) throw new Error("This image could not be transferred. Use a PNG, JPEG or WebP under 2 MB.");
  sessionStorage.setItem(KEY, JSON.stringify(handoff));
}
export function readHandoff(destination: Handoff["destination"]): Handoff | null {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(KEY) || "null"); return validHandoff(value, destination) ? value : null; } catch { return null; }
}
export function clearHandoff() { sessionStorage.removeItem(KEY); }
export function handoffFile(handoff: Handoff): File {
  const [header, bytes] = handoff.dataUrl.split(",");
  return new File([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], handoff.name, { type: header.slice(5, -7) });
}
export function fileDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read the image")); reader.readAsDataURL(file); }); }
