// node --test prototypes/farhold/tests/orphans-c.test.js
//
// R19 — SIX RULES THAT WERE WRITTEN INTO A DATA FILE AND READ BY NOBODY.
//
// This project's signature fault, the sixth round running: a field in a .json that states a rule,
// and no line of code anywhere that asks about it. Every one of these looked wired — three of them
// had a code-side DEFAULT that happened to be the same number as the data, which is the worst
// shape the fault comes in, because a balance pass changes the file, nothing happens, and nobody
// can tell whether the knob is broken or the design is wrong.
//
//   1. data/vehicles.json  `shelter`               — a cab and glass. Read by nothing.
//      data/vehicles.json  `tow`                   — its own _doc named js/shipyard.js. Read by nothing.
//   2. data/job-frames.json `scopes.*.maxZoneHops` — R14 read `maxMetres` off the same block.
//   3. data/structures.json `rules.terraformBudget` — every other key in `rules` was unpacked.
//   4. data/mercenaries.json `brings`              — the Houndmaster's hound. 700 gold, no hound.
//   5. data/strongholds.json `gives.callsBeast`    — a log line promising something that never came.
//   6. `maxAlive: 6`                               — the same cap written out twice in js/pets.js.
//
// EVERY TEST HERE SETS THE KNOB TO AN UNUSUAL VALUE AND WATCHES BEHAVIOUR MOVE. A test that reads
// the data file and compares it to a constant proves only that two copies of a number agree, which
// is exactly what was true of all six of these while they did nothing at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createTerraform } from '../js/terraform.js';
import { createBuildPlan } from '../js/buildplan.js';
import { createJobGen, candidatesFrom, SCOPE_HOPS } from '../js/jobgen.js';
import { createFollowers, admit, slotsForLevel } from '../js/followers.js';
import { createEncounters } from '../js/encounters.js';
import {
  GROUND_VEHICLES, sheltered, canTow, haulCapacity, towCapacity, firstTower, describeVehicle,
} from '../js/vehicles.js';
import { stationGate, nextStep, yard, STATION } from '../js/shipyard.js';
import { startingVehicles, unlockVehicle } from '../js/gear.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const vehicleData = read('../data/vehicles.json');
const mercData = read('../data/mercenaries.json');
const frameData = read('../data/job-frames.json');
const catalogue = read('../data/structures.json');
const strongholds = read('../data/strongholds.json');
const landmarks = read('../data/landmarks.json');

/** A 0..1 stream with the `.pick` js/encounters.js expects on the enemy field's rng. */
function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  r.pick = arr => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];
  return r;
}

/** A player holding one ground vehicle, selected. */
function driver(key) {
  return { level: 10, vehicles: { owned: { ground: key ? [key] : [] }, active: { ground: key || null }, rigs: {} } };
}

// ---------------------------------------------------------------- 1a. `shelter`

test('R19/1a — `shelter` is read off the data, not written into the code', () => {
  assert.equal(sheltered(driver('car')), true, 'the car has a cab and glass');
  assert.equal(sheltered(driver('motorcycle')), false);
  assert.equal(sheltered(driver(null)), false, 'on foot is not shelter');

  // the knob, moved: the bike grows a roof and the answer follows the file rather than a hard list
  const was = GROUND_VEHICLES.motorcycle.shelter;
  try {
    GROUND_VEHICLES.motorcycle.shelter = true;
    assert.equal(sheltered(driver('motorcycle')), true, 'shelter is hard-coded somewhere');
  } finally { GROUND_VEHICLES.motorcycle.shelter = was; }
});

/**
 * The join, which is the half that was missing: the flag has to reach the thing that decides what
 * comes at you in the dark. One night-only set piece in the table, one player, two vehicles.
 */
