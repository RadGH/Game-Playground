// node --test prototypes/farhold/tests/round27-warcamps.test.js
//
// R27 M10 — war camps, warlords and leaders that lead.
//
// Everything here runs on REAL worlds (createWorld + makeTerrain + buildZones over the six standard
// seeds), REAL set pieces (js/sites.js from the real data files), the REAL enemy field (js/actors.js)
// with only the mesh-building half of `add` replaced — the unit itself is the real `rpg.makeEnemy`
// body, so its damage, phases and spawns are the game's — the REAL territory grip (js/territory.js),
// the REAL job generator and the REAL chest field. main.js cannot load under node; the two lines of
// it this milestone adds (warDeath → take → pay, grip drops) are replayed here in the same order and
// tests/round27-warcamps.spec.js drives them in the browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const { createWorld, makeTerrain } = await import('../js/planet.js');
const { buildZones } = await import('../js/zones.js');
const { Rpg, bandForPlanet } = await import('../js/rpg.js');
const { EnemyField } = await import('../js/actors.js');
const { createSites } = await import('../js/sites.js');
const { createChests } = await import('../js/chests.js');
const { installWarbands, createWarbandMap, fitsRoom, warbandById } = await import('../js/warbands.js');
const { createTerritory } = await import('../js/territory.js');
const { createStandings } = await import('../js/factions.js');
const { createJobGen, candidatesFrom } = await import('../js/jobgen.js');
const { createRumours } = await import('../js/rumours.js');
const { installUniques } = await import('../js/uniques.js');
const { makeRng } = await import('../../emberveil/js/rng.js');
const { familiesOf } = await import('../../../worldgen/js/biomes.js');

const balance = read('../data/balance.json');
const bestiaryFile = read('../data/enemies.json');
const warbandData = read('../data/warbands.json');
const factions = read('../data/factions.json');
const frames = read('../data/job-frames.json');
const uniqueData = read('../data/uniques.json');
const toolData = read('../data/tools.json');
const instanceData = read('../data/instances.json');
const itemsOnDisk = () => read('../../emberveil/data/items.json');
const siteData = () => ({
  strongholds: read('../data/strongholds.json'), setpieces: read('../data/setpieces.json'),
  landmarks: read('../data/landmarks.json'), worldbosses: read('../data/worldbosses.json'),
  instances: read('../data/instances.json'),
});

const SEEDS = [25392, 7, 4477, 101, 1337, 47];
const SCENE = { add() {}, remove() {} };

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

/** Claims + territory grip, wired as js/main.js wires them. `cfg` is balance.warbands (odd values go here). */
function wire(w, { cfg = balance.warbands } = {}) {
  const standings = createStandings(factions);
  let territory = null;
  const warbands = createWarbandMap(warbandData, {
    seed: w.seed,
    biomeOf: z => familiesOf(w.terrain.biomeIdAt(z.center.x * w.terrain.metresPerCell, z.center.y * w.terrain.metresPerCell)),
    gripOf: z => territory.warGrip(z),
  });
  territory = createTerritory({
    zones: w.zones, seed: w.seed, factions, standings, metresPerCell: w.terrain.metresPerCell,
    warbandOf: z => warbands.of(z), warbandCfg: cfg,
  });
  return { warbands, territory, standings };
}

/** The bestiary as main.js has it after boot: warband members in `enemies`, warlords in `bosses`. */
function bestiaryWith() {
  const b = JSON.parse(JSON.stringify(bestiaryFile));
  installWarbands(b, warbandData);
  return b;
}

/** A real Rpg with every unique installed (the warbands' included). */
function realRpg(bal = balance) {
  const items = itemsOnDisk();
  installUniques(items, uniqueData, { tools: toolData });
  return { items, rpg: new Rpg(items, bal) };
}

/** A body that stands in for the Chibi 2 actor: everything js/actors.js calls on one, doing nothing. */
function fakeActor() {
  const v = () => ({ x: 0, y: 0, z: 0, set() {}, setScalar() {} });
  return {
    beast: false, anims: [],
    group: { position: v(), rotation: v(), scale: v(), add() {}, remove() {} },
    setAnim(name) { this.anims.push(name); }, update() {}, dispose() {},
  };
}

