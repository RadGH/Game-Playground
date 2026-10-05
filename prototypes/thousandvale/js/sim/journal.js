// The save journal (stream A, PLAN §9.2): every change that matters becomes a small row; the world
// group-commits rows every 2 s, and the full character blob is written less often (every 60 s if dirty,
// on logout, on rare drops, level-ups and trades) recording the last journal seq it contains
// (`ch.jseq`, column `journal_seq`). Loading = blob + every journal row with a higher seq, applied in
// order. Worst-case loss on a crash: the rows not yet committed (≤ 2 s).
//
// Rows are DELTAS or ADD/REMOVE so they stay correct on top of any blob saved after them was skipped
// (a trade saves both blobs at once while new loot keeps arriving):
//   gold   { d }                 gold += d
//   xp     { d, level }          xp += d; level = level
//   bagAdd { item }              add the item (skipped if its uid is already held)
//   bagDel { uid }               remove that uid from the bag
//   equip  { equipment }         worn set (absolute; bag moves come as bagAdd/bagDel rows)
//   opened { key, until }        a chest emptied
//   pos    { room, x, y, z, yaw, exit? }
//   set    { k, v }              any other SAVE_FIELDS value (ignore, mutedUntil)
// Pure.

export const JOURNAL_KINDS = Object.freeze(['gold', 'xp', 'bagAdd', 'bagDel', 'equip', 'opened', 'pos', 'set']);
export const JOURNAL_FLUSH_MS = 2000;

/** Apply journal rows (sorted by seq, all > ch.jseq) to a loaded character. Returns the character. */
export function applyJournal(ch, rows) {
  ch.bag ||= []; ch.opened ||= {};
  for (const r of rows) {
    if (r.seq <= (ch.jseq || 0)) continue;
    const p = r.payload || {};
    switch (r.kind) {
      case 'gold': ch.gold = (ch.gold || 0) + (p.d || 0); break;
      case 'xp': ch.xp = (ch.xp || 0) + (p.d || 0); if (p.level) ch.level = p.level; break;
      case 'bagAdd': if (p.item && !holds(ch, p.item.uid)) ch.bag.push(p.item); break;
      case 'bagDel': ch.bag = ch.bag.filter(i => i.uid !== p.uid); break;
      case 'equip': ch.equipment = p.equipment || {}; break;
      case 'opened': ch.opened[p.key] = p.until; break;
      case 'pos': for (const k of ['room', 'x', 'y', 'z', 'yaw']) if (p[k] !== undefined) ch[k] = p[k]; if ('exit' in p) ch.exit = p.exit; break;
      case 'set': if (typeof p.k === 'string' && p.k !== 'id' && p.k !== 'account') ch[p.k] = p.v; break;
      default: break;
    }
    ch.jseq = r.seq;
  }
  return ch;
}

/** Every uid a character holds (bag + worn), for duplicate checks. */
export function heldUids(ch) {
  const out = (ch.bag || []).map(i => i.uid);
  const eq = ch.equipment || {};
  const worn = eq.equipment && typeof eq.equipment === 'object' ? eq.equipment : eq;
  for (const it of Object.values(worn)) if (it && typeof it === 'object' && it.uid) out.push(it.uid);
  return out;
}
function holds(ch, uid) { return heldUids(ch).includes(uid); }