function nightRoll(vehicleKey) {
  const table = [{ id: 'night_thing', name: 'Night thing', weight: 10, nightOnly: true, count: [1, 1], announce: 'Something is out here.' }];
  const enc = createEncounters({
    field: { rng: makeRng(7), enemies: [], pending: 0, paused: false, rpg: { rollRank: () => 'normal' }, defsFor: () => [], wild: () => true, addRanked: async () => null },
    zones: { levelFor: () => 5, at: () => ({ id: 1, name: 'Nowhere' }) },
    // underwater everywhere, so `run` bails before it touches a body: this test is about the PICK
    terrain: { clampToWorld: (x, z) => [x, z], underwater: () => true },
    balance: { encounters: { everySeconds: 0, chance: 1 }, spawn: { maxAlive: 38 } },
    data: { encounters: table, events: [] },
    isNight: () => true,
  });
  return enc.update(1, { x: 0, z: 0, yaw: 0 }, driver(vehicleKey));
}

test('R19/1a — nothing that hunts at night comes for somebody sitting in a cab', () => {
  const open = nightRoll('motorcycle');
  assert.ok(open, 'the night-only set piece never rolled at all, so this proves nothing');
  assert.equal(open.id, 'night_thing');

  assert.equal(nightRoll('car'), null, 'the car\'s roof bought nothing — `shelter` is not read');

  // …and it is the FLAG doing it, not the word "car"
  const was = GROUND_VEHICLES.car.shelter;
  try {
    GROUND_VEHICLES.car.shelter = false;
    assert.ok(nightRoll('car'), 'the shelter rule is keyed on something other than the data');
  } finally { GROUND_VEHICLES.car.shelter = was; }
});

// ---------------------------------------------------------------- 1b. `tow`

test('R19/1b — `tow` gates what a vehicle can move, and `haul` is only the amount', () => {
  assert.equal(canTow(GROUND_VEHICLES.truck), true);
  assert.equal(canTow(GROUND_VEHICLES.car), false);
  assert.equal(haulCapacity(driver('truck')), GROUND_VEHICLES.truck.haul);
  assert.equal(haulCapacity(driver('car')), 0);

  // the two fields are one rule, so they must never be able to disagree
  for (const [key, spec] of Object.entries(GROUND_VEHICLES)) {
    assert.equal(!!spec.tow, (spec.haul || 0) > 0, `${key}: tow and haul say different things`);
  }

  // a bed with nothing to hitch it to moves nothing, however big the bed
  const was = GROUND_VEHICLES.truck.tow;
  try {
    GROUND_VEHICLES.truck.tow = false;
    assert.equal(haulCapacity(driver('truck')), 0, '`tow` is not read — `haul` is being used alone');
    assert.equal(towCapacity(driver('truck')), 0);
  } finally { GROUND_VEHICLES.truck.tow = was; }

  assert.equal(firstTower()?.key, 'truck', 'the refusal would not know what to tell you to build');
  // and the card says both, because a rule the player cannot read is a rule they cannot use
  const card = describeVehicle('truck').lines.join(' | ');
  assert.match(card, /night stays outside/);
  assert.match(card, /hitches a load/);
});

test('R19/1b — the orbital yard will not lift a module you cannot get to the pad', () => {
  const player = { gold: 0, vehicles: startingVehicles() };
  unlockVehicle(player, 'ship', STATION.requires.ship, { granted: true });
  yard(player).pad = true;
  yard(player).built.warp = 1;
  for (const id of ['hull', 'drive', 'tanks', 'avionics']) yard(player).built[id] = 3;
  yard(player).fuel = 999;

  const refused = stationGate(player);
  assert.equal(refused.ok, false);
  assert.match(refused.why, /reach the pad/, 'the yard does not care how a module gets to the pad');
  assert.deepEqual(refused.behind, ['tow']);
  // …and §9.16's one-line "what next" says so instead of counting modules nothing can lift
  assert.match(nextStep(player).text, /reach the pad/);

  player.vehicles.owned.ground = ['truck'];
  assert.equal(stationGate(player).ok, true, 'owning the flatbed did not satisfy the gate');
  assert.match(nextStep(player).text, /module/);

  // the knob: it is the truck's `tow` flag and not its name
  const was = GROUND_VEHICLES.truck.tow;
  try {
    GROUND_VEHICLES.truck.tow = false;
    assert.equal(stationGate(player).ok, false, 'the gate is keyed on the vehicle id, not on `tow`');
  } finally { GROUND_VEHICLES.truck.tow = was; }
});

// ---------------------------------------------------------------- 2. `maxZoneHops`

