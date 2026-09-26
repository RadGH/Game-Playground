// node --test prototypes/farhold/tests/round27-strongholds.test.js
//
// R27 M1 — strongholds pay once, and keep their promises.
//
// Everything here runs on REAL worlds (createWorld + makeTerrain + buildZones), REAL set pieces
// (js/sites.js built from the real data files) and the REAL enemy field (js/actors.js), with only
// the one call that would build a mesh (`field.add`) replaced by a recorder. The payout itself lives
// in js/main.js, which cannot load under node; its guard (`sites.take`) is what is measured here, and
// tests/prisoners.spec.js drives the whole thing in the browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const { createWorld, makeTerrain } = await import('../js/planet.js');
const { buildZones } = await import('../js/zones.js');
const { bandForPlanet } = await import('../js/rpg.js');
const { EnemyField } = await import('../js/actors.js');
const { createSites } = await import('../js/sites.js');
const { installWarbands, createWarbandMap } = await import('../js/warbands.js');
const { createTerritory } = await import('../js/territory.js');
const { createJobGen, candidatesFrom } = await import('../js/jobgen.js');
const { createEncounters } = await import('../js/encounters.js');
const { raidersFor, raidOffer } = await import('../js/raid.js');
const { familiesOf, BIOMES } = await import('../../../worldgen/js/biomes.js');

const balance = read('../data/balance.json');
const bestiary = read('../data/enemies.json');
const warbandData = read('../data/warbands.json');
const factions = read('../data/factions.json');
const frames = read('../data/job-frames.json');
const encounterData = read('../data/encounters.json');
const landmarkData = read('../data/landmarks.json');
const siteData = () => ({
  strongholds: read('../data/strongholds.json'), setpieces: read('../data/setpieces.json'),
  landmarks: read('../data/landmarks.json'), worldbosses: read('../data/worldbosses.json'),
  instances: read('../data/instances.json'),
});

const SEEDS = [25392, 7, 4477, 101, 1337, 47];
const SCENE = { add() {}, remove() {} };

// ------------------------------------------------------------------------------------ fixtures

