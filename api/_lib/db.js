import pg from 'pg';

const { Pool } = pg;

let pool = null;
let schemaPromise = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS registrations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  team_name TEXT,
  institution TEXT,
  categories JSONB NOT NULL DEFAULT '[]',
  lead_email TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reg_inst ON registrations (lower(institution));
CREATE TABLE IF NOT EXISTS member_emails (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS uploads (
  code TEXT NOT NULL,
  field_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INT,
  secret TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, field_key)
);
`;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const ssl = url.includes('sslmode=disable') ? false : { rejectUnauthorized: true };
    pool = new Pool({ connectionString: url, max: 3, ssl });
    schemaPromise = pool.query(SCHEMA).catch(e => { schemaPromise = null; throw e; });
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (schemaPromise) await schemaPromise.catch(() => {});
  return p.query(text, params);
}

export async function transaction(fn) {
  const p = getPool();
  if (schemaPromise) await schemaPromise;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
