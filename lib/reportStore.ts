import crypto from "node:crypto";
import { redis } from "@/lib/ratelimit";
import type { CalculatedReport, Observations } from "@/lib/analyzerCore";
import { clientReadout } from "@/lib/analyzerCore";
import type { BenchmarkEvidence } from "@/lib/iconEvidence";

// Saved analysis reports power shareable /report/<id> links. Reports are
// anonymous, addressable only by an unguessable id, and expire after 90 days.

const REPORT_TTL_SECONDS = 60 * 60 * 24 * 90;
const REPORT_KEY_PREFIX = "dpx:report:";

export type StoredReportAsset = {
  label: string;
  kind: string;
  widthPx: number;
  heightPx: number;
  /** Small preview as a data URL (webp), safe to inline in the share page. */
  thumb: string;
};

export type StoredReport = {
  v: 1;
  createdAt: string;
  platform: string;
  verdict: string;
  calculated: CalculatedReport;
  readout: ReturnType<typeof clientReadout>;
  assets: StoredReportAsset[];
  benchmarkEvidence?: BenchmarkEvidence[];
};

export function newReportId(): string {
  // 12 url-safe chars ≈ 71 bits - unguessable, short enough to share.
  return crypto.randomBytes(9).toString("base64url");
}

export async function saveReport(args: {
  platform: string;
  verdict: string;
  calculated: CalculatedReport;
  observations: Observations;
  assets: StoredReportAsset[];
  benchmarkEvidence?: BenchmarkEvidence[];
}): Promise<string | null> {
  const id = newReportId();
  const doc: StoredReport = {
    v: 1,
    createdAt: new Date().toISOString(),
    platform: args.platform,
    verdict: args.verdict,
    calculated: args.calculated,
    readout: clientReadout(args.observations),
    assets: args.assets,
    benchmarkEvidence: args.benchmarkEvidence,
  };

  try {
    await redis.set(`${REPORT_KEY_PREFIX}${id}`, doc, {
      ex: REPORT_TTL_SECONDS,
    });
    return id;
  } catch (err) {
    console.error("report save failed", err);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reports expire after 90 days, but the landing-page sample must stay alive:
 * every successful read of the featured report re-arms its TTL.
 */
export async function refreshReportTtl(id: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) return;
  try {
    await redis.expire(`${REPORT_KEY_PREFIX}${id}`, REPORT_TTL_SECONDS);
  } catch (err) {
    console.error("report ttl refresh failed", err);
  }
}

export async function loadReport(id: string): Promise<StoredReport | null> {
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) return null;

  try {
    const doc = await redis.get<StoredReport>(`${REPORT_KEY_PREFIX}${id}`);
    if (
      !isRecord(doc) ||
      doc.v !== 1 ||
      !isRecord(doc.calculated) ||
      typeof doc.calculated.launchScore !== "number"
    ) {
      return null;
    }
    return doc;
  } catch (err) {
    console.error("report load failed", err);
    return null;
  }
}
