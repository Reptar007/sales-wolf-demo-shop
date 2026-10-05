/**
 * The demo inbox. Shows mail sent from this browser, plus mail addressed to the
 * signed-in account — never mail for an address someone merely types in.
 */

import express from 'express';
import { prisma } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const or = [{ visitorId: req.visitorId }];
  if (req.user) or.push({ to: req.user.email });
  const messages = await prisma.inboxMessage.findMany({
    where: { OR: or },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      to: m.to,
      subject: m.subject,
      body: m.body,
      linkLabel: m.linkLabel,
      linkPath: m.linkPath,
      createdAt: m.createdAt,
    })),
  });
});

export default router;
