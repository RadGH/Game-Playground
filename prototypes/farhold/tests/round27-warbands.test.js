// node --test prototypes/farhold/tests/round27-warbands.test.js
//
// R27 M9 — warbands hold ground.
//
// Everything runs on REAL worlds (createWorld + makeTerrain + buildZones on the six standard seeds),
// the REAL warband claims (js/warbands.js), the REAL territory record (js/territory.js), the REAL
// enemy field's `spawnNear` (js/actors.js) and the REAL encounter pool (js/encounters.js). The one
// call that would build a mesh (`field.add`) is replaced by a recorder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const { createWorld, makeTerrain } = await import('../js/planet.js');
const { buildZones } = await import('../js/zones.js');
const { bandForPlanet } = await import('../js/rpg.js');
const { EnemyField } = await import('../js/actors.js');
const { installWarbands, createWarbandMap, warbandShare, gripWord, holderLine } = await import('../js/warbands.js');
const { createTerritory } = await import('../js/territory.js');
const { createStandings } = await import('../js/factions.js');
const { createPatrols, createPatrolBodies, routeAlongRoads } = await import('../js/patrols.js');
const { createJobGen, candidatesFrom } = await import('../js/jobgen.js');
const { createEncounters } = await import('../js/encounters.js');
const { createRumours } = await import('../js/rumours.js');
const { familiesOf } = await import('../../../worldgen/js/biomes.js');

const balance = read('../data/balance.json');
const bestiary = read('../data/enemies.json');
const warbandData = read('../data/warbands.json');
const factions = read('../data/factions.json');
const frames = read('../data/job-frames.json');
const encounterData = read('../data/encounters.json');

const SEEDS = [25392, 7, 4477, 101, 1337, 47];
const SCENE = { add() {}, remove() {} };
const HOSTILE = new Set(factions.factions.filter(f => f.hostileAtStart).map(f => f.key));

// ------------------------------------------------------------------------------------ fixtures

const worldCache = new Map();
function realWorld(seed) {
  if (worldCache.has(seed)) return worldCache.get(seed);
  const { planet, world } = createWorld({ seed, width: 256, height: 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const band = bandForPlanet(planet);
  const spawn = terrain.spawnPoint();
  const zones = buildZones(world, {
    spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min, bandWidth: balance.zones?.bandWidth ?? 4,
  });
  const out = { seed, planet, world, terrain, zones };
  worldCache.set(seed, out);
  return out;
}

/** The game's wiring for one world: claims, territory, grip into the claims — as js/main.js does it. */
function wire(w, { cfg = balance.warbands, saved = null, data = warbandData } = {}) {
  const standings = createStandings(factions);
  const calls = [];
  const add = standings.add;
  standings.add = (key, amount, opts) => { calls.push({ key, amount }); return add(key, amount, opts); };
  let territory = null;
  const warbands = createWarbandMap(data, {
    seed: w.seed,
    biomeOf: z => familiesOf(w.terrain.biomeIdAt(z.center.x * w.terrain.metresPerCell, z.center.y * w.terrain.metresPerCell)),
    gripOf: z => territory.warGrip(z),
  });
  territory = createTerritory({
    zones: w.zones, seed: w.seed, factions, standings, metresPerCell: w.terrain.metresPerCell,
    saved, warbandOf: z => warbands.of(z), warbandCfg: cfg,
  });
  return { warbands, territory, standings, calls };
}

function fieldFor(w, warbands) {
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbandData);
  const rpg = { rollRank: () => 'normal', pickModifiers: () => [] };
  const field = new EnemyField({
    scene: SCENE, terrain: w.terrain, rpg, defs, bosses: bestiary.bosses, modifiers: bestiary.modifiers,
    zones: w.zones, balance: { ...balance, seed: w.seed }, warbands,
  });
  field.placed = [];
  field.add = async (def, level, x, z, opts = {}) => {
    const unit = { defId: def.id, name: def.name, role: def.role, warband: def.warband || null, level, x, z, state: 'wander', dying: null, removed: false };
    field.placed.push(unit);
    return unit;
  };
  return field;
}

/** A dry, wild point inside a zone, where the zone's warband has members at its middle level. */
function pointIn(w, field, zone) {
  const cell = w.terrain.metresPerCell, W = w.world.width;
  for (let i = 0; i < w.world.region.length; i++) {
    if (w.world.region[i] !== zone.id) continue;
    const x = ((i % W) + 0.5) * cell, z = (Math.floor(i / W) + 0.5) * cell;
    if (w.terrain.underwater(x, z) || w.zones.at(x, z) !== zone || !field.wild(x, z)) continue;
    const pool = field.defsFor(x, z, zone.midLevel);
    if (pool.some(d => d.warband) && pool.some(d => !d.warband)) return [x, z];
  }
  return null;
}

/** The first held zone on the first world that has a usable point in it. */
function heldSpot() {
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const wired = wire(w);
    const field = fieldFor(w, wired.warbands);
    for (const zone of w.zones.zones) {
      if (!wired.warbands.of(zone)) continue;
      const pt = pointIn(w, field, zone);
      if (pt) return { w, ...wired, field, zone, pt };
    }
  }
  return null;
}

