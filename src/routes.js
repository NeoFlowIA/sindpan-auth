import express from 'express';
import { requireAuth } from './middleware.js';
import { createUser, findUserByEmail, validatePassword, signTokens } from './auth.js';
import { query } from './db.js';

const router = express.Router();

router.get('/health', (_, res) => res.json({ ok: true }));

// Cadastro: padaria self-service
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, bakery_name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const exists = await findUserByEmail(email);
    if (exists) return res.status(409).json({ error: 'email already registered' });

    const user = await createUser({ email, password, role: 'bakery', bakery_name });
    const tokens = signTokens(user);
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, bakery_name: user.bakery_name }, ...tokens });
  } catch (e) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Login: padaria ou admin
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await validatePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const tokens = signTokens(user);
    res.json({ user: { id: user.id, email: user.email, role: user.role, bakery_name: user.bakery_name }, ...tokens });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Perfil do usuário autenticado
router.get('/auth/me', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT id, email, role, bakery_name, created_at FROM users WHERE id = $1`, [req.user.sub]);
  res.json({ user: rows[0] });
});

export default router;
