export async function boundedBytes(req: Request, limit: number): Promise<Buffer> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > limit) throw new Error("Request body is too large");
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error("Request body is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function boundedJson(req: Request, limit = 16384): Promise<unknown> {
  return JSON.parse(await boundedText(req, limit));
}

export async function boundedText(req: Request, limit: number): Promise<string> {
  return (await boundedBytes(req, limit)).toString("utf8");
}
export async function boundedFormData(req: Request, limit: number): Promise<FormData> {
  const data = await boundedBytes(req, limit);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
}
