import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { downloadExcel } from '../api/receiptActions';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface InOutBucket {
  receipts: number;
  hisse: number;
  qurbani: number;
  aqeeqah: number;
  amount: number;
}

interface DayTotals {
  receipts: number;
  hisse: number;
  amount: number;
}

interface CounterRow {
  counter: string;
  receipts: number;
  hisse: number;
  amount: number;
}

interface UserRow {
  user: string;
  receipts: number;
  hisse: number;
  amount: number;
}

interface Summary {
  totals: {
    receipts: number;
    hisse: number;
    qurbaniHisse: number;
    aqeeqahHisse: number;
    amount: number;
  };
  byDay: Record<string, { in: InOutBucket; out: InOutBucket }>;
  dayTotals: Record<string, DayTotals>;
  byCounter: CounterRow[];
  byUser: UserRow[];
}

interface RecentItem {
  _id: string;
  receiptNo: string;
  naam: string;
  totalHisse: number;
  day: number;
  qurbaniType: 'in' | 'out';
  createdByName: string;
  deviceInfo?: { deviceLabel?: string };
  createdAt: string;
}

interface SyncStatus {
  enabled: boolean;
  sheetUrl: string;
  lastSyncAt: string | null;
  lastError: string | null;
  lastDurationMs: number;
  lastReason: string;
  inflight: boolean;
  pending: boolean;
}

