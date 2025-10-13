#!/usr/bin/env node
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import { once } from 'events';

dotenv.config();

const { Pool } = pg;

const TOTAL_SERIES = 10;
const NUMBERS_PER_SERIES = 100_000;
const TARGET_TOTAL = TOTAL_SERIES * NUMBERS_PER_SERIES;
const BATCH_SIZE = 10_000;

const args = process.argv.slice(2);
const confirmFlag = args.includes('--confirm-seed');
const backupFlag = args.includes('--backup');

function parseBool(value) {
  return ['1', 'true', 'TRUE', 'yes', 'on'].includes(String(value));
}

function buildConfigFromEnv() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: parseBool(process.env.DB_SSL || 'false')
        ? { rejectUnauthorized: false }
        : undefined
    };
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const database = process.env.DB_NAME || 'sindpan_auth';

  if (!host || !user || !database) {
    throw new Error('DB connection variables missing. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.');
  }

  const config = { host, port, user, password, database };
  if (parseBool(process.env.DB_SSL || 'false')) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

function validateToken({ requireForExecution }) {
  const token = process.env.SEED_CUPONS_TOKEN;
  const tokenIsLongEnough = typeof token === 'string' && token.trim().length >= 24;

  if (!tokenIsLongEnough) {
    if (requireForExecution) {
      throw new Error('SEED_CUPONS_TOKEN must be set to a long secret value (>=24 chars).');
    }
    return false;
  }

  return true;
}

function ensureEnvironmentAllowed() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    const allowProd = String(process.env.SEED_CUPONS_ALLOW_PROD || '').toLowerCase();
    if (allowProd !== 'yes') {
      throw new Error('NODE_ENV=production requires SEED_CUPONS_ALLOW_PROD=yes to run this script.');
    }
  }
}

