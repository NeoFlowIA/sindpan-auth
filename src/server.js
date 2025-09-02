import 'dotenv/config';
import express from 'express';
import routes from './routes.js';
import { migrate, query } from './db.js';

const app = express();

// ---------- CORS simples (sem pacote) ----------
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*'; // ajuste p/ seu domínio se quiser
const ALLOW_HEADERS = 'Content-Type, Authorization';
const ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Vary', 'Origin'); // bom para caches/CDN
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  if (req.method === 'OPTIONS') {
    return res.status(204).end(); // encerra preflight rápido
  }
  next();
});

// ---------- Parser JSON + proteção ----------
app.use(express.json({ limit: '1mb', strict: true }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
  }
  next(err);
});

// ---------- Healthcheck ----------
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'auth', uptime: process.uptime() });
});

// ---------- Logs mínimos ----------
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - started}ms`);
  });
  next();
});

// ---------- Regras ----------
app.set('trust proxy', true);

// ---------- Rotas da API ----------
app.use(routes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// ---------- 500 ----------
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT]', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

// ---------- Bootstrap ----------
const port = Number(process.env.PORT) || 80;

(async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is not set!');
  }

  try {
    await migrate();
  } catch (e) {
    console.error('❌ migrate() failed:', e);
    // Se preferir falhar rápido no deploy:
    // process.exit(1);
  }

  // Seed admin opcional
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    try {
      const { rows } = await query(
        'SELECT 1 FROM users WHERE email = $1',
        [adminEmail.toLowerCase()]
      );
      if (!rows[0]) {
        const { createUser } = await import('./auth.js');
        await createUser({ email: adminEmail, password: adminPass, role: 'admin' });
        console.log(`Admin user created: ${adminEmail}`);
      }
    } catch (e) {
      console.error('❌ admin seed failed:', e);
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Auth API running on :${port}`);
  });
})();

// ---------- Sinais p/ entender SIGTERM ----------
process.on('SIGTERM', () => {
  console.warn('↪ SIGTERM recebido (provável restart do orquestrador). Encerrando...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.warn('↪ SIGINT recebido. Encerrando...');
  process.exit(0);
});
