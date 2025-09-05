import express from 'express';
import { requireAuth } from './middleware.js';
import { createUser, findUserByEmail, findUserByCnpj, validatePassword, signTokens } from './auth.js';
import { query } from './db.js';

const router = express.Router();

router.get('/health', (_, res) => res.json({ ok: true }));

// Cadastro: padaria self-service
router.post('/auth/register', async (req, res) => {
  try {
    const { email, cnpj, password, bakery_name } = req.body || {};
    if ((!email && !cnpj) || !password) {
      return res.status(400).json({ error: 'email or cnpj and password are required' });
    }

    if (email) {
      const existsEmail = await findUserByEmail(email);
      if (existsEmail) return res.status(409).json({ error: 'email already registered' });
    }

    if (cnpj) {
      const existsCnpj = await findUserByCnpj(cnpj);
      if (existsCnpj) return res.status(409).json({ error: 'cnpj already registered' });
    }

    const user = await createUser({ email, cnpj, password, role: 'bakery', bakery_name });
    const tokens = signTokens(user);
    res.status(201).json({ user: { id: user.id, email: user.email, cnpj: user.cnpj, role: user.role, bakery_name: user.bakery_name }, ...tokens });
  } catch (e) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Login: padaria ou admin
router.post('/auth/login', async (req, res) => {
  try {
    const { email, cnpj, password } = req.body || {};
    if ((!email && !cnpj) || !password) {
      return res.status(400).json({ error: 'email or cnpj and password are required' });
    }

    let user;
    if (email) {
      user = await findUserByEmail(email);
    } else {
      user = await findUserByCnpj(cnpj);
      if (user && user.role !== 'bakery') user = null;
    }

    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await validatePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const tokens = signTokens(user);
    res.json({ user: { id: user.id, email: user.email, cnpj: user.cnpj, role: user.role, bakery_name: user.bakery_name }, ...tokens });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Perfil do usuário autenticado
router.get('/auth/me', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT id, email, cnpj, role, bakery_name, created_at FROM users WHERE id = $1`, [req.user.sub]);
  res.json({ user: rows[0] });
});

export default router;
