// The PARITY ORACLE: Farhold's own runtime, driven headlessly, for the fixtures to compare against.
//
// Farhold's EnemyField (js/actors.js) imports Three.js, so it is loaded through Farhold's own
// three-loader (tests may do this; js/rules/ never imports actors.js). The pieces of main.js the
// fight goes through (`swingWith`'s melee branch, `onEnemyStrike`) cannot be imported — main.js is
// an 11,000-line browser closure — so they are TRANSCRIBED here, line for line, and DRIFT-GUARDED:
// `DRIFT` holds a hash of each transcribed block's source text, and tests/C/drift.test.mjs fails
// the moment Farhold edits one, naming the block to re-check (PLAN §6.1 "Drift").

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

register('../../../farhold/tests/three-loader.mjs', import.meta.url);

const FJS = new URL('../../../farhold/js/', import.meta.url);
const { EnemyField } = await import(new URL('actors.js', FJS));
const { Rpg, attuneWeapon, elementOf, statusOf, CAST_ELEMENTS } = await import(new URL('rpg.js', FJS));
const { installUniques } = await import(new URL('uniques.js', FJS));
const { installFoci } = await import(new URL('foci.js', FJS));
const { applyStatus, incomingFrom, outgoingFrom, STATUS_POWER_SHARE } = await import(new URL('skills.js', FJS));
const { controlFor } = await import(new URL('skillmech.js', FJS));
const { handsOf, OFFHAND_DAMAGE, strikeAt, withArea } = await import(new URL('weapons.js', FJS));
const { makeRng } = await import(new URL('../../emberveil/js/rng.js', FJS));
const { groundAt } = await import(new URL('ground.js', FJS));
export { makeRng, EnemyField, incomingFrom, outgoingFrom, applyStatus, STATUS_POWER_SHARE };

// ------------------------------------------------------------------ drift guard

/** Pull a block out of a Farhold source file: from the line matching `start` to the line matching `end`. */
export function block(file, start, end) {
  const src = readFileSync(new URL(file, FJS), 'utf8').split('\n');
  const a = src.findIndex(l => start.test(l));
  if (a < 0) return null;
  let b = src.findIndex((l, i) => i > a && end.test(l));
  if (b < 0) b = src.length - 1;
  return src.slice(a, b + 1).join('\n');
}
export const hash = text => createHash('sha256').update(text.replace(/\s+/g, ' ')).digest('hex').slice(0, 16);

/**
 * The Farhold blocks Thousandvale's forked orchestration mirrors. When a hash goes red: read the
 * Farhold diff, port it to the named Thousandvale file, re-run the parity fixtures, update the hash.
 */
