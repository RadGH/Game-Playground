// 2026-10-16 — graphics (G-ATMOS): water, drifting cloud / mist, soft light and the colour grade. Before / after shots at
// fixed places (Torborhold square, Gullwick quay, a river, Vharlen's coast, a valley with a lake) at day, dusk and night,
// on desktop High and a 393 x 852 phone (Medium), plus frame time, draw calls, triangles and compiled shader programs.
//
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/atmos.spec.js
//   ATMOS_LABEL=before|after (default after) — the shots are tests/D/shots/atmos-<label>-<device>-<place>-<tod>.png
//   ATMOS_FLAGS='&atmos=0'   extra URL flags (atmos=0 draws the world as it was before this round)
//   ATMOS_ONLY=desktop,phone devices (default both)   ATMOS_THROTTLE=4  CPU slow-down for the phone's frame time
// Prints `atmos-perf {...}` per device; the numbers go in docs/CHANGELOG.md "2026-10-16 — graphics".
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.ATMOS_SHOTS || join(HERE, 'shots');
const LABEL = process.env.ATMOS_LABEL || 'after', FLAGS = process.env.ATMOS_FLAGS || '';
const ONLY = process.env.ATMOS_ONLY ? new Set(process.env.ATMOS_ONLY.split(',')) : null;
const THROTTLE = +(process.env.ATMOS_THROTTLE || 4);
const PLACE_ONLY = process.env.ATMOS_PLACES ? new Set(process.env.ATMOS_PLACES.split(',')) : null;
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

// [key, x, z, camera [dist, pitch, yaw]]; 'square' = where the character starts (Torborhold); vharlen is shown by loading
// its zone and flying the free camera there (it is another room)
const PLACES = [
  ['square', null, null, [18, 0.5, 0.6]],
  ['quay', 30269, 4556, [24, 0.42, 0.15]],
  ['river', 28548, 5508, [22, 0.62, 0.8]],
  ['valley', 25380, 5440, [30, 0.3, 0.9]],
  ['vharlen', 24564, 19220, null],
];
const TODS = [['day', 0.45], ['dusk', 0.72], ['night', 0.9]];

for (const device of ['desktop', 'phone']) {
  test(`atmosphere ${LABEL} — ${device}`, async ({ browser }) => {
    test.skip(ONLY && !ONLY.has(device), 'ATMOS_ONLY');
    test.setTimeout(3000000);
    const phone = device === 'phone', name = 'Mistwatch' + (phone ? 'P' : 'D') + LABEL[0];
    const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 700 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // a shader that does not compile is a console error, not a page error
    page.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GL_INVALID/i.test(m.text())) errors.push(m.text().slice(0, 600)); });
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=${phone ? 'medium' : 'high'}&tod=0.45${FLAGS}`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 400000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
    await hook('/level', { name, level: 40 }).catch(() => null);
    await page.evaluate(() => thousandvale.view.skyBox.preloadAll());
    const start = await page.evaluate(() => { const p = thousandvale.S.predictor.pos; return { x: p.x, z: p.z }; });
    const cdp = phone ? await ctx.newCDPSession(page) : null;
    const frameMs = async () => {
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const r = await page.evaluate(() => new Promise(res => {
        const d = []; let last = performance.now();
        const tick = now => { d.push(now - last); last = now; if (d.length < 30) requestAnimationFrame(tick); else { d.shift(); d.sort((a, b) => a - b); res({ median: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1) }); } };
        requestAnimationFrame(tick);
      }));
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      return r;
    };
    const info = () => page.evaluate(() => { const i = thousandvale.view.renderer.info, A = thousandvale.view.atmos; return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs?.length || 0, mist: A ? A.mist.stats.shown : null, contact: A ? A.contact.stats.shown : null }; });
    const out = { device, label: LABEL, flags: FLAGS, places: {} };
    for (const [key, x, z, view] of PLACES) {
      if (PLACE_ONLY && !PLACE_ONLY.has(key)) continue;
      if (key === 'vharlen') {
        // another room: load its zone into the stream and fly the free camera over the coast, looking out to sea
        const ok = await page.evaluate(async ([px, pz]) => {
          const { zoneBounds } = await import('/prototypes/thousandvale/js/client/world-stream.js');
          const WS = thousandvale.WS, k = 'z' + Math.floor(px / 2048) + '_' + String(Math.floor(pz / 2048)).padStart(2, '0');
          WS.setZones([{ key: k, bounds: zoneBounds(k, true) }]);
          const L = await WS.whenReady(px, pz); if (!L) return false;
          thousandvale.S.skyProvince = 'vharlen';
          const y = WS.terrain.heightAt(px, pz);
          tv.fly(px + 22, y + 26, pz + 10, px - 60, Math.max(0, y - 30), pz);
          return true;
        }, [x, z]);
        if (!ok) { out.places[key] = { skipped: 'zone did not load' }; continue; }
        await page.waitForTimeout(12000);
      } else {
        await hook('/teleport', { name, x: x ?? start.x, z: z ?? start.z });
        await page.waitForTimeout(10000);
        await page.evaluate(v => { tv.hud(false); tv.view(...v); }, view);
      }
      await page.evaluate(() => tv.hud(false));
      out.places[key] = {};
      for (const [tk, t] of TODS) {
        await page.evaluate(tt => tv.setTime(tt), t);
        await page.waitForTimeout(3500);
        await page.screenshot({ path: join(SHOTS, `atmos-${LABEL}-${device}-${key}-${tk}.png`) });
        if (tk === 'day') out.places[key] = { ...(await info()), frame: await frameMs() };
      }
      if (await page.evaluate(() => !!thousandvale.S.self.dead)) { await page.evaluate(() => tv.rise()); await page.waitForTimeout(4000); }
    }
    out.programs = (await info()).programs;
    out.longFrames = await page.evaluate(() => tv.state().stats?.longFrames ?? null);
    console.log('atmos-perf', JSON.stringify(out));
    writeFileSync(join(SHOTS, `atmos-${LABEL}-${device}-perf.json`), JSON.stringify(out, null, 1));
    expect(errors.filter(e => !/ResizeObserver/.test(e)), errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}