/** Shortest distance from a point to any road polyline, in metres. */
function toRoad(paths, x, z) {
  let best = Infinity;
  for (const p of paths) {
    const pts = p.points;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0] ?? pts[i - 1].x, az = pts[i - 1][1] ?? pts[i - 1].z;
      const bx = pts[i][0] ?? pts[i].x, bz = pts[i][1] ?? pts[i].z;
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
  }
  return best;
}

const settle = () => new Promise(r => setImmediate(r));

// ------------------------------------------------------------------------------------ one holder

test('one holder: every warband-held zone reports that warband as its hostile holder, and no zone has two', () => {
  let held = 0, zonesSeen = 0, wouldHaveClashed = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands, territory } = wire(w);
    // the same world with the rule switched off, to show the rule is doing something
    const blind = createTerritory({ zones: w.zones, seed, factions, metresPerCell: w.terrain.metresPerCell });
    for (const zone of w.zones.zones) {
      zonesSeen++;
      const band = warbands.of(zone);
      const hostiles = territory.hostiles(zone.id);
      assert.ok(hostiles.length <= 1, `seed ${seed} ${zone.name}: ${hostiles.length} hostile holders (${hostiles.map(h => h.id).join(', ')})`);
      const record = territory.of(zone.id);
      if (band) {
        held++;
        assert.deepEqual(hostiles.map(h => h.id), [band.id], `seed ${seed} ${zone.name}: held by ${band.id} but reports ${hostiles.map(h => h.id)}`);
        assert.equal(record.warband, band.id);
        assert.equal(record.warGrip, 1, 'a fresh claim is not at full grip');
        assert.ok(!HOSTILE.has(record.holder) && !HOSTILE.has(record.contested), `seed ${seed} ${zone.name}: a hostile faction still claims warband ground`);
        const before = blind.of(zone.id);
        if (HOSTILE.has(before.holder) || HOSTILE.has(before.contested)) wouldHaveClashed++;
      } else {
        assert.equal(record.warband, null);
      }
    }
  }
  assert.ok(held >= 10, `only ${held} held zones over ${SEEDS.length} worlds (${zonesSeen} zones)`);
  assert.ok(wouldHaveClashed > 0, 'no held zone would ever have had a hostile faction on it too — the rule is untested');
  console.log(`  ${held} held zones; ${wouldHaveClashed} of them would have had a second hostile holder before M9`);
});

test('a deed against a warband moves its rivals by a third (the documented rival share), and adds no standing row', () => {
  const s = heldSpot();
  assert.ok(s, 'no held zone with a usable point on any of the six worlds');
  const record = s.territory.of(s.zone.id);
  const before = s.standings.all();
  s.calls.length = 0;
  s.territory.warbandLoss(s.zone.id, 'patrol');
  const want = -factions.deeds.patrol_killed / 3;
  const rivals = [record.holder, record.contested].filter(Boolean);
  assert.ok(rivals.length >= 1);
  for (const key of rivals) {
    assert.ok(Math.abs(s.standings.get(key) - before[key] - Math.round(want * 10) / 10) < 1e-9, `${key} moved ${s.standings.get(key) - before[key]}, not ${want}`);
  }
  assert.equal(Object.keys(s.standings.all()).length, factions.factions.length, 'a warband grew a standing row');
});

