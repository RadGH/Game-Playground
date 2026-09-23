// Farhold — the bench, the tool ladder and the brand: four rules the data stated and nobody read.
//
// R19. All four are this project's signature fault in its usual shape — a finished mechanism with
// no way in — and none of them crashed, which is why all four survived several rounds:
//
//   1. js/main.js built the bench with none of `stores`, `resources` or `bench`, so §3.11's
//      craft-from-storage never ran once and every refined material printed as its raw id.
//   2. data/tools.json rarity.*.affixes is 0/1/2/3 up the ladder and `makeTool` read the other
//      four columns, so a Masterwork tool was a word in front of a name.
//   3. data/tools.json devices[].replaces named a ladder and the panel offered all three rungs.
//   4. js/craft.js minted an affix with `stat: 'brand'` that no unit table had heard of — and it
//      dodged tests/affixes.test.js's audit because that audits items.json, and this affix has no
//      definition in any file: it is built at the moment you brand a weapon.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createCrafting, Materials } from '../js/craft.js';
import { makeTool, buildable, toolReach } from '../js/tools.js';
import { SLOT_AFFIXES, SLOT_AFFIX_LIST } from '../js/gear.js';
import * as gearMod from '../js/gear.js';
import { ENGINE_UNIT } from '../js/affixes.js';
import { EFFECTS } from '../js/effects.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', 'data', f), 'utf8'));
const toolData = read('tools.json');
const craftData = read('crafting.json');
const resourceData = read('resources.json');

// ------------------------------------------------------------------ 1. the bench and its pool

/** The smallest thing that answers the three questions craft.js asks a store network. */
function fakeNetwork(held = {}) {
  const bag = { ...held };
  return {
    calls: 0,
    poolAt(x, z) { this.calls++; return Number.isFinite(x) && Number.isFinite(z) ? 'pool0' : null; },
    count(pool, id) { return pool === 'pool0' ? (bag[id] || 0) : 0; },
    take(pool, id, n) { if (pool !== 'pool0') return 0; const got = Math.min(bag[id] || 0, n); bag[id] -= got; return got; },
    get held() { return bag; },
  };
}

const fakeRpg = { rng: () => 0.5, loot: { rename: () => {} }, rollSlotAffix: (def) => def.min };

test('R19.B1 — the bench reaches a store pool, which it never did before', () => {
  const net = fakeNetwork({ resonant_dust: 40, bound_essence: 40, scrap_iron: 40 });
  const craft = createCrafting({
    data: craftData, rpg: fakeRpg, materials: new Materials(),
    stores: () => net, resources: resourceData,
  });

  // an empty bag with no bench set: the pool has no point to be asked about
  const before = craft.supply.count('resonant_dust');
  craft.setBench({ x: 12, z: -30 });
  const after = craft.supply.count('resonant_dust');

  assert.equal(before, 0, 'the bench found materials before it knew where it was standing');
  assert.equal(after, 40, 'the bench still cannot see a crate it is standing on');
  assert.ok(net.calls > 0, 'the store network was never asked');
});

test('R19.B2 — spending takes from the pool once the bag runs out', () => {
  const net = fakeNetwork({ scrap_iron: 10 });
  const materials = new Materials({ scrap_iron: 3 });
  const craft = createCrafting({
    data: craftData, rpg: fakeRpg, materials, stores: () => net, resources: resourceData,
  });
  craft.setBench({ x: 0, z: 0 });

  assert.equal(craft.supply.count('scrap_iron'), 13, 'bag and pool are not added together');
  const paid = craft.supply.spend({ scrap_iron: 8 });
  assert.ok(paid !== false, 'a cost the bag alone could not cover was refused');
  assert.equal(materials.count('scrap_iron'), 0, 'the bag was not emptied first');
  assert.equal(net.held.scrap_iron, 5, 'the remainder did not come out of the pool');
});

test('R19.B3 — a refined material prints with its name, not its id', () => {
  const withRes = createCrafting({ data: craftData, rpg: fakeRpg, materials: new Materials(), resources: resourceData });
  const without = createCrafting({ data: craftData, rpg: fakeRpg, materials: new Materials() });

  // whichever refined materials this build has, at least one must be named
  const refined = Object.keys(resourceData.materials || {});
  assert.ok(refined.length, 'data/resources.json has no materials at all');
  const named = refined.filter(id => withRes.M[id]?.name || typeof withRes.M[id] === 'string');
  assert.ok(named.length >= refined.length * 0.5,
    `only ${named.length} of ${refined.length} refined materials reached the bench's name table`);
  // and the old behaviour is what it was: without `resources`, they are simply absent
  const missing = refined.filter(id => !without.M[id]);
  assert.ok(missing.length > 0, 'this test can no longer tell the two apart');
});

