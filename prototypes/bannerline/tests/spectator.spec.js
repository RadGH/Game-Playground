// Spectator mode in both modes: an AI-vs-AI match starts from the lobby with nobody in a seat, both
// sides are drawn, F walks the followed character across the sides, the speed buttons drive the clock,
// and in Hunters vs Farmers the fog is drawn light (30%) instead of hiding, with a choice of whose.
import { test, expect } from '@playwright/test';
import { PADMOCK, STD, tap } from './helpers/padmock.js';

async function boot(page, q = '') {
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto('prototypes/bannerline/?seed=5&mute=1' + q);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
}

test('Hunters vs Farmers: watch the AI play, both sides visible, light fog, F changes who is followed', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.click('[data-act="play"]');
  await page.click('.md-card.ready[data-mode="hvf"]');
  await expect(page.locator('.hvf-setup')).toBeVisible();
  await page.click('.hvf-setup [data-act="spectate"]');
  await expect(page.locator('.hvf-setup [data-k="aiHunter"]')).toBeVisible();
  await expect(page.locator('.hvf-setup .start')).toHaveText(/Watch the hunt/);
  await page.click('.hvf-setup [data-act="start"]');
  await expect.poll(() => page.evaluate(() => window.hvf?.state?.()?.tick || 0), { timeout: 30_000 }).toBeGreaterThan(10);
  await page.evaluate(() => window.hvf.ready);

  // nobody holds a seat: every player is AI, one spectator view, the panels are up
  const info = await page.evaluate(() => ({ kinds: window.hvf.state().players.map((p) => p.kind), views: window.hvf.match.views.length, spec: !!window.hvf.spectator }));
  expect(info.kinds.every((k) => k === 'ai')).toBe(true);
  expect(info.views).toBe(1);
  expect(info.spec).toBe(true);
  await expect(page.locator('.spec-side.l h3')).toHaveText('Farmers');
  await expect(page.locator('.spec-side.r h3')).toHaveText('Hunters');
  await expect(page.locator('.spec-hud .spec-fog [data-fog="farmers"]')).toHaveClass(/on/);

  // past the head start: both sides move, and every character of both sides is drawn
  await page.evaluate(() => window.hvf.fastForward(1400));
  await page.waitForTimeout(400);
  const drawn = await page.evaluate(() => {
    const m = window.hvf.match, s = m.sim.state;
    return s.players.map((p) => { const it = m.actors.items.get(p.ent); return !!it && it.mesh.visible; });
  });
  expect(drawn.every(Boolean)).toBe(true);

  // F follows the next character, alternating sides; Shift+F goes back
  const f0 = await page.evaluate(() => window.hvf.spectator.follow);
  await page.keyboard.press('f');
  const f1 = await page.evaluate(() => window.hvf.spectator.follow);
  expect(f1).not.toBe(f0);
  const teamOf = (id) => page.evaluate((x) => window.hvf.state().ents.find((e) => e.id === x)?.team, id);
  expect(await teamOf(f1)).not.toBe(await teamOf(f0));
  await page.keyboard.press('Shift+F');
  expect(await page.evaluate(() => window.hvf.spectator.follow)).toBe(f0);
  await page.keyboard.press('2');
  expect(await page.evaluate(() => window.hvf.spectator.follow)).toBe(f1);
  await expect(page.locator('.spec-char.on')).toHaveCount(1);

  // the fog: soft (30%), whose fog is picked by the buttons / V
  expect(await page.evaluate(() => window.hvf.spectator.fogState())).toMatchObject({ soft: 0.3, on: 1, tex: 0 });
  await page.keyboard.press('v');
  expect(await page.evaluate(() => window.hvf.spectator.fog)).toBe('hunters');
  await page.click('.spec-fog [data-fog="both"]');
  expect(await page.evaluate(() => window.hvf.spectator.fog)).toBe('both');

  // look at a far corner nobody on the farmers' side sees: lighter than a player's fog, darker than no fog
  await page.evaluate(() => { const s = window.hvf.spectator; s.setFog('farmers'); });
  await page.keyboard.press('Space');   // keyboard focus off the button
  const spot = await page.evaluate(() => {
    const m = window.hvf.match, map = m.map, V = m.sim.state.hvf.vision[0];
    let best = null;
    for (let z = 8; z < map.rows - 8; z += 4) for (let x = 8; x < map.cols - 8; x += 4) {
      let dark = 0; for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const i = (z + dz) * map.cols + x + dx; if (!(V[i >> 5] & (1 << (i & 31)))) dark++; }
      if (!best || dark > best.dark) best = { x: (x + 0.5) * map.cell, z: (z + 0.5) * map.cell, dark };
    }
    return best;
  });
  await page.evaluate(({ x, z }) => { window.hvf.spectator.camera.lookAt(x, z); }, spot);
  await page.waitForTimeout(900);
  const lum = async (fog) => page.evaluate((f) => { window.hvf.spectator.setFog(f); return window.hvf.probe()[0].mean; }, fog);
  const off = await lum('off'), soft = await lum('farmers');
  await page.screenshot({ path: 'test-results/spectator-hvf-fog.png' });
  // a player's fog over the same spot: the hard fog (0.13) for comparison
  const hard = await page.evaluate(() => { const m = window.hvf.match; m.world.useTeam(0); const v = m.views[0]; const was = v.vp.beforeRender; v.vp.beforeRender = () => { m.world.useTeam(0); }; const r = window.hvf.probe()[0].mean; v.vp.beforeRender = was; return r; });
  expect(soft / off).toBeGreaterThan(0.55);
  expect(soft / off).toBeLessThan(0.95);
  expect(hard).toBeLessThan(soft * 0.75);
  await page.evaluate(() => window.hvf.spectator.setFog('farmers'));

  // speed buttons drive the clock; P pauses
  await page.click('.spec-speed [data-speed="4"]');
  expect(await page.evaluate(() => window.hvf.match.clock.speed)).toBe(4);
  await page.keyboard.press('p');
  const t0 = await page.evaluate(() => window.hvf.state().tick);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.hvf.state().tick)).toBe(t0);
  await page.keyboard.press('p');
  await page.screenshot({ path: 'test-results/spectator-hvf.png' });
  expect(errors).toEqual([]);
});

