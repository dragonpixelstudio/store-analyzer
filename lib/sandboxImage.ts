import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { studioFormat } from "@/lib/studioFormats";
import { localFixturesEnabled } from "@/lib/storageScope";
import type { StudioAiType } from "@/lib/studio";
export async function sandboxImage(type: StudioAiType, formatId?: string, fail = false) {
  if (!localFixturesEnabled()) throw new Error("Local fixtures are disabled");
  if (fail) throw new Error("Deliberate local generation failure");
  const file = type === "icon" ? "gallery/icon-creature.webp" : type === "thumbnail" ? "gallery/thumbnail-space.webp" : "studio/hollowmere-main.webp";
  const spec = studioFormat(type, formatId);
  const output = await sharp(await readFile(path.join(process.cwd(), "public", file))).resize(spec.width, spec.height, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  return { base64: output.toString("base64"), mimeType: "image/webp", width: spec.width, height: spec.height };
}
