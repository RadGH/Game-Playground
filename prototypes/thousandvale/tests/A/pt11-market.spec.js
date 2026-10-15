// Round 11 (Market stream, owner report #25) in a real browser against a real server (tests/D/m3-server.mjs, memory DB):
// a seller on a desktop (1180 x 720) lists a sword from the party window's Market tab (sees the fee before confirming),
// a buyer on a phone (393 x 852, touch) browses, filters, reads the item card and buys it; the sword arrives by mail; the
// seller's gold arrives by mail; a full Equipment tab keeps the letter's sword in the letter. Shots: tests/A/shots/market-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/A/pt11-market.spec.js
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
  srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk), '--event-first', '600000', '--event-announce', '600000'], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hook = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const post = (path, body) => fetch(hook + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: String(e) }));

async function enter(browser, opts, name) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  await page.addLocatorHandler(page.locator('.tv-changelog:not([hidden]) .cl-x'), async x => { await x.click(); });
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=warrior&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors, name };
}
async function claim(P, user) {
  await P.page.evaluate(() => tv.panel('account'));
  const f = P.page.locator('#panel-account form.claim');
  await f.locator('input[placeholder="Username"]').fill(user);
  await f.locator('input[placeholder^="Password"]').fill('correct horse');
  await f.locator('input[placeholder^="The same"]').fill('correct horse');
  await f.locator('button.primary').click();
  await expect.poll(async () => (await P.page.evaluate(() => tv.social())).claimed, { timeout: 20000 }).toBe(true);
  await P.page.evaluate(() => tv.panel('account', false));
}
const SWORD = { name: 'Gullwick Longsword', rarity: 'rare', type: 'weapon', slot: 'weapon', value: 60, level: 4, base: 'longsword', dmg: [9, 15] };
const ORE = { kind: 'material', id: 'copper_ore', name: 'Copper Ore', rarity: 'normal', count: 12, price: 2 };

