// Stream UI — round 11 (owner feedback 2026-10-15) in a real browser against a real server (tests/D/m3-server.mjs).
// Desktop 1366 x 800 and a 393 x 852 phone. #11 bag tabs · #44 Mount slot + picker · #29 Mount button · #13 potion keys
// level with the action bar · #42 shop Sell filters · #43 Shift compare in the shop and the bag · #28 controller card +
// compare · #22 loot window starts on the first item · #8 Loot on a far body walks there · #18 meter records unopened ·
// #54 an NPC remark goes to chat · #21 Strike with nothing about says so. Shots: tests/D/shots/pt11-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt11.spec.js
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
let srv, base, hook;

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hook = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const post = (path, body) => fetch(hook + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: String(e) }));

async function enter(browser, opts, name, cls = 'warrior') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=${cls}&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.tvui2 && window.tvui11, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const MOUNTS = [{ id: 'trail_horse', name: 'Trail Horse', speed: 1.35, calm: 0.15, level: 1, price: 120 }, { id: 'pony', name: 'Moor Pony', speed: 1.5, calm: 0.2, level: 5, price: 1800 }];
const tip = page => page.evaluate(() => { const b = document.getElementById('tipbox'); return b && !b.hidden ? b.textContent : ''; });
/** Stand next to the nearest NPC (the shop / loot windows close when their keeper / body is far). */
async function nearNpc(page, name) {
  const npc = await page.evaluate(() => { const me = thousandvale.actors.get(thousandvale.S.selfId); let best = null; for (const a of thousandvale.actors.actors.values()) { if (a.kind !== 'npc' || a.dead) continue; const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z); if (!best || d < best.d) best = { id: a.id, d, x: a.pos.x, z: a.pos.z }; } return best; });
  expect(npc, 'an NPC in view').toBeTruthy();
  if (npc.d > 5) { await post('/teleport', { name, x: npc.x + 1.5, z: npc.z + 1.5 }); await page.waitForTimeout(1500); }
  return npc;
}

