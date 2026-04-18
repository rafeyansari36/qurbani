import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';

console.log(`[boot] Node ${process.version} starting qurb-backend`);

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

import authRoutes from './routes/auth.routes.js';
import entryRoutes from './routes/entry.routes.js';
import exportRoutes from './routes/export.routes.js';
import printRoutes from './routes/print.routes.js';
import statsRoutes from './routes/stats.routes.js';
import { ValidationError } from './utils/validate.js';
import { seedAdminIfEmpty } from './bootstrap/seedAdmin.js';

const app = express();

// CORS — supports comma-separated list of origins, plus a VERCEL_PREVIEW regex match
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const vercelPreviewRegex = /^https:\/\/.*\.vercel\.app$/;

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // allow same-origin / tools
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (process.env.ALLOW_VERCEL_PREVIEWS === 'true' && vercelPreviewRegex.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);
// Behind Render/Vercel proxies — trust X-Forwarded-* for req.ip
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }));

app.use('/api/auth', authRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/print', printRoutes);
app.use('/api/stats', statsRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: 'Validation failed', fields: err.errors });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qurbani';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    try {
      await seedAdminIfEmpty();
    } catch (e) {
      console.error('[seed] admin seed failed:', e.message);
    }
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
