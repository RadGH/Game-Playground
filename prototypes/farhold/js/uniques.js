// Farhold — round 23: the uniques, and the powers that make them more than a stat stick.
//
//   "Generate 2 uniques of every type, including weapon sub types like wands of fire. For weapons
//    without subtypes generate 4 uniques instead. Some of these new weapons could inflict special
//    dots or impart effects on the user or have interesting auto-attack mechanics."
//
// Four jobs, all pure (no DOM, no Three.js), so the node tests drive the same code the game runs:
//
//   1. THE TAXONOMY. What a "type" is in Farhold, written down once (`UNIQUE_TYPES`) and asked of
//      any unique (`typeOfUnique`). A weapon's type is the swing row js/weapons.js `profileOf`
//      actually picks for it — so "a mace" here is exactly what the game swings as a mace.
//   2. THE DATA. `installUniques` puts data/uniques.json into `items.uniques` IN MEMORY. items.json
//      is shared with Emberveil, which has its own registry and a test that every unique in that
//      file resolves there; Farhold's powers do not exist in Emberveil, so none of this may be
//      written into the shared file.
//   3. THE ITEMS. `dressUnique` settles the element, wand behaviour and staff spell a unique was
//      written for; `makeGearUnique` builds the four kinds of unique that have no items.json base
//      (a mount, a lamp, a quiver, a tool) out of Farhold's own bases.
//   4. THE POWERS' REQUESTS. js/effects.js's round-23 powers write requests onto an attack
//      (`rpg.attackMods`), a kill (`fx.onKill`) or a hit taken (`onDamaged`). `resolveAttack`,
//      `afterKill`, `afterDamaged` and `tickAuras` carry them out against a small `env` — the field,
//      the player and a status function — which js/main.js builds once and a test builds by hand.
//
//   import { installUniques, resolveAttack } from './uniques.js';
//   installUniques(items, uniqueData, { tools: toolData });    // once, at boot, before `new Rpg`

import { GEAR_BASES, createGearShop } from './gear.js';
import { makeTool } from './tools.js';

// ---------------------------------------------------------------------------- 1. the taxonomy

/**
 * The six elements a caster can be made of — js/rpg.js `CAST_ELEMENTS`, in the same order. Holy is
 * not one of them: `attuneWeapon` has no holy row, so a "holy wand" would come out fire.
 */
export const CASTER_ELEMENTS = ['fire', 'ice', 'lightning', 'poison', 'shadow', 'arcane'];

/** The swing rows that are the same weapon under two names in js/weapons.js WEAPON_PATTERNS. */
const ROW_TO_TYPE = {
  scimitar: 'sabre', sabre: 'sabre', battleaxe: 'axe', axe: 'axe',
  sword2h: 'greatsword', greatsword: 'greatsword', axe2h: 'greataxe',
  halberd: 'halberd', polearm: 'halberd', longbow: 'bow',
};

/**
 * EVERY TYPE A UNIQUE CAN BE, and how many each one gets.
 *
 * The rule, which is the user's:
 *   * a weapon with element subtypes — the five casters — gets 2 per element: 6 x 2 = 12 each;
 *   * a weapon with no subtypes gets 4;
 *   * everything else that can drop as loot gets 2.
 *
 * "Loot" is the line. A scanner is left out on purpose: data/tools.json says "devices are owned, not
 * rolled — there is no rare scanner", so a unique scanner would be the only one of its kind with a
 * rarity at all. Boats and ships are unlockables bought once (js/gear.js VEHICLES), same reason.
 * A tool IS in: it rolls a rarity and carries affixes, so a named one is a real thing to find.
 */
