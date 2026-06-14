import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

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
    commercialPolish?: "low" | "medium" | "high";
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

async function fileToBase64(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
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

function calculateDragonPixelScores(obs: Observations) {
  const text = JSON.stringify(obs).toLowerCase();

  let shelfReadability = 50;
  let clickPull = 50;
  let gameplayClarity = 50;
  let emotionalSignal = 50;
  let marketingRisk = 50;
  let visualPolish = 50;

  // SHELF READABILITY
  if (obs.shelfTest?.focalPointClear) shelfReadability += 15;
  if (obs.shelfTest?.playerOrMainSubjectVisible) shelfReadability += 15;
  if (obs.shelfTest?.dominantElement) shelfReadability += 10;
  if ((obs.shelfTest?.visibleElements || []).length >= 2) shelfReadability += 10;

  if (obs.shelfTest?.smallSizeRisk) shelfReadability -= 20;
  if ((obs.shelfTest?.lostElements || []).length >= 2) shelfReadability -= 15;
  if (hasAny(text, ["lost", "blends", "too small", "hard to see", "visual noise"])) {
    shelfReadability -= 10;
  }

  // CLICK PULL
  clickPull += (obs.clickTest?.curiositySignals || []).length * 8;
  clickPull += (obs.clickTest?.rewardSignals || []).length * 8;
  clickPull += (obs.clickTest?.dangerSignals || []).length * 6;
  clickPull += (obs.clickTest?.urgencySignals || []).length * 6;
  clickPull -= (obs.clickTest?.clickBlockers || []).length * 10;

  if (hasAny(text, ["generic", "forgettable", "unclear appeal", "no hook"])) {
    clickPull -= 15;
  }

  // GAMEPLAY CLARITY
  if (obs.gameplayCommunication?.objectiveClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.playerActionClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.rewardClear) gameplayClarity += 10;
  if (obs.gameplayCommunication?.failureStateClear) gameplayClarity += 5;

  gameplayClarity +=
    (obs.gameplayCommunication?.understoodIn3Seconds || []).length * 5;

  gameplayClarity -=
    (obs.gameplayCommunication?.unclearIn3Seconds || []).length * 8;

  if (hasAny(text, ["unclear", "ambiguous", "not immediately clear", "cannot tell"])) {
    gameplayClarity -= 10;
  }

  // EMOTIONAL SIGNAL
  emotionalSignal += (obs.emotionalSignal?.currentSignals || []).length * 8;
  emotionalSignal -= (obs.emotionalSignal?.missingSignals || []).length * 6;

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

  visualPolish += (obs.polish?.strengths || []).length * 5;
  visualPolish -= (obs.polish?.weaknesses || []).length * 7;

  if (hasAny(text, ["premium", "polished", "clean", "high-quality", "cohesive"])) {
    visualPolish += 10;
  }

  // MARKETING RISK
  marketingRisk = 80;

  if (obs.consistency?.iconMatchesScreenshots === false) marketingRisk -= 20;
  if (obs.shelfTest?.smallSizeRisk) marketingRisk -= 10;
  if (!obs.gameplayCommunication?.objectiveClear) marketingRisk -= 10;
  if (!obs.gameplayCommunication?.playerActionClear) marketingRisk -= 10;
  if ((obs.clickTest?.clickBlockers || []).length > 0) {
    marketingRisk -= (obs.clickTest?.clickBlockers || []).length * 7;
  }

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
    marketingRisk -= 15;
  }

  const scores = {
    shelfReadability: clampScore(shelfReadability),
    clickPull: clampScore(clickPull),
    gameplayClarity: clampScore(gameplayClarity),
    emotionalSignal: clampScore(emotionalSignal),
    marketingRisk: clampScore(marketingRisk),
    visualPolish: clampScore(visualPolish),
  };

  const weights = {
    shelfReadability: 20,
    clickPull: 20,
    gameplayClarity: 20,
    emotionalSignal: 15,
    marketingRisk: 15,
    visualPolish: 10,
  };

  const launchScore = clampScore(
    (scores.shelfReadability / 100) * weights.shelfReadability +
      (scores.clickPull / 100) * weights.clickPull +
      (scores.gameplayClarity / 100) * weights.gameplayClarity +
      (scores.emotionalSignal / 100) * weights.emotionalSignal +
      (scores.marketingRisk / 100) * weights.marketingRisk +
      (scores.visualPolish / 100) * weights.visualPolish
  );

  const potentialAfterFixes = clampScore(
    launchScore +
      Math.min(
        22,
        (obs.dragonPixelFixes || []).length * 4 +
          (obs.whatHurtsConversion || []).length * 3
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

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const icon = formData.get("icon") as File | null;
    const screenshots = formData.getAll("screenshots") as File[];

    if (!icon && screenshots.length === 0) {
      return Response.json(
        { error: "Upload at least one icon or screenshot." },
        { status: 400 }
      );
    }

    const parts: any[] = [
      {
        text: `
You are Dragon Pixel Launch Analyzer.

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

Return this exact JSON shape:

{
  "shelfTest": {
    "visibleElements": [],
    "lostElements": [],
    "dominantElement": "",
    "focalPointClear": true,
    "playerOrMainSubjectVisible": true,
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
    "objectiveClear": true,
    "playerActionClear": true,
    "rewardClear": true,
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
    "iconMatchesScreenshots": true,
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
      parts.push({
        inlineData: {
          mimeType: icon.type || "image/png",
          data: await fileToBase64(icon),
        },
      });
    }

    for (const shot of screenshots.slice(0, 5)) {
      parts.push({
        inlineData: {
          mimeType: shot.type || "image/png",
          data: await fileToBase64(shot),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
    });

    const rawText = response.text || "";

    let observations: Observations;

    try {
      observations = JSON.parse(cleanGeminiJson(rawText));
    } catch {
      return Response.json({
        error: "Gemini returned invalid JSON.",
        raw: rawText,
      });
    }

    const calculated = calculateDragonPixelScores(observations);
    const verdict = verdictFromScore(calculated.launchScore);

const report = `
# Dragon Pixel Launch Review

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
- **Marketing Risk:** ${calculated.scores.marketingRisk}/100
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

## Marketing Risk

${observations.marketingRiskSummary || "No marketing risk summary returned."}

---

## Final Call

**${observations.finalCall || "No final call returned."}**
`.trim();

    return Response.json({
      report,
      observations,
      calculated,
      verdict,
    });
  } catch (err: any) {
    console.error("Analyze API error:", err);

    return Response.json(
      {
        error:
          typeof err?.message === "string"
            ? err.message
            : JSON.stringify(err),
      },
      { status: 500 }
    );
  }
}