// The Chibi 2 overhaul (2026-09-24), measured on real skinned bodies rather than by eye:
// races change the body, roundness adds a belly, a sword points FORWARD at rest, a shield hangs face
// OUT and turns face FORWARD to block, a wave puts the weapon away, every clip builds, and the
// avatar page offers Chibi 2 first with the other two marked deprecated.
import { test, expect } from '@playwright/test';

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/avatar-3d/chibi2.html?view=portrait');
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  return errors;
}

test('races change the body and every race builds inside budget', async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_RACE_IDS } = await import('/avatar-3d/js/chibi2-races.js');
    const rows = {};
    for (const race of CHIBI2_RACE_IDS) {
      const a = await createChibi2Character({ body: { race } });
      rows[race] = { height: a.metrics().height, tris: a.stats().triangles, meshes: a.stats().meshes, bones: a.stats().bones };
      a.dispose();
    }
    return rows;
  });
  expect(errors).toEqual([]);
  expect(out.giant.height).toBeGreaterThan(out.human.height * 1.3);
  expect(out.dwarf.height).toBeLessThan(out.human.height * 0.9);
  expect(out.goblin.height).toBeLessThan(out.human.height);
  for (const [race, r] of Object.entries(out)) {
    expect(r.tris, race).toBeLessThan(9000);
    expect(r.meshes, race).toBeLessThanOrEqual(2);
    expect(r.bones, race).toBe(22);
  }
});

test('roundness pushes the belly out', async ({ page }) => {
  await open(page);
  const depth = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const front = async round => {
      const a = await createChibi2Character({ body: { round } });
      a.group.updateMatrixWorld(true);
      const hips = new THREE.Vector3(); a.parts.chest.getWorldPosition(hips);
      const m = a.group.getObjectByName('chibi2-cloth'), p = m.geometry.attributes.position; let z = -9;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - hips.y) < 0.03 && Math.abs(p.getX(i)) < 0.05) z = Math.max(z, p.getZ(i));
      a.dispose(); return z;
    };
    return { thin: await front(0), round: await front(1) };
  });
  expect(depth.round - depth.thin).toBeGreaterThan(0.08);
});

test('a sword points forward at rest, and a shield hangs face out then blocks face forward', async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_EVERY_ANIMS } = await import('/avatar-3d/js/chibi2-motion.js');
    const a = await createChibi2Character({ held: { id: 'fh_sword' }, offhand: { id: 'fh_heater_shield' } }, { anims: CHIBI2_EVERY_ANIMS });
    const dir = (bone, v) => { a.group.updateMatrixWorld(true); const q = new THREE.Quaternion(); a.parts[bone].getWorldQuaternion(q); return new THREE.Vector3(...v).applyQuaternion(q); };
    const at = (anim, t) => { a.setAnim(anim, 0); a.update(0.001); let left = t; while (left > 0) { a.update(Math.min(0.05, left)); left -= 0.05; } };
    at('idle', 1.0);
    const blade = dir('gripR', [0, -1, 0]), shieldRest = dir('gripL', [-1, 0, 0]);
    at('guard', 0.8);
    const shieldGuard = dir('gripL', [-1, 0, 0]);
    at('wave', 0.8);
    const s = new THREE.Vector3(); a.parts.gripR.getWorldScale(s);
    a.dispose();
    return { blade: blade.toArray(), shieldRest: shieldRest.toArray(), shieldGuard: shieldGuard.toArray(), waveScale: s.x };
  });
  expect(errors).toEqual([]);
  expect(out.blade[2], 'the blade should point forward, not at the floor').toBeGreaterThan(0.5);
  expect(out.shieldRest[0], 'at rest the shield face looks out to the side').toBeLessThan(-0.6);
  expect(out.shieldGuard[2], 'in guard the shield face looks forward').toBeGreaterThan(0.8);
  expect(out.waveScale, 'a wave puts the weapon away').toBeLessThan(0.05);
});

test('every clip in every hold builds finite keyframes', async ({ page }) => {
  const errors = await open(page);
  const bad = await page.evaluate(async () => {
    const { createChibi2Character } = await import('/avatar-3d/js/chibi2.js');
    const { CHIBI2_EVERY_ANIMS, ONE_SHOTS } = await import('/avatar-3d/js/chibi2-motion.js');
    const looks = [{}, { held: { id: 'fh_sword' }, offhand: { id: 'fh_heater_shield' } }, { held: { id: 'fh_greataxe' }, offhand: { id: 'fh_greatsword' } },
      { held: { id: 'bow' }, offhand: { id: 'quiver' } }, { held: { id: 'fh_wand' }, offhand: { id: 'book' } }, { held: { id: 'staff_orb' } }, { held: { id: 'fh_halberd' } }, { held: { id: 'crossbow' } }];
    const out = [];
    for (const look of looks) {
      const a = await createChibi2Character(look, { anims: CHIBI2_EVERY_ANIMS });
      for (const name of CHIBI2_EVERY_ANIMS) {
        a.setAnim(name, 0); for (let i = 0; i < 6; i++) a.update(0.05);
        a.group.updateMatrixWorld(true);
        for (const b of a.skeleton.bones) if (!b.matrixWorld.elements.every(Number.isFinite)) { out.push(`${JSON.stringify(look.held?.id)} ${name} ${b.name}`); break; }
      }
      a.setAnim('jab', 0); for (let i = 0; i < 20; i++) a.update(0.05);
      if (a.anim !== 'idle' && ONE_SHOTS.has('jab')) out.push('one-shot did not return to idle');
      a.dispose();
    }
    return out;
  });
  expect(errors).toEqual([]);
  expect(bad).toEqual([]);
});

test('the avatar page leads with Chibi 2, marks the others deprecated, and the race picker works', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto('/avatar-3d/');
  await page.waitForFunction(() => window.avatar3d && !window.avatar3d.isBuilding() && window.avatar3d.character?.skeleton, null, { timeout: 60000 });
  expect(await page.evaluate(() => window.avatar3d.mode)).toBe('chibi2');
  await expect(page.getByRole('button', { name: 'Chibi (procedural) · deprecated' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quaternius · deprecated' })).toBeVisible();
  const human = await page.evaluate(() => window.avatar3d.character.metrics().height);
  await page.locator('select').filter({ has: page.locator('option[value="giant"]') }).selectOption('giant');
  await page.waitForFunction(h => !window.avatar3d.isBuilding() && window.avatar3d.character?.metrics().height > h * 1.2, human, { timeout: 30000 });
  await page.evaluate(() => window.avatar3d.randomize(null));
  await page.waitForFunction(() => !window.avatar3d.isBuilding());
  expect(await page.evaluate(() => window.avatar3d.avatar.body.race)).toBe('giant');
  expect(errors).toEqual([]);
});
