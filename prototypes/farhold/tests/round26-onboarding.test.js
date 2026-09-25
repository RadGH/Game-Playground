// node --test prototypes/farhold/tests/round26-onboarding.test.js
//
// R26 — the onboarding, walked as a player would walk it, against the real data.
//
//   "The onboarding is still bad. It says 'Build a storage box' but that requires plank, which
//    requires a sawmill, which requires iron ingots, which requires a smelter. So why does the
//    onboarding tell you to build a chest before a smelter? The storage box, the basic one, should
//    just require 6 regular wood NOT plank. I built a furnace and queued up 2 iron ingot. However it
//    just says '2 min of work banked' and Smelt Iron is still listed as 0/1 two times. It is not
//    making the iron, and I cannot add or remove items."
//
// Two halves:
//
//   1. THE LINE IS POSSIBLE IN THE ORDER IT IS SHOWN. Start with nothing but the tool every
//      character lands holding. What that tool can take off the open ground is the whole of what
//      you have. Walk data/onboarding.json's steps top to bottom: each structure step must be
//      payable from what you have NOW (not what a later step would unlock), not behind research,
//      and once it stands its recipes add to what you have. A recipe step must run on a machine an
//      EARLIER step built, from inputs and fuel you already have. Nothing is allowed to lean on a
//      later step — which is exactly the loop the user walked into.
//
//   2. THE FURNACE WORKS WITH NO BOX. Ore and logs in the pack, a furnace on the ground, no store
//      anywhere: queue two ingots (by clicking ×1 twice, the way the user did), work it, and two
//      ingots land in the pack. And the queue shows ONE row, "0 of 2", not two rows of "0/1".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createBuildPlan, alignCatalogue, realCost } from '../js/buildplan.js';
import { createStoreNetwork } from '../js/stores.js';
import { createWorks } from '../js/refine.js';
import { createResearch } from '../js/research.js';
import { makeTool, canWork } from '../js/tools.js';
import { Materials } from '../js/craft.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, p), 'utf8'));

const STRUCTURES = read('../data/structures.json');
const REFINING = read('../data/refining.json');
const RESOURCES = read('../data/resources.json');
const POWER = read('../data/power.json');
const RESEARCH = read('../data/research.json');
const COLONY = read('../data/colony.json');
const TOOLS = read('../data/tools.json');
const ONBOARD = read('../data/onboarding.json');

const CATALOGUE = alignCatalogue(STRUCTURES, RESOURCES);
const BY_ID = Object.fromEntries(CATALOGUE.structures.map(s => [s.id, s]));
const FLAT = { heightAt: () => 0, slopeAt: () => 0, waterAt: () => false };

/** The player every new game makes: js/main.js equips `tools.bases[0]` on the first frame. */
function newcomer() {
  const tool = makeTool(TOOLS.bases[0], 'normal', TOOLS, { level: 1 });
  return { level: 1, equipment: { tool } };
}

/**
 * Every material the starting tool can take off the OPEN ground — no dungeon seams, nothing an
 * event places by hand, nothing a structure has to extract. That is the honest starting inventory.
 */
function gatherable(player) {
  const out = new Map();                       // material -> node kind that gives it
  for (const [kind, k] of Object.entries(RESOURCES.nodeKinds)) {
    if (k.indoors || k.placedOnly || k.fromPlanet) continue;
    if (!canWork(player, { kind }, RESOURCES)) continue;
    for (const m of Object.keys(k.resources || {})) if (!out.has(m)) out.set(m, kind);
  }
  return out;
}

test('R26 — the Storage Box costs six logs and nothing else', () => {
  const box = STRUCTURES.structures.find(s => s.id === 'storage_crate');
  assert.equal(box.name, 'Storage Box');
  assert.deepEqual(realCost(box.cost), { log: 6 });
});

test('R26 — the starting tool can take everything the first ingot needs off open ground', () => {
  const have = gatherable(newcomer());
  for (const m of ['log', 'stone', 'clay', 'iron_ore']) {
    assert.ok(have.has(m), `a new character cannot gather ${m} anywhere in the open with the tool they land holding`);
  }
});

