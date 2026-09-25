// §6.6 — "a work system: 10 units of work at a machine, supplied by the player working manually,
// by a machine, or by an assigned NPC."
//
// js/work.js has done every part of that since the colony landed and had no screen at all: you
// could not see an order, put a swing into one, or point a citizen at it. The whole idea is that a
// unit is a unit whoever produced it, so the credit line is the feature and not a decoration.
//
// It also turned up a shadowing bug: `board` was declared TWICE on `window.farhold` — the work
// board and the zone's notice board — and the later one silently won, so nothing outside main.js
// could reach js/work.js at all.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('the work board is on the build panel, and all three sources put units in', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const { createOrder } = await import('/prototypes/farhold/js/work.js');

    // nothing posted yet: the section must not show an empty heading
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    // R26 — B opens the build ring now; Tab from it is the full panel this test reads
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const empty = document.querySelector('#build-ui .build-work')?.textContent || '';

    // one citizen with nowhere to be, and one order
    f.colony.setBase({ structures: 10, defences: 1, beds: 2 });
    const ilsa = f.colony.newCitizen({ name: 'Ilsa', job: 'labourer' });
    f.colony.welcome(ilsa);
    f.workBoard.post(createOrder({ id: 'o1', title: 'Split the timber', tag: 'build', units: 10 }));
    await new Promise(r => setTimeout(r, 400));

    const shown = document.querySelector('#build-ui .build-work')?.textContent || '';
    const btn = label => [...document.querySelectorAll('#build-ui .build-work button')]
      .find(b => b.textContent.includes(label));

    // 1. the player, by hand
    btn('back into it').click();
    await new Promise(r => setTimeout(r, 250));
    const afterSwing = { ...f.workBoard.get('o1').ledger };

    // 2. an assigned citizen
    btn('Send somebody')?.click();
    await new Promise(r => setTimeout(r, 250));
    const assigned = f.colony.byId(ilsa.id)?.stationId;
    f.workBoard.work('o1', { units: 3, source: 'citizen', by: ilsa.id, byName: 'Ilsa' });

    // 3. a machine
    f.workBoard.work('o1', { units: 2, source: 'machine', byName: 'Assembler' });
    await new Promise(r => setTimeout(r, 300));

    const order = f.workBoard.get('o1');
    const credit = document.querySelector('#build-ui .build-work-credit')?.textContent || '';
    const barWidth = document.querySelector('#build-ui .build-work-bar i')?.style.width || '';
    f.build.setMode(false);

    return {
      empty, shown, credit, barWidth, assigned,
      afterSwing, ledger: { ...order.ledger }, done: order.done,
    };
  });

  expect(out.empty, 'the work section showed with nothing posted').toBe('');
  expect(out.shown, 'the board did not show the order').toContain('Work');
  expect(out.shown).toContain('idle');

  /**
   * THE POINT OF THE MODULE: a unit is a unit, whoever produced it.
   *
   * `citizen` is checked as "at least three" rather than exactly three, because an assigned
   * citizen also works on the colony's own clock — `colony.tick` runs every fifteen frames and put
   * another 0.6 of a unit in while this test was waiting. That is the feature behaving correctly,
   * and pinning it to an exact number would be a test of the frame rate.
   */
  expect(out.afterSwing.player, 'swinging at it credited nobody').toBe(1);
  expect(out.assigned, 'Send somebody did not put the citizen on the order').toBe('o1');
  expect(out.ledger.citizen, 'the citizen put nothing in').toBeGreaterThanOrEqual(3);
  expect(out.ledger.machine, 'the machine put nothing in').toBe(2);
  expect(out.done, 'the three sources do not add up').toBeGreaterThanOrEqual(6);
  expect(out.done, 'more went in than the order asked for').toBeLessThanOrEqual(10);

  expect(out.credit, 'the row does not say where the units came from').toBeTruthy();
  expect(parseInt(out.barWidth, 10), 'the progress bar never moved').toBeGreaterThanOrEqual(60);
  expect(errors).toEqual([]);
});
