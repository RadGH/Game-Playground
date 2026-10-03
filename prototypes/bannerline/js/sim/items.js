// Hero inventory (owner round 2, R2.2): six slots with no slot types, simple stat items in the classic
// hero-arena style, bought at the Outfitter (the hero must stand in its radius; js/sim/shop.js).
//
//   player.inv = [6 x { uid, id, charges } | null]       id = key in data/items-bl.json `items`
//
// Rules:
//   * Every item takes one slot. Duplicates never merge or upgrade: each copy takes its own slot and
//     EVERY copy counts (six swords = six swords' worth of damage).
//   * Items flagged `uniqueEquipped` refuse a second copy (reason 'uniqueEquipped').
//   * Consumables carry `charges`; `use {slot}` spends one and the item is gone at 0.
//   * Tiers are by price only. No affixes, no rolls, no procs (for now). Effects stay data-driven:
//     a stat key needs a row in STAT_HANDLERS below, a use effect a row in USE_EFFECTS.
//
// gearStats(data, p) is the one summary every other module reads. It keeps the key names the core
// already consumes (heroes.js, combat.js, talents.js, economy.js) and adds the new ones.

import { secToTicks, liveEnt } from './state.js';
import { next, int } from './rng.js';
import { dist2 } from './mathx.js';
import { sortBy } from './order.js';
import { refreshHero } from './heroes.js';
import { addStatus } from './statuses.js';
import { inBuildingRange } from './buildings.js';

const IB = data => data['items-bl'];

/**
 * Every stat an item may carry, and WHERE the sim reads it (tests/items.test.js proves each one
 * changes something; tests/dead-data.test.js fails on a stat without a row here).
 */
export const STAT_HANDLERS = {
  damage: 'heroes.js heroStats: + damage / attackEvery to dps (flat per basic attack)',
  attackSpeed: 'combat.js runAttacks: attack interval / (1 + attackSpeed%)',
  critChance: 'combat.js runAttacks: crit roll',
  critDamage: 'combat.js runAttacks: crit multiplier 1.5 + critDamage%',
  lifeSteal: 'combat.js heroBasicHit: heal share of basic attack damage',
  spellPower: 'combat.js dealDamage: hero skill damage x (1 + spellPower%)',
  maxHp: 'heroes.js heroStats: hpMax',
  armor: 'heroes.js heroStats: armor',
  magicResist: 'combat.js dealDamage: fire / nature damage to a hero x (1 - magicResist%)',
  hpRegen: 'heroes.js heroTick: health per second',
  mana: 'heroes.js heroStats: mpMax',
  manaRegen: 'heroes.js heroStats: mpRegen',
  moveSpeed: 'heroes.js heroStats movePct (read by movement.js): speed x (1 + moveSpeed%)',
  cdr: 'talents.js planFor: cooldown x (1 - cdr%)',
  bountyPct: 'economy.js payKill: bounty x (1 + bountyPct%)',
};
export const STAT_IDS = Object.keys(STAT_HANDLERS);
// keys the core reads that no item sets any more (kept at 0 so old readers stay valid)
const LEGACY_ZERO = ['stepDps', 'stepHp', 'stepArmor', 'dmgPct', 'areaPct', 'vsChampion', 'resistAll', 'setPieces'];

/** A fresh inventory. */
export function newInventory(data) { return new Array(IB(data).rules.slots).fill(null); }

export function itemDef(data, id) { return IB(data).items[id] || null; }

// gearStats is read on every hit: cached per player object, invalidated by p.gearV (bumped by every
// inventory change). A WeakMap is not state: it never reaches a hash or a snapshot.
const CACHE = new WeakMap();
export function gearStats(data, p) {
  const c = CACHE.get(p);
  if (c && c.v === p.gearV && c.data === data) return c.out;
  const out = computeGear(data, p);
  CACHE.set(p, { v: p.gearV, data, out });
  return out;
}

function computeGear(data, p) {
  const out = { powers: [] };
  for (const k of LEGACY_ZERO) out[k] = 0;
  for (const k of STAT_IDS) out[k] = 0;
  out.critDamage = 0;
  const inv = p.inv;
  if (!inv) return out;
  for (const it of inv) {
    if (!it) continue;
    const def = itemDef(data, it.id);
    if (!def) continue;
    for (const k of Object.keys(def.stats)) out[k] += def.stats[k];
  }
  const caps = IB(data).caps;
  for (const k of Object.keys(caps)) if (out[k] > caps[k]) out[k] = caps[k];
  return out;
}

/** The hero's armour class (items no longer change it). */
export function armourClassFor(data, p) { return data.heroes.heroes[p.hero].armourClass; }

/** One number for "how much is this item worth to carry" (the AI sorts by it). */
export function itemScore(data, idOrItem) {
  if (!idOrItem) return 0;
  const def = itemDef(data, typeof idOrItem === 'string' ? idOrItem : idOrItem.id);
  if (!def) return 0;
  return def.consumable ? def.price * 0.2 : def.price;
}

// ── inventory operations (each returns a refusal reason or null) ──────────────────────────────────

