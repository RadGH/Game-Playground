// node --test prototypes/farhold/tests/round27-gates.test.js
//
// R27 M4 — gates that open and shut, and guards who notice you.
//
// Everything runs the REAL modules on REAL worlds: js/planet.js builds the world, js/features.js the
// towns and their gatehouses, js/sites.js the strongholds (M1's `take` is the take), js/town.js
// derives the gate state and drives the guards, js/player.js's own controller does the walking into
// the gate, js/actors.js's EnemyField does the spawning. Nothing asserts a sentence or a tuning
// number: the knobs are moved to odd values and the modules are asked what they did.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const THREE = await import('three');
const P = await import('../js/planet.js');
const { buildZones } = await import('../js/zones.js');
const { bandForPlanet } = await import('../js/rpg.js');
const { createFeatures, GATE_SWING } = await import('../js/features.js');
const { createSites } = await import('../js/sites.js');
const { ObstacleField } = await import('../js/collide.js');
const { createController } = await import('../js/player.js');
const { EnemyField } = await import('../js/actors.js');
const { townExtent } = await import('../js/town-plan.js');
const { gateLine } = await import('../js/speech.js');
const {
  createTownFolk, besiegedTowns, gateVerdict, guardTargetsPlayer, knockOutcome, watchPosts,
} = await import('../js/town.js');

const balance = read('../data/balance.json');
const bestiary = read('../data/enemies.json');
const factions = read('../data/factions.json');
const incidents = read('../data/incidents.json');
const siteData = () => ({
  strongholds: read('../data/strongholds.json'), setpieces: read('../data/setpieces.json'),
  landmarks: read('../data/landmarks.json'), worldbosses: read('../data/worldbosses.json'),
  instances: read('../data/instances.json'),
});
const SCENE = { add() {}, remove() {} };

// ------------------------------------------------------------------------------------ fixtures

/**
 * Seed 1337 at full size: it has real siege camps (two) and walled towns. No standard seed puts a
 * camp within reach of a WALLED town on its own — every one lands by a hamlet (checked across all
 * six) — so the test moves one of the world's own camp records to 600 m outside a walled town's
 * wall. It is still the record js/sites.js made, and `sites.take` still takes it.
 */
