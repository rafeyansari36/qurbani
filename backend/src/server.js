import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.routes.js';
import entryRoutes from './routes/entry.routes.js';
import exportRoutes from './routes/export.routes.js';
import printRoutes from './routes/print.routes.js';
import statsRoutes from './routes/stats.routes.js';
import { ValidationError } from './utils/validate.js';
import { seedAdminIfEmpty } from './bootstrap/seedAdmin.js';

const step = (msg) => console.log(`[boot] ${msg}`);

step(`Node ${process.version} starting qurb-backend`);
step(`ENV check: PORT=${process.env.PORT || '(unset)'} MONGO_URI=${process.env.MONGO_URI ? '(set)' : '(UNSET)'} CORS_ORIGIN=${process.env.CORS_ORIGIN || '(unset)'}`);

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});
process.on('exit', (code) => {
  console.log(`[boot] process exit code=${code}`);
});
process.on('SIGTERM', () => {
  console.log('[boot] SIGTERM received');
});

try {
  step('Creating express app');
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const vercelPreviewRegex = /^https:\/\/.*\.vercel\.app$/;

  step(`CORS allowed: [${allowedOrigins.join(', ') || '(wildcard)'}] previewsAllowed=${process.env.ALLOW_VERCEL_PREVIEWS === 'true'}`);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
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
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }));

  step('Mounting routes');
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

  const PORT = Number(process.env.PORT) || 5000;
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qurbani';

  // Start HTTP server FIRST (so Render health-check can pass), then connect to Mongo.
  step(`Binding HTTP on 0.0.0.0:${PORT}`);
  app.listen(PORT, '0.0.0.0', () => {
    step(`HTTP server listening on ${PORT}`);
  });

  step('Connecting to MongoDB…');
  mongoose
    .connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
    .then(async () => {
      step('MongoDB connected');
      try {
        await seedAdminIfEmpty();
      } catch (e) {
        console.error('[seed] admin seed failed:', e.message);
      }
    })
    .catch((err) => {
      console.error('[fatal] MongoDB connection error:', err);
      // Don't exit — keep HTTP up so /api/health works and logs stay visible.
    });
} catch (err) {
  console.error('[fatal] bootstrap error:', err);
  process.exit(1);
}
