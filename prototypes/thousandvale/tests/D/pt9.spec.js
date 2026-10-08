// Stream D-UI — play-test 9 in a real browser against a real server (tests/D/m3-server.mjs): X3 windows drag (the bag first),
// X4 the barber's "Save (Free)" and no sideways scroll, X1 the admin's Online players + a long message of the day that wraps,
// X6 delete a character from the title screen (type the name). Desktop and a 393 x 852 phone. Shots: tests/D/shots/pt9-*.png.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt9.spec.js
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
const soft = (name, fn) => test(name, async ({ browser }) => { test.setTimeout(420000); try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 60)} :: ${String(e.message).slice(0, 900)}`); console.log('[pt9 FAIL]', name.slice(0, 60), '\n', String(e.message).slice(0, 900)); } });

test.beforeAll(async () => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

const MOTD = 'Welcome to Thousandvale, Ninea. 3 players are online now; 12 have signed in over the past 24 hours. The Longroad Carters now run between every town, backpacks are sold at the tailor, and the barber is free this week.';
const ONLINE = { ok: true, at: Date.now(), count: 4, accounts: 3, list: [
  { char: 15, name: 'Xanaver', level: 4, cls: 'pyromancer', clsName: 'Pyromancer', where: 'Torborhold', username: 'radgh', claimed: true, admin: true },
  { char: 22, name: 'Stormy', level: 6, cls: 'stormcaller', clsName: 'Stormcaller', where: 'The Torbor Fields', username: 'stormy', claimed: true },
  { char: 31, name: 'Stubbs', level: 1, cls: 'warrior', clsName: 'Warrior', where: 'Torborhold', claimed: false },
  { char: 40, name: 'Brem', level: 9, cls: 'knight', clsName: 'Knight', where: 'in a dungeon', username: 'brem', claimed: true }] };
async function enter(browser, opts, name) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(base + `?quality=low&autoplay=1&name=${name}&cls=warrior&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && window.tvui8, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
async function drag(page, sel, dx, dy) {
  const h = await page.locator(sel).boundingBox();
  const x = h.x + 60, y = h.y + Math.min(14, h.height / 2);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(120);
}
const noSideScroll = (page, sels) => page.evaluate(list => list.map(s => { const e = document.querySelector(s); return e ? { s, over: e.scrollWidth - e.clientWidth } : { s, over: 0, missing: true }; }), sels);

