// Bannerline art (stream C, PLAN §19 #20): baked icons and the live portrait are not blank, the icon
// forge renders live without errors, and the crowd bench stays inside the draw-call budget.
import { test, expect } from '@playwright/test';

const nonBlank = async (page, sel) => page.evaluate(sel => {
  const src = document.querySelector(sel); if (!src) return -1;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.drawImage(src, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data; const seen = new Set();
  for (let i = 0; i < d.length; i += 16) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
  return seen.size;                                        // distinct colours: a blank square has 1-3
}, sel);

test('icon forge: every baked icon loads, and a live render matches the set', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('prototypes/bannerline/icons.html');
  await page.waitForFunction(() => window.iconForge?.ready, null, { timeout: 90_000 });
  const cards = await page.locator('.icon-card img').count();
  const jobs = await page.evaluate(() => window.iconForge.jobs().length);
  expect(cards).toBe(jobs);
  await page.waitForFunction(() => [...document.querySelectorAll('.icon-card img')].every(i => i.complete && i.naturalWidth === 128), null, { timeout: 30_000 });
  for (const sel of ['[data-kind=unit][data-id=tuskback] img', '[data-kind=hero][data-id=druid] img', '[data-kind=item][data-id=greatsword] img', '[data-kind=skill][data-id=firebolt] img'])
    expect(await nonBlank(page, sel), sel).toBeGreaterThan(20);
  // a live render of one of each kind
  const live = await page.evaluate(async () => { const s = window.iconForge.studio; const out = [];
    for (const c of [await s.unit('ghoul'), await s.hero('ranger'), await s.item({ held: 'fh_axe', color: '#b8bec6' })]) {
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set();
      for (let i = 0; i < d.length; i += 64) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      out.push(seen.size);
    } return out; });
  for (const n of live) expect(n).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('bench: portrait draws, draw calls stay in budget at 40 per viewport', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('prototypes/bannerline/bench.html?case=40x1');
  await page.waitForFunction(() => window.bench?.ready && window.bench.portrait.actor, null, { timeout: 150_000 });
  await page.waitForTimeout(1500);
  expect(await nonBlank(page, '#portrait canvas')).toBeGreaterThan(20);
  await page.evaluate(() => window.bench.showPortrait(5));
  await page.waitForTimeout(800);
  expect(await nonBlank(page, '#portrait canvas')).toBeGreaterThan(20);
  const r = await page.evaluate(() => window.bench.run({ frames: 12, warmup: 4, cases: [{ n: 40, v: 1 }, { n: 40, v: 2 }] }));
  expect(r[0].calls).toBeLessThanOrEqual(300);
  expect(r[1].calls).toBeLessThanOrEqual(600);
  expect(r[1].triangles).toBeLessThanOrEqual(1_200_000);
  expect(errors).toEqual([]);
});
