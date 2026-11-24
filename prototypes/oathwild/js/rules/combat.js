// Oathwild — the world sim for up to 10 players: weapons, spells, auras, monsters, pets, death,
// XP and loot containers. Pure: no DOM, no three.js, no sockets, no wall clock, seeded dice.
// The server calls `step` at 20 Hz; events come out for the client. Adapted from Thousandvale's
// cast.js / cast-skills.js / field.js / monster-ai.js (one room → one world) with Farhold's own
// strike maths (rpg.strike), statuses (applyStatus/tickStatuses), weapon timing (swingTiming /
// strikeAt) and Thousandvale's threat table, all through js/rules/farhold.js.
//
//   createWorld(rules, { seed, flags })              → world
//   addPlayer(world, char, { at, shrine })            → unit (char is the saved record; kept by reference)
//   removePlayer(world, id)
//   spawnMonster(world, monsterId, level, at, { rank, camp, home }) → unit
//   step(world, dt, inputs)                           → events (also left on world.events until drained)
//   respawnPlayer(world, id, at)                      → { gold, wear } (costs applied to the char)
//   refreshPlayer(world, id)                          rebuild the sheet after gear/points change
//   snapshot(world)                                   plain data for the network
//
// Input per player (all optional): { move:{x,z}, aim:{origin:[x,y,z],dir:[x,y,z]}, attack, power,
//   block, sprint, sneak, dodge, cast:{ slot | spell, at:[x,y,z], held }, revive: playerId,
//   respawn, mount }
// Events: { t:'hit'|'heal'|'cast'|'aura'|'death'|'downed'|'revived'|'xp'|'level'|'loot'|'camp'|
//   'skill'|'miss'|'refused'|'projectile'|'zone'|'summon'|'form'|'mount', … } — see docs/RULES.md.

import {
  slowOf, outgoingFrom, incomingFrom, STATUS_POWER_SHARE, cooldownPower,
  swingTiming, strikeAt, OFFHAND_DAMAGE, makeRng, hashStr, addThreat, threatFromHeal, pickTarget, tauntThreat,
  clearThreat, noticeThreat, forgetThreat,
} from './farhold.js';
import { sheetOf } from './sheet.js';
import { castRow } from './classes.js';
import { targetKind, powerFrom } from './spells.js';
import { applyAura, tickAuras, control, removeAura, auraList } from './auras.js';
import { killXp, addXp, pendingLevels } from './levels.js';
import { noticeRange, gainSkill, hasPerk } from './skills-use.js';
import { createContainer, monsterTable } from './loot.js';
import { wearOnRespawn, mountRefusal } from './inventory.js';

const CF = rules => rules.data.combat;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
const rollRange = (rng, [a, b]) => a + rng() * (b - a);
const avg = r => (r[0] + r[1]) / 2;

// ---------------------------------------------------------------- the world

export function createWorld(rules, { seed = 1, flags = [] } = {}) {
  return {
    rules, rng: makeRng(seed), seed, t: 0, tick: 0, nextId: 1,
    units: new Map(), projectiles: [], pending: [], zones: [], containers: new Map(),
    camps: {}, flags: [...flags], events: [],
  };
}
const newId = (w, p) => `${p}${w.nextId++}`;
const emit = (w, e) => { w.events.push({ at: Math.round(w.t * 100) / 100, ...e }); };
const isFoe = (a, b) => a.alive && b.alive && (a.side !== b.side);
const isAlly = (a, b) => a.side === b.side;

/** A player's fighting body from their saved character. */
export function addPlayer(world, char, { at = [0, 0], shrine = null } = {}) {
  const id = char.id || newId(world, 'p');
  const u = {
    id, kind: 'player', side: 'heroes', char, name: char.name, x: at[0], z: at[1], facing: 0,
    alive: true, statuses: {}, cooldowns: {}, swingAt: 0, swingStep: 0, barrier: 0,
    stamina: 0, staminaAt: 0, lastFight: -999, downed: null, form: null, channel: null, mounted: false,
    shrine: shrine || at, safeUntil: 0, reviving: null, unseen: true,
  };
  world.units.set(id, u);
  refreshPlayer(world, id, { full: true });
  return u;
}
export function removePlayer(world, id) {
  const u = world.units.get(id);
  if (!u) return;
  for (const m of world.units.values()) if (m.threat) forgetThreat(m, id);
  for (const p of world.units.values()) if (p.owner === id) world.units.delete(p.id);
  world.units.delete(id);
}

/** Rebuild a player's sheet (gear, points, talents, a shape). Keeps health and mana as shares. */
export function refreshPlayer(world, id, { full = false } = {}) {
  const u = world.units.get(id);
  if (!u) return;
  const s = sheetOf(world.rules, u.char, { form: u.form });
  const hpShare = full || !u.maxHp ? 1 : u.hp / u.maxHp;
  const mpShare = full || !u.maxMp ? 1 : u.mp / u.maxMp;
  u.sheet = s;
  u.level = s.level;
  u.maxHp = s.maxHp; u.maxMp = s.maxMp; u.maxStamina = s.maxStamina;
  u.hp = Math.max(full ? s.maxHp : 1, Math.round(s.maxHp * hpShare));
  u.mp = Math.round(s.maxMp * mpShare);
  if (full) u.stamina = s.maxStamina;
  u.stamina = Math.min(u.stamina, s.maxStamina);
  u.equipment = u.char.gear;      // Farhold's strike reads affix powers off this
  u.derived = { ...s.farhold, damage: s.melee, critChance: s.critChance, critDamage: s.critDamage, dodge: s.dodge, armor: s.armor, magicResist: s.magicResist, blockChance: s.blockChance, blockPower: s.blockPower, resistAll: s.resistAll, lifeSteal: s.lifeSteal, thorns: s.thorns, spellPower: 0 };
  u.threatMult = 1 + (s.threatPct || 0) / 100;
}

/** A monster row (monsters.json, Farhold row underneath) resolved into makeEnemy's shape. */
export function monsterDef(rules, id, { companion = false } = {}) {
  const M = rules.data.monsters;
  const row = (companion ? M.companions : M.monsters)[id] || M.monsters[id] || M.companions[id];
  if (!row) return null;
  let def;
  if (row.base) {
    const E = rules.data.enemies;
    const src = E.enemies.find(e => e.id === row.base) || E.pets.find(e => e.id === row.base);
    if (!src) throw new Error(`oathwild monsters: ${id} -> unknown Farhold row ${row.base}`);
    def = structuredClone(src);
    delete def.look;
    const sc = row.scale || {};
    def.hp = Math.round((def.hp ?? 30) * (sc.hp ?? 1));
    def.dmg = (def.dmg || [4, 7]).map(v => Math.max(1, Math.round(v * (sc.dmg ?? 1))));
    def.xp = Math.round((def.xp ?? 12) * (sc.xp ?? 1));
    def.gold = Math.round((def.gold ?? 4) * (sc.gold ?? 1));
    Object.assign(def, row.set || {});
  } else {
    def = structuredClone(row);
  }
  def.id = id; def.name = row.name; def.art = row.art;
  return def;
}

