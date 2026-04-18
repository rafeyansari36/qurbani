import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { clearIdleMarker, useIdleLogout } from '../hooks/useIdleLogout';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'volunteer';
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: (reason?: 'idle' | 'manual' | 'expired') => void;
}

const AuthContext = createContext<AuthState | null>(null);

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const IDLE_WARN_MS = 60 * 1000; // warn 1 minute before logout

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('qurb_user');
    const token = localStorage.getItem('qurb_token');
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }
    setLoading(false);
  }, []);

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('qurb_token', data.token);
    localStorage.setItem('qurb_user', JSON.stringify(data.user));
    localStorage.setItem('qurb_last_activity', String(Date.now()));
    setUser(data.user);
  }

  const logout = useCallback(
    (reason: 'idle' | 'manual' | 'expired' = 'manual') => {
      localStorage.removeItem('qurb_token');
      localStorage.removeItem('qurb_user');
      clearIdleMarker();
      setUser(null);
      if (reason === 'idle') {
        toast.error('15 min tak inactivity ki wajah se logout kar diya');
        navigate('/login?reason=idle', { replace: true });
      } else if (reason === 'expired') {
        toast.error('Session expire ho gaya');
        navigate('/login?reason=expired', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    },
    [navigate]
  );

  useIdleLogout({
    enabled: !!user,
    timeoutMs: IDLE_TIMEOUT_MS,
    warnMs: IDLE_WARN_MS,
    onLogout: () => logout('idle'),
    onWarn: () => toast('1 minute mein auto-logout ho jayega', { icon: '⏰', duration: 5000 }),
  });

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
