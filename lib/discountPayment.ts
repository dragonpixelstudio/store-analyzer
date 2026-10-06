import type { Order } from "./billingStore";
import { isRecord, paymentItems } from "./dodo";

// Called only on the authenticated server-to-server Dodo payment response.
// Neither browser parameters nor webhook-supplied flags authorize a lower total.
export function verifyDiscountedPayment(canonical: Record<string, unknown>, event: Record<string, unknown>, order: Order) {
  const metadata = isRecord(canonical.metadata) ? canonical.metadata : {};
  const items = paymentItems(canonical);
  const hasDiscount = (typeof canonical.discount_id === "string" && canonical.discount_id.length > 0)
    || (Array.isArray(canonical.discount_ids) && canonical.discount_ids.some(id => typeof id === "string" && id.length > 0))
    || (Array.isArray(canonical.discounts) && canonical.discounts.some(discount => isRecord(discount) && typeof discount.discount_id === "string" && discount.discount_id.length > 0));
  if (canonical.payment_id !== event.payment_id || canonical.status !== "succeeded"
    || canonical.currency !== order.currency || canonical.currency !== event.currency
    || !Number.isSafeInteger(canonical.total_amount) || Number(canonical.total_amount) < 0 || canonical.total_amount !== event.total_amount
    || metadata.dpx_order_id !== order.id || metadata.dpx_account_key !== order.accountKey
    || metadata.dpx_product_key !== order.productKey
    || items.length !== 1 || items[0].id !== order.productId || items[0].quantity !== 1 || !hasDiscount) {
    throw new Error("Discounted payment could not be verified");
  }
  return Number(canonical.total_amount);
}
