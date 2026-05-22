import Receipt from '../models/Receipt.js';

const WEBHOOK = process.env.GSHEET_WEBHOOK_URL || '';
const SECRET = process.env.GSHEET_SHARED_SECRET || '';
const SHEET_URL = process.env.GSHEET_VIEW_URL || '';
const DEBOUNCE_MS = Number(process.env.GSHEET_DEBOUNCE_MS) || 2000;
const REQUEST_TIMEOUT_MS = 30_000;
const ROWS_PER_JANWAR = 7;

// Full hissa-level columns for the line-by-line tabs (Day1-IN ... Day3-OUT)
const LINE_HEADERS = [
  'S.No',
  'Receipt',
  'Hissa Code',
  'Family Naam',
  'Hissa Naam',
  'Mobile',
  'Address',
  'Type',
  'Gender',
  'Receiver',
  'Payment',
  'Parts',
  'Amount/Part',
  'Amount (Receipt)',
  'Created By',
  'Counter',
  'Date',
];

// Minimal columns for the 7-hissa janwar grouping tabs.
// Sr.No = janwar number (1 for all 7 hisse of janwar 1, 2 for janwar 2, ...).
const JANWAR_HEADERS = ['Sr No.', 'Naam', 'Type'];

let pendingTimer = null;
let inflight = false;
let queued = false;
let lastSyncAt = null;
let lastError = null;
let lastDurationMs = 0;
let lastReason = '';
let lastScriptVersion = null;

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
    lastScriptVersion,
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
    lastScriptVersion = data.version ?? null;
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

function lineRow(receipt, hissa, sNo) {
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
    receipt.receiverName || '',
    (receipt.paymentMode || '').toUpperCase(),
    Number(receipt.parts) || 0,
    Number(receipt.amountPerPart) || 0,
    Number(receipt.amount) || 0,
    receipt.createdByName || '',
    receipt.deviceInfo?.deviceLabel || '',
    new Date(receipt.createdAt).toLocaleString('en-IN'),
  ];
}

function janwarRow(hissa, janwarNo) {
  return [janwarNo, hissa.naam, hissa.type];
}

async function buildPayload() {
  const receipts = await Receipt.find({ cancelled: false }).sort({ createdAt: 1 });

  // Bucket hisse by day + qurbaniType, sorted by serialNo for stable order
  const buckets = {};
  for (const d of [1, 2, 3]) {
    for (const t of ['in', 'out']) buckets[`${d}-${t}`] = [];
  }
  for (const r of receipts) {
    const key = `${r.day}-${r.qurbaniType}`;
    if (!buckets[key]) continue;
    for (const h of r.hisse) buckets[key].push({ receipt: r, hissa: h });
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => a.hissa.serialNo - b.hissa.serialNo);
  }

  // Build 12 tabs in the user-specified order:
  //   1) Day1-IN, Day2-IN, Day3-IN          (line by line)
  //   2) Day1-OUT, Day2-OUT, Day3-OUT       (line by line)
  //   3) Day1-IN-Janwar, ...-OUT-Janwar     (7-hissa grouping)
  const tabs = {};

  for (const d of [1, 2, 3]) {
    tabs[`Day${d}-IN`] = buildLineTab(buckets[`${d}-in`]);
  }
  for (const d of [1, 2, 3]) {
    tabs[`Day${d}-OUT`] = buildLineTab(buckets[`${d}-out`]);
  }
  for (const d of [1, 2, 3]) {
    tabs[`Day${d}-IN-Janwar`] = buildJanwarTab(buckets[`${d}-in`], d);
  }
  for (const d of [1, 2, 3]) {
    tabs[`Day${d}-OUT-Janwar`] = buildJanwarTab(buckets[`${d}-out`], d);
  }

  const summary = buildSummary(receipts);

  // `headers` is sent at the top level too as a fallback for older Apps Script
  // deployments that only read `body.headers` (pre per-tab-headers). Janwar
  // tabs will look slightly wrong on the old script (17 header cols vs 3 data
  // cols) but won't throw a width=0 error. Redeploy Code.gs to fix properly.
  return { headers: LINE_HEADERS, tabs, summary };
}

function buildLineTab(items) {
  const rows = items.map((x, idx) => lineRow(x.receipt, x.hissa, idx + 1));
  return {
    headers: LINE_HEADERS,
    chunks: [{ title: '', rows }],
  };
}

function buildJanwarTab(items, day) {
  // One chunk per janwar — each chunk gets its own title row (Day1-1, Day1-2…)
  // and a Header row, followed by up to 7 data rows. Every row inside chunk N
  // has Sr No. = N so the value is repeated for all 7 hisse of that janwar.
  // The Apps Script vertically merges the first column across each chunk's
  // data rows (driven by `mergeFirstColumnPerChunk`) so "1", "2"… appears
  // exactly once per janwar, centered across its 7 rows.
  const chunks = [];
  for (let i = 0; i < items.length; i += ROWS_PER_JANWAR) {
    const slice = items.slice(i, i + ROWS_PER_JANWAR);
    const janwarNo = chunks.length + 1;
    chunks.push({
      title: `Day${day}-${janwarNo}`,
      rows: slice.map((x) => janwarRow(x.hissa, janwarNo)),
    });
  }
  return {
    headers: JANWAR_HEADERS,
    chunks,
    mergeFirstColumnPerChunk: true,
  };
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
  let cashAmount = 0;
  let onlineAmount = 0;

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
    if (r.paymentMode === 'online') onlineAmount += amt;
    else cashAmount += amt;
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
  pushRow(['Total Amount (Rs.)', totalAmount, 'Cash', cashAmount, 'Online', onlineAmount]);
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
