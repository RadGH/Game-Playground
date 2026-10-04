// Hunters vs Farmers on every input / screen / network setup the owner asks of a mode (stream H):
//   * pad only: a controller joins at the setup card, starts, walks the farmer and places a coop
//     through the build menu — with zero keyboard or mouse events
//   * split screen: keyboard farmer + controller hunter, two viewports, two HUDs, each with its fog
//   * online: two pages over BroadcastChannel (stream D's transport + lockstep), co-op farmers vs AI
//     hunters, the same state hash at tick 1200
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

const PAGE = 'prototypes/bannerline/hvf.html';
const errorsOf = (page) => { const e = []; page.on('pageerror', (x) => e.push(x.message)); return e; };

test('pad only: join, start, walk, build a coop from the build menu', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await page.addInitScript({ content: PADMOCK });
  await page.addInitScript(() => {
    window.__kbmEvents = 0;
    for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) window.addEventListener(t, (e) => { if (e.isTrusted) window.__kbmEvents++; }, true);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=8&speed=2`);
  await page.waitForFunction(() => window.hvfGame && document.querySelector('.hvf-setup'), null, { timeout: 30_000 });
  await page.evaluate(() => window.__pad.connect(0));
  await tap(page, 0, STD.A);                                       // the pad joins as Player 1
  await expect(page.locator('.hvf-setup .seat').first()).toContainText(/controller|xbox|pad/i);
  await tap(page, 0, STD.A);                                       // Start (focused)
  await page.waitForFunction(() => window.hvf && window.hvf.match, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.hvf.match.views[0].device)).toBe('pad0');
  await page.evaluate(() => { const g = window.hvf; g.state().players[g.match.me].gold = 3000; });
  const at = () => page.evaluate(() => { const g = window.hvf, s = g.state(), e = s.ents.find((x) => x.id === s.players[g.match.me].ent); return { x: e.x, z: e.z }; });
  const p0 = await at();
  // walk: left stick right for a moment
  await page.evaluate(() => window.__pad.axis(0, 0, 1));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__pad.axis(0, 0, 0));
  await page.waitForTimeout(300);
  const p1 = await at();
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'the stick walks the farmer').toBeGreaterThan(2);
  // d-pad down opens the build menu on the Hen Coop; A picks it; A places it at the aim ring
  await tap(page, 0, STD.DDown);
  await expect(page.locator('.hvf-root.menu-open')).toHaveCount(1);
  await expect(page.locator('.hv-build .nav-focus')).toHaveCount(1);
  await tap(page, 0, STD.A);
  await expect(page.locator('.hvf-root.menu-open')).toHaveCount(0);
  expect(await page.evaluate(() => window.hvf.match.views[0].placing)).toBe('coop');
  const built = async () => page.evaluate(() => window.hvf.state().ents.filter((e) => e.type === 'coop').length);
  for (let k = 0; k < 6 && (await built()) === 0; k++) {
    if (!(await page.evaluate(() => window.hvf.match.views[0].placing))) {   // a refused spot drops the ghost: pick again
      await tap(page, 0, STD.DDown); await tap(page, 0, STD.A);
    }
    // swing the aim ring round with the right stick, then A
    await page.evaluate((i) => { window.__pad.axis(0, 2, [1, -1, 0, 0, 1, -1][i]); window.__pad.axis(0, 3, [0, 0, 1, -1, 1, 1][i]); }, k);
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__pad.axis(0, 2, 0); window.__pad.axis(0, 3, 0); });
    await tap(page, 0, STD.A);
    await page.waitForTimeout(2500);
  }
  expect(await built(), 'a coop placed by pad').toBe(1);
  expect(await page.evaluate(() => window.__kbmEvents)).toBe(0);
  await page.screenshot({ path: 'test-results/hvf-pad.png' });
  expect(errors).toEqual([]);
});

test('split screen: keyboard farmer + controller hunter, two viewports with their own fog', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await page.addInitScript({ content: PADMOCK });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=9`);
  await page.waitForFunction(() => window.hvfGame && document.querySelector('.hvf-setup'), null, { timeout: 30_000 });
  await page.keyboard.press('Enter');                             // the keyboard joins as Player 1
  await page.evaluate(() => window.__pad.connect(0));
  await tap(page, 0, STD.A);                                      // the pad joins as Player 2
  await expect(page.locator('.hvf-setup .seat:not(.add)')).toHaveCount(2);
  await expect(page.locator('.hvf-setup .peek')).toBeVisible();   // farmer + hunter: no peeking
  await page.locator('.hvf-setup [data-k="format"]').selectOption('3v1');
  await page.locator('.hvf-setup [data-act="start"]').click();
  await page.waitForFunction(() => window.hvf && window.hvf.match, null, { timeout: 30_000 });
  await expect(page.locator('.hvf-root')).toHaveCount(2);
  const views = await page.evaluate(() => window.hvf.match.views.map((v) => ({ role: v.role, team: v.team, device: v.device })));
  expect(views).toEqual([{ role: 'farmer', team: 0, device: 'kbm' }, { role: 'hunter', team: 1, device: 'pad0' }]);
  await page.evaluate(() => window.hvf.fastForward(20 * 50));
  await page.waitForTimeout(800);
  const probe = await page.evaluate(() => window.hvf.probe());
  expect(probe.length).toBe(2);
  for (const p of probe) expect(p.sd, p.id).toBeGreaterThan(5);
  expect(probe[0].rect.x).toBe(0);
  expect(probe[1].rect.x).toBeGreaterThan(600);
  // the two halves see different things: each team's vision bitset differs
  const differ = await page.evaluate(() => { const s = window.hvf.state(); return s.hvf.vision[0].some((w, i) => w !== s.hvf.vision[1][i]); });
  expect(differ).toBe(true);
  await page.screenshot({ path: 'test-results/hvf-split.png' });
  expect(errors).toEqual([]);
});

