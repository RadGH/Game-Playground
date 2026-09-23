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

// ================================================================= R18 — the play-test report

/**
 * THE BUG THIS FILE WAS WRITTEN TO CATCH AND DID NOT.
 *
 *   "I am on the :8400 version and when creating a custom character there is a JS error preventing
 *    me from selecting a loadout, or a spell slot (the 'your six' part works but all levels show
 *    the same spells). The opening menu does not work either."
 *
 * One fault under three of those: `js/newgame.js`'s `ensureBuilder` closure called
 * `drawClassCard()`, which is declared inside the `new Promise(resolve => …)` callback further down
 * and is therefore not in scope for it. The FIRST click in the builder threw
 * `drawClassCard is not defined` from inside `classbuild-ui.js`'s `changed()`, before it re-rendered
 * — so the panel froze on whatever it was showing and nothing could be selected at all.
 *
 * The test above opens the builder and stops there, which is exactly why it stayed green: this
 * file's own header says it exists to prove the feature is REACHABLE, and "it opens" is not the
 * same claim as "it works". So these click things.
 */

async function openBuilder(page) {
  await page.goto(BASE);
  await page.waitForTimeout(2200);
  await page.click('#boot-new');
  await page.waitForTimeout(800);
  await page.selectOption('#boot-class', 'custom');
  await page.waitForTimeout(800);
  await page.click('.cb-open');
  await page.waitForTimeout(1200);
}

test('R18 — clicking in the builder does not throw, and the loadout actually changes', async ({ page }) => {
  const errors = watch(page);
  await openBuilder(page);

  const before = await page.evaluate(() => document.querySelector('.cb-opt.on')?.textContent?.trim() || '');
  await page.locator('.cb-opt').nth(4).click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector('.cb-opt.on')?.textContent?.trim() || '');

  expect(errors, 'clicking a loadout threw').toEqual([]);
  expect(after, 'picking a different loadout did not change the selection').not.toBe(before);
  // …and the card behind the builder tracks it, which is what `drawClassCard` is for
  const card = await page.evaluate(() => document.getElementById('boot-class-card')?.textContent || '');
  expect(card.length, 'the class card is empty').toBeGreaterThan(10);
});

/**
 * R20 — THE CREATOR ASKS FOR ONE SPELL, AND THE OTHER FIVE ARE NOT ITS BUSINESS.
 *
 *   "Let's change the character creator so that you only pick the first level spell. When you reach
 *    levels 3/6/12/18/24 unlock the next spell…"
 *
 * This spec used to click each of the six slots in turn and count what each one offered, which was
 * R18's fix for "all levels show the same spells". That rule has not changed — a slot still offers
 * exactly what its own level could unlock, and tests/round20-spells.test.js §2.1/2.4 assert it
 * across the whole ladder. What HAS changed is that the title screen builds a level-1 character,
 * so five of the six slots refuse themselves and are not clickable here at all. So this now checks
 * the thing the screen is actually for: one live slot, the right spells in it, and a pick that
 * sticks and finishes the build.
 */
test('R20 — the creator offers the opening slot only, and one pick finishes it', async ({ page }) => {
  const errors = watch(page);
  await openBuilder(page);
  await page.locator('.cb-rail > *', { hasText: 'Spells' }).click();
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => ({
    slots: document.querySelectorAll('.cb-slots > *').length,
    pending: document.querySelectorAll('.cb-slot.pending').length,
    shut: document.querySelectorAll('.cb-slot.shut').length,
    // R20 — unlearn is an Unbinder in a town now, not a free button on this screen
    unlearn: [...document.querySelectorAll('.cb-slots button')].filter(b => /unlearn/i.test(b.textContent)).length,
    open: [...document.querySelectorAll('.cb-opt')].filter(o => !o.disabled).length,
    done: document.querySelector('.cb-done')?.disabled,
  }));

  expect(errors, 'opening the Spells tab threw').toEqual([]);
  expect(before.slots, 'the ladder is not six slots long').toBe(6);
  expect(before.pending, 'the creator should offer exactly one spell').toBe(1);
  expect(before.shut, 'the other five slots are not shown as not-yet-open').toBe(5);
  expect(before.unlearn, 'the free Unlearn button is still on the builder').toBe(0);
  expect(before.open, 'the opening slot offers nothing to pick').toBeGreaterThan(0);
  expect(before.done, 'the build was finishable with no spell at all').toBe(true);

  // everything offered is genuinely a level-1 spell, not the whole forty with five greyed
  const levels = await page.evaluate(() => [...document.querySelectorAll('.cb-opt')]
    .filter(o => !o.disabled).map(o => o.querySelector('.cb-right')?.textContent?.trim() || ''));
  // R21: the rung label is "Level 1" now, the same shape as every other rung (WORDING.md rule 6)
  expect(levels.every(t => t === 'Level 1'),
    `the opening slot offers spells it cannot take: ${levels.join(', ')}`).toBe(true);

  await page.locator('.cb-opt:not([disabled])').first().click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    filled: document.querySelectorAll('.cb-pick.filled').length,
    pending: document.querySelectorAll('.cb-slot.pending').length,
    done: document.querySelector('.cb-done')?.disabled,
  }));
  expect(after.filled, 'picking a spell did not fill the slot').toBe(1);
  expect(after.pending, 'the slot is still asking after it was filled').toBe(0);
  expect(after.done, 'one spell picked and the build still will not start').toBe(false);
  expect(errors, 'picking a spell threw').toEqual([]);
});

test('R18 — the opening menu takes a choice, and the Name tab has no body picker', async ({ page }) => {
  const errors = watch(page);
  await openBuilder(page);

  await page.locator('.cb-rail > *', { hasText: 'Opening' }).click();
  await page.waitForTimeout(700);
  await page.locator('.cb-opt').first().click();
  await page.waitForTimeout(600);
  const chosen = await page.evaluate(() => document.querySelectorAll('.cb-opt.on').length);
  expect(errors, 'the opening menu threw').toEqual([]);
  expect(chosen, 'choosing an opening selected nothing').toBeGreaterThan(0);

  /**
   * "It also asks which body to start from, but I actually customized my character before opening
   * that screen - so that option should probably go." The character step behind this one already
   * has both "Customize appearance…" and "Use the class look".
   */
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.cb-rail > *')].map(e => e.textContent.trim()));
  expect(tabs, 'the Look tab should be the Name tab now').toContain('Name');
  expect(tabs, 'the body picker tab is back').not.toContain('Look');
  await page.locator('.cb-rail > *', { hasText: 'Name' }).click();
  await page.waitForTimeout(600);
  const opts = await page.evaluate(() => document.querySelectorAll('.cb-opt').length);
  expect(opts, 'the Name tab is offering bodies to start from again').toBe(0);
  expect(errors).toEqual([]);
});