/** One frame, one slot, one settlement candidate standing `hops` borders away. */
function board(maxZoneHops, hops) {
  const data = {
    scopes: { local: { name: 'here', maxZoneHops } },
    frames: [{
      id: 'walk_it_over', scope: 'local', weight: 9,
      needs: [{ slot: 'town', type: 'settlement' }],
      title: 'Take it to {town}', text: 'Carry it to {town}.',
      goal: { kind: 'deliver', at: '{town}', count: 1 },
      reward: { gold: [10, 20], xp: [5, 10] },
    }],
  };
  const jobs = createJobGen({ frames: data, seed: 3 });
  return jobs.offer({
    zone: { id: 1, name: 'Home Vale', midLevel: 3 },
    level: 3, want: 3,
    candidates: [{ type: 'settlement', id: 't9', name: 'Fallow', away: 900, zoneLevel: 3, zoneHops: hops }],
  });
}

test('R19/2 — a `local` errand may not point across a border, because the data says nought hops', () => {
  assert.equal(frameData.scopes.local.maxZoneHops, 0, 'the data no longer states the rule under test');

  // one border away, and the scope allows none: the frame is skipped in silence, exactly as it is
  // when a slot has nothing to bind to
  assert.equal(board(0, 1).length, 0, 'a "local" job bound a town in the next zone');
  // the same candidate, in the same zone, at the same distance: offered
  assert.equal(board(0, 0).length, 1);

  // the knob: widen the scope in the DATA and the identical candidate becomes legal
  assert.equal(board(2, 1).length, 1, '`maxZoneHops` is not read — the cap is hard-coded');
  assert.equal(board(2, 3).length, 0, 'three borders is past a cap of two');

  // an unknown scope falls back to this file's table rather than to "anywhere"
  assert.equal(SCOPE_HOPS.local, 0);
  assert.equal(SCOPE_HOPS.adjacent, 1);
});

test('R19/2 — `candidatesFrom` stamps how many borders away a thing is', () => {
  const nodes = [{ id: 4, type: 'settlement', name: 'Fallow', x: 3, y: 3 }];
  const home = { id: 1, name: 'Home Vale', minLevel: 1 };
  const away = { id: 2, name: 'Far Fen', minLevel: 9 };

  const inZone = candidatesFrom({
    zone: home, nodes, from: { x: 0, z: 0 }, metresPerCell: 100, zoneAt: () => home,
  }).find(c => c.type === 'settlement');
  assert.equal(inZone.zoneHops, 0, 'the zone you are standing in is nought borders away');

  const next = candidatesFrom({
    zone: home, nodes, from: { x: 0, z: 0 }, metresPerCell: 100, zoneAt: () => away,
  }).find(c => c.type === 'settlement');
  assert.equal(next.zoneHops, 1, 'somewhere else is at least one border away');

  // …and a caller who knows the region graph gets the real count
  const far = candidatesFrom({
    zone: home, nodes, from: { x: 0, z: 0 }, metresPerCell: 100, zoneAt: () => away,
    hopsBetween: () => 4,
  }).find(c => c.type === 'settlement');
  assert.equal(far.zoneHops, 4);

  // no zone lookup at all (every existing node test) leaves it unstamped, so nothing is filtered
  const blind = candidatesFrom({ zone: home, nodes, metresPerCell: 100 }).find(c => c.type === 'settlement');
  assert.equal(blind.zoneHops, undefined);
});

// ---------------------------------------------------------------- 3. `terraformBudget`

