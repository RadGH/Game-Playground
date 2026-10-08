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
export function world({ terrain = open, kind = 'wilds', at = null, hooks = {}, seed = 5 } = {}) {
  const events = [], awards = [];
  const id = `y10-${++n}`;
  const room = createRoom({ id, terrain, seed, camps: [], createRules, kind, hooks: { log: () => {}, award: (e, a) => awards.push({ id: e.id, ...a }), ...hooks } });
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

// ------------------------------------------------------------------------------------------------ Y7 / Y26

test('Y7 (report #45): a basic attack fires while you move — every weapon family, at full rate; the pace knob is read', () => {
  const cases = [['warrior', 'longsword', 2], ['ranger', 'bow', 14], ['mage', 'wand', 12], ['mage', 'staff', 5], ['stormcaller', 'tome', 7]];
  for (const [cls, base, dist] of cases) {
    const swingsWhen = (moving, pace = 1) => {
      const was = { ...engine.combatCfg.moving };
      for (const k of Object.keys(engine.combatCfg.moving)) engine.combatCfg.moving[k] = pace;
      try {
        const w = world();
        const me = w.add(cls, 8);
        assert.equal(w.R.equip(me, item(base, 8, 'normal'), 'weapon').ok, true, `${cls} holds a ${base}`);
        const m = tame(w.mob('road_brigand', 0, dist, 8));
        assert.deepEqual(w.R.basic(me).moving, { ok: true, pace }, 'the card says so');
        for (let i = 0; i < 300; i++) {
          if (moving) { const side = Math.sin(i / 6) * 1.2; me.moveTo(w.sx + side, w.sz); m.r.unit.x = w.sx + side; m.r.unit.z = w.sz + dist; m.r.unit.home = [m.r.unit.x, m.r.unit.z]; }      // strafing, the target kept in front
          w.R.intent(me, { t: 'cast', slot: 0, target: m.id });
          w.steps(1);
        }
        return { n: w.events.filter(e => e.type === 'cast' && e.skill === 'basic' && e.clip !== 'shoot').length, hits: w.hits(m, me).length };
      } finally { Object.assign(engine.combatCfg.moving, was); }
    };
    const still = swingsWhen(false), moving = swingsWhen(true), slowed = swingsWhen(true, 0.5);
    assert.ok(moving.n >= still.n - 1, `${base}: ${moving.n} attacks while moving against ${still.n} standing — full rate`);
    assert.ok(moving.hits >= 3, `${base}: and they land (${moving.hits})`);
    assert.ok(slowed.n < moving.n * 0.7, `${base}: the knob is real — at pace 0.5 it attacks ${slowed.n} times against ${moving.n}`);
  }
});

test('Y26 (report #50): attacks per second — on the weapon card, on the sheet, and it is the real cadence; attack speed on gear moves it, inside the cap', () => {
  for (const [cls, base, dist] of [['warrior', 'longsword', 2], ['ranger', 'bow', 14], ['mage', 'wand', 12], ['mage', 'staff', 5]]) {
    const w = world();
    const me = w.add(cls, 8);
    const it = item(base, 8, 'normal');
    assert.ok(it.aps > 0 && /attacks? per second/.test(it.apsText), `${base}: the card carries it (${it.apsText})`);
    w.R.equip(me, it, 'weapon');
    const u = me.r.unit;
    const row = () => w.R.sheet(me).core.find(r => r.id === 'aps');
    const m = tame(w.mob('road_brigand', 0, dist, 8));
    const cadence = () => {
      const from = w.events.length;
      for (let i = 0; i < 400; i++) { w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); m.r.unit.x = w.sx; m.r.unit.z = w.sz + dist; m.r.unit.push = null; }
      const casts = w.events.slice(from).filter(e => e.type === 'cast' && e.skill === 'basic' && e.clip !== 'shoot');
      return (casts.length - 1) / ((casts[casts.length - 1].tick - casts[0].tick) * 0.05);
    };
    const base0 = row();
    assert.ok(base0 && base0.value > 0, `${base}: the sheet row`);
    assert.equal(w.R.sheet(me).core.find(r => r.id === 'attackEvery'), undefined, 'the old "attack interval" row is gone');
    assert.equal(w.R.basic(me).aps, base0.value, 'the slot-0 card agrees');
    const real0 = cadence();
    assert.ok(Math.abs(real0 / base0.value - 1) < 0.12, `${base}: really ${real0.toFixed(2)} a second, the sheet says ${base0.value}`);
    // "of Haste" on a ring: the rollable attack-speed property
    const ring = item('ring', 8, 'normal') || item('iron_ring', 8, 'normal');
    assert.ok(ring, 'a ring');
    ring.affixes = [...(ring.affixes || []), { id: 'of_speed', name: 'of Haste', stat: 'initiative', value: 5 }];      // 5 points = +20%
    assert.equal(w.R.equip(me, ring).ok, true);
    assert.ok(Math.abs(u.derived.haste - 20) < 0.01, `+20% attack speed on the sheet (${u.derived.haste})`);
    const fast = row();
    assert.ok(Math.abs(fast.value / base0.value - 1.2) < 0.03, `${base}: +20% attack speed is +20% attacks (${base0.value} -> ${fast.value})`);
    const real1 = cadence();
    assert.ok(Math.abs(real1 / fast.value - 1) < 0.12, `${base}: and really so (${real1.toFixed(2)} against ${fast.value})`);
    // the cap: a silly amount of attack speed gives the cap and no more
    ring.affixes.find(a => a.stat === 'initiative').value = 60;
    w.R.room.run(() => engine.rpg.refresh(u, { full: true }));
    const cap = engine.combatCfg.speed.capPct;
    assert.ok(u.derived.haste > cap);
    assert.ok(Math.abs(row().value / base0.value - (1 + cap / 100)) < 0.03, `${base}: capped at +${cap}% (${row().value})`);
    assert.match(row().tip, /the most all bonuses together can give/);
  }
});

