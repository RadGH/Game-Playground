// §9 — you do not start with a ship, and this is the whole road to getting one.
//
// "build space ship, leave planet." The gate has been refusing correctly since it was wired; what
// had never been checked is that the refusal can actually be SATISFIED. A gate with no key behind
// it is worse than no gate.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('a fresh character has no ship, and is told exactly what to do about it', async ({ page }) => {
  const errors = await land(page);
  const gate = await page.evaluate(() => window.farhold.shipGate());
  expect(gate.ok).toBe(false);
  expect(gate.why).toMatch(/hull, drive, tanks, avionics/);
  expect(errors).toEqual([]);
});

test('the shipyard is reachable, and every refusal it gives can be satisfied', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.25;
    let spot = null;
    outer: for (let r = 0; r <= 1200; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (flat(x, z) && flat(x + 14, z) && flat(x - 14, z) && flat(x, z + 14) && flat(x, z - 14)) { spot = { x, z }; break outer; }
    }
    if (!spot) return { none: true };
    f.control.teleport(spot.x, spot.z);
    await new Promise(r => setTimeout(r, 400));

    // everything the catalogue and the yard ask for. This test is about the SHIPYARD, not about
    // whether ore can be dug — tests/mining.spec.js covers that end.
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 900);
    }
    for (const id of ['ship_hull', 'ship_drive', 'ship_tanks', 'ship_avionics', 'cut_stone', 'gravel',
                      'steel_ingot', 'machine_part', 'rope', 'lift_fuel', 'composite_plate',
                      'control_board', 'aether_cell', 'tempered_alloy']) f.bag.add(id, 90);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    f.build.setTool('smooth'); f.build.setRadius(20);
    for (const [dx, dz] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]]) {
      f.build.aim(spot.x + dx, spot.z + dz); f.build.paint();
    }
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(spot.x + 8, spot.z + 8); f.build.placeHere();
    // an assembler is where three of the four subsystems are fitted, and it needs power
    f.build.select('assembler'); f.build.aim(spot.x + 3, spot.z);
    const asm = f.build.placeHere();
    f.build.select('burner_generator'); f.build.aim(spot.x + 6, spot.z); f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(spot.x + 9, spot.z); f.build.placeHere();
    f.stores.put(f.stores.poolAt(spot.x + 9, spot.z), 'coal', 400);
    await new Promise(r => setTimeout(r, 2200));
    if (!asm.ok) return { asmWhy: asm.why };

    // the panel put the shipyard up because we are standing at an assembler
    const shown = document.querySelector('#build-ui .build-shipyard')?.textContent || '';
    const before = f.shipGate();

    const y = f.build && window.farhold;
    const steps = [];
    const press = label => {
      const row = [...document.querySelectorAll('#build-ui .build-shipyard .build-yard-row')]
        .find(r => r.querySelector('button')?.textContent === label);
      if (!row) return { found: false };
      const b = row.querySelector('button');
      const note = row.querySelector('span')?.textContent || '';
      if (b.disabled) return { found: true, disabled: true, note };
      b.click();
      return { found: true, disabled: false, note };
    };

    steps.push(['pad', press('Build the pad')]);
    for (const name of ['Hull', 'Drive', 'Tanks', 'Avionics']) steps.push([name, press(`Build ${name}`)]);
    await new Promise(r => setTimeout(r, 200));
    steps.push(['assemble', press('Put the ship together')]);
    await new Promise(r => setTimeout(r, 200));
    steps.push(['fuel', press('Fill the tanks')]);
    await new Promise(r => setTimeout(r, 200));
    f.build.setMode(false);

    return {
      shown, before,
      steps: steps.map(([k, r]) => [k, r.found, r.disabled, r.note]),
      after: f.shipGate(),
      owned: f.player.vehicles?.owned?.ship || [],
    };
  });

  expect(out.none, 'nowhere flat enough for a pad').toBeFalsy();
  expect(out.asmWhy, `the assembler would not go down: ${out.asmWhy}`).toBeFalsy();
  expect(out.shown, 'standing at an assembler did not bring up the shipyard').toContain('Shipyard');
  expect(out.before.ok, 'the character started with a ship').toBe(false);

  // every step has to be findable AND live — a disabled button here means a refusal with no key
  for (const [name, found, disabled, note] of out.steps) {
    expect(found, `the shipyard has no "${name}" step`).toBe(true);
    expect(disabled, `the "${name}" step was refused: ${note}`).toBe(false);
  }

  expect(out.owned, 'the ship was never assembled').toContain('lander');
  expect(out.after.ok, `the ship is built and the gate still refuses: ${out.after.why}`).toBe(true);
  expect(errors).toEqual([]);
});

test('…and then J actually leaves the planet', async ({ page }) => {
  const errors = await land(page);

  // build the ship the short way — the long way is the test above — and then fly it
  const built = await page.evaluate(async () => {
    const f = window.farhold;
    for (const id of ['ship_hull', 'ship_drive', 'ship_tanks', 'ship_avionics', 'cut_stone', 'gravel',
                      'steel_ingot', 'machine_part', 'rope', 'lift_fuel']) f.bag.add(id, 90);
    // the pad wants twelve metres at a 1-in-25 slope, which is flatter than anywhere on Farhold is
    // naturally — that is the point of it, and it is what sends the player to the Level tool
    f.build.setMode(true);
    f.build.setTool('smooth'); f.build.setRadius(20);
    for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
      f.build.aim(f.control.x + dx, f.control.z + dz); f.build.paint();
    }
    f.build.setMode(false);
    await new Promise(r => setTimeout(r, 300));

    const steps = {};
    for (const part of ['hull', 'drive', 'tanks', 'avionics']) steps[part] = f.shipyardApi.buildPart(part);
    steps.pad = f.shipyardApi.buildPad();
    steps.assemble = f.shipyardApi.assemble();
    steps.fuel = f.shipyardApi.refuel();
    return Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.ok ? 'ok' : v.why]));
  });
  for (const [step, how] of Object.entries(built)) {
    expect(how, `the ${step} step refused: ${how}`).toBe('ok');
  }

  const gate = await page.evaluate(() => window.farhold.shipGate());
  expect(gate.ok, `the gate still refuses after building everything: ${gate.why}`).toBe(true);

  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.farhold.mode === 'air', null, { timeout: 20000 });
  const flying = await page.evaluate(() => ({ mode: window.farhold.mode, fuel: window.farhold.shipFuel }));
  expect(flying.mode).toBe('air');
  // …and the launch cost fuel, so the tanks are not a decoration
  expect(flying.fuel, 'the launch did not burn any fuel').toBeLessThan(90);
  expect(errors).toEqual([]);
});
