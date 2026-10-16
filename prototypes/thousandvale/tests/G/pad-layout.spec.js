// 2026-10-16 — the CONTROLLER layout, in the REAL game against a real server (tests/D/m3-server.mjs), on the Steam Deck's
// screen (1280 x 800) with a faked navigator.getGamepads (the same trick as gamepad.spec.js / multi-pad.test.js):
//   · touching the pad switches <html data-layout="pad"> on (debounced), the mouse switches it off again
//   · the compact HUD: no menu bar, the chat folded to fading lines, the trackers folded to one line, the hint strip
//   · LT + View opens the chat with the on-screen keyboard, B puts both away; LT + Menu shows / folds the trackers
//   · Menu opens the controller menu; EVERY tile opens its window, the focus ring is in it, the ring moves, LB / RB
//     change tabs where there are tabs, B backs out to the world — shop and crafting too (opened by their hooks)
//   · the Layout setting forces it; and a 1920 x 1080 pass
// Screenshots land in tests/G/shots/pad-layout/ (look at them: tests/G/shots/pad-layout/report.json lists each window).
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/pad-layout.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PAD_INDEX, PAD_MENU_TILES } from '../../js/client/input/bindings.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots', 'pad-layout');
mkdirSync(SHOTS, { recursive: true });
test.describe.configure({ mode: 'serial' });

function fakePad(id) {
  const pad = { id, index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad; window.__padOn = false;
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
}
const setBtn = (page, name, on) => page.evaluate(([i, v]) => { const b = window.__pad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; window.__pad.timestamp++; }, [PAD_INDEX[name], on]);
const press = async (page, name, ms = 90) => { await setBtn(page, name, true); await page.waitForTimeout(ms); await setBtn(page, name, false); await page.waitForTimeout(110); };
const chord = async (page, mod, name) => { await setBtn(page, mod, true); await page.waitForTimeout(60); await press(page, name); await setBtn(page, mod, false); await page.waitForTimeout(60); };
const state = page => page.evaluate(() => window.tvinput.state());
const layout = page => page.evaluate(() => document.documentElement.dataset.layout || 'desktop');
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + '.png') });

/** The window the focus ring is confined to (null = the world). */
const where = page => page.evaluate(() => { const c = window.tvinput.focus.container(); return c ? (c.id || c.className.split(' ')[0]) : null; });
/** Back out to the world with B (at most five presses). */
async function backOut(page) { for (let i = 0; i < 5 && await where(page); i++) await press(page, 'B'); return where(page); }

