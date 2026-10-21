// Play-test 12, stream W-anim — in a real browser against a real server (tests/D/m3-server.mjs + its test hook):
//   #88 in deep water by Gullwick's quay: the stroke does not restart (counted every frame), the body crawls face down
//       moving and treads water still
//   #76 /sit: down once, then the held seat for 8 s
//   #87 a line cast to the east: the angler turns to face it
//   #72 the Torbor Watchtower's fence from above (ring pieces lie along the ring)
//   #86 a voyage played client-side to a berth that lies the wrong way round: the arrival turn stays small and slow
// Shots: tests/W/shots/wanim-*.png — LOOK at them.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/W/anim-rest.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase, page, ctx;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(r => r.json());
const shot = name => page.screenshot({ path: join(SHOTS, `wanim-${name}.png`) });

test.beforeAll(async ({ browser }) => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, '../D/m3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 60000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Swimmer&cls=ranger&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
  await page.waitForTimeout(3000);
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

/** Count the self body's clip changes and swim flag flips for `ms`, every frame. */
const watch = ms => page.evaluate(ms => new Promise(res => {
  const id = tv.state().you.id, seen = [], t0 = performance.now(); let flips = 0, last = null, frames = 0, offFrames = 0;
  const step = () => {
    const a = thousandvale.actors.get(id); frames++;
    if (a) { if (a.anim !== seen[seen.length - 1]) seen.push(a.anim); if (last != null && a.swim !== last) flips++; last = a.swim; if (!thousandvale.S.predictor.pos.swim) offFrames++; }
    if (performance.now() - t0 < ms) requestAnimationFrame(step); else res({ seen, flips, frames, offFrames });
  };
  requestAnimationFrame(step);
}), ms);

test('#88: by Gullwick\'s quay — the stroke never restarts; face-down crawl when moving, treading water when still', async () => {
  test.setTimeout(300000);
  const spots = [[30277, 4572], [30290, 4600], [28648, 5400]];
  let ok = false;
  for (const [x, z] of spots) {
    await hook('/teleport', { name: 'Swimmer', x, z });
    ok = await page.waitForFunction(() => !!thousandvale.S.predictor.pos.swim, null, { timeout: 60000, polling: 1000 }).then(() => true, () => false);
    if (ok) break;
  }
  expect(ok, 'found deep water').toBe(true);
  await page.evaluate(() => { tv.hud(false); tv.view(6, 0.3, Math.PI / 2); });
  await page.waitForTimeout(2500);
  const still = await watch(5000);
  console.log('[#88 still]', JSON.stringify(still));
  expect(still.flips, 'the swim flag never flickers').toBe(0);
  expect(still.seen, 'treading water, one clip, never restarted').toEqual(['swimTread']);
  await shot('88-tread');
  // swim along the quay (east) with the camera side on
  await page.keyboard.down('KeyD');
  const moving = await watch(3000);
  await shot('88-crawl');
  await page.keyboard.up('KeyD');
  console.log('[#88 moving]', JSON.stringify(moving), 'offFrames(predictor) =', moving.offFrames);
  expect(moving.flips).toBe(0);
  expect(moving.seen.filter(c => c === 'swimCrawl').length, 'the crawl started once').toBe(1);
  expect(moving.seen.every(c => c === 'swimTread' || c === 'swimCrawl')).toBe(true);
});

test('#87: the angler turns to face the float; #76: a sit goes down once and holds', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: 'Swimmer', x: 30262, z: 4555 });            // on the quay, facing the camera's way
  await page.waitForFunction(() => !thousandvale.S.predictor.pos.swim, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const id = await page.evaluate(() => tv.state().you.id);
  // the line lands due east (+x) while the camera (and so the input yaw) looks north
  await page.evaluate(() => { tv.view(5, 0.32, Math.PI); tv.fishDemo({ phase: 'wait', dx: 7, dz: 1e-6 }); });      // (dz 0 reads as 'unset' there: 6 m)
  await page.waitForTimeout(1800);
  const yaw = await page.evaluate(id => thousandvale.actors.get(id).yaw, id);
  await shot('87-facing-float');
  console.log('[#87] yaw', yaw);
  expect(Math.abs(Math.atan2(Math.sin(yaw - Math.PI / 2), Math.cos(yaw - Math.PI / 2))), 'faces the float (east, yaw pi/2)').toBeLessThan(0.15);
  await page.evaluate(id => tv.fishDemo({ id, phase: 'end' }), id);
  await page.waitForTimeout(500);
  // #76
  await page.evaluate(id => thousandvale.actors.playEmote(id, 'sit'), id);
  const sit = await page.evaluate(id => new Promise(res => { const seen = []; const t0 = performance.now(); let minY = 9, maxLate = -9;
    const step = () => { const a = thousandvale.actors.get(id); if (a.anim !== seen[seen.length - 1]) seen.push(a.anim); const hy = a.body.parts.hips.getWorldPosition(a.group.position.clone()).y - a.group.position.y; if (performance.now() - t0 > 2000) maxLate = Math.max(maxLate, hy); minY = Math.min(minY, hy);
      if (performance.now() - t0 < 9000) requestAnimationFrame(step); else res({ seen, minY, maxLate }); };
    requestAnimationFrame(step); }), id);
  await shot('76-seated');
  console.log('[#76]', JSON.stringify(sit));
  expect(sit.seen).toEqual(['sitGround', 'sitHold']);
  expect(sit.maxLate, 'never back up after the first 2 s').toBeLessThan(0.25);
  await page.evaluate(id => thousandvale.actors.playEmote(id, 'sit', { end: true }), id);
});

