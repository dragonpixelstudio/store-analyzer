import type { GenerateContentConfig, GenerateContentResponse } from "@google/genai";
import { parseAnalyzerReply } from "./analyzerPrompt";
import { sanitizeObservations } from "./analyzerCore";

// Reviews run in the background worker, not a 25-second foreground request.
export const ANALYZER_TIMEOUT_MS = 90_000;
export const ANALYZER_CONFIG: GenerateContentConfig = {
  temperature: 0, topP: 0.1, topK: 1, candidateCount: 1,
  responseMimeType: "application/json", maxOutputTokens: 12_288,
  thinkingConfig: { thinkingBudget: 1024 },
};
export const GENRE_CONFIG: GenerateContentConfig = {
  ...ANALYZER_CONFIG, maxOutputTokens: 2048,
  thinkingConfig: { thinkingBudget: 0 }, httpOptions: { timeout: 20_000 },
};

type FailureKind = "timeout" | "busy" | "quota" | "configuration" | "blocked" | "invalid_response" | "network";
const failures: Record<FailureKind, { status: number; message: string; retryable: boolean }> = {
  timeout: { status: 504, message: "The AI review service took too long to respond. Please try again in a minute.", retryable: true },
  busy: { status: 503, message: "The AI review service is temporarily busy. Please try again in a minute.", retryable: true },
  quota: { status: 503, message: "The AI review provider is at capacity. Please try again later.", retryable: false },
  configuration: { status: 503, message: "The AI review service is currently unavailable. Please contact support if this continues.", retryable: false },
  blocked: { status: 422, message: "The AI provider could not review this image. Try another image or contact support.", retryable: false },
  invalid_response: { status: 502, message: "The AI review was incomplete. Please try again.", retryable: true },
  network: { status: 503, message: "Could not reach the AI review service. Please try again in a minute.", retryable: true },
};
export class AnalyzerProviderError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(readonly kind: FailureKind, readonly upstreamStatus?: number) {
    super(failures[kind].message); this.name = "AnalyzerProviderError";
    this.status = failures[kind].status; this.retryable = failures[kind].retryable;
  }
}
export function analyzerFailure(error: unknown): AnalyzerProviderError {
  if (error instanceof AnalyzerProviderError) return error;
  const value = error as { status?: unknown; message?: unknown; name?: unknown } | null;
  const status = typeof value?.status === "number" ? value.status : undefined;
  const message = typeof value?.message === "string" ? value.message : "";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|\b429\b/i.test(message)) return new AnalyzerProviderError("quota", status);
  if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) return new AnalyzerProviderError("configuration", status);
  if (status === 408 || status === 504 || value?.name === "AbortError" || value?.name === "TimeoutError" || /timed?\s*out|timeout|aborted|DEADLINE_EXCEEDED/i.test(message)) return new AnalyzerProviderError("timeout", status);
  if ((status !== undefined && status >= 500) || /UNAVAILABLE|high demand|\b503\b/i.test(message)) return new AnalyzerProviderError("busy", status);
  if (error instanceof SyntaxError) return new AnalyzerProviderError("invalid_response");
  if (status !== undefined && status >= 400) return new AnalyzerProviderError("configuration", status);
  return new AnalyzerProviderError("network", status);
}
export function readAnalyzerObservations(response: GenerateContentResponse) {
  const finish = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || (finish && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"].includes(finish))) throw new AnalyzerProviderError("blocked");
  if (finish && finish !== "STOP") throw new AnalyzerProviderError("invalid_response");
  try {
    const observations = sanitizeObservations(parseAnalyzerReply(response.text || ""));
    if (!observations) throw new Error("Missing observations");
    return observations;
  } catch { throw new AnalyzerProviderError("invalid_response"); }
}

/** Preserve successful reads. Retry once only when all reads fail transiently. */
export async function collectAnalysisRuns<T>(run: () => Promise<T>, count: number): Promise<T[]> {
  const settled = await Promise.allSettled(Array.from({ length: count }, run));
  const successful: T[] = [], errors: AnalyzerProviderError[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") successful.push(result.value);
    else errors.push(analyzerFailure(result.reason));
  }
  if (errors.length) console.warn("AI review attempts failed", errors.map(error => ({ kind: error.kind, status: error.upstreamStatus })));
  if (successful.length) return successful;
  // Auth, billing quota and safety errors cannot be fixed by repeated calls.
  const terminal = errors.find(error => !error.retryable);
  if (terminal) throw terminal;
  try { return [await run()]; }
  catch (error) { throw analyzerFailure(error); }
}
