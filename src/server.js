import 'dotenv/config';
import express from 'express';
import routes from './routes.js';
import { migrate, query } from './db.js';

const app = express();
app.use(express.json());
app.use(routes);

const port = process.env.PORT || 8080;

(async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is not set!');
  }
  await migrate();

  // Seed admin opcional
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPass) {
    const { rows } = await query(`SELECT 1 FROM users WHERE email = $1`, [adminEmail.toLowerCase()]);
    if (!rows[0]) {
      const { createUser } = await import('./auth.js');
      await createUser({ email: adminEmail, password: adminPass, role: 'admin' });
      console.log(`Admin user created: ${adminEmail}`);
    }
  }

  app.listen(port, () => console.log(`Auth API running on :${port}`));
})();
