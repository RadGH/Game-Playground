// node --test prototypes/thousandvale/tests/C/starblade.test.mjs
//
// Play-test 11, Z52 / Z55 (owner #53, #56): the Star Blade — the Starcaller's melee partner. "They also use astral (arcane)
// power but are melee focused. They use star power to protect themselves from attacks and cause retaliation. They also
// have several star-based offense abilities to help pull enemies in and control the crowd." / "could use the same
// starlight mechanic as the starcaller, but obviously it would apply to spells differently."
// Each test states a rule (what the card promises happens in a fight), not a tuning number unless the number IS the rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor, starterGear, validKit } from '../../js/rules/index.js';
import { applyPoints, hurtGain } from '../../js/rules/cast-skills.js';
import { empowerPlan } from '../../js/rules/character.js';

const engine = rulesEngine();
const open = standInTerrain(2, 2048);
let n = 0;
function world() {
  const events = [];
  const id = `sb-${++n}`;
  const room = createRoom({ id, terrain: open, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: () => {} } });
  const w = { room, events, tick: 0, R: room.rules, sx: open.spawn.x, sz: open.spawn.z };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 40;
  w.add = (cls, level, dx = 0, dz = 0) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: w.sx + dx, z: w.sz + dz }, null);
  w.mob = (type, dx, dz, level = 3, data = {}) => room.spawn({ kind: 'monster', type, level, x: w.sx + dx, z: w.sz + dz, data: { noRank: true, ...data } });
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  w.hits = (dst, src = null) => events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.d === dst.id && (src == null || e.s === src.id));
  return w;
}
const tough = m => { const u = m.r.unit; u.maxHp = u.hp = 1e7; return m; };
const tame = m => { const u = tough(m).r.unit; u.dmg = [0, 0]; u.speed = 0; u.aggroRange = 0; return m; };
const light = me => me.r.unit.mech?.res?.starlight?.n || 0;
const setLight = (me, k) => { const u = me.r.unit; u.mech = u.mech || { res: {} }; u.mech.res = u.mech.res || {}; u.mech.res.starlight = { n: k, max: 5, decay: 0 }; };
const IDS = ['starcut', 'star_aegis', 'star_tether', 'comet_rush', 'binding_stars', 'collapsing_star'];
function cast(w, me, slot, { target = null, aim = null, steps = 30 } = {}) {
  const u = me.r.unit;
  u.mp = u.maxMp;
  u.skills.slots[slot - 1].ready = 0;
  const from = w.events.length;
  const r = w.R.intent(me, { t: 'cast', slot, target: target?.id ?? null, aim: aim || (target ? { x: target.r.unit.x, z: target.r.unit.z } : { x: w.sx, z: w.sz + 3 }) });
  assert.equal(r.ok, true, `slot ${slot}: ${r.text || r.why || ''}`);
  w.steps(steps);
  return w.events.slice(from);
}

test('Z52: the Star Blade is a whole class — injected (Farhold untouched), plate and swords, six own arcane skills on the ladder, four-tier trees, kits, tier-2 plate, no banned word', () => {
  const farholdClasses = JSON.parse(readFileSync(new URL('../../../farhold/data/classes.json', import.meta.url), 'utf8'));
  const farholdSkills = JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url), 'utf8'));
  assert.equal(farholdClasses.classes.some(c => c.id === 'starblade'), false, 'the shared class file is not written');
  const cls = engine.classById('starblade');
  assert.ok(cls && cls.tv, 'in the engine');
  assert.equal(cls.name, 'Star Blade');
  assert.equal(cls.armorTier, 'heavy'); assert.equal(cls.weaponFamily, 'heavy'); assert.equal(cls.resourceName, 'Starlight');
  assert.ok(cls.weapons.includes('sword') && cls.weapons.includes('sword2h'));
  assert.match(cls.signature, /from level 3/i, 'the card says when Starlight starts');
  const ids = engine.skillData.classes.starblade;
  assert.deepEqual(ids, IDS);
  for (const id of ids) {
    assert.equal(farholdSkills.skills[id], undefined, `${id}: the shared skill file is not written`);
    const row = engine.skillData.skills[id];
    assert.equal(row.element, 'arcane', `${id} is arcane`);
    assert.equal(Object.keys(row.talents).length, 4, `${id}: four tiers`);
    for (const t of Object.values(row.talents)) assert.ok((t.nodes || []).length >= 2, `${id}: two nodes a tier at least`);
    for (const [other, list] of Object.entries(engine.skillData.classes)) if (other !== 'starblade') assert.equal(list.includes(id), false, `${id} is nobody else's`);
  }
  const w = world(); const me = w.add('starblade', 1);
  const bar = w.R.bar(me);
  assert.deepEqual(bar.map(b => b.level), [1, 3, 6, 12, 18, 24]);
  assert.equal(bar[0].id, 'starcut'); assert.equal(bar[0].locked, false); assert.equal(bar[1].locked, true);
  for (const b of bar) assert.doesNotMatch(b.desc, /NaN|undefined|\{/, `${b.id}: a clean card`);
  const text = JSON.stringify([cls, ids.map(id => engine.skillData.skills[id]), kitsFor('starblade'), bar]).toLowerCase();
  for (const bad of ['starfall', 'ember', 'veil', 'muster', 'mythic', 'heroic', 'blink', 'counterspell', 'lay on hands', 'consecration']) assert.equal(new RegExp(`\\b${bad}`).test(text), false, `"${bad}" appears in the class's text`);
  const k = kitsFor('starblade');
  assert.equal(k.armour.length, 3); assert.ok(k.weapons.length >= 4);
  const g = starterGear('starblade', validKit('starblade', { weapons: 'greatsword' }));
  assert.equal(g.weapon.baseKey, 'greatsword'); assert.equal(g.weapon.twoHanded, true);
  assert.equal(engine.armourTiers?.classes?.starblade?.weight ?? 'heavy', 'heavy');
});

