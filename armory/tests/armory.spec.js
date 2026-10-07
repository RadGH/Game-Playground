// Armory: opens, filters, thumbnails draw, a deep link opens a model with both hands and an attack clip, the 3D
// preview is not blank, flags persist and export. Screenshots land in test-results/armory-*.png.
import { test, expect } from '@playwright/test';
const SHOTS = process.env.SHOT_DIR || 'test-results';      // another run empties test-results; point this elsewhere to keep them

test.describe.configure({ timeout: 180_000 });

/** How much of a canvas / image differs from its own top-left pixel (0..1). */
const inked = (page, selector) => page.evaluate(async sel => {
  const src = document.querySelector(sel);
  if (!src) return -1;
  if (src.tagName === 'IMG' && !src.complete) await new Promise(r => { src.onload = r; });
  const w = 96, h = 96, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) + Math.abs(d[i + 3] - d[3]) > 40) n++;
  return n / (w * h);
}, selector);

test('armory: lists the models, filters narrow them, thumbnails are real pictures', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('armory/');
  await page.waitForFunction(() => window.armory?.loaded);
  const total = await page.evaluate(() => window.armory.state.rows.length);
  expect(total).toBeGreaterThan(150);
  expect(await page.locator('.gcard').count()).toBe(total);
  await expect(page.locator('#detail')).toBeHidden();

  // thumbnails: wait for the first row, then check a weapon's picture has something in it
  await page.waitForFunction(() => window.armory.thumbs.stats().cached >= 6, null, { timeout: 120_000 });
  expect(await inked(page, '.gcard .pic[data-state="done"] img')).toBeGreaterThan(0.02);
  await expect(page.locator('.gcard .tris').first()).toHaveText(/\d+ tris/);
  expect(await page.evaluate(() => window.armory.thumbs.stats().contexts)).toBe(1);      // one shared renderer
  await page.screenshot({ path: `${SHOTS}/armory-grid.png` });

  // filters
  await page.click('[data-filter="kind"] .chip[data-value="weapon"]');
  const weapons = await page.locator('.gcard').count();
  expect(weapons).toBeGreaterThan(20); expect(weapons).toBeLessThan(total);
  await page.click('[data-filter="type"] .chip[data-value="dagger"]');
  const daggers = await page.$$eval('.gcard', els => els.map(e => e.dataset.id));
  expect(daggers.length).toBeGreaterThan(0); expect(daggers.length).toBeLessThan(weapons);
  expect(daggers).toContain('fh_dagger');
  expect(page.url()).toContain('kind=weapon'); expect(page.url()).toContain('type=dagger');
  await page.click('#f-reset');
  await page.fill('#search', 'chibi2-weapons-tv');
  expect(await page.$$eval('.gcard', els => els.map(e => e.dataset.id).sort())).toEqual(['tv_club', 'tv_glaive', 'tv_scimitar', 'tv_warpick']);
  await page.fill('#search', 'no-such-model-xyz');
  await expect(page.locator('#grid-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('armory: a deep link opens the model in both hands with an attack clip, and the preview draws', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('armory/#id=fh_daggers&hand=both&anim=flurry&speed=0.25');
  await page.waitForFunction(() => window.armory?.ready, null, { timeout: 120_000 });
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#d-id')).toHaveText('fh_daggers');
  await expect(page.locator('#hands .seg.on')).toHaveText('Both hands');
  expect(await page.inputValue('#anim')).toBe('flurry');
  expect(await page.evaluate(() => window.armory.actor.anim)).toBe('flurry');

  // model details: source file, builder, measured numbers
  await expect(page.locator('#stats')).toContainText('chibi2-weapons.js');
  const live = await page.evaluate(() => ({ t: window.armory.live.triangles, size: window.armory.live.size.y, holds: window.armory.live.holds.map(h => [h.side, h.bone, h.axis]) }));
  expect(live.t).toBeGreaterThan(100); expect(live.size).toBeGreaterThan(0.2);
  expect(live.holds).toEqual([['R', 'gripR', 'y'], ['L', 'gripL', 'y']]);
  await expect(page.locator('#hold tbody tr')).toHaveCount(2);
  await expect(page.locator('#stats')).toContainText('Triangles');
  await expect(page.locator('#stats')).toContainText('Grip offset');

  // the 3D preview has a character in it
  await page.waitForTimeout(600);
  expect(await inked(page, '#stage canvas')).toBeGreaterThan(0.05);
  await page.screenshot({ path: `${SHOTS}/armory-detail.png` });

  // hand toggle rebuilds and rewrites the link
  const builds = await page.evaluate(() => window.armory.builds);
  await page.click('#hands [data-hand="main"]');
  await page.waitForFunction(b => window.armory.builds > b, builds);
  await expect(page.locator('#hands .seg.on')).toHaveText('Main hand');
  expect(page.url()).not.toContain('hand=both');
  // the piece alone, as wireframe
  await page.click('#t-wire');
  await page.waitForTimeout(400);
  expect(await inked(page, '#stage canvas')).toBeGreaterThan(0.002);
  await page.click('#t-wire');

  // race + animation pickers
  await page.selectOption('#race', 'orc');
  await page.waitForFunction(b => window.armory.builds > b + 1, builds);
  await page.selectOption('#anim', 'slash');
  expect(await page.evaluate(() => window.armory.actor.anim)).toBe('slash');
  expect(page.url()).toContain('race=orc'); expect(page.url()).toContain('anim=slash');

  // the icon block: Thousandvale's own module, or the Armory's picture with a note saying so
  await expect(page.locator('#icon .icon-row img').first()).toBeVisible({ timeout: 90_000 });
  expect(['thousandvale', 'armory']).toContain(await page.locator('#icon .icon-row').getAttribute('data-source'));
  await expect(page.locator('#items')).toContainText(/Thousandvale|Farhold|No game/);
  expect(errors).toEqual([]);
});

test('armory: both hands opens on a dual clip (one-handers) or a twin clip (two two-handers), and the new clips are in the picker', async ({ page }) => {
  await page.goto('armory/#id=fh_dagger&hand=both');
  await page.waitForFunction(() => window.armory?.ready, null, { timeout: 120_000 });
  expect(await page.inputValue('#anim')).toBe('dualFlurry');
  expect(await page.evaluate(() => window.armory.actor.anim)).toBe('dualFlurry');
  const options = await page.$$eval('#anim option', os => os.map(o => o.value));
  for (const n of ['dualSlashR', 'dualSlashL', 'dualCross', 'dualStabR', 'dualStabL', 'dualFlurry', 'twinChopR', 'twinChopL', 'twinCrash', 'standUp', 'fishCast', 'fishWait', 'fishReel', 'fishShow']) expect(options, n).toContain(n);
  expect(await page.$$eval('#anim optgroup', gs => gs.map(g => g.label))).toEqual(expect.arrayContaining(['Dual wield', 'Angling', 'Revive']));
  await page.goto('armory/#id=fh_greatsword');
  await page.waitForFunction(() => window.armory?.state.id === 'fh_greatsword' && window.armory.ready, null, { timeout: 120_000 });
  const b = await page.evaluate(() => window.armory.builds);
  await page.click('#hands [data-hand="both"]');
  await page.waitForFunction(n => window.armory.builds > n, b);
  expect(await page.inputValue('#anim')).toBe('twinCrash');
  expect(await page.evaluate(() => window.armory.live.holds.length)).toBe(2);       // the second two-hander is drawn
  await page.click('#hands [data-hand="main"]');
  expect(await page.inputValue('#anim')).toBe('idle');
});

test('armory: a flag note is kept, shows in the grid and exports as JSON', async ({ page }) => {
  await page.goto('armory/#id=fh_sword');
  await page.waitForFunction(() => window.armory?.ready, null, { timeout: 120_000 });
  await page.fill('#flag-note', 'blade looks too thick');
  await page.click('#flag-btn');
  await expect(page.locator('.gcard[data-key="fh_sword"]')).toHaveClass(/flagged/);
  await expect(page.locator('#flag-count')).toHaveText('1');
  await page.reload();
  await page.waitForFunction(() => window.armory?.ready, null, { timeout: 120_000 });
  expect(await page.inputValue('#flag-note')).toBe('blade looks too thick');
  const out = await page.evaluate(() => window.armory.exportFlags());
  expect(out.count).toBe(1);
  expect(out.flags[0]).toMatchObject({ id: 'fh_sword', note: 'blade looks too thick' });
  expect(out.flags[0].file).toContain('avatar-3d/js/');
  expect(out.flags[0].link).toContain('#id=fh_sword');
  await page.click('#f-flagged');
  expect(await page.$$eval('.gcard', els => els.map(e => e.dataset.id))).toEqual(['fh_sword']);
  await page.click('#unflag-btn');
  await expect(page.locator('#flag-count')).toHaveText('0');
});

test('armory at phone width: the grid fits, the detail is a full-screen sheet that closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('armory/');
  await page.waitForFunction(() => window.armory?.loaded);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.waitForFunction(() => window.armory.thumbs.stats().cached >= 4, null, { timeout: 120_000 });
  await page.screenshot({ path: `${SHOTS}/armory-phone-grid.png` });
  await page.locator('.gcard').first().click();
  await page.waitForFunction(() => window.armory?.ready, null, { timeout: 120_000 });
  const box = await page.locator('#detail').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(389);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/armory-phone-detail.png` });
  await page.click('#d-close');
  await expect(page.locator('#detail')).toBeHidden();
  expect(page.url()).not.toContain('id=');
});
