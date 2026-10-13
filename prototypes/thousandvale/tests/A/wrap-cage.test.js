// Report #59: "The 'caged scout' quest did not involve a cage at all."
// The rescue record says what holds the captive (`held: 'cage'`), the server puts it in the captive's info with the spot
// it stands on, and marks it open once they are freed (js/client/held-view.js draws it).
// Run: node --test prototypes/thousandvale/tests/A/wrap-cage.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

const at = p => fileURLToPath(new URL('../../' + p, import.meta.url));
const ROAD = JSON.parse(readFileSync(at('data/provinces/road-events.json'), 'utf8'));

test('#59: a rescue whose words promise a cage has one, and no rescue has a holder the client cannot draw', () => {
  const drawn = /kind !== 'cage'/.test(readFileSync(at('js/client/held-view.js'), 'utf8')) ? ['cage'] : [];
  for (const r of ROAD.rescue) {
    const words = [r.title, r.text, r.say, r.info.what, r.info.objective.text, r.info.onSuccess, r.info.onFail].join(' ');
    if (/\bcage/i.test(words)) assert.equal(r.held, 'cage', `${r.id} talks about a cage: it must have one`);
    if (r.held) assert.ok(drawn.includes(r.held), `${r.id}: held "${r.held}" has no model`);
  }
  assert.equal(ROAD.rescue.find(r => r.id === 'caged_scout').held, 'cage');
});

test("#59's siblings: every road-event chest look is dressed as what it is called, or is honestly a box", () => {
  const src = readFileSync(at('js/client/objects.js'), 'utf8');
  const block = src.slice(src.indexOf('export const CHEST_LOOKS = {'), src.indexOf('const dressMats'));
  const dressed = [...block.matchAll(/^  (\w+): \{/gm)].map(m => m[1]);
  const BOXES = ['chest_iron', 'chest_small'];                    // an iron-bound chest and an offering box ARE boxes
  assert.ok(dressed.length >= 4, 'the table was found: ' + dressed);
  for (const c of ROAD.chests) assert.ok(dressed.includes(c.look) || BOXES.includes(c.look), `${c.id}: look "${c.look}" is drawn as a plain crate`);
  assert.match(src, /o\.type === 'chest' && o\.look\) chestDress\(/, 'and the chest model asks the table');
  // the saddlebags no longer promise a dead mule nothing draws
  const mule = ROAD.chests.find(c => c.id === 'fallen_pack_mule');
  assert.ok(!/lies dead|ate the mule/i.test([mule.name, mule.blurb, mule.info.what, mule.info.objective.text].join(' ')));
});

test('#59: the caged scout is sent with a cage where they sit, and the cage is open once they are freed', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Keyfinder', 'warrior');
  const pv = world.P.values().next().value, L = pv.L, t0 = L.towns[0];
  const camp = L.camps.filter(c => c.type && !c.encounter && (c.level || 1) <= 4 && !L.towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 40) + 120))
    .sort((p, q) => Math.hypot(p.x - t0.x, p.z - t0.z) - Math.hypot(q.x - t0.x, q.z - t0.z))[0];
  const o = rec(world, a);
  world.transfer(o, pv.copies[0], { x: camp.x + 60, z: camp.z + 60 }, 'test'); await run(clock, 400);
  o.roadNextAt = Infinity;
  let caged = null, plain = null;
  for (let k = 0; k < 60 && !(caged && plain); k++) {
    const ev = world.roadEvents.spawnFor(o, 'rescue');
    if (!ev) continue;
    if (ev.spec.id === 'caged_scout') caged ||= ev; else plain ||= ev;
  }
  assert.ok(caged, 'a caged scout came up');
  const info = caged.npc.info();
  assert.equal(info.held.kind, 'cage');
  assert.ok(Math.hypot(info.held.x - caged.npc.x, info.held.z - caged.npc.z) < 0.02, 'the cage stands where the captive sits');
  assert.ok(!info.held.open, 'shut while the guards stand');
  caged.npc.infoJSON();                                          // (prime the cache a crowd is served from)
  if (plain) assert.equal(plain.npc.info().held, undefined, `${plain.spec.id} is tied, not caged`);
  // take the job, drop the guards, open the cage
  const got = []; a.on('used', m => got.push(m));
  o.entity.moveTo(caged.npc.x + 1.5, caged.npc.z, undefined, true); await run(clock, 300);
  a.use(caged.npc.id); await run(clock, 300);
  const q = got.find(m => m.offers).offers[0];
  a.quest('accept', q.id, caged.npc.id); await run(clock, 300);
  for (const m of caged.guards) if (!m.removed) caged.room.remove(m);
  a.use(caged.npc.id); await run(clock, 300);
  assert.ok(caged.freed, 'freed');
  assert.equal(caged.npc.info().held.open, true, 'someone who arrives now sees the door open');
  assert.equal(JSON.parse(caged.npc.infoJSON()).held.open, true, 'and the cached description everyone is sent says so too');
  a.close(); await srv.stop();
});

