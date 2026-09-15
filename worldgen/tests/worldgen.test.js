// node --test worldgen/tests/worldgen.test.js
// Checks the generator's promises: same seed → same world, every method makes a sensible map, water
// runs downhill to somewhere, every region is named, roads reach every town on a landmass, places
// keep their distance, and a saved world reloads unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateWorld, METHODS, PRESETS, DEFAULTS, cellInfo, nearestNode, elevationToMetres, DEFAULT_RELIEF } from '../js/world.js';
import { generateRegionDetail, generateLocalDetail } from '../js/local.js';
import { roadGraph } from '../js/roads.js';
import { toJSON, fromJSON, bytesToBase64, base64ToBytes } from '../js/export.js';
import { worldPixels, legend, elevationLegend } from '../js/render.js';
import { forbiddenWordIn } from '../js/names.js';
import { BIOMES, classify } from '../js/biomes.js';
import { makeNoise2D, fbm, makeRng } from '../js/noise.js';
import { NameGen } from '../../namegen/js/namegen.js';

const SMALL = { width: 160, height: 80 };
const read = f => JSON.parse(readFileSync(new URL('../../namegen/data/' + f, import.meta.url)));
const namegen = new NameGen({ languages: read('languages.json'), concepts: read('concepts.json'), patterns: read('patterns.json') });

const cache = new Map();
function world(opts = {}) {
  const key = JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, generateWorld({ ...SMALL, seed: 4242, namegen, ...opts }));
  return cache.get(key);
}

test('noise is seeded, smooth and in range', () => {
  const a = makeNoise2D(7), b = makeNoise2D(7), c = makeNoise2D(8);
  assert.equal(a(1.5, 2.5), b(1.5, 2.5));
  assert.notEqual(a(1.5, 2.5), c(1.5, 2.5));
  for (let i = 0; i < 500; i++) {
    const v = a(i * 0.37, i * 0.11);
    assert.ok(v >= -1.05 && v <= 1.05, 'simplex out of range: ' + v);
  }
  for (let i = 0; i < 200; i++) { const f = fbm(a, i * 0.1, i * 0.2); assert.ok(f >= 0 && f <= 1, 'fbm out of range: ' + f); }
  const rng = makeRng(3), rng2 = makeRng(3);
  assert.equal(rng(), rng2());
});

test('the same seed and knobs always make the same world', () => {
  const a = generateWorld({ ...SMALL, seed: 99, namegen });
  const b = generateWorld({ ...SMALL, seed: 99, namegen });
  assert.deepEqual(Array.from(a.elevation.slice(0, 400)), Array.from(b.elevation.slice(0, 400)));
  assert.deepEqual(Array.from(a.biome), Array.from(b.biome));
  assert.deepEqual(a.regions.map(r => r.name), b.regions.map(r => r.name));
  assert.deepEqual(a.nodes.map(n => n.name + n.x + n.y), b.nodes.map(n => n.name + n.x + n.y));
  assert.deepEqual(a.history.map(h => h.text), b.history.map(h => h.text));
  const c = generateWorld({ ...SMALL, seed: 100, namegen });
  assert.notDeepEqual(Array.from(a.biome), Array.from(c.biome), 'a different seed must give a different world');
});

test('every continent method makes a sane amount of land, and they do not make the same land', () => {
  const shapes = [];
  for (const method of METHODS) {
    const w = world({ method });
    const frac = w.stats.landFraction;
    assert.ok(frac > 0.2 && frac < 0.75, `${method}: land fraction ${frac.toFixed(2)} is out of range`);
    assert.ok(w.continents.length >= 1, method + ': no landmasses');
    assert.ok(w.regions.length >= 4, `${method}: only ${w.regions.length} regions`);
    // land should not be one solid rectangle nor confetti: the biggest landmass is a real share of it
    const biggest = w.continents[0].cells / w.stats.landCells;
    assert.ok(biggest > 0.08, `${method}: biggest landmass is only ${(biggest * 100).toFixed(0)}% of the land`);
    shapes.push(Array.from(w.water).join(''));
  }
  assert.equal(new Set(shapes).size, METHODS.length, 'two methods produced identical coastlines');
});

