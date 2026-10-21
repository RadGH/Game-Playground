// 2026-10-20 GPU grass (js/client/grass-gpu.js + grass-types.js): LOOK at the grass in one place per kind of ground —
// Torbor Downs' chalk turf, Saint's Meadow, the heather moor, the gold wolds, the fen's reeds, the oakwood floor, the
// high fell, Blackthorn Scar, and Vharlen — on desktop High and a phone (Medium, 393x852), and MEASURE each view (draw
// calls, triangles, the grass's own blade count and draw calls, frame time). Then the two checks no still screenshot
// makes: blades stand ON the drawn ground (the grass's height samples agree with the terrain the mesh is built from),
// and the field does not crawl when its centre moves (wind frozen, same camera, centre moved a fraction of a square:
// the picture of the grass away from your feet is unchanged).
// Shots: tests/D/shots/grass-<label>-<mode>-<place>.png; numbers in tests/D/shots/grass-<label>.json.
// Run: cd ~/claude/playground && GRASS_LABEL=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/grass.spec.js
//   GRASS_LABEL  run name     GRASS_FLAGS extra URL flags ("&grass=0" = the CPU tufts, the look before)
//   GRASS_MODES  desktop,phone (default both)     GRASS_ONLY comma list of place keys     GRASS_DIST e.g. "far"
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
const LABEL = process.env.GRASS_LABEL || 'run', FLAGS = process.env.GRASS_FLAGS || '';
const MODES = (process.env.GRASS_MODES || 'desktop,phone').split(',');
const ONLY = process.env.GRASS_ONLY ? new Set(process.env.GRASS_ONLY.split(',')) : null;
const DIST = process.env.GRASS_DIST ? '&grass=' + process.env.GRASS_DIST : '';
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, srvOut = '';
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

