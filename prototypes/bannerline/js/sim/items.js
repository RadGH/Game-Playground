// Inventory and equipment (PLAN §7): items are plain data on the player.
//
//   player.equip = { weapon, offhand, head, chest, hands, feet, neck, ring }   item | null
//   player.bag   = [12 x item | null]
//   item = { uid, slot, base, baseName, name, rarity, step, ilvl, kind, twoHanded,
//            affixes: [{ id, stat, value }], unique: id | null, set: id | null, price }
//
// Item power has two parts:
//   * its STEP (0..6): the shop ladder of PLAN §7.2 / econ.json items.tiers. A step's numbers are
//     cumulative (step k gives tiers[0..k]), exactly the econ model's "a step replaces the last".
//   * its AFFIXES (data/items-bl.json, 16 stats), rolled through js/sim/adapters/affixes.js with the
//     sim's loot / shop rng streams.
// Uniques carry a power (onHit / everyNthHit / everyNthCast) run here; the one set (Keepwarden's Kit)
// gives Toll of Iron charges and damage near your Keep.

import { secToTicks, liveEnt, addTimer } from './state.js';
import { next, int } from './rng.js';
import { rollAffix } from './adapters/affixes.js';
import { dist2 } from './mathx.js';
import { sortBy } from './order.js';
import { refreshHero } from './heroes.js';

export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'hands', 'feet', 'neck', 'ring'];
const ARMOUR_SLOTS = ['head', 'chest', 'hands', 'feet'];

const IB = data => data['items-bl'];

export function emptyEquip() { const e = {}; for (const s of SLOTS) e[s] = null; return e; }

/** The kind (armour tier / hero) a slot's base is keyed by for this player. */
export function kindFor(data, p, slot, kind) {
  if (slot === 'weapon' || slot === 'offhand') return p.hero;
  if (slot === 'neck' || slot === 'ring') return 'any';
  return kind || IB(data).heroKind[p.hero] || 'light';
}

/** Can this hero use this slot at all (a druid has no off-hand base)? */
export function slotUsable(data, p, slot) {
  const b = IB(data).bases[slot][kindFor(data, p, slot)];
  return !!b;
}

function rarityOfStep(data, step) { return IB(data).stepRarity[step] || 'normal'; }

/** Roll `n` distinct affixes allowed on `slot`, values by item level. */
export function rollAffixes(data, slot, ilvl, n, stream) {
  const pool = IB(data).affixes.filter(a => !a.slots || a.slots.includes(slot));
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const k = int(stream, pool.length);
    const def = pool.splice(k, 1)[0];
    out.push({ id: def.id, stat: def.stat, value: rollAffix(def, ilvl, stream, IB(data).caps[def.stat]) });
  }
  return out;
}

function nameFor(data, baseName, affixes, stepName) {
  const defs = IB(data).affixes;
  const pre = affixes.map(a => defs.find(d => d.id === a.id)).find(d => d && d.kind === 'prefix');
  const suf = affixes.map(a => defs.find(d => d.id === a.id)).find(d => d && d.kind === 'suffix');
  if (!pre && !suf) return `${stepName} ${baseName}`;
  return [pre ? pre.name : null, baseName, suf ? suf.name : null].filter(Boolean).join(' ');
}

function stepPrice(data, step) { return data.econ.items.tiers[step].cost; }

/**
 * Make an item. opts: { slot, step, kind?, rarity?, unique?, set?, stream (rng) }
 * Shop steps 0-4 are plain; 5 and 6 are rare / legendary rolls (data stepRarity).
 */
