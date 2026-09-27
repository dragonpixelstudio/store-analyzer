// Dragon Pixel Store Studio - shared definitions (client + server safe).
//
// The studio makes three kinds of store art:
//  - icons and Steam capsules: AI-generated from a proven composition recipe
//  - store screenshots: rendered in the browser from the developer's REAL
//    gameplay capture + caption. Screenshots are never AI-generated - stores
//    require them to show actual gameplay, and fabricating it would mislead
//    players.

export type StudioAssetType = "icon" | "capsule" | "thumbnail" | "screenshot";
export type StudioAiType = "icon" | "capsule" | "thumbnail";

export type StudioSpec = {
  label: string;
  width: number;
  height: number;
  /** Closest Gemini aspect ratio; output is then cropped to the exact size. */
  geminiAspect: string;
  sizeNote: string;
};

export const STUDIO_SPECS: Record<StudioAiType, StudioSpec> = {
  icon: {
    label: "Icon",
    width: 1024,
    height: 1024,
    geminiAspect: "1:1",
    sizeNote: "1024×1024 · App Store icon",
  },
  thumbnail: { label: "Video thumbnail", width: 1280, height: 720, geminiAspect: "16:9", sizeNote: "1280×720 · 16:9 video thumbnail" },
  capsule: {
    label: "Steam capsule",
    width: 920,
    height: 430,
    geminiAspect: "21:9",
    sizeNote: "920×430 · Steam header capsule",
  },
};

/* ------------------------------ art styles ------------------------------ */

export type StudioStyleId =
  | "cinematic"
  | "pixel"
  | "cartoon"
  | "painterly"
  | "neon"
  | "cozy"
  | "horror"
  | "anime"
  | "toy3d";

export type StudioStyle = {
  id: StudioStyleId;
  label: string;
  blurb: string;
  directive: string;
};

export const STUDIO_STYLES: StudioStyle[] = [
  { id: "cinematic", label: "Cinematic", blurb: "Dramatic light, detailed worlds and a clear focal point.", directive: "cinematic game key art: realistic materials, atmospheric depth, dramatic motivated light, intricate environment detail, strong foreground silhouette and polished film-like composition" },
  {
    id: "cartoon",
    label: "Bold cartoon",
    blurb: "Thick outlines, saturated color - the top-grossing mobile look.",
    directive:
      "bold mobile-game cartoon style: thick clean outlines, saturated colors, glossy cel shading, chunky readable shapes",
  },
  {
    id: "pixel",
    label: "Pixel art",
    blurb: "Crisp clusters and a tight palette for retro and indie games.",
    directive:
      "high-detail pixel art: crisp pixel clusters, limited palette, strong dark outline, no blur or anti-aliasing smear",
  },
  {
    id: "painterly",
    label: "Painterly fantasy",
    blurb: "Rich light and brushwork for RPGs and adventures.",
    directive:
      "painterly fantasy illustration: rich dramatic lighting, visible confident brushwork, deep color, epic atmosphere",
  },
  {
    id: "neon",
    label: "Neon sci-fi",
    blurb: "Dark scenes cut with glowing rim light.",
    directive:
      "neon sci-fi: dark background, glowing magenta and cyan rim light, sleek hard-surface shapes, high contrast",
  },
  {
    id: "cozy",
    label: "Cozy pastel",
    blurb: "Soft, warm and inviting for life sims and farming games.",
    directive:
      "cozy pastel storybook style: soft warm lighting, rounded shapes, gentle palette with one saturated accent, inviting",
  },
  {
    id: "horror",
    label: "Dark horror",
    blurb: "Heavy shadow, one accent light, pure dread.",
    directive:
      "dark horror: heavy shadows, desaturated palette with a single warm or red accent, unsettling mood, strong silhouette",
  },
  {
    id: "anime",
    label: "Anime",
    blurb: "Sharp line art and vivid cel shading.",
    directive:
      "clean anime style: sharp line art, vivid cel shading, dynamic pose, speed and energy",
  },
  {
    id: "toy3d",
    label: "Stylized 3D",
    blurb: "Toy-like 3D render with soft global light.",
    directive:
      "stylized 3D render: soft global illumination, toy-like smooth materials, clean shapes, vibrant colors",
  },
];

export function findStyle(id: string | undefined): StudioStyle {
  return STUDIO_STYLES.find((s) => s.id === id) ?? STUDIO_STYLES[0];
}

/* ------------------------- composition recipes ------------------------- */

export type StudioRecipe = {
  id: string;
  type: StudioAiType;
  /** Composition name shown on the card. */
  title: string;
  /** Why it works, in a few words. */
  pattern: string;
  style: StudioStyleId;
  /** Fictional game used to render the gallery example. */
  example: { game: string; pitch: string };
  /** The composition directive that "Generate this" applies to your game. */
  composition: string;
};

