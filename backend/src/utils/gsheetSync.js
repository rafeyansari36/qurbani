import Receipt from '../models/Receipt.js';

const WEBHOOK = process.env.GSHEET_WEBHOOK_URL || '';
const SECRET = process.env.GSHEET_SHARED_SECRET || '';
const SHEET_URL = process.env.GSHEET_VIEW_URL || '';
const DEBOUNCE_MS = Number(process.env.GSHEET_DEBOUNCE_MS) || 2000;
const REQUEST_TIMEOUT_MS = 30_000;
const ROWS_PER_TABLE = 7;

const HEADERS = [
  'S.No',
  'Receipt',
  'Hissa Code',
  'Family Naam',
  'Hissa Naam',
  'Mobile',
  'Address',
  'Type',
  'Gender',
  'Amount (Receipt)',
  'Created By',
  'Counter',
  'Date',
];

let pendingTimer = null;
let inflight = false;
let queued = false;
let lastSyncAt = null;
let lastError = null;
let lastDurationMs = 0;
let lastReason = '';

export function isEnabled() {
  return !!WEBHOOK;
}

export function getStatus() {
  return {
    enabled: isEnabled(),
    sheetUrl: SHEET_URL,
    lastSyncAt,
    lastError,
    lastDurationMs,
    lastReason,
    inflight,
    pending: !!pendingTimer || queued,
  };
}

export function scheduleSync(reason = '') {
  if (!isEnabled()) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    runSync(reason).catch(() => {});
  }, DEBOUNCE_MS);
}

export async function syncNow(reason = 'manual') {
  if (!isEnabled()) {
    const e = new Error('Google Sheet sync disabled — set GSHEET_WEBHOOK_URL');
    e.status = 503;
    throw e;
  }
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  return runSync(reason);
}

async function runSync(reason) {
  if (inflight) {
    queued = true;
    return { queued: true };
  }
  inflight = true;
  lastReason = reason;
  const t0 = Date.now();
  try {
    const payload = await buildPayload();
    payload.secret = SECRET;
    payload.reason = reason;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {
      throw new Error('Apps Script did not return JSON (deployment access likely wrong — must be "Anyone")');
    }
    if (data?.error) throw new Error(String(data.error));
    if (!data?.ok) throw new Error('Apps Script returned no ok flag');

    lastSyncAt = new Date();
    lastError = null;
    return { ok: true };
  } catch (err) {
    lastError = err.message || String(err);
    console.error('[gsheet] sync failed:', lastError);
    throw err;
  } finally {
    lastDurationMs = Date.now() - t0;
    inflight = false;
    if (queued) {
      queued = false;
      setTimeout(() => runSync('coalesced').catch(() => {}), 50);
    }
  }
}

function typeLabel(h) {
  if (h.type === 'aqeeqah' && h.aqeeqahGender) {
    return h.aqeeqahPart
      ? `aqeeqah (${h.aqeeqahGender} ${h.aqeeqahPart}/2)`
      : `aqeeqah (${h.aqeeqahGender})`;
  }
  return h.type;
}

function rowFromHissa(receipt, hissa, sNo) {
  return [
    sNo,
    receipt.receiptNo,
    hissa.code,
    receipt.naam,
    hissa.naam,
    receipt.mobile,
    receipt.address || '',
    typeLabel(hissa),
    hissa.aqeeqahGender || '',
    Number(receipt.amount) || 0,
    receipt.createdByName || '',
    receipt.deviceInfo?.deviceLabel || '',
    new Date(receipt.createdAt).toLocaleString('en-IN'),
  ];
}

async function buildPayload() {
  const receipts = await Receipt.find({ cancelled: false }).sort({ createdAt: 1 });

  // 6 day-type tabs (rows pre-sorted by serial within each tab)
  const buckets = {};
  for (const d of [1, 2, 3]) {
    for (const t of ['in', 'out']) buckets[`Day${d}-${t.toUpperCase()}`] = { day: d, items: [] };
  }
  for (const r of receipts) {
    const key = `Day${r.day}-${r.qurbaniType.toUpperCase()}`;
    if (!buckets[key]) continue;
    for (const h of r.hisse) {
      buckets[key].items.push({ row: rowFromHissa(r, h, 0), serial: h.serialNo });
    }
  }

  // Split each bucket into 7-row "tables" labelled Day{d}-{idx}, mirroring the
  // existing Excel /master format. 1 cow = 7 hisse, so each table = 1 animal.
  const tabs = {};
  for (const key of Object.keys(buckets)) {
    const { day, items } = buckets[key];
    items.sort((a, b) => a.serial - b.serial);
    const chunks = [];
    for (let i = 0; i < items.length; i += ROWS_PER_TABLE) {
      const slice = items.slice(i, i + ROWS_PER_TABLE);
      chunks.push({
        title: `Day${day}-${chunks.length + 1}`,
        rows: slice.map((x, idx) => {
          const row = x.row.slice();
          row[0] = i + idx + 1; // running S.No across all chunks in this tab
          return row;
        }),
      });
    }
    tabs[key] = { chunks };
  }

  const summary = buildSummary(receipts);

  return { headers: HEADERS, tabs, summary };
}

