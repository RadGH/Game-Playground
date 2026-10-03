// Pad-only walk (PLAN §19 #17): a controller alone goes title -> modes -> lobby -> match -> hire
// units at the Barracks (hold A) -> buy an item at the Outfitter in two presses (View, A) -> train
// at the Drill Yard -> results -> lobby, with ZERO mouse or keyboard events.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

test('pad only: lobby -> match -> hire -> two-press item -> train -> results -> lobby', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: PADMOCK });
  await page.addInitScript(() => {
    try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ }
    window.__kbmEvents = 0;
    for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) {
      window.addEventListener(t, (e) => { if (e.isTrusted) window.__kbmEvents++; }, true);
    }
  });
  await page.goto('prototypes/bannerline/?seed=31&speed=2');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => window.__pad.connect(0));

  await tap(page, 0, STD.A);                                // title: Play
  await expect(page.locator('#screen-modes')).toBeVisible();
  await tap(page, 0, STD.A);                                // Line War
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await tap(page, 0, STD.A);                                // join
  await expect(page.locator('.lb-slot.local')).toHaveCount(1);
  await tap(page, 0, STD.DRight);                           // next hero
  await tap(page, 0, STD.A);                                // ready -> countdown
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });

  const me = () => page.evaluate(() => { const p = window.bannerline.state().players[0]; return { sends: p.stats.sends, items: p.stats.itemGold, upg: p.stats.upgradeGold, gold: p.gold, q: p.skills[0].rank }; });
  // D-pad down opens the Barracks; holding A keeps hiring.
  await tap(page, 0, STD.DDown);
  await expect(page.locator('.tp-barracks')).toBeVisible();
  await tap(page, 0, STD.A, 900);
  await expect.poll(async () => (await me()).sends, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await tap(page, 0, STD.B);
  await expect(page.locator('.tp-barracks')).toBeHidden();
  // LT + X learns Q.
  await page.evaluate(() => window.__pad.down(0, 6));
  await tap(page, 0, STD.X);
  await page.evaluate(() => window.__pad.up(0, 6));
  await expect.poll(async () => (await me()).q).toBe(1);
  // Earn some gold, then two presses to an item: View opens the Outfitter (the hero stands in it), A buys.
  await page.evaluate(() => window.bannerline.fastForward(20 * 50));
  await tap(page, 0, STD.View);
  await expect(page.locator('.tp-shop')).toBeVisible();
  await expect(page.locator('.ot-item.nav-focus')).toHaveCount(1);
  await tap(page, 0, STD.A);
  await expect.poll(async () => (await me()).items, { timeout: 10_000 }).toBeGreaterThan(0);
  await tap(page, 0, STD.B);
  // D-pad up opens the Drill Yard; A trains the focused upgrade.
  await page.evaluate(() => window.bannerline.fastForward(20 * 40));
  await tap(page, 0, STD.DUp);
  await expect(page.locator('.tp-drillyard')).toBeVisible();
  await tap(page, 0, STD.A);
  await expect.poll(async () => (await me()).upg, { timeout: 10_000 }).toBeGreaterThan(0);
  await tap(page, 0, STD.B);

  await page.evaluate(() => window.bannerline.fastForward(20 * 60 * 33));
  await expect(page.locator('#screen-results')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await tap(page, 0, STD.A);                                // Back to the lobby (focused)
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await expect(page.locator('.lb-slot.local')).toHaveCount(1);
  expect(await page.evaluate(() => window.bannerline.session.slots[0].device)).toBe('pad0');
  expect(await page.evaluate(() => window.__kbmEvents)).toBe(0);
  expect(errors).toEqual([]);
});
