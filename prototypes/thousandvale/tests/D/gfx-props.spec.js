// Graphics pass 2026-10-16 (G-PROPS): worn props, building trim and painted portraits. LOOK at the same fixed places before
// and after, on desktop High and on a phone (Medium, 393x852, CPU x4), and MEASURE each: draw calls, triangles, textures,
// geometries and the frame time over a few seconds standing still.
// Shots: tests/D/shots/gfx-<label>-<mode>-<place>.png; numbers printed as `gfx {...}` and written to
// tests/D/shots/gfx-<label>.json.
// Run: cd ~/claude/playground && GFX_LABEL=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/gfx-props.spec.js
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

// [key, x, z (where you stand and what the camera looks at), eye offset dx, dy, dz] — world metres (zone origin =
// column/row x 2048). A fixed free camera (tv.fly), so the before and after frames match.
const PLACES = [
  ['square', 25156, 5376, 15, 12, 15],             // Torborhold's square
  ['street', 25158, 5387, 11, 8, -9],           // a Torborhold street, close: the shop front by the square
  ['quay', 30270, 4560, -12, 9, 26],               // Gullwick's quay and long pier, seen from the bay
  ['vharl', 27750, 21394, -16, 14, 16],            // Port Vharl
  ['vharl-pier', 28104, 21394, -14, 10, 18],       // Port Vharl's beach and jetty
  ['camp', 25628, 5392, 14, 12, 14],               // Ashby's Lumber Camp
  ['setpiece', 25207, 5073, 16, 12, 16],           // The Wheel and Wether (the roadside inn crossing)
];

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
  test(`gfx props — ${LABEL} — ${mode}`, async ({ browser }) => {
    test.setTimeout(3600000);
    const phone = mode === 'phone';
    const name = 'Gfx' + mode[0] + LABEL.slice(0, 5);
    const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1100, height: 700 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cdp = phone ? await ctx.newCDPSession(page) : null;
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=warrior&quality=${phone ? 'medium' : 'high'}&tod=0.42${FLAGS}`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 400000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
    await hook('/level', { name, level: 20 }).catch(() => null);
    const out = result[mode] = {};
    const frameTime = () => page.evaluate(() => new Promise(res => { const d = []; let last = 0; const t0 = performance.now(); const f = t => { if (last) d.push(t - last); last = t; if (t - t0 < 6000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ n: d.length, median: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1), mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1) }); } }; requestAnimationFrame(f); }));
    let curIsle = 'gullwick';
    for (const [key, x, z, dx, dy, dz] of PLACES) {
      if (ONLY && !ONLY.has(key)) continue;
      // Port Vharl is another island (another room): go through its harbourmaster first, then walk the room
      const isle = key.startsWith('vharl') ? 'port_vharl' : 'gullwick';
      if (isle !== curIsle) { const r = await hook('/harbour', { name, id: isle }); console.log('gfx harbour', isle, JSON.stringify(r)); curIsle = isle; await page.waitForTimeout(15000); }
      await hook('/teleport', { name, x: x + 3, z: z + 3 });
      await page.waitForTimeout(phone ? 14000 : 10000);
      // a crossing to another island is a room handoff: wait until the zone under the camera is streamed in
      await page.waitForFunction(([x, z]) => { const L = thousandvale.WS.zoneAt(x, z); return !!(L && L.town && L.views.length >= 3); }, [x, z], { timeout: 120000 }).catch(() => console.log('gfx: zone not streamed at', x, z));
      await page.evaluate(([x, z, dx, dy, dz]) => { tv.hud(false); const g = thousandvale.WS.terrain.heightAt(x, z); tv.fly(x + dx, g + dy, z + dz, x, g + 1.2, z); }, [x, z, dx, dy, dz]);
      await page.waitForTimeout(6000);
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const ft = await frameTime();
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const r = await page.evaluate(() => { const R = thousandvale.view.renderer, i = R.info; return { calls: i.render.calls, tris: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? null }; });
      out[key] = { ...r, frame: ft };
      await page.screenshot({ path: join(SHOTS, `gfx-${LABEL}-${mode}-${key}.png`) });
    }
    await page.evaluate(() => tv.fly());
    // the target frame: a monster, then an NPC (whoever is nearest), HUD on
    if (!ONLY || ONLY.has('portraits')) {
      await hook('/teleport', { name, x: 25600, z: 5640 });
      await page.waitForTimeout(12000);
      await page.evaluate(() => { tv.hud(true); tv.view(9, 0.3); });
      for (const kind of ['monster', 'npc']) {
        if (kind === 'npc') { await hook('/teleport', { name, x: 25150, z: 5385 }); await page.waitForTimeout(12000); }
        const id = await page.evaluate(k => { const me = tv.state().you; let best = null, bd = 1e9; for (const a of thousandvale.actors.actors.values()) { if (a.kind !== k || a.dead) continue; const d = Math.hypot(a.pos.x - me.x, a.pos.z - me.z); if (d < bd) { bd = d; best = a.id; } } return best; }, kind);
        if (id == null) { console.log('gfx portrait: no', kind, 'near'); continue; }
        await page.evaluate(i => tv.target(i), id);
        await page.waitForTimeout(4000);
        const info = await page.evaluate(i => { const a = thousandvale.actors.get(i); return { id: i, kind: a.kind, name: a.name, type: a.look?.creature?.type || null, role: a.role || a.info?.role || null }; }, id);
        out['target-' + kind] = info;
        await page.screenshot({ path: join(SHOTS, `gfx-${LABEL}-${mode}-target-${kind}.png`) });
      }
    }
    out.spans = await page.evaluate(() => (tv.perf().top || []).filter(t => /zone:(town|setpieces|walls|sites)/.test(t.name)));
    console.log('gfx', mode, JSON.stringify(out));
    writeFileSync(join(SHOTS, `gfx-${LABEL}.json`), JSON.stringify(result, null, 1));
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}
