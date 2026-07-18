"use client";

// Store shelf simulator: renders the user's real icon inside simulated store
// surfaces - a dark search-results list and a light top-charts grid - between
// genre-matched published reference tiles, so the "would you tap it?" question
// is answered visually instead of by a score. Procedural decoys remain only as
// an offline fallback when a store does not expose usable reference artwork.

type Decoy = {
  name: string;
  rating: string;
  from: string;
  to: string;
  glyph: "orb" | "gem" | "bolt" | "block" | "star" | "shield" | "coin";
  glyphColor: string;
};

const DECOYS: Decoy[] = [
  { name: "Block Puzzle Master", rating: "4.5", from: "#2a63d4", to: "#0c2f7a", glyph: "block", glyphColor: "#ffd23d" },
  { name: "Idle Factory Tycoon", rating: "4.3", from: "#f2a33c", to: "#a34d0c", glyph: "coin", glyphColor: "#fff2c4" },
  { name: "Neon Dash", rating: "4.6", from: "#1b1b3a", to: "#3d0f57", glyph: "bolt", glyphColor: "#18e0ff" },
  { name: "Bubble Pop Blitz", rating: "4.4", from: "#31b5e0", to: "#0d5e8f", glyph: "orb", glyphColor: "#ff5f9e" },
  { name: "Sniper Strike 3D", rating: "4.2", from: "#39424f", to: "#12161d", glyph: "shield", glyphColor: "#c4d4e8" },
  { name: "Gem Quest Legends", rating: "4.7", from: "#7a2ae0", to: "#330d70", glyph: "gem", glyphColor: "#5ff2c8" },
  { name: "Star Merge Empire", rating: "4.4", from: "#e04f7a", to: "#701034", glyph: "star", glyphColor: "#ffe28a" },
];

function DecoyGlyph({ glyph, color }: { glyph: Decoy["glyph"]; color: string }) {
  switch (glyph) {
    case "orb":
      return (
        <>
          <circle cx="32" cy="34" r="17" fill={color} />
          <circle cx="26" cy="27" r="6" fill="#ffffff" opacity=".55" />
        </>
      );
    case "gem":
      return <path d="M32 12 50 28 32 54 14 28Z" fill={color} stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" />;
    case "bolt":
      return <path d="M36 10 18 36h11l-3 18 20-28H34z" fill={color} />;
    case "block":
      return (
        <>
          <rect x="14" y="14" width="17" height="17" rx="3" fill={color} />
          <rect x="34" y="14" width="17" height="17" rx="3" fill="#ffffff" opacity=".85" />
          <rect x="14" y="34" width="17" height="17" rx="3" fill="#ffffff" opacity=".55" />
          <rect x="34" y="34" width="17" height="17" rx="3" fill={color} opacity=".8" />
        </>
      );
    case "star":
      return (
        <path
          d="M32 10l6.4 14.1L54 26l-11.5 10.6L45.6 52 32 43.8 18.4 52l3.1-15.4L10 26l15.6-1.9z"
          fill={color}
        />
      );
    case "shield":
      return (
        <path
          d="M32 10c6 4 12 6 18 6 0 18-6 30-18 38C20 46 14 34 14 16c6 0 12-2 18-6z"
          fill={color}
          stroke="#ffffff"
          strokeOpacity=".3"
          strokeWidth="2"
        />
      );
    case "coin":
      return (
        <>
          <circle cx="32" cy="32" r="18" fill={color} />
          <circle cx="32" cy="32" r="12" fill="none" stroke="#a3641a" strokeWidth="3" />
          <path d="M32 24v16M27 28h10M27 36h10" stroke="#a3641a" strokeWidth="3" strokeLinecap="round" />
        </>
      );
  }
}

function DecoyIcon({ decoy, className }: { decoy: Decoy; className: string }) {
  const gradId = `dpx-decoy-${decoy.glyph}-${decoy.from.slice(1)}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`${decoy.name} (sample app)`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={decoy.from} />
          <stop offset="100%" stopColor={decoy.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gradId})`} />
      <DecoyGlyph glyph={decoy.glyph} color={decoy.glyphColor} />
    </svg>
  );
}

function Stars({ rating, color }: { rating: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
      {rating}
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
      </svg>
    </span>
  );
}

type RowEntry =
  | { kind: "you"; url: string }
  | { kind: "decoy"; decoy: Decoy }
  | {
      kind: "reference";
      title: string;
      url: string;
      sourceUrl: string;
      roleLabel?: string;
    };

