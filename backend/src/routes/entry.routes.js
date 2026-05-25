import { Router } from 'express';
import crypto from 'node:crypto';
import Receipt from '../models/Receipt.js';
import { nextSequence } from '../models/Counter.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateReceiptInput } from '../utils/validate.js';
import { scheduleSync } from '../utils/gsheetSync.js';

const router = Router();
router.use(requireAuth);

const year = () => new Date().getFullYear();

// All authenticated users can see / edit / cancel any receipt — data is
// shared across the team. Cancellation/edit history is still tracked via
// cancelledBy / createdBy on each receipt.
function scoped(_user, extra = {}) {
  return extra;
}

/**
 * Expand incoming hissa rows:
 * - qurbani row → stays as 1 hissa
 * - aqeeqah ladki → 1 hissa
 * - aqeeqah ladka → 2 hissa (aqeeqahPart 1 and 2, linked via pairId)
 */
function expandHisse(rows) {
  const out = [];
  for (const r of rows) {
    const naam = String(r.naam || '').trim();
    if (!naam) throw new Error('Har hissa ka naam zaroori hai');

    if (r.type === 'aqeeqah') {
      if (!['ladka', 'ladki'].includes(r.aqeeqahGender)) {
        throw new Error('Aqeeqah ke liye gender (ladka/ladki) zaroori hai');
      }
      if (r.aqeeqahGender === 'ladki') {
        out.push({ naam, type: 'aqeeqah', aqeeqahGender: 'ladki', aqeeqahPart: null, pairId: null });
      } else {
        const pairId = crypto.randomUUID();
        out.push({ naam, type: 'aqeeqah', aqeeqahGender: 'ladka', aqeeqahPart: 1, pairId });
        out.push({ naam, type: 'aqeeqah', aqeeqahGender: 'ladka', aqeeqahPart: 2, pairId });
      }
    } else if (r.type === 'qurbani') {
      out.push({ naam, type: 'qurbani', aqeeqahGender: null, aqeeqahPart: null, pairId: null });
    } else {
      throw new Error('Invalid hissa type');
    }
  }
  return out;
}

router.post('/', async (req, res, next) => {
  try {
    const input = validateReceiptInput(req.body);
    const {
      naam, address, mobile, day, qurbaniType, hisse, amount, notes, deviceLabel, receiptNo,
      receiverName, paymentMode, parts, amountPerPart,
    } = input;

    const expanded = expandHisse(hisse);

    const exists = await Receipt.findOne({ receiptNo });
    if (exists) {
      return res
        .status(409)
        .json({ error: `Receipt no "${receiptNo}" pehle se use ho chuka hai`, fields: { receiptNo: 'Already used' } });
    }

    const hisseWithCodes = [];
    for (let i = 0; i < expanded.length; i++) {
      const serialNo = await nextSequence(`day-${Number(day)}-${qurbaniType}-${year()}`);
      hisseWithCodes.push({
        ...expanded[i],
        hissaNo: i + 1,
        code: `${receiptNo}/${i + 1}`,
        serialNo,
      });
    }

    const doc = await Receipt.create({
      receiptNo,
      naam,
      address,
      mobile,
      day,
      qurbaniType,
      hisse: hisseWithCodes,
      totalHisse: hisseWithCodes.length,
      receiverName,
      paymentMode,
      parts,
      amountPerPart,
      amount,
      notes,
      createdBy: req.user._id,
      createdByName: req.user.name,
      deviceInfo: {
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip,
        deviceLabel,
      },
    });

    res.status(201).json({ receipt: doc });
    scheduleSync('create');
  } catch (err) {
    next(err);
  }
});

