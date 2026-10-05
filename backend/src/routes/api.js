import express from 'express';
import healthRoutes from './health.js';
import catalogRoutes from './catalog.js';
import cartRoutes from './cart.js';
import checkoutRoutes from './checkout.js';
import authRoutes from './auth.js';
import accountRoutes from './account.js';
import inboxRoutes from './inbox.js';
import staffRoutes from './staff.js';

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/', catalogRoutes);
router.use('/cart', cartRoutes);
router.use('/', checkoutRoutes);
router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/inbox', inboxRoutes);
router.use('/staff', staffRoutes);

router.get('/', (req, res) => {
  res.json({ message: 'WolfMart demo shop API', version: '0.2.0' });
});

export default router;
