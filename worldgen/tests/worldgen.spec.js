// npx playwright test worldgen/tests/worldgen.spec.js
// Drives the viewer end to end: generate, look at the canvas, zoom world → region → local, switch
// layers and presets, and export. Screenshots land in test-results/.

import { test, expect } from '@playwright/test';

const collectErrors = page => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
};

/** How many distinct colours the canvas is showing — a blank canvas has one or two. */
const canvasColours = page => page.evaluate(() => {
  const c = document.getElementById('map'), ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 37) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
});

test('World Forge generates, zooms world → region → local, and switches layers', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('worldgen/');

  // 1 — the default world generates in reasonable time
  await page.waitForFunction(() => window.worldgenDemo && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  const stats = await page.evaluate(() => window.worldgenDemo.state.world.stats);
  expect(stats.landFraction).toBeGreaterThan(0.15);
  expect(stats.landFraction).toBeLessThan(0.8);
  expect(stats.regions).toBeGreaterThan(3);
  expect(stats.nodes).toBeGreaterThan(10);
  expect(await canvasColours(page)).toBeGreaterThan(40);
  await expect(page.locator('#status')).toContainText('regions');
  await expect(page.locator('#legend .sw').first()).toBeVisible();
  expect(await page.locator('#right .list .item').count()).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/worldgen-world.png', fullPage: false });

  // 2 — hovering the map reports the cell under the pointer
  const box = await page.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator('#readout')).toContainText('biome');

  // 3 — zoom into a region
  const biggest = await page.evaluate(() => window.worldgenDemo.state.world.regions.slice().sort((a, b) => b.cells - a.cells)[0].id);
  await page.evaluate(id => window.worldgenDemo.openRegion(id), biggest);
  await page.waitForFunction(() => window.worldgenDemo.state.level === 'region' && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  const detail = await page.evaluate(() => ({ w: window.worldgenDemo.state.detail.width, h: window.worldgenDemo.state.detail.height, nodes: window.worldgenDemo.state.detail.nodes.length }));
  expect(detail.w).toBeGreaterThan(20);
  expect(detail.nodes).toBeGreaterThan(0);
  expect(await canvasColours(page)).toBeGreaterThan(40);
  await expect(page.locator('#crumbs .here')).toHaveText(await page.evaluate(id => window.worldgenDemo.state.world.regions[id].name, biggest));
  await page.screenshot({ path: 'test-results/worldgen-region.png' });

  // 4 — zoom into a local tile by clicking the region map
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForFunction(() => window.worldgenDemo.state.level === 'local' && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  const tile = await page.evaluate(() => ({ w: window.worldgenDemo.state.tile.width, features: window.worldgenDemo.state.tile.features.length, title: window.worldgenDemo.state.tile.title }));
  expect(tile.w).toBe(64);
  expect(tile.features).toBeGreaterThan(3);
  expect(tile.title.length).toBeGreaterThan(3);
  expect(await canvasColours(page)).toBeGreaterThan(15);
  await page.screenshot({ path: 'test-results/worldgen-local.png' });

  // 5 — the breadcrumb walks back out
  await page.locator('#crumbs a', { hasText: 'World' }).click();
  await page.waitForFunction(() => window.worldgenDemo.state.level === 'world');
  expect(await canvasColours(page)).toBeGreaterThan(40);

  // 6 — debug layers redraw
  for (const layer of ['Elevation', 'Temperature', 'Moisture', 'Drainage', 'Aura', 'Regions', 'Biomes']) {
    await page.locator('#right .chips.layers .chip', { hasText: new RegExp('^' + layer + '$', 'i') }).click();
    expect(await canvasColours(page)).toBeGreaterThan(15);
  }

  // 7 — a toggle actually changes the picture
  const before = await canvasColours(page);
  await page.locator('#right label', { hasText: 'hillshade' }).locator('input').uncheck();
  expect(await canvasColours(page)).not.toBe(before);

  expect(errors).toEqual([]);
});

test('a preset regenerates the world with different knobs', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('worldgen/');
  await page.waitForFunction(() => window.worldgenDemo && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  const first = await page.evaluate(() => window.worldgenDemo.state.world.stats.landFraction);

  await page.locator('#left .chip', { hasText: 'Shattered isles' }).click();
  await page.waitForFunction(() => window.worldgenDemo.state.opts.method === 'archipelago' && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  const second = await page.evaluate(() => window.worldgenDemo.state.world.stats.landFraction);
  expect(second).toBeLessThan(first);
  await page.screenshot({ path: 'test-results/worldgen-preset-isles.png' });

  // exporting produces a JSON object of the right shape
  const json = await page.evaluate(() => { const j = window.worldgenDemo.toJSON(); return { seed: j.seed, layers: Object.keys(j.layers), regions: j.regions.length, nodes: j.nodes.length }; });
  expect(json.layers).toContain('biome');
  expect(json.layers).toContain('elevation');
  expect(json.regions).toBeGreaterThan(2);
  expect(json.nodes).toBeGreaterThan(4);

  expect(errors).toEqual([]);
});

test('every continent method draws something', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('worldgen/');
  await page.waitForFunction(() => window.worldgenDemo && window.worldgenDemo.ready(), null, { timeout: 20_000 });
  await page.evaluate(() => { window.worldgenDemo.setOpt('width', 160); window.worldgenDemo.setOpt('height', 80); });
  for (const method of ['noise', 'plates', 'voronoi', 'diamond', 'archipelago', 'pangea', 'mixed']) {
    await page.evaluate(m => { window.worldgenDemo.setOpt('method', m); return window.worldgenDemo.generate(); }, method);
    await page.waitForFunction(() => window.worldgenDemo.ready(), null, { timeout: 20_000 });
    const frac = await page.evaluate(() => window.worldgenDemo.state.world.stats.landFraction);
    expect(frac, method).toBeGreaterThan(0.15);
    expect(await canvasColours(page)).toBeGreaterThan(30);
  }
  expect(errors).toEqual([]);
});
