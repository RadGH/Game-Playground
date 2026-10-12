// M3 store methods for Postgres (stream A) — the same interface as js/sim/store-memory-m3.js (read its header):
// accounts (claim, session tokens, resets, bans), friends, guilds, mail with escrowed items, reports, the chat log,
// world state. Mail send/take write the character blob (version + fence checked) and the letter + escrow rows in
// ONE transaction, like a trade (PLAN §9.2): either everything moves or nothing does.

import { createHash, randomBytes } from 'node:crypto';
import { FRIENDS_MAX, GUILD_MAX } from '../../js/sim/store-memory-m3.js';

const sha = t => createHash('sha256').update(String(t)).digest('hex');
const ms = t => (t == null ? null : new Date(t));
const toMs = t => (t ? new Date(t).getTime() : 0);
/** One feedback row as the stores hand it out (schema v5 + v6: done / doneAt / ref). */
const fbRow = x => ({ id: +x.id, at: toMs(x.created_at), account: x.account_id == null ? null : +x.account_id, char: x.char_id == null ? null : +x.char_id, name: x.name, cls: x.cls, level: x.level, kind: x.kind, text: x.text, client: x.client || {}, server: x.server || {},
  state: x.state, stateAt: x.state_at ? toMs(x.state_at) : null, stateBy: x.state_by, note: x.note || '', done: x.done_note || '', doneAt: x.done_at ? toMs(x.done_at) : null, ref: x.ref == null ? null : +x.ref, gift: !!x.gift });
const brief = r => ({ id: r.id, name: r.name, cls: r.cls, level: r.level, room: r.room });