test('Line War: Watch AI match from the lobby, F walks the heroes across both sides', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, '&bodies=capsule');
  await page.click('[data-act="play"]');
  await page.click('.md-card.ready[data-mode="linewar"]');
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await page.click('.lb-mode[data-v="2v2"]');
  await page.click('[data-act="watch"]');
  await expect(page.locator('.lb-watch')).toHaveClass(/on/);
  await expect(page.locator('.lb-slot.open')).toHaveCount(0);
  await expect(page.locator('.lb-slot.local')).toHaveCount(0);
  await page.click('[data-act="watch-go"]');
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.bannerline.state()?.tick || 0), { timeout: 20_000 }).toBeGreaterThan(5);
  const info = await page.evaluate(() => ({ kinds: window.bannerline.state().players.map((p) => p.kind), views: window.bannerline.views().length, spec: window.bannerline.spectator() }));
  expect(info.kinds).toEqual(['ai', 'ai', 'ai', 'ai']);
  expect(info.views).toBe(0);
  expect(info.spec.follow).not.toBeNull();
  await expect(page.locator('.spec-side.l h3')).toHaveText('Blue banner');
  await expect(page.locator('.spec-side .spec-char')).toHaveCount(4);

  const heroTeam = (id) => page.evaluate((x) => window.bannerline.state().ents.find((e) => e.id === x)?.team, id);
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(await page.evaluate(() => window.bannerline.spectator().follow)); await page.keyboard.press('f'); }
  expect(new Set(order).size).toBe(4);
  const teams = []; for (const id of order) teams.push(await heroTeam(id));
  expect(teams).toEqual([0, 1, 0, 1]);
  expect(await page.evaluate(() => window.bannerline.spectator().follow)).toBe(order[0]);   // wrapped
  // panning lets go of the hero; Space follows again
  await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
  expect(await page.evaluate(() => window.bannerline.spectator().follow)).toBeNull();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.bannerline.spectator().follow)).not.toBeNull();
  await page.click('.spec-speed [data-speed="2"]');
  expect(await page.evaluate(() => window.bannerline.spectator().speed)).toBe(2);
  const probe = await page.evaluate(() => window.bannerline.probe());
  expect(probe[0].sd).toBeGreaterThan(3);
  await page.evaluate(() => window.bannerline.fastForward(600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/spectator-linewar.png' });
  expect(errors).toEqual([]);
});

test('gamepad: Watch from the lobby with A, RB / LB walk the heroes, the stick pans, Y changes the HvF fog', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: PADMOCK });
  await boot(page, '&bodies=capsule');
  await page.evaluate(() => window.__pad.connect(0));
  await tap(page, 0, STD.A);                                // title: Play
  await expect(page.locator('#screen-modes')).toBeVisible();
  await tap(page, 0, STD.A);                                // Line War
  await expect(page.locator('#screen-lobby')).toBeVisible();
  await page.click('[data-act="watch"]');
  await expect(page.locator('.lb-go.pfocus')).toHaveCount(1);   // the shared cursor starts on Watch the battle
  await tap(page, 0, STD.A);
  await expect(page.locator('#screen-match')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.bannerline.spectator()?.follow ?? null), { timeout: 15_000 }).not.toBeNull();
  const a = await page.evaluate(() => window.bannerline.spectator().follow);
  await tap(page, 0, STD.RB, 150);
  await expect.poll(() => page.evaluate(() => window.bannerline.spectator().follow)).not.toBe(a);
  await tap(page, 0, STD.LB, 150);
  await expect.poll(() => page.evaluate(() => window.bannerline.spectator().follow)).toBe(a);
  await page.evaluate(() => window.__pad.axis(0, 0, 1));
  await expect.poll(() => page.evaluate(() => window.bannerline.spectator().mode)).toBe('free');
  await page.evaluate(() => window.__pad.axis(0, 0, 0));
  await tap(page, 0, STD.A, 150);
  await expect.poll(() => page.evaluate(() => window.bannerline.spectator().follow)).toBe(a);
  await tap(page, 0, STD.X, 150);
  expect(await page.evaluate(() => window.bannerline.spectator().speed)).toBe(2);
  // Hunters vs Farmers: Y cycles whose fog is drawn, RB follows the next character
  await boot(page);
  await page.evaluate(() => window.__pad.connect(0));
  await page.click('[data-act="play"]');
  await page.click('.md-card.ready[data-mode="hvf"]');
  await page.click('.hvf-setup [data-act="spectate"]');
  await page.click('.hvf-setup [data-act="start"]');
  await expect.poll(() => page.evaluate(() => window.hvf?.state?.()?.tick || 0), { timeout: 30_000 }).toBeGreaterThan(5);
  await tap(page, 0, STD.Y, 150);
  await expect.poll(() => page.evaluate(() => window.hvf.spectator.fog)).toBe('hunters');
  const h0 = await page.evaluate(() => window.hvf.spectator.follow);
  await tap(page, 0, STD.RB, 150);
  await expect.poll(() => page.evaluate(() => window.hvf.spectator.follow)).not.toBe(h0);
  expect(errors).toEqual([]);
});
