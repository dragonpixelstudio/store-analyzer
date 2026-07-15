const MODEL_IMAGE = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type AssetType = "icon" | "screenshot" | "capsule" | "feature-graphic";

export type FixRequest = {
  assetType: AssetType;
  platform: "steam" | "google-play" | "app-store";
  imageBase64: string;
  mimeType: string;
  iconReadTestBase64?: string;
  iconReadTestMimeType?: string;
  analysisNotes?: string;
  userInstruction?: string;
  /** 0-based variant index; changes edit intensity so variants differ meaningfully. */
  variantIndex?: number;
  /** Analyzer launch score (0-100). Steers designer judgment: strong assets get refinement, weak assets get bolder recomposition. */
  assetScore?: number;
};

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(face|faces|selfie|portrait|headshot)\b/i,
  /\b(person|people|man|woman|boy|girl|child|celebrity|actor|actress)\b/i,
  /\b(deepfake|face\s*swap|likeness|look\s*like\s+\w+)\b/i,
  /\b(nude|nsfw|sexual|gore)\b/i,
];

export function violatesGuardrails(text?: string): string | null {
  if (!text) return null;
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return "This tool improves game store assets. It cannot generate people, faces, likenesses, NSFW content, or gore. Rephrase around your game's logo, gameplay, UI, environment art, and store presentation.";
    }
  }

  return null;
}

const EDIT_BRIEFS: Record<AssetType, string> = {
  icon: `Improve this game icon for store shelf performance:
- One dominant focal element with a bold silhouette.
- Must read clearly at 32px.
- Raise subject/background contrast and reduce clutter.
- Remove tiny text unless the wordmark is the whole icon.
`,
  screenshot: `Improve this game store screenshot for conversion:
- One gameplay message per image.
- Make the player action, reward, threat, or objective clearer.
- Add or improve a short high-contrast headline only if it helps.
- Crop dead space and remove distracting UI clutter.
- Never fabricate gameplay that is not present in the input.`,
  capsule: `Improve this Steam capsule:
- Logo readable first, key art second.
- Test readability at small library sizes and cropped center strips.
- Simplify background where it competes with the title.
`,
  "feature-graphic": `Improve this feature graphic:
- Make the game title/logo readable instantly.
- Use one clear hero visual.
- Increase contrast against light and dark store surfaces.
`,
};

const PRESERVE_RULES: Record<AssetType, string> = {
  icon: `PRESERVE:
- Keep the same core subject(s), same collision/setup idea, same palette family, and same art style.
- Keep the same main semantic read of the icon.
- Do not replace the main subject with a different object, character, or symbol.
- Do not add title text, logos, badges, or UI.`,
  screenshot: `PRESERVE:
- Keep the same gameplay scene and the same real game content.
- Do not invent new mechanics, fake UI, or new game objects not supported by the original.`,
  capsule: `PRESERVE:
- Keep the same game identity, logo family, and core key-art subject.
- Improve composition and readability without changing the game itself.`,
  "feature-graphic": `PRESERVE:
- Keep the same game identity, logo family, and hero subject.
- Improve hierarchy and clarity without turning it into a different concept.`,
};

const PLATFORM_NOTES: Record<FixRequest["platform"], string> = {
  steam: "Target platform: Steam. Desktop-first viewing, capsule sizes are small in library grids.",
  "google-play": "Target platform: Google Play. Mobile-first, icon and feature graphic compete in dense surfaces.",
  "app-store": "Target platform: Apple App Store. Mobile-first, screenshots are the main conversion surface.",
};

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type EditMode = "conservative_polish" | "concept_upgrade";
type EditStrength = "subtle" | "clear" | "strong";

type ParsedEditContract = {
  mode: EditMode;
  editStrength: EditStrength;
  preserve: string[];
  edits: string[];
  forbidden: string[];
  successChecks: string[];
  variant1Mode?: string;
  variant2Mode?: string;
};

function stripPlanPrefix(line: string, keyword: string) {
  const colon = line.indexOf(":");
  if (colon >= 0 && line.slice(0, colon).toLowerCase().includes(keyword)) {
    return line.slice(colon + 1).trim();
  }
  return line.replace(new RegExp(`^${keyword}\\b[:\\s-]*`, "i"), "").trim();
}

