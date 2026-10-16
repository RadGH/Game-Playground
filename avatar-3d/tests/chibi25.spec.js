// Chibi 2.5 builder page (avatar-3d/chibi25.html) in a real browser: Chibi 2 and 2.5 side by side, the face/hair
// options, and the eyes running for seconds with NO shader recompile (blinks and looks are bone moves only).
//   flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/chibi25.spec.js
import { test, expect } from '@playwright/test';

test('the 2.5 builder: two characters, options listed, blinking + looking with no shader compiles', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__links = 0;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__links++; return f.apply(this, a); }; }
  });
  await page.goto('avatar-3d/chibi25.html');
  await page.waitForFunction(() => window.chibi25?.ready, null, { timeout: 90_000 });
  const info = await page.evaluate(() => {
    const [v2, v25] = window.chibi25.actors;
    return { v2: v2.stats(), v25: v25.stats(), e2: v2.eyes.v25, e25: v25.eyes.v25, hairOptions: document.querySelectorAll('#face-ui select')[0].options.length };
  });
  expect(info.v2.bones).toBe(22); expect(info.v25.bones).toBeGreaterThanOrEqual(24);
  expect(info.v25.meshes).toBe(2); expect(info.e2).toBe(false); expect(info.e25).toBe(true);
  expect(info.hairOptions).toBeGreaterThanOrEqual(31);
  // warm: one blink and one look, then count compiles over three seconds of blinks, glances and looking at the mouse
  await page.click('#blink'); await page.click('#look-each'); await page.waitForTimeout(800);
  const before = await page.evaluate(() => window.__links);
  await page.click('#look-each'); await page.click('#look-mouse');
  for (let i = 0; i < 6; i++) { await page.mouse.move(200 + i * 80, 200 + (i % 2) * 120); await page.click('#blink'); await page.waitForTimeout(450); }
  const after = await page.evaluate(() => window.__links);
  expect(after - before, 'shader programs linked while the eyes moved').toBe(0);
  const calls = await page.evaluate(() => window.chibi25.scene.renderer.info.render.calls);
  expect(calls).toBeLessThanOrEqual(4);     // two characters x two materials
  // a 2.5 option changes the right-hand character only
  const t0 = await page.evaluate(() => window.chibi25.actors.map(a => a.stats().triangles));
  await page.selectOption('#face-ui select >> nth=0', 'twin_tails');
  await page.waitForFunction(t => window.chibi25.actors[1].stats().triangles !== t[1], t0, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/chibi25-builder.png' });
  expect(errors).toEqual([]);
});
