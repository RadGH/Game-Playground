// R14 — the things you can only check by driving the real page.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/**
 *   "Allow holding V in walk mode to cause the camera to change to rotation mode, where mouse moves
 *    the camera. This is to allow you to get a front view look at your character. The camera should
 *    stick that way until you move your mouse again."
 *
 * Three things have to be true: the body does NOT turn while V is down, the camera does, and the
 * offset survives V coming back up.
 */
test('holding V swings the camera round the character and leaves it there', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    const c = fh.control;
    c.freeLook = false; c.freeYaw = 0; c.freePitch = 0;
    const yaw0 = c.yaw;

    // hold V and push the mouse sideways for a few frames
    const keys = new Set(['KeyV']);
    const input = { forward: 0, strafe: 0, run: false, jump: false, look: [-300, 0], pressed: new Set(), keys };
    for (let i = 0; i < 5; i++) { input.look = [-300, 0]; c.update(0.016, input); }
    const held = { yaw: c.yaw, freeLook: c.freeLook, freeYaw: c.freeYaw };

    // let V go, and move nothing
    keys.delete('KeyV');
    input.look = [0, 0];
    for (let i = 0; i < 5; i++) c.update(0.016, input);
    const released = { freeLook: c.freeLook, freeYaw: c.freeYaw };

    // now move the mouse again: it should snap back and start turning the body
    input.look = [-100, 0];
    c.update(0.016, input);
    const after = { freeLook: c.freeLook, freeYaw: c.freeYaw, yaw: c.yaw };
    return { yaw0, held, released, after };
  });
  console.log('free look:', JSON.stringify(out));
  // the body did not turn while V was down — that is the whole point
  expect(Math.abs(out.held.yaw - out.yaw0)).toBeLessThan(1e-9);
  expect(out.held.freeLook).toBe(true);
  expect(Math.abs(out.held.freeYaw)).toBeGreaterThan(0.1);
  // …and it stayed there when V came up and nothing moved
  expect(out.released.freeLook).toBe(true);
  expect(out.released.freeYaw).toBeCloseTo(out.held.freeYaw, 6);
  // the next mouse move hands control back
  expect(out.after.freeLook).toBe(false);
  expect(out.after.freeYaw).toBe(0);
  expect(Math.abs(out.after.yaw - out.yaw0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 *   "I saw what looked like a shooting star, can you change it so that falling stars are actual
 *    events and leave behind a meteor with a special loot crate inside… it should have its own map
 *    marker. It would be interesting to act like a quest."
 */
test('a meteor is a job in the log with its own mark on the map', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    const before = fh.questLog.active.length;
    const m = fh.meteors.drop(fh.control.x + 300, fh.control.z + 200, { seconds: 0.3 });
    const q = fh.questLog.active.find(j => j.kind === 'fall');
    const marker = fh.markers.here().find(x => x.kind === 'fall');
    return {
      before, after: fh.questLog.active.length,
      quest: q ? { kind: q.kind, title: q.title, chestKey: q.chestKey, state: q.state, cell: q.place?.cell } : null,
      marker: marker ? { kind: marker.kind, name: marker.name, cell: marker.cell } : null,
      chestKey: m.chestKey,
    };
  });
  console.log('meteor:', JSON.stringify(out));
  expect(out.after).toBe(out.before + 1);
  expect(out.quest).not.toBeNull();
  expect(out.quest.kind).toBe('fall');
  expect(out.quest.chestKey).toBe(out.chestKey);
  // its own ☄ on the map, not a quest's exclamation mark
  expect(out.marker).not.toBeNull();
  expect(out.marker.kind).toBe('fall');
  expect(out.marker.cell).toEqual(out.quest.cell);
  expect(errors).toEqual([]);
});

/**
 *   "Now we have giant monsters which are useful, but sometimes they don't drop anything
 *    interesting. Make them always drop a loot crate."
 */
test('a giant always leaves a bag, even when the rolls come up empty', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    // a BAG, not a chest — they are two different lists in js/chests.js
    const before = fh.chests.bags.length;
    const def = (fh.field.defs || [])[0];
    // the field carries the modifier table it was built with — data/enemies.json's `modifiers`
    const giant = (fh.field.modifiers || []).find(m => m.id === 'giant');
    if (!def || !giant) return { skipped: 'no bestiary or no Giant modifier' };
    const e = await fh.field.add(def, 5, fh.control.x + 6, fh.control.z + 6, { rank: 'champion', modifiers: [giant] });
    if (!e) return { skipped: 'no enemy could be spawned' };
    const hadGiant = !!e.modifiers?.includes('giant');
    // kill it the way the game does, so `onEnemyKilled` runs. `playerDamage` is what `kill()` reads
    // to decide the kill was earned — without it the watch is credited and nothing drops.
    e.playerDamage = 999;
    e.hp = 0;
    fh.field.kill(e);
    await new Promise(r => setTimeout(r, 600));
    return { hadGiant, rank: e.rank, before, after: fh.chests.bags.length };
  });
  console.log('giant:', JSON.stringify(out));
  expect(out.skipped).toBeUndefined();
  expect(out.hadGiant).toBe(true);
  // it is a CHAMPION, not a boss or a rare — which is exactly why it used to fall through to the
  // ordinary drop roll and frequently hand you nothing for a fight three times your size
  expect(out.rank).toBe('champion');
  expect(out.after).toBeGreaterThan(out.before);
  expect(errors).toEqual([]);
});