/**
 * The REAL EnemyField. `add` builds the unit with the real `rpg.makeEnemy` (so phases, spawns, dmg
 * are the game's) and a fake actor; nothing else is replaced. With `stub`, a recording rpg that
 * places plain bodies — for the site-filling tests, which only care WHO is put down.
 */
function fieldFor(w, warbands, { rpg = null, bal = balance } = {}) {
  const b = bestiaryWith();
  const stub = !rpg;
  const R = rpg || { rollRank: () => 'normal', pickModifiers: (t, n) => (t || []).slice(0, n) };
  const field = new EnemyField({
    scene: SCENE, terrain: w.terrain, rpg: R, defs: b.enemies, bosses: b.bosses, modifiers: b.modifiers,
    zones: w.zones, balance: { ...bal, seed: w.seed }, warbands,
  });
  field.paused = true;
  field.placed = [];
  let n = 0;
  field.add = async (def, level, x, z, opts = {}) => {
    const rank = opts.boss && (opts.rank || 'normal') === 'normal' ? 'boss' : (opts.rank || 'normal');
    const unit = stub
      ? { defId: def.id, name: opts.name || def.name, role: def.role, family: def.family, kind: def.kind, level, rank,
        dmg: [10, 15], armor: 5, speed: 3, attackEvery: 1.5, derived: {}, hp: 100, maxHp: 100, modifiers: [] }
      : R.makeEnemy(def, level, field.rng, { rank, modifiers: opts.modifiers || [], name: opts.name });
    Object.assign(unit, {
      id: unit.id || 'u' + (++n), x, z, y: w.terrain.heightAt(x, z), state: 'wander', wanderTimer: 99, swingTimer: 0,
      stagger: 0, hitFlash: 0, home: [x, z], facing: 0, hover: 0, bob: 0, playerDamage: 0, bodyR: 0.8,
      warband: def.warband || null, actor: fakeActor(), dying: null, removed: false,
    });
    field.placed.push(unit);
    field.enemies.push(unit);
    return unit;
  };
  return field;
}

/** Sites with the warband claims, as main.js builds them (R27 M10 hands `field.warbands` in). */
function sitesFor(w, warbands, extra = {}) {
  return createSites(SCENE, w.terrain, { seed: w.seed, balance, zones: w.zones, radius: 1e9, data: siteData(), warbands, ...extra });
}

/** Every held zone of a world. */
const heldZones = (w, warbands) => w.zones.list().filter(z => warbands.of(z));

// ------------------------------------------------------------------------------------ camps

test('every held zone with room for one has exactly one war camp of its own warband; no unheld zone has one', t => {
  let camps = 0, held = 0, noRoom = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands } = wire(w);
    const sites = sitesFor(w, warbands);
    const list = sites.warCamps;
    const byZone = new Map();
    for (const c of list) {
      const band = warbands.of(c.zone);
      assert.ok(band, `${seed}: ${c.name} stands in ${c.zone?.name}, which no warband holds`);
      assert.equal(c.warband, band.id, `${seed}: ${c.name} is the ${c.warband}'s but ${c.zone.name} is held by ${band.id}`);
      assert.equal(c.spec.warband, band.id);
      byZone.set(c.zone.id, (byZone.get(c.zone.id) || 0) + 1);
    }
    for (const z of heldZones(w, warbands)) {
      held++;
      const n = byZone.get(z.id) || 0;
      assert.ok(n <= 1, `${seed}: ${z.name} has ${n} war camps`);
      if (n === 1) { camps++; continue; }
      // no camp: then no garrison stands in this zone either (it would have been converted), unless
      // the town beside it is too close for a camp's walls — which `placeWarCamps` refuses
      noRoom++;
    }
  }
  t.diagnostic(`${camps} camps over ${held} held zones on ${SEEDS.length} worlds (${noRoom} held zones with no room for one)`);
  assert.ok(camps >= 10, `only ${camps} war camps on six worlds`);
  assert.ok(noRoom <= held * 0.1, `${noRoom} of ${held} held zones have no camp`);
});

