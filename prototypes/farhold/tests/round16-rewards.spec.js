// R16, in the browser: the opt-in chooser in shared/rewards.js.
//
//   "Also add a quest reward where you get to choose one of three rare or better items."
//
// `shared/rewards.js` is SHARED with Emberveil, so the whole risk of putting the chooser in there
// rather than writing a second set of item cards in Farhold is that a caller who did not ask for it
// gets something different. That is what the first test checks: no `choose`, and the popup behaves
// and resolves exactly as it always has. The rest check that the chooser actually chooses.
//
// No game page is needed — the module is imported straight off the origin, which is also the point:
// it is standalone, and needs only its own stylesheet.

import { test, expect } from '@playwright/test';

/** A bare page on this origin with rewards.css loaded, ready to import the module into. */
async function blank(page) {
  await page.goto('/shared/');
  await page.evaluate(() => {
    document.body.innerHTML = '';
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/shared/rewards.css';
    document.head.append(css);
  });
}

const CARDS = [
  { name: 'Ashfall Edge', rarity: 'rare', slot: 'Weapon', lines: ['18–29 damage', '+14 strength'] },
  { name: 'Coil of the Deep', rarity: 'legendary', slot: 'Chest', lines: ['96 armour', 'Legendary power'] },
  { name: 'Whisper Band', rarity: 'rare', slot: 'Ring', lines: ['+9% crit chance'] },
];

test('a caller that does not ask to choose gets the popup it always had', async ({ page }) => {
  await blank(page);
  const out = await page.evaluate(async (items) => {
    const { showRewards } = await import('/shared/rewards.js');
    const done = showRewards({ title: 'Victory', gold: 120, xp: 40, items }, { speed: 8, base: '/assets/data/ui' });
    const picky = document.querySelectorAll('.rw-item.rw-pick').length;
    const disabled = document.querySelector('.rw-btn')?.disabled;
    // click twice: the first reveals everything, the second closes
    document.querySelector('.rw-overlay').click();
    document.querySelector('.rw-overlay').click();
    const value = await done;
    return { picky, disabled, value: value === undefined ? 'undefined' : String(value) };
  }, CARDS);
  expect(out.picky, 'no card should be clickable without choose').toBe(0);
  expect(out.disabled, 'the Continue button is never disabled').toBe(false);
  expect(out.value, 'the promise still resolves with nothing').toBe('undefined');
});

test('choose: three cards, one of them is yours', async ({ page }) => {
  await blank(page);
  const out = await page.evaluate(async (items) => {
    const { showRewards } = await import('/shared/rewards.js');
    const done = showRewards({ title: 'Take one', items, choose: true }, { speed: 8, base: '/assets/data/ui' });
    await new Promise(r => setTimeout(r, 400));          // let the reveal run at 8x
    const cards = [...document.querySelectorAll('.rw-item.rw-pick')];
    const beforeDisabled = document.querySelector('.rw-btn').disabled;
    cards[1].click();                                     // pick the legendary
    const picked = document.querySelectorAll('.rw-item.rw-picked').length;
    const tick = getComputedStyle(document.querySelector('.rw-item.rw-picked .rw-tick')).display;
    const afterDisabled = document.querySelector('.rw-btn').disabled;
    const label = document.querySelector('.rw-btn').textContent;
    document.querySelector('.rw-btn').click();
    const value = await done;
    return { cards: cards.length, beforeDisabled, afterDisabled, picked, tick, label, value, open: !!document.querySelector('.rw-overlay:not(.rw-closing)') };
  }, CARDS);
  expect(out.cards).toBe(3);
  expect(out.beforeDisabled, 'you cannot confirm before you have picked').toBe(true);
  expect(out.afterDisabled).toBe(false);
  expect(out.picked, 'exactly one card is marked').toBe(1);
  expect(out.tick, 'and it wears a tick — not a stolen ::after, which would kill a legendary card\'s rays').toBe('block');
  expect(out.label).toContain('Coil of the Deep');
  expect(out.value, 'the index of the card taken').toBe(1);
  expect(out.open).toBe(false);
});

test('a chooser is never dismissed empty-handed', async ({ page }) => {
  await blank(page);
  const value = await page.evaluate(async (items) => {
    const { showRewards } = await import('/shared/rewards.js');
    const done = showRewards({ title: 'Take one', items, choose: true }, { speed: 8, base: '/assets/data/ui' });
    await new Promise(r => setTimeout(r, 400));
    // Escape, with nothing picked. A reward must never be a way to LOSE something, so the first
    // card is taken rather than the popup paying nothing.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return await done;
  }, CARDS);
  expect(value).toBe(0);
});

test('the arrow keys move the pick', async ({ page }) => {
  await blank(page);
  const value = await page.evaluate(async (items) => {
    const { showRewards } = await import('/shared/rewards.js');
    const done = showRewards({ title: 'Take one', items, choose: true }, { speed: 8, base: '/assets/data/ui' });
    await new Promise(r => setTimeout(r, 400));
    const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight');   // 0 -> 1 -> 2
    key('Enter');
    return await done;
  }, CARDS);
  expect(value).toBe(2);
});
