// SAVE_FIELDS (PLAN §9.2): the ONE table both saving and loading loop over. A field the live character
// carries that is not here is lost on reload — tests/A/save-fields.test.js fails if that happens.
//   col: the database column (characters table); fields without `col` live in the JSON blob.

export const SAVE_FIELDS = Object.freeze([
  { k: 'name', col: 'name', def: '' },
  { k: 'cls', col: 'cls', def: '' },
  { k: 'level', col: 'level', def: 1 },
  { k: 'xp', col: 'xp', def: 0 },
  { k: 'gold', col: 'gold', def: 0 },
  { k: 'room', col: 'room', def: null },
  { k: 'x', col: 'x', def: null },
  { k: 'z', col: 'z', def: null },
  { k: 'y', def: null },
  { k: 'yaw', def: 0 },
  { k: 'hp', def: 0 },
  { k: 'mp', def: 0 },
  { k: 'look', def: null },
  { k: 'bag', def: [] },           // items, each with a server uid (PLAN §6.2)
  { k: 'equipment', def: {} },     // worn gear: owned by the rules (C's serializeGear blob); stand-in = slot -> item
  { k: 'opened', def: {} },        // per-character chests: key -> reopen time (wall ms)
  { k: 'ignore', def: [] },        // [{ id, name }] whose chat this character does not see
  { k: 'exit', def: null },        // { x, z } in the wilds: where leaving an instance (or losing it) puts you
  { k: 'mutedUntil', def: 0 },     // wall ms; chat refused until then (admin hook)
  { k: 'waystones', def: [] },     // waystone keys this character has discovered (travel targets)
  { k: 'jseq', col: 'journal_seq', def: 0 },   // last journal row this blob contains (js/sim/journal.js)
]);

/** Runtime-only keys on a live character (never saved). */
export const RUNTIME_KEYS = Object.freeze(['id', 'account', 'version', 'fence', 'dirty', 'savedAt']);

/** Live character -> { cols, blob } (copies; safe to hand to an async writer). */
export function packChar(ch) {
  const cols = {}, blob = {};
  for (const f of SAVE_FIELDS) {
    let v = ch[f.k];
    if (v === undefined) v = f.def;
    if (f.col) cols[f.col] = v; else blob[f.k] = v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));
  }
  return { cols, blob };
}

/** { cols, blob } (+ id/account/version) -> live character with defaults filled. */
export function unpackChar(row) {
  const ch = { id: row.id, account: row.account, version: row.version || 0 };
  const blob = row.blob || {};
  for (const f of SAVE_FIELDS) {
    let v = f.col ? row.cols?.[f.col] : blob[f.k];
    if (v === undefined || v === null) v = f.def;
    ch[f.k] = v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;   // never share objects with the stored row
  }
  return ch;
}

/** Keys on a live character that SAVE_FIELDS does not cover (should be []). */
export function unknownKeys(ch) {
  const known = new Set([...SAVE_FIELDS.map(f => f.k), ...RUNTIME_KEYS]);
  return Object.keys(ch).filter(k => !known.has(k));
}
