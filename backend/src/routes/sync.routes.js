import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getStatus, syncNow } from '../utils/gsheetSync.js';

const router = Router();
router.use(requireAuth);

router.get('/sheet/info', (_req, res) => {
  res.json(getStatus());
});

router.post('/sheet/now', requireAdmin, async (_req, res, next) => {
  try {
    await syncNow('manual');
    res.json(getStatus());
  } catch (err) {
    if (err.status === 503) return res.status(503).json({ error: err.message });
    next(err);
  }
});

export default router;
