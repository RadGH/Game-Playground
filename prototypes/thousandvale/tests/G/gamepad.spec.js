// Stream G (play-test 5, T27) — controller support, with a faked navigator.getGamepads (a standard-mapping pad whose
// buttons and sticks the test sets). Two halves:
//   A. in the interface gallery (no server, fast): the quick wheel, the focus ring in windows, tabs, the steered pointer
//      on the perk forest, the on-screen keyboard, glyph sets, hints that follow the device;
//   B. in the REAL game against a real server (tests/D/m3-server.mjs): the stick moves you, buttons become the game's
//      own keys (strike, skills, the second set, target), Menu opens the pause menu, the wheel opens the bag, the hints
//      on the action bar turn into glyphs and back, and a re-bound key works.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/gamepad.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { PAD_INDEX } from '../../js/client/input/bindings.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots', 'gamepad');
const GALLERY = 'prototypes/thousandvale/ui-gallery-frame.html';
test.describe.configure({ mode: 'serial' });
mkdirSync(SHOTS, { recursive: true });

/** In the page, before anything else: a pad the test can press. Also logs the key events the input layer makes. */
function fakePad(id) {
  const pad = { id, index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad; window.__padOn = true; window.__synth = [];
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
  addEventListener('keydown', e => { if (e.tvSynth && !e.repeat) window.__synth.push(e.code); }, true);
}
const setBtn = (page, name, on) => page.evaluate(([i, v]) => { const b = window.__pad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; window.__pad.timestamp++; }, [PAD_INDEX[name], on]);
const press = async (page, name, ms = 90) => { await setBtn(page, name, true); await page.waitForTimeout(ms); await setBtn(page, name, false); await page.waitForTimeout(70); };
const stick = (page, axes) => page.evaluate(a => { for (const [i, v] of Object.entries(a)) window.__pad.axes[i] = v; window.__pad.timestamp++; }, axes);
const synth = page => page.evaluate(() => window.__synth.splice(0));
const input = page => page.evaluate(() => window.tvinput.state());
const scene = async (page, id, more = '') => { await page.goto(`${GALLERY}?scene=${id}&device=pad&layout=current&freeze=1${more}`); await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 45000 }); };

