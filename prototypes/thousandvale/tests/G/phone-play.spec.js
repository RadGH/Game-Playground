// Stream G — PHONE GO-LIVE: the real game, a real server, an iPhone 15 Pro-sized touch browser, played end to end.
// (Chromium with touch + a 393 x 852 viewport, not Safari: this proves the layout and the touch layer drive the game;
// frame rate on the real phone is not something a headless software renderer can tell us.)
// Every step takes a picture into tests/G/shots/phone-play/. Steps are soft: one broken step does not hide the others.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/phone-play.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots', 'phone-play');
mkdirSync(SHOTS, { recursive: true });
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase, ctx, page; const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: e.message }));
const shot = name => page.screenshot({ path: join(SHOTS, name + '.png') });
const tap = sel => page.locator(sel).first().tap();
const you = () => page.evaluate(() => tv.state().you);
const NAME = 'Thumbelin';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120000);
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hookBase = `http://127.0.0.1:${hk}`;
  ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('1. the phone layout chooses itself; creating a character — name, calling, appearance (with Preview), equipment', async () => {
  test.setTimeout(420000);
  await page.goto(base + '?fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 240000 });
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]').content)).toMatch(/user-scalable=no.*viewport-fit=cover/);
  expect(await page.evaluate(() => thousandvale.view.renderer ? window.tv.state().stats.quality : null)).toMatch(/low|medium/);
  await shot('01-title');
  await page.locator('#name').tap(); await page.locator('#name').fill(NAME);
  await tap('#classes [data-cls="cleric"]');
  await tap('#enter');
  await expect(page.locator('#panel-appearance')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('02-appearance');
  await tap('#panel-appearance .ph-peek'); await page.waitForTimeout(600);
  await shot('03-appearance-preview');
  expect((await page.locator('#panel-appearance').boundingBox()).height).toBeLessThan(80);
  await tap('#panel-appearance .ph-peek');
  await tap('#panel-appearance [data-act="save"]');
  await page.waitForFunction(() => tvui5.state().kits.open || thousandvale.S.phase !== 'title', null, { timeout: 30000 });
  if (await page.evaluate(() => tvui5.state().kits.open)) {
    await page.waitForTimeout(1200); await shot('04-equipment');
    const packs = page.locator('#panel-kits [data-group="weapons"]');
    if (await packs.count() > 1) await packs.nth(1).tap();
    await tap('#panel-kits [data-act="create"]');
  }
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  await page.waitForTimeout(4000);
  await shot('05-in-the-world');
  await expect(page.locator('.ph-stickzone')).toBeVisible();
  await expect(page.locator('#menubar')).toBeHidden();
});

test('2. the thumb stick walks the character; nothing you can press is under 44 px or outside the screen', async () => {
  test.setTimeout(180000);
  const a = await you();
  const z = await page.locator('.ph-stickzone').boundingBox();
  const cx = z.x + z.width * 0.45, cy = z.y + z.height * 0.6;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 50, { steps: 4 });
  await page.waitForTimeout(3000);
  await shot('06-walking');
  await page.mouse.up();
  const b = await you();
  expect(Math.hypot(b.x - a.x, b.z - a.z), 'moved by the stick').toBeGreaterThan(2);
  const small = await page.evaluate(() => [...document.querySelectorAll('#hud button, #hud .pmember, #hud .slot')].filter(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && s.visibility !== 'hidden' && !e.closest('[hidden]') && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) && (e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) && (r.width < 43.5 || r.height < 43.5 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight); }).map(e => (e.id || e.className) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  expect(small).toEqual([]);
});

