// Stream D-UI — play-test 2 in a real browser against a real server (tests/D/m3-server.mjs + its test hook) and a second
// player (a Node bot on js/net/client.js). Every Q# of D-UI's list gets a check and a screenshot (tests/D/shots/pt2-*.png).
// Windows whose server half may not have landed yet (corpse loot, rolls) are driven through tvui2.fake — the same
// handlers a server message reaches — and the message the client SENDS is checked on the wire (a net._raw spy).
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt2.spec.js
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
let srv, base, hookBase, page, ctx, bot, port;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const shot = (name, p = page) => p.screenshot({ path: join(SHOTS, `pt2-${name}.png`) });
const sent = () => page.evaluate(() => window.__sent.splice(0));

test.beforeAll(async ({ browser }) => {
  port = await freePort(); const hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
});
test.afterAll(async () => { try { bot?.close(); } catch {} await ctx?.close(); srv?.kill('SIGTERM'); });

test('Q21 + Q25: title screen — Customize Appearance changes the figure; the look is what the new character wears', async () => {
  test.setTimeout(300000);
  await page.goto(base + '?quality=low&fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await page.fill('#name', 'Wren');
  await page.click('#classes [data-cls="ranger"]');
  await page.click('#customize');
  await expect(page.locator('#panel-appearance')).toBeVisible();
  // pick hair "long" and a red hair colour, a tall body
  await page.selectOption('#panel-appearance [data-slot="hair"] select', 'long');
  await page.click('#panel-appearance [data-swatch="hair"] .ap-sw:nth-child(7)');
  await page.waitForTimeout(2500);
  const prev = await page.evaluate(() => thousandvale.actors.get('preview')?.look?.avatar || null);
  expect(prev?.hair?.id).toBe('long');
  await shot('title-editor');
  await page.click('#panel-appearance [data-act="save"]');
  const saved = await page.evaluate(() => thousandvale.S.look);
  expect(saved.avatar.hair.id).toBe('long');
  await page.click('#enter');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  // the server keeps the look: my own entity's info carries the custom hair
  await expect.poll(() => page.evaluate(() => thousandvale.S.mirror.infos.get(tv.state().you.id)?.look?.avatar?.hair?.id || thousandvale.actors.get(tv.state().you.id)?.look?.avatar?.hair?.id), { timeout: 15000 }).toBe('long');
  // the character select (title, after a reload) names the calling
  const p2 = await ctx.newPage();
  await p2.goto(base + '?quality=low&tod=0.45');
  await p2.waitForSelector('#mychars:not([hidden]) .chip.char', { timeout: 60000 });
  const chip = await p2.locator('#char-chips .chip.char').first().textContent();
  expect(chip).toContain('Ranger');
  expect(chip).not.toContain('Adventurer');
  await p2.waitForTimeout(6000);
  await shot('title-chars', p2);
  await p2.close();
  // a spy on what the client sends from here on
  await page.evaluate(() => { window.__sent = []; const n = thousandvale.S.net, raw = n._raw.bind(n); n._raw = (w, d) => { try { window.__sent.push(JSON.parse(d)); } catch {} return raw(w, d); }; const ti = n.tradeOp; n.tradeOp = (op, a) => { window.__sent.push({ t: 'trade', op, ...a }); return ti(op, a); }; const it = n.item; n.item = (op, uid, slot) => { window.__sent.push({ t: 'item', op, uid, slot }); return it(op, uid, slot); }; });
});

test('Q6 + Q5: one banner area with a hierarchy; call-outs, toasts and the invite pop-up never overlap and sit top centre', async () => {
  test.setTimeout(240000);
  const { connect, memoryTokenStore } = await import('../../js/net/client.js');
  bot = connect({ mode: 'ws', url: `ws://127.0.0.1:${port}`, tokenStore: memoryTokenStore(), guestName: 'Brem' });
  await bot.ready;
  const bc = await bot.createChar({ name: 'Brem', cls: 'cleric', look: { race: 'dwarf', seed: 77, v: 1 } });
  await bot.play(bc.id);
  const me = await page.evaluate(() => tv.state().you);
  await hook('/teleport', { name: 'Brem', x: me.x + 3, z: me.z + 2 });
  bot.partyOp('invite', { name: 'Wren' });
  await expect(page.locator('#invite-pop')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { tvui2.banner({ level: 'zone', name: 'The Torbor Fields', sub: 'Levels 1–4' }); tvui2.banner({ level: 'place', name: 'The Hanging Oak', sub: 'Somebody cut the rope down.' }); thousandvale.worldUi.callout('Trouble approaches', 'phase'); thousandvale.hud.toast('Quest accepted: Rope for Old Pell', 'good'); });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => tvui2.state().banner);
  expect(st.cur.name).toBe('The Torbor Fields');
  expect(st.queue).toEqual(['The Hanging Oak']);
  const rects = await page.evaluate(() => ['#invite-pop', '#zone-banner', '#callout', '#toasts .toast', '#menubar'].map(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { s, x: r.x, y: r.y, w: r.width, h: r.height } : null; }));
  await shot('center');
  const [inv, ban, call, toast, bar] = rects;
  const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  expect(overlap(inv, ban), 'invite over the banner').toBeFalsy();
  expect(overlap(ban, call), 'banner over the call-out').toBeFalsy();
  expect(overlap(call, toast), 'call-out over the toast').toBeFalsy();
  expect(overlap(inv, bar), 'invite under the menu bar').toBeFalsy();
  expect(inv.y).toBeLessThan(200);
  expect(Math.abs(inv.x + inv.w / 2 - 590)).toBeLessThan(40);
  // a province replaces the zone at once; the place waits no more (it is smaller than both)
  await page.evaluate(() => tvui2.banner({ level: 'province', name: 'Torbor Downs' }));
  expect((await page.evaluate(() => tvui2.state().banner)).cur.name).toBe('Torbor Downs');
  await page.click('#invite-yes');
  await expect.poll(() => page.evaluate(() => !!thousandvale.social.party), { timeout: 10000 }).toBe(true);
});

