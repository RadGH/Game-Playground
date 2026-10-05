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
  assert.equal(L.offhand.id, 'fh_heater_shield');
  // the server's compact form (protocol: info.gear {slot: {base, sub?, rarity}})
  const compact = { weapon: { base: 'staff', sub: 'staff', rarity: 'normal' }, chest: { base: 'heavy_chest', rarity: 'normal' }, offhand: { base: 'buckler', rarity: 'magic' } };
  const C = gearLook(compact, { baseOf: k => BASES[k] });
  assert.equal(C.held.id, 'staff_orb');
  assert.equal(C.offhand.id, 'fh_heater_shield', 'a buckler base is a shield (isShield from the base table)');
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
  const p = createPerf({ longMs: 100 });
  let t = performance.now();
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
