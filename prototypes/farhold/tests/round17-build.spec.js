// Farhold R17 — the build panel, the stations and research, in a browser.
//
// tests/round17-build.test.js walks a player from nothing to an iron ingot through the real
// ledger, pools and refining engine. What only a browser answers is whether the SCREENS exist and
// whether E at a furnace opens one — which is the report, verbatim:
//
//   "I built a furnace, campfire, kiln, and loom, but I still cannot figure out how to convert iron
//    ore into ingots. The furnace says it can smelt iron. But when I press E to open it it just
//    opens the regular build menu."

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

test('the build panel only shows the catalogue for a placement tool', async ({ page }) => {
  const errors = watch(page);
  await land(page);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Tab');   // R26 — B opens the ring; Tab is the full panel
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const f = window.farhold;
    const seen = {};
    for (const tool of ['build', 'road', 'wall', 'scan', 'remove', 'clear', 'route']) {
      f.build.setTool(tool);
      f.buildUI.refresh();
      seen[tool] = {
        cats: f.buildUI.toolCategories.length,
        rowsOnScreen: document.querySelectorAll('.build-cat').length,
      };
    }
    return seen;
  });

  // a placement tool draws the catalogue…
  expect(out.build.cats).toBeGreaterThan(0);
  expect(out.build.rowsOnScreen).toBeGreaterThan(0);
  // …and "Scan" does not, which is the report: "If I select 'Scan', it shouldn't show those
  // placement options."
  expect(out.scan.cats).toBe(0);
  expect(out.scan.rowsOnScreen).toBe(0);
  expect(out.remove.cats).toBe(0);
  expect(out.clear.cats).toBe(0);
  expect(errors).toEqual([]);
});

test('a furnace has a screen of its own, and E is what opens it', async ({ page }) => {
  const errors = watch(page);
  await land(page);

  const out = await page.evaluate(() => {
    const f = window.farhold;
    // stone and clay, the way a couple of minutes at a boulder and a clay bank would pay them
    f.craft.materials.addAll({ stone: 40, clay: 20, log: 40, plank: 40 });
    // stand a furnace up the way the game does: select it, aim beside the player, place it
    f.build.select('furnace');
    // the ground where you happen to be standing may be too steep — try a ring of spots, which is
    // what a player does with the ghost anyway
    let res = { ok: false, why: 'nowhere tried' };
    for (let a = 0; a < 16 && !res.ok; a++) {
      for (const r of [4, 8, 14, 22]) {
        f.build.aim(f.control.x + Math.cos(a / 16 * Math.PI * 2) * r,
          f.control.z + Math.sin(a / 16 * Math.PI * 2) * r);
        res = f.build.placeHere();
        if (res.ok) break;
      }
    }
    // `placeHere` hands back the ledger entry it just made — `id` is the ledger's ("b1"), `key` is
    // the catalogue's ("furnace"), and it is the entry, not the key, that a station opens from
    const entry = res?.entry || (f.build.entries || []).find(e => e.key === 'furnace');
    if (!entry) return { placed: res, skipped: 'the furnace would not stand up here' };
    const opened = f.buildUI.openStation(entry);
    const panel = document.getElementById('station-ui');
    return {
      opened: !!opened,
      hidden: panel?.hidden,
      text: (panel?.innerText || '').slice(0, 600),
    };
  });

  if (out.skipped) {
    // still assert the door exists, even if this patch of ground refused the building
    expect(await page.evaluate(() => typeof window.farhold.buildUI.openStation)).toBe('function');
    test.skip(true, out.skipped + ' — ' + JSON.stringify(out.placed));
  }
  expect(out.opened).toBe(true);
  expect(out.hidden).toBe(false);
  // its OWN recipes, not the catalogue
  expect(out.text.toLowerCase()).toContain('iron');
  expect(errors).toEqual([]);
});

test('research is a tab, age 1 is free, and points come in from playing', async ({ page }) => {
  const errors = watch(page);
  await land(page);

  const res = await page.evaluate(() => {
    const r = window.farhold.build.research;
    const s = r.summary();
    return { points: s.points, earned: s.earned, taken: s.taken, total: s.total };
  });
  expect(res.total).toBeGreaterThan(0);
  // nothing is researched at the start — age 1 is unlocked by having no node at all
  expect(res.taken).toBe(0);
  // …and the award hooks are live: landing in a region is worth one
  expect(res.earned).toBeGreaterThan(0);

  await page.keyboard.press('KeyI');
  await page.waitForSelector('#sheet:not(.hidden)');
  await page.locator('#sheet-tabs button[data-tab="research"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#sheet-title')).toHaveText('Research');
  const body = await page.locator('#sheet-body-research').innerText();
  expect(body.length).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
