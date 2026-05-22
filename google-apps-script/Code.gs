/* =====================================================================
 *  Qurbani Live Sync — Google Apps Script
 * =====================================================================
 *
 *  SETUP (one-time, ~5 minutes)
 *  ----------------------------------------------------------------------
 *  1. Create a new Google Sheet (or open an existing one). Note its URL.
 *
 *  2. Inside the sheet:  Extensions  ->  Apps Script.
 *     Delete any sample code in Code.gs, paste THIS file's contents,
 *     and save the project (Ctrl+S).
 *
 *  3. Edit the SHARED_SECRET constant below — set it to a long random
 *     string. You will paste the SAME value into the backend env var
 *     GSHEET_SHARED_SECRET.
 *
 *  4. Deploy  ->  New deployment  ->  type = Web app.
 *       - Description:   "Qurbani sync"
 *       - Execute as:    Me
 *       - Who has access: Anyone   (the shared secret is what authenticates)
 *     Click Deploy, authorise the script when Google prompts.
 *     Copy the Web app URL.  It looks like:
 *       https://script.google.com/macros/s/AKfycb..../exec
 *
 *  5. On the backend (.env or Render env vars), set:
 *       GSHEET_WEBHOOK_URL   = <Web app URL from step 4>
 *       GSHEET_SHARED_SECRET = <same string as SHARED_SECRET below>
 *       GSHEET_VIEW_URL      = <the Google Sheet URL>     (used by the
 *                                                          Dashboard's
 *                                                          "Open Live Sheet"
 *                                                          button)
 *     Restart the backend.
 *
 *  6. Open the app's Dashboard. You should see "Live" badge. Save a test
 *     receipt — within ~2 seconds the sheet will show these tabs (in order):
 *       Summary,
 *       Day1-IN,  Day2-IN,  Day3-IN,            (line-by-line, all columns)
 *       Day1-OUT, Day2-OUT, Day3-OUT,           (line-by-line, all columns)
 *       Day1-IN-Janwar,  Day2-IN-Janwar,  Day3-IN-Janwar,   (7 hisse per janwar)
 *       Day1-OUT-Janwar, Day2-OUT-Janwar, Day3-OUT-Janwar
 *
 *  UPDATING THE SCRIPT
 *  ----------------------------------------------------------------------
 *  If you edit Code.gs, you must  Deploy  ->  Manage deployments  ->
 *  edit the existing deployment (pencil icon)  ->  Version: New version
 *  ->  Deploy. The Web app URL stays the same.
 *
 * =====================================================================*/

const SHARED_SECRET = 'Qurb@n!K@RengED!|seK@reng%';

const HEADER_BG = '#15803d';
const HEADER_FG = '#ffffff';
const SECTION_BG = '#dcfce7';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ error: 'no body' });
    }
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SHARED_SECRET) {
      return jsonOut({ error: 'unauthorized' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const defaultHeaders = body.headers || [];
    const tabs = body.tabs || {};
    const summary = body.summary || null;

    Object.keys(tabs).forEach(function (name) {
      const tab = tabs[name] || {};
      const tabHeaders = (tab.headers && tab.headers.length) ? tab.headers : defaultHeaders;
      writeTab(ss, name, tabHeaders, tab);
    });

    reorderTabs(ss, Object.keys(tabs));

    if (summary) {
      writeSummary(ss, summary);
    }

    return jsonOut({
      ok: true,
      ts: new Date().toISOString(),
      tabs: Object.keys(tabs).length,
    });
  } catch (err) {
    return jsonOut({ error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonOut({
    ok: true,
    info: 'Qurbani sync endpoint. POST a JSON payload with the correct secret.',
  });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeTab(ss, name, headers, payload) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  sheet.clearFormats();

  // Defensive: never let width drop to 0 — Apps Script throws "number of
  // columns in the range must be at least 1" if it does. If headers are
  // missing, infer from the widest data row, otherwise use 1.
  let width = (headers && headers.length) ? headers.length : 0;
  if (!width) {
    const chunksPreview = (payload && payload.chunks) || [];
    for (let i = 0; i < chunksPreview.length; i++) {
      const rs = chunksPreview[i].rows || [];
      for (let j = 0; j < rs.length; j++) {
        if (rs[j] && rs[j].length > width) width = rs[j].length;
      }
    }
    if (!width) width = 1;
    headers = headers && headers.length ? headers : new Array(width).fill('');
  }

  // Support both shapes:
  //   - { chunks: [{title, rows:[[...]]}, ...] }   (new "7-row master" format)
  //   - [[...], [...]]                              (legacy flat rows)
  const chunks = normaliseChunks(payload);

  if (chunks.length === 0) {
    sheet.getRange(1, 1).setValue('No entries').setFontStyle('italic').setFontColor('#94a3b8');
    return;
  }

  let r = 1;
  const emptyRow = new Array(width).fill('');

  chunks.forEach(function (chunk) {
    // Title row — merged across the full width
    const titleRange = sheet.getRange(r, 1, 1, width);
    sheet.getRange(r, 1).setValue(chunk.title);
    titleRange.merge()
      .setFontWeight('bold')
      .setFontSize(13)
      .setFontColor('#15803d')
      .setBackground('#f0fdf4');
    r += 1;

    // Header row
    sheet.getRange(r, 1, 1, width).setValues([headers])
      .setFontWeight('bold')
      .setBackground(HEADER_BG)
      .setFontColor(HEADER_FG)
      .setHorizontalAlignment('center');
    r += 1;

    // Data rows
    if (chunk.rows && chunk.rows.length > 0) {
      const data = chunk.rows.map(function (row) {
        const out = row.slice(0, width);
        while (out.length < width) out.push('');
        return out;
      });
      const dataRange = sheet.getRange(r, 1, data.length, width);
      dataRange.setValues(data);
      dataRange.setBorder(true, true, true, true, true, true);
      r += data.length;
    }

    // Blank spacer row between tables
    sheet.getRange(r, 1, 1, width).setValues([emptyRow]);
    r += 1;
  });

  for (let c = 1; c <= width; c++) sheet.autoResizeColumn(c);
}

function normaliseChunks(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    // Legacy flat rows — wrap as a single chunk so old payloads still render
    return payload.length === 0 ? [] : [{ title: '', rows: payload }];
  }
  if (payload.chunks && payload.chunks.length) return payload.chunks;
  return [];
}

// Reorder data tabs to match the payload order. Summary (added separately)
// gets pushed to position 1 by writeSummary, so data tabs start at index 2.
function reorderTabs(ss, names) {
  let pos = 2;
  names.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(pos);
    pos += 1;
  });
}

function writeSummary(ss, summary) {
  const name = 'Summary';
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name, 0); // put Summary first
  sheet.clear();
  sheet.clearFormats();

  const width = summary.width || 8;
  const rows = summary.rows || [];
  if (rows.length === 0) return;

  sheet.getRange(1, 1, rows.length, width).setValues(rows);

  const bold = summary.boldRows || [];
  bold.forEach(function (r) {
    sheet.getRange(r + 1, 1, 1, width).setFontWeight('bold');
  });

  const sections = summary.sectionRows || [];
  sections.forEach(function (r) {
    sheet.getRange(r + 1, 1, 1, width)
      .setBackground(SECTION_BG)
      .setFontWeight('bold');
  });

  for (let c = 1; c <= width; c++) sheet.autoResizeColumn(c);
  sheet.setFrozenRows(1);

  // Move Summary tab to the front so it's the first thing the user sees
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
}
