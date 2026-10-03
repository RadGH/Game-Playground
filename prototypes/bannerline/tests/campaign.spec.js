// Campaign in the browser (stream F): the mission map, briefing, a real play of mission 1 at 8x speed
// on campaign.html (2D preview: same sim, script, objective tracker and debrief as the 3D game), and
// progress saved across a reload (mission 2 unlocks, stars kept).
import { test, expect } from '@playwright/test';

const URL = 'prototypes/bannerline/campaign.html';

test('campaign: map + briefing, play mission 1 at 8x, victory debrief, progress saved', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '?reset=1&speed=8&seed=7');
  await page.waitForFunction(() => window.cmp && window.cmp.ok);
  await expect(page.locator('.cp-title h1')).toHaveText('Banners of the Vale');
  await expect(page.locator('.cp-chapter')).toHaveCount(5);
  await expect(page.locator('.cp-chapter.locked')).toHaveCount(4);
  await expect(page.locator('.cp-node')).toHaveCount(5);
  await expect(page.locator('.cp-node.locked')).toHaveCount(4);
  await expect(page.locator('.cp-brief h2')).toContainText('First Banner');
  await page.screenshot({ path: 'test-results/bannerline-campaign-map.png' });

  await page.keyboard.press('Enter');                       // Play
  await expect(page.locator('#screen-play')).toBeVisible();
  await expect(page.locator('.cp-track-head')).toContainText('First Banner');
  // play it: hire from the Barracks bar, learn Cleave, hold the field in front of the Keep
  for (let i = 0; i < 6; i++) await page.locator('[data-send="levy"]').click();
  await page.locator('[data-cast="Q"]').click();
  await page.evaluate(() => { const m = window.cmp.match; const f = m.sim.map.fields[0]; window.cmp.issue({ p: 0, type: 'amove', x: f.cx, z: 112 }); });
  await expect(page.locator('.cp-track-list li.done')).not.toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('.cp-say.on')).toBeVisible({ timeout: 30000 });
  // keep hiring as gold comes in
  const hire = setInterval(() => page.locator('[data-send="levy"]').click({ timeout: 500 }).catch(() => {}), 400);
  await expect(page.locator('.cp-debrief')).toBeVisible({ timeout: 150000 });
  clearInterval(hire);
  await expect(page.locator('.cp-debrief h1')).toHaveText('Victory');
  await expect(page.locator('.cp-debrief .cp-star.on')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/bannerline-campaign-debrief.png' });

  // the map remembers: mission 1 won, mission 2 open
  await page.locator('[data-act="map"]').click();
  await expect(page.locator('.cp-node.won')).toHaveCount(1);
  await page.goto(URL);   // no ?reset: progress must come back from localStorage
  await page.waitForFunction(() => window.cmp && window.cmp.ok);
  await expect(page.locator('.cp-node.locked')).toHaveCount(3);
  await expect(page.locator('.cp-node.on .cp-name')).toHaveText('Hold the Ford');
  expect(errors).toEqual([]);
});

test('campaign map fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL + '?reset=1');
  await page.waitForFunction(() => window.cmp && window.cmp.ok);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/bannerline-campaign-phone.png', fullPage: true });
});
