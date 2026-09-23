// R22, in the browser: the loot popup's item cards.
//
//   "On loot window, redesign the item rewards. The spot where the weapon type appears (Weapon,
//    Legs, etc) has an empty line below it. Properties are listed below (4-8 damage, 20.4 health,
//    3.4 damage) this should go away. Make it so you can hover over the items on this screen to see
//    their actual tooltip (with compare tool)."
//
// Two things to prove and neither can be proved by reading the source: that the card no longer
// reserves space it does not use, and that the hover card actually appears. `shared/rewards.js` has
// carried the `tipRender` hook since R16 and it had never fired, because it wrote `dataset.itemId`
// while every renderer in Farhold reads `dataset.tipItem` — a hook spelled two different ways on
// the two sides is exactly the fault this project keeps shipping, and it is invisible to a test that
// only reads one side.
//
// No game page: the module is imported straight off the origin with its own stylesheet, the same way
// tests/round16-rewards.spec.js does it.

import { test, expect } from '@playwright/test';

async function blank(page) {
  await page.goto('/shared/');
  await page.evaluate(() => {
    document.body.innerHTML = '';
    for (const href of ['/shared/rewards.css', '/shared/tooltip.css']) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = href;
      document.head.append(css);
    }
  });
}

/** Farhold's own card shape, as `rewardItem` in js/main.js now builds it. */
const CARD = {
  name: 'Ashen Warblade',
  rarity: 'rare',
  slot: 'Weapon',
  note: '+14 over your Iron Sword',
  tipRender: 'item',
  tipItem: 'tip_abc123',
  tipClass: 'tip-item',
};

test('a reward card carries the name, the slot and the verdict — and no property list', async ({ page }) => {
  await blank(page);
  await page.evaluate(async (card) => {
    const { showRewards } = await import('/shared/rewards.js');
    showRewards({ title: 'Spoils', items: [card] });
  }, CARD);

  const item = page.locator('.rw-item').first();
  await expect(item).toBeVisible();
  await expect(item.locator('.name')).toHaveText('Ashen Warblade');
  await expect(item.locator('.slot')).toHaveText('Weapon');
  await expect(item.locator('.note')).toHaveText('+14 over your Iron Sword');
  // the block that held "4-8 damage / 20.4 health / 3.4 damage"
  await expect(item.locator('.lines')).toHaveCount(0);
});

test('nothing on the card is an empty box taking up a line', async ({ page }) => {
  await blank(page);
  await page.evaluate(async (card) => {
    const { showRewards } = await import('/shared/rewards.js');
    showRewards({ title: 'Spoils', items: [card] });
  }, CARD);
  await page.waitForTimeout(700);   // the cards fly in

  /**
   * The report is "an empty line below the slot". So: measure every element on the card and fail on
   * any that takes vertical space while holding no text. That is the rule, and it catches the next
   * one too — it does not care WHICH element was reserving the space.
   */
  const blanks = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('.rw-item > *')) {
      const h = n.getBoundingClientRect().height;
      const text = (n.textContent || '').trim();
      const painted = getComputedStyle(n).backgroundImage !== 'none';
      if (h > 3 && !text && !painted) out.push({ cls: n.className, h: Math.round(h) });
    }
    return out;
  });
  expect(blanks, `empty elements holding space: ${JSON.stringify(blanks)}`).toEqual([]);
});

test('hovering a reward card shows the game\'s own item card', async ({ page }) => {
  await blank(page);
  await page.evaluate(async (card) => {
    const { showRewards } = await import('/shared/rewards.js');
    const { installTooltips, registerTip } = await import('/shared/tooltip.js');
    installTooltips();
    // stands in for js/hud.js's `registerTip('item', node => this.itemCard(this.tipItems.get(
    // node.dataset.tipItem)))` — the point of the test is the KEY, which is what was mismatched
    registerTip('item', node => (node.dataset.tipItem === 'tip_abc123'
      ? '<b>Ashen Warblade</b><div class="tip-compare">Instead of Iron Sword <span class="up">+14</span></div>'
      : null));
    showRewards({ title: 'Spoils', items: [card] });
  }, CARD);
  await page.waitForTimeout(700);

  const item = page.locator('.rw-item').first();
  // the two halves of the hook, spelled the same way on both sides at last
  await expect(item).toHaveAttribute('data-tip-render', 'item');
  await expect(item).toHaveAttribute('data-tip-item', 'tip_abc123');

  await item.hover();
  const tip = page.locator('#tipbox');
  await expect(tip).toBeVisible({ timeout: 3000 });
  await expect(tip).toContainText('Ashen Warblade');
  await expect(tip).toContainText('Instead of Iron Sword');
});
