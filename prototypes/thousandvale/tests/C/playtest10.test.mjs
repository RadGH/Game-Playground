// node --test prototypes/thousandvale/tests/C/playtest10.test.mjs
//
// Owner feedback 10 (round-playtest10.md) — stream C: Y9 one number a swing, Y16 hands, Y10 walls, Y7 attacks while
// moving, Y26 attack speed, Y12 knock interrupts, Y25 zones that follow, Y20 Storm Beam, Y14 the Unbinder,
// Y17 training dummies, Y21 wilderness fighters. Each test states the rule, never a tuning number's exact value
// unless the number IS the rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { dungeonTerrain } from '../../js/sim/dungeon.js';
import { planDungeon as planTiers } from '../../js/rules/dungeon-tiers.js';
import { createRules, rulesEngine, kitsFor, starterGear, validKit, handOf, handText, fitsHand, refreshItem } from '../../js/rules/index.js';
import { makeRng } from '../../js/rules/rng.js';
import { settleHands } from '../../js/rules/hands.js';
import { clearSight } from '../../js/rules/sight.js';

const engine = rulesEngine();
const open = standInTerrain(2, 2048);
let n = 0;
export function world({ terrain = open, kind = 'wilds', at = null, hooks = {} } = {}) {
  const events = [], awards = [];
  const id = `y10-${++n}`;
  const room = createRoom({ id, terrain, seed: 5, camps: [], createRules, kind, hooks: { log: () => {}, award: (e, a) => awards.push({ id: e.id, ...a }), ...hooks } });
  const w = { room, events, awards, tick: 0, R: room.rules, sx: (at || terrain.spawn).x, sz: (at || terrain.spawn).z };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 40;
  w.add = (cls, level, dx = 0, dz = 0, extra = {}) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: w.sx + dx, z: w.sz + dz, ...extra }, null);
  w.mob = (type, dx, dz, level = 3, data = {}) => room.spawn({ kind: 'monster', type, level, x: w.sx + dx, z: w.sz + dz, data: { noRank: true, ...data } });
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  w.hits = (dst, src = null) => events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.d === dst.id && (src == null || e.s === src.id));
  return w;
}
const tough = m => { const u = m.r.unit; u.maxHp = u.hp = 1e7; return m; };
const tame = m => { const u = tough(m).r.unit; u.dmg = [0, 0]; u.speed = 0; u.aggroRange = 0; return m; };
const item = (base, level = 8, rarity = 'magic', seed = 5) => engine.makeItem({ base, rarity, level, rng: makeRng(seed) });

// ------------------------------------------------------------------------------------------------ Y9

