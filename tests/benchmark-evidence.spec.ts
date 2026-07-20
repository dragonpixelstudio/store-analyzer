import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBenchmarkEvidence,
  type ReferenceImagePart,
} from "../lib/iconEvidence";

const benchmarkIcon = readFileSync(
  join(process.cwd(), "public", "benchmarks", "placeholder-icons", "ember.png")
);

const genre = {
  primary: "survivor" as const,
  secondary: ["roguelite" as const, "shooter" as const],
  confidence: "high" as const,
  visibleSignals: ["Test fixture"],
  selectionSource: "user-confirmed" as const,
};

test("reports unavailable when every selected reference fails", async () => {
  const { evidence, imageParts } = await buildBenchmarkEvidence({
    userAsset: benchmarkIcon,
    platform: "steam",
    assetKind: "icon",
    genre,
    resolveReference: async () => {
      throw new Error("benchmark image request timed out");
    },
  });

  expect(imageParts).toEqual([]);
  expect(evidence.referenceFetch.status).toBe("unavailable");
  expect(evidence.referenceFetch.resolved).toBe(0);
  expect(evidence.referenceFetch.failed).toBeGreaterThan(0);
  expect(evidence.references).toEqual([]);
  expect(evidence.caveats.join(" ")).toContain(
    "must omit visual benchmark claims"
  );
});

test("reports partial and keeps only successfully resolved references", async () => {
  let call = 0;
  const { evidence, imageParts } = await buildBenchmarkEvidence({
    userAsset: benchmarkIcon,
    platform: "steam",
    assetKind: "icon",
    genre,
    resolveReference: async (
      entry,
      assetKind,
      role,
      matchedGenres
    ): Promise<ReferenceImagePart> => {
      call += 1;
      if (call > 1) throw new Error("benchmark image request failed: 503");
      return {
        mimeType: "image/png",
        base64: benchmarkIcon.toString("base64"),
        reference: {
          id: entry.id,
          title: entry.title,
          platform: entry.platform,
          assetKind,
          sourceUrl: entry.sourceUrl,
          thumb: `data:image/png;base64,${benchmarkIcon.toString("base64")}`,
          pattern: entry.pattern,
          visiblePrinciple: entry.visiblePrinciple,
          genres: entry.genres,
          matchedGenres,
          role,
        },
      };
    },
  });

  expect(evidence.referenceFetch.status).toBe("partial");
  expect(evidence.referenceFetch.resolved).toBe(1);
  expect(evidence.referenceFetch.failed).toBeGreaterThan(0);
  expect(evidence.references).toHaveLength(1);
  expect(imageParts).toHaveLength(1);
});
