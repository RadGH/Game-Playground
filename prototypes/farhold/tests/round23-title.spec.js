// Farhold R23 — the title, the character step and the world step, laid out again.
//
//   "Redesign the main menu, character selector, world selector as the new extensive spell
//    descriptions and other things have caused the layout to display poorly… Update the character
//    editor to show the 3d model instead of the 2d avatar."
//
// What this holds the redesign to:
//   1. nothing is wider than the window at 390, 1280 or 1920 — the old character step was 460px
//      wide on a 390px phone;
//   2. on a desktop window the two steps FIT: the page itself does not scroll, only a list inside a
//      column does (the old character step was 1,779px tall at 1280 x 800);
//   3. the figure is a real 3D render — pixels that are not background — and it changes with the
//      class, and the editor and the builder borrow the same canvas rather than making their own;
//   4. a skill's sentence is clamped and opens on click;
//   5. Escape in the class builder closes the builder, not the character step underneath it;
//   6. Start works from a preset class AND from a custom one, the preview's canvas is gone once the
//      game is running, and the game's own renderer draws.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openTitle(page, query = '') {
  await page.goto(BASE + query);
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
}

/** How far the title spills past the window, sideways and downwards. */
const spill = page => page.evaluate(() => {
  const b = document.getElementById('boot');
  return {
    x: Math.max(b.scrollWidth - b.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
    y: b.scrollHeight - b.clientHeight,
  };
});

/** Wait for the figure to have a body on it, and count the pixels it drew. */
async function figurePixels(page, sel = '#boot-figure canvas') {
  await page.waitForFunction(s => {
    const c = document.querySelector(s);
    return c?.dataset.look && Number(c.dataset.rendered) > 2;
  }, sel, { timeout: 30000 });
  return page.evaluate(s => document.querySelector(s).__figure.sample(), sel);
}

for (const [w, h] of [[390, 844], [1280, 800], [1920, 1080]]) {
  test(`${w} x ${h}: no screen is wider than the window, and a desktop step fits it`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize({ width: w, height: h });
    await openTitle(page);
    expect((await spill(page)).x, 'the menu is wider than the window').toBeLessThanOrEqual(1);

    await page.click('#boot-new');
    await page.selectOption('#boot-class', 'stormcaller');
    await page.waitForTimeout(300);
    const preset = await spill(page);
    expect(preset.x, 'the character step is wider than the window').toBeLessThanOrEqual(1);
    if (w >= 1000) expect(preset.y, 'the character step scrolls the whole page on a desktop window').toBeLessThanOrEqual(1);

    await page.selectOption('#boot-class', 'custom');
    await page.waitForTimeout(300);
    expect((await spill(page)).x, 'the custom card is wider than the window').toBeLessThanOrEqual(1);

    await page.selectOption('#boot-class', 'ranger');
    await page.click('#boot-to-world');
    await page.waitForTimeout(300);
    const world = await spill(page);
    expect(world.x, 'the world step is wider than the window').toBeLessThanOrEqual(1);
    if (w >= 1000) expect(world.y, 'the world step scrolls the whole page on a desktop window').toBeLessThanOrEqual(1);

    expect(errors).toEqual([]);
  });
}

test('the figure is a 3D body that draws, and it changes with the class', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');

  // one canvas, no SVG paper doll left behind
  expect(await page.locator('#boot-figure canvas').count()).toBe(1);
  expect(await page.locator('#boot-figure svg').count()).toBe(0);

  const first = await figurePixels(page);
  expect(first.share, `the figure drew ${first.solid} pixels of ${first.width * first.height}`).toBeGreaterThan(0.03);
  const look = await page.evaluate(() => document.querySelector('#boot-figure canvas').dataset.look);

  // the class list and the dropdown are one control: a click on the list moves the dropdown
  await page.locator('#boot-class-list .cl-row[data-class-id="necromancer"]').click();
  expect(await page.locator('#boot-class').inputValue()).toBe('necromancer');
  await expect(page.locator('#boot-class-list .cl-row.on')).toHaveAttribute('data-class-id', 'necromancer');
  await page.waitForFunction(l => document.querySelector('#boot-figure canvas')?.dataset.look !== l, look, { timeout: 20000 });
  const second = await figurePixels(page);
  expect(second.share).toBeGreaterThan(0.03);

  expect(errors).toEqual([]);
});