test('desktop 1366 x 800: bag tabs, Mount slot, Mount button, potion keys, shop filters, Shift compare, pad cards, loot, meter, remarks, Strike', async ({ browser }) => {
  test.setTimeout(600000);
  const NAME = 'Tabsworth';
  const { ctx, page, errors } = await enter(browser, { viewport: { width: 1366, height: 800 } }, NAME, 'warrior');
  await post('/give', { name: NAME, items: 1, kind: 'potion', id: 'healing_potion', itemName: 'Healing Potion' });
  await post('/roll', { name: NAME, n: 3, bases: ['ring'], level: 3 });
  await page.waitForTimeout(2000);

  // #18: the meter records with the window never opened
  const m = await page.evaluate(() => tvui8.state().meter);
  expect(m.rec, 'the meter is recording from login').toBe(true);
  expect(m.open, 'without its window').toBe(false);

  // #13: the 7-0 keys sit level with the action bar; a filled key's picture is centred like an empty one
  await page.waitForFunction(() => document.querySelector('.hb-slot:not(.empty) img'), null, { timeout: 20000 });
  const al = await page.evaluate(() => {
    const R = e => e.getBoundingClientRect();
    const bar = R(document.getElementById('actionbar')), g = R(document.querySelector('.hb-group'));
    const slots = [...document.querySelectorAll('.hb-slot')].map(s => { const r = R(s), img = s.querySelector('img'), ir = img ? R(img) : null; return { top: r.top, bottom: r.bottom, cy: (r.top + r.bottom) / 2, icy: ir ? (ir.top + ir.bottom) / 2 : null }; });
    const skill = R(document.querySelector('#actionbar > .slot'));
    return { bar: { t: bar.top, b: bar.bottom, l: bar.left, r: bar.right }, g: { t: g.top, b: g.bottom, r: g.right }, slots, skillCy: (skill.top + skill.bottom) / 2 };
  });
  expect(Math.abs(al.g.t - al.bar.t), `potion group top ${al.g.t} vs bar ${al.bar.t}`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(al.g.b - al.bar.b), `potion group bottom ${al.g.b} vs bar ${al.bar.b}`).toBeLessThanOrEqual(1.5);
  for (const s of al.slots) { expect(Math.abs(s.top - al.slots[0].top), 'every key at one height').toBeLessThanOrEqual(0.5); expect(Math.abs(s.cy - al.skillCy), 'centred on the skill row').toBeLessThanOrEqual(1.5); if (s.icy != null) expect(Math.abs(s.icy - s.cy), 'the potion picture is centred in its key').toBeLessThanOrEqual(1.5); }
  await page.screenshot({ path: join(SHOTS, 'pt11-actionbar.png'), clip: { x: Math.max(0, al.bar.l - 20), y: al.bar.t - 40, width: Math.min(1366 - Math.max(0, al.bar.l - 20), al.g.r - al.bar.l + 60), height: al.bar.b - al.bar.t + 70 } });

  // #29: the Mount button sits on the action bar; with no mount it says where to get one
  await expect(page.locator('#actionbar .mount-btn')).toBeVisible();
  await page.locator('#actionbar .mount-btn').click();
  await expect(page.locator('#toasts')).toContainText('stablehand');

  // #11: the bag's three tabs, the recall charm in Other, the Mount slot
  await page.keyboard.press('b');
  await expect(page.locator('#bag:not([hidden]) #inv-tabs .chip.tab')).toHaveCount(3);
  await page.locator('#inv-tabs [data-tab="other"]').click();
  await expect(page.locator('#bag-grid .islot')).toHaveCount(await page.evaluate(() => thousandvale.bag.state.bag.filter(i => i.keep || i.noSell || i.kind === 'crate' || i.quest).length));
  const other = await page.evaluate(() => [...document.querySelectorAll('#bag-grid .islot')].map(d => thousandvale.bag.state.bag.find(i => String(i.uid) === d.dataset.tipItem)?.id));
  expect(other, 'the recall charm is in Other').toContain('recall_charm');
  await expect(page.locator('#inv-count')).toContainText('no limit');
  await page.screenshot({ path: join(SHOTS, 'pt11-bag-other.png') });
  await page.locator('#inv-tabs [data-tab="items"]').click();
  await expect(page.locator('#inv-filters')).toBeHidden();
  await page.screenshot({ path: join(SHOTS, 'pt11-bag-items.png') });
  await page.locator('#inv-tabs [data-tab="gear"]').click();
  await expect(page.locator('#inv-filters')).toBeVisible();
  // #43 in the bag: Shift while the window holds the focus
  const ring = page.locator('#bag-grid .islot[data-tip-item]').filter({ has: page.locator('img, .glyph') });
  const ringUid = await page.evaluate(() => thousandvale.bag.state.bag.find(i => /ring/i.test(i.slot || i.baseKey || i.base || i.name || ''))?.uid);
  expect(ringUid, 'a ring in the bag').toBeTruthy();
  await page.locator(`#inv-tabs [data-tab="gear"]`).focus();
  await page.locator(`#bag-grid .islot[data-tip-item="${ringUid}"]`).hover(); await page.waitForTimeout(400);
  expect(await tip(page), 'the ring card offers the other hand').toContain('Hold Shift');
  await page.keyboard.down('Shift'); await page.waitForTimeout(150);
  expect(await tip(page), 'Shift switches it').toContain('Comparing the other slot');
  await page.keyboard.up('Shift'); await page.waitForTimeout(100);
  // #44: the Mount slot and its picker (two owned mounts, the slot holding the pony)
  await page.evaluate(m => tv.fake('you', { mounts: m, mountPick: 'pony' }), MOUNTS);
  await expect(page.locator('#bag .mount-slot .slotname')).toHaveText('Moor Pony');
  await page.locator('#bag .mount-slot').click();
  await expect(page.locator('.mount-pick .mp-row')).toHaveCount(2);
  await page.locator('.mount-pick .mp-row[data-mount="trail_horse"]').hover(); await page.waitForTimeout(400);
  expect(await tip(page), 'hover compares with the one in the slot').toMatch(/Instead of Moor Pony.*speed −15%/);
  await page.screenshot({ path: join(SHOTS, 'pt11-mount-picker.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => thousandvale.bag.toggle(false));
  expect(await page.locator('.mount-pick').count(), 'the mount list closed with the window').toBe(0);
  await page.mouse.move(5, 5);

  // #28 / #22 on a controller: the ring shows a square's card at once; Y flips the compare; loot starts on the first item
  await page.evaluate(() => { tvinput.device.force('pad'); thousandvale.bag.toggle(true); });
  await page.waitForTimeout(300);
  await page.evaluate(uid => tvinput.focus.set(document.querySelector(`#bag-grid .islot[data-tip-item="${uid}"]`)), ringUid);
  await page.waitForFunction(() => { const b = document.getElementById('tipbox'); return b && !b.hidden && /compare/.test(b.textContent); }, null, { timeout: 3000 }).catch(() => {});
  expect(await tip(page), 'a focused square shows its card').toContain('Press Y to compare the other slot');
  await page.evaluate(() => tvinput.focus.cardOrAlt()); await page.waitForTimeout(150);
  expect(await tip(page), 'Y compares the other slot').toContain('Comparing the other slot');
  await page.screenshot({ path: join(SHOTS, 'pt11-pad-card.png') });
  await page.evaluate(() => tvinput.focus.cardOrAlt()); await page.waitForTimeout(100);
  await page.evaluate(() => { thousandvale.bag.toggle(false); });
  const npc = await nearNpc(page, NAME);
  await page.evaluate(id => { tvui2.fake('lootable', { id, on: true, best: 'rare' }); tvui2.openLoot(id); }, npc.id);
  await page.evaluate(id => tvui2.fake('lootWin', { id, gold: 7, items: [{ uid: 'lw1', name: 'Bog Iron Ring', rarity: 'magic', slot: 'ring', type: 'accessory' }, { uid: 'lw2', name: 'Copper Ore', kind: 'material', id: 'copper_ore', rarity: 'normal' }], free: [] }), npc.id);
  await page.waitForTimeout(300);
  await page.evaluate(() => tvinput.focus.sync());
  const foc = await page.evaluate(() => { const c = tvinput.focus.current; return c ? { item: c.closest('.loot-row')?.dataset.uid || null, close: !!c.closest('.tvp-x'), cls: c.className } : null; });
  expect(foc && foc.item, 'the ring starts on the first ITEM: ' + JSON.stringify(foc)).toBe('lw1');
  await page.screenshot({ path: join(SHOTS, 'pt11-pad-loot.png') });
  await page.evaluate(() => { document.querySelector('#panel-loot .tvp-x')?.click(); tvinput.device.force('keyboard'); tvinput.device.force(null); });

  // #42 / #43 in the shop: Sell has Equipment / Items and no recall charm; the Buy card's compare follows Shift
  await page.evaluate(id => tvui2.openShop(id, 'Hal Fletchard'), npc.id);
  const view = { npc: npc.id, name: 'Hal Fletchard', role: 'merchant', title: 'General goods', categories: { other: 'Rings' }, sellRate: 0.06, buyback: [],
    stock: [{ id: 'r1', cat: 'other', price: 40, item: { name: 'Silver Band', rarity: 'magic', slot: 'ring', type: 'accessory', level: 1, affixes: [] } }, { id: 'r2', cat: 'other', price: 15, item: { name: 'Plain Ring', rarity: 'normal', slot: 'ring', type: 'accessory', level: 1 } }],
    sell: [] };
  await page.evaluate(v => tvui2.fake('shopView', v), view);
  await page.locator('#panel-shop .shop-row').first().hover(); await page.waitForTimeout(200);
  await expect(page.locator('#panel-shop .shop-card')).toContainText('Hold Shift');
  await page.locator('#panel-shop [data-tab="buy"]').focus();
  await page.keyboard.down('Shift'); await page.waitForTimeout(150);
  await expect(page.locator('#panel-shop .shop-card'), 'Shift works on the shop card (the owner\'s #43)').toContainText('Comparing the other slot');
  await page.keyboard.up('Shift'); await page.waitForTimeout(150);
  await expect(page.locator('#panel-shop .shop-card')).toContainText('Hold Shift');
  await page.screenshot({ path: join(SHOTS, 'pt11-shop-buy.png') });
  await page.locator('#panel-shop [data-tab="sell"]').click();
  await expect(page.locator('#panel-shop .sell-tabs .chip')).toHaveCount(2);
  const sellIds = await page.evaluate(() => [...document.querySelectorAll('#panel-shop .shop-row[data-uid]')].map(r => thousandvale.bag.state.bag.find(i => String(i.uid) === r.dataset.uid)?.id || null));
  expect(sellIds, 'the recall charm is not for sale').not.toContain('recall_charm');
  await page.locator('#panel-shop [data-sell="items"]').click();
  await page.screenshot({ path: join(SHOTS, 'pt11-shop-sell.png') });
  await page.evaluate(() => document.querySelector('#panel-shop .tvp-x')?.click());

  // #54: an NPC's remark is a chat line, not the big call-out
  await page.evaluate(id => thousandvale.onEvent({ type: 'say', id, text: 'Evening, morning, whichever. I have stopped keeping track.', style: 'bark' }), npc.id);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.getElementById('callout')?.classList.contains('show')), 'no call-out').toBe(false);
  await expect(page.locator('#chat-log .npc-say').last()).toContainText('stopped keeping track');

  // #8: Loot on a body out of reach walks you there
  const far = await page.evaluate(() => { const me = thousandvale.actors.get(thousandvale.S.selfId); for (const a of thousandvale.actors.actors.values()) { if (a.kind !== 'npc') continue; const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z); if (d > 12 && d < 60) return { id: a.id, d }; } return null; });
  if (far) {
    await page.evaluate(id => tvui2.openLoot(id), far.id);
    const g = await page.evaluate(() => ({ goal: thousandvale.controls.moveGoal, going: tvui2.state().loot.going }));
    expect(g.goal, 'a walk goal is set').toBeTruthy();
    expect(g.going, 'and the loot window waits for arrival').toBe(far.id);
    await expect(page.locator('#toasts')).toContainText('Walking to');
    await page.evaluate(() => thousandvale.controls.stop());
  } else console.log('[pt11] no NPC 12-60 m away: the walk check was skipped');

  // #21: Strike with nothing about says so (no silent press)
  await page.evaluate(() => thousandvale.controls.stop());
  await page.keyboard.press('f');
  await expect(page.locator('#toasts')).toContainText(/No enemy near enough|You stop|attack/i);
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});