test('sea level moves the coast', () => {
  const wet = world({ seaLevel: 0.8 }), dry = world({ seaLevel: 0.3 });
  assert.ok(wet.stats.landFraction < dry.stats.landFraction - 0.25, `${wet.stats.landFraction} vs ${dry.stats.landFraction}`);
});

test('rivers run downhill and end in the sea, a lake or another river', () => {
  const w = world({ riverDensity: 0.7 });
  assert.ok(w.rivers.length > 3, 'no rivers at all');
  const byCell = new Map();
  for (const r of w.rivers) for (const c of r.cells) if (!byCell.has(c)) byCell.set(c, r.id);
  let reachedWater = 0;
  for (const r of w.rivers) {
    assert.ok(['sea', 'lake', 'confluence'].includes(r.mouth.type), `river ${r.id} ends in a ${r.mouth.type}`);
    if (r.mouth.type !== 'confluence') reachedWater++;
    // elevation must not climb along the course
    for (let i = 1; i < r.cells.length; i++) {
      const drop = w.filled[r.cells[i - 1]] - w.filled[r.cells[i]];
      assert.ok(drop >= -1e-4, `river ${r.id} runs uphill at step ${i}`);
    }
  }
  assert.ok(reachedWater / w.rivers.length > 0.4, 'most rivers should reach open water, not just join another');
  // lakes are really enclosed water
  for (const l of w.lakes) assert.equal(w.water[l.center.y * w.width + l.center.x], 2);
});

test('every region has a name, cells, a home biome and neighbours', () => {
  const w = world();
  const counted = new Int32Array(w.regions.length);
  for (let i = 0; i < w.region.length; i++) if (w.region[i] >= 0) counted[w.region[i]]++;
  const names = new Set();
  for (const r of w.regions) {
    assert.ok(r.name && r.name.length > 2, `region ${r.id} has no name`);
    assert.ok(!/[{}]|undefined|NaN/.test(r.name), `region name looks broken: ${r.name}`);
    assert.ok(!names.has(r.name), `duplicate region name: ${r.name}`);
    names.add(r.name);
    assert.equal(r.cells, counted[r.id], `region ${r.name} cell count does not match the map`);
    assert.ok(r.cells >= 1);
    assert.ok(BIOMES.some(b => b.key === r.biome));
    assert.ok(r.descriptor.length > 10, 'region descriptor is empty');
    assert.ok(r.race && typeof r.race === 'string');
    assert.ok(w.region[r.label.y * w.width + r.label.x] === r.id, 'the label must sit inside the region');
  }
  // water is never part of a region
  for (let i = 0; i < w.region.length; i++) if (w.water[i] !== 0) assert.equal(w.region[i], -1);
  // small regions were merged away
  const min = Math.min(...w.regions.map(r => r.cells));
  assert.ok(min >= 2, 'a one-cell region survived the merge');
});

test('named features: seas, ranges, lakes, forests and big rivers all get names', () => {
  const w = world();
  for (const list of ['seas', 'ranges', 'lakes', 'forests']) {
    for (const f of w[list]) assert.ok(f.name && !/[{}]|undefined/.test(f.name), `${list}: bad name ${f.name}`);
  }
  const named = w.rivers.filter(r => r.name);
  assert.ok(named.length >= Math.min(3, w.rivers.length), 'no rivers were named');
  for (const c of w.continents) assert.ok(c.name && c.name.length > 1);
});

