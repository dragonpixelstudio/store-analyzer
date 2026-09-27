// Composition blueprints: diagrams of where the subject, title, and threats
// sit in each recipe. Shown on gallery cards until a generated example exists
// - a diagram, never a fake "output".

import type { StudioAiType } from "@/lib/studio";

const C = { subject: "#18d7ff", title: "#ffc23d", threat: "#ff46b8", calm: "#69ff00" };

function Subject({ d, color = C.subject }: { d: string; color?: string }) {
  return <path d={d} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />;
}

function Title({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={C.title} fillOpacity={0.16} stroke={C.title} strokeWidth={1.6} />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3}
        textAnchor="middle"
        fontSize={Math.min(9, h * 0.55)}
        fontWeight={800}
        letterSpacing={1.5}
        fill={C.title}
        style={{ fontFamily: "var(--font-brand), sans-serif" }}
      >
        TITLE
      </text>
    </g>
  );
}

const bust = (cx: number, cy: number, s: number) =>
  `M${cx - 0.9 * s} ${cy + 1.35 * s} C${cx - 0.9 * s} ${cy + 0.55 * s} ${cx - 0.55 * s} ${cy + 0.35 * s} ${cx - 0.3 * s} ${cy + 0.3 * s}
   A${0.45 * s} ${0.5 * s} 0 1 1 ${cx + 0.3 * s} ${cy + 0.3 * s}
   C${cx + 0.55 * s} ${cy + 0.35 * s} ${cx + 0.9 * s} ${cy + 0.55 * s} ${cx + 0.9 * s} ${cy + 1.35 * s}Z`;

const figure = (cx: number, base: number, h: number) =>
  `M${cx - 0.28 * h} ${base} L${cx - 0.18 * h} ${base - 0.55 * h} A${0.14 * h} ${0.14 * h} 0 1 1 ${cx + 0.18 * h} ${base - 0.55 * h} L${cx + 0.28 * h} ${base}Z`;