test('R19/3 — the catalogue\'s terraform budget reaches the book that enforces it', () => {
  assert.ok(catalogue.rules.terraformBudget > 0, 'the data no longer states the rule under test');

  const ground = createTerraform();
  createBuildPlan({ catalogue, terrain: null, terraform: ground });
  assert.equal(ground.budget, catalogue.rules.terraformBudget, 'the JSON budget never reached js/terraform.js');
  assert.equal(ground.maxLift, catalogue.rules.maxLift);

  // the knob, at an unusual value: a tiny allowance genuinely stops the second brush
  const small = createTerraform();
  createBuildPlan({ catalogue: { ...catalogue, rules: { ...catalogue.rules, terraformBudget: 600, maxLift: 2 } }, terraform: small });
  assert.equal(small.budget, 600);
  // one 8 m pad with its skirt is about 450 m², so the first fits inside 600 and the second cannot
  assert.equal(small.level({ x: 0, z: 0, r: 8, h: 0, claim: 'c1' }).ok, true);
  const second = small.level({ x: 400, z: 0, r: 8, h: 0, claim: 'c1' });
  assert.equal(second.ok, false, '`terraformBudget` is decoration — the book is still on its default');
  assert.match(second.why, /allows/);

  // …and the lift cap with it: 2 m is 2 m however hard you pull
  const lifted = small.raise({ x: 0, z: 0, r: 4, amount: 9, claim: 'c2' });
  assert.equal(lifted.edit.amount, 2, '`maxLift` never reached the book either');

  // a book made with no catalogue keeps the defaults it was born with
  const bare = createTerraform();
  createBuildPlan({ terraform: bare });
  assert.equal(bare.budget, 60000);
});

// ---------------------------------------------------------------- 4. `brings`

/** js/pets.js without a scene: the same door (`summon`), the same gate, no meshes. */
function fakePets() {
  const pets = [];
  let gate = null;
  let seq = 0;
  const api = {
    pets,
    register() {},
    setGate(fn) { gate = fn; },
    waiting: () => [],
    remove(uid) {
      const at = pets.findIndex(p => p.id === uid);
      if (at >= 0) pets.splice(at, 1);
      return at >= 0;
    },
    async summon(defId, owner, { count = 1, origin = 'summon', name = null } = {}) {
      const made = [];
      made.refused = null;
      for (let i = 0; i < count; i++) {
        const allow = gate ? gate(defId, { origin, name, pending: 0 }) : { ok: true };
        if (!allow.ok) { made.refused = allow.why; break; }
        const unit = { id: 'u' + (++seq), defId, name: name || defId, origin, level: owner.level || 1, dying: null };
        // what js/pets.js's `applyUpgrades` stamps on a body when a level-gated upgrade fires
        const def = (mercData.mercenaries || []).find(m => m.id === defId);
        for (const up of def?.upgrades || []) {
          if ((owner.level || 1) >= (up.atLevel ?? 1) && up.bringsCount) unit.bringsCount = up.bringsCount;
        }
        pets.push(unit);
        made.push(unit);
      }
      return made;
    },
  };
  return api;
}

function hirer(level = 14) {
  const player = { level, gold: 100000, derived: {}, followers: { contracts: [] } };
  const pets = fakePets();
  const book = createFollowers({ data: mercData, pets, getPlayer: () => player, getAt: () => ({ x: 0, z: 0 }) });
  return { player, pets, book };
}

test('R19/4 — the Houndmaster arrives with the hound you paid for', async () => {
  const merc = (mercData.mercenaries || []).find(m => m.id === 'houndmaster');
  assert.ok(merc?.brings?.id, 'the data no longer states the rule under test');

  const { pets, book } = hirer(14);
  const got = await book.hire('houndmaster', {});
  assert.equal(got.ok, true, got.why);
  assert.equal(got.brought.length, merc.brings.count, 'the dog is half of what a Houndmaster costs');

  const hound = pets.pets.find(p => p.defId === merc.brings.id);
  assert.ok(hound, '`brings` is not read — the hound does not exist');
  assert.equal(hound.origin, 'companion', 'the hound must not spend a follower slot of its own');
  assert.equal(hound.broughtBy, got.unit.id, 'nothing joins the hound to its handler');

  // it shows up on the Followers screen at both ends of the leash
  const rows = book.report().followers;
  assert.deepEqual(rows.find(r => r.uid === got.unit.id).brought, [hound.name]);
  assert.equal(rows.find(r => r.uid === hound.id).broughtBy, got.unit.name);
});

