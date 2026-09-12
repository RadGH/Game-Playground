// The library page lists every kind (incl. the Emberveil bestiary filed as kind 'enemy'), draws portraits and stamps copies.
import { test, expect } from '@playwright/test';
test('library page: kinds, enemy bestiary, portraits, stamping', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('library/');
  await page.waitForFunction(() => !!window.libraryPage);
  const kinds = await page.$$eval('.kind-chips .chip', els => els.map(e => e.textContent));
  expect(kinds).toEqual(['all', 'character', 'item', 'party', 'npc', 'enemy']);

  // enemy chip filters to the bestiary and every card draws something
  await page.click('.kind-chips .chip:text-is("enemy")');
  const cards = await page.$$eval('.cards .card', els => els.length);
  expect(cards).toBeGreaterThanOrEqual(45);
  const drawn = await page.$$eval('.cards .card .portrait', els => els.map(e => e.querySelector('svg') ? 'svg' : e.textContent.trim()));
  expect(drawn.length).toBe(cards);
  expect(drawn.filter(d => d === 'svg').length).toBeGreaterThan(10);      // humanoids: 2D avatar
  expect(drawn.filter(d => d && d !== 'svg').length).toBeGreaterThan(10); // creatures: 3D-only, labelled by type

  // stamping an entry gives a deep copy the game can mutate
  const res = await page.evaluate(() => {
    const lib = window.libraryPage.lib; const a = lib.stamp('enemy_goblin_warrior'); const b = lib.stamp('enemy_corrupted_wolf');
    a.avatar.body.skin = '#000000';
    return { a: !!a?.avatar, b: b?.creature?.type, untouched: lib.get('enemy_goblin_warrior').data.avatar.body.skin, kinds: { e: lib.list('enemy').length, n: lib.list('npc').length } };
  });
  expect(res.a).toBe(true); expect(res.b).toBe('wolf');
  expect(res.untouched).not.toBe('#000000');
  expect(res.kinds.e).toBeGreaterThanOrEqual(45); expect(res.kinds.n).toBeGreaterThanOrEqual(35);
  expect(errors).toEqual([]);
});
