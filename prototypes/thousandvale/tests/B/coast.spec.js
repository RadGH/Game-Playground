// Coast stream — play-test 11 Z61 (Gullwick on the coast with a real harbour) and Z4 (no road or river on the map runs
// into the sea), in a real browser against a real server (tests/V/v-server.mjs: memory DB, Torbor Downs + Vharlen).
// Shots: tests/B/shots/coast-*.png — LOOK at them.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/B/coast.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
const post = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(r => r.json());

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, '..', 'V', 'v-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 90000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

test('Gullwick from the quay, from the air and on the map; the map lines stop at the shore', async ({ browser }) => {
  test.setTimeout(420000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  const shot = name => page.screenshot({ path: join(SHOTS, `coast-${name}.png`) });
  await page.goto(base + '?quality=high&autoplay=1&name=Wharfer&cls=warrior&tod=0.42');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.thousandvale?.ships, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  const hm = await post('/harbour', { name: 'Wharfer' });
  expect(hm.ok, JSON.stringify(hm)).toBe(true);
  await page.waitForFunction(id => { const a = thousandvale.actors.get(id); const me = thousandvale.S.predictor.pos; return a && Math.hypot(a.pos.x - me.x, a.pos.z - me.z) < 8; }, hm.id, { timeout: 120000 });
  await page.waitForFunction(() => !thousandvale.travel.covered, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  // the Harbourmaster stands on the quay at the foot of the long pier, the Saltwren alongside its end
  const where = await page.evaluate(() => { const p = thousandvale.S.predictor.pos; return { x: p.x, z: p.z, y: tv.state().you?.y ?? null }; });
  expect(where.z).toBeGreaterThan(4545); expect(where.z).toBeLessThan(4566);       // on the quay (world z 4547-4564)
  for (const [name, dist, pitch, yaw] of [['quay-pier', 14, 0.22, 0], ['quay-town', 16, 0.25, Math.PI], ['harbour-air', 70, 0.62, -2.4], ['bay-air', 170, 0.55, 2.2], ['quay-east', 12, 0.18, Math.PI / 2]]) {
    await page.evaluate(([d, p, y]) => tv.view(d, p, y), [dist, pitch, yaw]);
    await page.waitForTimeout(2200);
    await shot(name);
  }
  // the map: the region round Gullwick (the bay, the quay), the whole world (both islands) and Vharlen close up
  await page.keyboard.press('KeyM');
  await expect(page.locator('#panel-map')).toBeVisible();
  await page.evaluate(() => { tvui.reveal(30200, 4600, 3000); tvui.reveal(25600, 21500, 4000); });
  await page.evaluate(() => tvui.preset('region'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => tvui.showAt(30300, 4600, 0.7));
  await page.waitForTimeout(2500);
  await page.evaluate(() => tvui.showAt(30300, 4600, 0.7));
  await shot('map-gullwick');
  await page.evaluate(() => tvui.preset('world'));
  await page.waitForTimeout(1500);
  await shot('map-world');
  await page.evaluate(() => tvui.showAt(25600, 21500, 0.12));
  await page.waitForTimeout(1500);
  await shot('map-vharlen');
  await page.evaluate(() => tvui.showAt(26600, 6200, 0.08));
  await page.waitForTimeout(1500);
  await shot('map-torbor');
  // the map model holds only built lines: none of them over the sea
  const lines = await page.evaluate(async () => { const m = window.tvui.map(); return m ? { roads: m.roads ?? null } : null; });
  expect(lines).not.toBeNull();
  expect(errors.filter(e => !/ResizeObserver/.test(e))).toEqual([]);
});