export function spawnMonster(world, monsterId, level, at, { rank = 'normal', camp = null, home = null, side = 'monsters', owner = null, power = 1, lifetime = null } = {}) {
  const rules = world.rules;
  const def = monsterDef(rules, monsterId, { companion: side !== 'monsters' });
  if (!def) return null;
  const R = rank === 'boss' ? 'champion' : rank;   // a camp boss uses the champion numbers, plus its own row
  const e = rules.rpg.makeEnemy(def, level, world.rng, { rank: R });
  const id = newId(world, side === 'monsters' ? 'm' : 'c');
  const bossK = rank === 'boss' ? 1.5 : 1;
  const u = Object.assign(e, {
    id, kind: side === 'monsters' ? 'monster' : 'pet', side, rank, defId: monsterId, art: def.art,
    x: at[0], z: at[1], home: { x: (home || at)[0], z: (home || at)[1] }, facing: 0, alive: true,
    statuses: {}, swingAt: 0, camp, owner, tappers: new Set(), lastFight: -999, expires: lifetime ? world.t + lifetime : null,
    threat: side === 'monsters' ? new Map() : undefined,
  });
  const MS = CF(rules).monsterScale;
  u.maxHp = u.hp = Math.round(u.hp * bossK * (side === 'monsters' ? MS.hp : power));
  if (side !== 'monsters') u.dmg = u.dmg.map(v => Math.max(1, Math.round(v * power)));
  else u.dmg = u.dmg.map(v => Math.max(1, Math.round(v * MS.dmg * (rank === 'boss' ? 1.2 : 1))));
  u.aggroRange = def.aggroRange ?? CF(rules).monsters.noticeDefault;
  world.units.set(id, u);
  if (camp) world.camps[camp] = (world.camps[camp] || 0) + 1;
  return u;
}

// ---------------------------------------------------------------- the step

export function step(world, dt, inputs = {}) {
  const rules = world.rules;
  world.t += dt;
  world.tick++;
  for (const u of [...world.units.values()]) {
    if (u.kind === 'player') stepPlayer(world, u, inputs[u.id] || {}, dt);
  }
  for (const u of [...world.units.values()]) {
    if (u.kind === 'monster') stepMonster(world, u, dt);
    else if (u.kind === 'pet') stepPet(world, u, dt);
  }
  stepProjectiles(world, dt);
  stepPending(world);
  stepZones(world);
  for (const u of [...world.units.values()]) stepAuras(world, u, dt);
  // a corpse container expires
  for (const [id, c] of world.containers) if (c.expires != null && world.t >= c.expires) world.containers.delete(id);
  const out = world.events;
  world.events = [];
  return out;
}

function inCombat(world, u) {
  return world.t - (u.lastFight || -999) < CF(world.rules).combatState.seconds;
}

function stepAuras(world, u, dt) {
  if (!u.alive && !u.downed) return;
  const r = tickAuras(world.rules, u, dt);
  if (r.damage > 0) {
    for (const [src, n] of Object.entries(r.bySource)) {
      const from = world.units.get(src);
      if (from && u.threat) addThreat(u, from, n);
      if (from && u.tappers && from.kind === 'player') u.tappers.add(from.id);
    }
    emit(world, { t: 'tick', to: u.id, amount: Math.round(r.damage) });
  }
  for (const id of r.expired) {
    emit(world, { t: 'aura', who: u.id, id, on: false });
    if (id === 'barrier') u.barrier = 0;
    if (id === 'form' && u.form) leaveForm(world, u);
  }
  if (u.hp <= 0 && u.alive) die(world, u, null);
}

// ---------------------------------------------------------------- players

function stepPlayer(world, u, input, dt) {
  const rules = world.rules;
  const C = CF(rules);
  const s = u.sheet;
  if (u.downed) {
    if (input.respawn || world.t >= u.downed.until) emit(world, { t: 'respawnReady', who: u.id, shrine: u.shrine });
    return;
  }
  // regeneration
  const out = !inCombat(world, u);
  const regenK = out ? C.regen.outOfCombat : 0;
  u.hp = Math.min(u.maxHp, u.hp + (s.hpRegen + u.maxHp * regenK) * dt);
  u.mp = Math.min(u.maxMp, u.mp + (s.mpRegen + u.maxMp * regenK) * dt);
  if (world.t >= u.staminaAt) u.stamina = Math.min(u.maxStamina, u.stamina + s.staminaRegen * dt);

  const ctl = control(u);
  if (input.aim?.dir) u.facing = Math.atan2(input.aim.dir[0], input.aim.dir[2]);
  u.sneaking = !!input.sneak && !u.mounted;
  u.blocking = !!input.block && u.stamina > 0;

  // the horse
  if (input.mount) toggleMount(world, u, input);

  // movement
  if (ctl.move && input.move && (input.move.x || input.move.z)) {
    const dir = norm2(input.move.x, input.move.z);
    const b = auraTotalsOf(u);
    let speed = s.moveSpeed * (1 - slowOf(u)) * (1 + (b.move || 0));
    if (u.sneaking) speed *= hasPerk(rules, u.char, 'soft_soles') ? 0.75 : 0.55;
    if (u.mounted) speed *= rules.data.inventory.mount.speedMult;
    if (input.sprint && !u.mounted && !s.overloaded && u.stamina > 0) {
      speed *= C.stamina.sprintMult;
      spendStamina(world, u, C.stamina.sprintPerSecond * dt);
    }
    if (u.blocking) speed *= 0.5;
    u.x += dir.x * speed * dt; u.z += dir.z * speed * dt;
    if (u.channel) endChannel(world, u);
  }
  if (input.dodge && ctl.move && u.stamina >= C.stamina.dodge) {
    const d = input.move && (input.move.x || input.move.z) ? norm2(input.move.x, input.move.z) : { x: -Math.sin(u.facing), z: -Math.cos(u.facing) };
    u.x += d.x * C.stamina.dodgeMetres; u.z += d.z * C.stamina.dodgeMetres;
    u.safeUntil = world.t + C.stamina.dodgeSafeSeconds;
    spendStamina(world, u, C.stamina.dodge);
    emit(world, { t: 'dodge', who: u.id });
  }
  // sneaking unseen near an enemy trains Sneak
  if (u.sneaking) {
    const near = [...world.units.values()].some(m => m.kind === 'monster' && m.alive && dist(m, u) < 15 && !m.threat?.has(u.id));
    if (near) skillEvent(world, u, gainSkill(rules, u.char, 'sneak', 'unseenSecond', dt), 'sneak');
  }

  // a downed ally nearby: hold Interact to bring them back
  if (input.revive) tickRevive(world, u, input.revive, dt);
  else u.reviving = null;

  // casting
  if (u.channel) tickChannel(world, u, input);
  if (input.cast && ctl.cast) {
    const spell = input.cast.spell || u.char.bar?.[input.cast.slot];
    if (spell && !(u.channel && u.channel.spell === spell)) castSpell(world, u, spell, { aim: input.aim, at: input.cast.at, held: input.cast.held });
  }
  // the weapon (or a shape's attack)
  if (input.attack && ctl.act && world.t >= u.swingAt && !u.mounted) basicAttack(world, u, input);
}

function auraTotalsOf(u) {
  let move = 0, haste = 0;
  for (const st of Object.values(u.statuses || {})) { move += st.move || 0; haste += st.haste || 0; }
  return { move, haste };
}

function spendStamina(world, u, n) {
  u.stamina = Math.max(0, u.stamina - n);
  u.staminaAt = world.t + CF(world.rules).stamina.regenDelay;
}

