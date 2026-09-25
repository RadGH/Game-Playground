// Farhold R17 — the interface half of the play-test list, in a real browser.
//
// The four reported faults here all needed a laid-out page to exist at all:
//   * the title tagline centred as TEXT inside a box that was itself shoved left;
//   * "[object HTMLElement]" over the weapon name, from `el(tag, cls, text)` being handed an
//     element, which also dropped every pip after the first;
//   * that same readout sitting across the middle of the open inventory;
//   * K opening the Holding and the combat log at once, with the log behind it and still up after
//     the Holding closed, and the cursor never coming back.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function land(page, query = '?auto=1&seed=4477&scale=0.35') {
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.farhold?.player, null, { timeout: 45000 });
}

test('the title tagline is centred, not left-aligned inside a centred block', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
  const off = await page.evaluate(() => {
    const p = document.querySelector('#boot .tagline');
    const box = p.closest('.boot-inner').getBoundingClientRect();
    const r = p.getBoundingClientRect();
    // how far the paragraph's own box is from being centred in its container
    return Math.abs((r.left - box.left) - (box.right - r.right));
  });
  expect(off).toBeLessThan(2);
});

// R25 — the held-mode ring was removed on request (it overlapped the "E to …" prompt). This
// replaces R17's test of how the ring drew: with a scanner owned, there is still no ring on screen.
test('R25 — owning a scanner puts no weapon/tool ring on the screen', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await page.evaluate(() => {
    const g = window.farhold;
    g.player.devices = { ...(g.player.devices || {}), scanner: true };
  });
  await page.waitForTimeout(1500);
  expect(await page.locator('.held-mode.on').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('the log and the Holding are tabs of the sheet, and K only does one thing', async ({ page }) => {
  const errors = watch(page);
  await land(page);

  // K opens the sheet on the Holding, and the cursor comes with it
  await page.keyboard.press('KeyK');
  await page.waitForSelector('#sheet:not(.hidden)');
  await expect(page.locator('.tab-body[data-tab="holding"]')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  // the Holding's own screen really is inside the tab, not a second overlay on the page
  await expect(page.locator('#sheet-body-holding .civics')).toHaveCount(1);
  await expect(page.locator('#sheet-body-holding .civics')).toHaveClass(/civics--tab/);
  // …and the combat log is NOT also open behind it
  await expect(page.locator('.tab-body[data-tab="log"]')).toHaveClass(/hidden/);

  // K again closes it
  await page.keyboard.press('KeyK');
  await expect(page.locator('#sheet')).toHaveClass(/hidden/);

  // the log is a tab you can reach, and nothing floats over the world any more
  expect(await page.locator('#log-history').count()).toBe(0);
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#sheet:not(.hidden)');
  await page.locator('#sheet-tabs button[data-tab="log"]').click();
  await expect(page.locator('.tab-body[data-tab="log"]')).not.toHaveClass(/hidden/);
  await expect(page.locator('#sheet-title')).toHaveText('What has happened');

  expect(errors).toEqual([]);
});

test('the rail numbers itself, and the digits pick the screen', async ({ page }) => {
  await land(page);
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#sheet:not(.hidden)');

  const caps = await page.locator('#sheet-tabs button:not([hidden]) .rail-key')
    .allTextContents();
  // 1..9 then 0, in order, with no repeats — the thing a hand-numbered rail gets wrong
  const wanted = caps.map((_, i) => (i < 9 ? String(i + 1) : i === 9 ? '0' : ''));
  expect(caps).toEqual(wanted);

  // tab 8 is the log, which is what the user asked for
  const eighth = await page.locator('#sheet-tabs button:not([hidden])').nth(7).getAttribute('data-tab');
  expect(eighth).toBe('log');
  await page.keyboard.press('8');
  await expect(page.locator('.tab-body[data-tab="log"]')).not.toHaveClass(/hidden/);
});

test('the character sheet vehicle rows: one speed for the mount, (None) for the ship', async ({ page }) => {
  await land(page);
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#sheet:not(.hidden)');

  const rows = await page.locator('.vehicle-row').allTextContents();
  const ship = rows.find(r => /Ship/.test(r));
  expect(ship).toContain('(None)');

  // the mount slot's note and the Ride row's note quote the same figure
  const mountNote = await page.evaluate(() => {
    const slot = [...document.querySelectorAll('#sheet .vehicle-row, #sheet .slot-row')]
      .find(n => /Mount/.test(n.textContent));
    return slot?.textContent || '';
  });
  const ride = rows.find(r => /Ride/.test(r)) || '';
  const num = s => (s.match(/([\d.]+)\s*m\/s/) || [])[1];
  if (num(mountNote) && num(ride)) expect(num(mountNote)).toBe(num(ride));
});

/**
 * R17 — THE CHEAPEST TEST IN THE ROUND, AND IT CAUGHT A REAL ONE.
 *
 * Moving `settlementAnchor` into js/town-plan.js and forgetting to widen js/features.js's import of
 * that file took the whole game down — `node --check` cannot see it (the name is legal, it is just
 * never bound), and no node test can either, because js/features.js imports Three.js and the node
 * tests cannot load it. A bare "does it boot, and did it say anything red" is the only thing that
 * covers that class, and this round added nine modules and touched eleven files.
 */
test('the game boots with nothing red in the console', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});