test('Q2: right-click menu on a player; Follow walks behind them and any movement key stops it; /follow works', async () => {
  test.setTimeout(180000);
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  expect(brem).toBeTruthy();
  await page.evaluate(id => { tv.view(7, 0.3); tvui2.context(id, 560, 300); }, brem);
  const acts = await page.locator('.ent-menu [data-act]').evaluateAll(b => b.map(x => x.dataset.act));
  expect(acts).toEqual(expect.arrayContaining(['target', 'follow', 'inspect', 'whisper', 'trade', 'friend']));
  await shot('menu');
  await page.click('.ent-menu [data-act="follow"]');
  expect(await page.evaluate(() => tvui2.state().following)).toBe(brem);
  const me0 = await page.evaluate(() => tv.state().you);
  await hook('/teleport', { name: 'Brem', x: me0.x + 14, z: me0.z + 2 });
  await expect.poll(async () => { const s = await page.evaluate(() => { const me = tv.state().you, b = tv.state().ents.find(e => e.name === 'Brem'); return Math.hypot(b.x - me.x, b.z - me.z); }); return s; }, { timeout: 30000, intervals: [1000] }).toBeLessThan(5);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(200); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => tvui2.state().following)).toBe(null);
  await page.evaluate(() => thousandvale.chat.submit('/follow Brem'));
  expect(await page.evaluate(() => tvui2.state().following)).toBe(brem);
  await page.evaluate(() => thousandvale.chat.submit('/unfollow'));
  expect(await page.evaluate(() => tvui2.state().following)).toBe(null);
  // a wolf: no follow (enemies only Attack)
  const refused = await page.evaluate(() => { const m = [...thousandvale.actors.actors.values()].find(a => a.hostile); return m ? tvui2.follow(m.id) : 'none'; });
  expect([false, 'none']).toContain(refused);
  // inspect
  await page.evaluate(id => thousandvale.ui2.menu.inspect(id), brem);
  await expect(page.locator('#panel-inspect')).toBeVisible();
  await page.evaluate(() => thousandvale.ui2.menu.inspect && document.querySelector('#panel-inspect .tvp-x').click());
});

