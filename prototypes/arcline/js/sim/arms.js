// What each thing you can build actually does, in numbers — one source for the build tray's stat cards (owner report
// #81), the info panel of a tapped turret or wall, the turrets' real firing numbers (Defence reads t.stats) and the
// merchant upgrades (report #78: "I unlocked Pulse Gun Mk 2 … I do not see that as a build option").
//
// Upgrades from merchant goods (ships.js GOODS) are read into r.arms by refreshArms(r): the Mk each turret kind is at,
// the range blueprint, tougher walls and landmark discounts. ships.js calls it whenever goods change; ensureShips calls
// it too, so an old save picks its upgrades up on load.
//   Mk II / Mk III: a REFIT — every turret of that kind, the ones standing and every one built later, fires harder.
//   Woven walls: every wall, standing and new, is 25% tougher (its health rises with it).
// Pure: no DOM.
import { TURRETS } from '../../../../citykit/js/world/defence.js';
import { item } from './catalog.js';
import { T } from './tuning.js';
import { fmt } from '../../../../shared/format.js';
import { effect } from './research.js';

/** Mk table: damage and range multipliers. Mk II about 40% more damage, Mk III twice Mk I and 15% more reach. */
export const MK = { 1: { damage: 1, range: 1, label: '' }, 2: { damage: 1.4, range: 1, label: 'Mk II' }, 3: { damage: 2, range: 1.15, label: 'Mk III' } };
/** Base wall health by tiles.wall value (1..3 tiers, 9 = gate) — the catalog's hp, kept here for the sim's hot path. */
export const WALL_BASE = { 1: 220, 2: 520, 3: 1100, 9: 300 };
/** Catalog id for a tiles.wall value. */
export const WALL_ID = { 1: 'wall-1', 2: 'wall-2', 3: 'wall-3', 9: 'gate' };

/** The region's upgrades: { mk: { pulse: 2, … }, range, wallHp, discount: { 'lm-spaceport': 0.3 } }. */
export function arms(r) { return r.arms || { mk: {}, range: 1, wallHp: 1, discount: {} }; }
export const mkOf = (r, kind) => arms(r).mk?.[kind] || 1;

/**
 * Read the merchant goods the region owns into r.arms, and bring what's standing up to it: turrets of an upgraded kind
 * are refitted (their Mk goes up), walls get tougher with their health raised in step.
 * goods = [{ turret, mk } | { effect: { turretRange | wallHp | discount }, landmark }] owned. → what changed:
 * { refit: [{ kind, mk, from, count }], wallHp: { from, to } | null }
 */
export function refreshArms(r, goods) {
  const old = arms(r), a = { mk: {}, range: 1, wallHp: 1, discount: {} };
  for (const g of goods) {
    if (g.turret) a.mk[g.turret] = Math.max(a.mk[g.turret] || 1, g.mk || 1);
    if (g.effect?.turretRange) a.range *= g.effect.turretRange;
    if (g.effect?.wallHp) a.wallHp *= g.effect.wallHp;
    if (g.landmark && g.effect?.discount) a.discount[g.landmark] = Math.max(a.discount[g.landmark] || 0, g.effect.discount);
  }
  r.arms = a; r.wallHpMul = a.wallHp;
  const out = { refit: [], wallHp: null };
  for (const kind of Object.keys(TURRETS)) {
    const mk = a.mk[kind] || 1, list = (r.turrets || []).filter(t => t.kind === kind && (t.tier || 1) < mk);
    if (list.length || mk !== (old.mk?.[kind] || 1)) {
      for (const t of list) t.tier = mk;
      if (mk > (old.mk?.[kind] || 1)) out.refit.push({ kind, mk, from: old.mk?.[kind] || 1, count: list.length });
    }
  }
  if (a.wallHp !== (old.wallHp || 1) && r.tiles?.wall) {
    const k = a.wallHp / (old.wallHp || 1), N = r.size;
    for (let i = 0; i < N * N; i++) if (r.tiles.wall[i]) r.tiles.wallHp[i] *= k;
    out.wallHp = { from: old.wallHp || 1, to: a.wallHp }; r.wallsChanged = true;
  }
  return out;
}

