// node --test prototypes/thousandvale/tests/C/playtest8.test.mjs
//
// Owner feedback 8 (~/claude/agent/mmo/round-playtest8.md), the combat rules:
//   W14  "Firebolt should have a projectile, not instant damage" — every bolt / arrow / thrown attack travels and lands later
//   W2   every ranged monster attack is the same kind of projectile event — you always see where a hit came from
//   W4   mobs give more XP at the levels a new player meets them; the grey-con rule stays
//   W19  backpacks: bag slots, fewer properties than a cloak
//   W22  no light item can drop, be made, be sold, be in a kit or be worn; what a player owned is paid back
//   W23  no two starter packs of a class are near-duplicates; armour sets differ in stats
// The RULES are pinned (orderings, "never before it arrives"), not the tuning numbers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor, starterGear, isLightItem, lightRefund, bagBonusOf, priceOf, LIGHT, makeCrate } from '../../js/rules/index.js';
import { kitDistance, KIT_MIN_DIFF, KIT_MAX_PER_HANDS, KIT_AXES } from '../../js/rules/starter-kits.js';
import { createCharacter } from '../../js/rules/character.js';
import { makeRng } from '../../js/rules/rng.js';
import { parityEngineFor } from './setup.mjs';
import { xpWalk } from './xp-walk.mjs';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const TICK_MS = 50;
let n = 0;
function world() {
  const events = [];
  const id = `pt8-${++n}`;
  const awards = [];
  const room = createRoom({ id, terrain, seed: 33, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: (e, a) => awards.push(a) } });
  const w = { room, events, awards, tick: 0 };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 40;
  w.add = (cls, level = 10, extra = {}) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ, ...extra }, null);
  w.mob = (type, dx, dz, level = 5) => { const m = room.spawn({ kind: 'monster', type, level, x: SX + dx, z: SZ + dz, data: { noRank: true } }); m.r.unit.maxHp = m.r.unit.hp = 1e6; return m; };
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  return w;
}
const ready = (e, slot) => { const u = e.r.unit; if (slot > 0) u.skills.slots[slot - 1].ready = 0; u.mp = u.maxMp; u.swing.mainReady = 0; };
const freeze = m => { const u = m.r.unit; u.speed = 0; u.statuses ||= {}; };
const isProj = e => e.type === 'fx' && (e.kind === 'bolt' || e.kind === 'arrow' || e.kind === 'shot') && !e.cosmetic;

// ============================================================================ W14

test('W14: Firebolt is a projectile — the event says from / to / speed / flight time, and the damage arrives with it, not with the cast', () => {
  const w = world();
  const me = w.add('pyromancer', 4);
  const m = w.mob('moor_hound', 0, 16, 3); freeze(m);
  w.steps(2);
  ready(me, 1);
  const at = w.tick;
  assert.equal(w.room.intent(me, { t: 'cast', slot: 1, target: m.id }).ok, true);
  w.steps(1);
  const fx = w.events.find(e => isProj(e) && e.skill === 'firebolt');
  assert.ok(fx, 'a projectile event went out with the cast');
  assert.equal(fx.id, me.id); assert.equal(fx.to, m.id); assert.equal(fx.home, 1);
  assert.ok(fx.from && Number.isFinite(fx.from.x) && Number.isFinite(fx.from.z), 'it says where it starts');
  assert.ok(fx.speed > 0 && fx.speed <= 24, `a spell bolt flies at a speed a player can see (${fx.speed} m/s)`);
  assert.ok(fx.proj, 'and what to draw');
  const dist = Math.hypot(m.x - me.x, m.z - me.z);
  assert.ok(Math.abs(fx.ms - dist / fx.speed * 1000) <= 60, `ms is the distance over the speed (${fx.ms} for ${dist.toFixed(1)} m at ${fx.speed})`);
  assert.ok(fx.ms >= 500, `at ${dist.toFixed(0)} m the flight is long enough to watch (${fx.ms} ms)`);
  const hitBefore = () => w.events.find(e => e.type === 'hit' && e.d === m.id && e.ab === 'firebolt');
  assert.equal(hitBefore(), undefined, 'nothing lands with the cast');
  w.steps(Math.floor(fx.ms / TICK_MS) - 3);
  assert.equal(hitBefore(), undefined, 'nor while it is still in the air');
  w.steps(6);
  const hit = hitBefore();
  assert.ok(hit, 'it lands when it arrives');
  assert.ok(Math.abs((hit.tick - at) * TICK_MS - fx.ms) <= 2 * TICK_MS, `the hit comes ${fx.ms} ms after the cast (${(hit.tick - at) * TICK_MS})`);
});

