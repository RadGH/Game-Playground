// Farhold round 27, M3 — walls by culture, fences by size, and a banner at the gate, in the game.
//
// The node test (round27-walls.test.js) measures the geometry on real worlds. This drives the
// player's own controller: land at a walled town of two cultures (seed 47, Super tiny — Fenkeep is
// a halfling town behind a hedge, Cindercrown a human one behind stone), screenshot the gate, read
// the draw calls, and walk in through the gate until the arrival card comes up.

import { test, expect } from '@playwright/test';

const SHOTS = 'prototypes/farhold/research/round27-walls/';

async function land(page, seed = 47) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&seed=${seed}&scale=0.1&sound=off`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand `out` metres outside a town's first road gate, on its axis, facing in. */
async function atGate(page, name, out) {
  return page.evaluate(async ({ name, out }) => {
    const f = window.farhold;
    const t = f.features.settlements.find(s => s.name === name);
    f.features.update(t.wx, t.wz, true);
    const gates = f.features.gatesOf(t.id);
    const g = gates.find(x => x.gatehouse && x.source === 'road') || gates.find(x => x.gatehouse) || gates[0];
    const x = g.x + g.ox * out, z = g.z + g.oz * out;
    f.teleport(x, z);
    f.control.yaw = Math.atan2(-g.ox, -g.oz);
    f.control.pitch = -0.12;
    f.features.update(x, z, true);
    await new Promise(r => setTimeout(r, 1500));
    const ring = f.features.wallOf(t.id);
    return { id: t.id, kind: ring.kind, keys: ring.keys, r: ring.r, cx: t.wx, cz: t.wz, gx: g.x, gz: g.z, banner: g.banner };
  }, { name, out });
}

test('two walled towns of two cultures: their own wall, a banner at the gate, and an arrival card walking in', async ({ page }) => {
  test.setTimeout(420000);
  const errors = await land(page);
  const seen = [];
  for (const [name, kind] of [['Fenkeep', 'hedge'], ['Cindercrown', 'stone']]) {
    const at = await atGate(page, name, 24);
    expect(at.kind, `${name} is built in its culture's wall`).toBe(kind);
    expect(at.banner, `${name}'s gate has a banner`).toBeTruthy();
    await page.screenshot({ path: SHOTS + `${name}-${kind}-gate.png` });
    // draw calls, at the gate of a town whose wall is one of the new kinds
    const calls = await page.evaluate(async () => {
      const out = [];
      for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 250)); out.push(window.farhold.stats().drawCalls); }
      return Math.max(...out);
    });
    // back out past the re-arm distance, then walk in through the gate
    await atGate(page, name, 60);
    await page.evaluate(() => { window.farhold.hud.lastArrival = null; });
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    let card = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      card = await page.evaluate(({ cx, cz }) => {
        const f = window.farhold, a = f.hud.lastArrival;
        return a ? { ...a, dist: Math.hypot(f.control.x - cx, f.control.z - cz) } : null;
      }, at);
      if (card) break;
      await page.waitForTimeout(150);
    }
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    expect(card, `no arrival card walking into ${name}`).toBeTruthy();
    expect(card.name).toBe(name);
    // it fired at the wall (the player moves ~1 m a sampled frame at a run in headless low quality)
    expect(Math.abs(card.dist - at.r)).toBeLessThan(6);
    const banner = await page.evaluate(() => {
      const b = document.getElementById('zone-banner');
      return { hidden: b.classList.contains('hidden'), text: b.textContent.replace(/\s+/g, ' ').trim() };
    });
    expect(banner.hidden).toBe(false);
    expect(banner.text).toContain(name);
    await page.screenshot({ path: SHOTS + `${name}-arrival-card.png` });
    // walking about inside does not fire it again
    await page.evaluate(() => { window.farhold.hud.lastArrival = null; });
    await page.keyboard.down('KeyA');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(4000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyA');
    expect(await page.evaluate(() => window.farhold.hud.lastArrival), `${name}: fired twice`).toBe(null);
    seen.push({ name, kind, calls, line: card.line });
  }
  console.log(JSON.stringify(seen));
  expect(errors).toEqual([]);
});

test('every wall kind, and a village fence and hamlet stones, as the game draws them', async ({ page }) => {
  test.setTimeout(300000);
  await land(page);
  // the same town rebuilt as each culture — a look at every kind on real ground
  const AS = {
    palisade: { race: 'orc', biome: 'grassland' }, bone: { race: 'undead', biome: 'grassland' },
    mudbrick: { race: 'human', biome: 'desert' }, cutstone: { race: 'dwarf', biome: 'hills' },
    hedge: { race: 'elf', biome: 'forest' }, stone: { race: 'human', biome: 'grassland' },
  };
  for (const [kind, as] of Object.entries(AS)) {
    const got = await page.evaluate(async ({ as }) => {
      const f = window.farhold;
      const t = f.features.settlements.find(s => s.name === 'Cindercrown');
      Object.assign(t, as);
      return true;
    }, { as });
    expect(got).toBe(true);
    const at = await atGate(page, 'Cindercrown', 30);
    expect(at.kind).toBe(kind);
    await page.screenshot({ path: SHOTS + `kind-${kind}.png` });
  }
  // a village's fence and a hamlet's stones, from just outside, looking in along a road
  for (const size of [2, 1]) {
    const info = await page.evaluate(async (size) => {
      const f = window.farhold;
      for (const t of f.features.settlements.filter(s => s.size === size)) {
        f.features.update(t.wx, t.wz, true);
        const e = f.features.edgeOf(t.id);
        const g = e?.gaps.find(x => x.source === 'road');
        if (!g || (size === 2 && e.pieces.length < 20) || (size === 1 && e.stones.length < 2)) continue;
        const r = e.r + 18;
        const x = t.wx + Math.cos(g.angle + 0.25) * r, z = t.wz + Math.sin(g.angle + 0.25) * r;
        f.teleport(x, z);
        f.control.yaw = Math.atan2(t.wx - x, t.wz - z);
        f.control.pitch = -0.2;
        f.features.update(x, z, true);
        await new Promise(res => setTimeout(res, 1500));
        return { name: t.name, kind: e.kind, pieces: e.pieces.length, stones: e.stones.length };
      }
      return null;
    }, size);
    expect(info, `no size-${size} settlement with a road in`).toBeTruthy();
    await page.screenshot({ path: SHOTS + `edge-size${size}-${info.kind}.png` });
  }
});