export function makeItem(ctx, p, opts) {
  const { state, data } = ctx;
  const ib = IB(data);
  const slot = opts.slot;
  const step = Math.max(0, Math.min(data.econ.items.tiers.length - 1, opts.step));
  const ilvl = ib.stepIlvl[step];
  let rarity = opts.rarity || rarityOfStep(data, step);
  let baseName, base, twoHanded = false, unique = null, set = null, affixes, name;
  const kind = kindFor(data, p, slot, opts.kind);
  if (opts.unique) {
    const u = ib.uniques[opts.unique];
    baseName = u.baseName; base = u.base; twoHanded = u.twoHanded; unique = u.id; rarity = 'unique';
    affixes = rollAffixes(data, slot, ilvl, u.affixes, opts.stream);
    name = u.name;
  } else if (opts.set) {
    const b = ib.bases[slot][kind];
    baseName = b.name; base = b.id; set = ib.set.id; rarity = 'set';
    affixes = rollAffixes(data, slot, ilvl, ib.set.affixes, opts.stream);
    name = ib.set.pieces[slot];
  } else {
    const b = ib.bases[slot][kind];
    if (!b) return null;
    baseName = b.name; base = b.id; twoHanded = b.twoHanded;
    const n = ib.rarityAffixes[rarity] ?? 0;
    affixes = n ? rollAffixes(data, slot, ilvl, n, opts.stream) : [];
    name = nameFor(data, baseName, affixes, ib.stepNames[step]);
  }
  return {
    uid: state.nextItem++, slot, base, baseName, name, rarity, step, ilvl, kind: slot === 'weapon' || slot === 'offhand' ? 'any' : kind,
    twoHanded, affixes, unique, set, price: stepPrice(data, step),
  };
}

// ── stats ─────────────────────────────────────────────────────────────────────────────────────

export const STAT_IDS = ['dmgPct', 'attackSpeed', 'critChance', 'critDamage', 'lifeSteal', 'areaPct', 'vsChampion', 'cdr',
  'maxHp', 'armor', 'hpRegen', 'mana', 'manaRegen', 'moveSpeed', 'bountyPct', 'resistAll'];

// gearStats is read on every hit; it is cached per player object and invalidated by p.gearV, which
// every equipment change bumps (a WeakMap is not state: it never reaches a hash or a snapshot)
const CACHE = new WeakMap();
export function gearStats(data, p) {
  const c = CACHE.get(p);
  if (c && c.v === p.gearV && c.data === data) return c.out;
  const out = computeGear(data, p);
  CACHE.set(p, { v: p.gearV, data, out });
  return out;
}

/** Everything a player's equipment adds: step power + affix stats + set count + powers. */
function computeGear(data, p) {
  const T = data.econ.items.tiers;
  const out = { stepDps: 0, stepHp: 0, stepArmor: 0, setPieces: 0, powers: [] };
  for (const k of STAT_IDS) out[k] = 0;
  const eq = p.equip;
  if (!eq) return out;
  for (const slot of SLOTS) {
    const it = eq[slot];
    if (!it) continue;
    for (let i = 0; i <= it.step; i++) { out.stepDps += T[i].dps; out.stepHp += T[i].hp; out.stepArmor += T[i].armor; }
    for (const a of it.affixes) out[a.stat] += a.value;
    if (it.set) out.setPieces++;
    if (it.unique) out.powers.push(it.unique);
  }
  const caps = IB(data).caps;
  for (const k of Object.keys(caps)) if (out[k] > caps[k]) out[k] = caps[k];
  return out;
}

/** Active set bonus rows. */
export function setBonuses(data, p) {
  const n = gearStats(data, p).setPieces;
  return IB(data).set.bonuses.filter(b => n >= b.pieces);
}

/** The hero's armour class: its chest's kind (damage.json chestArmour), else the hero default. */
export function armourClassFor(data, p) {
  const ch = p.equip && p.equip.chest;
  if (ch && data.damage.chestArmour[ch.kind]) return data.damage.chestArmour[ch.kind];
  return data.heroes.heroes[p.hero].armourClass;
}

/** One number for "is this better": step power + weighted affixes. */
export function itemScore(data, it) {
  if (!it) return 0;
  const T = data.econ.items.tiers, W = IB(data).score.stats;
  let s = 0;
  for (let i = 0; i <= it.step; i++) s += T[i].dps * 100 * 6 + T[i].hp * 0.3 + T[i].armor * 5;
  for (const a of it.affixes) s += (W[a.stat] || 0) * a.value;
  if (it.unique) s += 40;
  if (it.set) s += 20;
  return Math.round(s * 10) / 10;
}

