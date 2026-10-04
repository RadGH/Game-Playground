// Postgres store (stream A) — the same interface as js/sim/store-memory.js (read its header).
// Connection settings come from the standard libpq environment (PGHOST, PGPORT, PGDATABASE, PGUSER,
// PGPASSWORD — ops/start-dev.sh loads them from ~/.config/thousandvale/dev.env) or DATABASE_URL.
// No password in code or repo.

import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { migrate } from './migrate.js';
import { packChar, unpackChar } from '../../js/sim/save-fields.js';
import { MAX_CHARS_PER_ACCOUNT } from '../../js/sim/store-memory.js';
import { applyJournal } from '../../js/sim/journal.js';

// bigint columns (ids, xp, gold, fences) come back as JS numbers; they stay far below 2^53
pg.types.setTypeParser(20, v => Number(v));

const sha = t => createHash('sha256').update(String(t)).digest('hex');
// one statement: write the blob (version + fence checked) and prune the journal rows it now contains
const SAVE_SQL = `WITH u AS (
    UPDATE characters SET name = $4, cls = $5, level = $6, xp = $7, gold = $8, room = $9, x = $10, z = $11, blob = $12,
      journal_seq = $13, version = version + 1, updated_at = now()
    WHERE id = $1 AND version = $2 AND lease_fence = $3 RETURNING id, version
  ), d AS (
    DELETE FROM char_journal WHERE char_id = $1 AND seq <= $13 AND EXISTS (SELECT 1 FROM u)
  ) SELECT version FROM u`;
function saveParams(ch, fence) {
  const { cols, blob } = packChar(ch);
  return [ch.id, ch.version, fence, cols.name, cols.cls, cols.level, cols.xp, cols.gold, cols.room, cols.x, cols.z, blob, cols.journal_seq || 0];
}
const brief = r => ({ id: r.id, name: r.name, cls: r.cls, level: r.level, room: r.room });

