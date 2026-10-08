// Stream D-UI — play-test 8 in a real browser against a real server (tests/D/m3-server.mjs): the loot keys (W8), one badge
// per thing (W10), no minimap tooltip (W16), My reports + Completed (W29 / W28), hiding an event (W13), the map's memory,
// filter and search (W15), quest zones (W17), quest marks (W12), the damage meter (W21), the ox-cart window (W5), backpacks
// (W19), no Light slot (W22), icon = worn model (W25) — on a desktop and on a 393 x 852 phone. Shots: tests/D/shots/pt8-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt8.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base;
const fails = [];
const soft = (name, fn) => test(name, async ({ browser }) => { test.setTimeout(420000); try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 60)} :: ${String(e.message).slice(0, 900)}`); console.log('[pt8 FAIL]', name.slice(0, 60), '\n', String(e.message).slice(0, 900)); } });

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

const MINE = { ok: true, more: false, list: [
  { id: 45, at: Date.now() - 5400000, kind: 'bug', state: 'completed', text: 'Smugglers\' Stash: I killed the bandits before the rats and could not open the chest. Then it said Won and the chest vanished.', note: 'Fixed. An event chest is locked only by its own keepers and stays for two minutes after it opens.', noteAt: Date.now() - 600000 },
  { id: 42, at: Date.now() - 7200000, kind: 'suggestion', state: 'approved', text: 'Add DPS meters, off by default.', note: 'Coming in the next update.', noteAt: Date.now() - 3600000 },
  { id: 37, at: Date.now() - 9000000, kind: 'bug', state: 'new', text: 'The minimap tooltip covers the pin tooltips.' },
  { id: 31, at: Date.now() - 86400000, kind: 'suggestion', state: 'closed', text: 'Let me fly.' }] };
const CART = { id: 1, from: 'Torborhold', name: 'The Longroad Carters', gold: 38, tokens: 0, stops: [
  { id: 'cart_mawehaven', name: 'Mawehaven', fare: 7, m: 1850, s: 5 }, { id: 'cart_orrinsford', name: 'Orrinsford', fare: 10, m: 2700, s: 6 }, { id: 'cart_copperdell', name: 'Copperdell', fare: 20, m: 5400, s: 9 },
  { id: 'cart_saltmouth', name: 'Saltmouth', fare: 54, m: 13900, s: 14 }, { id: 'cart_gorsehold', name: 'Gorsehold', fare: 26, m: 6800, s: 10, locked: true, why: 'level', msg: 'The carter will not take that road with you until you are level 8.' }] };
const LOOT = { id: 987654, chest: true, name: 'A weathered chest', gold: 14, items: [
  { uid: 'l1', name: 'Stalker Pelt', rarity: 'normal', kind: 'junk', value: 6 }, { uid: 'l2', name: 'Fanged Charm', rarity: 'magic', slot: 'neck', ilvl: 3, levelReq: 1 }, { uid: 'l3', name: 'Gilded Band', rarity: 'rare', slot: 'ring', ilvl: 3, levelReq: 1 }] };
const PACK = { uid: 'pk1', name: 'Trail Rucksack', baseKey: 'trail_rucksack', slot: 'back', type: 'armor', rarity: 'magic', pack: true, bagSlots: 6, bagText: '+6 bag slots', levelReq: 1, ilvl: 2, look: { g5: 'g5_pack_rucksack' }, g5: 'g5_pack_rucksack', value: 40 };
const HELM = { uid: 'wh1', name: 'War Helm', baseKey: 'war_helm', slot: 'head', type: 'armor', tier: 'heavy', rarity: 'normal', armor: 9, levelReq: 1, ilvl: 3 };

/** Everything the page sends, as JSON (the messages still go to the server). */
const tapSends = page => page.evaluate(() => { window.__sent = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { if (typeof d === 'string') window.__sent.push(JSON.parse(d)); } catch { /* binary input frames */ } return o.call(this, d); }; });
const sent = (page, t) => page.evaluate(tt => window.__sent.filter(m => m.t === tt), t);
async function enter(browser, opts, name) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=warrior&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.tvui8, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  await tapSends(page);
  return { ctx, page, errors };
}

soft('desktop: loot keys, badges, minimap, reports, hidden events, the map, the meter, the cart, backpacks, icons', async ({ browser }) => {
  const { ctx, page, errors } = await enter(browser, { viewport: { width: 1366, height: 800 } }, 'Eightha');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt8-${n}.png`) });

  // ---- W16: the minimap canvas has no tooltip of its own
  expect(await page.evaluate(() => { const c = document.querySelector('.mm-canvas'); return (c.dataset.tip || '') + (c.title || ''); })).toBe('');

  // ---- W10: mail = the yellow dot on the Party button, no number
  await page.evaluate(() => tv.fake('mailNew', { unread: 1 }));
  await page.waitForTimeout(200);
  const badge = await page.evaluate(() => { const b = document.getElementById('party-btn'); return { n: b.querySelector('b').textContent, dot: b.classList.contains('alert'), after: getComputedStyle(b, '::after').width }; });
  expect(badge.n, 'no red number for mail').toBe(''); expect(badge.dot).toBe(true); expect(badge.after).toBe('8px');
  await page.locator('#menubar').screenshot({ path: join(SHOTS, 'pt8-w10-menubar.png') });
  await page.evaluate(() => tv.fake('mailNew', { unread: 0 }));

  // ---- W8: the loot window — arrows / hover select, E takes the selected row, F takes all
  await page.evaluate(m => tv.fake('lootWin', m), LOOT);
  await expect(page.locator('#panel-loot .loot-row')).toHaveCount(4);
  await expect(page.locator('#panel-loot .loot-row.sel')).toHaveCount(1);
  expect(await page.evaluate(() => tvui2.state().loot.selUid)).toBe('gold');
  expect(await page.locator('#panel-loot .loot-row.sel kbd').textContent()).toBe('E');
  expect(await page.locator('#panel-loot [data-act="all"] kbd').textContent()).toBe('F');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => tvui2.state().loot.selUid)).toBe('l2');
  await page.locator('#panel-loot .loot-row').nth(3).hover();
  expect(await page.evaluate(() => tvui2.state().loot.selUid), 'pointing at a row selects it').toBe('l3');
  await shot('w8-loot');
  await page.mouse.move(700, 700);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  let loot = await sent(page, 'loot');
  expect(loot.filter(m => m.op === 'take').map(m => m.uid), 'E took the selected row and nothing else').toEqual(['l3']);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(150);
  loot = await sent(page, 'loot');
  expect(loot.some(m => m.op === 'all'), 'F took everything').toBe(true);
  expect((await sent(page, 'cast')).length, 'F did not swing a weapon while the window was open').toBe(0);
  await page.evaluate(() => thousandvale.ui2.loot.panel.close());

  // ---- W29: My reports (a signed-in account), Reply starts "#<id> "
  await page.evaluate(() => { thousandvale.S.net.claimed = true; tvui5.feedback('mine'); });
  await page.evaluate(m => tv.fake('feedbackMine', m), MINE);
  await expect(page.locator('#panel-feedback .my-row')).toHaveCount(4);
  await expect(page.locator('#panel-feedback .my-row.completed .my-note')).toContainText('how it was fixed');
  await expect(page.locator('#panel-feedback .my-row.completed .my-note')).toContainText('stays for two minutes');
  await expect(page.locator('#panel-feedback .my-row').nth(3).locator('.rp-state')).toHaveText('Closed');
  expect((await sent(page, 'feedbackMine')).length + (await sent(page, 'feedback')).filter(m => m.op === 'mine').length, 'the tab asked the server').toBeGreaterThan(0);
  await shot('w29-my-reports');
  await page.locator('#panel-feedback .my-row.completed [data-act="reply"]').click();
  await expect(page.locator('#panel-feedback textarea')).toHaveValue('#45 ');
  expect(await page.evaluate(() => tvui5.state().feedback.kind), 'a reply to a bug is a bug report').toBe('bug');
  await page.locator('#panel-feedback textarea').type('It happened again at the toll strongbox.');
  await page.locator('#panel-feedback [data-act="send"]').click();
  await page.waitForTimeout(200);
  const fb = (await sent(page, 'feedback')).filter(m => m.text);
  expect(fb.length).toBe(1); expect(fb[0].text.startsWith('#45 ')).toBe(true); expect(fb[0].ref, 'the reply names the report it answers').toBe(45);
  await page.evaluate(() => thousandvale.ui5.feedback.panel.close());

  // ---- W28: the admin sets Completed, with a note
  await page.evaluate(() => { thousandvale.S.net.admin = true; tvui5.reports(); tv.fake('adminReports', { list: [{ id: 45, kind: 'bug', state: 'approved', text: 'Smugglers\' Stash chest vanished.', at: Date.now() - 60000, name: 'xanaver', level: 3 }], counts: { approved: 1 } }); });
  await page.locator('#panel-reports select[data-f="state"]').selectOption('');
  await page.locator('#panel-reports .rp-row').first().click();
  await page.locator('#panel-reports [data-set="completed"]').click();
  await expect(page.locator('#panel-reports .rp-detail .note')).toContainText('how was it fixed');
  expect((await sent(page, 'admin')).filter(m => m.op === 'report').length, 'nothing sent without a note').toBe(0);
  await page.locator('#panel-reports .rp-note').fill('The chest now waits two minutes and only its own keepers lock it.');
  await shot('w28-admin-completed');
  await page.locator('#panel-reports [data-set="completed"]').click();
  await page.waitForTimeout(150);
  const adm = (await sent(page, 'admin')).filter(m => m.op === 'report');
  expect(adm[0]).toMatchObject({ id: 45, state: 'completed', note: 'The chest now waits two minutes and only its own keepers lock it.' });
  expect(await page.locator('#panel-reports select[data-f="state"] option').allTextContents()).toContain('Completed');
  await page.evaluate(() => thousandvale.ui5.feedback.reports.panel.close());

  // ---- W13: hide an event from the tracker; one line brings it back
  const me = await page.evaluate(() => { const p = thousandvale.S.predictor.pos; return { x: p.x, z: p.z, id: tv.state().you.id }; });
  const EV = { uid: 'e78', id: 'stone_snow', name: 'The Stone in the Snow', kind: 'zone', state: 'live', what: 'Something under the snow is waking.', objective: { text: 'Break the stone', n: 1, of: 3, kind: 'stages' }, leftMs: 540000, endsAt: Date.now() + 540000, rewardText: 'A rare item', inside: false, inRange: false, players: 2, x: me.x + 410, z: me.z - 120, r: 30, level: 3 };
  await page.evaluate(e => { tv.fake('eventTrack', e); tv.fake('zoneEvent', { kind: 'start', ev: { uid: e.uid, id: e.id, name: e.name, x: e.x, z: e.z, r: e.r } }); }, EV);
  await expect(page.locator('.et-card')).toHaveCount(1);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => thousandvale.ui.atlas.markers().filter(m => m.kind === 'liveevent' && !m.hiddenEv).length)).toBeGreaterThan(0);
  await shot('w13-event-card');
  await page.locator('.et-card .et-hide').click();
  await expect(page.locator('.et-card')).toHaveCount(0);
  await expect(page.locator('.et-hidden')).toBeVisible();
  await expect(page.locator('.et-hidden')).toContainText('1 event hidden');
  expect(await page.evaluate(() => thousandvale.ui.atlas.markers().filter(m => m.kind === 'liveevent').every(m => m.hiddenEv)), 'the map greys it, the minimap drops it').toBe(true);
  await page.evaluate(e => tv.fake('eventTrack', e), EV);       // the server keeps talking about it: it stays hidden
  await page.waitForTimeout(700);
  await expect(page.locator('.et-card')).toHaveCount(0);
  expect(await page.evaluate(() => tvui.state?.().minimap?.markers?.some(m => m.kind === 'liveevent') ?? thousandvale.ui.minimap.state.markers.some(m => m.kind === 'liveevent'))).toBe(false);
  await shot('w13-event-hidden');

  // ---- the map: W13's list, W15 memory + filter + search, W17 quest zones, W12 marks
  await page.keyboard.press('KeyM');
  await expect(page.locator('#panel-map canvas')).toBeVisible();
  await page.waitForFunction(() => thousandvale.ui.worldMap.find.state.loaded, null, { timeout: 60000 });
  await expect(page.locator('#panel-map .map-ev.hid [data-act="unhide"]')).toBeVisible();
  await shot('w13-map-events');
  await page.locator('#panel-map .map-ev [data-act="unhide"]').click();
  await page.keyboard.press('KeyM');
  await expect(page.locator('.et-card')).toHaveCount(1);
  await expect(page.locator('.et-hidden')).toBeHidden();
  // W15: remembered view
  await page.keyboard.press('KeyM');
  await page.evaluate(() => { const W = thousandvale.ui.worldMap; W.fitPreset('province'); W.zoomBy(1.7); });
  const v1 = await page.evaluate(() => { const s = thousandvale.ui.worldMap.state; return { cx: s.cx, cz: s.cz, scale: s.scale }; });
  await page.keyboard.press('KeyM'); await page.waitForTimeout(150); await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
  const v2 = await page.evaluate(() => { const s = thousandvale.ui.worldMap.state; return { cx: s.cx, cz: s.cz, scale: s.scale }; });
  expect(Math.abs(v2.cx - v1.cx) + Math.abs(v2.cz - v1.cz), 'the map opened where it was left').toBeLessThan(2);
  expect(Math.abs(v2.scale - v1.scale)).toBeLessThan(1e-6);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tv.map.view')).scale)).toBeCloseTo(v1.scale, 3);
  // W15: the filter rings the towns with a stable
  await page.evaluate(() => thousandvale.ui.worldMap.fitPreset('province'));
  await page.locator('#panel-map .map-find select').selectOption('stablehand');
  await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => { const s = thousandvale.ui.worldMap.state; return { towns: s.find.towns.length, rings: s.markers.filter(m => m.kind === 'townhl').length, pins: s.markers.filter(m => m.kind === 'service').length, first: s.find.towns[0]?.town }; });
  expect(f1.towns, 'towns with a stable').toBeGreaterThan(10); expect(f1.rings).toBe(f1.towns); expect(f1.pins).toBe(0);
  expect(f1.first, 'nearest first: you are standing in Torborhold').toBe('Torborhold');
  await expect(page.locator('#panel-map .map-found')).toContainText('Stable');
  await shot('w15-map-stables-province');
  await page.locator('#panel-map .map-foundlist button').first().click();
  await page.waitForTimeout(500);
  const f2 = await page.evaluate(() => { const s = thousandvale.ui.worldMap.state; return { scale: s.scale, pins: s.markers.filter(m => m.kind === 'service').length, card: thousandvale.ui.worldMap.cardText(s.markers.find(m => m.kind === 'service')?.id) }; });
  expect(f2.pins, 'zoomed in: a pin at the door').toBeGreaterThan(0); expect(f2.card).toMatch(/Stable/);
  await shot('w15-map-stables-town');
  // the search box
  await page.locator('#panel-map .map-find select').selectOption('');
  await page.locator('#panel-map .map-find input').fill('angler');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => thousandvale.ui.worldMap.state.find.matches), '"angler" finds anglers').toBeGreaterThan(3);
  await page.locator('#panel-map .map-find input').fill('zzzz');
  await expect(page.locator('#panel-map .map-found')).toContainText('Nothing found');
  await page.locator('#panel-map .map-find [data-find="clear"]').click();
  await expect(page.locator('#panel-map .map-found')).toHaveCount(0);
  // W17: a quest zone answers the pointer and lights up
  await page.evaluate(p => { const A = thousandvale.ui.atlas, prev = A.extraMarkers; A.extraMarkers = () => (prev ? prev() : []).concat([{ id: 'qa:testq:0', kind: 'quest', area: true, quest: 'testq', x: p.x + 90, z: p.z + 40, r: 60, name: 'Where they live', sub: '~6 cairn rats · level 1–2', priority: 2, size: 5, act: 'track' }]);
    A.quests.push({ id: 'testq', name: 'Two Good Legs', goal: 'Kill cairn rats — 2/6', steps: [], step: 0 }); thousandvale.ui.worldMap.setView({ cx: p.x + 60, cz: p.z + 30, scale: 1.4 }); }, me);
  await page.waitForTimeout(400);
  const zoneText = await page.evaluate(p => thousandvale.ui.worldMap.hoverAt(p.x + 110, p.z + 60), me);
  expect(zoneText).toContain('Two Good Legs'); expect(zoneText).toContain('Kill cairn rats — 2/6'); expect(zoneText).toContain('cairn rats · level');
  expect(await page.evaluate(() => thousandvale.ui.worldMap.state.hot)).toBe('qa:testq:0');
  await page.waitForTimeout(300);
  await shot('w17-map-quest-zone');
  // W12: a mark over an NPC in sight
  const npc = await page.evaluate(() => { for (const a of thousandvale.actors.actors.values()) if (a.kind === 'npc' && !a.pet) return { id: a.id, name: a.name, x: a.pos.x, z: a.pos.z }; return null; });
  if (npc) {
    await page.evaluate(n => tvui8.marks({ full: true, marks: { [n.id]: 'offer' } }), npc);
    const mk = await page.evaluate(() => thousandvale.ui.atlas.markers().filter(m => m.kind === 'npcmark'));
    expect(mk.length).toBe(1); expect(mk[0].glyph).toBe('!'); expect(mk[0].name).toBe(npc.name);
    await page.evaluate(n => thousandvale.ui.worldMap.setView({ cx: n.x, cz: n.z, scale: 2.2 }), npc);
    await page.waitForTimeout(400);
    await shot('w12-map-mark');
  } else console.log('[pt8] no NPC in sight: W12 on the map not shot');
  await page.keyboard.press('KeyM');
  // the minimap: the zone's card, and no other tooltip
  await page.evaluate(() => thousandvale.ui.minimap.setZoom(2));
  await page.waitForTimeout(400);
  const mmText = await page.evaluate(p => thousandvale.ui.minimap.hoverAt(p.x + 80, p.z + 40), me);
  expect(mmText).toContain('Two Good Legs'); expect(mmText).toContain('2/6');
  await page.waitForTimeout(250);
  await page.locator('.minimap').screenshot({ path: join(SHOTS, 'pt8-w17-minimap-zone.png') });
  expect(await page.locator('.tv-tip:visible, .tipbox.shared:visible').count(), 'no second tooltip over the minimap').toBe(0);
  await page.mouse.move(600, 600);

  // ---- W21: the damage meter — off by default, on from Settings
  expect(await page.evaluate(() => thousandvale.ui2.settings.get('meter'))).toBe(false);
  expect(await page.evaluate(() => tvui8.state().meter.open)).toBe(false);
  await page.evaluate(() => thousandvale.ui2.settings.panel.open());
  await page.locator('#panel-settings input[data-k="meter"]').check();
  await expect(page.locator('#panel-meter')).toBeVisible();
  await shot('w21-settings');
  await page.evaluate(() => thousandvale.ui2.settings.panel.close());
  expect((await sent(page, 'meter')).some(m => m.on === true), 'the server was asked for the feed').toBe(true);
  const n = await page.evaluate(id => tvui8.hits([[id, 4396, 182, 0, 'basic', 'physical', 0, 0], [id, 4396, 344, 2, 'cleave', 'physical', 0, 0], [4396, id, 96, 0, 'basic', 'physical', 0, 0], [id, 4396, 61, 32, 'dot', 'fire', 0, 0], [id, 4396, 371, 10, 'cleave', 'physical', 55, 0], [777, 778, 500, 0, 'basic']]), me.id);
  expect(n, 'a hit between two strangers is not ours').toBe(5);
  await page.evaluate(() => thousandvale.ui8.meter.panel.open());
  await expect(page.locator('#panel-meter .meter-row')).toHaveCount(1);
  await expect(page.locator('#panel-meter .meter-row')).toContainText('Eightha');
  await expect(page.locator('#panel-meter .meter-row')).toContainText('958');
  await shot('w21-meter');
  await page.locator('#panel-meter .meter-row').click();
  await expect(page.locator('#panel-meter .meter-row')).toHaveCount(3);
  await expect(page.locator('#panel-meter .meter-list')).toContainText('Burning');
  await shot('w21-meter-sources');
  await page.locator('#panel-meter [data-act="off"]').click();
  await expect(page.locator('#panel-meter')).toBeHidden();
  expect(await page.evaluate(() => thousandvale.ui2.settings.get('meter'))).toBe(false);

  // ---- W5: the ox-cart window
  await page.evaluate(m => tvui8.cart(m), CART);
  await expect(page.locator('#panel-cart .cart-row')).toHaveCount(5);
  await expect(page.locator('#panel-cart .cart-row').first()).toContainText('Mawehaven');
  await expect(page.locator('#panel-cart .cart-row').first()).toContainText('7 gold');
  await expect(page.locator('#panel-cart .cart-row.locked').filter({ hasText: 'Gorsehold' })).toContainText('until you are level 8');
  await expect(page.locator('#panel-cart .cart-row.locked').filter({ hasText: 'Saltmouth' })).toContainText('You need 16 more gold');
  await page.locator('#panel-cart .cart-row').nth(1).locator('[data-act="pick"]').click();
  await expect(page.locator('#panel-cart .cart-row.picked [data-act="go"]')).toHaveText('Pay 10 and ride');
  await shot('w5-cart');
  expect((await sent(page, 'cart')).length, 'nothing is paid before the second press').toBe(0);
  await page.locator('#panel-cart .cart-row.picked [data-act="go"]').click();
  await page.waitForTimeout(200);
  expect((await sent(page, 'cart'))[0]).toMatchObject({ op: 'go', to: 'cart_orrinsford' });
  await page.evaluate(() => tv.fake('cartR', { op: 'go', ok: false, why: 'fight', msg: 'Not while you are fighting.' }));
  await expect(page.locator('#panel-cart .note')).toHaveText('Not while you are fighting.');
  await page.evaluate(() => thousandvale.ui8.cart.panel.close());

  // ---- W19 / W22 / W25: the bag
  await page.evaluate(([pack, helm]) => { const eq = { ...thousandvale.bag.state.equipment, back: pack }; tv.fake('equip', { equipment: eq }); tv.fake('you', { bagMax: 46 }); tv.fake('bag', { add: [helm] }); thousandvale.bag.toggle(true); }, [PACK, HELM]);
  await expect(page.locator('#bag [data-slot="light"]')).toHaveCount(0);
  await expect(page.locator('#inv-count')).toContainText('/ 46');
  expect(await page.locator('#bag-grid .islot').count(), 'the grid is the whole bag: 46 squares').toBe(46);
  await page.locator('#bag [data-slot="back"]').hover();
  await expect(page.locator('.itemtip')).toContainText('+6 bag slots');
  // the icon of the War Helm is the helm the body wears
  await page.waitForFunction(() => !!document.querySelector('#bag-grid .islot[data-tip-item="wh1"] img'), null, { timeout: 90000 });
  const spec = await page.evaluate(h => { const s = thousandvale.bag.iconSpec(h); return { kind: s.kind, id: s.id, key: s.key }; }, HELM);
  const wornId = await page.evaluate(async h => { const g = await import('./js/client/gear-look.js'), l = await import('./js/client/looks.js'); return g.gearLook({ head: h }, l.gearOpts('warrior')).hat.id; }, HELM);
  expect(spec.kind).toBe('worn'); expect(spec.id, 'icon part = worn part').toBe(wornId);
  await page.evaluate(h => { const S = thousandvale.S, a = thousandvale.actors.get(S.selfId); thousandvale.actors.setLook(S.selfId, { ...(a.look || {}), gear: { ...(a.look?.gear || {}), head: h } }); }, HELM);
  await page.waitForTimeout(2500);
  await shot('w19-w25-bag');
  await page.locator('#bag-grid .islot[data-tip-item="wh1"]').screenshot({ path: join(SHOTS, 'pt8-w25-helm-icon.png') });
  // W19: the pack will not come off while its squares are in use
  await page.evaluate(() => { const add = []; for (let i = 0; i < 41; i++) add.push({ uid: 'junk' + i, name: 'River Stone', kind: 'junk', rarity: 'normal', value: 1 }); tv.fake('bag', { add }); });
  await page.locator('#bag [data-slot="back"]').click();
  await expect(page.locator('#toasts')).toContainText('Empty');
  await expect(page.locator('#toasts')).toContainText("pack's extra room");
  expect((await sent(page, 'item')).filter(m => m.op === 'unequip').length, 'the client did not even ask').toBe(0);
  await shot('w19-pack-refused');
  await page.evaluate(() => thousandvale.bag.toggle(false));
  await page.evaluate(() => { thousandvale.controls.cam.dist = 4; thousandvale.controls.cam.distWant = 4; thousandvale.controls.cam.yaw += Math.PI; });
  await page.waitForTimeout(1500);
  await shot('w25-helm-on-body');

  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});

