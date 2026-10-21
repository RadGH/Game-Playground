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

test('R1 + Q21 + Q25: new character = name/people/calling, then the editor in starting clothes (class gear toggle); the front page lists characters', async () => {
  test.setTimeout(300000);
  await page.goto(base + '?quality=low&fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await page.click('#new-char');      // play-test 10 (Y29): the title opens on the front card — "Create character" first
  await page.fill('#name', 'Wren');
  await page.click('#calling-open'); await page.click('#classes [data-cls="ranger"]'); await page.click('#calling-done');      // feedback #98: the calling picker
  await page.click('#enter');                       // step 1 -> step 2 (R1)
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => thousandvale.actors.get('preview')?.look?.gear), 'starting clothes while customising').toEqual({});
  await shot('r1-step2-bare');
  await page.click('#panel-appearance [data-k="classGear"]');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.actors.get('preview')?.look?.gear)).toBeUndefined();
  await page.click('#panel-appearance [data-k="classGear"]');
  // pick hair "long" and a red hair colour, a tall body
  await page.selectOption('#panel-appearance [data-slot="hair"] select', 'long');
  await page.click('#panel-appearance [data-swatch="hair"] .ap-sw:nth-child(7)');
  await page.waitForTimeout(2500);
  const prev = await page.evaluate(() => thousandvale.actors.get('preview')?.look?.custom || null);
  expect(prev?.hair?.id).toBe('long');
  await shot('title-editor');
  await page.click('#panel-appearance [data-act="save"]');   // "Next: equipment" (play-test 5 T5) — then "Create character" enters the world
  const saved = await page.evaluate(() => thousandvale.S.look);
  expect(saved.custom.hair.id).toBe('long');
  // step 3 (tests/D/pt5.spec.js checks it): take the first kit; a calling with no kits goes straight in
  await page.waitForFunction(() => tvui5.state().kits.open || thousandvale.S.phase !== 'title', null, { timeout: 30000 });
  if (await page.evaluate(() => tvui5.state().kits.open)) await page.click('#panel-kits [data-act="create"]');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  // the server keeps the look: my own entity's info carries the custom hair
  await expect.poll(() => page.evaluate(() => thousandvale.S.mirror.infos.get(tv.state().you.id)?.look?.custom?.hair?.id || thousandvale.actors.get(tv.state().you.id)?.look?.custom?.hair?.id), { timeout: 15000 }).toBe('long');
  // the character select (title, after a reload) names the calling
  const p2 = await ctx.newPage();
  await p2.goto(base + '?quality=low&tod=0.45');
  await p2.waitForSelector('#front:not([hidden]) #mychars:not([hidden]) .chip.char', { timeout: 60000 });
  await expect(p2.locator('#new-char')).toBeVisible();
  await expect(p2.locator('#login')).toBeHidden();
  const chip = await p2.locator('#char-chips .chip.char').first().textContent();
  expect(chip).toContain('Ranger');
  expect(chip).not.toContain('Adventurer');
  await p2.waitForTimeout(6000);
  await shot('title-chars', p2);
  await p2.click('#new-char');
  await expect(p2.locator('#login')).toBeVisible();
  await expect(p2.locator('#back-front')).toBeVisible();
  await p2.close();
  // a spy on what the client sends from here on
  await page.evaluate(() => { window.__sent = []; const n = thousandvale.S.net, raw = n._raw.bind(n); n._raw = (w, d) => { try { window.__sent.push(JSON.parse(d)); } catch {} return raw(w, d); }; const ti = n.tradeOp; n.tradeOp = (op, a) => { window.__sent.push({ t: 'trade', op, ...a }); return ti(op, a); }; const it = n.item; n.item = (op, uid, slot) => { window.__sent.push({ t: 'item', op, uid, slot }); return it(op, uid, slot); };
    const wrap = (name, f) => { const o = n[name]; if (typeof o === 'function') n[name] = (...a) => { window.__sent.push(f(...a)); return o(...a); }; };
    wrap('lootOp', (op, a = {}) => ({ t: 'loot', op, ...a })); wrap('shopOp', (op, a = {}) => ({ t: 'shop', op, ...a }));
    wrap('barber', (npc, look) => ({ t: 'barber', npc, look })); wrap('pref', (k, v) => ({ t: 'pref', k, v })); wrap('follow', id => ({ t: 'follow', id })); });
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
  const meT = await page.evaluate(() => tv.state().you);
  await hook('/teleport', { name: 'Brem', x: meT.x + 2, z: meT.z + 1.5 });
  await page.waitForTimeout(1500);
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await page.evaluate(id => tvui2.context(id, 560, 300), brem);
  await page.click('.ent-menu [data-act="trade"]');
  await expect(page.locator('#panel-trade')).toBeVisible({ timeout: 15000 }).catch(async e => { console.log('[Q14] chat:', await page.evaluate(() => [...document.querySelectorAll('#chat-log p')].slice(-6).map(p => p.textContent).join(' | '))); throw e; });
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

