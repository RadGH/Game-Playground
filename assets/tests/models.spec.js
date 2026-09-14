// npx playwright test assets/tests/models.spec.js
// The space model gallery: every builder in space-models.js gets a tile, every tile actually draws
// something, and the two selects rebuild the planet and the star.

import { test, expect } from '@playwright/test';

/** Non-black pixels inside each tile, read off the shared WebGL canvas. */
const tilePixels = page => page.evaluate(() => {
  const gl = document.getElementById('gl');
  const out = {};
  const buf = document.createElement('canvas');
  buf.width = gl.width; buf.height = gl.height;
  const ctx = buf.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  const scaleX = gl.width / window.innerWidth, scaleY = gl.height / window.innerHeight;
  for (const v of window.modelsDemo.views) {
    const r = v.box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { out[v.id] = null; continue; }
    const x = Math.max(0, Math.round(r.left * scaleX)), y = Math.max(0, Math.round(r.top * scaleY));
    const w = Math.min(Math.round(r.width * scaleX), gl.width - x), h = Math.min(Math.round(r.height * scaleY), gl.height - y);
    if (w < 4 || h < 4) { out[v.id] = null; continue; }
    const d = ctx.getImageData(x, y, w, h).data;
    let lit = 0;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) {
      if (d[i + 3] > 20 && d[i] + d[i + 1] + d[i + 2] > 45) lit++;
      seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    }
    out[v.id] = { lit, distinct: seen.size, sampled: d.length / (4 * 7) };
  }
  return out;
});

test('the space model gallery draws every model', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('assets/models.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 40_000 });

  const ids = await page.evaluate(() => window.modelsDemo.ids());
  expect(ids.length).toBeGreaterThanOrEqual(11);
  expect(ids).toContain('planet');
  expect(ids).toContain('star');
  expect(ids).toContain('station');
  expect(await page.locator('.model-card').count()).toBe(ids.length);

  // every manifest entry has a tile
  const manifest = await page.evaluate(async () => (await (await fetch('data/manifest.json')).json()).models);
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('_')) continue;
    expect(ids).toContain(key);
  }

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/assets-models-top.png' });

  // walk the grid a tile at a time: only tiles on screen are drawn, so each one gets scrolled to the
  // middle of the window before it is measured
  for (const id of ids) {
    await page.evaluate(i => window.modelsDemo.views.find(v => v.id === i).card.scrollIntoView({ block: 'center' }), id);
    await page.waitForTimeout(500);
    const px = (await tilePixels(page))[id];
    expect(px, `${id} never drew`).toBeTruthy();
    expect(px.lit, `${id} drew nothing`).toBeGreaterThan(20);
  }
  await page.screenshot({ path: 'test-results/assets-models-bottom.png' });

  expect(errors).toEqual([]);
});

test('the planet and star selects rebuild their model', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('assets/models.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 40_000 });
  await page.mouse.wheel(0, -700);

  for (const arch of ['lava', 'ocean', 'gasGiant', 'crystal', 'living']) {
    await page.evaluate(a => window.modelsDemo.setArchetype(a), arch);
    await page.waitForTimeout(700);
    const px = await tilePixels(page);
    expect(px.planet, arch + ' tile went missing').toBeTruthy();
    expect(px.planet.lit, arch + ' planet drew nothing').toBeGreaterThan(20);
    expect(px.planet.distinct, arch + ' planet is a flat disc').toBeGreaterThan(4);
  }

  for (const cls of ['blackHole', 'neutronStar', 'binaryPair', 'redDwarf']) {
    await page.evaluate(c => window.modelsDemo.setStarClass(c), cls);
    await page.waitForTimeout(700);
    const px = await tilePixels(page);
    expect(px.star.lit, cls + ' star drew nothing').toBeGreaterThan(10);
  }
  await page.screenshot({ path: 'test-results/assets-models-variants.png' });

  expect(errors).toEqual([]);
});