test('W14: a projectile homes — a target that walked away is still hit; one that died on the way is not replaced by a new victim', () => {
  // (a) it moved 9 m sideways during the flight
  {
    const w = world();
    const me = w.add('pyromancer', 4);
    const m = w.mob('moor_hound', 0, 18, 3); freeze(m);
    w.steps(2); ready(me, 1);
    w.room.intent(me, { t: 'cast', slot: 1, target: m.id });
    w.steps(2);
    w.room.rules.room.run(() => { m.r.unit.x += 9; });
    w.steps(40);
    assert.ok(w.events.some(e => e.type === 'hit' && e.d === m.id && e.ab === 'firebolt'), 'the bolt followed it');
  }
  // (b) it died in the air: a second monster 12 m to the side is not struck in its place
  {
    const w = world();
    const me = w.add('pyromancer', 4);
    const m = w.mob('moor_hound', 0, 18, 3), other = w.mob('moor_hound', 12, 18, 3); freeze(m); freeze(other);
    w.steps(2); ready(me, 1);
    w.room.intent(me, { t: 'cast', slot: 1, target: m.id });
    w.steps(2);
    w.room.rules.room.run(() => { m.r.unit.hp = 0; w.room.rules.field.kill(m.r.unit); });
    const from = w.events.length;
    w.steps(40);
    assert.ok(!w.events.slice(from).some(e => e.type === 'hit' && e.ab === 'firebolt'), 'the bolt is spent on the body that fell');
  }
});

test('W14: EVERY bolt skill of every class, and every bow / crossbow / javelin / wand basic attack, travels: a projectile event first, the hit never before it arrives', () => {
  const skills = engine.skillData.skills;
  const classes = engine.skillData.classes || {};
  const checked = [], bad = [];
  for (const c of engine.classes) {
    const ids = (classes[c.id]?.skills || classes[c.id] || []).filter?.(id => skills[id]?.shape === 'bolt') || [];
    for (const sid of ids) {
      const w = world();
      const me = w.add(c.id, 30);
      const slot = me.r.unit.skills.slots.findIndex(s => s.id === sid) + 1;
      if (!slot) continue;
      const m = w.mob('moor_hound', 0, 15, 28); freeze(m);
      w.steps(2); ready(me, slot);
      const at = w.tick;
      const r = w.room.intent(me, { t: 'cast', slot, target: m.id });
      if (!r.ok) { bad.push(`${c.id}/${sid}: refused (${r.text || r.why})`); continue; }
      w.steps(60);
      const fx = w.events.find(e => isProj(e) && e.kind === 'bolt' && e.skill === sid && !e.hop);
      if (!fx) { bad.push(`${c.id}/${sid}: no projectile event`); continue; }
      if (!(fx.speed > 0) || !(fx.ms >= 200) || !fx.from || !fx.proj) bad.push(`${c.id}/${sid}: event lacks speed / ms / from / proj (${JSON.stringify(fx).slice(0, 160)})`);
      const hit = w.events.find(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.ab === sid);
      if (hit && (hit.tick - at) * TICK_MS < fx.ms - TICK_MS) bad.push(`${c.id}/${sid}: hit after ${(hit.tick - at) * TICK_MS} ms, the bolt needs ${fx.ms}`);
      checked.push(sid);
    }
  }
  assert.ok(checked.length >= 25, `${checked.length} bolt skills checked`);
  // basic attacks
  for (const [cls, base] of [['ranger', 'shortbow'], ['ranger', 'bow'], ['ranger', 'crossbow'], ['ranger', 'javelin'], ['mage', 'wand']]) {
    const w = world();
    const me = w.add(cls, 10);
    const it = w.room.rules.makeItem(me, { base, rarity: 'normal', level: 10 });
    if (base === 'wand') { it.castStyle = 'bolt'; it.wandBehaviour = 'bolt'; }
    const off = me.r.unit.equipment.offhand; if (off && it.twoHanded) w.room.rules.unequip(me, 'offhand');
    assert.ok(w.room.rules.equip(me, it, 'weapon').ok, base);
    const m = w.mob('moor_hound', 0, 14, 9); freeze(m);
    w.steps(2); ready(me, 0);
    const at = w.tick;
    w.room.intent(me, { t: 'cast', slot: 0, target: m.id });
    w.steps(80);
    const fx = w.events.find(e => isProj(e) && e.id === me.id && e.basic);
    if (!fx) { bad.push(`basic ${base}: no projectile event`); continue; }
    if (!(fx.speed > 0 && fx.speed <= 30) || !(fx.ms >= 200) || !fx.from || fx.home !== 1 || fx.to !== m.id) bad.push(`basic ${base}: ${JSON.stringify(fx).slice(0, 200)}`);
    const hit = w.events.find(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.tick >= fx.tick);
    if (!hit) bad.push(`basic ${base}: never landed`);
    else if ((hit.tick - fx.tick) * TICK_MS < fx.ms - TICK_MS) bad.push(`basic ${base}: hit ${(hit.tick - fx.tick) * TICK_MS} ms after the shot, flight ${fx.ms}`);
    void at;
  }
  assert.deepEqual(bad, []);
});

