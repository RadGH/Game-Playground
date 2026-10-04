// Schema migrations (stream A). Each server/db/schema-vN.sql runs once, in order, inside a transaction,
// and is recorded in schema_version. Safe to run on every boot.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export function schemaFiles() {
  return readdirSync(HERE).map(f => /^schema-v(\d+)\.sql$/.exec(f)).filter(Boolean)
    .map(m => ({ version: +m[1], file: join(HERE, m[0]) })).sort((a, b) => a.version - b.version);
}

/** Apply pending schema files. `pool` = a pg Pool. Returns the versions applied. */
export async function migrate(pool) {
  const c = await pool.connect();
  const applied = [];
  try {
    await c.query('CREATE TABLE IF NOT EXISTS schema_version (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    // one migrator at a time across processes
    await c.query('SELECT pg_advisory_lock(84910001)');
    const have = new Set((await c.query('SELECT version FROM schema_version')).rows.map(r => r.version));
    for (const s of schemaFiles()) {
      if (have.has(s.version)) continue;
      await c.query('BEGIN');
      try {
        await c.query(readFileSync(s.file, 'utf8'));
        await c.query('INSERT INTO schema_version (version) VALUES ($1)', [s.version]);
        await c.query('COMMIT');
        applied.push(s.version);
      } catch (err) { await c.query('ROLLBACK'); throw err; }
    }
  } finally {
    try { await c.query('SELECT pg_advisory_unlock(84910001)'); } catch { /* ignore */ }
    c.release();
  }
  return applied;
}
