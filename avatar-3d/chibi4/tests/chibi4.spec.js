// Chibi 4 step 7: the runtime loads both GLBs, plays every clip, the page measures cost, and the shots are kept.
// Run: flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/chibi4/tests/chibi4.spec.js
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'step7');

test('compare page: both systems load, Chibi 4 is one draw call per character, clips play', async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('avatar-3d/chibi4/compare.html?anim=walk');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 180000, state: 'attached' });
  const s = await page.evaluate(() => window.__c4stats);
  expect(s.chibi4.calls).toBe(1);
  expect(s.lodTriangles[0].length).toBe(3);
  expect(s.lodTriangles[0][2]).toBeLessThan(s.lodTriangles[0][0] / 3);
  for (const anim of ['walk', 'run', 'cast', 'idle']) {
    await page.click(`#anims button[data-anim="${anim}"]`);
    await page.waitForTimeout(anim === 'run' ? 450 : 700);
    await page.screenshot({ path: path.join(SHOTS, `s7compare_${anim}.png`) });
  }
  expect(errors).toEqual([]);
  console.log('C4STATS', JSON.stringify(s));
});

test('crowd: 20 and 50 characters, both systems', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto('avatar-3d/chibi4/compare.html?anim=idle');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 180000, state: 'attached' });
  const out = [];
  for (const n of [20, 50]) for (const sys of ['chibi2', 'chibi4']) out.push(await page.evaluate(([n, sys]) => window.__c4crowd(n, sys), [n, sys]));
  console.log('C4CROWD', JSON.stringify(out));
  for (const r of out.filter(r => r.sys === 'chibi4')) expect(r.calls).toBeLessThanOrEqual(r.n + 2);
});
