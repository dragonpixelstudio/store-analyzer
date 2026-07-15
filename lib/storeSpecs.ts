// Store dimension database: known asset sizes for Steam, Google Play, and the
// App Store. Dimensions identify the asset - 920×430 is exactly a 2x Steam
// header capsule, not a Google Play feature graphic - so classification, spec
// warnings, and the platform context fed to generation all key off this
// instead of loose aspect-ratio guessing.

export type StoreRole =
  | "icon"
  | "screenshot"
  | "featureGraphic"
  | "steamCapsule"
  | "keyArt";

export type StorePlatform = "steam" | "google-play" | "app-store";

export type StoreSpec = {
  name: string;
  role: StoreRole;
  platform: StorePlatform;
  baseW: number;
  baseH: number;
  /**
   * Aspect-ratio tolerance for fuzzy matching. 0 disables ratio matching for
   * specs whose ratio collides with common screenshot ratios (Steam main
   * capsule at 1.745 sits too close to 16:9 = 1.778) - those match on exact
   * multiples only.
   */
  ratioTol: number;
};

export const STORE_SPECS: StoreSpec[] = [
  { name: "Steam header capsule", role: "steamCapsule", platform: "steam", baseW: 460, baseH: 215, ratioTol: 0.035 },
  { name: "Steam small capsule", role: "steamCapsule", platform: "steam", baseW: 231, baseH: 87, ratioTol: 0.035 },
  { name: "Steam main capsule", role: "steamCapsule", platform: "steam", baseW: 616, baseH: 353, ratioTol: 0 },
  { name: "Steam vertical capsule", role: "steamCapsule", platform: "steam", baseW: 374, baseH: 448, ratioTol: 0.03 },
  { name: "Steam library capsule", role: "steamCapsule", platform: "steam", baseW: 600, baseH: 900, ratioTol: 0.03 },
  { name: "Google Play icon", role: "icon", platform: "google-play", baseW: 512, baseH: 512, ratioTol: 0.05 },
  { name: "App Store icon", role: "icon", platform: "app-store", baseW: 1024, baseH: 1024, ratioTol: 0.05 },
  { name: "Google Play feature graphic", role: "featureGraphic", platform: "google-play", baseW: 1024, baseH: 500, ratioTol: 0.035 },
];

export type SpecMatch = {
  spec: StoreSpec;
  /** exact = dimensions are the spec size or a clean multiple; ratio = aspect matches. */
  confidence: "exact" | "ratio";
  /** Scale relative to the base size (1 = native, 2 = double, 0.5 = half). */
  scale: number;
};

export function identifyAsset(widthPx: number, heightPx: number): SpecMatch | null {
  if (!widthPx || !heightPx) return null;

  const exacts: SpecMatch[] = [];
  const ratios: SpecMatch[] = [];
  const ar = widthPx / heightPx;

  for (const spec of STORE_SPECS) {
    const scale = widthPx / spec.baseW;
    if (scale >= 0.25 && scale <= 8) {
      const expectedH = spec.baseH * scale;
      if (Math.abs(heightPx - expectedH) <= Math.max(2, scale)) {
        exacts.push({ spec, confidence: "exact", scale });
        continue;
      }
    }
    if (spec.ratioTol > 0 && Math.abs(ar - spec.baseW / spec.baseH) <= spec.ratioTol) {
      ratios.push({ spec, confidence: "ratio", scale });
    }
  }

  // Prefer the exact match closest to native scale (1024×1024 is the App
  // Store icon at 1x, not the Play icon at 2x).
  if (exacts.length > 0) {
    exacts.sort((a, b) => Math.abs(Math.log(a.scale)) - Math.abs(Math.log(b.scale)));
    return exacts[0];
  }
  if (ratios.length > 0) {
    ratios.sort(
      (a, b) =>
        Math.abs(ar - a.spec.baseW / a.spec.baseH) -
        Math.abs(ar - b.spec.baseW / b.spec.baseH)
    );
    return ratios[0];
  }
  return null;
}

export const ROLE_LABEL: Record<StoreRole, string> = {
  icon: "Icon",
  screenshot: "Screenshot",
  featureGraphic: "Feature graphic",
  steamCapsule: "Steam capsule",
  keyArt: "Key art",
};

/**
 * Platform inferred from what was actually uploaded: any Steam-sized asset
 * means Steam; otherwise Play/App Store spec matches vote, defaulting to
 * Google Play for mobile-shaped sets.
 */
export function inferPlatform(
  dims: { widthPx: number; heightPx: number }[]
): StorePlatform | null {
  const matches = dims
    .map((d) => identifyAsset(d.widthPx, d.heightPx))
    .filter((m): m is SpecMatch => m !== null);
  if (matches.some((m) => m.spec.platform === "steam")) return "steam";
  if (matches.some((m) => m.spec.platform === "google-play")) return "google-play";
  if (matches.some((m) => m.spec.platform === "app-store")) return "app-store";
  return null;
}