test('Z55 (#56): Starlight — gained by blows GIVEN (one an enemy hit) and blows TAKEN (once a second at most), from level 3 only, five at most', () => {
  // below level 3 nothing is gained: there is nothing to spend it on yet (owner #1's rule, the Starcaller's)
  let w = world(); let me = w.add('starblade', 2);
  let mobs = [[0, 2], [1.4, 2.2]].map(([dx, dz]) => tame(w.mob('road_brigand', dx, dz, 2)));
  cast(w, me, 1, { target: mobs[0] });
  assert.ok(w.hits(mobs[0], me).length > 0, 'Starcut landed');
  assert.equal(light(me), 0, 'level 2: no Starlight');
  // level 6: one for each enemy the swing hits
  w = world(); me = w.add('starblade', 6);
  mobs = [[0, 2], [1, 2.2], [-1, 2.2]].map(([dx, dz]) => tame(w.mob('road_brigand', dx, dz, 6)));
  cast(w, me, 1, { target: mobs[0] });
  const struck = mobs.filter(m => w.hits(m, me).some(h => h.ab === 'starcut')).length;
  assert.ok(struck >= 2, `the arc caught ${struck}`);
  // one for each HIT: a longsword's skill swing lands twice on what it catches (the weapon's own pattern), so 3 enemies fill it
  const blows = mobs.reduce((a, m) => a + w.hits(m, me).filter(h => h.ab === 'starcut').length, 0);
  assert.equal(light(me), Math.min(5, blows), `one Starlight a hit (${blows} hits)`);
  for (let i = 0; i < 4; i++) cast(w, me, 1, { target: mobs[0] });
  assert.equal(light(me), 5, 'it holds five');
  // blows taken: a pack hitting you fills it, but never faster than once a second
  w = world(); me = w.add('starblade', 10);
  const u = me.r.unit; u.maxHp = u.hp = 1e6;
  for (const [dx, dz] of [[0, 1.5], [1.2, 1.2], [-1.2, 1.2], [0, -1.5]]) { const m = tough(w.mob('road_brigand', dx, dz, 10)); m.r.unit.aggroRange = 30; }
  const t0 = w.room.rules.room?.clock?.now?.() ?? 0; void t0;
  w.steps(80);                     // 4 seconds at 20 ticks a second
  const taken = w.events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.d === me.id && e.n > 0).length;
  assert.ok(taken >= 4, `the pack hit (${taken} blows)`);
  assert.ok(light(me) >= 2 && light(me) <= 5, `hits taken filled it at most once a second (${light(me)} from ${taken} blows in 4s)`);
  assert.ok(light(me) < taken, 'not one a blow');
  // the throttle itself, without a fight
  const fake = { level: 10, skills: { slots: [{ unlockAt: 1, tv: { hurtGain: { id: 'starlight', n: 1, every: 1, fromLevel: 3 } } }] } };
  assert.equal(hurtGain(fake, 10), 1); assert.equal(hurtGain(fake, 10.5), 0); assert.equal(hurtGain(fake, 11.01), 1);
  assert.equal(hurtGain({ ...fake, level: 2, mech: null }, 20), 0, 'not below level 3');
});

