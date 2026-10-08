// Thousandvale — the combat core as the ROOM sees it (docs/protocol.md §7). The room (stream A,
// js/sim/room.js) imports exactly `createRules(host, opts)`; everything else under js/rules/ is
// behind it.
//
// Two worlds meet here and this file is the only place they touch:
//   * the room's ENTITIES (js/sim/entity.js): positions, hp bars, anims, targets — mutated only
//     through their methods so the snapshot dirty bits are right;
//   * the combat core's UNITS: Farhold player sheets and enemy units, mutated freely by Farhold's
//     own formulas (`rpg.strike` writes `hp` directly, statuses hang off the unit).
// Each entity holds its unit at `e.r.unit`. Every call syncs IN (where the room moved a player)
// before the combat core runs and syncs OUT (hp, mana, monster positions, anims, deaths, targets)
// after, then turns the core's events (js/rules/field.js `out`) into protocol events (§6).
//
// The data is loaded once per process at module load (top-level await, js/rules/boot.js), so
// `createRules` stays synchronous; if loading fails the import fails and the room falls back to its
// stand-in rules, which is the behaviour stream A built for exactly this.

import { bootData } from './boot.js';
import { createEngine } from './engine.js';
import { createRoomContext } from './room.js';
import { attachField } from './field.js';
import { createCombat } from './cast.js';
import { createCharacter } from './character.js';
import { spawnMonster, tickMonsters } from './monster-ai.js';
import { clearThreat } from './threat.js';
import { makeRng } from './rng.js';
import { attachEncounters } from './encounter.js';
import { attachFollowers } from './followers.js';
import { attachWarbands, escortFor } from './warband.js';
import { allyEffects, aimsAtAlly } from './ally.js';
import { cardText, whoOf, whoText } from './wording.js';
import { reviveOf, directHealSlot } from './tv-skills.js';
import { runtimeFor, shapeOfUnit } from './cast-skills.js';
import { attackReach, basicCard, isHeldFocus, stampCaster } from './caster-forms.js';
import { TV_SLOTS, bagBonusOf, isLightItem as isLightRaw, lightRefund as lightRefundRaw } from './tv-gear.js';
import { itemPrice, sellPrice as sellPriceOf, priceParts, killGold as killGoldOf, goldFound, isGear, retrainPrice as retrainPriceTv, questHour as questHourOf } from './economy.js';
import { weaponHands } from './farhold.js';
import { makeCrate as makeCrateItem, openCrate as openCrateItem, isCrate, crateText } from './crates.js';
import { kitsFor as kitsForRaw, validKit as validKitRaw, starterGear as starterGearRaw, kitPlan } from './starter-kits.js';
import { sheetJob, cachedAbilities, statRows, sheetWith as sheetWithItem } from './estimate.js';
import { companionsDue, companionInfo, UNLOCK_KEYS } from './progression.js';
import { tickPlayer as perkTick } from './perk-rules.js';
import { talentView, pickTalent as pickTalentFor, unpickTalent as unpickTalentFor, resetTalents as resetTalentsFor, cleanTalents, tierNodes, TIER_LEVELS } from './talents.js';
import { forestView } from './perk-forest.js';
import { canTakePerk, allocatePerk, refundPerk as refundPerkFor, refundAllPerks, perkPointsFor, perkPointsLeft, perkSpent, retrainPriceOf } from './farhold.js';

/** What an arena object is called on a nameplate. */
const OBJECT_NAMES = { pillar: 'Stone pillar', rock: 'Fallen rock', brazier: 'Brazier', lever: 'Lever', pool: 'Pool', cracked_floor: 'Cracked floor' };
import { validTarget, TAB } from './targeting.js';
import { applyItemBuff, itemBuffs as itemBuffsOf, sheetKey, saveItemBuffs, restoreItemBuffs, RECALL, REVIVE_FLASK } from './buffs.js';
import { groundAdapter } from './terrain-read.js';
import { serializeGear } from './character.js';
export { serializeGear, restoreGear } from './character.js';
export { nextTarget, tabOrder, validTarget } from './targeting.js';
export { BUFF_KINDS, RECALL, REVIVE_FLASK } from './buffs.js';
export { MOUNT_RULES, mountRefusal, mountSpeedMul, mountCalm, dismounts } from './mount.js';
export { LOOT_THRESHOLDS, THRESHOLD_LABELS, DEFAULT_LOOT_THRESHOLD, RARITY_RANK, lootTier, lootRank, normalizeThreshold, locksForRoll, splitLoot, rollWinner } from './loot-rules.js';
import { xpForLevel, levelFromXp, hashStr } from './farhold.js';
import { rollWildRank, rareName, sizeFloor, escortCount } from './affixes.js';

let shared = null;
/** Build the process-wide engine (index.js does this itself at load; a host may call it first). */
export async function prepareRules(data = null, opts = {}) {
  shared = createEngine(data || await bootData(), opts);
  return shared;
}
await prepareRules();
export const rulesEngine = () => shared;

// ---- play-test 5: what A and the client call WITHOUT a room (character creation, the kit screen, a quest reward) ----
/** T5: the kit screen's data for a class — `{ cls, armour: [{id, name, blurb, items}] x3, weapons: [{id, name, blurb, items}] }`. */
export const kitsFor = classId => kitsForRaw(classId, shared?.kits || null, shared);
/** T5: settle a choice — `{ ok, armour, weapons, fell? }` (missing / unknown id = the first of each). */
export const validKit = (classId, choice) => validKitRaw(classId, choice, shared?.kits || null);
/** T5: the chosen kit as `char.equipment` (`{ weapon, offhand?, head?, chest?, … }`). */
export const starterGear = (classId, choice) => starterGearRaw(classId, choice, shared?.kits || null, shared);
export { kitPlan, isCrate };
/** T9 / T20: a crate (or, with `spec.gift`, a gift box) as a bag item. `level` caps how high it can ever roll (level + 3). */
export const makeCrate = (spec = {}, { level = null, cls = null } = {}) => makeCrateItem(shared?.crates || null, { ...(cls ? { cls } : {}), ...spec, ...(level && spec.level == null && spec.maxLevel == null ? { level } : {}) });
/** T9: the crate's card line for a spec (quest reward rows). */
export const crateLabel = spec => crateText(shared?.crates || null, spec, { gift: !!spec?.gift });
// ---- owner feedback 7 (V2): gold, for the server and E's tools/sim-economy.mjs (no room needed) ----
/** The LIST price of an item — final (level, slot, rarity in it); a shop multiplies by its town's factor only. */
export const priceOf = item => itemPrice(shared?.prices || null, item);
// ---- owner feedback 8: W22 (no light items) and W19 (backpacks), for the server without a room ----
/** The light everyone carries now: `{ radius, dungeonRadius, dungeonAmbient }` (data/rules/progression.json `light`). */
const lightOf = engine => Object.freeze({ radius: 22, dungeonRadius: 28, dungeonAmbient: 0.4, ...(engine?.progression?.light ? (({ _doc, ...r }) => r)(engine.progression.light) : {}) });
export const LIGHT = lightOf(shared);
/** Is this bag / worn item a light from before W22 (a lantern, a torch, the Bundle of Torches)? A converts these on load. */
export const isLightItem = item => isLightRaw(item, shared?.tvGear || null);
/** Gold to pay for one (its LIST price, per item of a stack); 0 when it is not a light. */
export const lightRefund = item => lightRefundRaw(item, shared?.tvGear || null, it => itemPrice(shared?.prices || null, it));
/** W19: bag slots an item gives when worn on the back (0 = not a backpack). */
export { bagBonusOf };
/** What a merchant pays for it (never more than the list price). */
export const sellPriceFor = item => sellPriceOf(shared?.prices || null, item);
/** `{ price, sell, level, slot, parts }` for a tooltip or the sim. */
export const priceRow = item => (isGear(item) ? { ...priceParts(shared?.prices || null, item), sell: sellPriceOf(shared?.prices || null, item) } : { price: priceOf(item), sell: sellPriceFor(item), level: 1, slot: null, parts: null });
/** What a kill pays before gold find: `killGold(level, rank?, type?)` (type = a bestiary id, for its own coin weight). */
export const killGold = (level = 1, rank = 'normal', type = null) => killGoldOf(shared?.prices || null, level, { rank, defGold: type ? shared?.enemyDef(type)?.gold ?? null : null });
export { goldFound };
/** The Unbinder's price at a level, and the hour of questing gold it is measured in (for E's sim). */
export const unbinderPrice = (kind = 'talent', scope = 'one', level = 1) => retrainPriceTv(shared?.prices || null, kind, scope, level);
export const questHour = (level = 1) => questHourOf(shared?.prices || null, level);
/** The average worth of what a crate opens into at `level` (list price and sell price over `n` opens) — for the sim. */
export function crateValue(spec = {}, level = 1, cls = null, n = 200) {
  if (!shared) return null;
  const rng = makeRng(hashStr(`crate:${JSON.stringify(spec)}:${level}:${cls}`));
  const crate = makeCrateItem(shared.crates, spec);
  let price = 0, sell = 0, got = 0;
  for (let i = 0; i < n; i++) { const [it] = openCrateItem(shared, crate, { cls, level, rng }); if (!it) continue; got++; price += priceOf(it); sell += sellPriceFor(it); }
  return got ? { price: Math.round(price / got), sell: Math.round(sell / got), n: got } : null;
}
/** T25: the angling rules (js/rules/fishing.js), booted with C's numbers and E's fish. */
export const fishing = () => shared?.fishing || null;

/** Monster `type` names the room's camps use, mapped to Farhold bestiary ids. */
export const TYPE_ALIASES = { wolf: 'moor_hound', hound: 'moor_hound' };

/** Protocol refusal codes (castR `why`): cooldown, range, mana, dead, target, unknown. */
function whyCode(text = '') {
  if (/not ready|cooldown/i.test(text)) return 'cooldown';
  if (/mana/i.test(text)) return 'mana';
  if (/unlocks at level|opens at level/i.test(text)) return 'locked';
  if (/no fallen party member|nobody is left to raise/i.test(text)) return 'target';
  if (/while you are fighting/i.test(text)) return 'combat';
  if (/dead/i.test(text)) return 'dead';
  if (/range|reach/i.test(text)) return 'range';
  if (/target/i.test(text)) return 'target';
  return 'unknown';
}