// ================================================================ A. the gallery
test.describe('controller — in the interface gallery', () => {
  let ctx, page; const errors = [];
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(fakePad, 'Xbox 360 Controller (XInput STANDARD GAMEPAD)');
  });
  test.afterAll(async () => { await ctx?.close(); });

  test('hints are keys until a pad is touched, then glyphs — and keys again after a key press', async () => {
    await scene(page, 'hud');
    expect((await input(page)).device).toBe('keyboard');
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('F');
    await press(page, 'X');                                      // strike: the default key F is what the game hears
    expect(await synth(page)).toContain('KeyF');
    await expect.poll(() => input(page).then(s => [s.device, s.glyphs])).toEqual(['pad', 'xbox']);
    const key = page.locator('#actionbar .slot').first().locator('.key');
    await expect(key).toHaveText('X'); await expect(key).toHaveClass(/pad-glyph/);
    await expect(page.locator('#actionbar .slot').nth(1).locator('.key')).toHaveText('Y');
    await expect(page.locator('#actionbar .slot').nth(5).locator('.key')).toHaveText('LT+Y');
    await expect(page.locator('#actionbar .hb-slot').first().locator('.key')).toHaveText('LT+▲');
    await page.screenshot({ path: join(SHOTS, 'hints-xbox.png') });
    await page.keyboard.press('KeyQ');
    await expect.poll(() => input(page).then(s => s.device)).toBe('keyboard');
    await expect(key).toHaveText('F'); await expect(key).not.toHaveClass(/pad-glyph/);
  });

  test('face buttons, the modifier and the D-pad become the game’s own keys', async () => {
    await scene(page, 'hud');
    for (const [btn, code] of [['Y', 'Digit1'], ['B', 'Digit2'], ['RB', 'Digit3'], ['RT', 'Digit4'], ['RIGHT', 'Tab'], ['A', 'Space'], ['BACK', 'KeyM']]) {
      if (btn === 'BACK') { await press(page, btn); expect(await synth(page), btn).toContain(code); await press(page, 'B'); await synth(page); continue; }
      await press(page, btn); expect(await synth(page), btn).toContain(code);
    }
    await setBtn(page, 'LT', true); await page.waitForTimeout(60);
    expect(await page.evaluate(() => document.documentElement.dataset.padMod)).toBe('1');
    for (const [btn, code] of [['Y', 'Digit5'], ['B', 'Digit6'], ['UP', 'Digit7'], ['RIGHT', 'Digit8'], ['DOWN', 'Digit9'], ['LEFT', 'Digit0'], ['X', 'KeyH'], ['A', 'KeyX'], ['RB', 'KeyC']]) { await press(page, btn); expect(await synth(page), 'LT+' + btn).toContain(code); }
    await setBtn(page, 'LT', false);
    // the left stick reaches the game's controls as a vector; the right stick as the camera
    await stick(page, { 0: 0, 1: -1, 2: 0.6 }); await page.waitForTimeout(80);
    const a = await page.evaluate(() => window.gallery.controls.analog);
    expect(a.mz).toBeCloseTo(1, 1); expect(a.camX).toBeCloseTo(0.6, 1);
    await stick(page, { 0: 0, 1: 0, 2: 0 }); await page.waitForTimeout(60);
    expect(await page.evaluate(() => window.gallery.controls.analog)).toEqual({ mx: 0, mz: -0, camX: 0, camY: 0 });
    // D-pad down: a party member is targeted (the most hurt first), left clears
    await page.evaluate(() => window.gallery.verbs.play('hurt-party')); await page.waitForTimeout(150);
    await press(page, 'DOWN');
    await expect(page.locator('#target-frame')).toBeVisible();
    await expect(page.locator('#party .pmember.targeted')).toHaveCount(1);
    await press(page, 'LEFT');
    await expect(page.locator('#target-frame')).toBeHidden();
  });

  test('hold LB: the quick wheel — point, let go, the window opens; B cancels; RB flips to the second ring', async () => {
    await scene(page, 'hud');
    await setBtn(page, 'LB', true); await page.waitForTimeout(120);
    await expect(page.locator('.tv-radial')).toBeVisible();
    expect(await page.locator('.tv-radial .rd-slice').count()).toBe(8);
    await stick(page, { 2: 0, 3: -1 }); await page.waitForTimeout(100);                 // straight up = the first slice: the bag
    await expect(page.locator('.tv-radial .rd-slice.on')).toHaveText('Bag');
    await page.screenshot({ path: join(SHOTS, 'wheel.png') });
    await setBtn(page, 'LB', false); await stick(page, { 3: 0 }); await page.waitForTimeout(250);
    await expect(page.locator('.tv-radial')).toBeHidden();
    await expect(page.locator('#bag')).toBeVisible();
    await press(page, 'B'); await expect(page.locator('#bag')).toBeHidden();
    // second ring, and cancel
    await setBtn(page, 'LB', true); await page.waitForTimeout(120);
    await press(page, 'RB'); await expect(page.locator('.tv-radial')).toHaveAttribute('data-ring', '1');
    await expect(page.locator('.tv-radial .rd-slice').first()).toHaveText('Mount');
    await press(page, 'B'); await expect(page.locator('.tv-radial')).toBeHidden();
    await setBtn(page, 'LB', false);
  });

  test('in a window: a focus ring that moves, A presses, LB / RB change tabs, B backs out', async () => {
    await scene(page, 'settings');
    await press(page, 'X', 60);                                                          // wake the pad
    await expect(page.locator('.pad-ring')).toBeVisible();
    const at = () => input(page).then(s => s.focus);
    const f0 = await at();
    await press(page, 'DOWN'); await press(page, 'DOWN');
    expect(await at()).not.toBe(f0);
    const tab = () => page.locator('#panel-settings .set-tabs [aria-checked="true"]').textContent();
    expect(await tab()).toBe('Game');
    await press(page, 'RB'); await page.waitForTimeout(120); expect(await tab()).toBe('Graphics');
    await press(page, 'RB'); await page.waitForTimeout(120); expect(await tab()).toBe('Sound');
    await press(page, 'LB'); await page.waitForTimeout(120); expect(await tab()).toBe('Graphics');
    // A presses what is ringed: put the ring on a checkbox row of the Game tab and flip it
    await press(page, 'LB'); await page.waitForTimeout(150);
    await page.evaluate(() => window.tvinput.focus.set(document.querySelector('#panel-settings input[data-k="showHelm"]')));
    const before = await page.locator('#panel-settings input[data-k="showHelm"]').isChecked();
    await press(page, 'A');
    expect(await page.locator('#panel-settings input[data-k="showHelm"]').isChecked()).toBe(!before);
    await page.screenshot({ path: join(SHOTS, 'focus-ring.png') });
    await press(page, 'B'); await expect(page.locator('#panel-settings')).toBeHidden();
    await expect.poll(() => page.evaluate(() => { const c = window.tvinput.focus.container(); return { ring: document.querySelector('.pad-ring').hidden, inside: c ? (c.id || c.className) : null }; })).toEqual({ ring: true, inside: null });
  });

  test('on the perk forest the ring becomes a steered pointer: A clicks under it, the stick moves it', async () => {
    await scene(page, 'perks');
    await press(page, 'X', 60);
    const T = () => page.evaluate(() => window.gallery.ui.talents.stage.perks.length);
    const n0 = await T();
    // put the pointer on a perk that is open to take, as the left stick would
    const spot = await page.evaluate(() => {
      const t = window.gallery.ui.talents, F = t.source.forest, have = new Set([F.start.id, ...t.state.perks, ...t.stage.perks]);
      const n = F.nodes.find(x => !have.has(x.id) && (F.neighbours.get(x.id) || []).some(y => have.has(y)));
      t.graph.focus(n.id); return n.id;
    });
    await page.waitForTimeout(300);
    await page.evaluate(id => { const t = window.gallery.ui.talents, c = document.querySelector('#panel-perks canvas'), p = t.graph.screenOf(id), r = c.getBoundingClientRect(); window.tvinput.focus.cursorAt(c, p.x / r.width, p.y / r.height); }, spot);
    expect((await input(page)).steering).toBe(true);
    await expect(page.locator('.pad-pointer')).toBeVisible();
    // A is a click on the canvas exactly under the pointer (what a mouse click there would be)
    await page.evaluate(() => { window.__clicks = []; document.querySelector('#panel-perks canvas').addEventListener('click', e => window.__clicks.push([Math.round(e.clientX), Math.round(e.clientY)])); });
    const ptr = await page.locator('.pad-pointer').boundingBox();
    await press(page, 'A'); await page.waitForTimeout(200);
    const clicks = await page.evaluate(() => window.__clicks);
    expect(clicks.length).toBe(1);
    expect(Math.abs(clicks[0][0] - (ptr.x + ptr.width / 2))).toBeLessThan(3); expect(Math.abs(clicks[0][1] - (ptr.y + ptr.height / 2))).toBeLessThan(3);
    expect(await T(), 'the click reached the forest (a pick was staged or taken back)').not.toBe(n0);
    await page.screenshot({ path: join(SHOTS, 'perk-pointer.png') });
    // the stick moves the pointer
    const p0 = await page.locator('.pad-pointer').boundingBox();
    await stick(page, { 0: 1, 1: 0 }); await page.waitForTimeout(250); await stick(page, { 0: 0 });
    const p1 = await page.locator('.pad-pointer').boundingBox();
    expect(p1.x).toBeGreaterThan(p0.x + 20);
  });

  test('a text box opens the on-screen keyboard: type, delete, send', async () => {
    await scene(page, 'hud');
    await press(page, 'X', 60);
    await page.evaluate(() => window.tvinput.osk.open(document.getElementById('chat-input')));
    await expect(page.locator('.tv-osk')).toBeVisible();
    await press(page, 'A'); await press(page, 'RIGHT'); await press(page, 'A'); await press(page, 'Y'); await press(page, 'RIGHT'); await press(page, 'A');
    expect(await page.locator('#chat-input').inputValue()).toBe('Qw e');
    await press(page, 'X');
    expect(await page.locator('#chat-input').inputValue()).toBe('Qw ');
    await page.screenshot({ path: join(SHOTS, 'osk.png') });
    const sent0 = await page.evaluate(() => window.gallery.fake.sent.length);
    await press(page, 'START');
    await expect(page.locator('.tv-osk')).toBeHidden();
    const sent = await page.evaluate(n => window.gallery.fake.sent.slice(n).map(x => x.m), sent0);
    expect(sent.some(m => (m.t === 'say' || m.t === 'chat') && /Qw/.test(m.text))).toBe(true);
  });

  test('play-test 12 (#68/#74): the pad reaches the left column; the board is wide and low on a Steam Deck screen', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await scene(page, 'hud');
    await press(page, 'X', 60);
    await page.evaluate(() => window.tvinput.osk.open(document.getElementById('chat-input')));
    await press(page, 'RIGHT'); await press(page, 'LEFT');
    expect(await page.evaluate(() => window.tvinput.osk.at)).toMatchObject({ r: 1, c: 0, key: 'q' });
    await press(page, 'DOWN'); await press(page, 'A');                  // 'a' — the left column of the next row
    expect(await page.locator('#chat-input').inputValue()).toBe('A');
    await press(page, 'LEFT');                                         // wraps to the end of the row
    expect((await page.evaluate(() => window.tvinput.osk.at)).c).toBeGreaterThan(5);
    const box = await page.locator('.tv-osk').boundingBox();
    expect(box.width, 'wide board on a wide screen').toBeGreaterThan(900);
    expect(box.height, 'and low: it leaves the middle of the screen').toBeLessThan(330);
    await page.screenshot({ path: join(SHOTS, 'osk-deck-1280x800.png') });
    await page.setViewportSize({ width: 1024, height: 576 });
    await page.waitForTimeout(100);
    const b2 = await page.locator('.tv-osk').boundingBox();
    expect(b2.height).toBeLessThan(300);
    await page.screenshot({ path: join(SHOTS, 'osk-1024x576.png') });
    await press(page, 'B');
    await page.setViewportSize({ width: 1366, height: 768 });
  });

  test('a PlayStation pad gets PlayStation glyphs; Settings can force a set', async () => {
    await page.addInitScript(() => { window.__padId = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'; });
    await scene(page, 'hud');
    await page.evaluate(() => { window.__pad.id = window.__padId; });
    await press(page, 'X');
    await expect.poll(() => input(page).then(s => s.glyphs)).toBe('playstation');
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('□');
    await page.evaluate(() => window.tvinput.device.setGlyphs('generic'));
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('3');
    await page.evaluate(() => window.tvinput.device.setGlyphs('auto'));
    expect(errors).toEqual([]);
  });
});

