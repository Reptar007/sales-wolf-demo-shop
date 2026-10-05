/**
 * Read-side REST for live chat. Sending happens over the socket; these load
 * history on page load and refetch after a reconnect so nothing is missed.
 */

import express from 'express';
import { requireStaff } from '../http/staff.js';
import { getConversation, getCustomerConversation, listConversations } from '../chat/service.js';

const router = express.Router();

// No id parameter on purpose: a shopper only ever gets their own chat.
router.get('/conversation', async (req, res) => {
  res.json({ conversation: await getCustomerConversation(req.visitorId) });
});

router.get('/agent/conversations', requireStaff, async (req, res) => {
  res.json({ conversations: await listConversations() });
});

router.get('/agent/conversations/:id', requireStaff, async (req, res) => {
  res.json({ conversation: await getConversation(req.params.id) });
});

export default router;
