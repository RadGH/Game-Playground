// Stream D-world — play-test 1 (docs: ~/claude/agent/mmo/round-playtest1.md): node tests for the rendering fixes.
//   P1  the fixed light pool never adds/removes/hides a light (no shader recompiles); the frame watchdog counts long frames
//   P10 which handoffs are a "jump" (fade) and which are a step onto the same ground (no fade)
//   P12 a telegraph is drawn from the moment it arrives and its fill reaches the edge exactly when it lands
//   P20 every one of the 180 skills of the 30 classes has a look, Gnawing Dark included, and no two skills of a class match
//   P22 no armour = plain shorts and a shirt; worn armour/weapons map to Chibi 2 parts (full items and the compact info.gear)
// Run: node --test prototypes/thousandvale/tests/D/playtest1.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { skillLook, lookSignature, statusLook, elementOf } from '../../js/client/spell-looks.js';
import { gearLook, gearKey, PLAIN, normItem } from '../../js/client/gear-look.js';
import { createPerf } from '../../js/client/perf.js';
import { isJump } from '../../js/client/transition.js';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const G = new URL('../../', import.meta.url);
const SK = JSON.parse(readFileSync(new URL('../farhold/data/skills.json', G)));
const ITEMS = JSON.parse(readFileSync(new URL('../emberveil/data/items.json', G)));
const BASES = { ...ITEMS.weaponBases, ...ITEMS.armorBases };

test('P20: every skill of all 30 classes has a look; within a class no two look alike', () => {
  const classes = Object.entries(SK.classes);
  assert.equal(classes.length, 30);
  let n = 0;
  for (const [cls, ids] of classes) {
    const seen = new Map();
    for (const id of ids) {
      const sk = SK.skills[id]; assert.ok(sk, `${cls}: ${id} is in skills.json`);
      const L = skillLook(id, sk); n++;
      assert.ok(L.cast || L.travel || L.area, `${id} draws SOMETHING (cast, travel or area)`);
      assert.ok(L.impact && L.impact.element, `${id} has an on-hit impact`);
      const sig = lookSignature(L);
      assert.ok(!seen.has(sig), `${cls}: ${id} looks exactly like ${seen.get(sig)} (${sig})`);
      seen.set(sig, id);
    }
  }
  assert.equal(n, 180);
});

test('P20: Gnawing Dark is a shadow bolt that flies, bursts and leaves a curse on its target', () => {
  const L = skillLook('gnawing_dark', SK.skills.gnawing_dark);
  assert.equal(L.element, 'shadow');
  assert.equal(L.travel.kind, 'projectile');
  assert.equal(L.cast, 'hand');
  assert.equal(L.impact.element, 'shadow');
  assert.equal(L.status, 'curse', 'gnawed is drawn as a shadow curse at the feet');
});

test('P20: every status the skills apply maps to a SpellFx aura, every element to one SpellFx draws', () => {
  const statuses = new Set();
  for (const sk of Object.values(SK.skills)) { if (sk.status) statuses.add(sk.status); for (const s of sk.statuses || []) statuses.add(s.id || s); }
  for (const s of statuses) assert.ok(statusLook(s), `status ${s} has an aura`);
  for (const sk of Object.values(SK.skills)) assert.ok(['fire', 'ice', 'shadow', 'holy', 'nature', 'arcane', 'lightning', 'physical', 'poison', 'bleed', 'true'].includes(elementOf(sk.element)));
});

