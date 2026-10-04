// Hunters vs Farmers from the main menu (stream H's game module, hooked into main.js by B):
// title -> Play -> the HvF card -> H's setup card -> Start -> a running HvF match on the shared
// renderer -> leave -> modes -> Line War still starts cleanly afterwards (the vale comes back).
import { test, expect } from '@playwright/test';

test('HvF starts from the mode screen and hands the renderer back', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto('prototypes/bannerline/?seed=5');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.click('[data-act="play"]');
  await expect(page.locator('#screen-modes')).toBeVisible();
  await page.click('.md-card.ready[data-mode="hvf"]');
  await expect(page.locator('#screen-hvf')).toBeVisible();
  await expect(page.locator('.hvf-setup')).toBeVisible();
  await page.click('.hvf-setup [data-act="start"]');
  await expect.poll(() => page.evaluate(() => window.hvf?.state?.()?.tick || 0), { timeout: 30_000 }).toBeGreaterThan(10);
  const probe = await page.evaluate(() => window.bannerline.probe());
  expect(probe.some((p) => p.sd > 3)).toBe(true);
  // Leave through the module's own exit, back to the modes, then play line war.
  await page.evaluate(() => window.bannerline.hvf.end());
  await page.evaluate(() => window.bannerline.start({}));
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.bannerline.state()?.tick || 0)).toBeGreaterThan(5);
  const p2 = await page.evaluate(() => window.bannerline.probe());
  expect(p2[0].sd).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
