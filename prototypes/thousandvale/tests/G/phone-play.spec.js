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
const SHOTS = join(HERE, 'shots', process.env.G_SHOTS || 'phone-play');      // G_SHOTS=phone-play-webkit when run with --browser=webkit
mkdirSync(SHOTS, { recursive: true });
// one worker, one shared page, in file order — but a failed step does not stop the ones after it (each says what it needs)
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
  await tap('#new-char');      // play-test 10 (Y29, D-UI): the title opens on the front card — "Create character" first
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
  await hook('/level', { name: NAME, level: 30 });        // sturdy enough that the fight is about the buttons, not about surviving a pack
  // stand near the closest monster (the walk there is not what this checks)
  const near = async () => page.evaluate(() => { const y = tv.state().you; return tv.state().ents.filter(e => e.kind === 'monster' && !e.dead && !/dummy/i.test(thousandvale.S.mirror.infos.get(e.id)?.type || thousandvale.S.mirror.infos.get(e.id)?.name || '')).map(e => ({ ...e, d: Math.hypot(e.x - y.x, e.z - y.z) })).sort((p, q) => p.d - q.d)[0] || null; });
  let m = await near();
  // none by the waystone: look a little way out of town in each direction
  const home = await you();
  for (const [dx, dz] of [[220, 0], [0, 220], [-220, 0], [0, -220], [380, 380], [-380, 380], [380, -380], [-380, -380]]) { if (m) break; await hook('/teleport', { name: NAME, x: home.x + dx, z: home.z + dz }); await page.waitForTimeout(4500); m = await near(); }
  test.skip(!m, 'no monster in view of the starter town in this bake');
  // stand by it (monsters wander: do it again if the Target button finds nothing within its 40 m)
  for (let i = 0; i < 5; i++) {
    m = (await near()) || m;
    await hook('/teleport', { name: NAME, x: m.x + 3, z: m.z + 3 });
    await page.waitForTimeout(3000);
    await tap('.ph-target');
    if (await page.locator('#target-frame').isVisible().catch(() => false)) break;
    await page.waitForTimeout(1500);
  }
  await expect(page.locator('#target-frame')).toBeVisible({ timeout: 10000 });
  await shot('07-target');
  // Y35 (play-test 10): ONE tap of Attack. Clear the target first — the button must pick the nearest enemy by itself —
  // and stand out of reach with the stick pushed AWAY, so the tap has to end that push, turn you and walk you in.
  await page.evaluate(() => thousandvale.input.run('targetClear'));
  m = (await near()) || m;
  await hook('/teleport', { name: NAME, x: m.x + 9, z: m.z + 9 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => tv.state().target || null), 'no target before the tap').toBeNull();
  const z = await page.locator('.ph-stickzone').boundingBox();
  const sx = z.x + z.width * 0.45, sy = z.y + z.height * 0.6;
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx, sy + 50, { steps: 3 });       // the left thumb is steering
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelector('.ph-stick').classList.contains('on'))).toBe(true);
  const attack = page.locator('#actionbar > .slot').first();
  await attack.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 31, bubbles: true });               // the right thumb comes down on Attack
  await attack.evaluate(el => el.click());
  await attack.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 31, bubbles: true });
  await expect(attack, 'the button shows that auto-attack is on').toHaveClass(/\bauto\b/, { timeout: 3000 });
  expect(await page.evaluate(() => document.querySelector('.ph-stick').classList.contains('on')), 'the tap ended the stick\'s push').toBe(false);
  await expect(page.locator('#target-frame'), 'the nearest enemy was picked').toBeVisible({ timeout: 4000 });
  const tid = await page.evaluate(() => tv.state().target);
  const st = () => page.evaluate(id => { const e = tv.state().ents.find(x => x.id === id), y = tv.state().you; return { dead: !e || e.dead, d: e ? Math.hypot(e.x - y.x, e.z - y.z) : 0, auto: thousandvale.controls.auto, reach: thousandvale.S.reach }; }, tid);
  const s0 = await st();
  await page.waitForTimeout(1200); await page.mouse.up();
  await shot('08-fighting');
  // NOT ONE more tap: it walks in and keeps swinging until the thing is dead
  let closed = false;
  for (let i = 0; i < 90; i++) { const q = await st(); if (q.d <= q.reach + 1.2) closed = true; if (q.dead) break; await page.waitForTimeout(700); if (i === 6) await shot('08b-auto-attacking'); }
  expect(closed || s0.d <= s0.reach + 1.2, `walked into reach from ${s0.d.toFixed(1)} m`).toBe(true);
  const dead = () => st().then(q => q.dead);
  expect(await dead(), 'the monster died to ONE tap of Attack').toBe(true);
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

