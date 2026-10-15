// Stream S (Expansion 1 §4) — Vharlen's hazards in a real browser against a real server with both provinces
// (tests/S/s-server.mjs): a hot spring (steam, Steam-soaked, then Steam-warmed in the buff row), a geyser (the rumble's
// telegraph, the column, the throw, the drift down onto the ledge), a lava vent (the glowing crack, the warning line, the
// spout, a real burn), ashfall in the Pumice Wastes and Ashfall Hollow, and stream T's steam vents breathing.
// Shots: tests/S/shots/*.png — LOOK at them.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/S/hazards.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseScatter, SCATTER_KINDS } from '../../js/rules/terrain-read.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');
const SHOTS = join(HERE, 'shots');
const HZ = JSON.parse(readFileSync(join(GAME, 'data/provinces/vharlen-hazards.json'), 'utf8'));
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
const post = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(r => r.json());
const get = path => fetch(hookBase + path).then(r => r.json());
const NAME = 'Steamer';

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 's-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: GAME, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 120000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

test('Vharlen\'s hazards: hot spring, geyser, lava vent, ashfall, steam vents', async ({ browser }) => {
  test.setTimeout(900000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = name => page.screenshot({ path: join(SHOTS, name + '.png') });
  await page.goto(base + `?quality=medium&autoplay=1&name=${NAME}&cls=warrior&tod=0.42`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.thousandvale?.vharl, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  expect((await post('/level', { name: NAME, level: 15 })).ok).toBe(true);
  /** Put me at (x, z) on the island and wait until the ground there is drawn and the veil is up. */
  const isle = async (x, z, yaw = null, settle = 5000) => {
    expect((await post('/isle', { name: NAME, x, z })).ok).toBe(true);
    await page.waitForFunction(([x, z]) => { const p = thousandvale.S.predictor.pos; return thousandvale.S.room?.province === 'vharlen' && Math.hypot(p.x - x, p.z - z) < 4 && thousandvale.WS.ready(x, z); }, [x, z], { timeout: 180000 });
    await page.waitForFunction(() => !thousandvale.travel.covered, null, { timeout: 60000 }).catch(() => {});
    if (yaw != null) await page.evaluate(y => { thousandvale.controls.cam.yaw = y; }, yaw);
    await page.waitForTimeout(settle);
  };
  const look = (pitch, dist) => page.evaluate(([p, d]) => { const c = thousandvale.controls.cam; if (p != null) c.pitch = p; if (d != null) { c.dist = d; c.distWant = d; } }, [pitch, dist]);

  // ---- 1. a hot spring: steam off the water; in it, Steam-soaked; out of it, Steam-warmed ----
  const sp = HZ.springs.find(s => s.id === 'hot_spring_1');
  await isle(sp.x + sp.r * 0.6, sp.z + sp.r * 0.3, Math.atan2(sp.x - (sp.x + sp.r * 0.6), sp.z - (sp.z + sp.r * 0.3)) + Math.PI, 3000);
  await post('/hp', { name: NAME, share: 0.4 });
  await page.waitForTimeout(4500);
  const vs1 = await page.evaluate(() => thousandvale.vharl.stats());
  expect(vs1.prov).toBe('vharlen'); expect(vs1.built).toBe(true); expect(vs1.springs).toBeGreaterThan(4);
  expect(vs1.puffs, 'steam is rising').toBeGreaterThan(4);      // (a software renderer draws a few frames a second; each frame is at most 0.1 s of steam)
  let me = (await get('/who')).find(w => w.name === NAME);
  expect(me.st, 'Steam-soaked on the server').toContain('steam_soaked');
  await expect(page.locator('.buffrow .buff[data-st="steam_soaked"]')).toBeVisible({ timeout: 10000 });
  await shot('s1-hot-spring-soaking');
  await isle(sp.x + sp.r + 18, sp.z + 4, null, 2500);
  await expect(page.locator('.buffrow .buff[data-st="item:steamed"]')).toBeVisible({ timeout: 10000 });
  const tip = await page.locator('.buffrow .buff[data-st="item:steamed"]').getAttribute('data-tip');
  expect(tip).toMatch(/Steam-warmed/); expect(tip).toMatch(/left/);
  await look(0.55, 14);
  await page.evaluate(([x, z]) => { const p = thousandvale.S.predictor.pos; thousandvale.controls.cam.yaw = Math.atan2(x - p.x, z - p.z); }, [sp.x, sp.z]);
  await page.waitForTimeout(1500);
  await shot('s2-hot-spring-warmed');

  // ---- 2. a geyser with a ledge: the rumble (telegraph), the column, the throw, the drift onto the ledge ----
  const g = HZ.geysers.find(q => q.ledge && q.ledge.cliff) || HZ.geysers.find(q => q.ledge);
  await isle(g.x, g.z, g.ledge.yaw, 3000);
  await look(0.35, 16);
  const g0 = await page.evaluate(([x, z]) => thousandvale.WS.terrain.heightAt(x, z), [g.x, g.z]);
  await page.evaluate(() => { window.__peak = -1e9; setInterval(() => { window.__peak = Math.max(window.__peak, thousandvale.S.predictor.pos.y); }, 16); });
  await page.waitForFunction(() => [...thousandvale.tele.live.values()].some(t => t.ab === 'geyser' && t.state === 'live'), null, { timeout: 30000 });
  await shot('s3-geyser-rumble');
  await page.waitForFunction(y0 => thousandvale.S.predictor.pos.y > y0 + 3, g0, { timeout: 30000 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await shot('s4-geyser-erupts');
  await page.waitForTimeout(900);
  const peak = await page.evaluate(() => window.__peak);
  expect(peak - g0, 'thrown high').toBeGreaterThan(9);
  await shot('s5-geyser-drifting');
  await page.waitForFunction(() => !thousandvale.S.predictor.pos.airborne, null, { timeout: 20000 });
  await page.keyboard.up('KeyW');
  const landed = await page.evaluate(() => ({ ...thousandvale.S.predictor.pos, corr: thousandvale.S.predictor.corrections }));
  expect(landed.y - g0, 'landed on higher ground').toBeGreaterThan(2.5);
  await page.waitForTimeout(1200);
  const srvMe = (await get('/who')).find(w => w.name === NAME);
  expect(Math.hypot(srvMe.x - landed.x, srvMe.z - landed.z), 'the server agrees where I landed (no rubber-band)').toBeLessThan(1.0);
  await look(0.6, 18);
  await page.evaluate(yaw => { thousandvale.controls.cam.yaw = yaw + Math.PI; }, g.ledge.yaw);
  await page.waitForTimeout(1500);
  await shot('s6-geyser-on-the-ledge');

  // ---- 3. a lava vent at the Caldera: the glowing crack, the warning line, the spout; then standing in it ----
  const v = HZ.vents.find(q => q.zone === 'z12_10');
  const cx = (v.ax + v.bx) / 2, cz = (v.az + v.bz) / 2, nx = -(v.bz - v.az), nz = v.bx - v.ax, nl = Math.hypot(nx, nz);
  const sx = cx + nx / nl * 7, sz = cz + nz / nl * 7;
  await isle(sx, sz, Math.atan2(cx - sx, cz - sz), 3000);
  await look(0.5, 12);
  await page.waitForFunction(() => [...thousandvale.tele.live.values()].some(t => t.ab === 'lava_vent' && t.state === 'live'), null, { timeout: 30000 });
  await shot('s7-lava-vent-warning');
  await page.waitForFunction(() => ![...thousandvale.tele.live.values()].some(t => t.ab === 'lava_vent' && t.state === 'live'), null, { timeout: 8000 });
  await shot('s8-lava-vent-spout');
  await page.waitForTimeout(3500);
  await shot('s9-lava-vent-idle');
  // a held look at the spout (the server's spout is 1.4 s and this renderer draws a frame or two a second): the same event, longer
  await page.evaluate(id => thousandvale.vharl.onEvent({ type: 'fx', kind: 'lavaVent', site: id, phase: 'spout', ms: 20000 }), v.id);
  await page.waitForTimeout(2500);
  await shot('s9b-lava-vent-spout-held');
  await page.evaluate(id => thousandvale.vharl.onEvent({ type: 'fx', kind: 'lavaVent', site: id, phase: 'spout', ms: 1 }), v.id);
  // in the line: a real burn
  await post('/hp', { name: NAME, share: 1 });
  await isle(cx, cz, null, 500);
  const hp0 = await page.evaluate(() => thousandvale.S.self.hp);
  await page.waitForFunction(h => thousandvale.S.self.hp < h - 20, hp0, { timeout: 30000 });
  await page.waitForTimeout(250);
  await shot('s10-lava-vent-burn');

  // ---- 4. ashfall: Pumice Wastes and Ashfall Hollow ----
  const pv = HZ.vents.find(q => q.zone === 'z11_10');
  const fogBefore = await page.evaluate(() => thousandvale.view.scene.fog.far);
  await isle(pv.ax + 25, pv.az + 25, 0.8, 7000);
  await look(0.25, 9);
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => thousandvale.vharl.stats().ash > 0.7, null, { timeout: 90000 });      // (it fades in over a few seconds of game time)
  const ash = await page.evaluate(() => thousandvale.vharl.stats());
  expect(ash.inAsh, 'in the ash zone').toBe(true);
  expect(ash.ash).toBeGreaterThan(0.7);
  expect(ash.fogFar, 'the fog comes in').toBeLessThan(fogBefore * 0.6);
  await shot('s11-ashfall-pumice-wastes');
  const hollow = JSON.parse(readFileSync(join(GAME, 'data/vignettes/placements/z12_11.json'), 'utf8')).settlements[0];
  await isle(12 * 2048 + hollow.x + 70, 11 * 2048 + hollow.z + 40, 3.6, 7000);
  await page.waitForTimeout(2000);
  expect((await page.evaluate(() => thousandvale.vharl.stats())).inAsh).toBe(true);
  await shot('s12-ashfall-hollow');

  // ---- 5. stream T's steam vents breathing (the fen), and out of the ash the fog comes back ----
  // Blackstrand's (the landing): the steam vent farthest from any camp, event arena or settlement — a quiet place to look
  const bs = parseScatter(readFileSync(join(GAME, 'data/zones/z13_10/scatter.bin')));
  const bsPl = JSON.parse(readFileSync(join(GAME, 'data/vignettes/placements/z13_10.json'), 'utf8'));
  const busy = [...bsPl.placements.filter(p => p.type === 'camp' || p.type === 'rare'), ...bsPl.settlements.map(q => ({ ...q, radius: (q.r || 60) + 60 })), ...((JSON.parse(readFileSync(join(GAME, 'data/zones/z13_10/placements.json'), 'utf8')).placements || []).filter(p => p.kind === 'event_site').map(p => ({ ...p, radius: 120 })))];
  const SV = SCATTER_KINDS.findIndex(k => k.key === 'steam_vent');
  let best = null;
  for (let i = 0; i < bs.count; i++) if (bs.kind[i] === SV) {
    const clear = Math.min(...busy.map(p => Math.hypot(p.x - bs.x[i], p.z - bs.z[i]) - (p.radius || 10)));
    let near = 0; for (let k = 0; k < bs.count; k++) if (bs.kind[k] === SV && Math.hypot(bs.x[k] - bs.x[i], bs.z[k] - bs.z[i]) < 40) near++;
    const score = Math.min(clear, 120) + near * 15;
    if (!best || score > best.score) best = { x: bs.x[i], z: bs.z[i], score };
  }
  await isle(13 * 2048 + best.x + 6, 10 * 2048 + best.z + 6, Math.atan2(-6, -6), 8000);
  await look(0.3, 10);
  await page.waitForTimeout(2500);
  const fenStats = await page.evaluate(() => thousandvale.vharl.stats());
  expect(fenStats.ventScatter, 'steam vents found in the loaded zones').toBeGreaterThan(20);
  expect((await get('/who')).find(w => w.name === NAME).hp, 'alive for the picture').toBeGreaterThan(0);
  expect(fenStats.wisps, 'they breathe').toBeGreaterThan(3);
  expect(fenStats.inAsh).toBe(false);
  await shot('s13-steam-vents');
  const own = errors.filter(e => /vharl|hazard|geyser|vent|spring/i.test(e));
  expect(own, own.join('\n')).toEqual([]);
});
