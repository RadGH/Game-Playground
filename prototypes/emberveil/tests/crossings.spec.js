// Stage framing + speech bubbles + the party's vehicle + crossing nodes, in the real page.
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/prototypes/emberveil/');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0 && !window.emberveil.busy, null, { timeout: 90000 });
  await page.click('#btn-menu'); await page.check('#mute'); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.emberveil.rewardPopups = false; });   // the reward chest waits for a click; these tests drive the flow themselves
  return errors;
}

test('stage framing: four heroes and four enemies fit, with headroom, and no bubble is ever clipped', async ({ page }) => {
  test.setTimeout(180000); const errors = await boot(page);
  // a full 4 v 4
  await page.evaluate(async () => {
    const E = window.emberveil, g = E.game;
    const a = g.encounter('goblin_patrol'), b = g.encounter('prologue_pair');
    const foes = [...a.enemies, ...b.enemies].slice(0, 4).map((e, i) => ({ ...e, id: 'e' + i }));
    await E.stage.setSide(g.fighters().map(E.bodyOf), 'left');
    await E.stage.setSide(foes.map(E.enemyLook), 'right');
  });
  const framing = await page.evaluate(() => {
    const st = window.emberveil.stage; const box = document.getElementById('bubbles').getBoundingClientRect();
    const out = { width: st.worldFrame.width, height: st.worldFrame.height, inside: 0, total: 0, minHeadroom: 1 };
    for (const [id] of st.chars) {
      out.total++;
      const g = st.chars.get(id).group; const v = g.position.clone().project(st.scene.camera);
      const px = (v.x + 1) / 2 * box.width;
      if (px > 4 && px < box.width - 4) out.inside++;                       // every body is on screen
      const head = st.headOf(id).project(st.scene.camera);
      out.minHeadroom = Math.min(out.minHeadroom, (1 - head.y) / 2);        // 0 = top of frame, 1 = bottom
    }
    return out;
  });
  expect(framing.total).toBe(8);
  expect(framing.inside).toBe(8);                       // nobody is pushed off the side of the stage
  expect(framing.width).toBeGreaterThan(7);             // the camera shows enough world for the line-up
  expect(framing.minHeadroom).toBeGreaterThan(0.2);     // ~a quarter of the frame is empty above the tallest head

  // a bubble on every head, all of them fully inside the stage box
  const bubbles = await page.evaluate(() => {
    const E = window.emberveil, B = document.getElementById('bubbles'); B.replaceChildren();
    const text = 'A long line of speech, long enough to be a wide bubble that would once have hung off the edge.';
    for (const id of E.stage.chars.keys()) { const d = document.createElement('div'); d.className = 'bubble'; d.innerHTML = '<b>Someone</b>'; d.append(document.createTextNode(text)); B.append(d); E.placeBubble(d, id); }
    const box = B.getBoundingClientRect();
    return [...B.children].map(b => { const r = b.getBoundingClientRect(); return { top: r.top - box.top, left: r.left - box.left, right: box.right - r.right, bottom: box.bottom - r.bottom, below: b.classList.contains('below') }; });
  });
  expect(bubbles.length).toBe(8);
  for (const b of bubbles) { expect(b.top).toBeGreaterThanOrEqual(0); expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeGreaterThanOrEqual(0); expect(b.bottom).toBeGreaterThanOrEqual(0); }

  // a body whose head is above the top of the frame flips its bubble underneath instead of clipping
  const flipped = await page.evaluate(() => {
    const E = window.emberveil, B = document.getElementById('bubbles'); B.replaceChildren();
    const id = [...E.stage.chars.keys()][0]; const c = E.stage.chars.get(id);
    c.group.userData.fxHeight = 20;                                        // pretend it is enormous
    const d = document.createElement('div'); d.className = 'bubble'; d.innerHTML = '<b>Tall</b>'; d.append(document.createTextNode('Up here.'));
    B.append(d); E.placeBubble(d, id);
    const box = B.getBoundingClientRect(), r = d.getBoundingClientRect();
    c.group.userData.fxHeight = 1.5;
    return { below: d.classList.contains('below'), top: r.top - box.top, bottom: box.bottom - r.bottom };
  });
  expect(flipped.below).toBe(true); expect(flipped.top).toBeGreaterThanOrEqual(0); expect(flipped.bottom).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the party vehicle stands at camp and parks on the road', async ({ page }) => {
  test.setTimeout(180000); const errors = await boot(page);
  const parked = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game; g.vehicle = 'wagon';
    const v = await E.stage.parkVehicle(g.vehicle);
    return { type: v?.spec?.type, animals: v?.metrics().animals, x: v?.group.position.x };
  });
  expect(parked.type).toBe('wagon'); expect(parked.animals).toBe(1); expect(parked.x).toBeLessThan(0);

  const camped = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game; g.vehicle = 'war_wagon'; E.stage.vehicleId = g.vehicle;
    E.stage.setNight(true);
    await E.stage.camp(g.party.filter(h => h.alive).map(E.bodyOf), { vehicle: g.vehicle });
    const v = E.stage.vehicle; const st = E.stage;
    return { type: v?.spec?.type, animals: v?.metrics().animals, fire: !!st.fireGroup, mode: st.frameMode, width: st.worldFrame.width, bodies: st.chars.size };
  });
  expect(camped.type).toBe('war_wagon'); expect(camped.animals).toBe(2);
  expect(camped.fire).toBe(true); expect(camped.mode).toBe('camp'); expect(camped.bodies).toBe(4);

  // camping twice does not leave two fires burning, and going on foot takes the vehicle away
  const again = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game; g.vehicle = 'none'; E.stage.vehicleId = 'none';
    await E.stage.camp(g.party.filter(h => h.alive).map(E.bodyOf), { vehicle: 'none' });
    const fires = E.stage.scene.scene.children.filter(o => o.type === 'Group' && o.children.some(c => c.isPointLight)).length;
    return { fires, vehicle: !!E.stage.vehicle };
  });
  expect(again.fires).toBe(1); expect(again.vehicle).toBe(false);
  await page.evaluate(() => { window.emberveil.stage.clearCamp(); window.emberveil.stage.setNight(false); });
  expect(errors).toEqual([]);
});