export const STUDIO_RECIPES: StudioRecipe[] = [
  { id: "thumbnail-space", type: "thumbnail", title: "An impossible journey", pattern: "Big world, one brave explorer", style: "cinematic", example: { game: "Skybreak", pitch: "a space salvage adventure around a shattered planet" }, composition: "A tiny astronaut foreground beside a yellow salvage ship against a huge broken planet. Bold clear title on the left, blue and amber cinematic lighting." },
  { id: "thumbnail-racing", type: "thumbnail", title: "Built for speed", pattern: "Motion, contrast and a clear hero", style: "neon", example: { game: "Neon Drift", pitch: "a futuristic drift racing game through rainy neon streets" }, composition: "Dramatic low angle of a red futuristic drift car, bright tire trails sweeping through a dark neon city. Large readable title upper-left." },
  { id: "thumbnail-cozy", type: "thumbnail", title: "A little world", pattern: "A warm, inviting moment", style: "cozy", example: { game: "Mossbound", pitch: "a cozy forest farming game with small moss spirits and giant harvests" }, composition: "A moss spirit beside an oversized pumpkin harvest with a treehouse garden behind it, golden light and a large readable title upper-left." },

  // ---- icons ----
  {
    id: "icon-mascot-face",
    type: "icon",
    title: "Mascot face",
    pattern: "One dominant character face",
    style: "cartoon",
    example: {
      game: "Chompers",
      pitch: "a chaotic party brawler where round, hungry monsters eat everything in the arena",
    },
    composition:
      "A single mascot character's face and shoulders fill about 80% of the square, facing the viewer with a big, readable expression. Simple radial-gradient background in one contrasting color. Nothing else in frame.",
  },
  {
    id: "icon-hero-action",
    type: "icon",
    title: "Hero in action",
    pattern: "Character + signature weapon",
    style: "neon",
    example: {
      game: "Vanta Protocol",
      pitch: "a cyberpunk stealth shooter where a hooded hacker infiltrates corporate towers",
    },
    composition:
      "Tight bust crop of the hero at a three-quarter angle holding their signature weapon diagonally across the frame. Head and weapon are the only two shapes; strong rim light separates them from a dark, simple background. Subject fills 75-80% of the square.",
  },
  {
    id: "icon-emblem",
    type: "icon",
    title: "Iconic emblem",
    pattern: "One symbolic object",
    style: "painterly",
    example: {
      game: "Emberkeep",
      pitch: "a roguelite dungeon crawler about a cursed flame that must never go out",
    },
    composition:
      "One iconic object as an emblem - the game's key item - centered and large with a bold silhouette and a dramatic light source glowing from within. No character. Plain dark vignette background.",
  },
  {
    id: "icon-creature",
    type: "icon",
    title: "Threat face",
    pattern: "Menacing creature close-up",
    style: "horror",
    example: {
      game: "Nighttide",
      pitch: "survival horror in a flooded fishing village haunted by something in the water",
    },
    composition:
      "Extreme close-up of a single menacing creature's face emerging from darkness, one glowing eye as the focal accent. Most of the frame dark, silhouette still readable at tiny size.",
  },
  {
    id: "icon-cozy-companion",
    type: "icon",
    title: "Cute companion",
    pattern: "Friendly creature, soft read",
    style: "cozy",
    example: {
      game: "Mossbound",
      pitch: "a cozy farming life sim where you tend a forest garden with little moss spirits",
    },
    composition:
      "One round, friendly creature companion centered and large, big eyes, holding a tiny sprout. Soft warm background with a simple circular halo. Rounded shapes only.",
  },
  {
    id: "icon-pixel-hero",
    type: "icon",
    title: "Pixel hero",
    pattern: "Crisp character bust",
    style: "pixel",
    example: {
      game: "Tiny Tactics",
      pitch: "a turn-based tactics game where a small knight leads a band of misfits",
    },
    composition:
      "Bust of the hero knight with helmet and raised sword, centered and large on a flat two-tone background. Chunky readable shapes and a strong dark outline.",
  },
  // ---- Steam capsules ----
  {
    id: "capsule-logo-hero",
    type: "capsule",
    title: "Logo + hero",
    pattern: "Title left, hero right",
    style: "neon",
    example: {
      game: "Vanta Protocol",
      pitch: "a cyberpunk stealth shooter where a hooded hacker infiltrates corporate towers",
    },
    composition:
      "Wide banner. The title logo sits in the left 45%, large and fully legible. The hero occupies the right side in a dynamic pose, overlapping slightly toward the center. The environment stays darker behind the title for contrast.",
  },
  {
    id: "capsule-centered-epic",
    type: "capsule",
    title: "Epic centered",
    pattern: "Big title over key art",
    style: "painterly",
    example: {
      game: "Emberkeep",
      pitch: "a roguelite dungeon crawler about a cursed flame that must never go out",
    },
    composition:
      "Wide banner with a large centered title logo over a sweeping scene: the hero small in silhouette facing a huge glowing threat behind the title. Strong depth, light from the center.",
  },
  {
    id: "capsule-versus",
    type: "capsule",
    title: "Versus",
    pattern: "Hero vs rival face-off",
    style: "anime",
    example: {
      game: "Blade Rivals",
      pitch: "a fast one-on-one anime sword fighting game",
    },
    composition:
      "Two fighters facing each other from the left and right edges, weapons crossing in the center with a spark of impact. Title logo across the top center. Diagonal speed lines behind them.",
  },
  {
    id: "capsule-cozy-world",
    type: "capsule",
    title: "Inviting world",
    pattern: "Scene first, title on top",
    style: "cozy",
    example: {
      game: "Mossbound",
      pitch: "a cozy farming life sim where you tend a forest garden with little moss spirits",
    },
    composition:
      "A wide, inviting scene - garden, cottage, soft golden light - with small characters doing an activity. Title logo top-center over a clear sky area. Warm, calm, readable.",
  },
  {
    id: "capsule-horde",
    type: "capsule",
    title: "Against the horde",
    pattern: "One hero, endless enemies",
    style: "pixel",
    example: {
      game: "Swarmfall",
      pitch: "a bullet-heaven survivor game where one hero holds off an endless swarm",
    },
    composition:
      "The hero in the lower center, lit by their own attack effects, surrounded by a dense ring of enemies filling both sides. Title logo bold across the top third. Instantly reads as one versus many.",
  },
  {
    id: "capsule-dread",
    type: "capsule",
    title: "Dread",
    pattern: "Mood and mystery",
    style: "horror",
    example: {
      game: "Nighttide",
      pitch: "survival horror in a flooded fishing village haunted by something in the water",
    },
    composition:
      "A lone figure with a lantern in the lower left, looking toward a dark shape rising from the water on the right. Title logo in the upper left in a weathered style. Mostly dark; the lantern is the single warm light.",
  },
];

