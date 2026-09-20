// §8.2 — a prisoner is a person you can walk up to, not a number.
//
// `sites.populate` has returned a prisoner count since the strongholds landed, and nothing did
// anything with it — so a camp whose whole point was that somebody was being held in it played out
// exactly like one that was not. The same clear path also threw away the site's entire `gives`
// block: xp, a guaranteed loot grade, standing, a perk point, a revealed zone, a lifted siege.

import { test, expect } from '@playwright/test';

test('a stronghold that holds people has people standing in it, and clearing it frees them', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    /**
     * Find a stronghold on this world that actually holds somebody, and walk to it.
     *
     * Driven through the real site list rather than a placement hook, because the thing under test
     * is the JOIN — `sites.populate` returning a count and `populateSite` doing something with it —
     * and a hand-placed site would skip exactly the code that was missing.
     */
    const candidates = f.sites.sites.filter(s =>
      (s.gives?.prisoners || s.spec?.gives?.prisoners || 0) > 0 && !s.cleared);
    if (!candidates.length) return { noKind: true };
    const site = candidates[0];
    /**
     * Survive the trip.
     *
     * A stronghold is a stronghold: arriving at a level-1 character puts you in the middle of its
     * garrison, they kill you, and `respawn()` puts you back at the landing spot — which is why
     * the first version of this test kept reporting that the player had never moved.
     */
    f.player.maxHp = 100000; f.player.hp = 100000;
    // `farhold.teleport` — NOT `control.teleport`, which moves the controller and leaves the world
    // where it was, so the player never actually arrives
    f.teleport(site.x + 14, site.z + 14);
    // a site fills itself as you come near it
    for (let i = 0; i < 60 && !(site.heldFolk || []).length; i++) await new Promise(r => setTimeout(r, 250));
    const folkHeld = site.heldFolk || [];
    if (!folkHeld.length) return { noSite: true, name: site.name };
    // the garrison, but NOT the boss — killing that is what frees them
    const boss = site.bossUnit;

    const captive = folkHeld.filter(w => w.captive).length;
    /**
     * …and one of them is a real NPC you can be standing next to.
     *
     * The garrison is cleared for this one check: they shove the player out of talking range within
     * half a second, which made the assertion flaky in a way that had nothing to do with what it is
     * testing. The boss is put back on the field afterwards, because killing it is the next step.
     */
    f.field.clear();
    f.teleport(folkHeld[0].x, folkHeld[0].z);
    await new Promise(r => setTimeout(r, 400));
    const near = f.folk.nearest(f.control.x, f.control.z);

    /**
     * Kill the one in charge, which is what the prisoners themselves tell you to do.
     *
     * Not `creditKill`: that walks the TERRITORY record, and the prisoners are on the physical
     * set piece — two lists describing the same places without sharing coordinates. The boss is a
     * thing that exists in the world, so it is the honest hook.
     */
    const xpBefore = f.player.xp + f.player.level * 100000;
    let killed = false;
    if (boss) {
      // `field.clear()` above took the boss off the field; the hook is on the unit, not the field
      if (!f.field.enemies.includes(boss)) f.field.enemies.push(boss);
      f.teleport(boss.x, boss.z);
      await new Promise(r => setTimeout(r, 300));
      // a stronghold boss is a stronghold boss; this test is about the HOOK, not about whether a
      // level-1 ranger can take one, so it is put on its last legs first
      boss.hp = 1;
      for (let i = 0; i < 60 && boss.dying == null; i++) {
        f.hit();
        await new Promise(r => setTimeout(r, 50));
      }
      killed = boss.dying != null;
    }
    await new Promise(r => setTimeout(r, 900));

    return {
      name: site.name,
      held: folkHeld.length, captive,
      nearName: near?.name || null, nearIsHeld: !!near && folkHeld.includes(near),
      stillCaptive: folkHeld.filter(w => w.captive).length,
      roleAfter: folkHeld[0].roleName,
      freedCount: f.player.freed || 0,
      // the rest of the `gives` block, which was also going in the bin
      hadBoss: !!boss, killed,
      pays: site.gives || site.spec?.gives || {},
      paid: (f.player.xp + f.player.level * 100000) > xpBefore,
    };
  });

  expect(out.noKind, 'no stronghold on this world holds prisoners').toBeFalsy();
  expect(out.noSite, `${out.name} holds prisoners and none were put in it`).toBeFalsy();
  expect(out.held, 'the camp holds nobody').toBeGreaterThan(0);
  expect(out.captive, 'the people in the camp are not captives').toBe(out.held);
  expect(out.nearIsHeld, 'a prisoner is not somebody you can walk up to').toBe(true);
  expect(out.nearName, 'the prisoner has no name').toBeTruthy();
  expect(out.hadBoss, 'the stronghold has nobody in charge of it').toBe(true);
  expect(out.killed, 'could not put the boss down').toBe(true);
  expect(out.stillCaptive, 'killing the one in charge did not free them').toBe(0);
  expect(out.roleAfter).toBe('freed');
  expect(out.freedCount, 'the run does not remember who you got out').toBeGreaterThan(0);
  // and the site's own payout happened
  if (out.pays.xp) expect(out.paid, 'the stronghold paid no experience').toBe(true);
  expect(errors).toEqual([]);
});
