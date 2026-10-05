import { randomInt } from 'node:crypto';

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
