import { imageProviderLimit } from "../lib/ratelimit";
import { expect, test } from "@playwright/test";
import { STUDIO_FORMATS, studioFormat } from "../lib/studioFormats";
import sharp from "sharp";
import { buildCreatePrompt, generateStudioImage, editStudioImage } from "../lib/studioGenerate";
// Pure domain tests: no browser, model calls, credits or payments.
test("output format cannot cross asset families", () => {
 expect(studioFormat("icon", "steam-vertical").id).toBe("app-icon");
 expect(studioFormat("thumbnail", "unknown").id).toBe("video-hd");
});
test("Steam shapes and mobile icon sizes are explicit", () => {
 expect(STUDIO_FORMATS.filter(f=>f.type==="capsule").map(f=>[f.width,f.height])).toEqual([[920,430],[462,174],[1232,706],[748,896],[600,900]]);
 expect(studioFormat("icon","play-icon").width).toBe(512);
});
test("vertical generation asks for the selected composition shape", () => {
 const prompt=buildCreatePrompt({type:"capsule",formatId:"steam-vertical",gameName:"Test Game",gamePitch:"A platform game about a fox"});
 expect(prompt).toContain("748×896");
 expect(prompt).toContain("Recompose for this aspect ratio");
});
test("thumbnail generation uses thumbnail guidance rather than Steam list guidance", () => {
 const prompt=buildCreatePrompt({type:"thumbnail",formatId:"shorts",gameName:"Test Game",gamePitch:"A platform game about a fox"});
 expect(prompt).toContain("2160×3840");
 expect(prompt).toContain("Video thumbnail:");
 expect(prompt).not.toContain("small Steam list size");
});

test("generation and edits deliver the requested size with opaque pixels within the delivery budget", async () => {
 const originalFetch=globalThis.fetch;
 const originalLimit = imageProviderLimit.limit;
 imageProviderLimit.limit = (async () => ({ success: true, limit: 300, remaining: 299, reset: Date.now()+60000, pending: Promise.resolve() })) as typeof originalLimit;
 const fixture=await sharp({create:{width:40,height:60,channels:4,background:{r:120,g:30,b:170,alpha:.5}}}).png().toBuffer();
 globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{data:fixture.toString("base64")}}]}}]}),{status:200});
 try {
  const generated=await generateStudioImage({type:"capsule",formatId:"steam-vertical",gameName:"Test",gamePitch:"A fox game"},"mock-key");
  expect([generated.width,generated.height]).toEqual([748,896]);
  const metadata=await sharp(Buffer.from(generated.base64,"base64")).metadata();
  expect(metadata.hasAlpha).toBe(false);
  expect(generated.mimeType).toBe("image/webp");
  expect(Buffer.byteLength(generated.base64)).toBeLessThan(3800000);
  const edited=await editStudioImage({type:"thumbnail",formatId:"video-hd",gameName:"Test",instruction:"More contrast",source:{base64:fixture.toString("base64"),mimeType:"image/png"}},"mock-key");
  expect([edited.width,edited.height]).toEqual([1280,720]);
 } finally {globalThis.fetch=originalFetch; imageProviderLimit.limit = originalLimit;}
});
