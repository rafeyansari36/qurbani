import { Router } from 'express';
import PDFDocument from 'pdfkit';
import Receipt from '../models/Receipt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Thermal printer module is loaded lazily — it has native deps that we don't want
// at startup on cloud hosts (Render) where no physical printer is reachable.
async function buildPrinter(target) {
  const { printer: ThermalPrinter, types: PrinterTypes } = await import('node-thermal-printer');
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: target || process.env.PRINTER_INTERFACE || 'tcp://192.168.1.100',
    width: 32,
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: false,
    lineCharacter: '-',
  });
}

function hissaTypeLabel(h) {
  if (h.type === 'aqeeqah' && h.aqeeqahGender) {
    return h.aqeeqahPart
      ? `Aqeeqah (${h.aqeeqahGender} ${h.aqeeqahPart}/2)`
      : `Aqeeqah (${h.aqeeqahGender})`;
  }
  return 'Qurbani';
}

router.post('/receipt/:id', async (req, res, next) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) return res.status(404).json({ error: 'Not found' });

    let printer;
    try {
      printer = await buildPrinter(req.body.printerInterface);
    } catch (e) {
      return res.status(503).json({
        error: 'Thermal printer module not available on this server',
        detail: e.message,
      });
    }

    printer.alignCenter();
    printer.bold(true);
    printer.println('QURBANI RECEIPT');
    printer.bold(false);
    printer.drawLine();

    printer.alignLeft();
    printer.println(`Receipt: ${receipt.receiptNo}`);
    printer.println(`Date   : ${new Date(receipt.createdAt).toLocaleString('en-IN')}`);
    printer.println(`Day    : ${receipt.day}   In/Out: ${receipt.qurbaniType.toUpperCase()}`);
    printer.drawLine();

    printer.println(`Naam   : ${receipt.naam}`);
    printer.println(`Mobile : ${receipt.mobile}`);
    if (receipt.address) printer.println(`Address: ${receipt.address}`);
    printer.drawLine();

    printer.bold(true);
    printer.println(`Total Hisse: ${receipt.totalHisse}`);
    printer.bold(false);

    receipt.hisse.forEach((h) => {
      printer.println(`${h.hissaNo}. ${h.naam}`);
      printer.println(`   ${hissaTypeLabel(h)}  [S.No ${h.serialNo}]`);
      printer.println(`   Code: ${h.code}`);
    });

    printer.drawLine();
    if (receipt.amount) {
      printer.bold(true);
      printer.println(`Amount : Rs. ${receipt.amount}`);
      printer.bold(false);
    }
    printer.println(`Entry by: ${receipt.createdByName}`);
    if (receipt.deviceInfo?.deviceLabel) {
      printer.println(`Device  : ${receipt.deviceInfo.deviceLabel}`);
    }
    printer.newLine();
    printer.alignCenter();
    printer.println('Allah Qubool Farmaye');
    printer.newLine();
    printer.cut();

    const ok = await printer.isPrinterConnected();
    if (!ok) return res.status(503).json({ error: 'Printer not connected' });

    await printer.execute();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/receipt/:id/html', async (req, res, next) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) return res.status(404).send('Not found');

    const hisseHtml = receipt.hisse
      .map(
        (h) => `
          <div class="hissa">
            <div><b>${h.hissaNo}. ${h.naam}</b></div>
            <div>${hissaTypeLabel(h)} &middot; S.No ${h.serialNo}</div>
            <div class="code">${h.code}</div>
          </div>`
      )
      .join('');

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Receipt ${receipt.receiptNo}</title>
<style>
  @page { size: 58mm auto; margin: 2mm; }
  body { font-family: monospace; width: 54mm; font-size: 11px; margin: 0; }
  h2 { text-align:center; margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .center { text-align:center; }
  .bold { font-weight: bold; }
  .hissa { margin: 4px 0; padding: 2px 0; border-bottom: 1px dotted #888; }
  .code { font-size: 10px; color: #333; }
</style></head>
<body>
  <h2>QURBANI RECEIPT</h2>
  <hr/>
  <div>Receipt: <span class="bold">${receipt.receiptNo}</span></div>
  <div>Date   : ${new Date(receipt.createdAt).toLocaleString('en-IN')}</div>
  <div>Day    : ${receipt.day} &nbsp; In/Out: ${receipt.qurbaniType.toUpperCase()}</div>
  <hr/>
  <div>Naam   : ${receipt.naam}</div>
  <div>Mobile : ${receipt.mobile}</div>
  ${receipt.address ? `<div>Address: ${receipt.address}</div>` : ''}
  <hr/>
  <div class="bold">Total Hisse: ${receipt.totalHisse}</div>
  ${hisseHtml}
  <hr/>
  ${receipt.amount ? `<div class="bold">Amount: Rs. ${receipt.amount}</div>` : ''}
  <div>Entry by: ${receipt.createdByName}</div>
  ${receipt.deviceInfo?.deviceLabel ? `<div>Device  : ${receipt.deviceInfo.deviceLabel}</div>` : ''}
  <div class="center" style="margin-top:8px">Allah Qubool Farmaye</div>
  <script>window.onload=()=>window.print()</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// A4 PDF receipt — full page, table auto-paginates
function renderA4Receipt(doc, receipt) {
  const green = '#15803d';
  const grey = '#64748b';
  const light = '#f1f5f9';
  const MARGIN = 40;
  const PAGE_W = doc.page.width; // A4 = 595.28
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // Column layout (absolute x, sums to CONTENT_W)
  const cols = [
    { key: 'no',     title: '#',      w: 30,  align: 'center' },
    { key: 'code',   title: 'Code',   w: 110, align: 'left'   },
    { key: 'naam',   title: 'Naam',   w: 170, align: 'left'   },
    { key: 'type',   title: 'Type',   w: 145, align: 'left'   },
    { key: 'serial', title: 'Serial', w: 60,  align: 'center' },
  ];
  let x0 = MARGIN;
  cols.forEach((c) => { c.x = x0; x0 += c.w; });

  function drawHeader() {
    doc.fillColor(green).font('Helvetica-Bold').fontSize(20)
      .text('QURBANI RECEIPT', MARGIN, MARGIN, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.2);
    doc.fillColor(grey).font('Helvetica').fontSize(9)
      .text(`Generated: ${new Date().toLocaleString('en-IN')}`, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.4);
    doc.strokeColor(green).lineWidth(1)
      .moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).stroke();
    doc.moveDown(0.6);
  }

  function drawMeta() {
    const yStart = doc.y;

    // Left column
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11);
    doc.text('Receipt No:', MARGIN, yStart);
    doc.fillColor(green).fontSize(14).text(receipt.receiptNo, MARGIN, yStart + 14);

    doc.fillColor('#000').font('Helvetica').fontSize(10);
    doc.text(`Date    : ${new Date(receipt.createdAt).toLocaleString('en-IN')}`, MARGIN, yStart + 38);
    doc.text(`Day     : ${receipt.day}     In/Out: ${receipt.qurbaniType.toUpperCase()}`, MARGIN, yStart + 52);

    // Right column — contact
    const rightX = MARGIN + CONTENT_W / 2;
    doc.font('Helvetica-Bold').fontSize(11).text('Primary Contact', rightX, yStart);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Naam   : ${receipt.naam}`, rightX, yStart + 18, { width: CONTENT_W / 2 });
    doc.text(`Mobile : ${receipt.mobile}`, rightX, yStart + 32);
    if (receipt.address) {
      doc.text(`Address: ${receipt.address}`, rightX, yStart + 46, { width: CONTENT_W / 2 });
    }

    doc.y = yStart + 90;
    doc.strokeColor('#cbd5e1').lineWidth(0.5)
      .moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).stroke();
    doc.moveDown(0.5);
  }

  const ROW_H = 22;
  const HEADER_H = 22;

  function drawTableHeader() {
    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(green);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
    cols.forEach((c) => {
      doc.text(c.title, c.x + 4, y + 7, { width: c.w - 8, align: c.align });
    });
    doc.y = y + HEADER_H;
  }

  function drawRow(values, idx) {
    const y = doc.y;
    if (idx % 2 === 0) {
      doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(light);
    }
    doc.fillColor('#000').font('Helvetica').fontSize(10);
    cols.forEach((c) => {
      doc.text(String(values[c.key] ?? ''), c.x + 4, y + 6, {
        width: c.w - 8,
        align: c.align,
        ellipsis: true,
        lineBreak: false,
      });
    });
    // Borders
    doc.strokeColor('#e2e8f0').lineWidth(0.5);
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).stroke();
    doc.y = y + ROW_H;
  }

  function ensureSpace(needed) {
    if (doc.y + needed > doc.page.height - MARGIN - 60) {
      doc.addPage();
      drawTableHeader();
    }
  }

  // Begin rendering
  drawHeader();
  drawMeta();

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000')
    .text(`Hisse — Total: ${receipt.totalHisse}`, MARGIN, doc.y);
  doc.moveDown(0.4);

  drawTableHeader();

  receipt.hisse.forEach((h, idx) => {
    ensureSpace(ROW_H);
    drawRow(
      {
        no: h.hissaNo,
        code: h.code,
        naam: h.naam,
        type: hissaTypeLabel(h),
        serial: h.serialNo,
      },
      idx
    );
  });

  // Footer area
  ensureSpace(100);
  doc.moveDown(1);
  doc.strokeColor(green).lineWidth(1)
    .moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).stroke();
  doc.moveDown(0.5);

  const footY = doc.y;
  doc.fillColor('#000').font('Helvetica').fontSize(10);
  if (receipt.amount) {
    doc.font('Helvetica-Bold').fontSize(12).text(`Amount: Rs. ${receipt.amount}`, MARGIN, footY);
  }
  doc.font('Helvetica').fontSize(9).fillColor(grey);
  doc.text(`Entry by: ${receipt.createdByName}`, MARGIN, footY + 24);
  if (receipt.deviceInfo?.deviceLabel) {
    doc.text(`Device  : ${receipt.deviceInfo.deviceLabel}`, MARGIN, footY + 36);
  }

  doc.fillColor(green).font('Helvetica-Bold').fontSize(13)
    .text('Allah Qubool Farmaye', MARGIN, footY + 60, { width: CONTENT_W, align: 'center' });
}

// 58mm thermal PDF — narrow strip, for thermal-style printing from any printer
function render58mmReceipt(doc, receipt) {
  const WIDTH_MM = 58;
  const PT_PER_MM = 2.8346;
  const W = WIDTH_MM * PT_PER_MM; // ~164 pt
  const MARGIN = 6;
  const CONTENT_W = W - MARGIN * 2;

  function hr() {
    doc.strokeColor('#000').lineWidth(0.5)
      .moveTo(MARGIN, doc.y + 2).lineTo(W - MARGIN, doc.y + 2).dash(1, { space: 1 }).stroke().undash();
    doc.moveDown(0.3);
  }

  doc.font('Courier-Bold').fontSize(11).text('QURBANI RECEIPT', MARGIN, MARGIN, { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.2);
  hr();
  doc.font('Courier').fontSize(8);
  doc.text(`Receipt: ${receipt.receiptNo}`, MARGIN, doc.y);
  doc.text(`Date   : ${new Date(receipt.createdAt).toLocaleString('en-IN')}`, MARGIN, doc.y);
  doc.text(`Day ${receipt.day}   ${receipt.qurbaniType.toUpperCase()}`, MARGIN, doc.y);
  hr();
  doc.text(`Naam   : ${receipt.naam}`, MARGIN, doc.y, { width: CONTENT_W });
  doc.text(`Mobile : ${receipt.mobile}`, MARGIN, doc.y);
  if (receipt.address) doc.text(`Address: ${receipt.address}`, MARGIN, doc.y, { width: CONTENT_W });
  hr();
  doc.font('Courier-Bold').text(`Total Hisse: ${receipt.totalHisse}`, MARGIN, doc.y);
  doc.font('Courier');

  receipt.hisse.forEach((h) => {
    doc.font('Courier-Bold').text(`${h.hissaNo}. ${h.naam}`, MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Courier').text(`   ${hissaTypeLabel(h)}`, MARGIN, doc.y, { width: CONTENT_W });
    doc.text(`   S.No ${h.serialNo}  ${h.code}`, MARGIN, doc.y, { width: CONTENT_W });
  });

  hr();
  if (receipt.amount) {
    doc.font('Courier-Bold').text(`Amount: Rs. ${receipt.amount}`, MARGIN, doc.y);
    doc.font('Courier');
  }
  doc.text(`By: ${receipt.createdByName}`, MARGIN, doc.y, { width: CONTENT_W });
  if (receipt.deviceInfo?.deviceLabel) {
    doc.text(`Device: ${receipt.deviceInfo.deviceLabel}`, MARGIN, doc.y);
  }
  doc.moveDown(0.5);
  doc.font('Courier-Bold').text('Allah Qubool Farmaye', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
}

router.get('/receipt/:id/pdf', async (req, res, next) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) return res.status(404).json({ error: 'Not found' });

    const format = String(req.query.format || 'a4').toLowerCase();
    const suffix = format === 'thermal' || format === '58mm' ? '-58mm' : '';

    let doc;
    if (format === 'thermal' || format === '58mm') {
      const PT_PER_MM = 2.8346;
      const W = 58 * PT_PER_MM;
      // Tall initial page; content flows and pdfkit adds pages if needed
      doc = new PDFDocument({ size: [W, 600], margins: { top: 6, left: 6, right: 6, bottom: 6 } });
    } else {
      doc = new PDFDocument({ size: 'A4', margin: 40 });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${receipt.receiptNo}${suffix}.pdf"`
    );
    doc.pipe(res);

    if (format === 'thermal' || format === '58mm') {
      render58mmReceipt(doc, receipt);
    } else {
      renderA4Receipt(doc, receipt);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;



