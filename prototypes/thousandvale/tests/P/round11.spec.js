// Round 11 (stream P, owner play-test 2026-10-15) — the mini-game items, in a real browser on the UI gallery's stage
// (the game's own interface code, no 3D, no server):
//   #7  skinning on a desktop: the ring at the knife's tip IS the scored point — a REAL mouse put on the drawn line scores
//       perfect, at a device pixel ratio of 1 and of 2 (no 5 px offset)
//   #34 / #57  after a controller has been used, the keyboard prompts still show their keys ("Hold [] to lift" was blank),
//       and the forge shows its keys on the picture too
//   #23 skinning on a controller: moving the stick begins the cut, and the knife never drops while the stick holds it
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/P/round11.spec.js
import { test, expect } from '@playwright/test';

const BASE = '/prototypes/thousandvale/';
const SHOTS = 'prototypes/thousandvale/tests/P/shots/round11/';
async function stage(browser, { dpr = 1, size = { width: 1366, height: 768 }, device = 'desktop' } = {}) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: dpr });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}ui-gallery-frame.html?scene=hud&device=${device}&layout=proposed`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
  return { ctx, page, errors };
}

for (const dpr of [1, 2]) {
  test(`#7 skinning, dpr ${dpr}: a real mouse on the drawn line scores perfect; the knife's ring is exactly where the pointer is`, async ({ browser }) => {
    test.setTimeout(120000);
    const { ctx, page, errors } = await stage(browser, { dpr });
    await page.evaluate(() => { window.__res = null; window.tvprof.demo('skinning', { seed: 11 }).then(r => { window.__res = r; }); });
    await page.waitForFunction(() => window.tvprof.mini.state.state === 'ready');
    // the hover start: put the mouse on the knife (no click) — the cut begins
    const k0 = await page.evaluate(() => window.tvprof.mini.pointFor(window.tvprof.mini.run.view().y));
    await page.mouse.move(k0.x - 60, k0.y - 60); await page.mouse.move(k0.x, k0.y, { steps: 4 });
    await page.waitForFunction(() => window.tvprof.mini.state.state === 'play');
    // the pointer as the PAGE received it (Chrome snaps a synthetic mouse to whole pixels): the knife must sit on THAT
    await page.evaluate(() => {
      document.querySelector('.prof-canvas').addEventListener('pointermove', e => { window.__py = e.clientY; }, true);
      // race-free: right AFTER the game's own handler has taken this very event, where is the scored point vs the pointer?
      window.__diffs = [];
      window.addEventListener('pointermove', e => { const mini = window.tvprof.mini, st = mini.run && mini.run.state; if (mini.state.state === 'play' && st && st.aimed != null) window.__diffs.push(Math.abs(mini.pointFor(st.aimed).y - e.clientY)); });
    });
    // follow the drawn line with the real mouse; measure, in screen pixels, where the run thinks the knife is vs the line
    const offs = [], snaps = [];
    let shot = false;
    for (let guard = 0; guard < 2000; guard++) {
      const st = await page.evaluate(() => { const s = window.tvprof.mini.state; return { state: s.state, next: s.next }; });
      if (st.state !== 'play' || !st.next) break;
      const p = await page.evaluate(a => window.tvprof.mini.pointFor(a), st.next.aim);
      await page.mouse.move(p.x, p.y);
      // (Chrome hands a mousemove to the page with the next animation frame: measure after it has arrived)
      const m = await page.evaluate(([px, py]) => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const mini = window.tvprof.mini, st = mini.run.state, knife = mini.pointFor(st.aimed ?? st.y), c = mini.state.canvas;      // the height the next sample is scored at (and the knife is drawn at from the next frame)
        res({ dy: knife.y - (window.__py ?? py), snap: (window.__py ?? py) - py, cw: c.w, playing: mini.state.state === 'play' });
      }))), [p.x, p.y]);
      if (!m.playing) break;      // (the cut ended between the move and the look: a knife that no longer moves)
      offs.push(Math.abs(m.dy)); snaps.push(Math.abs(m.snap));
      if (!shot && offs.length > 40) { shot = true; await page.screenshot({ path: `${SHOTS}skinning-desktop-dpr${dpr}.png`, clip: await page.locator('.prof-game').boundingBox() }); }
    }
    await page.waitForFunction(() => window.__res, null, { timeout: 10000 });
    const r = await page.evaluate(() => window.__res);
    const worst = Math.max(...offs);
    console.log(`[#7 dpr ${dpr}] knife vs the pointer the page got (looked at a frame later): worst ${worst.toFixed(3)} px; the browser's own snapping of the synthetic mouse up to ${Math.max(...snaps).toFixed(2)} px; marks ${r.marks}`);
    const median = offs.slice().sort((x, y) => x - y)[offs.length >> 1];
    expect(median, `the scored point sits ON the pointer (median ${median.toFixed(2)} px over ${offs.length} moves)`).toBeLessThan(0.6);
    const diffs = await page.evaluate(() => window.__diffs);
    expect(diffs.length).toBeGreaterThan(30);
    expect(Math.max(...diffs), `event by event, the scored point is the pointer (worst ${Math.max(...diffs).toFixed(3)} px over ${diffs.length} events)`).toBeLessThan(0.51);
    expect(r.marks.filter(x => x === 2).length, `marks ${r.marks} (${r.quality})`).toBeGreaterThanOrEqual(r.marks.length - 1);
    expect(['fine', 'perfect']).toContain(r.quality);
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}

