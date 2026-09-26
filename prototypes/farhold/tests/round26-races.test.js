// Farhold R26 — races. The four playable body presets (js/bodypresets.js) and the five enemy
// warbands (js/warbands.js + data/warbands.json).
//
// The warband half is held to the round rule: a finished module must be REACHABLE. So besides the
// data checks, the last two tests build real worlds with the real zone generator and run the real
// `EnemyField.spawnNear` — a warband is only done if its members actually come out of the spawner,
// inside the zones it holds and nowhere else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const { PLAYABLE_RACES, applyBodyPreset, presetOf } = await import('../js/bodypresets.js');
const { installWarbands, createWarbandMap, warbandDefs } = await import('../js/warbands.js');
const { CHIBI2_RACES, CHIBI2_RACE_IDS, raceOf, roundOf } = await import('../../../avatar-3d/js/chibi2-races.js');
const { normalizeAvatar } = await import('../../../avatar-2d/js/render.js');
const { createWorld, makeTerrain } = await import('../js/planet.js');
const { buildZones } = await import('../js/zones.js');
const { bandForPlanet } = await import('../js/rpg.js');
const { EnemyField } = await import('../js/actors.js');
const { familiesOf } = await import('../../../worldgen/js/biomes.js');

const balance = read('../data/balance.json');
const warbands = read('../data/warbands.json');
const items = read('../../emberveil/data/items.json');
const bestiary = read('../data/enemies.json');

// ------------------------------------------------------------------------------------ presets

test('the four body presets are human, elf, dwarf and halfling, and each is a Chibi 2 race', () => {
  assert.deepEqual(PLAYABLE_RACES, ['human', 'elf', 'dwarf', 'halfling']);
  for (const id of PLAYABLE_RACES) assert.ok(CHIBI2_RACES[id], `${id} is not a Chibi 2 race`);
});

test('a preset stamps the race and moves the body to where that race sits, and keeps the face', () => {
  const start = normalizeAvatar({
    body: { skin: '#ffdbb4', height: 0.5, width: 0.5, headSize: 0.5 },
    eyes: { id: 'wink', color: '#123456' }, hair: { id: 'afro', color: '#aa0000' },
    facialHair: { id: 'goatee' }, ears: { id: 'normal' },
  });
  for (const id of PLAYABLE_RACES) {
    const r = CHIBI2_RACES[id];
    const out = applyBodyPreset(start, id);
    assert.equal(out.body.race, id);
    assert.equal(presetOf(out), id);
    for (const k of ['height', 'width', 'headSize']) {
      const [lo, hi] = r.ranges[k];
      assert.ok(out.body[k] >= lo && out.body[k] <= hi, `${id} ${k} ${out.body[k]} is outside ${lo}-${hi}`);
    }
    assert.equal(roundOf(out), r.body.round, `${id} roundness`);
    assert.ok(r.skin.map(s => s.toLowerCase()).includes(out.body.skin.toLowerCase()), `${id} skin is not a ${id} skin`);
    // the face you built is still yours
    assert.equal(out.eyes.id, 'wink');
    assert.equal(out.eyes.color, '#123456');
    assert.equal(out.hair.id, 'afro');
    // and it survives the shared normaliser every body in Farhold goes through
    const n = normalizeAvatar(out);
    assert.equal(n.body.race, id, `${id} lost its race in normalizeAvatar`);
    assert.equal(raceOf(n).name, r.name);
  }
  assert.equal(start.body.race, undefined, 'the preset changed the avatar it was handed');
  // an elf is a tall slim body, a dwarf a short broad round one
  const elf = applyBodyPreset(start, 'elf'), dwarf = applyBodyPreset(start, 'dwarf');
  assert.ok(elf.body.height > dwarf.body.height && dwarf.body.width > elf.body.width && dwarf.body.round > elf.body.round);
  // the swaps only touch what the race almost never has
  assert.equal(elf.ears.id, 'pointed', 'an elf keeps round ears');
  assert.equal(elf.facialHair.id, 'none', 'an elf keeps a goatee it has a 1-in-31 chance of');
  assert.notEqual(applyBodyPreset({ ...start, facialHair: { id: 'none' } }, 'dwarf').facialHair.id, 'none', 'a dwarf preset with no beard');
  assert.equal(applyBodyPreset(start, 'human').facialHair.id, 'goatee', 'a human lost a beard humans do have');
});

// ------------------------------------------------------------------------------------ warbands

