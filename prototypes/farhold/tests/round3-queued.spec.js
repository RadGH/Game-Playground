// The six things queued out of the round-3 play-test and built after the ten milestones:
// first person on V, planets that occlude one another, lens flare, god rays, the sun going behind
// a ridge, and a per-body clamp on how fast a body crosses the sky.

import { test, expect } from '@playwright/test';

async function land(page, seed = 3) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&seed=${seed}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('V puts the camera in the head and takes the head off the model', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frame();
    const third = { y: f.camera.position.y, dist: f.control.camDistanceUsed, head: f.actor.parts.head.scale.x };
    f.firstPerson(true);
    await frame(); await frame();
    const first = {
      y: f.camera.position.y, dist: f.control.camDistanceUsed,
      head: f.actor.parts.head.scale.x, eyeHeight: f.control.eyeHeight,
      want: f.control.y + f.control.eyeHeight,
    };
    f.firstPerson(false);
    await frame(); await frame();
    const back = { dist: f.control.camDistanceUsed, head: f.actor.parts.head.scale.x };
    return { third, first, back };
  });
  // the camera really is at the eye, not behind the body
  expect(out.first.dist).toBe(0);
  expect(Math.abs(out.first.y - out.first.want)).toBeLessThan(0.3);
  expect(out.first.eyeHeight).toBeGreaterThan(0.9);
  // and the head is gone while you are inside it, and back when you step out
  expect(out.first.head).toBeLessThan(0.01);
  expect(out.back.head).toBeCloseTo(out.third.head, 3);
  expect(out.back.dist).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('the bodies in the sky sit at different depths, so they can hide each other', async ({ page }) => {
  const errors = await land(page, 7);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    const bodies = f.sky.bodies.map(b => ({
      name: b.body.name, shell: b.shell, distanceAu: b.distanceAu, size: b.visibleSize,
      order: b.model.group.children[0]?.renderOrder ?? null,
    }));
    return { bodies, count: bodies.length };
  });
  expect(out.count).toBeGreaterThan(1);
  // nearer in space means nearer on the dome, which is what lets the depth buffer do the work
  const byShell = [...out.bodies].sort((a, b) => a.shell - b.shell);
  const byDistance = [...out.bodies].sort((a, b) => a.distanceAu - b.distanceAu);
  expect(byShell.map(b => b.name)).toEqual(byDistance.map(b => b.name));
  expect(new Set(out.bodies.map(b => b.shell)).size).toBe(out.count);
  expect(errors).toEqual([]);
});

test('nothing crosses the sky faster than the cap, however short its year', async ({ page }) => {
  // seed 31's inner planet has a three-day year; at one global multiplier it lapped the sky in
  // under half a minute, which is what was reported.
  const errors = await land(page, 31);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.pause(true);
    const sep = t => { f.setTime(t); return f.sky.bodies.map(b => b.dir.angleTo(f.sky.sunDirection)); };
    const a = sep(1000), b = sep(1004);
    return f.sky.bodies.map((x, i) => ({
      name: x.body.name, period: x.period, clock: x.clock,
      degPerSecond: Math.abs(b[i] - a[i]) * 180 / Math.PI / 4,
    }));
  });
  expect(out.length).toBeGreaterThan(0);
  for (const b of out) {
    expect(b.degPerSecond).toBeLessThan(1.6);
    if (b.period < 20) expect(b.clock).toBeLessThan(150);   // a short year had its clock cut back
  }
  expect(errors).toEqual([]);
});

