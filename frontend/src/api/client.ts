import axios from 'axios';

// In dev: Vite proxies /api to http://localhost:5000 (vite.config.ts).
// In prod (Vercel): VITE_API_BASE_URL points to the Render backend, e.g. https://qurb-api.onrender.com/api
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({ baseURL });

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
