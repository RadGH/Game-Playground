import { test, expect } from '@playwright/test';
test('meter demo simulates fights and drills down three levels', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('meters/'); await page.waitForFunction(() => !!window.meterDemo);
  expect(await page.locator('.meter-row').count()).toBeGreaterThanOrEqual(4); await page.locator('.meter-row').first().click(); expect(await page.locator('.meter-crumb').count()).toBe(1); const src = await page.locator('.meter-row').count(); expect(src).toBeGreaterThan(0);
  await page.locator('.meter-row').first().click(); expect(await page.locator('.meter-hits tbody tr').count()).toBeGreaterThan(0); await page.click('button:has-text("Healing")'); await page.click('button:has-text("Damage taken")'); expect(await page.locator('.meter-row').count()).toBeGreaterThan(0); expect(errors).toEqual([]);
});