export function pgM3({ pool, q, realm, SAVE_SQL, saveParams }) {
  /** Run fn(client) inside BEGIN/COMMIT; fn returns false (or throws) to roll back. */
  async function tx(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      if (r === false || r == null) { await c.query('ROLLBACK'); return r ?? false; }
      await c.query('COMMIT');
      return r;
    } catch (err) {
      try { await c.query('ROLLBACK'); } catch { /* ignore */ }
      if (err.code === '23505' || err.code === '23503') return false;     // a uid already in escrow / a row that vanished
      throw err;
    } finally { c.release(); }
  }
  async function guildView(id, c = null) {
    const run = c ? (t, p) => c.query(t, p) : q;
    const g = await run('SELECT id, name, motd, ranks FROM guilds WHERE id = $1', [id]);
    if (!g.rows.length) return null;
    const m = await run(`SELECT gm.char_id, gm.rank, c.name, c.cls, c.level FROM guild_members gm JOIN characters c ON c.id = gm.char_id
                         WHERE gm.guild_id = $1 ORDER BY gm.rank, c.name`, [id]);
    const r = g.rows[0];
    return { id: r.id, name: r.name, motd: r.motd, ranks: r.ranks, members: m.rows.map(x => ({ char: x.char_id, name: x.name, cls: x.cls, level: x.level, rank: x.rank })) };
  }
  const head = (m, items) => ({ id: m.id, from: m.from_name, fromChar: m.from_char, subject: m.subject, kind: m.kind, sentAt: toMs(m.sent_at), expiresAt: m.expires_at ? toMs(m.expires_at) : null,
    read: !!m.read_at, taken: !!m.taken_at, gold: m.taken_at ? 0 : m.gold, items: m.taken_at ? [] : items.map(i => ({ uid: i.uid, name: i.name, rarity: i.rarity, slot: i.slot })) });
  async function itemsOf(ids) {
    if (!ids.length) return new Map();
    const r = await q('SELECT uid, mail_id, item FROM items WHERE mail_id = ANY($1::bigint[]) ORDER BY uid', [ids]);
    const out = new Map();
    for (const x of r.rows) { if (!out.has(x.mail_id)) out.set(x.mail_id, []); out.get(x.mail_id).push(x.item); }
    return out;
  }
  async function returnOne(c, m, nowMs) {
    const nm = await c.query('SELECT name FROM characters WHERE id = $1', [m.to_char]);
    const r = await c.query(`INSERT INTO mail (realm, to_char, from_char, from_name, subject, body, gold, kind, sent_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'return', $8, NULL) RETURNING id`,
      [realm, m.from_char, m.to_char, nm.rows.length ? nm.rows[0].name : '?', 'Returned: ' + String(m.subject || '').slice(0, 50), m.body, m.gold, ms(nowMs)]);
    const id = r.rows[0].id;
    await c.query('UPDATE items SET mail_id = $1 WHERE mail_id = $2', [id, m.id]);
    await c.query('DELETE FROM mail WHERE id = $1', [m.id]);
    return { to: m.from_char, id };
  }

  return {
    // ---- accounts ----
    async claimAccount(account, { username, passHash, email = null }) {
      try {
        const r = await q(`UPDATE accounts SET username = $2, pass_hash = $3, email = $4, claimed = true, claimed_at = now()
                           WHERE id = $1 AND claimed = false RETURNING id`, [account, username, passHash, email]);
        if (r.rows.length) return { ok: true };
        const e = await q('SELECT claimed FROM accounts WHERE id = $1', [account]);
        return { err: e.rows.length ? 'claimed' : 'missing' };
      } catch (err) { if (err.code === '23505') return { err: 'taken' }; throw err; }
    },
    async loginInfo(username) {
      const r = await q('SELECT id, pass_hash, banned_until, admin FROM accounts WHERE lower(username) = lower($1)', [username]);
      return r.rows.length ? { account: r.rows[0].id, passHash: r.rows[0].pass_hash, banned: toMs(r.rows[0].banned_until), admin: !!r.rows[0].admin } : null;
    },
    async newToken(account, kind = 'session') {
      const token = randomBytes(32).toString('hex');
      await q('INSERT INTO account_tokens (token_hash, account_id, kind) VALUES ($1, $2, $3)', [sha(token), account, kind]);
      return token;
    },
    async revokeToken(token) { const r = await q('DELETE FROM account_tokens WHERE token_hash = $1', [sha(token)]); return r.rowCount > 0; },
    async setPassword(account, passHash, keepToken = null) {
      return tx(async c => {
        const r = await c.query('UPDATE accounts SET pass_hash = $2, reset_hash = NULL, reset_until = NULL WHERE id = $1', [account, passHash]);
        if (!r.rowCount) return false;
        await c.query('DELETE FROM account_tokens WHERE account_id = $1 AND token_hash <> $2', [account, keepToken ? sha(keepToken) : '']);
        return true;
      });
    },
    async setReset(account, codeHash, untilMs) { const r = await q('UPDATE accounts SET reset_hash = $2, reset_until = $3 WHERE id = $1', [account, codeHash, ms(untilMs)]); return r.rowCount > 0; },
    async resetByCode(username, codeHash, nowMs) {
      const r = await q(`UPDATE accounts SET reset_hash = NULL, reset_until = NULL
                         WHERE lower(username) = lower($1) AND reset_hash = $2 AND reset_until > $3 RETURNING id`, [username, codeHash, ms(nowMs)]);
      return r.rows.length ? r.rows[0].id : null;
    },
    async accountInfo(account) {
      const r = await q('SELECT id, claimed, username, email, banned_until, ban_reason, created_at, admin FROM accounts WHERE id = $1', [account]);
      if (!r.rows.length) return null;
      const a = r.rows[0];
      return { id: a.id, claimed: a.claimed, username: a.username, email: a.email, banned: toMs(a.banned_until), banReason: a.ban_reason, created: toMs(a.created_at), admin: !!a.admin };
    },
    async banAccount(account, untilMs, reason = '') { const r = await q('UPDATE accounts SET banned_until = $2, ban_reason = $3 WHERE id = $1', [account, ms(untilMs), reason]); return r.rowCount > 0; },
    async banIp(ipHash, untilMs, reason = '') {
      await q('INSERT INTO ip_bans (ip_hash, until, reason) VALUES ($1, $2, $3) ON CONFLICT (ip_hash) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason', [ipHash, ms(untilMs), reason]);
      return true;
    },
    async ipBanned(ipHash, nowMs) { const r = await q('SELECT 1 FROM ip_bans WHERE ip_hash = $1 AND until > $2', [ipHash, ms(nowMs)]); return r.rows.length > 0; },

    // ---- characters ----
    async charByName(name) {
      const r = await q(`SELECT id, name, account_id, cls, level, COALESCE(blob->'ignore', '[]'::jsonb) AS ignore FROM characters WHERE realm = $1 AND lower(name) = lower($2)`, [realm, name]);
      if (!r.rows.length) return null;
      const x = r.rows[0];
      return { id: x.id, name: x.name, account: x.account_id, cls: x.cls, level: x.level, ignore: (Array.isArray(x.ignore) ? x.ignore : []).map(i => i && i.id) };
    },
    async charsByIds(ids) {
      if (!ids.length) return [];
      const r = await q('SELECT id, name, cls, level, room FROM characters WHERE id = ANY($1::bigint[])', [ids]);
      const by = new Map(r.rows.map(x => [x.id, brief(x)]));
      return ids.map(id => by.get(id)).filter(Boolean);
    },
    async renameChar(id, name, nowMs) {
      try {
        const r = await q('UPDATE characters SET name = $2 WHERE id = $1 AND (lease_owner IS NULL OR lease_until < $3) RETURNING id', [id, name, ms(nowMs)]);
        if (r.rows.length) return { ok: true };
        const e = await q('SELECT 1 FROM characters WHERE id = $1', [id]);
        return { err: e.rows.length ? 'lease' : 'missing' };
      } catch (err) { if (err.code === '23505') return { err: 'name' }; throw err; }
    },

    // ---- friends ----
    async listFriends(char) {
      const r = await q('SELECT c.id, c.name, c.cls, c.level, c.room FROM friends f JOIN characters c ON c.id = f.friend_id WHERE f.char_id = $1 ORDER BY c.name', [char]);
      return r.rows.map(brief);
    },
    async addFriend(char, friend, max = FRIENDS_MAX) {
      const n = await q('SELECT count(*)::int AS n, bool_or(friend_id = $2) AS have FROM friends WHERE char_id = $1', [char, friend]);
      if (n.rows[0].have) return { ok: true };
      if (n.rows[0].n >= max) return { err: 'full' };
      try { await q('INSERT INTO friends (char_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [char, friend]); return { ok: true }; }
      catch (err) { if (err.code === '23503') return { err: 'missing' }; throw err; }
    },
    async removeFriend(char, friend) { const r = await q('DELETE FROM friends WHERE char_id = $1 AND friend_id = $2', [char, friend]); return r.rowCount > 0; },

    // ---- guilds ----
    async createGuild(name, leader) {
      const inG = await q('SELECT 1 FROM guild_members WHERE char_id = $1', [leader]);
      if (inG.rows.length) return { err: 'inGuild' };
      try {
        const id = await tx(async c => {
          const g = await c.query('INSERT INTO guilds (realm, name, created_by) VALUES ($1, $2, $3) RETURNING id', [realm, name, leader]);
          await c.query('INSERT INTO guild_members (guild_id, char_id, rank) VALUES ($1, $2, 0)', [g.rows[0].id, leader]);
          return g.rows[0].id;
        });
        if (!id) return { err: 'name' };
        return { guild: await guildView(id) };
      } catch (err) { if (err.code === '23505') return { err: 'name' }; throw err; }
    },
    async guildOf(char) { const r = await q('SELECT guild_id FROM guild_members WHERE char_id = $1', [char]); return r.rows.length ? guildView(r.rows[0].guild_id) : null; },
    async guildById(id) { return guildView(id); },
    async guildJoin(id, char, rank = 3, max = GUILD_MAX) {
      const g = await q('SELECT (SELECT count(*)::int FROM guild_members WHERE guild_id = $1) AS n, EXISTS (SELECT 1 FROM guilds WHERE id = $1) AS ok', [id]);
      if (!g.rows[0].ok) return { err: 'missing' };
      if (g.rows[0].n >= max) return { err: 'full' };
      try { await q('INSERT INTO guild_members (guild_id, char_id, rank) VALUES ($1, $2, $3)', [id, char, rank]); return { ok: true }; }
      catch (err) { if (err.code === '23505') return { err: 'inGuild' }; throw err; }
    },
    async guildLeave(id, char) { const r = await q('DELETE FROM guild_members WHERE guild_id = $1 AND char_id = $2', [id, char]); return r.rowCount > 0; },
    async guildSetRank(id, char, rank) { const r = await q('UPDATE guild_members SET rank = $3 WHERE guild_id = $1 AND char_id = $2', [id, char, rank]); return r.rowCount > 0; },
    async guildMotd(id, text) { const r = await q('UPDATE guilds SET motd = $2 WHERE id = $1', [id, text]); return r.rowCount > 0; },
    async guildDisband(id) { const r = await q('DELETE FROM guilds WHERE id = $1', [id]); return r.rowCount > 0; },

    // ---- mail ----
    async mailSend({ ch, fence }, mail) {
      return tx(async c => {
        const s = await c.query(SAVE_SQL, saveParams(ch, fence));
        if (!s.rows.length) return false;
        const m = await c.query(`INSERT INTO mail (realm, to_char, from_char, from_name, subject, body, gold, kind, sent_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10) RETURNING id`,
          [realm, mail.to, mail.fromChar ?? null, mail.fromName, mail.subject || '', mail.body || '', mail.gold || 0, mail.kind || 'player', ms(mail.sentAt), ms(mail.expiresAt)]);
        const id = m.rows[0].id;
        for (const it of mail.items || []) await c.query('INSERT INTO items (uid, mail_id, item) VALUES ($1, $2, $3)', [it.uid, id, JSON.stringify(it)]);
        ch.version = s.rows[0].version;
        return { id };
      });
    },
    async mailSystem(mail) {
      return tx(async c => {
        const m = await c.query(`INSERT INTO mail (realm, to_char, from_char, from_name, subject, body, gold, kind, sent_at, expires_at)
          VALUES ($1, $2, NULL, $3, $4, $5, $6, 'system', COALESCE($7, now()), $8) RETURNING id`,
          [realm, mail.to, mail.fromName || 'The Vale', mail.subject || '', mail.body || '', mail.gold || 0, ms(mail.sentAt), ms(mail.expiresAt)]);
        const id = m.rows[0].id;
        for (const it of mail.items || []) await c.query('INSERT INTO items (uid, mail_id, item) VALUES ($1, $2, $3)', [it.uid, id, JSON.stringify(it)]);
        return { id };
      });
    },
    async mailList(char, limit = 50) {
      const r = await q('SELECT * FROM mail WHERE to_char = $1 ORDER BY sent_at DESC, id DESC LIMIT $2', [char, limit]);
      const items = await itemsOf(r.rows.filter(m => !m.taken_at).map(m => m.id));
      return r.rows.map(m => head(m, items.get(m.id) || []));
    },
    async mailUnread(char) { const r = await q('SELECT count(*)::int AS n FROM mail WHERE to_char = $1 AND read_at IS NULL', [char]); return r.rows[0].n; },
    async mailGet(char, id) {
      const r = await q('SELECT * FROM mail WHERE id = $1 AND to_char = $2', [id, char]);
      if (!r.rows.length) return null;
      const m = r.rows[0];
      const items = m.taken_at ? [] : ((await itemsOf([m.id])).get(m.id) || []);
      return { ...head(m, items), body: m.body, itemsFull: items };
    },
    async mailRead(char, id, nowMs) { const r = await q('UPDATE mail SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND to_char = $2', [id, char, ms(nowMs)]); return r.rowCount > 0; },
    async mailTake({ ch, fence }, id, uids, nowMs) {
      return tx(async c => {
        const m = await c.query('UPDATE mail SET taken_at = $3, read_at = COALESCE(read_at, $3) WHERE id = $1 AND to_char = $2 AND taken_at IS NULL RETURNING id', [id, ch.id, ms(nowMs)]);
        if (!m.rows.length) return false;
        const del = await c.query('DELETE FROM items WHERE mail_id = $1 RETURNING uid', [id]);
        const got = del.rows.map(x => x.uid).sort().join('|');
        if (got !== uids.slice().sort().join('|')) return false;      // exactly the escrow rows the letter held
        const s = await c.query(SAVE_SQL, saveParams(ch, fence));
        if (!s.rows.length) return false;
        ch.version = s.rows[0].version;
        return true;
      });
    },
    async mailReturn(char, id, nowMs) {
      return tx(async c => {
        const r = await c.query(`SELECT m.* FROM mail m JOIN characters s ON s.id = m.from_char
                                 WHERE m.id = $1 AND m.to_char = $2 AND m.taken_at IS NULL AND m.kind = 'player' FOR UPDATE OF m`, [id, char]);
        if (!r.rows.length) return false;
        return returnOne(c, r.rows[0], nowMs);
      });
    },
    async mailDelete(char, id) {
      const r = await q(`DELETE FROM mail m WHERE id = $1 AND to_char = $2
                         AND (taken_at IS NOT NULL OR (gold = 0 AND NOT EXISTS (SELECT 1 FROM items WHERE mail_id = m.id)))`, [id, char]);
      return r.rowCount > 0;
    },
    async mailExpire(nowMs) {
      const due = await q('SELECT id FROM mail WHERE expires_at IS NOT NULL AND expires_at <= $1 ORDER BY id LIMIT 500', [ms(nowMs)]);
      const out = [];
      for (const { id } of due.rows) {
        const r = await tx(async c => {
          const x = await c.query('SELECT * FROM mail WHERE id = $1 AND expires_at <= $2 FOR UPDATE', [id, ms(nowMs)]);
          if (!x.rows.length) return { none: true };
          const m = x.rows[0];
          const n = await c.query('SELECT count(*)::int AS n FROM items WHERE mail_id = $1', [id]);
          const holds = !m.taken_at && (m.gold > 0 || n.rows[0].n > 0);
          if (holds && m.kind === 'player' && m.from_char != null) {
            const s = await c.query('SELECT 1 FROM characters WHERE id = $1', [m.from_char]);
            if (s.rows.length) { const rr = await returnOne(c, m, nowMs); return { to: rr.to, returned: true }; }
          }
          if (holds) { await c.query('UPDATE mail SET expires_at = NULL WHERE id = $1', [id]); return { none: true }; }   // never destroy items
          await c.query('DELETE FROM mail WHERE id = $1', [id]);
          return { none: true };
        });
        if (r && !r.none) out.push(r);
      }
      return out;
    },
    async escrow() {
      const r = await q('SELECT (SELECT count(*)::int FROM items) AS items, (SELECT COALESCE(sum(gold), 0)::bigint FROM mail WHERE taken_at IS NULL) AS gold');
      const u = await q('SELECT uid FROM items');
      return { items: r.rows[0].items, gold: Number(r.rows[0].gold), uids: u.rows.map(x => x.uid) };
    },

    // ---- reports, chat log, world state, economy ----
    async addReport(r) {
      const ids = await q('SELECT id FROM characters WHERE id = ANY($1::bigint[])', [[r.fromChar, r.aboutChar].filter(v => v != null)]);
      const has = new Set(ids.rows.map(x => x.id));
      r = { ...r, fromChar: has.has(r.fromChar) ? r.fromChar : null, aboutChar: has.has(r.aboutChar) ? r.aboutChar : null };
      const x = await q(`INSERT INTO reports (from_char, from_name, about_char, about_name, reason, text, chat) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [r.fromChar ?? null, r.fromName ?? null, r.aboutChar ?? null, r.aboutName, r.reason, r.text || '', JSON.stringify(r.chat || [])]);
      return x.rows[0].id;
    },
    async listReports(limit = 100) {
      const r = await q('SELECT * FROM reports ORDER BY id DESC LIMIT $1', [limit]);
      return r.rows.map(x => ({ id: x.id, fromChar: x.from_char, fromName: x.from_name, aboutChar: x.about_char, aboutName: x.about_name, reason: x.reason, text: x.text, chat: x.chat, created: toMs(x.created_at), handled: toMs(x.handled_at) }));
    },
    async handleReport(id, nowMs) { const r = await q('UPDATE reports SET handled_at = $2 WHERE id = $1', [id, ms(nowMs)]); return r.rowCount > 0; },
    async logChat(rows) {
      if (!rows.length) return;
      await q(`INSERT INTO chat_log (at, ch, from_char, from_name, to_key, text)
               SELECT to_timestamp(j.at / 1000.0), j.ch, j.from_char, j.from_name, j.to_key, j.text
               FROM jsonb_to_recordset($1::jsonb) AS j(at float8, ch text, from_char bigint, from_name text, to_key text, text text)
               WHERE j.from_char IS NULL OR EXISTS (SELECT 1 FROM characters c WHERE c.id = j.from_char)`,
        [JSON.stringify(rows.map(r => ({ at: r.at, ch: r.ch, from_char: r.from ?? null, from_name: r.name ?? null, to_key: r.to == null ? null : String(r.to), text: r.text })))]);
    },
    async pruneChat(beforeMs) { const r = await q('DELETE FROM chat_log WHERE at < $1', [ms(beforeMs)]); return r.rowCount; },
    // ---- owner feedback 9: delete a character (X6, schema v7 tombstones), who signed in lately (X1) ----
    async deleteChar(account, id, { nowMs = Date.now(), reserveMs = 86400000 } = {}) {
      return tx(async c => {
        const r = await c.query('SELECT id, name, level, cls, lease_owner, (lease_until IS NOT NULL AND lease_until > now()) AS held FROM characters WHERE id = $1 AND account_id = $2 AND realm = $3 FOR UPDATE', [id, account, realm]);
        if (!r.rows.length) return { err: 'missing' };
        const row = r.rows[0];
        if (row.lease_owner && row.held) return { err: 'lease' };
        // letters from other players that still hold something go back to their senders
        const held = await c.query(`SELECT m.* FROM mail m JOIN characters s ON s.id = m.from_char
          WHERE m.to_char = $1 AND m.taken_at IS NULL AND m.kind = 'player' AND m.from_char <> $1
            AND (m.gold > 0 OR EXISTS (SELECT 1 FROM items i WHERE i.mail_id = m.id)) FOR UPDATE OF m`, [id]);
        let returned = 0;
        for (const m of held.rows) { await returnOne(c, m, nowMs); returned++; }
        await c.query('DELETE FROM items WHERE mail_id IN (SELECT id FROM mail WHERE to_char = $1)', [id]);
        const g = await c.query('SELECT guild_id FROM guild_members WHERE char_id = $1', [id]);
        const guild = g.rows.length ? +g.rows[0].guild_id : null;
        await c.query('DELETE FROM characters WHERE id = $1', [id]);       // mail to it, friends, guild row, journal, chat log: ON DELETE CASCADE; feedback / reports / mail it sent: SET NULL
        if (guild != null) await c.query('DELETE FROM guilds WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM guild_members WHERE guild_id = $1)', [guild]);
        await c.query('DELETE FROM char_tombstones WHERE realm = $1 AND free_at <= $2', [realm, ms(nowMs)]);
        const freeAt = nowMs + reserveMs;
        await c.query(`INSERT INTO char_tombstones (realm, name_lower, name, account_id, char_id, level, cls, deleted_at, free_at) VALUES ($1, lower($2), $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (realm, name_lower) DO UPDATE SET name = EXCLUDED.name, account_id = EXCLUDED.account_id, char_id = EXCLUDED.char_id, level = EXCLUDED.level, cls = EXCLUDED.cls, deleted_at = EXCLUDED.deleted_at, free_at = EXCLUDED.free_at`,
          [realm, row.name, account, id, row.level, row.cls, ms(nowMs), ms(freeAt)]);
        return { ok: true, name: row.name, level: row.level, cls: row.cls, freeAt, returned, guild };
      });
    },
    async noteLogin(account, nowMs = Date.now()) { await q('UPDATE accounts SET last_login = $2 WHERE id = $1', [account, ms(nowMs)]); },
    async loginsSince(sinceMs) { const r = await q('SELECT count(*)::int AS n FROM accounts WHERE last_login >= $1', [ms(sinceMs)]); return r.rows[0].n; },
    // ---- feedback (play-test 5, T19/T21) + admin accounts (schema v5) ----
    async addFeedback(row) {
      return tx(async c => {
        const ids = row.char != null ? await c.query('SELECT 1 FROM characters WHERE id = $1', [row.char]) : { rows: [] };
        const char = ids.rows.length ? row.char : null;
        const acc = row.account != null ? await c.query('SELECT 1 FROM accounts WHERE id = $1', [row.account]) : { rows: [] };
        const had = char != null ? await c.query('SELECT 1 FROM feedback WHERE char_id = $1 AND gift LIMIT 1', [char]) : { rows: [1] };
        const first = char != null && !had.rows.length;
        const r = await c.query(`INSERT INTO feedback (realm, created_at, account_id, char_id, name, cls, level, kind, text, client, server, state, gift, ref, state_by, state_at)
          VALUES ($1, COALESCE($2, now()), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CASE WHEN $15::text IS NULL THEN NULL ELSE COALESCE($2, now()) END) RETURNING id`,
          [realm, ms(row.at), acc.rows.length ? row.account : null, char, row.name || null, row.cls || null, row.level || null, row.kind, row.text, JSON.stringify(row.client || {}), JSON.stringify(row.server || {}), row.state || 'new', first, row.ref ?? null, row.stateBy || null]);
        return { id: r.rows[0].id, first };
      });
    },
    async hasFeedback(char) { const r = await q('SELECT 1 FROM feedback WHERE char_id = $1 LIMIT 1', [char]); return r.rows.length > 0; },
    async feedbackGiftFailed(char) { await q('UPDATE feedback SET gift = false WHERE char_id = $1', [char]); },
    async getFeedback(id) { const r = await q('SELECT * FROM feedback WHERE id = $1 AND realm = $2', [id, realm]); return r.rows.length ? fbRow(r.rows[0]) : null; },
    async listFeedback({ state = null, kind = null, limit = 100, before = null, hideTrashed = false, account = null } = {}) {
      const r = await q(`SELECT * FROM feedback WHERE realm = $1 AND ($2::text IS NULL OR state = $2) AND ($3::text IS NULL OR kind = $3) AND ($4::bigint IS NULL OR id < $4)
        AND (NOT $5::boolean OR state <> 'trashed') AND ($7::bigint IS NULL OR account_id = $7) ORDER BY id DESC LIMIT $6`, [realm, state, kind, before, !!hideTrashed, limit, account]);
      return r.rows.map(fbRow);
    },
    async feedbackCounts() {
      const r = await q('SELECT state, count(*)::int AS n FROM feedback WHERE realm = $1 GROUP BY state', [realm]);
      const c = { new: 0, approved: 0, declined: 0, trashed: 0, completed: 0, total: 0 };
      for (const x of r.rows) { c[x.state] = (c[x.state] || 0) + x.n; c.total += x.n; }
      return c;
    },
    async setFeedbackState(id, state, { by = 'admin', at = Date.now(), note = null, done = null } = {}) {
      const r = await q('UPDATE feedback SET state = $2, state_at = $3, state_by = $4, note = COALESCE($5, note), done_note = COALESCE($7, done_note), done_at = CASE WHEN $7::text IS NULL THEN done_at ELSE $3 END WHERE id = $1 AND realm = $6', [id, state, ms(at), by, note, realm, done]);
      return r.rowCount > 0;
    },
    async setAdmin(who, on = true) {
      const r = typeof who === 'number'
        ? await q('UPDATE accounts SET admin = $2 WHERE id = $1 RETURNING id, username, admin', [who, !!on])
        : await q('UPDATE accounts SET admin = $2 WHERE lower(username) = lower($1) RETURNING id, username, admin', [String(who), !!on]);
      return r.rows.length ? { ok: true, account: r.rows[0].id, username: r.rows[0].username, admin: r.rows[0].admin } : { err: 'missing' };
    },
    async isAdmin(account) { const r = await q('SELECT admin FROM accounts WHERE id = $1', [account]); return !!(r.rows.length && r.rows[0].admin); },
    async listAdmins() { const r = await q('SELECT id, username FROM accounts WHERE admin ORDER BY id'); return r.rows.map(x => ({ account: x.id, username: x.username })); },
    async getWorld(key) { const r = await q('SELECT value FROM world_state WHERE key = $1', [key]); return r.rows.length ? r.rows[0].value : null; },
    async setWorld(key, value) { await q('INSERT INTO world_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)]); },
    async economyReport(sinceMs = 0) {
      const r = await q('SELECT hour, band, kind, reason, gold, items, count FROM economy_log WHERE hour >= $1 ORDER BY hour DESC, band, kind, reason LIMIT 2000', [ms(sinceMs)]);
      return r.rows.map(x => ({ hour: new Date(x.hour).toISOString(), band: x.band, kind: x.kind, reason: x.reason, gold: x.gold, items: x.items, count: x.count }));
    },
  };
}
