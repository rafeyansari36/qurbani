import { Router } from 'express';
import Receipt from '../models/Receipt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Volunteers see only their own data; admins see everything.
function scopeFilter(user) {
  if (user.role === 'admin') return { cancelled: false };
  return { cancelled: false, createdBy: user._id };
}

router.get('/summary', async (req, res, next) => {
  try {
    const match = scopeFilter(req.user);

    const hisseAgg = await Receipt.aggregate([
      { $match: match },
      { $unwind: '$hisse' },
      {
        $group: {
          _id: { day: '$day', qurbaniType: '$qurbaniType', type: '$hisse.type' },
          count: { $sum: 1 },
        },
      },
    ]);

    const receiptAgg = await Receipt.aggregate([
      { $match: match },
      {
        $group: {
          _id: { day: '$day', qurbaniType: '$qurbaniType' },
          receipts: { $sum: 1 },
          hisse: { $sum: '$totalHisse' },
          amount: { $sum: '$amount' },
        },
      },
    ]);

    const byCounterAgg = await Receipt.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$deviceInfo.deviceLabel', ''] },
          receipts: { $sum: 1 },
          hisse: { $sum: '$totalHisse' },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { hisse: -1 } },
    ]);

    // Admins get per-user breakdown; volunteers don't need it (it would just be themselves).
    const byUserAgg =
      req.user.role === 'admin'
        ? await Receipt.aggregate([
            { $match: match },
            {
              $group: {
                _id: '$createdByName',
                receipts: { $sum: 1 },
                hisse: { $sum: '$totalHisse' },
                amount: { $sum: '$amount' },
              },
            },
            { $sort: { hisse: -1 } },
          ])
        : [];

    const byDay = {};
    const dayTotals = {
      1: { receipts: 0, hisse: 0, amount: 0 },
      2: { receipts: 0, hisse: 0, amount: 0 },
      3: { receipts: 0, hisse: 0, amount: 0 },
    };
    for (const row of receiptAgg) {
      const { day, qurbaniType } = row._id;
      if (!byDay[day]) {
        byDay[day] = {
          in: { receipts: 0, hisse: 0, qurbani: 0, aqeeqah: 0, amount: 0 },
          out: { receipts: 0, hisse: 0, qurbani: 0, aqeeqah: 0, amount: 0 },
        };
      }
      byDay[day][qurbaniType].receipts = row.receipts;
      byDay[day][qurbaniType].hisse = row.hisse;
      byDay[day][qurbaniType].amount = row.amount;
      dayTotals[day].receipts += row.receipts;
      dayTotals[day].hisse += row.hisse;
      dayTotals[day].amount += row.amount;
    }

    for (const row of hisseAgg) {
      const { day, qurbaniType, type } = row._id;
      if (byDay[day]) byDay[day][qurbaniType][type] = row.count;
    }

    const totals = {
      receipts: 0,
      hisse: 0,
      qurbaniHisse: 0,
      aqeeqahHisse: 0,
      amount: 0,
    };
    for (const d of Object.keys(byDay)) {
      totals.receipts += byDay[d].in.receipts + byDay[d].out.receipts;
      totals.hisse += byDay[d].in.hisse + byDay[d].out.hisse;
      totals.qurbaniHisse += byDay[d].in.qurbani + byDay[d].out.qurbani;
      totals.aqeeqahHisse += byDay[d].in.aqeeqah + byDay[d].out.aqeeqah;
      totals.amount += byDay[d].in.amount + byDay[d].out.amount;
    }

    const byCounter = byCounterAgg.map((r) => ({
      counter: r._id || '(no label)',
      receipts: r.receipts,
      hisse: r.hisse,
      amount: r.amount,
    }));

    const byUser = byUserAgg.map((r) => ({
      user: r._id,
      receipts: r.receipts,
      hisse: r.hisse,
      amount: r.amount,
    }));

    res.json({
      summary: { totals, byDay, dayTotals, byCounter, byUser, scope: req.user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/recent', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const items = await Receipt.find(scopeFilter(req.user))
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        'receiptNo naam totalHisse day qurbaniType createdByName deviceInfo.deviceLabel createdAt'
      );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;