test('phone 393 x 852: bag tabs fit; Other and the Mount slot; no sideways scroll', async ({ browser }) => {
  test.setTimeout(600000);
  const W = 393, H = 852;
  const { ctx, page, errors } = await enter(browser, { viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'Tabphone', 'starcaller');
  await page.evaluate(m => tv.fake('you', { mounts: m, mountPick: 'trail_horse' }), MOUNTS);
  await page.evaluate(() => thousandvale.bag.toggle(true));
  await expect(page.locator('#inv-tabs .chip.tab')).toHaveCount(3);
  const fit = await page.evaluate(() => { const r = document.getElementById('inv-tabs').getBoundingClientRect(); return { r: r.right, w: document.documentElement.scrollWidth, vw: innerWidth }; });
  expect(fit.r, 'the tabs fit the screen').toBeLessThanOrEqual(W + 0.5);
  expect(fit.w, 'no sideways scroll').toBeLessThanOrEqual(fit.vw);
  await page.screenshot({ path: join(SHOTS, 'pt11-phone-bag.png') });
  await page.locator('#inv-tabs [data-tab="other"]').click();
  await page.screenshot({ path: join(SHOTS, 'pt11-phone-other.png') });
  await expect(page.locator('#bag .mount-slot')).toBeVisible();
  await page.locator('#bag .mount-slot').click();
  await expect(page.locator('.mount-pick .mp-row')).toHaveCount(2);
  await page.screenshot({ path: join(SHOTS, 'pt11-phone-mounts.png') });
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});
