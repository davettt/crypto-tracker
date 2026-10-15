import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import marketRoutes from './routes/market.js';
import portfolioRoutes from './routes/portfolio.js';
import importRoutes from './routes/import.js';
import taxRoutes from './routes/tax.js';
import alertRoutes from './routes/alerts.js';
import notesRoutes from './routes/notes.js';
import { buildStale } from './buildCheck.js';
import { startAlertScheduler } from './alerts.js';
import { HOST, PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
app.disable('x-powered-by');
// DNS rebinding guard: a website re-resolved to 127.0.0.1 still sends its own hostname.
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) {
    return res.status(403).json({ error: 'Invalid host' });
  }
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }),
);
// Cross-site request guard. CORS stops other websites reading this API, but a page the user
// visits can still send a simple form POST to 127.0.0.1. Browsers always send Origin on
// cross-site requests, so any change carrying a foreign Origin is refused.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Cross-site request refused' });
  }
  next();
});
app.use(express.json({ limit: '2mb' }));

// Build staleness check
app.get('/api/build-status', (_req, res) => {
  res.json({ stale: buildStale });
});

// API routes
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/import', importRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/notes', notesRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Crypto tracker running on http://${HOST}:${PORT}`);
  // Tests run against a temp data dir and must never send email or poll CoinGecko on a timer.
  if (process.env.NODE_ENV !== 'test') startAlertScheduler();
});
