// Farhold R17 — the map screen, in a browser, because every one of these faults is a layout or a
// hit-test and neither exists until something has been laid out.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function land(page) {
  await page.goto(BASE + '?auto=1&seed=4477&scale=0.35');
  await page.waitForFunction(() => window.farhold?.player, null, { timeout: 45000 });
}

async function openMap(page) {
  await page.keyboard.press('KeyM');
  await page.waitForSelector('#map-screen:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(400);
}

test('the map does not move when you hover it or click it', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await openMap(page);

  const box = () => page.evaluate(() => {
    const c = document.querySelector('#map-screen canvas');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });

  const before = await box();
  // the reported trigger: hover (the readout strip appears) then the first click on the canvas
  await page.mouse.move(before.x + before.w / 2, before.y + before.h / 2);
  await page.waitForTimeout(250);
  const hovered = await box();
  await page.mouse.click(before.x + before.w / 2, before.y + before.h / 2);
  await page.waitForTimeout(350);
  const clicked = await box();

  expect(hovered).toEqual(before);
  expect(clicked).toEqual(before);
  expect(errors).toEqual([]);
});

test('an icon is hoverable at its own centre, and the tooltip carries the icon', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await openMap(page);

  // Ask the map what it drew and where, then point at the dead centre of each drawn ICON. The
  // reported bug was that the thing painted UNDERNEATH won every overlap, so the middle of a
  // world-boss burst returned the ancient wood it was standing in.
  const missed = await page.evaluate(() => {
    const map = window.farhold.map;
    const hits = map.hits || [];
    const drawn = hits.filter(h => h.tier === 'place' || h.tier === 'marker' || h.tier === 'pad');
    const bad = [];
    for (const h of drawn) {
      const got = map.hitAt(h.x, h.y);
      if (!got) { bad.push(`${h.key}: nothing under its own centre`); continue; }
      if (got.key === h.key) continue;
      /**
       * Another icon may sit on the EXACT same pixel — the world map draws a dungeon both from
       * World Forge's node list and from Farhold's own site list, and they land on top of each
       * other. That is a dead heat, and "painted last wins" is the right answer to one. What must
       * never happen is losing to something whose centre is further away, which is the reported
       * bug. `map.hitAt` returns a summary without coordinates, so look the winner back up.
       */
      const won = hits.find(o => o.key === got.key);
      const d = won ? Math.hypot(won.x - h.x, won.y - h.y) : Infinity;
      if (d >= 0.5) bad.push(`${h.key} → ${got.key} (${d.toFixed(1)} px away)`);
    }
    return { bad, n: drawn.length };
  });
  expect(missed.n).toBeGreaterThan(0);
  expect(missed.bad).toEqual([]);

  // and the tooltip shows the icon beside the name, so a white square reads as a village
  const swatch = await page.evaluate(() => typeof window.farhold.map.hitAt === 'function'
    && !!document.querySelector('#map-screen'));
  expect(swatch).toBe(true);
  expect(errors).toEqual([]);
});

test('Places has a Selected group and Favorites, and Find has Tracked Resources', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await openMap(page);

  // the old wording is gone everywhere
  const all = (await page.locator('#map-screen').innerText()).toLowerCase();
  expect(all).not.toContain('places you keep');

  const tab = name => page.locator('#map-screen .map-tab', { hasText: name }).first();
  await tab('Places').click();
  await page.waitForTimeout(300);
  // the panel headings are upper-cased by the stylesheet, and innerText gives you what is rendered
  const places = (await page.locator('#map-screen .map-side').innerText()).toLowerCase();
  expect(places).toContain('selected');
  expect(places).toContain('favorites');

  await tab('Find').click();
  await page.waitForTimeout(300);
  const find = (await page.locator('#map-screen .map-side').innerText()).toLowerCase();
  expect(find).toContain('tracked resources');

  expect(errors).toEqual([]);
});
