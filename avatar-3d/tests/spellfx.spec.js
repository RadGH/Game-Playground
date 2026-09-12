// Playwright: the spell FX gallery loads, throws every element, bursts every element, runs every
// status aura, and cleans up after itself (the effects layer goes back to zero children).
import { test, expect } from '@playwright/test';

test('spell fx: every element and every status runs and cleans up', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('avatar-3d/spellfx.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });

  const elements = await page.evaluate(() => window.spellfxDemo.elements);
  const statuses = await page.evaluate(() => window.spellfxDemo.statuses);
  expect(elements.length).toBeGreaterThanOrEqual(10);
  expect(statuses.length).toBeGreaterThanOrEqual(19);

  // nothing running before we start: that is the baseline every effect must return to
  const baseline = await page.evaluate(() => window.spellfxDemo.fxChildren());
  expect(baseline).toBe(0);
  expect(await page.evaluate(() => window.spellfxDemo.liveCount())).toBe(0);

  // cast + projectile + impact for each element; a projectile must resolve when it lands
  for (const el of elements) {
    const ok = await page.evaluate(async e => {
      const d = window.spellfxDemo;
      d.cast(e);
      const t0 = performance.now();
      await d.projectile(e, e === 'fire');
      const ms = performance.now() - t0;
      d.impact(e, e === 'fire');
      return { ms, live: d.liveCount() };
    }, el);
    expect(ok.ms).toBeLessThan(1200);      // flight is capped so a fight stays readable
    expect(ok.live).toBeGreaterThan(0);    // something is actually on the stage
  }
  await page.evaluate(() => { const d = window.spellfxDemo; d.heal(); d.revive(); d.aoe('arcane'); });
  await page.waitForFunction(() => window.spellfxDemo.liveCount() === 0, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.spellfxDemo.fxChildren())).toBe(baseline);

  // every status aura at once on one body, then cleared
  for (const t of statuses) await page.evaluate(s => window.spellfxDemo.status('b', s, true), t);
  const on = await page.evaluate(() => window.spellfxDemo.statusesOn('b'));
  expect(on.sort()).toEqual([...statuses].sort());
  await page.waitForTimeout(700);
  await page.locator('#viewport').screenshot({ path: 'test-results/spellfx-statuses.png' });

  // the auras are drawn: coloured pixels beyond the two flat-lit bodies
  const px = await page.evaluate(() => {
    const c = document.querySelector('#viewport canvas'); const s = document.createElement('canvas');
    s.width = 160; s.height = 110; const ctx = s.getContext('2d'); ctx.drawImage(c, 0, 0, 160, 110);
    const d = ctx.getImageData(0, 0, 160, 110).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 || d[i + 1] > 150) n++;
    return n;
  });
  expect(px).toBeGreaterThan(20);

  await page.evaluate(() => window.spellfxDemo.clearStatuses('b'));
  expect(await page.evaluate(() => window.spellfxDemo.statusesOn('b'))).toEqual([]);
  await page.waitForFunction(() => window.spellfxDemo.liveCount() === 0, null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.spellfxDemo.fxChildren())).toBe(baseline);

  // one shot of the stage mid-spell for the record
  await page.evaluate(() => { const d = window.spellfxDemo; d.freeze(); d.fx.impact({ at: d.chestOf('b'), element: 'fire', crit: true }); d.step(1 / 60, 10); });
  await page.waitForTimeout(200);
  await page.locator('#viewport').screenshot({ path: 'test-results/spellfx-impact.png' });
  await page.evaluate(() => window.spellfxDemo.unfreeze());

  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});

test('spell fx: buttons on the page fire effects', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/spellfx.html');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });
  await page.click('.chips .chip:has-text("Ice")');
  expect(await page.evaluate(() => window.spellfxDemo.element)).toBe('ice');
  await page.click('button:has-text("Projectile →")');
  await page.waitForFunction(() => window.spellfxDemo.liveCount() > 0, null, { timeout: 5000 });
  await page.click('button:has-text("Cast flash")');
  await page.click('button:has-text("Heal")');
  // a status checkbox in the right-hand panel turns an aura on
  await page.locator('.sidebar.right label:has-text("Burning")').first().click();
  expect(await page.evaluate(() => window.spellfxDemo.statusesOn('a'))).toContain('burn');
  await page.click('.sidebar.right button:has-text("Clear all")');
  expect(await page.evaluate(() => window.spellfxDemo.statusesOn('a'))).toEqual([]);
  expect(errors).toEqual([]);
});