function buildSummary(receipts) {
  const dayTotals = {
    1: { inR: 0, inH: 0, outR: 0, outH: 0, amount: 0 },
    2: { inR: 0, inH: 0, outR: 0, outH: 0, amount: 0 },
    3: { inR: 0, inH: 0, outR: 0, outH: 0, amount: 0 },
  };
  const counterMap = new Map();
  const userMap = new Map();
  let totalReceipts = 0;
  let totalHisse = 0;
  let totalAmount = 0;
  let qurbaniHisse = 0;
  let aqeeqahHisse = 0;

  for (const r of receipts) {
    const d = dayTotals[r.day];
    const amt = Number(r.amount) || 0;
    if (d) {
      if (r.qurbaniType === 'in') {
        d.inR += 1;
        d.inH += r.totalHisse;
      } else {
        d.outR += 1;
        d.outH += r.totalHisse;
      }
      d.amount += amt;
    }
    totalReceipts += 1;
    totalHisse += r.totalHisse;
    totalAmount += amt;
    for (const h of r.hisse) {
      if (h.type === 'qurbani') qurbaniHisse += 1;
      else if (h.type === 'aqeeqah') aqeeqahHisse += 1;
    }
    const counter = r.deviceInfo?.deviceLabel || '(no label)';
    if (!counterMap.has(counter)) counterMap.set(counter, { receipts: 0, hisse: 0, amount: 0 });
    const c = counterMap.get(counter);
    c.receipts += 1;
    c.hisse += r.totalHisse;
    c.amount += amt;
    const user = r.createdByName || '(unknown)';
    if (!userMap.has(user)) userMap.set(user, { receipts: 0, hisse: 0, amount: 0 });
    const u = userMap.get(user);
    u.receipts += 1;
    u.hisse += r.totalHisse;
    u.amount += amt;
  }

  const WIDTH = 8;
  const rows = [];
  const boldRows = [];
  const sectionRows = [];

  const pushRow = (arr, opts = {}) => {
    const padded = arr.slice(0, WIDTH);
    while (padded.length < WIDTH) padded.push('');
    rows.push(padded);
    if (opts.bold) boldRows.push(rows.length - 1);
    if (opts.section) sectionRows.push(rows.length - 1);
  };

  pushRow(['Live Qurbani Summary'], { bold: true, section: true });
  pushRow(['Last updated:', new Date().toLocaleString('en-IN')]);
  pushRow([]);

  pushRow(['Totals'], { bold: true, section: true });
  pushRow([
    'Total Receipts', totalReceipts,
    'Total Hisse', totalHisse,
    'Qurbani Hisse', qurbaniHisse,
    'Aqeeqah Hisse', aqeeqahHisse,
  ]);
  pushRow(['Total Amount (Rs.)', totalAmount]);
  pushRow([]);

  pushRow(['Day-wise breakdown'], { bold: true, section: true });
  pushRow(
    ['Day', 'IN Receipts', 'IN Hisse', 'OUT Receipts', 'OUT Hisse', 'Day Receipts', 'Day Hisse', 'Day Amount'],
    { bold: true }
  );
  let tInR = 0, tInH = 0, tOutR = 0, tOutH = 0, tAmt = 0;
  for (const d of [1, 2, 3]) {
    const x = dayTotals[d];
    pushRow([
      `Day ${d}`,
      x.inR, x.inH, x.outR, x.outH,
      x.inR + x.outR, x.inH + x.outH, x.amount,
    ]);
    tInR += x.inR; tInH += x.inH; tOutR += x.outR; tOutH += x.outH; tAmt += x.amount;
  }
  pushRow(
    ['TOTAL', tInR, tInH, tOutR, tOutH, tInR + tOutR, tInH + tOutH, tAmt],
    { bold: true }
  );
  pushRow([]);

  pushRow(['Counter-wise (Device)'], { bold: true, section: true });
  pushRow(['Counter', 'Receipts', 'Hisse', 'Amount'], { bold: true });
  const counterRows = [...counterMap.entries()].sort((a, b) => b[1].hisse - a[1].hisse);
  if (counterRows.length === 0) pushRow(['(no data)']);
  for (const [name, v] of counterRows) {
    pushRow([name, v.receipts, v.hisse, v.amount]);
  }
  pushRow([]);

  pushRow(['User-wise'], { bold: true, section: true });
  pushRow(['User', 'Receipts', 'Hisse', 'Amount'], { bold: true });
  const userRows = [...userMap.entries()].sort((a, b) => b[1].hisse - a[1].hisse);
  if (userRows.length === 0) pushRow(['(no data)']);
  for (const [name, v] of userRows) {
    pushRow([name, v.receipts, v.hisse, v.amount]);
  }

  return { width: WIDTH, rows, boldRows, sectionRows };
}