let cached = null;
function world() {
  if (cached) return cached;
  const seed = 1337;
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT);
  const { planet, world: wd } = P.createWorld({ seed, width: 256, height: 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = P.makeTerrain(wd, planet, balance.terrain);
  const band = bandForPlanet(planet);
  const spawn = terrain.spawnPoint();
  const zones = buildZones(wd, { spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min, bandWidth: balance.zones?.bandWidth ?? 4 });
  const features = createFeatures(SCENE, terrain, { seed, radius: 2600 });
  const sites = createSites(SCENE, terrain, { seed, balance, zones, data: siteData() });
  // a walled town whose gatehouses have doors
  let town = null;
  for (const t of features.settlements.filter(s => townExtent(s).walled)) {
    features.update(t.wx, t.wz, true);
    if (features.gatesOf(t.id).some(g => g.doors)) { town = t; break; }
  }
  const camp = sites.sites.find(s => s.type === 'siege_camp');
  cached = { seed, terrain, zones, features, sites, town, camp };
  return cached;
}

/** Stand the world's siege camp 600 m outside `town`'s wall, on the side away from the others. */
function pitchCampBy(w, town, camp = w.camp) {
  const r = townExtent(town).wall + 600;
  camp.x = town.wx + r; camp.z = town.wz;
  camp.taken = false;
  return camp;
}

/** A body the guard code can move, without building a Chibi 2 mesh. */
function stubActor() {
  return { group: { position: { set() {} }, rotation: {}, add() {} }, update() {}, setAnim() {}, beast: false, combatClips: true, anims: [] };
}

/** The real town folk over the real features, with nothing populated (radius 0) — the gates only. */
function folkFor(w, cfg = {}) {
  return createTownFolk(SCENE, w.terrain, { features: w.features, rpg: {}, seed: w.seed, radius: 0, balance: { ...balance, gates: { ...balance.gates, ...cfg } } });
}

/** What main.js hands `folk.update` as `gates`, with the standing forced to one band. */
function gateCtx(w, { band = 'known', spawn = null, givers = [], hurt = null } = {}) {
  const faction = factions.factions[0];
  return {
    camps: w.sites.sites, spawn, givers,
    standingAt: () => (band ? { band, faction } : null),
    say() {}, hurt: hurt || (() => {}),
  };
}

/** Run the town folk for `seconds` with the player at `at`. */
function run(folk, at, gates, seconds = 0.6, { field = { enemies: [], kill() {} }, onLog = null } = {}) {
  for (let t = 0; t < seconds; t += 0.1) folk.update(0.1, at, { field, level: 5, gates, onLog });
}

/**
 * THE REAL PLAYER CONTROLLER walks straight in at a gate's middle from 14 m outside, holding W, for
 * up to `seconds`. Returns how far OUTSIDE the gate line it ended (negative = inside the town).
 */
function walkIn(w, gate, seconds = 12) {
  const ctrl = createController(w.terrain, balance, new THREE.PerspectiveCamera(), { obstacles: [w.features.solids] });
  const sx = gate.x + gate.ox * 14, sz = gate.z + gate.oz * 14;
  ctrl.teleport(sx, sz);
  ctrl.yaw = Math.atan2(-gate.ox, -gate.oz);
  const input = { keys: new Set(), pressed: new Set(), look: [0, 0], forward: 1, strafe: 0, run: false };
  for (let t = 0; t < seconds; t += 1 / 30) {
    ctrl.update(1 / 30, input);
    if ((ctrl.x - gate.x) * gate.ox + (ctrl.z - gate.z) * gate.oz < -8) break;
  }
  return (ctrl.x - gate.x) * gate.ox + (ctrl.z - gate.z) * gate.oz;
}

// ------------------------------------------------------------------------------------ collide

test('collide: a segment filed with an id can be switched off (a walker passes) and on again (it stops)', () => {
  const f = new ObstacleField();
  const handle = f.addSegment(0, 0, 10, 0, 0.3, 4, { id: 'door' });
  assert.equal(handle.seg, true, 'addSegment returns the segment as a handle');
  const step = () => f.resolve(5, -1.2, 0.4, [0, 0], null, [5, 1.2]);   // a two-metre step across it
  assert.ok(step()[1] > 0.5, 'the door stops a walker');
  assert.equal(f.setEnabled('door', false), 1);
  assert.equal(f.isEnabled('door'), false);
  assert.ok(Math.abs(step()[1] - -1.2) < 1e-9, 'switched off, the walker passes');
  assert.equal(f.blocked(5, 0, 0.4), false);
  f.setEnabled(handle, true);                                              // by handle this time
  assert.ok(step()[1] > 0.5, 'switched on again, the walker stops');
  assert.equal(f.blocked(5, 0, 0.4), true);
  // clear() still clears — and forgets the id, so a stale toggle after a rebuild touches nothing
  f.clear();
  assert.equal(f.blocked(5, 0, 0.4), false);
  assert.equal(f.setEnabled('door', true), 0);
  assert.equal(f.isEnabled('door'), null);
  // filed switched off from the start
  f.addSegment(0, 0, 10, 0, 0.3, 4, { id: 'late', enabled: false });
  assert.equal(f.blocked(5, 0, 0.4), false);
});

// ------------------------------------------------------------------------------------ the doors

test('a shut gate: the door collider blocks the passage, the leaves swing across it in GATE_SWING seconds, and open is open again', () => {
  const w = world();
  assert.ok(w.town, 'seed 1337 has no walled town with a gatehouse');
  const f = w.features;
  f.update(w.town.wx, w.town.wz, true);
  const gate = f.gatesOf(w.town.id).find(g => g.doors);
  const leafAxes = () => {
    const mesh = f.instanced.gatedoor, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); m.decompose(p, q, s);
      if (Math.hypot(p.x - gate.x, p.z - gate.z) > gate.open / 2 + 2.5) continue;
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      out.push({ along: Math.abs(axis.x * gate.ox + axis.z * gate.oz), across: Math.abs(axis.x * gate.tx + axis.z * gate.tz), len: s.z });
    }
    return out;
  };
  assert.equal(gate.shut, false);
  assert.ok(leafAxes().every(l => l.along > 0.99), 'open leaves lie along the passage');
  assert.ok(walkIn(w, gate) < -6, 'an open gate lets the walker in');

  f.setGateShut(w.town.id, true);
  assert.equal(gate.shut, true);
  // the colliders switch at once; the leaves take GATE_SWING seconds
  const half = GATE_SWING / 2;
  f.tickGates(half);
  const mid = f.doorSwing(w.town.id, gate.index);
  assert.ok(mid > 0.4 && mid < 0.6, `half the swing time is half a swing (${mid})`);
  f.tickGates(half + 0.01);
  assert.equal(f.doorSwing(w.town.id, gate.index), 1);
  const shut = leafAxes();
  assert.equal(shut.length, 2);
  assert.ok(shut.every(l => l.across > 0.99), 'shut leaves lie across the opening');
  // two leaves meet in the middle: together they span the hinges without overlapping
  assert.ok(shut.every(l => l.len <= gate.open / 2 && l.len > gate.open / 2 - 0.3));
  const out = walkIn(w, gate);
  assert.ok(out > 0.5, `the real player controller walked through a shut gate to ${out.toFixed(2)} m`);
  // a rebuild keeps it shut (the state lives outside the rebuild, and is filed switched on)
  f.update(w.town.wx + 400, w.town.wz, true);
  f.update(w.town.wx, w.town.wz, true);
  const again = f.gatesOf(w.town.id).find(g => g.index === gate.index);
  assert.equal(again.shut, true);
  assert.ok(walkIn(w, again) > 0.5, 'a rebuilt shut gate still stops the walker');
  f.setGateShut(w.town.id, false);
  f.tickGates(GATE_SWING + 0.01);
  assert.ok(leafAxes().every(l => l.along > 0.99), 'opened again, the leaves are back along the passage');
  assert.ok(walkIn(w, again) < -6);
});

