// node --test prototypes/frontier-foundry/tests/data.test.js
// The data files have to hold together: no id that points at nothing, no structure you can never
// research, and - the one that actually bit us - no material whose only maker costs that material.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../js/data.js';

const data = await loadData();
const R = new Set(data.resources.map(r => r.id));
const S = new Set(data.structures.map(s => s.id));
const RC = new Set(data.recipes.map(r => r.id));
const T = new Set(data.techs.map(t => t.id));
const V = new Set(data.vehicles.map(v => v.id));
const U = new Set(data.units.map(u => u.id));

test('counts: the brief asked for at least 34 resources, 80 structures and 40 research nodes', () => {
  assert.ok(data.resources.length >= 34, `${data.resources.length} resources`);
  assert.ok(data.structures.length >= 80, `${data.structures.length} structures`);
  assert.ok(data.techs.length >= 40, `${data.techs.length} techs`);
  assert.ok(data.recipes.length >= 40, `${data.recipes.length} recipes`);
  assert.ok(data.vehicles.length >= 10, `${data.vehicles.length} vehicles`);
  assert.ok(data.quests.length >= 20, `${data.quests.length} quests`);
});

test('every id is unique', () => {
  for (const [name, list] of [['resources', data.resources], ['structures', data.structures], ['recipes', data.recipes], ['techs', data.techs], ['vehicles', data.vehicles], ['units', data.units], ['quests', data.quests]]) {
    assert.equal(new Set(list.map(x => x.id)).size, list.length, name + ' has a duplicate id');
  }
});

test('resources are complete and sensibly shaped', () => {
  for (const r of data.resources) {
    assert.ok(r.name && r.kind && r.phase && r.color, r.id);
    assert.ok(['solid', 'liquid', 'gas'].includes(r.phase), r.id + ' phase');
    assert.ok(r.value > 0 && r.stack > 0, r.id + ' value/stack');
    assert.ok(r.desc && r.desc.length > 10, r.id + ' needs a plain-language description');
    if (r.phase === 'liquid') assert.equal(r.transport, 'tanker', r.id);
    if (r.phase === 'gas') assert.equal(r.transport, 'gas_hauler', r.id);
    if (r.found) {
      assert.ok(Array.isArray(r.found.archetypes) && r.found.archetypes.length, r.id + ' found.archetypes');
      assert.ok(r.found.rarity > 0 && r.found.rarity <= 1, r.id + ' rarity');
    }
  }
});

test('every structure cost, recipe and unlock points at something that exists', () => {
  for (const s of data.structures) {
    assert.ok(s.name && s.category && s.size?.w && s.size?.h, s.id);
    assert.ok(s.desc && s.desc.length > 15, s.id + ' needs a plain-language description');
    assert.ok(T.has(s.unlock), `${s.id} unlock ${s.unlock}`);
    for (const c of Object.keys(s.cost || {})) assert.ok(R.has(c), `${s.id} costs unknown ${c}`);
    for (const rid of s.recipes || []) assert.ok(RC.has(rid), `${s.id} lists unknown recipe ${rid}`);
    for (const f of Object.keys(s.fuelInput || {})) assert.ok(R.has(f), `${s.id} burns unknown ${f}`);
    for (const f of Object.keys(s.altFuel || {})) assert.ok(R.has(f), `${s.id} burns unknown ${f}`);
    if (s.upgradeOf) assert.ok(S.has(s.upgradeOf), s.id + ' upgradeOf');
  }
});

test('every recipe resource and machine exists', () => {
  for (const r of data.recipes) {
    assert.ok(r.time > 0, r.id + ' time');
    assert.ok(T.has(r.unlock), `${r.id} unlock ${r.unlock}`);
    assert.ok(r.machines?.length, r.id + ' has no machine');
    for (const m of r.machines) assert.ok(S.has(m), `${r.id} names unknown machine ${m}`);
    for (const i of Object.keys(r.inputs || {})) assert.ok(R.has(i), `${r.id} eats unknown ${i}`);
    assert.ok(Object.keys(r.outputs || {}).length, r.id + ' makes nothing');
    for (const o of Object.keys(r.outputs || {})) assert.ok(R.has(o), `${r.id} makes unknown ${o}`);
  }
});

test('every planet-themed variant names a real element and a real parent', () => {
  const variants = data.structures.filter(s => s.category === 'variant');
  assert.ok(variants.length >= 8, `${variants.length} variants`);
  for (const v of variants) {
    assert.ok(v.planetRequirement, v.id + ' has no planetRequirement');
    assert.ok(R.has(v.planetRequirement), `${v.id} requires unknown ${v.planetRequirement}`);
    assert.ok(S.has(v.variantOf), `${v.id} variantOf ${v.variantOf}`);
    const tech = data.tech[v.unlock];
    assert.equal(tech.planetRequirement, v.planetRequirement, `${v.id}'s tech must be gated on the same element`);
  }
});