function parseEditContract(
  analysisNotes?: string,
  userInstruction?: string
): ParsedEditContract {
  const contract: ParsedEditContract = {
    mode: "conservative_polish",
    editStrength: "clear",
    preserve: [],
    edits: [],
    forbidden: [],
    successChecks: [],
  };

  const lines = (analysisNotes ?? "")
    .split(/\r?\n/)
    .flatMap((chunk) => {
      const cleaned = chunk.replace(/^[-*\d.\s]+/, "").trim();
      if (cleaned.length > 150 && cleaned.includes(". ")) {
        return cleaned
          .split(/(?<=\.)\s+/)
          .map((part) => part.replace(/^[-*\d.\s]+/, "").trim());
      }
      return [cleaned];
    })
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length > 3);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("mode")) {
      if (line.includes("concept_upgrade")) contract.mode = "concept_upgrade";
      if (line.includes("conservative_polish")) contract.mode = "conservative_polish";
      continue;
    }
    if (lower.startsWith("edit strength")) {
      if (lower.includes("strong")) contract.editStrength = "strong";
      else if (lower.includes("subtle")) contract.editStrength = "subtle";
      else if (lower.includes("clear")) contract.editStrength = "clear";
      continue;
    }
    if (lower.startsWith("variant 1 mode")) {
      contract.variant1Mode = stripPlanPrefix(line, "variant 1 mode");
      continue;
    }
    if (lower.startsWith("variant 2 mode")) {
      contract.variant2Mode = stripPlanPrefix(line, "variant 2 mode");
      continue;
    }
    if (lower.startsWith("success check")) {
      const value = stripPlanPrefix(line, "success check");
      if (value) contract.successChecks.push(value);
      continue;
    }
    if (lower.startsWith("preserve")) {
      const value = stripPlanPrefix(line, "preserve");
      if (value) contract.preserve.push(value);
      continue;
    }
    if (lower.startsWith("edit")) {
      const value = stripPlanPrefix(line, "edit");
      if (value) contract.edits.push(value);
      continue;
    }
    if (lower.startsWith("do not") || lower.startsWith("forbidden") || lower.startsWith("never")) {
      const value = line
        .replace(/^do\s+not[:\s-]*/i, "")
        .replace(/^forbidden(?:\s+changes?)?[:\s-]*/i, "")
        .replace(/^never[:\s-]*/i, "")
        .trim();
      if (value) contract.forbidden.push(value);
      continue;
    }
    if (/^(keep|same|preserve|maintain)\b/i.test(line)) {
      contract.preserve.push(line);
      continue;
    }
    if (/^(avoid|do not|never)\b/i.test(line)) {
      contract.forbidden.push(line.replace(/^(avoid|do not|never)\b[:\s-]*/i, ""));
      continue;
    }
    contract.edits.push(line);
  }

  const steer = userInstruction?.trim();
  if (steer) contract.edits.push(`User steer: ${steer}`);

  contract.preserve = Array.from(new Set(contract.preserve)).slice(0, 8);
  contract.edits = Array.from(new Set(contract.edits)).slice(0, 8);
  contract.forbidden = Array.from(new Set(contract.forbidden)).slice(0, 10);
  contract.successChecks = Array.from(new Set(contract.successChecks)).slice(0, 8);

  return contract;
}