let srv, ctx, page, port, hook; const errors = [];
const post = (path, body) => fetch(hook + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: String(e) }));
test.beforeAll(async ({ browser }) => {
  test.setTimeout(420000);
  const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  port = await freePort(); const hk = await freePort(); hook = `http://127.0.0.1:${hk}`;
  srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(fakePad, 'Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)');
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?quality=low&fresh=1&tod=0.45&autoplay=1&name=Deckard&cls=warrior`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('touching the pad switches the controller layout on (debounced); the compact HUD shows the world', async () => {
  test.setTimeout(120000);
  expect(await layout(page)).toBe('desktop');
  await page.evaluate(() => { window.__padOn = true; });
  await press(page, 'X');
  await expect.poll(() => layout(page), { timeout: 5000 }).toBe('pad');
  const s = await state(page);
  expect(s.device).toBe('pad'); expect(s.layout).toBe('pad'); expect(s.glyphs).toBe('xbox');      // the Deck's own buttons read A B X Y
  await expect(page.locator('#menubar')).toBeHidden();
  await expect(page.locator('#chat .chat-entry')).toBeHidden();
  await expect(page.locator('#chat .chat-tabs')).toBeHidden();
  await expect(page.locator('#right-col')).toBeHidden();
  await expect(page.locator('.pad-info')).toBeVisible();
  await expect(page.locator('.pad-hints')).toBeVisible();
  await expect(page.locator('.pad-hints kbd').first()).toHaveText('Menu');
  await expect(page.locator('.pad-hints kbd').nth(3)).toHaveText('LT+View');
  await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('X');
  // nothing of the HUD sits in the middle of the screen (where you fight): the centre box 40% x 40% is empty
  const centre = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, box = { l: W * 0.3, r: W * 0.7, t: H * 0.3, b: H * 0.7 }, hits = [];
    for (const e of document.querySelectorAll('#hud > *, #right-col, .pad-info, .pad-hints, #chat, #actionbar')) {
      if (!e.getClientRects().length || getComputedStyle(e).visibility === 'hidden' || e.id === 'vignette' || e.id === 'callout' || e.classList.contains('layer')) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.width > W * 0.9 && r.height > H * 0.9) continue;          // a full-screen layer (the edge arrows, the vignette) holds nothing in the middle itself
      if (r.left < box.r && r.right > box.l && r.top < box.b && r.bottom > box.t) hits.push(e.id || e.className);
    }
    return hits;
  });
  expect(centre, 'nothing over the middle of the screen').toEqual([]);
  await page.waitForTimeout(7600);                 // the chat lines that came in at login fade
  await shot(page, 'deck-world');
});

test('chat: a new line shows for a few seconds and fades; LT + View opens it with the keyboard, B puts it away', async () => {
  test.setTimeout(120000);
  await page.evaluate(() => thousandvale.hud.chat('Sella: anyone for the Barrow? need a tank', 'system'));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.chatpeek || '')).toBe('1');
  await expect.poll(() => page.evaluate(() => { const l = document.getElementById('chat-log'); return { op: +getComputedStyle(l).opacity, peek: document.documentElement.dataset.chatpeek || '', lines: [...l.children].filter(p => getComputedStyle(p).display !== 'none').length }; }), { timeout: 4000 }).toMatchObject({ op: 1, peek: '1' });
  await shot(page, 'deck-chat-peek');
  await chord(page, 'LT', 'BACK');
  await expect(page.locator('.tv-osk')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.chat || '')).toBe('open');
  await expect(page.locator('#chat .chat-entry')).toBeVisible();
  await shot(page, 'deck-chat-open');
  await press(page, 'B');
  await expect(page.locator('.tv-osk')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.chat || '')).toBe('');
  await expect(page.locator('#chat .chat-entry')).toBeHidden();
  expect((await state(page)).pad.mode).toBe('world');
});

test('trackers: one line under the minimap; LT + Menu shows them in full and folds them again', async () => {
  test.setTimeout(60000);
  expect((await state(page)).hudInfo).toBe(false);
  await chord(page, 'LT', 'START');
  await expect.poll(() => state(page).then(s => s.hudInfo)).toBe(true);
  // (a fresh character may track nothing yet: the column is then shown but empty, so read its display rather than its size)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('right-col')).display)).toBe('flex');
  await expect(page.locator('#panel-padmenu')).toBeHidden();       // LT + Menu is not Menu
  await shot(page, 'deck-trackers-open');
  await chord(page, 'LT', 'START');
  await expect.poll(() => state(page).then(s => s.hudInfo)).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('right-col')).display)).toBe('none');
});

test('Menu opens the controller menu: tiles, the ring on Bag, the D-pad moves, B closes', async () => {
  test.setTimeout(60000);
  await press(page, 'START');
  await expect(page.locator('#panel-padmenu')).toBeVisible();
  await expect(page.locator('#panel-padmenu .pad-tile')).toHaveCount(PAD_MENU_TILES.length);
  await expect.poll(() => page.evaluate(() => window.tvinput.focus.current?.dataset?.tile || null)).toBe('bag');
  await press(page, 'RIGHT');
  expect(await page.evaluate(() => window.tvinput.focus.current?.dataset?.tile)).toBe('sheet');
  await press(page, 'DOWN');
  expect(await page.evaluate(() => window.tvinput.focus.current?.dataset?.tile)).toBe('friends');
  await press(page, 'LEFT'); await press(page, 'UP');
  await shot(page, 'deck-menu');
  await press(page, 'B');
  await expect(page.locator('#panel-padmenu')).toBeHidden();
  expect((await state(page)).pad.mode).toBe('world');
  // View = the map, and View again closes it
  await press(page, 'BACK');
  await expect(page.locator('#panel-map')).toBeVisible();
  await press(page, 'BACK');
  await expect(page.locator('#panel-map')).toBeHidden();
});

test('every tile opens its window, and the window works with the controller', async () => {
  test.setTimeout(400000);
  const report = [];
  for (const t of PAD_MENU_TILES.filter(x => !['logout', 'chat'].includes(x.id))) {
    await backOut(page);
    await press(page, 'START');
    await expect(page.locator('#panel-padmenu')).toBeVisible();
    await page.evaluate(id => window.tvinput.focus.set(document.querySelector(`#panel-padmenu [data-tile="${id}"]`)), t.id);
    await press(page, 'A');
    await page.waitForTimeout(t.id === 'perks' || t.id === 'skills' || t.id === 'map' ? 900 : 450);
    const row = { tile: t.id, window: await where(page) };
    row.ok = !!row.window && row.window !== 'panel-padmenu';
    const s0 = await state(page);
    row.mode = s0.pad.mode; row.steering = s0.steering; row.focus = s0.focus;
    row.ringShown = await page.evaluate(() => !document.querySelector('.pad-ring').hidden);
    // the ring moves (a canvas window steers a pointer instead)
    if (!row.steering) { const f0 = await page.evaluate(() => window.tvinput.focus.current); await press(page, 'DOWN'); await press(page, 'DOWN'); row.moved = await page.evaluate(f => window.tvinput.focus.current !== f, f0); }
    // tabs on LB / RB
    const tabSig = () => page.evaluate(() => { const c = window.tvinput.focus.container(); const on = c && [...c.querySelectorAll('[role="tab"][aria-selected="true"], [role="tab"][aria-checked="true"], .hub-tab.on, .set-tabs .on, .j-tabs .on')].map(e => e.textContent.trim()).join('|'); return on || ''; });
    const before = await tabSig(); await press(page, 'RB'); await page.waitForTimeout(200); const after = await tabSig();
    row.tabs = before ? (after !== before ? `${before} -> ${after}` : `stuck on ${before}`) : 'none';
    if (after !== before) { await press(page, 'LB'); await page.waitForTimeout(150); }
    // the right stick scrolls (no assertion: many windows are short)
    await page.evaluate(() => { window.__pad.axes[3] = 0.9; }); await page.waitForTimeout(250); await page.evaluate(() => { window.__pad.axes[3] = 0; });
    await shot(page, 'deck-win-' + t.id);
    row.back = await backOut(page);
    report.push(row);
  }
  // shop and crafting open from a townsperson: their hooks, then the same checks
  for (const [id, open] of [
    ['shop', async () => {
      // the shop closes when you walk away from the counter: stand next to the nearest townsperson first
      const near = await page.evaluate(() => { const me = thousandvale.actors.get(thousandvale.S.selfId); let best = null; for (const a of thousandvale.actors.actors.values()) { if (a.kind !== 'npc' || a.dead) continue; const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z); if (!best || d < best.d) best = { id: a.id, d, x: a.pos.x, z: a.pos.z }; } return best; });
      if (near && near.d > 3) { await post('/teleport', { name: 'Deckard', x: near.x + 1.2, z: near.z + 1.2 }); await page.waitForTimeout(1500); }
      const npc = near?.id ?? null;
      // one evaluate: the recorded view lands before the server's answer (a stranger's "will not deal" closes only a shop with no view)
      await page.evaluate(n => tvui2.openShop(n, 'Hal Fletchard') || tvui2.fake('shopView', { npc: n, name: 'Hal Fletchard', role: 'merchant', title: 'General goods', categories: { other: 'Rings' }, sellRate: 0.06, buyback: [],
        stock: [{ id: 'r1', cat: 'other', price: 40, item: { name: 'Silver Band', rarity: 'magic', slot: 'ring', type: 'accessory', level: 1, affixes: [] } }, { id: 'r2', cat: 'other', price: 15, item: { name: 'Plain Ring', rarity: 'normal', slot: 'ring', type: 'accessory', level: 1 } }], sell: [] }), npc); }],
    ['crafting', async () => { await page.evaluate(() => window.tvprof?.open?.('smithing')); }],
  ]) {
    await backOut(page);
    await press(page, 'X'); await page.waitForTimeout(150);      // stay on the pad
    await open(); await page.waitForTimeout(700);
    const row = { tile: id, window: await where(page) }; row.ok = !!row.window;
    const s0 = await state(page); row.mode = s0.pad.mode; row.focus = s0.focus; row.ringShown = await page.evaluate(() => !document.querySelector('.pad-ring').hidden);
    const f0 = await page.evaluate(() => window.tvinput.focus.current); await press(page, 'DOWN'); await press(page, 'DOWN'); row.moved = await page.evaluate(f => window.tvinput.focus.current !== f, f0);
    await shot(page, 'deck-win-' + id);
    row.back = await backOut(page);
    report.push(row);
  }
  writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 1));
  for (const r of report) {
    expect(r.ok, `${r.tile}: opened a window the ring is in — ${JSON.stringify(r)}`).toBe(true);
    expect(r.mode, `${r.tile}: the pad drives the window`).toBe('menu');
    expect(r.ringShown, `${r.tile}: the ring shows`).toBe(true);
    expect(r.steering || r.moved, `${r.tile}: the D-pad moves the ring`).toBe(true);
    expect(r.back, `${r.tile}: B backs out to the world`).toBe(null);
  }
});