test('places are scored, typed, inside the map and never on top of each other', () => {
  const w = world();
  const areaScale = Math.sqrt((w.width * w.height) / (256 * 128));
  const spaced = w.nodes.filter(n => n.type !== 'crossing');
  for (const n of w.nodes) {
    assert.ok(n.x >= 0 && n.y >= 0 && n.x < w.width && n.y < w.height, 'node outside the map');
    assert.equal(w.water[n.index], 0, `${n.name} (${n.kind}) is standing in the water`);
    assert.ok(n.name && !/[{}]|undefined|NaN/.test(n.name), 'bad node name: ' + n.name);
    assert.ok(Array.isArray(n.tags) && n.tags.length);
  }
  for (let i = 0; i < spaced.length; i++) for (let j = i + 1; j < spaced.length; j++) {
    const d = Math.hypot(spaced[i].x - spaced[j].x, spaced[i].y - spaced[j].y);
    assert.ok(d >= 3.4 * areaScale * 0.98, `${spaced[i].name} and ${spaced[j].name} are ${d.toFixed(1)} cells apart`);
  }
  const settlements = w.nodes.filter(n => n.type === 'settlement');
  assert.ok(settlements.length >= 3, 'no settlements');
  assert.ok(settlements.some(n => n.tier === 'capital'), 'no capital');
  // habitability actually drives the choice: settlements sit on better ground than the average land cell
  let sum = 0, n = 0;
  for (let i = 0; i < w.habitability.length; i++) if (w.water[i] === 0) { sum += w.habitability[i]; n++; }
  const avg = sum / n, townAvg = settlements.reduce((s, t) => s + w.habitability[t.index], 0) / settlements.length;
  assert.ok(townAvg > avg, `towns (${townAvg.toFixed(2)}) should sit on better ground than average (${avg.toFixed(2)})`);
});

test('roads reach every settlement on a landmass, and crossings are on rivers', () => {
  const w = world();
  const adj = roadGraph(w);
  const hubs = w.nodes.filter(n => n.type === 'settlement' || n.type === 'port');
  const byContinent = new Map();
  for (const n of hubs) {
    const c = w.continentOf[n.index];
    if (!byContinent.has(c)) byContinent.set(c, []);
    byContinent.get(c).push(n);
  }
  for (const [c, group] of byContinent) {
    if (group.length < 2) continue;
    const seen = new Set([group[0].id]), stack = [group[0].id];
    while (stack.length) {
      const id = stack.pop();
      for (const nb of adj.get(id) || []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    const missed = group.filter(n => !seen.has(n.id));
    assert.equal(missed.length, 0, `landmass ${c}: ${missed.map(n => n.name).join(', ')} are cut off by road`);
  }
  for (const r of w.roads) {
    assert.ok(r.cells.length >= 2);
    for (const c of r.cells) assert.notEqual(w.water[c], 1, 'a road runs through the sea');
    assert.ok(['highway', 'road', 'trail'].includes(r.class));
  }
  for (const n of w.nodes.filter(x => x.type === 'crossing')) assert.ok(w.river[n.index] > 0, `${n.name} is a bridge over dry land`);
  // sea lanes only cross open water
  for (const l of w.seaLanes) for (const c of l.cells.slice(1, -1)) assert.equal(w.water[c], 1, 'a sea lane runs overland');
});

test('biomes follow the climate table and the aura knob adds cursed ground', () => {
  const w = world();
  for (let i = 0; i < w.biome.length; i++) {
    const b = BIOMES[w.biome[i]];
    if (w.water[i] === 0) assert.ok(b.tags.includes('land'), `land cell holds ${b.key}`);
    else assert.ok(b.tags.includes('water'), `water cell holds ${b.key}`);
  }
  // hot and dry is never boreal forest; cold is never rainforest
  for (let i = 0; i < w.biome.length; i++) {
    if (w.water[i]) continue;
    const key = BIOMES[w.biome[i]].key;
    if (key === 'rainforest') assert.ok(w.temperature[i] > 0.4, 'rainforest in the cold');
    if (key === 'ice') assert.ok(w.temperature[i] < 0.35, 'ice in the heat');
  }
  const cursed = world({ auraStrength: 1, auraBalance: 1 });
  const evilCells = Array.from(cursed.biome).filter(id => BIOMES[id].tags.includes('evil')).length;
  assert.ok(evilCells > 40, `a fully cursed world only produced ${evilCells} blighted cells`);
  const clean = world({ auraStrength: 0, auraBalance: 0.5, magicStrength: 0 });
  const cleanEvil = Array.from(clean.biome).filter(id => BIOMES[id].tags.includes('aura')).length;
  assert.ok(cleanEvil < 30, `aura off should mean almost no aura biomes, got ${cleanEvil}`);
});

test('wind direction moves the rain shadow to the other side of the mountains', () => {
  const west = world({ windDirection: 'west', rainShadow: 1 });
  const east = world({ windDirection: 'east', rainShadow: 1 });
  let diff = 0;
  for (let i = 0; i < west.moisture.length; i++) if (west.water[i] === 0) diff += Math.abs(west.moisture[i] - east.moisture[i]);
  assert.ok(diff / west.stats.landCells > 0.05, 'flipping the wind barely changed the rainfall');
});

test('presets all generate, and each looks different from the others', () => {
  const seen = new Set();
  for (const [name, p] of Object.entries(PRESETS)) {
    const w = generateWorld({ ...SMALL, seed: 5, namegen, ...p });
    assert.ok(w.regions.length > 2, name + ' made no regions');
    assert.ok(w.nodes.length > 4, name + ' made no places');
    seen.add(Array.from(w.biome).join(''));
  }
  assert.equal(seen.size, Object.keys(PRESETS).length);
});

test('a saved world reloads exactly as it was', () => {
  const w = world();
  const json = toJSON(w);
  const back = fromJSON(JSON.parse(JSON.stringify(json)));
  assert.equal(back.width, w.width); assert.equal(back.seed, w.seed);
  assert.deepEqual(Array.from(back.biome), Array.from(w.biome));
  assert.deepEqual(Array.from(back.elevation), Array.from(w.elevation));
  assert.deepEqual(Array.from(back.region), Array.from(w.region));
  assert.deepEqual(back.regions.map(r => r.name), w.regions.map(r => r.name));
  assert.deepEqual(back.nodes.map(n => n.name), w.nodes.map(n => n.name));
  assert.deepEqual(Array.from(back.roads[0].cells), Array.from(w.roads[0].cells));
  // and again, to prove the round trip is stable
  assert.deepEqual(JSON.stringify(toJSON(back)), JSON.stringify(json));
  // the plain format is readable and equivalent
  const plain = fromJSON(toJSON(w, { arrays: 'plain' }));
  assert.deepEqual(Array.from(plain.biome), Array.from(w.biome));
});

test('base64 helper round-trips every byte value', () => {
  for (const len of [0, 1, 2, 3, 255, 256, 1000]) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 37) & 255;
    assert.deepEqual(Array.from(base64ToBytes(bytesToBase64(bytes))), Array.from(bytes));
  }
});

