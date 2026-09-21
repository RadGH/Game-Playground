// §6.3 — "I definitely want the ability to craft a motorcycle and a car and eventually a truck."
//
// js/vehicles.js (what they cost, how fast they are on which ground, what they drink) and
// avatar-3d/js/ground-vehicles.js (three procedural bodies) were both finished. Neither was
// imported by the game. This is the proof that they are now.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('G says so when there is nothing to drive', async ({ page }) => {
  const errors = await land(page);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true })));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', bubbles: true })));
  const out = await page.evaluate(() => ({
    driving: !!window.farhold.control.driving,
    // the log renders NEWEST FIRST, so the line just written is row zero, not the last one
    log: [...document.querySelectorAll('#log div')].slice(0, 3).map(n => n.textContent).join(' | '),
  }));
  expect(out.driving, 'G put the player on a vehicle they do not own').toBe(false);
  expect(out.log, 'G did nothing and said nothing').toMatch(/nothing to drive/i);
  expect(errors).toEqual([]);
});

test('a motorcycle is built at a bench, ridden with G, and burns what it drinks', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.2;
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
    for (const id of ['steel_ingot', 'machine_part', 'bronze_ingot', 'leather', 'resin', 'cloth', 'charcoal']) f.bag.add(id, 200);
    await new Promise(r => setTimeout(r, 400));

    /**
     * R17 — THE GARAGE IS A BUILDING NOW, NOT A SECTION OF THE BUILD PANEL.
     *
     *   "There is also a garage menu. I haven't got that far yet, but there should be a distinct
     *    Garage building where you manage that sort of thing."
     *
     * So the build panel must no longer carry one at all (`awayFromBench`), and the rows must turn
     * up on the Garage's own station screen instead. Everything below the screen — what a vehicle
     * costs, which benches have to be in reach, G getting on it — is unchanged.
     */
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const awayFromBench = document.querySelector('#build-ui .build-garage')?.textContent || '';

    f.build.setTool('smooth'); f.build.setRadius(22);
    for (const dx of [0, 10]) { f.build.aim(spot.x + dx, spot.z); f.build.paint(); }
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(spot.x + 5, spot.z + 8); f.build.placeHere();
    // R17 — this spec places pieces the tech tree now gates. `unlockAll` spends nothing and
    // earns nothing; it just takes every node, so the spec goes on testing the thing it is about.
    f.build.research?.unlockAll?.();
    f.build.select('assembler'); f.build.aim(spot.x + 2, spot.z);
    const asm = f.build.placeHere();
    // …and the garage itself, within the ten metres `benchesNear` reaches, because the parts are
    // still cut on the assembler: a garage is a shed with a pit in it, not a machine shop
    f.build.select('garage'); f.build.aim(spot.x + 9, spot.z);
    const gar = f.build.placeHere();
    await new Promise(r => setTimeout(r, 400));

    f.control.teleport(spot.x + 9, spot.z);
    await new Promise(r => setTimeout(r, 300));
    const opened = gar.ok ? f.buildUI.openStation(gar.entry) : false;
    await new Promise(r => setTimeout(r, 250));
    const atBench = document.querySelector('#station-ui')?.textContent || '';

    const buildRow = [...document.querySelectorAll('#station-ui .build-yard-row')]
      .find(r => /Build the/.test(r.querySelector('button')?.textContent || ''));
    const buildLabel = buildRow?.querySelector('button')?.textContent || '';
    const buildNote = buildRow?.querySelector('span')?.textContent || '';
    buildRow?.querySelector('button')?.click();
    await new Promise(r => setTimeout(r, 300));
    const owned = [...(f.player.vehicles?.owned?.ground || [])];

    // it comes out of the shed with an empty tank on purpose, so fuel it
    const fuelRow = [...document.querySelectorAll('#station-ui .build-yard-row')]
      .find(r => /Fuel the/.test(r.querySelector('button')?.textContent || ''));
    fuelRow?.querySelector('button')?.click();
    await new Promise(r => setTimeout(r, 200));
    const tank = f.player.vehicles?.rigs?.[owned[0]]?.fuel ?? 0;
    f.buildUI.closeStation();
    f.build.setMode(false);
    await new Promise(r => setTimeout(r, 200));

    // G gets on
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const onIt = !!f.control.driving;
    const bodyHidden = !f.actor.group.visible;

    // drive it, and watch the tank go down
    /**
     * Drive it with W, not by writing to `control.moving`.
     *
     * The controller recomputes `moving` from the input every frame, so assigning to it is erased
     * before `drive()` ever sees it — and a test that fakes the movement is not testing the thing
     * that burns the fuel.
     */
    const before = f.player.vehicles.rigs[owned[0]].fuel;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
    await new Promise(r => setTimeout(r, 2500));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
    const after = f.player.vehicles.rigs[owned[0]].fuel;
    const covered = Math.hypot(f.control.x - spot.x, f.control.z - spot.z);

    // …and G gets off again
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }));
    await new Promise(r => setTimeout(r, 400));

    return {
      asmOk: asm.ok, asmWhy: asm.why || '',
      garOk: gar.ok, garWhy: gar.why || '', opened,
      awayFromBench, atBench, buildLabel, buildNote,
      owned, tank, onIt, bodyHidden,
      before, after, covered,
      offIt: !!f.control.driving,
      bodyBack: f.actor.group.visible,
    };
  });

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.asmOk, `the assembler would not go down: ${out.asmWhy}`).toBe(true);
  expect(out.garOk, `the garage would not go down: ${out.garWhy}`).toBe(true);
  expect(out.awayFromBench, 'the build panel still carries a garage menu of its own').toBe('');
  expect(out.opened, 'E at a Garage did not open its own screen').toBe(true);
  expect(out.atBench, 'the garage screen does not say what it is').toContain('Garage');
  expect(out.buildLabel, `no vehicle was offered: ${out.buildNote}`).toMatch(/Build the/);
  expect(out.owned.length, `the vehicle was not built: ${out.buildNote}`).toBeGreaterThan(0);
  expect(out.tank, 'the tank is empty and the Fuel button did nothing').toBeGreaterThan(0);
  expect(out.onIt, 'G did not get on the vehicle that was just built').toBe(true);
  expect(out.bodyHidden, 'the walking body is still standing beside the vehicle').toBe(true);
  expect(out.covered, 'holding W on a motorcycle went nowhere').toBeGreaterThan(10);
  expect(out.after, 'driving burned no fuel').toBeLessThan(out.before);
  expect(out.offIt, 'G would not get off again').toBe(false);
  expect(out.bodyBack, 'the walking body never came back').toBe(true);
  expect(errors).toEqual([]);
});