test('every race a player cannot be is an enemy warband, with melee, rogue, ranged, caster and leader', () => {
  const enemyRaces = CHIBI2_RACE_IDS.filter(r => !PLAYABLE_RACES.includes(r));
  assert.deepEqual(warbands.warbands.map(b => b.race).sort(), [...enemyRaces].sort());
  // R27 M10 — and a sixth: the standard-bearer, a brute that carries the colours
  const roleFor = { melee: 'brute', rogue: 'skirmisher', ranged: 'archer', caster: 'caster', leader: 'leader', bearer: 'brute' };
  for (const band of warbands.warbands) {
    const types = band.defs.map(d => d.type).sort();
    assert.deepEqual(types, Object.keys(roleFor).sort(), `${band.id} is missing a job`);
    for (const d of band.defs) {
      assert.equal(d.role, roleFor[d.type], `${d.id} runs the wrong AI for a ${d.type}`);
      assert.equal(d.kind, 'humanoid');
      assert.equal(d.look.avatar.body.race, band.race, `${d.id} is not drawn as a ${band.race}`);
      if (d.type === 'ranged' || d.type === 'caster') assert.ok(d.ranged?.range > 0, `${d.id} has nothing to shoot`);
      if (d.type === 'caster') assert.notEqual(d.ranged.element, 'physical', `${d.id} casts plain arrows`);
      if (d.type === 'rogue') assert.ok(d.speed > band.defs.find(x => x.type === 'melee').speed, `${d.id} is not quicker than the brute`);
      for (const id of d.leads || []) assert.ok(band.defs.some(x => x.id === id), `${d.id} leads ${id}, which is not in ${band.id}`);
      assert.ok(d.minLevel >= band.levels[0] && d.maxLevel <= band.levels[1], `${d.id} lives outside its warband's levels`);
    }
  }
});

test('R27 M10 — six members and a warlord per warband; leaders, bearers and warlords wear the round-26 class helms', async () => {
  const { CLASS_HATS } = await import('../../../avatar-3d/js/chibi2-hats.js');
  const partsSrc = readFileSync(join(here, '../../../avatar-2d/js/parts/chibi2-parts.js'), 'utf8');
  const helms = new Set(CLASS_HATS);
  for (const band of warbands.warbands) {
    assert.equal(band.defs.length, 6, `${band.id} has ${band.defs.length} members`);
    const bearer = band.defs.find(d => d.type === 'bearer');
    const leader = band.defs.find(d => d.type === 'leader');
    const warlord = warbands.warlords.find(w => w.id === band.warlord);
    assert.ok(bearer && bearer.banner === band.colour, `${band.id}'s bearer carries no colours`);
    assert.equal(leader.bearer, bearer.id, `${band.id}'s leader has no standard-bearer`);
    assert.ok(warlord, `${band.id} has no warlord`);
    for (const d of [leader, bearer, warlord]) {
      const hat = d.look.avatar.hat?.id;
      assert.ok(helms.has(hat), `${d.id} wears ${hat}, not a class helm`);
      // a hat id the shared 2D registry does not know is dropped by the normaliser
      assert.ok(new RegExp(`\\b${hat}\\b`).test(partsSrc) || ['great_helm', 'plate_helm'].includes(hat), `${hat} is not in chibi2-parts.js`);
      assert.equal(normalizeAvatar(d.look.avatar).hat?.id, hat, `${d.id}'s ${hat} did not survive the normaliser`);
    }
  }
  // the four the plan names are all in use, and the Packlord has a hat at last
  const worn = new Set([...warbands.warbands.flatMap(b => b.defs), ...warbands.warlords].map(d => d.look.avatar.hat?.id));
  for (const h of ['war_helm', 'bone_headdress', 'wolf_helm', 'rune_helm']) assert.ok(worn.has(h), `nobody wears ${h}`);
  assert.ok(warbands.warbands.find(b => b.id === 'thornmane').defs.find(d => d.id === 'thornmane_packlord').look.avatar.hat?.id);
});

test('every warband look survives the shared normaliser whole: race, and every part id', () => {
  for (const d of [...warbandDefs(warbands), ...(warbands.warlords || [])]) {   // R27 M10: the warlords too
    const a = d.look.avatar;
    const n = normalizeAvatar(a);
    assert.equal(n.body.race, a.body.race, `${d.id} lost its race`);
    for (const [slot, v] of Object.entries(a)) {
      if (slot === 'body' || !v?.id) continue;
      assert.equal(n[slot]?.id, v.id, `${d.id}: ${slot} '${v.id}' is not a registered part and was thrown away`);
    }
    if (a.headShape) assert.equal(n.headShape, a.headShape);
  }
});

test('every warband drop base is an item that exists, and every id is new to the bestiary', () => {
  const bases = new Set([...Object.keys(items.weaponBases), ...Object.keys(items.armorBases)]);
  const old = new Set(bestiary.enemies.map(e => e.id));
  for (const d of warbandDefs(warbands)) {
    assert.ok(!old.has(d.id), `${d.id} is already in enemies.json`);
    for (const b of d.dropBases) assert.ok(bases.has(b), `${d.id} drops '${b}', which is not an item`);
  }
  const copy = { enemies: bestiary.enemies.slice() };
  // R27 M10 — six members per warband now (the standard-bearer), and the five warlords into `bosses`
  assert.equal(installWarbands(copy, warbands), 35);
  assert.equal(copy.bosses.length, 5);
  assert.equal(installWarbands(copy, warbands), 0, 'installing twice doubled the bestiary');
  assert.ok(copy.enemies.find(e => e.id === 'ashtusk_brute').warband === 'ashtusk');
});