test('the flare is on the star, dies when you look away, and survives an eclipse', async ({ page }) => {
  const errors = await land(page, 3);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.pause(true);
    const aim = () => {
      const sd = f.sky.sunDirection;
      f.control.yaw = Math.atan2(sd.x, sd.z);
      f.control.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(Math.max(-1, Math.min(1, sd.y)))));
    };
    const draw = (extra = {}) => {
      f.control.update(0.016, null, {});
      const sd = f.sky.sunDirection;
      f.sunfx.update({ camera: f.camera, sunDirection: sd, cloud: 0, eclipse: f.sky.eclipse.solar, day: 1, dt: 0.016, ...extra });
      return f.sunfx.stats();
    };
    const day = fraction => f.setTime(((fraction - 0.34 + 1) % 1) * 900);

    // a low sun, so turning round genuinely puts it behind you rather than overhead
    day(0.30); aim();
    const at = draw();
    f.control.yaw += Math.PI;
    f.control.pitch = -0.2;
    const away = draw();

    // low sun: the flare should be stronger than it is at midday, not weaker
    day(0.5); aim(); const noon = draw();
    day(0.28); aim(); const low = draw();

    // an eclipse keeps a flare and puts a ring on the star
    day(0.5); f.sky.forceEclipse('solar'); aim();
    const eclipsed = draw();
    return {
      at: at.strength, away: away.strength, noon: noon.strength, low: low.strength,
      onScreen: at.onScreen, awayOnScreen: away.onScreen,
      eclipse: { solar: f.sky.eclipse.solar, strength: eclipsed.strength, cls: f.sunfx.root.className },
    };
  });
  expect(out.onScreen).toBe(true);
  expect(out.at).toBeGreaterThan(0.05);
  expect(out.awayOnScreen).toBe(false);
  expect(out.away).toBe(0);
  expect(out.low).toBeGreaterThan(out.noon);
  if (out.eclipse.solar > 0.1) {
    expect(out.eclipse.strength).toBeGreaterThan(0);
    expect(out.eclipse.cls).toContain('eclipsed');
  }
  expect(errors).toEqual([]);
});

test('ground between you and the star puts the rays out, and lights the horizon instead', async ({ page }) => {
  const errors = await land(page, 3);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.pause(true);
    f.setTime(((0.28 - 0.34 + 1) % 1) * 900);          // sun low, so a ridge can cut it
    const sd = f.sky.sunDirection;
    const sample = () => {
      f.control.yaw = Math.atan2(sd.x, sd.z);
      f.control.pitch = Math.asin(Math.max(-1, Math.min(1, sd.y)));
      f.control.update(0.016, null, {});
      f.sunfx.update({ camera: f.camera, sunDirection: sd, cloud: 0, eclipse: 0, day: 1, dt: 0.016 });
      return f.sunfx.stats();
    };
    /**
     * Walk the world until we find somewhere with high ground in the way.
     *
     * A SEEDED walk, not `Math.random()`. This hunt gives up after 400 tries, so with a random walk
     * it was a coin flip that happened to land most of the time — it passed in isolation and failed
     * about one full-suite run in three, which is the worst kind of test to own. The same seed
     * visits the same places every time, so it either finds a ridge on this world or it never did.
     */
    /**
     * Sweep the country for the MOST blocked spot, rather than darting about until something lands
     * in a window.
     *
     * The old version threw 400 `Math.random()` darts and kept the first reading between 0.2 and
     * 0.9 — and at this sun angle this world does not produce one: the whole spread is 0 with a
     * handful of readings around 0.04-0.14. So it passed when a dart happened to find the tail and
     * failed about one full-suite run in three, which is the worst kind of test to own.
     *
     * An even sweep, every run the same, keeping the worst-occluded spot it saw. What is under test
     * is the RELATIONSHIP — ground in the way takes the shafts down — not a particular fraction.
     */
    let clear = null, partly = null;
    const sx = f.control.x, sz = f.control.z;
    const STEP = 16, SPAN = 30000;
    for (let a = 0; a < STEP; a++) {
      for (let b = 0; b < STEP; b++) {
        f.teleport(sx + (a / (STEP - 1) - 0.5) * SPAN, sz + (b / (STEP - 1) - 0.5) * SPAN * 0.7);
        const sample2 = sample();
        if (sample2.blocked === 0) { if (!clear || sample2.strength > clear.strength) clear = sample2; }
        else if (!partly || sample2.blocked > partly.blocked) partly = sample2;
      }
    }
    // and the horizon wash when the star is right on the skyline
    f.setTime(((0.25 - 0.34 + 1) % 1) * 900);
    const setting = sample();
    return { clear, partly, setting };
  });
  expect(out.partly).not.toBeNull();
  expect(out.clear).not.toBeNull();
  // a ridge across the star takes the shafts down with it
  expect(out.partly.strength).toBeLessThan(out.clear.strength);
  // and the sun on the skyline lights the sky even when the shafts are gone
  expect(out.setting.rim).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});

test('the settings can turn the sun effects off', async ({ page }) => {
  const errors = await land(page, 3);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.settings.set('sunfx', false);
    const off = { enabled: f.sunfx.enabled, visibility: getComputedStyle(f.sunfx.root).visibility };
    f.settings.set('sunfx', true);
    return { off, on: f.sunfx.enabled };
  });
  expect(out.off.enabled).toBe(false);
  expect(out.off.visibility).toBe('hidden');
  expect(out.on).toBe(true);
  expect(errors).toEqual([]);
});
