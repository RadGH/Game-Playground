// W9 (P-client): professions in the REAL game — a real browser against a real server (tests/D/m3-server.mjs).
//   the prospector by Torborhold's gate teaches Mining at the first word · copper boulders are drawn (instanced) and
//   carry a prompt · E starts the mini-game, the character swings a pick · a synthetic player presses real keys ·
//   the card shows what the SERVER gave · the boulder is bare for you afterwards · the smith has a forge beside him
//   and his dialog opens the crafting window with the server's recipe list.
// Pictures: tests/P/shots/world/*.png (LOOK at them).
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/P/client-world.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots', 'world');
const D = join(HERE, '..', 'D');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, page, ctx;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const shot = name => page.screenshot({ path: join(SHOTS, name) });
const NAME = 'Maren';
const C = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'provinces', 'professions.json'), 'utf8'));
const BRAM = C.trainers[0], NODE = BRAM.starters[0];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(480000);
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(D, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  hookBase = `http://127.0.0.1:${hp}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${NAME}&cls=ranger&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

/**
 * Play the mini-game that is up from OUTSIDE the page: real key presses (or real touches) sent at the moments the
 * flawless play says. A software renderer draws this scene at a few frames a second and starves the page's own
 * timers — but a real input carries the time the device reported it, and the frame scores THAT (prof-minigame.js `at`),
 * which is exactly what this proves.
 */
async function botReal(pg, how = 'key') {
  // ONE question to the page: the flawless inputs, where a finger would tap for each, and the wall-clock moment the game began
  // (the page may take a second to answer; the answer is still exact)
  const { perfect, start, type, pts } = await pg.evaluate(() => { const m = tvprof.mini, run = m.run; return { perfect: run.perfect, type: run.type, start: Date.now() - m.state.clock, pts: run.perfect.map(([, v]) => m.pointFor(v)) }; });
  for (const [i, [t, v]] of perfect.entries()) {
    const wait = t - (Date.now() - start) - 4; if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (how === 'touch') await pg.touchscreen.tap(pts[i].x, pts[i].y);
    else { const code = type === 'rhythm' ? (v ? 'KeyD' : 'KeyA') : type === 'pick' ? 'Digit' + (v + 1) : type === 'forge' && v === 1 ? 'KeyD' : 'Space'; const d = pg.keyboard.down(code); await pg.keyboard.up(code); await d; }
  }
}
const botKeys = () => botReal(page, 'key');

test('the prospector teaches Mining at the first word; the Professions list has ten trades', async () => {
  test.setTimeout(120000);
  const r = await hook('/teleport', { name: NAME, x: BRAM.x + 2.2, z: BRAM.z + 0.5 });
  expect(r.ok).toBe(true);
  await page.waitForFunction(() => [...thousandvale.actors.actors.values()].some(a => a.role === 'prospector'), null, { timeout: 30000 });
  await page.evaluate(() => { tv.setTime(0.5); tv.view(7, 0.3); });
  await page.evaluate(() => { const b = [...thousandvale.actors.actors.values()].find(a => a.role === 'prospector'); thousandvale.S.net.use(b.id); });
  await page.waitForFunction(() => tvprof.state.list.find(p => p.id === 'mining')?.known, null, { timeout: 10000 });
  const st = await page.evaluate(() => tvprof.state);
  expect(st.list.map(p => p.id)).toEqual(['mining', 'logging', 'foraging', 'skinning', 'angling', 'smithing', 'outfitting', 'alchemy', 'cooking', 'tempering']);
  expect(st.list.find(p => p.id === 'mining').tool?.name).toBeTruthy();
  await page.waitForTimeout(600);
  await shot('w9-prospector.png');
  expect(await page.evaluate(() => tvprof.state.trainer.open)).toBe(false);
  await page.evaluate(() => thousandvale.worldUi.closeDialog?.());
  // the journal's page
  await page.evaluate(() => thousandvale.ui.journal.showTab('professions'));
  await expect(page.locator('#panel-journal .pk-row')).toHaveCount(10);
  await shot('w9-journal.png');
  await page.keyboard.press('Escape');
});

test('copper boulders stand by the road, instanced; E starts the mini-game, the character swings a pick; the card shows the server\'s answer; the boulder is bare afterwards', async () => {
  test.setTimeout(300000);
  await hook('/teleport', { name: NAME, x: NODE.x + 2.4, z: NODE.z + 0.6 });
  await page.waitForTimeout(2500);        // (the step may cross from the town's room into the fields: the nodes of the room left behind go, the new room's arrive)
  await page.waitForFunction(() => thousandvale.profView.stats.nodes > 2 && thousandvale.profView.stats.instances > 0, null, { timeout: 30000 }).catch(async () => { throw new Error('no nodes: ' + JSON.stringify(await page.evaluate(() => ({ stats: thousandvale.profView.stats, room: thousandvale.S.room?.kind, objs: [...thousandvale.objects.items.values()].filter(o => o.type === 'node').length, infos: [...thousandvale.S.mirror.infos.values()].filter(i => i.type === 'node').length, pos: tv.state().you })))); });
  await page.waitForTimeout(800);
  const s0 = await page.evaluate(() => ({ ...thousandvale.profView.stats, calls: thousandvale.view.renderer.info.render.calls }));
  expect(s0.nodes).toBeGreaterThan(2); expect(s0.meshes).toBeLessThan(26);
  expect(s0.instances).toBeGreaterThan(s0.nodes);            // rock + chunks
  // from a little way off: do they read?
  await page.evaluate(() => { tv.hud(false); tv.view(14, 0.42); });
  await page.waitForTimeout(900); await shot('w9-nodes-far.png');
  await page.evaluate(() => { tv.hud(true); tv.view(6.5, 0.32); });
  await page.waitForTimeout(700);
  await expect(page.locator('#interact')).toBeVisible();
  await expect(page.locator('#interact')).toContainText(/Mine .*Boulder/);
  await shot('w9-node-prompt.png');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play'), null, { timeout: 10000 });
  const type = await page.evaluate(() => tvprof.mini.state.type); expect(type).toBe('strike');
  await page.waitForTimeout(350);
  const working = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id), w = thousandvale.profView.workers.get(a.id); return { clip: a.working, anim: a.anim, tool: w?.tool, inHand: !!w?.mesh?.parent }; });
  expect(working.clip).toBe('profMine'); expect(working.tool).toBe('pick'); expect(working.inHand).toBe(true);
  await shot('w9-mining.png');
  // give up (Esc): nothing is lost, the boulder is still there, the pick goes away
  await page.keyboard.press('Escape');
  await expect(page.locator('.tv-prof')).toBeHidden();
  await page.waitForFunction(() => !thousandvale.actors.get(tv.state().you.id).working, null, { timeout: 8000 });
  expect(await page.evaluate(() => thousandvale.profView.stats.spent)).toBe(0);
  // (a software renderer draws this scene at a few frames a second; the synthetic player needs its timers, so the view is made small while it plays)
  await page.setViewportSize({ width: 320, height: 220 }); await page.waitForTimeout(400);
  await page.keyboard.press('KeyE'); await page.waitForFunction(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play'), null, { timeout: 10000 });
  // a botched game spends nothing and may be tried again at once — which is also what saves this test when the
  // software renderer starves the synthetic player's timers
  let local = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) { await page.keyboard.press('Space'); await expect(page.locator('.tv-prof')).toBeHidden(); await page.keyboard.press('KeyE'); await page.waitForFunction(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play'), null, { timeout: 10000 }); }
    await page.evaluate(() => { if (!window.__g) { window.__g = []; window.addEventListener('tv:prof', e => { if (e.detail.state === 'result') (window.__r ||= []).push({ q: e.detail.quality, pairs: tvprof.mini.run.pairs.map(p => p[0]), perfect: tvprof.mini.run.perfect.map(p => p[0]), frames: tvprof.mini.state.frames }); }); for (const t of ['gatherR', 'gatherDone']) thousandvale.S.net.on(t, m => window.__g.push({ t, ok: m.ok, why: m.why, msg: m.msg, q: m.quality, state: m.state })); } });
    await botKeys();
    await page.waitForFunction(() => document.querySelector('.prof-card[data-q]') && !document.querySelector('.prof-wait'), null, { timeout: 10000 }).catch(async () => { throw new Error('no answer on the card: ' + JSON.stringify(await page.evaluate(() => ({ r: window.__r, msgs: window.__g, st: tvprof.state.mini, work: tvprof.state.work, card: document.querySelector('.prof-card')?.innerText })))); });
    local = await page.evaluate(() => ({ ...tvprof.mini.state.result, server: document.querySelector('.prof-card').dataset.q }));
    if (local.server !== 'fail') break;
    expect(await page.evaluate(() => thousandvale.profView.stats.spent), 'a botched boulder is still there').toBe(0);
  }
  await page.setViewportSize({ width: 1100, height: 680 });
  const card = await page.locator('.prof-card').innerText();
  expect(card, 'local ' + JSON.stringify(local)).toMatch(/Copper Ore|Tin Ore/); expect(card).not.toMatch(/undefined|null|NaN|\[object/);
  await shot('w9-result.png');
  const after = await page.evaluate(() => ({ spent: thousandvale.profView.stats.spent, opened: tvprof.state.opened.length, bag: thousandvale.bag.state.bag.filter(i => i.kind === 'material').map(i => i.name + ' x' + (i.count || 1)), working: thousandvale.actors.get(tv.state().you.id).working }));
  expect(after.opened).toBeGreaterThan(0); expect(after.bag.length).toBeGreaterThan(0);
  await page.waitForTimeout(3800);
  await expect(page.locator('.tv-prof')).toBeHidden();
  const end = await page.evaluate(() => ({ spent: thousandvale.profView.stats.spent, working: thousandvale.actors.get(tv.state().you.id).working, prompt: document.getElementById('interact').hidden ? '' : document.getElementById('interact').innerText }));
  expect(end.spent).toBeGreaterThan(0); expect(end.working).toBeFalsy();
  expect(end.prompt).not.toMatch(/Mine/);            // the nearest one is bare: no prompt on it
  await page.evaluate(() => tv.hud(false)); await page.waitForTimeout(300);
  await shot('w9-node-spent.png');
  await page.evaluate(() => tv.hud(true));
  console.log('[prof] world:', JSON.stringify({ s0, working, after, end, card: card.replace(/\s+/g, ' ') }));
});

test('the smith has a forge and a tempering bench beside him; his dialog opens the crafting window with the server\'s list; a material\'s card says what it is', async () => {
  test.setTimeout(180000);
  // find him: walk the town until he is in sight (he is a service NPC: his office is on the map list)
  const smith = await page.evaluate(async () => {
    const find = () => [...thousandvale.actors.actors.values()].find(a => a.role === 'smith');
    return find() ? { x: find().pos.x, z: find().pos.z } : null;
  });
  let at = smith;
  if (!at) { const who = await hook('/teleport', { name: NAME, x: 25183, z: 5388 }); expect(who.ok).toBe(true); await page.waitForFunction(() => [...thousandvale.actors.actors.values()].some(a => a.role === 'smith'), null, { timeout: 30000 }); at = await page.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.role === 'smith'); return { x: a.pos.x, z: a.pos.z }; }); }
  await hook('/teleport', { name: NAME, x: at.x + 2.6, z: at.z + 2.6 });
  await page.waitForFunction(() => thousandvale.profView.stats.stations >= 2, null, { timeout: 30000 });
  await page.evaluate(() => { tv.hud(false); tv.view(15, 1.05); });
  await page.waitForTimeout(1800); await shot('w9-forge.png');
  const where = await page.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.role === 'smith'), s = thousandvale.profView.npcs.get(a.id); return { smith: [a.pos.x, a.pos.z, a.yaw], props: s.props.map(m => [m.name, +m.position.x.toFixed(1), +m.position.y.toFixed(1), +m.position.z.toFixed(1)]) }; });
  console.log('[prof] stations:', JSON.stringify(where));
  for (const yaw of [0, 1.57, 3.14, 4.71]) { await page.evaluate(y => tv.view(8, 0.5, y), yaw); await page.waitForTimeout(700); await shot(`w9-forge-${yaw}.png`); }
  await page.evaluate(() => { tv.hud(true); const a = [...thousandvale.actors.actors.values()].find(x => x.role === 'smith'); thousandvale.S.net.use(a.id); });
  await expect(page.locator('.tv-dialog .prof-dlg').first()).toBeVisible({ timeout: 10000 });
  await shot('w9-smith-dialog.png');
  await page.locator('.tv-dialog .prof-dlg', { hasText: 'Use the forge' }).click();
  await expect(page.locator('#panel-craft .pc-row').first()).toBeVisible({ timeout: 10000 });
  const text = await page.locator('#panel-craft').innerText();
  expect(text).toMatch(/Bronze Bar/); expect(text).not.toMatch(/undefined|NaN|\[object/);
  await shot('w9-craft.png');
  await page.keyboard.press('Escape');
  // the ore in the bag
  await page.keyboard.press('KeyB');
  const ore = page.locator('#bag-grid .islot:not(.empty)').filter({ has: page.locator(':scope') }).first();
  const uid = await page.evaluate(() => thousandvale.bag.state.bag.find(i => i.kind === 'material')?.uid);
  await page.locator(`#bag-grid .islot[data-tip-item="${uid}"]`).hover();
  await expect(page.locator('#tipbox')).toContainText(/Crafting material/i, { timeout: 5000 });
  await shot('w9-material-card.png');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('on a phone (393 × 852, the real phone layout): tap the prompt, play the boulder with one finger, the character does not walk off', async ({ browser }) => {
  test.setTimeout(480000);
  const pctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await pctx.newPage(); const perr = [];
  p.on('pageerror', e => perr.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Pip&cls=ranger&quality=low&tod=0.5&layout=phone`);
  await p.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await p.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  expect(await p.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  await hook('/teleport', { name: 'Pip', x: BRAM.x + 2.2, z: BRAM.z + 0.5 });
  await p.waitForFunction(() => [...thousandvale.actors.actors.values()].some(a => a.role === 'prospector'), null, { timeout: 30000 });
  await p.evaluate(() => { const b = [...thousandvale.actors.actors.values()].find(a => a.role === 'prospector'); thousandvale.S.net.use(b.id); });
  await p.waitForFunction(() => tvprof.state.list.find(x => x.id === 'mining')?.known, null, { timeout: 10000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => thousandvale.worldUi.closeDialog?.());
  expect(await p.evaluate(() => tvprof.state.trainer.open), 'a prospector who has taught you all he knows opens no window').toBe(false);
  const N2 = BRAM.starters[1];
  await hook('/teleport', { name: 'Pip', x: N2.x + 2.2, z: N2.z + 0.4 });
  await p.waitForTimeout(2500);
  await p.waitForFunction(() => thousandvale.profView.stats.nodes > 2 && !document.getElementById('interact').hidden, null, { timeout: 30000 });
  await expect(p.locator('#interact')).toContainText(/Mine/);
  await p.screenshot({ path: join(SHOTS, 'w9-phone-prompt.png') });
  // everything is noted INSIDE the page as it happens (the software renderer draws a couple of frames a second: a question asked from outside can take seconds)
  const before = await p.evaluate(() => {
    window.__ph = { box: null, local: null, server: null, card: null };
    window.addEventListener('tv:prof', e => {
      if (e.detail.state === 'play') requestAnimationFrame(() => { const r = document.querySelector('.prof-game').getBoundingClientRect(), c = document.querySelector('.prof-canvas').getBoundingClientRect(); window.__ph.box = { top: r.top, bottom: r.bottom, w: r.width, canvasH: c.height, vh: innerHeight, vw: innerWidth, x: document.querySelector('.prof-x').getBoundingClientRect().width, controlsUnder: document.elementFromPoint(innerWidth - 50, innerHeight - 60)?.closest('.tv-prof') ? 'panel' : 'other' }; });
      if (e.detail.state === 'result') window.__ph.local = { q: e.detail.quality, inputs: tvprof.mini.run.pairs.length };
    });
    thousandvale.S.net.on('gatherDone', m => { window.__ph.server = { q: m.quality, ok: m.ok, got: (m.got || []).map(g => g.n + ' ' + g.name) }; setTimeout(() => { window.__ph.card = document.querySelector('.prof-card')?.innerText.replace(/\s+/g, ' ') || '(card gone)'; }, 400); });
    return { ...tv.state().you };
  });
  await p.locator('#interact').tap();
  await p.waitForFunction(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play'), null, { timeout: 15000 });
  await botReal(p, 'touch');          // one finger: real touches on the panel at the moments the flawless play says
  await p.waitForFunction(() => window.__ph.card, null, { timeout: 30000 });
  await p.screenshot({ path: join(SHOTS, 'w9-phone-result.png') });
  const res = await p.evaluate(() => ({ ...window.__ph, you: { ...tv.state().you } })), box = res.box;
  console.log('[prof] phone:', JSON.stringify(res));
  expect(box.bottom, JSON.stringify(box)).toBeLessThanOrEqual(box.vh + 0.5); expect(box.w).toBeGreaterThan(box.vw - 30); expect(box.canvasH).toBeGreaterThanOrEqual(240); expect(box.x).toBeGreaterThanOrEqual(44);
  expect(box.top, 'the panel is in the lower half: under a thumb, the character above it').toBeGreaterThan(box.vh * 0.4);
  expect(box.controlsUnder, 'the attack button is under the panel, not through it').toBe('panel');
  // (how WELL it went is not asked here: this page draws two frames a second, and the first tap can only be sent once the page has answered.
  //  client-minigames.spec.js plays all nine trades to a Perfect by touch at 393 x 852.) What matters: real touches were strikes, and the server agreed with the card.
  expect(res.local.inputs, 'taps on the panel were taken as strikes').toBeGreaterThanOrEqual(2);
  expect(res.server.q, 'the server scored the same inputs the same way').toBe(res.local.q);
  expect(Math.hypot(res.you.x - before.x, res.you.z - before.z), 'tapping the panel did not walk the character anywhere').toBeLessThan(0.6);
  expect(res.card).not.toMatch(/undefined|null|NaN|\[object/);
  expect(perr, perr.join('\n')).toEqual([]);
  await pctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------
// MAKING, end to end, in the real game: mine copper and tin -> smelt bronze (a batch, one mini-game) -> forge a blade
// (the forge mini-game) -> the card and the item in the bag -> temper it once (the gauge). The FLOW is asserted, not how
// well the synthetic player did: every step must come back from the server and leave what it should in the bag.
const HOME = { x: 25183, z: 5388 };
async function makeFlow(pg, name, how) {
  let stage = 'start';
  try { return await makeFlowSteps(pg, name, how, st => { stage = st; }); }
  catch (e) { const dump = await pg.evaluate(() => ({ flow: window.__flow, mini: tvprof.state.mini, work: tvprof.state.work, prompt: document.getElementById('interact').hidden ? '' : document.getElementById('interact').innerText, panels: [...document.querySelectorAll('.tv-panel:not([hidden]), .tv-dialog:not([hidden])')].map(x => x.id || x.className), known: tvprof.state.list.filter(x => x.known).map(x => x.id), ore: thousandvale.bag.state.bag.filter(i => i.kind === 'material').map(i => i.id + ':' + (i.count || 1)) })).catch(() => null); e.message = `[at: ${stage}] ${e.message}\n${JSON.stringify(dump)}`; throw e; }
}
async function makeFlowSteps(pg, name, how, at) {
  const act = sel => (how === 'touch' ? pg.locator(sel).first().tap() : pg.locator(sel).first().click());
  const until = (fn, arg, ms = 30000) => pg.waitForFunction(fn, arg, { timeout: ms });
  await pg.evaluate(() => {
    const L = window.__flow = { gather: [], craft: [], cards: [] };
    thousandvale.S.net.on('gatherDone', m => L.gather.push({ ok: m.ok, q: m.quality, got: (m.got || []).map(g => g.n + ' ' + g.name) }));
    thousandvale.S.net.on('craftDone', m => { L.craft.push({ id: m.id, ok: m.ok, q: m.quality, items: (m.items || []).map(i => i.name), item: m.item ? { name: m.item.name, quality: m.item.quality, tempered: m.item.tempered } : null, msg: m.msg }); setTimeout(() => L.cards.push(document.querySelector('.prof-card')?.innerText.replace(/\s+/g, ' ') || '(card gone)'), 350); });
  });
  const count = id => pg.evaluate(i => thousandvale.bag.state.bag.filter(x => x.id === i).reduce((a, x) => a + (x.count || 1), 0), id);
  const playUp = async () => { await until(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play'), null, 15000); await botReal(pg, how); };
  expect((await hook('/give', { name, gold: 600, items: 0 })).ok).toBe(true);
  // 1. learn Mining (Bram teaches at the first word)
  at('1. learn Mining');
  await hook('/teleport', { name, x: BRAM.x + 2.2, z: BRAM.z + 0.5 });
  await until(() => [...thousandvale.actors.actors.values()].some(a => a.role === 'prospector'));
  await pg.evaluate(() => { const b = [...thousandvale.actors.actors.values()].find(a => a.role === 'prospector'); thousandvale.S.net.use(b.id); });
  await until(() => tvprof.state.list.find(x => x.id === 'mining')?.known, null, 15000);
  await pg.waitForTimeout(900); await pg.evaluate(() => thousandvale.worldUi.closeDialog?.());
  // 2. mine: copper and tin boulders by the gate until there is enough for five bars (three for a blade, two to temper it)
  at('2. mine');
  // (five starter boulders stand there — three copper, two tin — and each is back for you two minutes after you work it: go round again if a poor swing left you short)
  let mined = 0;
  for (let round = 0; round < 9; round++) for (const [k, st] of BRAM.starters.entries()) {
    if ((await count('copper_ore')) >= 5 && (await count('tin_ore')) >= 5) break;
    if (round && k === 0) await pg.waitForTimeout(25000);              // (waiting for the two-minute boulders to come back)
    if ((await count(st.kind + '_ore')) >= 5) continue;
    await hook('/teleport', { name, x: st.x + 2.2, z: st.z + 0.4 });
    await pg.waitForTimeout(1500);
    const ready = await until(() => !document.getElementById('interact').hidden && /Mine/.test(document.getElementById('interact').innerText), null, 9000).then(() => true, () => false);
    if (!ready) continue;                                              // this one is still bare for us
    const n0 = await pg.evaluate(() => window.__flow.gather.length);
    if (how === 'touch') await pg.locator('#interact').tap(); else await pg.keyboard.press('KeyE');
    await playUp();
    await until(n => window.__flow.gather.length > n, n0, 20000);
    mined++;
    await until(() => !tvprof.mini.isOpen, null, 15000);
  }
  const ore = { copper: await count('copper_ore'), tin: await count('tin_ore') };
  expect(ore.copper, `mined ${mined} boulders: ${JSON.stringify(await pg.evaluate(() => window.__flow.gather))}`).toBeGreaterThanOrEqual(5);
  expect(ore.tin).toBeGreaterThanOrEqual(5);
  // 3. the smith: learn Smithing and Tempering from his dialog's own button, then "Use the forge"
  at('3. the smith');
  await hook('/teleport', { name, x: HOME.x, z: HOME.z });
  await until(() => [...thousandvale.actors.actors.values()].some(a => a.role === 'smith'));
  const smithAt = await pg.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.role === 'smith'); return { x: a.pos.x, z: a.pos.z }; });
  await hook('/teleport', { name, x: smithAt.x + 1.6, z: smithAt.z + 1.2 });
  await pg.waitForTimeout(1500);
  const talk = () => pg.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.role === 'smith'); thousandvale.S.net.use(a.id); });
  await talk();
  await pg.locator('.tv-dialog .prof-dlg', { hasText: /Learn/ }).waitFor({ timeout: 15000 });
  await act('.tv-dialog .prof-dlg:has-text("Learn")');
  for (const id of ['smithing', 'tempering']) { await act(`#panel-trainer [data-learn="${id}"]`); await until(i => tvprof.state.list.find(x => x.id === i)?.known, id, 15000); }
  await pg.evaluate(() => tvprof.trainer.close());
  await talk();
  await pg.locator('.tv-dialog .prof-dlg', { hasText: 'Use the forge' }).waitFor({ timeout: 15000 });
  await act('.tv-dialog .prof-dlg:has-text("Use the forge")');
  await pg.locator('#panel-craft [data-make="smelt_bronze_bar"]').waitFor({ timeout: 15000 });
  // 4. smelt: a batch of five, ONE mini-game
  at('4. smelt');
  await pg.locator('#panel-craft [data-batch="smelt_bronze_bar"]').waitFor({ timeout: 10000 });
  expect(await pg.locator('#panel-craft [data-batch="smelt_bronze_bar"]').getAttribute('data-n'), 'the batch is what the ore allows').toBe(String(Math.min(10, ore.copper, ore.tin)));
  await act('#panel-craft [data-batch="smelt_bronze_bar"]');
  await playUp();
  await until(() => window.__flow.craft.some(c => c.id === 'smelt_bronze_bar'), null, 20000);
  const bars = await count('bronze_bar');
  expect(bars, JSON.stringify(await pg.evaluate(() => window.__flow.craft))).toBeGreaterThanOrEqual(5);
  await until(() => !tvprof.mini.isOpen, null, 15000);
  // 5. forge a blade: the forge mini-game (hammer, and back in the fire), then the card and the item in the bag
  at('5. forge a blade');
  await pg.locator('#panel-craft [data-make="blades_1"]:not([disabled])').waitFor({ timeout: 15000 });
  let blade = null;
  for (let attempt = 0; attempt < 3 && !blade; attempt++) {          // (a botched forging spends nothing and may be tried again at once)
    const n0 = await pg.evaluate(() => window.__flow.craft.length);
    await act('#panel-craft [data-make="blades_1"]');
    await until(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play') && tvprof.mini.state.type === 'forge', null, 15000);
    await botReal(pg, how);
    await until(n => window.__flow.craft.length > n && window.__flow.cards.length > n, n0, 25000);
    blade = await pg.evaluate(() => { const it = thousandvale.bag.state.bag.find(i => i.crafted); return it ? { uid: it.uid, name: it.name, rarity: it.rarity, quality: it.quality, maker: it.maker } : null; });
    await until(() => !tvprof.mini.isOpen, null, 15000);
  }
  const forged = await pg.evaluate(() => ({ craft: window.__flow.craft, cards: window.__flow.cards }));
  expect(blade, 'a forged blade is in the bag: ' + JSON.stringify(forged.craft)).toBeTruthy();
  expect(blade.maker).toBe(name);
  expect(forged.cards.at(-1), 'the result card names the item').toContain(blade.name);
  await pg.screenshot({ path: join(SHOTS, `w9-make-${how}-forged.png`) });
  // 6. temper it once: the Tempering tab, the item, the server's quote, the gauge
  at('6. temper it once');
  await act('#panel-craft .pc-tab[data-tab="tempering"]');
  await act(`#panel-craft .pt-item[data-uid="${blade.uid}"]`);
  await pg.locator('#panel-craft [data-temper="temper_quality"]:not([disabled])').waitFor({ timeout: 20000 });
  const quote = await pg.locator('#panel-craft .pt-quote').innerText();
  expect(quote).toMatch(/Bronze Bar/); expect(quote).not.toMatch(/undefined|NaN|\[object/);
  await pg.screenshot({ path: join(SHOTS, `w9-make-${how}-quote.png`) });
  const c0 = await pg.evaluate(() => window.__flow.craft.length);
  await act('#panel-craft [data-temper="temper_quality"]');
  await until(() => (tvprof.mini.state.state === 'ready' && tvprof.mini.begin(), tvprof.mini.state.state === 'play') && tvprof.mini.state.type === 'gauge', null, 15000);
  await botReal(pg, how);
  await until(n => window.__flow.craft.length > n && window.__flow.cards.length > n, c0, 25000);
  const end = await pg.evaluate(uid => ({ temper: window.__flow.craft.at(-1), card: window.__flow.cards.at(-1), item: (() => { const it = thousandvale.bag.state.bag.find(i => i.uid === uid); return it ? { name: it.name, quality: it.quality, tempered: it.tempered || 0 } : null; })(), gather: window.__flow.gather, craft: window.__flow.craft }), blade.uid);
  await pg.screenshot({ path: join(SHOTS, `w9-make-${how}-tempered.png`) });
  console.log(`[prof] make (${how}):`, JSON.stringify({ mined, ore, bars, blade, end: { temper: end.temper, card: end.card, item: end.item }, gather: end.gather.map(g => g.q), craft: end.craft.map(c => c.id + ':' + c.q) }));
  expect(end.temper.id).toBe('temper_quality');
  expect(end.item, 'tempering never loses the item').toBeTruthy();
  if (end.temper.ok) { expect(end.item.tempered).toBeGreaterThanOrEqual(1); expect(end.item.quality).not.toBe(blade.quality); }
  else expect(end.item.quality, 'a missed gauge leaves the item as it was').toBe(blade.quality);
  expect(end.card).not.toMatch(/undefined|null|NaN|\[object/);
}

test('MAKE something end to end on a desktop: mine, smelt a batch, forge a blade (card + item in the bag), temper it once', async () => {
  test.setTimeout(900000);
  await page.setViewportSize({ width: 560, height: 420 });           // (small: the software renderer; every window still fits)
  await page.evaluate(() => { tv.hud(true); for (const p of ['bag', 'craft', 'trainer']) document.getElementById('panel-' + p)?.querySelector('.tvp-x')?.click(); });
  await page.keyboard.press('Escape');
  await makeFlow(page, NAME, 'key');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('MAKE something end to end on the real phone layout (393 × 852), every step by touch', async ({ browser }) => {
  test.setTimeout(1200000);
  const pctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const p = await pctx.newPage(); const perr = [];
  p.on('pageerror', e => perr.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Tamsin&cls=ranger&quality=low&tod=0.5&layout=phone`);
  await p.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await p.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  expect(await p.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  await makeFlow(p, 'Tamsin', 'touch');
  expect(perr, perr.join('\n')).toEqual([]);
  await pctx.close();
});