test('Y9 (report #43): one melee swing puts ONE damage number on its target, whatever is in the off hand', () => {
  const offs = { shield: 'shield', focus: 'grimoire', orb: 'orb', nothing: null, weapon: 'dagger' };
  for (const [label, off] of Object.entries(offs)) {
    const w = world();
    const me = w.add('paladin', 4);
    const u = me.r.unit;
    assert.equal(w.R.equip(me, item('longsword', 4), 'weapon').ok, true, 'sword on');
    if (off) { const r = w.R.equip(me, item(off, 4), 'offhand'); assert.equal(r.ok, true, `${label} goes in the off hand: ${r.text || ''}`); } else w.R.unequip(me, 'offhand');
    const m = tame(w.mob('road_brigand', 0, 2, 2));
    for (let i = 0; i < 80; i++) { if (i % 2 === 0) w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
    const swings = w.events.filter(e => e.type === 'cast' && e.skill === 'basic' && e.s === me.id);
    const main = swings.filter(e => e.hand !== 'off').length, offN = swings.filter(e => e.hand === 'off').length;
    const hits = w.hits(m, me);
    assert.ok(main >= 3, `${label}: it swung (${main})`);
    // never two numbers on one tick from one hand, and no `splash` number on a target the arc already hit
    assert.equal(hits.filter(h => h.skill === 'splash').length, 0, `${label}: no second "splash" number on the swing's own target`);
    if (label === 'weapon') assert.ok(offN >= 2 && hits.length <= main + offN, `a second WEAPON swings on its own clock (${offN}) — one number each (${hits.length} for ${main}+${offN})`);
    else { assert.equal(offN, 0, `${label}: the off hand never swings`); assert.ok(hits.length <= main, `${label}: ${hits.length} numbers for ${main} swings`); }
    void u;
  }
});

test('Y9: folding the splash into the one hit keeps melee damage — an enemy only the splash reaches is still struck, once', () => {
  // the same swings with the fold off (Farhold's two hits) and on: the totals agree within the noise of the rolls
  const total = fold => {
    const was = engine.combatCfg.melee.foldSplash;
    engine.combatCfg.melee.foldSplash = fold;
    try {
      const w = world();
      const me = w.add('warrior', 6);
      w.R.equip(me, item('longsword', 6), 'weapon');
      const m = tame(w.mob('road_brigand', 0, 2, 6));
      const u = m.r.unit, hx = u.x, hz = u.z;
      for (let i = 0; i < 1200; i++) { if (i % 2 === 0) w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); u.x = hx; u.z = hz; u.push = null; }      // (pinned: a knock would walk it out of reach)
      const hits = w.hits(m, me);
      return { sum: hits.reduce((a, h) => a + h.n, 0), splash: hits.filter(h => h.skill === 'splash').length, n: hits.length };
    } finally { engine.combatCfg.melee.foldSplash = was; }
  };
  const two = total(false), one = total(true);
  assert.ok(two.splash > 10, 'with the fold off the splash re-hits the target (the bug)');
  assert.equal(one.splash, 0);
  assert.ok(one.n < two.n * 0.7, `fewer numbers (${one.n} against ${two.n})`);
  assert.ok(Math.abs(one.sum / two.sum - 1) < 0.15, `the same damage: ${one.sum} folded against ${two.sum} as two hits`);
});

// ------------------------------------------------------------------------------------------------ Y16

test('Y16 (reports #31 #32): every hand-held base says Main hand, Off hand, One-hand or Two-hand — and fits only there', () => {
  const want = { tome: 'main', orb: 'off', wand: 'one', scepter: 'one', staff: 'two', sword: 'one', dagger: 'one', bow: 'two', shield: 'off', grimoire: 'off', reliquary: 'off', quiver: 'off', warded_focus: 'off' };
  for (const [base, hand] of Object.entries(want)) {
    const it = item(base);
    assert.ok(it, base);
    assert.equal(handOf(it), hand, `${base} is ${hand}`);
    assert.equal(it.hand, hand, `${base}: stamped on the item`);
    assert.equal(it.handText, handText(it));
    assert.equal(fitsHand(it, 'weapon'), hand === 'main' || hand === 'one' || hand === 'two', `${base} in the weapon slot`);
    assert.equal(fitsHand(it, 'offhand'), hand === 'off' || hand === 'one', `${base} in the off hand`);
  }
  // every hand-held base in the whole table has a hand, and every weapon base one of the four words
  for (const [k, b] of Object.entries(engine.items.weaponBases)) { const it = item(k, 30, 'normal'); if (it) assert.ok(['main', 'off', 'one', 'two'].includes(it.hand), `${k}: ${it.hand}`); void b; }
});

test('Y16: the equip rule — a tome will not go in the off hand, an orb will not be your weapon, two orbs cannot be worn', () => {
  const w = world();
  const me = w.add('stormcaller', 9);
  const tome = item('tome', 9, 'normal', 3), orb1 = item('orb', 9, 'normal', 4), orb2 = item('orb', 9, 'normal', 6), wand = item('wand', 9, 'normal', 7);
  let r = w.R.canEquip(me, tome, 'offhand');
  assert.equal(r.ok, false); assert.equal(r.why, 'hand'); assert.match(r.text, /main-hand weapon/);
  assert.equal(w.R.equip(me, tome, 'offhand').ok, false);
  r = w.R.equip(me, orb1, 'weapon');
  assert.equal(r.ok, false); assert.equal(r.why, 'hand'); assert.match(r.text, /off-hand implement/);
  assert.equal(w.R.equip(me, tome, 'weapon').ok, true);
  assert.equal(w.R.equip(me, orb1).ok, true, 'an orb with no slot named goes to the off hand');
  assert.equal(me.r.unit.equipment.offhand, orb1); assert.equal(me.r.unit.equipment.weapon, tome);
  const sw = w.R.equip(me, orb2);
  assert.equal(sw.ok, true); assert.deepEqual(sw.removed, [orb1], 'a second orb replaces the first — never two');
  assert.equal(me.r.unit.equipment.weapon, tome, 'and never lands in the weapon slot');
  // One-hand: a wand in each hand is fine
  assert.equal(w.R.equip(me, wand, 'weapon').ok, true);
  assert.equal(w.R.equip(me, item('wand', 9, 'normal', 8), 'offhand').ok, true);
  assert.equal(handOf(me.r.unit.equipment.offhand), 'one');
});

