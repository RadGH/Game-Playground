import { test, expect } from '@playwright/test';
test('Item Vault rolls loot, filters by race/tags, shows catalog', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('items/'); await expect(page.locator('#status')).toContainText('items match');
  expect(await page.locator('.loot').count()).toBe(8);
  await page.locator('.race-chips .chip', { hasText: 'goblin' }).click(); await expect(page.locator('#status')).toContainText('goblin');
  await page.locator('.tag-cloud .chip', { hasText: /^crude$/ }).click();
  await page.getByRole('button', { name: '🎲 Roll loot' }).click();
  const texts = await page.locator('.loot .m').allTextContents(); expect(texts.every(t => t.includes('crude') || t.includes('tags:'))).toBe(true);
  expect(await page.locator('.catalog tbody tr').count()).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
