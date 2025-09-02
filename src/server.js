import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import routes from './routes.js';
import { migrate, query } from './db.js';

const app = express();

app.set('trust proxy', true);
app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb', strict: true }));

// Captura JSON inválido lançado pelo express.json()
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid JSON payload',
      hint: 'Use Content-Type: application/json e envie um JSON válido (sem vírgula sobrando).'
    });
  }
  next(err);
});

// Exige JSON para métodos com corpo
app.use((req, res, next) => {
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const hasBody = Number(req.headers['content-length'] || 0) > 0;
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (needsBody && hasBody && !ct.includes('application/json')) {
    return res.status(415).json({
      ok: false,
      error: 'Unsupported Media Type',
      hint: 'Envie Content-Type: application/json'
    });
  }
  next();
});

// Healthcheck
app.get('/health', (req, res) =>
  res.status(200).json({ ok: true, service: 'auth', uptime: process.uptime() })
);

app.use(routes);

const port = Number(process.env.PORT) || 8080;

(async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is not set!');
  }

  try {
    await migrate();
  } catch (e) {
    console.error('❌ migrate() failed:', e);
    // Optional: process.exit(1);
  }

  // Seed admin opcional
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPass) {
    try {
      const { rows } = await query(
        `SELECT 1 FROM users WHERE email = $1`,
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

  app.listen(port, '0.0.0.0', () => console.log(`Auth API running on :${port}`));
})();