/** A turret kind's real numbers for this region (its Mk and the range blueprint): the TURRETS entry with damage and
 *  range scaled, plus mk, label ("Pulse Gun Mk II"), shotsPerSec and dps (damage a second against one creature; the
 *  Arc Coil's chain and the Mortar's blast hit more). Defence uses it as t.stats. */
export function turretStats(r, kind, mk = mkOf(r, kind)) {
  const b = TURRETS[kind], m = MK[mk] || MK[1];
  const s = { ...b, mk, damage: b.damage * m.damage, range: b.range * m.range * (arms(r).range || 1) };
  s.label = m.label ? `${b.name} ${m.label}` : b.name;
  s.shotsPerSec = 1 / b.every; s.dps = s.damage / b.every;
  return s;
}
/** The highest health a wall tile can have (its tier, a gate's own, the wall blueprint). */
export function wallMaxHp(r, v) { return (WALL_BASE[v] || 300) * (r.wallHpMul || 1); }

const per = (n, unit) => `${fmt(n, { decimals: n < 10 ? 1 : 0 })} ${unit}`;
const TURRET_WHAT = { pulse: 'a bolt', arc: 'a strike, then 15% less on each jump', rail: 'a slug, through a line', mortar: 'a shell, in a blast' };
/**
 * Stat rows for a buildable entry (catalog item or tool entry) in this region: [[label, value], …] with numbers and
 * units. Used by the build tray's stat card and the tool chip; the info panel adds live rows (health, power) on top.
 */
export function statRows(r, e) {
  if (!e) return [];
  const rows = [];
  if (e.turret) {
    const s = turretStats(r, e.turret);
    rows.push(['Damage', `${fmt(s.damage, { decimals: 0 })} ${TURRET_WHAT[e.turret] || 'a shot'}`]);
    rows.push(['Fire rate', s.shotsPerSec >= 1 ? `${per(s.shotsPerSec, 'shots')}/s` : `1 shot every ${fmt(s.every, { decimals: 1 })} s`]);
    rows.push(['Damage a second', fmt(s.dps, { decimals: 0 })]);
    rows.push(['Range', `${fmt(s.range, { decimals: 1 })} tiles`]);
    if (s.min) rows.push(['Too close to hit', `under ${fmt(s.min, { decimals: 1 })} tiles`]);
    if (s.chain) rows.push(['Jumps', `up to ${fmt(s.chain - 1)} more creatures, ${fmt(s.hop, { decimals: 1 })} tiles apart`]);
    if (s.radius) rows.push(['Blast', `${fmt(s.radius, { decimals: 1 })} tiles across`]);
    rows.push(['Health', fmt(T.turretHp ?? 300)]);
  }
  if (e.wall) {
    const v = e.gate ? 9 : e.params?.tier ?? 1, hp = wallMaxHp(r, v);
    rows.push(['Strength', `${fmt(hp)} health a tile`]);
    rows.push(['Self-repair', `back to full ${fmt(T.wallRegenQuietSec ?? 8)} s after the last hit, while above ${fmt(Math.round((T.wallRegenAbove ?? 0.5) * 100))}%`]);
  }
  const park = parkLift(r, e);
  if (park) {
    rows.push(['Land value', `+${fmt(park.lift)}% at its middle, fading out ${fmt(park.reach)} tiles away`]);
    rows.push(['Newcomers', 'more move in while homes sit in its reach']);
  }
  if (e.rep) rows.push(['Reputation', `+${fmt(Math.round(e.rep * 100))} while it stands`]);
  if ((e.power ?? 0) > 0) rows.push(['Power made', fmt(Math.round(e.power * plantMul(r, e)))]);
  else if (e.power) rows.push(['Power used', fmt(-e.power)]);
  if ((e.water ?? 0) > 0) rows.push(['Water pumped', fmt(Math.round(e.water * pumpMul(r, e)))]);
  else if (e.water) rows.push(['Water used', fmt(-e.water)]);
  if (e.people) rows.push(['Homes', `${fmt(e.people)} people`]);
  if (e.jobs) rows.push(['Jobs', fmt(e.jobs)]);
  if (e.cover?.education) rows.push(['Education reach', `${fmt(e.cover.education)} tiles`]);
  if (e.cover?.leisure && !park) rows.push(['Leisure reach', `${fmt(e.cover.leisure)} tiles`]);
  if (e.comms) rows.push(['Hears ships', ['', 'nearby', 'long range', 'deep space'][e.comms]]);
  if (e.deposit) rows.push(['Mines', `${fmt(T.outpostRate ?? 9)} ${cap(e.deposit)} a day while powered`]);
  if (e.refine) rows.push(['Refines', `${fmt((T.refineRate ?? 6) * (T.refineIn ?? 2))} ${cap(e.refine.from)} → ${fmt(T.refineRate ?? 6)} ${e.refine.to === 'cells' ? 'Power cells' : cap(e.refine.to)} a day`]);
  if (e.size && (e.size[0] > 1 || e.size[1] > 1)) rows.push(['Size', `${e.size[0]} × ${e.size[1]} tiles`]);
  if (e.upkeep) rows.push(['Upkeep', `${perDay(e.upkeep / DAYS_PER_MONTH)} a day`]);   // money is paid daily (report #85)
  return rows;
}
const cap = s => s[0].toUpperCase() + s.slice(1);
/** R&D multipliers on a building's output (the same ones networks.js applies). */
const plantMul = (r, e) => (e.id?.startsWith('svc-power') ? effect(r, 'power') : 1);
const pumpMul = (r, e) => (e.id === 'svc-water' ? effect(r, 'water') : 1);
/** A park's or plaza's lift: land value % at its middle (city.js solveLandValue: boost × parks policy, capped at 1,
 *  × T.landValueParks × 2) and its reach in tiles. null for anything else. */
