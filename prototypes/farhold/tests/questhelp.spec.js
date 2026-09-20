import { test, expect } from '@playwright/test';

test('walking to a quest marker tells you what to do there', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // take a job from the board the way the game makes you
    f.hud.openNoticeBoard({ where: 'a village' });
    document.querySelector('#board-list button')?.click();
    f.hud.closeNoticeBoard();
    const quest = f.questLog.active[0];
    if (!quest) return { none: true };

    const place = quest.place || null;
    const before = [...document.querySelectorAll('#log div')].slice(0, 1).map(n => n.textContent);
    if (place) f.control.teleport(place.x, place.z);
    await new Promise(r => setTimeout(r, 1600));
    const after = [...document.querySelectorAll('#log div')].slice(0, 3).map(n => n.textContent);

    // …and it does not repeat itself
    const countOf = t => [...document.querySelectorAll('#log div')].filter(n => n.textContent === t).length;
    await new Promise(r => setTimeout(r, 1600));
    return {
      kind: quest.kind, hasPlace: !!place, before, after,
      repeats: after[0] ? countOf(after[0]) : 0,
    };
  });

  expect(out.none, 'the notice board gave out no work').toBeFalsy();
  expect(out.after.join(' | '), 'standing on the marker said nothing').not.toEqual(out.before.join(' | '));
  expect(out.repeats, 'the helper repeated itself').toBe(1);
  expect(errors).toEqual([]);
});
