// Stream D-UI — play-test 10 in a real browser against a real server (tests/D/m3-server.mjs). Desktop 1366 x 800 and a
// 393 x 852 phone. Y33 the portrait stays in its frame · Y27 every scrolling list keeps its place through a redraw ·
// Y39 confirms above every window · Y38 talent badges · Y37 party rows · Y11 dead events · Y29 the title's front card +
// whose figure it shows · Y30 changelog · Y28 Locate player · Y36 party list, tracking, edge arrows · Y16/Y26 cards ·
// Y15 Angling under Gathering · Y6 ring icons · Y32 Starcaller card / skill pictures / Starlight · Y5 emotes · Y34 "Cast a line".
// Shots: tests/D/shots/pt10-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt10.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const CHANGELOG = JSON.parse(readFileSync(join(HERE, '..', '..', 'data/ops/changelog.json'), 'utf8')).entries;
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hook;
const fails = [];
const soft = (name, fn) => test(name, async ({ browser }) => { test.setTimeout(600000); try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 60)} :: ${String(e.message).slice(0, 1200)}`); console.log('[pt10 FAIL]', name.slice(0, 60), '\n', String(e.stack || e.message).slice(0, 2400)); throw e; } });

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

async function enter(browser, opts, name, cls = 'paladin') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=${cls}&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.tvui10 && window.tvui8, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const frames = (page, n = 3) => page.evaluate(k => new Promise(res => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ------------------------------------------------------------------------------------------------ shared checks
/** Y33: the portrait is INSIDE its frame; nothing that draws a portrait exists anywhere else on the page. */
async function portraitInFrame(page, W, H) {
  await page.waitForFunction(() => document.querySelector('#self-frame .uf-portrait')?.classList.contains('has-live'), null, { timeout: 30000 });
  const p = await page.evaluate(() => {
    const slot = document.querySelector('#self-frame .uf-portrait'), fr = document.getElementById('self-frame').getBoundingClientRect(), sr = slot.getBoundingClientRect();
    const pics = [...document.querySelectorAll('.portrait-live')].filter(e => getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, inSlot: !!e.closest('.uf-portrait'), x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    const stray = [...document.querySelectorAll('body canvas')].filter(c => c.id !== 'view' && !c.closest('.uf-portrait, .minimap, .tv-panel, .bag, #hud, .tv-prof, .ph-ui, .phone-ui') && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0).map(c => c.className || c.id || 'canvas');
    const cv = document.getElementById('view'), cr = cv.getBoundingClientRect();
    return { frame: { x: fr.left, y: fr.top, r: fr.right, b: fr.bottom }, slot: { x: sr.left, y: sr.top, r: sr.right, b: sr.bottom }, pics, stray, stats: tvui2.state().portraits, canvas: { cssH: cr.height, bufH: cv.height / (thousandvale.view.renderer.getPixelRatio() || 1) } };
  });
  expect(p.pics.length, 'a portrait picture is showing').toBeGreaterThan(0);
  for (const c of p.pics) {
    expect(c.inSlot, 'every portrait picture lives inside a portrait slot').toBe(true);
    expect(c.x, 'inside the screen').toBeGreaterThanOrEqual(0); expect(c.r).toBeLessThanOrEqual(W); expect(c.b).toBeLessThanOrEqual(H);
  }
  const mine = p.pics.find(c => c.x >= p.slot.x - 1 && c.r <= p.slot.r + 1 && c.y >= p.slot.y - 1 && c.b <= p.slot.b + 1);
  expect(mine, 'your portrait is drawn inside your own frame\'s slot, not below it').toBeTruthy();
  expect(p.slot.b, 'the slot is inside the unit frame').toBeLessThanOrEqual(p.frame.b + 8);
  expect(p.stray, 'no canvas floats on the page outside the game\'s own pieces').toEqual([]);
  return p;
}
/** Y39: with `sel` showing, its middle belongs to it — nothing is stacked over it. */
async function onTop(page, sel, what) {
  const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return { missing: true }; const b = e.getBoundingClientRect(); const pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 12, b.top + 12], [b.right - 12, b.bottom - 12]]; return { inBody: e.parentElement === document.body, z: getComputedStyle(e).zIndex, hits: pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && e.contains(t); }), top: pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return t ? (t.id || t.className || t.tagName) : null; }) }; }, sel);
  expect(r.missing, `${what}: the dialog is on the page`).toBeFalsy();
  expect(r.hits, `${what}: nothing covers the dialog (on top at its corners and middle: ${JSON.stringify(r.top)})`).toEqual([true, true, true]);
  return r;
}
const ITEMS = n => Array.from({ length: n }, (_, i) => ({ id: 'row' + i, price: 5 + i, cat: i % 2 ? 'arms' : 'goods', item: { uid: 'shopit' + i, name: `Shelf Thing ${i + 1}`, rarity: i % 5 === 0 ? 'rare' : 'common', kind: 'junk', desc: 'A thing on a shelf.' } }));

/** Y27: the shop's lists and the ox-cart list keep their scroll position when the server makes them redraw. */
async function scrollKept(page, phone) {
  // a real NPC to stand at (the shop closes itself when its keeper is not there)
  const npc = await page.evaluate(() => { const me = thousandvale.actors.get(thousandvale.S.selfId); let best = null; for (const a of thousandvale.actors.actors.values()) { if (a.kind !== 'npc' || a.dead) continue; const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z); if (!best || d < best.d) best = { id: a.id, d, x: a.pos.x, z: a.pos.z }; } return best; });
  expect(npc, 'an NPC is in view to open a shop at').toBeTruthy();
  if (npc.d > 6) { await post('/teleport', { name: await page.evaluate(() => thousandvale.S.self.name), x: npc.x + 1.5, z: npc.z + 1.5 }); await page.waitForTimeout(1500); }
  await page.evaluate(id => tvui2.openShop(id, 'Hal Fletchard'), npc.id);
  const view = { npc: npc.id, name: 'Hal Fletchard', role: 'merchant', title: 'General goods', stock: ITEMS(40), buyback: [], sellRate: 0.25, categories: { arms: 'Arms', goods: 'Goods' } };
  await page.evaluate(v => tv.fake('shopView', v), view);
  await expect(page.locator('#panel-shop .shop-row')).toHaveCount(40);
  const sc = () => page.evaluate(() => { const l = document.querySelector('#panel-shop .shop-list'); return { top: l.scrollTop, max: l.scrollHeight - l.clientHeight, w: l.clientWidth, row: l.querySelector('.shop-row').getBoundingClientRect().width, body: document.querySelector('#panel-shop .tvp-body').clientWidth }; });
  await page.evaluate(() => { const l = document.querySelector('#panel-shop .shop-list'); l.scrollTop = 420; l.__old = true; });
  await frames(page);
  const a0 = await sc(); expect(a0.top, 'the Buy list scrolled').toBeGreaterThan(300);
  // the once-a-second redraw: gold changed, then the whole shop view again
  await page.evaluate(() => tv.fake('you', { gold: 4321 })); await frames(page);
  let fresh = await page.evaluate(() => !document.querySelector('#panel-shop .shop-list').__old);
  expect(fresh, 'the Buy list really was rebuilt (a new element)').toBe(true);
  expect((await sc()).top, 'Buy list: scroll position kept through a gold update').toBe(a0.top);
  await page.evaluate(v => tv.fake('shopView', v), { ...view, stock: ITEMS(40).map(r => ({ ...r, price: r.price + 1 })) }); await frames(page);
  expect((await sc()).top, 'Buy list: scroll position kept through a new shop view').toBe(a0.top);
  // hovering rows: the list and its rows keep their width (the scrollbar's space is reserved; the card keeps its height)
  if (!phone) {
    const hintY = async () => (await rect(page, '#panel-shop .shop-hint')).y;
    const y0 = await hintY();
    for (const i of [8, 9, 10]) { await page.locator('#panel-shop .shop-row').nth(i).hover(); await frames(page, 2); const s = await sc(); expect(s.w, `list width after hovering row ${i}`).toBe(a0.w); expect(s.row).toBe(a0.row); expect(s.body).toBe(a0.body); expect(Math.round(await hintY()), 'the line under the card does not move').toBe(Math.round(y0)); expect(s.top, 'hovering does not scroll').toBe(a0.top); }
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#panel-shop .shop-list')).scrollbarGutter)).toContain('stable');
  }
  await page.screenshot({ path: join(SHOTS, `pt10-${phone ? 'phone-' : ''}y27-shop-buy.png`) });
  // Sell: your bag (40 things), scrolled; "you sold one" = a new bag + gold
  const bag = Array.from({ length: 40 }, (_, i) => ({ uid: 'sell' + i, name: `Pocket Lint ${i + 1}`, rarity: 'common', kind: 'junk' }));
  await page.evaluate(b => { thousandvale.bag.state.bag.splice(0, 0, ...b); thousandvale.ui2.shop.setTab('sell'); }, bag);
  await expect(page.locator('#panel-shop .shop-row').first()).toBeVisible();
  expect((await sc()).top, 'a different tab starts at its top').toBe(0);
  await page.evaluate(() => { const l = document.querySelector('#panel-shop .shop-list'); l.scrollTop = 360; l.__old = true; }); await frames(page);
  const s0 = await sc(); expect(s0.top).toBeGreaterThan(200);
  await page.evaluate(() => { thousandvale.bag.state.bag.splice(3, 1); tv.fake('you', { gold: 4400 }); }); await frames(page);
  expect(await page.evaluate(() => !document.querySelector('#panel-shop .shop-list').__old), 'the Sell list was rebuilt').toBe(true);
  expect((await sc()).top, 'Sell list: scroll position kept after selling an item').toBe(s0.top);
  await page.screenshot({ path: join(SHOTS, `pt10-${phone ? 'phone-' : ''}y27-shop-sell.png`) });
  await page.evaluate(() => { const b = thousandvale.bag.state.bag; for (let i = b.length - 1; i >= 0; i--) if (String(b[i].uid).startsWith('sell')) b.splice(i, 1); thousandvale.ui2.shop.panel.close(); });
  // the ox cart: 26 stops, scrolled; picking a destination redraws the window
  const stops = Array.from({ length: 26 }, (_, i) => ({ id: 'stop' + i, name: `Stop ${String.fromCharCode(65 + i)}`, fare: 10 + i, m: 800 + i * 350, s: 60 + i * 20 }));
  await page.evaluate(m => tv.fake('cartList', m), { id: 77, from: 'Torborhold', name: 'Ox cart', stops, gold: 5000, tokens: 0 });
  await expect(page.locator('#panel-cart .cart-row')).toHaveCount(26);
  const cart = () => page.evaluate(() => { const l = document.querySelector('#panel-cart .cart-list'), b = document.querySelector('#panel-cart .tvp-body'); const s = l.scrollHeight > l.clientHeight + 4 ? l : b; return { top: s.scrollTop, which: s === l ? 'list' : 'body', old: !!l.__old }; });
  await page.evaluate(() => { const l = document.querySelector('#panel-cart .cart-list'), b = document.querySelector('#panel-cart .tvp-body'); const s = l.scrollHeight > l.clientHeight + 4 ? l : b; s.scrollTop = 500; l.__old = true; }); await frames(page);
  const c0 = await cart(); expect(c0.top, 'the cart list scrolled').toBeGreaterThan(200);
  const pick = await page.evaluate(() => { const l = document.querySelector('#panel-cart .cart-list'), b = document.querySelector('#panel-cart .tvp-body'); const s = l.scrollHeight > l.clientHeight + 4 ? l : b, box = s.getBoundingClientRect(); const row = [...l.querySelectorAll('.cart-row')].find(r => { const q = r.getBoundingClientRect(); return q.top > box.top + 30 && q.bottom < box.bottom - 30; }); row.querySelector('[data-act="pick"]').click(); return row.dataset.stop; });
  await frames(page);
  await expect(page.locator(`#panel-cart .cart-row.picked[data-stop="${pick}"]`)).toBeVisible();
  const c1 = await cart(); expect(c1.old, 'the cart list was rebuilt by the click').toBe(false);
  expect(Math.abs(c1.top - c0.top), `cart: scroll position kept when a destination is clicked (${c0.which})`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: join(SHOTS, `pt10-${phone ? 'phone-' : ''}y27-cart.png`) });
  await page.evaluate(() => document.querySelector('#panel-cart .tvp-x').click());
}
/**
 * Y27, the audit: EVERY scrolling list of EVERY window. Each one is opened, made long enough to scroll, scrolled, and then
 * redrawn the way the windows redraw (the element is replaced by a new one in the same place); its scroll must be kept.
 */
