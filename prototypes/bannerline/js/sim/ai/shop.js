// Stream E — the AI at the Outfitter. Buying needs the hero inside the Outfitter's radius (a human
// walks there too); hero.js decides WHEN to walk over, this file decides WHAT to buy once there.
//
//   style 'impulse' (Recruit)   a draught, then whatever random item the fund covers; never sells
//   style 'value'   (Veteran)   a generic list of core stat items per kind of hero (VALUE_BUILDS),
//                               a draught once two pieces are carried; sells the cheapest piece for one
//                               1.5x dearer
//   style 'build'   (Commander) a planned build per hero (BUILDS), with one defensive piece chosen
//                               against the damage the enemy race actually sends (magic resist vs fire /
//                               nature senders, armour vs blades and arrows); draughts shrink as the
//                               slots fill; sells the cheapest piece for the next build step
//
// Everything goes out as `buy` / `sell` commands; refusals are checked first so the AI never sends an
// illegal command.

import { next, int } from '../rng.js';
import { itemDef, atShop, carries, buyRefusal } from '../items.js';

/** Commander builds: the order a sharp player buys in. Duplicates are intended (every copy counts). */
export const BUILDS = {
  warrior:    ['training_sword', 'leather_cap', 'longsword', '@def', 'bloodletter', 'plate_harness', 'reavers_greataxe', 'warhammer', 'kingsbane', 'bannerguard_aegis'],
  ranger:     ['light_spear', 'hunting_bow', 'quicksilver_charm', '@def', 'windstring_bow', 'reavers_greataxe', 'windstring_bow', 'kingsbane', 'reavers_greataxe'],
  pyromancer: ['copper_ring', 'apprentice_wand', 'tome_of_kindling', '@def', 'sages_amulet', 'archmage_staff', 'starweave_hat', 'archmage_staff', 'sigil_of_the_long_night'],
  druid:      ['copper_ring', 'apprentice_wand', 'ring_of_vigour', 'tome_of_kindling', '@def', 'grove_staff', 'archmage_staff', 'heart_of_the_mountain', 'sigil_of_the_long_night'],
  engineer:   ['training_sword', 'leather_cap', 'longsword', '@def', 'iron_mace', 'warhammer', 'reavers_greataxe', 'kingsbane', 'warhammer'],
};
// Veteran: one generic list per kind of hero (no reading of the enemy race, no per-hero plan) — the
// core stat items a decent player buys first, in order
export const VALUE_BUILDS = {
  fighter: ['training_sword', 'leather_cap', 'longsword', 'chainmail', 'warhammer', 'plate_harness', 'reavers_greataxe', 'warhammer'],
  caster: ['apprentice_wand', 'copper_ring', 'tome_of_kindling', 'ring_of_vigour', 'archmage_staff', 'plate_harness', 'archmage_staff'],
};
const CASTERS = { pyromancer: true, druid: true };
const HEALS = ['greater_draught', 'healing_draught'];

/** Inventory slot of the best healing draught carried, or -1. */
export function healSlot(p) {
  for (const id of HEALS) { const i = p.inv.findIndex(it => it && it.id === id); if (i >= 0) return i; }
  return -1;
}
export function slotOf(p, id) { return p.inv.findIndex(it => it && it.id === id); }

const isGear = (data, it) => it && !itemDef(data, it.id).consumable;

/** The defensive piece against what the enemy race sends into my field. */
export function defensivePick(ctx, p) {
  const { state, data } = ctx;
  let magic = 0, phys = 0;
  for (const pid of state.teams[1 - p.team].players) {
    for (const uid of data.races.races[state.players[pid].race].units) {
      const u = data.derived.units[uid];
      if (u.dmg === 'fire' || u.dmg === 'nature') magic += u.tier; else phys += u.tier;
    }
  }
  const caster = !!CASTERS[p.hero];
  if (magic / (magic + phys) >= 0.3) return caster ? 'warded_robe' : 'heater_shield';
  return p.hero === 'warrior' ? 'chainmail' : caster ? 'ring_of_vigour' : 'leather_armour';
}

/** The next item a Commander wants (or null when the build is done). */
export function nextBuildItem(ctx, p) {
  const { data } = ctx;
  const plan = (BUILDS[p.hero] || BUILDS.warrior).map(id => (id === '@def' ? defensivePick(ctx, p) : id));
  // walk the plan, crossing off what is carried (with multiplicity)
  const have = {};
  for (const it of p.inv) if (isGear(data, it)) have[it.id] = (have[it.id] || 0) + 1;
  for (const id of plan) {
    if (have[id] > 0) { have[id]--; continue; }
    const def = itemDef(data, id);
    if (!def || (def.uniqueEquipped && carries(p, id))) continue;
    return def;
  }
  return null;
}

/** The next item on a list the player does not carry yet (with multiplicity), or null. */
function nextOnList(ctx, p, list) {
  const { data } = ctx;
  const have = {};
  for (const it of p.inv) if (isGear(data, it)) have[it.id] = (have[it.id] || 0) + 1;
  for (const id of list) {
    if (have[id] > 0) { have[id]--; continue; }
    const def = itemDef(data, id);
    if (def && !(def.uniqueEquipped && carries(p, id))) return def;
  }
  return null;
}
/** The Veteran's next core item. */
export function nextValueItem(ctx, p) { return nextOnList(ctx, p, VALUE_BUILDS[CASTERS[p.hero] ? 'caster' : 'fighter']); }

