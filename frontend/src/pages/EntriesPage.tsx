import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import { openHtmlPrint, downloadPdf, printThermal } from '../api/receiptActions';
import { useDebounce } from '../hooks/useDebounce';
import toast from 'react-hot-toast';

interface Hissa {
  hissaNo: number;
  code: string;
  serialNo: number;
  naam: string;
  type: 'qurbani' | 'aqeeqah';
  aqeeqahGender?: 'ladka' | 'ladki' | null;
  aqeeqahPart?: number | null;
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

interface EditForm {
  naam: string;
  mobile: string;
  address: string;
  receiverName: string;
  paymentMode: 'cash' | 'online';
  parts: string;
  amountPerPart: string;
  notes: string;
}

export default function EntriesPage() {
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
      naam: r.naam,
      mobile: r.mobile,
      address: r.address || '',
      receiverName: r.receiverName || '',
      paymentMode: r.paymentMode || 'cash',
      parts: String(r.parts ?? ''),
      amountPerPart: String(r.amountPerPart ?? ''),
      notes: r.notes || '',
    });
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editing || !editForm) return;
    if (!editForm.naam.trim()) { toast.error('Naam zaroori hai'); return; }
    if (!/^\d{10}$/.test(editForm.mobile.trim())) { toast.error('10 digit ka mobile chahiye'); return; }

    const parts = Number(editForm.parts || 0);
    const amountPerPart = Number(editForm.amountPerPart || 0);
    const amount = Math.max(0, parts * amountPerPart);

    setSaving(true);
    try {
      await api.patch(`/entries/${editing._id}`, {
        naam: editForm.naam.trim(),
        mobile: editForm.mobile.trim(),
        address: editForm.address.trim(),
        receiverName: editForm.receiverName.trim(),
        paymentMode: editForm.paymentMode,
        parts,
        amountPerPart,
        amount,
        notes: editForm.notes.trim(),
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
                          <div className="border-t border-slate-200 my-1" />
                          <MenuItem
                            danger
                            onClick={() => { setMenuOpenId(null); deleteEntry(r._id, r.receiptNo); }}
                          >
                            🗑️ Delete
                          </MenuItem>
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">
                Edit Receipt <span className="font-mono text-brand-700">{editing.receiptNo}</span>
              </h3>
              <button onClick={closeEdit} className="text-slate-500 hover:text-slate-700 text-xl leading-none">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-slate-500">
                Day {editing.day} · {editing.qurbaniType.toUpperCase()} · {editing.totalHisse} hisse
                <span className="ml-2 text-slate-400">(Day/In-Out/Hisse change nahi ho sakte)</span>
              </div>

              <div>
                <label className="label">Family / Primary Naam *</label>
                <input
                  className="input"
                  value={editForm.naam}
                  onChange={(e) => setEditForm({ ...editForm, naam: e.target.value })}
                  maxLength={100}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Mobile * (10 digits)</label>
                  <input
                    className="input"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="label">Receiver Name</label>
                  <input
                    className="input"
                    value={editForm.receiverName}
                    onChange={(e) => setEditForm({ ...editForm, receiverName: e.target.value })}
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
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="label">Payment Mode</label>
                <div className="flex gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editPaymentMode"
                      checked={editForm.paymentMode === 'cash'}
                      onChange={() => setEditForm({ ...editForm, paymentMode: 'cash' })}
                    />
                    <span>Cash</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editPaymentMode"
                      checked={editForm.paymentMode === 'online'}
                      onChange={() => setEditForm({ ...editForm, paymentMode: 'online' })}
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
                    onChange={(e) => setEditForm({ ...editForm, parts: e.target.value.replace(/[^\d]/g, '') })}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="label">Amount Per Part</label>
                  <input
                    className="input"
                    value={editForm.amountPerPart}
                    onChange={(e) => setEditForm({ ...editForm, amountPerPart: e.target.value.replace(/[^\d.]/g, '') })}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="label">Total Amount</label>
                  <input
                    className="input bg-slate-100 font-semibold"
                    value={(Number(editForm.parts || 0) * Number(editForm.amountPerPart || 0)).toLocaleString('en-IN')}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  maxLength={500}
                />
              </div>
            </div>
            <div className="border-t px-4 py-3 flex justify-end gap-2 bg-slate-50">
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