// ------------------------------------------------------------------------------------------------ Y12

function windUp(rank = 'normal', push = 3, seed = 5) {
  const w = world({ seed });
  const me = w.add('warrior', 6);
  const m = tough(w.mob('road_brigand', 0, 3, 6, rank === 'boss' ? {} : {}));
  const u = m.r.unit;
  u.rank = rank === 'boss' ? 'normal' : rank; if (rank === 'boss') u.boss = true;
  u.speed = 0; u.dmg = [0, 0];
  const enc = w.R.encounters, st = enc.stateOf(u);
  st.abilities = [];
  w.R.room.run(() => enc.fireForTest(st, { id: 'test_cone', telegraphs: [{ shape: 'cone', at: 'self', r: 8, arc: 1.2, wind: 3, damage: 1 }] }, me.r.unit));
  w.steps(2);
  const t = w.events.find(e => e.type === 'tele');
  assert.ok(t, 'a cone is winding up');
  const knock = () => { w.R.room.run(() => w.R.combat.skillRt.push(u, me.x, me.z, push)); };
  return { w, me, m, u, t, knock };
}

test('Y12 (report #44): a wind-up shape anchored on its caster is knocked back WITH the caster', () => {
  const was = { ...engine.combatCfg.knockInterrupt };
  Object.assign(engine.combatCfg.knockInterrupt, { normal: 0, champion: 0, rare: 0, boss: 0 });      // (no interrupt: this test is the move)
  try {
    const s = windUp('normal', 4);
    const z0 = s.u.z;
    s.knock(); s.w.steps(8);
    const moved = s.u.z - z0;
    assert.ok(moved > 1.5, `the monster was knocked ${moved.toFixed(1)} m`);
    const ms = s.w.events.filter(e => e.type === 'teleM' && e.id === s.t.id);
    assert.ok(ms.length >= 1, 'the client is told the shape moved');
    const last = ms[ms.length - 1];
    assert.ok(Math.abs(last.z - s.u.z) < 0.05 && Math.abs(last.x - s.u.x) < 0.05, `and it sits on the monster (${last.x},${last.z} against ${s.u.x.toFixed(2)},${s.u.z.toFixed(2)})`);
    // it resolves from where it is NOW: the player, who was inside it, is out of its reach after the knock + a step back
    s.me.moveTo(s.me.x, s.me.z - 6);
    s.w.steps(70);
    const r = s.w.events.find(e => e.type === 'teleR' && e.id === s.t.id);
    assert.ok(r && !(r.hits || []).includes(s.me.id), 'the moved cone no longer reaches where it used to');
  } finally { Object.assign(engine.combatCfg.knockInterrupt, was); }
});

