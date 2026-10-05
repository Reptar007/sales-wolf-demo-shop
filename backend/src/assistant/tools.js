/**
 * The assistant's tools. They see only the public catalog and the requester's
 * own cart and orders, which is everything the model can ever learn about.
 *
 * Tool input comes from the model, which takes input from anyone on the
 * internet, so every argument is untrusted: each tool's `parse` validates and
 * clamps its input before `run` sees it, and a rejected input goes back to the
 * model as an error result it can recover from.
 */

import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { prisma } from '../db.js';
import { HttpError } from '../http/errors.js';
import { SUMMARY_INCLUDE, catalogWhere, productSummary } from '../routes/catalog.js';
import { MAX_LINE_QUANTITY, addItemToCart, findCart } from '../commerce/cart.js';
import { variantLabel } from '../commerce/pricing.js';
import { formatCents } from '../commerce/orders.js';

/** A bad tool argument. The message goes back to the model, never to a log. */
export class ToolInputError extends Error {}

const SLUG = /^[a-z0-9-]{1,80}$/;
const VARIANT_ID = /^[a-z0-9]{1,40}$/i;
const ORDER_NUMBER = /^WM-\d{6}$/;
const MAX_SEARCH_RESULTS = 8;

function asObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ToolInputError('Tool input must be an object.');
  }
  return input;
}

function optionalString(input, field, max) {
  const raw = input[field];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new ToolInputError(`${field} must be a string.`);
  const value = raw.trim().replace(/\s+/g, ' ').slice(0, max);
  return value || null;
}

function optionalMatch(input, field, pattern, transform = (v) => v) {
  const value = optionalString(input, field, 100);
  if (value === null) return null;
  const normalized = transform(value);
  if (!pattern.test(normalized)) throw new ToolInputError(`${field} is not valid.`);
  return normalized;
}

export function parseSearchInput(raw) {
  const input = asObject(raw);
  const query = optionalString(input, 'query', 80);
  const category = optionalMatch(input, 'category', SLUG, (v) => v.toLowerCase());
  let maxPriceCents = null;
  if (input.max_price !== undefined && input.max_price !== null) {
    const price = Number(input.max_price);
    if (!Number.isFinite(price) || price < 0) {
      throw new ToolInputError('max_price must be a positive number of dollars.');
    }
    maxPriceCents = Math.round(Math.min(price, 100_000) * 100);
  }
  const inStock = input.in_stock === true || input.in_stock === 'true';
  return { query, category, maxPriceCents, inStock };
}

export function parseStockInput(raw) {
  const input = asObject(raw);
  const slug = optionalMatch(input, 'product_slug', SLUG, (v) => v.toLowerCase());
  if (!slug) throw new ToolInputError('product_slug is required.');
  return { slug };
}

export function parseAddToCartInput(raw) {
  const input = asObject(raw);
  const slug = optionalMatch(input, 'product_slug', SLUG, (v) => v.toLowerCase());
  const variantId = optionalMatch(input, 'variant_id', VARIANT_ID);
  if (!slug && !variantId) throw new ToolInputError('Give a product_slug or a variant_id.');
  const size = optionalString(input, 'size', 20);
  const color = optionalString(input, 'color', 30);
  let quantity = 1;
  if (input.quantity !== undefined && input.quantity !== null) {
    quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new ToolInputError(`quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`);
    }
  }
  return { slug, variantId, size, color, quantity };
}

export function parseOrderStatusInput(raw) {
  const input = asObject(raw ?? {});
  const number = optionalMatch(input, 'order_number', ORDER_NUMBER, (v) => v.toUpperCase());
  return { number };
}

const dollars = (cents) => formatCents(cents);

/** Search terms: words of two or more characters, at most five. */
function searchTerms(query) {
  return (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 2)
    .slice(0, 5);
}

