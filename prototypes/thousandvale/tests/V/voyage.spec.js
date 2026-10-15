// Stream V (Expansion 1 §6) — the voyage in a real browser against a real server (tests/V/v-server.mjs, Torbor Downs).
// Gullwick's Harbourmaster talks and opens the harbour window; with Vharlen not loaded the Port Vharl ship "is not
// sailing yet"; a TEST sailing over the same sea route (to a quay in Torbor Downs) runs a whole voyage — Set sail, the
// fare, the ship on the sea with you on deck, the camera following, the serpent, the volcano ahead, Skip, and the
// `joined` at the far end. Then the way back (Port Vharl -> Gullwick) is played from a `shipSail` and looked at.
// Shots: tests/V/shots/*.png — LOOK at them.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/V/voyage.spec.js
//   V_BOTH=1 loads Vharlen too, so the real Gullwick -> Port Vharl crossing runs end to end (no test sailing).
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const DATA = JSON.parse(readFileSync(join(HERE, '../../data/provinces/ships.json'), 'utf8'));
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
const post = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(r => r.json());

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'v-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

test('the voyage: the Harbourmaster, Set sail, the crossing on the real sea, the arrival — and the way back', async ({ browser }) => {
  test.setTimeout(600000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = name => page.screenshot({ path: join(SHOTS, name + '.png') });
  await page.goto(base + '?quality=medium&autoplay=1&name=Mariner&cls=warrior&tod=0.42');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.thousandvale?.ships, null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  // ---- to Gullwick's quay ----
  const hm = await post('/harbour', { name: 'Mariner', gold: 200 });
  expect(hm.ok, JSON.stringify(hm)).toBe(true);
  await page.waitForFunction(id => { const a = thousandvale.actors.get(id); const me = thousandvale.S.predictor.pos; return a && Math.hypot(a.pos.x - me.x, a.pos.z - me.z) < 8; }, hm.id, { timeout: 120000 });
  await page.waitForFunction(() => !thousandvale.travel.covered, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await shot('v1-harbourmaster');
  // ---- talk: the harbour window. With Vharlen loaded the ship sails for Port Vharl; without it, it "is not sailing yet"
  // and a TEST sailing over the same sea (to a quay in Torbor Downs) runs the whole voyage instead ----
  await page.evaluate(id => thousandvale.S.net.use(id), hm.id);
  await expect(page.locator('#panel-ship')).toBeVisible();
  const pvRow = page.locator('#panel-ship .ship-row[data-harbour="port_vharl"]');
  await expect(pvRow).toContainText('Port Vharl');
  await expect(pvRow).toContainText('levels 10–20');
  await shot('v2-harbour-window');
  const vharlen = !(await pvRow.locator('[data-act="pick"]').isDisabled());
  let row = pvRow;
  if (!vharlen) {
    await expect(pvRow).toContainText('not sailing');
    expect((await post('/testsail', {})).ok).toBe(true);
    await page.evaluate(id => thousandvale.S.net.use(id), hm.id);
    row = page.locator('#panel-ship .ship-row[data-harbour="test_cove"]');
  }
  await expect(row).toContainText('60 gold');
  await row.locator('[data-act="pick"]').click();
  await expect(row.locator('[data-act="go"]')).toHaveText('Pay 60 and sail');
  await shot('v3-confirm');
  await row.locator('[data-act="go"]').click();
  await page.waitForFunction(() => thousandvale.ships.active, null, { timeout: 15000 });
  const t0 = Date.now();
  await expect(page.locator('#panel-ship')).toBeHidden();
  await expect(page.locator('.ship-banner')).toBeVisible();
  await expect(page.locator('.ship-banner .sb-skip')).toBeDisabled();
  const gold = await page.evaluate(() => thousandvale.S.net.joined.you.gold);
  expect(gold).toBe(140);
  // moments of the crossing (the clock is jumped; the server's 40 s keep running underneath)
  const moments = [[0.8, 'v4-cast-off'], [5, 'v5-under-way'], [11, 'v6-open-sea'], [18.2, 'v7-serpent'], [27, 'v8-volcano-ahead'], [36.5, 'v9-coming-alongside']];
  for (const [sec, name] of moments) {
    await page.evaluate(s => thousandvale.ships.seek(s), sec);
    await page.waitForTimeout(sec === 0.8 ? 400 : 900);
    const st = await page.evaluate(() => { const s = thousandvale.ships.state, me = thousandvale.actors.get(thousandvale.S.selfId); return { ...s, me: me && { x: me.pos.x, y: me.pos.y, z: me.pos.z }, cam: { x: thousandvale.camera.position.x, y: thousandvale.camera.position.y, z: thousandvale.camera.position.z } }; });
    expect(st, name).toBeTruthy();
    expect(Math.hypot(st.me.x - st.x, st.me.z - st.z), name + ': you stand on the deck').toBeLessThan(6);
    expect(st.me.y, name + ': above the water').toBeGreaterThan(0.6);
    expect(Math.hypot(st.cam.x - st.x, st.cam.z - st.z), name + ': the camera follows the ship').toBeLessThan(140);
    if (name === 'v7-serpent') expect(st.serpent, 'the brine-wyrm is up').toBe(true);
    await shot(name);
  }
  // after five real seconds the skip button wakes up
  await page.waitForTimeout(Math.max(0, 5600 - (Date.now() - t0)));
  await expect(page.locator('.ship-banner .sb-skip')).toBeEnabled();
  // ---- the arrival: skip, `joined` at the far end, on your feet ----
  await page.locator('.ship-banner .sb-skip').click();
  await page.waitForFunction(() => !thousandvale.ships.active, null, { timeout: 30000 });
  await page.waitForFunction(() => !thousandvale.travel.covered, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ pos: { ...thousandvale.S.predictor.pos }, room: thousandvale.S.room, banner: !document.querySelector('.ship-banner') || document.querySelector('.ship-banner').hidden }));
  expect(after.banner, 'the banner is gone').toBe(true);
  if (vharlen) {
    const dock = DATA.harbours.find(h => h.id === 'port_vharl').dock;
    expect(after.room?.province, 'ashore in Vharlen').toBe('vharlen');
    expect(Math.hypot(after.pos.x - dock.x, after.pos.z - dock.z), 'on Port Vharl\'s quay').toBeLessThan(6);
    await page.waitForTimeout(4000);
  }
  await shot('v10-ashore');
  // ---- the way back: Port Vharl -> Gullwick, played from the server's own message shape ----
  const back = DATA.sailings.find(s => s.from === 'port_vharl');
  const pv = DATA.harbours.find(h => h.id === 'port_vharl'), gw = DATA.harbours.find(h => h.id === 'gullwick');
  await page.evaluate(m => tv.fake('shipSail', m), { from: { id: 'port_vharl', name: 'Port Vharl', province: 'vharlen' }, to: { id: 'gullwick', name: 'Gullwick', province: 'torbor_downs' }, ship: 'the Saltwren', ms: 40000, skipMs: 5000, fare: 60, path: back.path, crew: [], berth: { from: pv.berth, to: gw.berth }, volcano: DATA.volcano });
  await page.waitForFunction(() => thousandvale.ships.active, null, { timeout: 15000 });
  for (const [sec, name] of [[1.5, 'v11-leaving-vharlen'], [20, 'v12-homeward'], [37.5, 'v13-gullwick-coast']]) {
    await page.evaluate(s => thousandvale.ships.seek(s), sec);
    await page.waitForTimeout(900);
    await shot(name);
  }
  await page.evaluate(() => thousandvale.ships.endVoyage());
  // ---- the moored ship at Gullwick's berth (decor) ----
  await page.evaluate(b => { thousandvale.S.fly = { x: b.x - 60, y: 22, z: b.z + 40, lx: b.x, ly: 4, lz: b.z }; }, gw.berth);
  await page.waitForTimeout(2500);
  await shot('v14-moored-gullwick');
  await page.evaluate(() => { thousandvale.S.fly = null; });
  expect(errors.filter(e => !/favicon|net::ERR|404/.test(e)), errors.join('\n')).toEqual([]);
  await ctx.close();
});

