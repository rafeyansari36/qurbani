import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FormEvent, useEffect, useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const [deviceLabel, setDeviceLabel] = useState(
    () => localStorage.getItem('qurb_device_label') || ''
  );
  const [showGate, setShowGate] = useState(() => !localStorage.getItem('qurb_device_label'));
  const [gateInput, setGateInput] = useState('');

  useEffect(() => {
    if (deviceLabel) localStorage.setItem('qurb_device_label', deviceLabel);
    else localStorage.removeItem('qurb_device_label');
  }, [deviceLabel]);

  // If the label is cleared (manually or via tab edit), re-open the gate.
  useEffect(() => {
    if (!deviceLabel) setShowGate(true);
  }, [deviceLabel]);

  function saveGate(e: FormEvent) {
    e.preventDefault();
    const v = gateInput.trim();
    if (v.length < 2) return;
    setDeviceLabel(v);
    setShowGate(false);
    setGateInput('');
  }

  const navItems = [
    { to: '/new', label: 'Nayi Entry' },
    { to: '/entries', label: 'Sab Entries' },
    { to: '/dashboard', label: 'Dashboard' },
    ...(user?.role === 'admin' ? [{ to: '/users', label: 'Users' }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-bold">Qurbani Receipts</h1>
          <nav className="flex gap-1 flex-1">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${
                    isActive ? 'bg-white/20' : 'hover:bg-white/10'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <input
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="Device label (e.g., Gate-1)"
            className="px-2 py-1 rounded text-slate-800 text-sm w-44"
          />
          <div className="text-sm">
            {user?.name} <span className="opacity-75">({user?.role})</span>
          </div>
          <button
            onClick={() => logout('manual')}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto w-full p-4 flex-1">
        <Outlet />
      </main>

      {showGate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={saveGate}
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-3"
          >
            <h2 className="text-lg font-bold text-brand-700">Counter Location Set Karein</h2>
            <p className="text-sm text-slate-600">
              Entry karne se pehle apna counter / location bata dein (jaise{' '}
              <span className="font-mono">Gate-1</span>, <span className="font-mono">Hall-A</span>,{' '}
              <span className="font-mono">Counter-3</span>). Yeh har receipt mein save hoga taaki
              baad mein pata chale kaunsi jagah se entry hui hai.
            </p>
            <div>
              <label className="label">Counter Location *</label>
              <input
                className="input"
                value={gateInput}
                onChange={(e) => setGateInput(e.target.value)}
                placeholder="e.g., Gate-1"
                maxLength={40}
                autoFocus
              />
              {gateInput.trim().length > 0 && gateInput.trim().length < 2 && (
                <div className="text-xs text-red-600 mt-1">Kam se kam 2 chars chahiye</div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={gateInput.trim().length < 2}
              >
                Save & Continue
              </button>
            </div>
            <div className="text-xs text-slate-400 pt-1 border-t">
              Tip: Yeh top bar mein bhi change kar sakte hain.
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