test('potions (§18.10): a potion fills key 7 and 7 / a bag click uses it', async () => {
  await hook('/give', { name: 'Wren', items: 2, itemName: 'Healing Potion', kind: 'potion', id: 'healing_potion', rarity: 'common' });
  await expect.poll(() => page.evaluate(() => tvui2.state().hotbar[0]), { timeout: 10000 }).toBe('healing_potion');
  await sent();
  await page.keyboard.press('Digit7');
  const w = (await sent()).find(m => m.t === 'item' && m.op === 'use');
  expect(w?.uid).toBe('id:healing_potion');
  await shot('hotbar');
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
  // the nearest NPC who KEEPS A SHOP (since play-test 8 the nearest NPC is as likely a guard or a craftsman, who answer
  // "they will not deal" and the window closes) — the role is the rule, not who happens to stand closest
  const npc = await page.evaluate(() => { const me = tv.state().you, infos = thousandvale.S.mirror.infos, shop = new Set(['merchant', 'smith', 'armourer', 'bowyer', 'tailor', 'apothecary', 'provisioner', 'jeweller', 'trader']);
    const near = tv.state().ents.filter(e => e.kind === 'npc').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    return near.find(e => shop.has(infos.get(e.id)?.role)) || near[0]; });
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
  test.setTimeout(240000);
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
  test.setTimeout(180000);
  await sent();
  await page.evaluate(() => tvui2.editor('barber'));
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await page.selectOption('#panel-appearance [data-slot="hair"] select', 'mohawk');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.actors.get(tv.state().you.id).look.custom?.hair?.id)).toBe('mohawk');
  await shot('barber');
  await page.click('#panel-appearance [data-act="save"]');
  expect((await sent()).find(m => m.t === 'barber')?.look?.custom?.hair?.id).toBe('mohawk');
});

test('Q23 + Q26: the perk forest search rings what it finds', async () => {
  test.setTimeout(180000);
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
  await page.evaluate(() => document.querySelector('#panel-perks .tvp-x')?.click());
  await expect(page.locator('#panel-perks')).toBeHidden();
});

test('R6 + R3: mana bars (you, target, number on hover) and event countdowns in seconds', async () => {
  await expect(page.locator('#self-mp')).toBeVisible();
  expect(await page.getAttribute('#self-mp', 'data-tip')).toMatch(/Mana: \d/);
  await expect(page.locator('#self-frame .bar.xp')).toHaveCount(0);
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await page.evaluate(id => { tv.target(id); tvui2.fake('ev', { k: 0, e: [{ type: 'mp', id, n: 30, max: 60 }] }); }, brem);
  await expect(page.locator('#target-mp')).toBeVisible({ timeout: 5000 });
  expect(await page.getAttribute('#target-mp', 'data-tip')).toMatch(/^Mana: \d+ \/ \d+$/);   // the live server's own mp events win over the fake
  // (play-test 5: the countdown lives on the event tracker's card now — ui/event-tracker.js)
  await page.evaluate(() => { const ev = { uid: 'skein', id: 'skein', name: 'Grandmother Skein', x: 0, z: 0, r: 30 }; tv.fake('zoneEvent', { kind: 'soon', ev, at: Date.now() + 14000, inMs: 14000 }); });
  await page.waitForTimeout(1200);
  const frame = await page.locator('.tv-evtrack .et-card.soon .et-time').textContent();
  expect(frame).toMatch(/Starts in 0:(1[0-4]|0[5-9])/);
  await page.evaluate(() => thousandvale.ui5.tracker.clear());
  const sub = await page.evaluate(() => tvui.atlas().events);
  expect(JSON.stringify(sub)).not.toContain('Starting soon');
  await page.evaluate(() => tvui.fake('zoneEvent', { kind: 'states', list: [{ id: 'skein', name: 'Grandmother Skein', x: 0, z: 0, r: 30, state: 'ready', near: 80 }] }));
  expect(JSON.stringify(await page.evaluate(() => tvui.atlas().events))).toContain('Comes alive when you come near');
  await shot('mana-countdown');
});

