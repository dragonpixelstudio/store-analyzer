// The live default remains byte-for-byte compatible with existing keys.
// Test Mode payments and generated credits never enter the live ledger.
export function storagePrefix() {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "dpx:sandbox:v1:" : "dpx:";
}
export function localFixturesEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" && process.env.DPX_LOCAL_FIXTURES === "1";
}
