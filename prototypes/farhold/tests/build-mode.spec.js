// Build mode, played with the keyboard and the mouse and nothing else.
//
// "How does build mode work? How do I start building a base?"
//
// Every other test in this folder reaches into `window.farhold` and calls the functions directly,
// which is right for testing a rule and wrong for testing an interface: it cannot tell the
// difference between a feature that works and a feature that has no way in. So this one presses B,
// reads what is on the screen, clicks the buttons, and clicks the ground.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('B opens a panel that says what to do and what everything costs', async ({ page }) => {
  const errors = await land(page);

  await expect(page.locator('#build-ui')).toBeHidden();
  await page.keyboard.press('KeyB');
  await expect(page.locator('#build-ui')).toBeVisible();

  const panel = page.locator('#build-ui');
  // the steps, because "how do I start a base" must be answerable without leaving the game — and
  // the first of them must say where materials come from, which is the one thing nothing else says
  // (R17 made it seven: the Crafting Table and the first plank are two steps of their own now)
  await expect(panel.locator('.build-steplist li')).toHaveCount(7);
  await expect(panel.locator('.build-steplist li').first()).toContainText('swing at a tree');
  await expect(panel).toContainText('Level');
  await expect(panel).toContainText('Outpost Marker');

  // every tool has a button, and picking one takes
  const tools = await panel.locator('.build-tool').allTextContents();
  expect(tools).toEqual(expect.arrayContaining(['Level', 'Place', 'Road', 'Wall', 'Take down']));
  await panel.locator('.build-tool', { hasText: 'Level' }).first().click();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('smooth');

  /**
   * R17 — "If I select 'Scan', it shouldn't show those placement options."
   *
   * A tool that does not place anything must take the category row, the catalogue and the detail
   * card off the panel with it. Levelling a circle of ground has nothing to say about the price of
   * a Storage Box.
   */
  const whileLevelling = await page.evaluate(() => ({
    rows: document.querySelectorAll('#build-ui .build-row').length,
    cats: document.querySelectorAll('#build-ui .build-cat').length,
  }));
  expect(whileLevelling.rows, 'the catalogue is still up with the Level tool selected').toBe(0);
  expect(whileLevelling.cats, 'the category buttons are still up with the Level tool selected').toBe(0);

  // …and Place brings them back
  await panel.locator('.build-tool', { hasText: 'Place' }).first().click();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('build');

  // a piece shows a price, and the price is the one the placement will charge
  const cost = await page.evaluate(() => {
    const f = window.farhold;
    const row = [...document.querySelectorAll('#build-ui .build-row')]
      .find(r => r.textContent.includes('Outpost Marker'));
    row.click();
    const piece = (f.structures.structures || []).find(p => p.id === 'claim_stone');
    return {
      shown: row.querySelector('.build-row-cost').textContent,
      real: Object.entries(piece.cost).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(' · '),
      selected: f.build.selected,
      tool: f.build.tool,
    };
  });
  expect(cost.shown, 'the panel shows a different price to the catalogue').toBe(cost.real);
  expect(cost.selected, 'clicking a row did not select the piece').toBe('claim_stone');
  expect(cost.tool, 'picking something to build did not switch to the Place tool').toBe('build');

  // …and B closes it again
  await page.keyboard.press('KeyB');
  await expect(page.locator('#build-ui')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the ghost follows the camera, and a click on the ground builds', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    // stand somewhere flat and dry, facing it
    const dry = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.riverAt(x, z) <= 0.05 && t.slopeAt(x, z, 8) <= 0.25;
    outer: for (let r = 0; r <= 900; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (dry(x, z) && dry(x + 8, z) && dry(x - 8, z) && dry(x, z + 8) && dry(x, z - 8)) { f.control.teleport(x, z); break outer; }
    }
    for (const p of f.structures.structures || []) for (const id of Object.keys(p.cost || {})) f.bag.add(id, 500);
    await new Promise(r => setTimeout(r, 400));
    return { x: f.control.x, z: f.control.z };
  });

  await page.keyboard.press('KeyB');
  await page.waitForTimeout(300);

  /**
   * THE GHOST IS NOT ON THE PLAYER'S FEET.
   *
   * It used to be exactly that — `build.aim(control.x, control.z)` — so building anything meant
   * standing on the spot and then walking off it. It follows the camera's ray now, so the check is
   * simply that the aim point is somewhere in FRONT of the character rather than inside them.
   */
  const aim = await page.evaluate(w => {
    const f = window.farhold;
    const c = f.build.aimAt;
    return { ax: c.x, az: c.z, away: Math.hypot(c.x - w.x, c.z - w.z) };
  }, out);
  expect(aim.away, 'the build cursor is sitting on the player').toBeGreaterThan(1.5);

  // level the ground under the cursor with the Level tool and a real click
  const canvas = page.locator('#stage canvas');
  await page.evaluate(() => { window.farhold.build.setTool('smooth'); window.farhold.build.setRadius(14); });
  await canvas.click({ position: { x: 480, y: 360 } });
  await page.waitForTimeout(250);
  const edits = await page.evaluate(() => window.farhold.terraform.count);
  expect(edits, 'clicking with the Level tool did not touch the ground').toBeGreaterThan(0);

  /**
   * …then put a claim stone down with a click, through the panel.
   *
   * R17: the Level tool is still selected here, and the panel no longer draws the placement
   * catalogue for a tool that does not place anything ("If I select 'Scan', it shouldn't show
   * those placement options"). So this puts the Place tool back first, which is what a player
   * does, and picks the category the marker is filed under before looking for its row.
   */
  await page.evaluate(() => {
    const f = window.farhold;
    f.build.setTool('build');
    f.buildUI.refresh();
    const cat = [...document.querySelectorAll('#build-ui .build-cat')]
      .find(b => /waypoint|marker|claim/i.test(b.textContent));
    cat?.click();
    const row = [...document.querySelectorAll('#build-ui .build-row')].find(r => r.textContent.includes('Outpost Marker'));
    if (!row) throw new Error('no Outpost Marker row: ' + [...document.querySelectorAll('#build-ui .build-cat')].map(b => b.textContent).join('/'));
    row.click();
  });
  await canvas.click({ position: { x: 480, y: 360 } });
  await page.waitForTimeout(300);

  const built = await page.evaluate(() => ({
    count: window.farhold.build.entries.length,
    keys: window.farhold.build.entries.map(e => e.key),
  }));
  expect(built.count, 'clicking the ground in build mode built nothing').toBeGreaterThan(0);
  expect(built.keys, 'the click built something other than what was selected').toContain('claim_stone');

  expect(errors).toEqual([]);
});