function toggleMount(world, u) {
  if (u.mounted) { u.mounted = false; removeAura(u, 'mounted'); emit(world, { t: 'mount', who: u.id, on: false }); return; }
  const why = mountRefusal(world.rules, { owned: !!u.char.horse, inCombatFor: world.t - u.lastFight });
  if (why) { emit(world, { t: 'refused', who: u.id, why }); return; }
  u.mounted = true;
  applyAura(world.rules, u, 'mounted', { source: u.id });
  emit(world, { t: 'mount', who: u.id, on: true });
}
function dismount(world, u) {
  if (!u.mounted) return;
  u.mounted = false; removeAura(u, 'mounted');
  emit(world, { t: 'mount', who: u.id, on: false, thrown: true });
}

function skillEvent(world, u, r, skill) {
  if (!r || !r.gained) return;
  if (r.to > r.from) emit(world, { t: 'skill', who: u.id, skill, from: r.from, to: r.to, milestones: r.milestones });
}

function aimDir(u, aim) {
  if (aim?.dir) return norm2(aim.dir[0], aim.dir[2]);
  return { x: Math.sin(u.facing), z: Math.cos(u.facing) };
}

/** A swing, a shot, or a shape's bite. */
function basicAttack(world, u, input) {
  const rules = world.rules;
  const C = CF(rules);
  const s = u.sheet;
  const dir = aimDir(u, input.aim);
  const haste = 1 + (s.hastePct || 0) / 100 + auraTotalsOf(u).haste;
  let power = 1;
  if (input.power && u.stamina >= C.stamina.powerAttack) { power = C.stamina.powerMult; spendStamina(world, u, C.stamina.powerAttack); }
  if (u.form?.basic) {
    const b = u.form.basic;
    u.swingAt = world.t + C.formSwing.every / haste;
    const row = { mult: (b.mult || 1) * power, element: b.element || 'physical', shape: b.shape, reach: b.reach, arc: b.arc, range: b.range, splash: b.splash, applies: b.status ? [{ id: b.status, over: {} }] : [], repeats: b.hits || 1, repeatEvery: 0.15, powerFromSpell: false };
    const powerRange = b.element && b.element !== 'physical' ? s.spell.wis : s.melee;
    if (b.shape === 'bolt') fireBolt(world, u, row, dir, { powerRange, speed: C.projectile.bolt, basic: true });
    else for (let i = 0; i < (b.hits || 1); i++) schedule(world, i * 0.15, { type: 'cone', caster: u.id, row, dir, powerRange, basic: true });
    return;
  }
  const weapon = s.weapon;
  if (weapon?.weaponCategory === 'magic') {
    const mw = C.magicWeapon;
    const t = swingTiming(weapon, 0, haste);
    u.swingAt = world.t + Math.max(0.45, t.every * 1.6);
    const row = { mult: mw.mult * power, element: mw.element, range: mw.range, applies: [] };
    fireBolt(world, u, row, dir, { powerRange: s.spell.int, speed: C.projectile.bolt, basic: true });
    return;
  }
  if (weapon?.ranged) {
    const t = swingTiming(weapon, 0, haste);
    u.swingAt = world.t + Math.max(0.35, t.every);
    const row = { mult: power, element: 'physical', range: 46, applies: [] };
    fireBolt(world, u, row, dir, { powerRange: s.ranged, speed: C.projectile.arrow, basic: true });
    return;
  }
  const t = swingTiming(weapon || null, u.swingStep, haste);
  const st = strikeAt(weapon || null, u.swingStep);
  u.swingStep = (u.swingStep + 1) % Math.max(1, st.of || 1);
  u.swingAt = world.t + Math.max(0.2, t.every);
  const row = { mult: (st.damage || 1) * power, element: 'physical', reach: st.reach, arc: Math.max(st.arc, 0.6) * 2, pen: st.pen || 0, applies: [] };
  coneHit(world, u, row, dir, { powerRange: s.melee, basic: true });
  // a weapon in the off hand strikes right after, for Farhold's off-hand share of its own dice
  const off = u.char.gear?.offhand;
  if (off?.type === 'weapon' && off.weaponCategory !== 'magic' && s.offhand) {
    const os = strikeAt(off, 0);
    schedule(world, 0.15, { type: 'cone', caster: u.id, row: { ...row, mult: (os.damage || 1) * OFFHAND_DAMAGE * power, reach: Math.max(os.reach, row.reach) }, dir, powerRange: s.offhand, basic: true });
  }
}

// ---------------------------------------------------------------- spells

/** Why a cast cannot happen, or null (also used by the client to grey a button). */
export function castRefusal(world, u, spellId) {
  const rules = world.rules;
  if (!u.alive || u.downed) return 'You cannot cast now.';
  const row = castRow(rules, u.char, spellId);
  if (!row) return 'You do not know that spell.';
  if ((u.cooldowns[spellId] || 0) > world.t) return `${row.name} is not ready (${Math.ceil(u.cooldowns[spellId] - world.t)}s).`;
  if (u.mp < row.mp) return `Not enough mana for ${row.name} (${row.mp} needed).`;
  if (!control(u).cast) return 'You cannot cast while held, asleep, stunned or silenced.';
  return null;
}

/** The number range a spell rolls from, for this caster. */
export function spellPowerRange(rules, sheet, row) {
  const src = powerFrom(row, { ranged: sheet.holdsRanged });
  if (src === 'melee') return sheet.melee;
  if (src === 'ranged') return sheet.ranged || sheet.melee;
  if (src === 'heal') return sheet.heal;
  const attr = row.school === 'song' ? 'cha' : (rules.data.attributes.schoolAttr[row.element] || 'int');
  const sp = sheet.spell[attr];
  if (src === 'blend') return [Math.round((sheet.melee[0] + sp[0]) / 2), Math.round((sheet.melee[1] + sp[1]) / 2)];
  if (src === 'blendRanged') { const r = sheet.ranged || sheet.melee; return [Math.round((r[0] + sp[0]) / 2), Math.round((r[1] + sp[1]) / 2)]; }
  return sp;
}

/** The share a damaging spell hits for: rank-scaled mult x Farhold's cooldown power x class depth x school bonus. */
export function spellMultiplier(sheet, row) {
  const school = 1 + (sheet.school?.[row.element || 'physical'] || 0) / 100;
  return (row.mult || 0) * cooldownPower(row.cooldown) * (row.classPower || 1) * school;
}

