import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { openHtmlPrint, downloadPdf, printThermal } from '../api/receiptActions';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface Hissa {
  hissaNo: number;
  code: string;
  serialNo: number;
  naam: string;
  type: 'qurbani' | 'aqeeqah';
  aqeeqahGender?: 'ladka' | 'ladki' | null;
  aqeeqahPart?: number | null;
  pairId?: string | null;
}

interface Receipt {
  _id: string;
  receiptNo: string;
  naam: string;
  mobile: string;
  address: string;
  day: number;
  qurbaniType: 'in' | 'out';
  hisse: Hissa[];
  totalHisse: number;
  amount: number;
  receiverName?: string;
  paymentMode?: 'cash' | 'online';
  parts?: number;
  amountPerPart?: number;
  notes?: string;
  createdByName: string;
  deviceInfo?: { deviceLabel?: string };
  createdAt: string;
}

type HissaType = 'qurbani' | 'aqeeqah';
type AqeeqahGender = 'ladka' | 'ladki';
type PaymentMode = 'cash' | 'online';
type Day = 1 | 2 | 3;

interface HissaRow {
  naam: string;
  type: HissaType;
  aqeeqahGender?: AqeeqahGender;
}

interface EditForm {
  receiptNo: string;
  naam: string;
  mobile: string;
  address: string;
  day: Day;
  qurbaniType: 'in' | 'out';
  receiverName: string;
  paymentMode: PaymentMode;
  parts: string;
  amountPerPart: string;
  notes: string;
  hisse: HissaRow[];
}

function collapseHisseForEdit(hisse: Hissa[]): HissaRow[] {
  // Stored hisse have 2 rows per ladka aqeeqah (linked by pairId). Collapse
  // them back into one row per logical entry for the form.
  const seenPairs = new Set<string>();
  const rows: HissaRow[] = [];
  for (const h of hisse) {
    if (h.pairId) {
      if (seenPairs.has(h.pairId)) continue;
      seenPairs.add(h.pairId);
    }
    const row: HissaRow = { naam: h.naam, type: h.type };
    if (h.type === 'aqeeqah' && h.aqeeqahGender) row.aqeeqahGender = h.aqeeqahGender;
    rows.push(row);
  }
  return rows;
}

function hissaCount(h: HissaRow) {
  if (h.type === 'aqeeqah' && h.aqeeqahGender === 'ladka') return 2;
  return 1;
}

