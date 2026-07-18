import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  BENCHMARK_GENRES,
  isBenchmarkGenre,
  selectBenchmarkEntries,
  type BenchmarkAssetKind,
  type BenchmarkCatalogEntry,
  type BenchmarkGenre,
  type BenchmarkReferenceRole,
} from "@/lib/benchmarkCatalog";
import type { AnalyzerPlatform } from "@/lib/analyzerPrompt";

export type EvidenceConfidence = "measured" | "estimated";

export type IconReadMeasurement = {
  sizePx: 184 | 64 | 32;
  activePixelCoveragePct: number;
  activeBoundsCoveragePct: number;
  edgeDensityPct: number;
};

export type BenchmarkGenreClassification = {
  primary: BenchmarkGenre;
  secondary: BenchmarkGenre[];
  confidence: "low" | "medium" | "high";
  visibleSignals: string[];
  selectionSource: "inferred" | "user-confirmed";
};

export type ResolvedBenchmarkReference = {
  id: string;
  title: string;
  platform: Exclude<AnalyzerPlatform, "unknown">;
  assetKind: BenchmarkAssetKind;
  sourceUrl: string;
  imageUrl?: string;
  thumb: string;
  pattern: string;
  visiblePrinciple: string;
  genres: BenchmarkGenre[];
  matchedGenres: BenchmarkGenre[];
  role: BenchmarkReferenceRole;
};

export type BenchmarkReferenceFailure = {
  id: string;
  title: string;
  platform: Exclude<AnalyzerPlatform, "unknown">;
  reason:
    | "timeout"
    | "not-found"
    | "invalid-image"
    | "too-large"
    | "network-error"
    | "unknown";
};

export type BenchmarkReferenceFetch = {
  requested: number;
  resolved: number;
  failed: number;
  status: "complete" | "partial" | "unavailable";
  failures: BenchmarkReferenceFailure[];
};

export type IconBenchmarkComparison = {
  attemptedPattern?: string;
  nearestReferenceIds: string[];
  sharedPrinciples: string[];
  importantDifferences: string[];
  measuredFacts: string[];
  visualObservations: string[];
  inferences: string[];
  recommendation?: string;
  cropOnlyEnough?: boolean;
  confidence?: "low" | "medium" | "high";
};

export type BenchmarkEvidence = {
  version: 3;
  platform: AnalyzerPlatform;
  assetKind: BenchmarkAssetKind;
  genre: BenchmarkGenreClassification;
  measurementMethod?: "alpha-mask" | "corner-contrast-estimate";
  measurementConfidence?: EvidenceConfidence;
  measurements?: IconReadMeasurement[];
  smallSizeRetentionPct?: number;
  references: ResolvedBenchmarkReference[];
  referenceFetch: BenchmarkReferenceFetch;
  comparison?: IconBenchmarkComparison;
  caveats: string[];
};

export type ReferenceImagePart = {
  reference: ResolvedBenchmarkReference;
  mimeType: string;
  base64: string;
};

const DISPLAY_SIZES = [184, 64, 32] as const;
const MAX_REFERENCE_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function colorDistance(
  r: number,
  g: number,
  b: number,
  background: [number, number, number]
) {
  const dr = r - background[0];
  const dg = g - background[1];
  const db = b - background[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function cornerBackground(
  data: Buffer,
  size: number
): [number, number, number] {
  const sample = Math.max(2, Math.round(size * 0.08));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const inCorner = (x: number, y: number) =>
    (x < sample || x >= size - sample) &&
    (y < sample || y >= size - sample);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inCorner(x, y)) continue;
      const offset = (y * size + x) * 4;
      if (data[offset + 3] < 16) continue;
      rs.push(data[offset]);
      gs.push(data[offset + 1]);
      bs.push(data[offset + 2]);
    }
  }

  return [median(rs), median(gs), median(bs)];
}