test('region detail matches the world it came from', () => {
  const w = world();
  const id = w.regions.reduce((best, r) => (r.cells > (best?.cells || 0) ? r : best), null).id;
  const a = generateRegionDetail(w, id, { factor: 5, namegen });
  const b = generateRegionDetail(w, id, { factor: 5, namegen });
  assert.deepEqual(Array.from(a.biome.slice(0, 500)), Array.from(b.biome.slice(0, 500)), 'region detail must be repeatable');
  assert.equal(a.width, a.worldCells.w * a.factor);
  assert.ok(a.width > 20 && a.height > 20);
  for (let i = 0; i < a.biome.length; i++) assert.ok(BIOMES[a.biome[i]], 'unknown biome id in the region detail');
  // the fine grid agrees with the coarse one about land and water most of the time
  let agree = 0;
  for (let i = 0; i < a.water.length; i++) if ((a.water[i] === 0) === (w.water[a.parentCell[i]] === 0)) agree++;
  assert.ok(agree / a.water.length > 0.85, `only ${(agree / a.water.length * 100).toFixed(0)}% of the detail agrees with the world map`);
  assert.ok(a.nodes.length >= 1, 'no places in the region detail');
  assert.ok(a.streams.length >= 0);
  for (const p of a.paths) assert.ok(p.cells.length >= 2);
});

test('a local tile is repeatable and matches its world cell', () => {
  const w = world();
  const town = w.nodes.find(n => n.type === 'settlement');
  const a = generateLocalDetail(w, town.x, town.y, { node: town });
  const b = generateLocalDetail(w, town.x, town.y, { node: town });
  assert.deepEqual(Array.from(a.elevation), Array.from(b.elevation));
  assert.deepEqual(a.features.map(f => f.kind + f.x.toFixed(3)), b.features.map(f => f.kind + f.x.toFixed(3)));
  assert.equal(a.biomeKey, BIOMES[w.biome[town.index]].key);
  assert.equal(a.width, 64);
  assert.ok(a.features.length > 5, 'an empty tile');
  assert.ok(a.title.includes(town.name));
  const other = generateLocalDetail(w, town.x + 1, town.y);
  assert.notDeepEqual(Array.from(other.elevation), Array.from(a.elevation), 'neighbouring tiles must differ');
});