async function getCuponsColumns(client) {
  const { rows } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cupons'
     ORDER BY ordinal_position`
  );
  if (!rows.length) {
    throw new Error("Tabela 'cupons' não encontrada no schema public.");
  }
  return rows.map((r) => r.column_name);
}

function buildInsertMapping(columns) {
  const insertColumns = ['serie', 'numero_sorte'];
  const selectExpressions = ['missing.serie', "missing.numero_sorte"];

  if (columns.includes('cliente_id')) {
    insertColumns.push('cliente_id');
    selectExpressions.push('NULL');
  }
  if (columns.includes('padaria_id')) {
    insertColumns.push('padaria_id');
    selectExpressions.push('NULL');
  }
  if (columns.includes('status')) {
    insertColumns.push('status');
    selectExpressions.push(`'disponivel'`);
  }
  if (columns.includes('created_at')) {
    insertColumns.push('created_at');
    selectExpressions.push('NOW()');
  }
  if (columns.includes('updated_at')) {
    insertColumns.push('updated_at');
    selectExpressions.push('NOW()');
  }

  return { insertColumns, selectExpressions };
}

async function fetchDryRunSummary(client) {
  const perSerieSql = `
    SELECT missing.serie, COUNT(*) AS missing_count
    FROM (
      SELECT s.serie, LPAD(e.elem::text, 5, '0') AS numero_sorte
      FROM generate_series(1, $1) AS s(serie)
      CROSS JOIN generate_series(0, $2 - 1) AS e(elem)
    ) AS missing
    LEFT JOIN public.cupons c
      ON c.serie = missing.serie AND c.numero_sorte = missing.numero_sorte
    WHERE c.id IS NULL
    GROUP BY missing.serie
    ORDER BY missing.serie;
  `;
  const { rows } = await client.query(perSerieSql, [TOTAL_SERIES, NUMBERS_PER_SERIES]);
  const missingBySerie = rows.map((row) => ({
    serie: Number(row.serie),
    missing: Number(row.missing_count)
  }));
  const totalMissing = missingBySerie.reduce((acc, row) => acc + row.missing, 0);

  const { rows: existingRows } = await client.query(
    `SELECT COUNT(*) AS total FROM public.cupons`
  );
  const existingTotal = Number(existingRows[0]?.total || 0);

  const { rows: allocatedRows } = await client.query(
    `SELECT COUNT(*) AS total
       FROM public.cupons
      WHERE cliente_id IS NOT NULL OR status <> 'disponivel'`
  );
  const allocatedTotal = Number(allocatedRows[0]?.total || 0);

  const { rows: placeholderRows } = await client.query(
    `SELECT COUNT(*) AS total
       FROM public.cupons
      WHERE cliente_id IS NULL AND status = 'disponivel'`
  );
  const placeholders = Number(placeholderRows[0]?.total || 0);

  return { missingBySerie, totalMissing, existingTotal, allocatedTotal, placeholders };
}

function formatNumber(num) {
  return num.toLocaleString('pt-BR');
}

function formatCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

async function backupPlaceholders(client, columns) {
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..*/, '');
  const filePath = `/tmp/cupons-backup-${timestamp}.csv`;
  const writable = fs.createWriteStream(filePath, { encoding: 'utf8' });
  const header = columns.join(',');
  writable.write(header + '\n');

  console.log(`[backup] Exportando placeholders para ${filePath} ...`);
  const safeColumns = columns.map((col) => `"${col}"`).join(', ');

  await client.query('BEGIN');
  try {
    await client.query(
      `DECLARE cupons_backup_cursor NO SCROLL CURSOR FOR
       SELECT ${safeColumns}
         FROM public.cupons
        WHERE cliente_id IS NULL AND status = 'disponivel'
        ORDER BY serie, numero_sorte`
    );

    while (true) {
      const { rows } = await client.query('FETCH FORWARD 1000 FROM cupons_backup_cursor');
      if (!rows.length) break;
      for (const row of rows) {
        const line = columns.map((col) => formatCsvValue(row[col])).join(',') + '\n';
        if (!writable.write(line)) {
          await once(writable, 'drain');
        }
      }
    }

    await client.query('CLOSE cupons_backup_cursor');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    writable.destroy(error);
    throw error;
  }

  writable.end();
  await once(writable, 'finish');
  console.log('[backup] Concluído.');

  return filePath;
}

async function insertBatch(client, mapping) {
  const insertColumnsSql = mapping.insertColumns.map((col) => `"${col}"`).join(', ');
  const selectExpressionsSql = mapping.selectExpressions.join(', ');

  const sql = `
    WITH missing AS (
      SELECT s.serie, LPAD(e.elem::text, 5, '0') AS numero_sorte
      FROM generate_series(1, $1) AS s(serie)
      CROSS JOIN generate_series(0, $2 - 1) AS e(elem)
      LEFT JOIN public.cupons c
        ON c.serie = s.serie
       AND c.numero_sorte = LPAD(e.elem::text, 5, '0')
      WHERE c.id IS NULL
      ORDER BY s.serie, numero_sorte
      LIMIT $3
    )
    INSERT INTO public.cupons (${insertColumnsSql})
    SELECT ${selectExpressionsSql}
      FROM missing
    RETURNING 1;
  `;

  const result = await client.query(sql, [TOTAL_SERIES, NUMBERS_PER_SERIES, BATCH_SIZE]);
  return result.rowCount;
}

async function performSeed(client, mapping) {
  let totalInserted = 0;
  let batch = 0;

  while (true) {
    await client.query('BEGIN');
    try {
      const inserted = await insertBatch(client, mapping);
      if (inserted === 0) {
        await client.query('ROLLBACK');
        break;
      }
      totalInserted += inserted;
      batch += 1;
      console.log(`[seed] Batch ${batch}: inseridas ${formatNumber(inserted)} linhas (total acumulado ${formatNumber(totalInserted)}).`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  if (totalInserted === 0) {
    console.log('[seed] Nenhuma nova linha necessária. Base já está preenchida.');
  } else {
    console.log(`[seed] Inserção finalizada. Total inserido: ${formatNumber(totalInserted)}.`);
  }
}

async function analyzeTable(client) {
  try {
    await client.query('ANALYZE public.cupons');
    console.log('[analyze] ANALYZE public.cupons executado.');
  } catch (error) {
    console.warn('[analyze] Não foi possível executar ANALYZE automaticamente:', error.message);
  }
}

async function main() {
  const tokenIsValid = validateToken({ requireForExecution: confirmFlag });

  if (!confirmFlag) {
    console.log('[info] Execução em modo dry-run. Use --confirm-seed para inserir.');
  } else if (!tokenIsValid) {
    throw new Error('Token inválido. Ajuste SEED_CUPONS_TOKEN antes de executar com --confirm-seed.');
  }

  const pool = new Pool(buildConfigFromEnv());
  let client;
  try {
    client = await pool.connect();
    const columns = await getCuponsColumns(client);
    const mapping = buildInsertMapping(columns);

    const summary = await fetchDryRunSummary(client);

    console.log('=== Resumo (dry-run) ===');
    console.log(`Total esperado: ${formatNumber(TARGET_TOTAL)}`);
    console.log(`Já existentes: ${formatNumber(summary.existingTotal)}`);
    console.log(`Já alocados (cliente/status diferente): ${formatNumber(summary.allocatedTotal)}`);
    console.log(`Placeholders disponíveis: ${formatNumber(summary.placeholders)}`);
    summary.missingBySerie.forEach((row) => {
      const { serie, missing } = row;
      const percent = ((missing / NUMBERS_PER_SERIES) * 100).toFixed(2);
      console.log(`Serie ${serie}: faltam ${formatNumber(missing)} números (${percent}%).`);
    });
    console.log(`Total faltante: ${formatNumber(summary.totalMissing)}.`);

    if (!confirmFlag) {
      console.log('[dry-run] Nenhuma alteração realizada.');
      return;
    }

    ensureEnvironmentAllowed();

    if (backupFlag) {
      await backupPlaceholders(client, columns);
    }

    if (summary.totalMissing === 0) {
      console.log('[seed] Nada a inserir.');
      return;
    }

    await performSeed(client, mapping);
    await analyzeTable(client);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[erro]', error.message);
  process.exitCode = 1;
});
