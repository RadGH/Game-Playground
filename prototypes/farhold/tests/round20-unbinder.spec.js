// Farhold — round 20, in the real page: the Unbinder you can walk up to, and the spell chooser.
//
// tests/round20-spells.test.js asserts every rule without a browser. This file exists for the one
// thing a node test structurally cannot check, and which is this project's signature fault: that a
// finished module has a WAY IN. Twelve of them across rounds 11-16 were complete, tested and
// unreachable — a screen nothing mounted, a key nothing listened for, a role nothing rostered.
//
// So: is there an Unbinder standing in a town, does pressing E on them open a counter with prices
// on it, does clicking Unbind actually take the gold and the perk, and does the "spell available"
// slot on the character sheet open the chooser.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 7, cls = 'ranger' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand in the nearest settlement and wait for its people to be built. */
async function goToTown(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    const t0 = Date.now();
    while (f.folk.stats().people === 0 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 200));
    return { name: town.name, size: town.size };
  });
}

/**
 * THE ONE THAT MATTERS: an Unbinder actually gets rostered.
 *
 * `rosterFor` fills a settlement up to a headcount by walking ROLES in declaration order and stops
 * the moment it is full, so a role declared at the END of that list only ever appears in the
 * biggest settlements — counted out, an Unbinder added last would have existed in size 4 and 5
 * only. It is placed with the merchant and the elder instead, before anything can compete for the
 * space. This is that, checked against real towns rather than against the reasoning.
 */
test('an Unbinder stands in a town, with a pip over their head', async ({ page }) => {
  const errors = await land(page);
  await goToTown(page);

  const out = await page.evaluate(() => {
    const f = window.farhold;
    const people = [...f.folk.live.values()].flat();
    const unbinders = people.filter(p => p.retrains);
    /**
     * …and in every settlement of the size the role allows, not only this one. Rosters are
     * deterministic per settlement id, so asking the roster function directly covers a hundred
     * towns in a millisecond where walking to them would take an hour.
     */
    const sizes = {};
    for (let size = 1; size <= 5; size++) {
      let has = 0;
      for (let id = 1; id <= 40; id++) {
        if (f.folk.rosterFor({ id, size }).roster.some(r => r.key === 'unbinder')) has++;
      }
      sizes[size] = has / 40;
    }
    return {
      people: people.length,
      unbinders: unbinders.length,
      name: unbinders[0]?.name || null,
      roleName: unbinders[0]?.roleName || null,
      hasBadge: !!unbinders[0]?.actor?.group?.children?.some(c => c.isSprite),
      sizes,
    };
  });

  expect(errors).toEqual([]);
  expect(out.people).toBeGreaterThan(2);
  expect(out.unbinders, 'no Unbinder in this town — the role is not being rostered').toBeGreaterThan(0);
  expect(out.roleName).toBe('Unbinder');
  expect(out.hasBadge, 'the Unbinder has no pip, so nobody will find them').toBe(true);
  // a hamlet has none; anywhere bigger always does
  {
    expect(out.sizes[1], 'a one-house hamlet keeps an Unbinder').toBe(0);
    for (const size of [2, 3, 4, 5]) {
      expect(out.sizes[size], `only ${Math.round(out.sizes[size] * 100)}% of size-${size} towns have an Unbinder`).toBe(1);
    }
  }
});

test('the Unbinder takes gold for a perk, and refuses the one holding another up', async ({ page }) => {
  const errors = await land(page);
  await goToTown(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const who = [...f.folk.live.values()].flat().find(p => p.retrains);
    if (!who) return { noUnbinder: true };

    // a character with something to unbind: two perks in a row, and money
    f.player.level = 20;
    f.player.gold = 9000;
    f.player.perks = [];
    const forest = f.rpg.forest;
    const atHub = new Set(forest.neighbours.get('start') || []);
    const first = [...atHub][0];
    f.hud.onTakePerk(first);
    const second = (forest.neighbours.get(first) || []).find(id => id !== 'start' && !atHub.has(id));
    f.hud.onTakePerk(second);
    const took = f.player.perks.slice();

    f.openTalk(who);
    await new Promise(r => setTimeout(r, 400));
    const panel = document.getElementById('talk');
    const shelf = label => [...panel.querySelectorAll('.shop-tabs .chip')].find(c => c.textContent.startsWith(label));
    const shelves = [...panel.querySelectorAll('.shop-tabs .chip')].map(c => c.textContent.trim());

    shelf('Perks').click();
    await new Promise(r => setTimeout(r, 300));
    const rows = [...panel.querySelectorAll('.trade-row')];
    const priced = rows.filter(r => /[0-9]+g/.test(r.querySelector('.coin')?.textContent || ''));
    const live = rows.filter(r => {
      const b = r.querySelector('button');
      return b && !b.disabled && !/unbind all/i.test(b.textContent);
    });
    const refused = rows.filter(r => r.querySelector('button')?.disabled && !/unbind all/i.test(r.querySelector('button').textContent));

    const goldBefore = f.player.gold;
    live[0].querySelector('button').click();
    await new Promise(r => setTimeout(r, 400));

    return {
      shelves,
      rowCount: rows.length,
      pricedAll: priced.length >= 2,
      liveCount: live.length,
      refusedCount: refused.length,
      refusedSaysWhy: refused.length ? /through this one/.test(refused[0].textContent) : null,
      took: took.length,
      left: f.player.perks.length,
      goldBefore, goldAfter: f.player.gold,
    };
  });

  expect(errors).toEqual([]);
  expect(out.noUnbinder, 'no Unbinder to talk to').toBeFalsy();
  expect(out.shelves, 'the counter is not three shelves').toEqual(
    expect.arrayContaining([expect.stringContaining('Spells'), expect.stringContaining('Perks'), expect.stringContaining('Talents')]));
  expect(out.took).toBe(2);
  expect(out.pricedAll, 'a row on this counter has no price on it').toBe(true);
  expect(out.liveCount, 'nothing on the perk shelf could be unbound').toBeGreaterThan(0);
  expect(out.refusedCount, 'the load-bearing perk was offered as a live button').toBe(1);
  expect(out.refusedSaysWhy, 'the refused row does not say why').toBe(true);
  expect(out.left, 'unbinding one perk took a different number of them').toBe(1);
  expect(out.goldAfter, 'the Unbinder did the work for free').toBeLessThan(out.goldBefore);
});