// The look of the crossing, quickly: no server sailing, the scene played from a `shipSail` at a few moments (both ways).
test('voyage scenes: the crossing at chosen moments, both ways (shots only)', async ({ browser }) => {
  test.setTimeout(400000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + '?quality=medium&autoplay=1&name=Lookout&cls=ranger&tod=' + (process.env.V_TOD || '0.42'));
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.thousandvale?.ships, null, { timeout: 240000 });
  await page.evaluate(() => thousandvale.ships.ready);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('#hud > *:not(.ship-banner)')) el.style.visibility = 'hidden'; });
  for (const dir of ['out', 'back']) {
    const s = DATA.sailings.find(q => q.from === (dir === 'out' ? 'gullwick' : 'port_vharl'));
    const A = DATA.harbours.find(h => h.id === s.from), B = DATA.harbours.find(h => h.id === s.to);
    await page.evaluate(m => tv.fake('shipSail', m), { from: { id: A.id, name: A.name }, to: { id: B.id, name: B.name }, ship: 'the Saltwren', ms: 40000, skipMs: 5000, fare: 60, path: s.path, crew: [], berth: { from: A.berth, to: B.berth }, volcano: DATA.volcano });
    await page.waitForFunction(() => thousandvale.ships.active, null, { timeout: 15000 });
    const at = (process.env.V_AT || (dir === 'out' ? '1,6,12,18.6,20.5,28,34,38.5' : '2,22,38')).split(',').map(Number);
    for (const sec of at) {
      await page.evaluate(x => thousandvale.ships.seek(x), sec);
      if (process.env.V_HIDE) await page.evaluate(n => { for (const k of n.split(',')) { const o = thousandvale.view.scene.getObjectByName(k); if (o) o.visible = false; } }, process.env.V_HIDE);
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(SHOTS, `s-${dir}-${String(sec).replace('.', '_')}.png`) });
    }
    await page.evaluate(() => thousandvale.ships.endVoyage());
  }
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