function SearchRow({
  entry,
  dark,
}: {
  entry: RowEntry;
  dark: boolean;
}) {
  const isYou = entry.kind === "you";
  const isReference = entry.kind === "reference";
  const titleColor = dark ? "#e8ecf4" : "#1c1e24";
  const subColor = dark ? "#8b93a7" : "#6b7280";
  const you = isYou;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={
        you
          ? {
              outline: "2px solid var(--cyan)",
              outlineOffset: "-2px",
              borderRadius: 12,
              background: dark ? "rgba(24,224,255,.05)" : "rgba(24,224,255,.07)",
            }
          : undefined
      }
    >
      {isYou || isReference ? (
        // eslint-disable-next-line @next/next/no-img-element -- user's uploaded icon object URL
        <img
          src={entry.url}
          alt={
            isYou
              ? "Your icon on the shelf"
              : `${entry.title} published reference icon`
          }
          className="h-12 w-12 flex-none rounded-[10px] object-cover"
        />
      ) : (
        <DecoyIcon decoy={entry.decoy} className="h-12 w-12 flex-none rounded-[10px]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: titleColor }}>
          {isYou
            ? "Your game"
            : isReference
              ? entry.title
              : entry.decoy.name}
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: subColor }}>
          {isYou ? (
            <span className="font-semibold">New</span>
          ) : isReference ? (
            <span className="font-semibold">Published reference</span>
          ) : (
            <Stars rating={entry.decoy.rating} color={subColor} />
          )}
          <span>·</span>
          <span>
            {isYou
              ? "This is your icon"
              : isReference
                ? entry.roleLabel || "Genre benchmark"
                : "Sample listing"}
          </span>
        </div>
      </div>
      <span
        className="flex-none rounded-full px-3.5 py-1.5 text-[11px] font-bold"
        style={
          dark
            ? { background: "rgba(140,180,255,.16)", color: "#9fc2ff" }
            : { background: "#e8f0fe", color: "#1a67d2" }
        }
      >
        {isYou ? "Your icon" : isReference ? "Reference" : "Sample"}
      </span>
    </div>
  );
}

