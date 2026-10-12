// Play-test 6 interface logic with no DOM (stream D-UI) — tests/D/pt6.test.js drives it.
//   U14 line of sight over dungeon tiles; which bodies and things go on the minimap, and as what
//   U12 the lift's floor list
//   U17 what a potion really restores for YOU (the rules' numbers, not the item table's old sentence)

import { hp as whole } from '../../../../../shared/format.js';

/** Clear line between two points over a tile floor? `walkable(x, z)`; sampled every `step` metres. The two ends are not tested (a door stands in a wall). */
export function tileLos(walkable, ax, az, bx, bz, step = 0.75) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L <= step * 2) return true;
  const n = Math.ceil(L / step);
  for (let i = 1; i < n; i++) { const t = i / n; if (L * Math.min(t, 1 - t) < step) continue; if (!walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}

export const SIGHT_M = { outdoor: 70, dungeon: 45 };
const OBJ = {
  stairs: ['Stairs down', '#e8d8a0'], lift: ['Stairs up', '#e8d8a0'], exit: ['The way out', '#8fe08a'], door: ['The way you came in', '#8fd0ff'], entrance: ['The way in', '#8fd0ff'],
  portal: ['A door', '#8fd0ff'], chest: ['A chest', '#ffcf3a'], gate: ['A gate', '#a0a0a0'], lever: ['A lever', '#c8a060'], fishpool: ['A fish pool', '#58b4d8'], campfire: ['A campfire', '#ff9a3d'],
};
const PORTAL = { down: 'Stairs down', up: 'Stairs up', out: 'The way out' };
/**
 * What the character can SEE, as minimap markers. `bodies` = [{id, kind: player|npc|monster, hostile, dead, pet, rank, name, level, x, z}],
 * `things` = [{id, type, name, x, z, opened?, portal?}], `los(ax, az, bx, bz)` -> bool, `skip` = ids drawn by something else (party, loot, rares).
 * Monsters and people show only WHILE in sight; a door, stair or chest stays on the map once seen (`known`, a Set the caller keeps).
 */
export function sightMarkers({ me, bodies = [], things = [], los = () => true, range = SIGHT_M.outdoor, skip = new Set(), known = new Set() } = {}) {
  if (!me) return [];
  const out = [];
  const near = o => Math.hypot(o.x - me.x, o.z - me.z) <= range;
  for (const b of bodies) {
    if (b.id === me.id || skip.has(b.id) || !Number.isFinite(b.x) || !near(b) || !los(me.x, me.z, b.x, b.z)) continue;
    if (b.kind === 'monster' || b.hostile) { if (b.dead) continue; out.push({ id: 'see:' + b.id, kind: 'monster', x: b.x, z: b.z, name: b.name || 'Enemy', sub: `Level ${b.level || 1}${b.rank && b.rank !== 'normal' ? ' ' + b.rank : ''} — in sight`, boss: b.rank === 'boss', priority: 2, size: b.rank === 'boss' ? 8 : 5 }); }
    else if (b.pet) continue;
    else if (b.kind === 'npc') out.push({ id: 'see:' + b.id, kind: 'npc', x: b.x, z: b.z, name: b.name || 'Someone', sub: b.title || 'Someone to talk to', priority: 1, size: 4 });
    else if (b.kind === 'player' && !b.dead) out.push({ id: 'see:' + b.id, kind: 'player', x: b.x, z: b.z, name: b.name || 'A player', sub: `Level ${b.level || 1} — another adventurer`, priority: 1, size: 4 });
  }
  for (const t of things) {
    const d = OBJ[t.type]; if (!d || !Number.isFinite(t.x)) continue;
    const key = String(t.id);
    if (!known.has(key)) { if (!near(t) || !los(me.x, me.z, t.x, t.z)) continue; known.add(key); }
    out.push({ id: 'see:o:' + t.id, kind: 'object', x: t.x, z: t.z, name: t.name || PORTAL[t.portal] || d[0], sub: t.type === 'chest' && t.opened ? 'Emptied' : PORTAL[t.portal] || d[0], color: t.type === 'chest' && t.opened ? '#7a6a50' : d[1], priority: 3, size: 6 });
  }
  return out;
}

/** The lift's buttons: [{ to, label, here }] top floor first. `m` = used {kind:'lift', here, choices:[{to, floor, label, name}]}. */
export function liftChoices(m = {}) {
  return (m.choices || []).slice().sort((a, b) => (a.floor || 0) - (b.floor || 0)).map(c => ({ to: c.to, floor: c.floor,
    label: c.label || (c.floor === 1 ? 'The top — floor 1 (the way in)' : `Floor ${c.floor}`) + (c.name ? ` — ${c.name}` : ''), top: c.floor === 1 }));
}

/** "Restores 47 health (half of yours)" — from the rules' effect and YOUR health / mana. `amount` = potionAmount(effect, hpMax, mpMax). */
export function potionLine(amount, ef = {}, cdSec = null) {
  if (!amount || (!amount.hp && !amount.mp)) return '';
  const bits = [];
  if (amount.hp) bits.push(`${whole(amount.hp)} health${ef.hpPct ? ` (${Math.round(ef.hpPct * 100)}% of yours)` : ''}`);
  if (amount.mp) bits.push(`${whole(amount.mp)} mana${ef.mpPct ? ` (${Math.round(ef.mpPct * 100)}% of yours)` : ''}`);
  return `Restores ${bits.join(' and ')} at once${ef.group ? ', to you and your party near you' : ''}.${cdSec ? ` Potions share a ${whole(cdSec)} s wait.` : ''}`;
}