test('W14: a parity engine keeps Farhold\'s own flight (no table), so the frame-by-frame fixtures compare the same thing', async () => {
  const e = await parityEngineFor(3);
  assert.equal(e.projectiles, null);
  assert.ok(engine.projectiles && engine.projectiles.minMs >= 180);
});

// ============================================================================ W2

test('W2: EVERY ranged monster in the bestiary shoots a projectile you can see — from the shooter, slow enough, and the hit comes with its arrival even if you walk', () => {
  const ranged = [...(engine.bestiary.enemies || []), ...(engine.bestiary.bosses || [])].filter(d => d.ranged);
  assert.ok(ranged.length >= 8, `${ranged.length} ranged monsters`);
  const bad = [];
  for (const def of ranged) {
    const w = world();
    const me = w.add('knight', 20);
    me.r.unit.maxHp = me.r.unit.hp = 1e7;
    const m = w.room.spawn({ kind: 'monster', type: def.id, level: 5, x: SX, z: SZ + Math.min(16, def.ranged.range - 4), data: { noRank: true } });
    let fx = null;
    for (let i = 0; i < 200 && !fx; i++) { w.steps(1); fx = w.events.find(e => isProj(e) && e.kind === 'shot' && e.id === m.id); }
    if (!fx) { bad.push(`${def.id}: never shot`); continue; }
    if (!fx.from || fx.to !== me.id || fx.home !== 1 || !(fx.speed > 0 && fx.speed <= 30) || !(fx.ms >= 180)) { bad.push(`${def.id}: ${JSON.stringify(fx).slice(0, 200)}`); continue; }
    if (Math.hypot(fx.from.x - m.r.unit.x, fx.from.z - m.r.unit.z) > 3) bad.push(`${def.id}: the shot does not start at the shooter`);
    const hitsBefore = w.events.filter(e => e.type === 'hit' && e.s === m.id && e.d === me.id && e.skill === 'shot').length;
    if (hitsBefore) bad.push(`${def.id}: damage before the projectile arrived`);
    w.room.rules.room.run(() => { me.r.unit.x += 6; });           // walk out from under it: it homes
    me.moveTo?.(me.r.unit.x, me.r.unit.z);
    w.steps(Math.ceil(fx.ms / TICK_MS) + 2);
    const hit = w.events.find(e => e.type === 'hit' && e.s === m.id && e.d === me.id && e.skill === 'shot');
    if (!hit) bad.push(`${def.id}: the shot never landed`);
    else if ((hit.tick - fx.tick) * TICK_MS < fx.ms - TICK_MS) bad.push(`${def.id}: landed after ${(hit.tick - fx.tick) * TICK_MS} ms of a ${fx.ms} ms flight`);
  }
  assert.deepEqual(bad, []);
});

