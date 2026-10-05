import { test, expect } from "@playwright/test";
import type { GenerateContentResponse } from "@google/genai";
import { ANALYZER_CONFIG, ANALYZER_TIMEOUT_MS, analyzerFailure, AnalyzerProviderError, collectAnalysisRuns, readAnalyzerObservations } from "../lib/analyzerProvider";

const response = (text: string, finishReason = "STOP") => ({ text, candidates: [{ finishReason }] }) as GenerateContentResponse;
const observations = { shelfTest: { focalPointClear: true, visibleElements: ["game logo"] }, whatWorks: ["Readable title"], assetReview: [{ assetName: "STEAM CAPSULE 1", mainObservation: "Readable title", mainIssue: "Small subtitle", bestFix: "Enlarge subtitle" }] };

test("valid JSON review is accepted; truncated, empty and malformed output are rejected", () => {
  expect(readAnalyzerObservations(response(JSON.stringify(observations)))?.whatWorks).toEqual(["Readable title"]);
  expect(readAnalyzerObservations(response('```json\n'+JSON.stringify(observations)+'\n```'))).toBeTruthy();
  for (const r of [response(""), response("{"), response("null"), response(JSON.stringify(observations), "MAX_TOKENS")]) expect(() => readAnalyzerObservations(r)).toThrow(AnalyzerProviderError);
  try { readAnalyzerObservations(response("", "SAFETY")); } catch (e) { expect((e as AnalyzerProviderError).kind).toBe("blocked"); }
});
test("provider outages are classified without leaking raw provider messages or secrets", () => {
  for (const [error, kind, status] of [
    [{ name: "AbortError", message: "This operation was aborted" }, "timeout", 504],
    [{ status: 429, message: "quota detail SECRET_VALUE" }, "quota", 503],
    [{ status: 403, message: "API key SECRET_VALUE rejected" }, "configuration", 503],
    [{ status: 503, message: "UNAVAILABLE" }, "busy", 503],
    [new SyntaxError("private response text"), "invalid_response", 502],
  ] as const) {
    const failure=analyzerFailure(error); expect(failure.kind).toBe(kind); expect(failure.status).toBe(status); expect(failure.message).not.toContain("SECRET_VALUE");
  }
});
test("a partial success is retained without charging for another provider attempt", async () => {
  let calls=0;
  expect(await collectAnalysisRuns(async()=>{if(++calls===2)return 75;throw {name:"AbortError"};},3)).toEqual([75]);
  expect(calls).toBe(3);
});
test("all transient failures receive exactly one recovery attempt", async () => {
  let calls=0; expect(await collectAnalysisRuns(async()=>{if(++calls===4)return 80;throw {status:503};},3)).toEqual([80]); expect(calls).toBe(4);
  calls=0; await expect(collectAnalysisRuns(async()=>{calls++;throw {name:"TimeoutError"};},3)).rejects.toMatchObject({kind:"timeout",status:504}); expect(calls).toBe(4);
});
test("authentication, quota and safety failures do not trigger paid retry loops", async () => {
  for(const error of [{status:401},{status:429},new AnalyzerProviderError("blocked")]) {let calls=0;await expect(collectAnalysisRuns(async()=>{calls++;throw error;},3)).rejects.toBeInstanceOf(AnalyzerProviderError);expect(calls).toBe(3);}
});
test("background review budget permits realistic latency and bounds provider output", () => {
  expect(ANALYZER_TIMEOUT_MS).toBeGreaterThan(25000);expect(ANALYZER_TIMEOUT_MS*2).toBeLessThan(600000);
  expect(ANALYZER_CONFIG.thinkingConfig?.thinkingBudget).toBe(1024);expect(ANALYZER_CONFIG.maxOutputTokens).toBeGreaterThan(4096);
});
