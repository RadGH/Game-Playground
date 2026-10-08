// W9 (P-client): every profession mini-game played to a Good (or better) result by a synthetic player pressing REAL
// keys / tapping REAL points on the real frame (js/client/ui/prof-minigame.js) — at 60 frames a second and with the
// page's animation frames throttled to 10 a second, on a desktop with the keyboard and on a phone with one finger.
// The frame runs in the UI gallery's stage (the game's own interface code, no 3D, no server): patterns are made by the
// same makeGame the server uses, from data/rules/professions.json, and scored by the same scoreGame.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/P/client-minigames.spec.js
import { test, expect } from '@playwright/test';

const BASE = '/prototypes/thousandvale/';
const PROFS = ['mining', 'logging', 'foraging', 'skinning', 'smithing', 'outfitting', 'alchemy', 'cooking', 'tempering'];
const GOOD = ['good', 'fine', 'perfect'];

/** In the page: play the game that is up with the frame's own "next flawless input", through DOM events. */
async function botPlay(page, how) {
  return page.evaluate(async how => {
    const mini = window.tvprof.mini, sleep = ms => new Promise(r => setTimeout(r, ms));
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(-1).toLowerCase(), bubbles: true, cancelable: true }));
    const tap = code => { key('keydown', code); key('keyup', code); };
    const canvas = document.querySelector('.prof-canvas');
    const ptr = (type, p, down = true) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 7, pointerType: how === 'touch' ? 'touch' : 'mouse', buttons: down ? 1 : 0, pressure: down ? 0.5 : 0, isPrimary: true }));
    let held = false, fingerDown = false, sent = 0;
    for (let guard = 0; guard < 40000; guard++) {
      const st = mini.state;
      if (!st.open || st.state !== 'play') break;
      const n = st.next, type = st.type;
      if (!n) { await sleep(4); continue; }
      if (type === 'trace') {
        if (how === 'touch') { const p = mini.pointFor(n.aim); if (!fingerDown) { ptr('pointerdown', p); fingerDown = true; } else ptr('pointermove', p); }
        else { const want = mini.run.state.y < n.aim; if (want !== held) { key(want ? 'keydown' : 'keyup', 'Space'); held = want; } }
        await sleep(8); continue;
      }
      if (st.clock < n.t - 1) { await sleep(Math.min(8, Math.max(0, n.t - st.clock - 3))); continue; }
      if (how === 'touch') { const p = mini.pointFor(n.v); ptr('pointerdown', p); ptr('pointerup', p, false); }
      else if (type === 'rhythm') tap(n.v ? 'KeyD' : 'KeyA');
      else if (type === 'pick') tap('Digit' + (n.v + 1));
      else if (type === 'forge' && n.v === 1) tap('KeyD');
      else tap('Space');
      sent++;
      await sleep(2);
    }
    if (held) key('keyup', 'Space');
    return sent;
  }, how);
}