async function scrollAudit(page) {
  const OPEN = [
    ['journal', () => thousandvale.ui.journal?.panel?.open()], ['sheet', () => thousandvale.ui5.sheet.panel.open()], ['bag', () => thousandvale.bag.toggle(true)],
    ['map', () => thousandvale.ui.worldMap.panel.open()], ['skills', () => document.getElementById('menu-skills')?.click()], ['perks', () => document.getElementById('menu-perks')?.click()],
    ['friends', () => thousandvale.friends.panel.open()], ['mail', () => thousandvale.mail?.panel?.open()], ['guild', () => thousandvale.guild?.panel?.open()], ['callboard', () => thousandvale.callboard?.panel?.open()],
    ['settings', () => thousandvale.ui2.settings.panel.open()], ['help', () => thousandvale.help?.toggle?.(true)], ['feedback', () => tvui5.feedback('bug')], ['account', () => thousandvale.account.panel.open()],
    ['meter', () => tvui8.meter?.(true)], ['changelog', () => tvui10.changelog.open()],
  ];
  const report = [];
  for (const [name] of OPEN) {
    const r = await page.evaluate(async ([which, list]) => {
      const fns = { journal: () => thousandvale.ui.journal?.panel?.open(), sheet: () => thousandvale.ui5.sheet.panel.open(), bag: () => thousandvale.bag.toggle(true), map: () => thousandvale.ui.worldMap.panel.open(),
        skills: () => document.getElementById('menu-skills')?.click(), perks: () => document.getElementById('menu-perks')?.click(), friends: () => thousandvale.friends.panel.open(), mail: () => thousandvale.mail?.panel?.open(),
        guild: () => thousandvale.guild?.panel?.open(), callboard: () => thousandvale.callboard?.panel?.open(), settings: () => thousandvale.ui2.settings.panel.open(), help: () => thousandvale.help?.toggle?.(true),
        feedback: () => tvui5.feedback('bug'), account: () => thousandvale.account.panel.open(), meter: () => tvui8.meter?.(true), changelog: () => tvui10.changelog.open() };
      const raf = n => new Promise(res => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      try { fns[which]?.(); } catch (e) { return { which, error: String(e.message) }; }
      await new Promise(r => setTimeout(r, 450));
      const vis = e => { const b = e.getBoundingClientRect(); return b.width > 30 && b.height > 30 && getComputedStyle(e).visibility !== 'hidden'; };
      const roots = [...document.querySelectorAll('.tv-panel:not([hidden]), #bag:not([hidden]), .tv-changelog:not([hidden])')].filter(vis);
      const out = [];
      for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(el); if (!/(auto|scroll)/.test(cs.overflowY) || !vis(el) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'CANVAS') continue;
        if (!el.parentElement || el === root) { // the window's own scrolling body is not replaced by a redraw; its children are
          continue; }
        // long enough to scroll
        const pad = document.createElement('div'); pad.style.cssText = 'height:1400px;flex:none;'; pad.dataset.pad = '1'; el.appendChild(pad);
        el.scrollTop = 173; await raf(3);
        if (el.scrollTop < 100) { pad.remove(); continue; }
        const want = el.scrollTop, label = `${root.id || root.className.split(' ')[0]} ${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`;
        // the redraw: a NEW element in the same place
        const clone = el.cloneNode(true); el.replaceWith(clone);
        await raf(3);
        out.push({ label, want, got: clone.scrollTop });
        clone.querySelector(':scope > [data-pad]')?.remove(); clone.scrollTop = 0;
      }
      for (const root of roots) (root.querySelector('.tvp-x, #bag-close, .cl-x') || {}).click?.();
      await new Promise(r => setTimeout(r, 120));
      for (const b of document.querySelectorAll('.tv-confirm button.ghost, .tv-confirm [data-act="keep"]')) b.click();
      return { which, lists: out };
    }, [name]);
    report.push(r);
  }
  const all = report.flatMap(r => (r.lists || []).map(l => ({ ...l, window: r.which })));
  console.log('[pt10] scroll audit:', all.length, 'scrolling lists in', report.filter(r => (r.lists || []).length).length, 'windows —', all.map(l => l.label).join(' | '));
  expect(all.length, 'the audit found scrolling lists to test').toBeGreaterThan(8);
  for (const l of all) expect(l.got, `${l.window}: ${l.label} keeps its scroll position through a redraw`).toBe(l.want);
  return all;
}