// ── commands ─────────────────────────────────────────────────────────────────────────────────

export function atArmory(ctx, p) {
  const h = ctx.state.ents.find(e => e.id === p.heroEnt);
  if (!h || !h.alive) return false;
  const a = ctx.map.fields[h.field].armory;
  return dist2(h.x, h.z, a.x, a.z) <= (a.r + 2) * (a.r + 2);
}

export function bagFree(p) { return p.bag.indexOf(null); }

function putInBag(ctx, p, it) {
  const i = bagFree(p);
  if (i < 0) return false;
  p.bag[i] = it;
  return true;
}

/** The highest shop step unlocked now. */
export function maxStep(state, data) {
  const T = data.econ.items.tiers;
  let s = -1;
  for (let i = 0; i < T.length; i++) if (state.tick >= secToTicks(T[i].unlock)) s = i;
  return s;
}

/** Why this shop purchase is refused, or null. */
export function buyRefusal(ctx, p, slot, step) {
  const { state, data } = ctx;
  if (state.result) return 'over';
  if (!SLOTS.includes(slot) || !slotUsable(data, p, slot)) return 'bad';
  const T = data.econ.items.tiers;
  if (!(step >= 0 && step < T.length)) return 'maxGear';
  if (state.tick < secToTicks(T[step].unlock)) return 'locked';
  if (p.gold < T[step].cost) return 'gold';
  return null;
}

/**
 * Buy a shop item. opts: { slot, step, kind?, equip (put it on when it arrives), replace (upgrade:
 * the item it replaces is consumed, as the econ model's step ladder assumes) }.
 * Away from the Armory it is a Requisition: it arrives after shop.requisition s, lost (refunded) if
 * the hero dies first.
 */
export function buyItem(ctx, p, opts) {
  const { state, data } = ctx;
  const why = buyRefusal(ctx, p, opts.slot, opts.step);
  if (why) return why;
  if (!opts.equip && bagFree(p) < 0) return 'bag';
  const cost = data.econ.items.tiers[opts.step].cost;
  const it = makeItem(ctx, p, { slot: opts.slot, step: opts.step, kind: opts.kind, stream: state.rng.shop });
  p.gold -= cost; p.stats.itemGold += cost;
  if (atArmory(ctx, p)) deliver(ctx, p, it, opts, 'buy');
  else {
    const at = state.tick + secToTicks(IB(data).shop.requisition);
    p.requisitions.push({ item: it, atTick: at, equip: !!opts.equip, replace: !!opts.replace, cost });
    addTimer(state, at, 'requisition', { player: p.id, uid: it.uid });
    ctx.emit('requisition', { player: p.id, uid: it.uid, atTick: at, name: it.name });
  }
  return null;
}

function deliver(ctx, p, it, opts, how) {
  if (opts.equip) {
    const old = p.equip[it.slot];
    // `upgrade` trades in a plain shop step (the econ model's ladder); anything special (a unique, a
    // set piece, a rolled or dropped item) goes back to the bag instead of vanishing
    if (opts.replace && old && old.rarity === 'normal' && !old.affixes.length) { p.equip[it.slot] = null; p.gearV = (p.gearV || 0) + 1; }
    ctx.emit('item', { player: p.id, uid: it.uid, how, name: it.name, rarity: it.rarity });
    if (!putInBag(ctx, p, it)) { p.bag.push(null); p.bag[p.bag.length - 1] = it; }   // never lose a bought item
    equipItem(ctx, p, it.uid, true);
    if (p.bag.length > IB(ctx.data).shop.bag) compactBag(ctx, p);
  } else {
    if (!putInBag(ctx, p, it)) { sellItemObj(ctx, p, it); return; }
    ctx.emit('item', { player: p.id, uid: it.uid, how, name: it.name, rarity: it.rarity });
  }
}

