import axios from 'axios';

function resolveBaseURL() {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw) return '/api';
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export const api = axios.create({ baseURL: resolveBaseURL() });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('qurb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const deviceLabel = localStorage.getItem('qurb_device_label');
  if (deviceLabel) config.headers['X-Device-Label'] = deviceLabel;
  return config;
});

// Every authenticated response may include a fresh token via X-Refreshed-Token.
// We persist it so the session slides forward on every request.
api.interceptors.response.use(
  (res) => {
    const refreshed = res.headers?.['x-refreshed-token'];
    if (refreshed) {
      localStorage.setItem('qurb_token', String(refreshed));
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      const code = err.response?.data?.code;
      const reason = code === 'TOKEN_EXPIRED' ? 'expired' : 'unauthorized';
      localStorage.removeItem('qurb_token');
      localStorage.removeItem('qurb_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?reason=${reason}`;
      }
    }
    return Promise.reject(err);
  }
);
