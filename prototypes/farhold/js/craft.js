// Farhold — crafting, and the materials bag it runs on.
//
// The rule this bench was built to: **every material comes out of an item you recycled, or off
// something that was hard to kill.** That made the bench part of the loot loop rather than a second
// game bolted on: a bad rare is not rubbish, it is four Bound Essence.
//
// BUILDING_EXPANSION §3.8 folds the rest of the world in beside it rather than replacing it.
// Farhold now digs ore, fells trees and smelts ingots (js/resources.js, js/refine.js), so recycled
// gear is **one input among several** — not the only one, and still the best one for the three
// magical materials, because nothing you dig out of the ground grinds into Resonant Dust.
//
// What that means in code is one small change and no rewrite: the bench pays for a recipe out of a
// SUPPLY rather than straight out of the bag. The supply is the materials bag first (it is in your
// pockets, it costs nothing to reach) and then the storage pool the bench is standing in (§3.11 —
// craft from storage: if a store is in range you do not have to carry the parts). Everything else
// about the bench — quotes, rerolls, promotion, the forge — is untouched.
//
// The shape of the bench is borrowed (in idea, not in name) from the trading-card-style crafting of
// the big loot ARPGs: single-property rerolls, a rarity ladder you promote up, a full recast that is
// a gamble, and element brands that need a component you only get from the thing that element came
// from. More advanced work costs rarer components — that is the whole progression.
//
//   import { createCrafting } from './craft.js';
//   const craft = createCrafting({ data, rpg, materials });                    // bag only
//   const craft = createCrafting({ data, rpg, materials, stores, resources, bench });  // and the store pool
//   craft.recycle(item);                  // item -> materials
//   craft.quote('reweave', item, { index: 2 });
//   craft.apply('reweave', item, { index: 2 });
//
// Pure: no DOM, no Three.js. The crafting tab in hud.js only draws what `quote()` says.

import { mat } from '../../../shared/format.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { GEAR_BASES, createGearShop } from './gear.js';
/**
 * R18 — Farhold's own affix roller and weapon attuner.
 *
 * `rpg.loot.rollValue` is EMBERVEIL's: a flat roll between the affix's min and max, with no item
 * level in it at all. `Rpg.itemLevels()` wraps `loot.pool` and `loot.generate` so drops are tiered,
 * and it does NOT wrap `rollValue` — so every reroll on this bench threw the tier away. Measured on
 * a level-45 rare (ilvl 47, mythic tier): `sturdy 16.3 -> 3.21`, `execute 0.92 -> 0.23`. The
 * "cheap, safe way to fix a bad roll" was a guaranteed downgrade.
 */
import { rollAffixValue } from './affixes.js';
import { attuneWeapon } from './rpg.js';

/**
 * The materials bag. Separate from the item bag on purpose — the user asked for it, and it is
 * right: materials are a currency, not luggage. **There is no cap on any of it.**
 */
export class Materials {
  constructor(initial = {}) { this.held = { ...initial }; }

  count(id) { return this.held[id] || 0; }
  add(id, n = 1) { if (n > 0) this.held[id] = (this.held[id] || 0) + n; return this.held[id] || 0; }
  addAll(bag) { for (const [id, n] of Object.entries(bag || {})) this.add(id, n); return this.held; }
  /** True when every line of `cost` is covered. */
  canAfford(cost) { return Object.entries(cost || {}).every(([id, n]) => this.count(id) >= n); }
  /** Take a cost. Returns false and changes nothing when it cannot be paid. */
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [id, n] of Object.entries(cost || {})) this.held[id] -= n;
    return true;
  }
  /** What is missing, for the "needs 3 more Resonant Dust" line on the button. */
  missing(cost) {
    const out = {};
    for (const [id, n] of Object.entries(cost || {})) {
      const short = n - this.count(id);
      if (short > 0) out[id] = short;
    }
    return out;
  }
  toJSON() { return { ...this.held }; }
  static from(json) { return new Materials(json || {}); }
}

const RARITY = ['normal', 'magic', 'rare', 'legendary'];
const rarityAt = r => Math.max(0, RARITY.indexOf(r));

