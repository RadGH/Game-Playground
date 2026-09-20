// Round 10 in the real page: the full-screen sheet, the perk tree you can click, and The Territory.
//
// The node tests cover the maths. These cover what only exists once there is a browser: a layout that
// has to fit a screen, a canvas that has to be clicked, and a world that has to be walked.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 11, cls = 'ranger', extra = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

const SCREENS = ['character', 'inventory', 'skills', 'perks', 'crafting', 'upgrade', 'journal'];

// ---------------------------------------------------------------- 4. the sheet is a full screen

test('every screen fills the viewport and nothing but a pane ever scrolls', async ({ page }) => {
  const errors = await land(page);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.farhold.hud.toggleSheet(true));
    for (const tab of SCREENS) {
      const out = await page.evaluate(t => {
        const f = window.farhold;
        f.hud.setTab(t);
        const sheet = document.getElementById('sheet');
        const body = document.querySelector('.tab-body:not(.hidden)');
        return {
          // the sheet covers the screen
          fills: Math.abs(sheet.clientWidth - window.innerWidth) < 2 && Math.abs(sheet.clientHeight - window.innerHeight) < 2,
          // and neither the page nor the sheet itself scrolls — only a `.pane-body` may
          pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1,
          title: document.getElementById('sheet-title').textContent,
          panes: body ? body.querySelectorAll('.pane').length : 0,
        };
      }, tab);
      expect(out.fills, `${tab} at ${size.width} does not fill the screen`).toBe(true);
      expect(out.pageScrollsSideways, `${tab} at ${size.width} scrolls sideways`).toBe(false);
      expect(out.sheetScrolls, `${tab} at ${size.width} scrolls the whole sheet`).toBe(false);
      expect(out.panes, `${tab} has no panes`).toBeGreaterThan(0);
    }
  }
  // …and the Perks screen is called Perks, which it was not (setTab had no `perks` key)
  const title = await page.evaluate(() => { window.farhold.hud.setTab('perks'); return document.getElementById('sheet-title').textContent; });
  expect(title).toBe('Perks');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 2 + 3. the perk tree

