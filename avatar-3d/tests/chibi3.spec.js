import { test, expect } from '@playwright/test';

// Chibi 3 comparison page: opens on baked presets, switches views, rebuilds a look live, animates,
// and the canvas actually shows something.
async function open(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/avatar-3d/chibi3.html' + query);
  await page.waitForFunction(() => window.chibi3page && !window.chibi3page.building, null, { timeout: 90000 });
  return errors;
}
const notBlank = page => page.evaluate(() => {
  const c = document.querySelector('#stage canvas'), g = document.createElement('canvas'); g.width = 64; g.height = 64;
  const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data;
  const seen = new Set(); for (let i = 0; i < d.length; i += 16) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});

test('Chibi 3 opens on a baked knight, quickly, with no errors', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await open(page);
  const info = await page.evaluate(() => ({ actors: window.chibi3page.actors.length, stats: window.chibi3page.actors[0].ctrl.stats() }));
  expect(info.actors).toBe(1);
  expect(info.stats.baked).toBe(true);
  expect(info.stats.bones).toBe(66);
  expect(info.stats.lodTriangles[0]).toBeGreaterThan(info.stats.lodTriangles[2]);
  expect(await notBlank(page)).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});

test('Chibi 3 views: Chibi 2 vs 3, the three, and a crowd', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await open(page);
  for (const [view, extra, n] of [['compare', {}, 2], ['trio', {}, 3], ['crowd', { crowd: 10, crowdEngine: 'chibi3' }, 10], ['crowd', { crowd: 10, crowdEngine: 'chibi2' }, 10]]) {
    await page.evaluate(([v, e]) => window.chibi3page.configure({ view: v, ...e }), [view, extra]);
    expect(await page.evaluate(() => window.chibi3page.actors.length)).toBe(n);
  }
  const engines = await page.evaluate(async () => { await window.chibi3page.configure({ view: 'compare' }); return window.chibi3page.actors.map(a => a.engine); });
  expect(engines).toEqual(['chibi2', 'chibi3']);
  expect(errors).toEqual([]);
});

test('Chibi 3 builds a new look live from the same avatar JSON, and animates it', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await open(page);
  const result = await page.evaluate(async () => {
    const { createChibi3Character } = await import('/avatar-3d/js/chibi3/index.js');
    const t0 = performance.now();
    // a plain Chibi 2 style look: ids the 2D catalogue knows, an elf
    const c = await createChibi3Character({ body: { race: 'elf', skin: '#ecc6a4' }, hair: { id: 'ponytail', color: '#d6b46a' }, top: { id: 'leather', color: '#5a3a26' }, bottom: { id: 'pants' }, shoes: { id: 'boots' }, held: { id: 'dagger' } }, { lod: 0, cache: false });
    const ms = performance.now() - t0;
    const clips = ['walk', 'run', 'slash1', 'castBolt', 'heavyCleave', 'hit', 'dead', 'getUp', 'wave', 'talk'];
    let bad = 0;
    for (const name of clips) { c.play(name); for (let i = 0; i < 20; i++) c.update(1 / 30); c.group.updateMatrixWorld(true); for (const b of c.skeleton.bones) if (!Number.isFinite(b.matrixWorld.elements[12] + b.matrixWorld.elements[13])) bad++; }
    c.setExpression('happy'); c.say('Hello there'); for (let i = 0; i < 30; i++) c.update(1 / 30);
    const s = c.stats(); c.dispose();
    return { ms, bad, baked: s.baked, triangles: s.triangles };
  });
  expect(result.bad).toBe(0);
  expect(result.baked).toBe(false);
  expect(result.triangles).toBeGreaterThan(15000);
  expect(errors).toEqual([]);
});