test('the camps do not starve the world bosses or the instances: their slots are exactly what they were', () => {
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands } = wire(w);
    const without = sitesFor(w, null).sites;
    const withCamps = sitesFor(w, warbands).sites;
    const keyOf = s => `${s.family}:${s.key}:${s.type}`;
    for (const fam of ['worldboss', 'instance']) {
      const a = without.filter(s => s.family === fam).map(keyOf).sort();
      const b = withCamps.filter(s => s.family === fam).map(keyOf).sort();
      assert.deepEqual(b, a, `${seed}: the ${fam} slots moved when the camps went in`);
    }
    // and a camp never stands where a world boss or an instance does
    const big = new Set(withCamps.filter(s => s.family === 'worldboss' || s.family === 'instance').map(s => String(s.key)));
    for (const c of withCamps.filter(s => s.warCamp)) assert.ok(!big.has(String(c.key)), `${seed}: ${c.name} sits on a boss or instance slot`);
  }
});

test('a war camp is dressed in its own walls and flies its warband\'s colours', () => {
  const setpieces = siteData().setpieces.layouts;
  const walls = { sootwick: 'junkwall', ashtusk: 'warpalisade', thornmane: 'thorns', unburied: 'barrowbank', stonehide: 'slab' };
  for (const band of warbandData.warbands) {
    const spec = siteData().strongholds.kinds.find(k => k.warband === band.id);
    assert.ok(spec, `${band.id} has no war camp row`);
    assert.equal(spec.faction, band.id);
    const l = setpieces[spec.plan];
    const pieces = (l.rings || []).map(r => r.piece);
    assert.ok(pieces.includes(walls[band.id]), `${spec.plan} is not walled with ${walls[band.id]}`);
    assert.ok(pieces.filter(p => p === 'warbanner').length >= 2, `${spec.plan} flies no warband banner`);
  }
  // …and the banner really takes the camp's colour, per instance, on a real world
  const w = realWorld(7);
  const { warbands } = wire(w);
  const sites = sitesFor(w, warbands);
  const camp = sites.warCamps[0];
  sites.update(camp.x, camp.z, true);
  assert.ok(camp.bannerColour, 'the camp carries no colour');
});

test('the garrison is pure: the warband\'s own members, its bearer and its warlord — and a fallback is counted, not silent', async t => {
  const fallbacks = [];
  let bodies = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands } = wire(w);
    const sites = sitesFor(w, warbands);
    for (const camp of sites.warCamps) {
      const field = fieldFor(w, warbands);
      const band = warbandById(warbandData, camp.warband);
      const out = await sites.populate(camp, { field, chests: null, level: camp.level });
      const allowed = new Set([...band.members, band.warlord]);
      for (const u of field.placed) {
        bodies++;
        assert.ok(allowed.has(u.defId) || camp.garrisonFallback === 'full-pool', `${seed} ${camp.name}: a ${u.defId} in the ${band.id} garrison`);
      }
      assert.ok(out.warlord && out.warlord.defId === band.warlord, `${seed} ${camp.name}: no warlord`);
      assert.equal(out.boss, null, 'the warlord must not be handed back as a boss that takes the place on its own');
      assert.equal(field.placed.filter(u => u.defId === band.bearer).length, 1, `${camp.name} has no standard-bearer`);
      if (camp.garrisonFallback) fallbacks.push(`${seed}:${camp.name}:${camp.garrisonFallback}@${camp.level}`);
    }
  }
  t.diagnostic(`${bodies} garrison bodies; fallbacks: ${fallbacks.length ? fallbacks.join(', ') : 'none'}`);
  assert.ok(!fallbacks.some(f => f.endsWith('full-pool') || f.includes('full-pool')), `a garrison fell back to the zone's wildlife: ${fallbacks.join(', ')}`);
});

