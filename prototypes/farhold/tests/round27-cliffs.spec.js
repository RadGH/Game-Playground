// Farhold round 27, M7 — cliffs are rock, and roads are faster, in the real game.
//
// The node test (round27-cliffs.test.js) measures the rules on the real modules. This spec looks at
// them on the user's own world — a cliff from its foot (the scree) and from the far rings (the rock
// band), the highest peak (snow) — and walks the real player into a face on the real keys.
//
//   seed 25392, Kydsel IV, Super tiny planet (scale 0.1)

import { test, expect } from '@playwright/test';

const SHOTS = 'prototypes/farhold/research/round27-cliffs/';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=25392&scale=0.1&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand at (sx, sz) looking at (x, z), and let the props, features and rings rebuild. */
async function stand(page, sx, sz, x, z, pitch = -0.15) {
  await page.evaluate(async ({ sx, sz, x, z, pitch }) => {
    const f = window.farhold;
    f.teleport(sx, sz);
    f.control.yaw = Math.atan2(x - sx, z - sz);
    f.control.pitch = pitch;
    f.features?.update?.(sx, sz, true);
    await new Promise(r => setTimeout(r, 1200));
  }, { sx, sz, x, z, pitch });
}

test('R27 M7 — a cliff from its foot and from afar, the snow on the peak, and a walk into the face', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await land(page);
  // the nearest real face to where we landed: past 63 degrees, off roads, with 5 m+ of it above a dry foot
  const face = await page.evaluate(() => {
    const f = window.farhold, t = f.terrain, G = Math.tan(63 * Math.PI / 180);
    const x0 = f.control.x, z0 = f.control.z;
    let best = null;
    for (let r = 40; r < 3000 && !best; r += 20) {
      for (let a = 0; a < 64 && !best; a++) {
        const x = x0 + Math.cos(a / 64 * Math.PI * 2) * r, z = z0 + Math.sin(a / 64 * Math.PI * 2) * r;
        if (t.underwater(x, z) || t.slopeAt(x, z, 1) < G || t.roadAt(x, z) > 0.2) continue;
        const n = t.normalAt(x, z, 1), l = Math.hypot(n[0], n[2]);
        const ux = -n[0] / l, uz = -n[2] / l;
        const fx = x - ux * 5, fz = z - uz * 5;
        if (t.underwater(fx, fz) || t.slopeAt(fx, fz, 1) >= G) continue;
        let lip = -Infinity;
        for (let d = 0; d <= 12; d += 0.5) lip = Math.max(lip, t.heightAt(x + ux * d, z + uz * d));
        if (lip - t.heightAt(fx, fz) < 5) continue;
        best = { x, z, ux, uz, fx, fz, lip, foot: t.heightAt(fx, fz) };
      }
    }
    return best;
  });
  expect(face, 'no cliff face near the landing').toBeTruthy();

  // the foot: rubble fanned out below the face
  await stand(page, face.x - face.ux * 22 + face.uz * 6, face.z - face.uz * 22 - face.ux * 6, face.x, face.z, -0.05);
  await page.screenshot({ path: SHOTS + 'cliff-foot.png' });
  // …and from across the fan, looking along the foot of the face
  await stand(page, face.x - face.ux * 14 - face.uz * 16, face.z - face.uz * 14 + face.ux * 16, face.x - face.ux * 6, face.z - face.uz * 6, -0.3);
  await page.screenshot({ path: SHOTS + 'scree-along-the-foot.png' });
  const scree = await page.evaluate(() => window.farhold.props?.stats?.()?.scree ?? null);
  expect(scree).toBeGreaterThan(0);

  // from the far rings: the face still reads as rock
  // a tall face away from any town, and a spot 150-300 m off with a clear view of it
  const far = await page.evaluate(() => {
    const f = window.farhold, t = f.terrain, G = Math.tan(63 * Math.PI / 180), M = t.metresPerCell;
    const towns = (t.world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port').map(n => [n.x * M, n.y * M]);
    const clear = (ax, az, ay, bx, bz, by) => {
      for (let k = 1; k < 40; k++) {
        const u = k / 40, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
        if (t.heightAt(x, z) > ay + (by - ay) * u) return false;
      }
      return true;
    };
    for (let r = 100; r < 6000; r += 40) for (let a = 0; a < 48; a++) {
      const x = f.control.x + Math.cos(a / 48 * Math.PI * 2) * r, z = f.control.z + Math.sin(a / 48 * Math.PI * 2) * r;
      if (t.underwater(x, z) || t.slopeAt(x, z, 1) < G || t.roadAt(x, z) > 0.2) continue;
      if (towns.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 500)) continue;
      const n = t.normalAt(x, z, 1), l = Math.hypot(n[0], n[2]);
      const ux = -n[0] / l, uz = -n[2] / l;
      let lip = -Infinity;
      for (let d = 0; d <= 12; d += 0.5) lip = Math.max(lip, t.heightAt(x + ux * d, z + uz * d));
      if (lip - t.heightAt(x - ux * 5, z - uz * 5) < 10) continue;
      for (const d of [200, 250, 160, 300]) for (const b of [0, 0.4, -0.4, 0.8, -0.8]) {
        const c = Math.cos(b), s = Math.sin(b);
        const sx = x - (ux * c - uz * s) * d, sz = z - (ux * s + uz * c) * d;
        if (t.underwater(sx, sz) || t.waterAt(sx, sz)) continue;
        if (towns.some(([tx, tz]) => Math.hypot(tx - sx, tz - sz) < 400)) continue;
        if (clear(sx, sz, t.heightAt(sx, sz) + 2.5, x, z, t.heightAt(x, z) + 1)) return { x, z, sx, sz };
      }
    }
    return null;
  });
  expect(far, 'no tall face with a clear view of it').toBeTruthy();
  await stand(page, far.sx, far.sz, far.x, far.z, 0.0);
  await page.screenshot({ path: SHOTS + 'cliff-far.png' });

  // the highest ground on the map, from a little way off: snow now reaches it
  const peak = await page.evaluate(() => {
    const t = window.farhold.terrain;
    let p = null;
    for (let j = 0; j < 120; j++) for (let i = 0; i < 240; i++) {
      const x = (i + 0.5) / 240 * t.widthM, z = (j + 0.5) / 120 * t.depthM, h = t.heightAt(x, z);
      if (!p || h > p.h) p = { x, z, h };
    }
    return p;
  });
  await stand(page, peak.x - 160, peak.z - 60, peak.x, peak.z, 0.02);
  await page.screenshot({ path: SHOTS + 'snowy-peak.png' });

  // walk into the face on the real keys for two and a half seconds: it does not go up
  await stand(page, face.fx, face.fz, face.x + face.ux * 10, face.z + face.uz * 10, -0.1);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ y: window.farhold.control.y, pinned: window.farhold.control.cliffPinned || 0 }));
  await page.screenshot({ path: SHOTS + 'pushing-at-the-face.png' });
  await page.keyboard.up('KeyW');
  expect(after.y, `walked up the face: ${after.y.toFixed(1)} against a lip at ${face.lip.toFixed(1)}`).toBeLessThan(face.lip - 1);
  expect(after.pinned).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
