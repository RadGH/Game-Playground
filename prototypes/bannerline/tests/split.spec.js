// Split screen (PLAN §19 #18): keyboard + pad join -> two non-blank viewports, two control bars,
// panels per half; the mouse acts only in the keyboard player's half.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

test('two local players: two views, two bars, per-half panels, mouse stays in its half', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: PADMOCK });
  await page.goto('prototypes/bannerline/?seed=7&speed=2');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.keyboard.press('Enter');                        // modes
  await expect(page.locator('#screen-modes')).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');                        // lobby (Line War)
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await page.keyboard.press('Enter');                        // keyboard joins (blue)
  await page.evaluate(() => window.__pad.connect(0));
  await tap(page, 0, STD.A);                                 // pad joins: takes the red AI seat (couch 1v1)
  await expect(page.locator('.lb-slot.local')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await tap(page, 0, STD.A);
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.view-root')).toHaveCount(2);
  await expect(page.locator('.controlbar')).toHaveCount(2);
  await page.waitForTimeout(800);

  const probe = await page.evaluate(() => window.bannerline.probe());
  expect(probe.length).toBe(2);
  for (const p of probe) { expect(p.sd).toBeGreaterThan(3); expect(p.rect.w).toBeGreaterThan(500); }
  expect(probe[0].rect.x).toBe(0);
  expect(probe[1].rect.x).toBe(probe[0].rect.w);

  // Pad View opens the Outfitter in the RIGHT half only; keyboard B opens the Barracks on the left.
  await tap(page, 0, STD.View);
  await expect(page.locator('.view-root[data-view="1"] .tp-shop')).toBeVisible();
  await expect(page.locator('.view-root[data-view="0"] .tp-shop')).toBeHidden();
  await page.keyboard.press('KeyB');
  await expect(page.locator('.view-root[data-view="0"] .tp-barracks')).toBeVisible();
  await expect(page.locator('.view-root[data-view="1"] .tp-barracks')).toBeHidden();

  // A right-click over the pad's half does nothing for the keyboard hero.
  const vp = page.viewportSize();
  const before = await page.evaluate(() => window.bannerline.state().players[0]);
  const cmdsBefore = await page.evaluate(() => window.bannerline.views()[0].seat.take().length);
  await page.mouse.click(vp.width * 0.75, vp.height * 0.3, { button: 'right' });
  await page.waitForTimeout(200);
  const queued = await page.evaluate(() => window.bannerline.views()[0].seat.take());
  expect(queued.filter((c) => c.type === 'move')).toHaveLength(0);
  expect(cmdsBefore).toBeGreaterThanOrEqual(0);
  expect(before.team).toBe(0);
  await page.screenshot({ path: 'test-results/bannerline-split.png' });
  expect(errors).toEqual([]);
});
