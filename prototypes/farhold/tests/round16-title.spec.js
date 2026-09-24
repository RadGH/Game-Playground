// Farhold R16 — the restructured landing page.
//
// "Have a Continue button, New game, Load game, Settings, Exit game (if applicable…), and Back to
//  playground button. When starting a new game, start by naming your character and picking a class,
//  and show a preview of the class on the side. Have an optional 'Customize' button… Continuing from
//  creating character goes to Customize World. Display world settings on the side and on the other
//  side display a map of the starting planet."
//
// So this spec walks it the way a player does: menu → character → customize → world → Start, and
// then checks that the name, the class and the face that came out the other end are the ones that
// went in. It also proves the two things a restructure of a title screen is most likely to break:
// `?auto` still goes straight into the game (twenty-odd other specs are built on it), and the map
// really does change when the seed does.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

/** Collect page errors and console errors for the whole test. */
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

/**
 * R23 — the figure is a 3D canvas now (js/figure3d.js), so "the figure changed" is its `data-look`
 * key changing, not its innerHTML — a canvas's markup is the same whatever it is drawing. The key is
 * written once a look has actually been put on the body, so these wait for it rather than read it.
 */
const lookOf = page => page.evaluate(() => document.querySelector('#boot-figure canvas, #ap-figure canvas')?.dataset.look || '');
async function lookChanges(page, from, sel = '#boot-figure canvas') {
  await page.waitForFunction(([s, f]) => {
    const c = document.querySelector(s);
    return c && c.dataset.look && c.dataset.look !== f;
  }, [sel, from], { timeout: 20000 });
  return page.evaluate(s => document.querySelector(s).dataset.look, sel);
}
async function firstLook(page, sel = '#boot-figure canvas') {
  await page.waitForFunction(s => document.querySelector(s)?.dataset.look, sel, { timeout: 20000 });
  return page.evaluate(s => document.querySelector(s).dataset.look, sel);
}

async function openTitle(page, query = '') {
  await page.goto(BASE + query);
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
}

test('the menu is a menu: Continue, New game, Load game, Settings, Back to playground', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);

  // the buttons the user listed, all of them reachable and in one column
  await expect(page.locator('#boot-new')).toBeVisible();
  await expect(page.locator('#boot-load')).toBeVisible();
  await expect(page.locator('#boot-settings')).toBeVisible();
  await expect(page.locator('#boot-menu .boot-back')).toBeVisible();
  await expect(page.locator('#boot-menu .boot-back')).toHaveAttribute('href', '../../index.html');

  // Continue is hidden with nothing to continue — the element still exists, because round-3 and
  // round-10 specs wait for `#boot-continue:not([hidden])` after saving
  await page.evaluate(() => localStorage.removeItem('farhold.lastSave'));
  await page.reload();
  await page.waitForSelector('#boot-menu:not(.hidden)');
  expect(await page.locator('#boot-continue').isHidden()).toBe(true);

  /**
   * "Exit game (if applicable, since its a browser game)" — it is not applicable in a tab the user
   * opened themselves, because `window.close()` is refused there, so the button is not drawn. With
   * `?exit=1` (or a window a script opened) it is.
   */
  expect(await page.locator('#boot-exit').isHidden()).toBe(true);
  await openTitle(page, '?exit=1');
  await expect(page.locator('#boot-exit')).toBeVisible();

  // Settings opens the game's own panel, not a second copy of it
  await openTitle(page);
  await page.click('#boot-settings');
  await expect(page.locator('#settings')).toBeVisible();
  expect(await page.locator('section.settings').count()).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();

  expect(errors).toEqual([]);
});

test('Load game is its own screen, and Escape goes back', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-load');
  await expect(page.locator('#boot-load-screen')).toBeVisible();
  await expect(page.locator('#boot-menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#boot-menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('New game step 1: a name, a class, and the class previewed beside it', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');
  await expect(page.locator('#boot-character')).toBeVisible();

  // all thirty classes plus R17's "Custom — build your own class" at the top, and the card fills in
  // from the data rather than being a stub
  expect(await page.locator('#boot-class option').count()).toBe(31);
  expect(await page.locator('#boot-class option[value="custom"]').count()).toBe(1);
  await expect(page.locator('#boot-class-card h4')).toContainText('Ranger');
  // …and a rendered figure — R23: the 3D body, on its own canvas
  expect(await page.locator('#boot-figure canvas').count()).toBe(1);

  // change class and both halves of the preview follow
  const before = await firstLook(page);
  await page.selectOption('#boot-class', 'necromancer');
  await expect(page.locator('#boot-class-card h4')).toContainText('Necromancer');
  expect(await lookChanges(page, before)).not.toBe(before);

  expect(errors).toEqual([]);
});

