// Waypoints in the real page: lighting one by walking in, and travelling between them.
//
// The node tests (tests/waypoints.test.js) hold the rules. These hold the two things that only exist
// once there is a world: that crossing a town's boundary really does light its pad, and that
// clicking one on the map really does move you — onto the sigil, not next to it.

import { test, expect } from '@playwright/test';

async function land(page, seed = 11) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=ranger`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('walking into a town lights its waypoint, and you did not have to find the pad', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // NOT the one you landed beside: the game drops you next to a settlement and the boundary test
    // runs on the first tick, so that one is already lit before a test can look at it
    const town = f.features.settlements.find(s => !f.waypoints.isLit(s.id));
    const before = f.waypoints.isLit(town.id);
    // stand at the town's centre — nowhere near where the pad itself is drawn
    f.teleport(town.wx, town.wz);
    await new Promise(r => setTimeout(r, 1400));
    const pad = f.waypoints.byId(town.id);
    return {
      before, after: f.waypoints.isLit(town.id),
      // the pad is beside the square, so standing at the centre is NOT standing on it
      padAway: Math.round(Math.hypot(pad.x - town.wx, pad.z - town.wz)),
    };
  });
  expect(out.before).toBe(false);
  expect(out.after).toBe(true);
  expect(out.padAway).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('you cannot travel to a town you have never been to, and it says so', async ({ page }) => {
  await land(page);
  const why = await page.evaluate(() => {
    const f = window.farhold;
    const unvisited = f.features.settlements.find(s => !f.waypoints.isLit(s.id));
    return f.waypoints.canTravel(unvisited.id, {});
  });
  expect(why.ok).toBe(false);
  expect(why.why).toMatch(/have not been/);
});

test('clicking a lit waypoint moves you, and puts you ON the sigil', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const near = f.features.settlements.slice().sort((a, b) =>
      Math.hypot(a.wx - f.control.x, a.wz - f.control.z) - Math.hypot(b.wx - f.control.x, b.wz - f.control.z));
    const [first, second] = near;

    f.teleport(first.wx, first.wz); await new Promise(r => setTimeout(r, 1000));
    f.teleport(second.wx, second.wz); await new Promise(r => setTimeout(r, 1000));
    const lit = f.waypoints.count;

    const ok = f.travelTo(first.id);
    await new Promise(r => setTimeout(r, 900));
    const pad = f.waypoints.byId(first.id);
    return { lit, ok, onPad: Math.round(Math.hypot(f.control.x - pad.x, f.control.z - pad.z)) };
  });
  expect(out.lit).toBeGreaterThanOrEqual(2);
  expect(out.ok).toBe(true);
  // "When you teleport to a waypoint, you arrive at this sigil" — on it, not near it
  expect(out.onPad).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('the network survives a save and a reload', async ({ page }) => {
  await land(page);
  const before = await page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    await new Promise(r => setTimeout(r, 1400));
    f.saveNow ? f.saveNow() : null;
    await new Promise(r => setTimeout(r, 600));
    return { lit: f.waypoints.count, id: town.id };
  });
  expect(before.lit).toBeGreaterThan(0);

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const after = await page.evaluate(() => window.farhold.waypoints.count);
  // a network you had to walk to earn is not something a reload should take back
  expect(after).toBeGreaterThanOrEqual(before.lit);
});
