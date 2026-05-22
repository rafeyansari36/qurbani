export interface HissaInput {
  naam: string;
  type: 'qurbani' | 'aqeeqah';
  aqeeqahGender?: 'ladka' | 'ladki';
}

export interface ReceiptFormInput {
  receiptNo: string;
  naam: string;
  mobile: string;
  address?: string;
  day: 1 | 2 | 3;
  qurbaniType: 'in' | 'out';
  amount?: string | number;
  receiverName?: string;
  paymentMode?: 'cash' | 'online';
  parts?: string | number;
  amountPerPart?: string | number;
  notes?: string;
  hisse: HissaInput[];
}

export interface ReceiptFormErrors {
  receiptNo?: string;
  naam?: string;
  mobile?: string;
  address?: string;
  day?: string;
  qurbaniType?: string;
  amount?: string;
  receiverName?: string;
  paymentMode?: string;
  parts?: string;
  amountPerPart?: string;
  notes?: string;
  hisse?: string;
  hisseRows?: Record<number, { naam?: string; type?: string; aqeeqahGender?: string }>;
}

export function validateReceiptForm(f: ReceiptFormInput): ReceiptFormErrors {
  const errs: ReceiptFormErrors = {};

  const rn = f.receiptNo.trim();
  if (!rn) errs.receiptNo = 'Receipt no zaroori hai';
  else if (rn.length > 50) errs.receiptNo = 'Max 50 chars';
  else if (!/^[A-Za-z0-9/_\-\s]+$/.test(rn))
    errs.receiptNo = 'Sirf letters, numbers, -, _, / allowed';

  if (!f.naam.trim()) errs.naam = 'Naam zaroori hai';
  else if (f.naam.trim().length > 100) errs.naam = 'Max 100 chars';

  const mob = f.mobile.trim();
  if (!mob) errs.mobile = 'Mobile zaroori hai';
  else if (!/^\d{10}$/.test(mob)) errs.mobile = '10 digit ka valid mobile no';

  if (f.address && f.address.length > 200) errs.address = 'Max 200 chars';

  if (![1, 2, 3].includes(f.day)) errs.day = 'Day select karein';
  if (!['in', 'out'].includes(f.qurbaniType)) errs.qurbaniType = 'In/Out select karein';

  const amt = Number(f.amount || 0);
  if (!Number.isFinite(amt) || amt < 0) errs.amount = 'Amount 0 ya zyada';
  else if (amt > 1e7) errs.amount = 'Amount bahut zyada hai';

  if (f.receiverName && f.receiverName.length > 100) errs.receiverName = 'Max 100 chars';

  if (f.paymentMode && !['cash', 'online'].includes(f.paymentMode)) {
    errs.paymentMode = 'Cash ya Online select karein';
  }

  const parts = Number(f.parts || 0);
  if (!Number.isFinite(parts) || parts < 0) errs.parts = 'Parts 0 ya zyada';
  else if (parts > 1000) errs.parts = 'Parts bahut zyada';

  const app = Number(f.amountPerPart || 0);
  if (!Number.isFinite(app) || app < 0) errs.amountPerPart = 'Amount/part 0 ya zyada';
  else if (app > 1e7) errs.amountPerPart = 'Amount/part bahut zyada';

  if (f.notes && f.notes.length > 500) errs.notes = 'Max 500 chars';

  if (!f.hisse.length) errs.hisse = 'Kam se kam 1 hissa';
  else if (f.hisse.length > 20) errs.hisse = 'Max 20 hisse';

  const rows: Record<number, any> = {};
  f.hisse.forEach((h, i) => {
    const he: any = {};
    if (!h.naam.trim()) he.naam = 'Naam zaroori hai';
    else if (h.naam.trim().length > 100) he.naam = 'Max 100 chars';
    if (!['qurbani', 'aqeeqah'].includes(h.type)) he.type = 'Type select karein';
    if (h.type === 'aqeeqah' && !['ladka', 'ladki'].includes(h.aqeeqahGender || '')) {
      he.aqeeqahGender = 'Gender zaroori hai';
    }
    if (Object.keys(he).length) rows[i] = he;
  });
  if (Object.keys(rows).length) errs.hisseRows = rows;

  // Parts must match expanded hisse count (ladka aqeeqah = 2 hisse)
  if (!errs.hisse && !errs.hisseRows && parts > 0) {
    const expanded = f.hisse.reduce((s, h) => {
      if (h.type === 'aqeeqah' && h.aqeeqahGender === 'ladka') return s + 2;
      return s + 1;
    }, 0);
    if (expanded !== parts) {
      errs.hisse = `Parts ${parts} hai lekin ${expanded} hisse hain — match honi chahiye`;
    }
  }

  return errs;
}

export const hasErrors = (e: ReceiptFormErrors) =>
  Object.keys(e).some((k) => (k === 'hisseRows' ? Object.keys(e.hisseRows || {}).length > 0 : !!(e as any)[k]));
