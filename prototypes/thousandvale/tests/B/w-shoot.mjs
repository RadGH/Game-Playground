#!/usr/bin/env node
// Stream W — look at the world: fly the inspect camera to a list of points and save a screenshot of each.
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/B/w-shoot.mjs views.json outDir
// views.json: [{ name, zone, x, z (zone metres: the point looked at), dist (m back), rise (m up), az (degrees: 0 = camera
// north of the point... i.e. at -z), lift (look-at height above ground, default 1.5), tp: true (teleport the player there
// first, so the character stands in the shot for scale), tod }]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const views = JSON.parse(readFileSync(process.argv[2], 'utf8')), OUT = process.argv[3] || join(HERE, 'shots');
mkdirSync(OUT, { recursive: true });
const WORLD = JSON.parse(readFileSync(join(ROOT, 'data/world/world.json'), 'utf8'));
const originOf = id => WORLD.zones.find(z => z.id === id).origin;
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort(), hp = await freePort();
const srv = spawn(process.execPath, [join(ROOT, 'tests/D/m3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stderr.on('data', d => { out += d; });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
const hook = (path, body) => fetch(`http://127.0.0.1:${hp}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 680 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Mason&cls=warrior&quality=${process.env.Q || 'low'}&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.evaluate(() => tv.hud(false));
  for (const v of views) {
    const o = originOf(v.zone || 'z12_02'), X = v.x + o.x, Z = v.z + o.z;
    if (v.tp) { console.log('[tp]', JSON.stringify(await hook('/teleport', { name: 'Mason', x: X + (v.tpdx || 0), z: Z + (v.tpdz || 0) }))); await page.waitForTimeout(1500); }
    const az = (v.az || 0) * Math.PI / 180, dist = v.dist ?? 20, rise = v.rise ?? 8;
    await page.evaluate(([X, Z, dx, dz, rise, lift]) => { const h = thousandvale.WS.terrain.heightAt(X, Z); tv.fly(X + dx, h + rise, Z + dz, X, h + lift, Z); }, [X, Z, Math.sin(az) * dist, -Math.cos(az) * dist, rise, v.lift ?? 1.5]);
    await page.waitForTimeout(v.wait || 3500);
    for (let k = 0; k < 3; k++) { try { await page.screenshot({ path: join(OUT, v.name + ".png"), timeout: 90000 }); break; } catch (e) { console.log("[retry]", v.name, e.message.split("\n")[0]); } }
    console.log('[shot]', v.name);
  }
} finally { await browser.close(); srv.kill('SIGTERM'); }
