// Dragon Pixel scoring engine - pure functions shared by /api/analyze (full
// reports) and /api/fix (variant re-scoring). The final score is owned
// entirely by this deterministic engine; Gemini provides observations only.

export const MAX_SCREENSHOTS = 3;
export const MAX_CREATIVES = 3;

export type CommercialPolish = "low" | "medium" | "high";

export type DragonPixelFix = { action: string; why: string; change: string };

export type EditPlan = {
  mode?: "conservative_polish" | "concept_upgrade";
  editStrength?: "subtle" | "clear" | "strong";
  preserve?: string[];
  requiredEdits?: string[];
  forbiddenChanges?: string[];
  successChecks?: string[];
  variant1Mode?: string;
  variant2Mode?: string;
};

export type Observations = {
  detectedText?: string;
  modelScore?: number;
  notGameAsset?: boolean;
  revisionBrief?: string;
  editPlan?: EditPlan;
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
    assetType?: string;
    detectedText?: string;
    mainObservation: string;
    mainIssue: string;
    bestFix: string;
    revisionBrief?: string;
  }[];
  whatWorks?: string[];
  whatHurtsConversion?: string[];
  dragonPixelFixes?: DragonPixelFix[];
  marketingRiskSummary?: string;
  finalCall?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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

function dragonPixelFixesValue(value: unknown): DragonPixelFix[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const fixes = value
    .map((item) => {
      // tolerate either a plain string (legacy) or the structured object
      if (typeof item === "string") {
        const action = item.trim();
        return action ? { action, why: "", change: "" } : null;
      }
      if (isRecord(item)) {
        const action = stringValue(item.action) || stringValue(item.title) || "";
        const why = stringValue(item.why) || "";
        const change = stringValue(item.change) || "";
        if (!action && !change) return null;
        return { action: action || change, why, change };
      }
      return null;
    })
    .filter((f): f is DragonPixelFix => f !== null)
    .slice(0, 6);
  return fixes.length > 0 ? fixes : undefined;
}

function assetReviewValue(value: unknown): Observations["assetReview"] {
  if (!Array.isArray(value)) return undefined;

  const assets = value
    .filter(isRecord)
    .map((asset) => ({
      assetName: stringValue(asset.assetName) || "Uploaded asset",
      assetType: stringValue(asset.assetType),
      detectedText: stringValue(asset.detectedText),
      mainObservation: stringValue(asset.mainObservation) || "",
      mainIssue: stringValue(asset.mainIssue) || "",
      bestFix: stringValue(asset.bestFix) || "",
      revisionBrief: stringValue(asset.revisionBrief),
    }))
    .slice(0, MAX_SCREENSHOTS + MAX_CREATIVES + 1);

  return assets.length > 0 ? assets : undefined;
}

function editPlanValue(value: unknown): EditPlan | undefined {
  if (!isRecord(value)) return undefined;

  const preserve = stringArray(value.preserve);
  const requiredEdits =
    stringArray(value.requiredEdits) || stringArray(value.required_edits);
  const forbiddenChanges =
    stringArray(value.forbiddenChanges) || stringArray(value.forbidden_changes);
  const successChecks =
    stringArray(value.successChecks) || stringArray(value.success_checks);
  const mode = stringValue(value.mode);
  const editStrength =
    stringValue(value.editStrength) || stringValue(value.edit_strength);
  const variant1Mode =
    stringValue(value.variant1Mode) || stringValue(value.variant_1_mode);
  const variant2Mode =
    stringValue(value.variant2Mode) || stringValue(value.variant_2_mode);

  if (
    !preserve &&
    !requiredEdits &&
    !forbiddenChanges &&
    !successChecks &&
    !mode &&
    !editStrength &&
    !variant1Mode &&
    !variant2Mode
  ) {
    return undefined;
  }

  return {
    mode:
      mode === "concept_upgrade" || mode === "conservative_polish"
        ? mode
        : undefined,
    editStrength:
      editStrength === "subtle" || editStrength === "clear" || editStrength === "strong"
        ? editStrength
        : undefined,
    preserve,
    requiredEdits,
    forbiddenChanges,
    successChecks,
    variant1Mode,
    variant2Mode,
  };
}