// ------------------------------------------------------------------------------------ grip + share

test('grip: at 0.3 the real spawner puts warband members down 0.65 x 0.3 of the time; at 0, never', async () => {
  const s = heldSpot();
  const { field, zone, pt, territory, warbands } = s;
  // the share is at the zone's own middle level, so the pool (and whether it holds members) is fixed
  field.levelAt = () => zone.midLevel;
  field.cfg = { ...field.cfg, minRadius: 0, radius: 0.01 };
  const run = async n => {
    let own = 0, total = 0;
    for (let i = 0; i < n; i++) {
      field.placed.length = 0;
      await field.spawnNear(pt[0], pt[1], zone.midLevel);
      const lead = field.placed[0];
      if (!lead) continue;
      total++;
      if (lead.warband) own++;
    }
    return { share: own / total, total, own };
  };
  territory.setWarGrip(zone.id, 0.3);
  assert.ok(Math.abs(warbands.share(zone) - warbandShare(warbandData, 0.3)) < 1e-12);
  const at03 = await run(1000);
  const want = (warbandData.spawnShare ?? 0.65) * 0.3;
  assert.ok(at03.total >= 900, `only ${at03.total} spawns`);
  assert.ok(Math.abs(at03.share - want) <= 0.05, `member share ${at03.share.toFixed(3)} at grip 0.3, want ${want.toFixed(3)} ± 0.05`);
  territory.setWarGrip(zone.id, 0);
  const at0 = await run(1000);
  assert.equal(at0.own, 0, `${at0.own} warband members spawned in a zone they were driven out of`);
  assert.equal(warbands.holds(zone), null);
  assert.ok(warbands.of(zone), 'the claim itself vanished at grip 0 — the map could not say "driven out"');
  assert.equal(holderLine(warbands.of(zone), 0).endsWith('driven out'), true);
  console.log(`  grip 0.3: ${at03.own}/${at03.total} = ${at03.share.toFixed(3)} (want ${want.toFixed(3)}); grip 0: ${at0.own}/${at0.total}`);
});

test('grip: encounters poolFor over 500 rolls follows the same share', () => {
  const s = heldSpot();
  const { field, zone, pt, territory } = s;
  territory.setWarGrip(zone.id, 0.3);
  const enc = createEncounters({ field, zones: s.w.zones, terrain: s.w.terrain, balance, data: encounterData });
  let own = 0, n = 0;
  for (let i = 0; i < 500; i++) {
    const pool = enc.poolFor({}, pt[0], pt[1], zone.midLevel);
    if (!pool.length) continue;
    n++;
    if (pool.every(d => d.warband)) own++;
    else assert.ok(pool.every(d => !d.warband), 'a pool mixed the warband and the wildlife');
  }
  const want = (warbandData.spawnShare ?? 0.65) * 0.3;
  assert.ok(Math.abs(own / n - want) <= 0.07, `set-piece warband share ${(own / n).toFixed(3)}, want ${want.toFixed(3)} ± 0.07`);
  territory.setWarGrip(zone.id, 0);
  for (let i = 0; i < 200; i++) assert.ok(enc.poolFor({}, pt[0], pt[1], zone.midLevel).every(d => !d.warband), 'a set piece drew the warband at grip 0');
  console.log(`  poolFor at grip 0.3: ${own}/${n} = ${(own / n).toFixed(3)}`);
});

test('spawnShare is read in exactly one place: warbandShare', () => {
  const dir = join(here, '../js');
  const readers = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (code.startsWith('*') || code.startsWith('/*')) return;
      if (/spawnShare/.test(code)) readers.push(`${f}:${i + 1}: ${code}`);
    });
  }
  assert.equal(readers.length, 1, `spawnShare is read in ${readers.length} places:\n${readers.join('\n')}`);
  assert.match(readers[0], /^warbands\.js:/);
  const src = readFileSync(join(dir, 'warbands.js'), 'utf8');
  const fn = src.slice(src.indexOf('export function warbandShare'), src.indexOf('export function gripWord'));
  assert.ok(fn.includes('spawnShare'), 'the one reader is not inside warbandShare');
});

