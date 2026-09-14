// npx playwright test universe/tests/universe.spec.js
// Drives the viewer end to end: generate a galaxy, hover and click a star, fly to a planet, open its
// surface map, zoom into a region, walk the breadcrumb back out, switch a preset and export.
// Screenshots land in test-results/.

import { test, expect } from '@playwright/test';

const collectErrors = page => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
};

/** Whatever view is on screen, as { nonBlack, distinct } — a blank view is nearly all black. */
const stats = page => page.evaluate(() => window.universeDemo.pixelStats());

test('Star Forge walks galaxy → system → planet → surface map', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('universe/');
  await page.waitForFunction(() => window.universeDemo && window.universeDemo.ready(), null, { timeout: 40_000 });

  // 1 — the galaxy draws, with stars of several classes and lanes between them
  const galaxy = await page.evaluate(() => window.universeDemo.state.galaxy.stats);
  expect(galaxy.stars).toBeGreaterThan(50);
  expect(galaxy.lanes).toBeGreaterThan(galaxy.stars * 0.8);
  expect(galaxy.isolated).toBe(0);
  expect(Object.keys(galaxy.byClass).length).toBeGreaterThan(5);
  await expect(page.locator('#status')).toContainText('stars');
  const gpx = await stats(page);
  expect(gpx.nonBlack).toBeGreaterThan(300);
  expect(gpx.distinct).toBeGreaterThan(20);
  expect(await page.locator('#legend .sw').count()).toBeGreaterThan(8);
  expect(await page.locator('#right .list .item').count()).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/universe-galaxy.png' });

  // 2 — hovering a star reports it
  const where = await page.evaluate(() => {
    const d = window.universeDemo;
    const s = d.state.galaxy.stars[0];
    const c = document.getElementById('galaxy');
    const r = c.getBoundingClientRect();
    const size = Math.min(c.width, c.height) * 0.47 / (c.width / r.width);
    return { x: r.left + r.width / 2 + s.x * size, y: r.top + r.height / 2 + s.y * size, name: s.name };
  });
  await page.mouse.move(where.x, where.y);
  await expect(page.locator('#readout')).toContainText('class:');

  // 3 — fly to a star that actually has planets
  const system = await page.evaluate(() => {
    const d = window.universeDemo;
    for (const s of d.state.galaxy.stars) {
      const sys = d.openStar(s.id);
      if (sys.planets.some(p => !p.giant) && sys.planets.length >= 3) {
        return { star: s.name, planets: sys.planets.map(p => ({ id: p.id, name: p.name, archetype: p.archetype, giant: p.giant })) };
      }
    }
    return null;
  });
  expect(system).not.toBeNull();
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('system');
  await page.waitForTimeout(1200);
  const spx = await stats(page);
  expect(spx.nonBlack).toBeGreaterThan(200);
  await expect(page.locator('#crumbs .here')).toHaveText(system.star);
  await page.screenshot({ path: 'test-results/universe-system.png' });

  // 4 — land on a planet with a surface
  const target = system.planets.find(p => !p.giant);
  await page.evaluate(id => window.universeDemo.openPlanet(id), target.id);
  await page.waitForTimeout(1500);
  const ppx = await stats(page);
  expect(ppx.nonBlack).toBeGreaterThan(400);        // the planet fills a good part of the view
  expect(ppx.distinct).toBeGreaterThan(40);         // and it is textured, not a flat disc
  await expect(page.locator('#right')).toContainText('archetype');
  await expect(page.locator('#right .res')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/universe-planet.png' });

  // 5 — its surface map, then one zoom in
  const world = await page.evaluate(() => {
    const w = window.universeDemo.showMap();
    return w && { width: w.width, height: w.height, regions: w.regions.length, land: w.stats.landFraction };
  });
  expect(world).toBeTruthy();
  expect(world.regions).toBeGreaterThan(2);
  const mpx = await stats(page);
  expect(mpx.nonBlack).toBeGreaterThan(1000);
  expect(mpx.distinct).toBeGreaterThan(30);
  await page.screenshot({ path: 'test-results/universe-map.png' });

  const region = await page.evaluate(() => {
    const w = window.universeDemo.state.world;
    const biggest = w.regions.slice().sort((a, b) => b.cells - a.cells)[0];
    const d = window.universeDemo.openRegion(biggest.id);
    return { name: biggest.name, width: d.width, nodes: d.nodes.length };
  });
  expect(region.width).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.universeDemo.state.mapLevel)).toBe('region');
  await page.screenshot({ path: 'test-results/universe-region.png' });

  // 6 — the breadcrumb walks all the way back out
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.mapLevel)).toBe('world');
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('planet');
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('system');
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('galaxy');

  // 7 — the save holds what is on screen
  const save = await page.evaluate(() => window.universeDemo.toJSON());
  expect(save.kind).toBe('universe');
  expect(save.galaxy.stars.length).toBeGreaterThan(50);
  expect(save.system.planets.length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('presets and layouts rebuild the galaxy', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('universe/');
  await page.waitForFunction(() => window.universeDemo && window.universeDemo.ready(), null, { timeout: 40_000 });

  const before = await page.evaluate(() => window.universeDemo.state.galaxy.stars.map(s => s.x + ',' + s.y).join('|'));

  await page.locator('#left .chip', { hasText: 'Exotic frontier' }).first().click();
  await page.waitForFunction(() => window.universeDemo.ready());
  const exotic = await page.evaluate(() => window.universeDemo.state.galaxy.stats);
  expect(exotic.exotic).toBeGreaterThan(5);
  const after = await page.evaluate(() => window.universeDemo.state.galaxy.stars.map(s => s.x + ',' + s.y).join('|'));
  expect(after).not.toBe(before);

  for (const layout of ['elliptical', 'cluster', 'ring', 'scattered', 'spiral']) {
    await page.evaluate(l => { window.universeDemo.setOpt('layout', l); window.universeDemo.generate(); }, layout);
    const g = await page.evaluate(() => window.universeDemo.state.galaxy);
    expect(g.layout).toBe(layout);
    expect(g.stats.isolated).toBe(0);
    expect((await stats(page)).nonBlack).toBeGreaterThan(200);
  }
  await page.screenshot({ path: 'test-results/universe-layouts.png' });

  expect(errors).toEqual([]);
});