// a bag overfilled by a forced delivery: sell the worst until it fits
function compactBag(ctx, p) {
  const size = IB(ctx.data).shop.bag;
  while (p.bag.length > size) {
    const nullAt = p.bag.indexOf(null);
    if (nullAt >= 0) { p.bag.splice(nullAt, 1); continue; }
    let worst = 0;
    for (let i = 1; i < p.bag.length; i++) if (itemScore(ctx.data, p.bag[i]) < itemScore(ctx.data, p.bag[worst])) worst = i;
    const it = p.bag.splice(worst, 1)[0];
    sellItemObj(ctx, p, it);
  }
}

/** Timer: a requisitioned item arrives. */
export function requisitionArrives(ctx, args) {
  const p = ctx.state.players[args.player];
  const i = p.requisitions.findIndex(r => r.item.uid === args.uid);
  if (i < 0) return;   // cancelled
  const r = p.requisitions.splice(i, 1)[0];
  deliver(ctx, p, r.item, r, 'requisition');
}

/** The hero died: pending requisitions are lost and refunded. */
export function cancelRequisitions(ctx, p) {
  for (const r of p.requisitions) {
    p.gold += r.cost; p.stats.itemGold -= r.cost;
    ctx.emit('requisitionLost', { player: p.id, uid: r.item.uid, refund: r.cost });
  }
  p.requisitions.length = 0;
}

function findBag(p, uid) { return p.bag.findIndex(x => x && x.uid === uid); }

/** Equip a bag item; what it replaces goes back into its bag slot. Returns refusal or null. */
export function equipItem(ctx, p, uid, silent = false) {
  const i = findBag(p, uid);
  if (i < 0) return 'bad';
  const it = p.bag[i];
  if (!slotUsable(ctx.data, p, it.slot) && !it.unique) return 'bad';
  if (it.unique && ctx.data['items-bl'].uniques[it.unique].hero !== p.hero) return 'hero';
  const old = p.equip[it.slot];
  // a two-handed weapon needs the off-hand empty
  let off = null;
  if (it.slot === 'weapon' && it.twoHanded && p.equip.offhand) {
    off = p.equip.offhand;
    if (!old && bagFree(p) < 0) return 'bag';
  }
  if (it.slot === 'offhand' && p.equip.weapon && p.equip.weapon.twoHanded) return 'twoHanded';
  p.bag[i] = old;
  p.equip[it.slot] = it;
  p.gearV = (p.gearV || 0) + 1;
  if (off) {
    p.equip.offhand = null;
    const j = bagFree(p);
    if (j >= 0) p.bag[j] = off; else sellItemObj(ctx, p, off);
  }
  ctx.emit('equip', { player: p.id, uid: it.uid, slot: it.slot });
  refreshFromGear(ctx, p);
  return null;
}

export function unequipItem(ctx, p, slot) {
  if (!SLOTS.includes(slot) || !p.equip[slot]) return 'bad';
  const j = bagFree(p);
  if (j < 0) return 'bag';
  p.bag[j] = p.equip[slot];
  p.equip[slot] = null;
  p.gearV = (p.gearV || 0) + 1;
  ctx.emit('unequip', { player: p.id, slot });
  refreshFromGear(ctx, p);
  return null;
}

function sellItemObj(ctx, p, it) {
  const gold = Math.round(it.price * IB(ctx.data).shop.sellFactor);
  p.gold += gold;
  ctx.emit('sell', { player: p.id, uid: it.uid, gold, name: it.name });
  return gold;
}

export function sellItem(ctx, p, uid) {
  const i = findBag(p, uid);
  if (i < 0) return 'bad';
  const it = p.bag[i];
  p.bag[i] = null;
  sellItemObj(ctx, p, it);
  return null;
}

/** Re-read hero numbers and armour class after gear changes. */
export function refreshFromGear(ctx, p) {
  const h = ctx.state.ents.find(e => e.id === p.heroEnt);
  if (h) h.armour = armourClassFor(ctx.data, p);
  refreshHero(ctx, p);
}