test('Customize opens the appearance editor and changes the preview', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');
  const before = await firstLook(page);

  await page.click('#boot-customize');
  await expect(page.locator('#appearance')).toBeVisible();
  // R23 — the editor borrows the same 3D canvas rather than drawing a second, 2D figure
  await expect(page.locator('#ap-figure canvas')).toBeVisible();

  // the four tabs, and the body sliders under the first one
  expect(await page.locator('.ap-tab').count()).toBe(4);
  expect(await page.locator('#ap-controls .ap-range').count()).toBeGreaterThanOrEqual(3);

  // Randomise changes the figure in the editor
  const editorBefore = await firstLook(page, '#ap-figure canvas');
  await page.click('#ap-random');
  expect(await lookChanges(page, editorBefore, '#ap-figure canvas')).not.toBe(editorBefore);

  // a face part picked by hand lands in the avatar
  await page.click('.ap-tab >> nth=1');
  await page.selectOption('#ap-controls select >> nth=0', { index: 3 });
  await page.click('#ap-done');
  await expect(page.locator('#appearance')).toBeHidden();

  // …and the preview behind it is now a different figure, and the canvas came back to it
  await expect(page.locator('#boot-figure canvas')).toBeVisible();
  expect(await lookChanges(page, before)).not.toBe(before);
  await expect(page.locator('#boot-figure-note')).toContainText('Your own look');

  // Escape backs out of the editor without taking the change with it — and the editor draws into
  // the figure behind it while you work, so this is a real test and not a no-op
  const kept = await lookOf(page);
  await page.click('#boot-customize');
  await expect(page.locator('#appearance')).toBeVisible();
  await page.click('#ap-random');
  expect(await lookChanges(page, kept, '#ap-figure canvas'), 'the editor is not drawing into the preview').not.toBe(kept);
  await page.keyboard.press('Escape');
  await expect(page.locator('#appearance')).toBeHidden();
  await page.waitForFunction(k => document.querySelector('#boot-figure canvas')?.dataset.look === k, kept, { timeout: 20000 })
    .catch(() => {});
  expect(await lookOf(page), 'Cancel kept the change it was cancelling').toBe(kept);

  expect(errors).toEqual([]);
});

test('New game step 2 draws the planet, and a different seed draws a different planet', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');
  await page.click('#boot-to-world');
  await expect(page.locator('#boot-world')).toBeVisible();

  // the knobs down one side…
  for (const id of ['boot-seed', 'boot-regions', 'boot-habitable', 'boot-scale', 'boot-band', 'boot-density']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }

  // …and a real map of the real world down the other
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  const first = await page.evaluate(() => ({
    planet: document.getElementById('boot-map').dataset.planet,
    where: document.getElementById('boot-map-where').textContent,
    png: document.getElementById('boot-map').toDataURL().length,
    pixels: document.getElementById('boot-map').getContext('2d').getImageData(0, 0, 64, 64).data.join(','),
  }));
  expect(first.planet.length).toBeGreaterThan(0);
  expect(first.where).toContain(first.planet);
  await expect(page.locator('#boot-map-facts')).toContainText('settlements');

  // change the seed and the map is a different world
  await page.fill('#boot-seed', '4242');
  await page.waitForFunction(p => {
    const c = document.getElementById('boot-map');
    return c?.dataset.painted && c.dataset.planet !== p;
  }, first.planet, { timeout: 60000 });
  const second = await page.evaluate(() => ({
    planet: document.getElementById('boot-map').dataset.planet,
    pixels: document.getElementById('boot-map').getContext('2d').getImageData(0, 0, 64, 64).data.join(','),
  }));
  expect(second.planet).not.toBe(first.planet);
  expect(second.pixels, 'the map redrew the same picture for a different seed').not.toBe(first.pixels);

  expect(errors).toEqual([]);
});

test('Start lands you in the world with the name, class and face you chose', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page, '?quality=low&sound=off');
  await page.click('#boot-new');
  await page.fill('#boot-name', 'Tamsin');
  await page.selectOption('#boot-class', 'knight');

  // build a face that is definitely not the class's own
  await page.click('#boot-customize');
  await page.click('#ap-random');
  await page.click('#ap-done');
  await expect(page.locator('#boot-figure-note')).toContainText('Your own look');

  await page.click('#boot-to-world');
  await page.fill('#boot-seed', '3');
  await page.selectOption('#boot-scale', '0.2');
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  await page.click('#boot-start');

  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // the class's own look, straight off disk, so "not the class's face" is a real comparison
    const looks = await fetch('../emberveil/data/class-looks.json').then(r => r.json());
    return {
      name: f.player.name,
      classId: f.player.classId,
      avatar: JSON.stringify(f.player.avatar || null),
      classAvatar: JSON.stringify(looks.classes[f.player.classId]?.avatar || null),
      widthM: Math.round(f.terrain.widthM),
    };
  });
  expect(out.name).toBe('Tamsin');
  expect(out.classId).toBe('knight');
  expect(out.avatar, 'the character walked into the world with no look at all').toBeTruthy();
  expect(out.avatar, 'the customised face never reached the game').not.toBe(out.classAvatar);
  // planet size 0.2 of 640 m x 256 cells = 32.8 km, not the 163 km default
  expect(out.widthM).toBeGreaterThan(30000);
  expect(out.widthM).toBeLessThan(36000);

  // and the look survives a save and a reload
  const saved = await page.evaluate(() => {
    const f = window.farhold;
    f.saveNow();
    return { avatar: f.saves.list()[0] && f.saves.read(f.saves.list()[0].id).avatar, name: f.player.name };
  });
  expect(saved.avatar, 'the save dropped the appearance on the floor').toBeTruthy();

  await page.goto(BASE + '?quality=low&sound=off');
  await page.waitForSelector('#boot-continue:not([hidden])', { timeout: 60000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const back = await page.evaluate(() => ({
    name: window.farhold.player.name,
    classId: window.farhold.player.classId,
    avatar: JSON.stringify(window.farhold.player.avatar),
  }));
  expect(back.name).toBe('Tamsin');
  expect(back.classId).toBe('knight');
  expect(back.avatar).toBe(JSON.stringify(saved.avatar));

  expect(errors).toEqual([]);
});

test('?auto still skips the whole flow, and ?class= and ?seed= still mean something', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto=1&quality=low&sound=off&seed=5&class=tinker&scale=0.2');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const out = await page.evaluate(() => ({
    classId: window.farhold.player.classId,
    skills: document.querySelectorAll('#skillbar .skill-slot').length,
  }));
  expect(out.classId).toBe('tinker');
  expect(out.skills).toBe(6);
  expect(errors).toEqual([]);
});