const worldCache = new Map();
/** A real full-size world with its zones, a warband map, and a field that records what it places. */
function realWorld(seed) {
  if (worldCache.has(seed)) return worldCache.get(seed);
  const { planet, world } = createWorld({ seed, width: 256, height: 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const band = bandForPlanet(planet);
  const spawn = terrain.spawnPoint();
  const zones = buildZones(world, {
    spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min, bandWidth: balance.zones?.bandWidth ?? 4,
  });
  const warbands = createWarbandMap(warbandData, {
    seed,
    biomeOf: z => familiesOf(terrain.biomeIdAt(z.center.x * terrain.metresPerCell, z.center.y * terrain.metresPerCell)),
  });
  const out = { seed, planet, world, terrain, zones, warbands };
  worldCache.set(seed, out);
  return out;
}

/** The real EnemyField over a world, with `add` recording rather than building a body. */
function fieldFor(w, { stubRpg = true } = {}) {
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbandData);
  const rpg = stubRpg
    ? { rollRank: () => 'normal', pickModifiers: (table, n) => (table || []).slice(0, n) }
    : null;
  const field = new EnemyField({
    scene: SCENE, terrain: w.terrain, rpg, defs, bosses: bestiary.bosses, modifiers: bestiary.modifiers,
    zones: w.zones, balance: { ...balance, seed: w.seed }, warbands: w.warbands,
  });
  field.placed = [];
  field.add = async (def, level, x, z, opts = {}) => {
    const unit = {
      defId: def.id, name: def.name, role: def.role, family: def.family, kind: def.kind,
      warband: def.warband || null, level, x, z,
      rank: opts.boss && (opts.rank || 'normal') === 'normal' ? 'boss' : (opts.rank || 'normal'),
      modifiers: (opts.modifiers || []).map(m => m.id), boss: !!opts.boss,
    };
    field.placed.push(unit);
    return unit;
  };
  return field;
}

/** A chest field that only counts. */
function countingChests() {
  const placed = [];
  return { placed, place(kind, x, z, opts = {}) { const c = { kind, x, z, ...opts }; placed.push(c); return c; } };
}

// ------------------------------------------------------------------------------------ pay once

/**
 * THE SCRIPTED TAKE. A stronghold holding prisoners, on a real world, driven through exactly the
 * loop js/main.js runs: `due()` hands it over, `populate` fills it, the boss dies (→ `take`), you walk
 * 500 m away (`relax`) and back (`due`) — three times over.
 */
async function scriptedTake(w, site, sites, field) {
  const chests = countingChests();
  let payouts = 0, bosses = 0, strongboxes = 0, prisonersSeen = 0;
  const paid = { xp: 0, perkPoint: 0, loot: 0 };
  for (let visit = 0; visit < 3; visit++) {
    sites.update(site.x, site.z, true);           // main.js calls this every frame
    const handed = sites.due(site.x, site.z).includes(site);
    if (handed) {
      const before = chests.placed.length;
      const out = await sites.populate(site, { field, chests, level: site.level });
      strongboxes += chests.placed.length - before;
      prisonersSeen += out.prisoners;
      if (out.boss) {
        bosses++;
        // the boss goes down: exactly main.js's `freePrisonersOf` → `sites.take`
        const held = sites.heldBy(out.boss);
        const took = held ? sites.take(held.key) : null;
        if (took) {
          payouts++;
          paid.xp += took.gives.xp || 0;
          paid.perkPoint += took.gives.perkPoint || 0;
          paid.loot += took.gives.loot ? 1 : 0;
        }
      }
    }
    // …walk away past `relax`'s 420 m, and come back
    sites.relax(site.x + 500, site.z);
  }
  return { payouts, bosses, strongboxes, prisonersSeen, paid };
}

test('a prisoner stronghold pays its gives exactly once over three visits, and no boss ever comes back', async () => {
  let tried = 0;
  for (const seed of [7, 101, 4477]) {
    const w = realWorld(seed);
    const sites = createSites(SCENE, w.terrain, { seed, balance, zones: w.zones, data: siteData() });
    const field = fieldFor(w);
    const withPrisoners = sites.sites.filter(s => s.family === 'stronghold' && (s.gives?.prisoners || 0) > 0);
    for (const site of withPrisoners.slice(0, 3)) {
      tried++;
      const r = await scriptedTake(w, site, sites, field);
      assert.equal(r.payouts, 1, `seed ${seed} ${site.type}: paid ${r.payouts} times`);
      assert.equal(r.bosses, 1, `seed ${seed} ${site.type}: a boss stood up ${r.bosses} times`);
      assert.equal(r.paid.xp, site.gives.xp || 0);
      assert.equal(r.paid.perkPoint, site.gives.perkPoint || 0);
      assert.equal(r.paid.loot, site.gives.loot ? 1 : 0);
      assert.ok(r.strongboxes <= 1, `seed ${seed} ${site.type}: ${r.strongboxes} strongboxes`);
      assert.equal(r.prisonersSeen, site.gives.prisoners, `prisoners were refilled: ${r.prisonersSeen}`);
      assert.equal(site.taken, true);
      assert.equal(sites.take(site.key), null, 'a second take paid');
    }
  }
  assert.ok(tried >= 3, `only ${tried} prisoner strongholds across three worlds`);
});

test('every stronghold kind, not only the ones holding people, is taken by its boss', async () => {
  const kinds = new Set();
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const sites = createSites(SCENE, w.terrain, { seed, balance, zones: w.zones, data: siteData() });
    const field = fieldFor(w);
    for (const site of sites.sites.filter(s => s.family === 'stronghold' && s.kind !== 'lair')) {
      if (kinds.has(site.type)) continue;
      const r = await scriptedTake(w, site, sites, field);
      if (!r.bosses) continue;          // nothing on this ground at this level to be its boss
      assert.equal(r.payouts, 1, `seed ${seed} ${site.type}: paid ${r.payouts} times`);
      kinds.add(site.type);
    }
  }
  console.log(`[R27 M1] stronghold kinds taken once each: ${[...kinds].join(', ')}`);
  assert.ok(kinds.size >= 5, `only ${[...kinds].join(', ')} were taken`);
});