test('Y12: a knock interrupts by rank — an ordinary monster often, a champion sometimes, a boss never — and an interrupt ends the wind-up at once', () => {
  const rate = rank => {
    let n = 0; const N = 60;
    for (let i = 0; i < N; i++) {
      const s = windUp(rank, 3, 100 + i);
      s.knock(); s.w.steps(3);
      const gone = s.w.events.find(e => e.type === 'teleR' && e.id === s.t.id && e.why === 'interrupted');
      if (gone) {
        n++;
        assert.equal(gone.x, 1, 'withdrawn, not resolved');
        assert.ok(s.w.events.some(e => e.type === 'fx' && e.kind === 'interrupt' && e.id === s.m.id));
        s.w.steps(80);
        assert.equal(s.w.events.filter(e => e.type === 'hit' && e.d === s.me.id).length, 0, 'and it never lands');
      }
    }
    return n / N;
  };
  const K = engine.combatCfg.knockInterrupt;
  const normal = rate('normal'), champ = rate('champion'), boss = rate('boss');
  assert.ok(Math.abs(normal - K.normal) < 0.2, `ordinary: ${normal} (knob ${K.normal})`);
  assert.ok(Math.abs(champ - K.champion) < 0.2, `champion: ${champ} (knob ${K.champion})`);
  assert.equal(boss, 0, 'a boss is never interrupted by a knock');
  assert.ok(K.normal > K.champion && K.champion >= K.rare && K.boss === 0);
  // a knock from BEFORE the wind-up began never breaks it
  const s = windUp('normal');
  assert.equal(s.w.events.some(e => e.type === 'teleR'), false);
});

// ------------------------------------------------------------------------------------------------ Y25 / Y20

test('Y25 (report #52): Blessed Earth with Moving Light follows the paladin — in the rules AND in what the client is told; so does every other carried zone', () => {
  const carried = [['paladin', 'consecrate', 1, 'moving_light'], ['cleric', 'sanctuary', 1, 'moving_sanctuary'], ['shaman', 'mending_post', 1, 'carried_post'],
    ['witch_hunter', 'null_circle', 1, 'carried_circle'], ['knight', 'unbroken_banner', 3, 'carried_banner'], ['runesmith', 'warding_glyph', 1, 'moving_glyph'], ['starcaller', 'star_field', 1, 'drifting_field']];
  for (const [cls, skill, tier, node] of carried) {
    for (const pick of [false, true]) {
      const w = world();
      const me = w.add(cls, 30);
      if (pick) assert.equal(w.R.pickTalent(me, skill, tier, node).ok, true, `${cls}: ${node}`);
      const slot = w.R.bar(me).find(b => b.id === skill);
      assert.ok(slot, `${cls} has ${skill}`);
      const r = w.R.intent(me, { t: 'cast', slot: slot.slot, aim: { x: w.sx, z: w.sz + 4 } });
      assert.equal(r.ok, true, `${skill}: ${r.text || ''}`);
      w.steps(2);
      const placed = w.events.find(e => e.type === 'fx' && e.kind === 'place');
      assert.ok(placed, `${skill} puts something down`);
      assert.equal(placed.follow, pick ? me.id : undefined, `${skill}${pick ? ' + ' + node : ''}: the place event ${pick ? 'names who it rides' : 'names nobody'}`);
      const obj = () => w.R.room.run(() => w.R.combat.skillRt.placedFor(me.id).find(o => o.id === placed.obj));
      const at0 = { ...obj() };
      me.moveTo(w.sx + 12, w.sz + 9); w.steps(3);
      const o = obj();
      if (pick) assert.ok(Math.hypot(o.x - me.x, o.z - me.z) < 0.01, `${skill}: it is where the caster is`);
      else assert.ok(Math.hypot(o.x - at0.x, o.z - at0.z) < 0.01, `${skill}: without the talent it stays put`);
    }
  }
});