/** What the AI should buy / sell while at the Outfitter. Returns { cmds, spent }. */
export function shopAtOutfitter(ctx, p, K, rng, fund) {
  const { data } = ctx;
  const cmds = [], spent = { v: 0 };
  if (!atShop(ctx, p)) return { cmds, spent: 0 };
  const inv = p.inv.map(it => (it ? { ...it } : null));
  let gold = p.gold;
  const sim = { ...p, inv, get gold() { return gold; } };
  const free = () => inv.indexOf(null);
  const buy = id => {
    const def = itemDef(data, id);
    if (buyRefusal(ctx, { ...p, inv, gold }, id)) return false;
    cmds.push({ type: 'buy', id }); inv[free()] = { id, charges: def.charges || 0 };
    gold -= def.price; spent.v += def.price; fund -= def.price;
    return true;
  };
  const sell = slot => { cmds.push({ type: 'sell', slot }); inv[slot] = null; };
  const count = id => inv.filter(it => it && it.id === id).length;
  const gearCount = () => inv.filter(it => isGear(data, it)).length;
  const style = K.shop.style;

  if (style === 'impulse') {
    if (count('healing_draught') < 1 && gold >= 40) buy('healing_draught');
    if (fund >= 80 && next(rng) < 0.6) {
      const items = Object.values(data['items-bl'].items).filter(d => !d.consumable && d.price <= Math.min(fund, gold));
      if (items.length) buy(items[int(rng, items.length)].id);
    }
    return { cmds, spent: spent.v };
  }

  if (style === 'value') {
    // core stat items first (measured: draughts and a Scroll of Return first left no gold for gear,
    // and the gear is what holds the gate); a draught only once two pieces are carried
    for (let guard = 0; guard < 3; guard++) {
      const want = nextValueItem(ctx, { ...p, inv });
      if (!want || want.price > Math.min(gold, fund + 40)) break;
      if (free() < 0) {
        let worst = -1;
        inv.forEach((it, i) => { if (it && (worst < 0 || itemDef(data, it.id).price < itemDef(data, inv[worst].id).price)) worst = i; });
        if (worst < 0 || itemDef(data, inv[worst].id).price * 1.5 > want.price) break;
        sell(worst);
      }
      if (!buy(want.id)) break;
    }
    if (gearCount() >= 2 && count('healing_draught') < 1 && free() >= 0 && fund >= 40 && gold >= 40) buy('healing_draught');
    return { cmds, spent: spent.v };
  }

  // 'build' (Commander)
  const sellCheapest = minPrice => {
    let worst = -1;
    inv.forEach((it, i) => { if (it && (worst < 0 || itemDef(data, it.id).price < itemDef(data, inv[worst].id).price)) worst = i; });
    if (worst >= 0 && itemDef(data, inv[worst].id).price * 1.8 <= minPrice) { sell(worst); return true; }
    return false;
  };
  for (let guard = 0; guard < 4; guard++) {
    const want = nextBuildItem(ctx, { ...p, inv });
    if (!want || want.price > Math.min(gold, fund + 40)) break;
    if (free() < 0 && !sellCheapest(want.price)) break;
    if (!buy(want.id)) break;
  }
  // draughts in whatever slots the build does not need yet
  const gear = gearCount();
  const draughts = gear <= 4 ? 1 : 0;
  const pot = gold >= 900 ? 'greater_draught' : 'healing_draught';
  // (draughts come out of the item fund too: a draught that is never needed is a send not made)
  while (count('healing_draught') + count('greater_draught') < draughts && free() >= 0 && fund >= itemDef(data, pot).price && gold >= itemDef(data, pot).price) if (!buy(pot)) break;
  if (free() >= 0 && count('mana_tonic') < 1 && CASTERS[p.hero] && gear >= 2 && gear <= 4 && fund >= 50) buy('mana_tonic');
  return { cmds, spent: spent.v };
}

/** Use a consumable when it is needed (draughts, tonic). Returns a command or null. */
export function drinkCommand(ctx, p, K, hero) {
  const { state } = ctx;
  if (!hero || state.tick < (p.useAt || 0)) return null;
  const hp = hero.hp / hero.hpMax;
  if (hp < K.hero.potionAt) {
    // the big draught when it has gone badly, the small one otherwise
    const big = slotOf(p, 'greater_draught'), small = slotOf(p, 'healing_draught');
    const s = hp < 0.25 && big >= 0 ? big : small >= 0 ? small : big;
    if (s >= 0) return { type: 'use', slot: s };
  }
  if (K.hero.tier >= 2 && hero.mpMax > 0 && hero.mp / hero.mpMax < 0.15) {
    const s = slotOf(p, 'mana_tonic');
    if (s >= 0) return { type: 'use', slot: s };
  }
  return null;
}