test('the war-chest is sealed while one guard stands, opens after the last, and can hold the warband\'s unique', async () => {
  const w = realWorld(4477);
  const { warbands } = wire(w);
  const sites = sitesFor(w, warbands);
  const camp = sites.warCamps[0];
  const { rpg } = realRpg();
  const field = fieldFor(w, warbands, { rpg });
  const chests = createChests(SCENE, w.terrain, { seed: w.seed, balance, zones: w.zones, rpg });
  const out = await sites.populate(camp, { field, chests, level: camp.level });
  assert.ok(out.chest, 'no war-chest');
  const band = warbandById(warbandData, camp.warband);
  const roster = camp.roster.slice();
  assert.ok(roster.length >= 4);
  out.chest.unique = { id: band.unique, chance: 1 };        // the forced roll
  for (let i = 0; i < roster.length; i++) {
    const res = chests.open(out.chest, { level: camp.level });
    assert.ok(res?.sealed, `the chest opened with ${roster.length - i} guard(s) up`);
    roster[i].dying = 0;
  }
  const res = chests.open(out.chest, { level: camp.level });
  assert.ok(!res.sealed && res.items?.length, 'the chest would not open after the last guard fell');
  assert.ok(res.items.some(it => it.uniqueId === band.unique), `the forced roll did not give ${band.unique}`);
  const bases = new Set(band.drops);
  for (const it of res.items.filter(i => !i.isUnique && !i.setId)) assert.ok(bases.has(it.baseKey), `${it.baseKey} is not on the ${band.id} drop list`);
});

test('the camp pays ONCE, through the one payer, when its LAST guard falls — and the grip drops by exactly campGrip', async () => {
  const cfg = { ...balance.warbands, campGrip: 0.337, warlordGrip: 0.211, killGrip: 0 };
  for (const seed of [7, 101]) {
    const w = realWorld(seed);
    const { warbands, territory } = wire(w, { cfg });
    const sites = sitesFor(w, warbands);
    const camp = sites.warCamps[0];
    const field = fieldFor(w, warbands);
    await sites.populate(camp, { field, chests: null, level: camp.level });
    const roster = camp.roster.slice();
    let takes = 0, cleared = 0, gripBeforeTake = null, gripAfterTake = null;
    // js/main.js onEnemyKilled, replayed: warDeath → (warlord) grip → (cleared) take → grip → pay
    for (const u of roster) {
      u.dying = 0;
      const war = sites.warDeath(u);
      assert.ok(war, 'a camp body died and the camp did not hear of it');
      if (war.warlord) territory.warbandLoss(camp.zone.id, 'warlord');
      if (war.cleared) {
        cleared++;
        gripBeforeTake = territory.warGrip(camp.zone);
        const took = sites.take(war.site.key);
        if (took) { takes++; territory.warbandLoss(camp.zone.id, 'camp'); }
        gripAfterTake = territory.warGrip(camp.zone);
      }
    }
    assert.equal(cleared, 1, 'the camp was "cleared" more than once, or never');
    assert.equal(takes, 1, 'the camp was taken more than once, or never');
    assert.ok(Math.abs((gripBeforeTake - gripAfterTake) - cfg.campGrip) < 1e-9, `taking the camp moved the grip by ${gripBeforeTake - gripAfterTake}, not ${cfg.campGrip}`);
    assert.ok(Math.abs((1 - gripBeforeTake) - cfg.warlordGrip) < 1e-9, `slaying the warlord moved the grip by ${1 - gripBeforeTake}, not ${cfg.warlordGrip}`);
    // a second take, a refill, a second pass — none of it pays again
    assert.equal(sites.take(camp.key), null);
    sites.relax(camp.x + 5000, camp.z);
    const again = await sites.populate(camp, { field: fieldFor(w, warbands), chests: null, level: camp.level });
    assert.equal(again.warlord, null, 'a taken camp stood its warlord back up');
    assert.equal(sites.warDeath({ warCamp: camp.key }), null, 'a taken camp still counts deaths');
  }
});

