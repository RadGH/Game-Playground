// R28 — the building half, played in the real page with keys and clicks only.
//
//   "Improve building system and automation … update interfaces."
//
// Every step here goes through the same door a player uses: B, the ring, a click on the canvas,
// Q, F, Shift+click, Enter, Ctrl+Z. `window.farhold` is read to CHECK what happened and to put
// materials in the bag, never to do the thing being tested.
//
// Run on its own (one Playwright process at a time on this VM):
//   flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/farhold/tests/round28-building.spec.js

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'prototypes/farhold/research/round28-building';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 150000 });
  return errors;
}

/** Somewhere flat and dry, away from the town, with room for a 30 m wall. */
async function flatSpot(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const ok = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.15;
    for (let r = 160; r <= 1800; r += 30) for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      let good = true;
      for (const [dx, dz] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14], [10, 10], [-10, 10], [10, -10], [-10, -10]]) {
        if (!ok(x + dx, z + dz)) { good = false; break; }
      }
      if (good) {
        f.teleport(x, z);
        await new Promise(res => setTimeout(res, 700));
        return { x: f.control.x, z: f.control.z };
      }
    }
    return null;
  });
}

/** Move the mouse over the canvas until the ghost is green. Returns the screen point, or null. */
async function aimGreen(page, tries) {
  for (const [x, y] of tries) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    if (await page.evaluate(() => !!window.farhold.build.lastCheck?.ok)) return [x, y];
  }
  return null;
}

const count = (page, key) => page.evaluate(k => window.farhold.build.entries.filter(e => e.key === k).length, key);

test('Q turns, a click places, Shift+click lays a line, Ctrl+Z takes back one step at a time, F frees', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const errors = await land(page);
  const spot = await flatSpot(page);
  expect(spot, 'no flat dry ground anywhere near the landing').not.toBeNull();
  await page.evaluate(() => window.farhold.bag.add('log', 200));
  const logs0 = await page.evaluate(() => window.farhold.bag.count('log'));

  // B → ring → Storage → Storage Box
  await page.keyboard.press('KeyB');
  const ring = page.locator('#build-radial');
  await expect(ring).toBeVisible();
  await ring.locator('.br-item[data-id="store"]').click();
  await ring.locator('.br-item[data-id="storage_crate"]').click();
  await expect(ring).toBeHidden();
  const card = page.locator('#build-card');
  await expect(card).toBeVisible();
  // the key strip is on the card, so the new keys exist for the player
  await expect(card).toContainText('Shift+click a line');
  await expect(card).toContainText('Q or scroll turn');

  // Q turns the ghost by exactly one catalogue step; Shift+Q turns it back
  const step = await page.evaluate(() => window.farhold.build.plan.rules.rotateStep);
  const r0 = await page.evaluate(() => window.farhold.build.rot);
  await page.keyboard.press('KeyQ');
  const r1 = await page.evaluate(() => window.farhold.build.rot);
  expect(Math.abs(((r1 - r0 + Math.PI * 4) % (Math.PI * 2)) - step)).toBeLessThan(1e-6);
  await page.keyboard.press('Shift+KeyQ');
  expect(Math.abs(await page.evaluate(() => window.farhold.build.rot) - r0)).toBeLessThan(1e-6);
  await page.keyboard.press('KeyQ');

  // a click places it, turned the way Q left it
  const at = await aimGreen(page, [[640, 560], [600, 560], [680, 560], [640, 600], [640, 520]]);
  expect(at, `the ghost never went green: ${await page.evaluate(() => window.farhold.build.lastCheck?.why)}`).not.toBeNull();
  const canvas = page.locator('#stage canvas');
  await canvas.click({ position: { x: at[0], y: at[1] } });
  await page.waitForTimeout(350);
  expect(await count(page, 'storage_crate')).toBe(1);
  const placedRot = await page.evaluate(() => window.farhold.build.entries.find(e => e.key === 'storage_crate').rot);
  expect(Math.abs(placedRot - r1), 'Q did not turn what was placed').toBeLessThan(1e-6);

  // Shift held: the card prices a whole line from the crate to the cursor; Shift+click lays it
  await page.keyboard.down('Shift');
  await page.mouse.move(at[0] + 300, at[1]);
  await page.waitForTimeout(400);
  const line = await page.evaluate(() => window.farhold.build.lineInfo);
  expect(line?.count, `no line offered: ${JSON.stringify(line)}`).toBeGreaterThan(1);
  await expect(card).toContainText('Shift+click:');
  await page.screenshot({ path: `${SHOTS}/line-preview.png` });
  await canvas.click({ position: { x: at[0] + 300, y: at[1] }, modifiers: ['Shift'] });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(400);
  const afterLine = await count(page, 'storage_crate');
  expect(afterLine, 'Shift+click laid no line').toBeGreaterThan(2);

  // Ctrl+Z takes the WHOLE line back in one press, and a second press the first crate
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(300);
  expect(await count(page, 'storage_crate')).toBe(1);
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(300);
  expect(await count(page, 'storage_crate')).toBe(0);
  expect(await page.evaluate(() => window.farhold.bag.count('log')), 'undo is a full refund').toBe(logs0);

  // F: free placement on, said on the card, and off again
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.farhold.build.free)).toBe(true);
  await page.mouse.move(at[0] + 3, at[1] + 2);
  await page.waitForTimeout(300);
  await expect(card).toContainText('free placement');
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.farhold.build.free)).toBe(false);
  // …and F still means nothing else in build mode (the Followers screen did not open)
  expect(await page.evaluate(() => !!window.farhold.hud?.sheetOpen)).toBe(false);

  expect(errors).toEqual([]);
});