const emptyBucket: InOutBucket = { receipts: 0, hisse: 0, qurbani: 0, aqeeqah: 0, amount: 0 };
const emptyDayTotal: DayTotals = { receipts: 0, hisse: 0, amount: 0 };

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function loadSync() {
    try {
      const { data } = await api.get('/sync/sheet/info');
      setSync(data);
    } catch {
      // sync info is non-critical; skip toast
    }
  }

  useEffect(() => {
    Promise.all([
      api.get('/stats/summary'),
      api.get('/stats/recent', { params: { limit: 8 } }),
    ])
      .then(([s, r]) => {
        setSummary(s.data.summary);
        setRecent(r.data.items);
      })
      .catch(() => toast.error('Stats load failed'));
    loadSync();
    const t = setInterval(loadSync, 15_000);
    return () => clearInterval(t);
  }, []);

  async function forceSync() {
    setSyncing(true);
    try {
      const { data } = await api.post('/sync/sheet/now');
      setSync(data);
      toast.success('Google Sheet sync ho gaya');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const ts = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const t = summary?.totals;

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          Aap ko sirf apne khud ke entries ka data dikh raha hai.
        </div>
      )}

      {/* Hero */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <BigStat label="Total Receipts" value={t?.receipts ?? 0} color="brand" />
        <BigStat label="Total Hisse" value={t?.hisse ?? 0} color="indigo" />
        <BigStat label="Qurbani Hisse" value={t?.qurbaniHisse ?? 0} color="amber" />
        <BigStat label="Aqeeqah Hisse" value={t?.aqeeqahHisse ?? 0} color="pink" />
        <BigStat label="Total Amount" value={`₹${(t?.amount ?? 0).toLocaleString('en-IN')}`} color="emerald" />
      </div>

      {/* Per-day breakdown */}
      <div className="grid md:grid-cols-3 gap-3">
        {[1, 2, 3].map((d) => {
          const row = summary?.byDay?.[d];
          const inB = row?.in ?? emptyBucket;
          const outB = row?.out ?? emptyBucket;
          const dayTotal = summary?.dayTotals?.[d] ?? emptyDayTotal;
          return (
            <div
              key={d}
              className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-80">Day</div>
                  <div className="text-2xl font-bold">{d}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-80">Total Hisse</div>
                  <div className="text-2xl font-bold">{dayTotal.hisse}</div>
                </div>
              </div>
              <div className="p-3 space-y-2">
                <InOutBlock label="IN" tone="green" b={inB} />
                <InOutBlock label="OUT" tone="slate" b={outB} />
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-500">Day Total</span>
                  <span className="font-semibold">
                    {dayTotal.receipts} receipts &middot; ₹{dayTotal.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Counter + User tables */}
      <div className={`grid ${isAdmin ? 'md:grid-cols-2' : ''} gap-3`}>
        <LeaderCard
          title={isAdmin ? 'Counter-wise (Device)' : 'Aapke Counters'}
          rows={(summary?.byCounter || []).map((r) => ({
            label: r.counter,
            receipts: r.receipts,
            hisse: r.hisse,
            amount: r.amount,
          }))}
          labelCol="Counter"
        />
        {isAdmin && (
          <LeaderCard
            title="User-wise"
            rows={(summary?.byUser || []).map((r) => ({
              label: r.user,
              receipts: r.receipts,
              hisse: r.hisse,
              amount: r.amount,
            }))}
            labelCol="User"
          />
        )}
      </div>

      {/* Recent activity */}
      <div className="card">
        <h3 className="font-semibold mb-3">Recent Activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">Koi activity nahi.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div
                key={r._id}
                className="flex items-center justify-between text-sm border-l-4 border-brand-500 pl-3 py-1"
              >
                <div>
                  <span className="font-mono font-semibold text-brand-700">{r.receiptNo}</span>
                  <span className="text-slate-600"> — {r.naam}</span>
                  <span className="text-slate-500 text-xs">
                    {' '}· Day {r.day} {r.qurbaniType.toUpperCase()} · {r.totalHisse} hisse
                  </span>
                </div>
                <div className="text-xs text-slate-500 text-right">
                  <div>{r.createdByName}{r.deviceInfo?.deviceLabel ? ` @ ${r.deviceInfo.deviceLabel}` : ''}</div>
                  <div>{new Date(r.createdAt).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Google Sheet */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">Live Google Sheet</h3>
          {sync?.enabled ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
              {sync.inflight ? 'Syncing…' : sync.pending ? 'Pending…' : 'Live'}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Not configured
            </span>
          )}
        </div>
        {sync?.enabled ? (
          <>
            <div className="text-sm text-slate-600">
              Har entry create / edit / cancel ke baad Google Sheet auto-update hoti hai (~2s delay).
            </div>
            <div className="text-xs text-slate-500 space-y-0.5">
              <div>
                Last sync:{' '}
                {sync.lastSyncAt
                  ? `${new Date(sync.lastSyncAt).toLocaleString('en-IN')} (${sync.lastDurationMs}ms${
                      sync.lastReason ? `, ${sync.lastReason}` : ''
                    })`
                  : 'Abhi tak nahi'}
              </div>
              {sync.lastError && (
                <div className="text-red-600">Last error: {sync.lastError}</div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {sync.sheetUrl && (
                <a
                  href={sync.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Open Live Sheet ↗
                </a>
              )}
              {isAdmin && (
                <button
                  className="btn btn-secondary"
                  onClick={forceSync}
                  disabled={syncing || sync.inflight}
                >
                  {syncing || sync.inflight ? 'Syncing…' : 'Force Re-sync'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">
            Backend par <code className="font-mono text-xs bg-slate-100 px-1 rounded">GSHEET_WEBHOOK_URL</code>{' '}
            set karein to live sync enable hoga. Apps Script setup ke liye{' '}
            <span className="font-mono text-xs">google-apps-script/Code.gs</span> file dekhein.
          </div>
        )}
      </div>

      {/* Excel Export */}
      <div className="card space-y-3">
        <h3 className="font-semibold">Excel Export</h3>
        <div>
          <div className="text-xs text-slate-500 mb-1">
            Master format — 7 rows per table, labeled Day1-1, Day1-2…
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-primary"
              onClick={() => downloadExcel('/export/master/in', `qurbani-master-IN-${ts()}.xlsx`)}
            >
              Master — IN only (3 sheets)
            </button>
            <button
              className="btn btn-primary"
              onClick={() => downloadExcel('/export/master/out', `qurbani-master-OUT-${ts()}.xlsx`)}
            >
              Master — OUT only (3 sheets)
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => downloadExcel('/export/master', `qurbani-master-ALL-${ts()}.xlsx`)}
            >
              Master — All (6 sheets)
            </button>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Flat listing (simple)</div>
          <button
            className="btn btn-secondary"
            onClick={() => downloadExcel('/export/split', `qurbani-flat-${ts()}.xlsx`)}
          >
            Flat — 6 sheets
          </button>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, { bg: string; text: string; accent: string }> = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-700', accent: 'border-brand-500' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'border-indigo-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', accent: 'border-amber-500' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-700', accent: 'border-pink-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'border-emerald-500' },
};

function BigStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: keyof typeof TONE;
}) {
  const c = TONE[color];
  return (
    <div className={`rounded-lg p-4 border-l-4 ${c.accent} ${c.bg}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className={`text-2xl md:text-3xl font-bold ${c.text} mt-1`}>{value}</div>
    </div>
  );
}

function InOutBlock({
  label,
  tone,
  b,
}: {
  label: string;
  tone: 'green' | 'slate';
  b: InOutBucket;
}) {
  const badge =
    tone === 'green'
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <div className="border border-slate-200 rounded-md p-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${badge}`}>{label}</span>
        <span className="text-xs text-slate-500">{b.receipts} receipts</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <MiniStat k="Hisse" v={b.hisse} />
        <MiniStat k="Qurbani" v={b.qurbani} />
        <MiniStat k="Aqeeqah" v={b.aqeeqah} />
      </div>
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: number }) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1">
      <div className="text-[10px] text-slate-500 leading-tight">{k}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}

function LeaderCard({
  title,
  rows,
  labelCol,
}: {
  title: string;
  rows: { label: string; receipts: number; hisse: number; amount: number }[];
  labelCol: string;
}) {
  const max = Math.max(...rows.map((r) => r.hisse), 1);
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Koi data nahi.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{r.label || '(no label)'}</div>
                <div className="text-xs text-slate-500">
                  {r.receipts} receipts · <b>{r.hisse}</b> hisse · ₹{r.amount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-500 to-brand-700"
                  style={{ width: `${(r.hisse / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <div className="text-xs text-slate-400 pt-2 border-t border-slate-200">
            Column: {labelCol}
          </div>
        </div>
      )}
    </div>
  );
}