// ------------------------------------------------------------------------------------ siege

test('siege: a standing siege camp shuts the town\'s gate and the real walker stops at it; M1\'s take opens it', () => {
  const w = world();
  const camp = pitchCampBy(w, w.town);
  // besieged by the nearest town rule, measured to the real wall
  const b = besiegedTowns(w.features.settlements, w.sites.sites, balance.gates.siegeReach);
  assert.ok(b.has(w.town.id), 'the camp 600 m out does not besiege the town');
  const folk = folkFor(w);
  const logs = [];
  const player = { x: w.town.wx, z: w.town.wz + 5 };
  run(folk, player, gateCtx(w), 0.6, { onLog: t => logs.push(t) });
  assert.equal(folk.gateOf(w.town.id).shut, true);
  assert.equal(folk.gateOf(w.town.id).reason, 'siege');
  assert.ok(logs.some(l => l.includes(w.town.name) && /\d+ m/.test(l)), 'the log names the town and the distance');
  const gate = w.features.gatesOf(w.town.id).find(g => g.doors);
  assert.ok(walkIn(w, gate) > 0.5, 'walked through a besieged town\'s gate');

  // M1's take — the real one
  const took = w.sites.take(camp.key);
  assert.ok(took && camp.taken);
  run(folk, player, gateCtx(w), 0.6);
  assert.equal(folk.gateOf(w.town.id).shut, false);
  w.features.tickGates(GATE_SWING + 0.01);
  assert.ok(walkIn(w, gate) < -6, 'the siege is lifted and the gate is still shut');
  // the knob is read: a reach too short for 600 m leaves the same camp besieging nothing
  camp.taken = false;
  const short = folkFor(w, { siegeReach: 150 });
  run(short, player, gateCtx(w), 0.6);
  assert.equal(short.gateOf(w.town.id).shut, false, '`gates.siegeReach` is not read');
  camp.taken = true;
});

