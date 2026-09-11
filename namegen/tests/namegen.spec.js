import { test, expect } from '@playwright/test';
test('Name Forge generates, switches race, favourites and exports', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('namegen/'); await expect(page.locator('#status')).toContainText('×');
  expect(await page.locator('.names .name').count()).toBeGreaterThan(5);
  await page.locator('.race-chips .chip', { hasText: 'orc' }).click(); await expect(page.locator('#status')).toContainText('orc');
  const first = await page.locator('.names .name .t').first().textContent(); expect(first.length).toBeGreaterThan(2);
  await page.locator('.names .name').first().click(); expect(await page.locator('.fav .name').count()).toBe(1);
  await page.getByRole('button', { name: 'One of everything, every race' }).click(); expect(await page.locator('.grid-all tbody tr').count()).toBe(12);
  expect(errors).toEqual([]);
});