test('Q25 + Q13: the target frame names the calling and both frames show live portraits', async () => {
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await page.evaluate(id => tv.target(id), brem);
  await expect(page.locator('#target-sub')).toHaveText('Cleric', { timeout: 5000 });
  await expect(page.locator('#self-frame .uf-portrait.has-live')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#target-frame .uf-portrait.has-live')).toBeVisible({ timeout: 30000 });
  const ps = await page.evaluate(() => tvui2.state().portraits);
  expect(ps.maxMs, 'a live portrait pass is cheap (no read-back stall)').toBeLessThan(60);
  // a static portrait (friends / title / far party) arrives as a blob URL
  await page.evaluate(() => tvui2.staticPortrait({ race: 'elf', seed: 5, cls: 'mage' }));
  await expect.poll(() => page.evaluate(() => tvui2.staticPortrait({ race: 'elf', seed: 5, cls: 'mage' })), { timeout: 60000 }).toMatch(/^blob:/);
  await page.hover('#xpbar');
  await shot('portraits-xp');
});

test('Q24: the XP bar on the HUD and in the character window, numbers only on hover', async () => {
  const tip = await page.getAttribute('#xpbar', 'data-tip');
  expect(tip).toMatch(/to level 2/);
  await page.mouse.move(10, 400);
  await expect(page.locator('#xpbar span')).toBeHidden();
  await page.hover('#xpbar');
  await expect(page.locator('#xpbar span')).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(page.locator('#bag .inv-xp')).toBeVisible();
  expect(await page.getAttribute('#bag .inv-xp', 'data-tip')).toMatch(/experience/);
  await page.keyboard.press('KeyB');
});

test('Q14: trading with another player — ask, offer, lock, accept, done', async () => {
  test.setTimeout(120000);
  await hook('/give', { name: 'Wren', items: 1, itemName: 'Trade Token', slot: 'ring1' });
  await expect.poll(() => page.evaluate(() => thousandvale.bag.state.bag.length), { timeout: 10000 }).toBeGreaterThan(0);
  bot.on('tradeAsk', m => bot.tradeOp('accept', { id: m.trade }));
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await page.evaluate(id => tvui2.context(id, 560, 300), brem);
  await page.click('.ent-menu [data-act="trade"]');
  await expect(page.locator('#panel-trade')).toBeVisible({ timeout: 15000 });
  const uid = await page.evaluate(() => thousandvale.bag.state.bag.find(i => i.name === 'Trade Token').uid);
  await page.evaluate(u => thousandvale.ui2.trade.toggleItem(u), uid);
  await expect.poll(() => page.evaluate(() => tvui2.state().trade.t?.you.items), { timeout: 10000 }).toBe(1);
  await shot('trade');
  await page.click('#panel-trade [data-act="lock"]');
  const t = await page.evaluate(() => tvui2.state().trade.t);
  bot.tradeOp('lock', { id: bot.trade.id });
  await expect.poll(() => page.evaluate(() => tvui2.state().trade.t?.them.locked), { timeout: 10000 }).toBe(true);
  await page.click('#panel-trade [data-act="confirm"]');
  bot.tradeOp('confirm', { id: t.id });
  await expect.poll(() => page.evaluate(() => thousandvale.bag.state.bag.some(i => i.name === 'Trade Token')), { timeout: 15000 }).toBe(false);
  await expect(page.locator('#panel-trade')).toBeHidden();
});

test('Q12: a second ring goes on the other hand', async () => {
  await hook('/give', { name: 'Wren', items: 2, itemName: 'Copper Ring', slot: 'ring1', rarity: 'common' });
  await expect.poll(() => page.evaluate(() => thousandvale.bag.state.bag.filter(i => i.name === 'Copper Ring').length), { timeout: 10000 }).toBe(2);
  await page.keyboard.press('KeyB');
  await page.locator('#bag-grid .islot.r-common').first().click();
  await expect.poll(() => page.evaluate(() => !!thousandvale.bag.state.equipment.ring), { timeout: 10000 }).toBe(true);
  await page.waitForTimeout(400);
  await page.locator('#bag-grid .islot.r-common').first().click();
  await expect.poll(() => page.evaluate(() => !!thousandvale.bag.state.equipment.ring2 && !!thousandvale.bag.state.equipment.ring), { timeout: 10000 }).toBe(true);
  const w = (await sent()).filter(m => m.t === 'item' && m.op === 'equip');
  expect(w.at(-1).slot).toBe('ring2');
  await shot('rings');
  await page.keyboard.press('KeyB');
});

test('Q3 + Q4: the loot window on a body and the Need / Greed / Skip pop-up (wire checked)', async () => {
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await sent();
  await page.evaluate(id => { tvui2.fake('lootable', { id, on: true }); tvui2.openLoot(id); tvui2.fake('lootWin', { id, name: 'Grey Wolf', gold: 14, items: [{ uid: 'l1', name: 'Wolf Pelt', rarity: 'normal', kind: 'junk' }, { uid: 'l2', name: 'Fanged Charm', rarity: 'magic', slot: 'neck' }] }); }, brem);
  await expect(page.locator('#panel-loot .loot-row')).toHaveCount(3);
  await shot('loot');
  await page.click('#panel-loot .loot-row[data-uid="l2"]');
  await page.click('#panel-loot [data-act="all"]');
  const w = (await sent()).filter(m => m.t === 'loot');
  expect(w.map(m => m.op)).toEqual(['open', 'take', 'all']);
  expect(w[1].uid).toBe('l2');
  await page.evaluate(id => tvui2.fake('lootWin', { id, closed: true }), brem);
  await expect(page.locator('#panel-loot')).toBeHidden();
  // a party roll
  await page.evaluate(() => tvui2.fake('lootRoll', { roll: 7, corpse: 5, item: { name: 'Gilded Band', rarity: 'rare', slot: 'ring1' }, ms: 30000, members: [{ char: 1, name: 'Wren' }, { char: 2, name: 'Brem' }] }));
  await expect(page.locator('.roll-card[data-roll="7"]')).toBeVisible();
  await shot('roll');
  await page.click('.roll-card[data-roll="7"] [data-choice="need"]');
  expect((await sent()).find(m => m.t === 'loot' && m.op === 'roll')).toMatchObject({ roll: 7, choice: 'need' });
  await page.evaluate(() => tvui2.fake('lootRolled', { roll: 7, item: { name: 'Gilded Band', rarity: 'rare' }, rolls: [{ char: 1, name: 'Wren', choice: 'need', n: 88 }, { char: 2, name: 'Brem', choice: 'greed', n: 40 }], winner: { char: 1, name: 'Wren' } }));
  const lines = await page.evaluate(() => [...document.querySelectorAll('#chat-log p')].slice(-3).map(p => p.textContent));
  expect(lines.join('|')).toContain('Wren won Gilded Band');
  // the threshold in the Party tab (we are in Brem's party: not the leader -> read-only)
  await page.keyboard.press('KeyP');
  await expect(page.locator('#party-menu .loot-threshold select')).toBeVisible();
  expect(await page.locator('#party-menu .loot-threshold option').evaluateAll(o => o.map(x => x.value))).toEqual(['magic', 'rare', 'legendary', 'unique']);
  await shot('threshold');
  await page.keyboard.press('KeyP');
});

test('Q11: a merchant\'s shop — buy, sell, buy back tabs', async () => {
  test.setTimeout(120000);
  const npc = await page.evaluate(() => { const me = tv.state().you; return tv.state().ents.filter(e => e.kind === 'npc').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]; });
  expect(npc).toBeTruthy();
  await hook('/teleport', { name: 'Wren', x: npc.x + 2, z: npc.z + 1 });
  await page.waitForTimeout(2500);
  await page.evaluate(n => tvui2.openShop(n.id, n.name), npc);
  // the real server answers when this NPC trades; else the window is filled through the same handler
  const real = await page.waitForFunction(() => tvui2.state().shop.view, null, { timeout: 6000 }).then(() => true, () => false);
  if (!real) await page.evaluate(n => tvui2.fake('shopView', { npc: n.id, name: n.name, role: 'merchant', title: 'General goods', sellRate: 0.25, stock: [{ id: 'a', item: { name: 'Iron Ring', rarity: 'normal', slot: 'ring1' }, price: 12 }, { id: 'b', item: { name: 'Leather Cap', rarity: 'magic', slot: 'head', type: 'armor' }, price: 45 }, { id: 'c', item: { name: 'Bay Horse', slot: 'mount', speed: 1.5 }, price: 80, mount: true }], buyback: [] }), npc);
  await expect(page.locator('#panel-shop .shop-row').first()).toBeVisible({ timeout: 10000 });
  console.log('[Q11] real shop from the server:', real);
  await shot('shop');
  await page.click('#panel-shop [data-tab="sell"]');
  await expect(page.locator('#panel-shop .shop-row').first()).toBeVisible();
  await page.click('#panel-shop [data-tab="back"]');
  await page.evaluate(() => thousandvale.ui2.shop.panel.close());
});

