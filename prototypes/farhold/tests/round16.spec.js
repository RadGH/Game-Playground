// Round 16 — the play-test list, in a browser.
//
// The pure half is tests/round16.test.js. This is everything that only means anything once the
// world is actually built: the mouse wheel, the gather bar over a real rock, the scanner's memory,
// the doors the instanced places opened, the landmark join, the Town Hall, and the Command Rod.

import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8401/prototypes/farhold/';

/** Land, and collect anything the console complains about while we do it. */
async function land(page, query = '?auto=1&seed=4477&scale=0.35') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL + query);
  await page.waitForFunction(() => window.farhold?.player, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  return errors;
}

test('R16.8 — the wheel turns through what you own, and only what you own', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const start = { modes: f.tools.modes.slice(), held: f.tools.held, tool: f.tools.tool?.name };
    // a fresh character has a tool and no devices: two entries
    const cycled = [f.tools.cycle(1), f.tools.cycle(1)];
    // …then build the two devices out of thin air and the ring grows
    f.player.devices = { scanner: true, command_rod: true };
    const grown = f.tools.modes.slice();
    const walked = [];
    for (let i = 0; i < 4; i++) walked.push(f.tools.cycle(1));
    return { start, cycled, grown, walked };
  });
  console.log('WHEEL ' + JSON.stringify(out));
  expect(out.start.tool, 'a new character cannot mine anything at all').toBeTruthy();
  expect(out.start.modes).toEqual(['weapon', 'tool']);
  expect(out.cycled).toEqual(['tool', 'weapon']);
  expect(out.grown).toEqual(['weapon', 'tool', 'scanner', 'rod']);
  expect(out.walked).toEqual(['tool', 'scanner', 'rod', 'weapon']);
  expect(errors).toEqual([]);
});

test('R16.8 — a bow-carrying character can work a seam, which is the whole complaint', async ({ page }) => {
  // R25 — the default grass reaches 150 m now, and at full quality under the software renderer
  // these specs run on, landing alone can take most of a minute
  test.setTimeout(180000);
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // put a bow in their hands: under the old rule that made them bare-handed
    const bow = f.rpg.loot.generate('bow', 'normal', 'low', { rng: f.rpg.rng, level: 1 });
    if (bow) f.rpg.equip(f.player, bow, { force: true });
    f.rpg.refresh(f.player);
    const node = f.ore.around(f.control.x, f.control.z)
      .filter(n => n.handMinable && !n.depleted)
      .sort((a, b) => Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    if (!node) return { none: true };
    f.control.teleport(node.x, node.z);
    await new Promise(r => setTimeout(r, 400));
    const before = f.materials()[node.resource] || 0;
    f.tools.beginGather(node.x, node.z);
    const bars = [];
    for (let i = 0; i < 70; i++) {
      await new Promise(r => setTimeout(r, 100));
      const b = f.tools.gathering.bar();
      if (b) bars.push(b.fraction);
      else if (bars.length) break;
    }
    return {
      weapon: f.player.equipment.weapon?.name, tool: f.player.equipment.tool?.name,
      resource: node.resource, before, after: f.materials()[node.resource] || 0,
      barSteps: bars.length, rose: bars.length > 1 && bars[bars.length - 1] > bars[0],
    };
  });
  console.log('GATHER ' + JSON.stringify(out));
  if (out.none) { console.log('no hand-workable seam in range; skipping'); return; }
  expect(out.tool, 'there is no tool in the tool slot').toBeTruthy();
  expect(out.barSteps, 'no progress bar went up over the rock').toBeGreaterThan(3);
  expect(out.rose, 'the bar never filled').toBe(true);
  expect(out.after, `a character holding a ${out.weapon} still cannot work a ${out.resource} seam`)
    .toBeGreaterThan(out.before);
  expect(errors).toEqual([]);
});