export function parkLift(r, e) {
  if (!(e?.cat === 'park' || e?.cat === 'leisure') || !e.cover?.leisure) return null;
  const b = Math.min(1, (e.boost ?? 0.8) * effect(r, 'parks'));
  return { lift: Math.round(b * (T.landValueParks ?? 0.25) * 2 * 100), reach: e.cover.leisure };
}
const DAYS_PER_MONTH = 30;   // city.js DAYS_PER_MONTH (not imported: city.js → build.js → arms.js)
/** Same rule as the HUD's perDay: whole credits from 100, one decimal from 1, two below (never "¢0"). */
const perDay = n => { const a = Math.abs(n), d = a >= 100 ? 0 : a >= 1 ? 1 : 2; return `¢${fmt(Math.round(a * 10 ** d) / 10 ** d, { decimals: d })}`; };

/** The short line printed ON a tray card (so a phone or controller sees the key numbers without hovering). */
export function keyLine(r, e) {
  if (!e) return '';
  if (e.turret) { const s = turretStats(r, e.turret); return `${fmt(s.dps, { decimals: 0 })} dmg/s · ${fmt(s.range, { decimals: 1 })} tiles`; }
  if (e.wall) return `${fmt(wallMaxHp(r, e.gate ? 9 : e.params?.tier ?? 1))} health`;
  const park = parkLift(r, e); if (park) return `+${fmt(park.lift)}% value · ${fmt(park.reach)} tiles`;
  if ((e.power ?? 0) > 0) return `+${fmt(Math.round(e.power * plantMul(r, e)))} power`;
  if ((e.water ?? 0) > 0) return `+${fmt(Math.round(e.water * pumpMul(r, e)))} water`;
  if (e.cover?.education) return `${fmt(e.cover.education)}-tile school reach`;
  if (e.cover?.leisure) return `${fmt(e.cover.leisure)}-tile leisure reach`;
  if (e.deposit) return `${fmt(T.outpostRate ?? 9)} ${cap(e.deposit)}/day`;
  if (e.refine) return `${fmt(T.refineRate ?? 6)} ${e.refine.to === 'cells' ? 'cells' : cap(e.refine.to)}/day`;
  if (e.jobs) return `${fmt(e.jobs)} jobs`;
  return '';
}
/** A turret's or catalog entry's name with its Mk ("Pulse Gun Mk II"). */
export function nameWithMk(r, e) { return e?.turret ? turretStats(r, e.turret).label : e?.name || ''; }
/** Price after a landmark discount bought from a merchant. */
export function priceOf(r, e) { const d = arms(r).discount?.[e?.id] || 0; return Math.round((e?.cost || 0) * (1 - d)); }
export { item };
