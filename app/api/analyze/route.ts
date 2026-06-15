import { GoogleGenAI, type Part } from "@google/genai";
import { ipRatelimit, globalRatelimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per image
const MAX_IMAGE_PIXELS = 12_000_000;
const MAX_SCREENSHOTS = 3;
const ALLOWED_ORIGINS = new Set([
  "https://launch.dragonpixelstudio.com",
  "https://www.dragonpixelstudio.com",
  "https://dragonpixelstudio.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

type CommercialPolish = "low" | "medium" | "high";

type Observations = {
  shelfTest?: {
    visibleElements?: string[];
    lostElements?: string[];
    dominantElement?: string;
    focalPointClear?: boolean;
    playerOrMainSubjectVisible?: boolean;
    smallSizeRisk?: boolean;
  };
  clickTest?: {
    curiositySignals?: string[];
    rewardSignals?: string[];
    dangerSignals?: string[];
    urgencySignals?: string[];
    clickBlockers?: string[];
  };
  gameplayCommunication?: {
    understoodIn3Seconds?: string[];
    unclearIn3Seconds?: string[];
    objectiveClear?: boolean;
    playerActionClear?: boolean;
    rewardClear?: boolean;
    failureStateClear?: boolean;
  };
  emotionalSignal?: {
    currentSignals?: string[];
    missingSignals?: string[];
  };
  polish?: {
    strengths?: string[];
    weaknesses?: string[];
    commercialPolish?: CommercialPolish;
  };
  consistency?: {
    iconMatchesScreenshots?: boolean;
    notes?: string;
  };
  assetReview?: {
    assetName: string;
    mainObservation: string;
    mainIssue: string;
    bestFix: string;
  }[];
  whatWorks?: string[];
  whatHurtsConversion?: string[];
  dragonPixelFixes?: string[];
  marketingRiskSummary?: string;
  finalCall?: string;
};

type JsonBody =
  | {
      error: string;
    }
  | {
      report: string;
      observations: Observations;
      calculated: ReturnType<typeof calculateDragonPixelScores>;
      verdict: string;
    };

function jsonResponse(body: JsonBody, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Vary", "Origin");

  return Response.json(body, {
    ...init,
    headers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  return items.length > 0 ? items : undefined;
}

function commercialPolishValue(value: unknown): CommercialPolish {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function assetReviewValue(value: unknown): Observations["assetReview"] {
  if (!Array.isArray(value)) return undefined;

  const assets = value
    .filter(isRecord)
    .map((asset) => ({
      assetName: stringValue(asset.assetName) || "Uploaded asset",
      mainObservation: stringValue(asset.mainObservation) || "",
      mainIssue: stringValue(asset.mainIssue) || "",
      bestFix: stringValue(asset.bestFix) || "",
    }))
    .slice(0, MAX_SCREENSHOTS + 1);

  return assets.length > 0 ? assets : undefined;
}

function sanitizeObservations(value: unknown): Observations | null {
  if (!isRecord(value)) return null;

  const shelfTest = isRecord(value.shelfTest) ? value.shelfTest : {};
  const clickTest = isRecord(value.clickTest) ? value.clickTest : {};
  const gameplayCommunication = isRecord(value.gameplayCommunication)
    ? value.gameplayCommunication
    : {};
  const emotionalSignal = isRecord(value.emotionalSignal)
    ? value.emotionalSignal
    : {};
  const polish = isRecord(value.polish) ? value.polish : {};
  const consistency = isRecord(value.consistency) ? value.consistency : {};

  return {
    shelfTest: {
      visibleElements: stringArray(shelfTest.visibleElements),
      lostElements: stringArray(shelfTest.lostElements),
      dominantElement: stringValue(shelfTest.dominantElement),
      focalPointClear: booleanValue(shelfTest.focalPointClear),
      playerOrMainSubjectVisible: booleanValue(
        shelfTest.playerOrMainSubjectVisible
      ),
      smallSizeRisk: booleanValue(shelfTest.smallSizeRisk),
    },
    clickTest: {
      curiositySignals: stringArray(clickTest.curiositySignals),
      rewardSignals: stringArray(clickTest.rewardSignals),
      dangerSignals: stringArray(clickTest.dangerSignals),
      urgencySignals: stringArray(clickTest.urgencySignals),
      clickBlockers: stringArray(clickTest.clickBlockers),
    },
    gameplayCommunication: {
      understoodIn3Seconds: stringArray(
        gameplayCommunication.understoodIn3Seconds
      ),
      unclearIn3Seconds: stringArray(gameplayCommunication.unclearIn3Seconds),
      objectiveClear: booleanValue(gameplayCommunication.objectiveClear),
      playerActionClear: booleanValue(
        gameplayCommunication.playerActionClear
      ),
      rewardClear: booleanValue(gameplayCommunication.rewardClear),
      failureStateClear: booleanValue(
        gameplayCommunication.failureStateClear
      ),
    },
    emotionalSignal: {
      currentSignals: stringArray(emotionalSignal.currentSignals),
      missingSignals: stringArray(emotionalSignal.missingSignals),
    },
    polish: {
      strengths: stringArray(polish.strengths),
      weaknesses: stringArray(polish.weaknesses),
      commercialPolish: commercialPolishValue(polish.commercialPolish),
    },
    consistency: {
      iconMatchesScreenshots: booleanValue(consistency.iconMatchesScreenshots),
      notes: stringValue(consistency.notes),
    },
    assetReview: assetReviewValue(value.assetReview),
    whatWorks: stringArray(value.whatWorks),
    whatHurtsConversion: stringArray(value.whatHurtsConversion),
    dragonPixelFixes: stringArray(value.dragonPixelFixes),
    marketingRiskSummary: stringValue(value.marketingRiskSummary),
    finalCall: stringValue(value.finalCall),
  };
}

function isAllowedRequestOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  const host = req.headers.get("host");
  if (host && origin === `https://${host}`) return true;

  if (ALLOWED_ORIGINS.has(origin)) return true;

  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://")) {
    return true;
  }

  return false;
}

function cleanGeminiJson(rawText: string) {
  return rawText
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sniffImageMime(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function readUInt24LE(buf: Buffer, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

function getImageDimensions(
  buf: Buffer,
  mime: string
): { width: number; height: number } | null {
  if (mime === "image/png" && buf.length >= 24) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (mime === "image/jpeg") {
    let offset = 2;
    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
      0xce, 0xcf,
    ]);

    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);

      if (sofMarkers.has(marker)) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }

      if (length < 2) return null;
      offset += 2 + length;
    }
  }

  if (
    mime === "image/webp" &&
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);

    if (chunk === "VP8X" && buf.length >= 30) {
      return {
        width: readUInt24LE(buf, 24) + 1,
        height: readUInt24LE(buf, 27) + 1,
      };
    }

    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    if (chunk === "VP8 " && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  return null;
}

type ImagePartResult =
  | { part: { inlineData: { mimeType: string; data: string } } }
  | { error: string };

async function prepareImagePart(
  file: File,
  label: string
): Promise<ImagePartResult> {
  if (file.size === 0) {
    return { error: `${label} is empty.` };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: `${label} is too large. Max size is 2 MB.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(buffer);

  if (!mime) {
    return {
      error: `${label} must be a real PNG, JPEG, or WebP image.`,
    };
  }

  const dimensions = getImageDimensions(buffer, mime);
  if (
    dimensions &&
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    return {
      error: `${label} is too large in pixel dimensions. Max is 12 megapixels.`,
    };
  }

  return {
    part: {
      inlineData: {
        mimeType: mime,
        data: buffer.toString("base64"),
      },
    },
  };
}

function collectFreeText(obs: Observations): string {
  const out: string[] = [];

  const push = (v?: string) => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };

  const pushArr = (arr?: string[]) => {
    if (Array.isArray(arr)) out.push(...arr.filter(Boolean));
  };

  pushArr(obs.shelfTest?.visibleElements);
  pushArr(obs.shelfTest?.lostElements);
  push(obs.shelfTest?.dominantElement);

  pushArr(obs.clickTest?.curiositySignals);
  pushArr(obs.clickTest?.rewardSignals);
  pushArr(obs.clickTest?.dangerSignals);
  pushArr(obs.clickTest?.urgencySignals);
  pushArr(obs.clickTest?.clickBlockers);

  pushArr(obs.gameplayCommunication?.understoodIn3Seconds);
  pushArr(obs.gameplayCommunication?.unclearIn3Seconds);

  pushArr(obs.emotionalSignal?.currentSignals);
  pushArr(obs.emotionalSignal?.missingSignals);

  pushArr(obs.polish?.strengths);
  pushArr(obs.polish?.weaknesses);

  push(obs.consistency?.notes);

  (obs.assetReview || []).forEach((asset) => {
    push(asset.assetName);
    push(asset.mainObservation);
    push(asset.mainIssue);
    push(asset.bestFix);
  });

  pushArr(obs.whatWorks);
  pushArr(obs.whatHurtsConversion);
  pushArr(obs.dragonPixelFixes);
  push(obs.marketingRiskSummary);
  push(obs.finalCall);

  return out.join(" ").toLowerCase();
}

function calculateDragonPixelScores(obs: Observations) {
  const text = collectFreeText(obs);

  const len = (arr?: string[]) => (Array.isArray(arr) ? arr.length : 0);
  const cap = (count: number, max = 3) => Math.min(count, max);

  let shelfReadability = 50;
  let clickPull = 50;
  let gameplayClarity = 50;
  let emotionalSignal = 50;
  let marketingConfidence = 80;
  let visualPolish = 50;

  // SHELF READABILITY
  if (obs.shelfTest?.focalPointClear) shelfReadability += 15;
  if (obs.shelfTest?.playerOrMainSubjectVisible) shelfReadability += 15;
  if (obs.shelfTest?.dominantElement) shelfReadability += 10;
  if (len(obs.shelfTest?.visibleElements) >= 2) shelfReadability += 10;

  if (obs.shelfTest?.smallSizeRisk) shelfReadability -= 20;
  if (len(obs.shelfTest?.lostElements) >= 2) shelfReadability -= 15;

  if (
    hasAny(text, ["lost", "blends", "too small", "hard to see", "visual noise"])
  ) {
    shelfReadability -= 10;
  }

  // CLICK PULL
  clickPull += cap(len(obs.clickTest?.curiositySignals)) * 8;
  clickPull += cap(len(obs.clickTest?.rewardSignals)) * 8;
  clickPull += cap(len(obs.clickTest?.dangerSignals)) * 6;
  clickPull += cap(len(obs.clickTest?.urgencySignals)) * 6;
  clickPull -= cap(len(obs.clickTest?.clickBlockers)) * 10;

  if (hasAny(text, ["generic", "forgettable", "unclear appeal", "no hook"])) {
    clickPull -= 15;
  }

  // GAMEPLAY CLARITY
  if (obs.gameplayCommunication?.objectiveClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.playerActionClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.rewardClear) gameplayClarity += 10;
  if (obs.gameplayCommunication?.failureStateClear) gameplayClarity += 5;

  gameplayClarity +=
    cap(len(obs.gameplayCommunication?.understoodIn3Seconds)) * 5;

  gameplayClarity -=
    cap(len(obs.gameplayCommunication?.unclearIn3Seconds)) * 8;

  if (
    hasAny(text, [
      "unclear",
      "ambiguous",
      "not immediately clear",
      "cannot tell",
    ])
  ) {
    gameplayClarity -= 10;
  }

  // EMOTIONAL SIGNAL
  emotionalSignal += cap(len(obs.emotionalSignal?.currentSignals)) * 8;
  emotionalSignal -= cap(len(obs.emotionalSignal?.missingSignals)) * 6;

  if (hasAny(text, ["danger", "urgency", "reward", "mastery", "satisfaction"])) {
    emotionalSignal += 10;
  }

  if (hasAny(text, ["calm", "static", "flat", "low tension"])) {
    emotionalSignal -= 10;
  }

  // VISUAL POLISH
  if (obs.polish?.commercialPolish === "high") visualPolish += 30;
  if (obs.polish?.commercialPolish === "medium") visualPolish += 10;
  if (obs.polish?.commercialPolish === "low") visualPolish -= 25;

  visualPolish += cap(len(obs.polish?.strengths)) * 5;
  visualPolish -= cap(len(obs.polish?.weaknesses)) * 7;

  if (hasAny(text, ["premium", "polished", "clean", "high-quality", "cohesive"])) {
    visualPolish += 10;
  }

  // MARKETING CONFIDENCE
  // Higher number = safer to spend marketing money.
  if (obs.consistency?.iconMatchesScreenshots === false) marketingConfidence -= 20;
  if (obs.shelfTest?.smallSizeRisk) marketingConfidence -= 10;
  if (!obs.gameplayCommunication?.objectiveClear) marketingConfidence -= 10;
  if (!obs.gameplayCommunication?.playerActionClear) marketingConfidence -= 10;

  marketingConfidence -= cap(len(obs.clickTest?.clickBlockers)) * 7;

  if (
    hasAny(text, [
      "mismatch",
      "disconnect",
      "confusing",
      "misleading",
      "high risk",
      "weak conversion",
    ])
  ) {
    marketingConfidence -= 15;
  }

  const scores = {
    shelfReadability: clampScore(shelfReadability),
    clickPull: clampScore(clickPull),
    gameplayClarity: clampScore(gameplayClarity),
    emotionalSignal: clampScore(emotionalSignal),
    marketingConfidence: clampScore(marketingConfidence),
    visualPolish: clampScore(visualPolish),
  };

  const weights = {
    shelfReadability: 20,
    clickPull: 20,
    gameplayClarity: 20,
    emotionalSignal: 15,
    marketingConfidence: 15,
    visualPolish: 10,
  };

  const launchScore = clampScore(
    (scores.shelfReadability / 100) * weights.shelfReadability +
      (scores.clickPull / 100) * weights.clickPull +
      (scores.gameplayClarity / 100) * weights.gameplayClarity +
      (scores.emotionalSignal / 100) * weights.emotionalSignal +
      (scores.marketingConfidence / 100) * weights.marketingConfidence +
      (scores.visualPolish / 100) * weights.visualPolish
  );

  const potentialAfterFixes = clampScore(
    launchScore +
      Math.min(
        22,
        len(obs.dragonPixelFixes) * 4 + len(obs.whatHurtsConversion) * 3
      )
  );

  return {
    scores,
    launchScore,
    potentialAfterFixes,
  };
}

function verdictFromScore(score: number) {
  if (score >= 90) return "Production-ready";
  if (score >= 75) return "Strong, needs polish";
  if (score >= 60) return "Usable but weak conversion";
  if (score >= 40) return "Risky";
  return "Hurting conversion";
}

function bulletList(items?: string[]) {
  if (!items || items.length === 0) return "- No clear observation returned.";
  return items.map((item) => `- ${item}`).join("\n");
}

function numberedList(items?: string[]) {
  if (!items || items.length === 0) return "1. No clear fix returned.";
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

export async function OPTIONS(req: Request) {
  if (!isAllowedRequestOrigin(req)) {
    return new Response(null, {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Origin",
      },
    });
  }

  const origin =
    req.headers.get("origin") || "https://launch.dragonpixelstudio.com";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Origin",
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!isAllowedRequestOrigin(req)) {
      return jsonResponse(
        { error: "Requests must come from Dragon Pixel Store Analyzer." },
        { status: 403 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return jsonResponse(
        { error: "Analyzer service is not configured yet." },
        { status: 500 }
      );
    }

    const ip = getClientIp(req);

    const perIp = await ipRatelimit.limit(ip);
    if (!perIp.success) {
      return jsonResponse(
        { error: "You've hit the hourly limit. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const rawIcon = formData.get("icon");
    const rawScreenshots = formData.getAll("screenshots");

    const icon = rawIcon instanceof File ? rawIcon : null;

    if (rawIcon && !(rawIcon instanceof File)) {
      return jsonResponse({ error: "Invalid icon upload." }, { status: 400 });
    }

    const invalidScreenshot = rawScreenshots.find(
      (item) => !(item instanceof File)
    );
    if (invalidScreenshot) {
      return jsonResponse(
        { error: "Invalid screenshot upload." },
        { status: 400 }
      );
    }

    const screenshots = rawScreenshots as File[];

    if (!icon && screenshots.length === 0) {
      return jsonResponse(
        { error: "Upload at least one icon or screenshot." },
        { status: 400 }
      );
    }

    if (screenshots.length > MAX_SCREENSHOTS) {
      return jsonResponse(
        { error: `Upload at most ${MAX_SCREENSHOTS} screenshots.` },
        { status: 400 }
      );
    }

    const global = await globalRatelimit.limit("global");
    if (!global.success) {
      return jsonResponse(
        {
          error:
            "The analyzer is at daily capacity. Please try again tomorrow.",
        },
        { status: 429 }
      );
    }

    const parts: Part[] = [
      {
        text: `
You are Dragon Pixel Store Analyzer.

You do NOT score.

Your job is observation only.

You inspect mobile game store assets like:
- a mobile game creative director
- a store conversion specialist
- a UA manager
- an art director

Return ONLY valid JSON.
No markdown.
No explanations outside JSON.
No trailing commas.

Observe the uploaded assets through the Dragon Pixel framework.

Do not give generic advice.
Do not compare to specific top games unless the visual evidence strongly supports it.
Do not invent gameplay that is not visible.
Do not praise polish unless it clearly helps conversion.
Do not say "some screenshots" vaguely. Identify the asset.

Return this exact JSON shape. Set booleans based only on visible evidence, not on the default values shown here:

{
  "shelfTest": {
    "visibleElements": [],
    "lostElements": [],
    "dominantElement": "",
    "focalPointClear": false,
    "playerOrMainSubjectVisible": false,
    "smallSizeRisk": false
  },
  "clickTest": {
    "curiositySignals": [],
    "rewardSignals": [],
    "dangerSignals": [],
    "urgencySignals": [],
    "clickBlockers": []
  },
  "gameplayCommunication": {
    "understoodIn3Seconds": [],
    "unclearIn3Seconds": [],
    "objectiveClear": false,
    "playerActionClear": false,
    "rewardClear": false,
    "failureStateClear": false
  },
  "emotionalSignal": {
    "currentSignals": [],
    "missingSignals": []
  },
  "polish": {
    "strengths": [],
    "weaknesses": [],
    "commercialPolish": "medium"
  },
  "consistency": {
    "iconMatchesScreenshots": false,
    "notes": ""
  },
  "assetReview": [
    {
      "assetName": "Icon",
      "mainObservation": "",
      "mainIssue": "",
      "bestFix": ""
    }
  ],
  "whatWorks": [],
  "whatHurtsConversion": [],
  "dragonPixelFixes": [],
  "marketingRiskSummary": "",
  "finalCall": ""
}

Observation rules:

Shelf test:
- Identify what survives at 32px.
- Identify what disappears at 32px.
- Identify where the eye lands first.
- If glow overpowers the actual subject, say so.
- If the player/main subject is visually lost, say so.

Click test:
- Identify what creates curiosity.
- Identify what creates reward anticipation.
- Identify what creates danger, urgency, tension, mastery, or satisfaction.
- Identify what blocks the click.

Gameplay communication:
- State what a cold user understands in 3 seconds.
- State what remains unclear in 3 seconds.
- Be specific about objective, player action, reward, threat, and progression.

Dragon Pixel fixes:
- Give practical art-direction changes.
- Example: "Reduce center bloom by 15% so the player silhouette survives 32px."
- Example: "Move the red threat closer to the player to create near-miss tension."
- Example: "Recapture screenshot 2 with a higher score and denser action so Endless Mode reads as mastery, not emptiness."
- Every fix must improve click-through rate, conversion rate, install probability, or ad spend efficiency.
        `,
      },
    ];

    if (icon) {
      const result = await prepareImagePart(icon, "Icon");
      if ("error" in result) {
        return jsonResponse({ error: result.error }, { status: 400 });
      }
      parts.push(result.part);
    }

    for (let i = 0; i < screenshots.length; i++) {
      const result = await prepareImagePart(screenshots[i], `Screenshot ${i + 1}`);
      if ("error" in result) {
        return jsonResponse({ error: result.error }, { status: 400 });
      }
      parts.push(result.part);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
    });

    const rawText = response.text || "";

    let parsed: unknown;

    try {
      parsed = JSON.parse(cleanGeminiJson(rawText));
    } catch {
      return jsonResponse(
        {
          error:
            "The AI review returned an unreadable response. Please try again.",
        },
        { status: 502 }
      );
    }

    const observations = sanitizeObservations(parsed);
    if (!observations) {
      return jsonResponse(
        {
          error:
            "The AI review returned an unexpected structure. Please try again.",
        },
        { status: 502 }
      );
    }

    const calculated = calculateDragonPixelScores(observations);
    const verdict = verdictFromScore(calculated.launchScore);

    const report = `
# Dragon Pixel Store Review

## Launch Score

**Overall:** ${calculated.launchScore}/100  
**Potential After Fixes:** ${calculated.potentialAfterFixes}/100  
**Verdict:** *${verdict}*

${observations.finalCall || "No final call returned."}

---

## Score Breakdown

- **Shelf Readability:** ${calculated.scores.shelfReadability}/100
- **Click Pull:** ${calculated.scores.clickPull}/100
- **Gameplay Clarity:** ${calculated.scores.gameplayClarity}/100
- **Emotional Signal:** ${calculated.scores.emotionalSignal}/100
- **Marketing Confidence:** ${calculated.scores.marketingConfidence}/100
- **Visual Polish:** ${calculated.scores.visualPolish}/100

---

## Shelf Test

### Visible at Small Size

${bulletList(observations.shelfTest?.visibleElements)}

### Lost at Small Size

${bulletList(observations.shelfTest?.lostElements)}

### Dominant Element

**${observations.shelfTest?.dominantElement || "No dominant element returned."}**

---

## Click Test

### Curiosity Signals

${bulletList(observations.clickTest?.curiositySignals)}

### Reward Signals

${bulletList(observations.clickTest?.rewardSignals)}

### Danger / Urgency Signals

${bulletList([
  ...(observations.clickTest?.dangerSignals || []),
  ...(observations.clickTest?.urgencySignals || []),
])}

### Click Blockers

${bulletList(observations.clickTest?.clickBlockers)}

---

## Gameplay Communication

### Understood in 3 Seconds

${bulletList(observations.gameplayCommunication?.understoodIn3Seconds)}

### Still Unclear

${bulletList(observations.gameplayCommunication?.unclearIn3Seconds)}

---

## Emotional Signal

### Current Signal

${bulletList(observations.emotionalSignal?.currentSignals)}

### Missing Signal

${bulletList(observations.emotionalSignal?.missingSignals)}

---

## Visual Polish

### Strengths

${bulletList(observations.polish?.strengths)}

### Weaknesses

${bulletList(observations.polish?.weaknesses)}

**Commercial Polish:** *${observations.polish?.commercialPolish || "medium"}*

---

## Asset Review

${(observations.assetReview || [])
  .map(
    (asset) => `
### ${asset.assetName}

**Observation:** ${asset.mainObservation}

**Issue:** ${asset.mainIssue}

**Best Fix:** ${asset.bestFix}
`
  )
  .join("\n")}

---

## What Works

${bulletList(observations.whatWorks)}

---

## What Hurts Conversion

${bulletList(observations.whatHurtsConversion)}

---

## Dragon Pixel Fixes

${numberedList(observations.dragonPixelFixes)}

---

## Marketing Confidence

${observations.marketingRiskSummary || "No marketing confidence summary returned."}

---

## Final Call

**${observations.finalCall || "No final call returned."}**
`.trim();

    return jsonResponse({
      report,
      observations,
      calculated,
      verdict,
    });
  } catch (err: unknown) {
    console.error("Analyze API error:", err);

    const msg =
      err instanceof Error ? err.message : JSON.stringify(err);

    if (
      msg.includes("503") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("high demand")
    ) {
      return jsonResponse(
        {
          error:
            "The AI review service is temporarily busy. Please try again in a minute.",
        },
        { status: 503 }
      );
    }

    return jsonResponse(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