test('cellInfo and nearestNode answer with plain readable values', () => {
  const w = world();
  const town = w.nodes.find(n => n.type === 'settlement');
  const info = cellInfo(w, town.x, town.y);
  assert.equal(info.water, 'land');
  assert.ok(typeof info.biomeName === 'string' && info.biomeName.length > 2);
  assert.ok(Number.isFinite(info.temperatureC) && info.temperatureC > -80 && info.temperatureC < 80);
  assert.ok(info.region && info.region.name);
  assert.equal(cellInfo(w, -1, 0), null);
  const near = nearestNode(w, town.x, town.y);
  assert.equal(near.node.id, town.id);
  assert.equal(near.distance, 0);
});

test('history: a few dated events per region, with no leftover placeholders', () => {
  const w = world();
  assert.ok(w.history.length >= w.regions.length, 'not enough history');
  for (const h of w.history) {
    assert.ok(!/\{|\}/.test(h.text), 'unfilled placeholder: ' + h.text);
    assert.ok(h.year > 0 && h.year < w.era.year, 'event in the future: ' + h.year);
    assert.ok(w.regions[h.region], 'event with no region');
  }
  for (const r of w.regions) assert.ok(r.history.length >= 1, `${r.name} has no history`);
  const off = generateWorld({ ...SMALL, seed: 4242, namegen, history: false });
  assert.equal(off.history.length, 0);
});

test('render helpers produce pixels and a legend without a canvas', () => {
  const w = world();
  const px = worldPixels(w, { layer: 'biomes' });
  assert.equal(px.data.length, w.width * w.height * 4);
  const colours = new Set();
  for (let i = 0; i < px.data.length; i += 4) colours.add(`${px.data[i]},${px.data[i + 1]},${px.data[i + 2]}`);
  assert.ok(colours.size > 50, 'the map came out flat');
  for (let i = 3; i < px.data.length; i += 4) assert.equal(px.data[i], 255, 'transparent pixel');
  for (const layer of ['elevation', 'temperature', 'moisture', 'drainage', 'aura', 'magic', 'regions']) {
    assert.equal(worldPixels(w, { layer }).data.length, px.data.length);
    assert.ok(legend(w, layer).length > 0, 'no legend for ' + layer);
  }
  assert.ok(legend(w, 'biomes')[0].label.length > 2);
});

