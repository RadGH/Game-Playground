// Farhold round 28 — roads, in the game: a look at a road close up, side on and from further off.
//
// The node test (round28-roads.test.js) measures the drawn road against the ground. This takes the
// pictures a human checks it with (research/round28-roads/), and fails on a page error. Set
// FH_BASE (e.g. http://localhost:8478/) to shoot another checkout — that is how the "before"
// pictures in research/round28-roads/ were taken, from a worktree of the commit before round 28.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'prototypes/farhold/research/round28-roads/';
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.FH_BASE || '';
const TAG = process.env.FH_TAG || 'after';

test('a road on a side slope, close up and from 120 m: lying on the ground, with an edge', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/prototypes/farhold/?auto=1&quality=low&sound=off&seed=25392`.replace(/^\/\//, '/'));
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 150000 });

  // the steepest side slope on a road within 1.5 km of the start, off any bridge or town
  const spot = await page.evaluate(() => {
    const f = window.farhold, t = f.terrain;
    let best = null;
    for (const r of f.features.roads) {
      const p = r.points;
      for (let i = 1; i + 1 < p.length; i++) {
        const [x, z] = p[i];
        const d = Math.hypot(x - f.control.x, z - f.control.z);
        if (d > 1500 || d < 40) continue;
        if (t.bridgedAt?.(x, z) || t.underwater?.(x, z)) continue;
        if (f.features.settlements.some(s => Math.hypot(s.wx - x, s.wz - z) < 260)) continue;
        const dx = p[i + 1][0] - p[i - 1][0], dz = p[i + 1][1] - p[i - 1][1], l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l, off = r.half + 10;
        const side = Math.abs(t.heightAt(x + nx * off, z + nz * off) - t.heightAt(x - nx * off, z - nz * off));
        if (!best || side > best.side) best = { x, z, dx: dx / l, dz: dz / l, nx, nz, side, half: r.half, id: r.id };
      }
    }
    return best;
  });
  expect(spot, 'no road near the start').toBeTruthy();

  const shoot = async (name, back, sideways, pitch) => {
    await page.evaluate(({ s, back, sideways, pitch }) => {
      const f = window.farhold;
      const x = s.x - s.dx * back + s.nx * sideways, z = s.z - s.dz * back + s.nz * sideways;
      f.features.update(x, z, true);
      f.teleport(x, z);
      f.control.yaw = Math.atan2(s.x - x, s.z - z);
      f.control.pitch = pitch;
    }, { s: spot, back, sideways, pitch });
    await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
    await page.screenshot({ path: `${SHOTS}${TAG}-${name}.png` });
  };
  if (process.env.FH_NOSHADER) {
    await page.evaluate(() => {
      for (const m of [window.farhold.features.roadMesh.material, window.farhold.features.streetMesh.material]) {
        if (!m.defines?.FH_PULL_K) continue;
        m.defines.FH_PULL_K = '0.0'; m.defines.FH_SKIRT_K = '0.0'; m.needsUpdate = true;
      }
    });
  }
  // stand on the DOWNHILL side, so the side shot looks up across the road at the bank it is cut into
  const t = await page.evaluate(s => {
    const T = window.farhold.terrain, o = s.half + 10;
    return T.heightAt(s.x + s.nx * o, s.z + s.nz * o) < T.heightAt(s.x - s.nx * o, s.z - s.nz * o) ? 1 : -1;
  }, spot);
  await shoot('along', 14, t * (spot.half + 3), -0.18);
  // from the UPHILL side, looking down across the road at its downhill edge: from below, the road
  // is behind the crest of its own embankment and the picture shows only grass
  await shoot('side', 0, -t * (spot.half + 10), -0.42);
  await shoot('mid', 60, t * 20, -0.1);
  await shoot('far', 120, t * 40, -0.12);

  // R28: the map strokes the roads that are on the ground (terrain.roadPaths), switchbacks and all
  await page.evaluate(() => { window.farhold.map.toggle(true); });
  for (const z of [1, 4.2, 11]) {
    await page.evaluate(z => window.farhold.map.setZoom(z), z);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}${TAG}-map-z${z}.png` });
  }
  await page.evaluate(() => { window.farhold.map.toggle(false); });
  expect(errors).toEqual([]);
});
