import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

function signTokens(user) {
  const payload = { sub: user.id, role: user.role, email: user.email, cnpj: user.cnpj };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '15m'
  });
  return { accessToken };
}

export async function createUser({ email = null, cnpj = null, password, role = 'bakery', bakery_name = null }) {
  if (!email && !cnpj) throw new Error('email or cnpj is required');
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const password_hash = await bcrypt.hash(password, rounds);
  const result = await query(
    `INSERT INTO users(email, cnpj, password_hash, role, bakery_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, cnpj, role, bakery_name, created_at`,
    [email ? email.toLowerCase() : null, cnpj, password_hash, role, bakery_name]
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  return result.rows[0] || null;
}

export async function findUserByCnpj(cnpj) {
  const result = await query(`SELECT * FROM users WHERE cnpj = $1`, [cnpj]);
  return result.rows[0] || null;
}

export async function validatePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export { signTokens };