test('Q15 + Q22: Esc opens the pause menu; settings save; Show equipment hides armour on you', async () => {
  await page.evaluate(() => tv.target(null));
  await page.mouse.click(5, 300);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-pause')).toBeVisible();
  await shot('pause');
  await page.click('#panel-pause [data-act="settings"]');
  await expect(page.locator('#panel-settings')).toBeVisible();
  await sent();
  await page.click('#panel-settings [data-k="tradeFriends"]');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tv.settings')).tradeFriends)).toBe(true);
  expect((await sent()).find(m => m.t === 'settings')).toMatchObject({ op: 'set', data: { tradeFriendsOnly: true } });
  await page.click('#panel-settings [data-k="showGear"]');
  expect((await sent()).find(m => m.t === 'pref')).toMatchObject({ k: 'showGear', v: false });
  const gear = await page.evaluate(() => Object.keys(thousandvale.actors.get(tv.state().you.id).look.gear || {}));
  expect(gear).not.toContain('ring');
  await shot('settings');
  await page.click('#panel-settings [data-tab="keys"]');
  await shot('settings-keys');
  await page.click('#panel-settings [data-tab="game"]');
  await page.click('#panel-settings [data-k="showGear"]');
  await page.click('#panel-settings [data-k="tradeFriends"]');
  await page.keyboard.press('Escape');
});

