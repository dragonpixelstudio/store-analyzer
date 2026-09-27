// Procedural demo "gameplay" for the Studio's screenshot templates.
// These scenes are drawn in code - they are not from any real game - so the
// gallery can demonstrate the templates without borrowing anyone's footage.
//
//   node scripts/make-demo-gameplay.mjs
//
// Writes public/gallery/demo-gameplay-1.webp (neon arena shooter) and
// public/gallery/demo-gameplay-2.webp (bright sky platformer).

import sharp from "sharp";

const W = 1600;
const H = 900;

// Deterministic PRNG so the scenes are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------ scene 1: neon ----------------------------- */

function neonArena() {
  const r = rng(7);
  const parts = [];
  const enemyShapes = {
    diamond: (s) => `<path d="M0 ${-s} L${s} 0 L0 ${s} L${-s} 0Z"/>`,
    tri: (s) => `<path d="M0 ${-s} L${s * 0.9} ${s * 0.7} L${-s * 0.9} ${s * 0.7}Z"/>`,
    ring: (s) => `<circle r="${s * 0.8}"/><circle r="${s * 0.35}"/>`,
    square: (s) => `<rect x="${-s * 0.75}" y="${-s * 0.75}" width="${s * 1.5}" height="${s * 1.5}" rx="3"/>`,
  };
  const palette = [
    ["diamond", "#ff46b8"],
    ["tri", "#ff8a3d"],
    ["ring", "#69ff00"],
    ["square", "#b26bff"],
  ];

  // enemy swarm arcing around the right side
  for (let i = 0; i < 34; i++) {
    const a = -1.25 + (i / 33) * 2.5 + (r() - 0.5) * 0.18;
    const rad = 330 + r() * 180;
    const x = 1080 + Math.cos(a) * rad * 0.9 - 120;
    const y = 450 + Math.sin(a) * rad * 0.95;
    if (x < 70 || x > W - 70 || y < 110 || y > H - 90) continue;
    // keep clear of the boss, the shield HUD, and the wave bar
    if (Math.hypot(x - 1250, y - 440) < 175) continue;
    if (x > 1220 && y < 150) continue;
    if (y > 780 && x > 580 && x < 1020) continue;
    const [shape, color] = palette[Math.floor(r() * palette.length)];
    const s = 13 + r() * 9;
    parts.push(
      `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${Math.floor(r() * 90)})" fill="none" stroke="${color}" stroke-width="4" filter="url(#glow)">${enemyShapes[shape](s)}</g>`
    );
  }

  // boss hexagon
  const hex = (R) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return `${(Math.cos(a) * R).toFixed(1)},${(Math.sin(a) * R).toFixed(1)}`;
    }).join(" ");
  parts.push(`<g transform="translate(1250 440)" filter="url(#glowBig)">
    <polygon points="${hex(96)}" fill="rgba(255,70,184,.08)" stroke="#ff46b8" stroke-width="6"/>
    <polygon points="${hex(62)}" fill="none" stroke="#ff9ad6" stroke-width="4"/>
    <circle r="24" fill="#ffd6ef"/>
    <path d="M-150 0 A150 150 0 0 1 0 -150" fill="none" stroke="#18d7ff" stroke-width="5" stroke-dasharray="18 12"/>
    <path d="M150 0 A150 150 0 0 1 0 150" fill="none" stroke="#18d7ff" stroke-width="5" stroke-dasharray="18 12"/>
  </g>`);

  // bullet stream from hero toward the boss
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 640 + t * 470;
    const y = 470 - t * 28 + (i % 2 ? 9 : -9);
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" width="34" height="8" rx="4" fill="#bff6ff" filter="url(#glow)" transform="rotate(-3.4 ${x} ${y})"/>`
    );
  }

  // explosions
  const burst = (cx, cy, color, n, len) => {
    let out = "";
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n + r() * 0.2;
      const l1 = 10 + r() * 6;
      const l2 = l1 + len * (0.6 + r() * 0.5);
      out += `<line x1="${(cx + Math.cos(a) * l1).toFixed(1)}" y1="${(cy + Math.sin(a) * l1).toFixed(1)}" x2="${(cx + Math.cos(a) * l2).toFixed(1)}" y2="${(cy + Math.sin(a) * l2).toFixed(1)}" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`;
    }
    return `<g filter="url(#glow)">${out}<circle cx="${cx}" cy="${cy}" r="9" fill="#fff"/></g>`;
  };
  parts.push(burst(980, 330, "#ffc23d", 14, 46));
  parts.push(burst(1060, 600, "#ff46b8", 12, 38));
  parts.push(burst(870, 520, "#69ff00", 10, 30));

  // pickups
  for (let i = 0; i < 7; i++) {
    const x = 720 + r() * 360;
    const y = 250 + r() * 420;
    parts.push(
      `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" d="M0 -9 L7 0 L0 9 L-7 0Z" fill="#ffc23d" filter="url(#glow)"/>`
    );
  }

  // hero ship with engine trail
  parts.push(`<g transform="translate(600 478) rotate(-4)">
    <path d="M-150 0 L-40 -8 L-40 8Z" fill="url(#trail)"/>
    <g filter="url(#glowBig)">
      <path d="M44 0 L-26 -30 L-12 0 L-26 30Z" fill="#0e2a44" stroke="#18d7ff" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="4" r="7" fill="#e8fbff"/>
    </g>
  </g>`);

  const hud = `
  <g font-family="Arial, Helvetica, sans-serif" font-weight="700">
    <rect x="64" y="58" width="300" height="84" rx="12" fill="rgba(10,8,30,.72)" stroke="rgba(24,215,255,.55)" stroke-width="2"/>
    <text x="86" y="92" font-size="18" fill="#8fe9ff" letter-spacing="3">SCORE</text>
    <text x="86" y="128" font-size="34" fill="#ffffff">128,450</text>
    <text x="300" y="128" font-size="24" fill="#ffc23d" text-anchor="end">x12</text>
    <g transform="translate(1250 70)">
      ${[0, 1, 2, 3, 4]
        .map(
          (k) =>
            `<rect x="${k * 54}" y="0" width="46" height="18" rx="4" fill="${k < 4 ? "#69ff00" : "rgba(255,255,255,.16)"}"/>`
        )
        .join("")}
      <text x="0" y="50" font-size="17" fill="#c9f7a0" letter-spacing="3">SHIELD</text>
    </g>
    <g transform="translate(620 820)">
      <text x="180" y="0" font-size="20" fill="#ffffff" text-anchor="middle" letter-spacing="4">WAVE 7 / 10</text>
      <rect x="0" y="16" width="360" height="10" rx="5" fill="rgba(255,255,255,.14)"/>
      <rect x="0" y="16" width="250" height="10" rx="5" fill="#b26bff"/>
    </g>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="floor" cx="45%" cy="50%" r="80%">
      <stop offset="0" stop-color="#241a5c"/><stop offset=".6" stop-color="#140f38"/><stop offset="1" stop-color="#080620"/>
    </radialGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="#4b3aa6" stroke-width="1.3" opacity=".5"/>
    </pattern>
    <linearGradient id="trail" x1="0" x2="1">
      <stop offset="0" stop-color="#18d7ff" stop-opacity="0"/><stop offset="1" stop-color="#18d7ff" stop-opacity=".8"/>
    </linearGradient>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowBig" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#floor)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="22" fill="none" stroke="#18d7ff" stroke-width="3" opacity=".55" filter="url(#glow)"/>
  ${parts.join("\n  ")}
  ${hud}