test('the biome table is complete and the classifier only returns real ids', () => {
  BIOMES.forEach((b, i) => {
    assert.equal(b.id, i, 'biome ids must match their position');
    assert.ok(/^#[0-9a-f]{6}$/i.test(b.color), b.key + ' has a bad colour');
    assert.ok(b.tags.length);
  });
  const rng = makeRng(1);
  for (let i = 0; i < 4000; i++) {
    const id = classify({
      elev: rng(), temp: rng(), moist: rng(), slope: rng(), aura: rng() * 2 - 1, magic: rng(),
      water: rng.int(0, 2), depth: rng(), nearOcean: rng() < 0.3, volcanic: rng() < 0.1,
    }, rng());
    assert.ok(BIOMES[id], 'classify returned an unknown biome id: ' + id);
  }
});

test('knob defaults are all present and the world records the knobs it used', () => {
  const w = world();
  for (const key of Object.keys(DEFAULTS)) {
    if (['onProgress', 'namegen', 'raceTable'].includes(key)) continue;
    assert.ok(key in w.opts, 'the saved knobs are missing ' + key);
  }
  assert.equal(w.opts.namegen, undefined, 'the Name Forge instance must not be saved into the world');
});


test('heights: the classic 4200 m scale by default, a world\'s own relief when it carries one', () => {
  // unchanged for World Forge: ±4200 m either side of the shoreline at 0.5
  assert.equal(elevationToMetres(1), 4200);
  assert.equal(elevationToMetres(0.5), 0);
  assert.equal(elevationToMetres(0), -4200);
  assert.equal(elevationToMetres(0.75), Math.round((0.75 - 0.5) * 2 * 4200));
  assert.deepEqual(DEFAULT_RELIEF, { landMetres: 4200, seaMetres: 4200, datum: 'sea', label: 'sea level' });
  assert.ok(Number.isFinite(elevationToMetres(undefined)) && Number.isFinite(elevationToMetres(0.7, {})));

  const w = world();
  let checked = 0;
  for (let y = 0; y < w.height; y += 7) {
    for (let x = 0; x < w.width; x += 7) {
      const info = cellInfo(w, x, y);
      assert.equal(info.elevationMetres, Math.round((w.elevation[y * w.width + x] - 0.5) * 2 * 4200));
      assert.equal(info.heightMetres, info.elevationMetres);
      if (info.water !== 'land') assert.equal(info.depthMetres, Math.max(0, -info.heightMetres));
      checked++;
    }
  }
  assert.ok(checked > 20);

  // a world with its own scale, and one with no sea
  const tall = { ...w, relief: { landMetres: 12000, seaMetres: 3000, datum: 'sea', label: 'sea level' } };
  const i = w.elevation.findIndex(e => e > 0.9);
  const cx = i % w.width, cy = (i / w.width) | 0;
  assert.equal(cellInfo(tall, cx, cy).heightMetres, Math.round((w.elevation[i] - 0.5) * 2 * 12000));
  const dry = { ...w, relief: { landMetres: 9000, seaMetres: 4000, datum: 'datum', label: 'datum' } };
  const j = w.water.findIndex(v => v === 1);
  const info = cellInfo(dry, j % w.width, (j / w.width) | 0);
  assert.ok(info.heightMetres < 0);
  assert.equal(info.depthMetres, 0);
  assert.equal(info.datum, 'datum');
});


// ---------------------------------------------------------------------------- planet knobs

const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const fpArr = a => fnv(Array.from(a).join(','));
const fpNamegen = new NameGen({ languages: read('languages.json'), concepts: read('concepts.json'), patterns: read('patterns.json') });

test('World Forge presets generate exactly as they did before the planet knobs existed', () => {
  // captured from the generator before liquid / frame / inhabited / nameTheme were added
  const BEFORE = {
    'Temperate continents': { seed: 11, ng: false, biome: '47213176', water: '34a4b536', river: '9efdb4ab', nodes: '93a54ae', regions: 'e9ffacea', features: '92980d21', roads: 23, seaLanes: 0, history: 50 },
    'Shattered isles': { seed: 22, ng: false, biome: '8e315190', water: '8208a093', river: '1d686b31', nodes: '4ee74b12', regions: '63ffe1fb', features: '1b6c5aaa', roads: 12, seaLanes: 2, history: 43 },
    'Ashen world': { seed: 33, ng: false, biome: 'd241e935', water: '584860a8', river: 'a168da03', nodes: '877c1e69', regions: '8607db39', features: 'a7b6a663', roads: 19, seaLanes: 2, history: 47 },
    'Frozen north': { seed: 44, ng: true, biome: 'c6a14116', water: 'fac70f1e', river: '36764ede', nodes: 'accdda4c', regions: '55c1db9c', features: '62a1eac2', roads: 24, seaLanes: 0, history: 43 },
  };
  for (const [name, b] of Object.entries(BEFORE)) {
    const w = generateWorld({ ...PRESETS[name], seed: b.seed, width: 128, height: 64, namegen: b.ng ? fpNamegen : null });
    assert.equal(fpArr(w.biome), b.biome, name + ': biomes changed');
    assert.equal(fpArr(w.water), b.water, name + ': water changed');
    assert.equal(fpArr(w.river), b.river, name + ': rivers changed');
    assert.equal(fnv(w.nodes.map(n => n.type + ':' + n.kind + ':' + n.name + ':' + n.index).join('|')), b.nodes, name + ': places changed');
    assert.equal(fnv(w.regions.map(r => r.name).join('|')), b.regions, name + ': region names changed');
    assert.equal(fnv([...w.seas, ...w.lakes, ...w.ranges, ...w.forests, ...w.rivers, ...w.continents].map(f => f.name).join('|')), b.features, name + ': feature names changed');
    assert.equal(w.roads.length, b.roads, name + ': roads');
    assert.equal(w.seaLanes.length, b.seaLanes, name + ': sea lanes');
    assert.equal(w.history.length, b.history, name + ': history');
  }
  assert.equal(DEFAULTS.liquid, 'water');
  assert.equal(DEFAULTS.frame, 'ocean');
  assert.equal(DEFAULTS.inhabited, true);
  assert.equal(DEFAULTS.nameTheme, null);
});

test('liquid "none": no seas, lakes or rivers for any method, at any zoom', () => {
  for (const method of ['plates', 'noise', 'archipelago', 'pangea', 'mixed']) {
    const w = generateWorld({ seed: 404, method, width: 128, height: 64, liquid: 'none', frame: 'land', rainfall: 0.9, riverDensity: 1, lakeAmount: 1 });
    const wet = Array.from(w.water).filter(v => v !== 0).length;
    const rivers = Array.from(w.river).filter(v => v !== 0).length;
    assert.equal(wet, 0, method + ': water cells');
    assert.equal(rivers, 0, method + ': river cells');
    assert.equal(w.rivers.length + w.lakes.length + w.seas.length, 0, method + ': named water');
    for (const id of new Set(w.biome)) assert.ok(!BIOMES[id].tags.includes('water') && ![0, 1, 2, 3, 25].includes(id), method + ': water biome ' + BIOMES[id].key);
    // below 0.5 is still there, just as dry low ground
    assert.ok(Array.from(w.elevation).some(e => e < 0.5), method + ': no low ground at all');
    const region = w.regions.slice().sort((a, b) => b.cells - a.cells)[0];
    const d = generateRegionDetail(w, region.id, { factor: 3 });
    assert.equal(Array.from(d.water).filter(v => v !== 0).length, 0, method + ': region water');
    assert.equal(d.streams.length, 0, method + ': region streams');
    const tile = generateLocalDetail(w, region.label.x, region.label.y, { size: 32 });
    assert.equal(Array.from(tile.water).filter(v => v !== 0).length, 0, method + ': tile water');
  }
});

test('river density 0 means no rivers at all (the seas stay)', () => {
  const w = generateWorld({ seed: 77, width: 128, height: 64, riverDensity: 0, rainfall: 1 });
  assert.equal(w.rivers.length, 0);
  assert.equal(Array.from(w.river).filter(v => v !== 0).length, 0);
  assert.ok(Array.from(w.water).some(v => v === 1), 'the ocean should still be there');
  const withRivers = generateWorld({ seed: 77, width: 128, height: 64, riverDensity: 0.02, rainfall: 1 });
  assert.ok(withRivers.rivers.length > 0, 'a little river density should still make a few rivers');
});

test('inhabited false: landmarks and passes, but no towns, ports, roads, bridges, sea lanes or history', () => {
  const w = generateWorld({ seed: 909, width: 128, height: 64, inhabited: false, seaLanes: true, history: true });
  assert.equal(w.nodes.filter(n => ['settlement', 'port', 'crossing'].includes(n.type)).length, 0);
  assert.equal(w.roads.length, 0);
  assert.equal(w.seaLanes.length, 0);
  assert.equal(w.history.length, 0);
  assert.equal(Array.from(w.roadCells).filter(v => v).length, 0);
  assert.ok(w.nodes.length > 3, 'landmarks, dungeons and passes should remain');
  for (const n of w.nodes) assert.ok(['ruin', 'cave', 'monolith', 'volcano', 'crater', 'vent', 'dungeon', 'pass'].includes(n.kind), n.kind);
  assert.ok(w.regions.every(r => r.seat === null && r.population === 0));
  const region = w.regions.slice().sort((a, b) => b.cells - a.cells)[0];
  const d = generateRegionDetail(w, region.id, { factor: 3 });
  assert.equal(d.paths.length, 0, 'no paths between places nobody goes');
  for (const n of d.nodes.filter(n => n.local)) assert.ok(['cave', 'ruin'].includes(n.kind), n.kind);
});

test('frame: ocean pushes the edge under water, land keeps it as ground, rim raises it', () => {
  const edgeMean = w => {
    let s = 0, n = 0;
    for (let x = 0; x < w.width; x++) { s += w.elevation[x] + w.elevation[(w.height - 1) * w.width + x]; n += 2; }
    for (let y = 0; y < w.height; y++) { s += w.elevation[y * w.width] + w.elevation[y * w.width + w.width - 1]; n += 2; }
    return s / n;
  };
  const base = { seed: 31337, width: 128, height: 64, liquid: 'none' };
  const land = generateWorld({ ...base, frame: 'land' });
  const rim = generateWorld({ ...base, frame: 'rim' });
  const ocean = generateWorld({ seed: 31337, width: 128, height: 64 });
  assert.ok(edgeMean(rim) > edgeMean(land), `rim ${edgeMean(rim).toFixed(3)} vs land ${edgeMean(land).toFixed(3)}`);
  assert.ok(edgeMean(land) > edgeMean(ocean), `land ${edgeMean(land).toFixed(3)} vs ocean ${edgeMean(ocean).toFixed(3)}`);
  const oceanEdgeWater = [...Array(ocean.width).keys()].filter(x => ocean.water[x] !== 0).length / ocean.width;
  assert.ok(oceanEdgeWater > 0.9, 'the classic frame should still be ocean along the top edge');
});

test('the elevation legend is real height bands in metres, with depth only where there is a sea', () => {
  const w = world();
  const rows = legend(w, 'elevation');
  assert.ok(rows.length >= 4);
  const total = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, 'bands should cover every cell');
  assert.ok(new Set(rows.map(r => r.share.toFixed(3))).size > 1, 'shares should be real, not a flat 20%');
  for (const r of rows) {
    assert.match(r.label, / m( deep)?$/);
    assert.ok(r.from < r.to);
    assert.equal(r.depth, r.to <= 0);
    if (r.depth) assert.match(r.label, /deep$/);
  }
  assert.ok(rows.some(r => r.depth) && rows.some(r => !r.depth));
  assert.ok(rows.some(r => r.label === '0–1,050 m' || r.label.startsWith('0–')), rows.map(r => r.label).join(' | '));

  // a dry world with its own scale: no depth bands, negative heights for the basins
  const dry = generateWorld({ seed: 5, width: 128, height: 64, liquid: 'none', frame: 'land' });
  dry.relief = { landMetres: 12000, seaMetres: 5000, datum: 'datum', label: 'datum' };
  const dr = elevationLegend(dry);
  assert.ok(dr.every(r => !r.depth && !/deep/.test(r.label)), dr.map(r => r.label).join(' | '));
  assert.ok(dr.some(r => r.from < 0 && /^−/.test(r.label)), 'basin bands read as negative heights');
  assert.ok(dr.some(r => r.to === 12000), 'the top band reaches the relief\'s own peak height');
});

