import axios from 'axios';

// Accepts either "https://backend.example.com" or "https://backend.example.com/api" —
// we always normalize to end with "/api".
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

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('qurb_token');
      localStorage.removeItem('qurb_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);