test('regen: a game day restores exactly gripRegen, and the knob is read (0.037)', () => {
  const w = realWorld(SEEDS[1]);
  for (const regen of [balance.warbands.gripRegen, 0.037]) {
    const { territory, warbands } = wire(w, { cfg: { ...balance.warbands, gripRegen: regen } });
    const zone = w.zones.zones.find(z => warbands.of(z));
    territory.setWarGrip(zone.id, 0.4);
    territory.tick(24);
    assert.ok(Math.abs(territory.warGrip(zone.id) - (0.4 + regen)) < 1e-9, `after a day grip is ${territory.warGrip(zone.id)}, want ${0.4 + regen}`);
    // capped at the seeded claim
    territory.tick(24 * 100);
    assert.equal(territory.warGrip(zone.id), 1);
  }
  assert.equal(gripWord(0), 'driven out');
  assert.equal(gripWord(1), 'firm');
});

test('saves: grip survives a save and load; an old save (no grip) loads at 1 everywhere', () => {
  const w = realWorld(SEEDS[2]);
  const a = wire(w);
  const held = w.zones.zones.filter(z => a.warbands.of(z));
  assert.ok(held.length >= 2);
  a.territory.setWarGrip(held[0].id, 0.2345);
  a.territory.warbandLoss(held[1].id, 'patrol');
  const json = JSON.parse(JSON.stringify(a.territory.toJSON()));
  const b = wire(w, { saved: json });
  assert.equal(b.territory.warGrip(held[0].id), 0.2345);
  assert.ok(Math.abs(b.territory.warGrip(held[1].id) - (1 - balance.warbands.patrolGrip)) < 1e-9);
  assert.ok(Math.abs(b.warbands.share(held[0]) - warbandShare(warbandData, 0.2345)) < 1e-12, 'the loaded grip does not reach the spawner');
  // a save from before round 27: the same rows, minus the field
  const old = JSON.parse(JSON.stringify(json));
  for (const row of Object.values(old.zones)) delete row.warGrip;
  const c = wire(w, { saved: old });
  for (const z of held) assert.equal(c.territory.warGrip(z.id), 1, `${z.name} loaded an old save at ${c.territory.warGrip(z.id)}`);
});

// ------------------------------------------------------------------------------------ map + rumour

test('a rumour about a held zone names its warband, and puts the zone in the rumour book the map reveals from', () => {
  const s = heldSpot();
  const talk = createRumours({ territory: s.territory, factions, seed: s.w.seed });
  let row = null;
  for (let i = 0; i < 60 && !row; i++) {
    const r = talk.hear(s.zone, {});
    if (r?.kind === 'warband_holds') row = r;
  }
  assert.ok(row, 'twelve tries at a held zone and the warband rumour never came up');
  const band = s.warbands.of(s.zone);
  assert.ok(row.text.toLowerCase().includes(band.name.toLowerCase()), row.text);
  assert.equal(row.zoneId, s.zone.id, 'the rumour is filed under another zone, so the map will not reveal this one');
  s.territory.setWarGrip(s.zone.id, 0);
  const talk2 = createRumours({ territory: s.territory, factions, seed: s.w.seed + 1 });
  for (let i = 0; i < 40; i++) assert.notEqual(talk2.hear(s.zone, {})?.kind, 'warband_holds', 'a driven-out warband is still rumoured to hold the zone');
});

// ------------------------------------------------------------------------------------ patrols