function GridTile({ entry, rank, dark }: { entry: RowEntry; rank: number; dark: boolean }) {
  const isYou = entry.kind === "you";
  const isReference = entry.kind === "reference";
  const titleColor = dark ? "#e8ecf4" : "#1c1e24";
  const subColor = dark ? "#8b93a7" : "#6b7280";
  return (
    <div className="min-w-0">
      <div
        className="relative overflow-hidden rounded-[14px]"
        style={
          isYou
            ? { outline: "2px solid var(--cyan)", outlineOffset: "-2px" }
            : undefined
        }
      >
        {isYou || isReference ? (
          // eslint-disable-next-line @next/next/no-img-element -- user's uploaded icon object URL
          <img
            src={entry.url}
            alt={
              isYou
                ? "Your icon in the top charts"
                : `${entry.title} published reference icon`
            }
            className="aspect-square w-full object-cover"
          />
        ) : (
          <DecoyIcon decoy={entry.decoy} className="aspect-square w-full" />
        )}
      </div>
      <div className="mt-1.5 flex items-start gap-1.5">
        <span className="text-[11px] font-bold" style={{ color: subColor }}>
          {rank}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold leading-tight" style={{ color: titleColor }}>
            {isYou
              ? "Your game"
              : isReference
                ? entry.title
                : entry.decoy.name}
          </div>
          <div className="text-[10px]" style={{ color: subColor }}>
            {isYou
              ? "New"
              : isReference
                ? "Reference"
                : `${entry.decoy.rating} ★`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steam store preview: the uploaded capsule rendered inside a simulated Steam
// search-results list and a "More like this" strip, between generic decoy
// capsules - the exact sizes Steam actually shows it at.
// ---------------------------------------------------------------------------

type WideDecoy = {
  name: string;
  price: string;
  from: string;
  to: string;
  glyph: Decoy["glyph"];
  glyphColor: string;
};

const WIDE_DECOYS: WideDecoy[] = [
  { name: "Moon Peak", price: "$14.99", from: "#1b3a5e", to: "#0a1526", glyph: "star", glyphColor: "#ffd23d" },
  { name: "Void Circuit", price: "$9.99", from: "#2d1054", to: "#12061f", glyph: "bolt", glyphColor: "#18e0ff" },
  { name: "Ember Vale", price: "$19.99", from: "#5e2a12", to: "#1f0d05", glyph: "gem", glyphColor: "#ffb02e" },
  { name: "Rust & Bolts", price: "$7.99", from: "#3a3f45", to: "#14171a", glyph: "shield", glyphColor: "#c4d4e8" },
];

function WideDecoyCapsule({ decoy, className }: { decoy: WideDecoy; className: string }) {
  const gradId = `dpx-wdecoy-${decoy.glyph}-${decoy.from.slice(1)}`;
  return (
    <svg viewBox="0 0 231 87" className={className} role="img" aria-label={`${decoy.name} (sample game)`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={decoy.from} />
          <stop offset="100%" stopColor={decoy.to} />
        </linearGradient>
      </defs>
      <rect width="231" height="87" fill={`url(#${gradId})`} />
      <g transform="translate(10,12) scale(0.98)">
        <DecoyGlyph glyph={decoy.glyph} color={decoy.glyphColor} />
      </g>
      <text
        x="88"
        y="52"
        fill="#ffffff"
        fontFamily="Arial, sans-serif"
        fontSize="19"
        fontWeight="800"
        letterSpacing=".5"
      >
        {decoy.name.toUpperCase()}
      </text>
    </svg>
  );
}

type SteamEntry = { kind: "you"; url: string } | { kind: "decoy"; decoy: WideDecoy };

function SteamSearchRow({ entry }: { entry: SteamEntry }) {
  const isYou = entry.kind === "you";
  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={
        isYou
          ? {
              outline: "2px solid var(--cyan)",
              outlineOffset: "-2px",
              borderRadius: 8,
              background: "rgba(24,224,255,.06)",
            }
          : { background: "#1b2838", borderRadius: 4 }
      }
    >
      {isYou ? (
        // eslint-disable-next-line @next/next/no-img-element -- user's uploaded capsule object URL
        <img
          src={entry.url}
          alt="Your capsule in Steam search results"
          className="h-[45px] w-[120px] flex-none rounded-[3px] object-cover"
        />
      ) : (
        <WideDecoyCapsule decoy={entry.decoy} className="h-[45px] w-[120px] flex-none rounded-[3px]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[#dbe6ee]">
          {isYou ? "Your game" : entry.decoy.name}
        </div>
        <div className="text-[10.5px] font-medium text-[#7c8b98]">
          {isYou ? "This is your capsule" : "Base Game"}
        </div>
      </div>
      <span className="flex-none text-[12px] font-semibold text-[#c6d4df]">
        {isYou ? "Coming soon" : entry.decoy.price}
      </span>
    </div>
  );
}

export function SteamCapsuleShelf({ capsuleUrl }: { capsuleUrl: string }) {
  const rows: SteamEntry[] = [
    { kind: "decoy", decoy: WIDE_DECOYS[0] },
    { kind: "you", url: capsuleUrl },
    { kind: "decoy", decoy: WIDE_DECOYS[1] },
    { kind: "decoy", decoy: WIDE_DECOYS[2] },
  ];
  const strip: SteamEntry[] = [
    { kind: "decoy", decoy: WIDE_DECOYS[3] },
    { kind: "you", url: capsuleUrl },
    { kind: "decoy", decoy: WIDE_DECOYS[0] },
    { kind: "decoy", decoy: WIDE_DECOYS[1] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--faint)]">
          Steam search results · list size
        </div>
        <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--edge)] p-2" style={{ background: "#16202d" }}>
          {rows.map((entry, i) => (
            <SteamSearchRow key={i} entry={entry} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--faint)]">
          More like this · browse strip
        </div>
        <div className="rounded-2xl border border-[var(--edge)] p-3" style={{ background: "#16202d" }}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {strip.map((entry, i) => {
              const isYou = entry.kind === "you";
              return (
                <div key={i} className="min-w-0">
                  <div
                    className="overflow-hidden rounded-[4px]"
                    style={isYou ? { outline: "2px solid var(--cyan)", outlineOffset: "-2px" } : undefined}
                  >
                    {isYou ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user's uploaded capsule object URL
                      <img src={entry.url} alt="Your capsule in the browse strip" className="aspect-[231/87] w-full object-cover" />
                    ) : (
                      <WideDecoyCapsule decoy={entry.decoy} className="aspect-[231/87] w-full" />
                    )}
                  </div>
                  <div className="mt-1 truncate text-[11px] font-semibold" style={{ color: isYou ? "var(--cyan)" : "#9fb0bd" }}>
                    {isYou ? "Your game" : entry.decoy.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[13px] font-semibold italic text-[var(--faint)]">
        Simulated Steam surfaces with sample games - your capsule at the sizes shoppers
        actually scan. If the title and hook don&apos;t read here, they don&apos;t read on Steam.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Store listing preview: the uploaded screenshots rendered as the mobile-store
// screenshot carousel, in upload order - the surface that does most of the
// selling on Google Play and the App Store.
// ---------------------------------------------------------------------------

export function ScreenshotCarousel({ shots }: { shots: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mb-0 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--faint)]">
        Listing carousel · your order
      </div>
      <div className="rounded-2xl border border-[var(--edge)] p-3" style={{ background: "#131720" }}>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {shots.slice(0, 3).map((url, i) => (
            <div key={i} className="relative flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- user's uploaded screenshot object URL */}
              <img
                src={url}
                alt={`Screenshot ${i + 1} in the store carousel`}
                className="h-44 w-auto rounded-lg border border-white/10 object-cover"
                style={i === 0 ? { outline: "2px solid var(--cyan)", outlineOffset: "-2px" } : undefined}
              />
              <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10.5px] font-black text-white">
                {i + 1}
              </span>
            </div>
          ))}
          <div className="flex h-44 w-24 flex-none items-center justify-center rounded-lg border border-dashed border-white/15 text-[11px] font-semibold text-[#5c6675]">
            + more
          </div>
        </div>
      </div>
      <p className="text-[13px] font-semibold italic text-[var(--faint)]">
        Shoppers see your screenshots in this exact order - and most never swipe past the
        second. Your first screenshot has to sell the game on its own.
      </p>
    </div>
  );
}

export type ShelfReference = {
  title: string;
  thumb: string;
  sourceUrl: string;
  roleLabel?: string;
};

export default function ShelfSimulator({
  iconUrl,
  references = [],
}: {
  iconUrl: string;
  references?: ShelfReference[];
}) {
  const realEntries: RowEntry[] = references
    .filter((reference) => reference.thumb)
    .map((reference) => ({
      kind: "reference" as const,
      title: reference.title,
      url: reference.thumb,
      sourceUrl: reference.sourceUrl,
      roleLabel: reference.roleLabel,
    }));
  const fallbackEntries: RowEntry[] = DECOYS.map((decoy) => ({
    kind: "decoy" as const,
    decoy,
  }));
  const shelfEntries = realEntries.length > 0 ? realEntries : fallbackEntries;
  const pick = (index: number) =>
    shelfEntries[index % shelfEntries.length] ||
    ({ kind: "decoy", decoy: DECOYS[0] } as RowEntry);
  const yourEntry: RowEntry = { kind: "you", url: iconUrl };
  const rowEntries: RowEntry[] =
    realEntries.length > 0
      ? [realEntries[0], yourEntry, ...realEntries.slice(1)]
      : [pick(0), yourEntry, pick(1), pick(2)];

  // Published references appear exactly once. Repetition made a three-title
  // dossier look like an eight-title benchmark and overstated the evidence.
  const gridEntries: RowEntry[] =
    realEntries.length > 0
      ? [realEntries[0], realEntries[1], yourEntry, ...realEntries.slice(2)].filter(
          (entry): entry is RowEntry => Boolean(entry)
        )
      : [pick(0), pick(1), yourEntry, pick(2), pick(3), pick(4), pick(5), pick(6)];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Dark search results */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--faint)]">
          Search results · dark theme
        </div>
        <div
          data-testid="shelf-search"
          className="flex flex-col gap-1 rounded-2xl border border-[var(--edge)] p-2"
          style={{ background: "#131720" }}
        >
          {rowEntries.map((entry, i) => (
            <SearchRow key={i} entry={entry} dark />
          ))}
        </div>
      </div>

      {/* Light top-charts grid */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--faint)]">
          Top charts · light theme
        </div>
        <div
          data-testid="shelf-grid"
          className="rounded-2xl border border-[var(--edge)] bg-[#fdfdfd] p-3"
        >
          <div className="grid grid-cols-4 gap-3">
            {gridEntries.map((entry, i) => (
              <GridTile key={i} entry={entry} rank={i + 1} dark={false} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[13px] font-semibold italic text-[var(--faint)] lg:col-span-2">
        {realEntries.length > 0
          ? "Your icon beside the genre-matched published references used by the evidence audit. Reference success does not prove icon causation."
          : "Simulated store shelf with sample listings. If your eye doesn't stop on your own icon here, a shopper's won't either."}
      </p>
    </div>
  );
}