test('#34 / #57: after a controller was used, every mini-game prompt on the keyboard still shows its keys; the forge draws them on the picture', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, page, errors } = await stage(browser);
  // a controller is used once, then the keyboard again (the hint sweep runs from then on — that is when the caps went blank)
  await page.evaluate(async () => { const { device } = await import('/prototypes/thousandvale/js/client/input/device.js'); device.seen('pad'); await new Promise(r => setTimeout(r, 200)); device.seen('keyboard'); await new Promise(r => setTimeout(r, 200)); });
  const caps = {};
  for (const prof of ['mining', 'logging', 'foraging', 'skinning', 'smithing', 'outfitting', 'alchemy', 'tempering']) {
    const done = page.evaluate(p => window.tvprof.demo(p, { seed: 7 }), prof);
    await page.waitForFunction(() => window.tvprof.mini.state.state === 'ready');
    await page.waitForTimeout(250);      // (the hint sweep is scheduled)
    caps[prof] = await page.evaluate(() => [...document.querySelectorAll('.prof-how kbd')].map(k => k.textContent));
    expect(caps[prof].every(t => t.trim().length > 0), `${prof}: ${JSON.stringify(caps[prof])} — ${await page.locator('.prof-how').textContent()}`).toBe(true);
    if (prof === 'smithing') {
      await page.keyboard.press('Space');
      await page.waitForFunction(() => window.tvprof.mini.state.state === 'play');
      await page.waitForTimeout(2600);       // let the bar cool below the band: the picture says which key puts it back
      await page.screenshot({ path: `${SHOTS}forge-desktop-keys.png`, clip: await page.locator('.prof-game').boundingBox() });
      expect(await page.locator('.prof-how').textContent()).toMatch(/Space.*hammer.*D.*fire|Space.*D/s);
    }
    if (prof === 'skinning') await page.screenshot({ path: `${SHOTS}skinning-ready-keys.png`, clip: await page.locator('.prof-game').boundingBox() });
    await page.keyboard.press('Escape'); expect(await done).toBeNull();
  }
  expect(caps.skinning, 'skinning: "hold Space to lift"').toContain('Space');
  expect(caps.smithing).toEqual(['Space', 'D']);
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});

test('#23: on a controller the skinning cut begins when the stick moves, and the knife never drops while the stick holds it', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, page, errors } = await stage(browser);
  await page.evaluate(async () => {
    const btn = () => ({ pressed: false, value: 0 });
    window.__pad = { id: 'Xbox test pad', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, btn), axes: [0, 0, 0, 0], timestamp: 1 };
    navigator.getGamepads = () => [window.__pad];
    const { device } = await import('/prototypes/thousandvale/js/client/input/device.js'); device.force('pad', 'xbox');
  });
  // the stick is still pushed from walking up to the beast: that does NOT begin it
  await page.evaluate(() => { window.__pad.axes[1] = -0.9; });
  await page.evaluate(() => { window.__res = null; window.tvprof.demo('skinning', { seed: 4 }).then(r => { window.__res = r; }); });
  await page.waitForFunction(() => window.tvprof.mini.state.state === 'ready');
  await expect(page.locator('.prof-ready')).toContainText(/stick/i);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.tvprof.mini.state.state), 'a stick held from walking does not begin it').toBe('ready');
  // back to rest, then pushed up: the cut begins and the knife is where the stick says
  await page.evaluate(() => { window.__pad.axes[1] = 0; }); await page.waitForTimeout(120);
  await page.evaluate(() => { window.__pad.axes[1] = -0.5; });
  await page.waitForFunction(() => window.tvprof.mini.state.state === 'play', null, { timeout: 3000 });
  await page.waitForTimeout(120);
  const y1 = await page.evaluate(() => window.tvprof.mini.run.state.y);
  expect(Math.abs(y1 - (0.5 + 0.5 * 0.46)), `the knife follows the stick (y ${y1})`).toBeLessThan(0.02);
  // the stick at rest: the knife holds the middle — it does not sink
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  await page.waitForTimeout(150); const a = await page.evaluate(() => window.tvprof.mini.run.state.y);
  await page.waitForTimeout(450); const b = await page.evaluate(() => window.tvprof.mini.run.state.y);
  expect(Math.abs(a - 0.5) < 0.02 && Math.abs(b - a) < 0.005, `no drop: ${a} -> ${b}`).toBe(true);
  await page.screenshot({ path: `${SHOTS}skinning-pad.png`, clip: await page.locator('.prof-game').boundingBox() });
  // play it out by the stick alone
  for (let i = 0; i < 400; i++) {
    const n = await page.evaluate(() => { const s = window.tvprof.mini.state; return s.state === 'play' && s.next ? s.next.aim : null; });
    if (n == null) break;
    await page.evaluate(aim => { window.__pad.axes[1] = Math.max(-1, Math.min(1, (0.5 - aim) / 0.46)); }, n);
    await page.waitForTimeout(8);
  }
  await page.waitForFunction(() => window.__res, null, { timeout: 8000 });
  const r = await page.evaluate(() => window.__res);
  expect(['good', 'fine', 'perfect'], `by the stick: ${r.quality} ${r.marks}`).toContain(r.quality);
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