test('name themes keep water, life and realm words off a dead world', () => {
  assert.equal(forbiddenWordIn('The Silver Fen', 'dead'), 'fen');
  assert.equal(forbiddenWordIn('Silvermere', 'dead'), 'silvermere');
  assert.equal(forbiddenWordIn('The Kingdom of Sotsax', 'dead'), 'kingdom');
  assert.equal(forbiddenWordIn('The Grey Basin', 'dead'), null);
  assert.equal(forbiddenWordIn('the Tralnit Lava Sea', 'lava'), null, 'a lava world may have a molten sea');
  assert.equal(forbiddenWordIn('the Silver Fen', null), null, 'no theme, no filter');
  assert.equal(forbiddenWordIn('Thorn Wood', 'twilight'), null, 'a twilight world may grow things');
  assert.equal(forbiddenWordIn('The Holdfast of Ox', 'twilight'), 'holdfast');

  for (const seed of [3, 17, 58]) {
    for (const namegen of [null, fpNamegen]) {
      const w = generateWorld({ seed, width: 128, height: 64, liquid: 'none', frame: 'land', inhabited: false, nameTheme: 'dead', biomeLock: 'rock', namegen });
      const names = [...w.regions.map(r => r.name), ...w.ranges.map(r => r.name), ...w.continents.map(c => c.name), ...w.nodes.map(n => n.name)];
      assert.ok(names.length > 5);
      for (const n of names) assert.equal(forbiddenWordIn(n, 'dead'), null, `seed ${seed}${namegen ? ' (Name Forge)' : ''}: "${n}"`);
    }
  }
});
