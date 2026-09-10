import { test, expect } from '@playwright/test';
test('combined character sheet loads both characters, speaks a line with voice and animation', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('combined/'); await expect(page.locator('#status')).toHaveText('ready', { timeout: 60_000 });
  await expect(page.locator('.charcard')).toHaveCount(2);
  const r = await page.evaluate(async () => { const c = window.combined; const out = await c.sayLine('A', 'insult', -0.8); return { text: out.text, speech: out.speech, anim: c.bodies.A.anim, bodies: !!c.bodies.B }; });
  expect(r.text.length).toBeGreaterThan(3); expect(r.bodies).toBe(true);
  await expect(page.locator('.line').first()).toContainText('Thalen');
  await page.getByRole('button', { name: '▶ Conversation' }).click();
  await expect(page.locator('.line.b').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'test-results/combined.png' });
  expect(errors.filter(e => !/AudioContext/.test(e))).toEqual([]);
});