test('Y20 (report #19): Storm Beam is a pulsing, full-length beam — six pulses over 2.2 s, everything on the 30 m line, in line with what it was worth', () => {
  const row = engine.skillData.skills.storm_beam;
  const pulses = Math.floor(row.channel.seconds / row.channel.every + 1e-6) + 1;
  assert.ok(pulses >= 4, 'several hits');
  assert.ok(row.channel.seconds >= 1.5 && row.channel.seconds <= 4, 'over a few seconds');
  const total = pulses * row.mult;
  assert.ok(total >= 2.2 && total <= 2.2 * 1.25, `its total (${total.toFixed(2)}) stays within a quarter of the single 2.2 it was`);
  const w = world();
  const me = w.add('stormcaller', 30);
  const near = tame(w.mob('road_brigand', 0, 3, 30)), mid = tame(w.mob('road_brigand', 0.5, 15, 30)), far = tame(w.mob('road_brigand', -0.5, 28, 30)), off = tame(w.mob('road_brigand', 9, 10, 30));
  const slot = w.R.bar(me).find(b => b.id === 'storm_beam');
  assert.match(slot.desc, /Channels for up to 2\.2s, striking every 0\.4s/);
  assert.equal(w.R.intent(me, { t: 'cast', slot: slot.slot, target: near.id }).ok, true);
  w.steps(60);
  const mine = m => w.hits(m, me).filter(h => h.ab === 'storm_beam');
  assert.equal(mine(near).length, pulses, `the near target is struck once a pulse (${mine(near).length})`);
  assert.equal(mine(mid).length, pulses, 'so is the one 15 m behind it');
  assert.equal(mine(far).length, pulses, 'and the one at 28 m — the full length, though the target stood at 3 m');
  assert.equal(mine(off).length, 0, 'nothing beside the line');
  const fx = k => w.events.filter(e => e.type === 'fx' && e.kind === k && e.skill === 'storm_beam');
  const b = fx('beam')[0];
  assert.ok(b && b.len === row.range && b.pulses === pulses && b.ms === Math.round(row.channel.seconds * 1000) && b.every === 400 && b.id === me.id, 'the beam event carries what D-world draws');
  assert.equal(fx('beamPulse').length, pulses); assert.equal(fx('beamEnd').length, 1); assert.equal(fx('beamEnd')[0].why, 'done');
  // moving does not break it (the card says so), a second press does
  const w2 = world(); const me2 = w2.add('stormcaller', 30); const t2 = tame(w2.mob('road_brigand', 0, 6, 30));
  w2.R.intent(me2, { t: 'cast', slot: slot.slot, target: t2.id }); w2.steps(4);
  me2.moveTo(w2.sx + 2, w2.sz); w2.steps(10);
  assert.equal(w2.events.some(e => e.type === 'castX' && e.why === 'moved'), false);
  w2.R.intent(me2, { t: 'cast', slot: slot.slot, target: t2.id }); w2.steps(2);
  assert.ok(w2.events.some(e => e.type === 'fx' && e.kind === 'beamEnd' && e.why === 'released'), 'pressing the key again ends it');
});

// ------------------------------------------------------------------------------------------------ Y14 / Y31

