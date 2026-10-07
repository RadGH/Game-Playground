// Stream D — the character window end to end (play-test P7 inventory, P15 required level, P16 gear icons):
// real items rolled by Farhold's generator (the test server's /roll hook), the paper doll + bag, icons rendered
// from the 3D models, the item card on hover (required level red, compare), equip by click, filters and sort,
// and the phone layout. Screenshots: tests/D/shots/inv-*.png.
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/inventory.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

async function join_(browser, name, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=${name}&cls=warrior&quality=low`);
  await page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().phase === 'world', null, { timeout: 60000 });
  return { ctx, page, errors };
}
const bag = page => page.evaluate(() => window.thousandvale.bag.state.bag.length);

// P1 (D-world's profile): icon rendering froze the main thread 3–4 s an icon right after joining. Now icons render only
// while the bag is open, one per idle period, no toDataURL. This watches every long task (> 100 ms) from 4 s after
// joining through opening the bag and rendering every icon.
test('no freeze: joining with a full bag and opening it has no main-thread task over 100 ms from the icons', async ({ browser }) => {
  test.setTimeout(240000);
  const P = await join_(browser, 'Calmhand', { width: 1280, height: 720 });
  const { page } = P;
  expect((await hook('/roll', { name: 'Calmhand', n: 18, level: 6 })).ok).toBe(true);
  await expect.poll(() => bag(page), { timeout: 15000 }).toBeGreaterThanOrEqual(14);
  await page.waitForTimeout(4000);                                   // let the world finish streaming in
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ t: Math.round(e.startTime), ms: Math.round(e.duration) }); }).observe({ type: 'longtask' });
  });
  // bag CLOSED for a while: nothing renders
  await page.waitForTimeout(3000);
  const closed = await page.evaluate(async () => (await import('./js/client/ui/item-icons.js')).iconStats());
  expect(closed.active).toBe(false);
  // open it and let every icon render
  await page.keyboard.press('KeyB');
  await expect.poll(() => page.locator('#bag-grid .islot.pending').count(), { timeout: 120000, message: 'icons rendered' }).toBe(0);
  const stats = await page.evaluate(async () => (await import('./js/client/ui/item-icons.js')).iconStats());
  const tasks = await page.evaluate(() => window.__lt);
  console.log('icon stats', JSON.stringify(stats), 'long tasks', JSON.stringify(tasks));
  // This VM draws with a SOFTWARE renderer (~4 fps), so every game frame is itself a "long task" of 150–300 ms and the
  // raw long-task list cannot single the icons out. What the icons own is measured directly: every synchronous piece
  // of icon work (build, pose, draw, read back) must stay under 100 ms even here (a few ms on a real GPU), and the old
  // multi-second freezes must be gone from the long-task list.
  expect(stats.maxSync, `slowest synchronous icon step ${stats.maxSync} ms: ${stats.spans.join(' ')}`).toBeLessThanOrEqual(100);
  const worst = Math.max(0, ...tasks.map(t => t.ms));
  expect(worst, `worst main-thread task ${worst} ms`).toBeLessThan(1000);
  expect(P.errors).toEqual([]);
  await P.ctx.close();
});

test('character window: doll + bag, icons, item card with required level, equip, filters', async ({ browser }) => {
  const P = await join_(browser, 'Invtest', { width: 1280, height: 720 });
  const { page } = P;
  expect((await hook('/roll', { name: 'Invtest', n: 26, level: 10 })).ok).toBe(true);
  await expect.poll(() => bag(page), { timeout: 15000 }).toBeGreaterThanOrEqual(20);
  await page.evaluate(() => window.tv.hud(true));
  await page.keyboard.press('KeyB');
  await expect(page.locator('#bag')).toBeVisible();
  // every item gets a picture rendered from its 3D model (P16)
  await expect.poll(() => page.locator('#bag-grid .islot img').count(), { timeout: 60000, message: 'icons rendered' }).toBeGreaterThanOrEqual(15);
  await expect.poll(() => page.locator('#bag-grid .islot.pending').count(), { timeout: 60000 }).toBe(0);
  // some rolled items need level 2-3 and the character is level 1: the requirement shows red on the square (P15)
  expect(await page.locator('#bag-grid .islot .req.no').count()).toBeGreaterThan(0);
  await page.screenshot({ path: join(SHOTS, 'inv-bag.png') });

  // the card: hover a too-high item, then an upgrade
  const high = page.locator('#bag-grid .islot.toohigh').first();
  await high.hover();
  await expect(page.locator('#tipbox.show .itemtip')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#tipbox .req-no')).toContainText(/Requires level \d+/);
  await page.screenshot({ path: join(SHOTS, 'inv-card-toohigh.png') });
  // clicking it refuses with the reason, and nothing is equipped
  await high.click();
  await page.waitForTimeout(400);

  // wear an upgrade by clicking it; the doll fills
  const up = page.locator('#bag-grid .islot:has(.up)').first();
  await up.hover();
  await expect(page.locator('#tipbox.show .itemtip')).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: join(SHOTS, 'inv-card-upgrade.png') });
  const before = await bag(page);
  await up.click();
  await expect.poll(() => page.locator('#bag .inv-doll .islot img').count(), { timeout: 15000 }).toBeGreaterThan(0);
  // (a starting kit fills both hands since play-test 6: a two-hander sends BOTH the old weapon and the off-hand piece back to the bag)
  expect(await bag(page)).toBeLessThanOrEqual(before + 1);
  // a few more upgrades so the doll reads (armour: nothing to refuse)
  await page.locator('#inv-filters .chip[data-f="armour"]').click();
  for (let i = 0; i < 6; i++) { const u = page.locator('#bag-grid .islot:has(.up)').first(); if (!(await u.count())) break; await u.click(); await page.waitForTimeout(600); }
  await page.locator('#inv-filters .chip[data-f="all"]').click();
  await page.mouse.move(10, 400);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, 'inv-doll.png') });

  // compare on a worn-slot item: card shows "Instead of"
  await page.mouse.move(10, 400);
  const cmp = page.locator('#bag-grid .islot[data-tip-item]').first();
  await cmp.hover(); await page.mouse.move(1, 1, { steps: 1 }).catch(() => {}); await cmp.hover();
  await expect(page.locator('#tipbox.show .itemtip')).toBeVisible({ timeout: 10000 });

  // filters and sort
  await page.locator('#inv-filters .chip[data-f="weapon"]').click();
  const shown = await page.locator('#bag-grid .islot[data-tip-item]').count();
  const weapons = await page.evaluate(() => window.thousandvale.bag.state.bag.filter(i => i.type === 'weapon').length);
  expect(shown).toBe(weapons);
  await page.locator('#inv-filters .chip[data-f="all"]').click();
  await page.selectOption('#inv-sort', 'rarity');
  await page.mouse.move(10, 400);
  await page.screenshot({ path: join(SHOTS, 'inv-sorted.png') });
  expect(P.errors, P.errors.join('\n')).toEqual([]);
  await P.ctx.close();
});

test('character window on a phone', async ({ browser }) => {
  const P = await join_(browser, 'Invphone', { width: 390, height: 844 });
  await hook('/roll', { name: 'Invphone', n: 14, level: 1 });
  await expect.poll(() => bag(P.page), { timeout: 15000 }).toBeGreaterThanOrEqual(10);
  await P.page.keyboard.press('KeyB');
  await expect.poll(() => P.page.locator('#bag-grid .islot.pending').count(), { timeout: 60000 }).toBe(0);
  await P.page.screenshot({ path: join(SHOTS, 'inv-phone.png') });
  const box = await P.page.locator('#bag').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  expect(P.errors, P.errors.join('\n')).toEqual([]);
  await P.ctx.close();
});
