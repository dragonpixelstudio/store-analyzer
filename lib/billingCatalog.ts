export const CREDIT_PACKS = [
  { key: "quickfix", env: "DODO_PRODUCT_QUICKFIX", name: "Try an idea", credits: 6, cents: 500 },
  { key: "topup_25", env: "DODO_PRODUCT_TOPUP_25", name: "Build your launch", credits: 25, cents: 1200 },
] as const;
export type ProductKey = "quickfix" | "topup_25" | "topup_100" | "topup_250" | "indie" | "pro";
export type Grant = { credits: number; plan?: "indie" | "pro" };
export function productGrants(): Record<string, Grant> {
  const grants: Record<string, Grant> = {};
  for (const [env, credits, plan] of [
    ["DODO_PRODUCT_QUICKFIX", 6], ["DODO_PRODUCT_TOPUP_25", 25],
    ["DODO_PRODUCT_TOPUP_100", 100], ["DODO_PRODUCT_TOPUP_250", 250],
    ["DODO_PRODUCT_INDIE", 50, "indie"], ["DODO_PRODUCT_PRO", 200, "pro"],
  ] as const) {
    const id = process.env[env];
    if (id) grants[id] = { credits, ...(plan ? { plan } : {}) };
  }
  return grants;
}