const LAYOUTS: Record<string, React.ReactNode> = {
  "icon-mascot-face": (
    <>
      <circle cx={50} cy={52} r={42} fill="none" stroke={C.subject} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="3 3" />
      <Subject d="M50 16 A36 36 0 1 1 49.9 16Z" />
      <circle cx={38} cy={48} r={6} fill={C.subject} /><circle cx={62} cy={48} r={6} fill={C.subject} />
      <path d="M38 68 Q50 78 62 68" fill="none" stroke={C.subject} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  "icon-hero-action": (
    <>
      <Subject d={bust(44, 30, 34)} />
      <rect x={18} y={60} width={78} height={9} rx={3} transform="rotate(-28 57 64)" fill={C.threat} fillOpacity={0.2} stroke={C.threat} strokeWidth={1.6} />
    </>
  ),
  "icon-emblem": (
    <>
      <circle cx={50} cy={50} r={38} fill={C.title} fillOpacity={0.06} />
      <Subject d="M50 12 C66 34 74 44 74 60 A24 24 0 0 1 26 60 C26 44 34 34 50 12Z" color={C.title} />
      <path d="M50 44 C57 54 60 58 60 64 A10 10 0 0 1 40 64 C40 58 43 54 50 44Z" fill={C.title} fillOpacity={0.5} />
    </>
  ),
  "icon-creature": (
    <>
      <Subject d="M8 92 L20 40 L34 58 L50 22 L66 58 L80 40 L92 92Z" color={C.threat} />
      <circle cx={50} cy={62} r={9} fill={C.threat} />
      <circle cx={50} cy={62} r={17} fill="none" stroke={C.threat} strokeOpacity={0.45} />
    </>
  ),
  "icon-cozy-companion": (
    <>
      <circle cx={50} cy={54} r={40} fill="none" stroke={C.calm} strokeOpacity={0.4} strokeWidth={1.2} />
      <Subject d="M50 30 C72 30 80 48 80 62 C80 78 66 86 50 86 C34 86 20 78 20 62 C20 48 28 30 50 30Z" color={C.calm} />
      <path d="M50 30 L50 16 M50 20 Q58 12 64 16 Q56 22 50 20" fill="none" stroke={C.calm} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={41} cy={58} r={5} fill={C.calm} /><circle cx={59} cy={58} r={5} fill={C.calm} />
    </>
  ),
  "icon-pixel-hero": (
    <g fill={C.subject} fillOpacity={0.2} stroke={C.subject} strokeWidth={1.4}>
      {[
        [34, 22], [42, 22], [50, 22], [58, 22],
        [26, 30], [34, 30], [42, 30], [50, 30], [58, 30], [66, 30],
        [26, 38], [66, 38], [26, 46], [66, 46],
        [34, 54], [42, 54], [50, 54], [58, 54],
        [30, 62], [38, 62], [46, 62], [54, 62], [62, 62],
        [22, 70], [30, 70], [62, 70], [70, 70],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={8} height={8} />
      ))}
      <rect x={76} y={14} width={6} height={50} fill={C.title} stroke={C.title} />
    </g>
  ),
  "capsule-logo-hero": (
    <>
      <Title x={10} y={34} w={86} h={32} />
      <Subject d={figure(160, 96, 84)} />
    </>
  ),
  "capsule-centered-epic": (
    <>
      <Subject d="M52 100 L80 30 L107 10 L134 30 L162 100Z" color={C.threat} />
      <Title x={52} y={38} w={110} h={26} />
      <Subject d={figure(107, 96, 22)} />
    </>
  ),
  "capsule-versus": (
    <>
      <Title x={72} y={8} w={70} h={18} />
      <Subject d={figure(40, 98, 70)} />
      <Subject d={figure(174, 98, 70)} color={C.threat} />
      <path d="M100 56 L107 46 L114 56 L107 66Z" fill={C.title} />
      <path d="M92 62 L122 50" stroke={C.title} strokeWidth={1.4} />
    </>
  ),
  "capsule-cozy-world": (
    <>
      <Title x={72} y={8} w={70} h={20} />
      <path d="M0 78 Q50 52 104 74 Q156 50 214 70 L214 100 L0 100Z" fill={C.calm} fillOpacity={0.14} stroke={C.calm} strokeWidth={1.4} />
      <path d="M140 72 L140 56 L152 46 L164 56 L164 72Z" fill={C.title} fillOpacity={0.18} stroke={C.title} strokeWidth={1.4} />
      <Subject d={figure(70, 82, 16)} color={C.calm} /><Subject d={figure(92, 80, 14)} color={C.calm} />
    </>
  ),
  "capsule-horde": (
    <>
      <Title x={57} y={6} w={100} h={22} />
      <g fill={C.threat} fillOpacity={0.55}>
        {[
          [22, 48], [36, 64], [18, 80], [44, 86], [30, 40], [52, 72], [190, 48], [176, 64], [196, 80], [168, 86],
          [182, 40], [160, 72], [62, 90], [150, 92], [70, 58], [144, 58],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={4.5} />
        ))}
      </g>
      <Subject d={figure(107, 98, 42)} />
      <circle cx={107} cy={70} r={24} fill="none" stroke={C.subject} strokeOpacity={0.4} strokeDasharray="3 3" />
    </>
  ),
  "capsule-dread": (
    <>
      <Title x={8} y={26} w={70} h={20} />
      <Subject d="M120 100 C126 60 150 34 172 34 C194 34 208 60 212 100Z" color={C.threat} />
      <Subject d={figure(42, 96, 34)} />
      <circle cx={54} cy={72} r={4} fill={C.title} />
      <circle cx={54} cy={72} r={14} fill={C.title} fillOpacity={0.12} />
    </>
  ),
};

export default function CompositionBlueprint({ recipeId, type }: { recipeId: string; type: StudioAiType }) {
  const w = type === "icon" ? 100 : 214;
  const h = 100;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label="Composition blueprint">
      <rect width={w} height={h} style={{ fill: "var(--well)" }} />
      <g stroke="rgba(255,255,255,.09)" strokeWidth={0.6} strokeDasharray="2 3">
        <line x1={w / 3} y1={0} x2={w / 3} y2={h} />
        <line x1={(2 * w) / 3} y1={0} x2={(2 * w) / 3} y2={h} />
        <line x1={0} y1={h / 3} x2={w} y2={h / 3} />
        <line x1={0} y1={(2 * h) / 3} x2={w} y2={(2 * h) / 3} />
      </g>
      {LAYOUTS[recipeId]}
    </svg>
  );
}
