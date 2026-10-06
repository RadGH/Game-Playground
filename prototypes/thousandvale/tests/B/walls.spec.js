// Stream B — play-test 4 S7 in a real browser: the town walls, palisades, fences and barricades are drawn, their gates
// stand open on the roads, and the doors are swung INTO the town. Screenshots: tests/B/shots/s7-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/B/walls.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, page, ctx;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const WORLD = JSON.parse(readFileSync(join(ROOT, 'data/world/world.json'), 'utf8'));
const originOf = id => WORLD.zones.find(z => z.id === id).origin;
const wallsOf = id => JSON.parse(readFileSync(join(ROOT, `data/zones/${id}/placements.json`), 'utf8')).placements.filter(p => p.kind === 'town_wall');

test.beforeAll(async ({ browser }) => {
  test.setTimeout(420000);
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(ROOT, 'tests/D/m3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  hookBase = `http://127.0.0.1:${hp}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Mason&cls=warrior&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

/** Fly the camera to look at a gate from outside, down its road (dist m out, rise m up), and take a shot. */
async function shootGate(zone, g, name, { dist = 26, rise = 9, side = 6 } = {}) {
  const o = originOf(zone);
  await page.evaluate(([X, Z, ox, oz, dist, rise, side]) => {
    const h = thousandvale.WS.terrain.heightAt(X, Z);
    tv.fly(X + ox * dist + oz * side, h + rise, Z + oz * dist - ox * side, X, h + 2.5, Z);
  }, [g.x + o.x, g.z + o.z, g.out[0], g.out[1], dist, rise, side]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, `s7-${name}.png`) });
}

test('S7: Torborhold — stone curtain, towers, three gates on the roads, doors open inward', async () => {
  test.setTimeout(240000);
  await page.waitForFunction(() => [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02')?.walls, null, { timeout: 120000 });
  const st = await page.evaluate(() => [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02').walls.stats);
  console.log('[S7 z12_02]', JSON.stringify(st));
  expect(st.towns).toBe(3);
  expect(st.towers).toBeGreaterThanOrEqual(6);
  expect(st.gates).toBeGreaterThanOrEqual(5);
  expect(st.meshes).toBeLessThan(12);                       // instanced
  await page.evaluate(() => tv.hud(false));
  const T = wallsOf('z12_02').find(w => w.data.town === 'torborhold').data;
  for (const [k, g] of T.gates.entries()) await shootGate('z12_02', g, `torborhold-gate${k}`);
  // from inside: the doors swung in against the passage
  const g = T.gates.find(q => q.way === 'lane_torbor_north');
  await shootGate('z12_02', g, 'torborhold-north-inside', { dist: -18, rise: 6, side: 4 });
  // the whole ring from above
  const o = originOf('z12_02');
  await page.evaluate(([X, Z, r]) => { const h = thousandvale.WS.terrain.heightAt(X, Z); tv.fly(X + r * 0.9, h + r * 1.1, Z + r * 0.9, X, h, Z); }, [T.radius && wallsOf('z12_02')[0].x + o.x, wallsOf('z12_02')[0].z + o.z, T.radius]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, 's7-torborhold-above.png') });
  // a hamlet's fence and its gate
  const W = wallsOf('z12_02').find(w => w.data.settlement === 'hamlet');
  await shootGate('z12_02', W.data.gates[0], `${W.data.town}-fence`, { dist: 16, rise: 5, side: 5 });
  // at night: the gate torches are lit
  await page.evaluate(() => tv.setTime(0.02));
  await shootGate('z12_02', T.gates[0], 'torborhold-gate-night');
  await page.evaluate(() => { tv.setTime(null); tv.fly(null); tv.hud(true); });
  expect(errors).toEqual([]);
});

test('S7: the frontier — a stockade and barricades (Redcliff, z14_03)', async () => {
  test.setTimeout(300000);
  const o = originOf('z14_03');
  const walls = wallsOf('z14_03');
  const red = walls.find(w => w.data.town === 'redcliff');
  const r = await hook('/teleport', { name: 'Mason', x: o.x + red.x + 80, z: o.z + red.z });
  console.log('[teleport]', JSON.stringify(r));
  await page.waitForFunction(() => [...thousandvale.WS.loaded.values()].find(L => L.key === 'z14_03')?.walls, null, { timeout: 180000 });
  const st = await page.evaluate(() => [...thousandvale.WS.loaded.values()].find(L => L.key === 'z14_03').walls.stats);
  console.log('[S7 z14_03]', JSON.stringify(st));
  expect(st.towns).toBe(5);
  await page.evaluate(() => tv.hud(false));
  await shootGate('z14_03', red.data.gates[0], 'redcliff-stockade', { dist: 24, rise: 8 });
  const grate = red.data.openings.find(q => q.grate);
  if (grate) {
    const [a, b] = grate.ends, X = (a[0] + b[0]) / 2 + o.x, Z = (a[1] + b[1]) / 2 + o.z;
    await page.evaluate(([X, Z, cx, cz]) => { const h = thousandvale.WS.terrain.heightAt(X, Z), dx = X - cx, dz = Z - cz, L = Math.hypot(dx, dz); tv.fly(X + dx / L * 16, h + 6, Z + dz / L * 16, X, h + 1, Z); }, [X, Z, red.x + o.x, red.z + o.z]);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: join(SHOTS, 's7-redcliff-grate.png') });
  }
  const bar = walls.find(w => w.data.style === 'barricade');
  await shootGate('z14_03', bar.data.gates[0], `${bar.data.town}-barricade`, { dist: 18, rise: 6, side: 6 });
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
  expect(errors).toEqual([]);
});