test('#59: the door opens when the captive is out of the cage, and the cage is a cage-sized thing', { skip: !existsSync(at('../../avatar-3d/tests/three-register.mjs')) && 'the playground three loader is not here' }, () => {
  const code = `
    import * as THREE from 'three';
    import { cageGeometry, shouldOpen, createHeld, CAGE } from ${JSON.stringify(at('js/client/held-view.js'))};
    const { cage, door } = cageGeometry(); cage.computeBoundingBox(); door.computeBoundingBox();
    const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
    const scene = new THREE.Scene(), H = createHeld(scene, {});
    const held = { kind: 'cage', x: 10, z: 20 }; let pos = { x: 10, z: 20 };
    H.set(5, held); H.update(0.5, () => pos); const shut = H.items.get(5).leaf.rotation.y;
    pos = { x: 13, z: 20 }; for (let i = 0; i < 60; i++) H.update(0.05, () => pos); const open = H.items.get(5).leaf.rotation.y;
    pos = { x: 10, z: 20 }; for (let i = 0; i < 60; i++) H.update(0.05, () => pos); const stays = H.items.get(5).leaf.rotation.y;
    H.set(6, { kind: 'cage', x: 0, z: 0, open: true }); const late = H.items.get(6).open;
    H.set(7, { kind: 'rope', x: 0, z: 0 }); const unknown = H.items.has(7);
    H.set(8, held); H.release(8); for (let i = 0; i < 60; i++) H.update(0.05, () => ({ x: 10, z: 20 })); const released = H.items.get(8).leaf.rotation.y;
    H.remove(5); H.clear();
    console.log(JSON.stringify({ tris: tris(cage) + tris(door), h: cage.boundingBox.max.y, w: cage.boundingBox.max.x - cage.boundingBox.min.x, minY: cage.boundingBox.min.y, doorW: door.boundingBox.max.x - door.boundingBox.min.x,
      a: shouldOpen(held, { x: 10.5, z: 20 }), b: shouldOpen(held, { x: 12, z: 20 }), c: shouldOpen({ ...held, open: true }, { x: 10, z: 20 }), d: shouldOpen(held, null), e: shouldOpen(null, null),
      shut, open, stays, late, unknown, released, left: H.items.size, kids: scene.children.length, openAngle: CAGE.openAngle }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--import', at('../../avatar-3d/tests/three-register.mjs'), '--input-type=module', '-e', code], { encoding: 'utf8' }));
  assert.ok(out.tris > 300 && out.tris < 2500, `triangles ${out.tris}`);
  assert.ok(out.h > 2 && out.h < 2.6 && out.w > 2 && out.w < 2.4 && Math.abs(out.minY) < 0.01, 'a person fits in it and it stands on the ground');
  assert.ok(out.doorW > 1.5, 'the door is a whole wall');
  assert.deepEqual([out.a, out.b, out.c, out.d, out.e], [false, true, true, false, false]);
  assert.equal(Math.abs(out.shut), 0, 'shut while the captive is inside');
  assert.ok(Math.abs(out.open + out.openAngle) < 1e-6, 'swings right open when they walk out');
  assert.equal(out.stays, out.open, 'and does not shut again if they walk back past it');
  assert.equal(out.late, 1, 'a late arrival sees it already open');
  assert.equal(out.unknown, false);
  assert.ok(Math.abs(out.released + out.openAngle) < 1e-6, 'opens when the captive gets up, before they have moved');
  assert.equal(out.left, 0); assert.equal(out.kids, 0);
});