test('respawn exemption: the town you wake in, and one whose people gave you work, never shut — the siege still shows', () => {
  const w = world();
  pitchCampBy(w, w.town);
  const player = { x: w.town.wx, z: w.town.wz };
  const logs = [];
  const folk = folkFor(w);
  run(folk, player, gateCtx(w, { spawn: { x: w.town.wx + 3, z: w.town.wz } }), 0.6, { onLog: t => logs.push(t) });
  const v = folk.gateOf(w.town.id);
  assert.equal(v.siege, true, 'the siege is still there');
  assert.equal(v.exempt, true);
  assert.equal(v.shut, false);
  assert.equal(w.features.gateShut(w.town.id), false);
  assert.ok(logs.some(l => l.includes(w.town.name) && /siege/i.test(l)), 'the siege blurb shows');
  // a quest giver's town (js/town.js ids are `${node.id}:${i}`)
  const folk2 = folkFor(w);
  run(folk2, player, gateCtx(w, { givers: [`${w.town.id}:3`] }), 0.6);
  assert.equal(folk2.gateOf(w.town.id).shut, false);
  // …and Hunted does not shut it either
  const folk3 = folkFor(w);
  run(folk3, player, gateCtx(w, { band: 'hunted', spawn: { x: w.town.wx, z: w.town.wz } }), 0.6);
  assert.equal(folk3.gateOf(w.town.id).shut, false);
  w.camp.taken = true;
});

// ------------------------------------------------------------------------------------ hunted

test('hunted: the gate is barred, a gate guard targets the player only outside the wall, and hits them there', () => {
  const w = world();
  w.camp.taken = true;                                     // no siege: this is standing alone
  const gate = w.features.gatesOf(w.town.id).find(g => g.doors);
  const ring = w.features.wallOf(w.town.id);
  const folk = folkFor(w);
  // one gate guard at this gate's post, with a stub body
  const home = [gate.x + gate.ox * 3.1, gate.z + gate.oz * 3.1];
  const guard = {
    id: 'g', name: 'Test Guard', role: 'guard', guards: true, guardTimer: 0, target: null, node: w.town,
    x: home[0], z: home[1], y: 0, facing: 0, home, post: { facing: gate.yaw, gate: gate.index, side: 1 }, actor: stubActor(),
  };
  folk.live.set('test', [guard]);
  let hits = 0;
  const ctx = gateCtx(w, { band: 'hunted', hurt: () => { hits++; } });
  // outside the wall, near the gate
  const outside = { x: gate.x + gate.ox * 8, z: gate.z + gate.oz * 8 };
  assert.ok(Math.hypot(outside.x - ring.cx, outside.z - ring.cz) > ring.r);
  run(folk, outside, ctx, 3);
  assert.equal(folk.gateOf(w.town.id).shut, true, 'a Hunted player finds the gate shut');
  assert.equal(folk.gateOf(w.town.id).reason, 'hunted');
  assert.equal(guard.huntingPlayer, true, 'the guard does not go for a Hunted player outside the wall');
  assert.ok(hits > 0, 'the guard never struck');
  // inside the wall line: left alone, however close
  const inside = { x: gate.x - gate.ox * 6, z: gate.z - gate.oz * 6 };
  assert.ok(Math.hypot(inside.x - ring.cx, inside.z - ring.cz) < ring.r);
  hits = 0;
  guard.x = inside.x + gate.ox * 1; guard.z = inside.z + gate.oz * 1;   // right beside them
  run(folk, inside, ctx, 3);
  assert.equal(guard.huntingPlayer, false, 'a guard went for the player INSIDE the wall');
  assert.equal(hits, 0);
  // the knock is refused while Hunted
  const knock = folk.knock(folk.gateAt(gate.x + gate.ox * 3, gate.z + gate.oz * 3), { gold: 10000 });
  assert.equal(knock.ok, false);
  assert.equal(w.features.gateShut(w.town.id), true);
  // forced back to Known: a knock opens it (here there is no other reason to be shut, so it is
  // already open — the knock case that matters is the siege one below)
  const known = gateCtx(w, { band: 'known' });
  run(folk, outside, known, 0.6);
  assert.equal(folk.gateOf(w.town.id).shut, false);
  assert.equal(guard.huntingPlayer, false);
  // the pure rule, both ways
  const base = { hunted: true, centre: [0, 0], wallR: 100, home: [100, 0], reach: 42 };
  assert.equal(guardTargetsPlayer({ ...base, player: { x: 110, z: 0 } }), true);
  assert.equal(guardTargetsPlayer({ ...base, player: { x: 99, z: 0 } }), false);
  assert.equal(guardTargetsPlayer({ ...base, hunted: false, player: { x: 110, z: 0 } }), false);
});

