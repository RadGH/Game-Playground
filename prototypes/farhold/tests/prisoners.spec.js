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
    /**
     * R27 M1 — count what the take pays, so the revisit below can prove it pays nothing more. The
     * spoils chest goes through the live chest field's `place`; wrapping it counts every one.
     */
    const spoils = [];
    const cf = f.chestField;
    const place = cf.place.bind(cf);
    cf.place = (kind, x, z, opts = {}) => { if (/the spoils/.test(opts.name || '')) spoils.push(opts.name); return place(kind, x, z, opts); };
    const perksBefore = f.player.bonusPerks || 0;
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

    /**
     * R27 M1 — WALK AWAY AND COME BACK. `relax()` lets a site go at 420 m and `due()` hands it back
     * at 150 m; before round 27 that refilled the cells, stood the boss up again and paid the
     * whole `gives` block a second time.
     */
    const afterKill = { xp: f.player.xp + f.player.level * 100000, perks: f.player.bonusPerks || 0, spoils: spoils.length };
    f.player.hp = f.player.maxHp;
    f.teleport(site.x + 520, site.z);
    await new Promise(r => setTimeout(r, 1500));
    f.teleport(site.x + 14, site.z + 14);
    await new Promise(r => setTimeout(r, 3000));
    const revisit = {
      xp: f.player.xp + f.player.level * 100000, perks: f.player.bonusPerks || 0, spoils: spoils.length,
      bossBack: f.field.enemies.some(e => e.holdsSite === site.key && e.dying == null),
      captivesBack: (site.heldFolk || []).filter(w => w.captive).length,
      taken: !!site.taken,
    };
    cf.place = place;

    return {
      afterKill, revisit, perksBefore,
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

  // R27 M1 — paid exactly once, and a revisit pays nothing
  expect(out.afterKill.spoils, 'the spoils chest').toBe(out.pays.loot ? 1 : 0);
  expect(out.afterKill.perks - out.perksBefore, 'perk points paid').toBe(out.pays.perkPoint || 0);
  expect(out.revisit.taken, 'the site is not marked taken').toBe(true);
  expect(out.revisit.bossBack, 'the boss stood up again on a revisit').toBe(false);
  expect(out.revisit.captivesBack, 'the cells were refilled on a revisit').toBe(0);
  expect(out.revisit.spoils, 'a revisit placed another spoils chest').toBe(out.afterKill.spoils);
  expect(out.revisit.perks, 'a revisit paid another perk point').toBe(out.afterKill.perks);
  expect(out.revisit.xp, 'a revisit paid experience').toBe(out.afterKill.xp);

  /**
   * R27 M1 — CLEARING EVERY TERRITORY CAMP PAYS NO LANDMARK. `creditKill` used to pay the `gives`
   * of any set piece within 40 m of the camp it cleared, landmarks included. Drive it to clear
   * every hostile camp on this world and watch the purse.
   */
  const camps = await page.evaluate(() => {
    const f = window.farhold;
    const before = { xp: f.player.xp + f.player.level * 100000, perks: f.player.bonusPerks || 0, bag: f.player.bag.length };
    let cleared = 0;
    for (const zone of f.zones.zones || []) {
      for (const camp of [...f.holdings.sitesIn(zone.id, { hostileOnly: true })]) {
        for (let i = 0; i < 3 + (camp.size || 1); i++) f.creditKill(camp.x, camp.z);
        // `sitesIn` lists only the standing ones, so a cleared camp is one that has left the list
        if (!f.holdings.sitesIn(zone.id, { hostileOnly: true }).some(c => c.id === camp.id)) cleared++;
      }
    }
    return { cleared, before, after: { xp: f.player.xp + f.player.level * 100000, perks: f.player.bonusPerks || 0, bag: f.player.bag.length } };
  });
  expect(camps.cleared, 'no territory camp was cleared').toBeGreaterThan(5);
  expect(camps.after).toEqual(camps.before);
  expect(errors).toEqual([]);
});

/**
 * R27 M1 — THE STAIR DOWN IS A REAL STAIR.
 *
 * A castle's `gives.opensDungeon` was a log line. Taking one now files a mouth within 40 m of the
 * keep; pressing E there goes down into the instance the data names, kept by the family it names;
 * and a save taken afterwards reloads with the castle taken and the mouth still standing.
 */