async function measureAtSize(
  buffer: Buffer,
  size: (typeof DISPLAY_SIZES)[number],
  hasAlpha: boolean
): Promise<IconReadMeasurement> {
  const { data } = await sharp(buffer)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const background = hasAlpha ? ([0, 0, 0] as const) : cornerBackground(data, size);
  const active = new Uint8Array(size * size);
  let activeCount = 0;
  let minX: number = size;
  let minY: number = size;
  let maxX: number = -1;
  let maxY: number = -1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const alpha = data[offset + 3];
      const isActive = hasAlpha
        ? alpha >= 24
        : alpha >= 24 &&
          colorDistance(data[offset], data[offset + 1], data[offset + 2], [
            background[0],
            background[1],
            background[2],
          ]) >= 42;

      if (!isActive) continue;
      active[y * size + x] = 1;
      activeCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  let edgeCount = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (!active[i]) continue;
      if (
        !active[i - 1] ||
        !active[i + 1] ||
        !active[i - size] ||
        !active[i + size]
      ) {
        edgeCount += 1;
      }
    }
  }

  const boundsArea =
    maxX >= minX && maxY >= minY
      ? (maxX - minX + 1) * (maxY - minY + 1)
      : 0;
  const total = size * size;

  return {
    sizePx: size,
    activePixelCoveragePct: round1((activeCount / total) * 100),
    activeBoundsCoveragePct: round1((boundsArea / total) * 100),
    edgeDensityPct: round1((edgeCount / total) * 100),
  };
}

type IconMeasurementSummary = Pick<
  BenchmarkEvidence,
  | "measurementMethod"
  | "measurementConfidence"
  | "measurements"
  | "smallSizeRetentionPct"
>;

export async function measureIconRead(
  buffer: Buffer
): Promise<IconMeasurementSummary> {
  const meta = await sharp(buffer).metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  const measurements = await Promise.all(
    DISPLAY_SIZES.map((size) => measureAtSize(buffer, size, hasAlpha))
  );
  const full = measurements.find((item) => item.sizePx === 184);
  const small = measurements.find((item) => item.sizePx === 32);
  const smallSizeRetentionPct =
    full && small && full.activePixelCoveragePct > 0
      ? round1(
          (small.activePixelCoveragePct / full.activePixelCoveragePct) * 100
        )
      : 0;

  return {
    measurementMethod: hasAlpha
      ? ("alpha-mask" as const)
      : ("corner-contrast-estimate" as const),
    measurementConfidence: hasAlpha
      ? ("measured" as const)
      : ("estimated" as const),
    measurements,
    smallSizeRetentionPct,
  };
}

async function safeFetch(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent":
          "DragonPixelStoreAnalyzer/1.0 (+https://launch.dragonpixelstudio.com)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function imageFromUrl(url: string) {
  const response = await safeFetch(url);
  if (!response.ok) {
    throw new Error(`benchmark image request failed: ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_REFERENCE_BYTES) {
    throw new Error("benchmark image exceeds size limit");
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.length > MAX_REFERENCE_BYTES) {
    throw new Error("benchmark image exceeds size limit");
  }
  const png = await sharp(source)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return { buffer: png, imageUrl: url };
}

async function resolveSteam(
  entry: BenchmarkCatalogEntry,
  assetKind: BenchmarkAssetKind
) {
  if (assetKind === "icon" && entry.localIconPath) {
    const filePath = path.join(
      process.cwd(),
      "public",
      "benchmarks",
      "steam-icons",
      entry.localIconPath
    );
    return { buffer: await fs.readFile(filePath), imageUrl: entry.sourceUrl };
  }

  const response = await safeFetch(
    `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(entry.storeId)}`
  );
  const payload = (await response.json()) as Record<
    string,
    {
      success?: boolean;
      data?: {
        screenshots?: Array<{ path_full?: string; path_thumbnail?: string }>;
      };
    }
  >;
  const data = payload[entry.storeId]?.data;
  const imageUrl =
    data?.screenshots?.[0]?.path_full || data?.screenshots?.[0]?.path_thumbnail;
  if (!imageUrl) throw new Error("Steam reference has no screenshot");
  return imageFromUrl(imageUrl);
}

async function resolveAppStore(
  entry: BenchmarkCatalogEntry,
  assetKind: BenchmarkAssetKind
) {
  const response = await safeFetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(entry.storeId)}&country=us`
  );
  const payload = (await response.json()) as {
    results?: Array<{
      artworkUrl512?: string;
      artworkUrl100?: string;
      screenshotUrls?: string[];
      ipadScreenshotUrls?: string[];
    }>;
  };
  const app = payload.results?.[0];
  const imageUrl =
    assetKind === "icon"
      ? app?.artworkUrl512 || app?.artworkUrl100
      : app?.screenshotUrls?.[0] || app?.ipadScreenshotUrls?.[0];
  if (!imageUrl) throw new Error("App Store reference has no requested asset");
  return imageFromUrl(
    assetKind === "icon"
      ? imageUrl.replace(/\d+x\d+bb/, "512x512bb")
      : imageUrl
  );
}

