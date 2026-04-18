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
  createdByName: string;
  deviceInfo?: { deviceLabel?: string };
  createdAt: string;
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

  async function cancel(id: string) {
    if (!confirm('Is receipt ko cancel karna hai?')) return;
    try {
      await api.post(`/entries/${id}/cancel`);
      toast.success('Cancelled');
      load();
    } catch {
      toast.error('Cancel failed');
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
                    <td className="p-2 whitespace-nowrap">
                      <button onClick={() => openHtmlPrint(r._id)} className="text-brand-700 mr-2">Print</button>
                      <button onClick={() => downloadPdf(r._id, r.receiptNo, 'a4')} className="text-brand-700 mr-2">PDF A4</button>
                      <button onClick={() => downloadPdf(r._id, r.receiptNo, 'thermal')} className="text-brand-700 mr-2">PDF 58mm</button>
                      <button onClick={() => printThermal(r._id)} className="text-brand-700 mr-2">Thermal</button>
                      <button onClick={() => cancel(r._id)} className="text-red-600">Cancel</button>
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
    </div>
  );
}