export default function EntriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [day, setDay] = useState('');
  const [qurbaniType, setQurbaniType] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenId]);

  const debouncedQ = useDebounce(q, 300);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const { data } = await api.get('/entries', {
        params: {
          q: debouncedQ || undefined,
          day: day || undefined,
          qurbaniType: qurbaniType || undefined,
          type: type || undefined,
        },
        signal,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [debouncedQ, day, qurbaniType, type]);

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteEntry(id: string, receiptNo: string) {
    if (!confirm(`Receipt ${receiptNo} ko permanently delete karna hai? Yeh wapas nahi aayegi.`)) return;
    try {
      await api.delete(`/entries/${id}`);
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  }

  function openEdit(r: Receipt) {
    setEditing(r);
    setEditForm({
      receiptNo: r.receiptNo,
      naam: r.naam,
      mobile: r.mobile,
      address: r.address || '',
      day: (r.day as Day) || 1,
      qurbaniType: r.qurbaniType,
      receiverName: r.receiverName || '',
      paymentMode: r.paymentMode || 'cash',
      parts: String(r.parts ?? ''),
      amountPerPart: String(r.amountPerPart ?? ''),
      notes: r.notes || '',
      hisse: collapseHisseForEdit(r.hisse),
    });
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
  }

  function patchEdit(p: Partial<EditForm>) {
    setEditForm((f) => (f ? { ...f, ...p } : f));
  }

  function setEditHissa(i: number, p: Partial<HissaRow>) {
    setEditForm((f) => {
      if (!f) return f;
      const arr = [...f.hisse];
      arr[i] = { ...arr[i], ...p };
      if (arr[i].type === 'aqeeqah' && !arr[i].aqeeqahGender) arr[i].aqeeqahGender = 'ladki';
      if (arr[i].type === 'qurbani') delete arr[i].aqeeqahGender;
      return { ...f, hisse: arr };
    });
  }

  function addEditHissa() {
    setEditForm((f) => {
      if (!f) return f;
      const target = Number(f.parts || 0);
      const current = f.hisse.reduce((s, h) => s + hissaCount(h), 0);
      if (target > 0 && current + 1 > target) {
        toast.error(`Parts ${target} hai — aur hissa add nahi kar sakte`);
        return f;
      }
      return { ...f, hisse: [...f.hisse, { naam: '', type: 'qurbani' }] };
    });
  }

  function removeEditHissa(i: number) {
    setEditForm((f) => {
      if (!f) return f;
      if (f.hisse.length === 1) return f;
      return { ...f, hisse: f.hisse.filter((_, idx) => idx !== i) };
    });
  }

  const editTotalHisse = useMemo(
    () => (editForm ? editForm.hisse.reduce((s, h) => s + hissaCount(h), 0) : 0),
    [editForm]
  );
  const editComputedAmount = useMemo(() => {
    if (!editForm) return 0;
    const p = Number(editForm.parts || 0);
    const a = Number(editForm.amountPerPart || 0);
    return Math.max(0, p * a);
  }, [editForm]);
  const editPartsTarget = Number(editForm?.parts || 0);
  const editCanAddHissa = !editForm || editPartsTarget === 0 || editTotalHisse + 1 <= editPartsTarget;
  const editPartsMatch = editPartsTarget > 0 && editTotalHisse === editPartsTarget;

  async function saveEdit() {
    if (!editing || !editForm) return;

    const f = editForm;
    if (!f.receiptNo.trim()) { toast.error('Receipt no zaroori hai'); return; }
    if (!f.naam.trim()) { toast.error('Naam zaroori hai'); return; }
    if (!/^\d{10}$/.test(f.mobile.trim())) { toast.error('10 digit ka mobile chahiye'); return; }
    if (![1, 2, 3].includes(f.day)) { toast.error('Day select karein'); return; }
    if (!['in', 'out'].includes(f.qurbaniType)) { toast.error('In/Out select karein'); return; }
    if (f.hisse.length === 0) { toast.error('Kam se kam 1 hissa zaroori hai'); return; }
    for (const h of f.hisse) {
      if (!h.naam.trim()) { toast.error('Har hissa ka naam zaroori hai'); return; }
      if (h.type === 'aqeeqah' && !h.aqeeqahGender) { toast.error('Aqeeqah ke liye gender zaroori hai'); return; }
    }

    const parts = Number(f.parts || 0);
    const amountPerPart = Number(f.amountPerPart || 0);
    const amount = Math.max(0, parts * amountPerPart);

    if (parts > 0 && parts !== editTotalHisse) {
      toast.error(`Parts ${parts} hai lekin ${editTotalHisse} hisse hain — match honi chahiye`);
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/entries/${editing._id}`, {
        receiptNo: f.receiptNo.trim(),
        naam: f.naam.trim(),
        mobile: f.mobile.trim(),
        address: f.address.trim(),
        day: f.day,
        qurbaniType: f.qurbaniType,
        receiverName: f.receiverName.trim(),
        paymentMode: f.paymentMode,
        parts,
        amountPerPart,
        amount,
        notes: f.notes.trim(),
        hisse: f.hisse.map((h) => ({
          naam: h.naam.trim(),
          type: h.type,
          aqeeqahGender: h.type === 'aqeeqah' ? h.aqeeqahGender : undefined,
        })),
        deviceLabel: localStorage.getItem('qurb_device_label') || '',
      });
      toast.success('Updated');
      closeEdit();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  // print / pdf handlers imported from api/receiptActions

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <label className="label">Search (naam / mobile / receipt / hissa naam)</label>
          <input
            className="input pr-16"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type karte hi search ho jayega…"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-[34px] text-slate-400 hover:text-slate-600 text-sm"
              title="Clear"
            >
              ✕
            </button>
          )}
          {loading && q !== debouncedQ && (
            <div className="absolute right-8 top-[38px] text-xs text-slate-400">…</div>
          )}
        </div>
        <div>
          <label className="label">Day</label>
          <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">All</option>
            <option value="1">Day 1</option>
            <option value="2">Day 2</option>
            <option value="3">Day 3</option>
          </select>
        </div>
        <div>
          <label className="label">In/Out</label>
          <select className="input" value={qurbaniType} onChange={(e) => setQurbaniType(e.target.value)}>
            <option value="">All</option>
            <option value="in">IN</option>
            <option value="out">OUT</option>
          </select>
        </div>
        <div>
          <label className="label">Has Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            <option value="qurbani">Qurbani</option>
            <option value="aqeeqah">Aqeeqah</option>
          </select>
        </div>
        {(q || day || qurbaniType || type) && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setDay('');
              setQurbaniType('');
              setType('');
            }}
            className="btn btn-secondary"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Receipts ({total})</h3>
          {loading && <span className="text-sm text-slate-500">Loading…</span>}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2 w-6"></th>
              <th className="p-2">Receipt</th>
              <th className="p-2">Naam</th>
              <th className="p-2">Mobile</th>
              <th className="p-2">Day</th>
              <th className="p-2">In/Out</th>
              <th className="p-2">Hisse</th>
              <th className="p-2">Amount</th>
              <th className="p-2">By</th>
              <th className="p-2">Device</th>
              <th className="p-2">Time</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const open = expanded.has(r._id);
              return (
                <Fragment key={r._id}>
                  <tr className="border-t hover:bg-slate-50">
                    <td className="p-2">
                      <button onClick={() => toggle(r._id)} className="text-slate-500">
                        {open ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="p-2 font-mono font-semibold">{r.receiptNo}</td>
                    <td className="p-2">{r.naam}</td>
                    <td className="p-2">{r.mobile}</td>
                    <td className="p-2">{r.day}</td>
                    <td className="p-2 uppercase">{r.qurbaniType}</td>
                    <td className="p-2 font-semibold">{r.totalHisse}</td>
                    <td className="p-2">{r.amount || '-'}</td>
                    <td className="p-2">{r.createdByName}</td>
                    <td className="p-2">{r.deviceInfo?.deviceLabel || '-'}</td>
                    <td className="p-2 text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 whitespace-nowrap relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === r._id ? null : r._id);
                        }}
                        className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm"
                        aria-label="Actions"
                      >
                        Actions ▾
                      </button>
                      {menuOpenId === r._id && (
                        <div
                          className="absolute right-2 top-full mt-1 z-20 bg-white border border-slate-200 rounded-md shadow-lg py-1 min-w-[150px] text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MenuItem onClick={() => { setMenuOpenId(null); openEdit(r); }}>
                            ✏️ Edit
                          </MenuItem>
                          <MenuItem onClick={() => { setMenuOpenId(null); openHtmlPrint(r._id); }}>
                            🖨️ Browser Print
                          </MenuItem>
                          <MenuItem onClick={() => { setMenuOpenId(null); downloadPdf(r._id, r.receiptNo, 'a4'); }}>
                            📄 PDF (A4)
                          </MenuItem>
                          <MenuItem onClick={() => { setMenuOpenId(null); downloadPdf(r._id, r.receiptNo, 'thermal'); }}>
                            📄 PDF (58mm)
                          </MenuItem>
                          <MenuItem onClick={() => { setMenuOpenId(null); printThermal(r._id); }}>
                            🧾 Thermal Print
                          </MenuItem>
                          {isAdmin && (
                            <>
                              <div className="border-t border-slate-200 my-1" />
                              <MenuItem
                                danger
                                onClick={() => { setMenuOpenId(null); deleteEntry(r._id, r.receiptNo); }}
                              >
                                🗑️ Delete
                              </MenuItem>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50">
                      <td></td>
                      <td colSpan={11} className="p-2">
                        <table className="w-full text-xs">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="text-left p-1">Code</th>
                              <th className="text-left p-1">#</th>
                              <th className="text-left p-1">Naam</th>
                              <th className="text-left p-1">Type</th>
                              <th className="text-left p-1">Serial</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.hisse.map((h) => (
                              <tr key={h.code} className="border-t">
                                <td className="p-1 font-mono">{h.code}</td>
                                <td className="p-1">{h.hissaNo}</td>
                                <td className="p-1">{h.naam}</td>
                                <td className="p-1">
                                  {h.type}
                                  {h.aqeeqahGender
                                    ? ` (${h.aqeeqahGender}${h.aqeeqahPart ? ` ${h.aqeeqahPart}/2` : ''})`
                                    : ''}
                                </td>
                                <td className="p-1">{h.serialNo}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={12} className="p-4 text-center text-slate-500">Koi receipt nahi mili</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && editForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeEdit}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
              <h3 className="font-semibold">
                Edit Receipt <span className="font-mono text-brand-700">{editing.receiptNo}</span>
              </h3>
              <button onClick={closeEdit} className="text-slate-500 hover:text-slate-700 text-xl leading-none">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Receipt No *</label>
                <input
                  className="input font-mono"
                  value={editForm.receiptNo}
                  onChange={(e) => patchEdit({ receiptNo: e.target.value })}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="label">Family / Primary Naam *</label>
                <input
                  className="input"
                  value={editForm.naam}
                  onChange={(e) => patchEdit({ naam: e.target.value })}
                  maxLength={100}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Mobile * (10 digits)</label>
                  <input
                    className="input"
                    value={editForm.mobile}
                    onChange={(e) => patchEdit({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="label">Receiver Name</label>
                  <input
                    className="input"
                    value={editForm.receiverName}
                    onChange={(e) => patchEdit({ receiverName: e.target.value })}
                    maxLength={100}
                  />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <textarea
                  className="input"
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => patchEdit({ address: e.target.value })}
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Kaunsa Din?</label>
                  <select
                    className="input"
                    value={editForm.day}
                    onChange={(e) => patchEdit({ day: Number(e.target.value) as Day })}
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
                    value={editForm.qurbaniType}
                    onChange={(e) => patchEdit({ qurbaniType: e.target.value as 'in' | 'out' })}
                  >
                    <option value="in">IN</option>
                    <option value="out">OUT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Payment Mode</label>
                <div className="flex gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editPaymentMode"
                      checked={editForm.paymentMode === 'cash'}
                      onChange={() => patchEdit({ paymentMode: 'cash' })}
                    />
                    <span>Cash</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editPaymentMode"
                      checked={editForm.paymentMode === 'online'}
                      onChange={() => patchEdit({ paymentMode: 'online' })}
                    />
                    <span>Online</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Hissa (Parts)</label>
                  <input
                    className="input"
                    value={editForm.parts}
                    onChange={(e) => patchEdit({ parts: e.target.value.replace(/[^\d]/g, '') })}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="label">Amount Per Part</label>
                  <input
                    className="input"
                    value={editForm.amountPerPart}
                    onChange={(e) => patchEdit({ amountPerPart: e.target.value.replace(/[^\d.]/g, '') })}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="label">Total Amount</label>
                  <input
                    className="input bg-slate-100 font-semibold"
                    value={editComputedAmount.toLocaleString('en-IN')}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>

              {/* Hisse list */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    Hisse —{' '}
                    <span className={`font-bold ${
                      editPartsTarget === 0
                        ? 'text-brand-700'
                        : editPartsMatch
                          ? 'text-green-700'
                          : 'text-amber-700'
                    }`}>
                      {editTotalHisse}
                    </span>
                    {editPartsTarget > 0 && (
                      <span className="text-slate-500"> / {editPartsTarget}</span>
                    )}
                    {editPartsTarget > 0 && editPartsMatch && (
                      <span className="ml-2 text-xs text-green-700">✓ match</span>
                    )}
                    {editPartsTarget > 0 && !editPartsMatch && (
                      <span className="ml-2 text-xs text-amber-700">
                        ({editTotalHisse < editPartsTarget ? `${editPartsTarget - editTotalHisse} aur chahiye` : `${editTotalHisse - editPartsTarget} extra hai`})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addEditHissa}
                    disabled={!editCanAddHissa}
                    className="btn btn-primary text-sm py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + Add Hissa
                  </button>
                </div>

                {editForm.hisse.map((h, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded border border-slate-200"
                  >
                    <div className="col-span-1 text-xs text-slate-500 pt-7">#{i + 1}</div>
                    <div className="col-span-5">
                      <label className="label text-xs">Naam</label>
                      <input
                        className="input"
                        value={h.naam}
                        onChange={(e) => setEditHissa(i, { naam: e.target.value })}
                        placeholder="Hissa owner ka naam"
                        maxLength={100}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="label text-xs">Type</label>
                      <select
                        className="input"
                        value={h.type}
                        onChange={(e) => setEditHissa(i, { type: e.target.value as HissaType })}
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
                          onChange={(e) => setEditHissa(i, { aqeeqahGender: e.target.value as AqeeqahGender })}
                        >
                          <option value="ladki">Ladki (1)</option>
                          <option value="ladka">Ladka (2)</option>
                        </select>
                      </div>
                    ) : (
                      <div className="col-span-2 text-xs text-slate-500 pb-3 pt-7">1 hissa</div>
                    )}
                    <div className="col-span-1 flex justify-end pt-7">
                      <button
                        type="button"
                        onClick={() => removeEditHissa(i)}
                        className="text-red-600 text-xs hover:underline"
                        disabled={editForm.hisse.length === 1}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                <div className="text-xs text-slate-500">
                  Tip: Aqeeqah Ladka = 2 hisse count hongi. Edit karte hi naye hissa codes/serials assign honge.
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={(e) => patchEdit({ notes: e.target.value })}
                  maxLength={500}
                />
              </div>
            </div>
            <div className="border-t px-4 py-3 flex justify-end gap-2 bg-slate-50 sticky bottom-0">
              <button className="btn btn-secondary" onClick={closeEdit} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 hover:bg-slate-100 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