// ── shop helpers for upgrade / recommended ─────────────────────────────────────────────────

/** The next step for a slot (above what is equipped), or null. */
export function nextStepFor(state, data, p, slot) {
  if (!slotUsable(data, p, slot)) return null;
  const cur = p.equip[slot];
  const step = cur ? cur.step + 1 : 0;
  const T = data.econ.items.tiers;
  if (step >= T.length) return null;
  return { slot, step, cost: T[step].cost, unlockTick: secToTicks(T[step].unlock), unlocked: state.tick >= secToTicks(T[step].unlock) };
}

/** Cheapest unlocked next step over every slot (lowest slot index wins ties). */
export function cheapestNext(state, data, p) {
  let best = null;
  for (const s of SLOTS) {
    const n = nextStepFor(state, data, p, s);
    if (n && n.unlocked && (!best || n.cost < best.cost)) best = n;
  }
  return best;
}

// ── drops, the champion pick ─────────────────────────────────────────────────────────────────

function rollRarity(data, stream, table) {
  let total = 0;
  for (const k of Object.keys(table)) total += table[k];
  let r = next(stream) * total;
  for (const k of Object.keys(table)) { r -= table[k]; if (r < 0) return k; }
  return 'normal';
}

/** Roll a random item for a player at a step (any usable slot). */
export function randomItem(ctx, p, step, rarity) {
  const { state, data } = ctx;
  const usable = SLOTS.filter(s => slotUsable(data, p, s));
  const slot = usable[int(state.rng.loot, usable.length)];
  if (rarity === 'unique') {
    const mine = sortBy(Object.values(IB(data).uniques).filter(u => u.hero === p.hero), u => u.id);
    if (mine.length) return makeItem(ctx, p, { slot: 'weapon', step, unique: mine[int(state.rng.loot, mine.length)].id, stream: state.rng.loot });
  }
  if (rarity === 'set') return makeItem(ctx, p, { slot: ['head', 'hands', 'feet'][int(state.rng.loot, 3)], step, set: true, stream: state.rng.loot });
  return makeItem(ctx, p, { slot, step, rarity, stream: state.rng.loot });
}

/** A unit died in a defending team's field: maybe drop an item, or open the champion pick. */
export function lootForKill(ctx, dead) {
  const { state, data } = ctx;
  const D = IB(data).drops;
  const team = state.teams[state.fields[dead.field].team];
  if (dead._traits && dead._traits.indexOf('champion') >= 0) {
    for (const pid of team.players) openPick(ctx, state.players[pid]);
    return;
  }
  if (dead.kind === 'unit' && !(dead._bounty > 0)) return;   // summoned bodies (raise, pack_call) drop nothing
  const tier = dead.kind === 'tide' ? 0 : data.units.units[dead.type].tier;
  const chance = dead.kind === 'tide' ? D.tide : (D.byTier[tier] || 0);
  if (!(chance > 0) || next(state.rng.loot) >= chance) return;
  // nearest defending hero within 20 m, else the defender with the most bag room
  let who = null, bd = 400;
  for (const pid of team.players) {
    const h = liveEnt(state, state.players[pid].heroEnt);
    if (h) { const d = dist2(h.x, h.z, dead.x, dead.z); if (d < bd) { bd = d; who = state.players[pid]; } }
  }
  if (!who) who = sortBy(team.players.map(pid => state.players[pid]), q => -q.bag.filter(x => !x).length)[0];
  const step = Math.max(0, maxStep(state, data) + D.stepOffset);
  const rarity = rollRarity(data, state.rng.loot, D.rarity);
  const it = randomItem(ctx, who, step, rarity);
  if (!it) return;
  ctx.emit('drop', { player: who.id, uid: it.uid, x: dead.x, z: dead.z, rarity: it.rarity, name: it.name, better: Math.round((itemScore(data, it) - itemScore(data, who.equip[it.slot])) * 10) / 10 });
  if (!putInBag(ctx, who, it)) sellItemObj(ctx, who, it);
}

