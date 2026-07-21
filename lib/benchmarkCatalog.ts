import type { AnalyzerPlatform } from "@/lib/analyzerPrompt";

export type BenchmarkAssetKind = "icon" | "screenshot";

export const BENCHMARK_GENRES = [
  "action",
  "survivor",
  "roguelite",
  "shooter",
  "platformer",
  "rpg",
  "puzzle",
  "strategy",
  "simulation",
  "racing",
  "sports",
  "horror",
  "casual",
] as const;

export type BenchmarkGenre = (typeof BENCHMARK_GENRES)[number];

export type BenchmarkReferenceRole =
  | "closest-mechanic"
  | "closest-icon-structure"
  | "adjacent-shelf-competitor";

export function isBenchmarkGenre(value: unknown): value is BenchmarkGenre {
  return (
    typeof value === "string" &&
    (BENCHMARK_GENRES as readonly string[]).includes(value)
  );
}

export type BenchmarkCatalogEntry = {
  id: string;
  title: string;
  platform: Exclude<AnalyzerPlatform, "unknown">;
  storeId: string;
  sourceUrl: string;
  genres: BenchmarkGenre[];
  assetKinds: BenchmarkAssetKind[];
  pattern: string;
  visiblePrinciple: string;
};

// Curated by game/genre first, not by visual similarity alone. The resolver
// always fetches the currently published art from the named store page/API at
// request time - nothing is bundled or rehosted.
export const BENCHMARK_CATALOG: BenchmarkCatalogEntry[] = [
  {
    id: "steam-hades",
    title: "Hades",
    platform: "steam",
    storeId: "1145360",
    sourceUrl: "https://store.steampowered.com/app/1145360/Hades/",
    genres: ["action", "roguelite", "rpg"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant face / skull mark",
    visiblePrinciple:
      "A single high-contrast face shape occupies the icon and survives compact client layouts.",
  },
  {
    id: "steam-dead-cells",
    title: "Dead Cells",
    platform: "steam",
    storeId: "588650",
    sourceUrl: "https://store.steampowered.com/app/588650/Dead_Cells/",
    genres: ["action", "roguelite", "platformer"],
    assetKinds: ["icon", "screenshot"],
    pattern: "bold emblem mark",
    visiblePrinciple:
      "A simple flame silhouette works as one dominant emblem; it is a counterexample to literal face-crop rules.",
  },
  {
    id: "steam-brotato",
    title: "Brotato",
    platform: "steam",
    storeId: "1942280",
    sourceUrl: "https://store.steampowered.com/app/1942280/Brotato/",
    genres: ["action", "survivor", "shooter", "roguelite"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant mascot face",
    visiblePrinciple:
      "The mascot face is the mark, with minimal secondary detail competing at small size.",
  },
  {
    id: "steam-portal-2",
    title: "Portal 2",
    platform: "steam",
    storeId: "620",
    sourceUrl: "https://store.steampowered.com/app/620/Portal_2/",
    genres: ["puzzle", "platformer"],
    assetKinds: ["screenshot"],
    pattern: "single puzzle interaction",
    visiblePrinciple:
      "Screenshots stage one readable spatial problem with strong portal contrast and limited UI.",
  },
  {
    id: "steam-into-the-breach",
    title: "Into the Breach",
    platform: "steam",
    storeId: "590380",
    sourceUrl: "https://store.steampowered.com/app/590380/Into_the_Breach/",
    genres: ["strategy", "puzzle"],
    assetKinds: ["screenshot"],
    pattern: "readable tactical board",
    visiblePrinciple:
      "The battlefield, threat lines, and unit relationships stay legible without decorative clutter.",
  },
  {
    id: "steam-stardew-valley",
    title: "Stardew Valley",
    platform: "steam",
    storeId: "413150",
    sourceUrl: "https://store.steampowered.com/app/413150/Stardew_Valley/",
    genres: ["simulation", "rpg", "casual"],
    assetKinds: ["screenshot"],
    pattern: "readable activity and place",
    visiblePrinciple:
      "Screenshots communicate the activity, environment, and reward loop in one glance.",
  },
  {
    id: "steam-forza-horizon-5",
    title: "Forza Horizon 5",
    platform: "steam",
    storeId: "1551360",
    sourceUrl: "https://store.steampowered.com/app/1551360/Forza_Horizon_5/",
    genres: ["racing", "sports"],
    assetKinds: ["screenshot"],
    pattern: "hero vehicle in motion",
    visiblePrinciple:
      "One car dominates while road direction and environment communicate speed.",
  },
  {
    id: "play-vampire-survivors",
    title: "Vampire Survivors",
    platform: "google-play",
    storeId: "com.poncle.vampiresurvivors",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.poncle.vampiresurvivors",
    genres: ["action", "survivor", "roguelite"],
    assetKinds: ["icon", "screenshot"],
    pattern: "single genre-signaling character mark",
    visiblePrinciple:
      "The icon uses one dominant character mark; screenshots show swarm density and attack readability.",
  },
  {
    id: "play-brawl-stars",
    title: "Brawl Stars",
    platform: "google-play",
    storeId: "com.supercell.brawlstars",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.supercell.brawlstars",
    genres: ["action", "shooter", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant mascot / combat mark",
    visiblePrinciple:
      "One bold face or combat mark carries the icon; screenshots prioritize players and threat lanes.",
  },
  {
    id: "play-royal-match",
    title: "Royal Match",
    platform: "google-play",
    storeId: "com.dreamgames.royalmatch",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.dreamgames.royalmatch",
    genres: ["puzzle", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant mascot face and readable puzzle reward",
    visiblePrinciple:
      "The icon commits to one expressive mascot; screenshots isolate one board state or reward event.",
  },
  {
    id: "play-clash-royale",
    title: "Clash Royale",
    platform: "google-play",
    storeId: "com.supercell.clashroyale",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.supercell.clashroyale",
    genres: ["strategy", "action"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant unit / brand mark",
    visiblePrinciple:
      "The icon is a single recognizable unit mark; screenshots make lanes, units, and conflict readable.",
  },
  {
    id: "play-stardew-valley",
    title: "Stardew Valley",
    platform: "google-play",
    storeId: "com.chucklefish.stardewvalley",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.chucklefish.stardewvalley",
    genres: ["simulation", "rpg", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "simple place / crop identity",
    visiblePrinciple:
      "The icon reduces the world to one readable rural mark; screenshots communicate an activity and reward.",
  },
  {
    id: "play-asphalt-legends",
    title: "Asphalt Legends",
    platform: "google-play",
    storeId: "com.gameloft.android.ANMP.GloftA9HM",
    sourceUrl:
      "https://play.google.com/store/apps/details?id=com.gameloft.android.ANMP.GloftA9HM",
    genres: ["racing", "sports"],
    assetKinds: ["icon", "screenshot"],
    pattern: "single speed / vehicle mark",
    visiblePrinciple:
      "A bold vehicle or speed mark carries the icon; screenshots keep one hero car and road direction dominant.",
  },
  {
    id: "ios-dead-cells",
    title: "Dead Cells",
    platform: "app-store",
    storeId: "1389752090",
    sourceUrl: "https://apps.apple.com/us/app/dead-cells/id1389752090",
    genres: ["action", "roguelite", "platformer"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant character / emblem mark",
    visiblePrinciple:
      "The mobile icon keeps one recognizable mark; screenshots emphasize character action and threat.",
  },
  {
    id: "ios-brawl-stars",
    title: "Brawl Stars",
    platform: "app-store",
    storeId: "1229016807",
    sourceUrl: "https://apps.apple.com/us/app/brawl-stars/id1229016807",
    genres: ["action", "shooter", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant mascot / combat mark",
    visiblePrinciple:
      "One bold face or combat mark carries the icon; screenshots prioritize players and threat lanes.",
  },
  {
    id: "ios-royal-match",
    title: "Royal Match",
    platform: "app-store",
    storeId: "1482155847",
    sourceUrl: "https://apps.apple.com/us/app/royal-match/id1482155847",
    genres: ["puzzle", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant mascot face and readable puzzle reward",
    visiblePrinciple:
      "The icon commits to one expressive mascot; screenshots isolate one board state or reward event.",
  },
  {
    id: "ios-clash-royale",
    title: "Clash Royale",
    platform: "app-store",
    storeId: "1053012308",
    sourceUrl: "https://apps.apple.com/us/app/clash-royale/id1053012308",
    genres: ["strategy", "action"],
    assetKinds: ["icon", "screenshot"],
    pattern: "dominant unit / brand mark",
    visiblePrinciple:
      "The icon is a single recognizable unit mark; screenshots make lanes, units, and conflict readable.",
  },
  {
    id: "ios-stardew-valley",
    title: "Stardew Valley",
    platform: "app-store",
    storeId: "1406710800",
    sourceUrl: "https://apps.apple.com/us/app/stardew-valley/id1406710800",
    genres: ["simulation", "rpg", "casual"],
    assetKinds: ["icon", "screenshot"],
    pattern: "simple place / crop identity",
    visiblePrinciple:
      "The icon reduces the world to one readable rural mark; screenshots communicate an activity and reward.",
  },
  {
    id: "ios-asphalt-legends",
    title: "Asphalt Legends",
    platform: "app-store",
    storeId: "805603214",
    sourceUrl: "https://apps.apple.com/us/app/asphalt-legends/id805603214",
    genres: ["racing", "sports"],
    assetKinds: ["icon", "screenshot"],
    pattern: "single speed / vehicle mark",
    visiblePrinciple:
      "A bold vehicle or speed mark carries the icon; screenshots keep one hero car and road direction dominant.",
  },
];

export function selectBenchmarkEntries(args: {
  platform: AnalyzerPlatform;
  assetKind: BenchmarkAssetKind;
  genres: BenchmarkGenre[];
  limit?: number;
}) {
  const limit = Math.max(2, Math.min(4, args.limit ?? 3));
  const desiredPlatform = args.platform;
  const selectedTitles = new Set<string>();

  const ranked = [...BENCHMARK_CATALOG]
    .filter((entry) => entry.assetKinds.includes(args.assetKind))
    .map((entry) => {
      const genreHits = entry.genres.filter((genre) =>
        args.genres.includes(genre)
      ).length;
      const platformScore =
        desiredPlatform === "unknown"
          ? 1
          : entry.platform === desiredPlatform
            ? 5
            : 0;
      return {
        entry,
        genreHits,
        score: genreHits * 10 + platformScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));

  const dedupe = ({ entry }: { entry: BenchmarkCatalogEntry }) => {
    // Avoid showing the same title twice when its art is published on
    // multiple storefronts.
    const key = entry.title.toLowerCase();
    if (selectedTitles.has(key)) return false;
    selectedTitles.add(key);
    return true;
  };

  // Genre-matched entries first - relevance leads. If the genre yields fewer
  // than the limit (e.g. only two shooter icons exist for this store), fill
  // the remaining slots with shelf neighbors from the ranked list so the
  // reference row is never visually incomplete; their empty matchedGenres
  // tells both the model and the UI they are adjacency-only references.
  const picked = ranked.filter(({ genreHits }) => genreHits > 0).filter(dedupe);
  const fillers = ranked
    .filter(({ genreHits }) => genreHits === 0)
    .filter(dedupe);

  return [...picked, ...fillers].slice(0, limit).map(({ entry }) => entry);
}