for (const [label, device, how, fps] of [['desktop keyboard, 60 fps', 'desktop', 'key', 60], ['desktop keyboard, 10 fps', 'desktop', 'key', 10], ['phone upright, one finger, 60 fps', 'phone-p', 'touch', 60], ['phone on its side, one finger, 10 fps', 'phone-l', 'touch', 10]]) {
  test(`${label}: all nine trades reach Good`, async ({ browser }) => {
    test.setTimeout(300000);
    const size = device === 'phone-p' ? { width: 393, height: 852 } : device === 'phone-l' ? { width: 852, height: 393 } : { width: 1366, height: 768 };
    const ctx = await browser.newContext({ viewport: size, hasTouch: how === 'touch' });
    if (fps < 60) await ctx.addInitScript(ms => { window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), ms); window.cancelAnimationFrame = id => clearTimeout(id); }, 1000 / fps);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}ui-gallery-frame.html?scene=hud&device=${device}&layout=proposed`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
    const rows = [];
    for (const [i, prof] of PROFS.entries()) {
      const done = page.evaluate(([p, seed]) => window.tvprof.demo(p, { seed }), [prof, 3 + i * 7]);
      await page.waitForFunction(() => window.tvprof.mini.state.state === 'play', null, { timeout: 10000 });
      // the stick and the fight buttons must not be reachable THROUGH the panel, and the character must hear no key
      const box = await page.evaluate(() => { const r = document.querySelector('.prof-game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, prof: document.documentElement.dataset.prof }; });
      expect(box.prof, 'the input layer is told a game is up').toBeTruthy();
      expect(box.x >= 0 && box.y >= 0 && box.x + box.w <= box.vw + 1 && box.y + box.h <= box.vh + 1, `${prof}: the panel is on the screen ${JSON.stringify(box)}`).toBe(true);
      const sent = await botPlay(page, how);
      const r = await done;
      const frames = await page.evaluate(() => window.tvprof.mini.state.frames);
      rows.push(`${prof}:${r.quality}(${r.score}) ${frames}f`);
      expect(r, `${prof}: no result`).toBeTruthy();
      expect(GOOD, `${prof} at ${fps} fps by ${how}: ${r.quality} ${r.score} marks ${JSON.stringify(r.marks)} flags ${r.flags} (sent ${sent})`).toContain(r.quality);
      if (fps < 60) expect(frames, `${prof}: the throttle was on`).toBeLessThan(r.ms / (1000 / fps) + 12);
      await expect(page.locator('.prof-card[data-q]')).toBeVisible();
      await page.evaluate(() => window.tvprof.mini.close());
      await expect(page.locator('.tv-prof')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.dataset.prof), 'the input layer gets the pad back').toBeFalsy();
    }
    console.log(`[prof] ${label}: ${rows.join(' · ')}`);
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}

test('keys do not leak to the game while a mini-game is up; Esc gives up and nothing is sent; a mashed button is not a strategy', async ({ browser }) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}ui-gallery-frame.html?scene=hud&device=desktop&layout=proposed`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  await page.evaluate(() => { window.__heard = []; window.addEventListener('keydown', e => window.__heard.push(e.code)); });
  let done = page.evaluate(() => window.tvprof.demo('mining', { seed: 5 }));
  await page.waitForFunction(() => window.tvprof.mini.state.state === 'play');
  for (const k of ['KeyW', 'KeyB', 'Digit1', 'KeyJ', 'KeyM']) await page.keyboard.press(k);
  expect(await page.evaluate(() => window.__heard), 'no game key reached a bubbling listener').toEqual([]);
  expect(await page.evaluate(() => window.gallery.openPanels()), 'no window opened').toEqual([]);
  await page.keyboard.press('Escape');
  expect(await done).toBeNull();
  await expect(page.locator('.tv-prof')).toBeHidden();
  // mashing Space
  done = page.evaluate(() => window.tvprof.demo('outfitting', { seed: 9 }));
  await page.waitForFunction(() => window.tvprof.mini.state.state === 'play');
  for (let i = 0; i < 60; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(70); if (!(await page.evaluate(() => window.tvprof.mini.state.state === 'play'))) break; }
  const r = await done;
  expect(['fail', 'poor', 'good']).toContain(r.quality);
  expect(r.inputs.length).toBeLessThanOrEqual(64);
  // the server's own clock for worked nodes (`you.professions.nodes`, ms left) replaces the guess made from the bare key list
  await page.evaluate(() => window.gallery.fake.push('game', { t: 'you', professions: { list: window.tvprof.skills(), nodes: { 'node:a': 60000, 'node:b': 1 } } }));
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => [window.tvprof.isSpent('node:a'), window.tvprof.isSpent('node:b'), window.tvprof.isSpent('node:c')])).toEqual([true, false, false]);
  await page.evaluate(() => window.gallery.fake.push('game', { t: 'you', professions: { list: window.tvprof.skills(), nodes: {} } }));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.tvprof.isSpent('node:a')), 'a node the server no longer lists is back').toBe(false);
  await ctx.close();
});
