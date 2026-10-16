import { test, expect } from '@playwright/test';

test('Gravenhold M0 room and M1 class hotbar load and work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/prototypes/gravenhold/');
  await expect(page.locator('#status'), errors.join('\n')).toHaveText('Room ready', { timeout: 20_000 });
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#class-select option')).not.toHaveCount(0);
  await expect(page.locator('#hotbar button')).toHaveCount(3);
  await page.getByRole('button', { name: /Star Dart/ }).click();
  await expect(page.locator('#status')).toHaveText('Star Dart cast');
  const toggle = page.getByRole('button', { name: 'Tilt shift: off' });
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/tilt/);
  await expect(page.getByRole('button', { name: 'Tilt shift: on' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
