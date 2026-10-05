// Play-test 1, P28 (stream A): "the green bog slimes at the well and crate: I can't click them, they clip into the
// ground, they attack me but I can't hurt them". Server side: the Old Pump House's slimes must stand clear of the
// vignette's props (they spawned inside the well and the barrel), be real monsters in the combat core (team 2, a
// unit, hp), and take damage from a level-2 character's attacks. (Sinking = P9's stale mirror y, pt1-ground.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, realContent, joinReal, rec, run } from './pt1-helpers.js';
import { vignetteContent } from '../../js/sim/vignettes.js';

/** The Old Pump House recipe placed on open ground near the gate of the real province (E's placements follow B's
 *  bakes and may be mid-refresh, so the test places it itself — same recipe, same code path). */
async function pumpHouseCamps() {
  const C = await realContent();
  const L = C.layouts[0], T = L.terrain;
  const recipes = JSON.parse(readFileSync(new URL('../../data/vignettes/m2b.json', import.meta.url), 'utf8')).vignettes;
  let at = null;
  for (let r = 40; r < 400 && !at; r += 10) for (let k = 0; k < 12 && !at; k++) {
    const x = L.gate.x + Math.cos(k / 12 * 6.283) * r, z = L.gate.z + Math.sin(k / 12 * 6.283) * r;
    let ok = true; for (let dx = -8; dx <= 8 && ok; dx += 4) for (let dz = -8; dz <= 8 && ok; dz += 4) ok = T.walkable(x + dx, z + dz) && T.waterAt(x + dx, z + dz).depth === 0;
    if (ok && !L.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + 20)) at = { x, z };
  }
  return vignetteContent([{ id: 'pump_house', x: at.x, z: at.z, yaw: 0.7 }], recipes, { band: [4, 9] }).camps;
}

test('P28: pump-house slimes stand clear of the props and take damage from a level-2 character', async () => {
  const { srv, clock, world } = await realServer({ camps: await pumpHouseCamps() });
  const r = world.copies[0];
  const camps = r.camps.filter(c => c.vignette === 'pump_house');
  assert.ok(camps.length >= 1, 'the Old Pump House is placed');
  assert.ok(camps.every(c => c.avoid && c.avoid.some(q => q.r >= 1.5)), 'the camp knows the well/wall footprints');
  const a = await joinReal(srv, clock, 'Slimebane', 'warrior');
  let o = rec(world, a);
  const camp = camps[0];
  world.transfer(o, r, { x: camp.x + 9, z: camp.z }, 'test');
  await run(clock, 1500);                                         // the dormant camp wakes and spawns
  o = rec(world, a);
  const slimes = [...r.entities.values()].filter(e => e.type === 'bog_slime' && Math.hypot(e.x - camp.x, e.z - camp.z) < (camp.radius || 5) + 1);
  assert.ok(slimes.length >= 1, 'slimes spawned');
  for (const s of slimes) {
    for (const q of camp.avoid) assert.ok(Math.hypot(s.x - q.x, s.z - q.z) >= q.r + 0.5 - 1e-9, `slime ${s.id} is not inside a prop`);
    assert.equal(s.team, 2); assert.ok(s.r && s.r.unit, 'a unit in the combat core'); assert.ok(s.hpMax > 1);
    assert.ok(Math.abs(s.y - r.groundAt(s.x, s.z)) < 1e-6, 'standing on the ground');
  }
  const s0 = slimes[0];
  o.entity.r.unit.hp = o.entity.r.unit.maxHp;
  world.transfer(o, r, { x: s0.x + 1.2, z: s0.z }, 'test');
  o = rec(world, a);
  const evs = []; a.on('ev', m => evs.push(...m.e));
  const hp0 = s0.hp;
  for (let i = 0; i < 12 && !s0.dead && !o.entity.dead; i++) { a.cast({ slot: 0, target: s0.id }); await run(clock, 300); }
  const hits = evs.filter(e => e.type === 'hit' && e.d === s0.id && e.n > 0);
  assert.ok(hits.length >= 2, 'hits land: ' + JSON.stringify(evs.filter(e => e.d === s0.id).slice(0, 5)));
  assert.ok(s0.hp < hp0 || s0.dead, 'the slime lost health');
  assert.equal(r.stats.rulesErrors, 0);
  a.close(); await srv.stop();
});