test('R16.8 — the scanner finds what is under the ground and keeps it', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.devices = { ...(f.player.devices || {}), scanner: true };
    const before = f.markers.here().filter(m => m.kind === 'seam').length;
    f.scanner.setOn(true);
    await new Promise(r => setTimeout(r, 2500));
    const found = f.scanner.size;
    const marks = f.markers.here().filter(m => m.kind === 'seam');
    const named = marks.filter(m => m.name && m.name.length > 2).length;
    /**
     * "…and show the name of the resource on the floating indicator." The minimap only ever drew a
     * glyph; while the scanner is up it draws the material's name under it too. Read the pixels,
     * because a label that is computed and not painted is the whole class of bug this round is about.
     */
    const mini = document.getElementById('minimap');
    /**
     * R18 — COUNT THE LABEL'S OWN COLOUR, NOT "ANYTHING PALE".
     *
     * This counted every near-white pixel (r>200, g>195, b>185), and that made it flaky about one
     * run in three: with the scanner UP the minimap draws only deposits (js/main.js calls it a
     * prospecting minimap), and with it down it draws the ordinary marker set instead. The two
     * branches paint DIFFERENT things, so "pale pixels with names" versus "pale pixels without" was
     * never comparing like with like — it only worked while the labels happened to out-ink whatever
     * the normal markers drew, and on seed 4477 the two land within a hundred pixels of each other.
     *
     * I mis-diagnosed this once by A/B-ing a single run each way and blaming a main.js change; three
     * runs at the same commit gave pass, pass, fail. The label is drawn in exactly `#e8dfd2`, so
     * that is what to count — a tight window on one colour, which no other marker uses.
     */
    const ink = () => {
      const px = mini.getContext('2d').getImageData(0, 0, mini.width, mini.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (Math.abs(px[i] - 232) <= 5 && Math.abs(px[i + 1] - 223) <= 5 && Math.abs(px[i + 2] - 210) <= 5) n++;
      }
      return n;
    };
    const withNames = ink();
    f.scanner.setOn(false);
    /**
     * R18 — WAIT FOR THE CANVAS, NOT FOR A NUMBER OF MILLISECONDS.
     *
     * The minimap is redrawn every sixth frame, so 700 ms is about seven redraws on an idle machine
     * and can be none at all when the world is streaming chunks — and then the reading is simply
     * the stale canvas, with the labels still on it. One run in four.
     *
     * This is the third fixed sleep in this suite to lose that bet (base-roundtrip's grid waits and
     * round16's own Town Hall spiral were the others), so: poll for the thing being asserted, with a
     * ceiling long enough that a genuinely stuck label still fails.
     */
    let withoutNames = ink();
    for (let i = 0; i < 60 && withoutNames > 0; i++) {
      await new Promise(r => setTimeout(r, 100));
      withoutNames = ink();
    }
    return { before, found, marks: marks.length, named, on: f.scanner.on, withNames, withoutNames };
  });
  console.log('SCAN ' + JSON.stringify(out));
  expect(out.found, 'a sweep with the scanner on found nothing at all').toBeGreaterThan(0);
  expect(out.marks, 'nothing the scanner found reached the map').toBeGreaterThan(out.before);
  expect(out.named, 'the deposits on the map do not say what they are').toBeGreaterThan(0);
  expect(out.on).toBe(false);
  /**
   * The label's own colour appears while the scanner is up and is gone when it is down. Stated as
   * two facts rather than as one comparison, because a comparison between two different marker
   * sets is what made this flaky — see the note on `ink` above.
   */
  expect(out.withNames, 'no label ink at all while the scanner is up, so the names are not painted')
    .toBeGreaterThan(0);
  expect(out.withoutNames, 'the deposit names are still painted after the scanner goes down')
    .toBe(0);
  expect(errors).toEqual([]);
});