export function findRecipe(id: string | undefined): StudioRecipe | undefined {
  return STUDIO_RECIPES.find((r) => r.id === id);
}

export const galleryImagePath = (recipeId: string) => `/gallery/${recipeId}.webp`;

/* ------------------------------ edit chips ------------------------------ */

export const EDIT_CHIPS: Record<StudioAiType, string[]> = {
  thumbnail: ["Make the title bigger", "Bring the subject closer", "Simplify the background", "More contrast"],
  icon: [
    "Make the subject bigger",
    "Simplify the background",
    "Stronger outline",
    "More contrast",
    "Warmer colors",
    "Cooler colors",
  ],
  capsule: [
    "Make the title bigger",
    "Bring the hero closer",
    "Darker behind the title",
    "More action",
    "Brighter colors",
    "Fix the title spelling",
  ],
};

/* ------------------------ screenshot templates ------------------------ */

export type ShotOrientation = "landscape" | "portrait";
export type ShotLayout = "headline-top" | "side-panel" | "caption-top" | "caption-bottom";

export type ScreenshotTemplate = {
  id: string;
  title: string;
  pattern: string;
  orientation: ShotOrientation;
  layout: ShotLayout;
};

export const SCREENSHOT_TEMPLATES: ScreenshotTemplate[] = [
  {
    id: "shot-headline-top",
    title: "Headline bar",
    pattern: "One promise, then proof",
    orientation: "landscape",
    layout: "headline-top",
  },
  {
    id: "shot-side-panel",
    title: "Feature panel",
    pattern: "Caption beside the action",
    orientation: "landscape",
    layout: "side-panel",
  },
  {
    id: "shot-caption-top",
    title: "Phone caption",
    pattern: "Big caption, framed gameplay",
    orientation: "portrait",
    layout: "caption-top",
  },
  {
    id: "shot-caption-bottom",
    title: "Full bleed",
    pattern: "Gameplay first, caption band",
    orientation: "portrait",
    layout: "caption-bottom",
  },
];

export type ShotSize = { id: string; label: string; width: number; height: number };

export const SHOT_SIZES: Record<ShotOrientation, ShotSize[]> = {
  landscape: [{ id: "land-1080", label: "1920×1080 · Google Play", width: 1920, height: 1080 }, { id: "steam-1080", label: "1920×1080 · Steam (gameplay only)", width: 1920, height: 1080 }],
  portrait: [
    { id: "port-play", label: "1080×1920 · Google Play", width: 1080, height: 1920 },
    { id: "port-appstore", label: "1320×2868 · App Store 6.9″", width: 1320, height: 2868 },
  ],
};

export type ShotPalette = { id: string; label: string; from: string; to: string; accent: string };

export const SHOT_PALETTES: ShotPalette[] = [
  { id: "neon", label: "Neon", from: "#140a2e", to: "#05070f", accent: "#18e0ff" },
  { id: "ember", label: "Ember", from: "#2e0f06", to: "#0b0503", accent: "#ffb02e" },
  { id: "toxic", label: "Toxic", from: "#0a2410", to: "#040a05", accent: "#69ff00" },
  { id: "royal", label: "Royal", from: "#1b1447", to: "#080620", accent: "#ffd23d" },
  { id: "blush", label: "Blush", from: "#3a0c26", to: "#12040c", accent: "#ff3db4" },
];

export const SHOT_DEMO_CAPTURES = [
  "/gallery/demo-gameplay-1.webp",
  "/gallery/demo-gameplay-2.webp",
];