test('W2: a hit a monster lands from beyond arm\'s reach ALWAYS has a projectile event from that monster first (basic shots and telegraphed specials alike)', () => {
  const w = world();
  const me = w.add('knight', 20);
  me.r.unit.maxHp = me.r.unit.hp = 1e7;
  const mons = ['brigand_archer', 'sky_cultist'].map((t, i) => w.room.spawn({ kind: 'monster', type: t, level: 6, x: SX + i * 4, z: SZ + 18, data: { noRank: true } }));
  for (let i = 0; i < 1600; i++) { me.moveTo?.(SX, SZ); w.steps(1); }
  const far = w.events.filter(e => e.type === 'hit' && e.d === me.id && e.kind === 'dmg' && mons.some(m => m.id === e.s) && e.skill !== 'pool' && e.skill !== 'dot');
  assert.ok(far.length > 20, `${far.length} hits taken`);
  const specials = far.filter(h => h.skill !== 'shot');
  let unseen = 0;
  for (const h of far) {
    const seen = w.events.some(e => e.type === 'fx' && e.kind === 'shot' && e.id === h.s && e.to === me.id && e.tick <= h.tick && e.tick >= h.tick - 60);
    if (!seen) unseen++;
  }
  assert.equal(unseen, 0, 'every ranged hit could be seen coming');
  if (specials.length) assert.ok(w.events.some(e => e.type === 'fx' && e.kind === 'shot' && e.cosmetic === 1 && e.from), 'a special\'s shot is marked cosmetic (no second hit)');
});

// ============================================================================ W4

test('W4: monsters pay more experience at levels 1-10 — fewer kills to every level than before, about a dozen each; the long game and the grey-con rule are untouched', async () => {
  const before = await xpWalk({ early: false, top: 16, n: 240 });
  const after = await xpWalk({ top: 16, n: 240 });
  for (let i = 0; i < 10; i++) {
    const b = before.rows[i], a = after.rows[i];
    assert.ok(a.killsToLevel < b.killsToLevel, `level ${a.level}: ${b.killsToLevel} -> ${a.killsToLevel} kills`);
    assert.ok(a.killsToLevel <= 16 && a.killsToLevel >= 6, `level ${a.level}: ${a.killsToLevel} kills to the next (neither a slog nor a gift)`);
    assert.ok(a.grindVsQuest >= 0.75, `level ${a.level}: an hour of killing earns at least three quarters of an hour of questing (${a.grindVsQuest})`);
  }
  const E = engine.progression.xp.killEarly;
  const top = after.rows.find(r => r.level === Math.min(16, E.fadeTo + 1)), topB = before.rows.find(r => r.level === top.level);
  assert.ok(Math.abs(top.perKill - topB.perKill) / topB.perKill < 0.12, `past level ${E.fadeTo} a kill pays what it did (${topB.perKill} -> ${top.perKill})`);
  // the rule itself: a low monster pays more, it fades, and it ends at the base multiplier
  const base = engine.xpCfg.kill;
  assert.ok(engine.xpCfgFor(1).kill > base && engine.xpCfgFor(E.until).kill === engine.xpCfgFor(1).kill);
  assert.ok(engine.xpCfgFor(E.until + 2).kill < engine.xpCfgFor(1).kill && engine.xpCfgFor(E.until + 2).kill > base, 'it fades');
  assert.equal(engine.xpCfgFor(E.fadeTo).kill, base); assert.equal(engine.xpCfgFor(40).kill, base);
  // grey con: five levels below pays nothing, one above pays more — Farhold's rule, through the new numbers
  const hound = { level: 1, xp: 20 };
  assert.equal(engine.rpg.killXpFor({ level: 6 }, hound, engine.xpCfgFor(1)), 0);
  assert.ok(engine.rpg.killXpFor({ level: 1 }, { level: 2, xp: 20 }, engine.xpCfgFor(2)) > engine.rpg.killXpFor({ level: 2 }, { level: 2, xp: 20 }, engine.xpCfgFor(2)));
  // a parity engine never sees it
  const pe = await parityEngineFor(2);
  assert.equal(pe.xpCfgFor(1), pe.xpCfg);
});

// ============================================================================ W19