// =================================================================================================== desktop
soft('desktop 1366 x 800: every item of play-test 10 in the world', async ({ browser }) => {
  const W = 1366, H = 800;
  const { ctx, page, errors } = await enter(browser, { viewport: { width: W, height: H } }, 'Paladongo', 'paladin');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt10-${n}.png`) });
  await post('/level', { name: 'Paladongo', level: 8 }); await page.waitForTimeout(1800);

  // ---- Y33
  const pr = await portraitInFrame(page, W, H);
  console.log('[pt10] portrait:', JSON.stringify(pr.stats), 'canvas', JSON.stringify(pr.canvas));
  // the rule itself, with this browser's facts and an iPhone's
  const rule = await page.evaluate(async () => { const m = await import('./js/client/ui/portrait-mode.js'); const cv = document.getElementById('view'), r = cv.getBoundingClientRect(), dpr = thousandvale.view.renderer.getPixelRatio(); const env = { cssW: r.width, cssH: r.height, bufW: cv.width, bufH: cv.height, dpr }; return { match: m.canvasMatches(env), iphone: m.livePortraitAllowed({ ...env, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X)' }), desk: m.livePortraitAllowed({ ...env, ua: 'Mozilla/5.0 (Windows NT 10.0)' }), stretched: m.livePortraitAllowed({ ...env, cssH: r.height - 86, ua: 'Mozilla/5.0 (Windows NT 10.0)' }) }; });
  expect(rule).toEqual({ match: true, iphone: false, desk: true, stretched: false });
  await shot('y33-frame');

  // ---- Y27
  await scrollKept(page, false);
  const lists = await scrollAudit(page);
  expect(lists.some(l => /journal/.test(l.window)) || lists.some(l => /bag/.test(l.window)), 'the journal or the bag is among the audited windows').toBe(true);

  // ---- Y39: the journal on top after many clicks, then the confirm
  await page.evaluate(() => { thousandvale.ui.journal.panel.open(); thousandvale.ui5.sheet.panel.open(); });
  await page.evaluate(() => { const a = document.getElementById('panel-journal'), b = document.getElementById('panel-sheet'); for (let i = 0; i < 70; i++) (i % 2 ? a : b).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  const jz = await page.evaluate(() => +document.getElementById('panel-journal').style.zIndex);
  expect(jz, 'the journal\'s z-index climbed past the old confirm\'s 60').toBeGreaterThan(60);
  await page.evaluate(() => { const j = document.getElementById('panel-journal'); j.style.left = '483px'; j.style.top = '180px'; j.classList.add('placed'); });   // right where a confirm opens
  await page.evaluate(async () => { const m = await import('./js/client/ui-panel.js'); window.__c = m.confirmBox('Abandon "Wolves at the Fold"? You can take it again from Elder Maud.', { yes: 'Abandon', danger: true }); });
  await expect(page.locator('.tv-confirm')).toBeVisible();
  const c = await onTop(page, '.tv-confirm', 'abandon-quest confirm over the journal');
  expect(c.inBody, 'mounted on <body>').toBe(true);
  await shot('y39-confirm-over-journal');
  await page.locator('.tv-confirm button.ghost').click();
  expect(await page.evaluate(() => window.__c)).toBe(false);
  // the window counter never climbs past the rule
  await page.evaluate(() => { const a = document.getElementById('panel-journal'), b = document.getElementById('panel-sheet'); for (let i = 0; i < 2000; i++) (i % 2 ? a : b).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll('.tv-panel')].map(p => +p.style.zIndex || 0)))).toBeLessThanOrEqual(900);
  // a stack split, over the bag and the journal
  await page.evaluate(() => { thousandvale.bag.toggle(true); });
  await page.evaluate(async () => { const m = await import('./js/client/ui-panel.js'); const box = document.createElement('div'); box.className = 'tv-split'; box.innerHTML = '<p>Split Iron Ore (12) — how many go in the new stack?</p><div class="row"><button class="ghost">Cancel</button><button class="primary">Split off 6</button></div>'; m.mountConfirm(box); });
  await onTop(page, '.tv-confirm.tv-split', 'the split dialog over the bag');
  await page.evaluate(() => { document.querySelector('.tv-split').remove(); thousandvale.bag.toggle(false); document.querySelector('#panel-journal .tvp-x').click(); document.querySelector('#panel-sheet .tvp-x').click(); });
  // the pop-ups that ask (party invite) sit above a window too
  await page.evaluate(() => { thousandvale.ui.worldMap.panel.open(); tv.fake('partyInvite', { party: 9, name: 'Aldra' }); });
  await expect(page.locator('#invite-pop')).toBeVisible();
  await onTop(page, '#invite-pop', 'a party invite over the map');
  await shot('y39-invite-over-map');
  await page.evaluate(() => { document.getElementById('invite-no')?.click(); document.querySelector('#panel-map .tvp-x').click(); });

  // ---- Y38: every unlocked skill's number = the open, unpicked tiers its own page shows
  await page.keyboard.press('KeyK');
  await expect(page.locator('#panel-skills .tvt-skill').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  const skills = await page.evaluate(async () => {
    const out = [];
    const ids = [...document.querySelectorAll('#panel-skills .tvt-skill')].map(b => b.dataset.skill);
    for (const id of ids) {
      const b = document.querySelector(`#panel-skills .tvt-skill[data-skill="${id}"]`);
      const dot = b.querySelector('.tvt-dot'), locked = b.classList.contains('locked'), name = b.querySelector('.tvt-sname').childNodes[0].textContent;
      b.click(); await new Promise(r => setTimeout(r, 60));
      const open = [...document.querySelectorAll('#panel-skills .tvt-tier')].filter(t => !t.classList.contains('closed') && !t.classList.contains('spent') && t.querySelector('.tvt-node')).length;
      out.push({ id, name, locked, badge: dot ? +dot.textContent : 0, open: locked ? 0 : open });
    }
    return out;
  });
  console.log('[pt10] skills:', JSON.stringify(skills));
  expect(skills.length).toBeGreaterThanOrEqual(4);
  for (const s of skills) expect(s.badge, `${s.name}: the number on the skill = the picks its page says are waiting`).toBe(s.open);
  expect(skills.filter(s => !s.locked && s.open > 0).length, 'at level 8 some skills have picks waiting').toBeGreaterThan(0);
  await shot('y38-skill-badges');
  await page.keyboard.press('KeyK');

  // ---- Y37: your own character twice in the server's list (after a reconnect) is not a party member
  const you = await page.evaluate(() => ({ char: thousandvale.S.net.joined.you.char, name: thousandvale.S.self.name, room: thousandvale.S.net.joined.room.id, x: thousandvale.S.predictor.pos.x, z: thousandvale.S.predictor.pos.z }));
  const party = { leader: 901, me: you.char, members: [{ char: 901, name: 'Aldra', level: 9, cls: 'cleric', online: true }, { char: 902, name: 'Brem', level: 7, cls: 'knight', online: true }, { char: you.char, name: you.name, level: 8, cls: 'paladin', online: true }, { char: you.char, name: you.name, level: 8, cls: 'paladin', online: false }, { char: 902, name: 'Brem', level: 7, cls: 'knight', online: true }] };
  await page.evaluate(p => { thousandvale.S.net.party = p; tv.fake('party', p); }, party);
  await expect(page.locator('#party .pmember')).toHaveCount(2);
  expect(await page.locator('#party .pm-name').allTextContents()).toEqual([expect.stringContaining('Aldra'), expect.stringContaining('Brem')]);
  // and when "who am I" is missing altogether
  await page.evaluate(p => { const q = { ...p, me: undefined }; const j = thousandvale.S.net.joined.you, keep = j.char; j.char = null; tv.fake('party', q); j.char = keep; }, party);
  await expect(page.locator('#party .pmember')).toHaveCount(2);
  await shot('y37-party');

  // ---- Y36 + Y28: the map's Party section, Locate player, tracking, edge arrows
  const fr = [{ char: 901, hp: 80, hpMax: 100, room: you.room, x: you.x + 300, z: you.z + 40, dead: false, online: true }, { char: 902, hp: 100, hpMax: 100, room: 'i:barrow:1', x: 10, z: 10, dead: false, online: true }, { char: you.char, hp: 100, hpMax: 100, room: you.room, x: you.x, z: you.z, online: true }];
  await page.evaluate(([p, f]) => { tv.fake('party', p); tv.fake('partyFrames', f); }, [party, fr]);
  await page.keyboard.press('KeyM');
  await expect(page.locator('#panel-map canvas')).toBeVisible();
  await expect(page.locator('#panel-map .map-party .map-person')).toHaveCount(3, { timeout: 15000 });
  expect(await page.locator('#panel-map .map-person .mp-name').first().textContent(), 'yourself first').toContain('(you)');
  const loc = await rect(page, '#panel-map .map-locate'), firstChip = await rect(page, '#panel-map .map-presets .chip');
  expect(loc.x, '"Locate player" is left of World / Province / Region').toBeLessThan(firstChip.x);
  expect(await page.evaluate(() => document.querySelector('#panel-map .map-presets').firstElementChild.classList.contains('map-locate'))).toBe(true);
  expect(await page.locator('#panel-map .map-locate').textContent()).toContain('Locate player');
  await page.evaluate(() => tvui.preset('world'));
  await page.locator('#panel-map .map-locate').click(); await frames(page, 3);
  const st = await page.evaluate(() => thousandvale.ui.worldMap.state);
  expect(Math.abs(st.cx - you.x), 'Locate player centres the map on you').toBeLessThan(2); expect(Math.abs(st.cz - you.z)).toBeLessThan(2); expect(st.scale).toBeGreaterThan(0.3);
  await shot('y28-locate');
  // the member in a dungeon cannot be zoomed to; the other can, and can be tracked
  await expect(page.locator('#panel-map .map-person[data-char="902"] [data-act="zoom"]')).toBeDisabled();
  await page.locator('#panel-map .map-person[data-char="901"] [data-act="zoom"]').click(); await frames(page, 3);
  expect(Math.abs((await page.evaluate(() => thousandvale.ui.worldMap.state)).cx - (you.x + 300))).toBeLessThan(2);
  await page.locator('#panel-map .map-person[data-char="901"] [data-act="track"]').click();
  await expect(page.locator('#panel-map .map-person[data-char="901"] [data-act="track"]')).toHaveText('Tracked');
  expect(await page.evaluate(() => tvui10.isTracked(901))).toBe(true);
  expect(await page.evaluate(() => thousandvale.tracking()), 'D-world\'s hook says who the in-world arrow points at').toMatchObject({ char: 901, name: 'Aldra' });
  // pointing at a row whose target is off the map draws an arrow on the map's edge; one on the map draws none
  await page.evaluate(([x, z]) => { thousandvale.ui.worldMap.setView({ cx: x - 4000, cz: z, scale: 0.6 }); }, [you.x, you.z]);
  await page.locator('#panel-map .map-person[data-char="901"] .mp-name').hover(); await frames(page, 4);
  const arrow = await page.evaluate(() => thousandvale.ui.worldMap.state.arrow);
  expect(arrow, 'an edge arrow for a party member off the map').toBeTruthy(); expect(arrow.outside).toBe(true);
  const canvasW = (await rect(page, '#panel-map canvas')).w;
  expect(arrow.x, 'on the right edge: they are to the east').toBeGreaterThan(canvasW - 60);
  await shot('y36-map-party-arrow');
  await page.evaluate(([x, z]) => { thousandvale.ui.worldMap.setView({ cx: x + 150, cz: z, scale: 0.6 }); }, [you.x, you.z]);
  await page.locator('#panel-map .map-person[data-char="901"] .mp-name').hover(); await frames(page, 4);
  expect(await page.evaluate(() => thousandvale.ui.worldMap.state.arrow), 'no arrow when the target is comfortably on the map').toBe(null);
  await shot('y36-map-party');
  await page.keyboard.press('KeyM');
  // in the world: an arrow at the edge of the screen with the name and the distance; the minimap's rim arrow carries the distance
  await frames(page, 4);
  await expect(page.locator('.tv-trackarrow')).toHaveCount(1);
  expect(await page.locator('.tv-trackarrow span').textContent()).toMatch(/^Aldra · 30[0-9] m$/);
  const ar = await rect(page, '.tv-trackarrow span');
  expect(ar.x).toBeGreaterThanOrEqual(0); expect(ar.r).toBeLessThanOrEqual(W); expect(ar.y).toBeGreaterThanOrEqual(0); expect(ar.b).toBeLessThanOrEqual(H);
  const mm = await page.evaluate(() => thousandvale.ui.atlas.markers().filter(m => m.kind === 'party').map(m => ({ id: m.id, tracked: !!m.tracked })));
  expect(mm, 'a tracked party member is a marker (the minimap draws its rim arrow with the distance)').toContainEqual({ id: 'pm:901', tracked: true });
  await shot('y36-track-arrow');
  // near: the arrow goes away
  await page.evaluate(([f, x, z]) => tv.fake('partyFrames', f.map(r => (r.char === 901 ? { ...r, x: x + 10, z: z + 5 } : r))), [fr, you.x, you.z]); await frames(page, 4);
  await expect(page.locator('.tv-trackarrow')).toHaveCount(0);
  // a friend: Track in the friends list; the server's whereabouts place them; a refusal says why
  await page.evaluate(() => { window.__tracked = []; const n = thousandvale.S.net, t0 = n.track; n.track = (c, off) => { window.__tracked.push([c, !!off]); return t0?.call(n, c, off); }; tv.fake('friends', { list: [{ char: 950, name: 'Mira', cls: 'mage', level: 11, online: true, zone: 'z12_02' }, { char: 951, name: 'Odo', cls: 'rogue', level: 4, online: true, zone: 'z12_02' }] }); thousandvale.friends.panel.open(); });
  await expect(page.locator('#panel-friends .fr-track')).toHaveCount(2);
  await page.locator('#panel-friends .fr-track').first().click();
  await expect(page.locator('#panel-friends .fr-track').first()).toHaveText('Tracked');
  expect(await page.evaluate(() => window.__tracked)).toContainEqual([950, false]);
  await page.evaluate(([x, z]) => tv.fake('whereabouts', { l: [[950, 'Mira', 'torbor', 'Torbor Downs', 'Torborhold', x - 700, z + 100, 'town', 11, 'mage']] }), [you.x, you.z]); await frames(page, 4);
  expect(await page.locator('.tv-trackarrow span').allTextContents()).toEqual([expect.stringMatching(/^Mira · 7[0-9]{2} m$/)]);
  await page.locator('#panel-friends .fr-track').nth(1).click();
  await page.evaluate(() => tv.fake('trackR', { ok: false, char: 951, why: 'hidden' })); await frames(page, 2);
  expect(await page.evaluate(() => tvui10.isTracked(951)), 'a refused friend is not tracked').toBe(false);
  await shot('y36-friends-track');
  await page.evaluate(() => { tvui10.untrack(950, { quiet: true }); tvui10.untrack(901, { quiet: true }); document.querySelector('#panel-friends .tvp-x').click(); tv.fake('party', null); thousandvale.S.net.party = null; });

  // ---- Y11: an event the server no longer lists goes away, with its "Travel there free"
  const ev = { uid: 'e77', id: 'grimtallow', name: 'Grimtallow the siege husk', kind: 'worldboss', province: 'torbor', zoneName: 'Torbor Downs', x: you.x + 900, z: you.z, r: 60 };
  await page.evaluate(e => tv.fake('realm', { kind: 'eventStart', ev: e }), ev);
  await expect(page.locator('.tv-evtrack .et-card')).toHaveCount(1);
  await expect(page.locator('.tv-evtrack .et-go')).toBeVisible();
  await page.evaluate(() => tv.fake('eventSync', { live: ['e77'], realm: 'e77', at: Date.now() }));
  await expect(page.locator('.tv-evtrack .et-card'), 'still listed: it stays').toHaveCount(1);
  await shot('y11-event-live');
  await page.evaluate(() => tv.fake('eventSync', { live: [], realm: null, at: Date.now() }));
  await expect(page.locator('.tv-evtrack .et-card')).toHaveCount(0);
  await expect(page.locator('.et-go')).toHaveCount(0);
  expect(await page.evaluate(() => thousandvale.ui.atlas.events.filter(e => e.free).length), 'the map offers no free travel to it either').toBe(0);
  // "Travel there" pressed on one that died in between: the server says `gone`, the card goes
  await page.evaluate(e => tv.fake('realm', { kind: 'eventStart', ev: e }), ev);
  await expect(page.locator('.tv-evtrack .et-go')).toBeVisible();
  await page.evaluate(() => tv.fake('travelR', { ok: false, why: 'noEvent', gone: true, msg: 'That event is over.' }));
  await expect(page.locator('.tv-evtrack .et-card')).toHaveCount(0);
  expect(await page.evaluate(() => thousandvale.ui.atlas.events.filter(e => e.free).length)).toBe(0);
  await shot('y11-event-gone');

  // ---- Y16 / Y26: the cards
  const cards = await page.evaluate(async () => {
    const m = await import('./js/client/ui/item-card.js');
    const tome = { uid: 't1', name: 'Storm Tome', type: 'weapon', rarity: 'rare', ilvl: 8, hand: 'main', handText: 'Main hand', dmg: [9, 16], aps: 0.9, apsText: '0.9 attacks per second', attackText: 'Lobs a rune that bursts 3.6 m wide for 130% weapon damage.' };
    const orb = { uid: 'o1', name: 'Seer\'s Orb', slot: 'offhand', rarity: 'magic', ilvl: 8, hand: 'off', handText: 'Off hand', noAttack: true, dmg: [2, 4], focusText: 'Held with a wand, tome or sceptre: every fourth basic attack repeats at half strength.' };
    const wand = { uid: 'w1', name: 'Ash Wand', type: 'weapon', rarity: 'common', ilvl: 8, hand: 'one', handText: 'One-hand', dmg: [5, 9], aps: 1.6, apsText: '1.6 attacks per second' };
    const box = document.createElement('div'); box.id = 'pt10-cards'; box.style.cssText = 'position:fixed;left:20px;top:80px;display:flex;gap:12px;z-index:99999;';
    const out = {};
    for (const [k, it] of [['tome', tome], ['orb', orb], ['wand', wand]]) { const d = document.createElement('div'); d.className = 'tipbox show'; d.style.cssText = 'position:static;max-width:300px;opacity:1;'; d.innerHTML = m.itemCardHtml(it, { worn: true, level: 8, equipment: {} }); box.appendChild(d); out[k] = d.textContent; }
    document.body.appendChild(box);
    return out;
  });
  expect(cards.tome).toContain('Main hand'); expect(cards.tome).toContain('9–16 damage'); expect(cards.tome).toContain('0.9 attacks per second'); expect(cards.tome).not.toMatch(/two-handed|every fourth/);
  expect(cards.orb).toContain('Off hand'); expect(cards.orb, 'an orb has no attack: no damage line, no attack speed').not.toMatch(/damage|attacks per second/); expect(cards.orb).toContain('every fourth basic attack');
  expect(cards.wand).toContain('One-hand'); expect(cards.wand).toContain('1.6 attacks per second');
  await shot('y16-y26-cards');
  await page.evaluate(() => document.getElementById('pt10-cards').remove());
  // a main-hand item dropped on the off hand is refused in the rules' words
  const refusal = await page.evaluate(async () => { const c = await import('./js/client/ui/pt10-core.js'); return [c.handRefusal({ name: 'Storm Tome', hand: 'main' }, 'offhand'), c.handRefusal({ name: 'Seer\'s Orb', hand: 'off' }, 'weapon')]; });
  expect(refusal).toEqual(['Storm Tome is a main-hand weapon — it cannot go in the off hand.', 'Seer\'s Orb is an off-hand item — it cannot go in the main hand.']);

  // ---- Y26 + Y15: the Character menu
  await page.keyboard.press('KeyV');
  await expect(page.locator('#panel-sheet .sh-row').first()).toBeVisible();
  await page.waitForTimeout(1500);
  const sheet = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#panel-sheet .sh-list[data-part="core"] .sh-row')].map(r => r.dataset.id), text: document.querySelector('#panel-sheet .tvp-body').innerText, angBlock: document.querySelectorAll('#panel-sheet .sh-angling').length, prof: document.querySelector('#panel-sheet .sh-extra[data-section="professions"]')?.innerText || null, server: tvui5.state().sheet.server }));
  console.log('[pt10] sheet rows:', sheet.rows.join(','), '| professions block:', sheet.prof ? sheet.prof.replace(/\n+/g, ' / ').slice(0, 160) : 'none');
  if (sheet.server) { expect(sheet.rows, 'the server\'s sheet has an attacks-per-second row').toContain('aps'); expect(sheet.rows).not.toContain('attackEvery'); expect(sheet.text).toContain('Attacks per second'); }
  if (sheet.prof) {
    expect(sheet.angBlock, 'no Angling block of its own when the Professions block is there').toBe(0);
    const g = sheet.prof.indexOf('Gathering'), a = sheet.prof.indexOf('Angling'), mk = sheet.prof.indexOf('Making');
    expect(g, 'a Gathering heading').toBeGreaterThanOrEqual(0); expect(a, 'Angling is listed').toBeGreaterThan(g); if (mk >= 0) expect(a, 'under Gathering, before Making').toBeLessThan(mk);
  }
  await shot('y15-y26-sheet');
  await page.keyboard.press('KeyV');

  // ---- Y6: ring icons are the ring
  const ring = await page.evaluate(async () => {
    const ic = await import('./js/client/ui/item-icons.js'), inv = await import('./js/client/ui/inv-core.js');
    const specs = [{ slot: 'ring1', name: 'Signet Band', rarity: 'rare', look: { g5: 'g5_signet' } }, { slot: 'ring1', name: 'Copper Ring', rarity: 'common' }, { slot: 'ring1', name: 'Band of the Hare', rarity: 'legendary' }, { slot: 'ring1', name: 'Set Ring', rarity: 'rare', setId: 'x' }].map(it => inv.iconSpec(it));
    const box = document.createElement('div'); box.id = 'pt10-rings'; box.style.cssText = 'position:fixed;left:20px;top:80px;display:flex;gap:10px;padding:14px;background:#16120e;border:1px solid #6a5a3a;border-radius:8px;z-index:99999;';
    for (const s of specs) { const c = ic.glyphCanvas(s); for (const px of [96, 44]) { const i = new Image(); i.src = c.toDataURL(); i.width = px; i.height = px; i.style.background = '#2a2018'; i.style.borderRadius = '6px'; box.appendChild(i); } }
    document.body.appendChild(box);
    // the loop is a loop: the middle of the band's hole is empty, the band itself is not
    const c = ic.glyphCanvas(specs[0]), g = c.getContext('2d'), a = (x, y) => g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data[3];
    return { kinds: specs.map(s => s.kind + ':' + s.id), hole: a(0.5, 0.62), bandLeft: a(0.5 - 34 / 128, 0.5 + 14 / 128), bandRight: a(0.5 + 34 / 128, 0.5 + 14 / 128), stone: a(0.5, 0.5 - 32 / 128) };
  });
  expect(ring.kinds).toEqual(['glyph:ring', 'glyph:ring', 'glyph:ring', 'glyph:ring']);
  expect(ring.hole, 'you can see through the loop').toBeLessThan(40); expect(ring.bandLeft).toBeGreaterThan(200); expect(ring.bandRight).toBeGreaterThan(200); expect(ring.stone).toBeGreaterThan(200);
  await shot('y6-rings');
  await page.evaluate(() => document.getElementById('pt10-rings').remove());

  // ---- Y32: a class resource on your frame
  await page.evaluate(() => tv.fake('you', { res: [{ id: 'starlight', n: 3, max: 5 }] }));
  await expect(page.locator('#self-frame .uf-res i')).toHaveCount(5); await expect(page.locator('#self-frame .uf-res i.on')).toHaveCount(3);
  await page.evaluate(() => tv.fake('res', { id: 'starlight', n: 5, max: 5 }));
  await expect(page.locator('#self-frame .uf-res i.on')).toHaveCount(5); await expect(page.locator('#self-frame .uf-res')).toHaveClass(/full/);
  const res = await rect(page, '#self-frame .uf-res'), sf = await rect(page, '#self-frame');
  expect(res.y, 'inside your frame').toBeGreaterThanOrEqual(sf.y); expect(res.b).toBeLessThanOrEqual(sf.b + 2); expect(res.r).toBeLessThanOrEqual(sf.r + 2);
  await shot('y32-starlight');
  await page.evaluate(() => tv.fake('you', { res: [] }));
  await expect(page.locator('#self-frame .uf-res')).toBeHidden();

  // ---- Y5: chat commands
  await page.evaluate(() => { window.__emotes = []; const n = thousandvale.S.net; n.emote = id => { window.__emotes.push(id); }; });
  for (const cmd of ['/wave', '/sit', '/dance']) { await page.keyboard.press('Enter'); await page.keyboard.type(cmd); await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
  expect(await page.evaluate(() => window.__emotes)).toEqual(['wave', 'sit', 'dance']);
  await page.evaluate(() => tv.fake('emoteR', { ok: false, id: 'dance', why: 'mounted' }));
  await expect(page.locator('.toast').last()).toContainText('Get down from your mount first');
  // the wheel's third ring
  await page.evaluate(() => thousandvale.input.radial.open({ ring: 2, hold: false }));
  await expect(page.locator('.tv-radial .rd-slice')).toHaveCount(6);
  expect(await page.locator('.tv-radial .rd-slice span').allTextContents()).toEqual(['Wave', 'Sit', 'Dance', 'Cheer', 'Bow', 'Point']);
  await shot('y5-emote-wheel');
  await page.locator('.tv-radial .rd-slice[data-id="emote:cheer"]').click();
  expect(await page.evaluate(() => window.__emotes.at(-1))).toBe('cheer');

  // ---- Y34 (desktop half): the fishing control says what it is
  const fish = await page.evaluate(() => { const b = document.querySelector('.fish-btn'); b.hidden = false; return { cap: b.querySelector('.fish-cap').textContent, aria: b.getAttribute('aria-label'), tip: b.dataset.tip, svg: !!b.querySelector('.fish-glyph svg') }; });
  expect(fish).toEqual({ cap: 'Cast a line', aria: 'Cast a line', tip: 'Cast a line (X). Face the water first.', svg: true });
  await page.locator('#actionbar').screenshot({ path: join(SHOTS, 'pt10-y34-cast-a-line.png') }).catch(() => shot('y34-cast-a-line'));
  await page.evaluate(() => { document.querySelector('.fish-btn').hidden = true; });

  // ---- Y30: in the game, the pause menu's "What's new"
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.evaluate(() => thousandvale.ui2.settings.pause.open());
  await expect(page.locator('#panel-pause [data-act="changelog"]')).toBeVisible();
  await page.locator('#panel-pause [data-act="changelog"]').click();
  await expect(page.locator('.tv-changelog')).toBeVisible();
  await expect(page.locator('.tv-changelog .cl-entry')).toHaveCount(CHANGELOG.length);
  expect(await page.locator('.tv-changelog .cl-entry h4').first().textContent(), 'newest first').toBe(CHANGELOG[0].title);
  await onTop(page, '.tv-changelog', 'the changelog window');
  await shot('y30-changelog-ingame');
  await page.locator('.tv-changelog .cl-x').click();
  await expect(page.locator('.tv-changelog')).toBeHidden();

  expect(errors, 'no page errors in the world').toEqual([]);

  // ============================================================== the title screen (the same browser: it has an account now)
  // Y29: never the new-character form while the list is on its way
  await page.goto(base + '?quality=low&tod=0.45', { waitUntil: 'domcontentloaded' });
  const first = await page.evaluate(() => ({ login: document.getElementById('login').hidden, front: document.getElementById('front').hidden, signin: document.getElementById('signin').hidden }));
  expect(first, 'the moment the page appears: the front card, not the form').toEqual({ login: true, front: false, signin: true });
  await page.waitForFunction(() => window.thousandvale?.titleFront?.(), null, { timeout: 120000 });
  const early = await page.evaluate(() => ({ state: thousandvale.titleFront().state.state, login: document.getElementById('login').hidden }));
  expect(['loading', 'list']).toContain(early.state); expect(early.login).toBe(true);
  await expect(page.locator('#front[data-state="list"] #char-chips .char-row')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('#new-char')).toHaveText('New character');
  await expect(page.locator('#login')).toBeHidden();
  await expect(page.locator('#char-chips .char-row.shown')).toHaveCount(1);
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  // the figure IS the character: its calling, its saved look, the gear it was last seen in
  await page.waitForFunction(() => thousandvale.actors.get('preview')?.look?.cls === 'paladin', null, { timeout: 30000 });
  const fig = await page.evaluate(() => { const a = thousandvale.actors.get('preview'), c = thousandvale.S.net.chars[0]; const saved = JSON.parse(localStorage.getItem('tv.title.gear') || '{}')[String(c.id)]; return { cls: a.look.cls, race: a.look.race, seed: a.look.seed, charRace: c.look?.race, charSeed: c.look?.seed, gear: Object.keys(a.look.gear || {}), remembered: saved ? Object.keys(saved.gear) : null, serverGear: c.gear ? Object.keys(c.gear) : null }; });
  console.log('[pt10] title figure:', JSON.stringify(fig));
  expect(fig.cls).toBe('paladin');
  if (fig.charRace) expect(fig.race, 'the saved people').toBe(fig.charRace);
  if (fig.charSeed != null) expect(fig.seed, 'the saved face').toBe(fig.charSeed);
  expect(fig.remembered, 'the gear was remembered on leaving the world').toBeTruthy();
  expect(fig.gear.sort(), 'and the figure wears it').toEqual((fig.serverGear || fig.remembered).sort());
  await page.waitForTimeout(5000);
  await shot('y29-title-list');
  // the form's own figure comes back when you ask for a new character, and the listed one when you go back
  await page.click('#new-char');
  await expect(page.locator('#login')).toBeVisible(); await expect(page.locator('#back-front')).toBeVisible();
  await page.waitForFunction(() => thousandvale.actors.get('preview')?.look?.cls === thousandvale.S.cls, null, { timeout: 15000 });
  // Y32: the calling's card, for the Starcaller
  await page.selectOption('#class-more', 'starcaller');
  await expect(page.locator('#class-card')).toBeVisible();
  const card = await page.locator('#class-card').innerText();
  expect(card).toContain('Starcaller'); expect(card.toUpperCase()).toContain('ARCANE STAR CASTER'); expect(card).toContain('Cloth · Intelligence · Mana'); expect(card).toContain('golden stars'); expect(card).toContain('Constellation');
  await page.waitForTimeout(2500);
  await shot('y32-class-card');
  await page.click('#classes [data-cls="warrior"]');
  expect(await page.locator('#class-card').innerText()).toContain('Warrior');
  await page.click('#back-front');
  await expect(page.locator('#front')).toBeVisible();
  await page.waitForFunction(() => thousandvale.actors.get('preview')?.look?.cls === 'paladin', null, { timeout: 15000 });

  // Y30: the popup after an update, and the window
  expect(await page.evaluate(() => tvui10.changelog.state.popup), 'nothing new: no popup').toBe(false);
  await page.evaluate(old => { localStorage.setItem('tv.changelog.seen', old); const n = thousandvale.S.net; n.changelog = { latest: null, seen: old }; n.settings = d => { window.__seen = d; }; tvui10.changelog.wire({ changelog: { latest: 'x', seen: old }, on() {} }); return tvui10.changelog.check(); }, CHANGELOG[CHANGELOG.length - 1].id);
  await expect(page.locator('.tv-updated')).toBeVisible();
  await expect(page.locator('.tv-updated strong')).toHaveText('The game was updated');
  await expect(page.locator('.tv-updated p')).toContainText(`${CHANGELOG.length - 1} update${CHANGELOG.length - 1 === 1 ? '' : 's'} since you last played.`);
  await expect(page.locator('#title-changelog')).toHaveClass(/has-new/);
  const pop = await rect(page, '.tv-updated'); expect(pop.x).toBeGreaterThanOrEqual(0); expect(pop.r).toBeLessThanOrEqual(W); expect(pop.y).toBeGreaterThanOrEqual(0);
  await shot('y30-popup');
  await page.locator('.tv-updated [data-act="view"]').click();
  await expect(page.locator('.tv-changelog')).toBeVisible();
  await expect(page.locator('.tv-changelog .cl-entry')).toHaveCount(CHANGELOG.length);
  await expect(page.locator('.tv-changelog .cl-entry.new')).toHaveCount(CHANGELOG.length - 1);
  expect(await page.locator('.tv-changelog .cl-entry').first().getAttribute('class')).toContain('new');
  await expect(page.locator('.tv-updated')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('tv.changelog.seen')), 'opening it moves the marker').toBe(String(CHANGELOG[0].id));
  await shot('y30-changelog');
  // the list scrolls and keeps its place
  await page.locator('.tv-changelog .cl-x').click();
  await page.locator('#title-changelog').click();
  await expect(page.locator('.tv-changelog')).toBeVisible();
  await expect(page.locator('.tv-changelog .cl-entry.new'), 'read once: nothing is new the second time').toHaveCount(0);
  await expect(page.locator('#title-changelog')).not.toHaveClass(/has-new/);
  await page.locator('.tv-changelog .cl-x').click();

  // Y39 on the title: the delete confirm is on top
  await page.locator('#char-chips .char-del').click();
  await onTop(page, '.char-delete', 'the delete-character confirm on the title');
  await page.locator('.char-delete [data-act="keep"]').click();
  await ctx.close();

  // ---- Y29: a brand-new visitor gets a button, not a form
  const ctx2 = await browser.newContext({ viewport: { width: W, height: H } });
  const p2 = await ctx2.newPage(); p2.setDefaultTimeout(25000);
  await p2.goto(base + '?quality=low&tod=0.45', { waitUntil: 'domcontentloaded' });
  expect(await p2.evaluate(() => document.getElementById('login').hidden), 'no form on arrival').toBe(true);
  await p2.waitForSelector('#loading.done', { timeout: 120000 });
  await expect(p2.locator('#front[data-state="empty"]')).toBeVisible();
  await expect(p2.locator('#new-char')).toHaveText('Create character');
  await expect(p2.locator('#login')).toBeHidden();
  await expect(p2.locator('#front-state')).toContainText('Make a character');
  expect(await p2.evaluate(() => tvui10.changelog.state.popup), 'a new player gets no "the game was updated"').toBe(false);
  await p2.waitForTimeout(3000);
  await p2.screenshot({ path: join(SHOTS, 'pt10-y29-title-empty.png') });
  await p2.click('#new-char');
  await expect(p2.locator('#login')).toBeVisible(); await expect(p2.locator('#name')).toBeVisible();
  await ctx2.close();
});