/**
 * The other half of the round: the slot you are owed, on the screen the user named.
 *
 * A preset class has no picks to make, so this builds a custom character the way the title screen
 * now does — one spell — and then levels them up and asks the character sheet for the slot.
 */
test('a levelled custom character is offered the next spell on the Skills screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('/prototypes/farhold/?quality=low&sound=off&seed=7');
  await page.waitForTimeout(2200);
  await page.click('#boot-new');
  await page.waitForTimeout(800);
  await page.selectOption('#boot-class', 'custom');
  await page.waitForTimeout(800);
  await page.click('.cb-open');
  await page.waitForTimeout(1200);
  await page.locator('.cb-rail > *', { hasText: 'Spells' }).click();
  await page.waitForTimeout(600);
  await page.locator('.cb-opt:not([disabled])').first().click();
  await page.waitForTimeout(500);
  await page.locator('.cb-done').click();
  await page.waitForTimeout(500);
  // the world step sits between the character step and Start — see tests/round16-title.spec.js
  await page.click('#boot-to-world');
  await page.fill('#boot-seed', '7');
  await page.selectOption('#boot-scale', '0.2');
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const before = f.hud.skillState.map(s => ({ empty: !!s.empty, pending: !!s.pending }));

    // …and now they reach level 3, which is the first rung after the one they started on
    f.player.level = 3;
    f.hud.skills(f.skills.state());
    f.hud.toggleSheet(true);
    f.hud.setTab('skills');
    await new Promise(r => setTimeout(r, 400));

    const cards = [...document.querySelectorAll('#sheet-skillbar .sk-card')];
    const pending = cards.filter(c => c.classList.contains('pending'));
    const badge = document.getElementById('rail-badge-skills');
    const badgeShown = badge ? !badge.hidden : null;

    pending[0]?.click();
    await new Promise(r => setTimeout(r, 600));
    const chooser = document.querySelector('.cb:not([hidden])');
    const liveSlots = chooser ? chooser.querySelectorAll('.cb-slot.pending').length : 0;
    const options = chooser ? [...chooser.querySelectorAll('.cb-opt')].filter(o => !o.disabled).length : 0;

    // pick one and check it reaches the KEYS, not only the screen
    chooser?.querySelector('.cb-opt:not([disabled])')?.click();
    await new Promise(r => setTimeout(r, 600));

    return {
      startedWithOne: before.filter(s => !s.empty).length,
      startedEmpty: before.filter(s => s.empty).length,
      pendingAtLevel1: before.filter(s => s.pending).length,
      pendingCards: pending.length,
      cardText: pending[0]?.textContent || '',
      badgeShown,
      chooserOpened: !!chooser,
      liveSlots, options,
      barAfter: f.skills.state().map(s => s.id),
      buildAfter: (f.player.build?.spells || []).slice(),
      owed: f.hud.skillState.filter(s => s.pending).length,
    };
  });

  expect(errors, 'the spell chooser threw').toEqual([]);
  expect(out.startedWithOne, 'a new custom character should start with exactly one spell').toBe(1);
  expect(out.startedEmpty, 'the other five slots are not empty').toBe(5);
  expect(out.pendingAtLevel1, 'a level-1 character is owed nothing yet').toBe(0);
  expect(out.pendingCards, 'no "spell available" slot appeared at level 3').toBe(1);
  expect(out.cardText).toContain('Spell available');
  expect(out.badgeShown, 'the Skills tab shows no badge for a spell you are owed').toBe(true);
  expect(out.chooserOpened, 'clicking the slot opened no chooser').toBe(true);
  expect(out.liveSlots, 'the chooser offers more than the one slot that came due').toBe(1);
  expect(out.options, 'the chooser offers nothing to pick').toBeGreaterThan(0);
  expect(out.buildAfter[1], 'the pick did not reach the saved build').toBeTruthy();
  expect(out.barAfter[1], 'the pick reached the screen and not the keys').toBe(out.buildAfter[1]);
  expect(out.owed, 'the slot is still asking after it was filled').toBe(0);
});
