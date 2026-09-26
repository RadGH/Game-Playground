// Farhold 2026-09-26 — "Power Strike still does not deal damage, even when an enemy is in my normal
// attack range." Default warrior, longsword + a focus. Pressed on the real key, in the real page.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=7&class=warrior');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('Power Strike on key 1 hits an enemy in front, with a focus in the off hand', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(async () => {
    const f = window.farhold; f.pause(false);
    f.rpg.equip(f.player, f.give('psalter', 'common', { level: 1 }), { into: 'offhand', force: true });
    const e = await f.spawn('stone_sentinel', 1);
    e.maxHp = e.hp = 1e6; e.update = () => {};
    window.__e = e;
    window.__pin = () => { e.x = f.control.x + Math.sin(f.control.yaw) * 2.2; e.z = f.control.z + Math.cos(f.control.yaw) * 2.2; };
    window.__pin();
  });
  await page.mouse.click(640, 400);
  await page.evaluate(() => { window.__pin(); window.__hp = window.__e.hp; });
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  const dealt = await page.evaluate(() => window.__hp - window.__e.hp);
  expect(dealt, 'Power Strike dealt nothing to an enemy 2.2 m in front').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a Power Strike that catches nobody says where the nearest enemy was', async ({ page }) => {
  const errors = await land(page);
  const line = await page.evaluate(async () => {
    const f = window.farhold; f.pause(false);
    const e = await f.spawn('stone_sentinel', 1);
    e.maxHp = e.hp = 1e6; e.update = () => {};
    // directly BEHIND the player, well inside ten metres
    e.x = f.control.x - Math.sin(f.control.yaw) * 5; e.z = f.control.z - Math.cos(f.control.yaw) * 5;
    f.skills.slots[0].ready = 0;
    f.cast(0);
    return [...document.querySelectorAll('#log > *')].map(n => n.textContent).find(t => /catches nobody/.test(t)) || '';
  });
  expect(line).toMatch(/Power Strike reaches [\d.]+ m across \d+° and catches nobody\. .+ is 5\.0 m away, 180° to your (left|right)\./);
  expect(errors).toEqual([]);
});