test('R19.B4 — main.js passes the bench all three of the things it takes', () => {
  const main = readFileSync(join(here, '..', 'js', 'main.js'), 'utf8');
  const call = main.slice(main.indexOf('const craft = createCrafting('));
  const body = call.slice(0, call.indexOf('});') + 3);
  assert.match(body, /stores:/, 'main.js builds the bench with no store network again');
  assert.match(body, /resources:/, 'main.js builds the bench with no material names again');
  assert.match(main, /craft\.setBench\(/, 'nothing ever tells the bench where it is standing');
  // and the thunk, not the binding: `const stores` is declared ~1600 lines below this call
  assert.match(body, /stores:\s*\(\)\s*=>/, 'the store network is held rather than asked for');
});

// ------------------------------------------------------------------ 2. the tool rarity ladder

test('R19.B5 — the rarity table\'s affix column is rolled, all the way up the ladder', () => {
  const base = (toolData.bases || [])[0];
  assert.ok(base, 'data/tools.json has no tool bases');

  for (const [rarity, row] of Object.entries(toolData.rarity || {})) {
    const want = Math.round(row.affixes ?? 0);
    const item = makeTool(base, rarity, toolData, { level: 20, rpg: fakeRpg, rng: () => Math.random() });
    assert.equal(item.affixes.length, want,
      `a ${rarity} ${base.name} rolled ${item.affixes.length} affixes, not the ${want} the file asks for`);
    for (const a of item.affixes) {
      assert.ok(ENGINE_UNIT[a.stat], `tool affix ${a.id} (${a.stat}) has no declared unit`);
      assert.ok(EFFECTS[`affix:${a.stat}`], `tool affix ${a.stat} has no entry in the effect registry`);
      assert.ok(Number.isFinite(a.value), `tool affix ${a.id} rolled a non-number`);
    }
  }
});

test('R19.B6 — the ladder actually climbs: legendary carries more than magic', () => {
  const base = (toolData.bases || [])[0];
  const magic = makeTool(base, 'magic', toolData, { level: 20, rpg: fakeRpg });
  const legend = makeTool(base, 'legendary', toolData, { level: 20, rpg: fakeRpg });
  assert.ok(legend.affixes.length > magic.affixes.length,
    'a Masterwork tool carries no more than a Trued one');
  assert.ok(legend.speed > magic.speed, 'the speed column stopped climbing');
});

test('R19.B7 — each tool affix is read by something, not just printed', () => {
  // The four stats, and the derived key each one must land on for its reader to see it.
  const wiring = {
    cond_toolSpeed: 'gatherSpeed',   // toolSpeed()
    cond_toolYield: 'gatherYield',   // toolYield()
    cond_toolReach: 'toolReach',     // toolReach()
    cond_toolScan: 'toolScan',       // scanRadius()
  };
  for (const [stat, key] of Object.entries(wiring)) {
    const def = EFFECTS[`affix:${stat}`];
    assert.ok(def, `${stat} is not in the registry`);
    const d = {};
    def.derive?.(0.5, d);
    assert.ok(Number.isFinite(d[key]) && d[key] !== 0,
      `${stat} does not write derived.${key}, so its reader will never see it`);
  }

  // and one of them end to end, through the real reader
  const plain = toolReach({ equipment: {}, derived: {} }, 4);
  const long = toolReach({ equipment: {}, derived: { toolReach: 1.1 } }, 4);
  assert.ok(long > plain, 'a Long-handled roll does not reach any further');
});

test('R19.B8 — the tool pool is in the shared slot table, so it gets units and a card line', () => {
  assert.ok((SLOT_AFFIXES.tool || []).length >= 3, 'the tool slot has no affix pool');
  const flat = SLOT_AFFIX_LIST.filter(a => (a.onlySlots || []).includes('tool'));
  assert.equal(flat.length, SLOT_AFFIXES.tool.length,
    'tool affixes are missing from SLOT_AFFIX_LIST, so the loot pool never learns them');
  for (const a of flat) {
    assert.ok(a.extended, `${a.id} is not marked extended`);
    assert.ok(a.min < a.max, `${a.id} has no range to roll in`);
  }
});

// ------------------------------------------------------------------ 3. devices that replace

test('R19.B9 — a device you have outgrown is reported as superseded', () => {
  const devices = toolData.devices || [];
  const chain = devices.filter(d => d.replaces);
  assert.ok(chain.length, 'data/tools.json no longer declares a replaces chain to test');

  const owns = {};
  const rowsFor = have => buildable(toolData, { devices: have, equipment: {}, bag: [] }, () => 999);

  // nothing built: nothing is superseded
  for (const r of rowsFor({})) assert.equal(r.supersededBy, null, `${r.id} was superseded by nothing`);

  // build the top of the chain and every rung below it goes quiet
  const top = chain[chain.length - 1];
  owns[top.id] = true;
  const rows = rowsFor(owns);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId[top.replaces].supersededBy, top.id,
    `${top.replaces} is still offered at full price beside the thing that replaced it`);
  assert.ok(byId[top.replaces].supersededName, 'the superseded row cannot say what replaced it');

  // …and through it, the rung below THAT one — a chain, not a step
  const below = devices.find(d => d.id === top.replaces)?.replaces;
  if (below) {
    assert.ok(byId[below].supersededBy,
      `${below} is two rungs down and still offered: the chain is only being walked one link`);
  }
});

