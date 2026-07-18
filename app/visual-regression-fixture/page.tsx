import { notFound } from "next/navigation";
import BenchmarkDossier, {
  type BenchmarkEvidence,
} from "@/app/components/BenchmarkDossier";
import ShelfSimulator from "@/app/components/ShelfSimulator";

const references: BenchmarkEvidence["references"] = [
  {
    id: "steam-hades",
    title: "Hades",
    platform: "steam",
    assetKind: "icon",
    sourceUrl: "https://store.steampowered.com/app/1145360/Hades/",
    thumb: "/benchmarks/steam-icons/hades.png",
    pattern: "dominant face / skull mark",
    visiblePrinciple:
      "A single high-contrast face shape occupies the icon and survives compact layouts.",
    matchedGenres: ["action", "roguelite"],
    role: "closest-mechanic",
  },
  {
    id: "steam-dead-cells",
    title: "Dead Cells",
    platform: "steam",
    assetKind: "icon",
    sourceUrl: "https://store.steampowered.com/app/588650/Dead_Cells/",
    thumb: "/benchmarks/steam-icons/dead-cells.png",
    pattern: "bold emblem mark",
    visiblePrinciple:
      "One dominant emblem demonstrates that a readable mark need not be a literal face crop.",
    matchedGenres: ["action", "roguelite"],
    role: "closest-icon-structure",
  },
  {
    id: "steam-brotato",
    title: "Brotato",
    platform: "steam",
    assetKind: "icon",
    sourceUrl: "https://store.steampowered.com/app/1942280/Brotato/",
    thumb: "/benchmarks/steam-icons/brotato.png",
    pattern: "dominant mascot face",
    visiblePrinciple:
      "The mascot face remains the mark with little secondary detail competing at small size.",
    matchedGenres: ["survivor", "shooter", "roguelite"],
    role: "adjacent-shelf-competitor",
  },
];

const completeEvidence: BenchmarkEvidence = {
  platform: "steam",
  assetKind: "icon",
  genre: {
    primary: "survivor",
    secondary: ["roguelite", "shooter"],
    confidence: "high",
    visibleSignals: ["User confirmed survivor for benchmark selection."],
    selectionSource: "user-confirmed",
  },
  measurementConfidence: "measured",
  measurements: [
    {
      sizePx: 32,
      activePixelCoveragePct: 66.1,
      activeBoundsCoveragePct: 93.8,
      edgeDensityPct: 12.4,
    },
  ],
  smallSizeRetentionPct: 104.6,
  references,
  referenceFetch: {
    requested: 3,
    resolved: 3,
    failed: 0,
    status: "complete",
    failures: [],
  },
  comparison: {
    nearestReferenceIds: ["steam-brotato", "steam-hades"],
    sharedPrinciples: ["A high-contrast central mark survives."],
    importantDifferences: ["The upload gives more area to the weapon."],
    measuredFacts: ["32px mask coverage is 66.1%."],
    visualObservations: [
      "The uploaded focal mark competes with secondary weapon detail.",
    ],
    inferences: [
      "A purpose-built close-up should produce a more compact silhouette, but conversion impact is not proven.",
    ],
    recommendation:
      "Recompose around one dominant hood and visor mark while retaining only enough weapon detail to communicate combat.",
    cropOnlyEnough: false,
    confidence: "medium",
  },
  caveats: [
    "Mask coverage is not semantic subject detection.",
    "Reference success does not prove icon causation.",
    "References support composition principles only.",
  ],
};

const partialEvidence: BenchmarkEvidence = {
  ...completeEvidence,
  references: references.slice(0, 1),
  referenceFetch: {
    requested: 3,
    resolved: 1,
    failed: 2,
    status: "partial",
    failures: [
      {
        id: "steam-dead-cells",
        title: "Dead Cells",
        platform: "steam",
        reason: "timeout",
      },
      {
        id: "steam-brotato",
        title: "Brotato",
        platform: "steam",
        reason: "network-error",
      },
    ],
  },
};

export default function VisualRegressionFixture() {
  if (process.env.ENABLE_VISUAL_FIXTURE !== "1") notFound();

  return (
    <main className="mx-auto min-h-screen w-[1180px] space-y-8 bg-[#070a12] p-10 text-[var(--foreground)]">
      <section data-testid="report-dossier">
        <BenchmarkDossier evidence={completeEvidence} />
      </section>
      <section data-testid="partial-dossier">
        <BenchmarkDossier evidence={partialEvidence} />
      </section>
      <section
        data-testid="shelf-simulator"
        className="rounded-2xl border border-[var(--edge)] bg-[#0b1020] p-6"
      >
        <ShelfSimulator
          iconUrl="/benchmarks/steam-icons/hades.png"
          references={references.map((reference) => ({
            title: reference.title,
            thumb: reference.thumb,
            sourceUrl: reference.sourceUrl,
            roleLabel:
              reference.role === "closest-mechanic"
                ? "Closest mechanic"
                : reference.role === "closest-icon-structure"
                  ? "Closest icon structure"
                  : "Adjacent shelf competitor",
          }))}
        />
      </section>
    </main>
  );
}
