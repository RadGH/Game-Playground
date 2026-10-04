// Campaign in the real game (stream F's screens, wired by B): title -> Campaign -> Enter plays the
// first mission in 3D with the objective overlay; at the end the debrief replaces the results and
// "Campaign map" (or Esc) goes back to the map.
import { test, expect } from '@playwright/test';

test('campaign: map -> mission in the 3D game with the overlay -> debrief -> map', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto('prototypes/bannerline/?seed=3&speed=2');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.click('[data-act="campaign"]');
  await expect(page.locator('#screen-campaign')).toBeVisible();
  await expect(page.locator('.campaign')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.cp-overlay')).toHaveCount(1);
  expect(await page.evaluate(() => !!window.bannerline.state().campaign || !!window.bannerline.match.session.campaign)).toBe(true);
  await page.evaluate(() => window.bannerline.fastForward(20 * 60 * 40));
  await expect(page.locator('.cp-debrief')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await page.click('.cp-debrief [data-act="map"]');
  await expect(page.locator('#screen-campaign')).toBeVisible();
  expect(errors).toEqual([]);
});