/** A held zone with a real road through it, its patrols entered on that road, and the body manager. */
function patrolWorld() {
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const wired = wire(w);
    const field = fieldFor(w, wired.warbands);
    for (const zone of w.zones.zones) {
      if (!wired.warbands.of(zone)) continue;
      const route = routeAlongRoads(w.terrain.roadPaths, (x, z) => w.zones.at(x, z)?.id === zone.id);
      if (route.length < 4) continue;
      const patrols = createPatrols({ territory: wired.territory, factions, standings: wired.standings, seed, warbands: warbandData, sizes: balance.warbands.patrolSize });
      patrols.enter(zone, route);
      const party = patrols.inZone(zone.id).find(p => p.warband && field.wild(p.x, p.z) && !w.terrain.underwater(p.x, p.z));
      if (!party) continue;
      const wiped = [];
      const bodies = createPatrolBodies({ patrols, field: () => field, radius: balance.warbands.patrolSpawnRadius, onWiped: p => wiped.push(p.id) });
      return { w, ...wired, field, zone, route, patrols, party, bodies, wiped };
    }
  }
  return null;
}

test('patrols: walking within 150 m of a war party puts its bodies on the road; wiping it credits once and costs grip', async () => {
  const s = patrolWorld();
  assert.ok(s, 'no held zone with a road on any of the six worlds');
  const { party, bodies, patrols, field, territory, zone } = s;
  const band = s.warbands.of(zone);
  // 200 m off: nothing
  bodies.update(party.x + 200, party.z);
  await settle();
  assert.equal(bodies.live.length, 0, 'bodies at 200 m');
  // 120 m off: the party comes out
  bodies.update(party.x + 120, party.z);
  await settle(); await settle();
  const live = bodies.live.find(r => r.id === party.id);
  assert.ok(live, 'no bodies within 150 m of the clock position');
  assert.equal(live.units.length, party.size, `${live.units.length} bodies for a party of ${party.size}`);
  assert.ok(party.size >= 4 && party.size <= 6, `a party of ${party.size} — want a leader and 3-5`);
  assert.equal(live.units.filter(u => u.role === 'leader').length, 1, 'no leader at the front');
  for (const u of live.units) {
    assert.equal(u.warband, band.id, `${u.defId} is not ${band.id}`);
    const d = toRoad(s.w.terrain.roadPaths, u.x, u.z);
    assert.ok(d <= 30, `${u.defId} stands ${d.toFixed(1)} m off the road`);
    assert.ok(u.encounter, 'a patrol body is not on the set-piece leash');
  }
  // walk 500 m away and back — the field's keepRadius (620 m) keeps them; nothing is doubled
  bodies.update(party.x + 500, party.z); await settle();
  bodies.update(party.x + 60, party.z); await settle(); await settle();
  assert.equal(field.placed.length, party.size, `walking away and back put ${field.placed.length - party.size} extra bodies down`);
  // …and if the leash DID take them, coming back puts the same party down once, not twice
  for (const u of live.units) u.removed = true;
  bodies.update(party.x + 800, party.z); await settle();
  assert.equal(bodies.live.length, 0);
  assert.equal(party.engaged, false);
  bodies.update(party.x + 60, party.z); await settle(); await settle();
  const again = bodies.live.find(r => r.id === party.id);
  assert.ok(again, 'the party did not come back after the leash');
  assert.equal(again.units.length, party.size);
  assert.equal(bodies.live.length, 1, 'two sets of bodies for one party');

  // kill every one of them
  const grip0 = territory.warGrip(zone.id);
  s.calls.length = 0;
  for (const u of again.units) u.dying = 0;
  bodies.update(party.x + 20, party.z); await settle();
  assert.equal(party.alive, true, 'credited while the bodies were still falling');
  for (const u of again.units) u.removed = true;
  for (let i = 0; i < 5; i++) { bodies.update(party.x + 20, party.z); await settle(); }
  assert.equal(party.alive, false);
  assert.deepEqual(s.wiped, [party.id], `wiped ${s.wiped.length} times`);
  assert.equal(patrols.killed(party.id), null, 'a dead patrol could be killed again');
  assert.ok(Math.abs(territory.warGrip(zone.id) - (grip0 - balance.warbands.patrolGrip)) < 1e-9, 'a wiped war party did not cost its warband patrolGrip');
  const rivals = s.calls.filter(c => c.amount > 0);
  assert.ok(rivals.length >= 1 && rivals.length <= 2, `patrol_killed moved ${rivals.length} rivals`);
  assert.equal(patrols.reaction(party), 'attack');
});