test('R19/4 — `brings.count` and the upgrade\'s `bringsCount` are both read', async () => {
  const merc = (mercData.mercenaries || []).find(m => m.id === 'houndmaster');
  const was = merc.brings.count;
  try {
    merc.brings.count = 3;                        // the knob, at an unusual value
    const { pets, book } = hirer(14);
    await book.hire('houndmaster', {});
    assert.equal(pets.pets.filter(p => p.defId === merc.brings.id).length, 3,
      '`brings.count` is not read — the number of animals is hard-coded');
  } finally { merc.brings.count = was; }

  // "works a second hound" at level 32 — an absolute number, not an extra one
  const grown = hirer(34);
  await grown.book.hire('houndmaster', {});
  const upgrade = (merc.upgrades || []).find(u => u.bringsCount);
  assert.equal(grown.pets.pets.filter(p => p.defId === merc.brings.id).length, upgrade.bringsCount,
    'the level-32 upgrade\'s `bringsCount` is not read');
});

test('R19/4 — the hound leaves when its handler does, and cannot be sent away alone', async () => {
  const { pets, book } = hirer(14);
  const got = await book.hire('houndmaster', {});
  const hound = pets.pets.find(p => p.origin === 'companion');

  const alone = book.dismiss(hound.id);
  assert.equal(alone.ok, false);
  assert.match(alone.why, /answers to/, 'an animal on somebody else\'s rope took orders from you');

  const out = book.dismiss(got.unit.id);
  assert.equal(out.ok, true);
  assert.equal(out.released, 1);
  assert.equal(pets.pets.length, 0, 'the handler walked off and left the dog standing in the road');
});

// ---------------------------------------------------------------- 5. `callsBeast`

/** The set-piece roll, with one place nearby that may or may not be calling something. */
async function calledFight(site) {
  const picked = [];
  const defs = [
    { id: 'moor_hound', family: 'beast', role: 'brute' },
    { id: 'road_thug', family: 'human', role: 'brute' },
  ];
  const enc = createEncounters({
    field: {
      rng: makeRng(11), enemies: [], pending: 0, paused: false,
      rpg: { rollRank: () => 'normal' },
      defsFor: () => defs,
      wild: () => true,
      addRanked: async (def, level, x, z, rank) => {
        const unit = { defId: def.id, family: def.family, rank, name: def.id, dying: null };
        picked.push(unit);
        return unit;
      },
    },
    zones: { levelFor: () => 6, at: () => ({ id: 1, name: 'Nowhere' }) },
    terrain: { clampToWorld: (x, z) => [x, z], underwater: () => false },
    balance: { encounters: { everySeconds: 0, chance: 1 }, spawn: { maxAlive: 38 } },
    data: { encounters: [{ id: 'pack', name: 'A pack', weight: 10, count: [1, 1], escort: [0, 0], announce: 'Something is out here.' }], events: [] },
    isNight: () => false,
    sites: site ? { visible: [site] } : null,
  });
  await enc.force('pack', { x: 0, z: 0, yaw: 0 }, 6);
  return picked[0];
}

test('R19/5 — a baited hook calls something bigger, which is what the log had been promising', async () => {
  const blind = (landmarks.kinds || landmarks.landmarks || []).find(k => k.gives?.callsBeast);
  assert.ok(blind, 'the data no longer states the rule under test');
  assert.equal(blind.gives.callsBeast, 'champion');

  const plain = await calledFight(null);
  assert.equal(plain.rank, 'normal', 'the ordinary roll is not ordinary, so this proves nothing');

  // a landmark you have USED — js/main.js sets `taken` through `sites.markTaken` on the first
  // payout, the same moment it prints "Bait on the hook. Something bigger than usual will come."
  const baited = await calledFight({ x: 30, z: 20, hostile: false, taken: true, cleared: false, gives: blind.gives });
  assert.equal(baited.rank, 'champion', '`callsBeast` is not read — nothing bigger ever came');
  assert.equal(baited.family, 'beast', 'a bait hook drew a person rather than a beast');

  // …and an unbaited hook draws nothing, because a hook with nothing on it is a platform in a tree
  const empty = await calledFight({ x: 30, z: 20, hostile: false, taken: false, cleared: false, gives: blind.gives });
  assert.equal(empty.rank, 'normal');

  // the knob: the RANK comes out of the file
  const was = blind.gives.callsBeast;
  try {
    blind.gives.callsBeast = 'rare';
    const odd = await calledFight({ x: 30, z: 20, hostile: false, taken: true, cleared: false, gives: blind.gives });
    assert.equal(odd.rank, 'rare', 'the rank is hard-coded rather than read');
  } finally { blind.gives.callsBeast = was; }
});