/** The room's heightmap in the shape js/rules/ (and Farhold's ground.js) reads. */
function terrainFrom(host) {
  // stream B's reader when the room hands it over (docs/world.md `groundAdapter`): real slopes and depths
  const reader = host.terrain?.reader || host.terrainReader || null;
  // B's nav.bin (`parseNav`) when the room hands it over: trees, rocks, buildings and deep water block
  // a monster's step (monster-ai.js `blocked`); without it monsters read slopes and water only
  const nav = host.terrain?.nav || host.nav || null;
  const blocked = nav?.passable ? (x, z) => !nav.passable(x, z) : null;
  // a real zone plans round cliffs and deep water too (pathfind.js), nav.bin or not
  if (reader) { const g = groundAdapter(reader); g.pathing = true; if (blocked) g.blocked = blocked; return g; }
  const h = (x, z) => host.groundAt(x, z);
  const S = 0.75;
  // a dungeon (js/sim/dungeon.js): its walls are the tiles that are not walkable — they BLOCK (so
  // monsters and followers path round them and never see or strike through them, play-test 1 P11);
  // a gate opening changes them, so the planner forgets its cached cells every 3 s
  const dungeon = host.terrain?.kind === 'dungeon' || host.kind === 'instance';
  const wall = dungeon && host.walkable ? (x, z) => !host.walkable(x, z) : blocked;
  return {
    heightAt: h,
    slopeAt: (x, z, s = S) => Math.hypot(h(x + s, z) - h(x - s, z), h(x, z + s) - h(x, z - s)) / (2 * s),
    normalAt: (x, z, s = S, out = [0, 1, 0]) => {
      const dx = (h(x + s, z) - h(x - s, z)) / (2 * s), dz = (h(x, z + s) - h(x, z - s)) / (2 * s);
      const l = Math.hypot(dx, 1, dz);
      out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
      return out;
    },
    waterAt: (x, z) => (host.walkable(x, z) ? 0 : 1),
    underwater: (x, z) => !host.walkable(x, z),
    roadAt: () => 0,
    clampToWorld: (x, z) => [x, z],
    biomeIdAt: () => 0,
    ...(wall ? { blocked: wall } : {}),
    ...(dungeon ? { blockTtl: 3 } : {}),
  };
}

/** Callboard seat-fillers by role (Farhold's mercenaries.json hirelings). */
export const BACKFILL = Object.freeze({ tank: 'shield_warden', healer: 'field_mender', dps: Object.freeze(['blade_for_hire', 'longshot', 'hedge_burner']) });
const GROUP = Object.freeze({ tank: 1, healer: 1, dps: 3 });
/** A class row's group role from its `role` line ("Frontline Tank", "Primary Healer", ...). */
export function roleOfClass(cls) {
  const t = String(cls?.role || '');
  if (/tank|bulwark/i.test(t)) return 'tank';
  if (/heal/i.test(t)) return 'healer';
  return 'dps';
}
/**
 * The roles of the `n` empty seats of a five-seat group (1 tank, 1 healer, 3 damage). `known` = the
 * roles in the group that we know; members we do not know (5 - n - known) take damage seats first.
 * Order: tank, healer, then damage.
 */
export function missingRoles(known, n) {
  const open = { ...GROUP };
  for (const r of known) { const k = r === 'tank' || r === 'healer' ? r : 'dps'; if (open[k] > 0) open[k]--; else if (open.dps > 0) open.dps--; }
  let unknown = Math.max(0, 5 - n - known.length);
  for (const k of ['dps', 'healer', 'tank']) { const t = Math.min(unknown, open[k]); open[k] -= t; unknown -= t; }
  const out = [];
  for (const k of ['tank', 'healer', 'dps']) for (let i = 0; i < open[k]; i++) out.push(k);
  while (out.length < n) out.push('dps');
  return out.slice(0, n);
}

/** rollLoot tiers (see rollLoot): one entry per guaranteed roll. Farhold's rarity ladder is normal/magic/rare/legendary. */
export const LOOT_TIERS = Object.freeze({
  reward: { rolls: [{ chance: 1, rarityBoost: 2, floor: null }] },
  uncommon: { rolls: [{ chance: 1, rarityBoost: 1, floor: 'magic' }] },
  magic: { rolls: [{ chance: 1, rarityBoost: 1, floor: 'magic' }] },
  rare: { rolls: [{ chance: 1, rarityBoost: 1, floor: 'rare' }] },
  epic: { rolls: [{ chance: 1, rarityBoost: 2, floor: 'rare' }, { chance: 1, rarityBoost: 2, floor: 'magic' }] },
  legendary: { rolls: [{ chance: 1, rarityBoost: 2, floor: 'legendary' }] },
});

const ONE_SHOT_ANIMS = new Set(['attack', 'hit', 'bite', 'cast']);

