import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface U {
  _id: string;
  name: string;
  username: string;
  role: 'admin' | 'volunteer';
  active: boolean;
  createdAt: string;
}

interface Errors {
  name?: string;
  username?: string;
  password?: string;
  role?: string;
}

function validate(f: { name: string; username: string; password: string; role: string }): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Naam zaroori hai';
  else if (f.name.trim().length > 100) e.name = 'Max 100 chars';

  const u = f.username.trim();
  if (!u) e.username = 'Username zaroori hai';
  else if (u.length < 3 || u.length > 30) e.username = '3-30 chars ka hona chahiye';
  else if (!/^[a-z0-9_.-]+$/.test(u)) e.username = 'Sirf lowercase letters, numbers, _ . - allowed';

  if (!f.password) e.password = 'Password zaroori hai';
  else if (f.password.length < 6) e.password = 'Min 6 chars';

  if (!['admin', 'volunteer'].includes(f.role)) e.role = 'Invalid role';
  return e;
}

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'volunteer' });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) setErrors(validate(form));
  }, [form, touched]);

  async function load() {
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Load failed');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Form mein errors hain');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/users', form);
      toast.success('User added');
      setForm({ name: '', username: '', password: '', role: 'volunteer' });
      setErrors({});
      setTouched(false);
      load();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      toast.error(data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  const cls = (err?: string) => `input ${err ? 'border-red-400 focus:ring-red-500' : ''}`;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <form onSubmit={add} className="card space-y-3" noValidate>
        <h3 className="font-semibold">Naya User</h3>
        <div>
          <label className="label">Naam *</label>
          <input
            className={cls(errors.name)}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={100}
          />
          {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name}</div>}
        </div>
        <div>
          <label className="label">Username *</label>
          <input
            className={`${cls(errors.username)} lowercase`}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
            maxLength={30}
            placeholder="3-30 chars, lowercase"
          />
          {errors.username && <div className="text-xs text-red-600 mt-1">{errors.username}</div>}
        </div>
        <div>
          <label className="label">Password *</label>
          <input
            type="password"
            className={cls(errors.password)}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min 6 chars"
          />
          {errors.password && <div className="text-xs text-red-600 mt-1">{errors.password}</div>}
        </div>
        <div>
          <label className="label">Role</label>
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="volunteer">Volunteer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Add User'}
        </button>
      </form>

      <div className="card md:col-span-2">
        <h3 className="font-semibold mb-2">Saare Users</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Naam</th>
              <th className="p-2">Username</th>
              <th className="p-2">Role</th>
              <th className="p-2">Active</th>
              <th className="p-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-t">
                <td className="p-2">{u.name}</td>
                <td className="p-2">{u.username}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2">{u.active ? 'Yes' : 'No'}</td>
                <td className="p-2 text-xs text-slate-500">
                  {new Date(u.createdAt).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
