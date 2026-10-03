// Bannerline keyboard smoke + lobby loop (PLAN §19 #14): title -> lobby -> join + ready by keyboard
// -> countdown -> match at debug speed; sends, a skill rank, auto-send and a right-click move go
// through the real bindings; surrender from the pause menu -> results -> Back to the lobby (slot and
// device kept) -> ready again -> match -> fast-forward to a banners/cap result -> lobby -> title.
import { test, expect } from '@playwright/test';

const URL = 'prototypes/bannerline/?seed=4242&speed=8';

test('keyboard: title -> lobby -> match -> surrender -> results -> lobby (kept) -> match -> result -> title', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#screen-title')).toBeVisible();

  // Title -> lobby -> join (Enter) -> ready (Enter) -> 3-2-1 -> match.
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.lb-slot.local')).toHaveCount(1);
  await expect(page.locator('.lb-slot.local .lb-devname')).toContainText('Keyboard');
  // Speed is keyboard-reachable: Up x2 from Hero lands on Speed (host fields: Mode, Speed, AI seat).
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.lb-speed.pfocus')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lb-speed .chip.on')).toHaveText('Fast ×2');
  await page.keyboard.press('Enter');
  await expect(page.locator('.lb-slot.local.ready')).toHaveCount(1);
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.controlbar')).toHaveCount(1);

  const st = () => page.evaluate(() => {
    const s = window.bannerline.state();
    const p = s.players[0];
    return { tick: s.tick, income: p.income, sends: p.stats.sends, q: p.skills.find((k) => k.slot === 'Q').rank,
      pts: p.skillPts, auto: p.auto.slice(), over: !!s.result };
  });
  const before = await st();
  expect(before.pts).toBeGreaterThan(0);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyQ'); await page.keyboard.up('Control');
  await expect.poll(async () => (await st()).q).toBe(1);
  for (const k of ['KeyZ', 'KeyX', 'KeyZ']) await page.keyboard.press(k);
  await expect.poll(async () => (await st()).sends, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  expect((await st()).income).toBeGreaterThan(before.income);
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Shift');
  await expect.poll(async () => (await st()).auto[0]).toBe(true);
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height * 0.35, { button: 'right' });
  await expect.poll(async () => (await st()).tick, { timeout: 30_000 }).toBeGreaterThan(450);

  // Esc -> pause -> Down to Surrender -> Enter -> results.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pause-menu [data-act="surrender"]')).toHaveClass(/nav-focus/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-results')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.result-word')).toHaveText('Defeat');

  // Enter = Back to the lobby: the keyboard keeps its seat, not ready, and the last result shows.
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await expect(page.locator('.lb-slot.local')).toHaveCount(1);
  await expect(page.locator('.lb-slot.local.ready')).toHaveCount(0);
  await expect(page.locator('.lb-last')).toContainText('Defeat');
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await st()).tick, { timeout: 10_000 }).toBeGreaterThan(0);

  await page.evaluate(() => window.bannerline.fastForward(20 * 60 * 33));
  await expect(page.locator('#screen-results')).toBeVisible({ timeout: 15_000 });
  expect(['banners', 'cap']).toContain(await page.evaluate(() => window.bannerline.state().result.reason));
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');                 // back = lobby
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await page.keyboard.press('Escape');                 // leave the seat
  await expect(page.locator('.lb-slot.local')).toHaveCount(0);
  await page.keyboard.press('Escape');                 // nobody seated: back to the title
  await expect(page.locator('#screen-title')).toBeVisible();
  expect(errors).toEqual([]);
});
