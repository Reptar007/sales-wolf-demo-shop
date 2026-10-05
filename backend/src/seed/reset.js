/**
 * Wipe every table and re-seed. Backs `prisma db seed`, `npm run demo:reset`,
 * the nightly Heroku Scheduler job, and the test suite — one code path, so the
 * state a test asserts against is the state a prospect sees.
 *
 * Wipes orders, carts, accounts, chat, and assistant transcripts (plan §3.5), so
 * a prospect can never read the previous prospect's session.
 */

import bcrypt from 'bcryptjs';
import {
  CATEGORIES,
  CHAOS_FLAGS,
  DEMO_PASSWORD,
  DEMO_USERS,
  PROMO_CODES,
  buildProducts,
} from './data.js';

/** Child tables first is unnecessary with CASCADE, but the list is the inventory. */
const TABLES = [
  'AssistantMessage',
  'AssistantSession',
  'ChatMessage',
  'ChatConversation',
  'InboxMessage',
  'PasswordResetToken',
  'OrderItem',
  'Order',
  'CartItem',
  'Cart',
  'Address',
  'DemoUser',
  'PromoCode',
  'Review',
  'ProductVariant',
  'Product',
  'Category',
  'ChaosFlag',
];

export async function resetDemoData(prisma) {
  const quoted = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

  const categoryIds = {};
  for (const [sortOrder, category] of CATEGORIES.entries()) {
    const row = await prisma.category.create({ data: { ...category, sortOrder } });
    categoryIds[category.slug] = row.id;
  }

  const products = buildProducts();
  for (const { categorySlug, variants, reviews, ...product } of products) {
    await prisma.product.create({
      data: {
        ...product,
        categoryId: categoryIds[categorySlug],
        variants: { create: variants },
        reviews: { create: reviews },
      },
    });
  }

  await prisma.promoCode.createMany({ data: PROMO_CODES });
  await prisma.chaosFlag.createMany({ data: CHAOS_FLAGS });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const { withHistory, ...user } of DEMO_USERS) {
    const created = await prisma.demoUser.create({ data: { ...user, passwordHash } });
    if (withHistory) await seedHistory(prisma, created);
  }

  return { products: products.length, categories: CATEGORIES.length, users: DEMO_USERS.length };
}

/** Gives the primary demo account a saved address and two past orders. */
async function seedHistory(prisma, user) {
  const address = {
    name: user.name,
    line1: '42 Howling Ridge Rd',
    city: 'Lupine Falls',
    region: 'OR',
    postalCode: '97000',
    country: 'US',
  };
  await prisma.address.create({
    data: { ...address, userId: user.id, label: 'Home', isDefault: true },
  });

  const past = [
    { number: 'WM-100001', slug: 'howl-hoodie', status: 'DELIVERED', daysAgo: 40, quantity: 1 },
    { number: 'WM-100002', slug: 'cast-iron-skillet', status: 'SHIPPED', daysAgo: 3, quantity: 2 },
  ];

  for (const order of past) {
    const product = await prisma.product.findUnique({
      where: { slug: order.slug },
      include: { variants: { take: 1, orderBy: { sku: 'asc' } } },
    });
    const variant = product.variants[0];
    const subtotal = variant.priceCents * order.quantity;
    const shipping = subtotal >= 7500 ? 0 : 599;
    const tax = Math.round(subtotal * 0.08);
    await prisma.order.create({
      data: {
        number: order.number,
        userId: user.id,
        email: user.email,
        status: order.status,
        subtotalCents: subtotal,
        discountCents: 0,
        shippingCents: shipping,
        taxCents: tax,
        totalCents: subtotal + shipping + tax,
        shippingMethod: 'standard',
        shipName: address.name,
        shipLine1: address.line1,
        shipCity: address.city,
        shipRegion: address.region,
        shipPostalCode: address.postalCode,
        shipCountry: address.country,
        paymentBrand: 'Visa',
        paymentLast4: '4242',
        createdAt: new Date(Date.now() - order.daysAgo * 86_400_000),
        items: {
          create: {
            variantId: variant.id,
            productSlug: product.slug,
            productName: product.name,
            variantLabel: [variant.color, variant.size].filter(Boolean).join(' / ') || 'Standard',
            unitPriceCents: variant.priceCents,
            quantity: order.quantity,
          },
        },
      },
    });
  }
}
