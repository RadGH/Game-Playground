// Play-test 4 follow-up (stream A, for B's town walls): the movement step refuses to cross a wall or a house (B's nav
// SOLID / BUILDING), sampled along the step so a mount cannot hop one; every gate of every walled settlement is passable;
// a body already standing on a blocked cell is never trapped. Same function on client and server (js/sim/movement.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realContent } from './pt1-helpers.js';
import { stepMove, navCrosses } from '../../js/sim/movement.js';
import { NAV } from '../../js/rules/terrain-read.js';

const C = await realContent();
const T = C.layouts[0].terrain;
const walls = [];
for (const z of T.zones) {
  const pl = JSON.parse(readFileSync(new URL(`../../data/zones/${z.key}/placements.json`, import.meta.url), 'utf8'));
  for (const p of pl.placements || []) if (p.kind === 'town_wall' && p.data && p.data.solid !== false) walls.push({ zone: z.key, ox: z.bounds.minX, oz: z.bounds.minZ, ...p });
}
/** Walk from a to b in 50 ms inputs at speedMul; returns the end state. */
function walk(a, b, speedMul = 1, maxSteps = 400) {
  const st = { x: a.x, y: T.heightAt(a.x, a.z), z: a.z, vy: 0, airborne: false, speedMul, crossed: 0 };
  for (let i = 0; i < maxSteps; i++) {
    const dx = b.x - st.x, dz = b.z - st.z, d = Math.hypot(dx, dz);
    if (d < 0.3) break;
    const px = st.x, pz = st.z;
    stepMove(st, { mx: dx / d, mz: dz / d, b: 0 }, 50, T);
    if (navCrosses(T, px, pz, st.x, st.z)) st.crossed++;          // a single step through a blocked cell
  }
  return st;
}

test('walls: the province terrain exposes nav bits; walled settlements exist', () => {
  assert.equal(typeof T.nav.at, 'function');
  assert.ok(walls.length >= 10, 'walled settlements: ' + walls.length);
});

test('walls: walking straight into a wall run stops you outside it (on foot and mounted)', () => {
  let tried = 0, stopped = 0;
  for (const w of walls) {
    const cx = w.x + w.ox, cz = w.z + w.oz;
    for (const run of w.data.runs || []) {
      const p = run[Math.floor(run.length / 2)];
      const px = p[0] + w.ox, pz = p[1] + w.oz;
      if (!(T.nav.at(px, pz) & (NAV.SOLID | NAV.BUILDING))) continue;
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz) || 1;
      const out = { x: px + dx / d * 6, z: pz + dz / d * 6 }, inn = { x: px - dx / d * 6, z: pz - dz / d * 6 };
      if (T.nav.at(out.x, out.z) & (NAV.SOLID | NAV.BUILDING)) continue;
      if (T.moveAt && T.moveAt(out.x, out.z) !== 'walk') continue;
      for (const mul of [1, 2.2]) {
        const st = walk(out, inn, mul);
        // sliding along the wall may lead round to a nearby gate; what must never happen is a step THROUGH a blocked cell
        assert.equal(st.crossed, 0, `${w.id}: a step crossed the wall at ${px.toFixed(1)},${pz.toFixed(1)} (x${mul})`);
        if (Math.hypot(st.x - inn.x, st.z - inn.z) > 2) stopped++;          // (sliding round a run's end to a gap is allowed)
        assert.ok(!(T.nav.at(st.x, st.z) & (NAV.SOLID | NAV.BUILDING)), w.id + ': ended inside the wall');
      }
      tried++;
    }
  }
  assert.ok(tried >= 10, 'wall runs tried: ' + tried);
  assert.ok(stopped >= tried * 2 * 0.8, `most runs stop you: ${stopped}/${tried * 2}`);
});

test('walls: every gate of every walled settlement can be walked through, both ways', () => {
  const bad = [];
  let n = 0;
  for (const w of walls) for (const g of w.data.gates || []) {
    const gx = g.x + w.ox, gz = g.z + w.oz, [ox, oz] = g.out || [0, 0];
    const out = { x: gx + ox * 7, z: gz + oz * 7 }, inn = { x: gx - ox * 7, z: gz - oz * 7 };
    if (!T.walkable(out.x, out.z) || !T.walkable(inn.x, inn.z)) continue;
    if (T.moveAt && (T.moveAt(out.x, out.z) === 'swim' || T.moveAt(inn.x, inn.z) === 'swim')) continue;
    if (T.nav.at(out.x, out.z) & (NAV.SOLID | NAV.BUILDING) || T.nav.at(inn.x, inn.z) & (NAV.SOLID | NAV.BUILDING)) continue;   // a house right at the gate: B's layout, not movement
    n++;
    const a = walk(out, inn), b = walk(inn, out);
    if (Math.hypot(a.x - inn.x, a.z - inn.z) > 1) bad.push(g.id + ' in');
    if (Math.hypot(b.x - out.x, b.z - out.z) > 1) bad.push(g.id + ' out');
  }
  assert.ok(n >= 20, 'gates tried: ' + n);
  assert.deepEqual(bad, [], 'gates you cannot walk through');
});

test('walls: a body standing on a blocked cell is never trapped; no nav = old behaviour', () => {
  const w = walls[0], run = w.data.runs[0], p = run[Math.floor(run.length / 2)];
  const st = { x: p[0] + w.ox, y: 0, z: p[1] + w.oz, vy: 0, airborne: false };
  const x0 = st.x, z0 = st.z;
  for (let i = 0; i < 20; i++) stepMove(st, { mx: 1, mz: 0, b: 0 }, 50, T);
  assert.ok(Math.hypot(st.x - x0, st.z - z0) > 0.5 || !T.walkable(x0 + 2, z0), 'can walk off the wall');
  const flat = { heightAt: () => 0 };
  const s2 = { x: 0, y: 0, z: 0, vy: 0, airborne: false };
  stepMove(s2, { mx: 1, mz: 0, b: 0 }, 100, flat);
  assert.ok(s2.x > 0.5);
});