</svg>`;
}

/* --------------------------- scene 2: platformer --------------------------- */

function skyPlatformer() {
  const r = rng(21);
  const cloud = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff" opacity=".92">
      <ellipse cx="0" cy="0" rx="70" ry="34"/><ellipse cx="-52" cy="10" rx="48" ry="26"/>
      <ellipse cx="54" cy="12" rx="52" ry="24"/><ellipse cx="10" cy="-22" rx="44" ry="30"/>
    </g>`;
  const hill = (points, fill) => `<path d="${points}" fill="${fill}"/>`;
  const platform = (x, y, w) =>
    `<g transform="translate(${x} ${y})">
      <rect x="0" y="10" width="${w}" height="46" rx="14" fill="#9a6435"/>
      <rect x="10" y="30" width="${w - 20}" height="8" rx="4" fill="#7d4e28" opacity=".6"/>
      <rect x="-6" y="0" width="${w + 12}" height="22" rx="11" fill="#5ed447"/>
      <rect x="-6" y="0" width="${w + 12}" height="9" rx="4.5" fill="#8cf06b"/>
    </g>`;
  const coin = (x, y) =>
    `<g transform="translate(${x} ${y})">
      <circle r="17" fill="#ffc83d" stroke="#d98a0b" stroke-width="4"/>
      <rect x="-3.5" y="-9" width="7" height="18" rx="3.5" fill="#fff3b0"/>
    </g>`;
  const tree = (x, y, s, c) =>
    `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-9" y="-10" width="18" height="70" rx="6" fill="#8a5a33"/>
      <circle cx="0" cy="-40" r="52" fill="${c}"/><circle cx="-26" cy="-22" r="30" fill="${c}"/>
      <circle cx="28" cy="-20" r="32" fill="${c}"/>
      <circle cx="-14" cy="-58" r="16" fill="#ffffff" opacity=".18"/>
    </g>`;

  const coins = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    coins.push(coin(Math.round(700 + t * 300), Math.round(300 - Math.sin(t * Math.PI) * 90)));
  }
  for (let i = 0; i < 4; i++) coins.push(coin(1180 + i * 48, 505));

  const flowers = Array.from({ length: 16 }, () => {
    const x = 40 + r() * 1520;
    const y = 792 + r() * 40;
    const c = ["#ff5a8a", "#ffd23d", "#ffffff", "#b26bff"][Math.floor(r() * 4)];
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><rect x="-1.5" y="0" width="3" height="16" fill="#3e9a3a"/><circle r="7" fill="${c}"/><circle r="3" fill="#ffe27a"/></g>`;
  }).join("");

  const hero = `<g transform="translate(560 420) rotate(-8)">
    <path d="M-110 30 Q-70 20 -40 26" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".7" fill="none"/>
    <path d="M-120 58 Q-80 50 -44 54" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".5" fill="none"/>
    <ellipse cx="-14" cy="78" rx="18" ry="12" fill="#c43b3b"/><ellipse cx="22" cy="80" rx="18" ry="12" fill="#c43b3b"/>
    <rect x="-44" y="-40" width="92" height="112" rx="40" fill="#ff5a5a"/>
    <rect x="-44" y="-40" width="92" height="40" rx="20" fill="#ff7b6b"/>
    <path d="M-44 -6 Q-70 -30 -86 -58" stroke="#ff5a5a" stroke-width="16" stroke-linecap="round" fill="none"/>
    <ellipse cx="-2" cy="-4" rx="13" ry="17" fill="#ffffff"/><ellipse cx="28" cy="-4" rx="13" ry="17" fill="#ffffff"/>
    <circle cx="2" cy="-1" r="7" fill="#1d1a3a"/><circle cx="32" cy="-1" r="7" fill="#1d1a3a"/>
    <path d="M4 28 Q16 38 30 28" stroke="#7a1f1f" stroke-width="5" stroke-linecap="round" fill="none"/>
  </g>`;

  const spiky = `<g transform="translate(1235 585)">
    ${Array.from({ length: 12 }, (_, k) => {
      const a = (Math.PI * 2 * k) / 12;
      return `<path d="M${(Math.cos(a) * 30).toFixed(1)} ${(Math.sin(a) * 30).toFixed(1)} L${(Math.cos(a + 0.26) * 30).toFixed(1)} ${(Math.sin(a + 0.26) * 30).toFixed(1)} L${(Math.cos(a + 0.13) * 50).toFixed(1)} ${(Math.sin(a + 0.13) * 50).toFixed(1)}Z" fill="#4b2a7a"/>`;
    }).join("")}
    <circle r="32" fill="#6a3aa8"/><ellipse cx="-10" cy="-4" rx="7" ry="9" fill="#fff"/><ellipse cx="12" cy="-4" rx="7" ry="9" fill="#fff"/>
    <circle cx="-8" cy="-2" r="3.5" fill="#1d1a3a"/><circle cx="14" cy="-2" r="3.5" fill="#1d1a3a"/>
  </g>`;

  const bee = `<g transform="translate(980 170) rotate(8)">
    <ellipse cx="-14" cy="-26" rx="16" ry="11" fill="#ffffff" opacity=".85"/><ellipse cx="12" cy="-28" rx="16" ry="11" fill="#ffffff" opacity=".85"/>
    <ellipse rx="34" ry="24" fill="#ffd23d"/>
    <rect x="-10" y="-24" width="10" height="48" fill="#2b2140"/><rect x="12" y="-22" width="9" height="44" fill="#2b2140"/>
    <circle cx="-22" cy="-4" r="4.5" fill="#2b2140"/>
  </g>`;

  const hud = `
  <g font-family="Arial, Helvetica, sans-serif" font-weight="900">
    <g transform="translate(70 70)">
      <circle r="20" fill="#ffc83d" stroke="#d98a0b" stroke-width="4"/>
      <text x="36" y="12" font-size="34" fill="#ffffff" stroke="#2b2140" stroke-width="7" paint-order="stroke">× 48</text>
    </g>
    <g transform="translate(70 128)" fill="#ff4f6d" stroke="#2b2140" stroke-width="4">
      ${[0, 1, 2]
        .map(
          (k) =>
            `<path transform="translate(${k * 44} 0)" d="M0 8 C0 -6 18 -8 18 6 C18 -8 36 -6 36 8 C36 22 18 30 18 36 C18 30 0 22 0 8Z" ${k === 2 ? 'fill="rgba(255,255,255,.35)"' : ""}/>`
        )
        .join("")}
    </g>
    <text x="1530" y="92" font-size="30" fill="#ffffff" stroke="#2b2140" stroke-width="7" paint-order="stroke" text-anchor="end">WORLD 2-3</text>
    <text x="1530" y="136" font-size="26" fill="#fff3b0" stroke="#2b2140" stroke-width="6" paint-order="stroke" text-anchor="end">TIME 274</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5bbcff"/><stop offset=".65" stop-color="#a8e3ff"/><stop offset="1" stop-color="#e2f7ff"/>
    </linearGradient>
    <radialGradient id="sun"><stop offset="0" stop-color="#fff7c2"/><stop offset=".5" stop-color="#ffe066"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1330" cy="190" r="150" fill="url(#sun)"/>
  <circle cx="1330" cy="190" r="62" fill="#fff3a6"/>
  ${cloud(260, 170, 1.1)}${cloud(760, 110, 0.8)}${cloud(1500, 330, 0.9)}
  ${hill("M0 640 Q200 470 420 600 Q620 440 860 590 Q1100 460 1320 600 Q1480 520 1600 580 V900 H0Z", "#a6e38c")}
  ${hill("M0 720 Q180 600 380 700 Q600 590 820 700 Q1060 610 1260 710 Q1440 640 1600 700 V900 H0Z", "#6fcb5c")}
  ${tree(150, 720, 1, "#3fae4a")}${tree(1460, 730, 0.85, "#48b84e")}${tree(1040, 745, 0.7, "#3fae4a")}
  <rect x="0" y="786" width="${W}" height="114" fill="#8a5a33"/>
  <rect x="0" y="770" width="${W}" height="30" rx="0" fill="#5ed447"/>
  <rect x="0" y="770" width="${W}" height="11" fill="#8cf06b"/>
  ${flowers}
  ${platform(180, 560, 260)}${platform(640, 470, 200)}${platform(1080, 630, 320)}
  ${coins.join("")}
  ${bee}${spiky}${hero}
  ${hud}
</svg>`;
}

for (const [name, svg] of [
  ["demo-gameplay-1", neonArena()],
  ["demo-gameplay-2", skyPlatformer()],
]) {
  const out = `public/gallery/${name}.webp`;
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(out);
  console.log("wrote", out);
}