test('gives.clears is read: off, bodies come back to a taken place but never a boss, prisoners or a strongbox', async () => {
  const data = siteData();
  for (const k of data.strongholds.kinds) k.gives.clears = false;     // the dead-data probe
  const w = realWorld(7);
  const sites = createSites(SCENE, w.terrain, { seed: 7, balance, zones: w.zones, data });
  const field = fieldFor(w);
  const site = sites.sites.find(s => s.family === 'stronghold' && (s.gives?.prisoners || 0) > 0);
  assert.ok(site, 'no prisoner stronghold on seed 7');
  const r = await scriptedTake(w, site, sites, field);
  assert.equal(r.payouts, 1);
  assert.equal(site.cleared, false, 'clears:false still cleared the site');
  // it comes back, and what comes back is a garrison with nobody in charge
  sites.relax(site.x + 500, site.z);
  sites.update(site.x, site.z, true);
  assert.ok(sites.due(site.x, site.z).includes(site), 'a clears:false site never refilled');
  const chests = countingChests();
  const again = await sites.populate(site, { field, chests, level: site.level });
  assert.equal(again.boss, null);
  assert.equal(again.prisoners, 0);
  assert.equal(chests.placed.length, 0);
  assert.ok(again.garrison.length > 0, 'nothing came back at all');

  // and ON (the shipped data): a taken site is cleared through the existing `sites.clear()`
  const shipped = createSites(SCENE, w.terrain, { seed: 7, balance, zones: w.zones, data: siteData() });
  const s2 = shipped.sites.find(s => s.key === site.key);
  await scriptedTake(w, s2, shipped, fieldFor(w));
  assert.equal(s2.cleared, true);
  shipped.relax(s2.x + 500, s2.z);
  shipped.update(s2.x, s2.z, true);
  assert.ok(!shipped.due(s2.x, s2.z).includes(s2), 'a cleared site was handed back');
});

// ------------------------------------------------------------------------------------ the stair

test('opensDungeon files a real mouth within 40 m of the keep, and its boss is the family it names', async () => {
  let stairs = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const sites = createSites(SCENE, w.terrain, { seed, balance, zones: w.zones, data: siteData() });
    for (const site of sites.sites.filter(s => s.family === 'stronghold' && s.gives?.opensDungeon)) {
      assert.equal(sites.mouths().filter(m => m.siteKey === site.key && m.stair).length, 0, 'a stair before the take');
      const took = sites.take(site.key);
      assert.ok(took?.stair, `seed ${seed}: ${site.name} opened no stair`);
      const mouth = sites.mouths().find(m => m.siteKey === site.key && m.stair);
      assert.ok(mouth, 'the stair is not among the mouths the gates are built from');
      const d = Math.hypot(mouth.x - site.x, mouth.z - site.z);
      assert.ok(d <= 40, `seed ${seed}: the stair is ${d.toFixed(1)} m from the keep`);
      assert.ok(!w.terrain.underwater(mouth.x, mouth.z), 'the stair is under water');
      assert.ok(mouth.instance?.interior, 'the stair has no interior to open');
      // the boss the interact would put in the far room (main.js `enterDungeon` → `bossForHolds`)
      const want = mouth.instance.holds?.boss;
      if (want?.family) {
        const field = fieldFor(w);
        for (const level of [site.level, 1, 25, 40, 50]) {
          const { def } = field.bossForHolds(want, level, mouth.x, mouth.z);
          assert.equal(def?.family, want.family, `seed ${seed} level ${level}: a ${def?.family} keeps a ${want.family} stair`);
        }
      }
      // a reload: the ledger says taken, and the stair is back where it was
      const again = createSites(SCENE, w.terrain, { seed, balance, zones: w.zones, data: siteData(), taken: [site.key] });
      const back = again.mouths().find(m => m.siteKey === site.key && m.stair);
      assert.ok(back && Math.hypot(back.x - mouth.x, back.z - mouth.z) < 0.01, 'a reload moved or lost the stair');
      stairs++;
    }
  }
  console.log(`[R27 M1] ${stairs} stairs opened across six worlds`);
  assert.ok(stairs >= 2, `only ${stairs} stairs across six worlds`);
});

