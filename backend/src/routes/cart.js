import express from 'express';
import { prisma } from '../db.js';
import {
  HttpError,
  badRequest,
  conflict,
  notFound,
  requireInt,
  requireString,
} from '../http/errors.js';
import {
  CART_INCLUDE,
  MAX_LINE_QUANTITY,
  findCart,
  findOrCreateCart,
  ownerOf,
  serializeCart,
} from '../commerce/cart.js';
import { SHIPPING_METHODS, promoProblem } from '../commerce/pricing.js';

const router = express.Router();

const shippingMethodOf = (req) =>
  SHIPPING_METHODS[req.query.shippingMethod] ? req.query.shippingMethod : 'standard';

async function respondWithCart(req, res, status = 200) {
  const cart = await findCart(ownerOf(req));
  res
    .status(status)
    .json({ cart: await serializeCart(cart, { shippingMethod: shippingMethodOf(req) }) });
}

/** Loads a cart item only if it belongs to the requester's cart. */
async function ownedItem(req) {
  const cart = await findCart(ownerOf(req));
  const item = cart?.items.find((i) => i.id === req.params.itemId);
  if (!item) throw notFound('That item isn’t in your cart.');
  return item;
}

function stockCheck(variant, quantity) {
  if (variant.stock <= 0) {
    throw conflict('OUT_OF_STOCK', `${variant.product.name} is out of stock.`, {
      variantId: variant.id,
    });
  }
  if (quantity > variant.stock) {
    throw conflict('INSUFFICIENT_STOCK', `Only ${variant.stock} left of ${variant.product.name}.`, {
      variantId: variant.id,
      available: variant.stock,
    });
  }
}

router.get('/', (req, res) => respondWithCart(req, res));

router.post('/items', async (req, res) => {
  const variantId = requireString(req.body, 'variantId', { max: 40 });
  const quantity = requireInt(req.body, 'quantity', { min: 1, max: MAX_LINE_QUANTITY });

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { name: true } } },
  });
  if (!variant) throw notFound('That product option no longer exists.');

  const cart = await findOrCreateCart(ownerOf(req));
  const existing = cart.items.find((i) => i.variantId === variantId);
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_LINE_QUANTITY) {
    throw badRequest(`You can buy up to ${MAX_LINE_QUANTITY} of each item.`);
  }
  stockCheck(variant, next);

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { quantity: next },
    create: { cartId: cart.id, variantId, quantity },
  });
  await respondWithCart(req, res, 201);
});

router.patch('/items/:itemId', async (req, res) => {
  const item = await ownedItem(req);
  const quantity = requireInt(req.body, 'quantity', { min: 0, max: MAX_LINE_QUANTITY });
  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    stockCheck(item.variant, quantity);
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }
  await respondWithCart(req, res);
});

router.delete('/items/:itemId', async (req, res) => {
  const item = await ownedItem(req);
  await prisma.cartItem.delete({ where: { id: item.id } });
  await respondWithCart(req, res);
});

router.post('/promo', async (req, res) => {
  const code = requireString(req.body, 'code', { max: 40 }).toUpperCase();
  const cart = await findCart(ownerOf(req));
  if (!cart || cart.items.length === 0) throw badRequest('Add something to your cart first.');

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  const subtotal = cart.items.reduce((s, i) => s + i.variant.priceCents * i.quantity, 0);
  const problem = promoProblem(promo, subtotal);
  if (problem) throw new HttpError(422, 'PROMO_INVALID', problem, { code });

  await prisma.cart.update({
    where: { id: cart.id },
    data: { promoCodeId: promo.id },
    include: CART_INCLUDE,
  });
  await respondWithCart(req, res);
});

router.delete('/promo', async (req, res) => {
  const cart = await findCart(ownerOf(req));
  if (cart) await prisma.cart.update({ where: { id: cart.id }, data: { promoCodeId: null } });
  await respondWithCart(req, res);
});

export default router;
