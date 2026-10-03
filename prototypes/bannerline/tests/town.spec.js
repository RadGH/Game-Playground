// Town buildings + camera (owner round 2): R2.6 the hire button and B both open the Barracks and
// hiring raises income; the 3D building opens on click; a pad opens it with the d-pad and hires
// with A; the Outfitter refuses away from it ("Walk to the Outfitter"); a Sanctum power is aimed and
// cast into the enemy field; F moves the camera into the rival's field; tooltips explain things.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

async function start(page, extra = '') {
  await page.addInitScript({ content: PADMOCK });
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto('prototypes/bannerline/?autostart=1&seed=11' + extra);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.controlbar')).toBeVisible();
}
const me = (page) => page.evaluate(() => { const p = window.bannerline.state().players[0]; return { sends: p.stats.sends, income: p.income, gold: p.gold, items: p.stats.itemGold, powers: p.stats.powerGold }; });

test('R2.6: the hire button and B open the Barracks; hiring raises income; the building opens on click', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const before = await me(page);

  await page.click('.cc-hire');                                       // the control-bar button
  await expect(page.locator('.tp-barracks')).toBeVisible();
  await expect(page.locator('.bk-card')).toHaveCount(await page.evaluate(() => window.bannerline.state().players[0] && window.bannerline.match.sim.data.races.races[window.bannerline.state().players[0].race].units.length));
  await page.locator('.bk-card').first().click();
  await expect.poll(async () => (await me(page)).sends).toBeGreaterThan(before.sends);
  await expect.poll(async () => (await me(page)).income).toBeGreaterThan(before.income);
  await expect(page.locator('.tw-detail .sd-line')).toContainText('income for the rest of the match');
  // Tooltip on a unit card.
  await page.locator('.bk-card').nth(1).hover();
  await expect(page.locator('#tipbox')).toBeVisible();
  await expect(page.locator('#tipbox')).toContainText('income');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tp-barracks')).toBeHidden();

  await page.keyboard.press('KeyB');                                  // the hotkey
  await expect(page.locator('.tp-barracks')).toBeVisible();
  const mid = (await me(page)).sends;
  await page.keyboard.press('KeyQ');                                  // grid key = first unit
  await expect.poll(async () => (await me(page)).sends).toBeGreaterThan(mid);
  await page.keyboard.press('KeyB');
  await expect(page.locator('.tp-barracks')).toBeHidden();

  // Clicking the Barracks building in the 3D view opens it too.
  const pt = await page.evaluate(() => {
    const v = window.bannerline.views()[0];
    const b = v.buildings.find((x) => x.kind === 'barracks');
    const p = v.camera.project(b.x, 1.5, b.z, v.vp.rect);
    return { x: p.x, y: p.y, visible: p.visible };
  });
  expect(pt.visible).toBe(true);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('.tp-barracks')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pad: d-pad down opens the Barracks, A hires (hold keeps hiring), B closes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript({ content: PADMOCK });
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto('prototypes/bannerline/?seed=12');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => window.__pad.connect(0));
  for (let i = 0; i < 4; i++) await tap(page, 0, STD.A);              // title, mode, join, ready
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 10_000 });
  await tap(page, 0, STD.DDown);
  await expect(page.locator('.tp-barracks')).toBeVisible();
  await tap(page, 0, STD.A, 1000);
  await expect.poll(async () => (await me(page)).sends).toBeGreaterThanOrEqual(2);
  await tap(page, 0, STD.B);
  await expect(page.locator('.tp-barracks')).toBeHidden();
});

test('Outfitter needs the hero beside it; a Sanctum power is cast into the enemy field; F looks at the rival field', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.evaluate(() => window.bannerline.fastForward(20 * 90));  // earn gold
  // At the start the hero stands in the Outfitter: buying works.
  await page.keyboard.press('KeyO');
  await expect(page.locator('.tp-shop')).toBeVisible();
  await expect(page.locator('.ot-away')).toBeHidden();
  await page.locator('.ot-item.can').first().dblclick();
  await expect.poll(async () => (await me(page)).items).toBeGreaterThan(0);
  await expect(page.locator('.ot-inv:not(.empty)')).not.toHaveCount(0);
  await expect(page.locator('.inv-slot:not(.empty)')).not.toHaveCount(0);   // the control bar shows it too
  await page.keyboard.press('Escape');
  // Walk away up the field: the Outfitter now says to walk back.
  await page.evaluate(() => { const v = window.bannerline.views()[0]; v.seat.issue({ type: 'move', x: v.myField.cx ?? (v.myField.x0 + v.myField.x1) / 2, z: 40 }); window.bannerline.fastForward(20 * 25); });
  await page.keyboard.press('KeyO');
  await expect(page.locator('.ot-away')).toBeVisible();
  await page.keyboard.press('Escape');

  // Sanctum: earn enough for Skyfall, pick it, click inside the enemy field.
  await page.evaluate(() => window.bannerline.fastForward(20 * 120));
  expect((await me(page)).gold).toBeGreaterThan(250);
  await page.keyboard.press('KeyP');
  await expect(page.locator('.tp-sanctum')).toBeVisible();
  await page.locator('.sc-pow[data-pow="skyfall"]').click();
  await expect(page.locator('.aim-hint')).toBeVisible();
  await page.waitForTimeout(600);                                     // the camera glides to the rival field
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height * 0.35);
  await expect.poll(async () => (await me(page)).powers, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator('.aim-hint')).toBeHidden();

  // Camera: Space back to the hero, F into the rival's field.
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => {
    const v = window.bannerline.views()[0];
    const m = window.bannerline.match.sim.map;
    const rival = m.fields.find((f) => f.team !== v.myTeam);
    const t = v.camera.target;
    return t.x > rival.x0 && t.x < rival.x1;
  }), { timeout: 5000 }).toBe(true);
  expect(errors).toEqual([]);
});