test('every instance with holds.boss.family is kept by that family at every level', () => {
  const w = realWorld(7);
  const field = fieldFor(w);
  const pt = w.terrain.spawnPoint();
  for (const inst of read('../data/instances.json').instances) {
    const want = inst.holds?.boss;
    if (!want) continue;
    for (let level = 1; level <= 50; level += 7) {
      const { def, rank } = field.bossForHolds(want, level, pt.x, pt.z);
      assert.ok(def, `${inst.id} level ${level}: nobody keeps it`);
      if (want.id) assert.equal(def.id, want.id, `${inst.id}: named ${want.id}, got ${def.id}`);
      else if (want.family) assert.equal(def.family, want.family, `${inst.id} level ${level}`);
      assert.ok(['normal', 'champion', 'rare'].includes(rank));
    }
  }
});

test('placeBoss carries the rank and modifiers it is handed through add, once', async () => {
  const w = realWorld(7);
  const field = fieldFor(w);
  const pt = w.terrain.spawnPoint();
  const unit = await field.placeBoss(bestiary.bosses[0], 20, pt.x, pt.z, { modifiers: 3 });
  assert.equal(unit.rank, 'boss');
  assert.equal(unit.modifiers.length, 3);
  const standIn = await field.placeBoss(bestiary.enemies[0], 20, pt.x, pt.z, { rank: 'champion', modifiers: 1 });
  assert.equal(standIn.rank, 'champion');
  assert.equal(standIn.boss, true);
});

// ------------------------------------------------------------------------------------ saves

test('a save carries the taken strongholds; an old save loads every site untaken', async () => {
  const { snapshot } = await import('../js/save.js');
  const w = realWorld(101);
  const sites = createSites(SCENE, w.terrain, { seed: 101, balance, zones: w.zones, data: siteData() });
  const castle = sites.sites.find(s => s.family === 'stronghold');
  sites.take(castle.key);
  const ledger = { '101:3': sites.takenKeys() };
  const snap = snapshot({
    id: 's', name: 'n', seed: 101, classId: 'ranger', control: { x: 0, z: 0, yaw: 0, pitch: 0 },
    player: { level: 1, attrs: {}, equipment: {}, bag: [] }, strongholds: ledger,
  });
  const back = JSON.parse(JSON.stringify(snap));
  assert.deepEqual(back.strongholds, ledger);
  const reloaded = createSites(SCENE, w.terrain, { seed: 101, balance, zones: w.zones, data: siteData(), taken: back.strongholds['101:3'] });
  assert.equal(reloaded.sites.find(s => s.key === castle.key).taken, true);
  assert.equal(reloaded.take(castle.key), null, 'a reloaded taken site paid again');
  // an old save: no `strongholds` at all
  const old = snapshot({ id: 's', name: 'n', seed: 101, classId: 'ranger', control: { x: 0, z: 0 }, player: { level: 1, attrs: {} } });
  assert.deepEqual(old.strongholds, {});
  const fresh = createSites(SCENE, w.terrain, { seed: 101, balance, zones: w.zones, data: siteData(), taken: old.strongholds['101:3'] || null });
  assert.equal(fresh.sites.filter(s => s.taken).length, 0);
});

// ------------------------------------------------------------------------------------ landmarks

