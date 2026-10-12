// In-memory store (stream A): the same async interface as server/db/pg-store.js, with the same lease +
// fencing rules (PLAN §9.2), so tests and the in-browser Worker server behave like production.
// server/db/json-store.js wraps it with a file on disk (onChange).
//
// Interface (all async):
//   init() ; close()
//   createGuest(name?) -> { account, token }          token returned once; only its hash is kept
//   authToken(token) -> { account, claimed } | null
//   listChars(account) -> [{ id, name, cls, level, room }]
//   createChar(account, { name, cls, look, kit }) -> { char } | { err: 'name' | 'full' }   (kit: the chosen starter kit, T5)
//   takeChar(account, id, owner, leaseMs) -> { char, fence } | { err: 'missing' | 'lease' }
//   saveChar(char, fence) -> true | false             refused when version or fence moved on
//   setLook(account, id, look) -> { ok } | { err: 'missing' | 'lease' }   (a character nobody holds; play-test 2 Q21)
//   releaseChar(id, owner) ; heartbeat(owner, ids, leaseMs) ; clearLeases(ownerPrefix) -> count
//   appendJournal(rows [{ char, seq, kind, payload, fence }]) -> rows kept (a row whose fence moved on is refused)
//   tradeChars([{ ch, fence }, { ch, fence }]) -> true | false   both blobs in one all-or-nothing write
//   logEconomy(rows) ; info() -> { kind, accounts, characters }
//   + the M3 methods in js/sim/store-memory-m3.js (accounts, friends, guilds, mail, reports, chat log, world state)

import { sha256Hex, randomHex } from './sha256.js';
import { packChar, unpackChar } from './save-fields.js';
import { applyJournal } from './journal.js';
import { memoryM3 } from './store-memory-m3.js';

export const MAX_CHARS_PER_ACCOUNT = 20;      // owner feedback 9 (X6): the default; the server's own knob (`charLimit`) is passed to createChar

