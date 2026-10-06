"use client";

// Report presentation layer: animated score ring, six-axis score radar, and
// scroll-choreographed card reveals. Shared by the live dashboard and the
// public /report pages so shared links look as dynamic as the app itself.

import { useEffect, useRef, useState } from "react";

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const scoreColor = (v: number) =>
  v >= 80 ? "var(--green)" : v >= 50 ? "var(--gold)" : "var(--magenta)";

/**
 * Circular launch-score gauge. The solid arc sweeps to the score; a faint
 * dashed arc continues to the honest potential so the gap the fixes can close
 * is literally visible.
 */
export function ScoreRing({
  score,
  potential,
  size = 172,
}: {
  score: number;
  potential?: number | null;
  size?: number;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // setTimeout, not rAF: rAF never fires in hidden tabs, and report links
    // are often opened in the background - the arcs must still settle there.
    const id = setTimeout(() => setArmed(true), 30);
    return () => clearTimeout(id);
  }, []);

  const val = useCountUp(score);
  const stroke = Math.max(8, Math.round(size / 16));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const shown = armed ? score : 0;
  const color = scoreColor(score);
  const hasPotential = typeof potential === "number" && potential > score;

  // True dashed arc from the score angle to the potential angle. An SVG path,
  // not a dashoffset trick, so the dash pattern actually survives - and no
  // drop-shadow filter anywhere: SVG filter regions clip to a square box,
  // which reads as a faint square outline around the gauge.
  const polar = (pct: number) => {
    const a = ((pct / 100) * 360 - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const potentialArc = hasPotential
    ? (() => {
        const from = polar(score);
        const to = polar(potential as number);
        const largeArc = (potential as number) - score > 50 ? 1 : 0;
        return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
      })()
    : null;

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      {/* circular glow: a radial gradient div, never an SVG filter */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-3 rounded-full"
        style={{
          background: `radial-gradient(circle, transparent 54%, ${
            color === "var(--green)"
              ? "rgba(105,255,0,.14)"
              : color === "var(--gold)"
                ? "rgba(255,194,61,.14)"
                : "rgba(255,61,180,.14)"
          } 67%, transparent 78%)`,
          opacity: armed ? 1 : 0,
          transition: "opacity .8s ease .3s",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,.06)"
          strokeWidth={stroke - 3}
        />
        {potentialArc && (
          <path
            d={potentialArc}
            fill="none"
            stroke="var(--green)"
            strokeOpacity={0.55}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="1.5 6"
            style={{
              opacity: armed ? 1 : 0,
              transition: "opacity .6s ease .9s",
            }}
          />
        )}
        <circle
          className="dpx-ring-arc"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            strokeDasharray: c,
            strokeDashoffset: c * (1 - shown / 100),
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-score font-black leading-none"
          style={{ color, fontSize: Math.round(size * 0.26) }}
        >
          {val}
        </div>
        <div className="font-brand mt-0.5 text-[12px] font-bold text-[var(--faint)]">/100</div>
      </div>
    </div>
  );
}

export type RadarRow = {
  label: string;
  /** null = not assessed for this upload */
  value: number | null;
};

/**
 * Six-axis score radar. Missing values leave gaps, never zero-valued vertices.
 */
export function ScoreRadar({ rows, size = 320 }: { rows: RadarRow[]; size?: number }) {
  const assessed = rows.filter(row => row.value !== null);
  const [selected, setSelected] = useState(0);
  const active = assessed[selected] ?? assessed[0];
  const fullNames: Record<string, string> = { Shelf: "Small-size readability", Click: "Visual hook", Gameplay: "Gameplay clarity", Emotion: "Emotional appeal", Marketing: "Store messaging", Polish: "Visual polish" };
  const center = size / 2, radius = size * .32;
  const point = (i: number, fraction: number) => { const angle = i * Math.PI * 2 / Math.max(3, assessed.length) - Math.PI / 2; return { x: center + Math.cos(angle) * radius * fraction, y: center + Math.sin(angle) * radius * fraction }; };
  const ring = (fraction: number) => assessed.map((_, i) => { const p = point(i, fraction); return p.x + "," + p.y; }).join(" ");
  const polygon = assessed.map((row, i) => { const p = point(i, Math.max(0, Math.min(100, row.value!)) / 100); return p.x + "," + p.y; }).join(" ");
  return <div className="interactive-profile">
    <svg viewBox={"0 0 " + size + " " + size} role="img" aria-label={"Visual profile. " + assessed.map(row => (fullNames[row.label] || row.label) + ": " + row.value + " out of 100").join("; ")}>
      {[.25,.5,.75,1].map(f => <polygon key={f} points={ring(f)} fill="none" stroke="#48505a" strokeOpacity={.65} />)}
      {assessed.map((row, i) => { const p = point(i, 1), label = point(i, 1.22), data = point(i, row.value! / 100); return <g key={row.label}><line x1={center} y1={center} x2={p.x} y2={p.y} stroke="#4b515b" strokeDasharray="3 5" /><text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#d4d9e1" fontSize="14" fontWeight="650">{row.label}<tspan x={label.x} dy="19" fill={scoreColor(row.value!)} fontSize="17" fontWeight="750">{row.value}</tspan></text><circle cx={data.x} cy={data.y} r={selected === i ? 6 : 4} fill="#ffc065" /></g>; })}
      {assessed.length >= 3 && <polygon className="profile-shape" points={polygon} fill="rgba(255,192,101,.14)" stroke="#ffc065" strokeWidth="2.5" strokeLinejoin="round" />}
    </svg>
    <div className="profile-select" role="group" aria-label="Inspect profile signal">{assessed.map((row, i) => <button type="button" key={row.label} aria-pressed={selected === i} onClick={() => setSelected(i)}>{row.label}</button>)}</div>
    <output className="profile-readout" aria-live="polite">{active ? <><strong style={{ color: scoreColor(active.value!) }}>{active.value}<small>/100</small></strong><span>{fullNames[active.label] || active.label}</span></> : <span>No signals assessed</span>}</output>
    {assessed.length < rows.length && <span className="profile-unassessed">{rows.length - assessed.length} signals not assessed</span>}
  </div>;
}

/**
 * Wraps the report column: every direct child that starts below the fold
 * slides in as it enters the viewport. Above-the-fold content is untouched,
 * so there is no first-paint flash and no-JS readers lose nothing.
 */
export function RevealFlow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const kids = Array.from(root.children) as HTMLElement[];
    const foldLine = window.innerHeight * 0.92;
    const below = kids.filter(
      (kid) => kid.getBoundingClientRect().top > foldLine
    );
    below.forEach((kid) => kid.classList.add("dpx-reveal"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("dpx-reveal-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08 }
    );
    below.forEach((kid) => observer.observe(kid));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}

/** Count-up for metric tiles (benchmark measurements etc.). */
export function CountUpValue({
  value,
  suffix = "",
  duration = 900,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const shown = useCountUp(Math.round(value * 10), duration);
  return (
    <>
      {(shown / 10).toFixed(value % 1 === 0 ? 0 : 1)}
      {suffix}
    </>
  );
}
