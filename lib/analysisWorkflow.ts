import type { AnalyzerAssetMeta } from "./analyzerPrompt";
import type { Observations } from "./analyzerCore";
export type AnalysisStep = { index: number; label: string; observation: string; issue: string; instruction: string };
export function analysisWorkflow(assets: AnalyzerAssetMeta[], observations: Observations): AnalysisStep[] {
  return assets.map((asset, index) => {
    const matches = (observations.assetReview || []).filter(r => r.assetName.trim().toLowerCase() === asset.label.toLowerCase());
    const review = matches.length === 1 ? matches[0] : undefined;
    const action = review?.revisionBrief || review?.bestFix || (assets.length === 1 ? observations.dragonPixelFixes?.[0]?.change : "") || "";
    const preserve = asset.providedKind === "screenshot" ? "Keep the actual gameplay unchanged. Adjust framing and caption hierarchy only. " : "Preserve the game's identity, art style and existing title spelling. ";
    return { index, label: asset.label, observation: (review?.mainObservation || "").slice(0, 400), issue: (review?.mainIssue || "").slice(0, 400), instruction: action ? (preserve + action).slice(0, 600) : "" };
  });
}
