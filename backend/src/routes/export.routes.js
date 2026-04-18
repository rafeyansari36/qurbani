import { Router } from 'express';
import ExcelJS from 'exceljs';
import Receipt from '../models/Receipt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const HEADER = [
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
  'Date',
];

function typeLabel(h) {
  if (h.type === 'aqeeqah' && h.aqeeqahGender) {
    return h.aqeeqahPart ? `aqeeqah (${h.aqeeqahGender} ${h.aqeeqahPart}/2)` : `aqeeqah (${h.aqeeqahGender})`;
  }
  return h.type;
}

function rowFromHissa(receipt, hissa, idx) {
  return [
    idx + 1,
    receipt.receiptNo,
    hissa.code,
    receipt.naam,
    hissa.naam,
    receipt.mobile,
    receipt.address,
    typeLabel(hissa),
    hissa.aqeeqahGender || '',
    receipt.amount,
    receipt.createdByName,
    new Date(receipt.createdAt).toLocaleString('en-IN'),
  ];
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function applyBorders(row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

async function loadHissaRows() {
  const receipts = await Receipt.find({ cancelled: false });
  const all = [];
  for (const r of receipts) {
    for (const h of r.hisse) all.push({ receipt: r, hissa: h });
  }
  return all;
}

function filtered(rows, day, t) {
  return rows
    .filter(({ receipt }) => receipt.day === day && receipt.qurbaniType === t)
    .sort((a, b) => a.hissa.serialNo - b.hissa.serialNo);
}

/**
 * Write a "master-format" sheet: multiple 7-row tables, each labeled "Day{d}-{tableIndex}"
 */
function writeMasterSheet(ws, day, subset, rowsPerTable = 7) {
  ws.columns = HEADER.map((h) => ({ width: h === 'Address' ? 26 : 14 }));
  let r = 1;

  if (subset.length === 0) {
    const cell = ws.getRow(r).getCell(1);
    cell.value = 'No entries';
    cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
    return;
  }

  let tableIdx = 1;
  for (let i = 0; i < subset.length; i += rowsPerTable) {
    const chunk = subset.slice(i, i + rowsPerTable);

    const title = ws.getRow(r);
    title.getCell(1).value = `Day${day}-${tableIdx}`;
    title.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF15803D' } };
    ws.mergeCells(r, 1, r, HEADER.length);
    r += 1;

    const head = ws.getRow(r);
    head.values = HEADER;
    styleHeader(head);
    r += 1;

    chunk.forEach(({ receipt, hissa }, idx) => {
      const row = ws.getRow(r);
      row.values = rowFromHissa(receipt, hissa, i + idx);
      applyBorders(row);
      r += 1;
    });
    r += 1; // blank row between tables
    tableIdx += 1;
  }
}

/**
 * Build a workbook given which (day, type) combos to include.
 * combos: Array<{ day: 1|2|3, type: 'in'|'out' }>
 */
async function buildMasterWorkbook(combos) {
  const rows = await loadHissaRows();
  const wb = new ExcelJS.Workbook();
  for (const { day, type } of combos) {
    const ws = wb.addWorksheet(`Day${day}-${type.toUpperCase()}`);
    writeMasterSheet(ws, day, filtered(rows, day, type));
  }
  return wb;
}

function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return wb.xlsx.write(res).then(() => res.end());
}

// Flat listing, 6 sheets (one per day+type), simple
router.get('/split', async (_req, res, next) => {
  try {
    const rows = await loadHissaRows();
    const wb = new ExcelJS.Workbook();
    for (const day of [1, 2, 3]) {
      for (const t of ['in', 'out']) {
        const subset = filtered(rows, day, t);
        const ws = wb.addWorksheet(`Day${day}-${t.toUpperCase()}`);
        ws.columns = HEADER.map((h) => ({ header: h, width: h === 'Address' ? 28 : 14 }));
        styleHeader(ws.getRow(1));
        subset.forEach(({ receipt, hissa }, idx) => {
          const row = ws.addRow(rowFromHissa(receipt, hissa, idx));
          applyBorders(row);
        });
      }
    }
    await sendWorkbook(res, wb, `qurbani-flat-${Date.now()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// Master (all 6 sheets: Day1-IN, Day1-OUT … Day3-OUT) — with 7-row tables labeled Day{n}-{t}
router.get('/master', async (_req, res, next) => {
  try {
    const wb = await buildMasterWorkbook([
      { day: 1, type: 'in' }, { day: 1, type: 'out' },
      { day: 2, type: 'in' }, { day: 2, type: 'out' },
      { day: 3, type: 'in' }, { day: 3, type: 'out' },
    ]);
    await sendWorkbook(res, wb, `qurbani-master-${Date.now()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// IN only — 3 sheets (Day1-IN, Day2-IN, Day3-IN), master format
router.get('/master/in', async (_req, res, next) => {
  try {
    const wb = await buildMasterWorkbook([
      { day: 1, type: 'in' },
      { day: 2, type: 'in' },
      { day: 3, type: 'in' },
    ]);
    await sendWorkbook(res, wb, `qurbani-master-IN-${Date.now()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// OUT only — 3 sheets (Day1-OUT, Day2-OUT, Day3-OUT), master format
router.get('/master/out', async (_req, res, next) => {
  try {
    const wb = await buildMasterWorkbook([
      { day: 1, type: 'out' },
      { day: 2, type: 'out' },
      { day: 3, type: 'out' },
    ]);
    await sendWorkbook(res, wb, `qurbani-master-OUT-${Date.now()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

export default router;