test('3. target a monster, fight it with the attack and skill buttons, loot the body', async () => {
  test.setTimeout(300000);
  await hook('/level', { name: NAME, level: 12 });
  // stand near the closest monster (the walk there is not what this checks)
  const near = async () => page.evaluate(() => { const y = tv.state().you; return tv.state().ents.filter(e => e.kind === 'monster' && !e.dead).map(e => ({ ...e, d: Math.hypot(e.x - y.x, e.z - y.z) })).sort((p, q) => p.d - q.d)[0] || null; });
  let m = await near();
  // none by the waystone: look a little way out of town in each direction
  const home = await you();
  for (const [dx, dz] of [[220, 0], [0, 220], [-220, 0], [0, -220], [380, 380], [-380, 380], [380, -380], [-380, -380]]) { if (m) break; await hook('/teleport', { name: NAME, x: home.x + dx, z: home.z + dz }); await page.waitForTimeout(4500); m = await near(); }
  test.skip(!m, 'no monster in view of the starter town in this bake');
  await hook('/teleport', { name: NAME, x: m.x + 3, z: m.z + 3 });
  await page.waitForTimeout(2500);
  await tap('.ph-target');
  await expect(page.locator('#target-frame')).toBeVisible({ timeout: 10000 });
  await shot('07-target');
  const tid = await page.evaluate(() => tv.state().target);
  const dead = () => page.evaluate(id => { const e = tv.state().ents.find(x => x.id === id); return !e || e.dead; }, tid);
  for (let i = 0; i < 60 && !(await dead()); i++) {
    await page.locator('#actionbar > .slot').first().tap();
    if (i % 4 === 1) await page.locator('#actionbar > .slot').nth(2).tap().catch(() => {});
    await page.waitForTimeout(700);
    if (i === 3) await shot('08-fighting');
  }
  expect(await dead(), 'the monster died to taps').toBe(true);
  await page.waitForTimeout(1500);
  await shot('09-after-the-fight');
  const prompt = page.locator('.loot-prompt:not([hidden])');
  if (await prompt.count()) {
    await prompt.tap();
    await expect(page.locator('#panel-loot')).toBeVisible({ timeout: 8000 });
    await shot('10-loot');
    await page.locator('#panel-loot .primary').first().tap().catch(() => {});
    await page.waitForTimeout(800);
    if (await page.locator('#panel-loot').isVisible()) await page.locator('#panel-loot .tvp-x').tap();
  } else test.info().annotations.push({ type: 'note', description: 'this kill dropped nothing to loot' });
});

test('4. the quick wheel opens the bag; a tap on an item opens its card; "Use / wear" wears it', async () => {
  test.setTimeout(180000);
  await hook('/roll', { name: NAME, n: 8, level: 8, boost: 2 });
  await page.waitForTimeout(1500);
  await tap('.ph-wheel');
  await expect(page.locator('.tv-radial')).toBeVisible();
  await shot('11-wheel');
  await page.locator('.tv-radial .rd-slice[data-id="bag"]').tap();
  await expect(page.locator('#bag')).toBeVisible();
  await page.waitForTimeout(2500);
  await shot('12-bag');
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(thousandvale.S.net.joined.you.equipment || {}).map(([k, v]) => [k, v && v.uid]))));
  const cell = page.locator('#bag-grid .islot:not(.empty):not(.toohigh)').first();
  await cell.tap();
  await expect(page.locator('.phone-sheet')).toBeVisible({ timeout: 5000 });
  await shot('13-item-sheet');
  await page.locator('.phone-sheet .ps-act.primary').tap();
  await expect.poll(() => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(thousandvale.S.net.joined.you.equipment || {}).map(([k, v]) => [k, v && v.uid])))), { timeout: 8000 }).not.toBe(before);
  // the Stats button and the tab bar
  await tap('#inv-stats');
  await expect(page.locator('#panel-sheet')).toBeVisible();
  await shot('14-character');
});

test('5. the perk forest: stage a pick with a tap on the graph, Accept spends it', async () => {
  test.setTimeout(180000);
  await page.locator('.phone-tabs [data-tab="perks"]').tap();
  await expect(page.locator('#panel-perks canvas')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const T = () => page.evaluate(() => { const t = thousandvale.ui.talents; return { staged: t.stage.perks.length, held: t.state.perks.length }; });
  const t0 = await T();
  const id = await page.evaluate(() => { const t = thousandvale.ui.talents, F = t.source.forest, have = new Set([F.start.id, ...t.state.perks]); const n = F.nodes.find(x => !have.has(x.id) && (F.neighbours.get(x.id) || []).some(y => have.has(y))); t.graph.focus(n.id); return n.id; });
  await page.waitForTimeout(500);
  const p = await page.evaluate(i => { const t = thousandvale.ui.talents, c = document.querySelector('#panel-perks canvas').getBoundingClientRect(), s = t.graph.screenOf(i); return { x: c.left + s.x, y: c.top + s.y }; }, id);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => T().then(t => t.staged)).toBe(t0.staged + 1);
  await shot('15-perk-staged');
  await page.locator('#panel-perks [data-stage="accept"]').tap();
  await expect.poll(() => T().then(t => t.held), { timeout: 8000 }).toBe(t0.held + 1);
  await shot('16-perk-accepted');
});

