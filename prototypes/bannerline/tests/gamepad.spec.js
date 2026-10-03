// Gamepad mocks (PLAN §19 #16): a standard pad, an EMPTY-mapping pad (Firefox on Linux: raw X-input
// indices, triggers and the d-pad on axes) and the duplicate-pad case (one physical pad exposed
// twice). Each joins with A, readies, and moves the hero with the left stick in a match.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, XRAW, tap } from './helpers/padmock.js';

const URL = 'prototypes/bannerline/?seed=99&speed=2';

async function boot(page) {
  await page.addInitScript({ content: PADMOCK });
  await page.goto(URL);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
}
const slots = (page) => page.evaluate(() => window.bannerline.session.slots.map((s) => ({ key: s.key, kind: s.kind, device: s.device, ready: s.ready })));
const heroPos = (page, p = 0) => page.evaluate((pl) => { const s = window.bannerline.state(); const h = s.ents.find((e) => e.id === s.players[pl].heroEnt); return { x: h.x, z: h.z }; }, p);

async function walkUp(page, index, axisY, value = -1) {
  const before = await heroPos(page);
  await page.evaluate(([i, a, v]) => window.__pad.axis(i, a, v), [index, axisY, value]);
  await expect.poll(async () => { const p = await heroPos(page); return before.z - p.z; }, { timeout: 15_000 }).toBeGreaterThan(2);
  await page.evaluate(([i, a]) => window.__pad.axis(i, a, 0), [index, axisY]);
}

test('standard-mapping pad: A on the title, join, ready, stick moves the hero', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.evaluate(() => window.__pad.connect(0));
  await tap(page, 0, STD.A);                                // title: Play
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await tap(page, 0, STD.A);                                // join
  await expect.poll(async () => (await slots(page))[0]).toMatchObject({ kind: 'local', device: 'pad0' });
  await expect(page.locator('.lb-slot.local .lb-dev svg')).toHaveCount(1);
  await expect(page.locator('.lb-slot.local .lb-devname')).toContainText('Xbox controller');
  await tap(page, 0, STD.A);                                // ready
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await walkUp(page, 0, 1);
  expect(errors).toEqual([]);
});

test('empty-mapping pad (Firefox Linux layout): hat d-pad + raw indices still drive the menus', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.evaluate(() => window.__pad.connect(1, { id: '045e-028e-Microsoft X-Box 360 pad', mapping: '', buttons: 11, axes: 8 }));
  await page.evaluate(() => { for (const a of [2, 5]) window.__pad.axis(1, a, -1); });   // triggers rest at -1
  await tap(page, 1, XRAW.A);
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await tap(page, 1, XRAW.A);                               // join
  await expect.poll(async () => (await slots(page))[0]).toMatchObject({ kind: 'local', device: 'pad1' });
  // The d-pad is a hat on axis 6: right changes the hero.
  const heroBefore = await page.evaluate(() => window.bannerline.session.slots[0].hero);
  await page.evaluate(() => window.__pad.axis(1, 6, 1));
  await page.waitForTimeout(260);
  await page.evaluate(() => window.__pad.axis(1, 6, 0));
  await expect.poll(() => page.evaluate(() => window.bannerline.session.slots[0].hero)).not.toBe(heroBefore);
  await tap(page, 1, XRAW.Menu);                            // Start also readies
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await walkUp(page, 1, 1);
  expect(errors).toEqual([]);
});

test('duplicate pads: one physical pad seen twice joins once', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.keyboard.press('Enter');                       // title -> lobby (keyboard, but it stays unseated)
  await expect(page.locator('#screen-lobby')).toBeVisible();
  const id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  await page.evaluate((pid) => { window.__pad.connect(0, { id: pid }); window.__pad.connect(1, { id: pid }); }, id);
  // The same press arrives on both indices in the same frame.
  await page.evaluate(() => { window.__pad.down(0, 0); window.__pad.down(1, 0); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__pad.up(0, 0); window.__pad.up(1, 0); });
  await page.waitForTimeout(300);
  const s = await slots(page);
  expect(s.filter((x) => x.kind === 'local').length).toBe(1);
  expect(await page.evaluate(() => window.bannerline.devices.get('pad1').duplicate)).toBe(true);
  // Further presses on the ghost do nothing; the real pad still readies.
  await tap(page, 0, STD.A);
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
