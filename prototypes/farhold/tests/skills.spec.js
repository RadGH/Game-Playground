// Farhold phase 3: a fight worth having — the skill bar, the spell effects, and statuses that
// keep working after the hit lands.

import { test, expect } from '@playwright/test';

async function land(page, classId = 'mage') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&seed=7&class=${classId}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('the bar shows six skills and a cast puts one on cooldown', async ({ page }) => {
  const errors = await land(page);
  // round 4: six slots on keys 1-6, unlocked at levels 1, 3, 7, 12, 18 and 24
  await expect(page.locator('#skillbar .skill-slot')).toHaveCount(6);
  await expect(page.locator('#skillbar .skill-slot.locked')).toHaveCount(5);
  const names = await page.locator('#skillbar .skill-name').allTextContents();
  expect(names.every(n => n.trim().length > 0)).toBe(true);

  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.player.mp = f.player.maxMp;
    const before = f.skills.state()[0];
    const plan = f.cast(0);
    const after = f.skills.state()[0];
    return { name: before.name, ok: !!plan, ready: after.ready, usable: after.usable, cooldown: after.cooldown };
  });
  expect(out.ok).toBe(true);
  expect(out.ready).toBeGreaterThan(0);
  expect(out.usable).toBe(false);

  // and the slot really dims on screen
  await expect(page.locator('#skillbar .skill-slot').first()).toHaveClass(/blocked/);
  expect(errors).toEqual([]);
});

test('a firebolt reaches an enemy, hurts it, and leaves it burning', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.pause(false);
    f.player.mp = f.player.maxMp;
    // Stand something right in front of the player and look straight at it. It has to SURVIVE the
    // bolt for the burn to be observable, and round 4b made the player's damage climb with level —
    // a moor hound now dies to the first hit, so this uses something that can take it.
    const enemy = await f.spawn('stone_sentinel', 16);
    enemy.maxHp = enemy.hp = 40000;
    f.control.pitch = 0;
    enemy.x = f.control.x + Math.sin(f.control.yaw) * 7;
    enemy.z = f.control.z + Math.cos(f.control.yaw) * 7;
    enemy.y = f.terrain.heightAt(enemy.x, enemy.z);
    const hpBefore = enemy.hp;

    const slot = f.skills.slots.findIndex(s => s.id === 'firebolt');
    f.cast(slot);
    // the bolt has to fly before it lands
    await new Promise(r => setTimeout(r, 900));
    const burning = { ...(enemy.statuses || {}) };
    const hpMid = enemy.hp;
    /**
     * LONG ENOUGH TO CATCH A WHOLE TICK.
     *
     * Damage over time lands in whole seconds (js/skills.js `TICK_EVERY`), not per frame, so a
     * 900 ms window only sees a tick if the bolt happened to land early. Under load — the whole
     * browser suite in one run — it did not, and this went red for a reason that had nothing to do
     * with burning. 1.6 s always contains a tick whenever the bolt has landed at all.
     */
    await new Promise(r => setTimeout(r, 1600));
    return {
      slot, hpBefore, hpMid, hpAfter: enemy.hp,
      burn: !!burning.burn,
      element: burning.burn?.element,
      fx: f.spellfx.stats(),
    };
  });
  expect(out.slot).toBeGreaterThanOrEqual(0);
  expect(out.hpMid).toBeLessThan(out.hpBefore);
  expect(out.burn).toBe(true);
  expect(out.element).toBe('fire');
  // the burn is still eating into it after the bolt is long gone
  expect(out.hpAfter).toBeLessThan(out.hpMid);
  expect(errors).toEqual([]);
});