test('P20: the runtime turns cast / bolt / hit / status events into SpellFx calls (and ignores what it does not know)', async () => {
  const THREE = await import('three');
  const { createSpells } = await import('../../js/client/spells.js');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const body = (id, x) => ({ id, pos: new THREE.Vector3(x, 0, 0), height: 1.8, yaw: 0, group: new THREE.Group() });
  const A = new Map([[1, body(1, 0)], [2, body(2, 8)]]);
  for (const a of A.values()) scene.add(a.group);
  const sp = createSpells(scene, { camera, actors: { get: id => A.get(id) }, skillOf: id => SK.skills[id] || null });
  sp.onEvent({ type: 'cast', s: 1, skill: 'gnawing_dark', aim: { x: 8, z: 0 }, target: 2 });
  sp.onEvent({ type: 'fx', kind: 'bolt', id: 1, skill: 'gnawing_dark', element: 'shadow', from: { x: 0, z: 0 }, to: 2, ms: 260 });
  sp.onEvent({ type: 'hit', s: 1, d: 2, n: 12, el: 'shadow', kind: 'dmg', skill: 'bolt' });
  sp.onEvent({ type: 'fx', kind: 'status', id: 2, status: 'gnawed', on: true });
  sp.onEvent({ type: 'cast', s: 1, skill: 'consecrate', aim: { x: 3, z: 0 } });
  sp.onEvent({ type: 'fx', kind: 'burst', id: 1, x: 2, z: 2, r: 3, element: 'fire' });
  sp.onEvent({ type: 'fx', kind: 'no_such_kind', id: 1 });
  for (let i = 0; i < 20; i++) sp.update(0.05);
  assert.equal(sp.stats.casts, 2);
  assert.equal(sp.stats.projectiles, 1);
  assert.ok(sp.stats.impacts >= 2, 'the bolt landed and the hit burst');
  assert.equal(sp.stats.statuses, 1);
  assert.ok(sp.stats.areas >= 2);
  assert.ok(sp.fx.statusesOn(A.get(2).group).includes('curse'), 'Gnawed shows on the target');
  sp.onEvent({ type: 'fx', kind: 'status', id: 2, status: 'gnawed', on: false });
  assert.ok(!sp.fx.statusesOn(A.get(2).group).includes('curse'), 'and goes when it ends');
});

test('P22: no armour = plain shorts + shirt, empty hands; the class outfit is not worn in the world', () => {
  const L = gearLook({}, { baseOf: k => BASES[k] });
  assert.equal(L.top.id, 'tshirt'); assert.equal(L.bottom.id, 'shorts'); assert.equal(L.hat.id, 'none'); assert.equal(L.held.id, 'none');
  assert.deepEqual(Object.keys(L).sort(), Object.keys(PLAIN).sort());
});

test('P22: worn gear is drawn: armour by base tier, weapons by subtype, compact info.gear as well as full items', () => {
  const full = { head: { baseKey: 'heavy_helm', slot: 'head', rarity: 'rare' }, chest: { baseKey: 'cloth_robe', tier: 'cloth' }, weapon: { baseKey: 'longsword', subtype: 'longsword', type: 'weapon', rarity: 'magic' }, offhand: { baseKey: 'kite_shield', isShield: true } };
  const L = gearLook(full, { baseOf: k => BASES[k] });
  assert.equal(L.top.id, 'robe');
  assert.equal(L.held.id, 'fh_longsword');
  assert.equal(L.offhand.id, 'fh_kite_shield');   // play-test 4 S17: a kite shield is drawn as a kite shield
  // the server's compact form (protocol: info.gear {slot: {base, sub?, rarity}})
  const compact = { weapon: { base: 'staff', sub: 'staff', rarity: 'normal' }, chest: { base: 'heavy_chest', rarity: 'normal' }, offhand: { base: 'buckler', rarity: 'magic' } };
  const C = gearLook(compact, { baseOf: k => BASES[k] });
  assert.equal(C.held.id, 'staff_orb');
  assert.equal(C.offhand.id, 'buckler', 'a buckler base is drawn as a buckler (play-test 4 S17: each shield base its own model)');
  assert.ok(['plate', 'scale_plate', 'tunic'].includes(C.top.id), `heavy chest -> ${C.top.id}`);
  assert.equal(normItem({ base: 'longsword' }, k => BASES[k]).subtype, 'sword');
  assert.equal(gearLook({ weapon: { base: 'longsword', rarity: 'normal' } }, { baseOf: k => BASES[k] }).held.id, 'fh_longsword', 'a longsword base draws the longsword');
  assert.notEqual(gearKey(full), gearKey({}), 'a change of gear changes the key (re-dress)');
  assert.equal(gearKey(full), gearKey(JSON.parse(JSON.stringify(full))));
});