// ===================================================================================================== phone
soft('phone 393 x 852: the portrait stays in its frame; lists, confirms, the map, the changelog and the title fit', async ({ browser }) => {
  const W = 393, H = 852;
  const { ctx, page, errors } = await enter(browser, { viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1' }, 'Starphone', 'starcaller');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt10-phone-${n}.png`) });
  expect(await page.evaluate(() => document.documentElement.dataset.layout), 'the phone layout is on').toBe('phone');

  // ---- Y33: an iPhone gets the 2D picture, inside the frame; the live canvas does not exist
  const pr = await portraitInFrame(page, W, H);
  console.log('[pt10] phone portrait:', JSON.stringify(pr.stats), JSON.stringify(pr.pics));
  expect(pr.stats.flat, 'the flat (2D) portrait path').toBe(true);
  expect(pr.pics.every(c => c.tag === 'IMG'), 'an <img> in the frame, never a canvas').toBe(true);
  expect(await page.evaluate(() => document.querySelectorAll('canvas.portrait-live').length), 'no live portrait canvas on an iPhone at all').toBe(0);
  // the portrait does not change from frame to frame (the report: it flickered)
  const stable = await page.evaluate(async () => { const img = document.querySelector('#self-frame .uf-portrait img.portrait-svg'); const seen = new Set(); let swaps = 0; const mo = new MutationObserver(l => { swaps += l.length; }); mo.observe(document.querySelector('#self-frame .uf-portrait'), { attributes: true, childList: true, subtree: true, attributeFilter: ['src', 'style', 'class', 'hidden'] }); for (let i = 0; i < 90; i++) { seen.add(img.src.length + ':' + img.getBoundingClientRect().top); await new Promise(r => requestAnimationFrame(r)); } mo.disconnect(); return { srcs: seen.size, swaps }; });
  expect(stable, 'ninety frames: one picture, in one place, never swapped').toEqual({ srcs: 1, swaps: 0 });
  // and when the canvas box and its buffer disagree (Safari's toolbar sliding), nothing is drawn into the open
  await page.evaluate(() => { document.getElementById('view').style.height = 'calc(100% - 86px)'; }); await frames(page, 20);
  await portraitInFrame(page, W, H);
  await page.evaluate(() => { document.getElementById('view').style.height = ''; });
  await shot('y33-frame');
  await page.locator('#self-frame').screenshot({ path: join(SHOTS, 'pt10-phone-y33-frame-close.png') });

  // ---- Y32: the Starcaller's skill pictures on the bar; Starlight on the frame
  const bar = await page.evaluate(() => ({ cls: thousandvale.S.self.cls, icons: [...document.querySelectorAll('#actionbar .slot .face.has-ico')].map(f => f.dataset.ico), names: (thousandvale.S.bar || []).map(b => b.id) }));
  console.log('[pt10] starcaller bar:', JSON.stringify(bar));
  expect(bar.cls, 'the server made a Starcaller').toBe('starcaller');
  expect(bar.icons.length, 'its skills show pictures, not initials').toBeGreaterThanOrEqual(1); expect(bar.icons).toContain('star_dart');
  await page.evaluate(() => tv.fake('you', { res: [{ id: 'starlight', n: 4, max: 5 }] }));
  await expect(page.locator('#self-frame .uf-res i.on')).toHaveCount(4);
  const res = await rect(page, '#self-frame .uf-res'), sf = await rect(page, '#self-frame');
  expect(res.b, 'the pips are inside the frame on a phone too').toBeLessThanOrEqual(sf.b + 2); expect(res.r).toBeLessThanOrEqual(sf.r + 2);
  await shot('y32-bar-starlight');

  // ---- Y27
  await scrollKept(page, true);

  // ---- Y39: a confirm over a full-screen sheet
  await page.evaluate(() => thousandvale.ui.journal.panel.open());
  await page.evaluate(() => { const a = document.getElementById('panel-journal'); for (let i = 0; i < 200; i++) a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.evaluate(async () => { const m = await import('./js/client/ui-panel.js'); window.__c = m.confirmBox('Abandon "Wolves at the Fold"? You can take it again from Elder Maud.', { yes: 'Abandon', danger: true }); });
  await expect(page.locator('.tv-confirm')).toBeVisible();
  await onTop(page, '.tv-confirm', 'abandon-quest confirm over the journal sheet');
  const cb = await rect(page, '.tv-confirm'); expect(cb.x).toBeGreaterThanOrEqual(0); expect(cb.r).toBeLessThanOrEqual(W); expect(cb.b).toBeLessThanOrEqual(H);
  await shot('y39-confirm-over-journal');
  await page.locator('.tv-confirm button.ghost').tap();
  await page.evaluate(() => document.querySelector('#panel-journal .tvp-x').click());

  // ---- Y28 / Y36: the map
  const you = await page.evaluate(() => ({ char: thousandvale.S.net.joined.you.char, name: thousandvale.S.self.name, room: thousandvale.S.net.joined.room.id, x: thousandvale.S.predictor.pos.x, z: thousandvale.S.predictor.pos.z }));
  const party = { leader: 901, me: you.char, members: [{ char: 901, name: 'Aldra', level: 9, cls: 'cleric', online: true }, { char: you.char, name: you.name, level: 1, cls: 'starcaller', online: true }, { char: you.char, name: you.name, level: 1, cls: 'starcaller', online: false }] };
  await page.evaluate(([p, x, z, room, me]) => { thousandvale.S.net.party = p; tv.fake('party', p); tv.fake('partyFrames', [{ char: 901, hp: 50, hpMax: 100, room, x: x + 260, z: z - 30, online: true }, { char: me, hp: 100, hpMax: 100, room, x, z, online: true }]); }, [party, you.x, you.z, you.room, you.char]);
  await expect(page.locator('#party .pmember'), 'Y37: one frame — not yourself').toHaveCount(1);
  await page.evaluate(() => thousandvale.ui.worldMap.panel.open());
  await expect(page.locator('#panel-map .map-locate')).toBeVisible();
  const loc = await rect(page, '#panel-map .map-locate');
  expect(loc.w, 'a thumb-sized Locate button').toBeGreaterThanOrEqual(44); expect(loc.h).toBeGreaterThanOrEqual(44); expect(loc.x).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => tvui.preset('world'));
  await page.locator('#panel-map .map-locate').tap(); await frames(page, 3);
  expect(Math.abs((await page.evaluate(() => thousandvale.ui.worldMap.state)).cx - you.x)).toBeLessThan(2);
  await expect(page.locator('#panel-map .map-party .map-person')).toHaveCount(2, { timeout: 15000 });
  await page.locator('#panel-map .map-party').scrollIntoViewIfNeeded();
  for (const b of await page.locator('#panel-map .map-person button').all()) { const r = await b.boundingBox(); expect(r.height, 'thumb-sized').toBeGreaterThanOrEqual(43.5); expect(r.x + r.width).toBeLessThanOrEqual(W + 0.5); }
  await page.locator('#panel-map .map-person[data-char="901"] [data-act="track"]').tap();
  await expect(page.locator('#panel-map .map-person[data-char="901"] [data-act="track"]')).toHaveText('Tracked');
  await shot('y36-map-party');
  await page.evaluate(() => document.querySelector('#panel-map .tvp-x').click());
  await frames(page, 4);
  await expect(page.locator('.tv-trackarrow')).toHaveCount(1);
  const ar = await rect(page, '.tv-trackarrow span');
  expect(ar.x, 'the arrow\'s label is on the screen').toBeGreaterThanOrEqual(0); expect(ar.r).toBeLessThanOrEqual(W); expect(ar.y).toBeGreaterThanOrEqual(0); expect(ar.b).toBeLessThanOrEqual(H);
  await shot('y36-track-arrow');
  await page.evaluate(() => { tvui10.untrack(901, { quiet: true }); tv.fake('party', null); thousandvale.S.net.party = null; });

  // ---- Y30: the changelog is a sheet
  await page.evaluate(() => tvui10.changelog.open());
  await expect(page.locator('.tv-changelog .cl-entry')).toHaveCount(CHANGELOG.length);
  const cl = await rect(page, '.tv-changelog'); expect(cl.x).toBe(0); expect(Math.round(cl.w)).toBe(W); expect(cl.b).toBeLessThanOrEqual(H + 1);
  const x = await rect(page, '.tv-changelog .cl-x'); expect(x.w).toBeGreaterThanOrEqual(44); expect(x.h).toBeGreaterThanOrEqual(44); expect(x.r).toBeLessThanOrEqual(W);
  expect(await page.evaluate(() => { const l = document.querySelector('.tv-changelog .cl-list'); return { scrolls: l.scrollHeight > l.clientHeight, side: l.scrollWidth - l.clientWidth }; })).toEqual({ scrolls: true, side: 0 });
  await onTop(page, '.tv-changelog', 'the changelog sheet');
  await shot('y30-changelog');
  await page.locator('.tv-changelog .cl-x').tap();

  // ---- Y5: the wheel's emote ring
  await page.evaluate(() => thousandvale.input.radial.open({ ring: 2, hold: false }));
  await expect(page.locator('.tv-radial .rd-slice')).toHaveCount(6);
  for (const b of await page.locator('.tv-radial .rd-slice').all()) { const r = await b.boundingBox(); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(W + 0.5); expect(r.width).toBeGreaterThanOrEqual(44); }
  await shot('y5-emote-wheel');
  await page.evaluate(() => thousandvale.input.radial.close());
  expect(errors, 'no page errors').toEqual([]);

  // ---- the title on a phone: the list, the figure, the calling's card, "Create character"
  await page.goto(base + '?quality=low&tod=0.45', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.getElementById('login').hidden)).toBe(true);
  await expect(page.locator('#front[data-state="list"] #char-chips .char-row')).toHaveCount(1, { timeout: 120000 });
  await page.waitForSelector('#loading.done', { timeout: 240000 });
  await page.waitForFunction(() => thousandvale.actors.get('preview')?.look?.cls === 'starcaller', null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await shot('y29-title-list');
  const nb = await rect(page, '#new-char'); expect(nb.x).toBeGreaterThanOrEqual(0); expect(nb.r).toBeLessThanOrEqual(W); expect(nb.h).toBeGreaterThanOrEqual(44);
  await page.locator('#new-char').tap();
  await expect(page.locator('#login')).toBeVisible();
  await page.selectOption('#class-more', 'starcaller');
  await expect(page.locator('#class-card')).toContainText('Constellation');
  const cc = await rect(page, '#class-card'); expect(cc.x).toBeGreaterThanOrEqual(0); expect(cc.r).toBeLessThanOrEqual(W);
  await page.locator('#class-card').scrollIntoViewIfNeeded();
  await shot('y32-class-card');
  await ctx.close();
});

test('pt10: summary', async () => { expect(fails, fails.join('\n')).toEqual([]); });