test('Y16: a tome ATTACKS like a caster weapon (ranged, its own slower heavier form); an orb never attacks and only its card carries the rider', () => {
  const tome = item('tome', 9, 'normal', 3), orb = item('orb', 9, 'normal', 4), wand = item('wand', 9, 'normal', 7);
  assert.equal(tome.ranged, true); assert.ok(engine.casterForms.styles[tome.castStyle]?.tome, `a tome form: ${tome.castStyle}`);
  assert.match(tome.attackText, /^Basic attack \(/); assert.equal(tome.focusText, undefined, 'no "Held with a wand…" on a main-hand tome');
  assert.equal(orb.noAttack, true); assert.equal(orb.attackText, undefined); assert.match(orb.focusText, /^Held with a wand, tome or sceptre/);
  assert.equal(orb.aps, undefined, 'no attack speed on something that does not attack');
  assert.ok(tome.aps > 0 && wand.aps > 0 && tome.aps < wand.aps, `a tome is slower than a wand (${tome.aps} against ${wand.aps})`);
  assert.ok(tome.dmg[1] >= wand.dmg[1] * 0.9, `and hits like one (${tome.dmg} against ${wand.dmg})`);
  // in a fight: the tome's basic attack is its form, at range, and the orb's rider fires on it; the off hand never swings
  const w = world();
  const me = w.add('stormcaller', 9);
  w.R.equip(me, tome, 'weapon'); w.R.equip(me, orb, 'offhand');
  const st = engine.casterForms.styles[tome.castStyle];
  const far = Math.min(st.range ?? 10, 9);
  const m = tame(w.mob('road_brigand', 0, far - 1, 5));
  const card = w.R.basic(me);
  assert.equal(card.kind, 'bolt'); assert.equal(card.form, tome.castStyle); assert.equal(card.rider, 'burst');
  for (let i = 0; i < 120; i++) { if (i % 2 === 0) w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
  const swings = w.events.filter(e => e.type === 'cast' && e.skill === 'basic');
  assert.ok(swings.length >= 3 && swings.every(e => e.wk === 'bolt' && e.wt === 'tome' && e.hand !== 'off'), 'every attack is the tome\'s own cast');
  assert.ok(w.hits(m, me).length >= 3, 'and it lands from range');
  assert.ok(w.events.some(e => e.type === 'fx' && e.kind === 'rider' && e.rider === 'burst'), 'the orb modifies the basic attack');
  // the real cadence is the card's
  const gaps = swings.slice(1).map((e, i) => e.tick - swings[i].tick);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length * 0.05;
  assert.ok(Math.abs(mean - 1 / card.aps) < 0.12, `attacks every ${mean.toFixed(2)} s, the card says ${(1 / card.aps).toFixed(2)} s`);
});

test('Y16: a saved character with items in a now-illegal hand keeps every one of them — moved, told once, never deleted', () => {
  const tomeMain = item('tome', 9, 'normal', 3), tomeOff = item('tome', 9, 'normal', 11), orbMain = item('orb', 9, 'normal', 4);
  // (a) a tome in each hand: the off-hand one goes to the bag
  let w = world();
  let me = w.add('stormcaller', 9, 0, 0, { equipment: { weapon: tomeMain, offhand: tomeOff } });
  assert.equal(me.r.unit.equipment.weapon.id, tomeMain.id); assert.equal(me.r.unit.equipment.offhand ?? null, null);
  let got = w.awards.filter(a => a.reason === 'handsMoved');
  assert.equal(got.length, 1); assert.equal(got[0].items.length, 1); assert.equal(got[0].items[0].id, tomeOff.id);
  let note = w.events.filter(e => e.type === 'fx' && e.kind === 'notice' && e.why === 'handsMoved');
  assert.equal(note.length, 1); assert.match(note[0].text, /moved to your bag/);
  // …and the next save no longer holds it there, so it is not handed over twice
  const saved = w.R.saveGear(me);
  w = world(); me = w.add('stormcaller', 9, 0, 0, { equipment: saved });
  assert.equal(w.awards.filter(a => a.reason === 'handsMoved').length, 0);
  // (b) an orb worn as the weapon with an empty off hand: it moves across, nothing leaves
  w = world(); me = w.add('stormcaller', 9, 0, 0, { equipment: { weapon: orbMain } });
  assert.equal(me.r.unit.equipment.offhand?.id, orbMain.id); assert.equal(me.r.unit.equipment.weapon ?? null, null);
  assert.equal(w.awards.filter(a => a.reason === 'handsMoved').length, 0);
  note = w.events.filter(e => e.why === 'handsMoved');
  assert.equal(note.length, 1); assert.match(note[0].text, /moved to your off hand/);
  // (c) two orbs: one stays in the off hand, the other goes to the bag
  w = world(); me = w.add('stormcaller', 9, 0, 0, { equipment: { weapon: orbMain, offhand: item('orb', 9, 'normal', 12) } });
  got = w.awards.filter(a => a.reason === 'handsMoved');
  assert.equal(got.length, 1); assert.equal(got[0].items[0].id, orbMain.id);
  // the pure rule
  assert.deepEqual(settleHands(null, null).moved, []);
  // an item from an OLD bag (stale words on it) is brought up to date
  const stale = { ...JSON.parse(JSON.stringify(tomeMain)), ranged: false, tvTome: undefined, focusText: 'Held with a wand or sceptre: every fourth basic attack repeats itself', focusRider: 'echo', hand: undefined };
  delete stale.attackText; delete stale.castStyle;
  refreshItem(stale);
  assert.equal(stale.hand, 'main'); assert.equal(stale.focusText, undefined); assert.equal(stale.ranged, true); assert.match(stale.attackText, /^Basic attack/);
});

test('Y16: starter kits and the drop pool agree with the hands — no kit puts an item in a hand it may not use; tomes drop as weapons, orbs as off-hand items', () => {
  for (const cls of engine.classes.map(c => c.id)) {
    const k = kitsFor(cls);
    for (const pack of k.weapons) {
      const gear = starterGear(cls, validKit(cls, { weapons: pack.id }));
      if (gear.weapon) assert.ok(fitsHand(gear.weapon, 'weapon'), `${cls}/${pack.id}: ${gear.weapon.name} as the weapon`);
      if (gear.offhand) assert.ok(fitsHand(gear.offhand, 'offhand', { doubleGrip: false }) || gear.offhand.twoHanded, `${cls}/${pack.id}: ${gear.offhand.name} in the off hand`);
      assert.ok(gear.weapon, `${cls}/${pack.id}: something to attack with`);
      assert.ok(!gear.weapon.noAttack, `${cls}/${pack.id}: the weapon attacks`);
    }
  }
  const fams = engine.lootPool?.families || {};
  for (const f of Object.values(fams)) for (const b of f.bases) {
    const base = engine.items.weaponBases[b.key] || engine.items.armorBases[b.key];
    if (!base) continue;
    const sub = base.subtype || b.key;
    if (sub === 'orb') assert.notEqual(f.group, 'weapon', `orb base ${b.key} is in weapon family ${f.id}`);
    if (sub === 'tome') assert.equal(f.group, 'weapon', `tome base ${b.key} is in ${f.id} (${f.group})`);
  }
});

// ------------------------------------------------------------------------------------------------ Y10

/** A real planned dungeon (stream E's generator, the one Harrowgate Keep is built by), and a wall inside it with floor on both sides. */
function keep(seed = 77) {
  const plan = planTiers(seed, { floors: 2, level: 6 });
  const terrain = dungeonTerrain(plan);
  const f = plan.floors[0], cell = plan.cell || 2;
  const W = (i, j) => i >= 0 && j >= 0 && i < f.w && j < f.h && f.tiles[j * f.w + i] === 1;
  // two floor tiles in one row with 1-3 wall tiles between them, each with floor around it
  for (let j = 2; j < f.h - 2; j++) for (let i = 2; i < f.w - 8; i++) {
    for (let gap = 1; gap <= 3; gap++) {
      if (!W(i, j) || !W(i - 1, j) || !W(i + gap + 1, j) || !W(i + gap + 2, j)) continue;
      let solid = true;
      for (let g = 1; g <= gap; g++) for (let dj = -2; dj <= 2; dj++) if (W(i + g, j + dj)) solid = false;
      if (!solid) continue;
      const at = ii => ({ x: f.origin.x + (ii + 0.5) * cell, z: f.origin.z + (j + 0.5) * cell });
      return { plan, terrain, a: at(i), b: at(i + gap + 1), a2: at(i - 1), gap };
    }
  }
  throw new Error('no wall with floor on both sides in this plan');
}

test('Y10 (report #34): on a real dungeon plan a monster does not hit a player through a wall — melee, shot or red zone — and walks instead', () => {
  const K = keep();
  assert.ok(K.terrain.walkable(K.a.x, K.a.z) && K.terrain.walkable(K.b.x, K.b.z), 'floor on both sides');
  assert.equal(clearSight((x, z) => !K.terrain.walkable(x, z), K.a.x, K.a.z, K.b.x, K.b.z), false, 'and a wall between');
  const d = Math.hypot(K.b.x - K.a.x, K.b.z - K.a.z);
  // melee: within reach through the wall
  let w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
  let me = w.add('warrior', 6);
  me.r.unit.maxHp = me.r.unit.hp = 1e6;
  assert.equal(typeof w.R.field.sight, 'function', 'an instance has a sight test');
  assert.equal(w.R.sight(K.a.x, K.a.z, K.b.x, K.b.z), false);
  let m = tough(w.mob('road_brigand', K.b.x - K.a.x, K.b.z - K.a.z, 6));
  m.r.unit.reach = d + 1.5;                                   // long arms: the wall is the only thing in the way
  m.r.unit.state = 'chase'; m.r.unit.threat = new Map([[me.id, 50]]);
  let through = 0;
  for (let i = 0; i < 200; i++) {
    w.steps(1);
    for (const h of w.events.splice(0)) if (h.type === 'hit' && h.d === me.id && !w.R.sight(m.r.unit.x, m.r.unit.z, me.x, me.z)) through++;
  }
  assert.equal(through, 0, 'no hit landed with a wall between');
  // ranged: an archer on the far side never looses through it
  w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
  me = w.add('warrior', 6); me.r.unit.maxHp = me.r.unit.hp = 1e6;
  m = tough(w.mob('brigand_archer', K.b.x - K.a.x, K.b.z - K.a.z, 6));
  assert.ok(m.r.unit.ranged, 'an archer');
  m.r.unit.state = 'chase'; m.r.unit.threat = new Map([[me.id, 50]]); m.r.unit.speed = 0;
  w.steps(160);
  assert.equal(w.events.filter(e => e.type === 'fx' && e.kind === 'shot').length, 0, 'it did not shoot');
  assert.equal(w.events.filter(e => e.type === 'hit' && e.d === me.id).length, 0);
  // …and with a clear line (same room, no wall) it does: the test is the wall, not the monster
  w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
  me = w.add('warrior', 6); me.r.unit.maxHp = me.r.unit.hp = 1e6;
  m = tough(w.mob('brigand_archer', K.a2.x - K.a.x, K.a2.z - K.a.z, 6));
  m.r.unit.state = 'chase'; m.r.unit.threat = new Map([[me.id, 50]]); m.r.unit.speed = 0;
  w.steps(160);
  assert.ok(w.events.some(e => e.type === 'hit' && e.d === me.id), 'a clear line: it hits');
});

test('Y10: a red zone does not reach through the wall, and neither do the player\'s own swing, bolt, burst or beam', () => {
  const K = keep();
  const dx = K.b.x - K.a.x, dz = K.b.z - K.a.z, d = Math.hypot(dx, dz);
  // the telegraph: a circle centred on the monster, big enough to cover the player on the other side
  let w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
  let me = w.add('warrior', 6);
  let m = tough(w.mob('road_brigand', dx, dz, 6));
  const enc = w.R.encounters;
  const st = enc.stateOf(m.r.unit);
  const ab = { id: 'test_ring', telegraphs: [{ shape: 'circle', at: 'self', r: d + 3, wind: 0.2, damage: 1 }] };
  w.room.rules.room.run(() => enc.fireForTest(st, ab, me.r.unit));
  w.steps(80);
  const res = w.events.filter(e => e.type === 'teleR');
  assert.ok(res.length >= 1, 'it resolved');
  assert.ok(res.every(e => !(e.hits || []).includes(me.id)), 'and did not hit through the wall');
  // the player's side, per attack shape
  const tries = [
    ['warrior', 'longsword', 0],          // a swing (the monster given a huge body so reach is not the question)
    ['mage', 'wand', 0], ['ranger', 'bow', 0],
  ];
  for (const [cls, base] of tries) {
    w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
    me = w.add(cls, 6);
    w.R.equip(me, item(base, 6, 'normal'), 'weapon');
    m = tame(w.mob('road_brigand', dx, dz, 6));
    m.r.unit.reach = 12;
    me.face?.(Math.atan2(dx, dz));
    for (let i = 0; i < 80; i++) { if (i % 3 === 0) w.R.intent(me, { t: 'cast', slot: 0, aim: { x: K.b.x, z: K.b.z } }); w.steps(1); }
    assert.equal(w.hits(m).length, 0, `${cls} ${base}: nothing lands through the wall`);
    // named as the target, a ranged attack is refused outright with the reason
    if (base !== 'longsword') {
      const r = w.R.intent(me, { t: 'cast', slot: 0, target: m.id });
      if (!r.ok) assert.equal(r.why === 'sight' || r.why === 'cooldown', true, `${cls}: ${r.why} ${r.text}`);
      w.steps(30);
      const r2 = w.R.intent(me, { t: 'cast', slot: 0, target: m.id });
      assert.equal(r2.ok, false); assert.equal(r2.why, 'sight'); assert.match(r2.text, /cannot see/);
    }
  }
  // skills: every damaging skill of three casters, target named behind the wall -> refused for free or lands on nobody
  for (const cls of ['mage', 'stormcaller', 'pyromancer', 'warrior']) {
    w = world({ terrain: K.terrain, kind: 'instance', at: K.a });
    me = w.add(cls, 30);
    m = tame(w.mob('road_brigand', dx, dz, 30));
    const u = me.r.unit;
    u.yaw = Math.atan2(dx, dz);
    for (let s = 1; s <= 6; s++) { u.mp = u.maxMp; w.R.intent(me, { t: 'cast', slot: s, target: m.id, aim: { x: K.b.x, z: K.b.z } }); w.steps(70); }
    const through = w.hits(m).filter(h => h.s === me.id);
    assert.equal(through.length, 0, `${cls}: ${through.map(h => h.ab || h.skill).join(',')} landed through the wall`);
  }
});

test('Y10: outside an instance nothing is asked (no sight test in the open world), and the test is cached', () => {
  const w = world();
  assert.equal(w.R.field.sight, null);
  assert.equal(w.R.sight(0, 0, 500, 500), true);
  const K = keep();
  const d = world({ terrain: K.terrain, kind: 'instance', at: K.a });
  const s = d.R.field.sight;
  for (let i = 0; i < 50; i++) s(K.a.x, K.a.z, K.b.x, K.b.z);
  assert.ok(s.stats.cached >= 49, `${s.stats.cached} of ${s.stats.asked} answered from the cache`);
  // a gate that opens is seen within the cache's life: the answer is not kept for ever
  assert.ok(engine.combatCfg.sight.ttl > 0 && engine.combatCfg.sight.ttl <= 3);
});
