import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [deviceLabel, setDeviceLabel] = useState(
    () => localStorage.getItem('qurb_device_label') || ''
  );

  useEffect(() => {
    if (deviceLabel) localStorage.setItem('qurb_device_label', deviceLabel);
  }, [deviceLabel]);

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
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto w-full p-4 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