test('3b. Y35: a second tap switches auto-attack off (hammering the button does not); moving keeps it on; Y1: an activity starting lets go of the stick', async () => {
  test.setTimeout(240000);
  const near = async () => page.evaluate(() => { const y = tv.state().you; return tv.state().ents.filter(e => e.kind === 'monster' && !e.dead).map(e => ({ ...e, d: Math.hypot(e.x - y.x, e.z - y.z) })).sort((p, q) => Number(!!thousandvale.S.mirror.infos.get(q.id)?.dummy) - Number(!!thousandvale.S.mirror.infos.get(p.id)?.dummy) || p.d - q.d)[0] || null; });
  const attack = page.locator('#actionbar > .slot').first();
  const auto = () => page.evaluate(() => thousandvale.controls.auto != null);
  await page.evaluate(() => { for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x')) x.click(); thousandvale.controls.stopAuto(); });
  let m = await near();
  if (m) {
    await hook('/teleport', { name: NAME, x: m.x + 14, z: m.z + 14 }); await page.waitForTimeout(2500);
    await attack.tap();
    await expect.poll(auto).toBe(true);
    // hammering (the owner's old habit): presses closer together than 0.6 s all mean "attack". Sent from inside the page —
    // a software renderer can take a second to deliver one tap, which would make these calm presses, not fast ones.
    const hammered = await page.evaluate(() => { const b = document.querySelector('#actionbar > .slot'), seen = []; thousandvale.S.attackTapAt = performance.now(); for (let i = 0; i < 5; i++) { b.click(); seen.push(thousandvale.controls.auto != null); } return seen; });
    expect(hammered, 'five fast presses: never switched off').toEqual([true, true, true, true, true]);
    await page.waitForTimeout(800);
    // the stick moves you by hand: the attack stays on (report #45), only the walk toward the enemy ends
    const z = await page.locator('.ph-stickzone').boundingBox();
    const sx = z.x + z.width * 0.45, sy = z.y + z.height * 0.6;
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 50, sy, { steps: 3 }); await page.waitForTimeout(900);
    expect(await auto(), 'moving does not switch auto-attack off').toBe(true);
    expect(await page.evaluate(() => thousandvale.controls.chasing), 'the walk toward the enemy is yours now').toBeNull();
    await page.mouse.up();
    await page.waitForTimeout(700);
    await attack.tap();                                                             // a calm second tap: off
    await expect.poll(auto, { timeout: 3000 }).toBe(false);
    await expect(attack).not.toHaveClass(/\bauto\b/);
    await expect(page.locator('#toasts')).toContainText(/stop attacking/i);
    await shot('09b-auto-off');
  } else test.info().annotations.push({ type: 'note', description: 'no monster left near: the toggle was not played' });
  // Y1 — the left thumb is steering when a mini-game / a talk / a shop opens: you stop, and stay stopped while the finger rests
  await page.evaluate(() => thousandvale.input.run('targetClear'));
  const z = await page.locator('.ph-stickzone').boundingBox();
  const sx = z.x + z.width * 0.45, sy = z.y + z.height * 0.6;
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx, sy - 50, { steps: 3 }); await page.waitForTimeout(800);
  const a0 = await you();
  await page.waitForTimeout(700);
  const a1 = await you();
  expect(Math.hypot(a1.x - a0.x, a1.z - a0.z), 'walking by the stick').toBeGreaterThan(1);
  await page.evaluate(() => { document.documentElement.dataset.prof = 'strike'; });           // what a mini-game sets while it is up
  await page.waitForTimeout(900);
  const b0 = await you(); await page.waitForTimeout(900); const b1 = await you();
  expect(Math.hypot(b1.x - b0.x, b1.z - b0.z), 'stopped when the activity began (finger still down)').toBeLessThan(0.4);
  await page.evaluate(() => { delete document.documentElement.dataset.prof; });
  await page.waitForTimeout(900);
  const c1 = await you();
  expect(Math.hypot(c1.x - b1.x, c1.z - b1.z), 'and not "stuck moving" when it closes').toBeLessThan(0.4);
  await page.mouse.up();
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx, sy - 50, { steps: 3 }); await page.waitForTimeout(1200);
  const d1 = await you(); await page.mouse.up();
  expect(Math.hypot(d1.x - c1.x, d1.z - c1.z), 'a fresh push of the stick moves you again').toBeGreaterThan(1);
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

test('6b. an event is never invisible behind the closed bubble: a chip names it when it starts, the bubble pulses, opening it shows the card', async () => {
  test.setTimeout(120000);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x, #bag:not([hidden]) #bag-close')) x.click(); }); await page.waitForTimeout(400);
  await expect(page.locator('#right-col')).toBeHidden();                       // collapsed is the phone's resting state (owner feedback 7, V7)
  await page.evaluate(() => { const y = tv.state().you; tv.fake('eventTrack', { uid: 'e1', id: 'wolves_ford', name: 'Wolves at the Ford', state: 'live', what: 'A starving pack is crossing the ford toward the farms.', objective: { text: 'Defeat the three packs, then the pack mother', n: 2, of: 4 }, leftMs: 372000, endsAt: Date.now() + 372000, rewardText: 'Event cache: a rare item or better', inside: true, inRange: true, players: 3, x: y.x, z: y.z, r: 40 }); });
  await expect(page.locator('.ph-chip')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.ph-chip')).toContainText('Wolves at the Ford');
  await expect(page.locator('.ph-info')).toHaveClass(/pulse/);
  await expect(page.locator('.ph-info b')).not.toHaveText('');
  await shot('23b-event-chip');
  await page.locator('.ph-chip').tap();
  await expect(page.locator('#right-col .et-card')).toBeVisible();
  await expect(page.locator('#right-col .et-card')).toContainText('Defeat the three packs');
  await shot('23c-event-open');
  // a boss call-out is drawn in the centre column, which the bubble never hides
  await page.locator('.ph-info').tap();
  await page.evaluate(() => thousandvale.boss.callout('The Screelhag draws breath!', 'warn', null, true));
  await expect(page.locator('.callout.show, #callout.show')).toBeVisible({ timeout: 3000 });
  await page.evaluate(() => tv.fake('eventDone', { uid: 'e1', id: 'wolves_ford', name: 'Wolves at the Ford', result: 'success', credited: true, xp: 120, gold: 14, text: 'Wolves at the Ford — success' }));
  await expect(page.locator('.ph-chip')).toBeVisible({ timeout: 5000 });
});

test('6c. Y34: Fish and Mount are buttons of their own with their names on; Fish is dim away from water and says why; the Belt never casts a line; a first-time fishing hint', async () => {
  test.setTimeout(300000);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x, #bag:not([hidden]) #bag-close')) x.click(); thousandvale.controls.stopAuto(); thousandvale.input.run('targetClear'); }); await page.waitForTimeout(400);
  // Mount: there, named, one tap sends the call; the name becomes what the next tap will do
  await hook('/mounts', { name: NAME, mounts: ['trail_horse'] }); await page.waitForTimeout(300);      // round 11 (#16): bought, not given
  const mount = page.locator('.ph-mount');
  await expect(mount).toBeVisible(); await expect(mount.locator('small')).toHaveText('Mount');
  await page.evaluate(() => { window.__mount = []; const n = thousandvale.S.net, f = n.mount.bind(n); n.mount = op => { window.__mount.push(op); return f(op); }; });
  await mount.tap();
  await expect.poll(() => page.evaluate(() => window.__mount)).toEqual(['summon']);
  await shot('23d-mount-calling');
  const riding = await page.waitForFunction(() => !!thousandvale.S.self.mount, null, { timeout: 9000 }).then(() => true, () => false);
  if (riding) {
    await expect(mount.locator('small')).toHaveText('Dismount'); await expect(mount).toHaveClass(/\bon\b/);
    await shot('23e-mounted');
    await mount.tap();
    await expect.poll(() => page.evaluate(() => !thousandvale.S.self.mount), { timeout: 6000 }).toBe(true);
    await expect(mount.locator('small')).toHaveText('Mount');
  } else test.info().annotations.push({ type: 'note', description: 'the server would not let this character ride here: ' + await page.evaluate(() => document.getElementById('toasts').textContent) });
  // no rod: no Fish button at all
  const fish = page.locator('.ph-fish');
  const hadRod = await page.evaluate(() => tvui5.state().angling?.hasRod ?? !document.querySelector('.fish-btn').hidden);
  if (!hadRod) await expect(fish).toBeHidden();
  // A rod arrives with a use action, but must never occupy a potion key.
  await hook('/give', { name: NAME, items: 1, itemName: 'Angling Rod', kind: 'rod', id: 'angling_rod', rarity: 'common' });
  await expect(fish).toBeVisible({ timeout: 8000 });
  await expect(fish.locator('small')).toHaveText('Fish');
  const belt = await page.evaluate(() => ({ hot: tvui2.state().hotbar, items: [...document.querySelectorAll('#actionbar .hb-slot')].map(s => s.className) }));
  expect(belt.hot.filter(id => /rod/i.test(id || '')), 'potion slots exclude fishing rods').toEqual([]);
  // the Belt: a tap must never use the rod
  await page.evaluate(() => { window.__used = []; const n = thousandvale.S.net, f = n.item.bind(n); n.item = (op, a) => { window.__used.push(op + ':' + a); return f(op, a); }; });
  await page.locator('.ph-belt').tap(); await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__used)).filter(u => /rod/i.test(u)), `the Belt used the rod (hotbar ${JSON.stringify(belt.hot)})`).toEqual([]);
  // away from water (the test town's square): dim, and a tap says why instead of "casting…" into the grass
  await page.waitForTimeout(900);
  const wet = await page.evaluate(() => !!tvinput.touch.water);
  await page.evaluate(() => { window.__fish = []; const n = thousandvale.S.net, f = n.fish.bind(n); n.fish = (op, a) => { window.__fish.push(op); return f(op, a); }; });
  if (!wet) {
    await expect(fish).toHaveClass(/\bdim\b/);
    await shot('23f-fish-dim');
    await fish.tap();
    await expect(page.locator('#toasts')).toContainText(/No water in reach/);
    expect(await page.evaluate(() => window.__fish), 'nothing was cast').toEqual([]);
  }
  // the first-time hint: three steps, once
  await expect(page.locator('.ph-hint')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('.ph-hint li')).toHaveCount(3);
  await expect(page.locator('.ph-hint')).toContainText(/Hook/);
  await shot('23g-fish-hint');
  await page.locator('.ph-hint button').tap();
  await expect(page.locator('.ph-hint')).toBeHidden();
  // water: look for some near by on the client's own terrain, stand on its bank, and the button lights up and casts
  const spot = await page.evaluate(() => {
    const T = thousandvale.WS.terrain, y = tv.state().you; let best = null;
    for (let r = 20; r <= 900 && !best; r += 20) for (let k = 0; k < 24 && !best; k++) {
      const a = k / 24 * Math.PI * 2, x = y.x + Math.cos(a) * r, z = y.z + Math.sin(a) * r, w = T.waterAt(x, z);
      if (!w || !(w.depth >= 0.4)) continue;
      for (let back = 3; back <= 14; back += 1) { const bx = x - Math.cos(a) * back, bz = z - Math.sin(a) * back, bw = T.waterAt(bx, bz); if ((!bw || !(bw.depth > 0.05)) && T.walkable(bx, bz)) { best = { x: bx, z: bz, wx: x, wz: z, back }; break; } }
    }
    return best;
  });
  if (spot) {
    await hook('/teleport', { name: NAME, x: spot.x, z: spot.z }); await page.waitForTimeout(4000);
    await expect(fish, `water ${spot.back} m away`).toHaveClass(/\blit\b/, { timeout: 6000 });
    await shot('23h-fish-lit');
    await fish.tap();
    await expect.poll(() => page.evaluate(() => window.__fish)).toContain('cast');
    await page.waitForTimeout(1500);
    await shot('23i-cast');
    await page.evaluate(() => thousandvale.S.net.fish('stop'));
  } else test.info().annotations.push({ type: 'note', description: 'no water within 900 m of the test town: the lit state was not played' });
});

