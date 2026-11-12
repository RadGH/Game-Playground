// Growing your own hull (owner ruling E5, 2026-11-12) and the "Ship power" rating (ruling E10).
import { CLASSES, CLASS_ORDER } from '../data/hulls.js';
import { MATERIALS, matOf } from '../data/types.js';
import { partMatTier } from './craft.js';
import { weaponStat } from './partstats.js';

/** The classes your hull can grow into next (cruiser → battleship OR carrier). */
export function growOptions(cls) {
  const order = ['skiff', 'corvette', 'frigate', 'destroyer', 'cruiser', 'battleship', 'dreadnought'];
  if (cls === 'cruiser') return ['battleship', 'carrier'];
  if (cls === 'carrier') return ['dreadnought'];
  const i = order.indexOf(cls); return i >= 0 && i < order.length - 1 ? [order[i + 1]] : [];
}
void CLASS_ORDER;

/** Credits (about 60% of a new hull of that class) or ore of the class's tier (about half that in value) + a fee. */
export function growCost(to) {
  const C = CLASSES[to]; const t = partMatTier(C.tier); const value = C.price * 0.5;
  const mats = {
    [matOf('structural', t)]: Math.round(value * 0.55 / MATERIALS[matOf('structural', t)].price),
    [matOf('energy', t)]: Math.round(value * 0.3 / MATERIALS[matOf('energy', t)].price),
    [matOf('exotic', t)]: Math.max(2, Math.round(value * 0.15 / MATERIALS[matOf('exotic', t)].price)),
    rock: Math.round(40 + C.grid * 6),
  };
  return { cr: Math.round(C.price * 0.6), mats, fee: Math.round(C.price * 0.06) };
}

/**
 * Ship power: one number for how strong your flagship is (HUD + Ship upgrades screen). Damage per second,
 * toughness (hull + shields) and speed, weighted — about 10 for a starter skiff, thousands for a dreadnought.
 */
export function shipPower(body, dpsOf) {
  const st = body.stats;
  let dps = 0; for (const t of body.turrets) if (t.b.alive && t.w.mode !== 'tool') dps += dpsOf(t);
  const tough = st.maxHp + st.shieldMax * 1.2;
  return Math.round(Math.sqrt(Math.max(1, dps) * Math.max(1, tough)) / 6 * (0.8 + Math.min(0.4, st.maxSpeed / 1000)));
}

/** Damage per second of one turret (same maths as the item cards). */
export function turretDps(t) {
  const W = t.w, it = t.b.item; const dmg = weaponStat(W, it, 'dmg');
  if (W.mode === 'beam' || W.proj === 'beam') return dmg;
  const chain = (W.chain || 0) + (it?.mods?.chain ? 1 : 0);
  return dmg * ((W.count || 1) + (it?.mods?.twin ? 1 : 0)) * weaponStat(W, it, 'rate') * (chain ? 1 + chain * 0.6 : 1);
}
export const rating = body => shipPower(body, turretDps);
