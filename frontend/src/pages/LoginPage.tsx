import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const REASON_MESSAGES: Record<string, string> = {
  idle: '15 min tak koi activity nahi thi, isliye logout kar diya gaya.',
  expired: 'Aapka session expire ho chuka hai — phir se login karein.',
  unauthorized: 'Session invalid hai — phir se login karein.',
};

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reason = params.get('reason');
  const reasonMessage = reason ? REASON_MESSAGES[reason] : null;

  useEffect(() => {
    if (user) navigate('/new', { replace: true });
  }, [user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success('Login successful');
      // remove ?reason from URL after successful login
      params.delete('reason');
      setParams(params, { replace: true });
      navigate('/new');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-700">Qurbani Receipts</h1>
          <p className="text-sm text-slate-500">Login karein</p>
        </div>

        {reasonMessage && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
            {reasonMessage}
          </div>
        )}

        <div>
          <label className="label">Username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
