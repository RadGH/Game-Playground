// Playwright: builder loads clean, randomize/presets/JSON round-trip, screenshot for the record.
import { test, expect } from '@playwright/test';
test.describe('avatar-2d', () => {
  test('loads, randomizes, applies preset, JSON round-trips', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('avatar-2d/'); await expect(page.locator('#status')).toContainText('parts');
    await expect(page.locator('#preview svg')).toBeVisible();
    const before = await page.locator('#json').inputValue();
    await page.getByRole('button', { name: '🎲 Random' }).click();
    const after = await page.locator('#json').inputValue(); expect(after).not.toEqual(before);
    await page.locator('.presets .card').nth(2).click();
    const j = JSON.parse(await page.locator('#json').inputValue()); expect(j.name).toBe('Wizard'); expect(j.avatar.hat.id).toBe('wizard');
    const round = await page.evaluate(() => { const a = window.avatar2d.avatar; window.avatar2d.set(JSON.parse(JSON.stringify(a))); return JSON.stringify(window.avatar2d.avatar) === JSON.stringify(a); });
    expect(round).toBe(true);
    await page.locator('#preview').screenshot({ path: 'test-results/avatar-2d-wizard.png' });
    expect(errors).toEqual([]);
  });
  test('slot arrows cycle parts and the gallery renders every hair', async ({ page }) => {
    await page.goto('avatar-2d/'); await expect(page.locator('#status')).toContainText('parts');
    const hairSel = page.locator('.slot-row').filter({ has: page.locator('label', { hasText: /^Hair$/ }) }).locator('select');
    const first = await hairSel.inputValue();
    await page.locator('.slot-row').filter({ has: page.locator('label', { hasText: /^Hair$/ }) }).getByRole('button', { name: '›' }).click();
    expect(await hairSel.inputValue()).not.toEqual(first);
    await page.locator('.panel', { hasText: 'Part gallery' }).locator('h3').click();
    const n = await page.evaluate(() => Object.keys(window.avatar2d.PARTS.hair).length);
    await expect(page.locator('.gallery .g')).toHaveCount(n);
  });
});