test('the mouse takes over again (after a pause, no flicker); the Layout setting forces Controller', async () => {
  test.setTimeout(60000);
  await press(page, 'X');
  expect(await layout(page)).toBe('pad');
  // one small nudge does not count
  await page.mouse.move(400, 400); await page.mouse.move(410, 404); await page.waitForTimeout(1900);
  expect(await layout(page)).toBe('pad');
  // a real move does — and not at once
  await page.evaluate(() => { window.__flip = {}; window.tvinput.device.on(d => { if (d === 'keyboard' && !window.__flip.dev) window.__flip.dev = performance.now(); });
    new MutationObserver(() => { if (!document.documentElement.dataset.layout && !window.__flip.lay) window.__flip.lay = performance.now(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] }); });
  await page.mouse.move(400, 420); await page.mouse.move(640, 430, { steps: 12 });
  await expect.poll(() => layout(page), { timeout: 6000 }).toBe('desktop');
  const flip = await page.evaluate(() => window.__flip);
  expect(flip.lay - flip.dev, 'the layout waits ~1.5 s after the mouse takes over (no flicker)').toBeGreaterThan(1300);
  await expect(page.locator('#menubar')).toBeVisible();
  // forced on: the keyboard and mouse no longer switch it off
  await page.evaluate(async () => { const m = await import('./js/client/input/layout.js'); m.setLayoutChoice('pad'); });
  await expect.poll(() => layout(page)).toBe('pad');
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(1800);
  expect(await layout(page)).toBe('pad');
  await page.evaluate(async () => { const m = await import('./js/client/input/layout.js'); m.setLayoutChoice('auto'); });
  await expect.poll(() => layout(page), { timeout: 4000 }).toBe('desktop');
});

test('1920 x 1080 with a pad: the same compact HUD and the menu', async () => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await press(page, 'X');
  await expect.poll(() => layout(page), { timeout: 5000 }).toBe('pad');
  await page.waitForTimeout(7600);
  await shot(page, 'hd-world');
  await press(page, 'START');
  await expect(page.locator('#panel-padmenu')).toBeVisible();
  await shot(page, 'hd-menu');
  await press(page, 'B');
  await press(page, 'START'); await page.evaluate(() => window.tvinput.focus.set(document.querySelector('#panel-padmenu [data-tile="bag"]'))); await press(page, 'A'); await page.waitForTimeout(500);
  await shot(page, 'hd-bag');
  await backOut(page);
  expect(errors).toEqual([]);
});