test('W19: backpacks — worn on the back, +4 / +6 / +8 bag slots by base, fewer rolled properties than a cloak of the same rarity, and the bag rule refuses taking one off a full bag', () => {
  const rng = makeRng(81);
  const caps = engine.tvGear.packs.affixCap;
  const want = { sling_satchel: 4, trail_rucksack: 6, expedition_pack: 8 };
  let prev = 0;
  for (const [base, slots] of Object.entries(want)) {
    assert.ok(slots > prev); prev = slots;
    for (const rarity of ['normal', 'magic', 'rare', 'legendary']) {
      let most = 0, cloakMost = 0;
      for (let i = 0; i < 40; i++) {
        const it = engine.makeItem({ base, rarity, level: 20, rng });
        assert.equal(it.slot, 'back'); assert.equal(it.pack, true); assert.equal(it.bagSlots, slots); assert.equal(bagBonusOf(it), slots);
        assert.equal(it.bagText, `+${slots} bag slots`);
        const rolled = it.affixes.filter(a => !a.intrinsic && !a.baseIntrinsic).length;
        assert.ok(rolled <= caps[rarity], `${it.name}: ${rolled} properties, at most ${caps[rarity]}`);
        most = Math.max(most, rolled);
        cloakMost = Math.max(cloakMost, engine.makeItem({ base: 'travel_cloak', rarity, level: 20, rng }).affixes.filter(a => !a.intrinsic && !a.baseIntrinsic).length);
      }
      if (rarity !== 'normal') assert.ok(most < cloakMost, `${base} ${rarity}: a pack rolls fewer properties (${most}) than a cloak (${cloakMost})`);
    }
  }
  assert.equal(bagBonusOf(engine.makeItem({ base: 'travel_cloak', level: 5, rng })), 0, 'a cloak gives no bag room');
  assert.ok(priceOf(engine.makeItem({ base: 'expedition_pack', level: 20, rng })) > priceOf(engine.makeItem({ base: 'travel_cloak', level: 20, rng })), 'room is worth gold');
  // they drop
  let dropped = 0;
  for (let i = 0; i < 20000; i++) { const it = engine.rpg.rollDrop({ level: 12, rng, chance: 1 }); if (it?.pack) { dropped++; assert.ok(it.bagSlots === 4 || it.bagSlots === 6, 'an 8-slot pack does not drop at level 12'); } }
  assert.ok(dropped > 10, `${dropped} packs in 20,000 drops`);
  // worn: the bonus, and the refusals A relies on
  const w = world();
  const me = w.add('ranger', 12);
  const R = w.room.rules;
  const pack = R.makeItem(me, { base: 'trail_rucksack', level: 12 }), cloak = R.makeItem(me, { base: 'travel_cloak', level: 12 }), small = R.makeItem(me, { base: 'sling_satchel', level: 12 });
  assert.equal(R.bagBonus(me), 0);
  assert.equal(R.equip(me, pack).ok, true);
  assert.equal(R.bagBonus(me), 6);
  assert.equal(R.canUnequip(me, 'back', { bagCount: 40, bagBase: 40 }).ok, false, 'the pack itself would not fit back into a full bag');
  const no = R.canUnequip(me, 'back', { bagCount: 44, bagBase: 40 });
  assert.deepEqual([no.ok, no.why, no.need], [false, 'bagSlots', 5]); assert.match(no.text, /Empty 5 more bag slots first/);
  assert.equal(R.unequip(me, 'back', { bagCount: 44, bagBase: 40 }).ok, false); assert.equal(me.r.unit.equipment.back, pack, 'still worn');
  assert.equal(R.canEquip(me, cloak, 'back', { bagCount: 44, bagBase: 40 }).ok, false, 'swapping to a cloak loses the room');
  assert.equal(R.canEquip(me, small, 'back', { bagCount: 44, bagBase: 40 }).ok, true, 'a 4-slot pack still holds 44');
  assert.equal(R.canUnequip(me, 'back', { bagCount: 30, bagBase: 40 }).ok, true);
  assert.equal(R.unequip(me, 'back').ok, true, 'without the numbers the rules do not judge the bag');
  // saved and restored with its room
  R.equip(me, pack);
  const saved = R.saveGear(me);
  const again = world().add('ranger', 12, { equipment: saved });
  assert.equal(again.r.unit.equipment.back.bagSlots, 6);
});

// ============================================================================ W22