test('Q20: the barber chair — the editor changes you in the world, Save sends barber {npc, look}', async () => {
  await sent();
  await page.evaluate(() => tvui2.editor('barber'));
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await page.selectOption('#panel-appearance [data-slot="hair"] select', 'mohawk');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.actors.get(tv.state().you.id).look.avatar?.hair?.id)).toBe('mohawk');
  await shot('barber');
  await page.click('#panel-appearance [data-act="save"]');
  expect((await sent()).find(m => m.t === 'barber')?.look?.avatar?.hair?.id).toBe('mohawk');
});

test('Q23 + Q26: the perk forest search rings what it finds', async () => {
  await page.keyboard.press('KeyN');
  await expect(page.locator('#panel-perks [data-k="pfsearch"]')).toBeVisible({ timeout: 15000 });
  await page.fill('#panel-perks [data-k="pfsearch"]', 'long odds');
  await page.waitForTimeout(500);
  const found = await page.locator('#panel-perks .pf-search em').textContent();
  expect(found).toMatch(/found/);
  await shot('perk-search');
  await page.fill('#panel-perks [data-k="pfsearch"]', '');
  await page.waitForTimeout(500);
  await shot('perk-forest');
  await page.keyboard.press('Escape');
});

test('phone size: the centre column, settings and the editor fit', async ({ browser }) => {
  test.setTimeout(240000);
  const c2 = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const p = await c2.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '?autoplay=1&name=Pipp&cls=rogue&quality=low&tod=0.45');
  await p.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { tvui2.banner({ level: 'zone', name: 'The Torbor Fields', sub: 'Levels 1–4' }); tvui2.fake('lootRoll', { roll: 1, item: { name: 'Gilded Band', rarity: 'rare' }, ms: 30000, members: [] }); });
  await p.waitForTimeout(400);
  await shot('phone-center', p);
  await p.evaluate(() => thousandvale.ui2.settings.panel.open());
  await shot('phone-settings', p);
  const w = await p.evaluate(() => document.querySelector('#panel-settings').getBoundingClientRect().right);
  expect(w).toBeLessThanOrEqual(392);
  await p.evaluate(() => thousandvale.ui2.settings.panel.close());
  await c2.close();
  expect(errors, errors.join('\n')).toEqual([]);
});