/** Champion kill: a 3-card pick (one of each listed rarity) waits in player.pick until chosen. */
export function openPick(ctx, p) {
  const { state, data } = ctx;
  const P = IB(data).drops.pick;
  const step = Math.max(0, maxStep(state, data) + P.stepOffset);
  const cards = [];
  for (let i = 0; i < P.cards; i++) cards.push(randomItem(ctx, p, step, P.rarity[i % P.rarity.length]));
  p.picks.push(cards.filter(Boolean));
  ctx.emit('pickOffer', { player: p.id, cards: p.picks[p.picks.length - 1].map(c => c.uid) });
}

export function choosePick(ctx, p, index) {
  if (!p.picks.length) return 'bad';
  const cards = p.picks[0];
  if (!(index >= 0 && index < cards.length)) return 'bad';
  if (bagFree(p) < 0) return 'bag';
  p.picks.shift();
  const it = cards[index];
  putInBag(ctx, p, it);
  ctx.emit('item', { player: p.id, uid: it.uid, how: 'pick', name: it.name, rarity: it.rarity });
  return null;
}

// ── unique powers + set bonuses (hooks called from combat.js / skills.js) ────────────────────

function powersOf(data, p) {
  const out = [];
  for (const id of gearStats(data, p).powers) out.push(IB(data).uniques[id]);
  return out;
}

/** A hero landed a basic attack on `target`. */
export function onBasicHit(ctx, hero, target, api) {
  const p = ctx.state.players[hero.owner];
  for (const u of powersOf(ctx.data, p)) {
    const pw = u.power;
    if (pw.onHit && target.alive && !target._gone) api.applyStatus(ctx, hero, target, pw.onHit.status, api.weaponHit(ctx, hero), { add: pw.onHit.add, perSecond: pw.onHit.perSecond });
    if (pw.everyNthHit) {
      p.procs[u.id] = (p.procs[u.id] || 0) + 1;
      if (p.procs[u.id] % pw.everyNthHit.n === 0) {
        ctx.emit('power', { player: p.id, unique: u.id });
        if (pw.everyNthHit.selfStatus) api.addStatus(ctx, hero, pw.everyNthHit.selfStatus, { ticks: secToTicks(pw.everyNthHit.seconds), power: ctx.data.heroes.statuses[pw.everyNthHit.selfStatus].move || 0, src: hero.id });
        if (pw.everyNthHit.around) api.pulseAround(ctx, hero, { radius: pw.everyNthHit.around.radius, mult: pw.everyNthHit.around.mult, skill: u.id });
      }
    }
  }
}

/** A hero cast a skill: returns the damage multiplier from cast-counting powers. */
export function castPowerMult(ctx, hero) {
  const p = ctx.state.players[hero.owner];
  let m = 1;
  for (const u of powersOf(ctx.data, p)) {
    const pw = u.power.everyNthCast;
    if (!pw) continue;
    p.procs[u.id] = (p.procs[u.id] || 0) + 1;
    if (p.procs[u.id] % pw.n === 0) { m *= pw.mult; ctx.emit('power', { player: p.id, unique: u.id }); }
  }
  return m;
}

/** Set bonus: extra damage near your own Keep. */
export function nearKeepFactor(ctx, hero) {
  const p = ctx.state.players[hero.owner];
  let f = 1;
  for (const b of setBonuses(ctx.data, p)) {
    if (!b.nearKeep) continue;
    const k = ctx.map.fields[hero.field].keep;
    if (dist2(hero.x, hero.z, k.x, k.z) <= b.nearKeep.radius * b.nearKeep.radius) f *= 1 + b.nearKeep.dmgPct / 100;
  }
  return f;
}

/** Toll of Iron charges a team holds at most. */
export function tollMax(ctx, team) {
  let n = IB(ctx.data).toll.charges;
  for (const pid of team.players) for (const b of setBonuses(ctx.data, ctx.state.players[pid])) n += b.tollCharges || 0;
  return n;
}