test('always a way in: Known opens a besieged gate for knockSeconds, Disliked pays knockFee, Hunted is refused', () => {
  const w = world();
  pitchCampBy(w, w.town);
  const gate = w.features.gatesOf(w.town.id).find(g => g.doors);
  const at = { x: gate.x + gate.ox * 3, z: gate.z + gate.oz * 3 };
  // odd knobs, so the numbers are provably read
  const folk = folkFor(w, { knockFee: 37, knockSeconds: 7 });
  run(folk, at, gateCtx(w, { band: 'known' }), 0.6);
  assert.equal(folk.gateOf(w.town.id).shut, true);
  const hit = folk.gateAt(at.x, at.z);
  assert.ok(hit, 'no shut gate within reach of E');
  const player = { gold: 0 };
  assert.equal(folk.knock(hit, player).ok, true);
  assert.equal(player.gold, 0, 'Known paid a fee');
  run(folk, at, gateCtx(w, { band: 'known' }), 0.6);
  assert.equal(w.features.gateShut(w.town.id), false, 'the knock did not open it');
  assert.ok(walkIn(w, gate) < -6, 'the walker cannot get through a knocked-open gate');
  run(folk, at, gateCtx(w, { band: 'known' }), 7);
  assert.equal(w.features.gateShut(w.town.id), true, '`knockSeconds` is not read — still open after it ran out');
  // Disliked: 37 gold, and not a coin less
  const folkD = folkFor(w, { knockFee: 37, knockSeconds: 7 });
  run(folkD, at, gateCtx(w, { band: 'disliked' }), 0.6);
  const poor = { gold: 36 };
  assert.equal(folkD.knock(folkD.gateAt(at.x, at.z), poor).ok, false);
  assert.equal(poor.gold, 36);
  const rich = { gold: 100 };
  const paid = folkD.knock(folkD.gateAt(at.x, at.z), rich);
  assert.equal(paid.ok, true);
  assert.equal(rich.gold, 63, '`knockFee` is not what was charged');
  assert.deepEqual(knockOutcome('hunted', 1e6, 37), { ok: false, fee: 0, why: 'hunted' });
  w.camp.taken = true;
  folkD.update(0.1, at, { gates: gateCtx(w), level: 1 });
});

// ------------------------------------------------------------------------------------ saves

test('saves: nothing new is saved — a reload under siege derives the same gate state from what M1 saved', () => {
  const w = world();
  const camp = pitchCampBy(w, w.town);
  const player = { x: w.town.wx, z: w.town.wz };
  const before = folkFor(w);
  run(before, player, gateCtx(w), 0.6);
  // "reload": new sites from the SAVED taken keys (M1's ledger), a new folk, same world
  const reload = () => {
    const sites = createSites(SCENE, w.terrain, { seed: w.seed, balance, zones: w.zones, data: siteData(), taken: w.sites.takenKeys() });
    const moved = sites.sites.find(s => s.key === camp.key);
    moved.x = camp.x; moved.z = camp.z;                     // the same spot the test moved it to
    const folk = folkFor(w);
    run(folk, player, { ...gateCtx(w), camps: sites.sites }, 0.6);
    return folk.gateOf(w.town.id).shut;
  };
  assert.equal(before.gateOf(w.town.id).shut, true);
  assert.equal(reload(), true, 'a reload under siege came back open');
  w.sites.take(camp.key);
  assert.equal(reload(), false, 'a reload after the take came back shut');
  // the verdict is a pure function of its inputs: same in, same out, no hidden memory
  const v1 = gateVerdict({ siege: { gap: 10 }, band: 'known' }), v2 = gateVerdict({ siege: { gap: 10 }, band: 'known' });
  assert.deepEqual(v1, v2);
});

