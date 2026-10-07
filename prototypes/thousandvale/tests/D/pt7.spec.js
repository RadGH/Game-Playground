// Stream D-UI — play-test 7 in a real browser against a real server (tests/D/m3-server.mjs): V5 (the appearance editor keeps
// its scroll position), V11 (game-styled scrollbars), V13 (the shop's compare card), V9 (the bag's Stats button on a phone-width
// screen). Shots: tests/D/shots/pt7-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt7.spec.js
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
const soft = (name, fn) => test(name, async ({ browser }) => { test.setTimeout(300000); try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 50)} :: ${String(e.message).slice(0, 700)}`); console.log('[pt7 FAIL]', name.slice(0, 50), '\n', String(e.message).slice(0, 700)); } });

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

soft('V5 + V11: changing Beard (or anything) in the character editor keeps the list where you scrolled it; the scrollbar is the game\'s', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 620 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.goto(base + '?quality=low&fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await page.fill('#name', 'Scrolla');
  await page.click('#enter');
  await expect(page.locator('#panel-appearance')).toBeVisible();
  const list = page.locator('#panel-appearance .ap-body');
  const max = await list.evaluate(e => e.scrollHeight - e.clientHeight);
  expect(max, 'the list is long enough to scroll at this height').toBeGreaterThan(60);
  for (const slot of ['facialHair', 'mouth', 'eyes']) {
    const row = page.locator(`#panel-appearance [data-slot="${slot}"]`);
    if (!(await row.count())) continue;
    await row.scrollIntoViewIfNeeded();
    await list.evaluate((e, m) => { e.scrollTop = Math.min(m, Math.max(40, e.scrollTop)); }, max);
    const before = await list.evaluate(e => e.scrollTop);
    expect(before).toBeGreaterThan(30);
    await page.locator(`#panel-appearance [data-slot="${slot}"] .ap-step`).last().click();      // the "next" arrow: a full redraw
    await page.waitForTimeout(350);
    const after = await list.evaluate(e => e.scrollTop);
    expect(Math.abs(after - before), `${slot}: the list stayed where it was (${before} -> ${after})`).toBeLessThanOrEqual(2);
    // and through the drop-down, and a colour swatch
    const sel = page.locator(`#panel-appearance [data-slot="${slot}"] select`);
    const opts = await sel.locator('option').evaluateAll(o => o.map(x => x.value));
    await sel.selectOption(opts[Math.min(2, opts.length - 1)]);
    await page.waitForTimeout(350);
    expect(Math.abs((await list.evaluate(e => e.scrollTop)) - before), `${slot} by the list`).toBeLessThanOrEqual(2);
  }
  // V11: thin, dark track, gold thumb — on every element (the same rule in Firefox and WebKit)
  const sb = await list.evaluate(e => { const c = getComputedStyle(e); return { w: c.scrollbarWidth, col: c.scrollbarColor }; });
  expect(sb.w).toBe('thin'); expect(sb.col).toMatch(/217, 178, 106/);
  const rules = await page.evaluate(async () => (await (await fetch('css/pt7.css')).text()));
  expect(rules).toMatch(/\*::-webkit-scrollbar-thumb/); expect(rules).toMatch(/scrollbar-color:/);
  await page.screenshot({ path: join(SHOTS, 'pt7-v5-editor-scrolled.png') });
  await ctx.close();
});