export function sanitizeObservations(value: unknown): Observations | null {
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
    detectedText: stringValue(value.detectedText) || stringValue(value.detected_text),
    modelScore: numberValue(value.modelScore) ?? numberValue(value.score),
    notGameAsset: booleanValue(value.notGameAsset) ?? booleanValue(value.not_a_game_asset),
    revisionBrief:
      stringValue(value.revisionBrief) || stringValue(value.revision_brief),
    editPlan: editPlanValue(value.editPlan) || editPlanValue(value.edit_plan),
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
    assetReview: assetReviewValue(value.assetReview) || assetReviewValue(value.asset_review),
    whatWorks: stringArray(value.whatWorks),
    whatHurtsConversion: stringArray(value.whatHurtsConversion),
    dragonPixelFixes:
      dragonPixelFixesValue(value.dragonPixelFixes) ||
      dragonPixelFixesValue(value.priority_fixes),
    marketingRiskSummary: stringValue(value.marketingRiskSummary),
    finalCall: stringValue(value.finalCall),
  };
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function roundToNearestFive(score: number) {
  return Math.max(0, Math.min(100, Math.round(score / 5) * 5));
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
  (obs.dragonPixelFixes || []).forEach((fix) => {
    push(fix.action);
    push(fix.why);
    push(fix.change);
  });
  push(obs.marketingRiskSummary);
  push(obs.finalCall);

  return out.join(" ").toLowerCase();
}

export type ReviewMode = "iconOnly" | "assetOnly" | "fullStoreSet";

export function getReviewMode(hasIcon: boolean, nonIconCount: number): ReviewMode {
  if (hasIcon && nonIconCount === 0) return "iconOnly";
  if (!hasIcon && nonIconCount > 0) return "assetOnly";
  return "fullStoreSet"; // hasIcon && nonIconCount > 0
}

const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  iconOnly: "Icon only",
  assetOnly: "No icon",
  fullStoreSet: "Full store set",
};

const REVIEW_MODE_NOTE: Record<ReviewMode, string> = {
  iconOnly:
    "This review focuses on icon performance. Gameplay clarity needs screenshots, and marketing confidence is partial until the full store set is uploaded - the icon is not being penalised for assets that weren't provided.",
  assetOnly:
    "This review focuses on the uploaded assets. Shelf readability and marketing confidence are partial until an icon is added.",
  fullStoreSet: "Full review across your icon and the other store assets.",
};