test('R26 — THE LINE, WALKED IN ORDER: every step is possible when it is shown, and nothing leans on a later step', () => {
  const player = newcomer();
  const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  const have = new Set(gatherable(player).keys());    // grows as structures go up
  const built = new Set();
  const why = [];

  /** Everything a standing machine can make from what we already have, repeated until nothing new. */
  const unlockFrom = () => {
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of REFINING.recipes) {
        if (!built.has(r.machine) || r.rareInput || r.unlock) continue;
        if (!Object.keys(r.inputs || {}).every(m => have.has(m))) continue;
        const fuels = Object.keys(REFINING.machines[r.machine]?.fuels || {});
        if (fuels.length && !fuels.some(f => have.has(f))) continue;
        for (const o of Object.keys(r.outputs || {})) if (!have.has(o)) { have.add(o); grew = true; }
      }
    }
  };

  for (const step of ONBOARD.steps) {
    const c = step.check || {};
    if (c.kind === 'accepted') continue;
    if (c.kind === 'materials') {
      for (const m of Object.keys(c.need)) {
        assert.ok(have.has(m), `step "${step.id}" asks for ${m}, which nothing so far can produce`);
      }
      for (const kind of c.nodes || []) {
        assert.ok(canWork(player, { kind }, RESOURCES), `step "${step.id}" sends you to a ${kind} the starting tool cannot work`);
      }
      continue;
    }
    if (c.kind === 'structure') {
      // at least one of `anyOf` must be buildable NOW
      const ok = c.anyOf.filter(id => {
        const def = BY_ID[id];
        if (!def) return false;
        if (research.lockReason(id)) { why.push(`${id} is behind research: ${research.lockReason(id)?.text || ''}`); return false; }
        const short = Object.keys(realCost(def.cost)).filter(m => !have.has(m));
        if (short.length) { why.push(`${id} needs ${short.join(', ')}, which nothing before step "${step.id}" produces`); return false; }
        return true;
      });
      assert.ok(ok.length, `step "${step.id}" cannot be done when it is shown: ${why.join('; ')}`);
      for (const id of ok) built.add(id);
      unlockFrom();
      continue;
    }
    if (c.kind === 'recipe') {
      const r = REFINING.recipes.find(x => x.id === c.recipe);
      assert.ok(r, `no recipe ${c.recipe}`);
      assert.ok(built.has(r.machine), `step "${step.id}" runs on a ${r.machine}, which no EARLIER step builds`);
      for (const m of Object.keys(r.inputs || {})) assert.ok(have.has(m), `step "${step.id}" smelts ${m}, which you cannot have yet`);
      const fuels = Object.keys(REFINING.machines[r.machine]?.fuels || {});
      if (fuels.length) assert.ok(fuels.some(f => have.has(f)), `the ${r.machine} has nothing to burn at step "${step.id}"`);
      assert.ok(!r.unlock, `${c.recipe} has to be learned first`);
      continue;
    }
    assert.fail(`unknown check kind ${c.kind}`);
  }
  assert.ok(have.has('iron_ingot'), 'the line never gets to an iron ingot');
});

test('R26 — the gather step asks for enough logs and stone for the box, the furnace AND a fire', () => {
  const gather = ONBOARD.steps.find(s => s.check?.kind === 'materials');
  const box = realCost(BY_ID.storage_crate.cost);
  const furnace = realCost(BY_ID.furnace.cost);
  const smelt = REFINING.recipes.find(r => r.id === 'smelt_iron');
  const logSeconds = REFINING.machines.furnace.fuels.log;
  const fireLogs = Math.ceil(smelt.time / logSeconds);
  assert.ok(gather.check.need.log >= (box.log || 0) + (furnace.log || 0) + fireLogs,
    `${gather.check.need.log} logs does not cover a box (${box.log}), a furnace and ${fireLogs} to burn`);
  assert.ok(gather.check.need.stone >= (box.stone || 0) + (furnace.stone || 0), 'not enough stone asked for');
});

// ============================================================================ the furnace

/** A furnace in an empty field: no store anywhere, the pack is the only place anything is. */
function field({ carrying = {}, withBag = true } = {}) {
  const pack = new Materials(carrying);
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES.materials });
  const works = createWorks({
    refining: REFINING, resources: RESOURCES, stores, labour: COLONY.labour,
    bag: withBag ? {
      count: id => pack.count(id),
      take: (id, n) => { const got = Math.min(n, pack.count(id)); if (got > 0) pack.spend({ [id]: got }); return got; },
      put: (id, n) => { pack.add(id, n); return n; },
    } : null,
    bagReach: () => true,
  });
  works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  return { pack, stores, works };
}

