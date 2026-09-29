// Farhold 2026-09-29 — "significant lag/stuttering as soon as I deal damage, especially when attacking
// multiple targets" and "a curved metal plate floating several feet above the warrior's head".
//
// The stutter was the GPU recompiling shaders on every hit, from two causes:
//   1. js/light.js toggled `visible` on its pooled point lights. three.js counts only visible lights,
//      and a change in that count recompiles every lit material in the world. Impacts borrow those
//      lights, so each hit recompiled the terrain, the trees and every body.
//   2. avatar-3d/js/spellfx.js disposed each finished effect's materials, and three.js drops a shader
//      when the last material using it is disposed, so the next impact compiled it again.
// The helm was a lining copied AFTER `head()` had already moved the geometry in place, so the copy
// was moved twice.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__links = 0;
    const link = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (...a) { window.__links++; return link.apply(this, a); };
  });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=7&class=warrior');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('hitting five enemies over and over compiles no new shaders once warmed up', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await land(page);
  await page.evaluate(async () => {
    const f = window.farhold; f.pause(false);
    window.__es = [];
    for (let i = 0; i < 5; i++) { const e = await f.spawn('stone_sentinel', 1); e.maxHp = e.hp = 1e6; e.update = () => {}; window.__es.push(e); }
    window.__pin = () => window.__es.forEach((e, i) => {
      const a = f.control.yaw + (i - 2) * 0.25;
      e.x = f.control.x + Math.sin(a) * 2.2; e.z = f.control.z + Math.cos(a) * 2.2;
    });
  });
  const swing = async n => {
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => { window.__pin(); const f = window.farhold; f.skills.slots[0].ready = 0; f.cast(0); });
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(2500);   // let every impact finish and be cleaned up
  };
  await swing(6);   // first contact: warm-up compiles are allowed here
  const before = await page.evaluate(() => window.__links);
  await swing(8);
  const compiled = await page.evaluate(() => window.__links) - before;
  expect(compiled, `${compiled} shaders compiled during a fight that had already been fought once`).toBe(0);
  expect(errors).toEqual([]);
});

test('the warrior has nothing floating above his helm', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const f = window.farhold, T = f.THREE;
    const actor = f.playerActor || f.actor || f.hero?.actor || f.player?.actor;
    const root = actor?.group || actor?.root || actor;
    root.updateMatrixWorld(true);
    const heights = {};
    root.traverse(o => {
      if (!o.isMesh) return;
      const bb = new T.Box3().setFromObject(o);
      heights[o.name] = { min: bb.min.y, max: bb.max.y };
    });
    return heights;
  });
  const cloth = out['chibi2-cloth'], metal = out['chibi2-metal'];
  expect(cloth && metal, 'the warrior should be a merged cloth + metal mesh').toBeTruthy();
  const bodyHeight = cloth.max - cloth.min;
  // the helm sits a little over the hair cap; a lining placed twice stood ~1.2 m over it
  expect(metal.max - cloth.max, 'metal stands well above the top of the head').toBeLessThan(bodyHeight * 0.1);
  expect(errors).toEqual([]);
});
