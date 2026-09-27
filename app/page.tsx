import { readdirSync } from "node:fs";
import path from "node:path";
import StudioApp from "@/app/components/studio/StudioApp";
export default function StudioHome() {
  let availableImages: string[] = [];
  try { availableImages = readdirSync(path.join(process.cwd(), "public", "gallery")).filter(f => f.endsWith(".webp") && !f.startsWith("demo-")).map(f => f.replace(/\.webp$/, "")); } catch {}
  return <StudioApp availableImages={availableImages} />;
}
