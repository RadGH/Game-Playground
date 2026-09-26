// First launch on a phone-sized touch screen: the "Desktop recommended" and "Before you start" cards must both
// close on a tap, and touch alone must reach the Guild Hall. (The Done button once threw and trapped every first
// launch: ctx.settings had a getter and no setter.)
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'], browserName: 'chromium' });

test('first launch on a phone: both cards close and touch reaches the Guild Hall', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/lanternfall/index.html');
  await page.waitForFunction(() => window.lanternfall?.ready, null, { timeout: 60000 });
  await expect(page.locator('.lf-modal')).toHaveCount(2);
  const tapText = async text => {
    const c = await page.evaluate(t => { const b = [...document.querySelectorAll('#screens button:not([disabled])')].find(b => b.offsetWidth && b.textContent.trim().startsWith(t)); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, text);
    expect(c, `button "${text}"`).not.toBeNull(); await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(400);
  };
  await tapText('Continue anyway'); await tapText('Done');
  await expect(page.locator('.lf-modal')).toHaveCount(0);
  for (const t of ['New Game', 'SLOT 1', 'Choose', 'Begin the descent']) await tapText(t);
  await page.waitForFunction(() => lanternfall.game && !lanternfall.game.titleScreen, null, { timeout: 20000 });
  expect(await page.evaluate(() => lanternfall.game.room.room.id)).toBe('a1_n01_r0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lanternfall:settings') || localStorage.getItem('lanternfall/settings') || 'null')?.firstRunDone ?? 'unknown')).not.toBe(false);
  expect(errors).toEqual([]);
});
