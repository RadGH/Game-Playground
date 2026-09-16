// Farhold — crafting, and the materials bag it runs on.
//
// The rule the user set: **no mining, no chopping trees.** Every material comes out of an item you
// recycled, or off something that was hard to kill. That makes the bench part of the loot loop
// rather than a second game bolted on: a bad rare is not rubbish, it is four Bound Essence.
//
// The shape of the bench is borrowed (in idea, not in name) from the trading-card-style crafting of
// the big loot ARPGs: single-property rerolls, a rarity ladder you promote up, a full recast that is
// a gamble, and element brands that need a component you only get from the thing that element came
// from. More advanced work costs rarer components — that is the whole progression.
//
//   import { createCrafting } from './craft.js';
//   const craft = createCrafting({ data, rpg, materials });
//   craft.recycle(item);                  // item -> materials
//   craft.quote('reweave', item, { index: 2 });
//   craft.apply('reweave', item, { index: 2 });
//
// Pure: no DOM, no Three.js. The crafting tab in hud.js only draws what `quote()` says.

import { makeRng } from '../../emberveil/js/rng.js';

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
};

export function createCrafting({ data, rpg, materials = new Materials(), rng = makeRng(7) }) {
  const M = data.materials || {};
  const recipes = data.recipes || [];
  const bandCost = data.bandCost || [1];

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
  function costText(cost) {
    return Object.entries(cost).map(([id, n]) => `${n} ${M[id]?.name || id}`).join(', ');
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
  function applies(recipe, item, player) {
    if (recipe.kind === 'create') return true;
    if (!item) return false;
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
    if (!r) return { ok: false, why: 'no such recipe' };
    if (!applies(r, item, player)) return { ok: false, why: whyNot(r, item, player) };

    let cost = r.cost, extra = 1, note = '';
    if (r.kind === 'promote') {
      const to = RARITY[rarityAt(item.rarity) + 1];
      if (!to) return { ok: false, why: 'this is already legendary' };
      cost = r.costByTarget?.[to] || r.cost;
      note = `${item.rarity} → ${to}`;
    }
    if (r.kind === 'quality') {
      const q = ['low', 'medium', 'high', 'elite', 'exotic'];
      const at = q.indexOf(item.quality || 'medium');
      if (at < 0 || at >= q.length - 1) return { ok: false, why: 'this is already as well made as it gets' };
      note = `${item.quality} → ${q[at + 1]}`;
    }
    if (r.kind === 'reroll') {
      const a = (item.affixes || [])[index];
      if (!a) return { ok: false, why: 'pick a property first' };
      if (!rpg.loot.rerollable(a)) return { ok: false, why: 'that is part of the item itself, not a property' };
      extra = Math.pow(r.growth || 1.4, item.reworks || 0);
      note = `replaces "${a.name || a.stat}"`;
    }
    if (r.kind === 'addAffix') {
      const cap = { legendary: 6, rare: 4, magic: 2, normal: 0 }[item.rarity] || 0;
      const real = (item.affixes || []).filter(x => !x.baseIntrinsic).length;
      if (real >= cap) return { ok: false, why: `all ${cap} property slots are full — reweave one instead` };
      note = `${real} of ${cap} slots used`;
    }
    if (r.kind === 'brand') {
      if ((item.affixes || []).some(a => a.stat === 'brand')) return { ok: false, why: 'this weapon already carries a brand' };
      note = `on hit: ${r.element}`;
    }
    if (r.kind === 'intrinsic') {
      const times = item.reinforced?.[r.stat] || 0;
      if (times >= 3) return { ok: false, why: 'the base will not take any more' };
      extra = 1 + times;
      note = times ? `done ${times} of 3 times` : 'up to three times';
    }
    if (r.kind === 'create') {
      cost = r.cost;
      extra = player ? (bandCost[Math.min(bandCost.length - 1, Math.floor(((player.level || 1) - 1) / 5))] || 1) : 1;
      const priced = {};
      for (const [k, n] of Object.entries(cost)) priced[k] = Math.max(1, Math.ceil(n * extra));
      const short = materials.missing(priced);
      return {
        ok: !Object.keys(short).length, recipe: r, cost: priced, costText: costText(priced),
        note: `${r.rarity} ${r.makes}, level ${player?.level || 1}`,
        why: Object.keys(short).length ? `needs ${costText(short)} more` : null, short,
      };
    }

    const priced = scaleCost(cost, item, extra);
    const short = materials.missing(priced);
    return {
      ok: !Object.keys(short).length, recipe: r, cost: priced, costText: costText(priced), note,
      why: Object.keys(short).length ? `needs ${costText(short)} more` : null, short,
    };
  }

  function whyNot(r, item, player) {
    if (!item) return 'pick an item first';
    if (item.isUnique) return 'a unique is what it is — it cannot be reworked';
    if (r.minRarity && rarityAt(item.rarity) < rarityAt(r.minRarity)) return `needs a ${r.minRarity} item or better`;
    if (r.slot === 'weapon') return 'weapons only';
    if (r.slot === 'armour') return 'armour only';
    if (r.minLevel && (player?.level || 1) < r.minLevel) return `you need to be level ${r.minLevel}`;
    return 'cannot be done to this';
  }

  /**
   * Do it. Changes the item IN PLACE (so every panel holding it shows the new one) and returns
   * what happened. Re-quotes first, so a stale button cannot spend materials it does not have.
   */
  function apply(id, item, { index = 0, player = null, baseKey = null, magicFind = 0 } = {}) {
    const q = quote(id, item, { index, player });
    if (!q.ok) return q;
    if (!materials.spend(q.cost)) return { ok: false, why: 'the materials went somewhere' };
    const r = q.recipe;

    if (r.kind === 'create') {
      const level = player?.level || 1;
      const allowed = forgeOptions(r, player).map(o => o.baseKey);
      // You pick the base. Rolling it at random meant spending a pile of material to be handed a
      // dagger you had no use for, which is not crafting, it is a slot machine.
      const key = baseKey && allowed.includes(baseKey) ? baseKey : allowed[Math.floor(rng() * allowed.length)];
      const rarity = forgeRarity(r.rarity, magicFind);
      const made = rpg.loot.generate(key, rarity, rpg.qualityFor(level), { rng });
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
      for (const a of item.affixes || []) if (typeof a.value === 'number') a.value = +(a.value * step).toFixed(2);
      return { ok: true, text: `Tempered to ${to}.` };
    }

    if (r.kind === 'promote') {
      const to = RARITY[rarityAt(item.rarity) + 1];
      item.rarity = to;
      // a promotion always comes with a new property, or the ladder means nothing.
      // (the material name here is Emberveil's internal tier key, not one of our three.)
      rpg.loot.addAffix(item, 'iron_scrap', { iron_scrap: 99 }, rng);
      rpg.loot.rename(item);
      return { ok: true, text: `Promoted to ${to}.` };
    }

    if (r.kind === 'addAffix') {
      const before = (item.affixes || []).length;
      rpg.loot.addAffix(item, 'rare_dust', { rare_dust: 99 }, rng);
      const added = (item.affixes || [])[before];
      rpg.loot.rename(item);
      return { ok: true, affix: added, text: added ? `Inscribed: ${added.name || added.stat}.` : 'Nothing would take.' };
    }

    if (r.kind === 'reroll') {
      const base = rpg.loot.base(item.baseKey);
      const pool = rpg.loot.pool(base, item.rarity).filter(a => !item.affixes.some(x => x.id === a.id));
      if (!pool.length) return { ok: false, why: 'there is nothing else this item could carry' };
      const pick = pool[Math.floor(rng() * pool.length)];
      const was = item.affixes[index];
      item.affixes[index] = { ...pick, value: rpg.loot.rollValue(pick, rng), reworked: true };
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
        fresh.push({ ...pick, value: rpg.loot.rollValue(pick, rng), reworked: true });
      }
      item.affixes = [...fresh, ...keep];
      item.reworks = (item.reworks || 0) + 1;
      rpg.loot.rename(item);
      return { ok: true, text: 'Recast. Everything on it is new.' };
    }

    if (r.kind === 'values') {
      for (const a of item.affixes || []) {
        if (a.baseIntrinsic || a.min == null || a.max == null) continue;
        a.value = rpg.loot.rollValue(a, rng);
      }
      return { ok: true, text: 'Rolled again.' };
    }

    if (r.kind === 'brand') {
      item.affixes.push({
        id: 'brand_' + r.element, name: `Brand of ${r.element}`, stat: 'brand',
        value: 1, element: r.element, baseIntrinsic: true, brand: true,
      });
      item.brand = r.element;
      return { ok: true, text: `Branded with ${r.element}.` };
    }

    if (r.kind === 'intrinsic') {
      item.reinforced = item.reinforced || {};
      item.reinforced[r.stat] = (item.reinforced[r.stat] || 0) + 1;
      if (r.stat === 'armor' && item.armor) item.armor = Math.round(item.armor * (1 + r.value));
      if (r.stat === 'dmg' && item.dmg) item.dmg = item.dmg.map(v => Math.max(1, Math.round(v * (1 + r.value))));
      return { ok: true, text: r.stat === 'armor' ? 'Reinforced.' : 'Honed.' };
    }

    return { ok: false, why: 'that recipe does nothing yet' };
  }

  /**
   * What a `create` recipe could make, at this player's level. The crafting tab lists these and the
   * player picks one; `canUse` says whether their class can actually hold it, so a mage is warned
   * before spending twelve Scrap Iron on a warhammer.
   */
  function forgeOptions(recipe, player = null) {
    const pool = FORGE_POOLS[recipe.makes] || [...FORGE_POOLS.weapon, ...FORGE_POOLS.armour, ...FORGE_POOLS.trinket];
    const level = player?.level || 1;
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
    /** Every material the player holds, sorted by tier, for the materials panel. */
    held: () => Object.entries(materials.held)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, ...(M[id] || { name: id, tier: 1, color: '#9a9285' }) }))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
  };
}
