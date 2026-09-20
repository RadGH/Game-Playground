// §1.4 — "density should radiate out from the player position to avoid pop-in."
//
// The instance cap and the nearest-cell-first scan (round 11) stopped trees SHIFTING when you
// crossed a chunk boundary. What was left is the outer edge: the ring of cells the radius has just
// reached arrives all at once, as a wall of trees appearing together.
//
// The rule that makes the fix safe rather than just different: a thinned cell must be a SUBSET of
// the dense one. Every tree standing there at arm's length was already standing there at the
// horizon, so walking towards a wood adds trees BETWEEN the ones you could already see.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Where every tree-ish instance is right now, rounded so two runs can be compared. */
const SAMPLE = () => {
  const f = window.farhold;
  const out = new Set();
  const m = new (window.__THREE.Matrix4)();
  const v = new (window.__THREE.Vector3)();
  for (const [name, o] of Object.entries(f.props.meshes)) {
    if (!o?.isInstancedMesh || name === 'grass') continue;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      out.add(`${name}|${Math.round(v.x * 10)},${Math.round(v.z * 10)}`);
    }
  }
  return out;
};

test('the far edge is thinner than the ground at your feet, and thinning never moves a tree', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async sampleSrc => {
    const THREE = await import('three');
    window.__THREE = THREE;
    const sample = eval('(' + sampleSrc + ')');
    const f = window.farhold;

    /**
     * Somewhere with a real wood on it, at a density worth measuring.
     *
     * The page runs at `quality=low`, which is 0.45 density over a four-cell radius — a patch with
     * four trees on it cannot show a falloff of any kind. The knob is turned up for the test
     * because what is under test is the SHAPE of the thinning, not the setting.
     */
    const t = f.terrain;
    f.props.setDensity(4, f.control.x, f.control.z);
    let spot = null, best = -1;
    for (let r = 0; r <= 1600; r += 80) for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (!t.plantable(x, z) || t.slopeAt(x, z, 4) > 0.3) continue;
      // `kitAt` is not exposed, so judge the ground by what the biome table calls it
      const b = t.biomeAt(x, z);
      const score = /forest|rainforest|taiga|jungle|woods/i.test(b.name || b.key || '') ? 3
        : /grass|savanna|shrub/i.test(b.name || b.key || '') ? 1 : 0;
      if (score > best) { best = score; spot = { x, z }; }
      if (best >= 3) break;
    }
    f.teleport(spot.x, spot.z);
    await new Promise(r => setTimeout(r, 1200));

    /**
     * THE SAME PATCH OF GROUND, LOOKED AT FROM TWO DISTANCES.
     *
     * Comparing a near band against a far band across the whole view does not work: what grows
     * where is decided by the biome, so one band can sit over a lake and the other over a forest
     * and the numbers say nothing about the falloff. Counting ONE patch twice — once with the
     * player beside it and once with it out near the rim — isolates the thing under test, because
     * the ground is identical in both readings.
     */
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    const CELL = 64;
    const radius = f.props.radius;
    const edge = radius * CELL;
    const patch = { x: spot.x, z: spot.z };

    const countAt = (px, pz) => {
      const set = new Set();
      for (const [name, o] of Object.entries(f.props.meshes)) {
        if (!o?.isInstancedMesh || name === 'grass') continue;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          v.setFromMatrixPosition(m);
          if (Math.hypot(v.x - px, v.z - pz) > CELL * 1.2) continue;
          set.add(`${name}|${Math.round(v.x * 10)},${Math.round(v.z * 10)}`);
        }
      }
      return set;
    };

    // standing on it
    const close = countAt(patch.x, patch.z);
    // …and again with the patch out near the rim, where `thinAt` is at its lowest
    f.teleport(patch.x - edge * 0.92, patch.z);
    await new Promise(r => setTimeout(r, 1100));
    const far = countAt(patch.x, patch.z);

    // the subset rule: everything visible from far away must still be there up close
    let orphans = 0;
    for (const k of far) if (!close.has(k)) orphans++;

    // …and walking away and back must not reshuffle anything
    f.teleport(patch.x, patch.z);
    await new Promise(r => setTimeout(r, 1100));
    const again = countAt(patch.x, patch.z);
    let lost = 0;
    for (const k of close) if (!again.has(k)) lost++;

    const orphanKinds = {};
    for (const k of far) if (!close.has(k)) { const n = k.split('|')[0]; orphanKinds[n] = (orphanKinds[n] || 0) + 1; }
    return {
      closeCount: close.size, farCount: far.size,
      orphans, lost, edge, orphanKinds,
      closeKinds: [...close].reduce((o, k) => { const n = k.split('|')[0]; o[n] = (o[n]||0)+1; return o; }, {}),
    };
  }, SAMPLE.toString());

  expect(out.closeCount, 'nothing is growing on the patch at all').toBeGreaterThan(6);

  // THE ASK: the same ground carries fewer when it is out at the rim
  expect(out.farCount, 'the rim is as dense as the ground at your feet — nothing is radiating')
    .toBeLessThan(out.closeCount);
  // …but it is a fade, not a wall: something is still standing out there
  expect(out.farCount, 'the rim is completely empty, which is a wall not a fade').toBeGreaterThan(0);

  /**
   * THE SUBSET RULE, which is what makes the thinning safe rather than merely different.
   *
   * Everything you could see from the rim must still be standing in the same place when you walk up
   * to it — approaching a wood adds trees BETWEEN the ones you could already make out. If thinning
   * picked a different scatter instead of a shorter prefix of the same one, the whole wood would
   * rearrange itself every time you changed your mind about which way to go.
   */
  expect(out.orphans, `${out.orphans} props were visible from the rim and gone up close: ${JSON.stringify(out.orphanKinds)} of ${JSON.stringify(out.closeKinds)}`).toBe(0);
  expect(out.lost, `${out.lost} props moved when the player walked away and back`).toBe(0);
  expect(errors).toEqual([]);
});