test('W22: no light item can drop, be made, come out of a crate, be in a kit or be worn — and the light everyone carries is one rules constant', () => {
  assert.ok(LIGHT.radius >= 18 && LIGHT.dungeonRadius >= LIGHT.radius && LIGHT.dungeonAmbient > 0 && LIGHT.dungeonAmbient < 1);
  const items = engine.items;
  for (const t of ['armorBases', 'weaponBases']) for (const [k, b] of Object.entries(items[t])) assert.ok(b.slot !== 'light' && b.type !== 'light', `${k} is a light base`);
  assert.equal(items.uniques.filter(u => u.type === 'light' || u.slot === 'light').length, 0, 'no light unique');
  const affixes = Object.values(items.affixes).filter(Array.isArray).flat();
  assert.equal(affixes.filter(a => /^cond_light(?!ning)/.test(a.stat || '') || (a.onlySlots || []).includes('light')).length, 0, 'no affix rolls on, or for, a light');
  assert.ok(engine.gearReport.lights.uniques.length >= 1, 'the engine reports what it took out');
  for (const base of ['hand_lantern', 'pitch_torch', 'g5_cresset', 'g5_hexlantern']) assert.equal(engine.makeItem({ base, level: 5 }), null, `${base} cannot be made`);
  assert.ok(!engine.lootPool.families.light, 'no light loot family');
  const rng = makeRng(404);
  let drops = 0;
  for (const L of [1, 4, 8, 15, 25, 40]) for (let i = 0; i < 6000; i++) {
    const it = engine.rpg.rollDrop({ level: L, rng, chance: 1, magicFind: i % 4 ? 0 : 400 });
    if (!it) continue;
    drops++;
    assert.ok(!isLightItem(it) && it.slot !== 'light', `${it.name} dropped`);
    assert.ok(!(it.affixes || []).some(a => /^cond_light(?!ning)/.test(a.stat || '')), `${it.name} carries a light property`);
  }
  assert.ok(drops > 20000);
  // Farhold's tool / mount uniques fit no slot here: out of the pool too
  assert.ok(engine.gearReport.slotless.length >= 2, `${engine.gearReport.slotless}`);
  assert.equal(items.uniques.filter(u => ['tool', 'mount'].includes(u.type) || ['tool', 'mount'].includes(u.slot)).length, 0);
  for (let i = 0; i < 30000; i++) { const it = engine.rpg.rollDrop({ level: 1 + i % 40, rng, chance: 1, magicFind: 600 }); assert.ok(!it || !['tool', 'mount'].includes(it.slot), `${it?.name} dropped (slot ${it?.slot})`); }
  // crates: an old "Lamp Box" opens as jewellery; nothing a crate holds is a light
  const w = world();
  const me = w.add('mage', 8);
  const R = w.room.rules;
  for (const slot of ['light', 'lantern', 'torch', 'jewellery', 'any', 'back']) for (let k = 0; k < 8; k++) {
    const got = R.openCrate(me, R.makeCrate(me, { slot, min: 'uncommon' })) || [];
    assert.ok(got.length >= 1, `${slot} crate holds something`);
    for (const it of got) assert.ok(!isLightItem(it), `${slot} crate gave ${it.name}`);
  }
  assert.notEqual(makeCrate({ slot: 'lantern' }).crate.slot, 'light');
  // kits
  for (const c of engine.classes) {
    const k = kitsFor(c.id);
    for (const it of [...k.armour, ...k.weapons].flatMap(x => x.items)) assert.ok(!isLightItem(it), `${c.id} kit: ${it.name}`);
    for (const a of k.armour) for (const p of k.weapons) { const g = starterGear(c.id, { armour: a.id, weapons: p.id }); assert.ok(!g.light, `${c.id}: a kit fills the light slot`); }
  }
  // worn / used
  assert.ok(!R.SLOTS.includes('light'), 'the paper doll has no light slot');
  const lamp = { name: 'Hand Lantern', type: 'armor', slot: 'light', baseKey: 'hand_lantern', rarity: 'normal', dropLevel: 8, affixes: [{ stat: 'cond_lightRange', value: 16 }] };
  assert.equal(R.canEquip(me, lamp).ok, false); assert.equal(R.equip(me, lamp).why, 'gone');
  assert.equal(R.useItem(me, { type: 'light', minutes: 10 }, { name: 'Bundle of torches' }).why, 'gone');
  assert.equal(R.itemBuffs(me).lightRange, LIGHT.radius); assert.equal(R.LIGHT.radius, LIGHT.radius);
});