/** A real world, its real zones, and a field that records what it would have put down. */
function realWorld(seed) {
  const { planet, world } = createWorld({ seed, habitable: true, width: 96, height: 48 });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const band = bandForPlanet(planet);
  const spawn = terrain.spawnPoint();
  const zones = buildZones(world, {
    spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min, bandWidth: balance.zones?.bandWidth ?? 4,
  });
  const map = createWarbandMap(warbands, {
    seed,
    biomeOf: z => familiesOf(terrain.biomeIdAt(z.center.x * terrain.metresPerCell, z.center.y * terrain.metresPerCell)),
  });
  const defs = bestiary.enemies.slice();
  installWarbands({ enemies: defs }, warbands);
  const rpg = { rollRank: () => 'normal', pickModifiers: () => [] };
  const field = new EnemyField({ scene: { add() {} }, terrain, rpg, defs, zones, balance: { ...balance, seed }, warbands: map });
  const placed = [];
  field.add = async (def, level, x, z) => { placed.push({ def, level, x, z }); return { name: def.name }; };
  return { world, terrain, zones, map, field, placed, spawn };
}

/** A land point inside a zone: the cells of its region, sampled until one is dry and wild. */
function pointIn(r, zone) {
  const cell = r.terrain.metresPerCell;
  const W = r.world.width;
  for (let i = 0; i < r.world.region.length; i++) {
    if (r.world.region[i] !== zone.id) continue;
    const x = ((i % W) + 0.5) * cell, z = (Math.floor(i / W) + 0.5) * cell;
    if (!r.terrain.underwater(x, z) && r.zones.at(x, z) === zone) return [x, z];
  }
  return null;
}

test('real zone generation: warbands hold zones, never the starting one, at levels they belong at', () => {
  let held = 0;
  const seen = new Set();
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const r = realWorld(seed);
    for (const zone of r.zones.zones) {
      const band = r.map.of(zone);
      if (!band) continue;
      held++;
      seen.add(band.id);
      assert.ok(!zone.home, `seed ${seed}: ${band.id} holds the starting zone`);
      assert.ok(zone.midLevel >= band.levels[0] && zone.midLevel <= band.levels[1], `seed ${seed}: ${band.id} holds a level-${zone.midLevel} zone`);
    }
    // same seed, same claims
    const again = realWorld(seed);
    assert.deepEqual(again.zones.zones.map(z => again.map.of(z)?.id || null), r.zones.zones.map(z => r.map.of(z)?.id || null));
  }
  assert.ok(held >= 6, `only ${held} zones held across six worlds`);
  assert.ok(seen.size >= 4, `only ${[...seen].join(', ')} ever held ground across six worlds`);
});

test('real spawner: inside a held zone the warband comes out of spawnNear; outside, never', async () => {
  let inside = 0, own = 0, outsideWarband = 0, outside = 0;
  const races = new Set();
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const r = realWorld(seed);
    for (const zone of r.zones.zones) {
      const pt = pointIn(r, zone);
      if (!pt) continue;
      const band = r.map.of(zone);
      // spawnNear puts things 34-115 m out; with the spawn ring shrunk to zero the point IS the spot
      r.field.cfg = { ...r.field.cfg, minRadius: 0, radius: 0.01 };
      for (let i = 0; i < 12; i++) {
        r.placed.length = 0;
        await r.field.spawnNear(pt[0], pt[1], 1);
        const lead = r.placed[0];
        if (!lead) continue;
        if (band) {
          inside++;
          if (lead.def.warband === band.id) { own++; races.add(lead.def.look.avatar.body.race); }
          for (const p of r.placed) if (p.def.warband) assert.equal(p.def.warband, band.id, `${p.def.id} spawned in ${band.id} ground`);
        } else {
          outside++;
          for (const p of r.placed) if (p.def.warband) outsideWarband++;
        }
      }
    }
  }
  assert.ok(inside > 20, `only ${inside} spawns landed in held zones`);
  assert.equal(outsideWarband, 0, 'a warband member spawned in a zone its warband does not hold');
  assert.ok(outside > 20, 'no spawns outside held zones to compare against');
  // spawnShare is 0.65 — allow a wide margin, the point is "most of what you meet"
  assert.ok(own / inside > 0.4, `the warband was only ${Math.round(own / inside * 100)}% of spawns in its own zones`);
  assert.ok(races.size >= 3, `only ${[...races].join(', ')} bodies came out of the spawner`);
});