test('patrols: a patrol whose clock is inside a town watch puts no bodies down', async () => {
  const s = patrolWorld();
  const p = s.party;
  s.field.safeZones = [{ x: p.x, z: p.z, r: 200 }];
  s.bodies.update(p.x + 10, p.z);
  await settle();
  assert.equal(s.bodies.live.length, 0);
});

// ------------------------------------------------------------------------------------ jobs

test('jobs: over 500 jobs on 6 seeds "Thin their patrols" is offered, and always binds to a live war party of that warband', () => {
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbandData);
  let total = 0, thin = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { territory, warbands, standings } = wire(w);
    const patrols = createPatrols({ territory, factions, standings, seed, warbands: warbandData, sizes: balance.warbands.patrolSize });
    const jobs = createJobGen({ frames, territory, factions, standings, seed });
    const zones = w.zones.zones.filter(z => !z.home);
    for (let pass = 0; pass < 6 && total < 500 * (SEEDS.indexOf(seed) + 1) / SEEDS.length; pass++) {
      for (const zone of zones) {
        const route = routeAlongRoads(w.terrain.roadPaths, (x, z) => w.zones.at(x, z)?.id === zone.id);
        const nodes = (w.world.nodes || []).filter(n => w.zones.at(n.x * w.terrain.metresPerCell, n.y * w.terrain.metresPerCell)?.id === zone.id);
        const stops = route.length >= 2 ? route : nodes.map(n => ({ x: n.x * w.terrain.metresPerCell, z: n.y * w.terrain.metresPerCell, name: n.name }));
        if (stops.length >= 2) patrols.enter(zone, stops);
        const candidates = candidatesFrom({
          zone, territory, bestiary: defs, nodes, patrols: patrols.candidates(zone.id),
          metresPerCell: w.terrain.metresPerCell, level: zone.midLevel,
        });
        for (const job of jobs.offer({ zone, level: zone.midLevel, candidates, want: 5 })) {
          total++;
          if (job.frame !== 'thin_their_patrols') continue;
          thin++;
          const p = patrols.byId(job.bindings.patrol);
          assert.ok(p && p.alive, `${job.title}: bound to ${job.bindings.patrol}, which is not a live patrol`);
          assert.equal(p.warband, warbands.of(zone)?.id, `${job.title} in ${zone.name}: the party is ${p.warband}, the zone is ${warbands.of(zone)?.id}`);
          assert.equal(job.target, p.leaderId, 'the job does not ask for the party leader');
          assert.ok(!/\{|\}/.test(job.title + job.text), `unbound placeholder: ${job.text}`);
        }
      }
    }
  }
  assert.ok(total >= 500, `only ${total} jobs`);
  assert.ok(thin >= 1, `"Thin their patrols" offered ${thin} times in ${total} jobs`);
  console.log(`  ${thin} of ${total} jobs were "Thin their patrols"`);
});

// ------------------------------------------------------------------------------------ the drill

test('a town drill on warband ground draws that warband, and one elsewhere draws none (M1 leftover)', async () => {
  const { createMuster } = await import('../js/muster.js');
  const raids = read('../data/raids.json');
  const colony = read('../data/colony.json');
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbandData);
  const base = { structures: 4, citizens: 6, defences: 2, wealth: 300 };
  const run = heldBy => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const m = createMuster({ data: raids, civics: colony, bestiary: { ...bestiary, enemies: defs } });
      const out = m.start({ placeId: 'p' + i, tier: 'prowlers', base, level: 10, biome: 'any', at: 0, heldBy });
      assert.ok(out.ok, out.why);
      for (const w of out.quest.waves) for (const g of w.groups) {
        const d = defs.find(x => x.id === g.defId);
        if (d?.warband) seen.add(d.warband);
      }
    }
    return seen;
  };
  const held = run('ashtusk');
  assert.deepEqual([...held], ['ashtusk'], `a drill on Ashtusk ground drew ${[...held].join(', ') || 'no warband'}`);
  assert.equal(run(null).size, 0, 'a drill on open ground drew a warband');
});