const heroOf = (ctx, p) => ctx.state.ents.find(e => e.id === p.heroEnt) || null;

/** Is this player's hero inside the Outfitter's radius? (also exported as atArmory for older readers) */
export function atShop(ctx, p) {
  const h = heroOf(ctx, p);
  if (!h || !h.alive) return false;
  return inBuildingRange(ctx, p.team, 'shop', h.x, h.z);
}
export const atArmory = atShop;

export function freeSlot(p) { return p.inv.indexOf(null); }

export function carries(p, id) { return p.inv.some(it => it && it.id === id); }

/** Why buying item `id` is refused, or null. */
export function buyRefusal(ctx, p, id) {
  const { state, data } = ctx;
  if (state.result) return 'over';
  const def = itemDef(data, id);
  if (!def) return 'bad';
  const h = heroOf(ctx, p);
  if (!h || !h.alive) return 'dead';
  if (!atShop(ctx, p)) return 'notAtShop';
  if (def.uniqueEquipped && carries(p, id)) return 'uniqueEquipped';
  if (freeSlot(p) < 0) return 'full';
  if (p.gold < def.price) return 'gold';
  return null;
}

function bump(ctx, p) { p.gearV = (p.gearV || 0) + 1; refreshFromGear(ctx, p); }

export function buyItem(ctx, p, id) {
  const why = buyRefusal(ctx, p, id);
  if (why) return why;
  const def = itemDef(ctx.data, id);
  const slot = freeSlot(p);
  const it = { uid: ctx.state.nextItem++, id, charges: def.consumable ? def.charges : 0 };
  p.inv[slot] = it;
  p.gold -= def.price;
  p.stats.itemGold += def.price;
  ctx.emit('item', { player: p.id, uid: it.uid, id, slot, how: 'buy', name: def.name });
  bump(ctx, p);
  return null;
}

/** Sale price of an item in hand (consumables pay back their remaining charges' share). */
export function sellValue(data, it) {
  const def = itemDef(data, it.id);
  if (!def) return 0;
  const share = def.consumable ? it.charges / def.charges : 1;
  return Math.round(def.price * IB(data).rules.sellFactor * share);
}

export function sellRefusal(ctx, p, slot) {
  if (ctx.state.result) return 'over';
  if (!(slot >= 0 && slot < p.inv.length) || (slot | 0) !== slot || !p.inv[slot]) return 'bad';
  const h = heroOf(ctx, p);
  if (!h || !h.alive) return 'dead';
  if (!atShop(ctx, p)) return 'notAtShop';
  return null;
}

export function sellItem(ctx, p, slot) {
  const why = sellRefusal(ctx, p, slot);
  if (why) return why;
  const it = p.inv[slot];
  const gold = sellValue(ctx.data, it);
  p.inv[slot] = null;
  p.gold += gold;
  ctx.emit('sell', { player: p.id, uid: it.uid, id: it.id, slot, gold, name: itemDef(ctx.data, it.id).name });
  bump(ctx, p);
  return null;
}

/** Move an item between two slots (swap; either may be empty). Anywhere, any time. */
export function swapSlots(ctx, p, a, b) {
  const n = p.inv.length;
  if (!(a >= 0 && a < n && b >= 0 && b < n) || (a | 0) !== a || (b | 0) !== b || a === b) return 'bad';
  if (!p.inv[a] && !p.inv[b]) return 'bad';
  const t = p.inv[a]; p.inv[a] = p.inv[b]; p.inv[b] = t;
  ctx.emit('swap', { player: p.id, a, b });
  return null;
}

// ── consumables ───────────────────────────────────────────────────────────────────────────────────

function statusPower(data, id, override) {
  if (override != null) return override;
  const d = data.heroes.statuses[id];
  if (!d) return 0;
  return d.damage ?? d.slow ?? d.takeMore ?? d.move ?? 0;
}

/** Use effects: each receives (ctx, p, hero, effect row). tests/dead-data.test.js checks coverage. */
export const USE_EFFECTS = {
  heal(ctx, p, h, u) {
    const amt = Math.min(h.hpMax - h.hp, h.hpMax * u.pct);
    if (amt > 0) { h.hp += amt; ctx.emit('heal', { src: h.id, dst: h.id, amount: Math.round(amt * 10) / 10 }); }
  },
  mana(ctx, p, h, u) { h.mp = Math.min(h.mpMax, h.mp + h.mpMax * u.pct); },
  status(ctx, p, h, u) { addStatus(ctx, h, u.status, { ticks: secToTicks(u.seconds), power: statusPower(ctx.data, u.status, u.power), src: h.id }); },
  barrier(ctx, p, h, u) { addStatus(ctx, h, 'barrier', { ticks: secToTicks(u.seconds), power: h.hpMax * u.pct, src: h.id }); },
  recall(ctx, p, h) {
    const f = ctx.map.fields[ctx.state.teams[p.team].field];
    h.x = h.px = f.spawn.x; h.z = h.pz = f.spawn.z; h.field = f.id;
    h.target = -1; h._ord = { k: 'idle', x: 0, z: 0, target: -1, dir: 0, speed: 0 };
    ctx.emit('recall', { player: p.id, id: h.id, x: h.x, z: h.z });
  },
};

