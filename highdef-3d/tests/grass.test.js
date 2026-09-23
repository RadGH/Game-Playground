// Grass placement.
//
// The rule this file exists for: A BLADE BELONGS TO THE GROUND, NOT TO THE CAMERA. The mesh is one
// patch of instances that follows you about, so the only thing keeping the field still while you
// walk through it is that an instance always draws a whole lattice square, and everything about the
// blade on that square is worked out from the square's own coordinates. Break either half — snap
// the centre to something finer than a square, or hand an instance its own random numbers — and the
// field re-shuffles itself under your feet every step, which is exactly what it used to do.
//
// Both halves are checked here, because neither is visible in a screenshot taken standing still.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const { generateWorldSync } = await import('../js/world.js');
const { createGrass } = await import('../js/grass.js');

const world = generateWorldSync({ size: 256, cell: 1, seed: 20260922 });
const quality = { grass: true, grassDistance: 24, grassDensity: 1 };
const grass = createGrass(world, quality, { csm: null });

/** Which lattice squares the patch is drawing, with its centre at (x, z) — the shader's own sum. */
function squaresAt(x, z) {
  grass.update({ x, y: 0, z });
  const o = grass.uniforms.uOrigin.value;
  const off = grass.mesh.geometry.getAttribute('aOffset').array;
  const cell = grass.cell;
  const out = new Set();
  for (let i = 0; i < grass.count; i++) {
    const u = (o.x + off[i * 2]) / cell, v = (o.z + off[i * 2 + 1]) / cell;
    assert.ok(Math.abs(u - Math.round(u)) < 0.01 && Math.abs(v - Math.round(v)) < 0.01,
      `a blade landed between squares at ${u}, ${v} — the centre is not snapped to the lattice`);
    out.add(`${Math.round(u)},${Math.round(v)}`);
  }
  return out;
}

test('a blade is a square of ground, not a random offset from the camera', () => {
  // Nothing per-instance but which square and which of that square's blades. If a random number
  // ever comes back as an attribute, the same ground grows a different blade every time a
  // different slot draws it — which is the crawl this layout exists to remove.
  const attrs = Object.keys(grass.mesh.geometry.attributes).filter(n => n.startsWith('a')).sort();
  assert.deepEqual(attrs, ['aOffset', 'aSlot']);
  const slot = grass.mesh.geometry.getAttribute('aSlot').array;
  const limits = new Set();
  for (let i = 0; i < grass.count; i++) {
    const k = slot[i * 2];
    assert.ok(Number.isInteger(k) && k >= 0 && k < 4, `a blade with slot ${k}`);
    limits.add(slot[i * 2 + 1].toFixed(3));
  }
  assert.ok(limits.size <= 4, `${limits.size} different draw distances — a slot is carrying data of its own`);
  assert.ok(grass.cell > 0.05 && grass.cell < 2, `an implausible lattice square: ${grass.cell} m`);
  const want = Math.PI * 24 * 24 * 62 * 0.25;
  assert.ok(Math.abs(grass.count - want) / want < 0.05, `${grass.count} blades for a wanted ${want}`);
});

test('the field is thick underfoot and thin in the distance', () => {
  // The old random layout put most of its blades near the middle. A plain lattice would not, and a
  // field that is the same everywhere reads as sparse right where you are standing.
  const off = grass.mesh.geometry.getAttribute('aOffset').array;
  const band = (lo, hi) => {
    let n = 0;
    for (let i = 0; i < grass.count; i++) {
      const d = Math.hypot(off[i * 2], off[i * 2 + 1]);
      if (d >= lo && d < hi) n++;
    }
    return n / (Math.PI * (hi * hi - lo * lo));   // blades per square metre
  };
  const near = band(0, 3), mid = band(10, 14), far = band(20, 24);
  assert.ok(near > mid * 1.5, `underfoot ${near.toFixed(1)} vs ${mid.toFixed(1)} blades/m² further out`);
  assert.ok(mid > far, `${mid.toFixed(1)} blades/m² at the middle distance, ${far.toFixed(1)} at the edge`);
  assert.ok(near > 30, `only ${near.toFixed(1)} blades a square metre underfoot`);
});

test('walking does not shuffle the field — the patch only ever gains and loses edge rows', () => {
  const c = grass.cell;
  const at = squaresAt(11.3, -4.7);
  for (const [dx, dz] of [[0.01, 0], [c * 0.3, c * 0.2], [-c * 0.45, c * 0.4], [0, -c * 0.49], [c * 1.5, -c * 2.5]]) {
    const then = squaresAt(11.3 + dx, -4.7 + dz);
    let kept = 0;
    for (const key of then) if (at.has(key)) kept++;
    // The centre snaps to whole squares, so a step of a metre or less can move the patch by one row
    // at most. Every square it still covers is a square it was already drawing — the same blade, on
    // the same ground. Anything less than this and the field is re-scattering as you walk.
    const step = Math.max(Math.abs(dx), Math.abs(dz));
    const floor = 1 - 0.04 * (Math.round(step / c) + 1);
    assert.ok(kept / then.size > floor,
      `stepping ${dx.toFixed(2)}, ${dz.toFixed(2)} m redrew ${(100 - kept / then.size * 100).toFixed(1)}% of the field`);
  }
});

test('walking a long way slides the same field past you', () => {
  const c = grass.cell;
  const a = squaresAt(0, 0);
  // one square east: every square still on screen must be one we were already drawing, shifted
  const b = squaresAt(c, 0);
  let kept = 0;
  for (const key of b) {
    const [i, j] = key.split(',').map(Number);
    if (a.has(`${i},${j}`)) kept++;
  }
  assert.ok(kept / b.size > 0.95, `only ${(kept / b.size * 100).toFixed(1)}% of the squares were held`);

  // and far enough away it is a fresh patch, not a scaled one
  const far = squaresAt(60, 60);
  let shared = 0;
  for (const key of far) if (a.has(key)) shared++;
  assert.equal(shared, 0, 'a patch 85 m away is still drawing the squares from the old one');
});