function formatList(items: string[], fallback: string[]) {
  const source = items.length > 0 ? items : fallback;
  return source.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

async function callGeminiImage(parts: GeminiPart[], apiKey: string) {
  const res = await fetch(`${API_BASE}/${MODEL_IMAGE}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini image API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data: unknown = await res.json();
  const candidates = isRecord(data) && Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0];
  const content = isRecord(first) && isRecord(first.content) ? first.content : null;
  const outParts = content && Array.isArray(content.parts) ? content.parts : [];
  const imagePart = outParts.find((part) => {
    if (!isRecord(part)) return false;
    return isRecord(part.inlineData) || isRecord(part.inline_data);
  });

  if (!isRecord(imagePart)) {
    throw new Error("Gemini returned no image data");
  }

  const inline =
    (isRecord(imagePart.inlineData) && imagePart.inlineData) ||
    (isRecord(imagePart.inline_data) && imagePart.inline_data);

  if (!inline || typeof inline.data !== "string") {
    throw new Error("Gemini returned no image data");
  }

  return {
    base64: inline.data,
    mimeType:
      (typeof inline.mimeType === "string" && inline.mimeType) ||
      (typeof inline.mime_type === "string" && inline.mime_type) ||
      "image/png",
  };
}

export async function fixAsset(req: FixRequest, apiKey: string) {
  const guard = violatesGuardrails(req.userInstruction);
  if (guard) {
    throw Object.assign(new Error(guard), { code: "GUARDRAIL" });
  }

  const contract = parseEditContract(req.analysisNotes, req.userInstruction);
  const preserveList = formatList(contract.preserve, [
    "Same source image identity, subject family, palette family, and art style.",
    "Same composition intent and main subject relationship.",
    "The result should be immediately recognizable as a polished version of the uploaded asset.",
  ]);
  const editList = formatList(contract.edits, [
    "Strengthen the focal element so it dominates the composition.",
    "Raise subject/background contrast noticeably.",
    "Reduce visual clutter competing with the focal element.",
  ]);
  const forbiddenList = formatList(contract.forbidden, [
    "Add unrelated objects, characters, faces, title text, badges, ratings, or fake UI.",
    "Change the gameplay concept, palette family, art style, or camera/perspective.",
    "Replace the main subject instead of improving the uploaded asset.",
  ]);
  const successList = formatList(contract.successChecks, [
    "The edited version reads more clearly at the intended store size than the original.",
    "The edited version remains obviously the same asset concept.",
    "The improvement is visible immediately, not subtle to the point of irrelevance.",
  ]);
  const hasIconReadTest = req.assetType === "icon" && !!req.iconReadTestBase64;

  // Designer judgment: the generation acts as a senior game marketing artist,
  // not a filter. A strong asset earns surgical refinement; a weak asset earns
  // a bolder recomposition of the SAME concept. The analyzer score steers this
  // so the model does not over-edit good work or under-edit weak work.
  const score = typeof req.assetScore === "number" ? req.assetScore : null;
  const antiGeneric = `CRAFT BAR: You are a top-tier game marketing artist, not a filter. FORBIDDEN ADDITIONS - never introduce anything from this list that is not already in the source image: light beams, lens flares, god rays, added glow, halos, sparkles, particles, dust, fog, haze, smoke, vignettes, gradient washes, bloom, or bokeh. These read as cheap AI polish and are scored as LOW commercial quality by the reviewer. Improvement must come from scale, crop, silhouette, simplification, and edge contrast - not from adding effects.`;

  const designJudgment =
    score === null
      ? `DESIGN JUDGMENT: First assess the asset like a senior game marketing artist. If it already works and only needs polish, make surgical refinements. If its shelf read is weak, recompose more boldly within the same concept. ${antiGeneric}`
      : score >= 70
        ? `DESIGN JUDGMENT: The analyzer scored this asset ${score}/100 - it already works. Act as a senior artist doing a refinement pass: purposeful improvements only (focal scale, crop, contrast, cleanup). Keep the composition; elevate the craft. Do not redesign what is not broken. ${antiGeneric}`
        : `DESIGN JUDGMENT: The analyzer scored this asset ${score}/100 - the shelf read is weak. Act as a senior artist doing a concept-strengthening pass: recompose boldly using the SAME subjects, palette, and idea. Bigger focal commitment, harder edge contrast where the hero meets the background, cleaner staging, stronger silhouette. Same concept, executed like a top-grossing title. ${antiGeneric}`;


  const variantStyle =
    (req.variantIndex ?? 0) === 0
      ? `VARIANT STYLE: ${contract.variant1Mode ?? "Faithful improvement: preserve layout closely, enlarge the focal event moderately, reduce clutter slightly, and keep most original energy."} Preserve 85-90% of the original concept. The difference must be visible through cleaner crop, scale, silhouette, contrast, and detail reduction; do not settle for a near-copy glow tweak.`
      : (req.variantIndex ?? 0) === 1
        ? `VARIANT STYLE: Designer pass. ${designJudgment} Every mandatory edit still applies. The result must be clearly distinct from a light polish of the original.`
        : "VARIANT STYLE: Alternative designer take. Offer a different composition emphasis on the same subjects and palette.";

  const strictOutput =
    req.assetType === "icon"
      ? `ICON OUTPUT REQUIREMENTS:
- Output a square game icon composition.
- Do not add title text, subtitles, logos, ratings, badges, or UI labels.
- The primary focal subject must be visibly larger than in the input if the brief mentions crop, scale, small-size readability, or silhouette.
- The primary event should occupy roughly 72-80% of the square canvas when the brief calls for stronger shelf readability.
- Keep the icon to 2 primary subjects max unless the source already has a different locked concept.
- Remove or simplify thin trails, tiny sparks, excess particles, and background streaks that compete with the focal subject.
- Shorten trails by roughly 20-35% when trails compete with the focal read.
- Keep sparks/accents to 3-5 major readable accents when sparks are part of the source.
- Do not merely add glow or brightness. Shape clarity and silhouette must improve.
- The result should still read as the same icon, but cleaner and faster at 32px.`
      : req.assetType === "screenshot"
        ? `SCREENSHOT OUTPUT REQUIREMENTS:
- Preserve real gameplay content.
- Improve composition, contrast, text hierarchy, and focal clarity.
- Do not invent fake gameplay mechanics, fake UI, awards, ratings, or platform badges.
- If text is added or changed, it must be short, readable, and must not cover the key gameplay action.`
        : `STORE CREATIVE OUTPUT REQUIREMENTS:
- Improve focal hierarchy, readability, and composition.
- Do not invent awards, ratings, review quotes, platform badges, or misleading claims.
- The result must be clearly more store-ready than the input.`;

  const prompt = [
    "Edit the provided image directly. This is controlled asset editing, not reimagining.",
    score !== null
      ? `SUCCESS TARGET: the input image scored ${score}/100 with an independent store-conversion reviewer. Your output will be re-scored by the same reviewer with the same rubric and MUST exceed ${score}/100. An output that scores lower is a failed, unpaid generation.`
      : "",
    `EDIT MODE: ${contract.mode}.`,
    `EDIT STRENGTH: ${contract.editStrength}. Paid fixes default to clear visible improvement, not subtle change.`,
    PRESERVE_RULES[req.assetType],
    `MANDATORY PRESERVATION - source locks, not edit suggestions:\n${preserveList}`,
    `REQUIRED VISIBLE EDITS - apply every one:\n${editList}`,
    `FORBIDDEN CHANGES - hard boundaries:\n${forbiddenList}`,
    `SUCCESS CHECKS - verify before output:\n${successList}`,
    variantStyle,
    strictOutput,
    `REVIEW RUBRIC - the output is re-scored by the same independent reviewer that scored the input, and an output that scores BELOW the input is a failed generation:
1. 32px shelf readability (heaviest weight): every element you keep must still read at 32px. Anything too thin, faint, or small to survive must be removed or merged into a larger shape - never left as noise.
2. One dominant focal subject: a single element must clearly dominate the frame. Several equal-weight elements lower the score.
3. Figure-ground separation: clean, hard edges between subject and background. Raise contrast AT the silhouette boundary; do not wrap the subject in new glow.
4. Genre and mood signal: make the existing subjects read faster; never swap them for different ones.
5. Commercial polish: deliberate, confident craft. Added effects (glow, beams, flares, particles, haze) are graded as LOW polish, not high.
NET RULE: removal and enlargement beat addition. When unsure, remove or enlarge - never add.`,
    `DRAGON PIXEL HOUSE EDIT POLICY:
- Keep the game's identity. Do not randomly reinvent it.
- Visible improvements must come from scale, crop, silhouette, simplification, edge separation, and contrast.
- Small-size readability comes before decorative polish.
- Composition and silhouette beat glow, particles, and extra effects.
- If an edit mentions a core, highlight, spark, or glow, apply the improvement to the complete readable subject shape/group, not only that internal detail.`,
    req.assetType === "icon"
      ? `ICON EDITING ALGORITHM:
1. First identify the complete primary subject group in Image A.
2. Use Image B as the 32px shelf-readability failure test. Improve what becomes unclear in Image B while preserving Image A's identity.
3. Preserve the subject group, its relationship/setup, and its palette family.
4. Apply crop/scale to the full readable group, not just a white core, glow, spark, or tiny highlight.
5. Remove or merge weak micro-details that fail at 32px.
6. Increase edge/rim separation around the main readable shapes.
7. Self-check against Image A and Image B: same icon concept, visibly clearer 32px read.`
      : "",
    PLATFORM_NOTES[req.platform],
    EDIT_BRIEFS[req.assetType],
    `CONSTRAINTS:
- These constraints define HOW to edit. They never excuse skipping the required visible edits.
- Preserve the same game identity, same art style, and same subject family.
- Prefer scale, crop, cleanup, clutter reduction, edge separation, and stronger silhouette over invention.
- If any edit instruction suggests a conceptual redesign while mode is conservative_polish, convert it into the closest safe improvement on the existing image instead.
- Never introduce human faces, portraits, or recognizable people not already present.
- Never add title text, logos, ratings, awards, badges, fake UI, fake endorsements, or misleading claims.
- Never replace the main icon subject with a different object unless the user explicitly asks for that.`,
    "SUCCESS CONDITION: the result should look like the original asset, but cleaner, clearer, tighter, and more readable.",
    "FAILURE CONDITION: the result changes the concept, adds unrelated objects, or drifts away from the original image identity.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts: GeminiPart[] = [
    {
      text:
        req.assetType === "icon"
          ? `Image A is the original full-size icon edit target.${
              hasIconReadTest
                ? " Image B is the same icon downscaled to 32px for shelf-readability. Preserve Image A's identity and improve Image B's legibility."
                : ""
            }\n\n${prompt}`
          : prompt,
    },
    { inline_data: { mime_type: req.mimeType, data: req.imageBase64 } },
  ];

  if (hasIconReadTest && req.iconReadTestBase64) {
    parts.push(
      { text: "Image B: 32px downscaled store-readability test. Do not edit this image directly; use it to understand what fails at icon size." },
      {
        inline_data: {
          mime_type: req.iconReadTestMimeType ?? "image/png",
          data: req.iconReadTestBase64,
        },
      }
    );
  }

  return callGeminiImage(parts, apiKey);
}