test('P1: the light pool keeps a FIXED set of always-visible lights and hands them to the nearest sources', async () => {
  const THREE = await import('three');
  const { createLightPool } = await import('../../js/client/lightpool.js');
  const scene = new THREE.Scene(), pool = createLightPool();
  pool.attach(scene, { count: 4 });
  const lights = () => scene.children.filter(o => o.isPointLight);
  assert.equal(lights().length, 4);
  const owner = new THREE.Group(); scene.add(owner);
  const hs = [];
  for (let i = 0; i < 12; i++) hs.push(pool.add({ x: i * 10, y: 1, z: 0, intensity: 8, distance: 10, owner }));
  pool.update(0.5, new THREE.Vector3(0, 2, 0));
  assert.equal(lights().length, 4, 'adding sources adds no light');
  assert.ok(lights().every(l => l.visible), 'no light is ever hidden (three would recompile every material)');
  const lit = lights().filter(l => l.intensity > 0).map(l => Math.round(l.position.x)).sort((a, b) => a - b);
  assert.deepEqual(lit, [0, 10, 20, 30], 'the four nearest sources are lit');
  owner.visible = false; pool.update(0.5, new THREE.Vector3(0, 2, 0));
  assert.ok(lights().every(l => l.intensity === 0 && l.visible), 'a hidden zone/dungeon lights nothing, and still nothing is hidden');
  owner.visible = true; for (const h of hs) h.remove(); pool.update(0.5, new THREE.Vector3(0, 2, 0));
  assert.equal(lights().length, 4);
  assert.ok(lights().every(l => l.intensity === 0));
});

test('P1: the frame watchdog counts frames over the limit and names the spans that ran in them', () => {
  globalThis.document ||= { hidden: false };
  // A fake page clock: the watchdog also reads performance.now() for spans and busy time, so on a loaded
  // machine (the publish gate runs every suite at once) real time between these lines broke the counts.
  const realNow = performance.now.bind(performance);
  let t = realNow() + 60000;
  performance.now = () => t;
  try {
  const p = createPerf({ longMs: 100 });
  p.frame(t);
  p.span('cheap', () => 0);
  t += 16; p.frame(t);
  const end = p.begin('zone:scatter'); end();   // (the watchdog's clock is the page's performance.now())
  t += 250; p.frame(t);          // a 250 ms frame
  t += 16; p.frame(t);
  const s = p.stats();
  assert.equal(s.longFrames, 1);
  assert.equal(s.worstMs, 250);
  assert.equal(s.recent[0].spans[0][0], 'zone:scatter');
  p.reset(); assert.equal(p.stats().longFrames, 0);
  } finally { performance.now = realNow; }
});

test('P10: a jump (waystone, door, respawn, relocate, a long move) fades; walking out of town does not', () => {
  assert.equal(isJump({ via: 'waystone' }), true);
  assert.equal(isJump({ via: 'respawn' }), true);
  assert.equal(isJump({ via: 'relocate' }), true);
  assert.equal(isJump({ via: 'portal' }), true);
  assert.equal(isJump({ via: 'walk' }, { x: 0, z: 0 }, { x: 3, z: 0 }), false);
  assert.equal(isJump(null, { x: 0, z: 0 }, { x: 2, z: 1 }), false);
  assert.equal(isJump(null, { x: 0, z: 0 }, { x: 900, z: 0 }), true);
});