test('R16.10 — the instanced places are real doors you can walk into', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const mouths = f.instances.mouths;
    if (!mouths.length) return { none: true };
    // stand at one and open it
    const m = mouths.sort((a, b) =>
      Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    f.control.teleport(m.x, m.z);
    await new Promise(r => setTimeout(r, 600));
    const target = f.interactTarget?.();
    return {
      mouths: mouths.length,
      allHaveInstances: mouths.every(x => !!x.instance),
      idsUnique: new Set(mouths.map(x => x.id)).size === mouths.length,
      names: [...new Set(mouths.map(x => x.name))].slice(0, 5),
      at: target ? target.kind : null,
      opensTo: target?.gate?.instance?.id || null,
      look: target?.gate?.instance?.interior?.look || null,
    };
  });
  console.log('INSTANCES ' + JSON.stringify(out));
  if (out.none) { console.log('no instance mouths on this seed; skipping'); return; }
  expect(out.mouths, 'this planet has no instanced places on it').toBeGreaterThan(3);
  expect(out.allHaveInstances, 'a mouth carries no instance, so it would open a plain dungeon').toBe(true);
  expect(out.idsUnique, 'two mouths share an id, so clearing one clears the other').toBe(true);
  expect(out.at, 'standing at a mouth, E does not offer to go in').toBe('dungeon');
  expect(out.opensTo, 'the door leads to no particular place').toBeTruthy();
  expect(errors).toEqual([]);
});

test('R16.1 — a set piece pays its reward once, and then stops advertising itself', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const sites = f.sites.sites.filter(s => s.family === 'landmark');
    if (!sites.length) return { none: true };
    /**
     * The bug this is for: a landmark built by js/sites.js has a NUMERIC id and the ledger rows in
     * js/territory.js have STRING ones, so `takeLandmark` never matched and a set piece you could
     * see, walk to and press E at said "you have already had what there is to have here" on the
     * very first press — for the life of the save. So the thing to prove is not an xp number (two
     * landmarks can easily stand within one interact radius of each other); it is that THIS site
     * now has a ledger row of its own, that the row is marked spent, and that a place with nothing
     * left to give stops being a destination.
     */
    const s = sites.sort((a, b) =>
      Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    f.control.teleport(s.x, s.z);
    await new Promise(r => setTimeout(r, 900));
    const target = f.interactTarget?.();
    const zone = f.hud.here;
    const rowsBefore = zone ? f.holdings.landmarksIn(zone.id).length : 0;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise(r => setTimeout(r, 800));

    const rows = zone ? f.holdings.landmarksIn(zone.id) : [];
    const mine = rows.find(l => l.siteKey === String(s.key)) || null;
    const spent = rows.filter(l => l.taken);
    const drawnOnMap = rows.filter(l => !(l.taken && !f.holdings.standingOffer(l))).length;
    return {
      type: s.type, at: target ? target.kind : null,
      rowsBefore, rowsAfter: rows.length,
      adopted: !!mine,
      taken: mine ? !!mine.taken : null,
      state: mine ? mine.state : null,
      standing: mine ? f.holdings.standingOffer(mine) : null,
      spent: spent.length,
      drawnOnMap,
      siteTaken: f.landmarkAudit().find(a => a.key === String(s.key))?.taken ?? null,
    };
  });
  console.log('LANDMARK ' + JSON.stringify(out));
  if (out.none) { console.log('no landmark set pieces in range; skipping'); return; }
  expect(out.at, 'standing in front of a set piece, E does not see a landmark').toBe('landmark');
  expect(out.adopted, 'the set piece still has no ledger row, so it can never pay').toBe(true);
  expect(out.taken, 'the set piece took its one-off and the ledger did not notice').toBe(true);
  // a place with nothing standing on offer is finished, and stops being drawn
  if (out.standing === false) {
    expect(out.state, 'a spent landmark with nothing left to offer is not marked done').toBe('done');
    expect(out.drawnOnMap, 'a used-up landmark is still a dot on the map')
      .toBeLessThan(out.rowsAfter);
    expect(out.siteTaken, 'the set piece kept its map pin after being used up').toBe(true);
  }
  expect(errors).toEqual([]);
});

