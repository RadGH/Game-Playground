// The page itself, in a real browser.
//
// The node tests cover the maths; this covers the things only a browser can tell you — that every
// shader compiles, that the frame actually draws something, that the two cameras work, and that
// the quality presets do not leave the page in a state it cannot render.
//
// Shader compile failures are the reason this exists. They do not throw: three logs them and
// carries on drawing nothing, so a page with a broken shader looks like a page with a bug
// somewhere else entirely. Here they are collected and failed on.

import { test, expect } from '@playwright/test';

const PAGE = '/highdef-3d/?quality=low&seed=20260922';

/** Wait for the loading overlay to finish, and collect anything the console complains about. */
async function boot(page, url = PAGE) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() !== 'error') return;
    // the character's optional outfit pieces are allowed to be missing
    if (/optional piece missing/.test(t)) return;
    errors.push(t.slice(0, 500));
  });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  return errors;
}

test.describe.configure({ mode: 'serial' });

// Generating a world, four hundred models and nineteen textures takes a few seconds on a graphics
// card and the better part of a minute on the software renderer a headless box falls back to. The
// default one-minute budget is a test of the machine, not of the code.
test.beforeEach(() => { test.setTimeout(240_000); });

test('the world loads with no shader or script errors', async ({ page }) => {
  const errors = await boot(page);
  const shader = errors.filter(e => /Shader Error|not compiled|INVALID/i.test(e));
  expect(shader, 'a shader failed to compile').toEqual([]);
  expect(errors, 'the page logged errors').toEqual([]);
});

test('it draws a real frame', async ({ page }) => {
  await boot(page);
  const info = await page.evaluate(() => window.highdef.debug());
  expect(info.render.calls).toBeGreaterThan(20);
  expect(info.render.triangles).toBeGreaterThan(50_000);
  // and not an absurd number of them — this is the guard against the detail levels silently
  // switching off, which is exactly what happened the first time this was measured
  expect(info.render.calls).toBeLessThan(4000);
  expect(info.terrainChunks).toBeGreaterThan(10);
  expect(info.vegetation.instances).toBeGreaterThan(200);
});

test('the scatter planted a whole world of things', async ({ page }) => {
  await boot(page);
  const { scatter } = await page.evaluate(() => window.highdef.debug());
  for (const layer of ['trees', 'bushes', 'ferns', 'flowers', 'rocks', 'debris', 'ground']) {
    expect(scatter[layer], `${layer} was not planted`).toBeGreaterThan(50);
  }
});

test('the canvas is not a blank sky', async ({ page }) => {
  await boot(page);
  const shot = await page.locator('canvas').screenshot({ timeout: 120_000 });
  expect(shot.length).toBeGreaterThan(5000);
  // A frame with real geometry in it has a wide spread of colours. A blank page does not.
  const spread = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = document.createElement('canvas');
    g.width = 64; g.height = 40;
    const ctx = g.getContext('2d');
    ctx.drawImage(c, 0, 0, 64, 40);
    const d = ctx.getImageData(0, 0, 64, 40).data;
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      min = Math.min(min, l); max = Math.max(max, l); sum += l;
    }
    return { min, max, mean: sum / (d.length / 4) };
  });
  expect(spread.max - spread.min, 'the frame is one flat colour').toBeGreaterThan(40);
  expect(spread.mean, 'the frame is black').toBeGreaterThan(10);
});

test('both cameras work and the view switches between them', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => {
    window.highdef.setCameraMode('follow');
    return 'ok';
  });
  expect(before).toBe('ok');
  await page.waitForTimeout(1200);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.evaluate(() => window.highdef.setCameraMode('overhead'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.highdef.setIsometric(true));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.highdef.setIsometric(false));
  await page.waitForTimeout(500);
  expect(errs).toEqual([]);
  const info = await page.evaluate(() => window.highdef.debug());
  expect(info.render.calls).toBeGreaterThan(20);
});

test('the time of day and the weather move the light', async ({ page }) => {
  await boot(page);
  const sample = async () => page.evaluate(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.querySelector('canvas');
    const g = document.createElement('canvas');
    g.width = 32; g.height = 20;
    const ctx = g.getContext('2d');
    ctx.drawImage(c, 0, 0, 32, 20);
    const d = ctx.getImageData(0, 0, 32, 20).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s / (d.length / 4);
  });
  await page.evaluate(() => window.highdef.setTime(12.5));
  await page.waitForTimeout(900);
  const noon = await sample();
  await page.evaluate(() => window.highdef.setTime(1.0));
  await page.waitForTimeout(900);
  const night = await sample();
  expect(noon, 'midday should be brighter than the middle of the night').toBeGreaterThan(night + 12);

  await page.evaluate(() => window.highdef.setWeather('storm'));
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => window.highdef.debug());
  expect(info.render.calls).toBeGreaterThan(20);
});

test('the character is there, animated, and the whole clip library is offered', async ({ page }) => {
  await boot(page);
  // the clip picker is the panel's longest select and holds the whole animation library
  const longest = await page.evaluate(() => Math.max(
    ...[...document.querySelectorAll('.hd-side select')].map(s => s.options.length)));
  expect(longest, 'the animation library did not load').toBeGreaterThan(20);

  // and the character really is in the scene, with its bones moving
  const moved = await page.evaluate(async () => {
    const scene = window.highdef.__scene;
    let head = null;
    scene.traverse(o => { if (!head && o.isBone && o.name === 'Head') head = o; });
    if (!head) return 'no skeleton';
    window.highdef.playState('dance');
    const a = head.quaternion.toArray().join(',');
    await new Promise(r => setTimeout(r, 700));
    const b = head.quaternion.toArray().join(',');
    return a === b ? 'frozen' : 'moving';
  });
  expect(moved).toBe('moving');
});

test('switching quality preset rebuilds without breaking', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.highdef.setQuality('medium'));
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 120_000 });
  await page.waitForTimeout(2000);
  const shader = errors.filter(e => /Shader Error|not compiled/i.test(e));
  expect(shader, 'the rebuild broke a shader').toEqual([]);
  const info = await page.evaluate(() => window.highdef.debug());
  expect(info.quality).toBe('medium');
  expect(info.render.calls).toBeGreaterThan(20);
});