test('the research tree has no orphans and no loops', () => {
  for (const t of data.techs) {
    assert.ok(t.name && t.desc, t.id);
    for (const q of t.requires || []) assert.ok(T.has(q), `${t.id} requires unknown ${q}`);
    for (const c of Object.keys(t.cost || {})) assert.ok(R.has(c), `${t.id} costs unknown ${c}`);
    for (const u of t.unlocks || []) assert.ok(S.has(u) || RC.has(u) || V.has(u) || U.has(u), `${t.id} unlocks unknown ${u}`);
    if (t.planetRequirement) assert.ok(R.has(t.planetRequirement), t.id + ' planetRequirement');
  }
  // depth-first cycle check
  const seen = new Map();
  const walk = (id, stack = new Set()) => {
    if (stack.has(id)) assert.fail('research loop at ' + id);
    if (seen.has(id)) return;
    stack.add(id);
    for (const q of data.tech[id].requires || []) walk(q, stack);
    stack.delete(id);
    seen.set(id, true);
  };
  for (const t of data.techs) walk(t.id);
});

test('everything in the tree is actually reachable from the landing kit', () => {
  const KIT = ['iron_plate', 'gear', 'copper_wire', 'stone', 'coal', 'iron_ore', 'concrete'];
  const POD = new Set(['make_iron_plate', 'make_gear', 'make_wire']);      // the pod's own workbench
  const raw = new Set(data.resources.filter(r => r.found).map(r => r.id));
  const producible = new Set([...raw, ...KIT]);
  const researched = new Set(['t_landfall']);
  const buildable = new Set();
  const unlocked = id => [...researched].some(t => (data.tech[t].unlocks || []).includes(id));

  for (let pass = 0; pass < 80; pass++) {
    let changed = false;
    for (const s of data.structures) {
      if (buildable.has(s.id) || s.planetRequirement || !unlocked(s.id)) continue;
      if (Object.keys(s.cost || {}).every(c => producible.has(c))) { buildable.add(s.id); changed = true; }
    }
    for (const r of data.recipes) {
      if (r.planetRequirement || !unlocked(r.id)) continue;
      if (!(POD.has(r.id) || r.machines.some(m => buildable.has(m)))) continue;
      if (!Object.keys(r.inputs || {}).every(i => producible.has(i))) continue;
      for (const o of Object.keys(r.outputs || {})) if (!producible.has(o)) { producible.add(o); changed = true; }
    }
    for (const t of data.techs) {
      if (researched.has(t.id) || t.planetRequirement || !(t.requires || []).every(q => researched.has(q))) continue;
      if (!Object.keys(t.cost || {}).every(c => producible.has(c))) continue;
      researched.add(t.id); changed = true;
    }
    if (!changed) break;
  }
  const missingTech = data.techs.filter(t => !t.planetRequirement && !researched.has(t.id)).map(t => t.id);
  const missingBuild = data.structures.filter(s => !s.planetRequirement && !buildable.has(s.id)).map(s => s.id);
  const missingRes = data.resources.filter(r => !producible.has(r.id)).map(r => r.id);
  assert.deepEqual(missingTech, [], 'unreachable research: ' + missingTech.join(', '));
  assert.deepEqual(missingBuild, [], 'unbuildable: ' + missingBuild.join(', '));
  assert.deepEqual(missingRes, [], 'unmakeable: ' + missingRes.join(', '));
});

test('vehicles, units and wave tables line up', () => {
  for (const v of data.vehicles) {
    assert.ok(T.has(v.unlock), v.id + ' unlock');
    assert.ok(v.capacity > 0 && v.baseSpeed > 0, v.id);
    for (const c of Object.keys(v.cost || {})) assert.ok(R.has(c), `${v.id} costs unknown ${c}`);
    for (const t of v.tiers || []) for (const c of Object.keys(t.cost || {})) assert.ok(R.has(c), `${v.id} tier costs unknown ${c}`);
    for (const carried of v.carries) assert.ok(['solid', 'liquid', 'gas'].includes(carried), v.id + ' carries');
  }
  for (const u of data.units) {
    assert.ok(u.hp > 0, u.id);
    if (u.side === 'player') assert.ok(T.has(u.unlock), u.id + ' unlock');
    else assert.ok(u.structure || u.threat > 0, u.id + ' enemy needs a threat cost');
    if (u.spawns) assert.ok(U.has(u.spawns.unit), u.id + ' spawns unknown ' + u.spawns.unit);
  }
  for (const [arch, table] of Object.entries(data.waveTables)) {
    assert.ok(table.length >= 4, arch + ' wave table is thin');
    for (const e of table) assert.ok(U.has(e.unit), `${arch} wave table names unknown ${e.unit}`);
    assert.ok(table.some(e => e.from === 1), arch + ' has nothing that can turn up in wave 1');
  }
  for (const [arch, list] of Object.entries(data.nestTables)) for (const n of list) assert.ok(U.has(n), arch + ' nest ' + n);
});

