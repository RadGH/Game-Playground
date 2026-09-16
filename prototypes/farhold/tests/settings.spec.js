// Farhold phase 10: settings that actually change the game, and are remembered.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('O opens the settings, and the camera really does change shoulder', async ({ page }) => {
  const errors = await land(page);
  await page.keyboard.press('KeyO');
  await expect(page.locator('#settings')).toBeVisible();

  const sides = await page.evaluate(async () => {
    const THREE = await import('three');
    const f = window.farhold;
    const read = () => {
      f.control.update(0.016, null, {});
      // where the camera sits across the view ray
      const look = new THREE.Vector3(Math.sin(f.control.yaw), 0, Math.cos(f.control.yaw));
      const right = new THREE.Vector3(-look.z, 0, look.x);
      const off = new THREE.Vector3().subVectors(f.camera.position, new THREE.Vector3(f.control.x, f.camera.position.y, f.control.z));
      return off.dot(right);
    };
    f.settings.set('shoulder', 'left');
    const left = read();
    f.settings.set('shoulder', 'right');
    const right = read();
    return { left, right, stored: f.settings.get('shoulder') };
  });
  // the two sides are on opposite sides of the view ray, and left is the default
  expect(Math.sign(sides.left)).not.toBe(Math.sign(sides.right));
  expect(sides.stored).toBe('right');
  expect(errors).toEqual([]);
});

test('inverting the look flips the pitch, and sensitivity scales it', async ({ page }) => {
  await land(page);
  const look = await page.evaluate(() => {
    const f = window.farhold;
    const move = () => {
      f.control.pitch = 0;
      f.control.update(0.016, { forward: 0, strafe: 0, run: false, jump: false, attack: false, look: [0, 100], pressed: new Set() }, {});
      return f.control.pitch;
    };
    f.settings.set('invertY', false);
    f.settings.set('sensitivity', 1);
    const normal = move();
    f.settings.set('invertY', true);
    const inverted = move();
    f.settings.set('invertY', false);
    f.settings.set('sensitivity', 2);
    const fast = move();
    f.settings.set('sensitivity', 1);
    return { normal, inverted, fast };
  });
  expect(Math.sign(look.normal)).not.toBe(Math.sign(look.inverted));
  expect(Math.abs(look.fast)).toBeGreaterThan(Math.abs(look.normal) * 1.5);
});

test('the scatter and grass switches change what is on the ground', async ({ page }) => {
  await land(page);
  const world = await page.evaluate(() => {
    const f = window.farhold;
    f.settings.set('density', 1);
    f.settings.set('grass', true);
    const normal = f.stats().props;
    f.settings.set('density', 0);
    const bare = f.stats().props;
    f.settings.set('density', 1);
    f.settings.set('grass', false);
    const noGrass = f.stats().props;
    f.settings.set('grass', true);
    return { normal, bare, noGrass };
  });
  expect(world.bare.instances).toBe(0);
  expect(world.noGrass.grass).toBe(0);
  expect(world.normal.grass).toBeGreaterThan(0);
});

test('settings are remembered across a reload', async ({ page }) => {
  await land(page);
  await page.evaluate(() => {
    window.farhold.settings.set('shoulder', 'right');
    window.farhold.settings.set('sensitivity', 1.8);
    window.farhold.settings.set('voices', false);
  });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const kept = await page.evaluate(() => ({
    shoulder: window.farhold.settings.get('shoulder'),
    sensitivity: window.farhold.settings.get('sensitivity'),
    voices: window.farhold.settings.get('voices'),
    voiceApplied: window.farhold.speech.voiceOn,
  }));
  expect(kept.shoulder).toBe('right');
  expect(kept.sensitivity).toBe(1.8);
  expect(kept.voices).toBe(false);
  // and it was applied, not just stored
  expect(kept.voiceApplied).toBe(false);
});