test('a taken camp and a slain warlord survive a save: the ledger keys come back and nothing respawns', async () => {
  const w = realWorld(1337);
  const { warbands } = wire(w);
  const first = sitesFor(w, warbands);
  const [a, b] = first.warCamps;
  assert.ok(a && b, 'need two camps on this world');
  // the ledger main.js saves: taken keys, and `wl:<key>` for a warlord slain in a camp not yet taken
  const ledger = [a.key, 'wl:' + b.key];
  const saved = JSON.parse(JSON.stringify({ strongholds: { 'x': ledger } }));
  const again = sitesFor(w, warbands, { taken: saved.strongholds.x });
  const a2 = again.warCamps.find(s => s.key === a.key), b2 = again.warCamps.find(s => s.key === b.key);
  assert.equal(a2.taken, true, 'the taken camp came back untaken');
  assert.equal(b2.warlordSlain, true, 'the slain warlord came back');
  const field = fieldFor(w, warbands);
  const out = await again.populate(b2, { field, chests: null, level: b2.level });
  assert.equal(out.warlord, null, 'a slain warlord stood up again after a load');
  assert.ok(out.garrison.length > 0, 'the rest of its camp should still be there to take');
  assert.equal(again.warCandidates(b2.zone.id).some(c => c.type === 'warlord'), false, 'a job could still send you after a dead warlord');
});

// ------------------------------------------------------------------------------------ warlords

test('every warband has a warlord: its race, 1.6-2.2x, 2-3 phases in order, adds of its own, a Name Forge tongue', () => {
  for (const band of warbandData.warbands) {
    const wl = warbandData.warlords.find(x => x.id === band.warlord);
    assert.ok(wl, `${band.id} has no warlord`);
    assert.equal(wl.kind, 'humanoid');
    assert.equal(wl.look.avatar.body.race, band.race);
    assert.ok(wl.scale >= 1.6 && wl.scale <= 2.2, `${wl.id} is ${wl.scale}x`);
    assert.ok(wl.phases.length >= 2 && wl.phases.length <= 3);
    for (let i = 1; i < wl.phases.length; i++) assert.ok(wl.phases[i].at < wl.phases[i - 1].at, `${wl.id}'s phases are out of order`);
    for (const p of wl.phases) assert.ok(bestiaryFile.modifiers.some(m => m.id === p.modifier), `${wl.id} phase names ${p.modifier}`);
    assert.ok(band.members.includes(wl.spawns.id), `${wl.id} calls ${wl.spawns.id}, who is not one of the ${band.id}`);
    assert.ok(wl.nameRace);
    assert.ok(wl.minLevel >= band.levels[0] && wl.maxLevel <= band.levels[1]);
  }
  // and they are not in data/enemies.json on disk — injected only
  const disk = new Set(bestiaryFile.bosses.map(b => b.id));
  for (const wl of warbandData.warlords) assert.ok(!disk.has(wl.id), `${wl.id} was written into enemies.json`);
  const b = bestiaryWith();
  for (const wl of warbandData.warlords) assert.ok(b.bosses.some(x => x.id === wl.id), `${wl.id} was not installed`);
  assert.ok(warbandData.warlords.some(wl => wl.maxLevel >= 36) && warbandData.warlords.some(wl => wl.maxLevel >= 50), 'nothing fills the boss band above 30');
});

test('for levels 31-50, bossFor answers a warlord or another boss whose band holds the level — never null', () => {
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands } = wire(w);
    const field = fieldFor(w, warbands);
    const zones = w.zones.list();
    for (let level = 31; level <= 50; level++) {
      for (const z of zones.slice(0, 6)) {
        const x = z.center.x * w.terrain.metresPerCell, zz = z.center.y * w.terrain.metresPerCell;
        const b = field.bossFor(level, x, zz);
        assert.ok(b, `${seed}: no boss at level ${level}`);
        const inBand = (b.minLevel ?? 1) <= level && (b.maxLevel ?? 99) >= level;
        assert.ok(b.warlord || inBand, `${seed}: level ${level} got ${b.id} (${b.minLevel}-${b.maxLevel})`);
      }
    }
  }
});

