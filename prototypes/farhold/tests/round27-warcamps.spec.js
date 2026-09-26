// R27 M10 — a war camp in the browser: walk up to one, see its walls, its banners and its garrison,
// kill the warlord and watch the band break and come back.
//
// The node test (tests/round27-warcamps.test.js) measures every rule on the real modules; this one
// is the join in the running game — js/main.js hands `field.warbands` to js/sites.js, `due()` fills
// the camp through `populateSite`, and a kill runs `onEnemyKilled` → `sites.warDeath` → the grip.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'prototypes/farhold/research/round27-warcamps/';
mkdirSync(SHOTS, { recursive: true });

test('a war camp: walls and banners, a pure garrison under its warlord, and a rout when the warlord falls', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=7&class=warrior');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 150000 });

  const found = await page.evaluate(async () => {
    const f = window.farhold;
    const camps = f.sites.warCamps || [];
    if (!camps.length) return { none: true };
    // the nearest one, so the walk is short
    const camp = camps.slice().sort((a, b) => Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    // the test is about the camp, not about whether a level-1 warrior survives one: keep them standing
    // (a level-up from the warlord's kill rebuilds the sheet and would put max health back)
    setInterval(() => { f.player.maxHp = 1e7; f.player.hp = 1e7; }, 50);
    f.teleport(camp.x + 34, camp.z + 10);
    f.control.yaw = Math.atan2(camp.x - (camp.x + 34), camp.z - (camp.z + 10));
    f.control.pitch = -0.18;
    for (let i = 0; i < 80 && !(camp.roster || []).length; i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 1500));
    const bannerMesh = f.scene.getObjectByName('farhold-site-warbanner');
    const band = f.field.warbands.data.warbands.find(b => b.id === camp.warband);
    return {
      name: camp.name, warband: camp.warband, key: camp.key, zoneId: camp.zone?.id,
      banners: bannerMesh?.count || 0,
      roster: (camp.roster || []).map(u => ({ defId: u.defId, name: u.name, leader: u.leader, isWarlord: !!u.isWarlord, bearer: !!u.bearer })),
      allowed: [...band.members, band.warlord],
      walls: ['junkwall', 'warpalisade', 'thorns', 'barrowbank', 'slab'].map(k => f.scene.getObjectByName('farhold-site-' + k)?.count || 0),
    };
  });
  expect(found.none, 'no war camp on this world').toBeFalsy();
  await page.screenshot({ path: SHOTS + `camp-${found.warband}.png` });
  expect(found.banners, 'no warband banner is standing').toBeGreaterThan(0);
  expect(found.walls.reduce((a, b) => a + b, 0), 'the camp has no walls').toBeGreaterThan(0);
  expect(found.roster.length, `${found.name} is empty`).toBeGreaterThan(3);
  for (const u of found.roster) expect(found.allowed, `${u.defId} in the ${found.warband} garrison`).toContain(u.defId);
  const warlord = found.roster.find(u => u.isWarlord);
  expect(warlord, 'no warlord in the camp').toBeTruthy();
  expect(found.roster.filter(u => u.bearer).length, 'no standard-bearer').toBe(1);
  expect(found.roster.filter(u => !u.isWarlord).every(u => u.leader), 'a guard follows nobody').toBe(true);

  // close in on the warlord, and put it down
  const rout = await page.evaluate(async () => {
    const f = window.farhold;
    const camp = f.sites.warCamps.find(c => c.roster?.some(u => u.isWarlord));
    const wl = camp.roster.find(u => u.isWarlord);
    const zone = camp.zone;
    const gripBefore = f.holdings.warGrip(zone);
    f.teleport(wl.x + 6, wl.z + 6);
    f.control.yaw = Math.atan2(-6, -6);
    await new Promise(r => setTimeout(r, 1200));
    const awake = camp.roster.filter(u => u.state === 'chase').length;
    wl.playerDamage = 1;
    f.field.kill(wl);
    const t0 = performance.now();
    let fled = new Set(), firstFlee = null;
    while (performance.now() - t0 < 2000) {
      for (const u of camp.roster) if (u.state === 'flee' && u.dying == null) { fled.add(u); if (firstFlee == null) firstFlee = performance.now() - t0; }
      await new Promise(r => setTimeout(r, 100));
    }
    return {
      awake, fled: fled.size, firstFlee, gripBefore, gripAfter: f.holdings.warGrip(zone),
      warlordGrip: f.balance?.warbands?.warlordGrip ?? null, slain: !!camp.warlordSlain,
    };
  });
  await page.screenshot({ path: SHOTS + `rout-${found.warband}.png` });
  expect(rout.slain, 'the warlord was not filed as slain').toBe(true);
  expect(rout.fled, 'nobody broke when the warlord fell').toBeGreaterThan(0);
  expect(rout.gripAfter, 'the warband\'s grip did not move').toBeLessThan(rout.gripBefore);

  const back = await page.evaluate(async () => {
    const f = window.farhold;
    const camp = f.sites.warCamps.find(c => c.warlordSlain);
    const t0 = performance.now();
    await new Promise(r => setTimeout(r, 6500));
    const running = camp.roster.filter(u => u.dying == null && !u.removed && u.state === 'flee' && u.routed).length;
    const alive = camp.roster.filter(u => u.dying == null && !u.removed).length;
    return { running, alive, secs: (performance.now() - t0) / 1000 };
  });
  expect(back.running, 'a routed guard was still running after 8 s').toBe(0);
  expect(back.alive, 'the runners were thrown away — they keep their drop and still count for the camp').toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
