// Stream D — play-test P1 ("the game freezes 2-3 s at a time while walking — completely unplayable"): the long-frame
// detector (js/client/perf.js, tv.perf() / tv.state().stats.longFrames) watched while the world streams across a
// zone border and while the character walks the wilds among monsters, on DESKTOP settings (quality=high).
//
// What is asserted is MAIN-THREAD time, not frame time: this VM has no GPU, so every frame waits ~150-900 ms on the
// software rasteriser regardless of what the page does. A freeze is the page's own work blocking the thread —
// a zone built in one task, a shader compiled on first draw, a texture read back — and that is what perf.stalls()
// measures (frames whose own JS ran > 100 ms, plus long tasks outside the frame loop). Shader links during the
// walk are counted too (every one was a 1.5-4 s stall here before the warm-up).
//
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/freeze.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

const LIMIT_MS = 100;
const ZONE_EAST = 26624;       // z12_02 | z13_02

test('no main-thread stall over 100 ms while the world streams across a zone border and you walk the wilds', async ({ browser }) => {
  test.setTimeout(900000);
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Freezy&cls=mage&quality=high&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  // boot work (first zone, kit pieces, the shader warm-up) is allowed to take its time behind the loading screen
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  const you = (await page.evaluate(() => tv.state().you));

  // --- A: the world streams across a zone border (z12_02 -> z13_02): ground, water, town, scatter, sites, horizon ---
  await page.evaluate(() => tv.perf(true));
  const A = await page.evaluate(async ([z, from, to]) => {
    const t0 = performance.now(), speed = 12, H = (x, zz) => thousandvale.WS.terrain.heightAt(x, zz) || 0;
    await new Promise(res => { const step = () => { const x = from + (performance.now() - t0) / 1000 * speed; tv.fly(x - 10, H(x, z) + 7, z + 3, x, H(x, z) + 1, z); if (x < to) requestAnimationFrame(step); else res(); }; step(); });
    await new Promise(r => setTimeout(r, 4000));      // the far zone's extras finish arriving
    tv.fly(null);
    return { perf: tv.perf(), world: tv.world() };
  }, [you.z, ZONE_EAST - 520, ZONE_EAST + 380]);
  await page.screenshot({ path: join(SHOTS, 'p1-border-stream.png') });
  console.log('[A stream]', JSON.stringify({ stalls: A.perf.stalls, links: A.perf.links, longFrames: A.perf.longFrames, zones: A.world.zones, top: A.perf.top.slice(0, 8) }));

  // --- B: out into the wilds among monsters (bodies, shaders, spells, nameplates) ---
  const tp = await hook('/teleport', { name: 'Freezy', x: ZONE_EAST - 260, z: you.z + 40 });
  expect(tp.ok).toBe(true);
  await page.waitForFunction(() => thousandvale.S.room?.kind === 'wilds' || thousandvale.WS.ready(tv.state().you.x, tv.state().you.z), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.evaluate(() => tv.perf(true));
  const goal = { x: ZONE_EAST + 120, z: you.z + 40 };
  const t0 = Date.now();
  let walked = 0, last = await page.evaluate(() => tv.state().you);
  while (Date.now() - t0 < 120000) {
    await page.evaluate(([x, z]) => tv.walkTo(x, z), [goal.x, goal.z]);
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => tv.state());
    walked += Math.hypot(s.you.x - last.x, s.you.z - last.z); last = s.you;
    if (s.you.dead) await page.evaluate(() => tv.rise());
    // swing at whatever comes close (casts, hits, spell effects and statuses all run through the same frame)
    const foe = s.ents.filter(e => e.kind === 'monster' && !e.dead).sort((p, q) => Math.hypot(p.x - s.you.x, p.z - s.you.z) - Math.hypot(q.x - s.you.x, q.z - s.you.z))[0];
    if (foe && Math.hypot(foe.x - s.you.x, foe.z - s.you.z) < 25) await page.evaluate(id => { tv.target(id); tv.cast(1, id); }, foe.id);
    if (Math.hypot(s.you.x - goal.x, s.you.z - goal.z) < 6) break;
  }
  const B = await page.evaluate(() => ({ perf: tv.perf(), state: tv.state().stats, world: tv.world(), monsters: tv.state().ents.filter(e => e.kind === 'monster').length }));
  await page.screenshot({ path: join(SHOTS, 'p1-wilds-walk.png') });
  console.log('[B walk]', JSON.stringify({ walked: Math.round(walked), stalls: B.perf.stalls, links: B.perf.links, longFrames: B.perf.longFrames, monsters: B.monsters, lod: B.state.lod, top: B.perf.top.slice(0, 8) }));
  writeFileSync(join(HERE, 'shots', 'p1-freeze.json'), JSON.stringify({ A: { stalls: A.perf.stalls, links: A.perf.links, top: A.perf.top }, B: { walked, stalls: B.perf.stalls, links: B.perf.links, top: B.perf.top, monsters: B.monsters } }, null, 1));

  expect(errors, errors.join('\n')).toEqual([]);
  expect(A.world.zones, 'the neighbouring zone streamed in').toContain('z13_02');
  expect(A.perf.stalls.maxBusyMs, 'longest frame of page work while streaming a zone').toBeLessThanOrEqual(LIMIT_MS);
  expect(A.perf.stalls.maxTaskMs, 'longest main-thread task while streaming a zone').toBeLessThanOrEqual(LIMIT_MS);
  expect(B.perf.stalls.maxBusyMs, 'longest frame of page work while walking the wilds').toBeLessThanOrEqual(LIMIT_MS);
  expect(B.perf.stalls.maxTaskMs, 'longest main-thread task while walking the wilds').toBeLessThanOrEqual(LIMIT_MS);
  expect(walked, 'the character actually walked').toBeGreaterThan(20);
  await ctx.close();
});
