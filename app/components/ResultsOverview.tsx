"use client";

import type { CSSProperties } from "react";
import { CountUpValue, ScoreRadar, type RadarRow } from "./reportFx";

type Fix = { action: string; why: string; change: string };
type Risk = { assessed: boolean; level: string; reason?: string };
const names: Record<string, string> = { Shelf: "Small-size readability", Click: "Visual hook", Gameplay: "Gameplay clarity", Emotion: "Emotional appeal", Marketing: "Store messaging", Polish: "Visual polish" };
const tone = (value: number) => value >= 80 ? "good" : value >= 50 ? "warn" : "bad";

export default function ResultsOverview({ score, rows, mode, priorities, risk }: { score: number; rows: RadarRow[]; mode: string; priorities: number; risk?: Risk | null }) {
  const assessed = rows.filter(row => row.value !== null);
  const status = score >= 78 ? "Strong visual signals" : score < 55 ? "Needs rework" : "Room to improve";
  return <section className="results-overview" aria-label="Analysis overview">
    <div className="results-summary">
      <p className="results-label">Artwork score</p>
      <div className="results-score" data-tone={tone(score)} aria-label={`${score} out of 100`}><span aria-hidden="true"><CountUpValue value={score} /></span><small aria-hidden="true">/100</small></div>
      <h2 data-tone={tone(score)}>{status}</h2>
      <p className="results-mode">{mode}</p>
      <dl className="results-stats"><div><dt>Assessed</dt><dd>{assessed.length}<small> / {rows.length}</small></dd></div><div><dt>Priorities</dt><dd>{priorities}</dd></div></dl>
    </div>
    <div className="results-metrics"><header><h2>Score breakdown</h2><span>0–100</span></header>
      <div className="results-bars">{rows.map((row, index) => <div className="results-metric" key={row.label} data-tone={row.value === null ? "none" : tone(row.value)}>
        <div><span>{names[row.label] || row.label}</span><strong>{row.value === null ? "Not assessed" : row.value}</strong></div>
        <div className="results-track" role={row.value === null ? undefined : "meter"} aria-label={names[row.label] || row.label} aria-valuenow={row.value ?? undefined} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${row.value ?? 0}%`, "--bar-delay": `${index * 65}ms` } as CSSProperties} /></div>
      </div>)}</div>
    </div>
    <div className="results-profile"><h2>Visual profile</h2><ScoreRadar rows={rows} size={280} /><span>Unassessed signals have no score.</span></div>
    <footer><span>AI-assisted visual review</span><span>{risk?.assessed ? `Communication risk: ${risk.level}` : "Gameplay: add screenshots"}</span><span>Not audience or sales data</span></footer>
  </section>;
}

export function ResultPriorities({ fixes }: { fixes: Fix[] }) {
  if (!fixes.length) return null;
  return <section className="result-priorities"><header><h2>Priorities</h2><span>{fixes.length} recommended {fixes.length === 1 ? "change" : "changes"}</span></header><ol>{fixes.map((fix,index) => <li key={`${index}-${fix.action}`}><span className="priority-number">{String(index+1).padStart(2,"0")}</span><div><h3>{fix.action}</h3>{fix.change && fix.change.trim() !== fix.action.trim() && <p>{fix.change}</p>}{fix.why && <details><summary>Evidence</summary><p>{fix.why}</p></details>}</div></li>)}</ol></section>;
}