export const UNIQUE_TYPES = [
  // ---- weapons with no subtypes: 4 each
  ...['dagger', 'sword', 'longsword', 'rapier', 'sabre', 'axe', 'greataxe', 'mace', 'hammer',
    'warhammer', 'greatsword', 'halberd', 'spear', 'quarterstaff', 'bow', 'shortbow', 'crossbow',
    'javelin'].map(key => ({ key, group: 'weapon', per: 4 })),
  // ---- casters: 2 per element
  ...['wand', 'staff', 'scepter', 'orb', 'tome'].map(key => ({ key, group: 'caster', per: 2, subtypes: CASTER_ELEMENTS })),
  // ---- armour: 2 per slot and weight. Hands and feet have no cloth base in items.json.
  ...['head', 'chest', 'legs'].flatMap(slot => ['cloth', 'light', 'medium', 'heavy'].map(tier => ({ key: `${slot}:${tier}`, group: 'armour', per: 2 }))),
  ...['hands', 'feet'].flatMap(slot => ['light', 'medium', 'heavy'].map(tier => ({ key: `${slot}:${tier}`, group: 'armour', per: 2 }))),
  // ---- the off hand, jewellery and Farhold's own gear slots
  ...['shield', 'ward', 'quiver', 'ring', 'necklace', 'mount', 'light', 'tool'].map(key => ({ key, group: 'other', per: 2 })),
];

/** How many uniques a complete set holds: 18 x 4 + 5 x 6 x 2 + 18 x 2 + 8 x 2 = 184. */
export const UNIQUE_TARGET = UNIQUE_TYPES.reduce((n, t) => n + t.per * (t.subtypes?.length || 1), 0);

const CASTERS = new Set(['wand', 'staff', 'scepter', 'orb', 'tome']);

/**
 * The swing row js/weapons.js `profileOf` picks for a base: its own key, then what its key ENDS
 * with, then its subtype. Restated here from the same rule rather than imported, because weapons.js
 * decides from an ITEM and this has to decide from a data row before any item exists.
 */
export function rowFor(baseKey, base, patterns) {
  if (patterns[baseKey]) return baseKey;
  const suffix = Object.keys(patterns).find(k => baseKey.endsWith('_' + k));
  if (suffix) return suffix;
  if (patterns[base?.subtype]) return base.subtype;
  return null;
}

/**
 * What type a unique entry is — `{ key, element }` — or null if it fits nowhere, which is a bug in
 * the data and the tests say so.
 */
export function typeOfUnique(u, items, patterns = {}) {
  if (!u) return null;
  if (u.toolBase) return { key: 'tool', element: null };
  if (u.gearBase) {
    const g = GEAR_BASES[u.gearBase];
    if (!g) return null;
    return { key: g.slot === 'offhand' ? 'quiver' : g.slot, element: null };
  }
  const w = items?.weaponBases?.[u.baseItemId];
  if (w) {
    const sub = w.subtype || u.baseItemId;
    if (CASTERS.has(sub) && u.baseItemId !== 'quarterstaff') return { key: sub, element: u.element || null };
    const row = rowFor(u.baseItemId, w, patterns);
    const key = ROW_TO_TYPE[row] || row;
    return key ? { key, element: null } : null;
  }
  const a = items?.armorBases?.[u.baseItemId];
  if (a) {
    if (a.isMagicShield) return { key: 'ward', element: null };
    if (a.isShield) return { key: 'shield', element: null };
    if (a.slot === 'ring' || a.slot === 'necklace') return { key: a.slot, element: null };
    if (a.slot === 'offhand') return { key: 'quiver', element: null };
    return { key: `${a.slot}:${a.tier}`, element: null };
  }
  return null;
}

// ---------------------------------------------------------------------------- 2. the data

/**
 * Put Farhold's uniques into `items.uniques`, in memory, once. Safe to run more than once — the old
 * copies are taken out first, the same guard js/rpg.js uses for `FARHOLD_AFFIXES` — because a new
 * game or a load can build the world again in one session.
 *
 * `tools` is data/tools.json: a unique tool names its base by id, and the base row (its tool key,
 * its tier) plus the legendary rarity row are attached here so `makeGearUnique` needs nothing else.
 *
 * Each power's sentence is also written into `items.legendaryEffects`, so Emberveil's own generator
 * — which copies `legendaryEffects[id]` onto the item as a `descriptor` — finds text rather than
 * `undefined`. The sentence comes FROM js/effects.js, so the two cannot disagree.
 */