export const DRIFT = [
  { name: 'main.js swingWith (melee branch)', file: 'main.js', start: /const swingWith = \(hand, stepIndex\) => \{/, end: /AND THE SAME SWING TAKES DOWN A TREE/, mirror: 'js/rules/cast.js resolveSwing + attack' },
  { name: 'main.js onEnemyStrike', file: 'main.js', start: /onEnemyStrike: e => \{/, end: /onEnemyStrikeObject:/, mirror: 'js/rules/monster-ai.js monsterStrike' },
  { name: 'main.js castSkill', file: 'main.js', start: /function castSkill\(i, \{ echo = false \} = \{\}\) \{/, end: /^  function reportHit/, mirror: 'js/rules/cast-skills.js' },
  { name: 'main.js landStatus', file: 'main.js', start: /function landStatus\(type, spec, enemy, power = 1\)/, end: /const statusHook =/, mirror: 'js/rules/cast.js landStatus' },
  { name: 'main.js onEnemyKilled', file: 'main.js', start: /function onEnemyKilled\(e\) \{/, end: /rollDrops/, mirror: 'js/rules/cast.js field.onKill' },
  { name: 'actors.js EnemyField.update', file: 'actors.js', start: /^  update\(dt, player, playerUnit, hooks = \{\}\) \{/, end: /^  spread\(dt\) \{/, mirror: 'js/rules/monster-ai.js tickMonsters' },
  { name: 'actors.js strike/strikeArea/strikeSegment/land', file: 'actors.js', start: /^  land\(e, result,/, end: /^  bleed\(e, amount = 1\) \{/, mirror: 'js/rules/field.js' },
  { name: 'actors.js add', file: 'actors.js', start: /^  async add\(def, level, x, z,/, end: /this\.pending\+\+;/, mirror: 'js/rules/monster-ai.js spawnMonster' },
  { name: 'skillrun.js afterimage/echoFrom', file: 'skillrun.js', start: /^  function afterimage\(plan, a, origin\) \{/, end: /^  const TALENT_FX = \{/, mirror: 'js/rules/cast-skills.js afterimage/echoFrom' },
  { name: 'skillrun.js channel/rewind', file: 'skillrun.js', start: /^  function startChannel\(plan, slot\) \{/, end: /^  const tracked = \[\];/, mirror: 'js/rules/cast-skills.js startChannel/doRewind/rt.tick' },
  { name: 'actors.js aimOf/taunt', file: 'actors.js', start: /^  aimOf\(e, player, playerDist, dt = 0\) \{/, end: /^  update\(dt, player, playerUnit/, mirror: 'js/rules/threat.js pickTarget/taunt + monster-ai.js targeting' },
  { name: 'skills.js fill', file: 'skills.js', start: /^  function fill\(ids\) \{/, end: /^  fill\(data\.classes/, mirror: 'js/rules/character.js fillSlots' },
  { name: 'main.js fireBolt', file: 'main.js', start: /^  function fireBolt\(plan, a, dx, dy, dz/, end: /^  function regrab\(\)/, mirror: 'js/rules/cast-skills.js fireBolt' },
  { name: 'main.js dropPool/tickPools', file: 'main.js', start: /^  function dropPool\(\{ x, z, r, seconds/, end: /if \(p\.left <= 0\) \{/, mirror: 'js/rules/cast-skills.js dropPool/tickPools' },
  { name: 'main.js onArrowLand', file: 'main.js', start: /onArrowLand: arrow => \{/, end: /^  \}\);/, mirror: 'js/rules/cast.js resolveArrow' },
  { name: 'skillrun.js allies/heal/mechEnv/place/runPlaced', file: 'skillrun.js', start: /^  function allies\(\) \{/, end: /^  function onObjectStruck/, mirror: 'js/rules/cast-skills.js runtimeOf' },
  { name: 'skillrun.js dash/line/repeats', file: 'skillrun.js', start: /^  function dash\(plan, a, opts\) \{/, end: /^  function afterimage/, mirror: 'js/rules/cast-skills.js dash/line/repeats' },
  { name: 'skillrun.js afterBolt/afterCast', file: 'skillrun.js', start: /^  function afterBolt\(/, end: /^  function summonFrom/, mirror: 'js/rules/cast-skills.js afterCast' },
  { name: 'skillrun.js onHurt', file: 'skillrun.js', start: /^  function onHurt\(result, attacker, victim\) \{/, end: /^  function onKill\(e\) \{/, mirror: 'js/rules/cast-skills.js installSkillRuntime onHurt' },
  { name: 'skillrun.js tick', file: 'skillrun.js', start: /^  function tick\(dt, \{ fighting = false \} = \{\}\) \{/, end: /^  function reset\(\) \{/, mirror: 'js/rules/cast-skills.js rt.tick' },
  { name: 'actors.js spread/shove/slide', file: 'actors.js', start: /^  spread\(dt\) \{/, end: /^  applyModifier\(e, id\) \{/, mirror: 'js/rules/monster-ai.js spread' },
];

// ------------------------------------------------------------------ Farhold's runtime

const readJson = u => JSON.parse(readFileSync(u, 'utf8'));
const D = p => new URL(p, new URL('../../../farhold/data/', import.meta.url));

/** Farhold's Rpg booted the way main.js boots it (uniques + foci in memory). */
export function farholdRpg(seed = 1) {
  const items = readJson(new URL('../../../emberveil/data/items.json', import.meta.url));
  const balance = readJson(D('balance.json'));
  const talents = readJson(D('talents.json'));
  installUniques(items, readJson(D('uniques.json')), { tools: readJson(D('tools.json')) });
  installFoci(items, { balance });
  const rpg = new Rpg(items, { ...balance, seed }, talents);
  return { rpg, balance, items, skills: readJson(D('skills.json')), classes: readJson(D('classes.json')).classes, enemies: readJson(D('enemies.json')) };
}

/** A character dressed as main.js `begin()` dresses one (starter, off starter, armour). */
export function farholdCharacter(F, classId, level, kitRng) {
  const classDef = F.classes.find(c => c.id === classId);
  const p = F.rpg.createPlayer({ name: 'Wayfarer', classId, level });
  const starter = attuneWeapon(F.rpg.loot.generate(classDef.starter || 'sword', 'normal', 'low', { rng: kitRng }));
  if (starter) F.rpg.equip(p, starter, { force: true });
  const off = classDef.offStarter ? attuneWeapon(F.rpg.loot.generate(classDef.offStarter, 'normal', 'low', { rng: kitRng })) : null;
  if (off) F.rpg.equip(p, off, { into: 'offhand', force: true });
  for (const key of classDef.startingArmour || []) {
    const piece = attuneWeapon(F.rpg.loot.generate(key, 'normal', 'low', { rng: kitRng }));
    if (piece) F.rpg.equip(p, piece, { force: true });
  }
  F.rpg.refresh(p, { full: true });
  return p;
}

export function fakeActor(beast = true) {
  const v = () => ({ x: 0, y: 0, z: 0, set() {}, setScalar() {} });
  return {
    beast, anims: [],
    group: { position: v(), rotation: v(), scale: v(), add() {}, remove() {} },
    setAnim(name) { this.anims.push(name); }, update() {}, dispose() {},
  };
}

export const flat = () => ({
  heightAt: () => 0, slopeAt: () => 0, normalAt: (x, z, s, o = [0, 1, 0]) => { o[0] = 0; o[1] = 1; o[2] = 0; return o; },
  waterAt: () => 0, underwater: () => false, roadAt: () => 0, clampToWorld: (x, z) => [x, z], biomeIdAt: () => 0,
});

/** The real EnemyField with no spawner (paused), seeded with `seed`. */
export function farholdField(F, seed) {
  const field = new EnemyField({
    scene: { add() {}, remove() {} }, terrain: flat(), rpg: F.rpg, defs: F.enemies.enemies,
    bosses: F.enemies.bosses, modifiers: F.enemies.modifiers, balance: { ...F.balance, seed },
  });
  field.paused = true;
  field.statusData = F.skills.statuses;
  // Farhold's aimOf returns "the player" before it reaches its untargetable check whenever the
  // companion list is EMPTY, so a solo Bolt Step never made anything hold still. One fallen
  // placeholder companion (never usable) lets the check run, which is the behaviour Farhold intends
  // and Thousandvale has. Logged as a Farhold finding in js/rules/README.md.
  field.setCompanions(() => [{ id: '__none', dying: 0, removed: true, x: 1e6, z: 1e6 }]);
  /**
   * main.js `onEnemyKilled` (line ~2646), the part that touches the fight's rng: the drop roll is
   * `rpg.rollDrops(e, { rng: field.rng, … })` — the SAME generator the strikes use, mid-swing. Set
   * `field.oraclePlayer` to the player whose magic find applies. `field.drops` records them.
   */
  field.drops = [];
  field.onKill = e => {
    const p = field.oraclePlayer;
    if (!p) return;
    F.rpg.onKillRestore(p);
    F.rpg.gainXp(p, F.rpg.killXpFor(p, e, F.balance.xp || {}));
    field.drops.push(...(F.rpg.rollDrops(e, { rng: field.rng, magicFind: p.derived.magicFind }) || []));
  };
  return field;
}

/** EnemyField.add, synchronously (the real one awaits a mesh): same fields, same rng order. */
export function farholdAdd(field, def, level, x, z, { rank = 'normal', modifiers = [], name = null, boss = false } = {}) {
  const unit = field.rpg.makeEnemy(def, level, field.rng, { rank: boss && rank === 'normal' ? 'boss' : rank, modifiers, name });
  unit.x = x; unit.z = z; unit.y = groundAt(field.terrain, x, z);
  unit.state = 'wander'; unit.wanderTimer = 0; unit.swingTimer = 0; unit.hitFlash = 0;
  unit.stagger = 0; unit.push = null; unit.recoil = null; unit.sunder = 0; unit.sunderLeft = 0; unit.closing = 0;
  unit.home = [x, z];
  unit.facing = field.rng() * Math.PI * 2;
  unit.hover = def.flying ? 1.4 + field.rng() * 0.8 : 0;
  unit.bob = field.rng() * Math.PI * 2;
  unit.playerDamage = 0;
  const sizeUp = modifiers.reduce((m, mod) => m * (mod.scale ?? 1), 1) * (def.scale ?? 1);
  if (sizeUp !== 1) {
    unit.scale *= sizeUp;
    unit.reach = (unit.reach || 2.2) * (1 + (sizeUp - 1) * 0.6);
    unit.aggroRange = (unit.aggroRange || 26) * (1 + (sizeUp - 1) * 0.2);
    unit.hover *= sizeUp;
  }
  unit.bodyR = Math.max(0.4, (unit.reach || 2.2) * 0.3);
  unit.fx = [];
  unit.actor = fakeActor(true);
  field.enemies.push(unit);
  return unit;
}

// ------------------------------------------------------------------ main.js, transcribed

/** main.js `landStatus` (line ~1258) for one player. */
export function farholdLandStatus(F, player, type, spec, enemy, power = 1) {
  if (!type || !spec) return;
  if (enemy && enemy !== player) {
    const ctl = controlFor(enemy, type, spec.seconds ?? 3);
    if (ctl.id !== type) { type = ctl.id; spec = { ...(F.skills.statuses[ctl.id] || {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }; }
    else if (ctl.seconds !== (spec.seconds ?? 3)) spec = { ...spec, seconds: ctl.seconds };
  }
  const longer = F.rpg.fx.sum(player, 'statusLonger', { type, spec });
  const strength = F.rpg.fx.product(player, 'statusPower', { type });
  applyStatus(enemy, type, spec, power, { longer, strength });
}

/**
 * main.js `swingWith(hand, stepIndex)`, the melee branch (line ~9126 to ~9480), with the HUD,
 * sound and effects calls left out and `resolveHits` (unique powers) left out — the fixtures use
 * characters without uniques. `control` = { x, z, yaw }.
 */
export function farholdSwing(F, field, control, player, hand = 'main', stepIndex = 0) {
  const statusForElement = el => CAST_ELEMENTS.find(e => e.element === el)?.status || null;
  const hands = handsOf(player);
  const weapon = hand === 'off' ? hands.off : hands.main;
  const kind = 'melee';
  const mods = F.rpg.attackMods(player, kind, { weapon, hand });
  const share = (hand === 'off' ? OFFHAND_DAMAGE : 1) * (mods.power || 1);
  const shape = { ...withArea(strikeAt(weapon, stepIndex), player.derived.areaPct || 0) };
  if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
  const reach = shape.reach;
  const arc = mods.fullCircle ? Math.PI * 2 : shape.arc;
  const element = mods.element || elementOf(weapon);
  const leaves = mods.element ? statusForElement(mods.element) : statusOf(weapon);
  const statusHook = (target, type, spec) => { if (target && spec) farholdLandStatus(F, player, type, spec, target, 1); };
  const brandHit = (enemy, result) => {
    if (leaves && F.skills.statuses[leaves] && result?.amount > 0) farholdLandStatus(F, player, leaves, F.skills.statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
  };
  const meleeOpts = { element, onHit: brandHit, applyStatus: statusHook, power: share * shape.damage };
  const hits = field.strike(control, player, { reach, arc, ...meleeOpts });
  if (player.perkFlags?.sunder && shape.last) for (const h of hits) h.enemy.armor = Math.max(0, (h.enemy.armor || 0) - 8);
  const swung = { self: player, mana: 0 };
  F.rpg.fx.onSwing(swung);
  if (swung.mana > 0) player.mp = Math.min(player.derived.maxMp || player.mp, player.mp + swung.mana);
  const splash = (F.balance.player?.meleeSplash ?? 1) * (shape.splash || 1);
  if (splash > 0) {
    const dx = Math.sin(control.yaw), dz = Math.cos(control.yaw);
    const already = new Set(hits.map(h => h.enemy));
    for (const { enemy, result } of field.strikeArea(control.x + dx * reach * 0.6, control.z + dz * reach * 0.6, splash, player, { falloff: 0.3, element, power: share * shape.damage })) {
      if (!already.has(enemy)) { brandHit(enemy, result); hits.push({ enemy, result }); }
    }
  }
  return hits;
}

/** main.js `onEnemyStrike` (line ~9584) with no companions: the enemy hits the player. */
export function farholdEnemyStrike(F, field, player, e, mech = null) {
  const result = F.rpg.strike(e, player, field.rng, { multiplier: incomingFrom(player) * outgoingFrom(e) });
  mech?.onHurt(result, e, player);
  if (e.lifeSteal) e.hp = Math.min(e.maxHp, e.hp + Math.round(result.amount * e.lifeSteal));
  if (e.onHit?.length) field.statusOnHit(e, player, F.skills.statuses);
  return result;
}