test('Z52: Star Aegis — a star shield that strikes back; Starlight spent makes it bigger and the answers harder, five makes them stun; each answer gives Starlight back', () => {
  const run = points => {
    const w = world(); const me = w.add('starblade', 20);
    const u = me.r.unit; u.maxHp = u.hp = 2000;
    setLight(me, points);
    const ev = cast(w, me, 2, { steps: 1 });
    const barrier = u.barrier || 0;
    assert.equal(light(me), 0, 'it spends all of it');
    const m = tough(w.mob('road_brigand', 0, 1.6, 20)); m.r.unit.aggroRange = 30;
    let stun = 0;
    for (let i = 0; i < 60; i++) { w.steps(1); stun = Math.max(stun, m.r.unit.stagger || 0); }
    const answers = w.events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.d === m.id && e.s === me.id);
    return { ev, barrier, answers: answers.length, dmg: answers.reduce((a, h) => a + h.n, 0) / Math.max(1, answers.length), stun, gained: light(me) };
  };
  const none = run(0), full = run(5);
  assert.ok(none.barrier >= Math.round(2000 * 0.12) - 1, `a barrier with no Starlight (${none.barrier})`);
  assert.ok(full.barrier >= Math.round(2000 * 0.27) - 1, `five Starlight: +3% each (${full.barrier})`);
  assert.ok(none.answers >= 1 && full.answers >= 1, 'the melee blows were answered');
  assert.ok(full.dmg > none.dmg * 1.5, `five Starlight: answers twice as hard (${full.dmg} against ${none.dmg})`);
  assert.ok(full.stun > 0.3, `five Starlight: an answer stuns (${full.stun})`);
  assert.ok(none.gained >= 1, 'each answered blow gives a Starlight back');
});

test('Z52: Star Tether drags enemies in to you and makes them attack you; Comet Rush carries you to your target', () => {
  let w = world(); let me = w.add('starblade', 12);
  const far = [[6, 6], [-7, 4], [0, 8]].map(([dx, dz]) => tame(w.mob('road_brigand', dx, dz, 12)));
  const before = far.map(m => Math.hypot(m.r.unit.x - w.sx, m.r.unit.z - w.sz));
  cast(w, me, 3, { steps: 20 });
  const after = far.map(m => Math.hypot(m.r.unit.x - w.sx, m.r.unit.z - w.sz));
  for (let i = 0; i < far.length; i++) assert.ok(after[i] < before[i] - 3, `enemy ${i} pulled in (${before[i].toFixed(1)} -> ${after[i].toFixed(1)} m)`);
  assert.ok(light(me) >= 3, 'each enemy pulled is a Starlight');
  w = world(); me = w.add('starblade', 12);
  const t = tame(w.mob('road_brigand', 0, 11, 12));
  const ev = cast(w, me, 4, { target: t, steps: 20 });
  const u = me.r.unit;
  assert.ok(Math.hypot(u.x - t.r.unit.x, u.z - t.r.unit.z) < 4, 'you arrive at the target');
  assert.ok(w.hits(t, me).some(h => h.ab === 'comet_rush'), 'and strike it');
  void ev;
});

test('Z52 / Z55: Binding Stars roots the crowd — Starlight holds them longer, five also stuns; Collapsing Star hits harder for every point', () => {
  const bind = points => {
    const w = world(); const me = w.add('starblade', 24);
    const ms = [[2, 2], [-2, 3], [0, 4]].map(([dx, dz]) => tame(w.mob('road_brigand', dx, dz, 24)));
    setLight(me, points);
    cast(w, me, 5, { steps: 1 });
    return { root: Math.min(...ms.map(m => m.r.unit.statuses?.root?.remaining || 0)), stun: Math.max(...ms.map(m => m.r.unit.stagger || 0)) };
  };
  const b0 = bind(0), b5 = bind(5);
  assert.ok(b0.root > 2, `rooted (${b0.root}s)`);
  assert.ok(b5.root > b0.root + 1.2, `five Starlight hold 1.5s longer (${b0.root} -> ${b5.root})`);
  assert.ok(b5.stun > 0.5 && b5.stun > b0.stun, `five Starlight also stun (${b0.stun} -> ${b5.stun})`);
  const collapse = points => {
    const w = world(); const me = w.add('starblade', 24);
    const t = tame(w.mob('road_brigand', 0, 3, 24));
    setLight(me, points);
    cast(w, me, 6, { steps: 10 });
    return w.hits(t, me).filter(h => h.ab === 'collapsing_star').reduce((a, h) => a + h.n, 0);
  };
  const c0 = collapse(0), c5 = collapse(5);
  assert.ok(c0 > 0 && c5 > c0 * 1.3, `five Starlight: a heavier collapse (${c0} -> ${c5})`);
});

