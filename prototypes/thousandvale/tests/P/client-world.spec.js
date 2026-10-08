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

/** Play the mini-game that is up with real key events (the same synthetic player as client-minigames.spec.js). */
const botKeys = () => page.evaluate(async () => {
  const mini = window.tvprof.mini, sleep = ms => new Promise(r => setTimeout(r, ms));
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: ' ', bubbles: true, cancelable: true }));
  for (let g = 0; g < 20000; g++) {
    const st = mini.state; if (!st.open || st.state !== 'play') break;
    const n = st.next; if (!n) { await sleep(4); continue; }
    if (st.clock < n.t - 1) { await sleep(Math.min(8, Math.max(0, n.t - st.clock - 3))); continue; }
    key('keydown', 'Space'); key('keyup', 'Space'); await sleep(2);
  }
});

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
  await page.evaluate(() => thousandvale.worldUi.closeDialog?.());
  // the journal's page
  await page.evaluate(() => thousandvale.ui.journal.showTab('professions'));
  await expect(page.locator('#panel-journal .pk-row')).toHaveCount(10);
  await shot('w9-journal.png');
  await page.keyboard.press('Escape');
});

test('copper boulders stand by the road, instanced; E starts the mini-game, the character swings a pick; the card shows the server\'s answer; the boulder is bare afterwards', async () => {
  test.setTimeout(180000);
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
  await page.waitForFunction(() => tvprof.mini.state.state === 'play', null, { timeout: 10000 });
  const type = await page.evaluate(() => tvprof.mini.state.type); expect(type).toBe('strike');
  await page.waitForTimeout(350);
  const working = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id), w = thousandvale.profView.workers.get(a.id); return { clip: a.working, anim: a.anim, tool: w?.tool, inHand: !!w?.mesh?.parent }; });
  expect(working.clip).toBe('profMine'); expect(working.tool).toBe('pick'); expect(working.inHand).toBe(true);
  await shot('w9-mining.png');
  // (a software renderer draws this scene at a few frames a second; the synthetic player needs its timers, so the view is made small while it plays)
  await page.setViewportSize({ width: 420, height: 300 }); await page.waitForTimeout(200);
  await botKeys();
  const local = await page.evaluate(() => tvprof.mini.state.result);
  await page.setViewportSize({ width: 1100, height: 680 });
  await page.waitForFunction(() => document.querySelector('.prof-card[data-q]') && !document.querySelector('.prof-wait'), null, { timeout: 10000 });
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