test('a warlord never keeps an instance whose door it could not walk through', () => {
  const w = realWorld(7);
  const { warbands } = wire(w);
  const field = fieldFor(w, warbands);
  let checked = 0, warlordsPlaced = 0;
  const z = w.zones.list()[0];
  const x = z.center.x * w.terrain.metresPerCell, zz = z.center.y * w.terrain.metresPerCell;
  for (const inst of instanceData.instances) {
    const room = { corridor: inst.interior?.corridor, wallHeight: inst.interior?.wallHeight };
    for (let level = 1; level <= 50; level += 3) {
      const { def } = field.bossForHolds(inst.holds?.boss || null, level, x, zz, { room });
      if (!def) continue;
      checked++;
      if (def.warlord) warlordsPlaced++;
      assert.ok(fitsRoom(def, room), `${def.id} (${def.scale}x) was put in ${inst.id} (${room.corridor} m door, ${room.wallHeight} m walls)`);
    }
  }
  // the check itself bites: the biggest warlord does not fit the smallest door
  const big = warbandData.warlords.reduce((a, b) => ((a.bodyHeight * a.scale) > (b.bodyHeight * b.scale) ? a : b));
  assert.equal(fitsRoom(big, { corridor: 2.4, wallHeight: 3.4 }), false);
  assert.ok(checked > 100 && warlordsPlaced > 0, `${checked} instance bosses checked, ${warlordsPlaced} of them warlords`);
});

test('a scripted fight on the real EnemyField: every phase fires once, in order, and calls that warband\'s own', async () => {
  const w = realWorld(4477);
  const { warbands } = wire(w);
  const { rpg } = realRpg();
  for (const band of warbandData.warbands) {
    const field = fieldFor(w, warbands, { rpg });
    const def = field.bosses.find(b => b.id === band.warlord);
    const z = w.zones.list()[0];
    const x = z.center.x * w.terrain.metresPerCell, zz = z.center.y * w.terrain.metresPerCell;
    const boss = await field.placeBoss(def, def.minLevel, x, zz, {});
    field.linkEscort(boss, []);
    const fired = [];
    const player = { x: x + 3, z: zz, derived: {} };
    const hooks = { onBossPhase: (e, p) => fired.push(p.modifier) };
    for (const frac of [0.95, 0.72, 0.62, 0.55, 0.45, 0.35, 0.28, 0.2, 0.12, 0.05]) {
      boss.hp = Math.max(1, Math.round(boss.maxHp * frac));
      field.update(0.05, player, { level: 20 }, hooks);
      field.update(0.05, player, { level: 20 }, hooks);
    }
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(fired, def.phases.map(p => p.modifier), `${def.id}'s phases fired ${fired.join(',')}`);
    const adds = field.placed.filter(u => u !== boss);
    assert.equal(adds.length, def.spawns.at.length * def.spawns.count, `${def.id} called ${adds.length}`);
    for (const u of adds) {
      assert.ok(band.members.includes(u.defId), `${def.id} called a ${u.defId}`);
      assert.equal(u.leader, boss.id, 'a called add is not in the warlord\'s band');
    }
  }
});

// ------------------------------------------------------------------------------------ leaders

/** A leader, its escort and its standard-bearer, standing in the open on a real world. */
async function band(w, warbands, rpg, bal, bandId = 'ashtusk', level = 50) {
  const field = fieldFor(w, warbands, { rpg, bal });
  const b = warbandById(warbandData, bandId);
  const leaderDef = field.defs.find(d => d.id === b.defs.find(x => x.type === 'leader').id);
  const z = w.zones.list()[0];
  const x = z.center.x * w.terrain.metresPerCell, zz = z.center.y * w.terrain.metresPerCell;
  const leader = await field.add(leaderDef, level, x, zz);
  const escort = [];
  let k = 0;
  for (const id of leaderDef.leads) for (let i = 0; i < 2; i++) escort.push(await field.add(field.defs.find(d => d.id === id), level, x + 7 * Math.cos(k), zz + 7 * Math.sin(k++)));
  const bearer = await field.add(field.defs.find(d => d.id === leaderDef.bearer), level, x - 7, zz + 3);
  escort.push(bearer);
  field.linkEscort(leader, escort);
  return { field, leader, escort, bearer, x, z: zz };
}