export async function searchProducts({ query, category, maxPriceCents, inStock }) {
  const filters = catalogWhere({ category, inStock, maxPriceCents });
  const terms = searchTerms(query);
  const termWheres = terms.map((q) => catalogWhere({ q }));
  const find = (termFilter) =>
    prisma.product.findMany({
      where: { AND: [filters, termFilter] },
      orderBy: [{ featured: 'desc' }, { ratingCount: 'desc' }, { name: 'asc' }],
      take: MAX_SEARCH_RESULTS,
      include: SUMMARY_INCLUDE,
    });

  // Every word first ("waterproof jacket"), then any word if that finds nothing.
  let products = await find(termWheres.length ? { AND: termWheres } : {});
  if (!products.length && termWheres.length > 1) products = await find({ OR: termWheres });
  return products.map(productSummary);
}

function presentSummary(p) {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category?.name,
    price:
      p.priceFromCents === p.priceToCents
        ? dollars(p.priceFromCents)
        : `${dollars(p.priceFromCents)}–${dollars(p.priceToCents)}`,
    inStock: p.inStock,
    lowStock: p.lowStock,
    colors: p.colors,
    rating: p.ratingCount ? `${p.ratingAverage.toFixed(1)} (${p.ratingCount} reviews)` : null,
  };
}

async function loadProduct(slug) {
  return prisma.product.findUnique({
    where: { slug },
    include: { category: true, variants: { orderBy: { sku: 'asc' } } },
  });
}

export async function checkStock({ slug }) {
  const product = await loadProduct(slug);
  if (!product) return null;
  return {
    slug: product.slug,
    name: product.name,
    category: product.category.name,
    description: product.description,
    variants: product.variants.map((v) => ({
      variant_id: v.id,
      option: variantLabel(v),
      size: v.size,
      color: v.color,
      price: dollars(v.priceCents),
      stock: v.stock,
    })),
  };
}

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();

/** Picks the variant to add, or explains which detail is missing. */
export async function resolveVariant({ slug, variantId, size, color }) {
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { slug: true, name: true } } },
    });
    if (!variant || (slug && variant.product.slug !== slug)) {
      return { problem: 'That variant_id does not exist. Use check_stock to see the options.' };
    }
    return { variant };
  }

  const product = await loadProduct(slug);
  if (!product) return { problem: `There is no product with slug "${slug}".` };
  const matching = product.variants.filter(
    (v) =>
      (!size || (v.size && sameText(v.size, size))) &&
      (!color || (v.color && sameText(v.color, color))),
  );
  if (matching.length === 1) {
    return { variant: { ...matching[0], product: { slug: product.slug, name: product.name } } };
  }
  const options = product.variants.map(variantLabel).join(', ');
  if (!matching.length) {
    return { problem: `${product.name} has no option matching that. Options: ${options}.` };
  }
  return {
    problem: `${product.name} comes in several options (${options}). Ask the shopper which one they want.`,
  };
}

/** Only the signed-in demo user's own orders, and only what a status check needs. */
export async function orderStatus(user, { number }) {
  const where = number ? { userId: user.id, number } : { userId: user.id };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: number ? 1 : 5,
    include: { items: true },
  });
  return orders.map((o) => ({
    number: o.number,
    status: o.status,
    placed: o.createdAt.toISOString().slice(0, 10),
    total: dollars(o.totalCents),
    items: o.items.map((i) => ({
      product_slug: i.productSlug,
      name: i.productName,
      option: i.variantLabel,
      quantity: i.quantity,
    })),
  }));
}

/** Shopper-facing labels for tool-status chips. */
export const TOOL_LABELS = {
  search_products: 'Searching the catalog…',
  check_stock: 'Checking stock…',
  add_to_cart: 'Adding to your cart…',
  get_order_status: 'Looking up your orders…',
};

