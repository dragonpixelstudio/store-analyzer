import { loadReport, refreshReportTtl } from "@/lib/reportStore";

export const runtime = "nodejs";

// Serves the real report featured in the landing-page sample section.
// SAMPLE_REPORT_ID points at any saved report (run your best asset through
// the analyzer and copy the id from its share link). Only the fields the
// sample card renders are returned - never the full observations.

export async function GET() {
  const id = process.env.SAMPLE_REPORT_ID?.trim();
  if (!id) {
    return Response.json(
      { sample: null },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  }

  const report = await loadReport(id);
  if (!report) {
    return Response.json(
      { sample: null },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  }

  await refreshReportTtl(id);

  const c = report.calculated;
  const heroAsset =
    report.assets.find((asset) => asset.kind === "icon" && asset.thumb) ||
    report.assets.find((asset) => asset.thumb);

  return Response.json(
    {
      sample: {
        id,
        launchScore: c.launchScore,
        potentialAfterFixes: c.potentialAfterFixes,
        decisionLabel: c.decision.label,
        decisionTone: c.decision.tone,
        verdict: report.verdict,
        summaryLine: c.summaryLine,
        reviewModeLabel: c.reviewModeLabel,
        strengths: c.strengths.slice(0, 2),
        weaknesses: c.weaknesses.slice(0, 2),
        topFixAction: c.topFixes[0]?.action ?? "",
        thumb: heroAsset?.thumb ?? "",
        assetLabel: heroAsset?.label ?? "",
        assetKind: heroAsset?.kind ?? "",
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