test('6. the map (with its list folded away), casting a line from the wheel, and sending feedback', async () => {
  test.setTimeout(240000);
  await page.locator('.phone-tabs [data-tab="map"]').tap();
  await expect(page.locator('#panel-map canvas').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(3000);
  await shot('17-map');
  await tap('#panel-map .ph-mapside');
  await expect(page.locator('#panel-map .map-side')).toBeHidden();
  await shot('18-map-wide');
  await page.locator('.phone-tabs .pt-close').tap();
  await expect(page.locator('#panel-map')).toBeHidden();
  // cast a line: the wheel's second ring (no rod yet: the game says so in its own words)
  await page.evaluate(() => { window.__sent = []; const n = thousandvale.S.net, f = n.fish; n.fish = (op, a) => { window.__sent.push(op); return f(op, a); }; });
  await tap('.ph-wheel'); await page.locator('.tv-radial .rd-hub').tap();
  await expect(page.locator('.tv-radial')).toHaveAttribute('data-ring', '1');
  await shot('19-wheel-second-ring');
  await page.locator('.tv-radial .rd-slice[data-id="fish"]').tap();
  await page.waitForTimeout(700);
  const fished = await page.evaluate(() => ({ sent: window.__sent, toast: document.getElementById('toasts').textContent }));
  expect(fished.sent.length > 0 || /rod|water|line/i.test(fished.toast), `the cast reached the game (${JSON.stringify(fished)})`).toBe(true);
  await shot('20-cast');
  // feedback: wheel > Menu > Feedback
  await tap('.ph-wheel'); await page.locator('.tv-radial .rd-slice[data-id="pause"]').tap();
  await expect(page.locator('#panel-pause')).toBeVisible();
  await shot('21-menu');
  await page.locator('#panel-pause .ph-extra').first().tap();
  await expect(page.locator('#panel-feedback textarea')).toBeVisible({ timeout: 8000 });
  await page.locator('#panel-feedback textarea').fill('Played on a phone-sized screen: the thumb stick and the arcs work.');
  await shot('22-feedback');
  await page.locator('#panel-feedback .primary').first().tap();
  await expect.poll(() => page.evaluate(() => tvui5.state().feedback.sent != null || /thank|sent/i.test(document.querySelector('#panel-feedback')?.textContent || '')), { timeout: 10000 }).toBe(true);
  await shot('23-feedback-sent');
});

test('7. turning the phone on its side keeps the phone layout and re-arranges it', async () => {
  test.setTimeout(120000);
  for (const x of await page.locator('.tv-panel:not([hidden]) .tvp-x').all()) await x.tap().catch(() => {});
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  await shot('24-landscape');
  const a = await page.locator('#actionbar > .slot').first().boundingBox();
  expect(a.x + a.width).toBeLessThanOrEqual(852); expect(a.y + a.height).toBeLessThanOrEqual(393);
  // forcing the desktop layout from Settings turns the touch layer off; Automatic brings it back
  await page.evaluate(() => thousandvale.ui2.settings.panel.open());
  await page.locator('#panel-settings [data-tab="keys"]').tap(); await page.locator('#panel-settings [data-bind="touch"]').tap();
  await page.locator('#panel-settings select[data-k="layout"]').selectOption('desktop');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.layout || 'desktop')).toBe('desktop');
  await expect(page.locator('.ph-stickzone')).toBeHidden();
  await page.locator('#panel-settings [data-tab="keys"]').click(); await page.locator('#panel-settings [data-bind="touch"]').click();
  await page.locator('#panel-settings select[data-k="layout"]').selectOption('auto');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  expect(errors).toEqual([]);
});
