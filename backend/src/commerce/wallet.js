/**
 * Apple Pay / Google Pay checkout through Stripe's Express Checkout Element.
 *
 * The browser never names an amount. It names what it's buying (its cart, or
 * one variant for "buy now") and a shipping method; the server prices that with
 * the same serializeCart math the card checkout uses, creates the
 * PaymentIntent, and later re-prices the PaymentIntent's own metadata before
 * writing the order.
 */

import { prisma } from '../db.js';
import { HttpError, badRequest, requireInt, requireString } from '../http/errors.js';
import { findCart, ownerOf, serializeCart, stockCheck } from './cart.js';
import { SHIPPING_METHODS } from './pricing.js';

export const SOURCES = ['cart', 'buy-now'];

const VARIANT_INCLUDE = { product: { select: { slug: true, name: true, hue: true } } };

/** Reads { source, variantId, quantity } from a request body into a purchase. */
export async function purchaseFromRequest(req) {
  const source = req.body?.source;
  if (!SOURCES.includes(source)) throw badRequest('Unknown checkout source.', { field: 'source' });

  if (source === 'buy-now') {
    const variantId = requireString(req.body, 'variantId', { max: 40 });
    const quantity = requireInt(req.body, 'quantity', { min: 1, max: 10 });
    return { source, cartId: null, items: [{ variantId, quantity }], promoCode: null };
  }

  const cart = await findCart(ownerOf(req));
  if (!cart || cart.items.length === 0)
    throw badRequest('Your cart is empty.', { code: 'CART_EMPTY' });
  return {
    source,
    cartId: cart.id,
    items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    promoCode: cart.promoCode?.code ?? null,
  };
}

/**
 * Prices a purchase from today's variant prices. Returns cart-shaped `lines`
 * (what createOrder takes) and `totals` for every shipping method, keyed by id.
 */
export async function priceOf({ items, promoCode }) {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: VARIANT_INCLUDE,
  });
  const lines = items.map(({ variantId, quantity }) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) throw new HttpError(404, 'NOT_FOUND', 'That product option no longer exists.');
    stockCheck(variant, quantity);
    return { id: variantId, variantId, quantity, variant };
  });
  const promo = promoCode
    ? await prisma.promoCode.findUnique({ where: { code: promoCode } })
    : null;
  const cart = { items: lines, promoCode: promo };

  const quotes = {};
  for (const method of Object.keys(SHIPPING_METHODS)) {
    quotes[method] = (await serializeCart(cart, { shippingMethod: method })).totals;
  }
  return { lines, promoCode: promo?.code ?? null, quotes };
}

/** What the wallet sheet shows: line items and both shipping rates, in cents. */
export function walletQuote({ lines, quotes }) {
  const base = quotes.standard;
  return {
    currency: 'usd',
    quotes,
    lineItems: [
      ...lines.map((l) => ({
        name: `${l.quantity} × ${l.variant.product.name}`,
        amount: l.variant.priceCents * l.quantity,
      })),
      ...(base.discountCents ? [{ name: 'Discount', amount: -base.discountCents }] : []),
      { name: 'Tax', amount: base.taxCents },
    ],
    shippingRates: Object.values(SHIPPING_METHODS).map((m) => ({
      id: m.id,
      displayName: m.label,
      amount: quotes[m.id].shippingCents,
    })),
  };
}

/** Stripe metadata values cap at 500 characters; a 10-line cart fits easily. */
export function encodeItems(items) {
  const encoded = items.map((i) => `${i.variantId}:${i.quantity}`).join(',');
  if (encoded.length > 500) throw badRequest('That cart is too large for express checkout.');
  return encoded;
}

export function decodeItems(encoded) {
  return String(encoded || '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [variantId, quantity] = pair.split(':');
      return { variantId, quantity: Number(quantity) };
    });
}

/**
 * The wallet's shipping address and email, as this app stores them. The wallet
 * already validated them, but they still come from the browser, so trim and cap.
 */
export function readWalletContact(body) {
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw badRequest('The wallet didn’t share a valid email address.', { field: 'email' });

  const s = body?.shipping ?? {};
  const a = s.address ?? {};
  const text = (value, max) =>
    String(value ?? '')
      .trim()
      .slice(0, max);
  const shipping = {
    name: text(s.name, 100),
    line1: text(a.line1, 120),
    line2: text(a.line2, 120) || null,
    city: text(a.city, 80),
    // Not every country has a state; the order still needs the column filled.
    region: text(a.state, 80),
    postalCode: text(a.postal_code, 20),
    country: text(a.country, 2).toUpperCase(),
  };
  for (const field of ['name', 'line1', 'city', 'postalCode', 'country']) {
    if (!shipping[field])
      throw badRequest('The wallet didn’t share a complete shipping address.', {
        field: `shipping.${field}`,
      });
  }
  return { email, shipping };
}

/** Brand and last four for the order, from the charge's wallet card. */
export function walletPayment(paymentIntent) {
  const card = paymentIntent.latest_charge?.payment_method_details?.card;
  const brand =
    { apple_pay: 'Apple Pay', google_pay: 'Google Pay' }[card?.wallet?.type] ??
    (card?.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Wallet');
  return { brand, last4: card?.last4 ?? '0000' };
}

/**
 * The checked shipping address, as PaymentIntent metadata. It can't go in the
 * PaymentIntent's own `shipping`: Stripe.js sets that on confirm with the
 * publishable key, which Stripe refuses once the secret key has set it.
 */
export function shippingMetadata(shipping) {
  return {
    shipName: shipping.name,
    shipLine1: shipping.line1,
    shipLine2: shipping.line2 ?? '',
    shipCity: shipping.city,
    shipRegion: shipping.region,
    shipPostalCode: shipping.postalCode,
    shipCountry: shipping.country,
  };
}

/** Reads the order's shipping address back off the PaymentIntent's metadata. */
export function shippingFromMetadata(meta) {
  return {
    name: meta.shipName ?? '',
    line1: meta.shipLine1 ?? '',
    line2: meta.shipLine2 || null,
    city: meta.shipCity ?? '',
    region: meta.shipRegion ?? '',
    postalCode: meta.shipPostalCode ?? '',
    country: meta.shipCountry ?? '',
  };
}
