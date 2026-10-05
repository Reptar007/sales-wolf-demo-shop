import express from 'express';
import { prisma } from '../db.js';
import { isEnabled, sleep } from '../chaos/flags.js';
import { notFound } from '../http/errors.js';
import { COLOR_SWATCHES, categoryArt, productArt } from '../commerce/art.js';
import { variantLabel } from '../commerce/pricing.js';

const router = express.Router();

const SORTS = {
  featured: [{ featured: 'desc' }, { ratingCount: 'desc' }, { name: 'asc' }],
  price_asc: [{ basePriceCents: 'asc' }, { name: 'asc' }],
  price_desc: [{ basePriceCents: 'desc' }, { name: 'asc' }],
  rating: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }, { name: 'asc' }],
  newest: [{ createdAt: 'desc' }],
  name: [{ name: 'asc' }],
};

const PAGE_SIZE = 12;
const LOW_STOCK = 3;

const str = (value, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const dollarsToCents = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** The product card shape shared by listings, related products, and the assistant. */
export function productSummary(product) {
  const prices = product.variants.map((v) => v.priceCents);
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  return {
    slug: product.slug,
    name: product.name,
    category: product.category
      ? { slug: product.category.slug, name: product.category.name }
      : undefined,
    priceFromCents: Math.min(...prices),
    priceToCents: Math.max(...prices),
    hue: product.hue,
    featured: product.featured,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
    inStock: totalStock > 0,
    lowStock: totalStock > 0 && totalStock <= LOW_STOCK,
    colors: [...new Set(product.variants.map((v) => v.color).filter(Boolean))],
  };
}

export const SUMMARY_INCLUDE = {
  category: { select: { slug: true, name: true } },
  variants: { select: { priceCents: true, stock: true, color: true, size: true } },
};

/** Builds the Prisma filter for a catalog query. Exported for the assistant's search tool. */
export function catalogWhere({ q, category, color, size, inStock, minPriceCents, maxPriceCents }) {
  const and = [];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (category) and.push({ category: { slug: category } });
  if (color) and.push({ variants: { some: { color } } });
  if (size) and.push({ variants: { some: { size } } });
  if (inStock) and.push({ variants: { some: { stock: { gt: 0 } } } });
  if (minPriceCents != null) and.push({ basePriceCents: { gte: minPriceCents } });
  if (maxPriceCents != null) and.push({ basePriceCents: { lte: maxPriceCents } });
  return and.length ? { AND: and } : {};
}

router.get('/categories', async (req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  res.json({
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      productCount: c._count.products,
    })),
  });
});

router.get('/products', async (req, res) => {
  const q = str(req.query.q);
  const filters = {
    q,
    category: str(req.query.category, 40),
    color: str(req.query.color, 40),
    size: str(req.query.size, 10),
    inStock: req.query.inStock === '1' || req.query.inStock === 'true',
    minPriceCents: dollarsToCents(req.query.minPrice),
    maxPriceCents: dollarsToCents(req.query.maxPrice),
  };
  const sort = SORTS[req.query.sort] ? req.query.sort : 'featured';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  // search_latency: a search that still works, just slowly enough to blow a
  // reasonable timeout. Browsing without a query stays fast, so only the search
  // flow regresses — which is what a real perf bug looks like.
  if (q && (await isEnabled('search_latency'))) await sleep(4000);

  const where = catalogWhere(filters);
  // Facets ignore their own filter, so picking a category still shows the others.
  const facetWhere = catalogWhere({ ...filters, category: '', color: '', size: '' });

  const [total, products, categoryCounts, facetVariants, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: SORTS[sort],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: SUMMARY_INCLUDE,
    }),
    prisma.product.groupBy({ by: ['categoryId'], where: facetWhere, _count: true }),
    prisma.productVariant.findMany({
      where: { product: facetWhere },
      select: { color: true, size: true },
      distinct: ['color', 'size'],
    }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const countById = Object.fromEntries(categoryCounts.map((c) => [c.categoryId, c._count]));
  const sizeOrder = ['S', 'M', 'L', 'XL', '7', '8', '9', '10', '11', '12'];

  res.json({
    items: products.map(productSummary),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    sort,
    facets: {
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        count: countById[c.id] ?? 0,
      })),
      colors: [...new Set(facetVariants.map((v) => v.color).filter(Boolean))].sort(),
      sizes: [...new Set(facetVariants.map((v) => v.size).filter(Boolean))].sort(
        (a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b),
      ),
    },
  });
});

router.get('/products/:slug', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: {
      category: true,
      variants: { orderBy: { sku: 'asc' } },
      reviews: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!product) throw notFound('We couldn’t find that product.');

  const related = await prisma.product.findMany({
    where: { categoryId: product.categoryId, NOT: { id: product.id } },
    orderBy: [{ featured: 'desc' }, { ratingCount: 'desc' }],
    take: 4,
    include: SUMMARY_INCLUDE,
  });

  res.json({
    product: {
      ...productSummary(product),
      description: product.description,
      imageCount: product.imageCount,
      // Colour name → hex, matching what the product art paints for that colour.
      swatches: Object.fromEntries(
        [...new Set(product.variants.map((v) => v.color).filter(Boolean))].map((c) => [
          c,
          COLOR_SWATCHES[c] ?? null,
        ]),
      ),
      category: { slug: product.category.slug, name: product.category.name },
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        label: variantLabel(v),
        priceCents: v.priceCents,
        stock: v.stock,
      })),
      reviews: product.reviews.map((r) => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: r.createdAt,
      })),
    },
    related: related.map(productSummary),
  });
});

/**
 * Product artwork, generated server-side. CSP allows images from 'self' only,
 * and serving them here gives `image_404` a real asset to break.
 */
router.get('/images/products/:slug/:n.svg', async (req, res) => {
  // Never cached: flipping image_404 on a call has to take effect on the next
  // page load, not whenever the browser's cache expires.
  res.setHeader('Cache-Control', 'no-store');
  if (await isEnabled('image_404')) throw notFound('Image not found.');

  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    select: {
      slug: true,
      name: true,
      hue: true,
      imageCount: true,
      category: { select: { slug: true } },
      variants: { select: { color: true } },
    },
  });
  const n = Number.parseInt(req.params.n, 10);
  if (!product || !(n >= 1 && n <= product.imageCount)) throw notFound('Image not found.');

  // Only a colour this product actually comes in; anything else gets the default art.
  const colors = new Set(product.variants.map((v) => v.color).filter(Boolean));
  const color = colors.has(req.query.color) ? req.query.color : undefined;

  res.type('image/svg+xml').send(productArt(product, n, color));
});

/** Category tile art. Same chaos flag: a broken asset pipeline breaks every image. */
router.get('/images/categories/:slug.svg', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (await isEnabled('image_404')) throw notFound('Image not found.');
  const svg = categoryArt(req.params.slug);
  if (!svg) throw notFound('Image not found.');
  res.type('image/svg+xml').send(svg);
});

export default router;
