// Stream D-world — play-test 9, X2 (report S#50): a marker on the ground where click-to-move / tap-to-move is heading.
// Desktop (960x600, mouse) and phone (393x852, touch). Screenshots: tests/D/shots/x2-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest9.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const HOME = { x: 25183, z: 5388 };

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

async function enter(browser, name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await hook('/teleport', { name, x: HOME.x, z: HOME.z });
  await page.waitForTimeout(5000);
  return { ctx, page, errors };
}
const mark = page => page.evaluate(() => ({ m: thousandvale.moveMark.state(), goal: thousandvale.controls.moveGoal, stats: { ...thousandvale.moveMark.stats } }));

test('X2 desktop: a click on the ground puts a gold marker there; a new click moves it; W, and arriving, take it away', async ({ browser }) => {
  test.setTimeout(600000);
  const { ctx, page, errors } = await enter(browser, 'Clicky', { viewport: { width: 960, height: 600 } });
  await page.evaluate(() => { tv.view(11, 0.62, Math.PI); tv.perf(true); });
  await page.waitForTimeout(1500);
  expect((await mark(page)).m.visible).toBe(0);
  // click well up the screen (far ground: you are still on your way when the marker is read), and read the goal and the
  // marker in ONE look inside the page
  const seen = page.evaluate(async () => {
    for (let i = 0; i < 600; i++) {
      const g = thousandvale.controls.moveGoal, m = thousandvale.moveMark.state().goal;
      if (g && m && m.opacity > 0.4) return { goal: { x: g.x, z: g.z }, mark: m, ground: thousandvale.WS.terrain.heightAt(g.x, g.z) };
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  });
  await page.evaluate(() => thousandvale.controls.hold(true));      // stand still for the picture (the goal is kept while held)
  await page.mouse.click(620, 200);
  const s0 = await seen;
  expect(s0, 'the click set a move goal and the marker came up').not.toBe(null);
  expect(Math.hypot(s0.mark.x - s0.goal.x, s0.mark.z - s0.goal.z), 'the marker lies at the clicked spot').toBeLessThan(0.05);
  expect(Math.abs(s0.mark.y - s0.ground), 'on the terrain').toBeLessThan(0.2);
  let s;
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, 'x2-move-marker-desktop.png') });
  await page.evaluate(g => { const y = thousandvale.WS.terrain.heightAt(g.x, g.z); tv.fly(g.x + 2.6, y + 2.2, g.z + 2.6, g.x, y, g.z); }, s0.goal);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, 'x2-move-marker-close.png') });
  await page.evaluate(() => { tv.fly(null); thousandvale.controls.hold(false); });
  // a new click: the marker moves
  await page.mouse.click(300, 330);
  await page.waitForFunction(() => thousandvale.moveMark.stats.moved + thousandvale.moveMark.stats.shown >= 2, null, { timeout: 30000 });
  // steering by keys ends it
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  await page.waitForFunction(() => thousandvale.moveMark.state().visible === 0, null, { timeout: 30000 });
  expect((await mark(page)).goal).toBe(null);
  // arriving ends it
  await page.evaluate(() => { const p = thousandvale.S.predictor.pos; tv.walkTo(p.x + 3, p.z + 2); });
  await page.waitForFunction(() => thousandvale.controls.moveGoal == null && thousandvale.moveMark.state().visible === 0, null, { timeout: 90000 });
  // the raid's gate ping (A's field), played through the client's handler
  await page.evaluate(() => { const p = thousandvale.S.predictor.pos; const g = { id: 'g0', x: p.x + 9, z: p.z - 6 }; tv.fake('eventTrack', { id: 'raid', gate: g }); const y = thousandvale.WS.terrain.heightAt(g.x, g.z); tv.hud(false); tv.fly(g.x + 7, y + 5, g.z + 7, g.x, y + 1, g.z); });
  await page.waitForFunction(() => thousandvale.moveMark.state().pings === 1, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, 'x2-gate-ping.png') });
  expect((await page.evaluate(() => tv.perf())).newProgramNames, 'no shader is linked by the marker or the ping').toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});

test('X2 phone (393x852, touch): a tap on the ground puts the same marker there', async ({ browser }) => {
  test.setTimeout(600000);
  const { ctx, page, errors } = await enter(browser, 'Tappy', { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  await page.evaluate(() => { tv.view(11, 0.62, Math.PI); });
  await page.waitForTimeout(1500);
  const seen = page.evaluate(async () => {
    for (let i = 0; i < 600; i++) {
      const g = thousandvale.controls.moveGoal, m = thousandvale.moveMark.state().goal;
      if (g && m && m.opacity > 0.4) return { goal: { x: g.x, z: g.z }, mark: m };
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  });
  await page.evaluate(() => thousandvale.controls.hold(true));
  await page.touchscreen.tap(215, 330);
  const s = await seen;
  await page.waitForTimeout(600);
  expect(s, 'the tap set a move goal and the marker came up').not.toBe(null);
  expect(Math.hypot(s.mark.x - s.goal.x, s.mark.z - s.goal.z)).toBeLessThan(0.05);
  await page.screenshot({ path: join(SHOTS, 'x2-move-marker-phone.png') });
  await page.evaluate(() => thousandvale.controls.hold(false));
  await page.waitForFunction(() => thousandvale.controls.moveGoal == null && thousandvale.moveMark.state().visible === 0, null, { timeout: 120000 });
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
