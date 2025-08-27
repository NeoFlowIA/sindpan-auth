import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildConfigFromEnv() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: parseBool(process.env.DB_SSL || 'false') ? { rejectUnauthorized: false } : undefined
    };
  }
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'sindpan_auth'
  };
  const ssl = parseBool(process.env.DB_SSL || 'false');
  if (ssl) cfg.ssl = { rejectUnauthorized: false };
  return cfg;
}

function parseBool(v) {
  return ['1','true','TRUE','yes','on'].includes(String(v));
}

const pool = new Pool(buildConfigFromEnv());

export async function migrate() {
  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(sql);
  } finally {
    client.release();
  }
}

export async function query(q, params) {
  const res = await pool.query(q, params);
  return res;
}