test('the Wall tool from the ring: corners, a corner clicked twice is a gate, the bill before Enter, one undo', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const errors = await land(page);
  const spot = await flatSpot(page);
  expect(spot).not.toBeNull();
  // enough of everything a palisade run with a gate costs, in the materials' real ids
  await page.evaluate(() => {
    const f = window.farhold;
    const bill = f.build.plan.runBill({ id: 'palisade', points: [[0, 0], [60, 0], [60, 60]], gateCorners: [1] });
    for (const [id, n] of Object.entries(bill.cost)) f.bag.add(id, n * 2 + 10);
  });

  await page.keyboard.press('KeyB');
  const ring = page.locator('#build-radial');
  await expect(ring).toBeVisible();
  await ring.locator('.br-item[data-id="_tools"]').click();
  // every R28 tool is on the ring, not only in the long panel
  for (const key of ['move', 'upgrade', 'copy', 'stamp']) await expect(ring.locator(`.br-item[data-id="${key}"]`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tools-ring.png` });
  await ring.locator('.br-item[data-id="wall"]').click();
  await expect(ring).toBeHidden();
  expect(await page.evaluate(() => [window.farhold.build.tool, window.farhold.build.selected])).toEqual(['wall', 'palisade']);

  const card = page.locator('#build-card');
  await expect(card).toContainText('click a corner twice for a gate');
  const canvas = page.locator('#stage canvas');
  const corners = [[420, 590], [860, 590], [860, 470]];
  await canvas.click({ position: { x: corners[0][0], y: corners[0][1] } });
  await page.waitForTimeout(200);
  await canvas.click({ position: { x: corners[1][0], y: corners[1][1] } });
  await page.waitForTimeout(200);
  // the same corner again: a gate goes there
  await canvas.click({ position: { x: corners[1][0], y: corners[1][1] } });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.farhold.build.runGates)).toEqual([1]);
  await canvas.click({ position: { x: corners[2][0], y: corners[2][1] } });
  await page.waitForTimeout(250);
  // the cursor wanders off: the bill stays what Enter will lay, and the card points at the extra leg
  await page.mouse.move(560, 470);
  await page.waitForTimeout(300);
  await expect(card).toContainText('m more, Enter to lay');
  // the bill is on the card BEFORE Enter: metres, sections, the gate and the price
  const info = await page.evaluate(() => window.farhold.build.runInfo);
  expect(info?.gates).toBe(1);
  expect(info?.count).toBeGreaterThan(3);
  await expect(card).toContainText(/\d+ m · \d+ sections, 1 gate/);
  await page.screenshot({ path: `${SHOTS}/wall-run-card.png` });

  const before = await page.evaluate(() => window.farhold.build.entries.length);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const laid = await page.evaluate(() => {
    const es = window.farhold.build.entries;
    return { walls: es.filter(e => e.key === 'palisade').length, gates: es.filter(e => e.key === 'gate').length, n: es.length };
  });
  expect(laid.gates, 'the corner clicked twice made no gate').toBe(1);
  expect(laid.n - before, 'the run laid fewer pieces than it priced').toBe(info.count);

  // the long panel shows the same key strip and the tools (Tab), and its screenshot is the UI check
  await page.keyboard.press('Tab');
  await expect(page.locator('#build-ui')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/panel.png` });

  // one Ctrl+Z is the whole run, gate included
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.farhold.build.entries.length)).toBe(before);

  expect(errors).toEqual([]);
});

