/**
 * Plan §6.1. Email + password, bcrypt, JWT in an httpOnly SameSite=Lax cookie.
 *
 * Password reset needs no email infrastructure: the reset link lands in the
 * demo inbox (/demo-inbox), so an SE can show the whole flow live.
 */

import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { isEnabled } from '../chaos/flags.js';
import { HttpError, badRequest, conflict, requireEmail, requireString } from '../http/errors.js';
import { clearSessionCookie, setSessionCookie } from '../http/identity.js';
import { createLimiter, limitByIp } from '../http/rateLimit.js';
import { mergeVisitorCart } from '../commerce/cart.js';

const router = express.Router();

export const authLimiter = createLimiter({ windowMs: 60_000, max: 20 });
const limited = limitByIp(authLimiter);

const RESET_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD = 8;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

function requirePassword(body, field = 'password') {
  const password = typeof body?.[field] === 'string' ? body[field] : '';
  if (password.length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters.`, { field });
  }
  if (password.length > 128) throw badRequest('Password is too long.', { field });
  return password;
}

async function signIn(req, res, user) {
  setSessionCookie(res, user);
  await mergeVisitorCart(req.visitorId, user.id);
  res.json({ user: publicUser(user) });
}

router.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

router.post('/signup', limited, async (req, res) => {
  const name = requireString(req.body, 'name', { max: 80 });
  const email = requireEmail(req.body);
  const password = requirePassword(req.body);

  const existing = await prisma.demoUser.findUnique({ where: { email } });
  if (existing)
    throw conflict('EMAIL_TAKEN', 'An account with that email already exists. Try signing in.');

  const user = await prisma.demoUser.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  res.status(201);
  await signIn(req, res, user);
});

router.post('/signin', limited, async (req, res) => {
  const email = requireEmail(req.body);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  // login_flake: a third of sign-ins fail with the ordinary "wrong password"
  // error. A single run might pass; QA Wolf's run history is what exposes it.
  if ((await isEnabled('login_flake')) && Math.random() < 1 / 3) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }

  const user = await prisma.demoUser.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  await signIn(req, res, user);
});

router.post('/signout', (req, res) => {
  clearSessionCookie(res);
  res.json({ user: null });
});

router.post('/password/forgot', limited, async (req, res) => {
  const email = requireEmail(req.body);
  const user = await prisma.demoUser.findUnique({ where: { email } });

  // Same response whether or not the account exists — no account enumeration.
  if (user) {
    const token = randomBytes(24).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await prisma.inboxMessage.create({
      data: {
        visitorId: req.visitorId,
        to: email,
        subject: 'Reset your WolfMart password',
        body: 'Someone asked to reset the password for this account. If it was you, use the link below. It expires in one hour.',
        linkLabel: 'Choose a new password',
        linkPath: `/reset-password?token=${token}`,
      },
    });
  }
  res.json({
    ok: true,
    message: 'If that account exists, a reset link is on its way to the demo inbox.',
  });
});

router.post('/password/reset', limited, async (req, res) => {
  const token = requireString(req.body, 'token', { max: 100 });
  const password = requirePassword(req.body);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(
      400,
      'RESET_INVALID',
      'That reset link is invalid or has expired. Request a new one.',
    );
  }

  await prisma.$transaction([
    prisma.demoUser.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    }),
    // Spend every outstanding token for the account, not just this one.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await signIn(req, res, record.user);
});

export default router;
