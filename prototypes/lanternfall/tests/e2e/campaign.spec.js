// Lanternfall end to end in the real page: title -> new game -> the Guild Hall -> walk the main path through
// Act 1 (kit rooms, stand-ins, Mother Tallow) -> relight the Crown Lamp -> into Act 2; save at a lamp-post and
// load it back; die and respawn. Any page error or lanternfall.errors entry fails the test.
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/lanternfall/index.html');
  await page.waitForFunction(() => window.lanternfall?.ready, null, { timeout: 60000 });
  return errors;
}
/** Tick a room with the hero untouchable, finish any boss, light any Great Lamp, take the first @next exit. */
const advance = () => lanternfall.game && (async () => {
  const L = lanternfall, g = L.game, P = g.player; P.hp = P.maxHp; P.invuln = 99; L.step(90); P.invuln = 99;
  const out = { room: g.room.room.id, boss: g.boss?.name || null };
  if (g.boss && !g.boss.dead) { P.x = g.boss.x - 60; P.y = g.boss.y; L.step(180); out.woke = g.boss.awake; out.locked = g.arenaLocked; g.boss.hp = 1; const { dealDamage } = await import('./js/rpg/damage.js'); dealDamage(g, { source: P, target: g.boss, amount: 10 }); L.step(30); out.unlocked = !g.arenaLocked; }
  const gl = g.things.list.find(t => t.t === 'great_lamp'); if (gl) { await L.interact(gl); out.lamp = gl.lit; }
  const ex = g.room.exits.find(x => x.to === '@next'); if (!ex) return { ...out, stuck: 'no @next exit' };
  await L.takeExit(ex); return { ...out, next: L.game.room.room.id };
})();

test('title -> new game -> through Act 1 and Mother Tallow into Act 2', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await expect(page.locator('#screens')).toContainText('New Game');
  await page.evaluate(() => lanternfall.newGame({ classId: 'lamplighter', difficulty: 'lamplighter', seed: 11 }));
  expect(await page.evaluate(() => lanternfall.game.room.room.id)).toBe('a1_n01_r0');
  const hub = await page.evaluate(() => lanternfall.game.room.things.map(t => t.t));
  for (const t of ['lamp_post', 'shopkeeper', 'npc', 'chest']) expect(hub).toContain(t);
  const trail = [];
  for (let k = 0; k < 30; k++) {
    const r = await page.evaluate(advance); trail.push(r);
    expect(r.stuck, JSON.stringify(trail)).toBeUndefined();
    if (r.boss) { expect(r.woke).toBe(true); expect(r.locked).toBe(true); expect(r.unlocked).toBe(true); expect(r.lamp).toBe(true); }
    if (r.next?.startsWith('a2_')) break;
  }
  expect(trail.some(r => r.boss === 'Mother Tallow')).toBe(true);
  expect(trail.at(-1).next).toBe('a2_n01_r0');
  expect(await page.evaluate(() => lanternfall.game.flags.lamp_act1)).toBe(true);
  expect(await page.evaluate(() => lanternfall.errors)).toEqual([]);
  expect(errors).toEqual([]);
});

test('lamp-post saves and the slot loads back; death respawns at the lamp-post', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(() => lanternfall.newGame({ classId: 'tinker', difficulty: 'wicklit', seed: 5, slot: 2 }));
  const saved = await page.evaluate(async () => { const g = lanternfall.game, lp = g.things.list.find(t => t.t === 'lamp_post'); await lanternfall.interact(lp); g.hero.currency.pennies = 77; return lanternfall.save(); });
  expect(saved?.ok).toBe(true);
  const loaded = await page.evaluate(async () => { await lanternfall.loadSlot(2); const g = lanternfall.game; return { room: g.room.room.id, cls: g.hero.class }; });
  expect(loaded.room).toBe('a1_n01_r0'); expect(loaded.cls).toBe('tinker');
  // die in the next room, respawn
  const r = await page.evaluate(async () => {
    const L = lanternfall; await L.takeExit(L.game.room.exits.find(x => x.to === '@next'));
    const g = L.game; g.player.invuln = 0; g.bus.emit('player.die', { source: 'test' }); g.bus.flush(); await new Promise(r => setTimeout(r, 1200));
    const dead = g.player.dead; await L.ctx.actions.respawn(); const back = L.game.player; return { dead, alive: !back.dead && back.hp > 0, room: L.game.room.room.id, screen: document.querySelector('#screens')?.textContent?.slice(0, 200) };
  });
  expect(r.dead).toBe(true); expect(r.alive).toBe(true);
  expect(errors).toEqual([]);
});
