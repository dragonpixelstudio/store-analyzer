# Dragon Pixel Store Studio

Next.js app for making and scoring game store art. Two tools share one engine:

- **Studio** (`/`) - generate icons and Steam capsules, and frame real gameplay
  into store screenshots.
- **Analyze** (`/analyze`) - score existing store art and get ranked fixes.

## Studio

- **Editable compositions** — six starter designs with separate backgrounds, transparent subjects, accents and text. Replace, move, resize, reorder and hide layers; manual editing and exports are free. Existing concept images remain flattened references.
- **Analyze artwork / Analyze edits** — submit the current composite directly, without downloading and uploading it. Analysis uses its existing daily allowance; it does not consume generation credits.
- **Local drafts** — editable layers persist in this browser. PNG/JPEG/WebP exports include all visible edits but are flattened image files.
- **AI icons and capsules** - `POST /api/studio/generate` (`lib/studioGenerate.ts`)
  builds a prompt from recipe + style + game description, optionally with the
  developer's own art as a consistency reference, then crops to the exact store
  size (1024x1024 icon, 920x430 Steam capsule). 1 credit per delivered image,
  refunded automatically on any failure. Edit chips re-run the image with a
  targeted change. Model: `STUDIO_IMAGE_MODEL` (default `gemini-2.5-flash-image`),
  shared by gallery seeding and user generations so the gallery never oversells.
- **Store screenshots are never AI-generated.** Stores require real gameplay, so
  `app/components/studio/composeScreenshot.ts` frames the developer's own capture
  with a caption on a canvas, in the browser: free, instant, pixel-exact. Output
  sizes cover Google Play, the App Store 6.9", and Steam.
- **Score it** on every result sends it through `/api/analyze`, the same engine as
  the Analyzer, with a link to the full shareable report.

### Seeding the gallery

Gallery images live in `public/gallery/<recipe-id>.webp` and are generated
through the real pipeline via a dev-only route (404 in production):

```bash
npm run dev                        # terminal 1
node scripts/seed-gallery.mjs      # terminal 2 - only missing images
node scripts/seed-gallery.mjs --all
```

The screenshot-template demos use two procedurally drawn scenes (not from any
real game), regenerated with `node scripts/make-demo-gameplay.mjs`. Until a
recipe's AI example is seeded, its card shows a composition blueprint diagram.

Seeding requires `GEMINI_API_KEY` and `DEV_UNLIMITED_KEY` in `.env.local` and a network
location Gemini supports (some VPN exits are rejected with "User location is not
supported"). Cards without an image show a titled placeholder; the page checks
which images exist at build time.

## Analyzer features

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
   any report share link) to feature that real report in the "Built-in scoring"
   section. Unset, the section is hidden - it never shows invented numbers. The
   featured report's 90-day TTL is refreshed on every read.
4. Optional: `STUDIO_IMAGE_MODEL` to change the studio image model (for example
   a newer model with better title typography on capsules, at a higher cost).

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


## September 2026 studio completion pass

- AI thumbnail mode, plus selected output sizes for App Store/Google Play icons, five Steam capsules, video thumbnails and Shorts. Generation and edits retain the selected output shape. Large output files can be upscaled from model output, not native 4K detail.
- Free existing-art export panel: upload PNG/JPEG/WebP, select 11 output presets, choose contain or adjustable crop, export opaque PNG/JPEG. No model call for this workflow.
- Steam screenshot output removes all caption/layout decoration and preserves the full capture. Use actual 16:9 gameplay at 1920×1080 or better. Mobile caption layouts remain available.
- Fixed game-description persistence during hydration, invalid JSON payload handling, and capture object-URL cleanup.
- Thumbnail scoring is not offered by the store analyzer.

Specs verified against https://partner.steamgames.com/doc/store/assets/standard and https://support.google.com/youtube/answer/72431 (20 September 2026). Google Play icon sizing: https://support.google.com/googleplay/android-developer/answer/9866151 .

Payment note: the older Paddle section above is historical. The implemented checkout uses Dodo (`app/api/checkout/route.ts`) and requires configured Dodo products, API key, signed claim secret, durable credits and verified webhooks. No live purchase or payment verification was performed in this pass. Do not treat a successful build as proof that live checkout works.


## September 2026 production pass

See [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) for verified behavior, remaining release gates and the Dodo configuration audit. The Studio includes 19 gallery ideas and a credit wallet. Generation costs 1 credit/image; local screenshot layouts, resizing and exports are free. The public catalog offers one-time packs of 6 credits for $5 and 25 credits for $12 before applicable taxes.

Do not enable DODO_LIVE_PAYMENTS_ENABLED until sandbox checkout/delivery verification and the legacy-payment reconciliation are complete. Keep test provider credentials isolated from production configuration and customer Redis keys.