test('quests and notifications are wired up', () => {
  for (const q of data.quests) {
    assert.ok(q.goal > 0 && q.text && q.done, q.id);
    if (q.type === 'build' || (q.type === 'build_count' && !q.target?.startsWith('category:'))) assert.ok(S.has(q.target), `${q.id} target ${q.target}`);
    if (q.type === 'produce') assert.ok(R.has(q.target), `${q.id} target ${q.target}`);
    for (const r of Object.keys(q.reward?.resources || {})) assert.ok(R.has(r), `${q.id} rewards unknown ${r}`);
  }
  for (const [type, n] of Object.entries(data.notifications)) {
    assert.ok(n.text && n.importance >= 1 && n.importance <= 5, type);
  }
  // every notification the engine raises must have a template
  const used = ['landed', 'node_found', 'rare_found', 'node_depleted', 'build_started', 'build_done', 'build_blocked',
    'brownout', 'power_restored', 'machine_starved', 'route_created', 'route_blocked', 'research_done', 'research_stalled',
    'quest_offered', 'quest_done', 'threat_rising', 'wave_incoming', 'wave_cleared', 'structure_lost', 'wall_breached',
    'unit_lost', 'nest_found', 'nest_cleared', 'hazard_storm', 'hazard_cold', 'hazard_radiation', 'hazard_ashfall',
    'hazard_over', 'region_explored', 'satellite_up', 'probe_arrived', 'rocket_ready', 'rocket_launched',
    'station_module', 'station_complete', 'beacon_lit', 'victory', 'defeat'];
  for (const t of used) assert.ok(data.notifications[t], 'engine raises ' + t + ' with no template');
});

// ---------------------------------------------------------------- art, rare elements, quests
// Added with the rare-element pass: every id the interface has to draw needs a file to draw, and a
// rare element is only content if a run can actually reach it.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = new Set(readdirSync(join(HERE, '../../../assets/data/icons/foundry'))
  .filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)));
/** The file the interface would draw for one data entry (mirrors js/ui/icons.js `iconFor`). */
const artFor = (kind, def) => {
  for (const id of [def.icon, def.id]) if (id && ICONS.has(`${kind}_${id}`)) return `${kind}_${id}`;
  return null;
};

test('every structure, resource, unit and vehicle has art of its own or names one that exists', () => {
  const missing = [];
  for (const [kind, list] of [['bld', data.structures], ['res', data.resources], ['unit', data.units], ['veh', data.vehicles]]) {
    for (const def of list) {
      if (def.icon) assert.ok(ICONS.has(`${kind}_${def.icon}`), `${def.id} points at missing art ${kind}_${def.icon}`);
      if (!artFor(kind, def)) missing.push(`${kind}_${def.id}`);
    }
  }
  assert.deepEqual(missing, [], 'no icon for: ' + missing.join(', '));
});

test('the four late rare elements are complete content, not just a resource row', () => {
  // resource -> a building that needs it -> a recipe that building runs -> a tech that unlocks both
  for (const element of ['helion_gas', 'nullstone', 'emberlace', 'brinepearl']) {
    const res = data.resource[element];
    assert.ok(res, element + ' is not a resource');
    assert.equal(res.kind, 'rare', element + ' should be a rare element');
    assert.ok(res.found?.archetypes?.length, element + ' is not found on any archetype');

    const buildings = data.structures.filter(s => s.planetRequirement === element);
    assert.ok(buildings.length, element + ' has no building of its own');
    const recipes = data.recipes.filter(r => Object.keys(r.inputs || {}).includes(element));
    assert.ok(recipes.length, element + ' is an input to nothing');
    for (const r of recipes) assert.ok(r.machines.some(m => data.structure[m]), r.id + ' names no real machine');

    const techs = data.techs.filter(t => t.planetRequirement === element);
    assert.ok(techs.length, element + ' has no research node');
    for (const t of techs) for (const u of t.unlocks || []) {
      assert.ok(data.structure[u] || data.recipe[u] || data.vehicle[u] || data.unit[u], `${t.id} unlocks unknown ${u}`);
    }
    // and something that tech unlocks must be one of the element's own buildings or recipes
    const opened = new Set(techs.flatMap(t => t.unlocks || []));
    assert.ok(buildings.some(b => opened.has(b.id)) || recipes.some(r => opened.has(r.id)),
      element + "'s research does not open its own building or recipe");
  }
});

