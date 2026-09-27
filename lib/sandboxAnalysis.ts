import { calculateDragonPixelScores, getReviewMode, clientReadout, type Observations } from "./analyzerCore";
import type { AnalyzerAssetMeta } from "./analyzerPrompt";
import { analysisWorkflow } from "./analysisWorkflow";
import { localFixturesEnabled } from "./storageScope";
/** Explicit local-only example feedback: this does not inspect or judge the uploaded art. */
export function sandboxAnalysis(assets: AnalyzerAssetMeta[]) {
  if (!localFixturesEnabled()) throw new Error("Local fixtures are disabled");
  const hasIcon = assets.some(a => a.providedKind === "icon"), hasScreens = assets.some(a => a.providedKind === "screenshot");
  const observations: Observations = {
    shelfTest: { focalPointClear: true, smallSizeRisk: true, dominantElement: "Demo: main subject", visibleElements: ["Sample feedback — no AI review was run"], lostElements: ["Example: secondary details at small sizes"] },
    polish: { commercialPolish: "medium", strengths: ["Sample strength for the local walkthrough"], weaknesses: ["Sample hierarchy issue for the local walkthrough"] },
    dragonPixelFixes: [{ action: "Example: strengthen the focal hierarchy", why: "Sample feedback, not a finding about your image.", change: "Simplify secondary detail and separate the main subject from the background." }],
    revisionBrief: "Example brief: preserve the existing subject and identity. Simplify background clutter and improve focal contrast.",
    assetReview: assets.map(a => ({ assetName: a.label, assetType: a.providedKind, mainObservation: "Local demo feedback. This image was not reviewed by AI.", mainIssue: "Example only: make the main subject easier to read.", bestFix: a.providedKind === "screenshot" ? "Keep gameplay unchanged and adjust the surrounding frame." : "Separate the main subject from secondary background detail." })),
  };
  const calculated = calculateDragonPixelScores(observations, getReviewMode(hasIcon, assets.filter(a => a.providedKind !== "icon").length), { hasIcon, hasScreens, hasCreatives: assets.some(a => !["icon", "screenshot"].includes(a.providedKind)) });
  return { demo: true, observations, calculated, verdict: "Local sample review", workflow: analysisWorkflow(assets, observations), benchmarkEvidence: [], ...clientReadout(observations) };
}