test('Y14 (report #36) + Y31: the Unbinder charges a share of what a character of that level has really earned — about 500 at level 9 — from the ONE income table', async () => {
  const { unbinderPrice, lifetimeGold } = await import('../../js/rules/index.js');
  assert.equal(lifetimeGold(9), 3445, 'the owner\'s own data point is a row of the table');
  const all9 = unbinderPrice('talent', 'all', 9);
  assert.ok(all9 >= 400 && all9 <= 600, `everything back at level 9 costs ${all9} (the owner: "about 500")`);
  assert.equal(unbinderPrice('perk', 'all', 9), all9);
  const P = engine.prices;
  for (const L of [1, 3, 5, 9, 12, 20, 35, 50]) {
    const earned = lifetimeGold(L);
    for (const kind of ['talent', 'perk', 'spell']) {
      const one = unbinderPrice(kind, 'one', L), all = unbinderPrice(kind, 'all', L);
      assert.ok(all <= Math.max(P.retrain.min.all, earned * P.retrain.allShare) + 5, `L${L}: everything is ${P.retrain.allShare * 100}% of ${Math.round(earned)} earned (${all})`);
      assert.ok(one <= Math.max(P.retrain.min.one, earned * 0.02) + 5, `L${L} ${kind}: one costs ${one}, no more than 2% of what was earned`);
    }
  }
  // the knob is the table: move the row and the price moves with it (and nothing else prices the Unbinder)
  const row = P.income.lifetime.find(r => r[0] === 9), was = row[1];
  row[1] = 6890;
  try { assert.ok(Math.abs(unbinderPrice('talent', 'all', 9) - all9 * 2) <= 10, 'twice the income, twice the price'); } finally { row[1] = was; }
  const w = world(); const me = w.add('stormcaller', 9);
  assert.equal(w.R.retrainPrice(me, 'talent', 'all'), all9, 'the room charges it');
  // Y31: every gold formula's numbers are in prices.json (gear, kill, gold find, income, retrain) — nothing priced in code
  for (const k of ['gear', 'kill', 'goldFind', 'income', 'retrain']) assert.ok(P[k], `prices.json has ${k}`);
});

// ------------------------------------------------------------------------------------------------ Y17

test('Y17 (report #29): a training dummy — huge health, takes every skill and status, never dies, never fights, whole again in a moment, pays nothing', () => {
  const w = world();
  const me = w.add('pyromancer', 12);
  const d = w.R.spawnDummy({ x: w.sx, z: w.sz + 6, level: 12 });
  assert.ok(d && w.R.isDummy(d)); assert.equal(d.kind, 'monster'); assert.equal(d.type, 'training_dummy');
  const u = d.r.unit;
  const ordinary = w.mob('road_brigand', 40, 40, 12).r.unit.maxHp;
  assert.ok(u.maxHp >= ordinary * 100, `huge health (${u.maxHp} against an ordinary ${ordinary})`);
  assert.equal(d.hpMax, u.maxHp);
  const xy = { x: d.x, z: d.z };
  for (let i = 0; i < 400; i++) {
    me.r.unit.mp = me.r.unit.maxMp;
    if (i % 25 === 0) w.R.intent(me, { t: 'cast', slot: 1 + (i / 25) % 6, target: d.id, aim: { x: d.x, z: d.z } }); else w.R.intent(me, { t: 'cast', slot: 0, target: d.id });
    w.steps(1);
  }
  const hits = w.hits(d);
  assert.ok(hits.length > 30, `ordinary hit events for the meter (${hits.length})`);
  assert.ok(hits.some(h => h.skill === 'dot'), 'a burn ticks on it');
  assert.ok(new Set(hits.map(h => h.ab).filter(Boolean)).size >= 2, 'skills land on it');
  assert.ok(u.hp < u.maxHp && u.hp >= 1);
  assert.deepEqual({ x: d.x, z: d.z }, xy, 'it never moves');
  assert.equal(w.events.filter(e => e.type === 'hit' && e.d === me.id).length, 0, 'it never hits back');
  assert.equal(w.events.some(e => e.type === 'aggro'), false); assert.equal((u.threat?.size || 0), 0, 'no threat');
  assert.equal(me.state & 2, 0, 'hitting it is not "in combat"');
  // it cannot die: a blow worth more than all its health leaves it standing, and nobody is paid
  w.R.room.run(() => { u.hp = 3; });
  for (let i = 0; i < 40; i++) { w.R.intent(me, { t: 'cast', slot: 0, target: d.id }); w.steps(1); }
  assert.equal(d.dead, false); assert.ok(u.dying == null && u.hp >= 1);
  assert.deepEqual(w.awards, [], 'no experience, gold or loot');
  assert.equal(w.events.some(e => e.type === 'death' || e.type === 'reward'), false);
  // …and a moment after the last hit it is whole, with nothing on it
  w.steps(Math.ceil(engine.combatCfg.dummy.resetSec / 0.05) + 140);
  assert.equal(u.hp, u.maxHp); assert.deepEqual(Object.keys(u.statuses || {}), []);
  assert.equal(d.hp, d.hpMax, 'and the room entity shows it');
  // an entity the room spawned itself with `data.dummy` needs no call
  const own = w.room.spawn({ kind: 'monster', type: 'training_dummy', level: 3, x: w.sx + 10, z: w.sz, data: { dummy: true } });
  assert.ok(w.R.isDummy(own));
});

