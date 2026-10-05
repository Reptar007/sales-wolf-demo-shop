/**
 * Carts belong to the signed-in user when there is one, otherwise to the
 * visitor cookie. Signing in folds the visitor's cart into the user's, so
 * "add to cart, then sign in at checkout" keeps the items (plan §2: cart
 * persistence across sessions).
 */

import { prisma } from '../db.js';
import { enabledFlags } from '../chaos/flags.js';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  computeTotals,
  promoProblem,
  variantLabel,
} from './pricing.js';

export const CART_INCLUDE = {
  promoCode: true,
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: { include: { product: { select: { slug: true, name: true, hue: true } } } },
    },
  },
};

export const MAX_LINE_QUANTITY = 10;

function ownerWhere(owner) {
  return owner.userId ? { userId: owner.userId } : { visitorId: owner.visitorId };
}

export function ownerOf(req) {
  return req.user ? { userId: req.user.id } : { visitorId: req.visitorId };
}

export async function findCart(owner, client = prisma) {
  return client.cart.findUnique({ where: ownerWhere(owner), include: CART_INCLUDE });
}

export async function findOrCreateCart(owner, client = prisma) {
  return client.cart.upsert({
    where: ownerWhere(owner),
    update: {},
    create: owner.userId ? { userId: owner.userId } : { visitorId: owner.visitorId },
    include: CART_INCLUDE,
  });
}

/** Plain lines for pricing: one per cart item, at today's variant price. */
export function cartLines(cart) {
  return (cart?.items ?? []).map((item) => ({
    unitPriceCents: item.variant.priceCents,
    quantity: item.quantity,
  }));
}

export async function serializeCart(cart, { shippingMethod = 'standard' } = {}) {
  const flags = await enabledFlags();
  const items = (cart?.items ?? []).map((item) => ({
    id: item.id,
    quantity: item.quantity,
    lineTotalCents: item.variant.priceCents * item.quantity,
    inStock: item.variant.stock >= item.quantity,
    variant: {
      id: item.variant.id,
      sku: item.variant.sku,
      size: item.variant.size,
      color: item.variant.color,
      label: variantLabel(item.variant),
      priceCents: item.variant.priceCents,
      stock: item.variant.stock,
    },
    product: item.variant.product,
  }));

  const lines = cartLines(cart);
  const promo = cart?.promoCode ?? null;
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const promoIssue = promo ? promoProblem(promo, subtotal) : null;

  const totals = computeTotals({
    lines,
    // promo_expired: the code stays on the cart and reads as applied, but no
    // discount is taken. Silent on purpose — only an assertion on the total sees it.
    promo: flags.has('promo_expired') ? null : promo,
    shippingMethod,
    driftCents: flags.has('cart_total_drift') && lines.length ? 100 : 0,
  });

  return {
    id: cart?.id ?? null,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    promo: promo ? { code: promo.code, description: promo.description, problem: promoIssue } : null,
    totals,
    freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
  };
}

/**
 * Moves the visitor's anonymous cart into the user's cart. Quantities add up,
 * capped by stock and the per-line maximum.
 */
export async function mergeVisitorCart(visitorId, userId) {
  const guest = await prisma.cart.findUnique({ where: { visitorId }, include: CART_INCLUDE });
  if (!guest || guest.items.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const target = await findOrCreateCart({ userId }, tx);
    for (const item of guest.items) {
      const existing = target.items.find((i) => i.variantId === item.variantId);
      const wanted = (existing?.quantity ?? 0) + item.quantity;
      const quantity = Math.max(
        1,
        Math.min(wanted, MAX_LINE_QUANTITY, item.variant.stock || wanted),
      );
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        update: { quantity },
        create: { cartId: target.id, variantId: item.variantId, quantity },
      });
    }
    if (guest.promoCodeId && !target.promoCodeId) {
      await tx.cart.update({ where: { id: target.id }, data: { promoCodeId: guest.promoCodeId } });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
}