test('P12: a telegraph is on the ground from the moment it arrives and fills to its edge exactly when it lands', async () => {
  const THREE = await import('three');
  const { createTelegraphs } = await import('../../js/client/telegraphs.js');
  const scene = new THREE.Scene();
  let now = 10000;
  const tele = createTelegraphs(scene, { serverNow: () => now, posOf: () => null, selfPos: () => ({ x: 0, z: 0 }), selfId: () => 1 });
  // C places the zone at CAST START: ms = the cast bar + the wind-up (encounter.js placeAll lead)
  tele.add({ id: 7, s: 3, ab: 'stomp', k: 'harm', ms: 2400, shape: 'circle', x: 0, z: 0, r: 4 }, now);
  const t = tele.live.get(7);
  assert.ok(t && t.mesh.parent, 'drawn the moment the event arrives');
  const prog = () => { tele.update(0); return t.mesh.material.uniforms.uProg.value; };
  assert.ok(prog() < 0.01, 'empty at cast start');
  now += 1200; assert.ok(Math.abs(prog() - 0.5) < 0.01, 'half full half way through');
  now += 1100; assert.ok(prog() > 0.95 && prog() < 1, 'nearly full just before it lands');
  assert.ok(tele.standingInDanger, 'standing inside it lights the screen edge');
  now += 100; assert.ok(prog() >= 0.999, 'full exactly at landing');
  tele.resolve({ id: 7, hits: [1] });
  assert.equal(t.state, 'land');
  // a late packet (150 ms of latency) starts part-filled instead of restarting the clock
  tele.add({ id: 8, s: 3, ab: 'stomp', k: 'harm', ms: 1500, shape: 'cone', x: 0, z: 0, r: 6, arc: 1 }, now - 150);
  const t8 = tele.live.get(8); tele.update(0);
  assert.ok(Math.abs(t8.mesh.material.uniforms.uProg.value - 0.1) < 0.01);
});

test('P21: water meets the bank — every shoreline cell is covered, and no water floats over land that falls away', async () => {
  const { parseTerrain } = await import('../../js/rules/terrain-read.js');
  const { extendWaterSurface } = await import('../../js/client/terrain-view.js');
  for (const key of ['z12_02', 'z13_02']) {
    const t = parseTerrain(readFileSync(new URL(`data/zones/${key}/terrain.bin`, G)));
    const res = t.size, wg = t.waterGrid(), grid = t.heightGrid();
    const surf = extendWaterSurface(wg, grid, res, { reach: 2 });
    let shore = 0, gapsBefore = 0, gapsAfter = 0, floating = 0;
    const has = (a, k) => !Number.isNaN(a[k]);
    for (let j = 0; j < res - 1; j++) for (let i = 0; i < res - 1; i++) {
      const c = [j * res + i, j * res + i + 1, (j + 1) * res + i, (j + 1) * res + i + 1];
      const wet = c.filter(k => has(wg, k)).length;
      if (wet === 0 || wet === 4) continue;
      shore++;
      if (c.some(k => !has(wg, k))) gapsBefore++;             // the old mesh needed all corners wet: every shore cell was open
      if (c.some(k => !has(surf, k)) && c.every(k => has(wg, k) || grid[k] >= Math.max(...c.filter(q => has(wg, q)).map(q => wg[q])))) gapsAfter++;
    }
    for (let k = 0; k < surf.length; k++) if (!has(wg, k) && has(surf, k) && surf[k] - grid[k] > 0.13) floating++;
    assert.ok(shore > 100, `${key}: has shoreline (${shore})`);
    assert.equal(gapsBefore, shore, 'before: the water stopped short of every shore cell');
    assert.equal(gapsAfter, 0, `${key}: no bank cell is left open`);
    assert.equal(floating, 0, `${key}: no extended water hangs over lower ground`);
  }
});

