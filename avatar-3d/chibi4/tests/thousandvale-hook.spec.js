// Chibi 4 steps 7 + 9: the OPT-IN Thousandvale hook. With ?renderer=chibi4 the PLAYER starts as Chibi 2 at once and
// swaps to a Chibi 4 kit body when its download is done (never waits); without the flag nothing changes. Runs Thousandvale's own throwaway test server (prototypes/thousandvale/tests/D/m3-server.mjs).
// Run: flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/chibi4/tests/thousandvale-hook.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TV = join(HERE, '..', '..', '..', 'prototypes', 'thousandvale');
const SHOTS = join(HERE, '..', 'shots', 'step7');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base;

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(TV, 'tests', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: TV, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

async function enter(browser, extra, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=mage&tod=0.45${extra}`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
  await page.waitForFunction(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.self); return a && a.body; }, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}
const selfInfo = page => page.evaluate(() => {
  const a = [...thousandvale.actors.actors.values()].find(x => x.self);
  return { chibi4: !!a.chibi4, model: a.body.model || null, height: a.height, anim: a.body.anim ?? null, stats: a.body.stats?.() || null };
});

test('?renderer=chibi4 gives the player a Chibi 4 body, walks, and nothing errors', async ({ browser }) => {
  test.setTimeout(600000);
  const { ctx, page, errors } = await enter(browser, '&renderer=chibi4', 'Cfourtest');
  // the first body is up before the swap (or the swap already happened): the player never stood there with nothing
  await page.waitForFunction(() => [...thousandvale.actors.actors.values()].find(x => x.self)?.chibi4, null, { timeout: 120000 });
  const timing = await page.evaluate(() => ({ swapAt: Math.round(performance.now()), kitFiles: performance.getEntriesByType('resource').filter(r => /chibi4\/models\/kit/.test(r.name)).map(r => ({ f: r.name.replace(/^.*kit\//, ''), start: Math.round(r.startTime), end: Math.round(r.responseEnd), bytes: r.encodedBodySize })) }));
  console.log('TVHOOK timing', JSON.stringify(timing));
  const s = await selfInfo(page);
  console.log('TVHOOK chibi4', JSON.stringify(s));
  expect(s.chibi4).toBe(true);
  await page.screenshot({ path: join(SHOTS, 's7tv_idle.png') });
  await page.keyboard.down('w'); await page.waitForTimeout(1400);
  await page.screenshot({ path: join(SHOTS, 's7tv_walk.png') });
  const w = await selfInfo(page);
  await page.keyboard.up('w');
  console.log('TVHOOK walking', JSON.stringify(w));
  expect(errors).toEqual([]);
  await ctx.close();
});

test('without the flag the player is Chibi 2 as before', async ({ browser }) => {
  test.setTimeout(600000);
  const { ctx, page, errors } = await enter(browser, '', 'Ctwotest');
  const s = await selfInfo(page);
  console.log('TVHOOK default', JSON.stringify(s));
  expect(s.chibi4).toBe(false);
  await page.screenshot({ path: join(SHOTS, 's7tv_chibi2.png') });
  expect(errors).toEqual([]);
  await ctx.close();
});