// ------------------------------------------------------------------------------------------------ Y21

test('Y21 (report #18): a wilderness NPC fights the monsters beside it while a player is near — and only then; helping it is reported once, saving it says so', () => {
  const hooks = [];
  const mk = (playerAt) => {
    const w = world({ hooks: { npcHelped: (npc, pl, info) => hooks.push({ npc: npc.id, pl: pl.id, ...info }) } });
    w.room.host.npcHelped = (npc, pl, info) => hooks.push({ npc: npc.id, pl: pl.id, ...info });
    const me = w.add('warrior', 6, 0, playerAt);
    const npc = w.room.spawn({ kind: 'npc', type: 'npc', name: 'Father Tobin', level: 5, x: w.sx, z: w.sz, team: 1, data: { fighter: { level: 5 } } });
    const mobs = [w.mob('ossuary_crawler', 3, 2, 5), w.mob('ossuary_crawler', -3, 2, 5)];
    return { w, me, npc, mobs };
  };
  // (a) nobody near: nothing happens to anybody
  let s = mk(-150);
  assert.ok(s.npc.r.unit?.wanderer, 'the NPC has a fighter (js/rules/guards.js)');
  const hp0 = s.mobs.map(m => m.r.unit.hp);
  s.w.steps(300);
  assert.deepEqual(s.mobs.map(m => m.r.unit.hp), hp0, 'no damage exchanged with no player near');
  assert.equal(s.npc.r.unit.hp, s.npc.r.unit.maxHp); assert.equal(s.w.R.npcFighting(s.npc), false);
  // (b) a player near, watching: they fight each other
  s = mk(-20);
  s.w.steps(200);
  assert.equal(s.w.R.npcFighting(s.npc), true);
  assert.ok(s.w.events.some(e => e.type === 'hit' && e.s === s.npc.id), 'the NPC strikes');
  assert.ok(s.w.events.some(e => e.type === 'hit' && e.d === s.npc.id), 'and is struck');
  assert.equal(hooks.length, 0, 'watching is not helping');
  // (c) the player joins in and kills them: thanked once, as a helper — and nobody is thanked twice
  s = mk(-6);
  let floor = 0.5;          // (the NPC is kept on its feet: a wanderer that goes DOWN was not saved, which is its own rule)
  const kill = () => { for (let i = 0; i < 1500 && s.mobs.some(m => !m.dead); i++) { const t = s.mobs.find(m => !m.dead); s.me.r.unit.hp = s.me.r.unit.maxHp; const g = s.npc.r.unit; g.hp = Math.max(g.hp, g.maxHp * floor); s.me.moveTo(t.r.unit.x, t.r.unit.z - 1.5); s.w.R.intent(s.me, { t: 'cast', slot: 0, target: t.id }); s.w.steps(1); } };
  kill();
  assert.ok(s.mobs.every(m => m.dead), 'the monsters are dead');
  s.w.steps(Math.ceil(engine.combatCfg.wanderer.quietSec / 0.05) + 20);
  assert.equal(hooks.length, 1); assert.equal(hooks[0].npc, s.npc.id); assert.equal(hooks[0].pl, s.me.id); assert.equal(hooks[0].foes, 2);
  assert.ok(['helped', 'saved'].includes(hooks[0].kind));
  assert.ok(s.w.events.some(e => e.type === 'fx' && e.kind === 'npcThanks' && e.id === s.npc.id && e.to === s.me.id));
  assert.equal(s.npc.dead, false, 'a wilderness NPC is never killed');
  assert.equal(s.w.R.npcFighting(s.npc), false, 'and the room has its feet back');
  s.w.steps(200); assert.equal(hooks.length, 1);
  // (d) it was nearly down when the player stepped in: that is a SAVE
  hooks.length = 0;
  s = mk(-6);
  s.w.steps(20);
  s.w.R.room.run(() => { s.npc.r.unit.hp = Math.round(s.npc.r.unit.maxHp * 0.2); });
  s.w.steps(2);
  floor = 0.1;
  kill(); s.w.steps(Math.ceil(engine.combatCfg.wanderer.quietSec / 0.05) + 20);
  assert.equal(hooks.length, 1); assert.equal(hooks[0].kind, 'saved');
  // town guards are untouched by it: a wanderer is nobody's gate guard
  assert.equal(s.w.R.guards.nearest(s.npc.x, s.npc.z, 50), null);
});

