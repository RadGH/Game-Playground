// Bannerline M1 keyboard smoke (PLAN §19 #14, M1 cut): title -> setup -> match vs AI at debug
// speed, all by keyboard; sends, a skill rank and Muster go through the real key bindings; then
// surrender through the pause menu -> results -> play again -> results by banners (fast-forward)
// -> title. Runs on the dev server (8401).
import { test, expect } from '@playwright/test';

const URL = 'prototypes/bannerline/';

test('keyboard: title -> match -> surrender -> results -> again -> banners result -> title', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL + '?seed=4242');
  await expect(page.locator('#screen-title')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 15_000 });

  // Title -> setup -> pick Debug x8 with the keyboard? The chips are mouse/pad UI; speed comes from
  // the URL in tests. Enter opens the setup, Enter marches.
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-setup')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-match')).toBeVisible();
  await expect(page.locator('.controlbar')).toBeVisible();
  await page.evaluate(() => window.bannerline.match.clock.setSpeed(8));

  const st = () => page.evaluate(() => {
    const s = window.bannerline.state();
    const p = s.players[0];
    return { tick: s.tick, gold: p.gold, income: p.income, sends: p.stats.sends, queued: p.queued.length,
      q: p.skills.find((k) => k.slot === 'Q').rank, pts: p.skillPts, auto: p.auto.slice(), over: !!s.result };
  });

  // Learn Q with Ctrl+Q (the hero starts with one point).
  const before = await st();
  expect(before.pts).toBeGreaterThan(0);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyQ'); await page.keyboard.up('Control');
  await expect.poll(async () => (await st()).q).toBe(1);

  // Sends: Z X Z (tier 1 units), income rises on purchase.
  for (const k of ['KeyZ', 'KeyX', 'KeyZ']) await page.keyboard.press(k);
  await expect.poll(async () => (await st()).sends, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const after = await st();
  expect(after.income).toBeGreaterThan(before.income);

  // Shift+Z turns on auto-send for deck slot 0.
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Shift');
  await expect.poll(async () => (await st()).auto[0]).toBe(true);

  // Right-click on the ground issues a move (the hero walks).
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height * 0.35, { button: 'right' });
  // Let the clock run at x8 for a few seconds: ticks advance, a Pay happens.
  await expect.poll(async () => (await st()).tick, { timeout: 30_000 }).toBeGreaterThan(450);
  await expect(page.locator('.tb-stat.gold .v')).not.toHaveText('');

  // Esc -> pause menu (focus on Resume) -> Down to Surrender -> Enter.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pause-menu [data-act="surrender"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-results')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.result-word')).toHaveText('Defeat');
  await page.screenshot({ path: 'test-results/bannerline-results.png' });

  // Enter = play again -> a fresh match.
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-results')).toBeHidden();
  await expect.poll(async () => (await st()).tick, { timeout: 10_000 }).toBeGreaterThan(0);
  expect((await st()).over).toBe(false);

  // Idle hero vs the AI: fast-forward until the match ends on banners (or the clock cap).
  await page.evaluate(() => window.bannerline.fastForward(20 * 60 * 33));
  await expect(page.locator('#screen-results')).toBeVisible({ timeout: 15_000 });
  const reason = await page.evaluate(() => window.bannerline.state().result.reason);
  expect(['banners', 'cap']).toContain(reason);
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-title')).toBeVisible();
  expect(errors).toEqual([]);
});