test('every rare element is carried by at least one archetype the planet generator can roll', async () => {
  const { ARCHETYPES, makePlanet } = await import('../js/planets.js');
  const rare = data.resources.filter(r => r.kind === 'rare');
  for (const r of rare) {
    const homes = (r.found?.archetypes || []).filter(a => ARCHETYPES[a]);
    assert.ok(homes.length, `${r.id} is found on no archetype this game generates`);
  }
  // and every archetype's rare pool names real resources
  for (const a of Object.keys(ARCHETYPES)) {
    const p = makePlanet({ id: 'x', seed: 3, archetype: a, resourceTable: data.resources });
    for (const el of p.rareElements) assert.ok(data.resource[el], `${a} rolls unknown rare element ${el}`);
    assert.ok(p.resources.includes('iron_ore') && p.resources.includes('coal'), a + ' is not landable');
  }
});

test('every archetype has a wave table, a nest table and hazards that the balance file knows', async () => {
  const { ARCHETYPES } = await import('../js/planets.js');
  const { BALANCE } = await import('../js/rules.js');
  for (const a of Object.keys(ARCHETYPES)) {
    assert.ok(data.waveTables[a]?.length, a + ' has no wave table');
    assert.ok(data.nestTables[a]?.length, a + ' has no nest table');
    for (const tag of ARCHETYPES[a].hazards) {
      assert.ok(BALANCE.hazards[tag], `${a} carries hazard ${tag} with no entry in balance.json`);
      assert.ok(data.notifications[BALANCE.hazards[tag].notify], `hazard ${tag} has no notification template`);
    }
  }
  for (const n of Object.values(data.nestTables).flat()) {
    const def = data.unit[n];
    assert.ok(def?.spawns, n + ' is used as a nest but spawns nothing');
    assert.ok(data.unit[def.spawns.unit], `${n} spawns unknown ${def.spawns.unit}`);
  }
});

test('the quest book has a tutorial chain and enough side objectives', () => {
  const tutorial = data.quests.filter(q => q.chain === 'tutorial');
  assert.ok(tutorial.length >= 8, `only ${tutorial.length} tutorial steps`);
  const side = data.quests.filter(q => !q.chain);
  assert.ok(side.length >= 15, `only ${side.length} side quests`);
  // every chain is a straight line: numbered steps, 1..n, no gaps and no repeats, because the engine
  // only ever offers the lowest unfinished step of a chain
  const chains = new Map();
  for (const q of data.quests) if (q.chain) (chains.get(q.chain) ?? chains.set(q.chain, []).get(q.chain)).push(q);
  assert.ok(chains.has('tutorial'), 'there is no tutorial chain');
  for (const [name, steps] of chains) {
    assert.ok(steps.length >= 2, name + ' is a chain of one');
    const numbers = steps.map(q => q.step).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      assert.equal(numbers[i], i + 1, `${name} step numbers are ${numbers.join(',')} - they have to run 1..${numbers.length}`);
    }
    for (const q of steps) assert.ok(q.text && q.done && q.goal > 0, q.id + ' is missing its text or its goal');
  }
});

test('every quest can actually be finished: its type is one the engine checks', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../js/game.js', import.meta.url), 'utf8'));
  for (const q of data.quests) {
    assert.ok(src.includes(`'${q.type}'`), `nothing in game.js measures quest type ${q.type} (${q.id})`);
  }
});

test('the wave tables ramp: cheap things early, bosses late, and nothing that cannot be answered', () => {
  const BOSS_FROM = 25;                       // the first boss wave the player meets is 10 and 20
  for (const [arch, table] of Object.entries(data.waveTables)) {
    const wave1 = table.filter(e => e.from <= 1);
    assert.ok(wave1.length, arch + ' has nothing that can turn up in wave 1');
    // wave 1's budget is five threat points; anything dearer than that just gets swapped for
    // whatever is cheap, so a table whose only wave-1 entry is expensive opens with nothing
    for (const e of wave1) assert.ok(data.unit[e.unit].threat <= 5, `${arch} opens with ${e.unit}, which costs ${data.unit[e.unit].threat} threat and the first wave can only spend five`);
    for (const e of table) {
      const def = data.unit[e.unit];
      if (def.boss) assert.ok(e.from >= BOSS_FROM, `${arch} lets the boss ${e.unit} in at wave ${e.from}; a wave-20 boss is unanswerable with tier-two guns`);
      // anything that flies has to be reachable by a turret the player can have by then
      if (def.air) {
        const answers = data.structures.filter(s => s.hitsAir && s.category === 'defence');
        assert.ok(answers.length >= 2, `${arch} sends ${e.unit} at wave ${e.from} and only ${answers.length} turret answers air`);
      }
    }
  }
});