test('applyPoints is pure on the plan and touches nothing without points; an object barrier keeps its shape through the skill power (it used to become NaN)', () => {
  const plan = { ok: true, mult: 1, barrier: { share: 0.12, seconds: 8 }, counter: { answer: { mult: 0.9 } }, tv: { points: { barrier: 0.03, answer: 0.2, atMax: { stun: 0.5 } } } };
  assert.deepEqual(applyPoints({ ...plan, pointsSpent: 0 }).barrier, { share: 0.12, seconds: 8 });
  const p5 = applyPoints({ ...plan, pointsSpent: 5 });
  assert.ok(Math.abs(p5.barrier.share - 0.27) < 1e-9);
  assert.ok(Math.abs(p5.counter.answer.mult - 1.8) < 1e-9);
  assert.equal(p5.counter.answer.knock.stagger, 0.5);
  const e = empowerPlan({ ok: true, mult: 1, barrier: { share: 0.12, seconds: 8 } }, 2);
  assert.deepEqual(e.barrier, { share: 0.12, seconds: 8 }, 'an object barrier is not divided');
  assert.equal(empowerPlan({ ok: true, mult: 1, barrier: 0.4 }, 2).barrier, 0.2, 'a share-of-damage barrier still is');
});

import { tierNodes, nodeText } from '../../js/rules/talents.js';

test('Z52: every Star Blade talent picked on its own casts in a fight without an error, with Starlight full and empty, and its card reads clean', () => {
  const w = world(); const me = w.add('starblade', 30);
  const u = me.r.unit;
  const rows = engine.skillData.skills;
  let picked = 0;
  for (let i = 0; i < 6; i++) {
    const sl = u.skills.slots[i];
    for (const tier of [1, 2, 3, 4]) for (const nd of tierNodes(rows[sl.id], tier)) {
      for (const pts of [0, 5]) {
        const m = w.mob('road_brigand', 2, 3, 30);
        u.skillTalents = { [sl.id]: { [tier]: nd.id } };
        setLight(me, pts);
        sl.ready = 0; sl.charges = null; u.mp = u.maxMp; u.hp = u.maxHp;
        w.room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
        w.steps(6);
        if (!m.removed) w.room.remove(m);
      }
      const text = nodeText ? nodeText(nd, rows[sl.id]) : '';
      assert.doesNotMatch(String(text || ''), /undefined|NaN|No change/, `${sl.id}:${nd.id}: ${text}`);
      picked++;
    }
    u.skillTalents = {};
  }
  assert.ok(picked >= 48, `${picked} nodes`);
  assert.equal(w.room.stats.rulesErrors, 0, String(w.room.stats.lastRulesError || ''));
});

test('Z52: the class quest — from the trainer who teaches it (the Starcaller\'s), shaped like the others, every step within a short walk of the last (owner #31: never back the way you came)', () => {
  const J = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
  const CQ = J('data/quests/classes.json');
  const q = CQ.quests.find(x => (x.classes || []).includes('starblade'));
  const star = CQ.quests.find(x => x.id === 'class_starcaller');
  assert.ok(q && q.id === 'class_starblade');
  assert.deepEqual(Object.keys(q).sort(), Object.keys(star).sort(), 'the same fields as the Starcaller\'s');
  assert.equal(q.giver, star.giver, 'the same trainer as the Starcaller (they start side by side)');
  assert.ok(CQ.npcs[q.giver].trains.includes('starblade'));
  assert.ok(q.level >= 1 && q.level <= 5 && q.reward.item.base === 'longsword' && q.reward.perks === 1);
  const m = J('data/quests/marks/torbor_downs.json').quests.class_starblade;
  assert.equal(m.steps.length, q.steps.length, 'a mark for every step');
  for (let i = 1; i < m.steps.length; i++) {
    const a = m.steps[i - 1], b = m.steps[i];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 150, `step ${i} -> ${i + 1} is ${Math.round(Math.hypot(a.x - b.x, a.z - b.z))} m`);
  }
  const g = J('data/quests/marks/givers.json').npcs[q.giver];
  assert.ok(g.gives.includes(q.id) && g.takes.includes(q.id) && g.trains.includes('starblade'));
  assert.ok(J('data/provinces/offices.json') && JSON.stringify(J('data/provinces/offices.json')).includes('"starblade"'), 'the office copy of the trainer\'s list');
  assert.ok(J('data/vignettes/placements/z12_02.json').placements.find(p => p.id === q.giver).trains.includes('starblade'), 'the placed trainer');
  const kill = q.steps.find(s => s.kind === 'kill');
  const hunts = J('data/quests/marks/torbor_downs-hunts.json').types[kill.type] || [];
  assert.ok(hunts.some(h => Math.hypot(h.x - m.steps[1].x, h.z - m.steps[1].z) < 30 && h.n >= kill.count), `enough ${kill.type} live where the step points`);
});
