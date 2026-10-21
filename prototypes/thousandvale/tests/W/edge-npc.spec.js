// Play-test 12 (#84), stream W-anim — Mistfall's carter seen from inside the town, and the SAME body after you walk out.
// A real server with Vharlen loaded (tests/D/m3-server.mjs, M3_PROVINCES=torbor_downs,vharlen). Shots: tests/W/shots/wanim-84-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/W/edge-npc.spec.js
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
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(r => r.json());
test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, '../D/m3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, M3_PROVINCES: 'torbor_downs,vharlen' } });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 90000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => srv?.kill('SIGTERM'));

test('#84: Mistfall\'s carter is there from inside the town, and is the same body once you walk out past him', async ({ browser }) => {
  test.setTimeout(420000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Edgewalker&cls=ranger&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
  const h = await hook('/harbour', { name: 'Edgewalker', id: 'port_vharl' });
  expect(h.ok, JSON.stringify(h)).toBe(true);
  await page.waitForFunction(() => thousandvale.S.room?.id?.startsWith('vharlen/'), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  // into Mistfall's ring (r 40 at 25750, 19754), 25 m in on the carter's side (he stands at 25790, 19768)
  await hook('/teleport', { name: 'Edgewalker', x: 25766, z: 19762 });
  await page.waitForFunction(() => thousandvale.S.room?.kind === 'town' && thousandvale.S.room?.name === 'Mistfall', null, { timeout: 90000 });
  await page.waitForFunction(() => [...thousandvale.actors.actors.values()].some(a => a.kind === 'npc' && a.name === 'Orsk Yorrvenn' && a.body), null, { timeout: 60000 });
  await page.evaluate(() => { window.__orsk = [...thousandvale.actors.actors.values()].find(a => a.name === 'Orsk Yorrvenn'); tv.hud(true); tv.view(9, 0.3, 1.2); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, 'wanim-84-from-town.png') });
  // step out past him (a short hop to 3 m beyond the ring + its 2 m hysteresis): the hand-over to the wilds keeps his body
  await hook('/teleport', { name: 'Edgewalker', x: 25795, z: 19760 });
  await page.waitForFunction(() => thousandvale.S.room?.kind === 'wilds', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const now = [...thousandvale.actors.actors.values()].find(a => a.name === 'Orsk Yorrvenn'); return { there: !!now, same: now === window.__orsk, body: !!now?.body }; });
  await page.screenshot({ path: join(SHOTS, 'wanim-84-from-wilds.png') });
  console.log('[#84]', JSON.stringify(r));
  expect(r.there, 'the carter is in the wilds room too').toBe(true);
  expect(r.same, 'and it is the body we were looking at (handed over, not rebuilt)').toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
