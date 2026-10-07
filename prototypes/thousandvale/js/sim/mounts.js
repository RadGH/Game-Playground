// MOUNTS (stream A, play-test 2: Q16 "the owner wants to try one"). Pure.
//
// A character OWNS mounts (`char.mounts = [id]`, saved) and RIDES at most one (`entity.mount`, on `info.mount` so
// everyone draws them riding; `entity.speedMul` scales the on-foot speeds in stepMove — the client predicts with the
// same number from `you.speedMul`). The first mount is given at STARTER_LEVEL; the stablehand sells the rest (a shop
// row with `mount`). WHEN you ride is stream C's rulebook (js/rules/mount.js): a 1.5 s call standing still, off when you
// attack or cast, swim, die or go indoors, thrown by a damaging hit unless the mount's `calm` holds.
//
// stream E may replace the table with data/provinces/mounts.json `{ mounts: [{ id, name, speed, level, price, look }] }`.

export const STARTER_LEVEL = 5;
// Ids, names and bodies are Farhold's mount bases (prototypes/farhold/js/gear.js GEAR_BASES / MOUNT_LOOKS) — the ids
// stream E's stable sells (data/provinces/shops.json kind `stable`). Speeds are the MMO's (C's clamp 1..2.5), not Farhold's
// single-player ones; `calm` = the chance a hit does not throw you (C's js/rules/mount.js).
export const DEFAULT_MOUNTS = Object.freeze([
  { id: 'trail_horse', name: 'Trail Horse', speed: 1.4, calm: 0.15, level: 1, price: 60, starter: true, look: { creature: { type: 'horse', size: 1.25, colors: { body: '#6a4a32', belly: '#8a6a4a', accent: '#2e2018', eyes: '#301c10' } } } },
  { id: 'pony', name: 'Moor Pony', speed: 1.5, calm: 0.2, level: 5, price: 240, look: { creature: { type: 'pony', size: 1.0, colors: { body: '#8a6a44', belly: '#b09068', accent: '#3a2a18' } } } },
  { id: 'courser', name: 'Courser', speed: 1.75, calm: 0.3, level: 10, price: 900, look: { creature: { type: 'courser', size: 1.3, colors: { body: '#4a3a30', belly: '#6a5648', accent: '#181008' } } } },
  { id: 'dray', name: 'Dray Elk', speed: 1.65, calm: 0.5, level: 15, price: 1600, look: { creature: { type: 'elk', size: 1.45, colors: { body: '#6a5a48', belly: '#b8a684', accent: '#3a2c1c' }, features: { antlers: true } } } },
]);

import { economy } from './economy-knobs.js';

export function createMountBook(data = null) {
  const EM = economy().mounts || {};        // V2: E's economy.json `mounts [{id, price, level}]` re-prices the table
  const list = (data && Array.isArray(data.mounts) && data.mounts.length ? data.mounts : DEFAULT_MOUNTS)
    .filter(m => m && typeof m.id === 'string')
    .map(m => ({ id: m.id, name: m.name || m.id, speed: Math.max(1, Math.min(2.5, +m.speed || 1.4)), calm: Math.max(0, Math.min(0.8, +m.calm || 0)), level: Math.max(1, (EM[m.id] && EM[m.id].level) | 0 || m.level | 0 || 1), price: Math.max(0, (EM[m.id] && Number.isFinite(EM[m.id].price) ? EM[m.id].price : m.price) | 0), starter: !!m.starter, look: m.look || null }));
  const byId = new Map(list.map(m => [m.id, m]));
  const starter = list.find(m => m.starter) || list.find(m => m.price === 0) || list[0];   // given free at STARTER_LEVEL (and sold from its own level)
  const view = m => ({ id: m.id, name: m.name, speed: m.speed, calm: m.calm, level: m.level, ...(m.look ? { look: m.look } : {}) });
  return {
    list, byId, starter,
    get: id => byId.get(id) || null,
    view,
    /** The mounts this character owns, as the client lists them. */
    owned: ch => (Array.isArray(ch.mounts) ? ch.mounts : []).map(id => byId.get(id)).filter(Boolean).map(view),
    /** The best (fastest) one this character owns, or null. */
    best: ch => (Array.isArray(ch.mounts) ? ch.mounts : []).map(id => byId.get(id)).filter(Boolean).sort((a, b) => b.speed - a.speed)[0] || null,
    /** Give the starter mount when the level allows it; true when something was added. */
    grantStarter(ch) {
      if (!starter || (ch.level || 1) < Math.max(STARTER_LEVEL, starter.level)) return false;
      ch.mounts ||= [];
      if (ch.mounts.includes(starter.id)) return false;
      ch.mounts.push(starter.id);
      return true;
    },
    /** Stablehand shop rows (mounts for sale, not yet owned). */
    forSale: ch => list.filter(m => m.price > 0 && !(ch.mounts || []).includes(m.id)).map(m => ({ id: 'mount:' + m.id, mount: view(m), price: m.price, level: m.level })),
    /** A shop row for mount `id` at `price` (stream E's stable goods), or null when it is not a mount / already owned. */
    row: (ch, id, price, level) => { const m = byId.get(id); return m && !(ch.mounts || []).includes(m.id) ? { id: 'mount:' + m.id, mount: view(m), price: price ?? m.price, level: level ?? m.level } : null; },
  };
}
