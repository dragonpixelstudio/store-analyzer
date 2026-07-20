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
 * Six-axis score radar. Unassessed axes render dimmed at the center so the
 * shape never lies about missing inputs.
 */
export function ScoreRadar({ rows, size = 300 }: { rows: RadarRow[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = size * 0.335;
  const angle = (i: number) => ((Math.PI * 2) / rows.length) * i - Math.PI / 2;
  const pt = (i: number, frac: number) => ({
    x: cx + Math.cos(angle(i)) * radius * frac,
    y: cy + Math.sin(angle(i)) * radius * frac,
  });
  const ringPath = (frac: number) =>
    rows.map((_, i) => `${pt(i, frac).x},${pt(i, frac).y}`).join(" ");
  const dataPath = rows
    .map((row, i) => {
      const frac = row.value === null ? 0.04 : Math.max(0.04, row.value / 100);
      return `${pt(i, frac).x},${pt(i, frac).y}`;
    })
    .join(" ");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${size} ${size + 10}`}
      className="mx-auto max-w-[340px]"
      role="img"
      aria-label="Score profile radar"
    >
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <polygon
          key={frac}
          points={ringPath(frac)}
          fill="none"
          stroke="rgba(255,255,255,.07)"
          strokeWidth={1}
        />
      ))}
      {rows.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={pt(i, 1).x}
          y2={pt(i, 1).y}
          stroke="rgba(255,255,255,.06)"
          strokeWidth={1}
        />
      ))}
      <polygon
        className="dpx-radar-poly"
        points={dataPath}
        fill="rgba(24,224,255,.18)"
        stroke="var(--cyan)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {rows.map((row, i) => {
        const frac = row.value === null ? 0.04 : Math.max(0.04, row.value / 100);
        const p = pt(i, frac);
        return row.value === null ? null : (
          <circle key={`d-${i}`} cx={p.x} cy={p.y} r={3.2} fill="var(--cyan)" />
        );
      })}
      {rows.map((row, i) => {
        const lp = pt(i, 1.24);
        const assessed = row.value !== null;
        return (
          <text
            key={`l-${i}`}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11.5}
            fontWeight={700}
            fill={assessed ? "#aab4c8" : "#4a5266"}
          >
            {row.label}
            <tspan
              x={lp.x}
              dy={13}
              fontSize={11}
              fontWeight={800}
              fill={assessed ? scoreColor(row.value as number) : "#4a5266"}
            >
              {assessed ? row.value : "n/a"}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
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