soft('desktop: windows drag and stay on screen; the barber is "Save (Free)"; Online players; a long message of the day wraps; delete a character', async ({ browser }) => {
  const { ctx, page, errors } = await enter(browser, { viewport: { width: 1366, height: 800 } }, 'Ninea');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt9-${n}.png`) });

  // ---- X3: the bag first
  await page.keyboard.press('KeyB');
  await expect(page.locator('#bag')).toBeVisible();
  const b0 = await rect(page, '#bag');
  await drag(page, '#bag header', -260, 120);
  const b1 = await rect(page, '#bag');
  expect(Math.round(b1.x - b0.x), 'the bag followed the pointer').toBe(-260); expect(Math.round(b1.y - b0.y)).toBe(120);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tv.panel.bag')))).toMatchObject({ x: Math.round(b1.x), y: Math.round(b1.y) });
  expect(await page.evaluate(() => localStorage.getItem('tv.panel.bag')), 'kept for the session only').toBe(null);
  await shot('x3-bag-moved');
  await page.keyboard.press('KeyB'); await page.keyboard.press('KeyB');
  const b2 = await rect(page, '#bag');
  expect([Math.round(b2.x), Math.round(b2.y)], 'it reopens where you left it').toEqual([Math.round(b1.x), Math.round(b1.y)]);
  // never off screen: thrown at every corner
  for (const [dx, dy] of [[-3000, -3000], [3000, 3000], [3000, -3000], [-3000, 3000]]) {
    await drag(page, '#bag header', dx, dy);
    const r = await rect(page, '#bag');
    expect(r.x, `left edge after ${dx},${dy}`).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.r).toBeLessThanOrEqual(1366); expect(r.b).toBeLessThanOrEqual(800);
  }
  await shot('x3-bag-corner');
  // a click on a button in the title bar is still a click, and a double-click on the bar puts the window back
  await page.locator('#bag header').dblclick({ position: { x: 120, y: 10 } });
  const b3 = await rect(page, '#bag');
  expect([Math.round(b3.x), Math.round(b3.y)], 'double-click: back where it opens by itself').toEqual([Math.round(b0.x), Math.round(b0.y)]);
  expect(await page.evaluate(() => sessionStorage.getItem('tv.panel.bag'))).toBe(null);
  await page.locator('#bag-close').click();
  await expect(page.locator('#bag')).toBeHidden();
  // ...and the other floating windows: the journal, the character menu, feedback
  for (const [open, sel] of [[() => page.keyboard.press('KeyJ'), '#panel-journal'], [() => page.keyboard.press('KeyV'), '#panel-sheet'], [() => page.evaluate(() => tvui5.feedback('bug')), '#panel-feedback']]) {
    await open(); await expect(page.locator(sel)).toBeVisible();
    const p0 = await rect(page, sel);
    await drag(page, `${sel} .tvp-head`, -180, -40);      // (up: a tall window has no room to go down — the clamp keeps all of it on screen)
    const p1 = await rect(page, sel);
    expect(Math.round(p1.x - p0.x), `${sel} dragged`).toBe(-180); expect(Math.round(p1.y - p0.y)).toBe(-40);
    await drag(page, `${sel} .tvp-head`, 4000, 4000);
    const p2 = await rect(page, sel);
    expect(p2.r, `${sel} stays on screen`).toBeLessThanOrEqual(1366); expect(p2.b).toBeLessThanOrEqual(800);
    await page.locator(`${sel} .tvp-head h3`).dblclick();
    expect(await page.evaluate(s => document.querySelector(s).classList.contains('placed'), sel), `${sel}: double-click resets`).toBe(false);
    await page.evaluate(s => document.querySelector(s + ' .tvp-x').click(), sel);
  }

  // ---- X4: the barber — free, short, and nothing scrolls sideways
  // a barber who charges: the button names the price of what you changed
  await page.evaluate(() => tvui2.editor('barber', { prices: { hair: 40, hairColour: 10, beard: 20, eyes: 10, face: 10, skin: 30, body: 30, everything: 200 } }));
  await expect(page.locator('#panel-appearance')).toBeVisible();
  const save = page.locator('#panel-appearance [data-act="save"]');
  await expect(save).toHaveText('Save (Free)');                      // nothing changed yet
  await page.locator('#panel-appearance [data-slot="hair"] .ap-step').last().click();
  await expect(save).toHaveText(/^Save \(\d+ gold\)$/);
  await page.evaluate(() => thousandvale.ui2.ed.panel.close());
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const b of document.querySelectorAll('.tv-confirm button')) if (/discard|leave|yes|close/i.test(b.textContent)) b.click(); });
  // the barber as he is now: free (the server quotes 0 for everything)
  await page.evaluate(() => tvui2.editor('barber', { free: true, prices: { hair: 0, hairColour: 0, beard: 0, eyes: 0, face: 0, skin: 0, body: 0, everything: 0 } }));
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await page.locator('#panel-appearance [data-slot="hair"] .ap-step').last().click();
  await expect(save).toHaveText('Save (Free)');
  // the label for every case, through the editor's own painter
  const labels = await page.evaluate(async () => { const c = await import('./js/client/ui/pt9-core.js'); return [c.barberSaveText(0, { free: true }), c.barberSaveText(0, { prices: { hair: 0 } }), c.barberSaveText(40, { prices: { hair: 40 } })]; });
  expect(labels).toEqual(['Save (Free)', 'Save (Free)', 'Save (40 gold)']);
  for (const o of await noSideScroll(page, ['#panel-appearance .tvp-body', '#panel-appearance .ap-body', '#panel-appearance'])) expect(o.over, `${o.s} scrolls sideways by ${o.over}px`).toBeLessThanOrEqual(0);
  await shot('x4-barber');
  await page.evaluate(() => document.querySelector('#panel-appearance .tvp-x')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const b of document.querySelectorAll('.tv-confirm button')) if (/discard|leave|yes|close/i.test(b.textContent)) b.click(); });

  // ---- X1: the message of the day wraps, whole; the admin's window
  await page.evaluate(t => tv.fake('chat', { ch: 'system', name: 'The Vale', text: t, motd: true, online: 3, day: 12 }), MOTD);
  await page.waitForTimeout(300);
  const motd = await page.evaluate(t => { const p = [...document.querySelectorAll('#chat-log p, .chat-log p')].reverse().find(x => x.textContent.includes('Welcome to Thousandvale')); if (!p) return null; const r = p.getBoundingClientRect(), box = p.parentElement.getBoundingClientRect(); return { whole: p.textContent.includes(t.slice(-40)), over: p.scrollWidth - p.clientWidth, lines: Math.round(r.height / parseFloat(getComputedStyle(p).lineHeight || 18)), inside: r.right <= box.right + 1 }; }, MOTD);
  expect(motd, 'the line is in the chat log').toBeTruthy();
  expect(motd.whole, 'not truncated').toBe(true); expect(motd.over).toBeLessThanOrEqual(0); expect(motd.lines).toBeGreaterThan(1); expect(motd.inside).toBe(true);
  expect(await page.evaluate(() => tvui8.state().online.open)).toBe(false);
  expect(await page.evaluate(() => thousandvale.ui8.online.open()), 'not for a player who is not an admin').toBe(false);
  await page.evaluate(m => { thousandvale.S.net.admin = true; thousandvale.ui8.online.open(); tv.fake('adminOnline', m); }, ONLINE);
  await expect(page.locator('#panel-online tbody tr')).toHaveCount(4);
  expect(await page.locator('#panel-online tbody tr td.on-name').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Brem')]));
  expect((await page.locator('#panel-online tbody tr').first().textContent())).toContain('Brem');
  await expect(page.locator('#panel-online .tvp-sub')).toHaveText('4 players online · 3 accounts');
  await page.locator('#panel-online [data-sort="level"]').click();
  expect(await page.locator('#panel-online tbody td.on-level').allTextContents()).toEqual(['9', '6', '4', '1']);
  await page.locator('#panel-online [data-sort="where"]').click();
  expect((await page.locator('#panel-online tbody td.on-where').allTextContents())[0]).toBe('in a dungeon');
  await shot('x1-online-and-motd');
  await page.evaluate(() => { window.__adm = 0; const n = thousandvale.S.net; for (const k of ['adminOnline', 'adminOp']) if (typeof n[k] === 'function') { const f = n[k].bind(n); n[k] = (...a) => { window.__adm++; return f(...a); }; } });
  await page.locator('#panel-online [data-act="refresh"]').click();
  expect(await page.evaluate(() => window.__adm), 'Refresh asks the server again').toBe(1);
  // the Feedback window offers it to an admin, beside Reports
  await page.evaluate(() => { thousandvale.ui8.online.panel.close(); tvui5.feedback('bug'); });
  await expect(page.locator('#panel-feedback [data-act="online"]')).toHaveText('Online players');
  await page.evaluate(() => thousandvale.ui5.feedback.panel.close());
  expect(errors, 'no page errors').toEqual([]);

  // ---- X6: the title screen — the list, the limit line, Delete with the typed name (a real deletion on a real server)
  await page.goto(base + '?quality=low&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await expect(page.locator('#char-chips .char-row')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('#front')).toBeVisible();
  await expect(page.locator('#front .char-limit')).toHaveText('1 of 20 characters');
  const scroll = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('char-chips')); return { y: c.overflowY, max: c.maxHeight }; });
  expect(scroll.y, 'the list scrolls once it is long').toBe('auto'); expect(scroll.max).not.toBe('none');
  await page.locator('#char-chips .char-del').click();
  const box = page.locator('.char-delete');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Delete Ninea?'); await expect(box).toContainText('gone for good');
  await expect(box.locator('[data-act="delete"]')).toBeDisabled();
  await box.locator('input').fill('Nine');
  await expect(box.locator('[data-act="delete"]')).toBeDisabled();
  await shot('x6-delete-confirm');
  await box.locator('input').fill('ninea');
  await expect(box.locator('[data-act="delete"]')).toBeEnabled();
  await box.locator('[data-act="delete"]').click();
  await expect(box).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#char-chips .char-row')).toHaveCount(0);
  await expect(page.locator('#front .char-said')).toContainText('Ninea is deleted.');
  await shot('x6-deleted');
  // twenty of twenty: New character is shut and says why
  await page.evaluate(() => { const list = []; for (let i = 0; i < 20; i++) list.push({ id: 900 + i, name: 'Alt' + (i + 1), level: 1 + i, cls: 'warrior', clsName: 'Warrior' }); thousandvale.account.showChars(list, 'radgh'); document.getElementById('front').hidden = false; document.getElementById('login').hidden = true; });
  await expect(page.locator('#char-chips .char-row')).toHaveCount(20);
  await expect(page.locator('#front .char-limit')).toContainText('20 of 20 characters');
  await expect(page.locator('#new-char')).toBeDisabled();
  const list = await page.evaluate(() => { const e = document.getElementById('char-chips'); e.scrollTop = 9999; return { scrolls: e.scrollHeight > e.clientHeight + 4, top: e.scrollTop, bottom: e.getBoundingClientRect().bottom, btn: document.getElementById('new-char').getBoundingClientRect().bottom }; });
  expect(list.scrolls).toBe(true); expect(list.top).toBeGreaterThan(0); expect(list.btn, 'New character is still on screen under a full list').toBeLessThanOrEqual(800);
  await shot('x6-twenty');
  await ctx.close();
});

soft('phone 393 x 852: nothing drags (windows are sheets), the barber window has no sideways scroll, Online players and the delete confirm fit', async ({ browser }) => {
  const { ctx, page, errors } = await enter(browser, { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, 'Ninephone');
  const shot = n => page.screenshot({ path: join(SHOTS, `pt9-phone-${n}.png`) });
  const phone = await page.evaluate(() => document.documentElement.dataset.layout === 'phone');
  console.log('[pt9] phone layout on:', phone);
  await page.evaluate(() => thousandvale.bag.toggle(true));
  const b0 = await rect(page, '#bag');
  await page.evaluate(() => { const h = document.querySelector('#bag header'), r = h.getBoundingClientRect(); const ev = (t, x, y) => h.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 5, pointerType: 'touch', clientX: x, clientY: y, button: 0 })); ev('pointerdown', r.left + 60, r.top + 10); ev('pointermove', r.left + 160, r.top + 210); ev('pointerup', r.left + 160, r.top + 210); });
  const b1 = await rect(page, '#bag');
  if (phone) { expect([b1.x, b1.y], 'a sheet does not move').toEqual([b0.x, b0.y]); expect(await page.evaluate(() => document.getElementById('bag').classList.contains('placed'))).toBe(false); expect(await page.evaluate(() => sessionStorage.getItem('tv.panel.bag'))).toBe(null); }
  await page.evaluate(() => thousandvale.bag.toggle(false));

  await page.evaluate(() => tvui2.editor('barber', { free: true, prices: { hair: 0, hairColour: 0, beard: 0, eyes: 0, face: 0, skin: 0, body: 0, everything: 0 } }));
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await expect(page.locator('#panel-appearance [data-act="save"]')).toHaveText('Save (Free)');
  // the whole window, top to bottom: no element pokes out sideways
  const wide = await page.evaluate(() => { const P = document.getElementById('panel-appearance'), out = []; const body = P.querySelector('.ap-body'); for (const top of [0, 0.5, 1]) { body.scrollTop = (body.scrollHeight - body.clientHeight) * top; for (const s of ['.tvp-body', '.ap-body']) { const e = P.querySelector(s); if (e.scrollWidth - e.clientWidth > 0) out.push(`${s} +${e.scrollWidth - e.clientWidth}px at ${top}`); } }
    for (const e of P.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 0.5 || r.left < -0.5)) { out.push(`${e.tagName}.${e.className} sticks out (${Math.round(r.left)}..${Math.round(r.right)})`); break; } }
    if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways'); return out; });
  expect(wide, wide.join('; ')).toEqual([]);
  await shot('x4-barber');
  await page.evaluate(() => { for (const q of ['.ap-body', '.tvp-body']) { const b = document.querySelector('#panel-appearance ' + q); b.scrollTop = b.scrollHeight; } document.querySelector('#panel-appearance [data-act="save"]').scrollIntoView({ block: 'end' }); });
  { const r = await rect(page, '#panel-appearance [data-act="save"]'); expect(r.x, 'Save is on screen').toBeGreaterThanOrEqual(0); expect(r.r).toBeLessThanOrEqual(393); expect(r.b).toBeLessThanOrEqual(852); }
  await page.waitForTimeout(200);
  await shot('x4-barber-foot');
  await page.evaluate(() => document.querySelector('#panel-appearance .tvp-x')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const b of document.querySelectorAll('.tv-confirm button')) if (/discard|leave|yes|close/i.test(b.textContent)) b.click(); });

  await page.evaluate(m => { thousandvale.S.net.admin = true; thousandvale.ui8.online.open(); tv.fake('adminOnline', m); }, ONLINE);
  await expect(page.locator('#panel-online tbody tr')).toHaveCount(4);
  const o = await rect(page, '#panel-online');
  expect(o.x).toBeGreaterThanOrEqual(-1); expect(o.r).toBeLessThanOrEqual(394);
  expect(await page.evaluate(() => { const w = document.querySelector('#panel-online .on-wrap'); return w.scrollWidth - w.clientWidth; }), 'the table fits the width').toBeLessThanOrEqual(0);
  await shot('x1-online');
  await page.evaluate(() => thousandvale.ui8.online.panel.close());
  await page.evaluate(t => tv.fake('chat', { ch: 'system', name: 'The Vale', text: t, motd: true }), MOTD);
  expect(errors, 'no page errors').toEqual([]);

  await page.goto(base + '?quality=low&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await expect(page.locator('#char-chips .char-row')).toHaveCount(1, { timeout: 30000 });
  await page.evaluate(() => { const list = []; for (let i = 0; i < 12; i++) list.push({ id: 900 + i, name: 'Alt' + (i + 1), level: 1 + i, cls: 'warrior', clsName: 'Warrior' }); thousandvale.account.showChars(list, null); });
  await expect(page.locator('#char-chips .char-row')).toHaveCount(12);
  await shot('x6-list');
  await page.evaluate(() => document.querySelector('#char-chips .char-del').click());      // (the list is redrawn as each portrait finishes: a real tap is retried for seconds under a software renderer)
  await expect(page.locator('.char-delete')).toBeVisible();
  const d = await rect(page, '.char-delete');
  expect(d.x).toBeGreaterThanOrEqual(0); expect(d.r).toBeLessThanOrEqual(393); expect(d.b).toBeLessThanOrEqual(852);
  await shot('x6-delete-confirm');
  await ctx.close();
});

test('play-test 9: every check above passed', () => { expect(fails, fails.join('\n\n')).toEqual([]); });
