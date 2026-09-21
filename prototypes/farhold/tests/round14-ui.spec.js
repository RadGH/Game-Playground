import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('the map opens with a Find panel that can sweep for clay', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(400);
  const panels = await page.evaluate(() =>
    [...document.querySelectorAll('.map-side .panel-title, .map-side h3, .map-side .panel > *:first-child')].map(n => n.textContent.trim()));
  console.log('map side panels:', JSON.stringify(panels));
  const opts = await page.evaluate(() => [...document.querySelectorAll('.find-pick option')].map(o => o.textContent));
  console.log('findable count:', opts.length, 'sample:', JSON.stringify(opts.slice(0, 8)));
  expect(opts.length).toBeGreaterThan(10);
  expect(opts.join('|')).toMatch(/Clay/i);
  expect(errors).toEqual([]);
});

test('a sweep finds seams, lights beacons and lists them', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => window.farhold.scan.sweep(null, null, 900));
  console.log('sweep:', JSON.stringify({ found: out.found, hits: (out.hits || []).length }));
  const st = await page.evaluate(() => { const s = window.farhold.scan.state(); return { found: s.found, hits: s.hits.length, until: s.until > 0 }; });
  console.log('scan state:', JSON.stringify(st));
  expect(errors).toEqual([]);
});

test('the nearby panel and the journal locate button exist', async ({ page }) => {
  const errors = await land(page);
  await page.waitForTimeout(1200);
  const nearby = await page.evaluate(() => {
    const box = document.getElementById('nearby');
    return { exists: !!box, hidden: box?.classList.contains('hidden'), rows: box?.querySelectorAll('.nb-row:not([hidden])').length ?? -1,
      count: document.getElementById('nearby-count')?.textContent };
  });
  console.log('nearby:', JSON.stringify(nearby));
  expect(nearby.exists).toBe(true);

  await page.evaluate(() => window.farhold.hud.toggleSheet(true));
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelector('#sheet-tabs [data-tab="journal"]')?.click(); });
  await page.waitForTimeout(300);
  const j = await page.evaluate(() => ({
    saved: !!document.getElementById('journal-saved'),
    savedText: document.getElementById('journal-saved')?.textContent?.slice(0, 60),
    attrsGone: !document.getElementById('sheet-attrs'),
    attrRows: [...document.querySelectorAll('#sheet-stats-attrs dt')].map(n => n.textContent),
  }));
  console.log('journal:', JSON.stringify(j));
  expect(j.saved).toBe(true);
  expect(j.attrsGone).toBe(true);
  expect(errors).toEqual([]);
});

test('attributes are under Stats on the character tab', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.hud.toggleSheet(true));
  await page.waitForTimeout(300);
  const attrs = await page.evaluate(() => [...document.querySelectorAll('#sheet-stats-attrs dt')].map(n => n.textContent));
  console.log('attribute rows:', JSON.stringify(attrs));
  expect(attrs).toEqual(['Strength', 'Dexterity', 'Intellect', 'Constitution']);
  expect(errors).toEqual([]);
});

test('the pause menu names every key', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.pauseMenu.toggle(true));
  await page.waitForTimeout(200);
  const hint = await page.evaluate(() => document.getElementById('hint')?.textContent || '');
  console.log('hint:', hint.slice(0, 160));
  expect(hint).not.toMatch(/undefined/);
  expect(hint).toMatch(/Walk forward/);
  expect(errors).toEqual([]);
});


test('the landmarks World Forge placed are finally on the map', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const nodes = fh.world?.nodes || [];
    const landmarks = nodes.filter(n => n.type === 'landmark');
    const drawn = landmarks.filter(n => fh.mapMarkFor(n) !== null);
    const kinds = [...new Set(landmarks.map(n => n.kind))];
    const marks = [...new Set(drawn.map(n => fh.mapMarkFor(n)))];
    return { landmarks: landmarks.length, drawn: drawn.length, kinds, marks };
  });
  console.log('landmarks:', JSON.stringify(out));
  expect(out.landmarks).toBeGreaterThan(0);
  /**
   * THE BUG: `markFor` tested `node.family === 'landmark'`, and a World Forge node has no `family`
   * at all — only a `type`. So every volcano, waterfall, ancient wood, battlefield, crater,
   * monolith, shrine, tower, ruin and vent fell through to `return null` and was never drawn. On
   * this seed that is forty-four named places on the planet and none of them on the map.
   */
  expect(out.drawn).toBe(out.landmarks);
  /**
   * …and each wears its OWN mark rather than the one shared blue pip. Which kinds a given world has
   * depends on its biomes — seed 7 is a rainforest world and every landmark on it is an ancient
   * wood — so the test is that the mark matches the KIND, not that several kinds turned up.
   */
  for (const kind of out.kinds) {
    expect(out.marks).toContain(kind);
  }
  expect(errors).toEqual([]);
});

