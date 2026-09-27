import sharp from "sharp";
export async function validateImageInput(buffer: Buffer) {
  const image = sharp(buffer, { limitInputPixels: 12000000, failOn: "warning" });
  const meta = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format || "") || !meta.width || !meta.height || meta.width * meta.height > 12000000 || (meta.pages || 1) !== 1) throw new Error("Use a single PNG, JPEG or WebP image, up to 12 megapixels.");
  await image.resize(1, 1).raw().toBuffer();
}
