// Farhold R17 — the custom class and the company, in a browser.
//
// The node tests (tests/round17-class.test.js) drive the rules: the tier list, the loadout gate,
// the slot ladder, the summon caps. What only a browser can answer is whether any of it is
// REACHABLE — which is this project's signature fault and the reason this file exists.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

test('the title screen offers a custom class, and the builder opens', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE);
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
  await page.locator('#boot-new').click();
  await page.waitForSelector('#boot-class', { timeout: 15000 });

  const options = await page.locator('#boot-class option').allTextContents();
  // thirty presets plus the one you build
  expect(options.length).toBe(31);
  expect(options[0].toLowerCase()).toContain('custom');

  await page.selectOption('#boot-class', { index: 0 });
  await page.waitForTimeout(400);
  // the class card becomes the build summary, with a way into the builder
  const opener = page.locator('button', { hasText: /builder/i }).first();
  await expect(opener).toBeVisible();
  await opener.click();
  await page.waitForTimeout(600);
  const builder = await page.evaluate(() => {
    const n = document.querySelector('.cb, .classbuild, [class*="classbuild"]');
    return n ? { cls: n.className, text: (n.innerText || '').slice(0, 200) } : null;
  });
  expect(builder).not.toBeNull();
  expect(errors).toEqual([]);
});

test('F opens the company on the sheet, with slots, a board and the respec', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto=1&seed=4477&scale=0.35');
  await page.waitForFunction(() => window.farhold?.player, null, { timeout: 45000 });

  await page.keyboard.press('KeyF');
  await page.waitForSelector('#sheet:not(.hidden)', { timeout: 10000 });
  await expect(page.locator('#sheet-title')).toHaveText('Followers');

  const panel = page.locator('#sheet-body-followers .flw');
  await expect(panel).toBeVisible();
  const text = await panel.innerText();
  // the three tabs the round asked for
  for (const tab of ['Company', 'Hire', 'Spells']) expect(text).toContain(tab);
  // three slots at level one, and the ladder written down
  expect(text).toMatch(/of 3 slots/i);
  expect(text).toContain('Level 20');
  expect(text).toContain('Level 30');
  // the perk arm is a LIMIT now, not a summon count
  expect(text).toContain('The Kept Company');

  // F again closes it; Esc would too, because it is a tab like any other
  await page.keyboard.press('KeyF');
  await expect(page.locator('#sheet')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});

test('the mercenary board lists several types with their own spells', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto=1&seed=4477&scale=0.35');
  await page.waitForFunction(() => window.farhold?.player, null, { timeout: 45000 });

  // the board is the same list the broker in a town reads, so ask it directly — walking to a
  // settlement is a different test's job
  const board = await page.evaluate(() => {
    const f = window.farhold.followers;
    if (!f) return null;
    return f.board({ town: { id: 3, size: 4 }, day: 2 }).map(m => ({
      id: m.id, name: m.name, price: m.price,
      casts: (m.rows || []).find(r => r[0] === 'Casts')?.[1] || '',
    }));
  });
  expect(board).not.toBeNull();
  expect(board.length).toBeGreaterThan(1);
  // "add a variety of types with their own spells"
  expect(new Set(board.map(m => m.id)).size).toBe(board.length);
  expect(board.some(m => m.casts && !/^nothing/.test(m.casts))).toBe(true);
  expect(errors).toEqual([]);
});
