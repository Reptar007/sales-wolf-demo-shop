import express from 'express';
import { prisma } from '../db.js';
import { notFound, requireString } from '../http/errors.js';
import { requireUser, setSessionCookie } from '../http/identity.js';
import { ORDER_INCLUDE, serializeOrder } from '../commerce/orders.js';

const router = express.Router();
router.use(requireUser);

const ADDRESS_FIELDS = {
  label: { max: 40 },
  name: { max: 100 },
  line1: { max: 120 },
  line2: { max: 120, optional: true },
  city: { max: 80 },
  region: { max: 80 },
  postalCode: { max: 20 },
  country: { max: 2 },
};

function readAddress(body) {
  const data = {};
  for (const [field, opts] of Object.entries(ADDRESS_FIELDS))
    data[field] = requireString(body, field, opts);
  data.country = data.country.toUpperCase();
  data.isDefault = Boolean(body?.isDefault);
  return data;
}

async function ownedAddress(req) {
  const address = await prisma.address.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!address) throw notFound('Address not found.');
  return address;
}

async function listAddresses(userId) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

router.patch('/profile', async (req, res) => {
  const name = requireString(req.body, 'name', { max: 80 });
  const user = await prisma.demoUser.update({ where: { id: req.user.id }, data: { name } });
  setSessionCookie(res, user); // the session carries the display name
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

router.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: ORDER_INCLUDE,
  });
  res.json({ orders: orders.map(serializeOrder) });
});

router.get('/orders/:number', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { number: req.params.number, userId: req.user.id },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound('We couldn’t find that order.');
  res.json({ order: serializeOrder(order) });
});

router.get('/addresses', async (req, res) => {
  res.json({ addresses: await listAddresses(req.user.id) });
});

router.post('/addresses', async (req, res) => {
  const data = readAddress(req.body);
  const count = await prisma.address.count({ where: { userId: req.user.id } });
  await prisma.$transaction(async (tx) => {
    if (data.isDefault)
      await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    await tx.address.create({
      data: { ...data, isDefault: data.isDefault || count === 0, userId: req.user.id },
    });
  });
  res.status(201).json({ addresses: await listAddresses(req.user.id) });
});

router.put('/addresses/:id', async (req, res) => {
  const address = await ownedAddress(req);
  const data = readAddress(req.body);
  // The default stays the default until another address claims it; editing it
  // with the box unticked would otherwise leave the account with none.
  if (address.isDefault) data.isDefault = true;
  await prisma.$transaction(async (tx) => {
    if (data.isDefault)
      await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    await tx.address.update({ where: { id: address.id }, data });
  });
  res.json({ addresses: await listAddresses(req.user.id) });
});

router.delete('/addresses/:id', async (req, res) => {
  const address = await ownedAddress(req);
  await prisma.address.delete({ where: { id: address.id } });
  if (address.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ addresses: await listAddresses(req.user.id) });
});

export default router;
