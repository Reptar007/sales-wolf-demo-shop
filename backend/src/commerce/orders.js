import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { conflict } from '../http/errors.js';
import { variantLabel } from './pricing.js';

export const ORDER_INCLUDE = { items: true };

export function newOrderNumber() {
  return `WM-${randomInt(200000, 999999)}`;
}

/**
 * Fake payment (plan §3.5). The browser maps the published test card numbers to
 * these tokens, so a card number — real or test — never reaches this server.
 */
export const PAYMENT_TOKENS = {
  tok_visa: { brand: 'Visa', last4: '4242', outcome: 'approved' },
  tok_mastercard: { brand: 'Mastercard', last4: '4444', outcome: 'approved' },
  tok_amex: { brand: 'Amex', last4: '0005', outcome: 'approved' },
  tok_declined: { brand: 'Visa', last4: '0002', outcome: 'declined' },
};

/**
 * The one way an order gets written, shared by the card checkout and the
 * Apple Pay / Google Pay checkout. In one transaction: take the stock (a
 * conditional decrement, so two shoppers racing for the last unit can't both
 * win), write the order with snapshotted lines, and empty the cart if this
 * order came from one.
 *
 * `items` are cart-shaped: { variantId, quantity, variant: { priceCents, color,
 * size, product: { slug, name } } }.
 */
export async function createOrder({
  req,
  items,
  totals,
  promoCode,
  email,
  shipping,
  shippingMethod,
  payment,
  stripePaymentIntentId = null,
  clearCartId = null,
  saveAddress = false,
}) {
  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      const { count } = await tx.productVariant.updateMany({
        where: { id: item.variantId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (count === 0) {
        throw conflict('OUT_OF_STOCK', `Sorry — ${item.variant.product.name} just sold out.`, {
          variantId: item.variantId,
        });
      }
    }

    const created = await tx.order.create({
      data: {
        number: newOrderNumber(),
        userId: req.user?.id ?? null,
        visitorId: req.visitorId,
        email,
        ...totals,
        promoCode: promoCode ?? null,
        shippingMethod,
        shipName: shipping.name,
        shipLine1: shipping.line1,
        shipLine2: shipping.line2,
        shipCity: shipping.city,
        shipRegion: shipping.region,
        shipPostalCode: shipping.postalCode,
        shipCountry: shipping.country,
        paymentBrand: payment.brand,
        paymentLast4: payment.last4,
        stripePaymentIntentId,
        items: {
          create: items.map((item) => ({
            variantId: item.variantId,
            productSlug: item.variant.product.slug,
            productName: item.variant.product.name,
            variantLabel: variantLabel(item.variant),
            unitPriceCents: item.variant.priceCents,
            quantity: item.quantity,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    if (clearCartId) {
      await tx.cartItem.deleteMany({ where: { cartId: clearCartId } });
      await tx.cart.update({ where: { id: clearCartId }, data: { promoCodeId: null } });
    }

    if (req.user && saveAddress) {
      const hasDefault = await tx.address.count({
        where: { userId: req.user.id, isDefault: true },
      });
      await tx.address.create({
        data: {
          ...shipping,
          userId: req.user.id,
          label: 'Saved at checkout',
          isDefault: hasDefault === 0,
        },
      });
    }

    // No confirmation "email": order history and the confirmation page are the
    // one place orders live. The test mailbox is only for password resets.

    return created;
  });
}

export function serializeOrder(order) {
  return {
    number: order.number,
    status: order.status,
    email: order.email,
    createdAt: order.createdAt,
    totals: {
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents,
    },
    promoCode: order.promoCode,
    shippingMethod: order.shippingMethod,
    shipping: {
      name: order.shipName,
      line1: order.shipLine1,
      line2: order.shipLine2,
      city: order.shipCity,
      region: order.shipRegion,
      postalCode: order.shipPostalCode,
      country: order.shipCountry,
    },
    payment: { brand: order.paymentBrand, last4: order.paymentLast4 },
    paymentIntentId: order.stripePaymentIntentId ?? null,
    items: (order.items ?? []).map((i) => ({
      id: i.id,
      productSlug: i.productSlug,
      productName: i.productName,
      variantLabel: i.variantLabel,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.unitPriceCents * i.quantity,
    })),
  };
}

export const formatCents = (cents) => `$${(cents / 100).toFixed(2)}`;