test('R16.15 — the Town Hall opens, and the rod points at your own people', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // the population reading exists before any of it is built
    const pop = f.holdingPop;
    // the hall: find a settlement big enough to have one and stand at its door
    const towns = (f.features?.settlements || []).filter(s => (s.size || 1) >= 3);
    let hall = null;
    if (towns.length) {
      const t = towns.sort((a, b) =>
        Math.hypot(a.wx - f.control.x, a.wz - f.control.z) - Math.hypot(b.wx - f.control.x, b.wz - f.control.z))[0];
      /**
       * R18 — A FRAME, NOT FORTY MILLISECONDS.
       *
       * `interactTarget()` is recomputed by the frame loop, so after a teleport the test has to let
       * a frame run before asking. It waited a flat 40 ms, which is about two and a half frames on
       * an idle machine and NONE at the end of a 22-minute suite — so the spiral walked every
       * position without the target ever being recomputed, found no door, and the test failed with
       * "no town of size 3 or more has a door you can press E at". The town was there the whole
       * time; this spec passes on its own.
       *
       * Two `requestAnimationFrame`s guarantee the loop has been round once and the target is for
       * where the player now stands. It is faster than 40 ms when the machine is idle and it
       * stretches by itself when it is not, which is the property a fixed sleep can never have.
       */
      const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      for (let r = 0; r <= 24 && !hall; r += 3) {
        for (let k = 0; k < 12 && !hall; k++) {
          const a = (k / 12) * Math.PI * 2;
          f.control.teleport(t.wx + Math.cos(a) * r, t.wz + Math.sin(a) * r);
          await frame();
          const it = f.interactTarget?.();
          if (it?.kind === 'hall') hall = { town: t.name, size: t.size };
        }
      }
    }
    if (hall) {
      f.townHall.open({ ...towns[0] });
      // …and wait for the screen itself rather than guessing at 200 ms
      for (let i = 0; i < 60; i++) {
        const el = document.getElementById('town-hall');
        if (el && !el.hidden) break;
        await new Promise(res => setTimeout(res, 50));
      }
    }
    const screen = document.getElementById('town-hall');
    const open = !!screen && !screen.hidden;
    const tabs = screen ? [...screen.querySelectorAll('.hall-rail button')].map(b => b.textContent) : [];
    const text = screen ? screen.textContent : '';
    f.townHall.close();
    return {
      pop: { started: pop.started, cap: pop.cap, line: pop.line },
      towns: towns.length, hall, open, tabs,
      saysPopulation: /Population/.test(text),
      rod: f.rod ? f.rod.status() : null,
      rodPicksNobody: f.rod ? f.rod.use({ x: f.control.x, z: f.control.z }) : null,
    };
  });
  console.log('HALL ' + JSON.stringify(out));
  expect(out.pop.started, 'a character with no base already has a population').toBe(false);
  expect(out.pop.line).toBe('no houses yet');
  if (!out.towns) { console.log('no settlement of size 3+ on this seed; skipping the hall half'); }
  else {
    expect(out.hall, 'no town of size 3 or more has a door you can press E at').toBeTruthy();
    expect(out.open, 'the Town Hall screen did not open').toBe(true);
    expect(out.tabs, 'the hall has no tabs').toContain('The town');
    expect(out.saysPopulation, 'the hall never mentions population').toBe(true);
  }
  expect(out.rod, 'there is no Command Rod at all').toBeTruthy();
  expect(out.rod).toMatch(/nobody yet/i);
  expect(out.rodPicksNobody.ok, 'the rod ordered somebody who does not work for you').toBe(false);
  expect(errors).toEqual([]);
});