test('R26 BUG — a furnace with NO box smelts out of the pack and puts the ingots in the pack', () => {
  const { pack, works } = field({ carrying: { iron_ore: 4, log: 3 } });

  // the user's clicks: ×1, then ×1 again
  assert.equal(works.queue('f1', 'smelt_iron', 1).ok, true);
  const again = works.queue('f1', 'smelt_iron', 1);
  assert.equal(again.ok, true);
  const m = works.get('f1');
  assert.equal(m.queue.length, 1, '"Smelt Iron 0/1" listed twice: the same recipe queued twice is two rows');
  assert.equal(m.queue[0].left, 2);

  // nobody working it: it waits, and says so
  works.catchUp(60);
  assert.equal(m.state, 'unworked');
  assert.match(works.stateText(m), /Stand beside it, or hold E/);

  // somebody stands at it — one unit is thirty seconds of furnace, two ingots are 32 s of work
  works.credit('f1', 4);
  works.catchUp(120);
  assert.equal(pack.count('iron_ingot'), 2, `made ${pack.count('iron_ingot')} ingots (${works.stateText(m)})`);
  assert.equal(pack.count('iron_ore'), 0, 'the ore did not come out of the pack');
  assert.ok(pack.count('log') < 3, 'nothing was burnt');
  assert.equal(m.queue.length, 0, 'the job did not finish');
});

test('R26 — the checklist names every missing thing at once, and where it looked', () => {
  const { works } = field({ carrying: {} });
  works.queue('f1', 'smelt_iron', 2);
  const needs = works.needs('f1');
  const bad = needs.filter(n => !n.ok).map(n => n.key);
  assert.deepEqual(bad.sort(), ['fuel', 'input', 'work'], JSON.stringify(needs));
  assert.match(needs.find(n => n.key === 'input').text, /Iron Ore: needs 2 a batch, none in your pack/);
  assert.match(needs.find(n => n.key === 'store').text, /No store in reach/);
});

test('R26 — with no pack wired and no store, the screen says it cannot reach anything', () => {
  const { works } = field({ carrying: { iron_ore: 4, log: 3 }, withBag: false });
  works.queue('f1', 'smelt_iron', 1);
  works.credit('f1', 4);
  works.catchUp(60);
  assert.equal(works.get('f1').made, 0);
  assert.match(works.needs('f1').find(n => n.key === 'store').text, /cannot get at anything/);
});

test('R26 — a furnace beside a box uses the box first and the pack only while you stand there', () => {
  const pack = new Materials({ iron_ore: 10, log: 5 });
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES.materials });
  let standing = false;
  const works = createWorks({
    refining: REFINING, resources: RESOURCES, stores, labour: COLONY.labour,
    bag: {
      count: id => pack.count(id),
      take: (id, n) => { const got = Math.min(n, pack.count(id)); if (got > 0) pack.spend({ [id]: got }); return got; },
      put: (id, n) => { pack.add(id, n); return n; },
    },
    bagReach: () => standing,
  });
  stores.add({ id: 'b1', type: 'storage_crate', name: 'Storage Box', x: 2, z: 0 });
  works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  works.queue('f1', 'smelt_iron', 1);
  works.credit('f1', 4);
  works.catchUp(40);
  assert.equal(works.get('f1').made, 0, 'it ate the pack of a player who is not there');
  standing = true;
  works.catchUp(40);
  assert.equal(works.get('f1').made, 1, works.stateText(works.get('f1')));
  // the ingot goes to the box, which is where a base keeps things
  const pool = stores.poolAt(0, 0);
  assert.equal(stores.count(pool, 'iron_ingot'), 1);
});

test('R26 — the − and + on a queued job move the count, and − to zero takes it off', () => {
  const { works } = field({ carrying: {} });
  works.queue('f1', 'smelt_iron', 2);
  works.adjust('f1', 0, 1);
  assert.equal(works.get('f1').queue[0].left, 3);
  works.adjust('f1', 0, -3);
  assert.equal(works.get('f1').queue.length, 0);
});

test('R26 — the real build ledger: six logs buy a Storage Box and it becomes a store', () => {
  const pack = new Materials({ log: 8, stone: 20, clay: 6 });
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES.materials });
  const plan = createBuildPlan({
    catalogue: CATALOGUE, terrain: FLAT,
    store: {
      have: id => pack.count(id),
      take: (id, n) => { pack.spend({ [id]: n }); return n; },
      give: (id, n) => { pack.add(id, n); return n; },
    },
  });
  const box = plan.place({ id: 'storage_crate', x: 0, z: 0 });
  assert.ok(box.ok, box.why);
  assert.equal(pack.count('log'), 2, 'the box did not cost six logs');
  stores.add({ id: box.entry.id, type: 'storage_crate', name: 'Storage Box', x: 0, z: 0 });
  assert.ok(stores.poolAt(0, 0), 'the box is not a store');
  const furnace = plan.place({ id: 'furnace', x: 4, z: 0 });
  assert.ok(furnace.ok, furnace.why);
});