test('R19.B10 — the panel disables a superseded row rather than dropping it', () => {
  const ui = readFileSync(join(here, '..', 'js', 'station-ui.js'), 'utf8');
  assert.match(ui, /supersededBy/, 'the Tools and devices panel ignores supersededBy');
  assert.match(ui, /Superseded by the/, 'a superseded row does not say why it is dead');
  // dropping the row entirely reads as a bug, so the row must still be appended
  const panel = ui.slice(ui.indexOf('function drawToolPanel'));
  assert.match(panel.slice(0, panel.indexOf('\n}\n')), /box\.append\(row\)/,
    'the superseded row is no longer drawn at all');
});

// ------------------------------------------------------------------ 4. the brand

test('R19.B11 — the brand affix has a declared unit, which it never had', () => {
  assert.equal(ENGINE_UNIT.brand, 'flag',
    'the affix js/craft.js mints when you brand a weapon still has no unit');
});

test('R19.B12 — branding sets the element the engine actually reads', () => {
  const brandRecipe = (craftData.recipes || []).find(r => r.kind === 'brand');
  if (!brandRecipe) return;                       // no brand recipes in this build
  // fund it by material ID, not display name — a bag keyed on "Bound Essence" funds nothing and
  // the test then passes against broken code without ever reaching the thing it is checking
  const purse = {};
  for (const [id, n] of Object.entries(brandRecipe.cost || {})) purse[id] = n * 4;
  const craft = createCrafting({
    data: craftData, rpg: fakeRpg, materials: new Materials(purse), resources: resourceData,
  });

  const item = { name: 'Test Blade', rarity: 'rare', affixes: [], slot: 'weapon', type: 'weapon' };
  const out = craft.apply(brandRecipe.id, item, { player: { level: 20 } });
  assert.ok(out.ok, `branding failed: ${out.text || out.why}`);
  assert.equal(item.brand, brandRecipe.element,
    'item.brand is what elementOf() reads, and branding did not set it');
  const row = item.affixes.find(a => a.stat === 'brand');
  assert.ok(row, 'the card has no row saying the weapon is branded');
  assert.equal(ENGINE_UNIT[row.stat], 'flag', 'the minted row carries a stat with no unit');
});

test('R19.B13 — a rarity asking for N affixes gets N, whatever the rng does', () => {
  // The bug this catches was mine, and it passed on its own: pick-at-random-and-skip-a-duplicate
  // SPENDS the iteration rather than retrying, so the count came out short depending on the seed.
  // 400 draws across the ladder is enough that a pool of four cannot get lucky.
  const base = (toolData.bases || [])[0];
  for (const [rarity, row] of Object.entries(toolData.rarity || {})) {
    const want = Math.min(Math.round(row.affixes ?? 0), (SLOT_AFFIXES.tool || []).length);
    for (let i = 0; i < 100; i++) {
      const item = makeTool(base, rarity, toolData, { level: 20, rpg: fakeRpg, rng: Math.random });
      assert.equal(item.affixes.length, want, `a ${rarity} tool came out with ${item.affixes.length} of ${want}`);
      const ids = new Set(item.affixes.map(a => a.id));
      assert.equal(ids.size, item.affixes.length, `a ${rarity} tool rolled the same affix twice`);
    }
  }
});

test('R19.B14 — and the same for a mount or a lantern, which had the identical loop', () => {
  const { createGearShop, GEAR_BASES } = gearMod;
  const shop = createGearShop({ rpg: fakeRpg });
  const mounts = Object.values(GEAR_BASES).filter(b => b.slot === 'mount' || b.slot === 'light');
  assert.ok(mounts.length, 'no mount or light bases to test');
  for (const base of mounts.slice(0, 4)) {
    for (const [rarity, want] of [['rare', 2], ['legendary', 3]]) {
      const cap = Math.min(want, (SLOT_AFFIXES[base.slot] || []).length);
      for (let i = 0; i < 40; i++) {
        const item = shop.make(base.id, rarity, { level: 20, rng: Math.random });
        if (!item) continue;
        const rolled = (item.affixes || []).filter(a => !a.baseIntrinsic);
        assert.equal(rolled.length, cap,
          `a ${rarity} ${base.name} rolled ${rolled.length} of ${cap} affixes`);
      }
    }
  }
});