test('6d. Y34: hold a control = its name; the pause menu\'s "What do these buttons do?" numbers and names every control on screen', async () => {
  test.setTimeout(120000);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x, #bag:not([hidden]) #bag-close')) x.click(); document.querySelector('.ph-hint button')?.click(); }); await page.waitForTimeout(300);
  const hold = async (sel, ms = 650) => { const el = page.locator(sel).first(); await el.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 41, bubbles: true, clientX: 5, clientY: 5 }); await page.waitForTimeout(ms); };
  const t0 = await page.evaluate(() => tv.state().target || null);
  await hold('.ph-target');
  await expect(page.locator('.ph-label')).toBeVisible();
  await expect(page.locator('.ph-label b')).toHaveText('Next enemy');
  const lb = await page.locator('.ph-label').boundingBox();
  expect(lb.x >= 0 && lb.x + lb.width <= 393 && lb.y >= 0, 'the label is on the screen').toBe(true);
  await shot('23j-label');
  await page.locator('.ph-target').first().dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 41, bubbles: true });
  await page.locator('.ph-target').first().evaluate(el => el.click());                    // the click that ends a hold does nothing
  expect(await page.evaluate(() => tv.state().target || null), 'holding for the label did not press the button').toBe(t0);
  await hold('#actionbar > .slot:nth-child(1)');
  await expect(page.locator('.ph-label b')).toHaveText('Attack');
  await page.locator('#actionbar > .slot').first().dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 41, bubbles: true });
  await page.waitForTimeout(800);
  // the overlay
  await tap('.ph-wheel'); await page.locator('.tv-radial .rd-slice[data-id="pause"]').tap();
  await expect(page.locator('#panel-pause')).toBeVisible();
  await page.locator('#panel-pause .ph-explain-open').tap();
  await expect(page.locator('.ph-explain')).toBeVisible({ timeout: 4000 });
  const ex = await page.evaluate(() => ({ names: [...document.querySelectorAll('.ph-ex-card li em')].map(e => e.textContent), marks: [...document.querySelectorAll('.ph-ex-n')].map(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), card: (() => { const r = document.querySelector('.ph-ex-card').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; })(), btn: document.querySelector('.ph-ex-card button').getBoundingClientRect().height }));
  for (const need of ['Move', 'Attack', 'Belt', 'Next enemy', 'Jump', 'Mount', 'Fish', 'Quick wheel', 'Chat']) expect(ex.names, `the overlay names ${need}`).toContain(need);
  expect(ex.names.length).toBe(ex.marks.length);
  expect(ex.marks.every(Boolean), 'every number is on the screen').toBe(true);
  expect(ex.card.bottom).toBeLessThanOrEqual(ex.card.h); expect(ex.btn).toBeGreaterThanOrEqual(44);
  await shot('23k-what-the-buttons-do');
  await page.locator('.ph-ex-card button').tap();
  await expect(page.locator('.ph-explain')).toBeHidden();
});