/**
 * Builds the runnable tools for one shopper turn.
 *
 * @param ctx.owner     cart owner, from ownerOf(req)
 * @param ctx.user      the signed-in demo user, or null
 * @param ctx.onProduct records a product the model was shown, so the widget can link it
 * @param ctx.onCartAdd records a successful add, so the widget can refresh the cart count
 */
export function buildTools(ctx) {
  const json = (value) => JSON.stringify(value);

  const searchTool = betaTool({
    name: 'search_products',
    description:
      'Search the WolfMart catalog. Returns up to 8 products with slug, name, category, price range in USD, stock, and colors. Use short keyword queries such as "rain jacket" or "boots".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords, e.g. "waterproof jacket".' },
        category: {
          type: 'string',
          enum: ['apparel', 'footwear', 'outdoor', 'home', 'kitchen', 'tech'],
        },
        max_price: { type: 'number', description: 'Maximum price in US dollars.' },
        in_stock: { type: 'boolean', description: 'Only products with stock.' },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const results = await searchProducts(input);
      for (const p of results) ctx.onProduct(p);
      if (!results.length) return 'No products matched. Try fewer or different keywords.';
      return json({ results: results.map(presentSummary) });
    },
  });

  const stockTool = betaTool({
    name: 'check_stock',
    description:
      'Get one product by slug with every option (size/color), its variant_id, price in USD, and units in stock.',
    inputSchema: {
      type: 'object',
      properties: { product_slug: { type: 'string' } },
      required: ['product_slug'],
      additionalProperties: false,
    },
    run: async (input) => {
      const product = await checkStock(input);
      if (!product) return `There is no product with slug "${input.slug}".`;
      ctx.onProduct(product);
      return json(product);
    },
  });

  const addTool = betaTool({
    name: 'add_to_cart',
    description:
      "Add a product to the shopper's own cart. Give product_slug plus size and/or color when the product has options, or the variant_id from check_stock. Quantity 1-10. Only call this when the shopper asked to add the item.",
    inputSchema: {
      type: 'object',
      properties: {
        product_slug: { type: 'string' },
        variant_id: { type: 'string' },
        size: { type: 'string' },
        color: { type: 'string' },
        quantity: { type: 'integer', minimum: 1, maximum: MAX_LINE_QUANTITY },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const { variant, problem } = await resolveVariant(input);
      if (problem) throw new ToolInputError(problem);
      try {
        await addItemToCart(ctx.owner, variant.id, input.quantity);
      } catch (error) {
        // Stock and per-line limits are shopper-safe messages; pass them on.
        if (error instanceof HttpError) throw new ToolInputError(error.message);
        throw error;
      }
      const cart = await findCart(ctx.owner);
      const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      const added = {
        slug: variant.product.slug,
        name: variant.product.name,
        option: variantLabel(variant),
        quantity: input.quantity,
        cartItemCount: itemCount,
      };
      ctx.onProduct({ slug: added.slug, name: added.name });
      ctx.onCartAdd(added);
      return json({ added: true, ...added });
    },
  });

  const orderTool = betaTool({
    name: 'get_order_status',
    description:
      "Look up the signed-in shopper's own orders. With order_number (like WM-123456) returns that order; without it, their five most recent orders.",
    inputSchema: {
      type: 'object',
      properties: { order_number: { type: 'string' } },
      additionalProperties: false,
    },
    run: async (input) => {
      if (!ctx.user) {
        return 'The shopper is not signed in. Ask them to sign in to their WolfMart account to check an order.';
      }
      const orders = await orderStatus(ctx.user, input);
      if (!orders.length) {
        return input.number
          ? `No order ${input.number} on this shopper's account.`
          : 'This shopper has no orders yet.';
      }
      return json({ orders });
    },
  });

  // Validation replaces betaTool's pass-through parse.
  searchTool.parse = parseSearchInput;
  stockTool.parse = parseStockInput;
  addTool.parse = parseAddToCartInput;
  orderTool.parse = parseOrderStatusInput;

  return [searchTool, stockTool, addTool, orderTool];
}