/** Bases a plain forge can make, by what the recipe says it makes. */
const FORGE_POOLS = {
  weapon: ['dagger', 'sword', 'rapier', 'hammer', 'saber', 'shortbow', 'bow', 'wand', 'scepter', 'staff', 'quarterstaff'],
  armour: ['cloth_helm', 'light_helm', 'medium_helm', 'heavy_helm', 'cloth_chest', 'light_chest', 'medium_chest', 'heavy_chest', 'light_legs', 'medium_legs', 'heavy_legs', 'light_gauntlets', 'medium_gauntlets', 'heavy_gauntlets', 'light_boots', 'medium_boots', 'heavy_boots'],
  trinket: ['ring', 'necklace', 'gold_signet', 'silver_amulet'],
  /**
   * Quivers at the bench. "To crafting menus, add Quivers."
   *
   * They are not in `items.json` — they are a Farhold base from `js/gear.js` — so the forge has to
   * build them through the gear shop's own maker rather than through `loot.generate`. Everything
   * downstream is the same item either way: it prices, upgrades, recycles and describes itself like
   * anything else you could have found.
   */
  quiver: ['quiver', 'quiver_ember', 'quiver_rime', 'quiver_split', 'quiver_seeker', 'quiver_burst'],
};

/**
 * `stores` is a js/stores.js network and `bench` is where the bench stands ({ x, z }) — together
 * they are §3.11's craft-from-storage. `resources` is data/resources.json, so an ingot or a plank
 * spent at the anvil prints with its own name rather than its id. All three are optional: without
 * them this is exactly the bench it always was, paying out of the bag in your pockets.
 */