// Check availability of a custom receipt number
router.get('/check-receipt-no', async (req, res, next) => {
  try {
    const rn = String(req.query.no || '').trim();
    if (!rn) return res.json({ available: false, reason: 'empty' });
    const exists = await Receipt.findOne({ receiptNo: rn }).select('_id');
    res.json({ available: !exists });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { q, day, qurbaniType, type, from, to, limit = 100, skip = 0 } = req.query;
    const filter = scoped(req.user, { cancelled: false });
    if (day) filter.day = Number(day);
    if (qurbaniType) filter.qurbaniType = qurbaniType;
    if (type) filter['hisse.type'] = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (q) {
      filter.$or = [
        { naam: new RegExp(q, 'i') },
        { mobile: new RegExp(q, 'i') },
        { receiptNo: new RegExp(q, 'i') },
        { 'hisse.naam': new RegExp(q, 'i') },
      ];
    }

    const [items, total] = await Promise.all([
      Receipt.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit), 500))
        .skip(Number(skip)),
      Receipt.countDocuments(filter),
    ]);

    res.json({ items, total });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const receipt = await Receipt.findOne(scoped(req.user, { _id: req.params.id }));
    if (!receipt) return res.status(404).json({ error: 'Not found' });
    res.json({ receipt });
  } catch (err) {
    next(err);
  }
});

// Full receipt edit — same validation/shape as POST. If receiptNo, day,
// qurbaniType, or hisse change, the hissa codes and serialNos are regenerated.
// (Old serialNos are simply abandoned — small gaps in the per-day counter are
// expected after edits and don't affect correctness.)
router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await Receipt.findOne(scoped(req.user, { _id: req.params.id }));
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const input = validateReceiptInput(req.body);
    const {
      naam, address, mobile, day, qurbaniType, hisse, amount, notes, deviceLabel, receiptNo,
      receiverName, paymentMode, parts, amountPerPart,
    } = input;

    // Receipt no uniqueness — skip if unchanged.
    if (receiptNo !== existing.receiptNo) {
      const taken = await Receipt.findOne({ receiptNo, _id: { $ne: existing._id } }).select('_id');
      if (taken) {
        return res.status(409).json({
          error: `Receipt no "${receiptNo}" pehle se use ho chuka hai`,
          fields: { receiptNo: 'Already used' },
        });
      }
    }

    const expanded = expandHisse(hisse);
    const hisseWithCodes = [];
    for (let i = 0; i < expanded.length; i++) {
      const serialNo = await nextSequence(`day-${Number(day)}-${qurbaniType}-${year()}`);
      hisseWithCodes.push({
        ...expanded[i],
        hissaNo: i + 1,
        code: `${receiptNo}/${i + 1}`,
        serialNo,
      });
    }

    existing.receiptNo = receiptNo;
    existing.naam = naam;
    existing.address = address;
    existing.mobile = mobile;
    existing.day = day;
    existing.qurbaniType = qurbaniType;
    existing.hisse = hisseWithCodes;
    existing.totalHisse = hisseWithCodes.length;
    existing.receiverName = receiverName;
    existing.paymentMode = paymentMode;
    existing.parts = parts;
    existing.amountPerPart = amountPerPart;
    existing.amount = amount;
    existing.notes = notes;
    if (deviceLabel) existing.deviceInfo.deviceLabel = deviceLabel;

    await existing.save();
    res.json({ receipt: existing });
    scheduleSync('edit');
  } catch (err) {
    next(err);
  }
});

// Hard delete — admin only. Receipts are removed from the database entirely
// so the Google Sheet (and all aggregates) drop them on the next sync.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const receipt = await Receipt.findOneAndDelete(scoped(req.user, { _id: req.params.id }));
    if (!receipt) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deletedId: receipt._id });
    scheduleSync('delete');
  } catch (err) {
    next(err);
  }
});

// Legacy alias — older clients still POST /:id/cancel. Same behavior: delete.
router.post('/:id/cancel', requireAdmin, async (req, res, next) => {
  try {
    const receipt = await Receipt.findOneAndDelete(scoped(req.user, { _id: req.params.id }));
    if (!receipt) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deletedId: receipt._id });
    scheduleSync('delete');
  } catch (err) {
    next(err);
  }
});

export default router;