test("P20: C's fx 'spell' (exact place/radius/delay) and fx 'impact' {el, ab} are drawn, and replace the client's guesses", async () => {
  const THREE = await import('three');
  const { createSpells } = await import('../../js/client/spells.js');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const body = (id, x) => ({ id, pos: new THREE.Vector3(x, 0, 0), height: 1.8, yaw: 0, group: new THREE.Group() });
  const A = new Map([[1, body(1, 0)], [2, body(2, 6)]]);
  for (const a of A.values()) scene.add(a.group);
  const sp = createSpells(scene, { camera, actors: { get: id => A.get(id) }, skillOf: id => SK.skills[id] || null });
  sp.onEvent({ type: 'fx', kind: 'spell', id: 1, ab: 'consecrate', el: 'holy', shape: 'ground', x: 3, z: 0, r: 5 });
  sp.onEvent({ type: 'fx', kind: 'impact', id: 2, el: 'shadow', ab: 'gnawing_dark' });
  const before = sp.stats.impacts;
  sp.onEvent({ type: 'hit', s: 1, d: 2, n: 5, el: 'shadow', kind: 'dmg', ab: 'gnawing_dark' });
  assert.equal(sp.stats.impacts, before, 'the hit does not burst a second time once C sends impacts');
  assert.equal(sp.stats.areas, 1);
  const a0 = sp.stats.areas;
  sp.onEvent({ type: 'cast', s: 1, skill: 'consecrate', aim: { x: 3, z: 0 } });
  assert.equal(sp.stats.areas, a0, 'the cast no longer guesses the area once fx spell is flowing');
  for (let i = 0; i < 10; i++) sp.update(0.05);
});

// Gate (2026-10-08): freeze.spec.js had recorded "one ~1.8 s task outside the frame loop" on one run in three or four
// since round 5. It was the LAST FRAME BEFORE the spec's own tv.perf(true): a longtask entry is delivered after its
// task ends, so a frame that ended a few ms before the reset arrived just after it — its frame span already wiped —
// and nothing was left to say it was a frame. The rule: a task that began before the reset is not this run's.
test('the frame watchdog does not count a long task that began before the last reset (late longtask delivery)', () => {
  globalThis.document ||= { hidden: false };
  const realNow = performance.now.bind(performance), RealPO = globalThis.PerformanceObserver;
  let t = realNow() + 60000, deliver = null;
  performance.now = () => t;
  globalThis.PerformanceObserver = class { constructor(cb) { deliver = entries => cb({ getEntries: () => entries }); } observe() {} };
  globalThis.PerformanceObserver.supportedEntryTypes = ['longtask'];
  try {
    const p = createPerf({ longMs: 100 });
    assert.ok(deliver, 'the watchdog listens for long tasks');
    // a frame: its callback runs 20 ms, then the thread waits 1.8 s on the rasteriser — one long task holding one frame
    const f0 = t; p.frame(t); t += 20; p.frameEnd(t); t += 1800;
    const late = { startTime: f0 - 1, duration: t - f0 + 1 };
    t += 10; p.reset();                    // the spec starts measuring…
    deliver([late]);                       // …and the frame before it is reported only now
    assert.equal(p.stalls().longTasks, 0, 'the frame before the reset is not a stall of this run');
    assert.equal(p.stalls().maxTaskMs, 0);
    // a task with no frame in it AFTER the reset is still caught
    t += 50; const s0 = t; t += 400; deliver([{ startTime: s0, duration: 400 }]);
    assert.equal(p.stalls().longTasks, 1); assert.equal(p.stalls().maxTaskMs, 400);
    // and a later frame's own long task is still recognised as a frame
    t += 30; const f1 = t; p.frame(t); t += 20; p.frameEnd(t); t += 900; deliver([{ startTime: f1 - 1, duration: t - f1 + 1 }]);
    assert.equal(p.stalls().longTasks, 1, 'a frame waiting on the GPU is not a stall');
  } finally { performance.now = realNow; globalThis.PerformanceObserver = RealPO; }
});