soft('phone 393 x 852: every new window fits the screen and its controls are thumb-sized', async ({ browser }) => {
  const { ctx, page, errors } = await enter(browser, { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, 'Eightphone');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt8-phone-${n}.png`) });
  const fits = async sel => { const r = await page.locator(sel).boundingBox(); expect(r, sel + ' is on screen').toBeTruthy(); expect(r.x, sel + ' left').toBeGreaterThanOrEqual(-1); expect(r.x + r.width, sel + ' right').toBeLessThanOrEqual(394); return r; };
  const tall = async sel => { for (const b of await page.locator(sel).all()) { if (!(await b.isVisible())) continue; const r = await b.boundingBox(); expect(r.height, `${sel} is ${Math.round(r.height)} px tall`).toBeGreaterThanOrEqual(40); } };
  const phone = await page.evaluate(() => document.documentElement.dataset.layout === 'phone');
  console.log('[pt8] phone layout on:', phone);

  await page.evaluate(m => tv.fake('lootWin', m), LOOT);
  await expect(page.locator('#panel-loot .loot-row')).toHaveCount(4);
  await fits('#panel-loot');
  if (phone) { expect(await page.locator('#panel-loot .loot-row.sel kbd').isVisible(), 'no key hint on a phone').toBe(false); await tall('#panel-loot .loot-row'); }
  await shot('w8-loot');
  await page.locator('#panel-loot [data-act="all"]').tap();
  await page.waitForTimeout(150);
  expect((await sent(page, 'loot')).some(m => m.op === 'all'), 'Take all by thumb').toBe(true);
  await page.evaluate(() => thousandvale.ui2.loot.panel.close());

  await page.evaluate(() => { thousandvale.S.net.claimed = true; tvui5.feedback('mine'); });
  await page.evaluate(m => tv.fake('feedbackMine', m), MINE);
  await expect(page.locator('#panel-feedback .my-row')).toHaveCount(4);
  await fits('#panel-feedback');
  if (phone) await tall('#panel-feedback .my-row [data-act="reply"]');
  await shot('w29-my-reports');
  await page.locator('#panel-feedback .my-row [data-act="reply"]').first().tap();
  await expect(page.locator('#panel-feedback textarea')).toHaveValue('#45 ');
  await page.evaluate(() => thousandvale.ui5.feedback.panel.close());

  await page.evaluate(m => tvui8.cart(m), CART);
  await expect(page.locator('#panel-cart .cart-row')).toHaveCount(5);
  await fits('#panel-cart');
  await page.locator('#panel-cart .cart-row').first().locator('[data-act="pick"]').tap();
  await expect(page.locator('#panel-cart .cart-row.picked [data-act="go"]')).toBeVisible();
  if (phone) await tall('#panel-cart .cart-row button');
  await fits('#panel-cart .cart-row.picked [data-act="go"]');
  await shot('w5-cart');
  await page.evaluate(() => thousandvale.ui8.cart.panel.close());

  const id = await page.evaluate(() => tv.state().you.id);
  await page.evaluate(i => { tvui8.meter(true); tvui8.hits([[i, 4396, 182, 0, 'basic', 'physical', 0, 0], [i, 4396, 344, 2, 'cleave', 'physical', 0, 0], [4396, i, 96, 0, 'basic', 'physical', 0, 0]]); thousandvale.ui8.meter.panel.open(); }, id);
  await expect(page.locator('#panel-meter .meter-row')).toHaveCount(1);
  await fits('#panel-meter');
  if (phone) await tall('#panel-meter .meter-row');
  await shot('w21-meter');
  await page.evaluate(() => { tvui8.meter(false); });

  await page.evaluate(() => thousandvale.ui.worldMap.panel.open());
  await page.waitForFunction(() => thousandvale.ui.worldMap.find.state.loaded, null, { timeout: 60000 });
  await page.evaluate(() => { const W = thousandvale.ui.worldMap; W.fitPreset('province'); W.find.set({ role: 'stablehand' }); });
  await page.waitForTimeout(700);
  await fits('#panel-map');
  expect(await page.evaluate(() => thousandvale.ui.worldMap.state.markers.filter(m => m.kind === 'townhl').length)).toBeGreaterThan(10);
  expect(await page.evaluate(() => { const b = document.querySelector('#panel-map .map-find'); b.scrollIntoView({ inline: 'center', block: 'nearest' }); const r = b.getBoundingClientRect(); return r.width > 100 && r.height >= 30; })).toBe(true);
  await shot('w15-map-find');
  await page.evaluate(() => thousandvale.ui.worldMap.panel.close());

  await page.evaluate(([pack, helm]) => { tv.fake('equip', { equipment: { ...thousandvale.bag.state.equipment, back: pack } }); tv.fake('you', { bagMax: 46 }); tv.fake('bag', { add: [helm] }); thousandvale.bag.toggle(true); }, [PACK, HELM]);
  await expect(page.locator('#bag [data-slot="light"]')).toHaveCount(0);
  await page.waitForTimeout(2500);
  await shot('w19-bag');
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});

test('play-test 8: every check above passed', () => { expect(fails, fails.join('\n\n')).toEqual([]); });