test('the editor and the builder borrow the one canvas, and give it back', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');
  await figurePixels(page);
  const count = () => page.evaluate(() => document.querySelectorAll('canvas.figure-canvas').length);

  await page.click('#boot-customize');
  await expect(page.locator('#ap-figure canvas')).toBeVisible();
  expect(await count(), 'the editor made a second WebGL canvas').toBe(1);
  const inEditor = await figurePixels(page, '#ap-figure canvas');
  expect(inEditor.share).toBeGreaterThan(0.03);
  await page.click('#ap-cancel');
  await expect(page.locator('#boot-figure canvas')).toBeVisible();

  await page.selectOption('#boot-class', 'custom');
  await page.click('.cb-open');
  await expect(page.locator('.cb:not([hidden]) .cb-stage canvas')).toBeVisible();
  expect(await count()).toBe(1);

  // a new loadout changes what the figure is holding
  const before = await page.evaluate(() => document.querySelector('.cb-stage canvas').dataset.look);
  await page.locator('.cb:not([hidden]) .cb-opt', { hasText: /^Bow and Quiver/ }).click();
  await page.waitForFunction(l => document.querySelector('.cb-stage canvas')?.dataset.look !== l, before, { timeout: 20000 });

  // Escape closes the builder and ONLY the builder — it used to step the title back to the menu
  // underneath it, because the title's own Escape listener was registered first
  await page.keyboard.press('Escape');
  await expect(page.locator('.cb:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#boot-character')).toBeVisible();
  await expect(page.locator('#boot-menu')).toBeHidden();
  await expect(page.locator('#boot-figure canvas')).toBeVisible();

  expect(errors).toEqual([]);
});

test('a skill leads with its facts, and its sentence opens on click', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page);
  await page.click('#boot-new');
  await page.selectOption('#boot-class', 'stormcaller');

  const card = page.locator('#boot-class-card .cc-skill').first();
  await expect(card.locator('.sc-chip').first()).toBeVisible();
  // every chip the card shows is a fact with a number or a kind, never a sentence
  const chips = await card.locator('.sc-chip').allTextContents();
  expect(chips.length).toBeGreaterThanOrEqual(4);
  expect(chips.some(t => /mana|No mana cost/.test(t))).toBe(true);
  expect(chips.some(t => /cooldown/.test(t))).toBe(true);

  const desc = card.locator('.sc-desc');
  const shut = (await desc.boundingBox()).height;
  expect(await card.getAttribute('data-tip'), 'the whole sentence is not in the tooltip').toMatch(/\d/);
  await card.click();
  await expect(card).toHaveClass(/open/);
  const opened = (await desc.boundingBox()).height;
  expect(opened, 'opening the skill did not show more of the sentence').toBeGreaterThan(shut);

  expect(errors).toEqual([]);
});

test('Start from a preset class: the preview is disposed and the game draws', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page, '?quality=low&sound=off');
  await page.click('#boot-new');
  await page.selectOption('#boot-class', 'knight');
  await figurePixels(page);
  await page.click('#boot-to-world');
  await page.fill('#boot-seed', '3');
  await page.selectOption('#boot-scale', '0.2');
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(() => ({
    classId: window.farhold.player.classId,
    previews: document.querySelectorAll('canvas.figure-canvas').length,
    stage: !!document.querySelector('#stage canvas'),
    frame: window.farhold.stats?.()?.drawCalls ?? null,
  }));
  expect(out.classId).toBe('knight');
  expect(out.previews, 'the title preview canvas outlived the title screen').toBe(0);
  expect(out.stage, 'the game made no canvas of its own').toBe(true);
  if (out.frame != null) expect(out.frame, 'the game renderer drew nothing').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Start from a custom class, built the way a player builds one, reaches the world', async ({ page }) => {
  const errors = watch(page);
  await openTitle(page, '?quality=low&sound=off');
  await page.click('#boot-new');
  await page.selectOption('#boot-class', 'custom');
  await page.click('.cb-open');
  await page.locator('.cb:not([hidden]) .cb-rail button', { hasText: 'Spells' }).click();
  await page.locator('.cb:not([hidden]) .cb-opt:not([disabled])').first().click();
  await page.locator('.cb-done').click();
  await expect(page.locator('.cb:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#boot-class-card .cb-good')).toContainText('Ready');

  await page.click('#boot-to-world');
  await page.fill('#boot-seed', '7');
  await page.selectOption('#boot-scale', '0.2');
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(() => ({
    classId: window.farhold.player.classId,
    granted: !!window.farhold.player.build?.granted,
    skills: window.farhold.hud?.skillState?.filter(s => !s.empty).length ?? null,
    previews: document.querySelectorAll('canvas.figure-canvas').length,
  }));
  expect(out.classId).toBe('custom');
  // the preview dressed a COPY of the build; the run's own opening kit still ran
  expect(out.granted, 'the opening kit was never given — the preview spent it').toBe(true);
  if (out.skills != null) expect(out.skills).toBe(1);
  expect(out.previews).toBe(0);
  expect(errors).toEqual([]);
});
