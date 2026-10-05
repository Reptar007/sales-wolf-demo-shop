/**
 * Order math, in integer cents. Pure, so the cart, checkout, and tests all
 * agree by construction.
 */

export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
export const TAX_RATE = 0.08;

export const SHIPPING_METHODS = {
  standard: { id: 'standard', label: 'Standard (5–7 business days)', priceCents: 599 },
  express: { id: 'express', label: 'Express (2 business days)', priceCents: 1499 },
};

/** Returns a reason the promo can't apply, or null if it can. */
export function promoProblem(promo, subtotalCents, now = new Date()) {
  if (!promo || !promo.active) return 'That promo code isn’t valid.';
  if (promo.expiresAt && promo.expiresAt < now) return 'That promo code has expired.';
  if (subtotalCents < promo.minSubtotalCents) {
    return `Spend $${(promo.minSubtotalCents / 100).toFixed(2)} or more to use ${promo.code}.`;
  }
  return null;
}

export function discountFor(promo, subtotalCents) {
  if (!promo || promoProblem(promo, subtotalCents)) return 0;
  if (promo.percentOff) return Math.round((subtotalCents * promo.percentOff) / 100);
  if (promo.amountOffCents) return Math.min(promo.amountOffCents, subtotalCents);
  return 0;
}

export function shippingFor(method, discountedSubtotalCents) {
  if (discountedSubtotalCents === 0) return 0;
  const option = SHIPPING_METHODS[method] ?? SHIPPING_METHODS.standard;
  if (option.id === 'standard' && discountedSubtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS)
    return 0;
  return option.priceCents;
}

/**
 * @param lines [{ unitPriceCents, quantity }]
 * @param driftCents the `cart_total_drift` chaos flag: added to the total only,
 *   so the summary visibly fails to add up — which is the bug QA Wolf catches.
 */
export function computeTotals({
  lines,
  promo = null,
  shippingMethod = 'standard',
  driftCents = 0,
}) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountCents = discountFor(promo, subtotalCents);
  const discounted = subtotalCents - discountCents;
  const shippingCents = shippingFor(shippingMethod, discounted);
  const taxCents = Math.round(discounted * TAX_RATE);
  const totalCents = discounted + shippingCents + taxCents + driftCents;
  return { subtotalCents, discountCents, shippingCents, taxCents, totalCents };
}

export function variantLabel(variant) {
  return [variant.color, variant.size].filter(Boolean).join(' / ') || 'Standard';
}