test('clicking a perk node selects THAT node, fitted and zoomed, at every size', async ({ page }) => {
  const errors = await land(page);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const out = await page.evaluate(() => {
      const hud = window.farhold.hud;
      hud.toggleSheet(true); hud.setTab('perks');
      const canvas = document.getElementById('perk-canvas');
      const check = () => {
        const rect = canvas.getBoundingClientRect(), proj = hud._perkView;
        let wrong = 0, tested = 0;
        for (const node of hud.rpg.forest.nodes) {
          const p = proj.to(node.x, node.y);
          const clientX = rect.left + p.x / proj.ratioX, clientY = rect.top + p.y / proj.ratioY;
          if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
          tested++;
          const hit = hud.perkUnder({ clientX, clientY });
          if (!hit || hit.id !== node.id) wrong++;
        }
        return { wrong, tested };
      };
      const fitted = check();
      hud.perkZoom = 2.4; hud.perkPan = { x: 1.5, y: -1.2 }; hud.drawForest();
      const zoomed = check();
      hud.perkZoom = 1; hud.perkPan = { x: 0, y: 0 }; hud.drawForest();
      return { fitted, zoomed, buffer: [canvas.width, canvas.height], box: [Math.round(canvas.getBoundingClientRect().width), Math.round(canvas.getBoundingClientRect().height)] };
    });
    // the ~100px offset was the buffer and the box disagreeing about how wide the canvas is
    expect(out.buffer[0] / out.box[0]).toBeCloseTo(out.buffer[1] / out.box[1], 1);
    expect(out.fitted.tested, `nothing was on screen at ${size.width}`).toBeGreaterThan(40);
    expect(out.fitted.wrong, `${out.fitted.wrong} nodes mis-hit at ${size.width}`).toBe(0);
    expect(out.zoomed.wrong, `${out.zoomed.wrong} nodes mis-hit zoomed at ${size.width}`).toBe(0);
  }
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 1 + 6. where you start, and how big it is

test('a new character starts on a level-1 world, at the size the title screen says', async ({ page }) => {
  for (const seed of [3, 11, 21]) {
    const errors = await land(page, { seed });
    const out = await page.evaluate(() => {
      const f = window.farhold;
      const here = f.zones.at(f.control.x, f.control.z);
      return {
        band: f.band?.key ?? null, planet: f.planet.name,
        homeMin: here?.minLevel, level: f.player.level,
        widthKm: Math.round(f.terrain.widthM / 1000),
        liveable: f.liveableInSystem(),
      };
    });
    expect(out.homeMin, `seed ${seed} started a level-1 character in a level ${out.homeMin} zone`).toBe(1);
    expect(out.liveable, `seed ${seed}'s system has nowhere liveable`).toBe(true);
    // the default is Small: 57 km, not the full 163
    expect(out.widthKm).toBeLessThan(70);
    expect(errors).toEqual([]);
  }
});

// ---------------------------------------------------------------- 5. flying

test('W flies the ship forward, not just up', async ({ page }) => {
  // `ship=1` — a fresh character has no ship since BUILDING_EXPANSION §9; this test is about the
  // controls, so it is given one rather than made to build it
  const errors = await land(page, { seed: 11, extra: '&ship=1' });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.launch();
    for (let i = 0; i < 400 && f.mode !== 'air'; i++) await new Promise(r => requestAnimationFrame(r));
    if (f.mode !== 'air') return { mode: f.mode };
    // point somewhere off-axis, which is where the old bug bit hardest, and hold W
    f.air.state.yaw = 0.7; f.air.state.pitch = 0;
    const start = { x: f.air.state.x, z: f.air.state.z };
    for (let i = 0; i < 900; i++) f.air.update(1 / 45, { forward: 1, look: [0, 0], keys: new Set() }, f.camera);
    const s = f.air.state;
    return {
      mode: f.mode,
      flat: Math.round(Math.hypot(s.x - start.x, s.z - start.z)),
      speed: Math.round(Math.hypot(s.velocity.x, s.velocity.z)),
    };
  });
  expect(out.mode).toBe('air');
  // it used to manage 80 m at 7 m/s, because the edge-of-the-map brake fired ~45 times a second
  expect(out.speed, 'the ship is barely moving horizontally').toBeGreaterThan(120);
  expect(out.flat, 'W did not carry it anywhere').toBeGreaterThan(3000);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 7. save and load

test('a run saved in a town loads back in the same town, on the same world', async ({ page }) => {
  const errors = await land(page, { seed: 11, extra: '&scale=0.35' });
  const saved = await page.evaluate(() => {
    const f = window.farhold;
    f.player.gold = 777;
    const id = f.saveNow ? f.saveNow() : null;
    const snap = f.saves.list()[0];
    return {
      id: snap?.id,
      x: Math.round(f.control.x), z: Math.round(f.control.z),
      biome: f.terrain.biomeAt(f.control.x, f.control.z).name,
      widthM: Math.round(f.terrain.widthM),
      planet: f.planet.name,
    };
  });
  // come back with the BOX SET WRONG — which is exactly what broke it, because the world knobs were
  // never written to the save and the loader fell back to reading the title screen
  await page.goto('/prototypes/farhold/?scale=1');
  await page.waitForSelector('#boot-continue:not([hidden])', { timeout: 60000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const loaded = await page.evaluate(() => {
    const f = window.farhold;
    return {
      x: Math.round(f.control.x), z: Math.round(f.control.z),
      biome: f.terrain.biomeAt(f.control.x, f.control.z).name,
      widthM: Math.round(f.terrain.widthM),
      planet: f.planet.name, gold: f.player.gold,
    };
  });
  expect(loaded.planet).toBe(saved.planet);
  expect(loaded.widthM, 'the world came back a different size').toBe(saved.widthM);
  expect(Math.abs(loaded.x - saved.x), 'you did not come back where you left').toBeLessThan(40);
  expect(Math.abs(loaded.z - saved.z)).toBeLessThan(40);
  expect(loaded.biome, `saved on ${saved.biome}, loaded on ${loaded.biome}`).toBe(saved.biome);
  expect(loaded.gold).toBe(777);
  expect(errors).toEqual([]);
});

test('what the world thinks of you survives a reload', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  await page.waitForTimeout(2000);
  const before = await page.evaluate(() => {
    const f = window.farhold;
    const here = f.hud.here || f.zones.at(f.control.x, f.control.z);
    const camp = f.holdings.sitesIn(here.id, { hostileOnly: true })[0];
    if (camp) for (let i = 0; i < 6; i++) f.creditKill(camp.x, camp.z);
    f.rumours.add('somebody put a marker on this run', { zone: here, from: 'the test' });
    f.saveNow();
    return {
      zoneId: here.id,
      standings: f.standings.all(),
      grip: f.holdings.of(here.id).grip,
      cleared: f.holdings.sitesIn(here.id).length,
      rumours: f.rumours.all().length,
      camp: !!camp,
    };
  });
  await page.goto('/prototypes/farhold/');
  await page.waitForSelector('#boot-continue:not([hidden])', { timeout: 60000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const after = await page.evaluate(id => {
    const f = window.farhold;
    return {
      standings: f.standings.all(),
      grip: f.holdings.of(id).grip,
      cleared: f.holdings.sitesIn(id).length,
      rumours: f.rumours.all().length,
    };
  }, before.zoneId);
  expect(after.standings, 'the world forgot what you did').toEqual(before.standings);
  expect(after.rumours, 'the rumours were not carried').toBeGreaterThanOrEqual(before.rumours);
  if (before.camp) {
    expect(Math.abs(after.grip - before.grip)).toBeLessThan(2e-3);
    expect(after.cleared, 'a camp you cleared came back on load').toBe(before.cleared);
  }
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- The Territory

test('a zone is held by somebody, offers work about itself, and changes when you knock it over', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  await page.waitForTimeout(2000);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const here = f.hud.here || f.zones.at(f.control.x, f.control.z);
    const record = f.holdings.of(here.id);
    const camp = f.holdings.sitesIn(here.id, { hostileOnly: true })[0];
    const before = { grip: record.grip, claim: record.claim, standing: { ...f.standings.all() } };
    if (camp) { f.teleport(camp.x, camp.z); await new Promise(r => setTimeout(r, 500)); for (let i = 0; i < 6; i++) f.creditKill(camp.x, camp.z); }
    return {
      holder: record.holder,
      board: f.board.map(j => ({ title: j.title, zoneId: j.zoneId, scope: j.scope, kind: j.kind, place: !!j.place })),
      camp: camp ? { name: camp.name, cleared: camp.cleared } : null,
      moved: Object.keys(f.standings.all()).filter(k => f.standings.all()[k] !== before.standing[k]).length,
      gripChanged: f.holdings.of(here.id).grip !== before.grip || f.holdings.of(here.id).claim !== before.claim,
      zoneId: here.id,
      patrols: f.patrols.inZone(here.id).length,
      factions: Object.keys(f.standings.all()).length,
    };
  });
  expect(out.holder, 'nobody holds the zone you are standing in').toBeTruthy();
  expect(out.factions).toBe(12);
  expect(out.board.length, 'the zone offered no work at all').toBeGreaterThan(0);
  /**
   * Every job is about THIS zone — that is the whole point, because travel is slow.
   *
   * A local job either pins somewhere in the zone, or it is a hunt or a gather, which has no pin
   * because the answer is "wherever you find them", and where you find them is here.
   */
  const PLACELESS = ['hunt', 'kill', 'gather'];
  for (const job of out.board) {
    expect(job.zoneId).toBe(out.zoneId);
    if (job.scope === 'local' && !PLACELESS.includes(job.kind)) {
      expect(job.place, `"${job.title}" is a ${job.kind} job with nowhere to go`).toBe(true);
    }
  }
  expect(out.patrols, 'nobody is walking the ground').toBeGreaterThan(0);
  if (out.camp) {
    expect(out.camp.cleared, `${out.camp.name} did not go down`).toBe(true);
    expect(out.gripChanged, 'clearing a camp changed nothing about who holds the zone').toBe(true);
    // a deed for one faction is felt by their rivals, so one camp moves several numbers
    expect(out.moved, 'clearing a camp moved nobody').toBeGreaterThan(1);
  }
  expect(errors).toEqual([]);
});

test('the journal shows who holds the ground, what is going here, and what people say', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  await page.waitForTimeout(1800);
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.hud.toggleSheet(true); f.hud.setTab('journal');
    return {
      standing: document.querySelectorAll('#journal-standing .standing-row').length,
      holderPinned: document.querySelector('#journal-standing .standing-row')?.classList.contains('holder'),
      board: document.querySelectorAll('#journal-board .job-row').length,
      rumours: document.querySelectorAll('#journal-rumours .rumour-row').length,
      zones: document.querySelectorAll('#sheet-zones .zone-row').length,
    };
  });
  expect(out.standing, 'the standing list is not twelve factions').toBe(12);
  expect(out.holderPinned, 'whoever holds this ground should be at the top').toBe(true);
  expect(out.board).toBeGreaterThan(0);
  expect(out.zones).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('a job off the board pays itself, because there is nobody to hand it back to', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  await page.waitForTimeout(2200);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const hunt = f.board.find(j => j.kind === 'hunt');
    if (!hunt) return { note: 'no hunt job on the board', kinds: f.board.map(j => j.kind) };
    const gold = f.player.gold, xp = f.player.xp;
    f.hud.onTakeJob(hunt);
    const q = f.questLog.active.find(x => x.id === hunt.id);
    // finish it through the real progress path, not by setting a flag
    for (let i = 0; i < q.count; i++) f.questLog.onKill({ defId: q.target });
    /**
     * WAIT FOR THE TICK, do not sleep and hope.
     *
     * `payBoardJobs` runs from `tickTerritory`, which the frame loop calls every 30 frames. Headless
     * WebGL runs at about 16 fps, so that is roughly every 1.9 seconds — and this used to sleep for
     * 1.5 of them, which is shorter than one interval. It passed on a fast run and failed on a busy
     * one, for no reason to do with the code under test. Poll for the thing we are actually waiting
     * for instead, with a ceiling well clear of several ticks.
     */
    const until = Date.now() + 12000;
    while (f.questLog.active.some(x => x.id === hunt.id) && Date.now() < until) {
      await new Promise(r => setTimeout(r, 100));
    }
    return {
      title: hunt.title,
      stillActive: f.questLog.active.some(x => x.id === hunt.id),
      gold: f.player.gold - gold, xp: f.player.xp - xp,
    };
  });
  expect(out.note, out.note ? `board held ${out.kinds}` : '').toBeUndefined();
  expect(out.stillActive, `"${out.title}" finished and nobody paid for it`).toBe(false);
  expect(out.gold).toBeGreaterThan(0);
  expect(out.xp).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