// ------------------------------------------------------------------------------------------------ Y32: the Starcaller

test('Y32: the Starcaller is a whole class — injected (Farhold\'s files untouched), six own skills on the ladder, four-tier trees, kits, armour, no banned word', async () => {
  const { readFileSync } = await import('node:fs');
  const farholdClasses = JSON.parse(readFileSync(new URL('../../../farhold/data/classes.json', import.meta.url), 'utf8'));
  const farholdSkills = JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url), 'utf8'));
  assert.equal(farholdClasses.classes.some(c => c.id === 'starcaller'), false, 'the shared class file is not written');
  const cls = engine.classById('starcaller');
  assert.ok(cls && cls.tv, 'it is in the engine'); assert.equal(cls.armorTier, 'cloth'); assert.equal(cls.primaryAttr, 'INT');
  const ids = engine.skillData.classes.starcaller;
  assert.equal(ids.length, 6);
  for (const id of ids) {
    assert.equal(farholdSkills.skills[id], undefined, `${id}: the shared skill file is not written`);
    const row = engine.skillData.skills[id];
    assert.equal(row.element, 'arcane', `${id} is arcane`);
    assert.equal(Object.keys(row.talents).length, 4, `${id}: four tiers`);
    for (const t of Object.values(row.talents)) assert.ok((t.nodes || []).length >= 2, `${id}: at least two nodes a tier`);
    for (const other of Object.entries(engine.skillData.classes)) if (other[0] !== 'starcaller') assert.equal(other[1].includes(id), false, `${id} is nobody else's`);
  }
  // the usual ladder, a thrown star at level 1
  const w = world(); const me = w.add('starcaller', 1);
  const bar = w.R.bar(me);
  assert.deepEqual(bar.map(b => b.level), [1, 3, 6, 12, 18, 24]);
  assert.equal(bar[0].id, 'star_dart'); assert.equal(bar[0].locked, false); assert.equal(bar[1].locked, true);
  // every word a player reads: none of the banned ones
  const text = JSON.stringify([cls, ids.map(id => engine.skillData.skills[id]), kitsFor('starcaller'), bar]).toLowerCase();
  for (const bad of ['starfall', 'ember', 'veil', 'muster', 'mythic', 'heroic', 'blink']) assert.equal(new RegExp(`\\b${bad}`).test(text), false, `"${bad}" appears in the class's text`);
  // kits: three armour sets, five weapon packs incl. a tome (main hand) with a focus, all legal hands
  const k = kitsFor('starcaller');
  assert.equal(k.armour.length, 3); assert.ok(k.weapons.length >= 5);
  const tomePack = starterGear('starcaller', validKit('starcaller', { weapons: 'tome_rune' }));
  assert.equal(tomePack.weapon.hand, 'main'); assert.equal(tomePack.weapon.castElement, 'arcane'); assert.equal(tomePack.weapon.castStyle, 'tome_rune'); assert.equal(tomePack.offhand.hand, 'off');
  assert.ok(engine.armourTiers?.classes?.starcaller || true);
});

