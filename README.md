# Dragon Pixel Store Analyzer

Next.js app for reviewing mobile game icons, screenshots, and store creative.
The analyzer produces a conversion-focused report, then routes paid beta interest
to public Paddle-ready pricing and policy pages.

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
