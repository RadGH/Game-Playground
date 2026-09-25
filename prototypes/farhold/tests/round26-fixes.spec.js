// Farhold R26 — two play-test reports, checked in a real browser.
//
// 1. "Sometimes after creating a character I still get stuck at 'Waking the wayfarer...' — I can
//    tell by the sfx the game is running in the background but the menu just doesn't hide."
//    title.css's `#boot[data-screen="boot-world"] { display: flex }` tied style.css's
//    `#boot.hidden { display: none }` on specificity and was linked later, so on the world step
//    (the screen Start is on) adding `.hidden` hid nothing. Every older spec waited for
//    `body[data-ready]` or checked the CLASS, and the class was always there — so this one asks the
//    browser what is actually on screen.
//
// 2. "The third attack from the longsword (Overhead) still … looks like the character is swinging
//    into the air. Can you flip that cone around so it looks like the slash is coming from above?"
//    The ribbon was a sector centred on straight up, standing across your facing. It is now in the
//    plane of your facing, from over the head down to the ground in front, revealed top first.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // main.js's hideBoot() forces the title off and says so if the stylesheet did not — that is the
  // safety net, and it must never be what did the job
  page.on('console', m => { if (/did not hide the title/.test(m.text())) errors.push('css: ' + m.text()); });
  return errors;
}

async function startFromTitle(page, classId, seed) {
  await page.goto(BASE + '?quality=low&sound=off');
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
  await page.click('#boot-new');
  await page.selectOption('#boot-class', classId);
  if (classId === 'custom') {
    await page.click('.cb-open');
    await page.locator('.cb:not([hidden]) .cb-rail button', { hasText: 'Spells' }).click();
    await page.locator('.cb:not([hidden]) .cb-opt:not([disabled])').first().click();
    await page.locator('.cb-done').click();
  }
  await page.click('#boot-to-world');
  await page.fill('#boot-seed', String(seed));
  await page.selectOption('#boot-scale', '0.2');
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
}

for (const [classId, seed] of [['fighter', 11], ['custom', 7]]) {
  test(`Start from the world step (${classId}): the title really leaves the screen`, async ({ page }) => {
    const errors = watch(page);
    await startFromTitle(page, classId, seed);
    // a couple of frames, so the loop's own first-frame check has run too
    await page.waitForTimeout(500);
    const boot = await page.evaluate(() => {
      const b = document.getElementById('boot');
      const r = b.getBoundingClientRect();
      return { display: getComputedStyle(b).display, screen: b.dataset.screen, w: r.width, h: r.height, status: document.getElementById('boot-status').textContent };
    });
    expect(boot.screen, 'the title was not left on the world step, so this is not the reported path').toBe('boot-world');
    expect(boot.display, 'the title is still drawn over the running game').toBe('none');
    expect(boot.w * boot.h).toBe(0);
    await expect(page.locator('#boot')).toBeHidden();
    expect(boot.status, '"waking the wayfarer…" was left behind').toBe('');
    expect(errors).toEqual([]);
  });
}

test('the overhead ribbon falls from over the head to the ground in front, in the plane of your facing', async ({ page }) => {
  const errors = watch(page);
  await page.goto(BASE + '?auto&class=fighter&seed=11&quality=low&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const out = await page.evaluate(() => {
    const f = window.farhold, c = f.control, T = f.THREE;
    const reach = 3.45;
    const s = f.fx.swipe({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, reach, arc: 1.27, shape: { key: 'overhead', shake: 0.4 }, life: 10000 });
    s.mesh.updateMatrixWorld(true);
    const pos = s.mesh.geometry.attributes.position;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const pts = [];
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(s.mesh.matrixWorld);
      const dx = v.x - c.x, dz = v.z - c.z;
      pts.push({ fwd: dx * fx + dz * fz, side: dx * fz - dz * fx, up: v.y - c.y });
    }
    // the part drawn FIRST (the start of the draw range) must be the top of the chop
    const range = s.mesh.geometry.drawRange;
    const idx = s.mesh.geometry.index;
    const firstShown = [];
    for (let k = range.start; k < range.start + range.count; k++) firstShown.push(pts[idx.getX(k)]);
    s.life = 0; s.mesh.visible = false;
    return {
      top: Math.max(...pts.map(p => p.up)),
      lowest: Math.min(...pts.map(p => p.up)),
      fwdAtLowest: pts.reduce((a, b) => (b.up < a.up ? b : a)).fwd,
      fwdAtTop: pts.reduce((a, b) => (b.up > a.up ? b : a)).fwd,
      maxFwd: Math.max(...pts.map(p => p.fwd)),
      minFwd: Math.min(...pts.map(p => p.fwd)),
      firstShownUp: Math.min(...firstShown.map(p => p.up)),
    };
  });
  // it rises well over the head (the body is ~1.4 m tall) …
  expect(out.top).toBeGreaterThan(3);
  // … the top is over the head, not out in front of you …
  expect(out.fwdAtTop).toBeLessThan(0.5);
  // … and it comes down to near the ground, in FRONT of you
  expect(out.lowest).toBeLessThan(0.6);
  expect(out.fwdAtLowest).toBeGreaterThan(1.5);
  expect(out.maxFwd).toBeGreaterThan(2.5);
  // it starts slightly behind the head, like a blade brought back over the shoulder
  expect(out.minFwd).toBeLessThan(0);
  // what is shown at the start of the swing is the high part, not the low part
  expect(out.firstShownUp).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