/**
 * R23 — THE OLDER CASTER UNIQUES GET AN ELEMENT TOO.
 *
 * Emberveil's own caster uniques (items.json) went through the generator like any other wand, so
 * the Magma Sceptre came out as ice five drops in six. The element each one's name and lore
 * already promise is written here, in memory, and `dressUnique` forces it the same way it does
 * for ours. The Gravebound Sceptre is absent on purpose: its brand affix already settles it.
 */
export const LEGACY_CASTER_ELEMENTS = {
  truthseeker: 'arcane',
  magma_scepter: 'fire',
  malgraths_soulbrand: 'shadow',
  unravelers_sigil: 'arcane',
  staff_of_primordial: 'fire',
};

export function installUniques(items, data, { tools = null, describe = null } = {}) {
  if (!items) return items;
  items.uniques = (items.uniques || []).filter(u => !u.farhold);
  for (const u of items.uniques) {
    if (LEGACY_CASTER_ELEMENTS[u.id]) { u.element = LEGACY_CASTER_ELEMENTS[u.id]; u.dressed = true; }
  }
  items.legendaryEffects = items.legendaryEffects || {};
  const list = data?.uniques || [];
  for (const raw of list) {
    const u = JSON.parse(JSON.stringify(raw));
    u.farhold = true;
    if (u.toolBase) {
      u.toolRow = (tools?.bases || []).find(b => b.id === u.toolBase) || null;
      u.toolRarity = tools?.rarity?.legendary || null;
    }
    if (!items.legendaryEffects[u.legendaryEffect] && describe) {
      const text = describe(u.legendaryEffect);
      if (text) items.legendaryEffects[u.legendaryEffect] = text;
    }
    items.uniques.push(u);
  }
  return items;
}

// ---------------------------------------------------------------------------- 3. the items

/**
 * Write what the entry says onto the item the generator handed back.
 *
 *   element        a caster's element. `attuneWeapon` reads `item.attune` as the forced element, so
 *                  the wand of fire is fire every time instead of one drop in six (the generator
 *                  hashes a random item id otherwise).
 *   wandBehaviour  which js/weapons.js WAND_BEHAVIOURS row the bolt uses — same reason.
 *   staffSpell     which STAFF_SPELLS row the staff casts.
 */
export function dressUnique(item, u) {
  if (!item || !u) return item;
  if (u.element) {
    item.attune = u.element;
    item.castElement = null;           // attuneWeapon only attunes an item that has none yet
  }
  if (u.wandBehaviour) item.wandBehaviour = u.wandBehaviour;
  if (u.staffSpell) item.staffSpell = u.staffSpell;
  item.farholdUnique = true;
  return item;
}

/** The fixed and rolled affixes of an entry, plus the power, in the shape the generator writes. */
function uniqueAffixes(u, rng, descriptor) {
  const out = [];
  for (const f of u.fixedAffixes || []) out.push({ id: 'fixed_' + f.stat, name: f.stat, stat: f.stat, value: f.value, fixed: true });
  for (const r of u.randomAffixes || []) {
    out.push({ id: 'rand_' + r.stat, name: r.stat, stat: r.stat, value: +(r.min + rng() * (r.max - r.min)).toFixed(2) });
  }
  out.push({ id: 'legendary_effect', name: 'Legendary', stat: 'cond_legendaryEffect', value: 1, legendaryId: u.legendaryEffect, descriptor });
  return out;
}

/**
 * A mount, a lamp, a quiver or a tool unique. These have no items.json base, so Emberveil's
 * `generateUnique` cannot make them; they are built from js/gear.js or data/tools.json exactly as
 * a shop or a bench would build the plain one, and then given the entry's name, lore and powers.
 */
