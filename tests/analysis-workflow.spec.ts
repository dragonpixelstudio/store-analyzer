import { calculateDragonPixelScores } from "../lib/analyzerCore";
import { test, expect } from "@playwright/test";
import { analysisWorkflow } from "../lib/analysisWorkflow";
import { validHandoff } from "../lib/studioHandoff";
import { sandboxAnalysis } from "../lib/sandboxAnalysis";
import { buildAnalyzerPrompt, type AnalyzerAssetMeta } from "../lib/analyzerPrompt";
const assets: AnalyzerAssetMeta[] = [
  { label: "APP ICON", providedKind: "icon", widthPx: 512, heightPx: 512 },
  { label: "STEAM CAPSULE 1", providedKind: "steamCapsule", widthPx: 920, heightPx: 430 },
];
test("multi-asset edit briefs follow exact labels, independent of model response order", () => {
  const steps = analysisWorkflow(assets, { assetReview: [
    { assetName: "STEAM CAPSULE 1", mainObservation: "Wide composition", mainIssue: "Title too small", bestFix: "Enlarge the title" },
    { assetName: "APP ICON", mainObservation: "Face", mainIssue: "Busy outline", bestFix: "Simplify the silhouette" },
  ] });
  expect(steps[0].instruction).toContain("Simplify the silhouette");
  expect(steps[0].instruction).not.toContain("Enlarge the title");
  expect(steps[1].instruction).toContain("Enlarge the title");
  expect(analysisWorkflow(assets, { dragonPixelFixes: [{ action: "Global", why: "", change: "Do not assign this to every asset" }] }).every(s => s.instruction === "")).toBe(true);
});
test("ambiguous asset feedback is not attached to a different image and screenshot briefs preserve gameplay", () => {
  const review = { assetName: "APP ICON", mainObservation: "", mainIssue: "", bestFix: "Crop" };
  expect(analysisWorkflow(assets, { assetReview: [review, review] })[0].instruction).toBe("");
  const shots: AnalyzerAssetMeta[] = [{ ...assets[1], label: "SCREENSHOT 1", providedKind: "screenshot" }];
  expect(analysisWorkflow(shots, { assetReview: [{ ...review, assetName: "SCREENSHOT 1" }] })[0].instruction).toContain("Keep the actual gameplay unchanged");
});
test("artwork handoffs reject expired, external, malformed and oversized data", () => {
  const value = { version: 1, destination: "studio", createdAt: 1000, dataUrl: "data:image/png;base64,AAAA", name: "art.png", gameName: "Game", gamePitch: "A puzzle game", role: "icon", width: 512, height: 512, instruction: "Simplify the background" };
  expect(validHandoff(value, "studio", 1100)).toBe(true);
  expect(validHandoff(value, "analyze", 1100)).toBe(false);
  expect(validHandoff(value, "studio", 1801001)).toBe(false);
  for (const change of [{ dataUrl: "https://attacker.example/image.png" }, { dataUrl: "data:image/svg+xml;base64,AAAA" }, { instruction: "x".repeat(601) }, { width: 100000 }, { role: "unknown" }, { createdAt: 1200 }]) {
    expect(validHandoff({ ...value, ...change }, "studio", 1100)).toBe(false);
  }
});
test("prompt grounds feedback in context and requires separately labelled asset reviews", () => {
  const prompt = buildAnalyzerPrompt({ assets, platform: "steam", hasIcon: true, hasScreenshots: false, hasCreatives: true, gameContext: "A turn-based dungeon puzzle" });
  expect(prompt).toContain("A turn-based dungeon puzzle");
  expect(prompt).toContain("assetName copied EXACTLY");
  expect(prompt).toContain("untrusted content");
  expect(prompt).toContain("not measured conversion rates");
});
test("sample analysis is explicitly marked and impossible to enable in production", () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, DPX_LOCAL_FIXTURES: process.env.DPX_LOCAL_FIXTURES, DODO_PAYMENTS_ENVIRONMENT: process.env.DODO_PAYMENTS_ENVIRONMENT };
  try {
    Object.assign(process.env, { NODE_ENV: "development", DPX_LOCAL_FIXTURES: "1", DODO_PAYMENTS_ENVIRONMENT: "test_mode" });
    expect(sandboxAnalysis(assets).demo).toBe(true);
    Object.assign(process.env, { NODE_ENV: "production" });
    expect(() => sandboxAnalysis(assets)).toThrow("Local fixtures are disabled");
  } finally { for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("review priorities do not invent filler or claim measured conversion", () => {
  const flags = { hasIcon: false, hasScreens: false, hasCreatives: true };
  const empty = calculateDragonPixelScores({}, "assetOnly", flags);
  expect(empty.topFixes).toHaveLength(0);
  expect(empty.reviewModeLabel).toBe("Artwork review");
  expect(empty.breakdown.find(b => b.key === "gameplayClarity")?.assessed).toBe(false);
  expect(empty.conversionRisk.assessed).toBe(false);
  expect(empty.conversionRisk.reason).not.toContain("from the icon");
  const reviewed = calculateDragonPixelScores({ dragonPixelFixes: [{ action: "Enlarge title", why: "Title is illegible in the provided preview", change: "Increase title size" }] }, "assetOnly", flags);
  expect(reviewed.topFixes).toHaveLength(1);
  expect(reviewed.topFixes[0].action).toBe("Enlarge title");
});

test("ranked priorities are not padded with restated per-asset advice", () => {
  const reviewed = calculateDragonPixelScores({
    dragonPixelFixes: [{ action: "Clarify the title", why: "Title blends into the backdrop", change: "Separate title and background values" }],
    assetReview: [{ assetName: "CAPSULE", mainIssue: "Low title contrast", bestFix: "Increase contrast behind the title", mainObservation: "Title sits over a busy backdrop" }]
  }, "assetOnly", { hasIcon: false, hasScreens: false, hasCreatives: true });
  expect(reviewed.topFixes).toHaveLength(1);
  expect(reviewed.topFixes[0].action).toBe("Clarify the title");
});