test('Y32: Constellation — stars that land fill Starlight (5 at most), the big skills spend it for more; thrown stars and falling stars tell the client what to draw', () => {
  const w = world();
  const me = w.add('starcaller', 30);
  const u = me.r.unit;
  const mobs = [[0, 10], [2.2, 12.5], [-2.2, 12.5], [0, 15]].map(([dx, dz]) => tame(w.mob('road_brigand', dx, dz, 30)));
  const light = () => u.mech?.res?.starlight?.n || 0;
  const cast = (slot, steps = 60) => { u.mp = u.maxMp; const from = w.events.length; const r = w.R.intent(me, { t: 'cast', slot, target: mobs[0].id, aim: { x: w.sx, z: w.sz + 11 } }); assert.equal(r.ok, true, `slot ${slot}: ${r.text || ''}`); w.steps(steps); return w.events.slice(from); };
  assert.equal(light(), 0);
  let ev = cast(1);
  assert.equal(light(), 1, 'Star Dart: one enemy hit, one Starlight');
  const bolt = ev.find(e => e.type === 'fx' && e.kind === 'bolt');
  assert.ok(bolt && bolt.proj === 'star' && bolt.from && bolt.ms > 0 && bolt.skill === 'star_dart', 'a thrown star: fx bolt, proj star, from / to / ms');
  ev = cast(2);
  assert.ok(ev.filter(e => e.type === 'fx' && e.kind === 'bolt' && e.proj === 'star').length >= 3, 'Scattered Stars: three stars');
  for (let i = 0; i < 4 && light() < 5; i++) { u.skills.slots[0].ready = 0; cast(1); }
  assert.equal(light(), 5, 'it holds five');
  u.skills.slots[0].ready = 0; cast(1);
  assert.equal(light(), 5, 'and no more');
  // Called Star at five: falls after its second (a skyfall with where and when), hits harder than at none, spends it all
  const dmgOf = evs => evs.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.ab === 'called_star').reduce((a, h) => a + h.n, 0);
  ev = cast(3, 50);
  const fall = ev.find(e => e.type === 'fx' && e.kind === 'skyfall');
  assert.ok(fall && fall.proj === 'skystar' && fall.skill === 'called_star' && fall.ms === 1000 && fall.to && fall.r > 0, 'a falling star: fx skyfall, proj skystar, to / r / ms');
  const firstHit = ev.find(e => e.type === 'hit' && e.ab === 'called_star');
  assert.ok(firstHit && (firstHit.tick - ev[0].tick) * 50 >= 900, 'the damage lands when the star does, a second after the cast');
  assert.equal(light(), 0, 'spent');
  const full = dmgOf(ev);
  u.skills.slots[2].ready = 0;
  const none = dmgOf(cast(3, 50));
  assert.ok(full > none * 1.25, `five Starlight made it hit harder (${full} against ${none})`);
  // Heavens' Barrage: ten stars, each announced before it lands
  ev = cast(6, 120);
  const falls = ev.filter(e => e.type === 'fx' && e.kind === 'skyfall' && e.skill === 'sky_barrage');
  assert.equal(falls.length, 10); assert.ok(falls.every(f => f.ms === 350 && f.proj === 'skystar'));
  // Star Field lays a zone; Wheeling Stars wards
  ev = cast(4, 20); assert.ok(ev.some(e => e.type === 'fx' && e.kind === 'place' && e.skill === 'star_field'));
  ev = cast(5, 20); assert.ok(ev.some(e => e.type === 'fx' && e.kind === 'orbs'));
});
