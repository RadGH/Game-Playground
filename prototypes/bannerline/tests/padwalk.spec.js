// Pad-only walk (PLAN §19 #17): a controller alone goes title -> lobby -> match -> send -> buy an
// upgrade in two presses -> results -> lobby, with ZERO mouse or keyboard events.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

test('pad only: lobby -> match -> send -> two-press upgrade -> results -> lobby', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: PADMOCK });
  await page.addInitScript(() => {
    window.__kbmEvents = 0;
    for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) {
      window.addEventListener(t, (e) => { if (e.isTrusted) window.__kbmEvents++; }, true);
    }
  });
  await page.goto('prototypes/bannerline/?seed=31&speed=2');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => window.__pad.connect(0));

  await tap(page, 0, STD.A);                                // title: Play
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await tap(page, 0, STD.A);                                // join
  await expect(page.locator('.lb-slot.local')).toHaveCount(1);
  // D-pad down x2 -> Team... then back up to Hero and pick the next hero with right.
  await tap(page, 0, STD.DRight);
  await tap(page, 0, STD.A);                                // ready -> countdown
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });

  const me = () => page.evaluate(() => { const p = window.bannerline.state().players[0]; return { sends: p.stats.sends, gear: p.stats.itemGold, gold: p.gold, pts: p.skillPts, q: p.skills[0].rank }; });
  // LB + d-pad up = send deck slot 1.
  await page.evaluate(() => window.__pad.down(0, 4));
  await tap(page, 0, STD.DUp);
  await page.evaluate(() => window.__pad.up(0, 4));
  await expect.poll(async () => (await me()).sends, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  // LT + X learns Q.
  await page.evaluate(() => window.__pad.down(0, 6));
  await tap(page, 0, STD.X);
  await page.evaluate(() => window.__pad.up(0, 6));
  await expect.poll(async () => (await me()).q).toBe(1);
  // Two presses to an upgrade: View opens the Armory with "Buy the cheapest" focused, A buys.
  await tap(page, 0, STD.View);
  await expect(page.locator('.shop-panel')).toBeVisible();
  await expect(page.locator('.sp-best')).toHaveClass(/nav-focus/);
  await tap(page, 0, STD.A);
  await expect.poll(async () => (await me()).gear, { timeout: 10_000 }).toBeGreaterThan(0);
  await tap(page, 0, STD.B);                                // close
  await expect(page.locator('.shop-panel')).toBeHidden();

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
