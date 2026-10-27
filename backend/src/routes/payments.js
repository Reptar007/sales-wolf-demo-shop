/**
 * Apple Pay / Google Pay through Stripe (sandbox). Three steps, all priced on
 * the server:
 *
 *   POST /quote    what the wallet sheet shows, before the shopper taps.
 *   POST /intent   creates the PaymentIntent for the shipping method they chose.
 *   POST /complete after the browser confirms it: checks the PaymentIntent with
 *                  Stripe and writes the order through the same createOrder the
 *                  card checkout uses.
 *
 * With no STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY (CI, local without keys)
 * these answer 503 and the storefront simply hides the wallet buttons.
 */

import express from 'express';
import { prisma } from '../db.js';
import { isEnabled } from '../chaos/flags.js';
import { HttpError, badRequest, conflict, notFound, requireString } from '../http/errors.js';
import { findCart, ownerOf } from '../commerce/cart.js';
import { SHIPPING_METHODS } from '../commerce/pricing.js';
import { ORDER_INCLUDE, createOrder, serializeOrder } from '../commerce/orders.js';
import { getStripe, publishableKey } from '../commerce/stripe.js';
import {
  decodeItems,
  encodeItems,
  priceOf,
  purchaseFromRequest,
  readWalletContact,
  shippingFromMetadata,
  shippingMetadata,
  walletPayment,
  walletQuote,
} from '../commerce/wallet.js';

const router = express.Router();

function stripeOrThrow() {
  const stripe = getStripe();
  if (!stripe || !publishableKey()) {
    throw new HttpError(503, 'PAYMENTS_DISABLED', 'Apple Pay and Google Pay aren’t set up here.');
  }
  return stripe;
}

/** Stripe's own errors carry details a shopper shouldn't see; log them, show a safe one. */
async function callStripe(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!error?.type?.startsWith?.('Stripe')) throw error;
    if (error.statusCode === 404) throw notFound('We couldn’t find that payment.');
    console.error('[stripe]', error.type, error.code ?? '', error.message);
    throw new HttpError(502, 'PAYMENT_PROVIDER', 'The payment service had a problem. Try again.');
  }
}

router.get('/config', (req, res) => {
  const key = getStripe() ? publishableKey() : null;
  res.json({ enabled: Boolean(key), publishableKey: key });
});

router.post('/quote', async (req, res) => {
  stripeOrThrow();
  const purchase = await purchaseFromRequest(req);
  res.json({ quote: walletQuote(await priceOf(purchase)) });
});

router.post('/intent', async (req, res) => {
  const stripe = stripeOrThrow();

  // The same chaos switches the card checkout honors, checked before any charge.
  if (await isEnabled('checkout_500')) {
    throw new Error('chaos: checkout_500 is enabled');
  }

  const purchase = await purchaseFromRequest(req);
  const shippingMethod = req.body?.shippingMethod;
  if (!SHIPPING_METHODS[shippingMethod])
    throw badRequest('Choose a shipping method.', { field: 'shippingMethod' });
  const { email, shipping } = readWalletContact(req.body);

  const priced = await priceOf(purchase);
  if (await isEnabled('stock_race')) {
    const first = priced.lines[0];
    throw conflict('OUT_OF_STOCK', `Sorry — ${first.variant.product.name} just sold out.`, {
      variantId: first.variantId,
    });
  }

  const amount = priced.quotes[shippingMethod].totalCents;
  const intent = await callStripe(() =>
    stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: email,
      // No `shipping` here. Stripe.js sends the wallet's address when it
      // confirms with the publishable key, and Stripe rejects that (400) if the
      // secret key set shipping first. The order's copy rides in metadata.
      description: 'WolfMart demo order',
      metadata: {
        app: 'wolfmart',
        source: purchase.source,
        items: encodeItems(purchase.items),
        promoCode: priced.promoCode ?? '',
        shippingMethod,
        visitorId: req.visitorId,
        userId: req.user?.id ?? '',
        ...shippingMetadata(shipping),
      },
    }),
  );

  res.status(201).json({
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    amountCents: intent.amount,
  });
});

router.post('/complete', async (req, res) => {
  const stripe = stripeOrThrow();
  const paymentIntentId = requireString(req.body, 'paymentIntentId', { max: 100 });
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId))
    throw badRequest('That isn’t a payment ID.', { field: 'paymentIntentId' });

  const intent = await callStripe(() =>
    stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }),
  );
  const meta = intent.metadata ?? {};
  const mine =
    meta.app === 'wolfmart' &&
    (meta.visitorId === req.visitorId || (meta.userId && meta.userId === req.user?.id));
  if (!mine) throw notFound('We couldn’t find that payment.');

  // A retry (double tap, flaky network) gets the order the first call made.
  const existing = await prisma.order.findUnique({
    where: { stripePaymentIntentId: intent.id },
    include: ORDER_INCLUDE,
  });
  if (existing) return res.json({ order: serializeOrder(existing) });

  if (intent.status !== 'succeeded') {
    throw new HttpError(402, 'PAYMENT_INCOMPLETE', 'Your payment didn’t go through.');
  }

  // Money has moved. Anything that stops the order from here on refunds it,
  // so a shopper is never charged for an order that doesn't exist.
  const refundAndThrow = async (error) => {
    await callStripe(() =>
      stripe.refunds.create({ payment_intent: intent.id, reason: 'requested_by_customer' }),
    ).catch((refundError) => console.error('[stripe] refund failed', intent.id, refundError));
    if (error instanceof HttpError) {
      throw new HttpError(
        error.status,
        error.code,
        `${error.message} Your payment was refunded.`,
        error.details,
      );
    }
    throw error;
  };

  try {
    const shippingMethod = meta.shippingMethod;
    const priced = await priceOf({
      items: decodeItems(meta.items),
      promoCode: meta.promoCode || null,
    });
    const totals = priced.quotes[shippingMethod];
    if (!totals || totals.totalCents !== intent.amount || intent.currency !== 'usd') {
      throw conflict(
        'PRICE_CHANGED',
        'Prices changed while you were paying, so we couldn’t place the order.',
      );
    }

    const cart = meta.source === 'cart' ? await findCart(ownerOf(req)) : null;
    const order = await createOrder({
      req,
      items: priced.lines,
      totals,
      promoCode: priced.promoCode,
      email: intent.receipt_email,
      shipping: shippingFromMetadata(meta),
      shippingMethod,
      payment: walletPayment(intent),
      stripePaymentIntentId: intent.id,
      clearCartId: cart?.id ?? null,
    });
    res.status(201).json({ order: serializeOrder(order) });
  } catch (error) {
    // Two concurrent completes for one payment: the loser returns the winner's order.
    if (error?.code === 'P2002') {
      const order = await prisma.order.findUnique({
        where: { stripePaymentIntentId: intent.id },
        include: ORDER_INCLUDE,
      });
      if (order) return res.json({ order: serializeOrder(order) });
    }
    await refundAndThrow(error);
  }
});

export default router;