test('#72: ring walls from above — the Torbor Watchtower fence (the reported spot)', async () => {
  test.setTimeout(300000);
  for (const [name, x, z] of [['watchtower', 26526, 5851]]) {      // (the other templates move with the Torbor regeneration: tests/W/anim-rest.test.js measures every one)
    await hook('/teleport', { name: 'Swimmer', x: x + 25, z: z + 25 });
    await page.waitForTimeout(6000);
    await page.evaluate(([x, z]) => { const y = thousandvale.WS.terrain.heightAt(x, z); tv.fly(x + 9, y + 30, z + 9, x, y, z); }, [x, z]);
    await page.waitForTimeout(3500);
    await shot('72-' + name);
  }
  await page.evaluate(() => tv.fly(null));
});

test('#86: a voyage to a berth lying the other way: the arrival turn stays small and eased', async () => {
  test.setTimeout(300000);
  await hook('/teleport', { name: 'Swimmer', x: 30262, z: 4555 });
  await page.waitForTimeout(4000);
  // a short sailing south out of Gullwick's bay and back toward a berth whose yaw (0, bow south) is AGAINST the arrival (north)
  const res = await page.evaluate(() => new Promise(done => {
    const S = thousandvale.ships, path = [[30286, 4620], [30300, 4900], [30320, 5200], [30300, 4900], [30290, 4700]];
    S.startVoyage({ path, ms: 16000, from: { name: 'Gullwick' }, to: { name: 'Gullwick' }, berth: { from: { x: 30286, z: 4620, yaw: Math.PI }, to: { x: 30290, z: 4700, yaw: 0 } } });
    const ys = []; let lastYaw = null, maxRate = 0, lastT = performance.now();
    const step = () => { const st = S.state; if (!st) return done({ ys, maxRate }); const now = performance.now(), dt = (now - lastT) / 1000; lastT = now;
      if (lastYaw != null && dt > 0) { const d = Math.abs(Math.atan2(Math.sin(st.yaw - lastYaw), Math.cos(st.yaw - lastYaw))); if (st.t > st.total - 8) maxRate = Math.max(maxRate, d / dt); }
      lastYaw = st.yaw; ys.push({ t: +st.t.toFixed(2), yaw: +st.yaw.toFixed(3) });
      if (st.t > st.total + 0.5) { S.endVoyage(true); return done({ ys, maxRate }); } requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));
  const end = res.ys[res.ys.length - 1];
  console.log('[#86] end yaw', end, 'max turn rate in the last 8 s (rad/s)', res.maxRate.toFixed(2));
  expect(Math.abs(Math.atan2(Math.sin(end.yaw - Math.PI), Math.cos(end.yaw - Math.PI))), 'moored bow-in (berth + pi): no about-turn').toBeLessThan(0.35);
  expect(res.maxRate, 'never spun').toBeLessThan(1.2);
});

test('no page errors', async () => { expect(errors, errors.join('\n')).toEqual([]); });