test('the leader aura is ONE multiplier, through applyModifier: with the factor at 1.37 an escort hits 1.37x, not 1.37 squared', async () => {
  const w = realWorld(101);
  const { warbands } = wire(w);
  const bal = { ...balance, warbands: { ...balance.warbands, leaderAura: 1.37 } };
  const { rpg } = realRpg(bal);
  const { field, escort, bearer } = await band(w, warbands, rpg, bal);
  const brute = escort[0];
  const def = field.defs.find(d => d.id === brute.defId);
  const base = rpg.makeEnemy(def, brute.level, makeRng(1), {});
  assert.ok(Math.abs(brute.dmg[0] / base.dmg[0] - 1.37) < 1e-9 && Math.abs(brute.dmg[1] / base.dmg[1] - 1.37) < 1e-9, `dmg ${brute.dmg} vs ${base.dmg}`);
  // the damage it actually deals, through the real `strike`, against a plain target
  const target = () => ({ derived: { resistAll: 0, dodge: 0, block: 0 }, armor: 0, magicResist: 0, hp: 1e9, maxHp: 1e9, statuses: {} });
  const hit = u => { let sum = 0; for (let i = 0; i < 40; i++) sum += rpg.strike(u, target(), makeRng(900 + i)).amount; return sum; };
  const unled = { ...brute, dmg: base.dmg.slice() };
  const ratio = hit(brute) / hit(unled);
  assert.ok(Math.abs(ratio - 1.37) <= 0.001, `led/unled damage is ${ratio.toFixed(4)}, not 1.37 (1.37 squared would be ${(1.37 ** 2).toFixed(4)})`);
  // the standard-bearer falls: the aura is gone, to the last decimal
  field.kill(bearer);
  const after = hit(brute) / hit(unled);
  assert.ok(Math.abs(after - 1) <= 1e-9, `after the bearer fell the ratio is ${after}`);
  assert.ok(!brute.modifiers.includes('leader'));
});

test('hit one escort and its whole band wakes on the next frame; kill the leader and they rout, then come back', async () => {
  const w = realWorld(101);
  const { warbands } = wire(w);
  const { rpg } = realRpg();
  const { field, leader, escort, x, z } = await band(w, warbands, rpg, balance, 'thornmane', 20);
  const player = { x: x + 40, z, derived: {} };
  const unit = { level: 20 };
  field.update(0.016, player, unit, {});
  assert.ok([leader, ...escort].every(u => u.state !== 'chase'), 'the band was awake before anything happened');
  // the hit: the real `land` path the player's strikes take
  field.land(escort[0], { amount: 1, dead: false }, { fromX: player.x, fromZ: player.z });
  field.update(0.016, player, unit, {});
  const asleep = [leader, ...escort].filter(u => u.state !== 'chase');
  assert.equal(asleep.length, 0, `${asleep.map(u => u.defId).join(', ')} slept through it`);
  assert.ok(leader.actor.anims.includes('point'), 'the leader never pointed you out');
  field.update(0.016, player, unit, {});
  assert.equal(leader.actor.anims.filter(a => a === 'point').length, 1, 'the point replayed');

  // the leader dies
  field.kill(leader);
  let t = 0, fled = new Set();
  while (t < 2) { field.update(0.1, player, unit, {}); t += 0.1; for (const u of escort) if (u.state === 'flee') fled.add(u); }
  assert.ok(fled.size >= 1, 'nobody broke when the leader fell');
  const back = new Map();
  while (t < 8.05) {
    field.update(0.1, player, unit, {}); t += 0.1;
    for (const u of fled) if (u.state !== 'flee' && !back.has(u)) back.set(u, t);
  }
  for (const u of fled) assert.ok(back.has(u), `${u.defId} was still running at 8 s`);
  for (const u of escort) assert.ok(u.dying == null && !u.removed, 'a runner was thrown away — it keeps its drop and still counts for the camp');
});

// ------------------------------------------------------------------------------------ jobs

