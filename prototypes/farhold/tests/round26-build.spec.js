// R26 — the build ring, and the furnace with no box, played in the real page.
//
//   "The build menu needs redesigned, maybe into a radial menu. The user should be able to build a
//    storage box, furnace, and everything needed to smelt iron, right from the beginning."
//   "I built a furnace and queued up 2 iron ingot. However it just says '2 min of work banked' and
//    Smelt Iron is still listed as 0/1 two times. It is not making the iron."
//
// Run on its own:  npx playwright test prototypes/farhold/tests/round26-build.spec.js

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 150000 });
  return errors;
}

/** Somewhere flat and dry, away from the town, with nothing to trip over. */
async function flatSpot(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const ok = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.2;
    for (let r = 160; r <= 1600; r += 30) for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (ok(x, z) && ok(x + 10, z) && ok(x - 10, z) && ok(x, z + 10) && ok(x, z - 10)) {
        f.teleport(x, z);
        await new Promise(res => setTimeout(res, 600));
        return { x: f.control.x, z: f.control.z };
      }
    }
    return null;
  });
}

test('B opens the ring; Storage → Storage Box → click the ground builds it for six logs', async ({ page }) => {
  test.setTimeout(200_000);
  const errors = await land(page);
  const spot = await flatSpot(page);
  expect(spot, 'no flat dry ground anywhere near the landing').not.toBeNull();

  const before = await page.evaluate(() => {
    const f = window.farhold;
    f.bag.add('log', 10);
    return { log: f.bag.count('log'), n: f.build.entries.length };
  });

  await page.keyboard.press('KeyB');
  const ring = page.locator('#build-radial');
  await expect(ring).toBeVisible();
  await expect(page.locator('#build-ui'), 'B should open the ring, not the long panel').toBeHidden();

  // the groups ring, with Storage first
  await expect(ring.locator('.br-item').first()).toHaveAttribute('data-id', 'store');
  await ring.locator('.br-item[data-id="store"]').click();

  // the pieces ring: the Storage Box is first, costs six timber, and is affordable
  const box = ring.locator('.br-item[data-id="storage_crate"]');
  await expect(box).toBeVisible();
  await expect(box.locator('.br-sub')).toHaveText(/^6 timber$/);
  await expect(box).toHaveClass(/\bok\b/);
  await box.hover();
  await expect(ring.locator('.br-centre')).toContainText('you have');
  await box.click();

  await expect(ring).toBeHidden();
  const card = page.locator('#build-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Storage Box');
  expect(await page.evaluate(() => [window.farhold.build.selected, window.farhold.build.tool]))
    .toEqual(['storage_crate', 'build']);

  // aim at the ground in front of the character until the ghost is green, then click there
  const canvas = page.locator('#stage canvas');
  let placedAt = null;
  for (const [x, y] of [[640, 560], [640, 520], [560, 560], [720, 560], [640, 600], [640, 480]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    const ok = await page.evaluate(() => !!window.farhold.build.lastCheck?.ok);
    if (ok) { placedAt = [x, y]; break; }
  }
  expect(placedAt, `the ghost never went green: ${await page.evaluate(() => window.farhold.build.lastCheck?.why)}`).not.toBeNull();
  await expect(card).toContainText('Clear. Click to build.');
  await canvas.click({ position: { x: placedAt[0], y: placedAt[1] } });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const f = window.farhold;
    return { log: f.bag.count('log'), keys: f.build.entries.map(e => e.key), n: f.build.entries.length };
  });
  expect(after.keys, 'the click built nothing').toContain('storage_crate');
  expect(after.n).toBe(before.n + 1);
  expect(before.log - after.log, 'the Storage Box did not cost six logs').toBe(6);

  // right-click brings the ring back; Tab from it opens the long panel, whose Ring button returns
  await canvas.click({ position: { x: 640, y: 400 }, button: 'right' });
  await expect(ring).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(ring).toBeHidden();
  await expect(page.locator('#build-ui')).toBeVisible();
  await page.locator('#build-ui .build-ring-btn').click();
  await expect(ring).toBeVisible();
  // number keys pick: 1 is Storage, Backspace goes back, B leaves build mode altogether
  await page.keyboard.press('Digit1');
  await expect(ring.locator('.br-item[data-id="storage_crate"]')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(ring.locator('.br-item[data-id="store"]')).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(ring).toBeHidden();
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => window.farhold.build.mode)).toBe(false);

  expect(errors).toEqual([]);
});

test('a furnace with no box smelts out of the pack, lists one row for two, and says what it waits for', async ({ page }) => {
  test.setTimeout(200_000);
  const errors = await land(page);
  const spot = await flatSpot(page);
  expect(spot).not.toBeNull();

  const id = await page.evaluate(({ x, z }) => {
    const f = window.farhold;
    for (const [m, n] of Object.entries({ stone: 20, clay: 8, iron_ore: 4, log: 4 })) f.bag.add(m, n);
    f.build.select('furnace');
    f.build.aim(x + 4, z);
    const out = f.build.placeHere();
    return out?.entry?.id ?? f.build.entries.find(e => e.key === 'furnace')?.id ?? null;
  }, spot);
  expect(id, 'the furnace would not go down').not.toBeNull();
  expect(await page.evaluate(() => !!window.farhold.stores.poolAt(window.farhold.control.x, window.farhold.control.z)),
    'there is a store here, so this is not the no-box case').toBe(false);

  // E's door: the station screen
  await page.evaluate(fid => {
    const f = window.farhold;
    f.buildUI.openStation(f.build.entries.find(e => e.id === fid));
  }, id);
  const station = page.locator('#station-ui');
  await expect(station).toBeVisible();
  const smelt = station.locator('.build-recipe').filter({ has: page.locator('.build-row-name', { hasText: /^Smelt Iron$/ }) });
  await smelt.click();
  await smelt.click();                       // the user's two clicks of ×1
  await expect(station.locator('.build-job')).toHaveCount(1);
  await expect(station.locator('.build-job')).toContainText('0 of 2 made');
  // standing beside it is working it, so the first batch may already have taken its ore
  await expect(station.locator('.station-needs')).toContainText('Making Smelt Iron — 2 to go');
  await expect(station.locator('.station-needs')).toContainText(/Iron Ore: \d+ in your pack|This batch is loaded/);
  await expect(station.locator('.station-needs')).toContainText('No store in reach');
  await page.screenshot({ path: 'test-results/r26-furnace-queued.png' });

  // somebody works it (the same call holding E makes, a few units at once so the test is short)
  await page.evaluate(fid => { window.farhold.works.credit(fid, 4); }, id);
  await page.waitForFunction(() => window.farhold.bag.count('iron_ingot') >= 2, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/r26-furnace-done.png' });
  const out = await page.evaluate(() => ({ ingot: window.farhold.bag.count('iron_ingot'), ore: window.farhold.bag.count('iron_ore') }));
  expect(out.ingot).toBeGreaterThanOrEqual(2);
  expect(out.ore).toBe(0);
  expect(errors).toEqual([]);
});