/** The whole of a function in main.js, by counting braces from its opening one. */
function bodyOf(text, name) {
  const at = text.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} has moved or been renamed`);
  let depth = 0;
  for (let i = text.indexOf('{', at); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  throw new Error(`${name} never closes`);
}
const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('creditKill pays no set piece: across six worlds a cleared camp near a landmark pays nothing', () => {
  const MAIN = src('../js/main.js');
  const body = codeOnly(bodyOf(MAIN, 'creditKill'));
  // what it may still do: count deeds and clear the territory record
  assert.ok(/holdings\.clearSite/.test(body), 'creditKill no longer clears the territory record');
  // what it may not: reach for a js/sites.js site, or pay anybody's gives
  assert.ok(!/sites\.nearest|\bsites\./.test(body), 'creditKill reaches into js/sites.js again');
  assert.ok(!/gives|bonusPerks|gainXp|chests\.place/.test(body), 'creditKill pays something again');

  // …and the join it used to make was real: this many territory camps sit within 40 m of a
  // landmark set piece, each of which paid that landmark's gives on every clear.
  let exposed = 0, camps = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const sites = createSites(SCENE, w.terrain, { seed, balance, zones: w.zones, data: siteData() });
    const land = createTerritory({ zones: w.zones, seed, factions, metresPerCell: w.terrain.metresPerCell });
    const marks = sites.sites.filter(s => s.family === 'landmark');
    for (const zone of w.zones.zones) {
      for (const camp of land.sitesIn(zone.id, { hostileOnly: true })) {
        camps++;
        if (marks.some(m => Math.hypot(m.x - camp.x, m.z - camp.z) < 40)) exposed++;
      }
    }
  }
  assert.ok(camps > 50, `only ${camps} territory camps across six worlds`);
  // not asserted either way — a number for the report. Printed so a reader can see the scale.
  console.log(`[R27 M1] ${camps} territory camps over six worlds; ${exposed} within 40 m of a landmark (the old cross-payment)`);
});

// ------------------------------------------------------------------------------------ bossFor

test('bossFor returns a boss for every level 1-50 in every biome, near its band', () => {
  const w = realWorld(7);
  const biomeIds = Object.keys(BIOMES).map(k => BIOMES[k].id ?? k);
  for (const id of biomeIds) {
    const field = new EnemyField({
      scene: SCENE, terrain: { ...w.terrain, biomeIdAt: () => id, clampToWorld: (x, z) => [x, z] },
      rpg: {}, defs: bestiary.enemies, bosses: bestiary.bosses, balance: { ...balance, seed: 1 },
    });
    for (let level = 1; level <= 50; level++) {
      const b = field.bossFor(level, 0, 0);
      assert.ok(b, `biome ${id} level ${level}: no boss`);
      // nothing nearer the level exists (biome-fitting first)
      const gap = d => Math.max(0, (d.minLevel ?? 1) - level, level - (d.maxLevel ?? 99));
      const fams = familiesOf(id);
      const fits = bestiary.bosses.filter(d => (d.biomes || ['any']).includes('any') || d.biomes.some(f => fams.includes(f)));
      const best = Math.min(...(fits.length ? fits : bestiary.bosses).map(gap));
      assert.equal(gap(b), best, `biome ${id} level ${level}: ${b.id} is ${gap(b)} levels off, ${best} was possible`);
    }
  }
});

test('main.js has no bosses[0] / enemies[0] boss fallback left', () => {
  const MAIN = codeOnly(src('../js/main.js'));
  assert.ok(!/bosses\s*\|\|\s*\[\]\)\s*\[0\]/.test(MAIN), 'a bosses[0] fallback is back');
  assert.ok(!/bossFor[^\n;]*\|\|\s*\(?bestiary\.(enemies|bosses)/.test(MAIN), 'a bossFor(...) || bestiary fallback is back');
});

// ------------------------------------------------------------------------------------ jobs

test('500 real boards over six worlds offer "a beast has moved in"', () => {
  let offered = 0, jobs = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const land = createTerritory({ zones: w.zones, seed, factions, metresPerCell: w.terrain.metresPerCell, landmarks: landmarkData });
    const gen = createJobGen({ frames, territory: land, factions, seed });
    const defs = bestiary.enemies.slice();
    installWarbands({ enemies: defs }, warbandData);
    for (const zone of w.zones.zones) {
      if (jobs >= 500 * (SEEDS.indexOf(seed) + 1) / SEEDS.length) break;
      const held = w.warbands.of(zone)?.id || null;
      const level = zone.midLevel ?? zone.minLevel ?? 1;
      const candidates = candidatesFrom({
        zone, territory: land, bestiary: defs.filter(d => !d.warband || d.warband === held),
        nodes: w.world.nodes || [], metresPerCell: w.terrain.metresPerCell, level,
        landmarks: land.landmarksIn?.(zone.id) || [],
      });
      for (const job of gen.offer({ zone, level, candidates, want: 5 })) {
        jobs++;
        if (job.frame === 'beast_moved_in') offered++;
      }
    }
  }
  console.log(`[R27 M1] beast_moved_in offered ${offered} times in ${jobs} jobs`);
  assert.ok(jobs >= 300, `only ${jobs} jobs generated`);
  assert.ok(offered >= 1, `beast_moved_in offered ${offered} times in ${jobs} jobs`);
});

test('a live champion on the field binds before a def that merely could roll one', () => {
  const zone = { id: 1, name: 'Z', minLevel: 5, maxLevel: 9, band: 1, center: { x: 1, y: 1 } };
  const c = candidatesFrom({
    zone, bestiary: [{ id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 8, kind: 'beast' }],
    live: [{ defId: 'fen_croaker', baseName: 'Fen Croaker', name: 'Vicious Fen Croaker', rank: 'champion', kind: 'beast', x: 3, z: 4 }],
    level: 6,
  }).filter(x => x.type === 'enemy');
  assert.equal(c[0].id, 'fen_croaker');
  assert.equal(c[0].rank, 'champion');
  assert.equal(c[1].rank, 'champion', 'an ordinary beast def cannot roll champion here');
});

// ------------------------------------------------------------------------------------ encounters

test('a warband encounter in a held zone is led by a real leader in at least 95% of rolls', async () => {
  let rolls = 0, led = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const field = fieldFor(w);
    const enc = createEncounters({ field, zones: w.zones, terrain: w.terrain, balance, data: encounterData });
    const spec = { ...encounterData.encounters.find(e => e.id === 'warband'), where: 'close' };
    const W = w.world.width;
    for (const zone of w.zones.zones) {
      if (rolls >= 200) break;
      if (!w.warbands.of(zone)) continue;
      // a dry point inside the zone
      let pt = null;
      for (let i = 0; i < w.world.region.length && !pt; i += 3) {
        if (w.world.region[i] !== zone.id) continue;
        const x = ((i % W) + 0.5) * w.terrain.metresPerCell, z = (Math.floor(i / W) + 0.5) * w.terrain.metresPerCell;
        if (!w.terrain.underwater(x, z)) pt = { x, z };
      }
      if (!pt) continue;
      for (let k = 0; k < 12 && rolls < 200; k++) {
        field.placed.length = 0;
        const rec = await enc.run(spec, { ...pt, yaw: 0 }, zone.midLevel);
        if (!rec) continue;
        if (!w.warbands.of(w.zones.at(rec.x, rec.z))) continue;     // the spot fell over a border
        rolls++;
        if (rec.units[0]?.role === 'leader') led++;
      }
    }
  }
  console.log(`[R27 M1] warband encounters in held zones led by a leader: ${led} of ${rolls}`);
  assert.ok(rolls >= 100, `only ${rolls} warband encounters rolled in held zones`);
  assert.ok(led / rolls >= 0.95, `led by a leader in ${led} of ${rolls}`);
});

// ------------------------------------------------------------------------------------ raids

test('raidersFor: no warband member raids an unheld zone; a held zone gets only its own', () => {
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbandData);
  const ids = [...new Set(defs.filter(d => d.warband).map(d => d.warband))];
  for (const level of [3, 12, 22, 34, 45]) {
    const none = raidersFor({ enemies: defs, biome: 'grass', level });
    assert.equal(none.filter(d => d.warband).length, 0, `level ${level}: warband members raid an unheld zone`);
    for (const band of ids) {
      const pool = raidersFor({ enemies: defs, biome: 'grass', level, heldBy: band });
      assert.ok(pool.every(d => !d.warband || d.warband === band), `level ${level}: another warband raids ${band}'s ground`);
    }
  }
  // and the plumbing through the offer
  const offer = raidOffer({ base: { structures: 40, defences: 12, notoriety: 999 }, level: 20, biome: 'grass', enemies: defs, rng: () => 0.5, heldBy: null });
  if (offer?.ok) {
    const all = offer.waves.flatMap(wv => wv.groups || []).map(g => g.id || g.defId);
    assert.ok(!all.some(id => defs.find(d => d.id === id)?.warband), 'a warband member is in an unheld raid');
  }
});