export function makeGearUnique(u, { rpg = null, rng = Math.random, level = 1 } = {}) {
  let item = null;
  if (u.gearBase) {
    // `normal` so the base's own numbers come across as intrinsics and nothing else is rolled —
    // a unique's properties are the ones written for it, not three random ones on top
    item = createGearShop({ rpg }).make(u.gearBase, 'normal', level, rng);
  } else if (u.toolRow) {
    const rarity = { legendary: { ...(u.toolRarity || { speed: 1.75, yield: 0.4, reach: 1.4, scan: 40 }), affixes: 0 } };
    item = makeTool(u.toolRow, 'legendary', { rarity }, { level, rpg, rng });
  }
  if (!item) return null;
  item.id = 'u_' + Math.floor(rng() * 1e9).toString(36);
  item.name = u.name;
  item.baseName = u.name;
  item.rarity = 'legendary';
  item.quality = u.quality || 'high';
  item.isUnique = true;
  item.uniqueId = u.id;
  item.legendaryEffectId = u.legendaryEffect;
  item.lore = u.lore;
  item.act = u.act;
  item.affixes = [...(item.affixes || []), ...uniqueAffixes(u, rng, rpg?.items?.legendaryEffects?.[u.legendaryEffect])];
  return item;
}

// ---------------------------------------------------------------------------- 4. the requests

