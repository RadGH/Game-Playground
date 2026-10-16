// Chibi 2.5 hair pass 2, in a real browser: from eight angles (front, three quarters, side, back three quarters, back,
// other side, top, from below) every back face of the HAIR that can be seen is painted magenta and counted
// (chibi25-sheet.html?xray=1). The material is front-side only, so a visible back face is a hole you look through.
// Bald scores ~16 px (brows and lids, which are hair-coloured); a style may add no more than 40 px across all eight views.
// Before hair pass 2 the 30 older styles scored 15,248 px together (the worst, the mullet, 1,912).
//   flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/chibi25-hair.spec.js
import { test, expect } from '@playwright/test';

test('hair x-ray: no style can be seen through from any of eight angles', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/chibi25-sheet.html?slot=hair&views=all&size=170&cols=2&xray=1');
  await page.waitForFunction(() => window.sheetReady, null, { timeout: 400_000 });
  const counts = await page.evaluate(() => window.xrayCounts);
  const total = c => Object.values(c).reduce((a, b) => a + b, 0);
  const base = total(counts.bald);
  const over = Object.entries(counts).filter(([id, c]) => total(c) - base > 40).map(([id, c]) => `${id}: ${total(c) - base} px ${JSON.stringify(c)}`);
  await page.screenshot({ path: 'test-results/chibi25-hair-xray.png', fullPage: true });
  expect(Object.keys(counts).length).toBeGreaterThanOrEqual(44);
  expect(over).toEqual([]);
  expect(errors).toEqual([]);
});
