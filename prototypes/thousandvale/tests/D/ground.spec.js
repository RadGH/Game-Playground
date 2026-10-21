// Ground pass 2026-10-17 (chibi25-r2 D/E/F): taller palms, a matte ground and ground clutter. LOOK at the same fixed places before
// and after, on desktop High and on a phone (Medium, 393x852, CPU x4), and MEASURE each: draw calls, triangles, textures,
// geometries and the frame time over a few seconds standing still.
// Shots: tests/D/shots/gfx-<label>-<mode>-<place>.png; numbers printed as `gfx {...}` and written to
// tests/D/shots/gfx-<label>.json.
// Run: cd ~/claude/playground && GFX_LABEL=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/ground.spec.js
//   GFX_LABEL   name of the run (before / after / off …)       GFX_FLAGS  extra URL flags (e.g. "&props=0" = the old look)
//   GFX_MODES   desktop,phone (default both)                   GFX_ONLY   comma list of place keys
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.GFX_SHOTS || join(HERE, 'shots');
const LABEL = process.env.GFX_LABEL || 'run', FLAGS = process.env.GFX_FLAGS || '';
const MODES = (process.env.GFX_MODES || 'desktop,phone').split(',');
const ONLY = process.env.GFX_ONLY ? new Set(process.env.GFX_ONLY.split(',')) : null;
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

// [key, x, z, eye dx, dy, dz] — a player-height third-person view, looking along the ground
const PLACES = [
  ['downs', 25600, 5640, 7, 3.2, 7],              // Torbor Downs woods
  ['r70', 25998, 5650, 7, 3.2, 7],                // live report #70 "Position here needs grass" (Torbor Downs wilds, zone z12_02)
  ['town-edge', 25260, 5470, 8, 3.5, 8],          // the edge of Torborhold
  ['vharl-inland', 27880, 21300, -7, 3.2, 7],     // Vharlen just inland of Port Vharl
  ['vharl-2', 27820, 21330, 6, 3.2, -7],          // the palms behind Port Vharl, looking the other way
];
const TODS = (process.env.GFX_TODS || '0.42,0.72').split(',').map(Number);
test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, M3_PROVINCES: 'torbor_downs,vharlen' } });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

const result = {};
for (const mode of MODES) {
  test(`ground — ${LABEL} — ${mode}`, async ({ browser }) => {
    test.setTimeout(3600000);
    const phone = mode === 'phone';
    const name = 'Gnd' + mode[0] + LABEL.slice(0, 5);
    const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1100, height: 700 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=starcaller&quality=${phone ? 'medium' : 'high'}&tod=${TODS[0]}${FLAGS}`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 400000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
    await hook('/level', { name, level: 20 }).catch(() => null);
    const out = result[mode] = {};
    const frameTime = () => page.evaluate(() => new Promise(res => { const d = []; let last = 0; const t0 = performance.now(); const f = t => { if (last) d.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ median: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1) }); } }; requestAnimationFrame(f); }));
    let curIsle = 'gullwick';
    for (const [key, x, z, dx, dy, dz] of PLACES) {
      if (ONLY && !ONLY.has(key)) continue;
      const isle = key.startsWith('vharl') ? 'port_vharl' : 'gullwick';
      if (isle !== curIsle) { await hook('/harbour', { name, id: isle }); curIsle = isle; await page.waitForTimeout(15000); }
      await hook('/teleport', { name, x, z });
      await page.waitForTimeout(phone ? 14000 : 10000);
      await page.waitForFunction(([x, z]) => !!thousandvale.WS.zoneAt(x, z)?.views?.length, [x, z], { timeout: 120000 }).catch(() => console.log('ground: zone not streamed at', x, z));
      for (const tod of TODS) {
        await page.evaluate(t => tv.setTime(t), tod);
        await page.evaluate(([x, z, dx, dy, dz]) => { tv.hud(false); const g = thousandvale.WS.terrain.heightAt(x, z); tv.fly(x + dx, g + dy, z + dz, x - dx * 2, g + 0.6, z - dz * 2); }, [x, z, dx, dy, dz]);
        await page.waitForTimeout(4000);
        const ft = await frameTime();
        const r = await page.evaluate(() => { const i = thousandvale.view.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
        out[key + '@' + tod] = { ...r, frame: ft };
        await page.screenshot({ path: join(SHOTS, `ground-${LABEL}-${mode}-${key}-${tod}.png`) });
      }
    }
    console.log('ground', mode, JSON.stringify(out));
    writeFileSync(join(SHOTS, `ground-${LABEL}.json`), JSON.stringify(result, null, 1));
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}
