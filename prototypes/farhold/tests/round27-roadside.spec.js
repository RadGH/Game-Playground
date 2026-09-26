// Farhold round 27, M8 — roads you can read, in the game.
//
// The node test (round27-roadside.test.js) measures the placement, the walks, the colours and the
// light-pool order on real worlds. This is the join in the running page: the lamps on a town's
// approach light at night through the real light pool without starving it, the whole scene stays
// inside the draw-call budget there, E at a signpost reads its arms into the log, and a screenshot
// of each thing for a human to look at (research/round27-roadside/).

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'prototypes/farhold/research/round27-roadside/';
mkdirSync(SHOTS, { recursive: true });

async function land(page, query) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 150000 });
  return errors;
}

const settle = (page, ms = 1500) => page.evaluate(ms => new Promise(r => setTimeout(r, ms)), ms);

/**
 * Set the local time by the SUN, not by a number: window.farhold has two `setTime`s (a fraction
 * and, later in the object, elapsed seconds — the later one wins), so this steps the clock until
 * the sun is where it is wanted: `below` true for night, false for day.
 */
async function sunTo(page, below) {
  return page.evaluate(async (below) => {
    const f = window.farhold;
    const len = f.balance?.sky?.dayLengthSeconds ?? 900;
    for (let k = 0; k < 96; k++) {
      f.setTime((k / 96) * len);
      await new Promise(r => requestAnimationFrame(r));
      const y = f.stats().sunY;
      if (below ? y < -0.45 : y > 0.6) return y;
    }
    return null;
  }, below);
}

test('night on a town approach: the lamps light through the pool without starving it, and the scene stays in budget', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await land(page, 'seed=7');
  const at = await page.evaluate(async () => {
    const f = window.farhold;
    const side = f.features.roadside;
    const towns = f.features.settlements.filter(s => (s.size || 1) >= 3)
      .sort((a, b) => Math.hypot(a.wx - f.control.x, a.wz - f.control.z) - Math.hypot(b.wx - f.control.x, b.wz - f.control.z));
    for (const s of towns) {
      f.features.update(s.wx, s.wz, true);
      const lamps = side.lampsFor(s);
      if (lamps.length < 6) continue;
      // stand on the road between the 3rd and 4th lamp out, looking back at the town
      const l = lamps[3];
      f.teleport(l.x + Math.sin(l.face) * 3, l.z + Math.cos(l.face) * 3);
      f.control.yaw = Math.atan2(s.wx - f.control.x, s.wz - f.control.z);
      f.control.pitch = -0.1;
      return { town: s.name, lamps: lamps.length };
    }
    return null;
  });
  expect(at, 'no size-3 town with lamps on seed 7').toBeTruthy();
  expect(await sunTo(page, true)).not.toBeNull();
  await settle(page, 2500);
  const night = await page.evaluate(async () => {
    const f = window.farhold;
    const calls = [];
    for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 200)); calls.push(f.stats().drawCalls); }
    const pool = f.light.pool;
    const lit = pool.filter(l => l.visible);
    const built = f.features.roadsideBuilt;
    const lampSet = new Set(built.lamps.map(l => `${l.glow[0].toFixed(2)},${l.glow[2].toFixed(2)}`));
    return {
      calls: Math.max(...calls), pool: pool.length, lit: lit.length,
      lampLit: lit.filter(l => lampSet.has(`${l.position.x.toFixed(2)},${l.position.z.toFixed(2)}`)).length,
      torch: f.light.torch.intensity, lampsBuilt: built.lamps.length,
      glass: f.features.instanced.lampglow.material.color.r,
      sunY: f.stats().sunY,
    };
  });
  await page.screenshot({ path: SHOTS + 'lamps-night.png' });
  console.log(`# ${at.town}: ${night.lampsBuilt} lamps built, ${night.lit}/${night.pool} pool lights on (${night.lampLit} of them lamps), torch ${night.torch.toFixed(2)}, draw calls ${night.calls}`);
  expect(night.sunY).toBeLessThan(0);
  expect(night.lit).toBeLessThanOrEqual(night.pool);
  expect(night.lampLit).toBeGreaterThan(0);                  // the lamps really are lit
  expect(night.torch).toBeGreaterThan(0);                    // …and your own lamp is still burning
  expect(night.glass).toBeGreaterThan(0.9);                  // the glass glows at night
  expect(night.calls).toBeLessThan(95);                      // the plan's budget, at a town approach at night
  // by day the glass is dull and the lamps ask for no light at all
  expect(await sunTo(page, false)).not.toBeNull();
  await settle(page, 800);
  const day = await page.evaluate(() => ({ glass: window.farhold.features.instanced.lampglow.material.color.r, sources: window.farhold.features.lampSources(window.farhold.control.x, window.farhold.control.z).length }));
  expect(day.glass).toBeLessThan(0.5);
  expect(day.sources).toBe(0);
  await page.screenshot({ path: SHOTS + 'lamps-day.png' });
  expect(errors).toEqual([]);
});