export function castSpell(world, u, spellId, { aim = null, at = null, held = false } = {}) {
  const rules = world.rules;
  const why = castRefusal(world, u, spellId);
  if (why) { emit(world, { t: 'refused', who: u.id, spell: spellId, why }); return false; }
  const row = castRow(rules, u.char, spellId);
  const s = u.sheet;
  const dir = aimDir(u, aim);
  u.mp -= row.mp;
  if (row.hpCost) u.hp = Math.max(1, u.hp - u.maxHp * row.hpCost);
  u.cooldowns[spellId] = world.t + row.cooldown * (1 - (s.cooldownPct || 0) / 100);
  dismount(world, u);
  const powerRange = spellPowerRange(rules, s, row);
  const kind = targetKind(row);
  const origin = { x: u.x, z: u.z };
  emit(world, { t: 'cast', who: u.id, spell: spellId, rank: row.rank, kind, dir: [dir.x, dir.z], at: at ? [at[0], at[2] ?? at[1]] : null });

  // whatever the shape, a few things always happen on the caster
  if (row.selfBuff) applyAura(rules, u, `buff_${spellId}`, { over: { kind: 'buff', element: row.element, ...row.selfBuff }, source: u.id, spell: spellId, bonusSeconds: row.bonusSeconds || 0 });
  if (row.buffs?.length) for (const ally of alliesNear(world, u, row.allies || 0)) for (const b of row.buffs) applyAura(rules, ally, b.id, { over: { kind: 'buff', ...b }, source: u.id, spell: spellId, bonusSeconds: row.bonusSeconds || 0 });
  if (row.barrier) for (const ally of alliesNear(world, u, row.allies || 0)) giveBarrier(world, ally, row.barrier, u, spellId);
  if (row.taunt) for (const m of foesNear(world, u, u, row.taunt.radius || 6)) if (m.threat !== undefined) tauntThreat(m, u, row.taunt.seconds || 3);
  if (row.form) { toggleForm(world, u, row, spellId); return true; }
  if (row.revive) { reviveNearAim(world, u, row, dir); return true; }
  if (row.pet || row.summon) { summon(world, u, row, spellId); if (!row.mult) return true; }

  const ctx = { powerRange, spell: spellId };
  if (row.target === 'ally') {
    const ally = allyOnAim(world, u, dir, row.range || 20) || u;
    healUnit(world, u, ally, row, ctx);
    return true;
  }
  switch (row.shape) {
    case 'bolt': fireBolt(world, u, row, dir, { ...ctx, speed: CF(rules).projectile.bolt }); break;
    case 'ground': {
      const p = groundPoint(u, dir, at, row.range || 20);
      const reps = row.repeats || 1;
      for (let i = 0; i < reps; i++) schedule(world, (row.delay || 0) + i * (row.repeatEvery || 0.5), { type: 'area', caster: u.id, row, at: p, ...ctx, first: i === 0 });
      break;
    }
    case 'melee': repeatShape(world, u, row, 'cone', { dir, ...ctx }); break;
    case 'around': repeatShape(world, u, row, 'around', { at: origin, ...ctx }); break;
    case 'beam':
      if (row.channel) { u.channel = { spell: spellId, row, until: world.t + row.channel.seconds, next: world.t, ctx, dir }; }
      else repeatShape(world, u, row, 'line', { from: origin, dir, ...ctx });
      break;
    case 'dash': {
      const len = Math.min(row.dash?.range || row.range || 10, row.range || 99);
      const from = { x: u.x, z: u.z };
      u.x += dir.x * len; u.z += dir.z * len;
      lineHit(world, u, row, from, dir, len, { ...ctx, width: (row.splash || 2) * 2 });
      break;
    }
    case 'self': case 'summon': default:
      if (row.heal || row.healPower) for (const ally of alliesNear(world, u, row.allies || 0)) healUnit(world, u, ally, row, ctx);
      if (row.mult) aroundHit(world, u, row, { x: u.x, z: u.z }, ctx);
      else selfStatuses(world, u, row, ctx);
      break;
  }
  if (row.place) placeZone(world, u, row, row.shape === 'ground' ? groundPoint(u, dir, at, row.range || 20) : { x: u.x, z: u.z }, ctx);
  if (row.shape === 'around' && (row.heal || row.healPower)) for (const ally of alliesNear(world, u, row.allies || row.radius || 0)) healUnit(world, u, ally, row, ctx);
  return true;
}

/**
 * A self-cast spell's statuses (War Cry's Might, Greensap's Mending, Rally): a buff lands on the
 * caster (and allies within `allies`); a debuff lands on enemies within `radius` (default 6 m).
 */
function selfStatuses(world, u, row, ctx) {
  const rules = world.rules;
  for (const a of row.applies || []) {
    const sr = rules.statuses[a.id];
    if (!sr) continue;
    const good = sr.kind === 'buff' || a.over.kind === 'buff';
    const who = good ? alliesNear(world, u, row.allies || 0) : foesNear(world, u, u, row.radius || 6);
    for (const t of who) {
      const e = applyAura(rules, t, a.id, { over: a.over, source: u.id, spell: ctx.spell, bonusSeconds: row.bonusSeconds || 0, strength: row.statusStrength || 1, stackMax: a.stackMax || null });
      if (e) emit(world, { t: 'aura', who: t.id, id: a.id, on: true, from: u.id });
    }
  }
}

function repeatShape(world, u, row, type, data) {
  const reps = row.repeats || 1;
  for (let i = 0; i < reps; i++) schedule(world, i * (row.repeatEvery || 0.3), { type, caster: u.id, row, ...data });
}

function groundPoint(u, dir, at, range) {
  if (at) {
    const x = at[0], z = at.length > 2 ? at[2] : at[1];
    const d = Math.hypot(x - u.x, z - u.z);
    if (d <= range) return { x, z };
    return { x: u.x + (x - u.x) / d * range, z: u.z + (z - u.z) / d * range };
  }
  return { x: u.x + dir.x * Math.min(range, 12), z: u.z + dir.z * Math.min(range, 12) };
}

function schedule(world, delay, job) { world.pending.push({ at: world.t + delay, ...job }); }
function stepPending(world) {
  const due = world.pending.filter(j => j.at <= world.t);
  world.pending = world.pending.filter(j => j.at > world.t);
  for (const j of due) {
    const u = world.units.get(j.caster);
    if (!u || !u.alive) continue;
    const ctx = { powerRange: j.powerRange, spell: j.spell, basic: j.basic };
    if (j.type === 'area') {
      if (j.row.mult) aroundHit(world, u, j.row, j.at, ctx);
      if (j.first && (j.row.heal || j.row.healPower)) for (const a of alliesNear(world, { ...u, x: j.at.x, z: j.at.z }, j.row.allies || j.row.radius || 0)) if (isAlly(a, u)) healUnit(world, u, a, j.row, ctx);
      if (j.first && !j.row.mult && j.row.applies?.length) aroundHit(world, u, { ...j.row, noDamage: true }, j.at, ctx);
    } else if (j.type === 'cone') coneHit(world, u, j.row, j.dir || aimDir(u), ctx);
    else if (j.type === 'around') aroundHit(world, u, j.row, { x: u.x, z: u.z }, ctx);
    else if (j.type === 'line') lineHit(world, u, j.row, { x: u.x, z: u.z }, j.dir, j.row.range || 20, ctx);
  }
}

// ---------------------------------------------------------------- shapes

function targetsOf(world, u) {
  return [...world.units.values()].filter(t => t !== u && isFoe(u, t) && !t.downed);
}
function foesNear(world, u, at, r) { return targetsOf(world, u).filter(t => dist(t, at) <= r + bodyR(t)); }
function alliesNear(world, u, r) {
  const out = [u];
  if (r > 0) for (const a of world.units.values()) if (a !== u && a.kind === 'player' && a.alive && !a.downed && dist(a, u) <= r) out.push(a);
  return out;
}
const bodyR = t => (t.scale || 1) * 0.5;

