// Play-test 12 (#81) — LOOK at the regenerated Torbor Downs: one third-person view in each new biome, the starting town and
// a few coasts, and measure draw calls / triangles at each (docs/TORBOR-REGEN.md lists the numbers). Places come from
// tests/W/fixtures/torbor-look-places.json (picked off the bake by the tool in that file's _doc).
// Shots: tests/W/shots/torbor-<label>-<place>.png; numbers: tests/W/shots/torbor-<label>.json.
// Run: cd ~/claude/playground && TV_LABEL=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/W/torbor-regen.spec.js
//   TV_ONLY  comma list of place keys     TV_TOD  time of day (default 0.42)
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
const LABEL = process.env.TV_LABEL || 'after', TOD = +(process.env.TV_TOD || 0.42);
const ONLY = process.env.TV_ONLY ? new Set(process.env.TV_ONLY.split(',')) : null;
const PLACES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'torbor-look-places.json'), 'utf8')).places;
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, M3_PROVINCES: 'torbor_downs' } });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 90000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

test(`Torbor Downs regenerated — ${LABEL}`, async ({ browser }) => {
  test.setTimeout(3600000);
  const name = 'Tbr' + (LABEL.replace(/[^a-z]/gi, '').toLowerCase() || 'look').slice(0, 7);     // (names are letters only)
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=warrior&quality=high&tod=${TOD}`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 400000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
  await hook('/level', { name, level: 20 }).catch(() => null);
  const out = {};
  for (const p of PLACES) {
    if (ONLY && !ONLY.has(p.key)) continue;
    // stream the place's zone and its neighbours straight in and fly the free camera there (a teleport out of the town room
    // does not move the stream far enough: tests/D/atmos.spec.js does the same for Vharlen)
    const ok = await page.evaluate(async ({ x, z, eye }) => {
      const { zoneBounds } = await import('/prototypes/thousandvale/js/client/world-stream.js');
      const WS = thousandvale.WS, zx = Math.floor(x / 2048), zy = Math.floor(z / 2048), keys = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = zx + dx, b = zy + dy; if (a >= 11 && a <= 14 && b >= 1 && b <= 4) keys.push('z' + a + '_' + String(b).padStart(2, '0')); }
      WS.setZones(keys.map(k => ({ key: k, bounds: zoneBounds(k, true) })));
      const L = await WS.whenReady(x, z); if (!L) return false;
      tv.hud(false);
      const g = WS.terrain.heightAt(x, z), [dx, dy, dz] = eye;
      tv.fly(x + dx, g + dy, z + dz, x - dx * 3, g + dy * 0.25, z - dz * 3);
      return true;
    }, p);
    if (!ok) { out[p.key] = { skipped: 'zone did not load' }; continue; }
    await page.waitForTimeout(8000);
    await page.evaluate(t => tv.setTime(t), TOD);
    await page.waitForTimeout(4500);
    const r = await page.evaluate(() => { const i = thousandvale.view.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
    out[p.key] = { ...r, biome: p.biome || null };
    await page.screenshot({ path: join(SHOTS, `torbor-${LABEL}-${p.key}.png`) });
  }
  console.log('torbor', JSON.stringify(out));
  writeFileSync(join(SHOTS, `torbor-${LABEL}.json`), JSON.stringify(out, null, 1));
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