/** The nearest live enemy within `range` of `from` that is not in `used`. */
function nextTarget(env, from, range, used) {
  let best = null, bd = Infinity;
  for (const e of env.near(from.x, from.z, range, null) || []) {
    if (used.has(e) || e.dying != null || (e.hp ?? 1) <= 0) continue;
    const d = Math.hypot(e.x - from.x, e.z - from.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * CARRY OUT WHAT ONE ATTACK'S POWERS ASKED FOR, once its hits are in.
 *
 *   env    { near(x,z,r,except), strikeOne(e,{power,element}), strikeArea(x,z,r,{power,element,falloff}),
 *            push(e, fromX, fromZ, metres), dropPool({x,z,r,seconds,element,power}), later(ms, fn),
 *            rng(), arc?(from, to, element) }
 *   mods   what `rpg.attackMods` returned
 *   hits   `[{ enemy, result }]` from the field
 *   where  `{ x, z }` of the attacker, `at` = the impact point of a shot or bolt, `element` of the attack
 *
 * Returns a record of what it did, so a test can ask "did the chain actually jump" rather than
 * "did somebody write chain: true".
 */
export function resolveAttack(env, mods, hits = [], where = {}) {
  const out = { chained: [], bounced: [], shards: [], pulled: [], slammed: [], shockwave: [], arcs: [], echoes: 0, patch: null };
  if (!env || !mods) return out;
  const landed = (hits || []).filter(h => h?.enemy && h.result && h.result.amount > 0 && !h.result.dodged);
  const first = landed[0]?.enemy || null;
  const used = new Set((hits || []).map(h => h.enemy));
  const at = where.at || first || null;
  const element = where.element || 'physical';

  // lightning that jumps from the first body hit to the next, and the next
  if (mods.chain && first) {
    let from = first;
    for (let i = 0; i < mods.chain.jumps; i++) {
      const next = nextTarget(env, from, mods.chain.range, used);
      if (!next) break;
      used.add(next);
      env.arc?.(from, next, mods.chain.element);
      env.strikeOne(next, { power: mods.chain.power, element: mods.chain.element });
      out.chained.push(next);
      from = next;
    }
  }
  // an arrow that carries on to another body
  if (mods.ricochet && first) {
    let from = first;
    for (let i = 0; i < mods.ricochet.bounces; i++) {
      const next = nextTarget(env, from, mods.ricochet.range, used);
      if (!next) break;
      used.add(next);
      env.arc?.(from, next, element);
      env.strikeOne(next, { power: mods.ricochet.power, element });
      out.bounced.push(next);
      from = next;
    }
  }
  // a bolt that breaks into shards where it lands
  if (mods.split && at) {
    const around = { x: at.x, z: at.z };
    for (let i = 0; i < mods.split.shards; i++) {
      const next = nextTarget(env, around, mods.split.range, used);
      if (!next) break;
      used.add(next);
      env.arc?.(around, next, element);
      env.strikeOne(next, { power: mods.split.power, element });
      out.shards.push(next);
    }
  }
  // a bolt that drags everything around it in
  if (mods.pull && at) {
    for (const e of env.near(at.x, at.z, mods.pull.radius, null) || []) {
      if (e.dying != null) continue;
      env.push(e, at.x, at.z, -mods.pull.metres);
      out.pulled.push(e);
    }
  }
  // burning ground under the first body hit, on its own cooldown
  if (mods.patch && first) {
    out.patch = { x: first.x, z: first.z, r: mods.patch.radius, seconds: mods.patch.seconds, element: mods.patch.element, power: mods.patch.power };
    env.dropPool(out.patch);
    if (mods.rt) mods.rt.trailCd = mods.patch.cooldown || 1;
  }
  // the ground slam and the crescendo's shockwave: around the attacker
  const ring = (spec, list, shove) => {
    const x = where.x ?? at?.x, z = where.z ?? at?.z;
    if (x == null) return;
    for (const h of env.strikeArea(x, z, spec.radius, { power: spec.power, element, falloff: 0.6 }) || []) {
      list.push(h.enemy);
      if (shove) env.push(h.enemy, x, z, shove);
    }
  };
  if (mods.slam) ring(mods.slam, out.slammed, mods.slam.push);
  if (mods.shockwave) ring(mods.shockwave, out.shockwave, 0);
  // the same body again, a beat later
  if (mods.echo) {
    for (const h of landed) {
      if (env.rng() >= mods.echo.chance) continue;
      out.echoes++;
      const e = h.enemy;
      env.later(mods.echo.ms, () => { if (e.dying == null && (e.hp ?? 1) > 0) env.strikeOne(e, { power: mods.echo.power, element }); });
    }
  }
  // …and the per-hit requests the strike itself raised (Static Charge)
  for (const h of landed) {
    for (const p of h.result.post?.procs || []) {
      if (p.kind !== 'arc') continue;
      const next = nextTarget(env, p.from || h.enemy, p.range, new Set([h.enemy]));
      if (!next) continue;
      env.arc?.(p.from || h.enemy, next, p.element);
      env.strikeOne(next, { power: p.power, element: p.element });
      out.arcs.push(next);
    }
  }
  return out;
}

/** What a kill's powers asked for: Rot passes on, Siphon heals, a keystone bursts / shatters / spreads. Returns a record for the tests. */
export function afterKill(env, post, e) {
  const out = { rotted: [], siphon: false, burst: [], shards: [], spread: [] };
  if (!env || !post) return out;
  if (post.spreadRot && e) {
    const s = post.spreadRot;
    for (const other of env.near(e.x, e.z, s.radius, e) || []) {
      if (other === e || other.dying != null) continue;
      env.applyStatus(other, 'rot', { perSecond: s.perSecond, seconds: s.seconds, element: 'poison', name: 'Rot', kind: 'damage' }, s.power);
      out.rotted.push(other);
    }
  }
  // R25 — the elemental keystones (js/effects.js `perk:*`): a body that bursts, one that shatters
  // into shards, and a status that moves on to whoever stood near
  if (post.burst && e) {
    const b = post.burst;
    env.burstFx?.(e.x, e.z, b.radius, b.element);
    for (const h of env.strikeArea(e.x, e.z, b.radius, { power: b.power, element: b.element, falloff: 0.7 }) || []) {
      if (h.enemy === e) continue;
      if (b.status && env.statusSpec?.(b.status) && h.result?.amount > 0) env.applyStatus(h.enemy, b.status, env.statusSpec(b.status), Math.max(1, h.result.amount * 0.5));
      out.burst.push(h.enemy);
    }
  }
  if (post.shards && e) {
    const used = new Set([e]);
    for (let i = 0; i < post.shards.count; i++) {
      const next = nextTarget(env, e, post.shards.range, used);
      if (!next) break;
      used.add(next);
      env.arc?.(e, next, post.shards.element);
      env.strikeOne(next, { power: post.shards.power, element: post.shards.element });
      out.shards.push(next);
    }
  }
  if (post.spread && e) {
    const spec = env.statusSpec?.(post.spread.type);
    for (const other of (spec && env.near(e.x, e.z, post.spread.radius, e)) || []) {
      if (other === e || other.dying != null) continue;
      env.applyStatus(other, post.spread.type, spec, post.spread.power);
      out.spread.push(other);
    }
  }
  if (post.selfStatus && env.applySelf) {
    env.applySelf(post.selfStatus.type, post.selfStatus.spec);
    out.siphon = true;
  }
  return out;
}

/**
 * What a hit TAKEN asked for: a frost nova or a barrier burst, and the attacker thorns just killed.
 * `result` is `rpg.strike`'s return from the enemy's swing at the player.
 */
export function afterDamaged(env, result, attacker = null) {
  const out = { novas: [], killed: false };
  if (!env || !result) return out;
  const me = env.at?.() || { x: env.player?.x, z: env.player?.z };
  for (const p of result.defenderPost?.procs || []) {
    if (p.kind !== 'nova' || me.x == null) continue;
    const hits = env.strikeArea(me.x, me.z, p.radius, { power: p.power, element: p.element, falloff: 0.5 }) || [];
    for (const h of hits) {
      if (p.status && env.statusSpec?.(p.status)) env.applyStatus(h.enemy, p.status, env.statusSpec(p.status), 1);
    }
    out.novas.push(hits.map(h => h.enemy));
  }
  // thorns, Thornmail or otherwise, can kill; nothing used to notice, so the body stood at 0 health
  if (attacker && result.reflected > 0 && (attacker.hp ?? 1) <= 0 && attacker.dying == null && env.kill) {
    env.kill(attacker);
    out.killed = true;
  }
  return out;
}

/**
 * The powers that pulse on a clock: Pyre, Searing Light, the Dread Lantern, the Stormrider.
 * Only while `fighting`, so walking past a grazing deer with a lamp does not start a fight with it.
 * Returns what fired this frame.
 */
export function tickAuras(env, rpg, player, dt, { fighting = false } = {}) {
  const fired = [];
  if (!env || !rpg || !player) return fired;
  const auras = rpg.auraList(player);
  if (!auras.length) return fired;
  const rt = rpg.fx.rt(player);
  const clock = rt.auraClock || (rt.auraClock = {});
  const me = env.at?.() || { x: player.x, z: player.z };
  for (const a of auras) {
    clock[a.id] = (clock[a.id] || 0) + dt;
    if (!fighting) { clock[a.id] = Math.min(clock[a.id], a.every); continue; }
    if (clock[a.id] < a.every) continue;
    clock[a.id] = 0;
    const hit = [];
    if (a.nearestOnly) {
      const e = nextTarget(env, me, a.radius, new Set());
      if (e) {
        env.arc?.(me, e, a.element);
        const res = env.strikeOne(e, { power: a.power, element: a.element });
        // R25 — Storm Within's spark Shocks what it strikes
        if (a.status && env.statusSpec?.(a.status) && res?.amount > 0) env.applyStatus(e, a.status, env.statusSpec(a.status), Math.max(1, res.amount * 0.7));
        hit.push(e);
      }
    } else if (a.power > 0) {
      for (const h of env.strikeArea(me.x, me.z, a.radius, { power: a.power, element: a.element, falloff: 1 }) || []) {
        hit.push(h.enemy);
        if (a.status && env.statusSpec?.(a.status) && h.result?.amount > 0) {
          env.applyStatus(h.enemy, a.status, env.statusSpec(a.status), Math.max(1, h.result.amount * 0.7));
        }
      }
    }
    if (a.apply) {
      for (const e of env.near(me.x, me.z, a.radius, null) || []) {
        if (e.dying != null) continue;
        env.applyStatus(e, a.apply.type, a.apply.spec, 1);
        if (!hit.includes(e)) hit.push(e);
      }
    }
    fired.push({ id: a.id, hit });
  }
  return fired;
}