test('W22: sold nowhere — no shop shelf, goods row or road table in the content names a light (stream E\'s data, read through the rules\' own test)', () => {
  const shops = JSON.parse(readFileSync(new URL('../../data/provinces/shops.json', import.meta.url), 'utf8'));
  const bad = [];
  for (const [id, g] of Object.entries(shops.goodsCatalog || {})) if (isLightItem({ kind: 'good', id, use: g.use })) bad.push(`goods: ${id}`);
  const walk = (o, path) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!o || typeof o !== 'object') { if (typeof o === 'string' && engine.tvGear.lights.legacy.includes(o)) bad.push(`${path}: ${o}`); return; }
    if (path !== 'goodsCatalog' && typeof o.id === 'string' && (o.source === 'good' || o.source === 'gear') && engine.tvGear.lights.goods.includes(o.id)) bad.push(`${path}: ${o.id}`);
    for (const [k, v] of Object.entries(o)) { if (k === 'light' && v && typeof v === 'object') bad.push(`${path}.light (a shelf of lights)`); else walk(v, path ? `${path}.${k}` : k); }
  };
  walk(shops, '');
  assert.deepEqual(bad, []);
});

test('W22: what a player owned is paid back at its LIST price — a worn lantern once, on the first login after; bag items through isLightItem / lightRefund', () => {
  const lamp = { name: 'Hand Lantern', type: 'armor', slot: 'light', baseKey: 'hand_lantern', rarity: 'magic', dropLevel: 8, affixes: [{ stat: 'cond_lightRange', value: 16 }] };
  const torch = { kind: 'good', id: 'torch_bundle', name: 'Bundle of torches', use: { type: 'light', minutes: 10 }, price: 15, count: 3 };
  assert.equal(isLightItem(lamp), true); assert.equal(isLightItem(torch), true);
  assert.equal(isLightItem({ kind: 'good', id: 'whetstone', use: { type: 'buff' } }), false);
  assert.equal(isLightItem(engine.makeItem({ base: 'travel_cloak', level: 3 })), false);
  assert.equal(isLightItem({ name: 'Lightbearer\'s Cassock', type: 'armor', slot: 'chest', baseKey: 'cloth_chest', affixes: [{ stat: 'cond_lightningVsSlowed', value: 0.2 }] }), false, 'lightning is not a light');
  assert.equal(lightRefund(torch), 45, 'a stack pays per torch bundle');
  const owed = lightRefund(lamp);
  assert.ok(owed >= 100, `a level-8 magic lantern is paid back properly (${owed})`);
  assert.equal(lightRefund({ name: 'x', type: 'armor', slot: 'chest' }), 0);
  // worn in an old save
  const w = world();
  const me = w.add('ranger', 8, { equipment: { light: lamp, back: engine.makeItem({ base: 'travel_cloak', level: 8 }) } });
  assert.ok(!me.r.unit.equipment.light, 'the lantern is not put back on');
  assert.ok(me.r.unit.equipment.back, 'everything else is');
  const paid = w.awards.filter(a => a.reason === 'lightRefund');
  assert.equal(paid.length, 1); assert.equal(paid[0].gold, owed);
  const note = w.events.find(e => e.type === 'fx' && e.kind === 'notice' && e.why === 'lightRefund');
  assert.ok(note && note.gold === owed && /removed from the game/.test(note.text));
  assert.ok(!w.room.rules.saveGear(me).light, 'and it is not in the next save, so it is never paid twice');
  assert.equal(w.room.rules.lightRefundOwed(me), 0);
});

// ============================================================================ W23