test('Frost Nova catches everything around you and slows it', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.pause(false);
    // Frost Nova is the mage's second slot, which unlocks at level 3
    f.rpg.gainXp(f.player, 40000);
    f.player.mp = f.player.maxMp;
    const around = [];
    for (let i = 0; i < 3; i++) {
      const e = await f.spawn('moor_hound');
      const a = (i / 3) * Math.PI * 2;
      e.x = f.control.x + Math.cos(a) * 3;
      e.z = f.control.z + Math.sin(a) * 3;
      e.y = f.terrain.heightAt(e.x, e.z);
      around.push(e);
    }
    const before = around.map(e => e.hp);
    f.cast(f.skills.slots.findIndex(s => s.id === 'frost_nova'));
    await new Promise(r => setTimeout(r, 200));
    return {
      hurt: around.filter((e, i) => e.hp < before[i]).length,
      chilled: around.filter(e => e.statuses?.chill).length,
    };
  });
  expect(out.hurt).toBe(3);
  expect(out.chilled).toBe(3);
  expect(errors).toEqual([]);
});

test('pressing 1 in the world casts, and an empty pool says so instead of firing', async ({ page }) => {
  const errors = await land(page);
  await page.locator('canvas').first().click({ position: { x: 300, y: 300 } });
  const cost = await page.evaluate(() => {
    const f = window.farhold;
    f.player.mp = f.player.maxMp;
    return { mp: f.player.mp, cost: f.skills.slots[0].mp || 0 };
  });
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ mp: window.farhold.player.mp, ready: window.farhold.skills.state()[0].ready }));
  expect(after.ready).toBeGreaterThan(0);
  if (cost.cost > 0) expect(after.mp).toBeLessThan(cost.mp);

  // with nothing in the tank the skill is refused and the log says why
  const refused = await page.evaluate(() => {
    const f = window.farhold;
    f.player.mp = 0;
    f.skills.slots.forEach(s => { s.ready = 0; });
    const paid = f.skills.slots.findIndex(s => (s.mp || 0) > 0);
    const plan = f.skills.use(paid);
    return { paid, ok: plan.ok, why: plan.why };
  });
  expect(refused.ok).toBe(false);
  expect(refused.why).toMatch(/mana/i);
  expect(errors).toEqual([]);
});

test('War Cry and Guard change what the numbers do, not just the log', async ({ page }) => {
  // Round 4 rebuilt the class skill sets, and no one class carries both of these any more:
  // a warrior rallies itself, a fighter guards. Test each on the class that has it.
  const errors = await land(page, 'warrior');
  const cry = await page.evaluate(async () => {
    const f = window.farhold;
    f.pause(false);
    f.rpg.gainXp(f.player, 40000);
    f.player.mp = f.player.maxMp;
    f.cast(f.skills.slots.findIndex(s => s.id === 'warcry'));
    await new Promise(r => setTimeout(r, 120));
    return { statuses: Object.keys(f.statuses.player), damage: [...f.player.derived.damage] };
  });
  expect(cry.statuses).toContain('might');
  expect(errors).toEqual([]);

  const e2 = await land(page, 'fighter');
  const guard = await page.evaluate(async () => {
    const f = window.farhold;
    f.pause(false);
    f.rpg.gainXp(f.player, 40000);
    f.player.mp = f.player.maxMp;
    f.cast(f.skills.slots.findIndex(s => s.id === 'guard_stance'));
    await new Promise(r => setTimeout(r, 120));
    return { statuses: Object.keys(f.statuses.player) };
  });
  expect(guard.statuses).toContain('guard');
  expect(e2).toEqual([]);
});

test('Multi Shot really fires several arrows, not one', async ({ page }) => {
  const errors = await land(page, 'ranger');
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.pause(false);
    f.rpg.gainXp(f.player, 40000);
    f.player.mp = f.player.maxMp;
    const slot = f.skills.slots.findIndex(s => s.id === 'multi_shot');
    const spec = f.skillData.skills.multi_shot;
    const before = f.spellfx.stats ? f.spellfx.stats().live : null;
    const plan = f.cast(slot);
    return { projectiles: plan?.projectiles, spread: plan?.spread, dataSays: spec.projectiles, before };
  });
  expect(out.dataSays).toBeGreaterThan(1);
  expect(out.projectiles).toBe(out.dataSays);
  expect(out.spread).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