function coneHit(world, u, row, dir, ctx) {
  const reach = Math.max(row.reach || 3, 2);
  const half = (row.arc || 1.6) / 2;
  let n = 0;
  for (const t of targetsOf(world, u)) {
    const dx = t.x - u.x, dz = t.z - u.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + bodyR(t)) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / (d || 1))));
    if (d > 0.8 && ang > half) continue;
    hit(world, u, t, row, ctx); n++;
  }
  if (!n && ctx.basic) emit(world, { t: 'miss', who: u.id });
}
function aroundHit(world, u, row, at, ctx) {
  const r = row.radius || row.splash || 3;
  const hits = foesNear(world, u, at, r);
  for (const t of hits) hit(world, u, t, row, ctx);
  return hits.length;
}
function lineHit(world, u, row, from, dir, len, ctx) {
  const half = (ctx.width || row.width || 1.6) / 2;
  for (const t of targetsOf(world, u)) {
    const dx = t.x - from.x, dz = t.z - from.z;
    const along = dx * dir.x + dz * dir.z;
    if (along < -0.5 || along > len + bodyR(t)) continue;
    const across = Math.abs(dx * dir.z - dz * dir.x);
    if (across <= half + bodyR(t)) hit(world, u, t, row, ctx);
  }
}

function fireBolt(world, u, row, dir, ctx) {
  const n = row.projectiles || 1;
  const spread = row.spread || 0.1;
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i - (n - 1) / 2) * (spread / Math.max(1, n - 1)) * 2 : 0;
    const a = Math.atan2(dir.x, dir.z) + off;
    world.projectiles.push({
      id: newId(world, 'b'), owner: u.id, x: u.x, z: u.z, dx: Math.sin(a), dz: Math.cos(a), speed: ctx.speed || 32,
      left: row.range || 34, row, ctx, pierce: row.pierce || 0, hit: new Set(), bounces: row.ricochet?.bounces || 0, keep: 1,
    });
  }
  emit(world, { t: 'projectile', who: u.id, spell: ctx.spell || null, n, dir: [dir.x, dir.z] });
}

function stepProjectiles(world, dt) {
  const R = CF(world.rules).projectile.radius;
  const keep = [];
  for (const p of world.projectiles) {
    const owner = world.units.get(p.owner);
    if (!owner) continue;
    const stepLen = p.speed * dt;
    let done = false;
    for (let k = 0; k < 2 && !done; k++) {
      p.x += p.dx * stepLen / 2; p.z += p.dz * stepLen / 2;
      p.left -= stepLen / 2;
      for (const t of world.units.values()) {
        if (t === owner || p.hit.has(t.id) || !isFoe(owner, t) || t.downed) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) > R + bodyR(t)) continue;
        p.hit.add(t.id);
        const row = p.keep !== 1 ? { ...p.row, mult: (p.row.mult || 1) * p.keep } : p.row;
        hit(world, owner, t, row, p.ctx);
        if (p.row.splash) for (const o of foesNear(world, owner, t, p.row.splash)) if (o !== t) hit(world, owner, o, { ...row, mult: (row.mult || 1) * 0.5, applies: row.applies }, p.ctx);
        if (p.bounces > 0) {
          const next = foesNear(world, owner, t, p.row.ricochet.range || 8).filter(o => !p.hit.has(o.id)).sort((a, b) => dist(a, t) - dist(b, t))[0];
          if (next) { const d = norm2(next.x - t.x, next.z - t.z); p.dx = d.x; p.dz = d.z; p.x = t.x; p.z = t.z; p.bounces--; p.keep *= p.row.ricochet.keep || 0.8; p.left = Math.max(p.left, dist(next, t) + 1); break; }
        }
        if (p.pierce > 0) { p.pierce--; continue; }
        done = true; break;
      }
      if (p.left <= 0) done = true;
    }
    if (!done) keep.push(p);
  }
  world.projectiles = keep;
}

// ---------------------------------------------------------------- the hit

/**
 * One strike from `u` on `t` with `row` (a spell row, or a basic attack's). Farhold's rpg.strike
 * does the dice, crits, armour, resistances, blocks and the gear powers; Oathwild adds the spell's
 * share, statuses, threat, knockback and the death that follows.
 */
export function hit(world, u, t, row, ctx = {}) {
  const rules = world.rules;
  if (!t.alive || t.downed) return null;
  if (t.returning) { emit(world, { t: 'miss', who: u.id, to: t.id, evade: true }); return null; }
  if (t.kind === 'player' && world.t < (t.safeUntil || 0)) { emit(world, { t: 'miss', who: u.id, to: t.id, dodged: true }); return null; }
  let mult = ctx.basic ? (row.mult || 1) : spellMultiplier(u.sheet || {}, row);
  if (row.noDamage) mult = 0;
  if (row.execute && t.hp / t.maxHp < row.execute.below) mult *= 1 + row.execute.mult;
  // a sneak attack on something that has not noticed you
  let opening = false;
  if (u.kind === 'player' && u.sneaking && t.threat && !t.threat.has(u.id)) {
    opening = true;
    if (hasPerk(rules, u.char, 'opening_cut')) mult *= 1.5;
  }
  let res;
  if (u.kind === 'player') {
    const saved = u.derived.damage, savedCrit = u.derived.critChance;
    u.derived.damage = ctx.powerRange || u.sheet.melee;
    u.derived.critChance = savedCrit + (row.critBonus || 0);
    res = rules.rpg.strike(u, t, world.rng, { multiplier: Math.max(0, mult), element: row.element || 'physical', skill: ctx.spell || null, pen: row.pen || 0, ranged: row.shape === 'bolt', noDamage: mult === 0 });
    u.derived.damage = saved; u.derived.critChance = savedCrit;
  } else {
    // a monster or a pet. rpg.strike multiplies the attacker's buffs and the target's debuffs itself
    // only when a pet hits a monster; every other pairing gets them here, once (lessons rule 33)
    const farholdApplies = !!(u.owner && !t.equipment);
    let k = (farholdApplies ? 1 : outgoingFrom(u) * incomingFrom(t)) * mult;
    if (t.kind === 'player' && t.blocking && t.stamina >= CF(rules).stamina.blockHit) {
      k *= 1 - (t.sheet.weapon && !t.char.gear?.offhand?.isShield ? CF(rules).stamina.blockWeapon : CF(rules).stamina.blockShield);
      spendStamina(world, t, CF(rules).stamina.blockHit);
    }
    if (u.owner) k *= 1 + ((world.units.get(u.owner)?.sheet?.petPct || 0) / 100);
    res = rules.rpg.strike(u, t, world.rng, { multiplier: k, element: row.element || u.ranged?.element || 'physical', ranged: !!row.ranged });
  }
  if (!res || res.dodged) { emit(world, { t: 'miss', who: u.id, to: t.id, dodged: true }); return res; }
  u.lastFight = t.lastFight = world.t;
  if (t.kind === 'player') dismount(world, t);
  if (u.kind === 'player') dismount(world, u);
  emit(world, { t: 'hit', from: u.id, to: t.id, amount: res.amount, crit: !!res.crit, element: res.element, spell: ctx.spell || null, blocked: res.blocked || 0, absorbed: res.absorbed || 0 });
  if (opening) skillEvent(world, u, gainSkill(rules, u.char, 'sneak', 'sneakAttack'), 'sneak');
  // threat and credit
  if (t.threat !== undefined && (u.kind === 'player' || u.kind === 'pet')) {
    addThreat(t, u, Math.max(1, res.amount));
    const credit = u.kind === 'pet' ? u.owner : u.id;
    if (credit) t.tappers.add(credit);
  }
  if (row.onHit?.taunt && t.threat !== undefined) tauntThreat(t, u, row.onHit.taunt);
  // statuses the row carries
  const hitPower = avg(ctx.powerRange || u.sheet?.melee || u.dmg || [4, 6]) * Math.max(mult, 0.3);
  for (const a of row.applies || []) {
    const sr = rules.statuses[a.id];
    if (!sr) continue;
    const dot = (sr.perSecond || a.over.perSecond) > 0;
    const power = dot ? hitPower * STATUS_POWER_SHARE * (row.statusMult || 1) : 1;
    const e = applyAura(rules, t, a.id, { over: a.over, power, source: u.id, spell: ctx.spell || null, bonusSeconds: row.bonusSeconds || 0, strength: row.statusStrength || 1, stackMax: a.stackMax || null });
    if (e) emit(world, { t: 'aura', who: t.id, id: a.id, on: true, from: u.id });
  }
  if (row.knock?.stagger && t.kind !== 'player') applyAura(rules, t, 'stagger', { over: { seconds: row.knock.stagger * (t.rank === 'boss' ? 0.4 : 1) }, source: u.id });
  if (row.knock?.push) { const d = norm2(t.x - u.x, t.z - u.z); const k = t.rank === 'boss' ? 0.25 : 1; t.x += d.x * row.knock.push * k; t.z += d.z * row.knock.push * k; }
  if (row.pullIn?.metres) { const d = norm2(u.x - t.x, u.z - t.z); const m = Math.min(row.pullIn.metres, Math.max(0, dist(u, t) - 1.5)); t.x += d.x * m; t.z += d.z * m; }
  if (row.leech && u.hp != null) u.hp = Math.min(u.maxHp, u.hp + res.amount * row.leech);
  if (row.onHit?.heal && u.hp != null) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * row.onHit.heal);
  if (row.onHit?.healAllies && u.kind === 'player') for (const a of alliesNear(world, u, 12)) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * row.onHit.healAllies);
  if (row.heal && row.shape === 'beam' && u.hp != null) u.hp = Math.min(u.maxHp, u.hp + res.amount * row.heal);
  if (t.hp <= 0) die(world, t, u);
  return res;
}