export function createCrafting({ data, rpg, materials = new Materials(), rng = makeRng(7), stores = null, bench = null, resources = null }) {
  /**
   * R19 — `stores` MAY BE A FUNCTION, AND FROM js/main.js IT IS.
   *
   * The store pool half of this file was written in round 14 and never once ran, because main.js
   * built the bench at line 635 and the store network at line 2306 — so it called
   * `createCrafting({ data, rpg, materials, rng })` with none of `stores`, `resources` or `bench`,
   * and `poolHere()` returned null forever. Crafting from a nearby crate was dead, and `M` lost
   * `resources.materials`, which is why a refined material showed up in the bench and the
   * inventory as a raw id ("iron_ingot" rather than "Iron Ingot").
   *
   * Same answer js/command.js reached for the same reason: never hold the reference, ask for it.
   * The network is also rebuilt when you land on a new world, so holding the first one would have
   * been a bug even with the ordering right.
   */
  const deref = v => (typeof v === 'function' ? v() : v);
  const theStores = () => deref(stores);

  // the same maker the shops use, so a forged quiver and a bought one are the same kind of thing
  const gearShop = createGearShop({ rpg });
  // the bench knows the names of both halves of the economy: the three recycled materials, and
  // everything js/refine.js makes
  const M = { ...(deref(resources)?.materials || {}), ...(data.materials || {}) };
  const recipes = data.recipes || [];
  const bandCost = data.bandCost || [1];

  // ---------------------------------------------------------------- the supply
  //
  // Where a recipe's cost is paid from. The bag first — it is in your pockets and costs nothing to
  // reach — and then whatever store pool the bench is standing in. Two sources, one interface, so
  // nothing downstream (quote, apply, the buttons) had to learn about either of them.
  let benchAt = bench;
  const poolHere = () => {
    const net = theStores();
    return net && benchAt ? net.poolAt(benchAt.x ?? 0, benchAt.z ?? 0) : null;
  };

  const supply = {
    /** How much of one thing the bench can reach, bag and pool together. */
    count(id) {
      const pool = poolHere();
      return materials.count(id) + (pool ? theStores().count(pool, id) : 0);
    },
    /** What is short, for the "needs 3 more Resonant Dust" line on the button. */
    missing(cost) {
      const out = {};
      for (const [id, n] of Object.entries(cost || {})) {
        const short = n - supply.count(id);
        if (short > 0) out[id] = short;
      }
      return out;
    },
    /** Take the whole cost or nothing. Bag first, then the pool tops up whatever is left. */
    spend(cost) {
      if (Object.keys(supply.missing(cost)).length) return false;
      const pool = poolHere();
      for (const [id, n] of Object.entries(cost || {})) {
        const fromBag = Math.min(n, materials.count(id));
        if (fromBag > 0) materials.spend({ [id]: fromBag });
        const left = n - fromBag;
        if (left > 0 && pool) theStores().take(pool, id, left);
      }
      return true;
    },
    /** Where the bench is, so the pool it reaches follows it about. */
    setBench(at) { benchAt = at; return benchAt; },
    get pool() { return poolHere(); },
  };

  /** How much dearer this item's level makes the work. */
  function band(item) {
    const level = item?.level || levelOf(item);
    return bandCost[Math.min(bandCost.length - 1, Math.floor((level - 1) / 5))] || 1;
  }
  /** Items do not carry a level, so read it off the quality ladder the generator used. */
  function levelOf(item) {
    const q = ['low', 'medium', 'high', 'elite', 'exotic'].indexOf(item?.quality || 'medium');
    return Math.max(1, q * 6 + 3);
  }

  /** Scale a cost table by the item's band, always rounding up so nothing is ever free. */
  function scaleCost(cost, item, extra = 1) {
    const k = band(item) * extra;
    const out = {};
    for (const [id, n] of Object.entries(cost || {})) out[id] = Math.max(1, Math.ceil(n * k));
    return out;
  }

  /** A plain-language line for a cost, for the button. */
  /**
   * R17 — A QUANTITY OF A MATERIAL IS PRINTED WITH ONE DECIMAL, NEVER RAW.
   *
   *   "Update all resources in chat and inventory to round to 1 decimal place. It can stay a float
   *    underlying. In the chat it showed some long string like 'you lack 6.000000000003 clay'."
   *
   * A gather pays `base * toolYield * richness`, so the stored amount genuinely is 6.000000000003 and
   * it should stay that way — what must never happen is printing it. `mat()` in shared/format.js is
   * the one rule, and this is the line the user was actually reading when they hit it.
   */
  function costText(cost) {
    return Object.entries(cost).map(([id, n]) => `${mat(n)} ${M[id]?.name || id}`).join(', ');
  }

  // ---------------------------------------------------------------- recycling

  /**
   * Break an item down. Rarity decides the main yield, the base's armour tier decides the
   * "what was it made of" yield, and quality adds a little on top.
   */
  function recycle(item) {
    if (!item) return {};
    const out = {};
    const roll = (table) => {
      for (const [id, [lo, hi]] of Object.entries(table || {})) {
        const n = lo + Math.floor(rng() * (hi - lo + 1));
        if (n > 0) out[id] = (out[id] || 0) + n;
      }
    };
    roll(data.salvage?.[item.rarity] || data.salvage?.normal);
    const base = rpg.loot.base(item.baseKey);
    if (base?.tier) roll(data.salvageByTier?.[base.tier]);
    // weapons have no armour tier, so they recycle by what they are made for instead
    else if (base) roll(data.salvageByCategory?.[base.ranged ? 'ranged' : (base.weaponCategory || 'light')]);
    // quality is worth something: an exotic normal still gives a couple of extra pieces
    const q = ['low', 'medium', 'high', 'elite', 'exotic'].indexOf(item.quality || 'medium');
    if (q > 1) out.scrap = (out.scrap || 0) + (q - 1);
    // a unique or set piece always leaves dust behind, whatever else it rolled
    if (item.isUnique || item.setId) out.dust = (out.dust || 0) + 1;
    materials.addAll(out);
    return out;
  }

  /** What a body leaves behind. Beasts give hide, the undead give bone, constructs give plate. */
  function harvest(enemy) {
    const out = {};
    const table = data.salvageByFamily?.[enemy.family] || {};
    for (const [id, [lo, hi]] of Object.entries(table)) {
      const n = lo + Math.floor(rng() * (hi - lo + 1));
      if (n > 0) out[id] = n;
    }
    // the rank is where the good material comes from: a champion is worth an essence, and a rare or
    // a boss is the only reliable source of dust in the field
    if (enemy.rank === 'champion') out.essence = (out.essence || 0) + 1 + Math.floor(rng() * 2);
    if (enemy.rank === 'rare') { out.essence = (out.essence || 0) + 2; out.dust = (out.dust || 0) + 1; }
    if (enemy.rank === 'boss') { out.essence = (out.essence || 0) + 4; out.dust = (out.dust || 0) + 2 + Math.floor(rng() * 3); }
    materials.addAll(out);
    return out;
  }

  // ---------------------------------------------------------------- the bench

  const byId = Object.fromEntries(recipes.map(r => [r.id, r]));

  /** Does this recipe apply to this item at all? */
  /**
   * R18 — DOES items.json KNOW WHAT THIS IS?
   *
   * A mount, a lantern, a quiver and a tool come out of `GEAR_BASES` in js/gear.js, deliberately —
   * they are Farhold's own and items.json is shared with Emberveil. But `promote`, `addAffix`,
   * `reroll`, `rerollAll` and `values` all go through Emberveil's loot module, which looks the base
   * up by key and reads `base.type` unguarded. For a gear base that lookup is `undefined` and the
   * recipe throws a TypeError.
   *
   * That mattered more than a crash usually does, because `apply` SPENDS THE MATERIALS at the top
   * and `promote` raises the rarity on the line before it throws: clicking Promote on a magic
   * lantern took 14 scrap and 9 essence, made it rare, and threw — and clicking again made it
   * legendary, with no new property and no message, because js/main.js has no try/catch around it.
   * js/hud.js puts every worn and carried item on the bench with no filter, so it was reachable
   * with the first lamp a merchant sells.
   *
   * Asked here, in `applies`, the button is simply greyed with a reason and nothing is spent.
   */
  const NEEDS_LOOT_BASE = ['promote', 'addAffix', 'reroll', 'rerollAll', 'values'];
  const hasLootBase = item => {
    if (!item?.baseKey) return false;
    try { return !!rpg.loot.base(item.baseKey); } catch { return false; }
  };

  /** Roll an affix the way a DROP of this item's level would — see the import note above. */
  const rollFor = (item, def, rand) => rollAffixValue(def, item?.ilvl || item?.levelReq || 1, rand);

  function applies(recipe, item, player) {
    if (recipe.kind === 'create') return true;
    if (!item) return false;
    if (NEEDS_LOOT_BASE.includes(recipe.kind) && !hasLootBase(item)) return false;
    /**
     * R18 — and Reinforce/Hone only mean something on a thing that HAS the number they raise.
     * `intrinsic` recipes add armour, and `recipe.slot === 'armour'` only excluded weapons — so a
     * ring, an amulet, a quiver, a lamp and a mount all passed, charged full price and did nothing.
     * Reproduced at three clicks and ~96 scrap on a level-20 rare ring.
     */
    if (recipe.kind === 'intrinsic' && recipe.stat === 'armor' && !(item.armor > 0)) return false;
    if (item.isUnique && ['reroll', 'rerollAll', 'promote', 'values'].includes(recipe.kind)) return false;
    if (recipe.minRarity && rarityAt(item.rarity) < rarityAt(recipe.minRarity)) return false;
    if (recipe.slot === 'weapon' && item.type !== 'weapon') return false;
    if (recipe.slot === 'armour' && item.type === 'weapon') return false;
    if (recipe.minLevel && (player?.level || 1) < recipe.minLevel) return false;
    return true;
  }

  /**
   * What a recipe would cost and do, without doing it. Every button on the crafting tab is drawn
   * from one of these, so a greyed-out button always has a reason next to it.
   */
  function quote(id, item, { index = 0, player = null } = {}) {
    const r = byId[id];
    if (!r) return { ok: false, why: 'There is no such recipe.' };
    if (!applies(r, item, player)) return { ok: false, why: whyNot(r, item, player) };

    let cost = r.cost, extra = 1, note = '';
    if (r.kind === 'promote') {
      const to = RARITY[rarityAt(item.rarity) + 1];
      if (!to) return { ok: false, why: 'This item is already legendary, which is the top rarity.' };
      cost = r.costByTarget?.[to] || r.cost;
      note = `${item.rarity} → ${to}`;
    }
    if (r.kind === 'quality') {
      const q = ['low', 'medium', 'high', 'elite', 'exotic'];
      const at = q.indexOf(item.quality || 'medium');
      if (at < 0 || at >= q.length - 1) return { ok: false, why: 'This item is already exotic quality, which is the best quality there is.' };
      note = `${item.quality} → ${q[at + 1]}`;
    }
    if (r.kind === 'reroll') {
      const a = (item.affixes || [])[index];
      if (!a) return { ok: false, why: 'Pick which property to replace first.' };
      if (!rpg.loot.rerollable(a)) return { ok: false, why: 'That line is part of the base item, not a rolled property.' };
      extra = Math.pow(r.growth || 1.4, item.reworks || 0);
      note = `Replaces "${a.name || a.stat}"`;
    }
    if (r.kind === 'addAffix') {
      const cap = { legendary: 6, rare: 4, magic: 2, normal: 0 }[item.rarity] || 0;
      const real = (item.affixes || []).filter(x => !x.baseIntrinsic).length;
      if (real >= cap) return { ok: false, why: `All ${cap} of this item's property slots are full. Reweave one of them instead.` };
      note = `${real} of ${cap} property slots used`;
    }
    if (r.kind === 'brand') {
      if ((item.affixes || []).some(a => a.stat === 'brand')) return { ok: false, why: 'This weapon already carries a brand.' };
      note = `Adds ${r.element} damage on every hit`;
    }
    if (r.kind === 'intrinsic') {
      const times = item.reinforced?.[r.stat] || 0;
      if (times >= 3) return { ok: false, why: 'This item has already been reinforced 3 times, which is the limit.' };
      extra = 1 + times;
      note = times ? `Done ${times} of 3 times` : 'Can be done up to 3 times';
    }
    if (r.kind === 'create') {
      cost = r.cost;
      extra = player ? (bandCost[Math.min(bandCost.length - 1, Math.floor(((player.level || 1) - 1) / 5))] || 1) : 1;
      const priced = {};
      for (const [k, n] of Object.entries(cost)) priced[k] = Math.max(1, Math.ceil(n * extra));
      const short = supply.missing(priced);
      return {
        ok: !Object.keys(short).length, recipe: r, cost: priced, costText: costText(priced),
        note: `${r.rarity} ${r.makes}, level ${player?.level || 1}`,
        why: Object.keys(short).length ? `The bench needs ${costText(short)} more than you have.` : null, short,
        // what fits on a button, so the reason is where the click is
        need: Object.keys(short).length ? `Need ${costText(short)}` : null,
      };
    }

    const priced = scaleCost(cost, item, extra);
    const short = supply.missing(priced);
    return {
      ok: !Object.keys(short).length, recipe: r, cost: priced, costText: costText(priced), note,
      why: Object.keys(short).length ? `The bench needs ${costText(short)} more than you have.` : null, short,
      need: Object.keys(short).length ? `Need ${costText(short)}` : null,
    };
  }

  function whyNot(r, item, player) {
    if (!item) return 'Pick an item first.';
    if (NEEDS_LOOT_BASE.includes(r.kind) && !hasLootBase(item)) {
      return 'The crafting bench cannot rework this kind of gear. Mounts, lights, quivers and tools are upgraded at their own bench.';
    }
    if (r.kind === 'intrinsic' && r.stat === 'armor' && !(item.armor > 0)) return 'This item has no armour value to reinforce.';
    if (item.isUnique) return 'A unique item cannot be reworked.';
    if (r.minRarity && rarityAt(item.rarity) < rarityAt(r.minRarity)) return `This recipe needs a ${r.minRarity} item or better.`;
    if (r.slot === 'weapon') return 'This recipe works on weapons only.';
    if (r.slot === 'armour') return 'This recipe works on armour only.';
    if (r.minLevel && (player?.level || 1) < r.minLevel) return `You must be level ${r.minLevel} to use this recipe.`;
    return 'This recipe cannot be applied to this item.';
  }

  /**
   * Do it. Changes the item IN PLACE (so every panel holding it shows the new one) and returns
   * what happened. Re-quotes first, so a stale button cannot spend materials it does not have.
   */
  function apply(id, item, { index = 0, player = null, baseKey = null, magicFind = 0 } = {}) {
    const q = quote(id, item, { index, player });
    if (!q.ok) return q;
    if (!supply.spend(q.cost)) return { ok: false, why: 'The materials for this recipe are no longer there.' };
    const r = q.recipe;

    if (r.kind === 'create') {
      const level = player?.level || 1;
      const allowed = forgeOptions(r, player).map(o => o.baseKey);
      // You pick the base. Rolling it at random meant spending a pile of material to be handed a
      // dagger you had no use for, which is not crafting, it is a slot machine.
      const key = baseKey && allowed.includes(baseKey) ? baseKey : allowed[Math.floor(rng() * allowed.length)];
      const rarity = forgeRarity(r.rarity, magicFind);
      // a quiver comes out of the gear catalogue; everything else out of items.json
      const made = GEAR_BASES[key]
        ? gearShop.make(key, rarity, level, rng)
        : rpg.loot.generate(key, rarity, rpg.qualityFor(level), { rng, level });
      /**
       * R18 — and a forged caster is ATTUNED, like everything else that makes a weapon.
       *
       * `rollDrop`, js/town.js's shop stock and js/classbuild.js's starter all call `attuneWeapon`;
       * the forge did not, and `FORGE_POOLS.weapon` contains wand, scepter and staff. A crafted
       * wand came out `ranged: false, castElement: undefined, element: physical`, with no bolt and
       * the whole weapon-description block missing from its card — a melee club with a wand's name.
       */
      if (made && made.type === 'weapon') attuneWeapon(made);
      if (made) made.crafted = true;
      const lucky = rarity !== r.rarity;
      return {
        ok: true, made, rarity, lucky,
        text: lucky ? `Forged ${made?.name} — and it came out ${rarity}.` : `Forged ${made?.name || 'nothing'}.`,
      };
    }

    if (r.kind === 'quality') {
      const qs = ['low', 'medium', 'high', 'elite', 'exotic'];
      const at = qs.indexOf(item.quality || 'medium');
      const to = qs[at + 1];
      const step = (rpg.items.qualityMult?.[to] ?? 1) / (rpg.items.qualityMult?.[item.quality || 'medium'] ?? 1);
      item.quality = to;
      if (item.dmg) item.dmg = item.dmg.map(v => Math.max(1, Math.round(v * step)));
      if (item.armor) item.armor = Math.max(1, Math.round(item.armor * step));
      // R25 — a marker (what the weapon is made of, a brand) is not a number to scale: `castElement`
      // went 1 → 1.43 → 1.72 → 2.01 across three tempers
      for (const a of item.affixes || []) if (typeof a.value === 'number' && a.stat !== 'castElement' && !a.brand) a.value = +(a.value * step).toFixed(2);
      return { ok: true, text: `Tempered to ${to} quality.` };
    }

    if (r.kind === 'promote') {
      const to = RARITY[rarityAt(item.rarity) + 1];
      item.rarity = to;
      // a promotion always comes with a new property, or the ladder means nothing.
      // (the material name here is Emberveil's internal tier key, not one of our three.)
      rpg.loot.addAffix(item, 'iron_scrap', { iron_scrap: 99 }, rng);
      rpg.loot.rename(item);
      return { ok: true, text: `Promoted to ${to}, and a new property was added.` };
    }

    if (r.kind === 'addAffix') {
      const before = (item.affixes || []).length;
      rpg.loot.addAffix(item, 'rare_dust', { rare_dust: 99 }, rng);
      const added = (item.affixes || [])[before];
      rpg.loot.rename(item);
      return { ok: true, affix: added, text: added ? `Inscribed: ${added.name || added.stat}.` : 'No new property would take.' };
    }

    if (r.kind === 'reroll') {
      const base = rpg.loot.base(item.baseKey);
      const pool = rpg.loot.pool(base, item.rarity).filter(a => !item.affixes.some(x => x.id === a.id));
      if (!pool.length) return { ok: false, why: 'There is no other property this item could carry.' };
      const pick = pool[Math.floor(rng() * pool.length)];
      const was = item.affixes[index];
      item.affixes[index] = { ...pick, value: rollFor(item, pick, rng), reworked: true };
      item.reworks = (item.reworks || 0) + 1;
      rpg.loot.rename(item);
      return { ok: true, was, now: item.affixes[index], text: `${was.name || was.stat} → ${pick.name || pick.stat}.` };
    }

    if (r.kind === 'rerollAll') {
      const base = rpg.loot.base(item.baseKey);
      const keep = item.affixes.filter(a => a.baseIntrinsic || a.setFixed || a.id === 'legendary_effect');
      const want = item.affixes.length - keep.length;
      const pool = rpg.loot.pool(base, item.rarity);
      const fresh = [];
      for (let i = 0; i < want && pool.length; i++) {
        const pick = pool[Math.floor(rng() * pool.length)];
        if (fresh.some(f => f.id === pick.id)) { i--; continue; }
        fresh.push({ ...pick, value: rollFor(item, pick, rng), reworked: true });
      }
      item.affixes = [...fresh, ...keep];
      item.reworks = (item.reworks || 0) + 1;
      rpg.loot.rename(item);
      return { ok: true, text: 'Recast — every rolled property on this item is new.' };
    }

    if (r.kind === 'values') {
      for (const a of item.affixes || []) {
        if (a.baseIntrinsic || a.min == null || a.max == null) continue;
        a.value = rollFor(item, a, rng);
      }
      return { ok: true, text: 'Every rolled property on this item has a new value.' };
    }

    if (r.kind === 'brand') {
      item.affixes.push({
        id: 'brand_' + r.element, name: `Brand of ${r.element}`, stat: 'brand',
        value: 1, element: r.element, baseIntrinsic: true, brand: true,
      });
      item.brand = r.element;
      return { ok: true, text: `Branded — this weapon now deals ${r.element} damage on every hit.` };
    }

    if (r.kind === 'intrinsic') {
      item.reinforced = item.reinforced || {};
      item.reinforced[r.stat] = (item.reinforced[r.stat] || 0) + 1;
      if (r.stat === 'armor' && item.armor) item.armor = Math.round(item.armor * (1 + r.value));
      if (r.stat === 'dmg' && item.dmg) item.dmg = item.dmg.map(v => Math.max(1, Math.round(v * (1 + r.value))));
      return {
        ok: true,
        text: r.stat === 'armor'
          ? `Reinforced — this item's armour is ${Math.round(r.value * 100)}% higher.`
          : `Honed — this weapon's damage is ${Math.round(r.value * 100)}% higher.`,
      };
    }

    return { ok: false, why: 'That recipe does nothing yet.' };
  }

  /**
   * What a `create` recipe could make, at this player's level. The crafting tab lists these and the
   * player picks one; `canUse` says whether their class can actually hold it, so a mage is warned
   * before spending twelve Scrap Iron on a warhammer.
   */
  function forgeOptions(recipe, player = null) {
    const pool = FORGE_POOLS[recipe.makes] || [...FORGE_POOLS.weapon, ...FORGE_POOLS.armour, ...FORGE_POOLS.trinket];
    const level = player?.level || 1;

    // a quiver is a Farhold base rather than an items.json one, so it is listed straight from the
    // gear catalogue — there is no act table to filter it through
    if (recipe.makes === 'quiver') {
      return pool.map(baseKey => {
        const base = GEAR_BASES[baseKey];
        if (!base) return null;
        return {
          baseKey, name: base.name, type: base.type, slot: base.slot,
          tier: 'quiver', dmg: null, armor: null,
          arrowDamage: base.arrowDamage || 0,
          twoHanded: false, ranged: false, canUse: true,
          desc: base.lore,
        };
      }).filter(Boolean);
    }

    const allowed = rpg.loot.basesForAct(pool, Math.ceil(level / 5));
    return allowed.map(baseKey => {
      const base = rpg.loot.base(baseKey);
      if (!base) return null;
      const weapons = player?.weapons || null;
      const canUse = base.type !== 'weapon' || !weapons?.length
        || weapons.includes(base.subtype) || weapons.includes(baseKey);
      return {
        baseKey, name: base.name, type: base.type,
        slot: base.slot || 'weapon', tier: base.tier || base.weaponCategory || '',
        dmg: base.dmg || null, armor: base.armor ?? null,
        twoHanded: !!base.twoHanded, ranged: !!base.ranged, canUse,
      };
    }).filter(Boolean);
  }

  /**
   * What rarity a forge comes out at. It starts where the recipe says and then rolls upward, the
   * same way a drop does — so magic find is worth having at the bench as well as in the field.
   */
  function forgeRarity(from, magicFind = 0) {
    let at = rarityAt(from);
    const step = 0.12 * (1 + magicFind / 100);
    while (at < RARITY.length - 1 && rng() < step) at++;
    return RARITY[at];
  }

  /** Every recipe, with a live quote against the item on the bench. For the crafting tab. */
  function board(item, player) {
    return recipes.map(r => ({ ...r, quote: quote(r.id, item, { player }) }));
  }

  return {
    materials, recipes, byId, M,
    recycle, harvest, quote, apply, board, costText, forgeOptions, forgeRarity,
    /** Bag + store pool, as one thing to ask. §3.8 and §3.11 in six lines. */
    supply,
    /** Move the bench (or tell it which anvil you are standing at) so it draws from that pool. */
    setBench: at => supply.setBench(at),
    groups: data.groups || {},
    /** The two halves of the bench: what makes something new, and what reworks what you have. */
    creates: recipes.filter(r => r.kind === 'create'),
    upgrades: recipes.filter(r => r.kind !== 'create'),
    /** Every upgrade recipe, grouped the way the Upgrade tab lists them, quoted against `item`. */
    upgradeBoard(item, player) {
      const out = new Map();
      for (const r of recipes) {
        if (r.kind === 'create') continue;
        const key = r.group || 'other';
        if (!out.has(key)) out.set(key, []);
        out.get(key).push({ ...r, quote: quote(r.id, item, { player }) });
      }
      return [...out.entries()].map(([key, list]) => ({ key, name: (data.groups || {})[key] || key, list }));
    },
    /**
     * R14 — WHICH MATERIALS THIS SCREEN CAN ACTUALLY SPEND.
     *
     *   "The top of the inventory where it shows currencies has become too much. Instead, only show
     *    relevant materials for the current screen. The crafting screen should show things like
     *    Bound Essence and Scrap Iron."
     *
     * The header strip listed every material you were carrying on all seven tabs, so by the time
     * you had a workshop it was two rows of chips above every screen, including the ones that
     * cannot spend a single one of them. This is the set a given tab is about, read off the recipes
     * themselves rather than written down twice — add a recipe and the strip follows it.
     *
     * `null` means "this screen does not spend materials", which is different from "it spends none
     * of the ones you have": the first hides the strip, the second says you have nothing yet.
     */
    spendableOn(tab) {
      const want = tab === 'crafting' ? recipes.filter(r => r.kind === 'create')
        : tab === 'upgrade' ? recipes.filter(r => r.kind !== 'create')
          // Recycling is where materials come FROM, so the Inventory tab shows everything a recipe
          // anywhere could want — that is the screen where you decide whether to break something up.
          : tab === 'inventory' ? recipes
            : null;
      if (!want) return null;
      const ids = new Set();
      for (const r of want) for (const id of Object.keys(r.cost || {})) ids.add(id);
      return ids;
    },

    /** Every material the player holds, sorted by tier, for the materials panel. */
    held: () => Object.entries(materials.held)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, ...(M[id] || { name: id, tier: 1, color: '#9a9285' }) }))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
    /**
     * The same list, plus what the store pool beside the bench is holding, marked so the panel can
     * say which is in your pockets and which is in the crate behind you. The bench spends both.
     */
    heldAll() {
      const pool = supply.pool;
      const ids = new Set([...Object.keys(materials.held), ...(pool ? Object.keys(pool.totals) : [])]);
      return [...ids]
        .map(id => {
          const bag = materials.count(id);
          const stored = pool ? theStores().count(pool, id) : 0;
          return { id, n: bag + stored, bag, stored, ...(M[id] || { name: id, tier: 1, color: '#9a9285' }) };
        })
        .filter(r => r.n > 0)
        .sort((a, b) => (a.tier || 1) - (b.tier || 1) || String(a.name).localeCompare(String(b.name)));
    },
  };
}