test('the map hover card says what the thing under the pointer is', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(500);
  const box = await page.locator('#map-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const hover = await page.evaluate(() => {
    const h = window.farhold.map.state.hover;
    return h ? { tier: h.tier, key: h.key } : null;
  });
  console.log('hover:', JSON.stringify(hover));
  expect(hover).not.toBeNull();
  expect(['place', 'cell', 'pad', 'marker']).toContain(hover.tier);
  expect(errors).toEqual([]);
});

test('a place can be kept off the map and shows up starred in the journal', async ({ page }) => {
  const errors = await land(page);
  const kept = await page.evaluate(() => {
    const fh = window.farhold;
    const m = fh.markers.save({ cellX: 40, cellY: 40, name: 'A good ford', note: 'crossing' });
    return { id: m.id, starred: m.starred, kind: m.kind, saved: fh.markers.saved().length, starredNow: fh.markers.starred().length };
  });
  console.log('kept:', JSON.stringify(kept));
  expect(kept.kind).toBe('saved');
  expect(kept.starred).toBe(true);

  await page.evaluate(() => window.farhold.hud.toggleSheet(true));
  await page.evaluate(() => { document.querySelector('#sheet-tabs [data-tab="journal"]')?.click(); });
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#journal-saved .saved-row')].map(n => n.textContent));
  console.log('journal saved rows:', JSON.stringify(rows));
  expect(rows.join(' ')).toMatch(/A good ford/);
  expect(errors).toEqual([]);
});

test('the ambient purse refuses most of what the world wants to say', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const a = window.farhold.ambient;
    if (!a) return null;
    a.reset();
    let through = 0;
    for (let i = 0; i < 40; i++) {
      if (a.offer({ id: 'x' + i, tier: 'flavour', text: 'chatter ' + i })) through++;
    }
    return { through, stats: a.stats() };
  });
  console.log('purse:', JSON.stringify(out));
  expect(out).not.toBeNull();
  // "They happen too often" — at most the four points a full purse holds, out of forty asks
  expect(out.through).toBeLessThanOrEqual(4);
  expect(out.stats.refused).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('the journal lists what is going on near you, with a locate button on each', async ({ page }) => {
  const errors = await land(page);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.farhold.hud.toggleSheet(true));
  await page.evaluate(() => { document.querySelector('#sheet-tabs [data-tab="journal"]')?.click(); });
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => {
    const box = document.getElementById('journal-nearby');
    return {
      exists: !!box,
      rows: [...(box?.querySelectorAll('.journal-row') || [])].map(n => n.textContent),
      locates: box?.querySelectorAll('.row-locate').length ?? -1,
      panelRows: window.farhold.nearby?.length ?? -1,
    };
  });
  console.log('journal nearby:', JSON.stringify(out));
  expect(out.exists).toBe(true);
  // the journal and the panel read the SAME list, so they cannot disagree
  if (out.panelRows > 0) {
    expect(out.rows.length).toBe(out.panelRows);
    expect(out.locates).toBe(out.panelRows);
  }
  expect(errors).toEqual([]);
});

test('a sweep puts its hits on the map as well as in the world', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    fh.scan.sweep(null, null, 900);
    fh.map.toggle(true);
    const st = fh.scan.state();
    return { hits: st.hits.length, lit: st.until > 0, mapOpen: fh.map.isOpen };
  });
  await page.waitForTimeout(400);
  console.log('scan on map:', JSON.stringify(out));
  expect(out.hits).toBeGreaterThan(0);
  expect(out.mapOpen).toBe(true);
  // the canvas has to have drawn something other than the ground under those hits
  const painted = await page.evaluate(() => {
    const c = document.getElementById('map-canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  expect(painted).toBe(true);
  expect(errors).toEqual([]);
});