// ------------------------------------------------------------------------------------ guards

test('a gate guard greets by standing band: the Known line is the holder\'s own greeting, the others name the holder', () => {
  const odd = { ...factions.factions[0], short: 'the Zorvath Lodge', greeting: 'Quill and lantern, stranger.' };
  assert.equal(gateLine('known', odd), 'Quill and lantern, stranger.');
  for (const band of factions.bands.map(b => b.key).filter(k => k !== 'known')) {
    const line = gateLine(band, odd);
    assert.ok(/Zorvath Lodge/.test(line), `${band}: the line does not name the holder (${line})`);
    assert.ok(!/[{}]/.test(line), `${band}: a stray placeholder in "${line}"`);
  }
  // and through the real guard code: the greeting goes to the log once per approach
  const w = world();
  w.camp.taken = true;
  const gate = w.features.gatesOf(w.town.id).find(g => g.doors);
  const folk = folkFor(w);
  const home = [gate.x + gate.ox * 3.1, gate.z + gate.oz * 3.1];
  const played = [];
  const guard = {
    id: 'g2', name: 'Posted Guard', role: 'guard', guards: true, guardTimer: 0, target: null, node: w.town,
    x: home[0], z: home[1], y: 0, facing: 0, home, post: { facing: gate.yaw, gate: gate.index, side: -1 },
    actor: { ...stubActor(), setAnim: n => played.push(n) },
  };
  folk.live.set('test', [guard]);        // (not under the town's id: radius 0 would let it go)
  const logs = [];
  const near = { x: home[0] + gate.ox * 4, z: home[1] + gate.oz * 4 };
  const ctx = { ...gateCtx(w, { band: 'trusted' }), standingAt: () => ({ band: 'trusted', faction: odd }) };
  run(folk, near, ctx, 2, { onLog: t => logs.push(t) });
  const spoken = logs.filter(l => l.startsWith('Posted Guard'));
  assert.equal(spoken.length, 1, `spoke ${spoken.length} times in two seconds`);
  assert.ok(spoken[0].includes('Zorvath Lodge'));
  // Trusted at an open gate: the salute, started ONCE (not restarted every frame)
  assert.equal(played.filter(n => n === 'salute').length, 1, `salute asked for ${played.filter(n => n === 'salute').length} times`);
  folk.live.delete('test');
});

test('watchposts are manned: every watchpost a town built gets a guard spot within 2 m of it, clear of the building', () => {
  const w = world();
  let posts = 0;
  const bad = [];
  for (const t of w.features.settlements.filter(s => (s.size || 1) >= 3).slice(0, 12)) {
    w.features.update(t.wx, t.wz, true);
    const records = w.features.postsOf(t.id);
    const watch = records.filter(r => r.key === 'watchpost');
    // the role is BUILDING_INFO's: barracks carry it too, and they are not given a body outside
    assert.ok(records.every(r => r.role), 'a post record without a role');
    const spots = watchPosts(records);
    assert.equal(spots.length, watch.length);
    for (const s of spots) {
      posts++;
      const edge = Math.hypot(s.x - s.of.x, s.z - s.of.z) - s.of.r;
      if (!(edge >= 0 && edge <= 2)) bad.push(`${t.name}: ${edge.toFixed(2)} m from the watchpost`);
    }
  }
  assert.ok(posts >= 3, `only ${posts} watchposts across twelve towns`);
  assert.deepEqual(bad, []);
  assert.equal(watchPosts([{ key: 'barracks', x: 0, z: 0, yaw: 0, r: 4 }]).length, 0, 'a barracks guard is put outside');
});

// ------------------------------------------------------------------------------------ nightSpawn

/** The real EnemyField over the world, recording what it places. */
function fieldFor(w, seed) {
  const rpg = { rollRank: () => 'normal', pickModifiers: () => [] };
  const field = new EnemyField({
    scene: SCENE, terrain: w.terrain, rpg, defs: bestiary.enemies.slice(), bosses: bestiary.bosses, modifiers: bestiary.modifiers,
    zones: w.zones, balance: { ...balance, seed },
  });
  field.placed = [];
  // (a unit with the fields an escort link touches — js/actors.js `linkEscort` / `applyModifier`)
  field.add = async (def, level, x, z) => {
    const u = { id: field.placed.length + 1, defId: def.id, family: def.family, x, z, dmg: [1, 2], armor: 1, speed: 1, attackEvery: 1, derived: {} };
    field.placed.push(u);
    return u;
  };
  return field;
}