// Remove obvious duplicate/padded observations (case- and filler-insensitive).
function dedupeList(items?: string[]): string[] {
  if (!items) return [];
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\b(the|a|an|of|to|that|this|implies|suggests)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeIconSafeText(item: string): string {
  return item
    .replace(
      /\b(?:add|include|integrate|place|insert|overlay|put)\s+(?:the\s+)?(?:game'?s|game|app)\s+(?:title|name)\s+or\s+(?:a\s+)?(?:unique\s+)?(?:logo|brand)\s+(?:element|mark)\b/gi,
      "Add a distinctive non-text icon mark"
    )
    .replace(
      /\b(?:add|include|integrate|place|insert|overlay|put)\s+(?:the\s+)?(?:game'?s|game|app)\s+(?:title|name)\b/gi,
      "Strengthen the main icon mark"
    )
    .replace(/\b(?:game'?s|game|app)\s+(?:title|name)\s+or\s+(?:a\s+)?unique\s+(?:brand\s+)?logo\b/gi, "unique non-text icon mark")
    .replace(/\b(?:game'?s|game|app)\s+(?:title|name)\b/gi, "icon identity")
    .replace(/\btitle text\b/gi, "icon identity")
    .replace(/\bwordmark\b/gi, "non-text icon mark")
    .replace(/\btagline\b/gi, "visual cue")
    .trim();
}

function iconSafeList(items?: string[]): string[] {
  return dedupeList(items)
    .map(makeIconSafeText)
    .filter(Boolean);
}

const ICON_DETAIL_PATTERN =
  /\b(core|highlight|rim|edge|spark|sparks|particle|particles|trail|trails|streak|streaks|burst|flash|background|detail|details|glow variation|micro-effect|micro effect|light point)\b/i;

const ICON_SUBJECT_PATTERN =
  /\b(orb|circle|ball|player|ship|character|mascot|enemy|monster|obstacle|square|diamond|block|gem|weapon|vehicle|mark|symbol|object)\b/i;

function normalizeIconElement(item: string): string {
  return item
    .replace(/\bbright\s+(?:white\s+)?core\s+of\s+(?:the\s+)?/gi, "")
    .replace(/\b(?:white\s+)?core\s+of\s+(?:the\s+)?/gi, "")
    .replace(/\bcollision\s+point\b/gi, "collision point")
    .replace(/\s+/g, " ")
    .trim();
}

function iconCoreSubjects(obs: Observations): string[] {
  const visible = dedupeList(obs.shelfTest?.visibleElements).map(normalizeIconElement);
  const dominant = obs.shelfTest?.dominantElement
    ? normalizeIconElement(obs.shelfTest.dominantElement)
    : "";
  const ordered = dedupeList([dominant, ...visible].filter(Boolean));

  const subjects = ordered.filter((item) => {
    const looksLikeSubject = ICON_SUBJECT_PATTERN.test(item);
    const isOnlyDetail = ICON_DETAIL_PATTERN.test(item) && !looksLikeSubject;
    return looksLikeSubject && !isOnlyDetail;
  });

  return (subjects.length > 0 ? subjects : ordered).slice(0, 3);
}

function joinReadable(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Model observations arrive as full sentences ("The bright collision point
// between the blue circle and red diamond"). Compress each to a short noun
// phrase so brief templates read like a designer wrote them, not a template.
function compactSubject(phrase: string): string {
  let p = phrase.trim();
  p = p.replace(/^(the|a|an)\s+/i, "");
  // Cut trailing relative/positional clauses; keep the head noun phrase.
  p = p.split(/\s+(?:between|around|against|near|with|behind|beneath|under|over|toward|towards)\s+/i)[0];
  p = p.replace(/[.,;:]+$/, "").trim();
  const words = p.split(/\s+/);
  if (words.length > 5) p = words.slice(0, 5).join(" ");
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function iconSubjectGroup(obs: Observations): string {
  const subjects = iconCoreSubjects(obs).map(compactSubject).filter(Boolean);
  if (subjects.length >= 2) return `the ${subjects[0]} and the ${subjects[1]}`;
  if (subjects.length === 1) return `the ${subjects[0]}`;
  return "the main icon subject group";
}

function iconCleanupTargets(obs: Observations): string {
  const lost = dedupeList(obs.shelfTest?.lostElements);
  const noisyVisible = dedupeList(obs.shelfTest?.visibleElements).filter((item) =>
    ICON_DETAIL_PATTERN.test(item)
  );
  const targets = dedupeList([...lost, ...noisyVisible])
    .map(compactSubject)
    .filter(Boolean)
    .slice(0, 4);
  // Never invent specific noise types the asset doesn't have; the generic
  // phrasing is honest when the model didn't name concrete elements.
  return targets.length > 0
    ? targets.join(", ")
    : "any small details that stop reading at store size";
}

function iconSafeFixes(fixes: DragonPixelFix[]): DragonPixelFix[] {
  return fixes.map((fix) => ({
    action: makeIconSafeText(fix.action),
    why: makeIconSafeText(fix.why),
    change: makeIconSafeText(fix.change),
  }));
}

function iconSafeRevisionBrief(obs: Observations): string {
  const group = iconSubjectGroup(obs);
  const cleanupTargets = iconCleanupTargets(obs);

  const lines = [
    "Keep the same core subjects, same setup idea, same palette family, and the square icon composition.",
    `Enlarge ${group} as one readable group, not just an internal highlight or glow core.`,
    `Crop tighter around ${group}, keeping safe margins.`,
    `Remove small-size noise: ${cleanupTargets}.`,
    "Raise rim and edge contrast so the silhouette separates cleanly from the background.",
    "No title text, no new objects, no new characters, no concept change.",
  ];

  return dedupeList(lines).slice(0, 6).join("\n");
}

function iconEditPlan(obs: Observations): EditPlan {
  const group = iconSubjectGroup(obs);
  const subjects = iconCoreSubjects(obs);
  const cleanupTargets = iconCleanupTargets(obs);

  return {
    mode: "conservative_polish",
    editStrength: "clear",
    preserve: [
      subjects.length > 0
        ? `Same core subjects: ${joinReadable(subjects)}.`
        : "Same core subjects and same visual concept as the uploaded icon.",
      "Same palette family, art style, camera angle, and square icon composition.",
      "Same subject relationship/collision setup; improve readability without redesigning the icon.",
      "At least 85-90% of the original concept should remain recognizable.",
    ],
    requiredEdits: [
      `Scale ${group} up as one complete subject group so the focal event occupies roughly 72-80% of the square canvas while keeping safe margins.`,
      `Tighten the crop around the focal event without changing the same subject relationship.`,
      `Simplify or remove low-value thumbnail noise: ${cleanupTargets}. Keep only 3-5 major readable sparks or accents if sparks are part of the source.`,
      "Shorten and simplify trails by roughly 20-35% when trails compete with the focal read.",
      `Increase edge/rim contrast around the main readable shapes for stronger figure-ground separation.`,
      "Keep the background clean and dark; reduce background detail to atmospheric support only.",
    ],
    forbiddenChanges: [
      "Do not replace the main subject with a different object, character, or symbol.",
      "Do not add title text, subtitles, logos, badges, ratings, or UI labels.",
      "Do not invent a new gameplay concept, new character, new scene, or new perspective.",
      "Do not dramatically redesign secondary subjects such as an opposing square, obstacle, enemy, or hazard.",
      "Do not change the art style or palette family.",
    ],
    successChecks: [
      "The edited version reads more clearly at 32px than the original.",
      "The edited version remains obviously the same icon concept.",
      "The change is visible immediately, not subtle to the point of irrelevance.",
      "The main event is larger, cleaner, and easier to separate from the background.",
    ],
    variant1Mode:
      "Faithful improvement: preserve layout closely, enlarge the focal event moderately, reduce clutter slightly, and keep most original energy.",
    variant2Mode:
      "Stronger improvement: tighten crop more, simplify small details more aggressively, reduce trails/sparks harder, and push silhouette clarity while keeping the same concept.",
  };
}

function fallbackEditPlan(obs: Observations, fixes: DragonPixelFix[]): EditPlan {
  const modelPlan = obs.editPlan;
  if (modelPlan) {
    return {
      mode: modelPlan.mode ?? "conservative_polish",
      editStrength: modelPlan.editStrength ?? "clear",
      preserve: dedupeList(modelPlan.preserve).slice(0, 5),
      requiredEdits: dedupeList(modelPlan.requiredEdits).slice(0, 6),
      forbiddenChanges: dedupeList(modelPlan.forbiddenChanges).slice(0, 6),
      successChecks: dedupeList(modelPlan.successChecks).slice(0, 5),
      variant1Mode: modelPlan.variant1Mode,
      variant2Mode: modelPlan.variant2Mode,
    };
  }

  return {
    mode: "conservative_polish",
    editStrength: "clear",
    preserve: [
      "Same game identity, same source image subject family, and same art style.",
      "Same real gameplay/store asset content; improve presentation without inventing new content.",
    ],
    requiredEdits: fixes
      .map((fix) => fix.change || fix.action)
      .filter(Boolean)
      .slice(0, 5),
    forbiddenChanges: [
      "Do not invent fake gameplay, fake UI, awards, ratings, or platform badges.",
      "Do not add unrelated objects, characters, faces, or a different art style.",
      "Do not make unsupported marketing claims.",
    ],
    successChecks: [
      "The improved asset keeps the source identity and real content intact.",
      "The improvement is visible without needing to compare tiny details.",
      "The result is clearer at the target store display size.",
    ],
    variant1Mode: "Faithful improvement: apply the required fixes while staying close to the source.",
    variant2Mode: "Stronger improvement: push clarity and hierarchy harder without changing the concept.",
  };
}

function pushUniqueFix(out: DragonPixelFix[], fix: DragonPixelFix) {
  const action = fix.action.trim();
  if (!action) return;
  const head = action.toLowerCase().slice(0, 30);
  if (out.some((item) => item.action.toLowerCase().includes(head))) return;
  out.push({ action, why: fix.why.trim(), change: fix.change.trim() });
}

// The UI promises "Top 3 actions"; a usable asset should always get three.
// Model output is used first, then padded with deterministic, mode-aware
// fixes so the list is never short.
function completeTopFixes(
  fixes: DragonPixelFix[],
  reviewMode: ReviewMode,
  obs: Observations
): DragonPixelFix[] {
  const out: DragonPixelFix[] = [];
  fixes.forEach((fix) => pushUniqueFix(out, fix));

  if (reviewMode === "iconOnly") {
    const visible = dedupeList(obs.shelfTest?.visibleElements);
    const lost = dedupeList(obs.shelfTest?.lostElements);
    const primary = obs.shelfTest?.dominantElement || visible[0] || "the main icon subject";
    pushUniqueFix(out, {
      action: "Commit to one clear icon pattern.",
      why: "High-performing game icons sell one dominant character, object, threat, reward, or brand mark. Several equal abstract elements read as less memorable.",
      change: `Make ${primary} the unmistakable hero and reduce secondary effects so the icon has one clear read.`,
    });
    pushUniqueFix(out, {
      action: "Optimize the icon for 32px readability.",
      why: "Small store icons lose thin trails, tiny sparks, soft glow, and subtle edges first.",
      change: "Enlarge the primary shapes, thicken the readable silhouette, and remove fine background details that vanish at thumbnail size.",
    });
    pushUniqueFix(out, {
      action: "Strengthen the gameplay signal without adding text.",
      why: "Game icons usually do not need the game name; the image should imply action, danger, reward, or the core mechanic.",
      change: "Show one clearer subject-versus-obstacle, threat, or reward relationship while keeping the same style.",
    });
    if (lost.length > 0) {
      pushUniqueFix(out, {
        action: "Remove details that fail the shelf test.",
        why: `The weakest small-size elements are: ${lost.slice(0, 3).join(", ")}.`,
        change: "Delete or merge these into larger readable shapes instead of leaving them as separate visual noise.",
      });
    }
  } else {
    pushUniqueFix(out, {
      action: "Make the main gameplay action readable first.",
      why: "Store assets convert better when the player can understand the action or objective within a few seconds.",
      change: "Increase the scale and contrast of the player, action, reward, or threat before adding decorative effects.",
    });
    pushUniqueFix(out, {
      action: "Use one clear marketing message per asset.",
      why: "Multiple competing messages weaken thumbnail readability and reduce click clarity.",
      change: "Keep one headline or focal idea, then remove visual elements that do not support it.",
    });
    pushUniqueFix(out, {
      action: "Improve store-scale contrast.",
      why: "Assets are judged in small grids before users ever see them full-size.",
      change: "Increase foreground/background separation and simplify busy areas near the focal point.",
    });
  }

  const guaranteedFallbacks: DragonPixelFix[] =
    reviewMode === "iconOnly"
      ? [
          {
            action: "Tighten the focal read.",
            why: "Icons win when one subject dominates immediately at small size.",
            change:
              "Scale the main subject up, tighten the crop, and reduce competing secondary effects.",
          },
          {
            action: "Clean up thumbnail noise.",
            why: "Thin trails, sparks, and soft background detail disappear first at store size.",
            change:
              "Remove or merge low-value tiny details so the icon holds up at 32px.",
          },
          {
            action: "Improve subject separation.",
            why: "A stronger figure/ground split makes the icon read faster on a crowded shelf.",
            change:
              "Increase edge contrast and simplify the background around the focal subject.",
          },
        ]
      : [
          {
            action: "Clarify the main selling message.",
            why: "The user should understand the core action or hook immediately.",
            change: "Make the player action, threat, reward, or objective read first.",
          },
          {
            action: "Reduce competing visual noise.",
            why: "Too many equal elements weaken conversion clarity.",
            change: "Remove non-essential elements that compete with the focal point.",
          },
          {
            action: "Strengthen hierarchy and contrast.",
            why: "Store assets are judged quickly and often at small size.",
            change:
              "Push the main focal subject forward and separate it more clearly from the background.",
          },
        ];

  for (const fix of guaranteedFallbacks) {
    if (out.length >= 3) break;
    pushUniqueFix(out, fix);
  }

  while (out.length < 3) {
    out.push({
      action: `Additional priority fix ${out.length + 1}`,
      why: "The UI requires three ranked actions.",
      change:
        reviewMode === "iconOnly"
          ? "Tighten the focal subject, simplify clutter, and improve small-size readability."
          : "Clarify the focal message, improve contrast, and simplify the composition.",
    });
  }

  return out.slice(0, 3);
}

export function clientReadout(obs: Observations) {
  return {
    shelf: {
      visible: dedupeList(obs.shelfTest?.visibleElements).slice(0, 3),
      lost: dedupeList(obs.shelfTest?.lostElements).slice(0, 3),
    },
    click: {
      curiosity: dedupeList(obs.clickTest?.curiositySignals).slice(0, 3),
      reward: dedupeList(obs.clickTest?.rewardSignals).slice(0, 3),
      danger: dedupeList(obs.clickTest?.dangerSignals).slice(0, 3),
      urgency: dedupeList(obs.clickTest?.urgencySignals).slice(0, 3),
      blockers: dedupeList(obs.clickTest?.clickBlockers).slice(0, 3),
    },
    gameplay: {
      clear: dedupeList(obs.gameplayCommunication?.understoodIn3Seconds).slice(0, 3),
      unclear: dedupeList(obs.gameplayCommunication?.unclearIn3Seconds).slice(0, 3),
    },
    emotion: {
      present: dedupeList(obs.emotionalSignal?.currentSignals).slice(0, 3),
      missing: dedupeList(obs.emotionalSignal?.missingSignals).slice(0, 3),
    },
  };
}

export type ConversionRisk = {
  assessed: boolean;
  level: "Low" | "Medium" | "Medium-high" | "High" | "Needs screenshots";
  position: number; // 0–100 marker for the risk meter
  reason: string;
};

// Derived once here so the dashboard and the report can never disagree.
// Clarity is the conversion driver; click pull only sets how many clicks are
// at stake. A big pull-vs-clarity gap means more paid clicks land on an
// unclear page, so it nudges the risk up.
function computeConversionRisk(
  clickPull: number,
  gameplayClarity: number,
  gameplayAssessed: boolean
): ConversionRisk {
  if (!gameplayAssessed) {
    return {
      assessed: false,
      level: "Needs screenshots",
      position: 50,
      reason:
        "Click pull is readable from the icon, but whether those clicks convert depends on gameplay clarity - add screenshots to gauge it.",
    };
  }

  let level: ConversionRisk["level"];
  if (gameplayClarity >= 75) level = "Low";
  else if (gameplayClarity >= 62) level = "Medium";
  else if (gameplayClarity >= 50) level = "Medium-high";
  else level = "High";

  const gap = clickPull - gameplayClarity;
  if (gap >= 35 && (level === "Low" || level === "Medium")) {
    level = level === "Low" ? "Medium" : "Medium-high";
  }

  const position = { Low: 18, Medium: 42, "Medium-high": 68, High: 88 }[level];

  let reason: string;
  if (level === "Low") {
    reason = `Clarity (${gameplayClarity}) keeps up with pull (${clickPull}) - clicks should convert. Focus on raising visual excitement.`;
  } else if (level === "Medium") {
    reason = `Solid pull (${clickPull}) with workable clarity (${gameplayClarity}). Some clicks may not convert until the gameplay reads faster.`;
  } else if (level === "Medium-high") {
    reason = `Strong pull (${clickPull}) but mediocre clarity (${gameplayClarity}). Players click for the visuals and may leave before they understand the game - paid clicks risk not converting.`;
  } else {
    reason = `Clarity (${gameplayClarity}) is low. Even strong pull (${clickPull}) won't convert if players can't tell what the game is at a glance.`;
  }

  return { assessed: true, level, position, reason };
}

function computeStoreImpact(
  risk: ConversionRisk
): { headline: string; tone: "good" | "warn" | "bad" } {
  if (!risk.assessed)
    return { headline: "Add screenshots to gauge install risk", tone: "warn" };
  if (risk.level === "Low")
    return { headline: "Converting clicks well", tone: "good" };
  if (risk.level === "Medium")
    return { headline: "Some installs at risk", tone: "warn" };
  return { headline: "Likely losing installs", tone: "bad" };
}

export type ShipDecision = {
  label: string;
  tone: "good" | "warn" | "bad";
  sub: string;
};

// Decisive, founder-facing call - derived from the score band, but honest about
// partial input: only a full store set (icon + other assets) can earn "SHIP".
function computeShipDecision(
  score: number,
  reviewMode: ReviewMode,
  reviewNoun: string
): ShipDecision {
  const strong = score >= 78;
  const weak = score < 55;

  if (reviewMode === "fullStoreSet") {
    if (strong) return { label: "SHIP", tone: "good", sub: "Strong across the store set." };
    if (weak) return { label: "DO NOT SHIP", tone: "bad", sub: "Rework before launch." };
    return { label: "FIX BEFORE SHIPPING", tone: "warn", sub: "Close the conversion gaps first." };
  }

  // partial input - name the missing piece honestly
  const missing = reviewMode === "iconOnly" ? "screenshots" : "an icon";
  const lower = reviewNoun.toLowerCase();
  if (strong)
    return {
      label: `STRONG ${reviewNoun.toUpperCase()}`,
      tone: "good",
      sub: `Add ${missing} for a full ship call.`,
    };
  if (weak) return { label: "DO NOT SHIP", tone: "bad", sub: `Rework the ${lower}.` };
  return { label: "FIX BEFORE SHIPPING", tone: "warn", sub: `The ${lower} needs work first.` };
}

export function calculateDragonPixelScores(
  obs: Observations,
  reviewMode: ReviewMode,
  flags: { hasIcon: boolean; hasScreens: boolean; hasCreatives: boolean }
) {
  if (obs.notGameAsset) {
    const scores = {
      shelfReadability: 0,
      clickPull: 0,
      gameplayClarity: 0,
      emotionalSignal: 0,
      marketingConfidence: 0,
      visualPolish: 0,
    };
    const breakdown = [
      { key: "shelfReadability", label: "Shelf Readability", value: "Not a game asset", assessed: false },
      { key: "clickPull", label: "Click Pull", value: "Not a game asset", assessed: false },
      { key: "gameplayClarity", label: "Gameplay Clarity", value: "Not a game asset", assessed: false },
      { key: "emotionalSignal", label: "Emotional Signal", value: "Not a game asset", assessed: false },
      { key: "marketingConfidence", label: "Marketing Confidence", value: "Not a game asset", assessed: false },
      { key: "visualPolish", label: "Visual Polish", value: "Not a game asset", assessed: false },
    ];

    return {
      reviewMode,
      reviewModeLabel: REVIEW_MODE_LABEL[reviewMode],
      reviewModeNote: "The upload does not appear to be a game store asset.",
      reviewNoun: "Asset",
      scores,
      breakdown,
      launchScore: 0,
      potentialAfterFixes: 0,
      conversionRisk: {
        assessed: true,
        level: "High" as const,
        position: 95,
        reason: "This upload does not look like a usable game store asset.",
      },
      storeImpact: { headline: "Not usable as a store asset", tone: "bad" as const },
      decision: {
        label: "DO NOT USE",
        tone: "bad" as const,
        sub: "Upload an icon, screenshot, capsule, or feature graphic.",
      },
      summaryLine: obs.finalCall || "Upload a real game store asset to get a useful review.",
      strengths: [],
      weaknesses: [obs.finalCall || "This does not read as game store creative."],
      biggestProblem: obs.finalCall || "Not a game store asset.",
      topFixes: [],
      revisionBrief: "",
    };
  }

  const text = collectFreeText(obs);
  const len = (arr?: readonly unknown[]) => (Array.isArray(arr) ? arr.length : 0);
  const cap = (count: number, max = 3) => Math.min(count, max);

  const { hasIcon, hasScreens, hasCreatives } = flags;

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
  if (hasAny(text, ["lost", "blends", "too small", "hard to see", "visual noise"])) {
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

  // GAMEPLAY CLARITY (only meaningful with screenshots)
  if (obs.gameplayCommunication?.objectiveClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.playerActionClear) gameplayClarity += 15;
  if (obs.gameplayCommunication?.rewardClear) gameplayClarity += 10;
  if (obs.gameplayCommunication?.failureStateClear) gameplayClarity += 5;
  gameplayClarity += cap(len(obs.gameplayCommunication?.understoodIn3Seconds)) * 5;
  gameplayClarity -= cap(len(obs.gameplayCommunication?.unclearIn3Seconds)) * 8;
  if (hasAny(text, ["unclear", "ambiguous", "not immediately clear", "cannot tell"])) {
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

  // VISUAL POLISH - the commercial-polish tier is the strong signal; strength/
  // weakness counts only nudge. Keep the nudge symmetric so a couple of minor
  // nitpicks can't drag a genuinely high-polish asset down into the 70s.
  if (obs.polish?.commercialPolish === "high") visualPolish += 33;
  if (obs.polish?.commercialPolish === "medium") visualPolish += 10;
  if (obs.polish?.commercialPolish === "low") visualPolish -= 25;
  visualPolish += cap(len(obs.polish?.strengths)) * 5;
  visualPolish -= cap(len(obs.polish?.weaknesses)) * 5;
  if (hasAny(text, ["premium", "polished", "clean", "high-quality", "cohesive"])) {
    visualPolish += 10;
  }

  // MARKETING CONFIDENCE - skip screenshot-dependent penalties when no
  // screenshots were provided, so an icon-only run isn't punished for them.
  if (hasScreens && obs.consistency?.iconMatchesScreenshots === false) {
    marketingConfidence -= 20;
  }
  if (obs.shelfTest?.smallSizeRisk) marketingConfidence -= 10;
  if (hasScreens && !obs.gameplayCommunication?.objectiveClear) {
    marketingConfidence -= 10;
  }
  if (hasScreens && !obs.gameplayCommunication?.playerActionClear) {
    marketingConfidence -= 10;
  }
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

  // Category ceilings: reserve 93–100 for a real benchmark pass later.
  // A free tool showing a casual 100 reads as amateur.
  clickPull = Math.min(clickPull, 92);
  visualPolish = Math.min(visualPolish, 95);

  const scores = {
    shelfReadability: clampScore(shelfReadability),
    clickPull: clampScore(clickPull),
    gameplayClarity: clampScore(gameplayClarity),
    emotionalSignal: clampScore(emotionalSignal),
    marketingConfidence: clampScore(marketingConfidence),
    visualPolish: clampScore(visualPolish),
  };

  // Which categories the input actually lets us assess.
  const shelfAssessed = hasIcon; // shelf test is icon-only
  const gameplayAssessed = hasScreens; // needs real gameplay screenshots
  const marketingFull = hasIcon && (hasScreens || hasCreatives); // funnel needs the icon + at least one store asset
  const assessedByKey: Record<keyof typeof scores, boolean> = {
    shelfReadability: shelfAssessed,
    clickPull: true,
    gameplayClarity: gameplayAssessed,
    emotionalSignal: true,
    marketingConfidence: marketingFull,
    visualPolish: true,
  };

  // Mode-specific weights - renormalised over only the categories the input
  // actually lets us assess, so a missing category never drags the score.
  const weightsByMode: Record<ReviewMode, Partial<Record<keyof typeof scores, number>>> = {
    iconOnly: {
      shelfReadability: 30,
      clickPull: 25,
      visualPolish: 20,
      emotionalSignal: 15,
      marketingConfidence: 10, // partial, screenshot-free value
    },
    assetOnly: {
      gameplayClarity: 30,
      clickPull: 20,
      emotionalSignal: 20,
      visualPolish: 20,
      shelfReadability: 10,
    },
    fullStoreSet: {
      shelfReadability: 20,
      clickPull: 20,
      gameplayClarity: 20,
      emotionalSignal: 15,
      marketingConfidence: 15,
      visualPolish: 10,
    },
  };

  const weights = weightsByMode[reviewMode];

  let weightedScore = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [
    keyof typeof scores,
    number
  ][]) {
    if (!assessedByKey[key]) continue; // skip categories we can't honestly assess
    weightedScore += (scores[key] / 100) * weight;
    totalWeight += weight;
  }
  // Headline ceiling: the per-category ceilings already reserve the top band for a
  // real benchmark pass. Extend that to the overall number - a free tool showing
  // 100/100 reads as amateur, so launch and potential top out at 95.
  // The final score is owned entirely by the deterministic scoring engine.
  // Gemini provides observations only; its self-reported score is ignored so the
  // same asset does not swing between runs.
  const launchScore = Math.min(
    95,
    roundToNearestFive(clampScore(totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0))
  );

  const potentialAfterFixes = Math.min(
    95,
    roundToNearestFive(
      clampScore(
        launchScore +
          Math.min(
            22,
            len(obs.dragonPixelFixes) * 4 + len(obs.whatHurtsConversion) * 3
          )
      )
    )
  );

  // Human-facing breakdown: a number where assessed, a status otherwise.
  const fmt = (n: number) => `${n}/100`;
  const breakdown: { key: string; label: string; value: string; assessed: boolean }[] = [
    {
      key: "shelfReadability",
      label: "Shelf Readability",
      value: shelfAssessed ? fmt(scores.shelfReadability) : "Needs an icon",
      assessed: shelfAssessed,
    },
    { key: "clickPull", label: "Click Pull", value: fmt(scores.clickPull), assessed: true },
    {
      key: "gameplayClarity",
      label: "Gameplay Clarity",
      value: gameplayAssessed ? fmt(scores.gameplayClarity) : "Needs screenshots",
      assessed: gameplayAssessed,
    },
    { key: "emotionalSignal", label: "Emotional Signal", value: fmt(scores.emotionalSignal), assessed: true },
    {
      key: "marketingConfidence",
      label: "Marketing Confidence",
      value: marketingFull ? fmt(scores.marketingConfidence) : "Partial",
      assessed: marketingFull,
    },
    { key: "visualPolish", label: "Visual Polish", value: fmt(scores.visualPolish), assessed: true },
  ];

  const conversionRisk = computeConversionRisk(
    scores.clickPull,
    scores.gameplayClarity,
    gameplayAssessed
  );
  const storeImpact = computeStoreImpact(conversionRisk);
  const iconOnlyReview = reviewMode === "iconOnly";
  const rawBiggestProblem =
    dedupeList(obs.whatHurtsConversion)[0] || obs.finalCall || "";
  const biggestProblem = iconOnlyReview ? makeIconSafeText(rawBiggestProblem) : rawBiggestProblem;
  const rawFixes = iconOnlyReview
    ? iconSafeFixes(obs.dragonPixelFixes || [])
    : obs.dragonPixelFixes || [];
  const topFixes = completeTopFixes(rawFixes, reviewMode, obs);

  const reviewNoun =
    hasIcon && !hasScreens && !hasCreatives
      ? "Icon"
      : !hasIcon && hasScreens && !hasCreatives
      ? "Screenshots"
      : !hasIcon && !hasScreens && hasCreatives
      ? "Creative"
      : "Store";

  // decision + crisp strong/weak summary, derived from the assessed bars
  const decision = computeShipDecision(launchScore, reviewMode, reviewNoun);
  const assessedRows = breakdown.filter((b) => b.assessed);
  const byScore = [...assessedRows].sort(
    (a, b) =>
      (scores[b.key as keyof typeof scores] ?? 0) -
      (scores[a.key as keyof typeof scores] ?? 0)
  );
  const strongest = byScore[0]?.label ?? "";
  const weakestRow = byScore[byScore.length - 1];
  const weakest = weakestRow?.label ?? "";
  // A 72 is the *lowest* category, not a "weak" one - only call it weak when it
  // really is. Keeps the one-line summary honest next to a SHIP verdict.
  const weakestScore = weakestRow
    ? scores[weakestRow.key as keyof typeof scores] ?? 0
    : 0;
  const weakWord = weakestScore < 62 ? "weak" : "softer";
  const summaryLine =
    strongest && weakest && strongest !== weakest
      ? `Strong ${strongest.toLowerCase()}, ${weakWord} ${weakest.toLowerCase()}.`
      : obs.finalCall || "";
  const strengths = (iconOnlyReview ? iconSafeList(obs.whatWorks) : dedupeList(obs.whatWorks)).slice(0, 3);
  const weaknesses = (iconOnlyReview ? iconSafeList(obs.whatHurtsConversion) : dedupeList(obs.whatHurtsConversion)).slice(0, 3);
  const revisionBrief = iconOnlyReview
    ? iconSafeRevisionBrief(obs)
    : dedupeList(
        [
          ...topFixes.map((fix) => fix.change || fix.action),
          obs.revisionBrief || "",
        ].filter(Boolean)
      )
        .slice(0, 6)
        .join("\n");
  const editPlan = iconOnlyReview ? iconEditPlan(obs) : fallbackEditPlan(obs, topFixes);

  return {
    reviewMode,
    reviewModeLabel: REVIEW_MODE_LABEL[reviewMode],
    reviewModeNote: REVIEW_MODE_NOTE[reviewMode],
    reviewNoun: reviewNoun,
    scores,
    breakdown,
    launchScore,
    potentialAfterFixes,
    conversionRisk,
    storeImpact,
    decision,
    summaryLine,
    strengths,
    weaknesses,
    biggestProblem,
    topFixes,
    revisionBrief,
    editPlan,
  };
}

export type CalculatedReport = ReturnType<typeof calculateDragonPixelScores>;

// New scale - no casual 100s, plain labels people read faster than numbers.
export function verdictFromScore(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Usable";
  if (score >= 50) return "Weak conversion";
  return "Problem - needs rework";
}