test('build mode swallows the swing, so you do not attack the fence you are placing', async ({ page }) => {
  const errors = await land(page);
  const canvas = page.locator('#stage canvas');

  const before = await page.evaluate(() => window.farhold.player.kills ?? 0);
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(200);
  const swungInBuild = await page.evaluate(async () => {
    const f = window.farhold;
    let swung = false;
    const was = f.control.swing;
    f.build.setTool('smooth');
    await new Promise(r => setTimeout(r, 300));
    swung = f.control.swing > was;
    return swung;
  });
  await canvas.click({ position: { x: 400, y: 300 } });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ swing: window.farhold.control.swing, kills: window.farhold.player.kills ?? 0 }));

  expect(swungInBuild).toBe(false);
  expect(after.swing, 'clicking in build mode swung the weapon').toBe(0);
  expect(after.kills).toBe(before);
  expect(errors).toEqual([]);
});

test('with every section up, nothing falls off the bottom of the panel', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await land(page);

  /**
   * The same failure the title screen had — "I can't see the submit button with all the options
   * open." Nine sections can be up at once (first steps, tools, catalogue, digging, the bench you
   * are at, the work board, the holding, the garage, the shipyard with the orbital yard under it)
   * and a base that has earned all of them is exactly when the panel matters most.
   */
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.25;
    let spot = null;
    outer: for (let r = 0; r <= 1200; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (flat(x, z) && flat(x + 14, z) && flat(x - 14, z)) { spot = { x, z }; break outer; }
    }
    if (!spot) return { none: true };
    f.teleport(spot.x, spot.z);
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 900);
    }
    for (const id of ['ship_hull', 'ship_drive', 'ship_tanks', 'ship_avionics', 'steel_ingot',
                      'machine_part', 'rope', 'lift_fuel', 'charcoal', 'cut_stone', 'gravel']) f.bag.add(id, 200);
    await new Promise(r => setTimeout(r, 400));

    // everything that puts a section on the panel
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    f.build.setTool('smooth'); f.build.setRadius(20);
    for (const [dx, dz] of [[0, 0], [13, 0], [-13, 0], [0, 13]]) { f.build.aim(spot.x + dx, spot.z + dz); f.build.paint(); }
    f.build.setTool('build');
    // R17 — the assembler is behind the tech tree now. `unlockAll` spends nothing and earns
    // nothing; it just takes every node, so this stays a test about the panel's layout.
    f.build.research?.unlockAll?.();
    for (const [key, dx, dz] of [['claim_stone', 9, 9], ['assembler', 3, 0], ['burner_generator', 6, 0],
                                 ['storage_crate', 9, 0], ['bed', -3, 0], ['bed', -5, 0], ['furnace', 0, 4]]) {
      f.build.select(key); f.build.aim(spot.x + dx, spot.z + dz); f.build.placeHere();
    }
    f.stores.put(f.stores.poolAt(spot.x + 9, spot.z), 'coal', 300);
    f.shipyardApi.buildPad();
    const { createOrder } = await import('/prototypes/farhold/js/work.js');
    f.workBoard.post(createOrder({ id: 'oz', title: 'Split the timber', tag: 'build', units: 10 }));
    // stand at the bench so its section and the garage both come up
    f.teleport(spot.x + 2, spot.z);
    await new Promise(r => setTimeout(r, 2400));

    const panel = document.getElementById('build-ui');
    const body = panel.querySelector('.build-body');
    const keys = panel.querySelector('.build-keys');
    const headings = [...panel.querySelectorAll('h2, h3')].map(h => h.textContent);
    const pRect = panel.getBoundingClientRect();
    const kRect = keys.getBoundingClientRect();

    // scroll to the very bottom and make sure the last section is reachable
    body.scrollTop = body.scrollHeight;
    await new Promise(r => setTimeout(r, 120));
    const last = [...panel.querySelectorAll('.build-body > div')].filter(d => d.textContent.trim()).pop();
    const lRect = last.getBoundingClientRect();
    f.build.setMode(false);

    return {
      headings,
      scrolls: body.scrollHeight > body.clientHeight,
      // the key line must be inside the panel, not pushed off the bottom of it
      keysInside: kRect.bottom <= pRect.bottom + 1 && kRect.top >= pRect.top,
      // …and the last section must be reachable by scrolling
      lastReachable: lRect.bottom <= pRect.bottom + 2,
      panelInView: pRect.bottom <= window.innerHeight + 1 && pRect.top >= 0,
    };
  });

  expect(out.none, 'nowhere flat enough to build a full base').toBeFalsy();
  // a real base has most of the panel open at once
  expect(out.headings.length, `only ${out.headings.length} sections came up: ${out.headings.join(', ')}`)
    .toBeGreaterThanOrEqual(5);
  expect(out.keysInside, 'the control line is pushed off the bottom of the panel').toBe(true);
  expect(out.lastReachable, 'the bottom section cannot be scrolled to').toBe(true);
  expect(out.panelInView, 'the panel itself hangs off the screen').toBe(true);
  expect(errors).toEqual([]);
});