test('over 500 jobs on six worlds both new frames are offered, and each binds to an untaken camp or a living warlord', () => {
  const seen = { break_the_camp: 0, bring_down_warlord: 0 };
  let jobs = 0;
  for (const seed of SEEDS) {
    const w = realWorld(seed);
    const { warbands, territory, standings } = wire(w);
    const sites = sitesFor(w, warbands);
    // one camp already taken and one warlord already slain, so the "only what exists" half bites
    const [gone, headless] = sites.warCamps;
    if (gone) sites.take(gone.key);
    if (headless) headless.warlordSlain = true;
    const gen = createJobGen({ frames, territory, factions, standings, seed });
    const zones = heldZones(w, warbands).filter(z => sites.warCamps.some(c => c.zone.id === z.id));
    for (let round = 0; jobs < 90 * (SEEDS.indexOf(seed) + 1) && round < 60; round++) {
      for (const zone of zones) {
        const camps = sites.warCandidates(zone.id);
        const board = gen.offer({ zone, level: zone.midLevel, candidates: candidatesFrom({ zone, territory, camps, level: zone.midLevel }), want: 5 });
        for (const job of board) {
          jobs++;
          if (!(job.frame in seen)) continue;
          seen[job.frame]++;
          if (job.frame === 'break_the_camp') {
            const key = String(job.bindings.camp).replace(/^camp:/, '');
            const camp = sites.warCamps.find(c => String(c.key) === key);
            assert.ok(camp && !camp.taken, `${seed}: a job to break ${job.bindings.camp}, which is ${camp ? 'taken' : 'not there'}`);
            assert.equal(camp.zone.id, zone.id);
          } else {
            const camp = sites.warCamps.find(c => c.zone.id === zone.id && warbandById(warbandData, c.warband).warlord === job.bindings.warlord);
            assert.ok(camp && !camp.taken && !camp.warlordSlain, `${seed}: a job to bring down ${job.bindings.warlord}, who is not standing`);
            assert.ok(job.title.includes(sites.warlordName(camp)), 'the job names somebody else');
          }
        }
      }
    }
  }
  assert.ok(jobs >= 500, `only ${jobs} jobs`);
  assert.ok(seen.break_the_camp >= 1 && seen.bring_down_warlord >= 1, JSON.stringify(seen));
});

test('a rumour names a living warlord where it is, and never a dead one', () => {
  const w = realWorld(7);
  const { warbands, territory } = wire(w);
  const sites = sitesFor(w, warbands);
  const camp = sites.warCamps[0];
  const rumours = createRumours({ territory, factions, seed: 7 });
  const living = sites.warCandidates(camp.zone.id).find(c => c.type === 'warlord');
  let row = null;
  for (let i = 0; i < 80 && !row; i++) {
    const r = rumours.hear(camp.zone, { extra: { warlord: living.name, warlordAt: living.campName } });
    if (r?.kind === 'warlord_seen') row = r;
    else rumours.load([]);
  }
  assert.ok(row && row.text.includes(living.name) && row.text.includes(camp.name), 'no rumour of the warlord');
  camp.warlordSlain = true;
  assert.equal(sites.warCandidates(camp.zone.id).some(c => c.type === 'warlord'), false);
  const facts = rumours.KINDS.find(k => k.key === 'warlord_seen');
  assert.equal(facts.holds({ warlord: null, warlordAt: null }), false);
});

// ------------------------------------------------------------------------------------ uniques

test('the five warband uniques are installed at load, never on disk, and only a warband gives one up', () => {
  const disk = itemsOnDisk();
  const { items, rpg } = realRpg();
  for (const band of warbandData.warbands) {
    assert.ok(!(disk.uniques || []).some(u => u.id === band.unique), `${band.unique} was written into items.json`);
    const u = items.uniques.find(x => x.id === band.unique);
    assert.ok(u && u.warband === band.id, `${band.unique} was not installed`);
    const item = rpg.uniqueItem(band.unique, { level: 30 });
    assert.equal(item?.uniqueId, band.unique);
  }
  // 400 forced legendary drops at level 30 never produce one
  const r = makeRng(3);
  for (let i = 0; i < 400; i++) {
    const it = rpg.rollDrop({ level: 30, rng: r, chance: 1, floor: 'legendary' });
    assert.ok(!it?.uniqueId || !warbandData.warbands.some(b => b.unique === it.uniqueId), 'a warband unique dropped at random');
  }
  // a warlord's kill can (forced)
  const bal = { ...balance, warbands: { ...balance.warbands, warlordUniqueChance: 1 } };
  const { rpg: r2 } = realRpg(bal);
  const wl = warbandData.warlords[1];
  const e = r2.makeEnemy(wl, 20, makeRng(4), { rank: 'boss' });
  assert.ok(r2.rollDrops(e).some(it => it.uniqueId === wl.uniqueDrop), 'a warlord never gives up its unique');
});