test('W23: no two starter packs of a class are near-duplicates — they differ on at least two of hands / attack / reach / element / tempo, and at most two share a hand shape', () => {
  const bad = [];
  for (const c of engine.classes) {
    const ws = kitsFor(c.id).weapons;
    if (ws.length < 4 || ws.length > 6) bad.push(`${c.id}: ${ws.length} packs`);
    const byHands = {};
    for (const w of ws) {
      for (const k of KIT_AXES) if (!w.sig?.[k]) bad.push(`${c.id}/${w.id}: no ${k}`);
      if (!w.role || !w.diff || w.diff.length < 20) bad.push(`${c.id}/${w.id}: the kit screen has nothing to say about it`);
      (byHands[w.sig.hands] ||= []).push(w.id);
    }
    for (const [h, ids] of Object.entries(byHands)) if (ids.length > KIT_MAX_PER_HANDS) bad.push(`${c.id}: ${ids.length} "${h}" packs (${ids.join(', ')})`);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const d = kitDistance(ws[i].sig, ws[j].sig);
      if (d < KIT_MIN_DIFF) bad.push(`${c.id}: ${ws[i].id} and ${ws[j].id} differ on ${d} axis`);
    }
    if (new Set(ws.map(w => w.role)).size !== ws.length) bad.push(`${c.id}: two packs read the same on the kit screen`);
    if (new Set(ws.map(w => w.sig.hands)).size < 3) bad.push(`${c.id}: fewer than three hand shapes on offer`);
  }
  assert.deepEqual(bad, []);
});

test('W23: the measure is read off the real items — it tells a hatchet pair from twin swords, and calls sword-and-shield twice the same thing', () => {
  const sigs = Object.fromEntries(kitsFor('warrior').weapons.map(w => [w.id, w.sig]));
  assert.deepEqual(sigs.sword_shield, { hands: 'shield', family: 'slash', reach: 'mid', element: 'physical', tempo: 'steady' });
  assert.equal(sigs.greatsword.hands, 'two'); assert.equal(sigs.greatsword.family, 'sweep');
  assert.ok(kitDistance(sigs.twin_swords, sigs.twin_axes) >= 2, 'cuts vs chops, arm\'s length vs close');
  assert.equal(kitDistance(sigs.sword_shield, { ...sigs.sword_shield }), 0);
  const mage = Object.fromEntries(kitsFor('mage').weapons.map(w => [w.id, w.sig]));
  assert.equal(mage.staff_cone.hands, 'staff'); assert.equal(mage.staff_cone.reach, 'near'); assert.equal(mage.wand_bolt.reach, 'far'); assert.equal(mage.wand_bolt.element, 'ice');
  // the two new starter bases swing as their families do
  assert.equal(sigs.twin_axes.family, 'cleave');
  const sabre = kitsFor('swashbuckler').weapons.find(w => w.id === 'sabre_dagger');
  assert.equal(sabre.sig.tempo, 'quick'); assert.equal(sabre.items[0].baseKey, 'militia_sabre');
});

test('W23: the three armour sets of a class differ in STATS — each has its own lean, on the sheet, and every pack and set can be worn by its class', () => {
  const bad = [];
  for (const c of engine.classes) {
    const k = kitsFor(c.id);
    const leans = k.armour.map(a => a.lean);
    if (new Set(leans).size !== 3 || leans.some(l => !l)) bad.push(`${c.id}: leans ${leans}`);
    const first = k.weapons[0].id;
    const sheets = k.armour.map(a => {
      const ch = createCharacter(engine, { id: 1, classId: c.id, level: 1, name: 'x', gear: { equipment: starterGear(c.id, { armour: a.id, weapons: first }) } });
      const d = ch.derived;
      return { id: a.id, lean: a.lean, props: a.props, armor: d.armor, hp: ch.maxHp, mp: ch.maxMp, dodge: d.dodge, crit: d.critChance, sp: d.spellPower, mres: d.magicResist };
    });
    const key = s => [s.hp, s.mp, s.dodge, s.crit, s.sp, s.mres].join('|');
    if (new Set(sheets.map(key)).size !== 3) bad.push(`${c.id}: two sets give the same sheet apart from armour (${sheets.map(key).join('  ')})`);
    for (const a of k.armour) { if (!a.role || !a.diff) bad.push(`${c.id}/${a.id}: no role / diff`); if (!a.items.some(i => i.slot === 'chest' && i.lean === a.lean && i.affixes.some(x => x.starterLean))) bad.push(`${c.id}/${a.id}: the lean is not on the chest piece`); }
    for (const p of k.weapons) {
      const ch = createCharacter(engine, { id: 1, classId: c.id, level: 1, name: 'x' });
      ch.equipment.weapon = null; ch.equipment.offhand = null;
      const why = engine.rpg.equipRefusal(ch, p.items[0], { into: 'weapon' });
      if (why) bad.push(`${c.id}/${p.id}: ${why}`);
    }
  }
  assert.deepEqual(bad, []);
});