function healUnit(world, u, ally, row, ctx) {
  if (!ally.alive || ally.downed) return 0;
  const rules = world.rules;
  const s = u.sheet;
  let amount = 0;
  if (row.healPower) amount += rollRange(world.rng, ctx.powerRange || s.heal) * row.healPower * (row.classPower || 1);
  if (row.heal && row.shape !== 'beam') amount += ally.maxHp * row.heal * (row.classPower || 1) * (1 + (s.mods?.healPct || 0) / 100);
  if (!(amount > 0)) return 0;
  const before = ally.hp;
  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
  const done = Math.round(ally.hp - before);
  emit(world, { t: 'heal', from: u.id, to: ally.id, amount: done, spell: ctx.spell || null, over: Math.round(amount - done) });
  if (done > 0) threatFromHeal([...world.units.values()].filter(m => m.kind === 'monster'), u, ally, done);
  for (const a of row.applies || []) if (rules.statuses[a.id]?.kind === 'buff') applyAura(rules, ally, a.id, { over: a.over, source: u.id, spell: ctx.spell, bonusSeconds: row.bonusSeconds || 0, strength: row.statusStrength || 1 });
  return done;
}

function giveBarrier(world, ally, barrier, u, spell) {
  const add = Math.round(ally.maxHp * barrier.share * (1 + (u.sheet?.mods?.healPct || 0) / 200));
  ally.barrier = Math.max(ally.barrier || 0, add);
  applyAura(world.rules, ally, 'barrier', { over: { seconds: barrier.seconds || 10 }, source: u.id, spell });
  emit(world, { t: 'barrier', who: ally.id, amount: add, from: u.id, spell });
}

