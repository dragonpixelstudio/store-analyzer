# Dragon Pixel Store Analyzer

Next.js app for reviewing mobile game icons, screenshots, and store creative.
The analyzer produces a conversion-focused report, then routes paid beta interest
to public Paddle-ready pricing and policy pages.

## Product features

- **Scored report** — deterministic scoring engine (`lib/analyzerCore.ts`) over
  Gemini vision observations; identical inputs are served from a Redis cache so
  scores never drift between runs.
- **Evidence-backed benchmark dossier** — icons are measured at 184px, 64px,
  and 32px, then icons and screenshots are compared with attributed published
  references selected from the uploaded asset's inferred or user-confirmed
  genre. A visible genre override changes benchmark selection without changing
  the deterministic launch score. Steam,
  Google Play, and App Store references are resolved from their store pages or
  official store APIs. Each reference is labelled as the closest mechanic,
  closest icon structure, or an adjacent shelf competitor. Complete, partial,
  and unavailable fetch states are reported honestly instead of being hidden.
  The report keeps measured facts, visible observations, and production
  inferences explicitly separate.
- **Shareable reports** — every analysis is persisted (`lib/reportStore.ts`,
  90-day TTL, unguessable id) and served at `/report/<id>` with asset
  thumbnails, noindex metadata, and a CTA back to the analyzer.
- **Store shelf simulator** — the uploaded icon rendered inside a simulated
  Play-style search list (dark) and top-charts grid (light) beside the same
  attributed, genre-matched references used by the audit. Procedural decoys
  are retained only as an offline fallback (`app/components/ShelfSimulator.tsx`).
- **Constrained generation brief** — recommendations borrow the nearest proven
  composition principle, never the reference artwork itself. Reference images
  are analysis inputs only and are not passed into the image-fix generator.
- **Variant re-scoring with an improvement guarantee** — every generated fix
  from `/api/fix` is re-scored (median of 3 runs, `lib/rescore.ts`) with the
  same engine as the original launch score; the UI shows the before/after
  delta, and any variant that scores below the original is delivered free
  with its credit refunded automatically.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `GEMINI_API_KEY` and the Upstash Redis variables for analysis.
3. Optional: set `SAMPLE_REPORT_ID` to a saved report id (the last segment of
   any report share link) to feature that real report in the landing-page
   sample section. Unset, the landing shows a generic mock. The featured
   report's 90-day TTL is refreshed on every read, so it never expires while
   configured.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Paddle Verification Pages

The app exposes the public pages Paddle asks for during domain verification:

- `/pricing`
- `/terms`
- `/privacy`
- `/refund-policy`
- `/contact`

The live checkout is not hard-coded yet. After Paddle approves the domain, wire
the pricing page CTA to Paddle Checkout or a Paddle-hosted purchase link.

## Verification

```bash
npm run lint
npm test
npm run build
```

The Playwright suite includes deterministic reference-fetch failure tests and
pixel baselines for the benchmark dossier, partial-reference warning, and shelf
simulator. Review intentional UI changes with:

```bash
npm run test:visual
npm run test:visual:update
```

`/visual-regression-fixture` is available only when the test server starts with
`ENABLE_VISUAL_FIXTURE=1`; normal development and production requests receive a
404.