test('6e. Y36: a party member who is off the screen gets a small edge arrow; holding their portrait offers Track, and the tracked one gets the big named arrow instead', async () => {
  test.setTimeout(120000);
  const set = far => page.evaluate(far => {
    const y = tv.state().you, me = thousandvale.S.net.joined.you.char, yaw = thousandvale.controls.cam.yaw;
    const party = { id: 'p1', leader: me, me, members: [{ char: me, name: 'Thumbelin', level: 30, cls: 'cleric', online: true }, { char: 9001, name: 'Brannoch', level: 12, cls: 'fighter', online: true }] };
    thousandvale.S.net.party = party; tv.fake('party', party);
    // behind the camera and to the side: certainly not on the screen
    const x = y.x - Math.sin(yaw) * far + Math.cos(yaw) * far * 0.4, z = y.z - Math.cos(yaw) * far - Math.sin(yaw) * far * 0.4;
    tv.fake('partyFrames', [{ char: 9001, hp: 80, hpMax: 100, room: thousandvale.S.room?.id ?? null, x, z, dead: false, online: true, id: null }]);
  }, far);
  await set(180);
  await expect(page.locator('.tv-partyarrow')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.tv-partyarrow b')).toHaveText('B');
  await expect(page.locator('.tv-partyarrow span')).toHaveText(/\d+ m/);
  const ar = await page.locator('.tv-partyarrow b').boundingBox();
  expect(ar.x >= 0 && ar.x + ar.width <= 393 && ar.y >= 0 && ar.y + ar.height <= 852, 'the arrow is on the screen').toBe(true);
  await shot('23l-party-arrow');
  // hold the portrait: Track
  await expect(page.locator('#party .pmember')).toHaveCount(1);
  await page.locator('#party .pmember').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 51, bubbles: true, clientX: 5, clientY: 5 });
  await page.waitForTimeout(650);
  await expect(page.locator('.phone-sheet')).toBeVisible();
  await expect(page.locator('.phone-sheet .ps-plain strong')).toHaveText('Brannoch');
  await shot('23m-party-track-sheet');
  await page.locator('#party .pmember').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 51, bubbles: true });
  await page.locator('.phone-sheet .ps-act.primary').tap();
  await expect.poll(() => page.evaluate(() => tvui10.isTracked(9001))).toBe(true);
  await set(180); await page.waitForTimeout(600);
  await expect(page.locator('.tv-trackarrow')).toHaveCount(1);
  await expect(page.locator('.tv-partyarrow'), 'never two arrows for one person').toHaveCount(0);
  await shot('23n-tracked');
  await page.evaluate(() => { tvui10.untrack(9001, { quiet: true }); thousandvale.S.net.party = null; tv.fake('party', null); tv.fake('partyFrames', []); });
  await expect(page.locator('.tv-partyarrow')).toHaveCount(0);
});

test('7. turning the phone on its side keeps the phone layout and re-arranges it', async () => {
  test.setTimeout(120000);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x, #bag:not([hidden]) #bag-close')) x.click(); }); await page.waitForTimeout(400);
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