function allyOnAim(world, u, dir, range) {
  const lim = Math.cos(CF(world.rules).aimAssist.degrees * Math.PI / 180);
  let best = null, bestD = Infinity;
  for (const a of world.units.values()) {
    if (a === u || a.kind !== 'player' || !a.alive || a.downed) continue;
    const dx = a.x - u.x, dz = a.z - u.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.01) continue;
    if ((dx * dir.x + dz * dir.z) / d < lim) continue;
    if (d < bestD) { best = a; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------- channels, zones, forms, summons, revives

function tickChannel(world, u, input) {
  const c = u.channel;
  if (!input.cast?.held || world.t > c.until) { endChannel(world, u); return; }
  if (world.t >= c.next) {
    c.next = world.t + (c.row.channel.every || 0.5);
    const dir = aimDir(u, input.aim);
    lineHit(world, u, c.row, { x: u.x, z: u.z }, dir, c.row.range || 20, c.ctx);
  }
}
function endChannel(world, u) { if (u.channel) emit(world, { t: 'channelEnd', who: u.id, spell: u.channel.spell }); u.channel = null; }

function placeZone(world, u, row, at, ctx) {
  const p = row.place;
  world.zones.push({ id: newId(world, 'z'), owner: u.id, x: at.x, z: at.z, radius: p.radius || row.radius || 4, until: world.t + (p.seconds || 6) + (row.bonusSeconds || 0), every: p.every || 1, next: world.t + (p.every || 1), place: p, row, ctx, follow: p.follow === 'self' });
  emit(world, { t: 'zone', who: u.id, spell: ctx.spell, at: [at.x, at.z], radius: p.radius || row.radius || 4, seconds: p.seconds || 6 });
}
function stepZones(world) {
  const rules = world.rules;
  const keep = [];
  for (const z of world.zones) {
    const u = world.units.get(z.owner);
    if (!u || world.t > z.until) { emit(world, { t: 'zoneEnd', id: z.id }); continue; }
    if (z.follow) { z.x = u.x; z.z = u.z; }
    if (world.t >= z.next) {
      z.next += z.every;
      const p = z.place;
      if (p.strike?.mult) {
        const strikeRow = { ...z.row, mult: p.strike.mult, applies: p.strike.status ? [{ id: p.strike.status, over: {} }] : [], knock: null, repeats: 1 };
        for (const t of foesNear(world, u, z, z.radius).slice(0, p.strike.targets || 8)) hit(world, u, t, strikeRow, z.ctx);
      }
      if (p.debuff) for (const t of foesNear(world, u, z, z.radius)) applyAura(rules, t, p.debuff.id, { over: p.debuff, source: u.id, spell: z.ctx.spell });
      if (p.heal || p.buff) {
        for (const a of world.units.values()) {
          if (!isAlly(a, u) || !a.alive || a.downed || dist(a, z) > z.radius) continue;
          if (p.heal) { const before = a.hp; a.hp = Math.min(a.maxHp, a.hp + a.maxHp * p.heal * (z.row.classPower || 1)); if (a.hp > before) emit(world, { t: 'heal', from: u.id, to: a.id, amount: Math.round(a.hp - before), spell: z.ctx.spell }); }
          if (p.buff) applyAura(rules, a, p.buff.id, { over: p.buff, source: u.id, spell: z.ctx.spell });
        }
      }
    }
    keep.push(z);
  }
  world.zones = keep;
}

function toggleForm(world, u, row, spellId) {
  if (u.form?.spell === spellId) { leaveForm(world, u); return; }
  if (u.form) leaveForm(world, u);
  u.form = { ...row.form, spell: spellId };
  applyAura(world.rules, u, 'form', { over: { name: row.form.name, seconds: row.form.seconds || 3600 }, source: u.id, spell: spellId });
  refreshPlayer(world, u.id);
  emit(world, { t: 'form', who: u.id, on: true, form: row.form.id, body: row.form.body?.creature || null });
  if (row.form.pack) {
    for (let i = 0; i < (row.form.pack.count || 1); i++) {
      const pet = spawnMonster(world, row.form.pack.pet, u.level, [u.x + (i + 1), u.z - 1], { side: u.side, owner: u.id, power: (row.petPower || 1) * (1 + (u.sheet.petPct || 0) / 100), lifetime: row.form.pack.seconds || 30 });
      if (pet) { pet.kind = 'pet'; pet.formPack = spellId; emit(world, { t: 'summon', who: u.id, pet: pet.id, def: pet.defId }); }
    }
  }
}
function leaveForm(world, u) {
  const f = u.form;
  u.form = null;
  removeAura(u, 'form');
  for (const p of [...world.units.values()]) if (p.owner === u.id && p.formPack === f?.spell) { world.units.delete(p.id); emit(world, { t: 'unsummon', pet: p.id }); }
  refreshPlayer(world, u.id);
  emit(world, { t: 'form', who: u.id, on: false, form: f?.id || null });
}

function summon(world, u, row, spellId) {
  const def = row.pet || row.summon?.def;
  const count = row.count || row.summon?.count || 1;
  // one cast's worth per spell: the oldest go first
  // casting it again replaces what this spell had called
  for (const p of [...world.units.values()]) if (p.owner === u.id && p.fromSpell === spellId) { world.units.delete(p.id); emit(world, { t: 'unsummon', pet: p.id }); }
  for (let i = 0; i < count; i++) {
    const pet = spawnMonster(world, def, u.level, [u.x + 1.5 * Math.cos(i), u.z + 1.5 * Math.sin(i)], { side: u.side, owner: u.id, power: (row.petPower || 1) * (1 + (u.sheet.petPct || 0) / 100), lifetime: row.summon?.lifetime || null });
    if (!pet) continue;
    pet.fromSpell = spellId;
    emit(world, { t: 'summon', who: u.id, pet: pet.id, def });
  }
}

function reviveNearAim(world, u, row, dir) {
  const range = row.range || 8;
  let best = null;
  for (const a of world.units.values()) if (a.kind === 'player' && a.downed && dist(a, u) <= range && (!best || dist(a, u) < dist(best, u))) best = a;
  if (!best) { emit(world, { t: 'refused', who: u.id, why: 'Nobody fallen within reach.' }); return; }
  reviveUnit(world, best, row.revive.share, u);
}
function reviveUnit(world, a, share, by) {
  a.downed = null; a.alive = true;
  a.hp = Math.max(1, Math.round(a.maxHp * share));
  a.statuses = {};
  emit(world, { t: 'revived', who: a.id, by: by?.id || null });
}
function tickRevive(world, u, targetId, dt) {
  const D = CF(world.rules).death;
  const a = world.units.get(targetId);
  if (!a?.downed || dist(a, u) > D.reviveRange) { u.reviving = null; return; }
  if (!u.reviving || u.reviving.id !== targetId) u.reviving = { id: targetId, held: 0 };
  u.reviving.held += dt;
  if (u.reviving.held >= D.reviveSeconds) { reviveUnit(world, a, D.reviveShare, u); u.reviving = null; }
}

// ---------------------------------------------------------------- death

function die(world, t, killer) {
  const rules = world.rules;
  if (t.kind === 'player') {
    t.hp = 0; t.alive = false;
    t.downed = { until: world.t + CF(rules).death.downedSeconds, by: killer?.id || null };
    t.statuses = {};
    t.channel = null;
    if (t.form) { t.form = null; }
    for (const m of world.units.values()) if (m.threat) forgetThreat(m, t.id);
    emit(world, { t: 'downed', who: t.id, by: killer?.id || null, until: t.downed.until });
    return;
  }
  t.alive = false; t.hp = 0;
  world.units.delete(t.id);
  emit(world, { t: 'death', who: t.id, by: killer?.id || null, def: t.defId, at: [t.x, t.z] });
  if (t.kind !== 'monster') return;
  // XP for every player who helped and is still near
  const C = CF(rules);
  const helpers = [...t.tappers].map(id => world.units.get(id)).filter(p => p && p.kind === 'player' && dist(p, t) <= C.xpRange.metres);
  for (const p of helpers) {
    const xp = killXp(rules, { monsterXp: t.xp, monsterLevel: t.level, playerLevel: p.char.level, helpers: helpers.length });
    const r = addXp(rules, p.char, xp);
    emit(world, { t: 'xp', who: p.id, amount: r.added, ready: r.ready, from: t.id });
  }
  // the corpse: separate contents for each helper, rolled when they open it
  if (helpers.length) {
    const c = createContainer({ id: newId(world, 'k'), kind: 'corpse', at: [t.x, t.z], level: t.level, table: monsterTable(rules, t), eligible: helpers.map(p => p.id), seed: (world.seed * 7919 + hashStr(t.id)) >>> 0, expires: world.t + C.monsters.corpseSeconds, name: t.name });
    world.containers.set(c.id, c);
    emit(world, { t: 'loot', container: c.id, players: c.eligible, at: c.at, name: c.name });
  }
  if (t.camp) {
    world.camps[t.camp] = Math.max(0, (world.camps[t.camp] || 1) - 1);
    if (world.camps[t.camp] === 0) emit(world, { t: 'camp', camp: t.camp, cleared: true, by: helpers.map(p => p.id) });
  }
}

/** Respawn at a shrine: gold and durability cost (combat.json death, inventory.json durability). */
export function respawnPlayer(world, id, at = null) {
  const u = world.units.get(id);
  if (!u?.downed) return null;
  const D = CF(world.rules).death;
  const gold = Math.min(Math.floor((u.char.gold || 0) * D.goldShare), D.goldCapPerLevel * (u.char.level || 1));
  u.char.gold = (u.char.gold || 0) - gold;
  const wear = wearOnRespawn(world.rules, u.char);
  const p = at || u.shrine;
  u.x = p[0]; u.z = p[1];
  u.downed = null; u.alive = true; u.statuses = {}; u.barrier = 0;
  refreshPlayer(world, id, { full: true });
  emit(world, { t: 'respawned', who: id, gold, wear, at: p });
  return { gold, wear };
}

// ---------------------------------------------------------------- monsters

function stepMonster(world, m, dt) {
  const rules = world.rules;
  const C = CF(rules).monsters;
  if (!m.alive) return;
  const ctl = control(m);
  // walking home after a leash: it ignores everyone and cannot be hurt until it is back
  if (m.returning) {
    moveToward(m, m.home, m.speed * 1.6 * dt);
    if (dist(m, m.home) < 1) { m.returning = false; m.hp = m.maxHp; }
    return;
  }
  const players = [...world.units.values()].filter(p => p.side !== m.side && p.alive && !p.downed);
  if (!players.some(p => dist(p, m) < C.thinkRadius) && !m.threat?.size) return;
  // noticing: closer when the hero sneaks
  if (!m.threat?.size) {
    for (const p of players) {
      const r = p.kind === 'player' ? noticeRange(rules, p.char, m.aggroRange, { sneaking: p.sneaking }) : m.aggroRange * 0.6;
      if (dist(p, m) <= r) noticeThreat(m, p);
    }
  }
  const lookup = id => world.units.get(id);
  const usable = e => e && e.alive && !e.downed && e.side !== m.side;
  const target = m.threat?.size ? pickTarget(m, lookup, usable, dt) : null;
  if (!target) {
    if (dist(m, m.home) > 1 && ctl.move) moveToward(m, m.home, m.speed * 1.4 * dt);
    else if (m.threat?.size) clearThreat(m);
    return;
  }
  m.lastFight = world.t;
  // leash: dragged too far from home, it gives up and heals
  if (dist(m, m.home) > C.leashMetres) {
    clearThreat(m); m.hp = m.maxHp; m.statuses = {}; m.returning = true;
    emit(world, { t: 'leash', who: m.id });
    return;
  }
  const d = dist(m, target);
  m.facing = Math.atan2(target.x - m.x, target.z - m.z);
  if (ctl.fleeing) { moveToward(m, { x: m.x * 2 - target.x, z: m.z * 2 - target.z }, m.speed * dt); return; }
  const reach = m.ranged ? m.ranged.range * C.rangedKeep : (m.reach || 2.2) + bodyR(target);
  if (d > reach) {
    if (ctl.move) moveToward(m, target, m.speed * (1 - slowOf(m)) * dt);
    return;
  }
  if (!ctl.act || world.t < m.swingAt) return;
  m.swingAt = world.t + (m.attackEvery || 1.5);
  if (m.ranged) {
    const dir = norm2(target.x - m.x, target.z - m.z);
    world.projectiles.push({ id: newId(world, 'b'), owner: m.id, x: m.x, z: m.z, dx: dir.x, dz: dir.z, speed: CF(rules).projectile.arrow * 0.6, left: m.ranged.range + 2, row: { mult: 1, element: m.ranged.element || 'physical', ranged: true, applies: m.onHit ? m.onHit.map(id => ({ id, over: {} })) : [] }, ctx: { basic: true }, pierce: 0, hit: new Set(), bounces: 0, keep: 1 });
    emit(world, { t: 'projectile', who: m.id, to: target.id });
  } else {
    hit(world, m, target, { mult: 1, element: 'physical', applies: m.onHit ? m.onHit.map(id => ({ id, over: {} })) : [] }, { basic: true });
  }
}

function moveToward(u, p, len) {
  const dx = p.x - u.x, dz = p.z - u.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return;
  const k = Math.min(1, len / d);
  u.x += dx * k; u.z += dz * k;
}

function stepPet(world, p, dt) {
  const C = CF(world.rules).pets;
  const owner = world.units.get(p.owner);
  if (!owner || (p.expires != null && world.t >= p.expires)) { world.units.delete(p.id); emit(world, { t: 'unsummon', pet: p.id }); return; }
  const ctl = control(p);
  if (dist(p, owner) > C.leashMetres) { p.x = owner.x + 1; p.z = owner.z; return; }
  // fight what is fighting the owner, or what the owner last hit
  const foes = [...world.units.values()].filter(m => m.kind === 'monster' && m.alive && dist(m, owner) < 20 && (m.threat?.has(owner.id) || m.threat?.has(p.id)));
  const target = foes.sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!target) { if (dist(p, owner) > C.followMetres && ctl.move) moveToward(p, owner, p.speed * dt); return; }
  const reach = p.ranged ? p.ranged.range * 0.8 : (p.reach || 2.2) + bodyR(target);
  if (dist(p, target) > reach) { if (ctl.move) moveToward(p, target, p.speed * dt); return; }
  if (!ctl.act || world.t < p.swingAt) return;
  p.swingAt = world.t + (p.attackEvery || 1.5);
  hit(world, p, target, { mult: 1, element: p.ranged?.element || 'physical', applies: [] }, { basic: true });
}

// ---------------------------------------------------------------- for the network

export function snapshot(world) {
  const units = [];
  for (const u of world.units.values()) {
    units.push({
      id: u.id, kind: u.kind, side: u.side, name: u.name, def: u.defId || null, art: u.art || null, level: u.level, rank: u.rank || null,
      x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100, facing: Math.round((u.facing || 0) * 100) / 100,
      hp: Math.round(u.hp), maxHp: u.maxHp, mp: u.mp != null ? Math.round(u.mp) : null, maxMp: u.maxMp ?? null,
      stamina: u.stamina != null ? Math.round(u.stamina) : null, barrier: Math.round(u.barrier || 0),
      downed: !!u.downed, form: u.form?.id || null, body: u.form?.body?.creature || null, mounted: !!u.mounted,
      owner: u.owner || null, auras: auraList(world.rules, u).map(a => ({ id: a.id, name: a.name, icon: a.icon, kind: a.kind, remaining: Math.round(a.remaining * 10) / 10, stacks: a.stacks })),
    });
  }
  return {
    t: Math.round(world.t * 100) / 100, units,
    projectiles: world.projectiles.map(p => ({ id: p.id, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, dx: p.dx, dz: p.dz, spell: p.ctx?.spell || null })),
    zones: world.zones.map(z => ({ id: z.id, x: z.x, z: z.z, radius: z.radius, spell: z.ctx?.spell || null, until: z.until })),
  };
}

/** Everyone's levels waiting for a class pick (the client opens the level-up screen). */
export const levelsWaiting = (world, id) => { const u = world.units.get(id); return u ? pendingLevels(world.rules, u.char) : 0; };

// ---------------------------------------------------------------- regions and camps

/** The region a camp belongs to, and its row (regions.json). */
export function campRow(rules, campId) {
  for (const [rid, r] of Object.entries(rules.data.regions.regions)) if (r.camps?.[campId]) return { region: rid, levels: r.levels, ...r.camps[campId] };
  return null;
}

/** Fill a camp with its monsters at levels inside the camp's range (world-state.js decides when). */
export function spawnCamp(world, campId) {
  const c = campRow(world.rules, campId);
  if (!c) return [];
  const [lo, hi] = c.levels;
  const out = [];
  let i = 0;
  for (const sp of c.spawns) for (let n = 0; n < sp.count; n++, i++) {
    const level = sp.rank === 'boss' ? hi : lo + Math.floor(world.rng() * (hi - lo + 1));
    const ang = (i / 6) * Math.PI * 2, r = sp.rank === 'boss' ? 0 : 4 + (i % 2) * 2;
    out.push(spawnMonster(world, sp.id, level, [c.at[0] + Math.cos(ang) * r, c.at[1] + Math.sin(ang) * r], { rank: sp.rank || 'normal', camp: campId, home: [c.at[0] + Math.cos(ang) * r, c.at[1] + Math.sin(ang) * r] }));
  }
  return out.filter(Boolean);
}

/** Roaming monsters for a region near `at`: a weighted pick from its roster, level inside the region's range. */
export function spawnRoamers(world, regionId, at, { packs = 1 } = {}) {
  const r = world.rules.data.regions.regions[regionId];
  if (!r) return [];
  const out = [];
  const total = r.roam.reduce((s, x) => s + x.weight, 0);
  for (let p = 0; p < packs; p++) {
    let roll = world.rng() * total, pick = r.roam[0];
    for (const x of r.roam) { roll -= x.weight; if (roll <= 0) { pick = x; break; } }
    const n = pick.pack[0] + Math.floor(world.rng() * (pick.pack[1] - pick.pack[0] + 1));
    const level = r.levels[0] + Math.floor(world.rng() * (r.levels[1] - r.levels[0] + 1));
    for (let i = 0; i < n; i++) out.push(spawnMonster(world, pick.id, level, [at[0] + p * 8 + i * 1.5, at[1] + i]));
  }
  return out.filter(Boolean);
}
