import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

function signTokens(user) {
  const payload = { sub: user.id, role: user.role, email: user.email };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '15m'
  });
  return { accessToken };
}

export async function createUser({ email, password, role = 'bakery', bakery_name = null }) {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const password_hash = await bcrypt.hash(password, rounds);
  const result = await query(
    `INSERT INTO users(email, password_hash, role, bakery_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, role, bakery_name, created_at`,
    [email.toLowerCase(), password_hash, role, bakery_name]
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  return result.rows[0] || null;
}

export async function validatePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export { signTokens };