test('a crossing node: the party crosses the stage, picks a way past, and the road opens', async ({ page }) => {
  test.setTimeout(240000); const errors = await boot(page);
  const name = await page.evaluate(() => {
    const g = window.emberveil.game; g.vehicle = 'wagon'; window.emberveil.stage.vehicleId = 'wagon';
    g.supplies.rope = 1; g.zoneId = 'prologue';
    const node = g.zone('prologue').nodes.find(n => n.type === 'crossing');
    g.nodeId = node.id; (g.visited.prologue ||= []).push(node.id);
    return node.name;
  });
  expect(name.length).toBeGreaterThan(3);

  const entering = page.evaluate(() => window.emberveil.enterNode());
  // while the travel scene plays, the camera is in travel framing and the vehicle is rolling
  await page.waitForFunction(() => window.emberveil.stage.frameMode === 'travel', null, { timeout: 30000 });
  const mid = await page.evaluate(() => { const st = window.emberveil.stage; return { width: st.worldFrame.width, veh: st.vehicle?.anim, walking: [...st.chars.values()].filter(c => c.ctrl.anim === 'walk').length }; });
  expect(mid.width).toBeGreaterThan(8);
  expect(mid.veh).toBe('roll');
  expect(mid.walking).toBeGreaterThanOrEqual(4);

  await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 60000 });
  await entering.catch(() => {});
  const log = await page.locator('#narrative').innerText();
  expect(log).toContain(name);
  const buttons = await page.locator('#actions button').allInnerTexts();
  expect(buttons.length).toBeGreaterThanOrEqual(3);
  expect(buttons.some(b => /vs \d+/.test(b))).toBe(true);        // at least one roll, with its difficulty shown
  expect(buttons.some(b => /Turn back/.test(b))).toBe(true);

  // take the sure way (the rope) and land on the far side
  const before = await page.evaluate(() => ({ gold: window.emberveil.game.gold, rope: window.emberveil.game.supplies.rope }));
  await page.click('#actions button >> nth=0');
  await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 90000 });
  const after = await page.evaluate(() => {
    const g = window.emberveil.game; const n = g.node();
    return { gold: g.gold, rope: g.supplies.rope, crossings: g.crossings.length, cleared: g.isCleared(n.id), kind: g.enter(n).kind, mode: window.emberveil.stage.frameMode };
  });
  expect(after.rope).toBe(before.rope - 1);          // the rope was used
  expect(after.crossings).toBeGreaterThanOrEqual(1); // written down
  expect(after.cleared).toBe(true);                  // the road is open from now on
  expect(after.kind).toBe('quiet');
  expect(after.mode).toBe('fight');                  // the camera came back
  expect(await page.locator('#narrative').innerText()).toMatch(/is behind you|crossed/i);
  expect(errors).toEqual([]);
});

test('a guarded gate walks a warden on, and turning back leaves the crossing on the map', async ({ page }) => {
  test.setTimeout(240000); const errors = await boot(page);
  await page.evaluate(() => {
    const g = window.emberveil.game; g.zoneId = 'hell_breach'; g.unlockedZones.push('hell_breach'); g.act = 3; g.gold = 0; g.fame = 0;
    const node = g.zone('hell_breach').nodes.find(n => n.type === 'crossing');
    g.nodeId = node.id; (g.visited.hell_breach ||= []).push(node.id);
  });
  const entering = page.evaluate(() => window.emberveil.enterNode());
  await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 120000 });
  await entering.catch(() => {});
  const gate = await page.evaluate(() => {
    const st = window.emberveil.stage;
    const guard = [...st.chars.values()].find(c => c.ch.id.startsWith('npc_'));
    return { guard: !!guard, x: guard?.group.position.x, buttons: [...document.querySelectorAll('#actions button')].map(b => b.textContent) };
  });
  expect(gate.guard).toBe(true);
  expect(gate.x).toBeGreaterThan(0.5);              // the warden walked in from the right and stopped mid-stage
  expect(gate.buttons.some(b => /warrant/i.test(b))).toBe(true);
  expect(await page.locator('#narrative').innerText()).toMatch(/Road's closed|state your business/i);

  await page.click('#actions button:has-text("Turn back")');
  await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 30000 });
  const left = await page.evaluate(() => { const g = window.emberveil.game; return { cleared: g.isCleared(g.node().id), kind: g.enter(g.node()).kind }; });
  expect(left.cleared).toBe(false);
  expect(left.kind).toBe('crossing');               // still there to try again
  expect(errors).toEqual([]);
});