// [key, x, z, eye dx, dy, dz] — a low, close view along the ground (tests/W/fixtures/torbor-look-places.json spots)
const PLACES = [
  ['chalk-downs', 25376, 4216, 4.5, 1.7, 4.5],
  ['saints-meadow', 25256, 3128, 4.5, 1.7, 4.5],
  ['heather-moor', 24736, 4296, 4.5, 1.7, 4.5],
  ['golden-wolds', 30352, 7544, 4.5, 1.9, 4.5],
  ['brack-fen', 27584, 2328, 4.5, 3.6, 4.5],
  ['oakwood', 25856, 5456, 4.5, 1.7, 4.5],
  ['high-fell', 22648, 8592, 4.5, 1.7, 4.5],
  ['blackthorn', 24088, 7944, 4.5, 1.7, 4.5],
  ['vharl-inland', 27880, 21300, -5, 1.8, 5],
  ['vharl-savanna', 27686, 20580, -5, 1.8, 5],      // ash grass with patches of wild grass
  ['vharl-glimmer', 24713, 19568, -5, 1.8, 5],      // glimmerwaste
];
test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, M3_PROVINCES: 'torbor_downs,vharlen' } });
  let out = ''; srv.stderr.on('data', d => { out += d; srvOut += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

const result = {};
for (const mode of MODES) {
  test(`grass — ${LABEL} — ${mode}`, async ({ browser }) => {
    test.setTimeout(3600000);
    const phone = mode === 'phone';
    const name = 'Grs' + mode[0] + (LABEL.replace(/[^a-z]/gi, '') || 'x').slice(0, 6);
    const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1100, height: 700 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /grass|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=${phone ? 'medium' : 'high'}&tod=0.42${DIST}${FLAGS}`);
    // boot: say where it is every half minute (a stuck boot otherwise says nothing for fifteen minutes)
    for (let i = 0; ; i++) {
      const st = await page.evaluate(() => window.tv ? { s: tv.state().status, id: tv.state().you?.id ?? null, warm: !!tv.warm()?.done, note: document.getElementById('login-note')?.textContent || '' } : null).catch(() => null);
      if (st && st.s === 'online' && st.id != null && st.warm) break;
      if (i % 6 === 0) console.log('grass boot', i * 5, 's', JSON.stringify(st));
      // a loaded machine can miss the client's 20 s join window: load the page again (the character is kept)
      if (st?.note && /Cannot reach/.test(st.note)) { console.log('grass boot: retry'); await page.reload(); }
      if (i > 180) throw new Error('boot stuck: ' + JSON.stringify(st) + '\nserver: ' + srvOut.slice(-2000));
      await page.waitForTimeout(5000);
    }
    const out = result[mode] = {};
    const frameTime = () => page.evaluate(() => new Promise(res => { const d = []; let last = 0; const t0 = performance.now(); const f = t => { if (last) d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ median: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1) }); } }; requestAnimationFrame(f); }));
    let curIsle = 'gullwick', checked = false;
    for (const [key, x, z, dx, dy, dz] of PLACES) {
      if (ONLY && !ONLY.has(key)) continue;
      const isle = key.startsWith('vharl') ? 'port_vharl' : 'gullwick';
      if (isle !== curIsle) { await hook('/harbour', { name, id: isle }); curIsle = isle; await page.waitForTimeout(15000); }
      await hook('/teleport', { name, x, z });
      await page.waitForTimeout(phone ? 12000 : 9000);
      await page.waitForFunction(([x, z]) => !!thousandvale.WS.zoneAt(x, z)?.views?.length, [x, z], { timeout: 120000 }).catch(() => console.log('grass: zone not streamed at', x, z));
      await page.evaluate(([x, z, dx, dy, dz]) => { tv.hud(false); const g = thousandvale.WS.terrain.heightAt(x, z); tv.fly(x + dx, g + dy, z + dz, x - dx * 1.6, g + 0.2, z - dz * 1.6); }, [x, z, dx, dy, dz]);
      await page.waitForFunction(() => !(thousandvale.WS.grass?.stats.pending > 0), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const ft = await frameTime();
      const r = await page.evaluate(([x, z]) => {
        const i = thousandvale.view.renderer.info, g = thousandvale.WS.grass, c = thousandvale.WS.clutter;
        return { calls: i.render.calls, tris: i.render.triangles, biome: thousandvale.WS.terrain.biomeKey(x, z), grass: g ? { ...g.stats } : null, tufts: c?.stats.tuft ?? null, clutterCalls: c?.stats.calls ?? null };
      }, [x, z]);
      out[key] = { ...r, frame: ft };
      await page.screenshot({ path: join(SHOTS, `grass-${LABEL}-${mode}-${key}.png`) });
      // the two checks that no still picture shows — once, in the first meadow, desktop only
      if (!checked && !phone && !FLAGS.includes('grass=0') && r.grass?.blades) {
        checked = true;
        out.ground = await page.evaluate(async ([x, z]) => {
          // 1. blades on the drawn ground: the grass's height samples ARE the terrain's grid (every 2 m), and between them
          //    the shader's triangle split is the mesh's, so compare the CPU sum of that split with heightAt
          const g = thousandvale.WS.grass, T = thousandvale.WS.terrain;
          let worst = 0;
          for (let k = 0; k < 400; k++) {
            const px = x - 20 + (k % 20) * 2.03 + 0.31, pz = z - 20 + Math.floor(k / 20) * 2.07 + 0.77;
            worst = Math.max(worst, Math.abs(g.debugGround(px, pz) - T.heightAt(px, pz)));
          }
          return { worstMetres: +worst.toFixed(4) };
        }, [x, z]);
        // 2. no crawl: freeze the wind, pin the centre, draw only the grass; move the centre by a fraction of a square
        out.crawl = await page.evaluate(async ([x, z]) => {
          const V = thousandvale.view, g = thousandvale.WS.grass, gl = V.renderer.getContext();
          g.freezeWind(3.21);
          const hidden = [];
          V.scene.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) { if (o.visible && !o.name.startsWith('grass-gpu')) { hidden.push(o); o.visible = false; } } });
          // a black background (set just before each render below), so "lit" counts grass pixels only
          const snap = async c => {
            g.pin({ x: c[0], y: thousandvale.WS.terrain.heightAt(c[0], c[1]), z: c[1] });
            for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
            g.update({ x: c[0], y: 0, z: c[1] });
            const bg = V.scene.background; V.scene.background = null; V.renderer.setClearColor(0x000000, 1);   // the sky re-sets it every tick
            V.renderer.render(V.scene, V.camera);
            V.scene.background = bg;
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
            return px;
          };
          // the camera looks at (x, z) from ~6 m; the centre sits 3.5 m to one side so the push round it is off the picture's middle
          const a = await snap([x + 3.5, z - 3.5]), b = await snap([x + 3.5 + g.stats.cell * 0.43, z - 3.5 + g.stats.cell * 0.31]);
          const c = await snap([x + 3.5 + g.stats.cell * 3, z - 3.5]);      // three whole squares: same ground, different slots
          g.pin(null); g.freezeWind(null); for (const o of hidden) o.visible = true;
          let diffAB = 0, diffAC = 0, lit = 0;
          for (let i = 0; i < a.length; i += 4) {
            if ((a[i] + a[i + 1] + a[i + 2]) > 12) lit++;
            if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) diffAB++;
            if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 24) diffAC++;
          }
          return { pixels: a.length / 4, lit, changedFraction: +(diffAB / Math.max(1, lit)).toFixed(5), changedWholeSquares: +(diffAC / Math.max(1, lit)).toFixed(5) };   // shares of the grass pixels
        }, [x, z]);
        console.log('grass checks', JSON.stringify({ ground: out.ground, crawl: out.crawl }));
      }
    }
    // the sun's rays (High only): through the oakwood toward a low morning sun, and the same with ?shafts off by numbers
    if (!phone && (!ONLY || ONLY.has('sunrays'))) {
      await hook('/teleport', { name, x: 25856, z: 5456 });
      await page.waitForTimeout(8000);
      await page.evaluate(() => tv.setTime(0.3));
      await page.waitForTimeout(1500);
      await page.evaluate(() => { const V = thousandvale.view, s = V.sunDir, x = 25856, z = 5456, g = thousandvale.WS.terrain.heightAt(x, z); const h = Math.hypot(s.x, s.z) || 1; tv.fly(x - s.x / h * 6, g + 1.7, z - s.z / h * 6, x + s.x / h * 30, g + 1.7 + s.y / h * 30, z + s.z / h * 30); });
      await page.waitForTimeout(4000);
      out.sunrays = { shafts: await page.evaluate(() => thousandvale.view.atmos.glow?.shafts ?? null), frame: await frameTime() };
      await page.screenshot({ path: join(SHOTS, `grass-${LABEL}-${mode}-sunrays.png`) });
      await page.evaluate(() => tv.setTime(0.42));
    }
    console.log('grass', mode, JSON.stringify(out));
    writeFileSync(join(SHOTS, `grass-${LABEL}.json`), JSON.stringify(result, null, 1));
    expect(errors, errors.join('\n')).toEqual([]);
    if (out.ground) expect(out.ground.worstMetres).toBeLessThan(0.02);
    if (out.crawl) {
      // the field is still there to compare, and moving the centre does not reshuffle it (only the edge of the field
      // and the few blades the moving centre pushes aside may change)
      expect(out.crawl.lit).toBeGreaterThan(out.crawl.pixels * 0.05);
      expect(out.crawl.lit).toBeLessThan(out.crawl.pixels * 0.995);     // the background really was black
      expect(out.crawl.changedFraction).toBeLessThan(0.1);
    }
    await ctx.close();
  });
}
