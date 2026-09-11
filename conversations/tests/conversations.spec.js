import { test, expect } from '@playwright/test';
test('conversations demo unlocks topics from facts and produces exchanges', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('conversations/'); await page.waitForFunction(() => !!window.conversationsDemo, null, { timeout: 60000 });
  expect(await page.locator('.elig span.on').count()).toBeGreaterThanOrEqual(4); expect(await page.locator('#conv p').count()).toBeGreaterThanOrEqual(4);
  await page.check('#f-worse'); await page.check('#f-rel'); const after = await page.locator('.elig span.on').count(); expect(after).toBeGreaterThanOrEqual(6); await page.click('#btn-talk5'); expect(await page.locator('#conv p').count()).toBeGreaterThanOrEqual(12); expect(errors).toEqual([]);
});
