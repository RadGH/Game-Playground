// §6.5, §6.8, §6.9 — the people who live at your base, the fields they work, and the tax.
//
// js/colony.js (citizens, jobs, moods, beds, migration, recruiting, tax) and js/farm.js (plots that
// your folk harvest and REPLANT but never start) were both complete, both already ticking in the
// frame loop, and both completely invisible: there was no way to see a citizen, accept a migrant,
// break a field or collect a penny.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('beds make a holding, and the colony is told what you built', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.25;
    let spot = null;
    outer: for (let r = 0; r <= 1200; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (flat(x, z) && flat(x + 10, z)) { spot = { x, z }; break outer; }
    }
    if (!spot) return { none: true };
    f.control.teleport(spot.x, spot.z);
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 900);
    }
    await new Promise(r => setTimeout(r, 400));

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    // no beds yet: the panel must not show a column of zeroes
    const empty = document.querySelector('#build-ui .build-holding')?.textContent || '';

    f.build.setTool('smooth'); f.build.setRadius(18);
    f.build.aim(spot.x, spot.z); f.build.paint();
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(spot.x + 6, spot.z + 6); f.build.placeHere();
    for (let i = 0; i < 3; i++) { f.build.select('bed'); f.build.aim(spot.x + i * 3, spot.z); f.build.placeHere(); }
    // the colony is only told what you built on the 15-frame tick, so wait for it
    await new Promise(r => setTimeout(r, 1200));
    const withBeds = document.querySelector('#build-ui .build-holding')?.textContent || '';
    const base = { ...f.colony.base };

    // break a field — the player does that, never the citizens
    const fieldBtn = [...document.querySelectorAll('#build-ui .build-holding .build-yard-row button')]
      .find(b => b.textContent === 'Break a field here');
    fieldBtn?.click();
    await new Promise(r => setTimeout(r, 300));
    f.build.setMode(false);

    return {
      empty, withBeds, base,
      beds: base.beds,
      plots: f.farm.report().plots,
      // a citizen cannot lay one, which is the whole Necesse rule
      npcTried: f.farm.layPlot({ x: spot.x + 20, z: spot.z, by: 'citizen' }),
    };
  });

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.empty, 'the holding panel showed with nothing built').toBe('');
  expect(out.withBeds, 'three beds did not bring up the holding').toContain('Holding');
  expect(out.beds, 'the colony was never told about the beds').toBe(3);
  expect(out.base.structures, 'the colony was never told what is standing').toBeGreaterThan(0);
  expect(out.plots, 'the Break a field button did nothing').toBeGreaterThan(0);
  expect(out.npcTried.ok, 'a citizen was allowed to start a new field').toBe(false);
  expect(out.npcTried.why).toMatch(/Only you can break new ground/);
  expect(errors).toEqual([]);
});

test('a citizen with a bed pays tax, and one without pays nothing', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // two beds, two citizens, then a third with nowhere to sleep
    f.colony.setBase({ structures: 14, defences: 2, beds: 2, waypoint: false, wealth: 0 });
    const a = f.colony.newCitizen({ name: 'Ilsa', job: 'labourer' });
    const b = f.colony.newCitizen({ name: 'Corin', job: 'farmhand' });
    f.colony.welcome(a); f.colony.welcome(b);
    const c = f.colony.newCitizen({ name: 'Rook', job: 'labourer' });
    f.colony.welcome(c);

    const goldBefore = f.player.gold;
    const housed = f.colony.housed();
    const out = f.colony.collectTax();
    // the panel's own button does the same thing, and puts it in the player's purse
    f.control.teleport(f.control.x, f.control.z);
    return {
      housed, citizens: f.colony.citizens.length,
      gold: out.gold, paid: out.paid.length, skipped: out.skipped,
      prosperity: out.prosperity,
      goldBefore,
    };
  });

  expect(out.citizens).toBe(3);
  expect(out.housed, 'two beds did not house two people').toBe(2);
  expect(out.paid, 'the housed citizens did not pay').toBe(2);
  expect(out.skipped.some(s => s.why === 'no bed'), 'the bedless citizen was taxed anyway').toBe(true);
  expect(out.gold, 'the tax came to nothing').toBeGreaterThan(0);
  // prosperity comes from what is standing, which is why setBase had to be wired
  expect(out.prosperity, 'prosperity ignored the fourteen structures').toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