function decodeGoogleUrl(value: string) {
  return value
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

async function resolveGooglePlay(
  entry: BenchmarkCatalogEntry,
  assetKind: BenchmarkAssetKind
) {
  const response = await safeFetch(`${entry.sourceUrl}&hl=en&gl=US`);
  const html = await response.text();
  const urls = Array.from(
    html.matchAll(/https:\/\/play-lh\.googleusercontent\.com\/[^"'\\\s<]+/g),
    (match) => decodeGoogleUrl(match[0])
  );
  const unique = [...new Set(urls)];

  for (const url of unique.slice(0, 40)) {
    try {
      const resolved = await imageFromUrl(url);
      const meta = await sharp(resolved.buffer).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      const ratio = height > 0 ? width / height : 0;
      if (assetKind === "icon" && ratio >= 0.9 && ratio <= 1.1) return resolved;
      if (assetKind === "screenshot" && (ratio < 0.82 || ratio > 1.25)) {
        return resolved;
      }
    } catch {
      // Continue through catalog-controlled image candidates.
    }
  }
  throw new Error("Google Play reference has no requested asset");
}

async function makeThumb(buffer: Buffer) {
  const webp = await sharp(buffer)
    .resize(160, 160, { fit: "inside", withoutEnlargement: false })
    .webp({ quality: 76 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

async function resolveEntry(
  entry: BenchmarkCatalogEntry,
  assetKind: BenchmarkAssetKind,
  role: BenchmarkReferenceRole,
  matchedGenres: BenchmarkGenre[]
): Promise<ReferenceImagePart> {
  const resolved =
    entry.platform === "steam"
      ? await resolveSteam(entry, assetKind)
      : entry.platform === "app-store"
        ? await resolveAppStore(entry, assetKind)
        : await resolveGooglePlay(entry, assetKind);
  const png = await sharp(resolved.buffer).png().toBuffer();
  const reference: ResolvedBenchmarkReference = {
    id: entry.id,
    title: entry.title,
    platform: entry.platform,
    assetKind,
    sourceUrl: entry.sourceUrl,
    imageUrl: resolved.imageUrl,
    thumb: await makeThumb(png),
    pattern: entry.pattern,
    visiblePrinciple: entry.visiblePrinciple,
    genres: entry.genres,
    matchedGenres,
    role,
  };
  return {
    reference,
    mimeType: "image/png",
    base64: png.toString("base64"),
  };
}

export async function buildBenchmarkEvidence(args: {
  userAsset: Buffer;
  platform: AnalyzerPlatform;
  assetKind: BenchmarkAssetKind;
  genre: BenchmarkGenreClassification;
  resolveReference?: (
    entry: BenchmarkCatalogEntry,
    assetKind: BenchmarkAssetKind,
    role: BenchmarkReferenceRole,
    matchedGenres: BenchmarkGenre[]
  ) => Promise<ReferenceImagePart>;
}) {
  const selectedGenres = [args.genre.primary, ...args.genre.secondary];
  const entries = selectBenchmarkEntries({
    platform: args.platform,
    assetKind: args.assetKind,
    genres: selectedGenres,
  });
  const resolver = args.resolveReference || resolveEntry;
  const settled = await Promise.allSettled(
    entries.map((entry, index) => {
      const role: BenchmarkReferenceRole =
        index === 0
          ? "closest-mechanic"
          : args.assetKind === "icon" && index === 1
            ? "closest-icon-structure"
            : "adjacent-shelf-competitor";
      const matchedGenres = entry.genres.filter((genre) =>
        selectedGenres.includes(genre)
      );
      return resolver(entry, args.assetKind, role, matchedGenres);
    })
  );
  const imageParts = settled
    .filter(
      (item): item is PromiseFulfilledResult<ReferenceImagePart> =>
        item.status === "fulfilled"
    )
    .map((item) => item.value);
  const failures: BenchmarkReferenceFailure[] = settled.flatMap(
    (item, index) => {
      if (item.status === "fulfilled") return [];
      const entry = entries[index];
      const message =
        item.reason instanceof Error
          ? `${item.reason.name} ${item.reason.message}`.toLowerCase()
          : "";
      const reason: BenchmarkReferenceFailure["reason"] =
        message.includes("abort") || message.includes("timeout")
          ? "timeout"
          : message.includes("no requested asset") ||
              message.includes("no screenshot") ||
              message.includes("not found")
            ? "not-found"
            : message.includes("size limit") || message.includes("too large")
              ? "too-large"
              : message.includes("image") ||
                  message.includes("sharp") ||
                  message.includes("unsupported")
                ? "invalid-image"
                : message
                  ? "network-error"
                  : "unknown";
      return [
        {
          id: entry.id,
          title: entry.title,
          platform: entry.platform,
          reason,
        },
      ];
    }
  );
  const referenceFetch: BenchmarkReferenceFetch = {
    requested: entries.length,
    resolved: imageParts.length,
    failed: failures.length,
    status:
      entries.length === 0
        ? "unavailable"
        : imageParts.length === entries.length
        ? "complete"
        : imageParts.length > 0
          ? "partial"
          : "unavailable",
    failures,
  };
  const measurement: Partial<IconMeasurementSummary> =
    args.assetKind === "icon" ? await measureIconRead(args.userAsset) : {};

  const evidence: BenchmarkEvidence = {
    version: 3,
    platform: args.platform,
    assetKind: args.assetKind,
    genre: args.genre,
    ...measurement,
    references: imageParts.map((item) => item.reference),
    referenceFetch,
    caveats: [
      args.assetKind === "icon" &&
      measurement.measurementConfidence === "measured"
        ? "Active-pixel coverage is measured from transparency; it is not a semantic face, visor, or subject detector."
        : args.assetKind === "icon"
          ? "The icon has no usable transparency, so active-pixel coverage is estimated from corner/background contrast and must not be described as exact subject coverage."
          : "Screenshot comparison is visual and compositional; the analyzer does not claim deterministic subject segmentation for gameplay captures.",
      "Reference games are successful shipped titles, but this comparison does not prove that their store art caused commercial performance.",
      `References are selected by platform, asset type, and ${
        args.genre.selectionSource === "user-confirmed"
          ? "the user-confirmed genre"
          : "the inferred genre"
      }. They support composition principles only and are never style-transfer sources.`,
      referenceFetch.status === "partial"
        ? `${referenceFetch.resolved} of ${referenceFetch.requested} selected references resolved. The comparison uses only the available published assets.`
        : referenceFetch.status === "unavailable"
          ? "No selected reference asset resolved. The analyzer must omit visual benchmark claims and retain only deterministic submitted-asset measurements."
          : "All selected published reference assets resolved.",
    ],
  };

  return { evidence, imageParts };
}

export function benchmarkEvidencePrompt(evidence: BenchmarkEvidence): string {
  const measurements = evidence.measurements?.length
    ? evidence.measurements
        .map(
          (item) =>
            `${item.sizePx}px active-pixel coverage ${item.activePixelCoveragePct}%, active bounds ${item.activeBoundsCoveragePct}%, edge density ${item.edgeDensityPct}%`
        )
        .join("; ")
    : "No deterministic subject-coverage measurement is claimed for screenshots.";
  const refs = evidence.references
    .map(
      (ref) =>
        `${ref.id}: ${ref.title} (${ref.platform}); role ${ref.role}; matched genres ${ref.matchedGenres.join(", ") || "none"} — ${ref.pattern}. ${ref.visiblePrinciple}`
    )
    .join("\n");

  return `EVIDENCE BENCHMARK:
- Target platform: ${evidence.platform}; asset type: ${evidence.assetKind}.
- Genre selection: ${evidence.genre.primary}; secondary ${evidence.genre.secondary.join(", ") || "none"}; source ${evidence.genre.selectionSource}; confidence ${evidence.genre.confidence}.
- Visible genre signals: ${evidence.genre.visibleSignals.join("; ") || "none confidently identified"}.
- Submitted-asset measurements: ${measurements}.
${
  evidence.smallSizeRetentionPct == null
    ? ""
    : `- Small-size active-pixel retention from 184px to 32px: ${evidence.smallSizeRetentionPct}%.`
}

ACTUAL PUBLISHED REFERENCE ASSETS PROVIDED AFTER THE USER ASSET:
${refs || "No references resolved; do not invent a benchmark comparison."}
- Reference fetch state: ${evidence.referenceFetch.status}; ${evidence.referenceFetch.resolved}/${evidence.referenceFetch.requested} resolved.

COMPARISON METHOD:
- Treat the uploaded asset as the review/edit target and published assets only as evidence.
- Compare only references supplied in this request. Never introduce a fixed universal trio.
- Identify shared principles and important differences in dominant mark, occupied area, silhouette, competing detail, action clarity, and target-size survival.
- Never claim a reference asset caused sales or success.
- Never say all successful games use a head crop. The broader pattern is one dominant recognizable mark; an emblem can satisfy it.
- measuredFacts may repeat only server measurements above.
- visualObservations must be visible comparisons supported by supplied images.
- inferences are directional conclusions that are plausible but not proven.
- If cropping cannot produce the recommended composition without awkward cuts or keeping too much secondary detail, set cropOnlyEnough to false and recommend a purpose-built composition.
- Recommendations may use composition principles from references, never their characters, emblems, colors, layout, or copyrighted art.`;
}

export function attachBenchmarkComparison(
  evidence: BenchmarkEvidence,
  comparison: Partial<IconBenchmarkComparison> | undefined
): BenchmarkEvidence {
  if (!comparison || evidence.references.length === 0) return evidence;

  return {
    ...evidence,
    comparison: {
      ...comparison,
      nearestReferenceIds: comparison.nearestReferenceIds || [],
      sharedPrinciples: comparison.sharedPrinciples || [],
      importantDifferences: comparison.importantDifferences || [],
      measuredFacts: comparison.measuredFacts || [],
      visualObservations: comparison.visualObservations || [],
      inferences: comparison.inferences || [],
    },
  };
}

export function genreClassifierPrompt(gameContext: string) {
  return `Classify the uploaded game store asset for benchmark selection.
Return ONLY JSON:
{
  "primary": "action",
  "secondary": [],
  "confidence": "medium",
  "visibleSignals": []
}

Allowed genres: action, survivor, roguelite, shooter, platformer, rpg, puzzle, strategy, simulation, racing, sports, horror, casual.
Choose one primary and at most three secondary genres. Use the uploaded pixels and this optional developer context: ${gameContext.trim() || "[none]"}.
visibleSignals must name only visible evidence or explicit developer context.
Do not critique the asset, score it, or name benchmark games.`;
}

export function sanitizeGenreClassification(
  value: unknown
): BenchmarkGenreClassification {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const primary =
    isBenchmarkGenre(record.primary)
      ? record.primary
      : "action";
  const secondary = Array.isArray(record.secondary)
    ? record.secondary
        .filter(
          (item): item is BenchmarkGenre =>
            typeof item === "string" &&
            (BENCHMARK_GENRES as readonly string[]).includes(item) &&
            item !== primary
        )
        .slice(0, 3)
    : [];
  const confidence =
    record.confidence === "low" ||
    record.confidence === "medium" ||
    record.confidence === "high"
      ? record.confidence
      : "low";
  const visibleSignals = Array.isArray(record.visibleSignals)
    ? record.visibleSignals
        .filter((item): item is string => typeof item === "string")
        .slice(0, 5)
    : [];

  return {
    primary,
    secondary,
    confidence,
    visibleSignals,
    selectionSource: "inferred",
  };
}
