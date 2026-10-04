// In-memory store (stream A): the same async interface as server/db/pg-store.js, with the same lease +
// fencing rules (PLAN §9.2), so tests and the in-browser Worker server behave like production.
// server/db/json-store.js wraps it with a file on disk (onChange).
//
// Interface (all async):
//   init() ; close()
//   createGuest(name?) -> { account, token }          token returned once; only its hash is kept
//   authToken(token) -> { account, claimed } | null
//   listChars(account) -> [{ id, name, cls, level, room }]
//   createChar(account, { name, cls, look }) -> { char } | { err: 'name' | 'full' }
//   takeChar(account, id, owner, leaseMs) -> { char, fence } | { err: 'missing' | 'lease' }
//   saveChar(char, fence) -> true | false             refused when version or fence moved on
//   releaseChar(id, owner) ; heartbeat(owner, ids, leaseMs) ; clearLeases(ownerPrefix) -> count
//   appendJournal(rows [{ char, seq, kind, payload, fence }]) -> rows kept (a row whose fence moved on is refused)
//   tradeChars([{ ch, fence }, { ch, fence }]) -> true | false   both blobs in one all-or-nothing write
//   logEconomy(rows) ; info() -> { kind, accounts, characters }

import { sha256Hex, randomHex } from './sha256.js';
import { packChar, unpackChar } from './save-fields.js';
import { applyJournal } from './journal.js';

export const MAX_CHARS_PER_ACCOUNT = 10;

export function createMemoryStore({ now = () => Date.now(), data = null, onChange = null } = {}) {
  const d = data || { nextAccount: 1, nextChar: 1, accounts: {}, chars: {} };
  d.journal ||= {};
  const changed = () => { if (onChange) onChange(d); };
  const prune = (id, seq) => { if (d.journal[id]) d.journal[id] = d.journal[id].filter(j => j.seq > seq); };
  const brief = r => ({ id: r.id, name: r.cols.name, cls: r.cols.cls, level: r.cols.level, room: r.cols.room });

  return {
    kind: 'memory',
    data: d,
    async init() {},
    async close() {},
    async createGuest(name = null) {
      const token = randomHex(32);
      const id = d.nextAccount++;
      d.accounts[id] = { id, tokenHash: sha256Hex(token), name: name || null, claimed: false, created: now() };
      changed();
      return { account: id, token };
    },
    async authToken(token) {
      const h = sha256Hex(String(token));
      for (const a of Object.values(d.accounts)) if (a.tokenHash === h) return { account: a.id, claimed: !!a.claimed };
      return null;
    },
    async listChars(account) {
      return Object.values(d.chars).filter(r => r.account === account).map(brief);
    },
    async createChar(account, { name, cls, look = null }) {
      const lower = name.toLowerCase();
      if (Object.values(d.chars).some(r => r.cols.name.toLowerCase() === lower)) return { err: 'name' };
      if (Object.values(d.chars).filter(r => r.account === account).length >= MAX_CHARS_PER_ACCOUNT) return { err: 'full' };
      const id = d.nextChar++;
      const { cols, blob } = packChar({ name, cls, look, level: 1, xp: 0, gold: 0 });
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