test('play-test 4: S1 event panel tucks into a bubble and never covers the tracker; S2 untracked quests leave the HUD; S3 S12 S20 S21 S23 S19 S4', async () => {
  test.setTimeout(300000);   // (a click costs several software-rendered frames here; the fold block may run twice)
  // S1
  await page.evaluate(() => tv.fake('realm', { kind: 'eventStart', ev: { uid: 'e1', id: 'world_grimtallow', name: 'Grimtallow', kind: 'worldboss', zoneName: 'Blackthorn Scar' } }));
  await page.evaluate(() => tvui.fake('quests', { active: [{ id: 'q1', name: 'Rope for Old Pell', steps: [{ text: 'Find rope', n: 0, of: 1 }], step: 0 }, { id: 'q2', name: 'Wolf Pelts', steps: [{ text: 'Kill wolves', n: 1, of: 5 }], step: 0 }], done: [] }));
  await page.waitForTimeout(800);
  // play-test 5 (T11/T12): the event is a card on the tracker — above the quest tracker, never over it; it folds to one line
  await expect(page.locator('.tv-evtrack .et-card')).toBeVisible();
  await expect(page.locator('.tv-event')).toBeHidden();
  const r = await page.evaluate(() => ['.tv-evtrack', '.tv-tracker'].map(s => document.querySelector(s).getBoundingClientRect()).map(b => ({ top: b.top, bottom: b.bottom })));
  expect(r[0].bottom).toBeLessThanOrEqual(r[1].top + 1);
  await shot('s1-event-tracker');
  // (the FOLD button by what it does: since play-test 8 a card also carries a Hide button with the same .et-x class.
  //  And since play-test 10 the server says every 15 s what is really running (`eventSync`) and the tracker drops any
  //  running card that is not on that list — which a card faked by this test never is. So the fold is tried as one
  //  short block that puts the card back first, and tried again if a sync landed in the middle of it.)
  await expect(async () => {
    await page.evaluate(() => { if (!document.querySelector('.tv-evtrack .et-card')) tv.fake('realm', { kind: 'eventStart', ev: { uid: 'e1', id: 'world_grimtallow', name: 'Grimtallow', kind: 'worldboss', zoneName: 'Blackthorn Scar' } }); });
    await page.click('.tv-evtrack .et-card:not(.folded) [data-act="fold"]', { timeout: 12000 });
    await expect(page.locator('.tv-evtrack .et-card')).toHaveClass(/folded/, { timeout: 6000 });
    await page.click('.tv-evtrack .et-card.folded [data-act="fold"]', { timeout: 12000 });
    await expect(page.locator('.tv-evtrack .et-card')).not.toHaveClass(/folded/, { timeout: 6000 });
  }).toPass({ timeout: 150000 });
  await page.evaluate(() => thousandvale.ui5.tracker.clear());
  // S2
  const before = await page.locator('.tv-tracker .tr-main, .tv-tracker .tr-row').count();
  await page.evaluate(() => thousandvale.ui2.atlasUntrack('q2'));
  await page.waitForTimeout(300);
  const after = await page.locator('.tv-tracker .tr-main, .tv-tracker .tr-row').count();
  expect(after).toBe(before - 1);
  // S3: a row that is only a category label is not for sale (the same filter the shop window uses)
  const rows = await page.evaluate(async () => (await import('./js/client/ui/pt2-core.js')).saleRows([{ id: 'x', label: 'Wands & rods', item: { name: 'Wands & rods' }, price: 15 }, { id: 'y', label: 'Wands & rods', item: { name: 'Ashwood Wand' }, price: 12 }]).map(r => r.id));
  expect(rows).toEqual(['y']);
  // S12: one window for several bodies
  await page.evaluate(() => tvui2.fake('lootWin', { id: 900, group: true, corpses: [900, 901, 902], gold: 7, items: [{ uid: 'g1', name: 'Wolf Pelt', corpse: 901 }, { uid: 'g2', name: 'Fang', corpse: 902 }] }));
  await expect(page.locator('#panel-loot')).toBeVisible();
  expect(await page.locator('#panel-loot .tvp-head h3').textContent()).toBe('3 bodies');
  await page.evaluate(() => thousandvale.ui2.loot.panel.close());
  // S20 / S21
  await page.evaluate(() => { tvui2.fake('you', { regen: { kind: 'food', ms: 20000 } }); tvui2.fake('mountR', { ok: true, casting: 1500 }); });
  await expect(page.locator('.meal-pill')).toBeVisible();
  await expect(page.locator('.castbar')).toBeVisible();
  await shot('s20-s21');
  await page.evaluate(() => tvui2.fake('you', { regen: null }));
  // S23 + S19 + S4
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id);
  await page.evaluate(id => tvui2.fake('lootable', { id, on: true, best: 'rare' }), brem);
  await page.waitForTimeout(400);
  expect(await page.evaluate(id => thousandvale.actors.get(id).plate.root.className, brem)).toContain('loot-rare');
  await page.evaluate(id => tvui2.fake('lootable', { id, on: false }), brem);
  expect(await page.evaluate(() => [...thousandvale.actors.actors.values()].some(a => a.kind === 'npc' && a.npcTitle))).toBe(true);
  await shot('s19-titles');
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
