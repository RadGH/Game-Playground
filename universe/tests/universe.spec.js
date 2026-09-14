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

test('orbits are spaced out and a moon opens as a small world of its own', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('universe/');
  await page.waitForFunction(() => window.universeDemo && window.universeDemo.ready(), null, { timeout: 40_000 });

  // 1 — fly to a system that has a planet with moons, and check the drawn orbits are not touching
  const found = await page.evaluate(() => {
    const d = window.universeDemo;
    for (const s of d.state.galaxy.stars) {
      const sys = d.openStar(s.id);
      const parent = sys.planets.find(p => p.moons.length > 0);
      if (parent && sys.planets.length >= 3) {
        const L = d.orbitLayout();
        return {
          star: s.name, planetId: parent.id, moonId: parent.moons[0].id, moonName: parent.moons[0].name,
          radii: L.radii, minGap: L.minGap, sizes: L.radii.map((_, i) => L.sizeFor(i, 99)),
          gaps: L.radii.map((_, i) => L.gapAt(i)),
        };
      }
    }
    return null;
  });
  expect(found).not.toBeNull();
  // every ring is at least the minimum gap from the one inside it, and no planet fills its lane
  expect(found.minGap).toBeGreaterThanOrEqual(1.04);
  for (let i = 1; i < found.radii.length; i++) expect(found.radii[i] - found.radii[i - 1]).toBeGreaterThanOrEqual(1.04);
  for (let i = 0; i < found.sizes.length; i++) expect(found.sizes[i] * 2).toBeLessThan(found.gaps[i]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/universe-orbits.png' });

  // 2 — the planet, then its moons listed in the panel
  await page.evaluate(id => window.universeDemo.openPlanet(id), found.planetId);
  await page.waitForTimeout(600);
  const moonItems = page.locator('#right .moon-item');
  expect(await moonItems.count()).toBeGreaterThan(0);

  // 3 — clicking a moon opens it: its own card, its own (smaller) map
  await moonItems.first().click();
  await page.waitForFunction(() => window.universeDemo.state.view === 'moon', null, { timeout: 20_000 });
  const moon = await page.evaluate(() => {
    const m = window.universeDemo.state.moon;
    return { id: m.id, name: m.name, archetype: m.archetype, radius: m.radius, parent: m.parentName, rare: m.rareElements.length };
  });
  expect(moon.id).toBe(found.moonId);
  expect(['barren', 'ice', 'lava', 'living']).toContain(moon.archetype);
  expect(moon.rare).toBeGreaterThan(0);
  await expect(page.locator('#right')).toContainText('orbits');
  await expect(page.locator('#crumbs .here')).toHaveText(moon.name);
  await page.waitForTimeout(900);
  const mpx = await stats(page);
  expect(mpx.nonBlack).toBeGreaterThan(400);
  await page.screenshot({ path: 'test-results/universe-moon.png' });

  // 4 — the moon has a surface map, and it is smaller than a planet's
  const world = await page.evaluate(() => {
    const w = window.universeDemo.showMap();
    return w && { width: w.width, height: w.height, regions: w.regions.length, moon: w.planet.moon, parentId: w.planet.parentId };
  });
  expect(world).toBeTruthy();
  expect(world.moon).toBe(true);
  expect(world.width).toBe(96);           // half of the medium 192×96 grid
  expect(world.height).toBe(48);
  expect(world.regions).toBeGreaterThan(2);
  expect((await stats(page)).nonBlack).toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-results/universe-moon-map.png' });

  // 5 — the same moon, opened again, is the same map
  const same = await page.evaluate(id => {
    const before = window.universeDemo.state.world.biome.slice(0, 200).join(',');
    window.universeDemo.back();                      // back to the moon
    window.universeDemo.back();                      // back to the planet
    window.universeDemo.openMoon(id);
    const after = window.universeDemo.showMap().biome.slice(0, 200).join(',');
    return before === after;
  }, found.moonId);
  expect(same).toBe(true);

  // 6 — and the breadcrumb walks moon → planet → system
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('moon');
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('planet');
  expect(await page.evaluate(() => window.universeDemo.state.moon)).toBeNull();
  await page.evaluate(() => window.universeDemo.back());
  expect(await page.evaluate(() => window.universeDemo.state.view)).toBe('system');

  // 7 — the save carries the moon
  const save = await page.evaluate(() => {
    window.universeDemo.openMoon(window.universeDemo.state.planet.moons[0].id);
    return window.universeDemo.toJSON();
  });
  expect(save.moon).toBeTruthy();
  expect(save.system.moons.length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('the planet behind a moon keeps its own surface, and a locked world has one frozen face', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('universe/');
  await page.waitForFunction(() => window.universeDemo && window.universeDemo.ready(), null, { timeout: 40_000 });

  // a blue or green planet with a moon, so a brown fallback texture would stand out
  const target = await page.evaluate(() => {
    const d = window.universeDemo;
    const cool = ['ocean', 'living', 'tundra', 'ice', 'jungle'];
    for (const s of d.state.galaxy.stars) {
      const sys = d.openStar(s.id);
      const p = sys.planets.find(x => x.moons.length && cool.includes(x.archetype));
      if (p) return { star: s.name, planetId: p.id, archetype: p.archetype, moonId: p.moons[0].id, name: p.name };
    }
    return null;
  });
  expect(target).not.toBeNull();

  // the planet on its own first, as the control
  await page.evaluate(id => window.universeDemo.openPlanet(id), target.planetId);
  await page.waitForTimeout(900);
  const alone = await page.evaluate(() => window.universeDemo.pixelStats());
  expect(alone.cool).toBeGreaterThan(200);

  // now its moon: the parent hangs behind, upper left, and must be the same textured sphere
  await page.evaluate(id => window.universeDemo.openMoon(id), target.moonId);
  await page.waitForTimeout(1200);
  const drawn = await page.evaluate(() => window.universeDemo.parentDrawn());
  expect(drawn).toBeTruthy();
  expect(drawn.id).toBe(target.planetId);
  expect(drawn.textured).toBe(true);           // the real texture.js canvas, not the procedural one

  // and it looks like it: the corner it is drawn in is not a flat brown ball
  const corner = await page.evaluate(() => window.universeDemo.pixelStats({ x: 0, y: 0, w: 0.5, h: 0.6 }));
  expect(corner.nonBlack).toBeGreaterThan(200);
  expect(corner.cool).toBeGreaterThan(120);
  expect(corner.cool).toBeGreaterThan(corner.brown);
  expect(corner.distinct).toBeGreaterThan(15);
  await page.screenshot({ path: 'test-results/universe-moon-parent.png' });

  // --- a tidally locked planet: hot in the middle of the map, frozen at both edges, no stripe
  const locked = await page.evaluate(() => {
    const d = window.universeDemo;
    for (const s of d.state.galaxy.stars) {
      const sys = d.openStar(s.id);
      const p = sys.planets.find(x => x.tidalLocked && !x.giant);
      if (!p) continue;
      d.openPlanet(p.id);
      const w = d.showMap();
      if (!w) continue;
      const cols = [];
      for (let x = 0; x < w.width; x++) {
        let t = 0, ice = 0;
        for (let y = 0; y < w.height; y++) {
          const i = y * w.width + x;
          t += w.temperature[i];
          if (w.biome[i] === 12 || w.biome[i] === 25) ice++;
        }
        cols.push([t / w.height, ice / w.height]);
      }
      return { name: p.name, K: p.temperature.K, cols, width: w.width };
    }
    return null;
  });
  expect(locked).not.toBeNull();
  const mid = locked.width >> 1;
  expect(locked.cols[mid][0] - locked.cols[0][0]).toBeGreaterThan(0.35);
  expect(locked.cols[0][1]).toBeGreaterThan(0.5);                 // frozen at the seam
  expect(locked.cols[locked.width - 1][1]).toBeGreaterThan(0.5);
  expect(locked.cols[mid][1]).toBeLessThan(0.12);                 // not on the burning face
  for (let x = 0; x < locked.width; x++) {
    const l = locked.cols[(x - 1 + locked.width) % locked.width][0];
    const r = locked.cols[(x + 1) % locked.width][0];
    expect(Math.abs(locked.cols[x][0] - (l + r) / 2)).toBeLessThan(0.03);
  }
  await page.screenshot({ path: 'test-results/universe-locked-map.png' });

  // the sphere for the same planet: no white stripe down one longitude
  await page.evaluate(() => window.universeDemo.showView('planet'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/universe-locked-planet.png' });

  expect(errors).toEqual([]);
});