test('R19/5 — a beast lair is the bait while something still lives in it', async () => {
  const lair = (strongholds.kinds || []).find(k => k.kind === 'beast_lair');
  assert.equal(lair.gives.callsBeast, 'boss', 'the data no longer states the rule under test');

  const den = await calledFight({ x: 40, z: 0, hostile: true, cleared: false, gives: lair.gives });
  assert.equal(den.rank, 'boss');
  assert.equal(den.family, 'beast');

  // cleared, and the ground round it is ordinary again
  const quiet = await calledFight({ x: 40, z: 0, hostile: true, cleared: true, gives: lair.gives });
  assert.equal(quiet.rank, 'normal', 'an emptied den was still calling things out of the hills');

  // and distance still matters: a den on the far side of the zone has no say
  const far = await calledFight({ x: 4000, z: 0, hostile: true, cleared: false, gives: lair.gives });
  assert.equal(far.rank, 'normal');
});

// ---------------------------------------------------------------- 6. one owner for `maxAlive`

test('R19/6 — the follower cap is one rule, and it can see the bodies on their way in', () => {
  const two = [{ defId: 'a', origin: 'summon' }, { defId: 'b', origin: 'mercenary' }];

  // two of three slots filled and nothing in flight: there is room
  assert.equal(admit({ defId: 'c', alive: two, limit: 3, perTypeCap: 1 }).ok, true);
  // …and the same question with one body being built is a no, which is the hole the second,
  // hard-coded cap in js/pets.js used to cover for (badly: it was a flat six)
  const busy = admit({ defId: 'c', alive: two, limit: 3, perTypeCap: 1, pending: 1 });
  assert.equal(busy.ok, false, '`pending` is not read — three wolves fit in one free slot');
  assert.match(busy.why, /3 of 3/);

  // class companions are still outside both limits, pending or not
  const withPets = [...two, { defId: 'grove_wolf', origin: 'companion' }];
  assert.equal(admit({ defId: 'grove_wolf', alive: withPets, limit: 3, perTypeCap: 1 }).ok, true);

  // a run with more slots than the old flat six is legitimate, and nothing secretly caps it
  const many = Array.from({ length: 6 }, (_, i) => ({ defId: 'm' + i, origin: 'mercenary' }));
  assert.equal(admit({ defId: 'm7', alive: many, limit: 7, perTypeCap: 1 }).ok, true,
    'a seventh follower was refused by a cap that is not the slot rule');
  assert.ok(slotsForLevel(30, { followerSlots: 2 }) > 6, 'the ladder cannot reach past six at all');
});

test('R19/6 — js/pets.js writes the body cap down once', () => {
  // comments stripped: this round's own comment quotes the old line, and quoting it is the point
  const pets = src('../js/pets.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fallbacks = pets.match(/maxAlive\s*\?\?\s*[\w.]+/g) || [];
  assert.equal(fallbacks.length, 1,
    `the pets cap has ${fallbacks.length} fallbacks written out: ${fallbacks.join(', ')}`);
  assert.match(fallbacks[0], /DEFAULT_BODY_CAP/, 'the fallback is a bare number again');
  assert.match(pets, /const bodyCap = \(\) =>/, 'the one owner of the body cap has gone');
  assert.match(pets, /gate\(defId, \{ \.\.\.opts, pending \}\)/, 'the gate cannot see bodies on their way in');
});

// ---------------------------------------------------------------- the data still says all of it

test('R19 — every field this round wired up is still in the data that states it', () => {
  for (const [key, spec] of Object.entries(vehicleData.vehicles)) {
    assert.equal(typeof spec.shelter, 'boolean', `${key} lost its shelter flag`);
    assert.equal(typeof spec.tow, 'boolean', `${key} lost its tow flag`);
  }
  for (const [name, scope] of Object.entries(frameData.scopes)) {
    assert.equal(typeof scope.maxZoneHops, 'number', `scope ${name} lost its hop cap`);
  }
  assert.equal(typeof catalogue.rules.terraformBudget, 'number');
  assert.ok((mercData.mercenaries || []).some(m => m.brings?.id));
  assert.ok((strongholds.kinds || []).some(k => k.gives?.callsBeast));
});
