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
  // the four steps, because "how do I start a base" must be answerable without leaving the game
  await expect(panel.locator('.build-steplist li')).toHaveCount(4);
  await expect(panel).toContainText('Level');
  await expect(panel).toContainText('Claim Stone');

  // every tool has a button, and picking one takes
  const tools = await panel.locator('.build-tool').allTextContents();
  expect(tools).toEqual(expect.arrayContaining(['Level', 'Place', 'Road', 'Wall', 'Take down']));
  await panel.locator('.build-tool', { hasText: 'Level' }).first().click();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('smooth');

  // a piece shows a price, and the price is the one the placement will charge
  const cost = await page.evaluate(() => {
    const f = window.farhold;
    const row = [...document.querySelectorAll('#build-ui .build-row')]
      .find(r => r.textContent.includes('Claim Stone'));
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

  // …then put a claim stone down with a click, through the panel
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#build-ui .build-row')].find(r => r.textContent.includes('Claim Stone'));
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