soft('V13: the shop shows the thing on the shelf against what you wear — the bag\'s item card — and buys from there', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.goto(base + '?quality=low&autoplay=1&name=Shoppa&cls=warrior&tod=0.45');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  const worn = await page.evaluate(() => thousandvale.bag.state.equipment?.weapon?.name || null);
  await page.evaluate(() => { const me = tv.state().you.id; window.__shop = []; const n = thousandvale.S.net; const raw = n._raw.bind(n); n._raw = (w, d) => { try { const m = JSON.parse(d); if (m.t === 'shop') { window.__shop.push(m); return; } } catch {} return raw(w, d); }; for (const k of ['shop', 'shopOp']) if (typeof n[k] === 'function') n[k] = (op, a = {}) => { window.__shop.push({ t: 'shop', op, ...a }); };
    tvui2.openShop(me, 'Isolde Harl');
    tv.fake('shopView', { npc: me, name: 'Isolde Harl', role: 'weaponsmith', title: 'Weaponsmith', sellRate: 0.25, buyback: [], sell: [],
      stock: [{ id: 's1', price: 2, item: { name: 'Fine Longsword', baseKey: 'longsword', type: 'weapon', subtype: 'sword', slot: 'weapon', rarity: 'magic', dmg: [9, 15], levelReq: 1, ilvl: 2, offHandOk: true, affixes: [{ stat: 'critChance', value: 0.03, text: '+3% critical chance' }] } },
        { id: 's2', price: 9999, item: { name: 'Gilded Greatsword', baseKey: 'greatsword', type: 'weapon', subtype: 'greatsword', slot: 'weapon', twoHanded: true, rarity: 'rare', dmg: [14, 26], levelReq: 1 } }] }); });
  await expect(page.locator('#panel-shop .shop-row')).toHaveCount(2);
  await expect(page.locator('#panel-shop .shop-card')).toContainText('Point at something on the shelf');
  await page.locator('#panel-shop .shop-row[data-id="s1"] .sr-name').hover();
  const card = page.locator('#panel-shop .shop-card');
  await expect(card).toContainText('Fine Longsword');
  await expect(card).toContainText('9–15 damage');
  if (worn) { await expect(card).toContainText(`Instead of ${worn}`); await expect(card.locator('.ic-compare .up, .ic-compare .down, .ic-compare span').first()).toBeVisible(); }
  else await expect(card).toContainText('a free upgrade');
  await expect(card.locator('[data-act="buy"]')).toHaveText(/Buy — 2 gold/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, 'pt7-v13-shop-compare.png') });
  // what you cannot afford says so on the card, and its Buy is off
  await page.locator('#panel-shop .shop-row[data-id="s2"] .sr-name').hover();
  await expect(card).toContainText('Gilded Greatsword');
  await expect(card.locator('[data-act="buy"]')).toBeDisabled();
  // touch: the first tap shows the card, it does not buy; Buy on the card buys
  await page.evaluate(() => { window.__shop.length = 0; const r = document.querySelector('#panel-shop .shop-row[data-id="s1"]'); r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); r.click(); });
  await expect(card).toContainText('Fine Longsword');
  expect(await page.evaluate(() => window.__shop.filter(m => m.op === 'buy').length), 'the first tap only shows the card').toBe(0);
  const gold = await page.evaluate(() => thousandvale.bag.state.gold);
  if (gold >= 2) { await card.locator('[data-act="buy"]').click(); expect(await page.evaluate(() => window.__shop.find(m => m.op === 'buy'))).toMatchObject({ id: 's1' }); }
  else await expect(card.locator('[data-act="buy"]')).toBeDisabled();
  await page.evaluate(() => thousandvale.ui2.shop.panel?.close?.());
  await ctx.close();
});

soft('V9: on a phone-width screen the bag\'s Stats button opens the Character menu under the bag (a real tap)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.goto(base + '?quality=low&autoplay=1&name=Tappa&cls=warrior&tod=0.45');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => thousandvale.bag.toggle(true));
  const btn = page.locator('#inv-stats');
  await expect(btn).toBeVisible();
  const hit = await btn.evaluate(b => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: e === b || b.contains(e), what: e ? e.tagName + '#' + e.id + '.' + e.className : null, w: r.width, h: r.height }; });
  expect(hit.top, `nothing lies over the Stats button (found ${hit.what})`).toBe(true);
  await btn.tap();
  await expect(page.locator('#panel-sheet')).toBeVisible();
  const box = await page.evaluate(() => ['#bag', '#panel-sheet'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; }));
  expect(box[1].t).toBeGreaterThanOrEqual(box[0].b - 1); expect(box[1].b).toBeLessThanOrEqual(845); expect(box[1].b - box[1].t).toBeGreaterThan(120);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, 'pt7-v9-phone-stats.png') });
  await btn.tap();
  await expect(page.locator('#panel-sheet')).toBeHidden();
  await ctx.close();
});

test('every check above passed', async () => { expect(fails).toEqual([]); });
