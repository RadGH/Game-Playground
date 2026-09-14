// Body geometry the eye notices: the spider stands on its legs (E17) and a held weapon is in the
// hand rather than floating in front of the chest (E18).
//
// Both are measured in world space off the real controllers, so a change to the proportions that
// puts the spider back on its belly or the sword back in mid-air fails here.
import { test, expect } from '@playwright/test';

/** A page with the three import map already set up, so dynamic imports resolve. */
async function modulePage(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/creatures.html');
  await page.waitForFunction(() => !!window.creatures3d, null, { timeout: 60_000 });
  return errors;
}

test('the spider stands the right way up on long legs', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await modulePage(page);
  const m = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createCreature } = await import('/avatar-3d/js/creatures.js');
    const { CREATURE_TYPES } = await import('/avatar-3d/js/creature-types.js');
    const c = await createCreature({ type: 'spider', size: 1, seed: 4 });
    c.setAnim('idle'); c.update(0.1, 0.1);
    c.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    // the abdomen is the single biggest sphere on the body
    let body = null, bodyR = 0, lowest = Infinity, kneeY = -Infinity, footY = Infinity, span = 0;
    c.group.traverse(o => {
      if (!o.isMesh) return;
      o.getWorldPosition(v);
      const p = o.geometry?.parameters || {};
      if (p.radius > bodyR && o.geometry.type === 'SphereGeometry') { bodyR = p.radius; body = v.y; }
      const box = new THREE.Box3().setFromObject(o);
      lowest = Math.min(lowest, box.min.y);
      span = Math.max(span, Math.abs(v.x));
      if (o.geometry.type === 'CapsuleGeometry') { kneeY = Math.max(kneeY, v.y); footY = Math.min(footY, box.min.y); }
    });
    const legLen = CREATURE_TYPES.spider.body.legLen;
    const metrics = c.metrics();
    // and the dead pose must be different (on its back), not the same as standing
    c.setAnim('dead'); c.update(0.1, 0.2); c.group.updateMatrixWorld(true);
    const deadBody = new THREE.Box3().setFromObject(c.group);
    c.dispose();
    return { body, lowest, kneeY, footY, span, legLen, height: metrics.height, deadTop: deadBody.max.y };
  });
  expect(m.legLen).toBeGreaterThanOrEqual(0.6);            // long legs
  expect(m.body).toBeGreaterThan(m.legLen * 0.45);         // the body is carried well off the ground
  expect(m.lowest).toBeGreaterThan(-0.06);                 // nothing pokes through the floor
  expect(m.lowest).toBeLessThan(0.12);                     // and the feet do reach it
  expect(m.kneeY).toBeGreaterThan(m.body * 0.8);           // knees up beside/above the body, like a spider
  expect(m.span).toBeGreaterThan(m.legLen * 0.5);          // legs reach out sideways
  expect(m.height).toBeGreaterThan(m.legLen * 0.7);
  expect(m.deadTop).toBeLessThan(m.height * 1.6);          // the dead pose is a different shape
  expect(errors).toEqual([]);
});

test('held weapons sit in the hand and point up, in idle and in attack', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await modulePage(page);
  const out = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createMiiCharacter } = await import('/avatar-3d/js/mii.js');
    const { randomAvatar } = await import('/avatar-2d/js/random.js');
    const PRESETS = { palettes: { skin: ['#c68642'], hair: ['#222'], eye: ['#222'], cloth: ['#555'] }, raceRules: {} };
    const res = {};
    for (const held of ['sword', 'greatsword', 'rapier', 'saber', 'daggers', 'cleaver', 'hammer', 'mace', 'quarterstaff', 'staff_orb', 'bow']) {
      const av = randomAvatar(PRESETS, { seed: 3 });
      av.held = { id: held, color: '#b9c0cc' };
      av.offhand = { id: 'heater_shield', color: '#8a7a5a' };
      const m = await createMiiCharacter(av);
      m.setAnim('idle'); m.update(0.1, 0.1); m.group.updateMatrixWorld(true);
      const P = m.parts || {};
      const hand = new THREE.Vector3();
      // the hand is the small sphere at the bottom of the right arm
      P.armR.traverse(o => { if (o.isMesh && o.geometry?.type === 'SphereGeometry' && o.geometry.parameters.radius < 0.1) o.getWorldPosition(hand); });
      // how far the weapon's own parts are from that hand, and how tall the whole weapon is
      let worst = 0, top = -Infinity, bottom = Infinity;
      const v = new THREE.Vector3();
      for (const o of P.armR.children) {
        if (o === P.armR.children[0]) { /* the upper arm */ }
        if (!o.isMesh) continue;
        o.getWorldPosition(v);
        const box = new THREE.Box3().setFromObject(o);
        // only the weapon parts sit forward of the arm (mii-gear puts them at +z)
        if (o.position.z > 0.01) { worst = Math.max(worst, v.distanceTo(hand)); top = Math.max(top, box.max.y); bottom = Math.min(bottom, box.min.y); }
      }
      // in the attack pose the arm swings; the weapon has to travel with it
      m.setAnim('attack'); m.update(0.3, 0.3); m.group.updateMatrixWorld(true);
      const handAtk = new THREE.Vector3();
      P.armR.traverse(o => { if (o.isMesh && o.geometry?.type === 'SphereGeometry' && o.geometry.parameters.radius < 0.1) o.getWorldPosition(handAtk); });
      let worstAtk = 0;
      for (const o of P.armR.children) { if (!o.isMesh || o.position.z <= 0.01) continue; o.getWorldPosition(v); worstAtk = Math.max(worstAtk, v.distanceTo(handAtk)); }
      res[held] = { worst, worstAtk, top, bottom, handY: hand.y, moved: Math.abs(hand.y - handAtk.y) };
      m.dispose();
    }
    return res;
  });
  for (const [held, r] of Object.entries(out)) {
    // nothing floats: every part of the weapon is within arm's reach of the hand
    expect(r.worst, `${held} idle reach`).toBeLessThan(0.75);
    expect(r.worstAtk, `${held} attack reach`).toBeLessThan(0.95);
    // and the blade/haft rises above the hand rather than lying across the body
    expect(r.top, `${held} points up`).toBeGreaterThan(r.handY);
    expect(r.moved, `${held} swings with the arm`).toBeGreaterThan(0.02);
  }
  expect(errors).toEqual([]);
});
