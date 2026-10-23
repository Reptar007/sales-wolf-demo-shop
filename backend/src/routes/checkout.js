import express from 'express';
import { prisma } from '../db.js';
import { isEnabled } from '../chaos/flags.js';
import {
  HttpError,
  badRequest,
  conflict,
  notFound,
  requireEmail,
  requireString,
} from '../http/errors.js';
import { findCart, ownerOf, serializeCart } from '../commerce/cart.js';
import { SHIPPING_METHODS } from '../commerce/pricing.js';
import { ORDER_INCLUDE, PAYMENT_TOKENS, createOrder, serializeOrder } from '../commerce/orders.js';

const router = express.Router();

function readShipping(body) {
  const shipping = body?.shipping ?? {};
  const field = (name, opts) => {
    try {
      return requireString(shipping, name, opts);
    } catch (error) {
      error.details = { field: `shipping.${name}` };
      throw error;
    }
  };
  return {
    name: field('name', { max: 100 }),
    line1: field('line1', { max: 120 }),
    line2: field('line2', { max: 120, optional: true }),
    city: field('city', { max: 80 }),
    region: field('region', { max: 80 }),
    postalCode: field('postalCode', { max: 20 }),
    country: field('country', { max: 2 }).toUpperCase(),
  };
}

router.post('/checkout', async (req, res) => {
  // checkout_500: an unhandled server error, surfaced through the normal error
  // handler exactly like a real one would be.
  if (await isEnabled('checkout_500')) {
    throw new Error('chaos: checkout_500 is enabled');
  }

  const email = requireEmail(req.body);
  const shipping = readShipping(req.body);
  const shippingMethod = req.body?.shippingMethod;
  if (!SHIPPING_METHODS[shippingMethod])
    throw badRequest('Choose a shipping method.', { field: 'shippingMethod' });
  const payment = PAYMENT_TOKENS[req.body?.paymentToken];
  if (!payment) throw badRequest('Enter a demo card to pay.', { field: 'paymentToken' });

  const owner = ownerOf(req);
  const cart = await findCart(owner);
  if (!cart || cart.items.length === 0)
    throw badRequest('Your cart is empty.', { code: 'CART_EMPTY' });

  // stock_race: everything looked available until now. The first item "sells
  // out" between the stock check on the product page and the purchase.
  if (await isEnabled('stock_race')) {
    const first = cart.items[0];
    throw conflict('OUT_OF_STOCK', `Sorry — ${first.variant.product.name} just sold out.`, {
      variantId: first.variantId,
    });
  }

  if (payment.outcome === 'declined') {
    throw new HttpError(
      402,
      'PAYMENT_DECLINED',
      'Your card was declined. Try a different demo card.',
    );
  }

  const { totals } = await serializeCart(cart, { shippingMethod });

  const order = await createOrder({
    req,
    items: cart.items,
    totals,
    promoCode: cart.promoCode?.code,
    email,
    shipping,
    shippingMethod,
    payment,
    clearCartId: cart.id,
    saveAddress: Boolean(req.body?.saveAddress),
  });

  res.status(201).json({ order: serializeOrder(order) });
});

/** Order confirmation: visible to whoever placed it, by browser or by account. */
router.get('/orders/:number', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { number: req.params.number },
    include: ORDER_INCLUDE,
  });
  const mine =
    order && (order.visitorId === req.visitorId || (req.user && order.userId === req.user.id));
  if (!mine) throw notFound('We couldn’t find that order.');
  res.json({ order: serializeOrder(order) });
});

export default router;