export function createPgStore({ connectionString = process.env.DATABASE_URL, realm = 'vale', max = 10, log = () => {} } = {}) {
  const pool = new pg.Pool(connectionString ? { connectionString, max } : { max });
  pool.on('error', err => log('pg pool error', err.message));
  const q = (text, params) => pool.query(text, params);

  function rowToChar(r) {
    return unpackChar({
      id: r.id, account: r.account_id, version: r.version,
      cols: { name: r.name, cls: r.cls, level: r.level, xp: r.xp, gold: r.gold, room: r.room, x: r.x, z: r.z, journal_seq: r.journal_seq },
      blob: r.blob,
    });
  }

  return {
    kind: 'pg',
    pool,
    async init() { const v = await migrate(pool); if (v.length) log('db: applied schema ' + v.join(', ')); },
    async close() { await pool.end(); },
    async createGuest(name = null) {
      const token = randomBytes(32).toString('hex');
      const r = await q('INSERT INTO accounts (token_hash, name, last_login) VALUES ($1, $2, now()) RETURNING id', [sha(token), name]);
      return { account: r.rows[0].id, token };
    },
    async authToken(token) {
      const r = await q('UPDATE accounts SET last_login = now() WHERE token_hash = $1 RETURNING id, claimed', [sha(token)]);
      return r.rows.length ? { account: r.rows[0].id, claimed: r.rows[0].claimed } : null;
    },
    async listChars(account) {
      const r = await q('SELECT id, name, cls, level, room FROM characters WHERE account_id = $1 AND realm = $2 ORDER BY id', [account, realm]);
      return r.rows.map(brief);
    },
    async createChar(account, { name, cls, look = null }) {
      const n = await q('SELECT count(*)::int AS n FROM characters WHERE account_id = $1 AND realm = $2', [account, realm]);
      if (n.rows[0].n >= MAX_CHARS_PER_ACCOUNT) return { err: 'full' };
      const { cols, blob } = packChar({ name, cls, look, level: 1, xp: 0, gold: 0 });
      try {
        const r = await q(
          `INSERT INTO characters (account_id, realm, name, cls, level, xp, gold, room, x, z, blob)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, name, cls, level, room`,
          [account, realm, cols.name, cols.cls, cols.level, cols.xp, cols.gold, cols.room, cols.x, cols.z, blob]);
        return { char: brief(r.rows[0]) };
      } catch (err) {
        if (err.code === '23505') return { err: 'name' };
        throw err;
      }
    },
    async takeChar(account, id, owner, leaseMs = 30000) {
      const r = await q(
        `UPDATE characters SET lease_owner = $3, lease_fence = lease_fence + 1, lease_until = now() + make_interval(secs => $4::float8 / 1000)
         WHERE id = $1 AND account_id = $2 AND (lease_owner IS NULL OR lease_owner = $3 OR lease_until < now())
         RETURNING *`, [id, account, owner, leaseMs]);
      if (r.rows.length) {
        const ch = rowToChar(r.rows[0]);
        const j = await q('SELECT seq, kind, payload FROM char_journal WHERE char_id = $1 AND seq > $2 ORDER BY seq', [id, ch.jseq || 0]);
        applyJournal(ch, j.rows);
        return { char: ch, fence: r.rows[0].lease_fence };
      }
      const e = await q('SELECT 1 FROM characters WHERE id = $1 AND account_id = $2', [id, account]);
      return { err: e.rows.length ? 'lease' : 'missing' };
    },
    async saveChar(ch, fence) {
      const r = await q(SAVE_SQL, saveParams(ch, fence));
      if (!r.rows.length) return false;
      ch.version = r.rows[0].version;
      return true;
    },
    async appendJournal(rows) {
      if (!rows.length) return 0;
      const r = await q(
        `INSERT INTO char_journal (char_id, seq, kind, payload)
         SELECT j.char_id, j.seq, j.kind, j.payload
         FROM jsonb_to_recordset($1::jsonb) AS j(char_id bigint, seq bigint, kind text, payload jsonb, fence bigint)
         JOIN characters c ON c.id = j.char_id AND c.lease_fence = j.fence
         ON CONFLICT (char_id, seq) DO NOTHING`,
        [JSON.stringify(rows.map(x => ({ char_id: x.char, seq: x.seq, kind: x.kind, payload: x.payload || {}, fence: x.fence })))]);
      return r.rowCount;
    },
    /** Both characters' blobs in one transaction (trades): all or nothing. */
    async tradeChars(list) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const versions = [];
        for (const { ch, fence } of list) {
          const r = await c.query(SAVE_SQL, saveParams(ch, fence));
          if (!r.rows.length) { await c.query('ROLLBACK'); return false; }
          versions.push(r.rows[0].version);
        }
        await c.query('COMMIT');
        list.forEach(({ ch }, i) => { ch.version = versions[i]; });
        return true;
      } catch (err) { try { await c.query('ROLLBACK'); } catch { /* ignore */ } throw err; }
      finally { c.release(); }
    },
    async releaseChar(id, owner) {
      await q('UPDATE characters SET lease_owner = NULL, lease_until = NULL WHERE id = $1 AND lease_owner = $2', [id, owner]);
    },
    async heartbeat(owner, ids, leaseMs = 30000) {
      if (!ids.length) return;
      await q('UPDATE characters SET lease_until = now() + make_interval(secs => $3::float8 / 1000) WHERE id = ANY($1::bigint[]) AND lease_owner = $2', [ids, owner, leaseMs]);
    },
    async clearLeases(prefix) {
      const r = await q("UPDATE characters SET lease_owner = NULL, lease_until = NULL WHERE lease_owner LIKE $1 || '%'", [prefix]);
      return r.rowCount;
    },
    async logEconomy(rows) {
      for (const r of rows) {
        await q(`INSERT INTO economy_log (hour, band, kind, reason, gold, items, count) VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (hour, band, kind, reason) DO UPDATE SET gold = economy_log.gold + EXCLUDED.gold,
                   items = economy_log.items + EXCLUDED.items, count = economy_log.count + EXCLUDED.count`,
          [r.hour, r.band, r.kind, r.reason, r.gold, r.items, r.count]);
      }
    },
    async info() {
      const r = await q('SELECT (SELECT count(*) FROM accounts)::int AS a, (SELECT count(*) FROM characters)::int AS c');
      return { kind: 'pg', accounts: r.rows[0].a, characters: r.rows[0].c };
    },
  };
}
