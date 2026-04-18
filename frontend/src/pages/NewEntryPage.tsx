import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { openHtmlPrint, downloadPdf, printThermal } from '../api/receiptActions';
import { validateReceiptForm, hasErrors, ReceiptFormErrors } from '../utils/receiptValidation';
import toast from 'react-hot-toast';

type QurbaniType = 'in' | 'out';
type Day = 1 | 2 | 3;
type HissaType = 'qurbani' | 'aqeeqah';
type AqeeqahGender = 'ladka' | 'ladki';

interface HissaRow {
  naam: string;
  type: HissaType;
  aqeeqahGender?: AqeeqahGender;
}

interface FormState {
  naam: string;
  address: string;
  mobile: string;
  day: Day;
  qurbaniType: QurbaniType;
  amount: string;
  notes: string;
  hisse: HissaRow[];
}

const INITIAL: FormState = {
  naam: '',
  address: '',
  mobile: '',
  day: 1,
  qurbaniType: 'in',
  amount: '',
  notes: '',
  hisse: [{ naam: '', type: 'qurbani' }],
};

function hissaCount(h: HissaRow) {
  if (h.type === 'aqeeqah' && h.aqeeqahGender === 'ladka') return 2;
  return 1;
}

export default function NewEntryPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  const [receiptNo, setReceiptNo] = useState('');
  const [availability, setAvailability] = useState<'checking' | 'ok' | 'taken' | 'idle'>('idle');
  const [errors, setErrors] = useState<ReceiptFormErrors>({});
  const [touched, setTouched] = useState(false);

  // Live check uniqueness of receipt no
  useEffect(() => {
    if (!receiptNo.trim()) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/entries/check-receipt-no', {
          params: { no: receiptNo.trim() },
        });
        setAvailability(data.available ? 'ok' : 'taken');
      } catch {
        setAvailability('idle');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [receiptNo]);

  const totalHisse = useMemo(
    () => form.hisse.reduce((s, h) => s + hissaCount(h), 0),
    [form.hisse]
  );

  // Live validation (updates errors after first submit attempt)
  useEffect(() => {
    if (!touched) return;
    const e = validateReceiptForm({
      receiptNo,
      naam: form.naam,
      mobile: form.mobile,
      address: form.address,
      day: form.day,
      qurbaniType: form.qurbaniType,
      amount: form.amount,
      notes: form.notes,
      hisse: form.hisse,
    });
    setErrors(e);
  }, [touched, receiptNo, form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setHissa(i: number, patch: Partial<HissaRow>) {
    setForm((f) => {
      const arr = [...f.hisse];
      arr[i] = { ...arr[i], ...patch };
      if (arr[i].type === 'aqeeqah' && !arr[i].aqeeqahGender) {
        arr[i].aqeeqahGender = 'ladki';
      }
      if (arr[i].type === 'qurbani') {
        delete arr[i].aqeeqahGender;
      }
      return { ...f, hisse: arr };
    });
  }

  function addHissa() {
    setForm((f) => ({ ...f, hisse: [...f.hisse, { naam: '', type: 'qurbani' }] }));
  }

  function removeHissa(i: number) {
    setForm((f) => {
      if (f.hisse.length === 1) return f;
      const arr = f.hisse.filter((_, idx) => idx !== i);
      return { ...f, hisse: arr };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);

    const clientErrors = validateReceiptForm({
      receiptNo,
      naam: form.naam,
      mobile: form.mobile,
      address: form.address,
      day: form.day,
      qurbaniType: form.qurbaniType,
      amount: form.amount,
      notes: form.notes,
      hisse: form.hisse,
    });
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) {
      toast.error('Form mein errors hain — sahi karke save karein');
      return;
    }
    if (availability === 'taken') {
      setErrors((e) => ({ ...e, receiptNo: 'Already used' }));
      toast.error('Yeh receipt no pehle se use ho chuka hai');
      return;
    }

    const payload = {
      naam: form.naam.trim(),
      address: form.address.trim(),
      mobile: form.mobile.trim(),
      day: form.day,
      qurbaniType: form.qurbaniType,
      amount: form.amount,
      notes: form.notes.trim(),
      deviceLabel: localStorage.getItem('qurb_device_label') || '',
      receiptNo: receiptNo.trim(),
      hisse: form.hisse.map((h) => ({
        naam: h.naam.trim(),
        type: h.type,
        aqeeqahGender: h.type === 'aqeeqah' ? h.aqeeqahGender : undefined,
      })),
    };

    setSubmitting(true);
    try {
      const { data } = await api.post('/entries', payload);
      setLastReceipt(data.receipt);
      toast.success(`Receipt ${data.receipt.receiptNo} saved (${data.receipt.totalHisse} hisse)`);
      setForm({
        ...INITIAL,
        day: form.day,
        qurbaniType: form.qurbaniType,
      });
      setReceiptNo('');
      setAvailability('idle');
      setErrors({});
      setTouched(false);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.fields) {
        setErrors(data.fields);
      }
      toast.error(data?.error || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  const cls = (err?: string) => `input ${err ? 'border-red-400 focus:ring-red-500' : ''}`;
  const ErrMsg = ({ msg }: { msg?: string }) =>
    msg ? <div className="text-xs text-red-600 mt-1">{msg}</div> : null;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <form onSubmit={onSubmit} className="card md:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold">Nayi Receipt</h2>

        <div>
          <label className="label">Receipt No *</label>
          <input
            className={`${cls(errors.receiptNo)} font-mono`}
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="e.g., 101"
          />
          {errors.receiptNo ? (
            <ErrMsg msg={errors.receiptNo} />
          ) : (
            <div className="text-xs mt-1 h-4">
              {availability === 'checking' && <span className="text-slate-500">Check kar rahe hain…</span>}
              {availability === 'ok' && <span className="text-green-600">✓ Available</span>}
              {availability === 'taken' && <span className="text-red-600">✕ Already used</span>}
            </div>
          )}
        </div>

        {/* Family / Contact */}
        <div className="space-y-3">
          <div>
            <label className="label">Family / Primary Naam *</label>
            <input
              className={cls(errors.naam)}
              value={form.naam}
              onChange={(e) => update('naam', e.target.value)}
              autoFocus
              maxLength={100}
            />
            <ErrMsg msg={errors.naam} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mobile * (10 digits)</label>
              <input
                className={cls(errors.mobile)}
                value={form.mobile}
                onChange={(e) => update('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                maxLength={10}
              />
              <ErrMsg msg={errors.mobile} />
            </div>
            <div>
              <label className="label">Amount (Rs.) — total</label>
              <input
                className={cls(errors.amount)}
                value={form.amount}
                onChange={(e) => update('amount', e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="numeric"
              />
              <ErrMsg msg={errors.amount} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className={cls(errors.address)}
              rows={2}
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              maxLength={200}
            />
            <ErrMsg msg={errors.address} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kaunsa Din?</label>
              <select
                className="input"
                value={form.day}
                onChange={(e) => update('day', Number(e.target.value) as Day)}
              >
                <option value={1}>Day 1</option>
                <option value={2}>Day 2</option>
                <option value={3}>Day 3</option>
              </select>
            </div>
            <div>
              <label className="label">In / Out</label>
              <select
                className="input"
                value={form.qurbaniType}
                onChange={(e) => update('qurbaniType', e.target.value as QurbaniType)}
              >
                <option value="in">IN</option>
                <option value="out">OUT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Hisse list */}
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              Hisse —{' '}
              <span className="text-brand-700 font-bold">{totalHisse}</span> total
            </div>
            <button type="button" onClick={addHissa} className="btn btn-primary text-sm py-1">
              + Add Hissa
            </button>
          </div>

          {form.hisse.map((h, i) => {
            const rowErr = errors.hisseRows?.[i] || {};
            return (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded border border-slate-200"
            >
              <div className="col-span-1 text-xs text-slate-500 pt-7">#{i + 1}</div>
              <div className="col-span-5">
                <label className="label text-xs">Naam</label>
                <input
                  className={cls(rowErr.naam)}
                  value={h.naam}
                  onChange={(e) => setHissa(i, { naam: e.target.value })}
                  placeholder="Hissa owner ka naam"
                  maxLength={100}
                />
                <ErrMsg msg={rowErr.naam} />
              </div>
              <div className="col-span-3">
                <label className="label text-xs">Type</label>
                <select
                  className="input"
                  value={h.type}
                  onChange={(e) => setHissa(i, { type: e.target.value as HissaType })}
                >
                  <option value="qurbani">Qurbani</option>
                  <option value="aqeeqah">Aqeeqah</option>
                </select>
              </div>
              {h.type === 'aqeeqah' ? (
                <div className="col-span-2">
                  <label className="label text-xs">Gender</label>
                  <select
                    className="input"
                    value={h.aqeeqahGender || 'ladki'}
                    onChange={(e) => setHissa(i, { aqeeqahGender: e.target.value as AqeeqahGender })}
                  >
                    <option value="ladki">Ladki (1)</option>
                    <option value="ladka">Ladka (2)</option>
                  </select>
                </div>
              ) : (
                <div className="col-span-2 text-xs text-slate-500 pb-3">1 hissa</div>
              )}
              <div className="col-span-1 flex justify-end pt-7">
                <button
                  type="button"
                  onClick={() => removeHissa(i)}
                  className="text-red-600 text-xs hover:underline"
                  disabled={form.hisse.length === 1}
                >
                  ✕
                </button>
              </div>
            </div>
            );
          })}

          {errors.hisse && <ErrMsg msg={errors.hisse} />}
          <div className="text-xs text-slate-500">
            Tip: Aqeeqah Ladka = 2 hisse count hongi (same receipt pe).
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <input
            className={cls(errors.notes)}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            maxLength={500}
          />
          <ErrMsg msg={errors.notes} />
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : `Save Receipt (${totalHisse} hisse)`}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(INITIAL)}>
            Reset
          </button>
        </div>
      </form>

      <div className="card h-fit sticky top-4">
        <h3 className="font-semibold mb-2">Last Saved</h3>
        {!lastReceipt ? (
          <p className="text-sm text-slate-500">Abhi koi receipt save nahi ki.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="text-center bg-brand-50 rounded p-2">
              <div className="text-xs text-slate-500">Receipt No</div>
              <div className="font-bold text-brand-700 text-lg">{lastReceipt.receiptNo}</div>
            </div>
            <div><span className="text-slate-500">Naam:</span> {lastReceipt.naam}</div>
            <div><span className="text-slate-500">Mobile:</span> {lastReceipt.mobile}</div>
            <div>
              <span className="text-slate-500">Day:</span> {lastReceipt.day} &nbsp;
              <span className="text-slate-500">In/Out:</span> {lastReceipt.qurbaniType.toUpperCase()}
            </div>
            <div className="font-semibold pt-1">Hisse ({lastReceipt.totalHisse}):</div>
            <div className="space-y-1 text-xs">
              {lastReceipt.hisse.map((h: any) => (
                <div key={h.code} className="border-l-2 border-brand-500 pl-2">
                  <div className="font-medium">{h.hissaNo}. {h.naam}</div>
                  <div className="text-slate-500">
                    {h.type}
                    {h.aqeeqahGender ? ` (${h.aqeeqahGender}${h.aqeeqahPart ? ` ${h.aqeeqahPart}/2` : ''})` : ''}
                    {' · '}S.No {h.serialNo}
                  </div>
                  <div className="font-mono text-slate-400">{h.code}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 pt-2">
              <button
                onClick={() => openHtmlPrint(lastReceipt._id)}
                className="btn btn-secondary text-xs py-1"
              >
                Browser Print
              </button>
              <button
                onClick={() => printThermal(lastReceipt._id)}
                className="btn btn-primary text-xs py-1"
              >
                Thermal Print
              </button>
              <button
                onClick={() => downloadPdf(lastReceipt._id, lastReceipt.receiptNo, 'a4')}
                className="btn btn-secondary text-xs py-1"
              >
                PDF (A4)
              </button>
              <button
                onClick={() => downloadPdf(lastReceipt._id, lastReceipt.receiptNo, 'thermal')}
                className="btn btn-secondary text-xs py-1"
              >
                PDF (58mm)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
