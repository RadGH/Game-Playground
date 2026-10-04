// Unit upgrades bought at the Drill Yard (owner round 2, R2.3). Data: data/upgrades.json.
//
//   player.upg = { damage: 0, attackSpeed: 0, ... }   levels bought
//   player.upV = number                               bumped on every purchase
//
// An upgrade applies to EVERY unit the player sends: future sends and the ones already on the field.
// upgradeTick (sim.js, right after units are admitted) re-stamps a unit whose `_upV` differs from its
// owner's `upV`: speed, damage, attack interval, max health (current health keeps its share) and leak
// damage are recomputed from the values the unit spawned with (`_up0`). Armour and life steal are read
// live by combat.js through unitTakenFactor / onUnitHit; regeneration ticks here.
// The Drill Yard is usable from anywhere (buildings.json radius null). There is no auto-buy.

const U = data => data.upgrades;

/** Handlers per stat (dead-data test: every `stat` in upgrades.json has a row). */
export const UPGRADE_STATS = {
  damage: 'stamp: _dps x (1 + level*perLevel)',
  attackSpeed: 'stamp: _atkEvery / (1 + level*perLevel)',
  health: 'stamp: hpMax x (1 + level*perLevel), hp keeps its share',
  armour: 'combat.js dealDamage via unitTakenFactor: x (1 - level*perLevel)',
  lifeSteal: 'combat.js via onUnitHit: heal level*perLevel of damage dealt',
  moveSpeed: 'stamp: _spd x (1 + level*perLevel)',
  regen: 'upgradeTick: heal level*perLevel of max health per second',
  siege: 'stamp: _leak x (1 + level*perLevel)',
};

export function newUpgrades(data) {
  const o = {};
  for (const id of U(data).order) o[id] = 0;
  return o;
}

/** Cost of the NEXT level of `id` for this player, or null at max. */
export function upgradeCost(data, p, id) {
  const def = U(data).upgrades[id];
  if (!def) return null;
  const lvl = p.upg[id] || 0;
  if (lvl >= def.max) return null;
  let c = def.cost.base;
  for (let i = 0; i < lvl; i++) c *= def.cost.grow;   // repeated multiply, not Math.pow (sim purity)
  // stream A hook: the race trait Drilled Ranks (races.json `upgradeCost`)
  const rt = data.races.traits[data.races.races[p.race].trait] || {};
  return Math.round(c * (rt.upgradeCost ?? 1));
}

export function upgradeRefusal(ctx, p, id) {
  const { state, data } = ctx;
  if (state.result) return 'over';
  const def = U(data).upgrades[id];
  if (!def) return 'bad';
  const cost = upgradeCost(data, p, id);
  if (cost == null) return 'max';
  if (p.gold < cost) return 'gold';
  return null;
}

export function buyUpgrade(ctx, p, id) {
  const why = upgradeRefusal(ctx, p, id);
  if (why) return why;
  const cost = upgradeCost(ctx.data, p, id);
  p.gold -= cost;
  p.upg[id] = (p.upg[id] || 0) + 1;
  p.upV = (p.upV || 0) + 1;
  p.stats.upgradeGold = (p.stats.upgradeGold || 0) + cost;
  ctx.emit('upgrade', { player: p.id, id, level: p.upg[id], cost });
  return null;
}

/** Summed bonus per stat for a player: { damage: 0.16, ... } (fractions). */
const BONUS = new WeakMap();   // player -> { v, data, out } (not state)
export function unitBonus(data, p) {
  const c = BONUS.get(p);
  if (c && c.v === p.upV && c.data === data) return c.out;
  const out = {};
  for (const id of U(data).order) {
    const def = U(data).upgrades[id];
    out[def.stat] = (out[def.stat] || 0) + (p.upg ? p.upg[id] || 0 : 0) * def.perLevel;
  }
  BONUS.set(p, { v: p.upV, data, out });
  return out;
}

function stamp(data, p, e) {
  if (!e._up0) e._up0 = { spd: e._spd, dps: e._dps, atk: e._atkEvery, hp: e.hpMax, leak: e._leak };
  const b = unitBonus(data, p), o = e._up0;
  e._spd = o.spd * (1 + (b.moveSpeed || 0));
  e._dps = o.dps * (1 + (b.damage || 0));
  e._atkEvery = Math.max(4, Math.round(o.atk / (1 + (b.attackSpeed || 0))));
  const max = o.hp * (1 + (b.health || 0));
  if (e.hpMax > 0) e.hp = e.hp * max / e.hpMax;
  e.hpMax = max;
  e._leak = o.leak * (1 + (b.siege || 0));
  e._upV = p.upV;
}

/** Re-stamp units after a purchase (or on arrival); regenerate. */
export function upgradeTick(ctx) {
  const { state, data } = ctx;
  for (const e of state.ents) {
    if (e.kind !== 'unit' || !e.alive || e._gone || e.owner < 0) continue;
    const p = state.players[e.owner];
    if (!p || !p.upV) continue;
    if (e._upV !== p.upV) stamp(data, p, e);
    const lv = p.upg.regen || 0;
    if (lv > 0 && e.hp < e.hpMax) e.hp = Math.min(e.hpMax, e.hp + e.hpMax * lv * U(data).upgrades.regen.perLevel / 20);
  }
}

/** Incoming damage factor for a sent unit (Riveted Plates). */
export function unitTakenFactor(ctx, dst) {
  if (dst.kind !== 'unit' || dst.owner < 0) return 1;
  const p = ctx.state.players[dst.owner];
  if (!p || !p.upV) return 1;
  const f = 1 - unitBonus(ctx.data, p).armour;
  return f < 0.1 ? 0.1 : f;
}

/** A sent unit dealt damage: Blood Oath life steal. */
export function onUnitHit(ctx, src, dealt) {
  if (!src || src.kind !== 'unit' || src.owner < 0 || !src.alive || src._gone || !(dealt > 0)) return;
  const p = ctx.state.players[src.owner];
  if (!p || !p.upV) return;
  const ls = unitBonus(ctx.data, p).lifeSteal;
  if (ls > 0 && src.hp < src.hpMax) src.hp = Math.min(src.hpMax, src.hp + dealt * ls);
}
