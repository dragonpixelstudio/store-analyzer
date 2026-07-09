import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CLAIM_COOKIE, signClaim, verifyClaim } from "@/lib/credits";

export const runtime = "nodejs";

type ProductKey = "indie" | "pro" | "quickfix" | "topup_25" | "topup_100" | "topup_250";

type ProductConfig = {
  env: string;
  label: string;
};

const PRODUCTS: Record<ProductKey, ProductConfig> = {
  indie: { env: "DODO_PRODUCT_INDIE", label: "Indie" },
  pro: { env: "DODO_PRODUCT_PRO", label: "Pro" },
  quickfix: { env: "DODO_PRODUCT_QUICKFIX", label: "Quick Fix" },
  topup_25: { env: "DODO_PRODUCT_TOPUP_25", label: "25 Credit Top-up" },
  topup_100: { env: "DODO_PRODUCT_TOPUP_100", label: "100 Credit Top-up" },
  topup_250: { env: "DODO_PRODUCT_TOPUP_250", label: "250 Credit Top-up" },
};

function isProductKey(value: FormDataEntryValue | null): value is ProductKey {
  return (
    value === "indie" ||
    value === "pro" ||
    value === "quickfix" ||
    value === "topup_25" ||
    value === "topup_100" ||
    value === "topup_250"
  );
}

function apiBase() {
  if (process.env.DODO_PAYMENTS_API_BASE) {
    return process.env.DODO_PAYMENTS_API_BASE.replace(/\/$/, "");
  }

  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";
}

function requestOrigin(req: NextRequest) {
  // Use the current deployed origin; do not trust a user-supplied redirect URL.
  return req.nextUrl.origin;
}

function existingAccountKey(req: NextRequest) {
  const rawCookie = req.cookies.get(CLAIM_COOKIE)?.value;
  if (!rawCookie) return null;
  return verifyClaim(rawCookie);
}

function createAccountKey() {
  return `acct:${randomBytes(18).toString("base64url")}`;
}

async function createDodoCheckout(productId: string, productKey: ProductKey, accountKey: string, origin: string) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("DODO_PAYMENTS_API_KEY is missing");
  }

  const res = await fetch(`${apiBase()}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${origin}/checkout/success?product=${encodeURIComponent(productKey)}`,
      cancel_url: `${origin}/checkout/cancelled`,
      metadata: {
        dpx_account_key: accountKey,
        dpx_product_key: productKey,
        dpx_source: "pricing_page",
      },
    }),
  });

  const data = (await res.json().catch(() => null)) as { checkout_url?: string; error?: unknown } | null;
  if (!res.ok || !data?.checkout_url) {
    console.error("Dodo checkout creation failed", { status: res.status, data });
    throw new Error("Dodo checkout creation failed");
  }

  return data.checkout_url;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const productKey = form.get("product");
  if (!isProductKey(productKey)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const config = PRODUCTS[productKey];
  const productId = process.env[config.env];
  if (!productId) {
    console.error(`Missing ${config.env} for ${config.label} checkout`);
    return NextResponse.json({ error: "Checkout is not configured for this product" }, { status: 500 });
  }

  const accountKey = existingAccountKey(req) ?? createAccountKey();

  let checkoutUrl: string;
  try {
    checkoutUrl = await createDodoCheckout(productId, productKey, accountKey, requestOrigin(req));
  } catch (err) {
    console.error("Checkout start failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }

  const response = NextResponse.redirect(checkoutUrl, { status: 303 });
  response.cookies.set(CLAIM_COOKIE, signClaim(accountKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return response;
}