export function useRefusal(ctx, p, slot) {
  if (ctx.state.result) return 'over';
  if (!(slot >= 0 && slot < p.inv.length) || (slot | 0) !== slot || !p.inv[slot]) return 'bad';
  const def = itemDef(ctx.data, p.inv[slot].id);
  if (!def || !def.consumable) return 'notUsable';
  const h = heroOf(ctx, p);
  if (!h || !h.alive) return 'dead';
  if (ctx.state.tick < (p.useAt || 0)) return 'cooldown';
  return null;
}

export function useItem(ctx, p, slot) {
  const why = useRefusal(ctx, p, slot);
  if (why) return why;
  const it = p.inv[slot], def = itemDef(ctx.data, it.id), h = heroOf(ctx, p);
  for (const u of def.use) USE_EFFECTS[u.effect](ctx, p, h, u);
  it.charges--;
  p.useAt = ctx.state.tick + secToTicks(IB(ctx.data).rules.useCooldown);
  ctx.emit('use', { player: p.id, uid: it.uid, id: it.id, slot, left: it.charges });
  if (it.charges <= 0) { p.inv[slot] = null; bump(ctx, p); }
  return null;
}

/** Re-read hero numbers after an inventory change (max HP/MP). */
export function refreshFromGear(ctx, p) {
  refreshHero(ctx, p);
}

// ── drops (kept simple: a consumable now and then, an item for a champion kill) ──────────────────

function giveItem(ctx, p, id, how) {
  const def = itemDef(ctx.data, id);
  const slot = freeSlot(p);
  const it = { uid: ctx.state.nextItem++, id, charges: def.consumable ? def.charges : 0 };
  if (slot < 0 || (def.uniqueEquipped && carries(p, id))) {
    const gold = sellValue(ctx.data, it);
    p.gold += gold;
    ctx.emit('sell', { player: p.id, uid: it.uid, id, slot: -1, gold, name: def.name });
    return null;
  }
  p.inv[slot] = it;
  ctx.emit('item', { player: p.id, uid: it.uid, id, slot, how, name: def.name });
  bump(ctx, p);
  return it;
}

/** A unit died in a defending team's field: maybe hand a defender something. */
export function lootForKill(ctx, dead) {
  const { state, data } = ctx;
  const D = IB(data).drops;
  if (dead.kind !== 'unit' || !(dead._bounty > 0)) return;   // summons and tides drop nothing
  const team = state.teams[state.fields[dead.field].team];
  if (dead._traits && dead._traits.indexOf('champion') >= 0) {
    const pool = sortBy(Object.values(IB(data).items).filter(d => !d.consumable && d.price <= D.champion.maxPrice), d => d.id);
    for (const pid of team.players) {
      const pick = pool[int(state.rng.loot, pool.length)];
      const it = giveItem(ctx, state.players[pid], pick.id, 'champion');
      if (it) ctx.emit('drop', { player: pid, uid: it.uid, id: it.id, x: dead.x, z: dead.z });
    }
    return;
  }
  const tier = data.units.units[dead.type] ? data.units.units[dead.type].tier : 0;
  if (tier < D.minTier || next(state.rng.loot) >= D.chance) return;
  // nearest defending hero within 20 m gets it
  let who = null, bd = 400;
  for (const pid of team.players) {
    const h = liveEnt(state, state.players[pid].heroEnt);
    if (h) { const d = dist2(h.x, h.z, dead.x, dead.z); if (d < bd) { bd = d; who = state.players[pid]; } }
  }
  if (!who || freeSlot(who) < 0) return;
  const id = D.pool[int(state.rng.loot, D.pool.length)];
  const it = giveItem(ctx, who, id, 'drop');
  if (it) ctx.emit('drop', { player: who.id, uid: it.uid, id, x: dead.x, z: dead.z });
}

// ── hooks the core still calls (no procs in the simple item set; kept so effects can return) ────

/** A hero landed a basic attack: item on-hit effects would run here (none yet). */
export function onBasicHit() {}
/** A hero cast a skill: item cast effects would multiply here (none yet). */
export function castPowerMult() { return 1; }
/** Old set bonus hook: always 1 now. */
export function nearKeepFactor() { return 1; }
/** Toll of Iron charges a team holds at most. */
export function tollMax(ctx) { return IB(ctx.data).toll.charges; }

/** Damage factor from items for one blow (spell power out, magic resist in). Called by dealDamage. */
export function itemDamageFactor(ctx, src, dst, dmgType, opts) {
  let f = 1;
  const { state, data } = ctx;
  if (src && src.kind === 'hero' && opts.skill && !opts.reflected) {
    const sp = gearStats(data, state.players[src.owner]).spellPower;
    if (sp) f *= 1 + sp / 100;
  }
  if (dst.kind === 'hero' && (dmgType === 'fire' || dmgType === 'nature')) {
    const mr = gearStats(data, state.players[dst.owner]).magicResist;
    if (mr) f *= 1 - mr / 100;
  }
  return f;
}
