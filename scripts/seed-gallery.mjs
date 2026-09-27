// Seed the Store Studio gallery through the real generation pipeline.
//
//   1. npm run dev            (in another terminal)
//   2. node scripts/seed-gallery.mjs            # only missing images
//      node scripts/seed-gallery.mjs --all      # regenerate everything
//
// Needs GEMINI_API_KEY + DEV_UNLIMITED_KEY in .env.local, and a network
// location Gemini supports. ~12 images; each is one image-model call.

import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const devKey = env.DEV_UNLIMITED_KEY;
if (!devKey) {
  console.error("DEV_UNLIMITED_KEY missing from .env.local");
  process.exit(1);
}
const headers = { "x-dev-key": devKey, "Content-Type": "application/json" };
const all = process.argv.includes("--all");

const list = await fetch(`${BASE}/api/studio/seed`, { headers });
if (!list.ok) {
  console.error(`Couldn't list recipes (${list.status}). Is "npm run dev" running?`);
  process.exit(1);
}
const { recipeIds } = await list.json();
let made = 0;
let failed = 0;

for (const id of recipeIds) {
  if (!all && existsSync(`public/gallery/${id}.webp`)) {
    console.log(`skip  ${id} (exists)`);
    continue;
  }
  const started = Date.now();
  const res = await fetch(`${BASE}/api/studio/seed`, {
    method: "POST",
    headers,
    body: JSON.stringify({ recipeId: id }),
  });
  const data = await res.json().catch(() => ({}));
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.ok) {
    made++;
    console.log(`ok    ${id}  ${Math.round(data.bytes / 1024)}KB  ${secs}s`);
  } else {
    failed++;
    console.log(`FAIL  ${id}  ${data.error ?? res.status}`);
  }
}

console.log(`\n${made} generated, ${failed} failed. Rebuild or restart dev so the page picks them up.`);
process.exit(failed ? 1 : 0);
