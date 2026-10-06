import sharp from "sharp";
import { analyzeArtwork } from "./analysisEngine";
import type { AnalyzerPlatform, AnalyzerAssetMeta } from "./analyzerPrompt";
export type RescoreAssetType = "icon" | "screenshot" | "capsule" | "feature-graphic";
export type RescoreResult = { score: number; summaryLine: string };
const kinds: Record<RescoreAssetType, AnalyzerAssetMeta["providedKind"]> = { icon: "icon", screenshot: "screenshot", capsule: "steamCapsule", "feature-graphic": "featureGraphic" };
const labels = { icon: "APP ICON", screenshot: "SCREENSHOT 1", capsule: "STEAM CAPSULE 1", "feature-graphic": "FEATURE GRAPHIC 1" };
// Variant scoring shares the analyzer's normalization, provider reads, rubric
// and canonical result store. It does not debit a second review credit.
export async function rescoreSingleAsset(args: { base64: string; mimeType: string; assetType: RescoreAssetType; platform: AnalyzerPlatform; apiKey: string }): Promise<RescoreResult | null> {
  try {
    const buffer = Buffer.from(args.base64, "base64"), meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;
    const result = await analyzeArtwork({ assets: [{ buffer, meta: { label: labels[args.assetType], providedKind: kinds[args.assetType], widthPx: meta.width, heightPx: meta.height } }], platform: args.platform });
    if (result.observations.notGameAsset) return null;
    return { score: result.calculated.launchScore, summaryLine: result.calculated.summaryLine };
  } catch { return null; }
}