test('an enemy with a wall in its way breaks it; the Repair tool quotes and mends a damaged section', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const errors = await land(page);
  const spot = await flatSpot(page);
  expect(spot).not.toBeNull();

  // a three-section palisade across the view, where the cursor at (640, 470) meets the ground (the
  // clicks that lay a wall are the test above; this one is about what happens to it)
  await page.keyboard.press('KeyB');
  await page.mouse.click(640, 470, { button: 'right' });       // right-click puts the ring away
  await expect(page.locator('#build-radial')).toBeHidden();
  await page.mouse.move(640, 470);
  await page.waitForTimeout(400);
  const layout = await page.evaluate(() => {
    const f = window.farhold;
    f.bag.add('log', 300);
    const w = f.build.aimAt, px = f.control.x, pz = f.control.z;
    const L = Math.hypot(w.x - px, w.z - pz) || 1;
    const dx = (w.x - px) / L, dz = (w.z - pz) / L;
    // the Wall tool's own calls, so the sections go through the same join (solid, on the base)
    f.build.setTool('wall');
    f.build.select('palisade');
    f.build.addRunPoint(w.x - dz * 3, w.z + dx * 3);
    f.build.addRunPoint(w.x + dz * 3, w.z - dx * 3);
    const res = f.build.finishRun();
    return { ids: (res.placed || []).map(e => e.id), enemy: { x: px + dx * (L + 7), z: pz + dz * (L + 7) } };
  });
  const ids = layout.ids;
  await page.keyboard.press('KeyB');
  expect(await page.evaluate(() => window.farhold.build.mode)).toBe(false);
  expect(ids.length).toBe(3);

  // an enemy on the far side, hitting hard enough that the test does not take minutes; companions
  // are told to stand aside so the only thing between it and the player is the wall
  const spawned = await page.evaluate(async ({ x, z }) => {
    const f = window.farhold;
    f.field.setCompanions(null);
    const def = (f.field.defs || []).find(d => !d.ranged && !d.hover && !d.flies) || f.field.defs[0];
    const e = await f.field.add(def, 1, x, z);
    if (!e) return null;
    e.hp = e.maxHp = 1e6;
    e.dmg = [150, 150];
    e.state = 'chase';
    window.__siege = e;
    return { name: e.name, ranged: !!e.ranged };
  }, layout.enemy);
  expect(spawned, 'no enemy could be spawned').not.toBeNull();
  expect(spawned.ranged).toBe(false);

  // it walks up to the wall and swings at it: one section is damaged, and darkens with a bar
  await page.waitForFunction(() => window.farhold.build.damaged.length > 0, null, { timeout: 60000 });
  const hurt = await page.evaluate(() => {
    const f = window.farhold;
    const e = f.build.damaged[0];
    // take the enemy out of the fight now, so the section is still standing to repair
    window.__siege.hp = 0; window.__siege.playerDamage = 0; f.field.kill(window.__siege);
    return { id: e.id, ...f.build.plan.health(e), x: e.x, z: e.z };
  });
  expect(ids).toContain(hurt.id);
  expect(hurt.hp).toBeLessThan(hurt.maxHp);
  await page.screenshot({ path: `${SHOTS}/damaged-wall.png` });

  // Repair, from the Tools ring: hover the section and the card quotes the price; click mends it
  await page.keyboard.press('KeyB');
  const ring = page.locator('#build-radial');
  await expect(ring).toBeVisible();
  await ring.locator('.br-item[data-id="_tools"]').click();
  await ring.locator('.br-item[data-id="repair"]').click();
  await expect(ring).toBeHidden();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('repair');
  // find a screen point over the damaged section by sweeping the cursor until the tool picks it
  const canvas = page.locator('#stage canvas');
  let over = null;
  for (let y = 380; y <= 640 && !over; y += 20) {
    for (let x = 440; x <= 840; x += 40) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(120);
      if (await page.evaluate(id => window.farhold.build.lastPoint?.entry?.id === id, hurt.id)) { over = [x, y]; break; }
    }
  }
  expect(over, 'the cursor never found the damaged section').not.toBeNull();
  const card = page.locator('#build-card');
  await expect(card).toContainText(/Click: repair the Palisade \(\d+\/\d+ HP\) for /);
  await page.screenshot({ path: `${SHOTS}/repair-quote.png` });
  const logs = await page.evaluate(() => window.farhold.bag.count('log'));
  await canvas.click({ position: { x: over[0], y: over[1] } });
  await page.waitForTimeout(400);
  const after = await page.evaluate(id => {
    const f = window.farhold;
    const e = f.build.entries.find(x => x.id === id);
    return { ...f.build.plan.health(e), logs: f.bag.count('log') };
  }, hurt.id);
  expect(after.hp, 'the repair did not mend it').toBe(after.maxHp);
  expect(logs - after.logs, 'the repair was free').toBeGreaterThan(0);
  await page.keyboard.press('KeyB');

  // a second enemy, hard enough to break a section outright: the piece is gone, salvage logged
  await page.evaluate(async ({ x, z }) => {
    const f = window.farhold;
    const def = (f.field.defs || []).find(d => !d.ranged && !d.hover && !d.flies) || f.field.defs[0];
    const e = await f.field.add(def, 1, x, z);
    e.hp = e.maxHp = 1e6;
    e.dmg = [5000, 5000];
    e.state = 'chase';
    window.__siege = e;
  }, layout.enemy);
  await page.waitForFunction(n => window.farhold.build.entries.filter(e => e.key === 'palisade').length < n, 3, { timeout: 60000 });
  const broke = await page.evaluate(() => window.farhold.hud.lines.slice(0, 8).map(l => l.text).join(' | '));
  expect(broke).toMatch(/breaks the Palisade\. .* salvaged\./);
  await page.screenshot({ path: `${SHOTS}/wall-broken.png` });

  expect(errors).toEqual([]);
});
