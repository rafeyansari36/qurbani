export class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.status = 400;
    this.errors = errors;
  }
}

const isString = (v) => typeof v === 'string';
const len = (v) => (isString(v) ? v.trim().length : 0);

export function validateReceiptInput(body) {
  const errors = {};

  const receiptNo = isString(body.receiptNo) ? body.receiptNo.trim() : '';
  if (!receiptNo) errors.receiptNo = 'Receipt no zaroori hai';
  else if (receiptNo.length > 50) errors.receiptNo = 'Receipt no bahut lamba hai (max 50)';
  else if (!/^[A-Za-z0-9/_\-\s]+$/.test(receiptNo))
    errors.receiptNo = 'Sirf letters, numbers, -, _, / allowed hain';

  const naam = isString(body.naam) ? body.naam.trim() : '';
  if (!naam) errors.naam = 'Naam zaroori hai';
  else if (naam.length > 100) errors.naam = 'Naam bahut lamba hai (max 100)';

  const mobile = isString(body.mobile) ? body.mobile.trim() : '';
  if (!mobile) errors.mobile = 'Mobile zaroori hai';
  else if (!/^\d{10}$/.test(mobile)) errors.mobile = '10 digit ka valid mobile no daalein';

  if (body.address && len(body.address) > 200) errors.address = 'Address bahut lamba hai (max 200)';

  const day = Number(body.day);
  if (![1, 2, 3].includes(day)) errors.day = 'Day 1, 2 ya 3 hona chahiye';

  if (!['in', 'out'].includes(body.qurbaniType)) errors.qurbaniType = 'In ya Out select karein';

  const amount = Number(body.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) errors.amount = 'Amount 0 ya zyada hona chahiye';
  else if (amount > 1e7) errors.amount = 'Amount bahut zyada hai';

  if (body.notes && len(body.notes) > 500) errors.notes = 'Notes max 500 chars';

  // Hisse validation
  const hisseErrors = [];
  if (!Array.isArray(body.hisse) || body.hisse.length === 0) {
    errors.hisse = 'Kam se kam 1 hissa zaroori hai';
  } else if (body.hisse.length > 20) {
    errors.hisse = 'Ek receipt mein max 20 hisse ho sakte hain';
  } else {
    body.hisse.forEach((h, i) => {
      const he = {};
      const hnaam = isString(h.naam) ? h.naam.trim() : '';
      if (!hnaam) he.naam = 'Hissa ka naam zaroori hai';
      else if (hnaam.length > 100) he.naam = 'Naam bahut lamba (max 100)';

      if (!['qurbani', 'aqeeqah'].includes(h.type)) he.type = 'Type qurbani ya aqeeqah hona chahiye';
      if (h.type === 'aqeeqah' && !['ladka', 'ladki'].includes(h.aqeeqahGender)) {
        he.aqeeqahGender = 'Aqeeqah ke liye gender zaroori hai';
      }

      if (Object.keys(he).length) hisseErrors[i] = he;
    });
    if (hisseErrors.length) errors.hisseRows = hisseErrors;
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    receiptNo,
    naam,
    mobile,
    address: (body.address || '').trim(),
    day,
    qurbaniType: body.qurbaniType,
    amount,
    notes: (body.notes || '').trim(),
    hisse: body.hisse,
    deviceLabel: (body.deviceLabel || '').trim(),
  };
}

export function validateLoginInput(body) {
  const errors = {};
  if (!isString(body.username) || !body.username.trim()) errors.username = 'Username zaroori hai';
  if (!isString(body.password) || !body.password) errors.password = 'Password zaroori hai';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { username: body.username.trim(), password: body.password };
}

export function validateCreateUserInput(body) {
  const errors = {};
  const name = isString(body.name) ? body.name.trim() : '';
  if (!name) errors.name = 'Naam zaroori hai';
  else if (name.length > 100) errors.name = 'Naam bahut lamba (max 100)';

  const username = isString(body.username) ? body.username.trim().toLowerCase() : '';
  if (!username) errors.username = 'Username zaroori hai';
  else if (username.length < 3 || username.length > 30)
    errors.username = 'Username 3-30 chars ka hona chahiye';
  else if (!/^[a-z0-9_.-]+$/.test(username))
    errors.username = 'Sirf lowercase letters, numbers, _ . - allowed';

  if (!isString(body.password) || body.password.length < 6)
    errors.password = 'Password kam se kam 6 chars ka hona chahiye';

  const role = body.role || 'volunteer';
  if (!['admin', 'volunteer'].includes(role)) errors.role = 'Role admin ya volunteer';

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, username, password: body.password, role };
}

// Express error handler helper — keeps route handlers clean
export function handleValidation(err, res, next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: 'Validation failed', fields: err.errors });
  }
  next(err);
}