test('the Market: list on a desktop, browse + buy on a phone, delivery by mail, a full tab keeps the letter', async ({ browser }) => {
  test.setTimeout(600000);
  const A = await enter(browser, { viewport: { width: 1180, height: 720 } }, 'Marketseller');
  await claim(A, 'mkseller' + Date.now().toString(36).slice(-4));
  await post('/level', { name: A.name, level: 6 });
  await post('/grant', { name: A.name, items: [SWORD, ORE] });
  await post('/give', { name: A.name, gold: 200, items: 0 });
  await A.page.waitForTimeout(1500);

  // the party window's Market tab
  await A.page.evaluate(() => tv.panel('market'));
  await expect(A.page.locator('#menu-market')).toHaveAttribute('aria-selected', 'true');
  await A.page.locator('.mk-view[data-view="sell"]').click();
  await expect(A.page.locator('.mk-grid .islot').first()).toBeVisible();
  // pick the sword (its card is the item card)
  const uid = await A.page.evaluate(() => tv.social().bag.find(i => i.name === 'Gullwick Longsword').uid);
  await A.page.locator(`.mk-grid .islot[data-tip-item="${uid}"]`).click();
  await expect(A.page.locator('.mk-form')).toBeVisible();
  const fee = +(await A.page.locator('.mk-facts dd[data-fee]').getAttribute('data-fee'));
  expect(fee, 'the fee is shown before confirming').toBeGreaterThanOrEqual(1);
  await A.page.locator('.mk-price-in').fill('150');
  await expect(A.page.locator('[data-act="list"]')).toHaveText(/for 150 gold/);
  await A.page.screenshot({ path: join(SHOTS, 'market-sell-desktop.png') });
  const g0 = await A.page.evaluate(() => tv.social().gold);
  await A.page.locator('[data-act="list"]').click();
  await expect(A.page.locator('.tv-confirm')).toContainText(`The fee is ${fee} gold`);
  await A.page.locator('.tv-confirm button.primary').click();
  await expect(A.page.locator('.mk-view[data-view="mine"]')).toHaveAttribute('aria-selected', 'true');
  await expect(A.page.locator('.mk-list .mk-row')).toHaveCount(1);
  await expect.poll(() => A.page.evaluate(() => tv.social().gold)).toBe(g0 - fee);
  await A.page.screenshot({ path: join(SHOTS, 'market-mine-desktop.png') });
  // the ore too, priced for the stack
  const oreUid = await A.page.evaluate(() => tv.social().bag.find(i => i.name === 'Copper Ore').uid);
  await A.page.locator('.mk-view[data-view="sell"]').click();
  await A.page.locator(`.mk-grid .islot[data-tip-item="${oreUid}"]`).click();
  await A.page.locator('.mk-price-in').fill('24');
  await A.page.locator('[data-act="list"]').click();
  await A.page.locator('.tv-confirm button.primary').click();
  await expect(A.page.locator('.mk-list .mk-row')).toHaveCount(2);
  // browse on the desktop: the card on hover
  await A.page.locator('.mk-view[data-view="browse"]').click();
  await expect(A.page.locator('.mk-list .mk-row')).toHaveCount(2);
  await A.page.locator('.mk-list .mk-row.mine').first().hover();
  await expect.poll(() => A.page.evaluate(() => { const b = document.getElementById('tipbox'); return b && !b.hidden ? b.textContent : ''; })).toMatch(/Copper Ore|Gullwick Longsword/);
  await A.page.screenshot({ path: join(SHOTS, 'market-browse-desktop.png') });

  // a phone buyer
  const B = await enter(browser, { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, 'Marketbuyer');
  await post('/give', { name: B.name, gold: 500, items: 0 });
  await B.page.waitForTimeout(1000);
  await B.page.evaluate(() => tv.panel('market'));
  await expect(B.page.locator('.mk-list .mk-row')).toHaveCount(2);
  await B.page.locator('.mk-tabs .chip[data-tab="gear"]').tap();
  await expect(B.page.locator('.mk-list .mk-row')).toHaveCount(1);
  await expect(B.page.locator('.mk-list .mk-row')).toContainText('Gullwick Longsword');
  await expect(B.page.locator('.mk-list .mk-row')).toContainText('Marketseller');
  // the window fits the phone; nothing scrolls sideways
  const fit = await B.page.evaluate(() => { const r = document.getElementById('panel-partyhub').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, wide: document.querySelector('.mk-list').scrollWidth > document.querySelector('.mk-list').clientWidth + 2 }; });
  expect(fit.l).toBeGreaterThanOrEqual(-1); expect(fit.r).toBeLessThanOrEqual(fit.w + 1); expect(fit.wide).toBe(false);
  await B.page.screenshot({ path: join(SHOTS, 'market-browse-phone.png') });
  await B.page.locator('.mk-list .mk-row [data-act="buy"]').tap();
  await expect(B.page.locator('.tv-confirm')).toContainText('for 150 gold');
  await B.page.screenshot({ path: join(SHOTS, 'market-buy-confirm-phone.png') });
  await B.page.locator('.tv-confirm button.primary').tap();
  await expect.poll(() => B.page.evaluate(() => tv.social().gold)).toBe(350);
  await expect.poll(() => B.page.evaluate(() => tv.social().mail.unread), { timeout: 15000 }).toBeGreaterThan(0);
  // the sword is in the mail; open it
  await B.page.evaluate(() => tv.panel('mail'));
  await B.page.locator('.ml-row').filter({ hasText: 'Bought: Gullwick Longsword' }).first().tap();
  await expect(B.page.locator('.ml-tag')).toContainText('From the Market');
  await B.page.screenshot({ path: join(SHOTS, 'market-letter-phone.png') });
  await B.page.locator('[data-act="take"]').tap();
  await expect.poll(() => B.page.evaluate(() => tv.social().bag.some(i => i.name === 'Gullwick Longsword'))).toBe(true);

  // the seller's gold came by mail
  await expect.poll(() => A.page.evaluate(() => tv.social().mail.unread), { timeout: 15000 }).toBeGreaterThan(0);
  await A.page.evaluate(() => tv.panel('mail'));
  await A.page.locator('.ml-row').filter({ hasText: 'Sold: Gullwick Longsword' }).first().click();
  await expect(A.page.locator('.ml-body')).toContainText('Marketbuyer bought your Gullwick Longsword on the Market. Your 150 gold is in this letter.');
  await A.page.screenshot({ path: join(SHOTS, 'market-sold-letter-desktop.png') });
  const ga = await A.page.evaluate(() => tv.social().gold);
  await A.page.locator('[data-act="take"]').click();
  await expect.poll(() => A.page.evaluate(() => tv.social().gold)).toBe(ga + 150);

  // full bag: the seller takes the ore off the Market, fills the Items tab, and the letter keeps the ore
  await A.page.evaluate(() => tv.panel('market'));
  await A.page.locator('.mk-view[data-view="mine"]').click();
  await A.page.locator('.mk-list [data-act="cancel"]').click();
  await A.page.locator('.tv-confirm button.primary').click();
  await expect(A.page.locator('.mk-list .mk-row')).toHaveCount(0);
  const cap = await A.page.evaluate(() => tv.state().you?.bagMax || 40);
  await post('/grant', { name: A.name, items: Array.from({ length: cap }, (_, i) => ({ kind: 'junk', name: 'Pebble ' + i, rarity: 'normal', value: 0 })) });
  await A.page.waitForTimeout(1500);
  await A.page.evaluate(() => tv.panel('mail'));
  await A.page.locator('.ml-row').filter({ hasText: 'Taken off the Market' }).first().click();
  await expect(A.page.locator('.ml-room')).toContainText('Everything stays in the letter');
  await expect(A.page.locator('[data-act="take"]')).toBeDisabled();
  await A.page.screenshot({ path: join(SHOTS, 'market-fullbag-letter-desktop.png') });

  expect(A.errors, A.errors.join('\n')).toEqual([]);
  expect(B.errors, B.errors.join('\n')).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