export function createMemoryStore({ now = () => Date.now(), data = null, onChange = null } = {}) {
  const d = data || { nextAccount: 1, nextChar: 1, accounts: {}, chars: {} };
  d.journal ||= {};
  const changed = () => { if (onChange) onChange(d); };
  const prune = (id, seq) => { if (d.journal[id]) d.journal[id] = d.journal[id].filter(j => j.seq > seq); };
  const brief = r => ({ id: r.id, name: r.cols.name, cls: r.cols.cls, level: r.cols.level, room: r.cols.room });

  const m3 = memoryM3(d, { now, changed, sha256Hex, randomHex, packChar, prune, brief });
  return {
    ...m3,
    kind: 'memory',
    data: d,
    async init() {},
    async close() {},
    async createGuest(name = null) {
      const token = randomHex(32);
      const id = d.nextAccount++;
      d.accounts[id] = { id, name: name || null, claimed: false, created: now() };
      d.tokens[sha256Hex(token)] = { account: id, kind: 'guest', created: now() };
      changed();
      return { account: id, token };
    },
    async authToken(token) {
      const h = sha256Hex(String(token));
      const t = d.tokens[h];
      const a = t ? d.accounts[t.account] : Object.values(d.accounts).find(x => x.tokenHash === h);     // tokenHash: stores written before M3
      if (!a) return null;
      if (t) t.used = now();
      return { account: a.id, claimed: !!a.claimed, username: a.username || null, banned: a.bannedUntil || 0, kind: t ? t.kind : 'guest', admin: !!a.admin };
    },
    async listChars(account) {
      return Object.values(d.chars).filter(r => r.account === account).map(r => ({ ...brief(r), look: (r.blob && r.blob.look) || null,
        gear: JSON.parse(JSON.stringify(r.blob?.equipment?.equipment || r.blob?.equipment || {})) }));
    },
    async createChar(account, { name, cls, look = null, kit = null, limit = MAX_CHARS_PER_ACCOUNT }) {
      const lower = name.toLowerCase();
      if (Object.values(d.chars).some(r => r.cols.name.toLowerCase() === lower)) return { err: 'name' };
      const tomb = (d.tombstones || {})[lower];             // X6: a deleted character's name stays reserved for a day
      if (tomb && tomb.freeAt > now()) return { err: 'name', reserved: tomb.freeAt };
      if (Object.values(d.chars).filter(r => r.account === account).length >= limit) return { err: 'full' };
      const id = d.nextChar++;
      const { cols, blob } = packChar({ name, cls, look, kit, level: 1, xp: 0, gold: 0 });
      d.chars[id] = { id, account, cols, blob, version: 0, lease_owner: null, lease_fence: 0, lease_until: 0 };
      changed();
      return { char: brief(d.chars[id]) };
    },
    async takeChar(account, id, owner, leaseMs = 30000) {
      const r = d.chars[id];
      if (!r || r.account !== account) return { err: 'missing' };
      const t = now();
      if (r.lease_owner && r.lease_owner !== owner && r.lease_until > t) return { err: 'lease' };
      r.lease_owner = owner; r.lease_fence++; r.lease_until = t + leaseMs;
      changed();
      const ch = unpackChar(r);
      // copies: the live character must never share objects with the stored rows (Postgres gives copies too)
      applyJournal(ch, JSON.parse(JSON.stringify((d.journal[id] || []).filter(j => j.seq > (ch.jseq || 0)).sort((a, b) => a.seq - b.seq))));
      return { char: ch, fence: r.lease_fence };
    },
    async saveChar(ch, fence) {
      const r = d.chars[ch.id];
      if (!r || r.version !== ch.version || r.lease_fence !== fence) return false;
      const { cols, blob } = packChar(ch);
      r.cols = cols; r.blob = blob; r.version++;
      ch.version = r.version;
      prune(ch.id, ch.jseq || 0);
      changed();
      return true;
    },
    async appendJournal(rows) {
      let kept = 0;
      for (const j of rows) {
        const r = d.chars[j.char];
        if (!r || r.lease_fence !== j.fence) continue;
        const list = d.journal[j.char] ||= [];
        if (list.some(x => x.seq === j.seq)) continue;
        list.push({ seq: j.seq, kind: j.kind, payload: JSON.parse(JSON.stringify(j.payload || {})) });
        kept++;
      }
      if (kept) changed();
      return kept;
    },
    async tradeChars(list) {
      for (const { ch, fence } of list) { const r = d.chars[ch.id]; if (!r || r.version !== ch.version || r.lease_fence !== fence) return false; }
      for (const { ch } of list) {
        const r = d.chars[ch.id];
        const { cols, blob } = packChar(ch);
        r.cols = cols; r.blob = blob; r.version++;
        ch.version = r.version;
        prune(ch.id, ch.jseq || 0);
      }
      changed();
      return true;
    },
    /** Play-test 2 (Q21): a new look on a character nobody holds (the title screen). { ok } | { err: 'missing'|'lease' } */
    async setLook(account, id, look) {
      const r = d.chars[id];
      if (!r || r.account !== account) return { err: 'missing' };
      if (r.lease_owner && r.lease_until > now()) return { err: 'lease' };
      r.blob = { ...(r.blob || {}), look: JSON.parse(JSON.stringify(look)) };
      r.version++;
      changed();
      return { ok: true };
    },
    async releaseChar(id, owner) {
      const r = d.chars[id];
      if (r && r.lease_owner === owner) { r.lease_owner = null; r.lease_until = 0; changed(); }
    },
    async heartbeat(owner, ids, leaseMs = 30000) {
      const t = now();
      for (const id of ids) { const r = d.chars[id]; if (r && r.lease_owner === owner) r.lease_until = t + leaseMs; }
    },
    async clearLeases(prefix) {
      let n = 0;
      for (const r of Object.values(d.chars)) if (r.lease_owner && r.lease_owner.startsWith(prefix)) { r.lease_owner = null; r.lease_until = 0; n++; }
      if (n) changed();
      return n;
    },
    async logEconomy(rows) {
      const log = d.economy ||= {};
      for (const r of rows) {
        const k = r.hour + '|' + r.band + '|' + r.kind + '|' + r.reason;
        const o = log[k] ||= { hour: r.hour, band: r.band, kind: r.kind, reason: r.reason, gold: 0, items: 0, count: 0 };
        o.gold += r.gold; o.items += r.items; o.count += r.count;
      }
      if (rows.length) changed();
    },
    async info() { return { kind: 'memory', accounts: Object.keys(d.accounts).length, characters: Object.keys(d.chars).length }; },
  };
}