test('E at a signpost reads its arms into the log — a place you do not know yet reads "?"', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await land(page, 'seed=7');
  await sunTo(page, false);
  const post = await page.evaluate(async () => {
    const f = window.farhold;
    // the nearest junction post with two or more arms
    const posts = f.features.roadside.posts().filter(p => p.kind === 'junction' && p.arms.length >= 2)
      .sort((a, b) => Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z));
    const p = posts[0];
    f.teleport(p.x + (p.x - p.at[0]) * 0.35, p.z + (p.z - p.at[1]) * 0.35);
    f.features.update(f.control.x, f.control.z, true);
    await new Promise(r => setTimeout(r, 1200));
    f.control.yaw = Math.atan2(p.at[0] - f.control.x, p.at[1] - f.control.z);
    f.control.pitch = -0.2;
    return { x: p.x, z: p.z, arms: p.arms.length, names: p.arms.map(a => f.features.settlements.find(s => s.id === a.settlement)?.name) };
  });
  await settle(page, 1200);
  const prompt = await page.evaluate(() => document.getElementById('prompt')?.textContent || document.querySelector('.prompt')?.textContent || '');
  await page.keyboard.press('KeyE');
  await settle(page, 400);
  // the newest line that is the sign's (a world event can land in the log in the same moment)
  const line = await page.evaluate(() => (window.farhold.hud.lines.find(l => /^The signpost reads/.test(l.text)) || window.farhold.hud.lines[0])?.text || '');
  await page.screenshot({ path: SHOTS + 'signpost.png' });
  console.log(`# the signpost: ${line}`);
  expect(prompt).toMatch(/signpost/i);
  expect(line).toMatch(/^The signpost reads/);
  expect((line.match(/ km/g) || []).length).toBe(post.arms);
  // a fresh save knows only the region it started in: whatever it names, it names only there
  const known = await page.evaluate(({ names }) => {
    const f = window.farhold;
    return names.map(n => {
      const s = f.features.settlements.find(q => q.name === n);
      return { n, knows: !!f.map?.knows?.(f.zones.at(s.wx, s.wz)?.id) };
    });
  }, post);
  for (const k of known) {
    if (k.knows) expect(line).toContain(k.n);
    else expect(line).not.toContain(k.n);
  }
  expect(errors).toEqual([]);
});

test('three kinds of road, a milestone and a signpost, to look at', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await land(page, 'seed=25392&scale=0.1');
  const shoot = async (name, fn) => {
    const ok = await page.evaluate(fn);
    if (!ok) return false;
    await settle(page, 1800);
    await page.screenshot({ path: SHOTS + name });
    return true;
  };
  await sunTo(page, false);
  const standOn = async (klass) => {
    const f = window.farhold;
    const p = f.terrain.roadPaths.find(q => q.klass === klass && q.points.length > 12 && !q.lift?.some(v => v > 0.5));
    if (!p) return false;
    const i = Math.floor(p.points.length / 2), [x, z] = p.points[i], [nx, nz] = p.points[i + 2];
    f.teleport(x - (nx - x) * 0.5, z - (nz - z) * 0.5);
    f.control.yaw = Math.atan2(nx - x, nz - z);
    f.control.pitch = -0.32;
    return true;
  };
  const shots = [];
  for (const k of ['highway', 'road', 'trail']) {
    const got = await page.evaluate(standOn, k);
    if (!got) continue;
    await settle(page, 1800);
    await page.screenshot({ path: SHOTS + `${k}.png` });
    shots.push(k);
  }
  expect(shots).toContain('highway');
  expect(shots).toContain('trail');
  const mile = await shoot('milestone.png', () => {
    const f = window.farhold;
    const m = f.features.roadside.milestones()[0];
    if (!m) return false;
    f.teleport(m.along[0] + (m.along[0] - m.x) * 0.2, m.along[1] + (m.along[1] - m.z) * 0.2);
    f.control.yaw = Math.atan2(m.x - f.control.x, m.z - f.control.z) + 0.25;
    f.control.pitch = -0.25;
    return true;
  });
  console.log(`# shots: ${shots.join(', ')}${mile ? ', milestone' : ''}`);
  expect(errors).toEqual([]);
});
