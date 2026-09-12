import { test, expect } from '@playwright/test';

test('asset gallery renders scenery, icons, the night wash and the enlarge view', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('assets/');
  await page.waitForFunction(() => !!window.assetsDemo);

  // every scene in the manifest gets a card with a rendered <svg> (real art or the gradient fallback)
  const cards = await page.locator('.scene-card').count();
  expect(cards).toBeGreaterThanOrEqual(30);
  expect(await page.locator('.scene-card .thumb svg').count()).toBeGreaterThanOrEqual(10);
  expect(await page.locator('.icon-card svg').count()).toBeGreaterThanOrEqual(13);

  // night switch lays the dark wash over day scenes
  const washes = () => page.locator('.scene-card .thumb svg rect[fill="#060a18"]').count();
  expect(await washes()).toBe(0);
  await page.check('#night');
  await page.waitForFunction(() => document.getElementById('scene-grid').dataset.night === '1');
  await expect.poll(washes).toBeGreaterThan(0);
  await page.uncheck('#night');
  await expect.poll(washes).toBe(0);

  // tag filter narrows the grid, then "all" restores it
  await page.locator('#tags .chip', { hasText: 'forest' }).first().click();
  await expect.poll(async () => page.locator('.scene-card').count()).toBeLessThan(cards);
  await page.locator('#tags .chip', { hasText: 'all' }).first().click();
  await expect.poll(async () => page.locator('.scene-card').count()).toBe(cards);

  // click a scene to enlarge it
  await page.locator('.scene-card').first().click();
  await expect(page.locator('#big')).toBeVisible();
  expect(await page.locator('#big-box svg').count()).toBe(1);
  await page.click('#big-close');

  expect(errors).toEqual([]);
});

test('the loader answers for a missing id without throwing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('assets/');
  await page.waitForFunction(() => !!window.assetsDemo);
  const res = await page.evaluate(async () => {
    const a = window.assetsDemo.assets;
    const gone = await a.scenery('no_such_place');
    const viaFallback = await a.scenery('no_such_place_2', { fallback: 'road' });
    const el = await a.sceneryElement('no_such_place_3', { night: true });
    return { missing: gone.missing, hasMarkup: gone.inner.length > 0, fallbackMissing: viaFallback.missing, tag: el.tagName, icon: await a.icon('not_a_type') };
  });
  expect(res.missing).toBe(true);
  expect(res.hasMarkup).toBe(true);
  expect(res.tag.toLowerCase()).toBe('svg');
  expect(res.icon).toBe('');
  expect(errors).toEqual([]);
});