/** 500 spawns from a player standing just outside a town's watch; the family share of those within reach. */
async function nightRun(w, town, spec, family) {
  const field = fieldFor(w, 77);
  const safe = { x: town.wx, z: town.wz, r: townExtent(town).wall + 18 };
  field.safeZones = [safe];
  if (spec !== undefined) field.setNightSpawn(spec);
  const px = town.wx + safe.r + 30, pz = town.wz;
  let near = 0, fam = 0;
  const firsts = [];
  for (let i = 0; near < 500 && i < 4000; i++) {
    const leader = await field.spawnNear(px, pz, 5);
    if (!leader) continue;
    firsts.push(leader.family);
    if (Math.hypot(leader.x - safe.x, leader.z - safe.z) - safe.r > (spec?.reach ?? 400)) continue;
    near++;
    if (leader.family === family) fam++;
  }
  return { near, share: fam / Math.max(1, near), firsts };
}

test('nightSpawn is read: restless_dead at night makes half the spawns near a town undead; off, the spawns are untouched', async (t) => {
  const w = world();
  // the data really says so (and js/incidents.js merges it — tests/expansion.test.js)
  const rd = incidents.incidents.find(i => i.kind === 'restless_dead');
  assert.equal(rd?.effects?.nightSpawn, 'undead');
  // a town in open ground, so the ordinary table has no undead in it at all
  const town = w.features.settlements.find(t => (t.size || 1) >= 2 && !w.terrain.underwater(t.wx + townExtent(t).wall + 48, t.wz));
  const base = await nightRun(w, town, undefined, 'undead');
  const off = await nightRun(w, town, null, 'undead');
  assert.deepEqual(off.firsts, base.firsts, 'switched off, the spawner rolled a different sequence');
  assert.ok(base.near >= 500, `only ${base.near} spawns near the town`);
  const on = await nightRun(w, town, { family: 'undead', share: 0.5, reach: 400 }, 'undead');
  assert.ok(on.near >= 500);
  assert.ok(on.share >= 0.4, `with restless_dead ${(on.share * 100).toFixed(1)}% undead (baseline ${(base.share * 100).toFixed(1)}%)`);
  assert.ok(on.share > base.share + 0.3);
  // the family is read, not assumed: an odd one comes out instead
  const odd = await nightRun(w, town, { family: 'construct', share: 0.5, reach: 400 }, 'construct');
  assert.ok(odd.share >= 0.4, `family 'construct' came out at ${(odd.share * 100).toFixed(1)}%`);
  // and the share is read
  const most = await nightRun(w, town, { family: 'undead', share: 0.9, reach: 400 }, 'undead');
  assert.ok(most.share > 0.8, `share 0.9 came out at ${(most.share * 100).toFixed(1)}%`);
  t.diagnostic(`${town.name}: undead ${(base.share * 100).toFixed(1)}% off, ${(on.share * 100).toFixed(1)}% on (500 spawns within 400 m); construct ${(odd.share * 100).toFixed(1)}%; share 0.9 -> ${(most.share * 100).toFixed(1)}%`);
});

test('the verdict: siege and hunted shut, exemption and a knock open, a knock never beats Hunted', () => {
  assert.equal(gateVerdict({}).shut, false);
  assert.equal(gateVerdict({ siege: {} }).shut, true);
  assert.equal(gateVerdict({ band: 'hunted' }).shut, true);
  assert.equal(gateVerdict({ siege: {}, exempt: true }).shut, false);
  assert.equal(gateVerdict({ siege: {}, knocked: true }).shut, false);
  assert.equal(gateVerdict({ band: 'hunted', knocked: true }).shut, true);
  assert.equal(gateVerdict({ band: 'hunted', exempt: true }).shut, false);
});