export function createRules(host, opts = {}) {
  const rulesOpts = opts;
  const engine = shared;
  const room = createRoomContext({ id: String(opts.roomId ?? host.roomId ?? 'room'), seed: opts.seed ?? 1, engine });
  const field = attachField(room, { terrain: terrainFrom(host), safeZones: host.safeZones || [] });
  field.lod = opts.lod !== false;          // perf: idle far-off monsters think every few ticks (monster-ai.js AI.LOD_*)
  const combat = createCombat(room);
  room.combat = combat;
  combat.tickMonsters = dt => tickMonsters(field, dt);
  // followers (companions, summons, decoys, hirelings): units in this field AND room entities
  // (kind npc, team 1, friendly) so every client draws them; `adopting` hands the unit to addEntity
  let adopting = null;
  attachFollowers(room, {
    spawnEntity: p => {
      adopting = p;
      try {
        const ent = host.spawn({ kind: 'npc', type: p.defId, name: p.name, level: p.level, x: p.x, z: p.z, yaw: p.facing || 0, team: 1, state: 128, data: { pet: true, owner: p.owner?.id ?? null, temporary: !!p.temporary, ...(p.backfill ? { backfill: p.backfill.role } : {}) } });
        return ent?.id ?? null;
      } finally { adopting = null; }
    },
    despawnEntity: p => { const ent = host.entities.get(p.id); if (ent && ent.r?.unit === p) host.despawn(ent); },
  });
  // warbands (js/rules/warband.js): a leader's escort and standard-bearer are room entities like any
  // monster (every client draws them, they despawn like any corpse; the camp counts only the leader)
  attachWarbands(field, {
    cfg: engine.balance.warbands || {},
    packRadius: engine.balance.zones?.packRadius ?? 9,
    spawn: (defId, x, z, level, rank, leader) => {
      const e = host.spawn({ kind: 'monster', type: defId, level, x, z, rank, data: { escortOf: leader.id } });
      return e?.r?.unit || null;
    },
  });
  // a siege needs something built to break: the room may hand over `structures(ax, az, bx, bz)` and
  // `strikeStructure(monsterEntity, id)` (no room does yet — Thousandvale v1 has no player building)
  if (host.structures) field.structures = host.structures;
  if (host.strikeStructure) field.strikeStructure = (u, id) => host.strikeStructure(host.entities.get(u.id) || u, id);
  // the encounter engine: telegraphs, boss scripts, arena objects (js/rules/encounter.js)
  const enc = attachEncounters(room, {
    data: engine.encounters,
    roomKind: host.kind || 'wilds',
    // adds and arena objects are room entities, so every client sees them
    spawn: (def, level, x, z, { rank = 'normal' } = {}) => {
      const e = host.spawn({ kind: 'monster', type: def.id, level, x, z, rank, data: { noRank: true } });   // S4: an add never rolls a rank
      return e?.r?.unit || null;
    },
    // play-test 3 R7: `look` (how the client dresses it, e.g. 'chained') and `tether` (the id of the boss a chain
    // runs to from it) ride on the object so the arena on screen matches the call-out
    spawnObject: o => host.spawn({ kind: 'object', type: o.type, name: o.spec?.name || OBJECT_NAMES[o.type] || o.type, x: o.x, z: o.z,
      data: { rules: true, key: o.key, ...(o.spec?.look ? { look: o.spec.look } : {}), ...(o.spec?.tether && o.enc ? { tether: o.enc.id } : {}) } }),
    objState: (o, state, extra) => {
      const ent = host.objState ? host.entities.get(o.id) : null;
      if (!ent || ent.kind !== 'object') return false;
      host.objState(ent, state, extra);
      return true;
    },
    despawn: thing => {
      const ent = thing?.kind === 'monster' || thing?.defId ? host.entities.get(thing.id) : host.entities.get(thing?.id);
      if (ent) host.despawn(ent);
    },
  });
  const entOf = unit => (unit?.id != null ? host.entities.get(unit.id) : null);
  let regenClock = 0;
  let builds = 0, handoffs = 0;

  combat.award = (unit, { xp, gold, items, from }) => {
    const e = entOf(unit);
    if (!e) return;
    host.award(e, { xp, gold, items: items?.length ? items : undefined, from: entOf(from) || undefined, reason: 'kill' });
  };

  // Q3/Q4 — party loot: when the room offers `host.partyLoot(memberEntities, items, corpseEntity, partyId)`,
  // a party that tagged a kill gets one drop for the corpse (cast.js onKill) and the room hands it out
  // (free items, Need / Greed / Skip above the party's threshold — js/rules/loot-rules.js). Without the
  // hook every tagger keeps its own roll (the M3 behaviour).
  // play-test 5 T4: a revive skill asks the room first when it takes offers (`host.offerRevive(caster, target, spec)`:
  // the fallen player accepts or declines, then A calls `rules.revived`); without the hook the body stands up at once
  combat.endStatuses = u => endStatuses(u);
  Object.defineProperty(combat, 'offerRevive', { configurable: true, get: () => (typeof host.offerRevive === 'function'
    ? (c, t, spec) => { const ce = entOf(c), te = entOf(t); return ce && te ? host.offerRevive(ce, te, spec) : null; } : null) });

  const partyLootFn = (members, items, from, partyId) => host.partyLoot(members.map(entOf).filter(Boolean), items, entOf(from) || null, partyId);
  Object.defineProperty(combat, 'partyLoot', { configurable: true, get: () => (typeof host.partyLoot === 'function' ? partyLootFn : null) });

  // ------------------------------------------------------------------ sync

  function syncIn() {
    for (const p of field.players) {
      const e = entOf(p);
      if (!e) continue;
      p.x = e.x; p.y = e.y; p.z = e.z; p.yaw = e.yaw;
    }
  }

  function syncOut() {
    for (const list of [field.players, field.monsters, field.allies]) {
      const monsters = list !== field.players;
      for (const u of list) {
        // M2 perf: a monster asleep (nobody within THINK_RADIUS) changes nothing — sync it once as it
        // falls asleep, then skip it (a province copy holds ~1,300 of them)
        if (u.asleep && u._sentAsleep) continue;
        let e = u._ent;
        if (!e || e.removed || e.id !== u.id) { e = entOf(u); u._ent = e; }
        if (!e || e.removed) continue;
        u._sentAsleep = !!u.asleep;
        if (monsters) {
          if (u.x !== e.x || u.z !== e.z) e.moveTo(u.x, u.z);
          if (Number.isFinite(u.facing)) e.face(u.facing);
          const tid = u.targetId ?? 0;
          if (typeof tid === 'number' && tid !== e.target) {
            if (tid && !e.target) host.event({ type: 'aggro', s: e.id, d: tid });
            e.setTarget(tid);
          }
          const fighting = u.state === 'chase' && u.dying == null;
          e.setState(2, fighting);                    // STATE.combat
          if (u.anim && u.anim !== u._sentAnim) {
            if (ONE_SHOT_ANIMS.has(u.anim)) e.anim(u.anim === 'attack' && u.kind === 'beast' ? 'bite' : u.anim);
            else if (u.anim !== 'dead') e.loop(u.anim);
            u._sentAnim = u.anim;
          }
          if (u.dying != null && u.statuses && Object.keys(u.statuses).length) endStatuses(u);   // Q8: nothing burns on a corpse
          if (u.dying != null && !e.dead) { e.setHp(0); e.kill(u.owner ? null : entOf({ id: lastHitBy(u) })); if (!u.owner) host.despawn(e, 8000); continue; }
        } else if ((u.x !== e.x || u.z !== e.z) && !(u.kind === 'player' && (u.dead || e.dead))) {
          e.moveTo(u.x, u.z);                         // a dash or a knock moved a player (never a dead one: P8)
        } else if (u.kind === 'player' && (u.dead || e.dead)) {
          u.x = e.x; u.z = e.z;                       // the room's word on where a body lies
        }
        if (u.maxHp !== e.hpMax || (u.maxMp ?? 0) !== e.mpMax) e.setMax(u.maxHp, u.maxMp ?? 0);
        e.setHp(Math.round(u.hp));
        if (u.kind === 'player') {
          e.setMp(Math.round(u.mp ?? 0));
          // Q8: "died to an ash wisp, revived still on fire" — every status ends with the death (and one
          // that lands on the body afterwards, from a pool or a DoT spread, ends the next tick)
          if (u.dead && u.statuses && Object.keys(u.statuses).length) endStatuses(u);
          if (u.dead && !e.dead) e.kill(entOf({ id: u.killedBy }));
        }
      }
    }
  }
  /**
   * Q8 — end every status on `u` and tell the clients each one went out (the same `fx status on:false`
   * a status that runs out sends), so a burning body does not wake up still burning. Wards, barriers,
   * a form's buffs and the cast barrier go too: a death is a clean slate.
   */
  function endStatuses(u) {
    const had = Object.keys(u.statuses || {});
    u.statuses = {};
    u.barrier = 0; u.castBarrierFor = 0;
    for (const type of had) host.event({ type: 'fx', id: u.id, kind: 'status', status: type, on: false });
    if (had.length) { const e = entOf(u); if (e) host.statusChanged?.(e, true); }
    return had;
  }
  /** The status ids on an entity right now (A's `info.st`, so everyone near sees a burn); none on the dead. */
  function statusesOf(e) {
    const u = e?.r?.unit;
    if (!u || u.dead || u.dying != null || e.dead) return [];
    return Object.keys(u.statuses || {});
  }

  const lastHitBy = u => { let best = null, bv = -1; for (const [id, v] of u.damageBy || []) if (v > bv) { bv = v; best = id; } return best; };

  /** field events -> protocol events (§6) */
  function flush() {
    for (const ev of field.drain()) {
      switch (ev.t) {
        case 'hit':
          if (ev.dodged) host.event({ type: 'miss', s: ev.src, d: ev.dst, why: 'dodge' });
          else if (ev.amt > 0 || ev.absorbed > 0) host.event({ type: 'hit', s: ev.src, d: ev.dst, n: ev.amt, crit: ev.crit || undefined, el: ev.element !== 'physical' ? ev.element : undefined, kind: 'dmg', skill: ev.kind, ab: ev.ab });
          else if (ev.blocked) host.event({ type: 'miss', s: ev.src, d: ev.dst, why: 'block' });
          if (ev.dead) { const v = field.get(ev.dst); if (v?.kind === 'player') v.killedBy = ev.src; }
          break;
        case 'heal': host.event({ type: 'hit', s: ev.src, d: ev.dst, n: ev.amt, kind: 'heal' }); break;
        case 'dot': host.event({ type: 'hit', s: 0, d: ev.id, n: Math.round(ev.amt), kind: 'dmg', skill: 'dot' }); break;
        case 'cast': {
          const e = host.entities.get(ev.id);
          e?.anim('cast');
          host.event({ type: 'cast', s: ev.id, slot: ev.slot ?? undefined, skill: ev.skill, aim: ev.aim });
          break;
        }
        case 'swing': {
          // Q1: `every` (ms) is the basic attack's real cadence (a bow's draw + nock, a crossbow's reload) so
          // the client's auto-attack can pace itself; `clip` 'draw' = the bow is being drawn (loose follows)
          host.entities.get(ev.id)?.anim('attack');
          // R5: what the weapon is (`wk` melee|arrow|bolt|staff, `wt` sword/staff/wand/bow…, `el` element, `two`), the
          // swing's wind-up (`wind` ms: the hit lands this long after) and a melee swing's reach/arc — the client draws it
          host.event({ type: 'cast', s: ev.id, slot: 0, skill: 'basic', every: ev.every != null ? Math.round(ev.every * 1000) : undefined, clip: ev.clip === 'draw' || ev.clip === 'shoot' ? ev.clip : undefined,
            wk: ev.wk, wt: ev.wt, el: ev.el, two: ev.two, hand: ev.hand === 'off' ? 'off' : undefined, step: ev.step || undefined, wind: ev.wind > 0 ? Math.round(ev.wind * 1000) : undefined,
            reach: ev.reach != null ? Math.round(ev.reach * 100) / 100 : undefined, arc: ev.arc != null ? Math.round(ev.arc * 1000) / 1000 : undefined, strike: ev.strike,
            // play-test 5: `form` = the caster style (T15), `imbue` = a sceptre's elemental swing (T16)
            form: ev.form, imbue: ev.imbue });
          break;
        }
        case 'revive': {
          const e = host.entities.get(ev.id);
          const u = e?.r?.unit;
          // Q8: a raised body comes back clean. `keep` = the reviver cleaned it already and then added the
          // skill's own rider (a mend over time, a weakness — play-test 5 T4), which must not be wiped here.
          if (!ev.keep && u?.statuses && Object.keys(u.statuses).length) endStatuses(u);
          if (e?.dead) e.revive(ev.hp / Math.max(1, e.hpMax));
          // everyone near draws the class's own revive (`skill` = the skill id, `style` = its look)
          if (ev.skill) host.event({ type: 'fx', kind: 'revive', id: ev.id, by: ev.by ?? 0, skill: ev.skill, style: ev.style || undefined, x: e?.x, z: e?.z });
          break;
        }
        case 'fx': {
          const at = ev.id != null ? host.entities.get(ev.id) : null;
          host.event({ ...ev, t: undefined, type: 'fx', id: ev.id ?? 0, x: ev.x ?? at?.x, z: ev.z ?? at?.z });
          break;
        }
        // the encounter engine's events go out as they are (docs/encounters.md "Events")
        case 'tele': case 'teleR': case 'castbar': case 'castX': case 'phase': case 'say': case 'enrage': case 'obj': case 'boss': {
          const { t, ...rest } = ev;
          host.event({ ...rest, type: t });
          break;
        }
        default: break;              // spawn/gone/death/reward/move are carried by the entities themselves
      }
    }
    for (const ev of room.drainEvents()) {
      if (ev.kind === 'statusFx' && ev.unit?.id != null) host.event({ type: 'fx', id: ev.unit.id, kind: 'status', status: ev.type, on: ev.on });
    }
  }

  const run = fn => room.run(() => { syncIn(); const out = fn(); syncOut(); flush(); return out; });

  // ------------------------------------------------------------------ the interface

  /** A saved gear blob: A's `char.equipment` is `slot -> item`; an older blob is `{ v, equipment }`. */
  const savedGear = ch => {
    const raw = ch?.equipment?.equipment ? ch.equipment.equipment : ch?.equipment;
    if (!raw || typeof raw !== 'object') return null;
    // only Farhold items (the stand-in rules saved plain `{ name, slot }` objects)
    const items = Object.entries(raw).filter(([, it]) => it && typeof it === 'object' && (it.type === 'weapon' || it.type === 'armor' || it.base || it.baseKey));
    return items.length ? { equipment: Object.fromEntries(items) } : null;
  };

  /** e.rank (room) -> Farhold rank + modifiers: elite = a champion with one modifier, boss = boss. */
  // Farhold's own boss rank is x1 (its bosses are boss DEFINITIONS); a dungeon boss built on an
  // ordinary type is therefore a rare (two modifiers, x4.5 health) that never leashes.
  function rankFor(e, def) {
    const table = engine.bestiary.modifiers || [];
    const named = Array.isArray(e.data?.affixes) ? e.data.affixes.map(id => table.find(m => m.id === id)).filter(Boolean) : null;   // S4: E may place a set champion
    const pick = n => (named && named.length ? named : table.length ? engine.rpg.pickModifiers(table, n, room.streams.get('spawn')) : []);
    const isBossDef = (engine.bestiary.bosses || []).includes(def);
    if (e.rank === 'boss') return isBossDef ? { rank: 'boss', boss: true, modifiers: [] } : { rank: 'rare', boss: true, modifiers: pick(2) };
    if (e.rank === 'elite' || e.rank === 'champion') return { rank: 'champion', modifiers: pick(1), rolled: !!(named && named.length) };
    // a camp E marked 'rare' is a named rare with its own script and health (hpMult) — it stays as it was; only a rare
    // with `data.affixes` (or a rolled one, below) is a Farhold-style rare with modifiers
    if (e.rank === 'rare') return named && named.length ? { rank: 'rare', modifiers: pick(2), name: rareName(engine, room.streams.get('spawn')), rolled: true } : { rank: 'normal', modifiers: [] };
    // play-test 4 S4: an ordinary wilds spawn may come out a champion or a rare (data/rules/affixes.json)
    const rolled = isBossDef ? 'normal' : rollWildRank(engine, room.streams.get('spawn'), { level: e.level || 1, roomKind: host.kind || 'wilds', e });
    if (rolled === 'champion') return { rank: 'champion', modifiers: pick(1), rolled: true };
    if (rolled === 'rare') return { rank: 'rare', modifiers: pick(2), name: rareName(engine, room.streams.get('spawn')), rolled: true };
    return { rank: 'normal', modifiers: [] };
  }

  const lightPay = [];
  function addEntity(e) {
    addEntityInner(e);
    while (lightPay.length) {
      const p = lightPay.pop();
      host.award(p.e, { gold: p.gold, reason: 'lightRefund' });
      host.event({ type: 'fx', kind: 'notice', id: p.e.id, why: 'lightRefund', gold: p.gold, text: `Lanterns and torches were removed from the game — everyone carries a light now. You were paid ${p.gold} gold for yours.` });
    }
  }
  function addEntityInner(e) {
    if (e.kind === 'npc' && adopting) {
      // a follower this module is putting down (spawnEntity above)
      e.r.unit = adopting;
      e.setMax(adopting.maxHp, 0);
      e.setHp(adopting.hp);
      return;
    }
    if (e.kind === 'object' || e.kind === 'npc') return;
    run(() => {
      if (e.kind === 'player') {
        const ch = e.char || {};
        let unit = e.r.unit;
        const handed = !!(unit && unit.skills);
        if (unit && unit.skills) {
          // A HANDOFF (protocol.md §7 M1 notes): the entity arrives with the old room's `r`. Keep the
          // sheet — statuses, cooldowns, mana, barrier — and move it into this room's field.
          unit.homeField?.detach(unit);
          unit.homeField?.room?.combat?.skillRt?.forget(unit);
          unit.id = e.id;
          unit.removed = false;
          unit.x = e.x; unit.y = e.y; unit.z = e.z; unit.yaw = e.yaw;
          unit.dead = !!e.dead;
          // swing clocks are in the old room's seconds: ready now, the pattern starts over
          unit.swing = { mainStep: 0, offStep: 0, mainReady: 0, offReady: 0, readySince: room.clock.now() };
          handoffs++;
        } else {
          unit = createCharacter(engine, {
            id: e.id, classId: ch.cls || e.cls || 'warrior', level: ch.level || e.level || 1, name: e.name,
            rng: makeRng(hashStr(`${ch.id ?? ch.name ?? e.name}:kit`)), x: e.x, z: e.z, y: e.y, yaw: e.yaw,
            gear: savedGear(ch),               // the saved equipment wins over the class kit
          });
          restoreBuild(unit, ch.build);        // P6: saved talents, perks, unlocks
          if (ch.hp > 0) unit.hp = Math.min(ch.hp, unit.maxHp);
          // owner feedback 8 (W22): a lantern / torch that was worn is gone from the game — pay its list price back, once
          if (unit.lightOwed > 0 && host.award) { lightPay.push({ e, gold: unit.lightOwed }); unit.lightOwed = 0; }
          builds++;
        }
        unit.roomRng = room.streams.get('bars');
        unit.partyId = e.data?.partyId ?? ch.partyId ?? null;
        field.add(unit, 'player');
        if (handed) room.followers.receive(unit);          // its followers came with it
        else {
          unit.unlocks = { ...(ch.unlocks || {}), ...(unit.unlocks || {}) };
          // play-test 1 P4: the class companion is EARNED (level / quest / Early Bond), never handed
          // out on the first frame as Farhold's begin() does (js/rules/progression.js)
          grantCompanions(unit);
        }
        e.r.unit = unit;
        e.setMax(unit.maxHp, unit.maxMp ?? 0);
        e.setHp(unit.hp); e.setMp(unit.mp ?? unit.maxMp);
      } else if (e.kind === 'monster') {
        const def = engine.enemyDef(TYPE_ALIASES[e.type] || e.type) || engine.enemyDef('moor_hound');
        const rk = rankFor(e, def);
        // a monster that runs an encounter script: the script's phases, name and mechanics are its only
        // ones — no random rank modifiers, none of its Farhold body's own boss phases (E's asks 3/4)
        const script = enc.scriptFor({ defId: def.id, boss: !!rk.boss, rank: rk.rolled ? 'normal' : rk.rank, encounterId: e.data?.encounter || null });   // S4: a rolled champion / rare fights with its modifiers' specials, not the default elite script
        if (script) rk.modifiers = [];
        const unit = spawnMonster(field, def, e.level || 1, e.x, e.z, { id: e.id, rank: rk.rank, modifiers: rk.modifiers, boss: rk.boss, name: script?.name || rk.name || null });
        // play-test 4 S4: a champion / rare is visibly bigger (a floor, so a Giant stays giant), and the room entity says so
        if (!script && (rk.rank === 'champion' || rk.rank === 'rare') && !rk.boss) {
          const floor = sizeFloor(engine, rk.rank);
          if ((unit.scale || 1) < floor) { const k = floor / (unit.scale || 1); unit.scale = floor; unit.reach = (unit.reach || 2.2) * (1 + (k - 1) * 0.6); }
          if (rk.rolled) { e.rank = rk.rank; e.setState(64, true); unit.affixed = true; }                  // STATE.elite
          if (!e.name || rk.name || rk.rolled) e.name = unit.name;
          e.aff = (rk.modifiers || []).map(m => ({ id: m.id, name: m.prefix || m.name || m.id, ...(m.aura ? { aura: m.aura } : {}) }));
        }
        if ((unit.scale || 1) !== 1) e.sc = Math.round(unit.scale * 100) / 100;
        unit.encounterId = e.data?.encounter || null;
        if (rk.boss) unit.boss = true;
        if (script) {
          unit.phases = null; unit.spawns = null;
          // the room has not described this entity to anyone yet (info goes out with the next snapshot)
          e.name = script.name || e.name;
        }
        // an event boss is scaled up for the crowd (A: `data.scale` = health x)
        const scale = Number(e.data?.scale);
        if (scale > 0 && scale !== 1) { unit.maxHp = Math.round(unit.maxHp * scale); unit.hp = unit.maxHp; }
        // a rare placed by E walks its loop when it is not fighting (monster-ai.js `patrol`)
        const path = e.data?.path;
        if (Array.isArray(path) && path.length >= 2) {
          const pts = path.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([x, z]) => ({ x, z }));
          if (pts.length >= 2) {
            let i = 0, bd = Infinity;
            pts.forEach((p, k) => { const d = Math.hypot(p.x - unit.x, p.z - unit.z); if (d < bd) { bd = d; i = k; } });
            unit.patrol = { pts, i };
          }
        }
        e.r.unit = unit;
        e.setMax(unit.maxHp, 0);
        e.setHp(unit.hp);
        // a warband leader brings its escort and standard-bearer (Farhold actors.js spawnPack)
        if (def.leads?.length && e.data?.escortOf == null && !script) escortFor(field, unit, def);
        // S4: a Pack-leader brings its own kind (two per `escort` pair), linked to it like a warband's escort
        const packOf = !script && e.data?.escortOf == null ? escortCount(engine, unit.modifiers || []) : 0;
        if (packOf > 0) escortFor(field, unit, { leads: Array.from({ length: Math.ceil(packOf / 2) }, () => def.id) });
      }
    });
  }

  function removeEntity(e) {
    room.run(() => {
      const u = e.r.unit;
      for (const p of room.combat.pending) if (p.who === e.id) p.fn = () => {};
      if (!u) return;
      if (u.channel) breakChannel(u, 'left');             // a recall does not survive a room change
      combat.skillRt?.forget(u);
      if (e.kind === 'player') { room.followers.release(u); field.detach(u); }   // sheet and followers live on in the next room
      else if (e.kind === 'npc') field.detach(u);
      else field.remove(u);
    });
  }

  function intent(e, msg) {
    const u = e.r.unit;
    if (!u) return { ok: false, why: 'unknown' };
    if (msg.t === 'target') {
      const t = msg.id ? host.entities.get(msg.id) : null;
      // owner feedback 6 (U11 / T4): a FALLEN party member may be targeted (a revive aims at `e.target`); anything else must be alive
      const fallenFriend = t && t.kind === 'player' && t.dead && t.r?.unit && u.partyId != null && t.r.unit.partyId === u.partyId && Math.hypot(t.x - u.x, t.z - u.z) <= TAB.RANGE * 1.5;
      if (msg.id && !fallenFriend && !validTarget(u, t, { range: TAB.RANGE * 1.5 })) return { ok: false, why: 'target' };
      e.setTarget(msg.id || 0);
      return { ok: true };
    }
    if (msg.t !== 'cast' || !Number.isInteger(msg.slot)) return { ok: false, why: 'unknown' };
    if (u.channel) breakChannel(u, 'acted');           // attacking or casting breaks a recall
    return run(() => {
      // face what the cast is aimed at: the Tab target, else the ground point
      // play-test 2 (found by the Q28 class-quest trials): a skill aimed at YOURSELF or a friend used to turn
      // you to atan2(0, 0) = due north (or toward the friend), so the swing already winding up at your enemy
      // landed on empty air — a knight who kept Sworn Guard up never hit anything again. Only an enemy, or a
      // ground point that is not under your feet, turns you.
      const t = msg.target != null ? host.entities.get(msg.target) : null;
      const far = (x, z) => Math.hypot(x - u.x, z - u.z) > 0.05;
      const hostile = t && !t.dead && t !== e && t.r?.unit && t.r.unit.side === 'foe';
      if (hostile && far(t.x, t.z)) u.yaw = Math.atan2(t.x - u.x, t.z - u.z);
      else if (!t && msg.aim && Number.isFinite(msg.aim.x) && Number.isFinite(msg.aim.z) && far(msg.aim.x, msg.aim.z)) u.yaw = Math.atan2(msg.aim.x - u.x, msg.aim.z - u.z);
      e.face(u.yaw);
      const tUnit = t && !t.dead && t.r?.unit && t.r.unit !== u ? t.r.unit : null;
      const res = msg.slot === 0
        ? combat.attack(u, { yaw: u.yaw, held: msg.held, target: tUnit })
        : combat.cast(u, msg.slot - 1, { aim: msg.aim, target: msg.target ?? null, yaw: u.yaw });
      // play-test 5 T7 (and T6's data half): with a weapon in each hand the OFF hand swings too, half a beat after the
      // main hand, on its own clock (Farhold's two timers). Thousandvale only ever sent the main hand, so a second
      // weapon — or a second two-hander under Doubled Grasp — was dead weight. An off-hand wand fires its own bolt.
      if (msg.slot === 0 && res.ok && engine.casterForms) {
        const hands = weaponHands(u);
        if (hands.dual && !isHeldFocus(hands.off)) {
          combat.later(Math.max(0.12, (res.every || 0.6) * 0.5), () => {
            if (u.dead || u.removed || !weaponHands(u).dual) return;
            if (tUnit && tUnit.dying == null && !tUnit.removed) u.yaw = Math.atan2(tUnit.x - u.x, tUnit.z - u.z);
            combat.attack(u, { hand: 'off', yaw: u.yaw, target: tUnit });
          }, u.id);
        }
      }
      if (res.ok) return { ok: true };
      return { ok: false, why: whyCode(res.why), text: res.why };
    });
  }

  function step(dtMs) {
    const dt = dtMs / 1000;
    run(() => {
      room.clock.advance(dt);
      combat.tick(dt);                 // due wind-ups, then the monsters (tickMonsters below), bars, runtime
      // Farhold's one-second regen tick (main.js ~9762) and the cast barrier running down
      regenClock += dt;
      const second = regenClock >= 1;
      if (second) regenClock -= 1;
      // who is being fought: one pass over the monsters a second, not one per player
      const fought = second ? new Set() : null;
      if (second) for (const m of field.monsters) if (m.dying == null && m.targetId != null) fought.add(m.targetId);
      const night = second ? !!host.isNight?.() : null;
      for (const p of field.players) {
        if (p.channel) tickChannel(p, dt);
        if (p.dead) continue;
        perkTick(field, p, dt, second);    // perk forest: standing still, the Banner's aura
        if (!second) continue;
        p._night = night;                  // a lit torch's night bonus (buffs.js itemStrikeMult)
        sheetCheck(p);                     // an armour / health buff ran out: re-derive the sheet
        const fighting = fought.has(p.id);
        const mending = fighting ? 0 : p.maxHp * (engine.balance.player?.outOfCombatRegen ?? 0.015);
        p.hp = Math.min(p.maxHp, p.hp + (p.derived.hpRegen || 0) + mending);
        if (!Object.values(p.statuses || {}).some(st => st.noManaRegen)) p.mp = Math.min(p.maxMp, p.mp + (p.derived.mpRegen || 0) + (fighting ? 0 : p.maxMp * 0.02));
        const ent = entOf(p);
        if (ent) ent.setState(2, fighting);
      }
    });
    tickSheets();                    // T18: one slice of a character sheet being measured (outside the room's own turn)
    // a finished channel's effect (a recall moves the player to another room) runs outside the rules' turn
    while (channelsDone.length) { const f = channelsDone.shift(); try { f(); } catch { /* the room's own errors are its own */ } }
  }

  function respawn(e) {
    run(() => {
      const u = e.r.unit;
      if (!u) return;
      u.dead = false; u.killedBy = null;
      endStatuses(u);                       // Q8 (already ended at the death; this catches a body revived some other way)
      if (u._sheetKey !== sheetKey(u)) { u._sheetKey = sheetKey(u); engine.rpg.refresh(u, { full: true }); }   // shop buffs ended with the death
      u.hp = u.maxHp; u.mp = u.maxMp;      // Farhold R22: a respawn restores health AND mana
      for (const m of field.monsters) if (m.threat?.has(u.id)) { m.threat.delete(u.id); if (m.targetId === u.id) m.targetId = null; }
      u.x = e.x; u.z = e.z;
    });
  }

  /**
   * Play-test 2 (A's consumables: potions and food). Minimal hooks A calls; stream C owns them.
   * restore(e, {hp, mp}) adds to the unit (clamped), returns what was actually restored.
   * cleanse(e, ids) removes those statuses (fx status off each), returns the ids removed.
   */
  function restore(e, { hp = 0, mp = 0 } = {}) {
    const u = e?.r?.unit;
    if (!u || u.dead || e.dead) return { hp: 0, mp: 0 };
    return run(() => {
      const h0 = u.hp, m0 = u.mp;
      u.hp = Math.min(u.maxHp, u.hp + Math.max(0, hp));
      u.mp = Math.min(u.maxMp, u.mp + Math.max(0, mp));
      return { hp: u.hp - h0, mp: u.mp - m0 };
    });
  }
  function cleanse(e, ids = []) {
    const u = e?.r?.unit;
    if (!u || !u.statuses) return [];
    return run(() => {
      const out = [];
      for (const id of ids) if (u.statuses[id]) { delete u.statuses[id]; out.push(id); host.event({ type: 'fx', id: e.id, kind: 'status', status: id, on: false }); }
      return out;
    });
  }

  // ------------------------------------------------------------------ shop buffs, torches, recall, revive flasks

  const channelsDone = [];
  /** An armour/health buff came or went: re-derive the sheet (health keeps its share). Never on the dead. */
  function sheetCheck(u) {
    const k = sheetKey(u);
    if ((u._sheetKey ?? '0|0') === k || u.dead) return;
    u._sheetKey = k;
    engine.rpg.refresh(u);
  }
  function tickChannel(u, dt) {
    const c = u.channel;
    if (u.dead) return breakChannel(u, 'dead');
    if (Math.hypot(u.x - c.x, u.z - c.z) > c.drift) return breakChannel(u, 'moved');
    if (u.hp < c.hp - 0.5) return breakChannel(u, 'hit');
    c.hp = Math.max(c.hp, u.hp);
    c.left -= dt;
    if (c.left > 0) return;
    u.channel = null;
    host.event({ type: 'fx', kind: 'channel', id: u.id, name: c.name, end: 'done' });
    if (c.done) channelsDone.push(c.done);
  }
  function breakChannel(u, why) {
    const c = u.channel;
    if (!c) return;
    u.channel = null;
    host.event({ type: 'fx', kind: 'channel', id: u.id, name: c.name, end: 'broken', why });
    c.broken?.(why);
  }

  /**
   * Use a consumable whose effect is the rules' (the lead's follow-up to play-test 2). `use` = stream E's
   * goods `use` block (shops.json goodsCatalog) or A's potion effect (`{ type: 'revive' }`):
   *   { type: 'buff', buff: { stat, amount, minutes } }   a timed self-buff (one per kind; buffs.js)
   *   { type: 'light' }                                   REFUSED, why 'gone' (owner feedback 8 W22: torches are removed; A refunds them)
   *   { type: 'cleanse', statuses, heal }                 a poultice: those statuses off + a share of max health
   *   { type: 'recall' }                                  a 5 s channel, standing still; `opts.done()` runs when it
   *                                                       completes (A: consume the charm, travel to the bound inn)
   *   { type: 'revive' }                                  raise a dead party member within 10 m (`opts.target` = id,
   *                                                       else the nearest) at 40% health
   * Returns { ok, consume: true|false (false = A consumes in `done`), msg, ... } or { ok: false, why, text }.
   */
  function useItem(e, use, opts = {}) {
    const u = e?.r?.unit;
    if (!u || !use || typeof use !== 'object') return { ok: false, why: 'item', text: 'You cannot use that.' };
    if (u.dead || e.dead) return { ok: false, why: 'dead', text: 'You are dead.' };
    const name = opts.name || 'That';
    if (use.type === 'light') return { ok: false, why: 'gone', text: 'Torches were removed from the game — everyone carries a light now. A merchant will pay you back for it.' };
    if (use.type === 'buff') {
      const spec = use.buff;
      const r = run(() => {
        const out = applyItemBuff(u, spec, { source: opts.itemId || null });
        if (out.ok) { host.event({ type: 'fx', id: u.id, kind: 'status', status: out.id, on: true }); sheetCheck(u); }
        return out;
      });
      if (!r.ok) return { ok: false, why: 'notYet', text: r.why };          // a buff with no numbers on it (kept, not spent)
      return { ok: true, consume: true, buff: r.id, stat: r.stat, amount: r.amount, ms: r.seconds * 1000, msg: r.refreshed ? `${name}: refreshed.` : `${name}: ${Math.round(r.seconds / 60)} minutes.` };
    }
    if (use.type === 'cleanse') {
      const gone = cleanse(e, use.statuses || []);
      const got = use.heal > 0 ? restore(e, { hp: use.heal * u.maxHp }) : { hp: 0 };
      if (!gone.length && !(got.hp > 0)) return { ok: false, why: 'full', text: 'Nothing to treat.' };
      return { ok: true, consume: true, cleansed: gone, hp: got.hp };
    }
    if (use.type === 'recall') {
      if (u.channel) return { ok: false, why: 'busy', text: 'You are already busy.' };
      if (combatNow(u)) return { ok: false, why: 'combat', text: 'Not while you are fighting.' };
      const seconds = RECALL.seconds;
      run(() => { u.channel = { name: opts.name || 'Recall', left: seconds, x: u.x, z: u.z, hp: u.hp, drift: RECALL.drift, done: opts.done || null, broken: opts.broken || null }; });
      host.event({ type: 'fx', kind: 'channel', id: u.id, name: opts.name || 'Recall', ms: seconds * 1000 });
      return { ok: true, consume: false, channel: seconds * 1000, msg: `Stand still for ${seconds} seconds.` };
    }
    if (use.type === 'revive') {
      return run(() => {
        const want = opts.target != null ? field.get(opts.target) : null;
        const ok = p => p && p.kind === 'player' && p.dead && p !== u && u.partyId != null && p.partyId === u.partyId && Math.hypot(p.x - u.x, p.z - u.z) <= REVIVE_FLASK.range;
        const to = ok(want) ? want : field.players.filter(ok).sort((a, b) => Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z))[0];
        if (!to) return { ok: false, why: 'target', text: `No fallen party member within ${REVIVE_FLASK.range} m.` };
        endStatuses(to);
        to.dead = false; to.killedBy = null;
        to.hp = Math.max(1, Math.round(to.maxHp * REVIVE_FLASK.share));
        to.revivedBy = u.id;
        for (const m of field.monsters) if (m.threat?.has(to.id)) { m.threat.delete(to.id); if (m.targetId === to.id) m.targetId = null; }
        field.emit({ t: 'revive', id: to.id, by: u.id, hp: to.hp });
        return { ok: true, consume: true, revived: to.id, hp: to.hp };
      });
    }
    return { ok: false, why: 'notYet', text: `${name} does nothing yet.` };
  }
  /** Fighting = a monster has you as its target. */
  const combatNow = u => field.monsters.some(m => m.dying == null && m.targetId === u.id);
  /**
   * The shop buffs on an entity: { dmgPct, armorPct, mountSpeedPct, ... } (A: riding speed). Owner feedback 8 (W22): there
   * are no light items any more — `lightRange` is the SAME for everyone (LIGHT.radius), kept on this answer so a client
   * that read it for the torch gets the wider light with no change.
   */
  function itemBuffs(e) {
    const u = e?.r?.unit;
    if (!u || u.dead) return {};
    const out = itemBuffsOf(u);
    out.lightRange = lightOf(engine).radius;
    return out;
  }
  /** W19: bag slots the worn backpack gives (0 without one). */
  const bagBonus = e => bagBonusOf(e?.r?.unit?.equipment?.back);
  /**
   * W19: may the thing on the back come off (or be swapped for `item`)? A passes what the bag holds and its own base
   * size; the answer is `{ ok:false, why:'bagSlots', need, text }` when the bag would no longer fit.
   */
  function packCheck(u, incoming, { bagCount = null, bagBase = null } = {}) {
    if (bagCount == null || bagBase == null) return null;
    const cap = bagBase + bagBonusOf(incoming);
    const count = bagCount + (u.equipment?.back ? 1 : 0) - (incoming ? 1 : 0);        // the old one goes INTO the bag; the new one leaves it
    if (count <= cap) return null;
    const need = count - cap;
    return { ok: false, why: 'bagSlots', need, text: `Empty ${need} more bag slot${need === 1 ? '' : 's'} first — the pack's extra room is holding things.` };
  }
  function canUnequip(e, slot, opts = {}) {
    const u = e?.r?.unit;
    if (!u || !u.equipment?.[slot]) return { ok: false, text: 'Nothing is worn there.' };
    if (slot === 'back' && bagBonusOf(u.equipment.back) > 0) { const no = packCheck(u, null, opts); if (no) return no; }
    return { ok: true };
  }
  /** W22: gold owed for a light that was worn when this character was last saved (0 when none); reading it clears it. */
  function lightRefundOwed(e) {
    const u = e?.r?.unit;
    const n = u?.lightOwed || 0;
    if (u) u.lightOwed = 0;
    return n;
  }

  function onLevel(e) {
    run(() => {
      const u = e.r.unit;
      if (!u) return;
      u.level = e.char?.level || e.level;
      engine.rpg.refresh(u, { full: true });
      u.hp = u.maxHp; u.mp = u.maxMp;
      e.setLevel(u.level);
      grantCompanions(u);                  // P4: a companion that comes at this level arrives now
    });
    host.barChanged?.(e);                  // a slot may have opened (Farhold's 1/3/6/12/18/24 ladder)
  }

  /**
   * P4 — the class companion bodies this character has earned and does not have yet (each body is
   * given once per sheet; a fallen one comes back through the follower brain, a handoff carries it).
   * `rulesOpts.companions === false` turns class companions off altogether (tests, tools).
   */
  function grantCompanions(unit) {
    if (rulesOpts.companions === false || !room.followers) return [];
    const classDef = engine.classById(unit.classId);
    const given = unit.companionsGiven || (unit.companionsGiven = {});
    const out = [];
    for (const due of companionsDue(unit, classDef, engine.progression.companions)) {
      if (given[due.which]) continue;
      given[due.which] = true;
      const made = room.followers.summon(due.id, unit, { count: due.count, origin: 'companion' });
      for (const p of made) out.push(p);
      if (made.length) field.emit({ t: 'fx', kind: 'companion', id: unit.id, defId: due.id, which: due.which });
    }
    return out;
  }

  /**
   * A quest (or anything A rewards) unlocks something early: 'companion' / 'companion2' (P4).
   * Saved by A in the character's build (`saveBuild(e).unlocks`). Returns { ok, unlocks }.
   */
  function unlock(e, key, { source = null } = {}) {
    const u = e.r.unit;
    if (!u || !UNLOCK_KEYS.includes(key)) return { ok: false, text: 'Nothing to unlock.' };
    const out = run(() => {
      if (key === 'perk') {
        // Q28: an extra perk point, once per source (a quest id) so a re-sent turn-in never pays twice
        const tag = 'perk:' + String(source ?? 'any');
        if (u.unlocks?.[tag]) return { ok: false, text: 'Already given.', unlocks: { ...u.unlocks } };
        u.unlocks = { ...(u.unlocks || {}), [tag]: true };
        u.bonusPerks = (u.bonusPerks || 0) + 1;
        return { ok: true, unlocks: { ...u.unlocks }, bonusPerks: u.bonusPerks };
      }
      u.unlocks = { ...(u.unlocks || {}), [key]: true };
      grantCompanions(u);
      return { ok: true, unlocks: { ...u.unlocks } };
    });
    if (out.ok && key !== 'companion' && key !== 'companion2') host.barChanged?.(e);
    return out;
  }

  // ------------------------------------------------------------------ gear (protocol.md §7 M1, A's ask 3)

  function equip(e, item, slot = null, opts = {}) {
    const u = e.r.unit;
    if (!u || !item || typeof item !== 'object') return { ok: false, text: 'Nothing to equip.' };
    if (isLightRaw(item, engine.tvGear)) return { ok: false, why: 'gone', text: 'Lanterns and torches were removed from the game — everyone carries a light now.' };
    if ((slot || item.slot) === 'back' && item.slot === 'back') { const no = packCheck(u, item, opts); if (no) return no; }
    // play-test 5 slots: a cloak (`back`) and a belt (`waist`) are Thousandvale's own slots — Farhold's `equip` does not
    // know them, so they are put on here (its level rule still asked); the sheet sums their properties like any ring's
    const want = slot || item.slot;
    if (TV_SLOTS.includes(want)) {
      if (item.slot !== want) return { ok: false, text: `${item.name || 'That'} will not go in that slot.` };
      const why = engine.rpg.equipRefusal(u, item, { into: want });
      if (why) return { ok: false, text: why };
      return run(() => { const old = u.equipment[want] || null; u.equipment[want] = item; engine.rpg.refresh(u); return { ok: true, removed: old ? [old] : [] }; });
    }
    return run(() => {
      // the bag is the room's (char.bag), never the sheet's: whatever Farhold moves into `u.bag` is
      // handed back as `removed` and taken off the sheet again
      const bagBefore = u.bag.length;
      const out = engine.rpg.equip(u, item, { into: slot || null });
      if (out && out.refused) return { ok: false, text: out.refused };
      const removed = u.bag.splice(bagBefore).filter(it => it !== item);
      u.bag = u.bag.filter(it => it !== item);
      if (!Object.values(u.equipment).includes(item)) return { ok: false, text: `${item.name || 'That'} will not go in that slot.`, removed };
      engine.rpg.refresh(u);
      return { ok: true, removed };
    });
  }
  function unequip(e, slot, opts = {}) {
    const u = e.r.unit;
    if (!u || !u.equipment?.[slot]) return { ok: false, text: 'Nothing is worn there.' };
    if (slot === 'back') { const no = packCheck(u, null, opts); if (no) return no; }
    if (TV_SLOTS.includes(slot)) return run(() => { const item = u.equipment[slot]; u.equipment[slot] = null; engine.rpg.refresh(u); return { ok: true, item }; });
    return run(() => {
      const item = engine.rpg.unequip(u, slot);
      u.bag = u.bag.filter(it => it !== item);      // the room puts it in char.bag
      return { ok: !!item, item };
    });
  }
  // ------------------------------------------------------------------ play-test 5: kits, crates, items, the sheet
  /** T5: put the chosen starter kit on a brand-new character (replaces whatever it wears). `{ ok, items, kit }`. */
  function applyKit(e, choice = {}) {
    const u = e?.r?.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    const v = validKitRaw(u.classId, choice, engine.kits);
    const gearSet = v.ok ? starterGearRaw(u.classId, v, engine.kits, engine) : null;
    if (!gearSet) return { ok: false, text: 'No such kit.' };
    return run(() => {
      for (const slot of Object.keys(u.equipment || {})) if (['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet'].includes(slot)) u.equipment[slot] = null;
      for (const [slot, item] of Object.entries(gearSet)) u.equipment[slot] = item;
      engine.rpg.refresh(u, { full: true });
      u.hp = u.maxHp; u.mp = u.maxMp;
      for (const sl of u.skills?.slots || []) sl.views = null;
      return { ok: true, items: Object.values(gearSet), kit: { armour: v.armour, weapons: v.weapons } };
    });
  }
  /** T23 / E: one item of a named base — `{ base, rarity?, level? }` (level defaults to the player's). Null for an unknown base. */
  function makeItem(e, spec = {}) {
    if (!engine.makeItem || !spec?.base) return null;
    const lvl = spec.level || e?.r?.unit?.level || e?.level || 1;
    const it = engine.makeItem({ base: spec.base, rarity: spec.rarity || 'normal', level: lvl, rng: room.streams.get('loot') });
    if (it) it.uid = `${room.id}:m${++madeN}`;
    return it;
  }
  let madeN = 0;
  /** T9 / T20: a crate or gift box for `e` (or for nobody yet: `e` null). `spec` in E's, A's or C's words. */
  function makeCrate(e, spec = {}) {
    const u = e?.r?.unit;
    const s = { ...spec };
    if (u && s.level == null && s.maxLevel == null && s.capLevel !== false && !s.gift) s.level = u.level || 1;       // never more than 3 levels above where it was earned
    const it = makeCrateItem(engine.crates, s);
    it.uid = `${room.id}:c${++madeN}`;
    return it;
  }
  /** T9 / T20: open it — `[item…]`, rolled now at the opener's level for the opener's class (the room's loot stream). */
  function openCrate(e, item) {
    const u = e?.r?.unit;
    if (!isCrate(item)) return [];
    const out = openCrateItem(engine, item, { cls: u?.classId || e?.char?.cls || null, level: u?.level || e?.level || 1, rng: room.streams.get('loot'), magicFind: u?.derived?.magicFind || 0 });
    for (const it of out) it.uid = `${room.id}:m${++madeN}`;
    return out;
  }
  /** T18: the character sheet (js/rules/estimate.js): core + advanced stats and every ability's MEASURED damage per second. */
  function sheet(e) {
    const u = e?.r?.unit;
    if (!u) return null;
    const rows = statRows(engine, u);
    const have = cachedAbilities(u);
    if (have) { sheetJobs.delete(u); return { ...rows, abilities: have, pending: false }; }
    // not measured for this build yet: measure it a slice a tick (never a stall), hand back what is known so far,
    // and tell the room when it is complete (`host.sheetChanged(e)`) so it can send the finished sheet
    let job = sheetJobs.get(u);
    if (!job || job.j.stale) { job = { j: sheetJob(engine, u) }; sheetJobs.delete(u); sheetJobs.set(u, job); }
    return { ...rows, abilities: job.j.rows(), pending: true };
  }
  const sheetJobs = new Map();
  /** One slice of one pending sheet per tick (js/rules/estimate.js `sheetJob`): a few milliseconds, round-robin. */
  function tickSheets() {
    const next = sheetJobs.entries().next().value;
    if (!next) return;
    const [u, job] = next;
    sheetJobs.delete(u);
    if (u.removed || !field.byId.has(u.id)) return;
    let done = false;
    try { done = job.j.step(); } catch { done = true; }
    if (!done) { sheetJobs.set(u, job); return; }             // back of the queue
    if (job.j.stale) return;                                   // the build changed meanwhile: the next `sheet` starts over
    const ent = entOf(u);
    if (ent) host.sheetChanged?.(ent);
  }
  /** T18: the same sheet as if `item` were worn in `slot` (a compare before you equip). */
  function sheetWith(e, item, slot = null) {
    const u = e?.r?.unit;
    return u && item ? sheetWithItem(engine, u, item, slot) : null;
  }

  /** T7: would `item` go into `slot` right now? Asks without doing: `{ ok, text }` (Farhold's own sentence when not). */
  function canEquip(e, item, slot = null, opts = {}) {
    const u = e?.r?.unit;
    if (!u || !item || typeof item !== 'object') return { ok: false, text: 'Nothing to equip.' };
    if (isLightRaw(item, engine.tvGear)) return { ok: false, why: 'gone', text: 'Lanterns and torches were removed from the game — everyone carries a light now.' };
    if ((slot || item.slot) === 'back' && item.slot === 'back') { const no = packCheck(u, item, opts); if (no) return no; }
    if (TV_SLOTS.includes(slot || item.slot) && item.slot !== (slot || item.slot)) return { ok: false, text: `${item.name || 'That'} will not go in that slot.` };
    const why = engine.rpg.equipRefusal(u, item, { into: slot || null });
    return why ? { ok: false, text: why } : { ok: true };
  }
  const gear = e => ({ ...(e.r.unit?.equipment || {}) });
  const saveGear = e => (e.r.unit ? serializeGear(e.r.unit).equipment : {});
  /**
   * A chest's roll for `e`. `tier` is either a chest kind or a RARITY NAME, read as "at least this
   * rarity" (A's M3 ask; E's data uses common/uncommon/rare/epic/legendary). Farhold's ladder is
   * normal < magic < rare < legendary, so: uncommon = magic or better, rare = rare or better,
   * epic = rare or better at a doubled rarity roll PLUS a second magic-or-better item, legendary =
   * a legendary (a set piece or a unique when one fits the level). 'reward' = a guaranteed item one
   * rarity up (unchanged); anything else ('normal', 'chest', 'common', unknown) = the plain roll.
   */
  function rollLoot(e, { level = null, tier = 'normal' } = {}) {
    const u = e.r.unit;
    const lvl = level || u?.level || e.level || 1;
    const items = [];
    const rng = room.streams.get('loot');
    const magicFind = u?.derived?.magicFind || 0;
    const spec = LOOT_TIERS[tier] || null;
    const rolls = spec ? spec.rolls : [{ chance: null, rarityBoost: 1, floor: null }];
    for (const r of rolls) {
      const one = engine.rpg.rollDrop({ level: lvl, rng, magicFind, chance: r.chance, rarityBoost: r.rarityBoost, floor: r.floor });
      if (one) items.push(one);
    }
    return items;
  }
  /** A player used a rules-owned object (an arena brazier or lever): the room routes `use` here. */
  function useObject(e, obj) {
    const u = e.r.unit;
    if (!u || !obj) return { ok: false, why: 'gone' };
    return run(() => enc.use(u, obj.id));
  }
  /**
   * The Callboard popped a short group (A's M3 hook): fill `n` empty seats with hired followers of the
   * MISSING roles, owned by `e` (the first member in), so they fight, tank and heal with the normal
   * follower brain. `roles` (optional) = the roles already in the group (e.g. the pop's); without it
   * the roles are guessed — `e`'s own class role, and the other members fill damage seats first
   * (tanks and healers are the scarce queue, which is why a pop goes short). Seat-fillers sit outside
   * the follower-slot gate, revive like any follower, heal the whole party, and are dismissed when
   * their owner leaves the room. Returns [{ id, defId, role, name }].
   */
  function backfill(e, n, { roles = null } = {}) {
    const u = e?.r?.unit;
    const seats = Math.max(0, Math.min(4, n | 0));
    if (!u || !seats) return [];
    return run(() => {
      const missing = missingRoles(roles || [roleOfClass(engine.classById(u.classId))], seats);
      const out = [];
      let dps = 0;
      for (const role of missing) {
        const defId = role === 'dps' ? BACKFILL.dps[(dps++) % BACKFILL.dps.length] : BACKFILL[role];
        const made = room.followers.summon(defId, u, { origin: 'hireling', gate: false, backfill: { role } });
        for (const p of made) out.push({ id: p.id, defId: p.defId, role, name: p.name });
      }
      return out;
    });
  }

  function onParty(e, id) { const u = e.r.unit; if (u) u.partyId = id ?? null; }

  /**
   * Play-test 5 T4 — the fallen player ACCEPTED a revive offer (A's `host.offerRevive` flow). `spec` is what the offer
   * carried (`rt.reviveSpec`: hpPct, mpPct, apply, skill, style, by). Stands the unit up if the room has not, cleans
   * it, drops it from every threat table and adds the skill's rider. Returns { ok, hp }.
   */
  function revived(e, spec = {}) {
    const u = e?.r?.unit;
    if (!u || u.kind !== 'player') return { ok: false, why: 'notPlayer' };
    return run(() => {
      const by = spec.by != null ? field.get(spec.by) : null;
      runtimeFor(combat).reviveUnit(u, spec, by || null);
      return { ok: true, hp: Math.round(u.hp) };
    });
  }

  // ------------------------------------------------------------------ build: talents and perks (P6)

  /**
   * A saved build back on a sheet: `{ v, talents, perks, bonusPerks, unlocks }` (saveBuild's shape).
   * Picks that no longer exist and perks that no longer connect to the middle are dropped, never kept
   * as dead weight; a perk count past what the level pays is cut from the end.
   */
  function restoreBuild(u, build) {
    if (!build || typeof build !== 'object') { u.perks = u.perks || []; return; }
    u.unlocks = { ...(build.unlocks || {}), ...(u.unlocks || {}) };      // before cleanTalents: `talents1` opens tier 1 early
    u.skillTalents = build.talents && typeof build.talents === 'object' ? JSON.parse(JSON.stringify(build.talents)) : {};
    cleanTalents(engine, u);
    u.bonusPerks = Math.max(0, build.bonusPerks | 0);
    if (Array.isArray(build.buffs) && build.buffs.length) { restoreItemBuffs(u, build.buffs); engine.rpg.refresh(u); u._sheetKey = sheetKey(u); }
    const forest = engine.forest;
    const want = Array.isArray(build.perks) ? build.perks.filter(id => typeof id === 'string' && forest.byId.has(id) && id !== 'start') : [];
    u.perks = [];
    // re-take in the saved order: anything that no longer connects, or past the points, falls away
    let progress = true;
    const left = new Set(want);
    while (progress && left.size) {
      progress = false;
      for (const id of [...left]) if (canTakePerk(u, forest, id).ok) { allocatePerk(u, forest, id); left.delete(id); progress = true; }
    }
    engine.rpg.refresh(u, { full: true });
  }
  /** What A saves for the build (char.build). */
  function saveBuild(e) {
    const u = e.r.unit;
    if (!u) return null;
    return { v: 1, talents: JSON.parse(JSON.stringify(u.skillTalents || {})), perks: [...(u.perks || [])], bonusPerks: u.bonusPerks || 0, unlocks: { ...(u.unlocks || {}) }, buffs: saveItemBuffs(u) };
  }
  /** The build changed: the sheet is re-derived, a companion that is now due arrives, the bar is resent. */
  function buildChanged(e, u) {
    engine.rpg.refresh(u);
    grantCompanions(u);
    for (const sl of u.skills?.slots || []) sl.views = null;
    field.emit({ t: 'fx', kind: 'build', id: u.id });
    host.barChanged?.(e);
  }
  const ret = (e, res) => (res.ok ? { ...res, bar: bar(e), build: saveBuild(e) } : { ok: false, text: res.why || res.text || 'Not now.' });

  /** The talent screen (D): every skill on the bar, every tier, every node, what is picked. */
  function talents(e) {
    const u = e.r.unit;
    if (!u?.skills) return { tiers: TIER_LEVELS, skills: [] };
    return { tiers: TIER_LEVELS, level: u.level, skills: room.run(() => talentView(engine, u)) };
  }
  function pickTalent(e, skillId, tier, nodeId) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    return ret(e, run(() => { const r = pickTalentFor(engine, u, skillId, tier, nodeId); if (r.ok) buildChanged(e, u); return r; }));
  }
  /** The Unbinder takes one talent off (A charges `retrainPrice(e, 'talent')` first). */
  function unpickTalent(e, skillId, tier) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    return ret(e, run(() => { const r = unpickTalentFor(u, skillId, Number(tier)); if (r.ok) buildChanged(e, u); return r; }));
  }
  /** Every talent (or every talent of one skill) off (A charges `retrainPrice(e, 'talent', 'all')`). */
  function resetTalents(e, skillId = null) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    return ret(e, run(() => { const n = resetTalentsFor(u, skillId); if (n) buildChanged(e, u); return n ? { ok: true, removed: n } : { ok: false, why: 'No talents to take off.' }; }));
  }

  let forestCache = null;
  /** The forest's shape (static per process — the client may cache it): arms, nodes with cards, links. */
  const perkForest = () => (forestCache ||= forestView(engine.forest));
  /** This character's walk through the forest. */
  function perks(e) {
    const u = e.r.unit;
    if (!u) return null;
    return { total: perkPointsFor(u.level || 1) + (u.bonusPerks || 0), spent: perkSpent(u), left: perkPointsLeft(u), taken: [...(u.perks || [])], flags: Object.keys(u.perkFlags || {}).filter(k => u.perkFlags[k]) };
  }
  function takePerk(e, id) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    return ret(e, run(() => { const r = allocatePerk(u, engine.forest, id); if (r.ok) buildChanged(e, u); return r.ok ? { ok: true, node: { id, name: r.node?.name } } : r; }));
  }
  /** The Unbinder gives one perk back (only an end of a walk: Farhold's canRefund). A charges first. */
  function refundPerk(e, id) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    const grip = gripHeld(u, id);
    if (grip) return { ok: false, text: grip };
    return ret(e, run(() => { const r = refundPerkFor(u, engine.forest, id); if (r.ok) buildChanged(e, u); return r.ok ? { ok: true } : r; }));
  }
  /**
   * Play-test 5 T7: Doubled Grasp cannot be given back while it is what holds your second weapon — otherwise a
   * two-hander would be left in an off hand that may not hold it (and would vanish on the next login).
   */
  function gripHeld(u, id = null) {
    if (!u?.perkFlags?.doubleGrip) return null;
    const node = id ? engine.forest.byId.get(id) : null;
    if (id && node?.flag !== 'doubleGrip') return null;
    const main = u.equipment?.weapon, off = u.equipment?.offhand;
    if (off && off.type === 'weapon' && (main?.twoHanded || off.twoHanded)) return `Take ${off.name} out of your off hand first: Doubled Grasp is what lets you hold it.`;
    return null;
  }
  function resetPerks(e) {
    const u = e.r.unit;
    if (!u) return { ok: false, text: 'Not here.' };
    const grip = gripHeld(u);
    if (grip) return { ok: false, text: grip };
    return ret(e, run(() => { const n = refundAllPerks(u); if (n) buildChanged(e, u); return n ? { ok: true, removed: n } : { ok: false, why: 'No perks to give back.' }; }));
  }
  // ---- A's contract (docs/protocol.md §17.2): one entry each for the `talent` and `perk` messages ----
  const whyOf = t => (/level/i.test(t || '') ? 'level' : /already|Unbinder/i.test(t || '') ? 'taken' : /points/i.test(t || '') ? 'points'
    : /connects/i.test(t || '') ? 'connect' : /not on your bar|not on this tier|No such/i.test(t || '') ? 'unknown' : /only reach|reach the middle/i.test(t || '') ? 'needed' : 'unknown');
  const picksMap = u => JSON.parse(JSON.stringify(u.skillTalents || {}));
  /** `talent {op: 'pick' | 'clear', skill, tier, node}` -> { ok, why?, text?, picks, talents }. `clear` with a tier empties that tier, without one the whole skill. */
  function talent(e, op, { skill = null, tier = null, node = null } = {}) {
    let r;
    if (op === 'pick') r = pickTalent(e, skill, Number(tier), node);
    else if (op === 'clear') r = tier != null ? unpickTalent(e, skill, Number(tier)) : resetTalents(e, skill || null);
    else return { ok: false, why: 'op', text: 'No such talent action.' };
    const u = e.r.unit;
    if (!r.ok) return { ok: false, why: whyOf(r.text), text: r.text };
    return { ok: true, picks: skill ? picksMap(u)[skill] || {} : null, talents: picksMap(u) };
  }
  /** `perk {op: 'take' | 'refund' | 'reset', id}` -> { ok, why?, text?, perks, left }. */
  function perk(e, op, { id = null } = {}) {
    let r;
    if (op === 'take') r = takePerk(e, id);
    else if (op === 'refund') r = refundPerk(e, id);
    else if (op === 'reset') r = resetPerks(e);
    else return { ok: false, why: 'op', text: 'No such perk action.' };
    if (!r.ok) return { ok: false, why: whyOf(r.text), text: r.text };
    const p = perks(e);
    return { ok: true, perks: p.taken, left: p.left };
  }
  /**
   * The build view A sends as `you {talents, perks, perkPoints, …}`: the picks, the walk, the points,
   * and the talent screen's tree (`talentTree`, rules.talents) — the forest's own shape is static
   * (`rules.perkForest()`, or js/rules/perk-forest.js `buildTvForest(data/rules/perks.json)` on the client).
   */
  function build(e) {
    const u = e.r.unit;
    if (!u) return {};
    const p = perks(e);
    return { talents: picksMap(u), perks: p.taken, perkPoints: { total: p.total, spent: p.spent, left: p.left }, talentTree: talents(e).skills, companion: companionInfo(u, engine.classById(u.classId), engine.progression.companions) };
  }

  /** What the Unbinder charges: `kind` 'talent' | 'perk', `scope` 'one' | 'all' (Farhold's balance.retrain). */
  // owner feedback 7: the Unbinder is priced in minutes of questing at your level (data/rules/prices.json `retrain`);
  // Farhold's own table (68-320 gold) only when that knob is absent (a parity engine)
  const retrainPrice = (e, kind = 'talent', scope = 'one') => {
    const lvl = e?.r?.unit?.level || e?.level || 1;
    return retrainPriceTv(engine.prices, kind, scope, lvl) ?? retrainPriceOf(kind, scope, lvl, engine.balance.retrain || null);
  };

  /**
   * The player's skill bar as the client draws it (A's `you.bar`, D's ask): Farhold's own bar, so a
   * talent, a form or a stance that changes a slot shows. `ally` = aim it at a friend (send the
   * friendly `target`); `group` = it reaches the party by itself. Text only here — never in the tick.
   */
  function bar(e) {
    const u = e.r.unit;
    if (!u?.skills) return [];
    return room.run(() => u.skills.state().map((s, i) => {
      const row = s.empty ? null : u.skills.rowFor(i);
      const ally = aimsAtAlly(row);
      const who = whoOf(row, { allyEffects, aimsAtAlly });
      const rv = reviveOf(row);
      return {
        // play-test 5 T2: the card says exactly who it touches (js/rules/wording.js); `who` / `targets` for the UI
        slot: i + 1, id: s.id || null, name: s.name, desc: row ? cardText(row, s.descShort || s.desc || '', { statuses: engine.statuses }) : (s.descShort || s.desc || ''),
        who: who.who, targets: who.targets,
        // owner feedback 6: a locked key says when it opens, on the bar itself
        ...(s.locked ? { lockedText: `Unlocks at level ${s.unlockAt}` } : {}),
        ...(rv ? { revive: { style: rv.style || null, castMs: Math.round((rv.castTime || 0) * 1000), combat: !!rv.combat, mass: !!rv.mass, hpPct: rv.share ?? 0.5 } } : {}),
        cd: Math.round((s.cooldown || 0) * 1000), mp: Math.round(s.mp || 0), level: s.unlockAt, locked: !!s.locked,
        empty: !!s.empty, shape: s.shape || null, element: s.element || null,
        ally, group: !ally && !!row && allyEffects(row).size > 0,
        charges: s.charges?.max ?? null, form: s.form?.group || null,
        // P6: the talents picked on this skill, by name (the card's second line)
        talents: s.id && u.skillTalents?.[s.id] ? Object.entries(u.skillTalents[s.id]).filter(([, id]) => id).map(([t, id]) => tierNodes(engine.skillData.skills[s.id], Number(t)).find(nd => nd.id === id)?.name).filter(Boolean) : [],
      };
    }));
  }

  return {
    equip, unequip, canEquip, canUnequip, bagBonus, lightRefundOwed, gear, saveGear,
    /** W22 (A converts what players own): is this a light from before, and what it is paid back at (list price x count) */
    isLightItem, lightRefund,
    /** owner feedback 8 (W22): the light everyone carries — `{ radius, dungeonRadius, dungeonAmbient }` */
    LIGHT: lightOf(engine), rollLoot, onParty, useObject, bar, backfill, unlock, revived,
    applyKit, makeItem, makeCrate, openCrate, sheet, sheetWith,
    /** owner feedback 7 (V2): an item's list price (final), what a merchant pays, and the parts for a tooltip */
    price: priceOf, sellPrice: sellPriceFor, priceRow,
    killGold,
    /** U16: the creature body a shape form draws (`{ id, name, creature, scale, colors, upright }`), or null — A: `info.form` */
    formOf: e => { const u = e?.r?.unit; return u ? room.run(() => shapeOfUnit(u)) : null; },
    /** U8: a boss ward's bar — `{ on, hp, max, leftMs, ms }` or null */
    wardOf: e => (e?.r?.unit ? enc.wardOf(e.r.unit) : null),
    /** every worn slot, in paper-doll order (play-test 5: `back`, `waist` joined; owner feedback 8 took `light` out) */
    SLOTS: engine.tvGear?.slotOrder || ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'necklace', 'ring', 'ring2'],
    /** T25: the angling rules (pure; A drives the cast / bite / tug loop with them) */
    fishing: engine.fishing,
    /** T14: the basic attack's reach in metres as it is right now (weapon, caster form, druid shape); null = melee */
    attackRange: e => { const u = e?.r?.unit; return u ? room.run(() => attackReach(engine, u)) : null; },
    /** T14/T15: the slot-0 card — what the basic attack is, written from the numbers it uses */
    basic: e => { const u = e?.r?.unit; return u ? room.run(() => basicCard(engine, u)) : null; },
    /** T3: which key (1 | 2) of a class is its direct heal; 0 = not a healer */
    directHealSlot: cls => directHealSlot(engine.skillData, cls),
    talents, pickTalent, unpickTalent, resetTalents, perkForest, perks, takePerk, refundPerk, resetPerks, retrainPrice, saveBuild,
    talent, perk, build,
    companion: e => (e.r.unit ? companionInfo(e.r.unit, engine.classById(e.r.unit.classId), engine.progression.companions) : null),
    encounters: enc,
    stats: () => ({ builds, handoffs }),
    addEntity, removeEntity, intent, step, respawn, onLevel, statusesOf, restore, cleanse, useItem, itemBuffs,
    levelFor: xp => levelFromXp(xp, engine.levelCap),
    xpFor: level => xpForLevel(level, engine.levelCap),
    /** play-test 3 R2: 'quest' | 'event' experience multiplier (data/rules/progression.json xp) */
    xpMult: kind => (engine.xpMult ? engine.xpMult(kind) : 1),
    dispose() { room.run(() => { for (const m of [...field.monsters]) clearThreat(m); }); },
    /** for tests and devtools */
    room, field, combat,
  };
}
