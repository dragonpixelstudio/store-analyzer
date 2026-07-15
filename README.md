# Dragon Pixel Store Analyzer

Next.js app for reviewing mobile game icons, screenshots, and store creative.
The analyzer produces a conversion-focused report, then routes paid beta interest
to public Paddle-ready pricing and policy pages.

## Product features

- **Scored report** — deterministic scoring engine (`lib/analyzerCore.ts`) over
  Gemini vision observations; identical inputs are served from a Redis cache so
  scores never drift between runs.
- **Shareable reports** — every analysis is persisted (`lib/reportStore.ts`,
  90-day TTL, unguessable id) and served at `/report/<id>` with asset
  thumbnails, noindex metadata, and a CTA back to the analyzer.
- **Store shelf simulator** — the uploaded icon rendered inside a simulated
  Play-style search list (dark) and top-charts grid (light) between procedural
  decoy tiles (`app/components/ShelfSimulator.tsx`).
- **Variant re-scoring with an improvement guarantee** — every generated fix
  from `/api/fix` is re-scored (median of 3 runs, `lib/rescore.ts`) with the
  same engine as the original launch score; the UI shows the before/after
  delta, and any variant that scores below the original is delivered free
  with its credit refunded automatically.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `GEMINI_API_KEY` and the Upstash Redis variables for analysis.

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
npm run build
```