test('taking a castle opens a stair you can go down, and a reload keeps both', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  let found = null;
  for (const seed of [7, 101, 4477, 1337, 11, 47]) {
    await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=ranger`);
    await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
    const has = await page.evaluate(() => window.farhold.sites.sites.some(s => s.family === 'stronghold' && s.gives?.opensDungeon));
    if (has) { found = seed; break; }
  }
  expect(found, 'no world among six seeds has a castle').not.toBeNull();
  console.log(`[R27 M1] castle found on seed ${found}`);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const site = f.sites.sites.find(s => s.family === 'stronghold' && s.gives?.opensDungeon);
    f.player.maxHp = 1e6; f.player.hp = 1e6;
    f.teleport(site.x + 14, site.z + 14);
    for (let i = 0; i < 80 && !site.bossUnit; i++) await wait(250);
    const boss = site.bossUnit;
    if (!boss) return { noBoss: true, name: site.name };
    // NOT `field.clear()` and push the boss back, as the test above does: a unit that has been
    // removed and is put back on the list makes the next `clear()` (which entering a dungeon calls)
    // spin for ever. The garrison can stay; the player has a million health.
    f.teleport(boss.x, boss.z);
    await wait(300);
    boss.hp = 1;
    for (let i = 0; i < 60 && boss.dying == null; i++) { f.hit(); await wait(50); }
    await wait(900);
    // `f.sites` is a live getter; the gates are rebuilt from exactly this list (`openMouths`)
    const stair = f.sites.mouths().find(n => n.stair && n.siteKey === site.key);
    return {
      key: site.key, name: site.name, taken: !!site.taken, killed: boss.dying != null,
      stair: stair ? { x: stair.x, z: stair.z, id: stair.id, family: stair.instance?.holds?.boss?.family || null, inst: stair.instance?.id } : null,
      away: stair ? Math.hypot(stair.x - site.x, stair.z - site.z) : null,
    };
  });
  expect(out.noBoss, `${out.name} never put up a boss`).toBeFalsy();
  expect(out.killed).toBe(true);
  expect(out.taken).toBe(true);
  expect(out.stair, 'no stair among the gates').not.toBeNull();
  expect(out.away).toBeLessThanOrEqual(40);

  // walk up to it and press E, which is how a player goes down
  const inside = await page.evaluate(async st => {
    const f = window.farhold;
    f.teleport(st.x + 2.5, st.z + 2.5);
    await new Promise(r => setTimeout(r, 600));
    const t = f.interactTarget();
    return { kind: t?.kind || null, stair: !!t?.gate?.stair, gateId: t?.gate?.id ?? null };
  }, out.stair);
  expect(inside.kind, 'E at the stair does not offer the way down').toBe('dungeon');
  expect(inside.stair, 'E offers a different mouth').toBe(true);
  expect(inside.gateId).toBe(out.stair.id);
  await page.evaluate(async () => {
    // the boss's bag and the spoils are reward popups, and a popup holds the frame loop (which is
    // what reads the key) until it is dismissed — so dismiss them, the way a player would
    for (let i = 0; i < 12 && document.querySelector('.rw-btn'); i++) {
      document.querySelector('.rw-btn').click();
      await new Promise(r => setTimeout(r, 300));
    }
    // down, a frame or two, up: a press is sampled by the frame loop, not by the event
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
  });
  await page.waitForFunction(() => !!window.farhold.dungeon && !!window.farhold.bossUnit, null, { timeout: 60000 });
  const below = await page.evaluate(() => ({
    inst: window.farhold.dungeon.instance?.id || null,
    family: window.farhold.bossUnit.family,
    boss: `${window.farhold.bossUnit.name} (${window.farhold.bossUnit.rank}, level ${window.farhold.bossUnit.level}, ${window.farhold.bossUnit.modifiers.length} modifiers)`,
  }));
  console.log(`[R27 M1] down the stair: ${below.inst}, kept by ${below.boss}, a ${below.family}`);
  expect(below.inst).toBe(out.stair.inst);
  if (out.stair.family) expect(below.family).toBe(out.stair.family);

  // come back up, save, and reload the save
  const slot = await page.evaluate(async () => {
    const f = window.farhold;
    await f.leaveDungeon();
    await new Promise(r => setTimeout(r, 800));
    return { id: f.saveNow(), ledger: f.snapshot().strongholds };
  });
  expect(Object.values(slot.ledger).flat()).toContain(out.key);
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&load=${slot.id}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const after = await page.evaluate(async key => {
    const f = window.farhold;
    const site = f.sites.sites.find(s => s.key === key);
    const stair = f.sites.mouths().find(n => n.stair && n.siteKey === key);
    let gate = false;
    if (stair) {
      f.player.maxHp = 1e6; f.player.hp = 1e6;
      f.teleport(stair.x + 2.5, stair.z + 2.5);
      await new Promise(r => setTimeout(r, 800));
      f.field.clear();
      const t = f.interactTarget();
      gate = t?.kind === 'dungeon' && !!t.gate?.stair;
    }
    return { taken: !!site?.taken, stair: !!stair, gate, untaken: f.sites.sites.filter(s => s.family === 'stronghold' && s.key !== key && s.taken).length };
  }, out.key);
  expect(after.taken, 'the reload forgot the castle was taken').toBe(true);
  expect(after.stair, 'the reload lost the stair').toBe(true);
  expect(after.gate, 'the reloaded stair is not a door you can press E at').toBe(true);
  expect(after.untaken, 'a reload took other strongholds too').toBe(0);
  expect(errors).toEqual([]);
});