test('R16.7 — the target bar names what the crosshair is on', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // put two bodies out: one straight ahead and far, one close and off to the side. The old
    // heuristic scored `yawDelta * 14 + distance * 0.3` from the player's feet, so the close one
    // off to the side beat the one you are looking at.
    const def = (f.field.defsFor(f.control.x, f.control.z, 2) || [])[0];
    if (!def) return { none: true };
    // look LEVEL, or the reticle is on the grass twenty metres out and the hitscan finds nothing —
    // which is the honest answer in that case, and not what this test is about
    f.control.pitch = 0;
    const yaw = f.control.yaw;
    const ahead = { x: f.control.x + Math.sin(yaw) * 18, z: f.control.z + Math.cos(yaw) * 18 };
    const side = { x: f.control.x + Math.sin(yaw + 1.0) * 5, z: f.control.z + Math.cos(yaw + 1.0) * 5 };
    const far = await f.field.addRanked(def, 2, ahead.x, ahead.z, 'champion');
    const near = await f.field.addRanked(def, 2, side.x, side.z, 'normal');
    if (!far || !near) return { none: true };
    await new Promise(r => setTimeout(r, 900));
    const name = document.getElementById('target-name')?.textContent || '';
    const shown = document.getElementById('target');
    return {
      name,
      visible: shown ? !shown.classList.contains('hidden') : false,
      farName: far.name, nearName: near.name,
      farRank: far.rank, nearRank: near.rank,
    };
  });
  console.log('TARGET ' + JSON.stringify(out));
  if (out.none) { console.log('could not place two bodies; skipping'); return; }
  expect(out.visible, 'the target bar never came up').toBe(true);
  /**
   * The champion 18 m dead ahead is what the crosshair is on; the plain one 5 m to the side is not.
   * The old heuristic scored `yawDelta * 14 + distance * 0.3` from the player's FEET, so 1.0 rad
   * off-axis at 5 m (14.0) beat dead-on at 18 m (5.4) every single time.
   */
  expect(out.name, `the bar shows "${out.name}" and the crosshair is on ${out.farName}`)
    .toContain(out.farName);
  expect(errors).toEqual([]);
});

test('R16.10 — the four places nobody stumbles on are ones you can be sent to', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const kinds = f.instances.kinds;
    const questOnly = kinds.filter(k => k.discovery === 'quest');
    const scattered = new Set(f.instances.mouths.map(m => m.instance.id));
    /**
     * `discovery: "quest"` means js/sites.js deliberately never scatters it — so without something
     * that SENDS you, those entries are dead data, which is the fault this whole round keeps
     * finding. `revealInstance` is the sending; the Town Hall's "Word of …" row is the door to it.
     */
    const before = f.instances.mouths.length;
    const target = questOnly[0];
    const made = target ? f.instances.reveal(target.id) : null;
    await new Promise(r => setTimeout(r, 400));
    const after = f.instances.mouths;
    const opened = after.find(m => m.instance.id === target?.id) || null;
    return {
      questOnly: questOnly.map(k => k.id),
      noneScattered: questOnly.every(k => !scattered.has(k.id)),
      before, after: after.length,
      revealed: !!made, opened: !!opened,
      marked: f.markers.here().some(m => m.name === made?.name),
      leadsExist: Array.isArray(f.instances.leads),
    };
  });
  console.log('LEADS ' + JSON.stringify(out));
  expect(out.questOnly.length, 'no place is quest-only, so being sent somewhere means nothing').toBeGreaterThan(0);
  expect(out.noneScattered, 'a quest-only place was scattered on the map anyway').toBe(true);
  expect(out.revealed, 'nothing can put a quest-only place on the ground').toBe(true);
  expect(out.after, 'revealing one did not add a mouth').toBeGreaterThan(out.before);
  expect(out.opened, 'the revealed place has no door you can press E at').toBe(true);
  expect(out.marked, 'you were sent somewhere and it is not on your chart').toBe(true);
  expect(errors).toEqual([]);
});
