const MODEL_IMAGE = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type AssetType = "icon" | "screenshot" | "capsule" | "feature-graphic";

export type FixRequest = {
  assetType: AssetType;
  platform: "steam" | "google-play" | "app-store";
  imageBase64: string;
  mimeType: string;
  analysisNotes?: string;
  userInstruction?: string;
  /** 0-based variant index; changes edit intensity so variants differ meaningfully. */
  variantIndex?: number;
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

  // Build the mandatory edit list from the analyzer's revision brief lines
  // plus any user steer. These are numbered and non-optional: this is what
  // makes the output visibly better than the input instead of a near-copy.
  const briefLines = (req.analysisNotes ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length > 3)
    .slice(0, 8);
  if (req.userInstruction?.trim()) {
    briefLines.push(req.userInstruction.trim());
  }
  const editList =
    briefLines.length > 0
      ? briefLines.map((line, i) => `${i + 1}. ${line}`).join("\n")
      : `1. Strengthen the focal element so it dominates the composition.\n2. Raise subject/background contrast noticeably.\n3. Reduce visual clutter competing with the focal element.`;

  const intensity =
    (req.variantIndex ?? 0) === 0
      ? `VARIANT STYLE: Faithful pass. Apply every mandatory edit precisely and cleanly, changing nothing beyond what the edits require.`
      : (req.variantIndex ?? 0) === 1
        ? `VARIANT STYLE: Bold pass. Apply every mandatory edit and push them further: larger focal scale, stronger contrast and rim light, more aggressive clutter removal. This variant should look clearly more dramatic than a faithful pass.`
        : `VARIANT STYLE: Alternative pass. Apply every mandatory edit, and additionally rebalance the composition (crop, focal placement, or background simplification) for a distinctly different but on-brand take.`;

  const prompt = [
    `You are editing the provided game store asset image. This is an IMAGE EDIT task: the output must be a visibly improved version of the input. A near-copy of the input is a failed result.`,
    `MANDATORY EDITS - apply every one of these. Each edit must be clearly visible in a side-by-side comparison with the input:\n${editList}`,
    intensity,
    PLATFORM_NOTES[req.platform],
    EDIT_BRIEFS[req.assetType],
    `CONSTRAINTS (these scope HOW to edit; they never excuse skipping a mandatory edit):
- Keep the same subject, art style, and palette family so the game stays recognizable.
- Never introduce human faces, portraits, or recognizable people not already present.
- Never add sexual, gory, or shock content, and never add awards, scores, or endorsements.
- If a constraint appears to conflict with a mandatory edit, apply the edit in the way that keeps the subject recognizable.`,
    `SELF-CHECK before output: compare your result against the input. If any mandatory edit is not clearly visible, redo it. Then output the improved image only.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return callGeminiImage(
    [
      { text: prompt },
      { inline_data: { mime_type: req.mimeType, data: req.imageBase64 } },
    ],
    apiKey
  );
}