test('online: two pages over BroadcastChannel, co-op farmers vs AI hunter, same hash at tick 1200', async ({ context }) => {
  test.setTimeout(180_000);
  const host = await context.newPage(), guest = await context.newPage();
  const errors = [...errorsOf(host), ...errorsOf(guest)];
  for (const p of [host, guest]) { await p.setViewportSize({ width: 960, height: 600 }); await p.goto(`${PAGE}?seed=3&net=channel`); }
  for (const p of [host, guest]) await p.waitForFunction(() => window.hvfGame && document.querySelector('.hvf-setup'), null, { timeout: 30_000 });
  await host.evaluate(() => window.hvfGame.online.host('HVFAB', { format: '3v1' }));
  await guest.evaluate(() => window.hvfGame.online.join('HVFAB'));
  await host.evaluate(() => { const o = window.hvfGame.online; o.claim('farmer-0', { name: 'Host' }); o.ready('farmer-0'); });
  await guest.evaluate(() => window.hvfGame.online.claim('farmer-1', { name: 'Guest' }));
  await expect.poll(() => host.evaluate(() => window.hvfGame.online.room.state.seats.find((s) => s.key === 'farmer-1').kind)).toBe('human');
  await guest.evaluate(() => window.hvfGame.online.ready('farmer-1'));
  await expect.poll(() => host.evaluate(() => window.hvfGame.online.room.state.seats.every((s) => s.kind !== 'human' || s.ready))).toBe(true);
  await host.evaluate(() => window.hvfGame.online.start({ seed: 777, tickMs: 10, startIn: 600 }));
  for (const p of [host, guest]) await p.waitForFunction(() => window.hvf && window.hvf.match, null, { timeout: 30_000 });
  const local = await guest.evaluate(() => window.hvf.match.views.map((v) => ({ role: v.role, player: v.player })));
  expect(local).toEqual([{ role: 'farmer', player: 1 }]);
  // both play: each farmer walks and builds a coop through the net layer
  for (const p of [host, guest]) await p.evaluate(() => { const g = window.hvf, m = g.match, s = g.state(), e = s.ents.find((x) => x.id === s.players[m.me].ent); g.issue({ type: 'build', kind: 'coop', x: e.x + (m.me ? -7 : 7), z: e.z + 3 }); });
  await expect.poll(() => host.evaluate(() => window.hvfGame.online.hashes[1200] || null), { timeout: 120_000 }).toBeTruthy();
  await expect.poll(() => guest.evaluate(() => window.hvfGame.online.hashes[1200] || null), { timeout: 60_000 }).toBeTruthy();
  const hh = await host.evaluate(() => window.hvfGame.online.hashes), gh = await guest.evaluate(() => window.hvfGame.online.hashes);
  expect(gh[1200]).toBe(hh[1200]);
  let compared = 0;
  for (const t of Object.keys(gh)) if (hh[t] !== undefined) { expect(gh[t], `tick ${t}`).toBe(hh[t]); compared++; }
  expect(compared).toBeGreaterThanOrEqual(6);
  const coops = await host.evaluate(() => window.hvf.state().ents.filter((e) => e.type === 'coop').map((e) => e.owner));
  expect(coops.length, 'commands from both machines reached the sim').toBeGreaterThanOrEqual(1);
  await host.screenshot({ path: 'test-results/hvf-online-host.png' });
  expect(errors).toEqual([]);
});