// ================================================================ B. the real game
test.describe('controller — in the real game', () => {
  const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  let srv, base, ctx, page; const errors = [];
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420000);
    const port = await freePort(), hk = await freePort();
    srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; srv.stderr.on('data', d => { out += d; });
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
    base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
    ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
    page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(fakePad, 'Xbox 360 Controller (XInput STANDARD GAMEPAD)');
    await page.addInitScript(() => { window.__padOn = false; });
    await page.goto(base + '?quality=low&fresh=1&tod=0.45&autoplay=1&name=Padric&cls=warrior');
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
    await page.waitForTimeout(3000);
  });
  test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

  test('the game installs the input layer; with no pad nothing changes', async () => {
    expect(await page.evaluate(() => typeof window.tvinput?.state)).toBe('function');
    const s = await input(page);
    expect(s.device).toBe('keyboard'); expect(s.pad.mode).toBe('none'); expect(s.layout).toBe('desktop');
    expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBeUndefined();     // the phone layout is off
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('F');
  });

  test('the left stick walks the character; X strikes; the hints become glyphs', async () => {
    test.setTimeout(120000);
    await page.evaluate(() => { window.__padOn = true; });
    const p0 = await page.evaluate(() => tv.state().you);
    await stick(page, { 0: 0, 1: -1 });
    await page.waitForTimeout(2500);
    await stick(page, { 0: 0, 1: 0 });
    const p1 = await page.evaluate(() => tv.state().you);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'moved by the stick').toBeGreaterThan(2);
    await expect.poll(() => input(page).then(s => s.device)).toBe('pad');
    expect((await input(page)).pad.mode).toBe('world');
    await press(page, 'X');
    expect(await synth(page)).toContain('KeyF');
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('X');
    await expect(page.locator('#menubar kbd').first()).toBeHidden();                                 // window keys have no button: they live in the wheel
    await page.screenshot({ path: join(SHOTS, 'game-pad-hud.png') });
  });

  test('Menu opens the controller menu (2026-10-16: the controller layout; B closes it); the wheel opens the bag; B closes it', async () => {
    test.setTimeout(120000);
    await expect.poll(() => input(page).then(st => st.layout)).toBe('pad');                          // a pad in hand: the controller layout
    await press(page, 'START');
    await expect(page.locator('#panel-padmenu')).toBeVisible();
    await expect(page.locator('.pad-ring')).toBeVisible();
    expect((await input(page)).pad.mode).toBe('menu');
    await press(page, 'B');
    await expect(page.locator('#panel-padmenu')).toBeHidden();
    await setBtn(page, 'LB', true); await page.waitForTimeout(250);
    await expect(page.locator('.tv-radial')).toBeVisible();
    await stick(page, { 2: 0, 3: -1 }); await page.waitForTimeout(250);
    await setBtn(page, 'LB', false); await stick(page, { 3: 0 });
    await expect(page.locator('#bag')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: join(SHOTS, 'game-pad-bag.png') });
    await press(page, 'B');
    await expect(page.locator('#bag')).toBeHidden();
    expect((await input(page)).pad.mode).toBe('world');
  });

  test('a re-bound key: Strike moved to Y — Y strikes, F does nothing, the hint says Y', async () => {
    test.setTimeout(120000);
    await page.keyboard.press('KeyQ');                                                               // back to keyboard hints
    await page.evaluate(() => thousandvale.ui2.settings.panel.open());
    await page.click('#panel-settings [data-tab="keys"]');
    await page.click('#panel-settings [data-bind-action="strike"]');
    await expect(page.locator('#panel-settings [data-bind-action="strike"]')).toHaveText('Press a key…');
    await page.keyboard.press('KeyY');
    await expect(page.locator('#panel-settings [data-bind-action="strike"]')).toHaveText('Y');
    await page.screenshot({ path: join(SHOTS, 'game-rebind.png') });
    await page.keyboard.press('Escape');
    await expect(page.locator('#actionbar .slot').first().locator('.key')).toHaveText('Y');
    // what the game's own handlers hear: a listener like theirs (window, after the input layer's)
    await page.evaluate(() => { window.__synth.length = 0; window.__heardF = 0; addEventListener('keydown', e => { if (e.code === 'KeyF') window.__heardF++; }); });
    await page.keyboard.press('KeyF'); await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__heardF), 'F is quiet now').toBe(0);
    await page.keyboard.press('KeyY'); await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__heardF), 'Y is heard as the strike key').toBe(1);
    expect(await synth(page)).toContain('KeyF');
    // and back
    await page.evaluate(() => { window.tvinput.B.reset(); localStorage.removeItem('tv.keys'); });
    expect(errors).toEqual([]);
  });
});
