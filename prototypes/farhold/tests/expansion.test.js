// node --test prototypes/farhold/tests/expansion.test.js
//
// The Territory expansion: twelve factions who feel what you do, a zone that changes hands, and a
// job generator that can only ask you for things that are actually there.
//
// The one rule every test below is really checking: NOTHING IS INVENTED. A job names a camp that is
// standing, a caravan that is really late, a named enemy that really did beat you — or it is not
// offered at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStandings, bandOf, factionOf, holderFor, holdScore, ranked } from '../js/factions.js';
import { createTerritory } from '../js/territory.js';
import { createJobGen, candidatesFrom, phrase } from '../js/jobgen.js';
import { createIncidents, NO_EFFECT } from '../js/incidents.js';
import { createPatrols, COMPOSITIONS, reactionTo } from '../js/patrols.js';
import { createCaravans, CARGO } from '../js/caravans.js';
import { createWanderers, suits } from '../js/wanderers.js';
import { createRumours, KINDS } from '../js/rumours.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const factions = read('../data/factions.json');
const frames = read('../data/job-frames.json');
const incidentData = read('../data/incidents.json');
const wandererData = read('../data/wanderers.json');
const landmarkData = read('../data/landmarks.json');
const rewards = read('../data/faction-rewards.json');

/** A small pretend world: five zones with real-looking fields. */
function zonesFixture() {
  const list = [
    { id: 0, name: 'Gaina Basin', danger: 'Settled', band: 0, minLevel: 1, maxLevel: 4, home: true, cells: [{ x: 10, y: 10 }, { x: 11, y: 10 }], center: { x: 10, y: 10 } },
    { id: 1, name: 'Menwin Weald', danger: 'Open country', band: 1, minLevel: 5, maxLevel: 8, cells: [{ x: 20, y: 12 }, { x: 21, y: 12 }], center: { x: 20, y: 12 } },
    { id: 2, name: 'The Iron Hollow', danger: 'Wild', band: 2, minLevel: 9, maxLevel: 12, cells: [{ x: 30, y: 20 }], center: { x: 30, y: 20 } },
    { id: 3, name: 'The Quill Steppe', danger: 'Lawless', band: 3, minLevel: 13, maxLevel: 16, cells: [{ x: 40, y: 8 }], center: { x: 40, y: 8 } },
    { id: 4, name: 'The Grey Vale', danger: 'Hostile', band: 4, minLevel: 17, maxLevel: 20, cells: [{ x: 50, y: 30 }], center: { x: 50, y: 30 } },
  ];
  return { zones: list, byId: id => list.find(z => z.id === id) || null, list: () => list.slice() };
}

const BESTIARY = [
  { id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 12 },
  { id: 'bog_lurker', name: 'Bog Lurker', minLevel: 2, maxLevel: 14, champion: true },
  { id: 'cinder_shade', name: 'Cinder Shade', minLevel: 4, maxLevel: 18, champion: true, element: 'fire' },
];

const NODES = [
  { id: 1, type: 'dungeon', name: 'The Sunk Gallery', x: 12, y: 11 },
  { id: 2, type: 'settlement', name: 'Herdalkeep', x: 10, y: 10 },
  { id: 3, type: 'landmark', name: 'The Stones', x: 14, y: 9 },
];

// ---------------------------------------------------------------- data files

test('every faction is complete, and every rival is a real faction', () => {
  assert.equal(factions.factions.length, 12, 'the plan says twelve');
  const keys = new Set(factions.factions.map(f => f.key));
  for (const f of factions.factions) {
    assert.ok(f.name && f.short && f.blurb && f.greeting, `${f.key} is not described`);
    assert.ok(f.colour && /^#[0-9a-f]{6}$/i.test(f.colour), `${f.key} has no colour`);
    assert.ok((f.sites || []).length >= 1, `${f.key} has nowhere on the ground`);
    for (const site of f.sites) assert.ok(factions.siteKinds[site], `${f.key} claims a site kind that is not declared: ${site}`);
    for (const r of f.rivals || []) assert.ok(keys.has(r), `${f.key} is at odds with nobody called ${r}`);
    assert.ok(!f.rivals?.includes(f.key), `${f.key} is at odds with itself`);
  }
  // five bands, covering -100..100 with no gap
  let cover = 0;
  for (const b of factions.bands) cover += b.max - b.min + 1;
  assert.equal(cover, 201, 'the standing bands do not tile -100..100');
});

test('every data file the expansion ships is the size the plan promised', () => {
  assert.ok(frames.frames.length >= 18, `only ${frames.frames.length} job frames`);
  assert.ok(incidentData.incidents.length >= 12, `only ${incidentData.incidents.length} incidents`);
  // R14 removed `tax_collector` on the user's ask — "I had an event at town from a tax collector
  // who took some money. Remove that lol." — which took the floor from 14 to 13.
  assert.ok(wandererData.kinds.length >= 13, `only ${wandererData.kinds.length} kinds of wanderer`);
  assert.ok(!wandererData.kinds.some(k => k.key === 'tax_collector'), 'the tax collector is gone for good');
  assert.ok(landmarkData.landmarks.length >= 14, `only ${landmarkData.landmarks.length} landmarks`);
  assert.ok(Object.keys(CARGO).length >= 10, 'fewer than ten cargo manifests');
  assert.ok(Object.keys(COMPOSITIONS).length >= 10, 'fewer than ten patrol compositions');
  assert.ok(KINDS.length >= 12, 'fewer than twelve kinds of rumour');
});

test('every rank reward names a real faction and a real rank', () => {
  const keys = new Set(factions.factions.map(f => f.key));
  const ranks = new Set(rewards.ranks.map(r => r.key));
  for (const [key, list] of Object.entries(rewards.rewards)) {
    assert.ok(keys.has(key), `rewards for nobody called ${key}`);
    for (const row of list) {
      assert.ok(ranks.has(row.rank), `${row.id} is at a rank that does not exist`);
      assert.ok(row.name && row.desc && row.effect, `${row.id} is not described`);
    }
  }
  // the Hollowed cannot be liked, so they have nothing to offer — and the code agrees
  assert.deepEqual(rewards.rewards.hollowed, []);
  assert.equal(factionOf(factions, 'hollowed').unlikeable, true);
});

// ---------------------------------------------------------------- standing

test('a deed for one faction is a third of a deed against their rivals', () => {
  const s = createStandings(factions);
  s.deed('wardens_reach', 'job_done');                 // +6
  assert.equal(s.get('wardens_reach'), 6);
  // the Reach are at odds with the Pact and the Cut: each takes -2
  assert.equal(s.get('ashen_pact'), -2);
  assert.equal(s.get('cutwater'), -2);
  // and nobody else moved
  assert.equal(s.get('greenhand'), 0);
});

test('you cannot be liked by everybody', () => {
  const s = createStandings(factions);
  // work only for the Reach, as hard as you like
  for (let i = 0; i < 40; i++) s.deed('wardens_reach', 'job_done');
  assert.equal(s.band('wardens_reach').key, 'sworn');
  assert.equal(s.band('ashen_pact').key, 'hunted', 'the people they fight should have noticed');
  assert.ok(s.hostile('ashen_pact'));
});

test('standing bands change what you are charged, and clamp at the ends', () => {
  const s = createStandings(factions);
  assert.equal(s.priceMult('greenhand'), 1);
  s.add('greenhand', 100);
  assert.equal(s.get('greenhand'), 100, 'standing should clamp at 100');
  assert.equal(s.band('greenhand').key, 'sworn');
  assert.ok(s.priceMult('greenhand') < 1, 'the people who are sworn to you should not overcharge');
  s.add('greenhand', -500);
  assert.equal(s.get('greenhand'), -100, 'and clamp at -100');
  assert.equal(s.band('greenhand').key, 'hunted');
  assert.equal(bandOf(factions, 0).key, 'known');
});

test('the Hollowed can be hated and never liked', () => {
  const s = createStandings(factions);
  s.add('hollowed', 60);
  assert.equal(s.get('hollowed'), 0, 'they are not people and there is nobody to negotiate with');
  s.add('hollowed', -40);
  assert.equal(s.get('hollowed'), -40);
  assert.ok(s.hostile('hollowed'));
});

test('who holds a zone comes from what the ground is', () => {
  // a settled grassland should not be held by the void-touched
  const settled = { danger: 'Settled', biome: 'grass', level: 2 };
  const wild = { danger: 'Hostile', biome: 'ash', level: 40 };
  const green = factionOf(factions, 'greenhand');
  const hollow = factionOf(factions, 'hollowed');
  assert.ok(holdScore(green, { ...settled, danger: 'settled' }) > holdScore(hollow, { ...settled, danger: 'settled' }));
  assert.ok(holdScore(hollow, { ...wild, danger: 'hostile' }) > holdScore(green, { ...wild, danger: 'hostile' }));
  // and the picker is deterministic
  const a = holderFor(factions, settled, 12345);
  const b = holderFor(factions, settled, 12345);
  assert.equal(a.key, b.key);
});

test('a world is not four factions repeated', () => {
  const zones = zonesFixture();
  const seen = new Set();
  for (let seed = 0; seed < 40; seed++) {
    for (const z of zones.zones) seen.add(holderFor(factions, z, seed * 7919 + z.id).key);
  }
  assert.ok(seen.size >= 6, `only ${seen.size} factions ever hold anything`);
});

test('the standing screen sorts by how they feel about you', () => {
  const s = createStandings(factions);
  s.add('greenhand', 40);
  s.add('ashen_pact', -30);
  const rows = ranked(factions, s);
  assert.equal(rows[0].key, 'greenhand');
  assert.equal(rows[rows.length - 1].key, 'ashen_pact');
  assert.equal(rows.length, 12);
});

// ---------------------------------------------------------------- territory

test('a zone you have never entered already has a holder and real sites', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 7, factions, metresPerCell: 224 });
  const record = land.of(2);
  assert.ok(record.holder, 'nobody holds it');
  assert.ok(record.sites.length >= 2, 'it has nothing on the ground');
  for (const site of record.sites) {
    assert.ok(Number.isFinite(site.x) && Number.isFinite(site.z), `${site.id} is nowhere`);
    assert.ok(site.name && site.kind, `${site.id} is not anything`);
  }
  // and it is the same zone on a second build from the same seed
  const again = createTerritory({ zones, seed: 7, factions, metresPerCell: 224 }).of(2);
  assert.equal(again.holder, record.holder);
  assert.equal(again.sites.length, record.sites.length);
});

test('a level-1 zone is never held by the Hollowed', () => {
  const zones = zonesFixture();
  for (let seed = 0; seed < 60; seed++) {
    const land = createTerritory({ zones, seed, factions });
    assert.notEqual(land.of(0).holder, 'hollowed', `seed ${seed} put the Hollowed on the doorstep`);
  }
});

test('clearing camps loosens a grip, and enough of them change who holds the ground', () => {
  const zones = zonesFixture();
  const standings = createStandings(factions);
  const land = createTerritory({ zones, seed: 3, factions, standings });
  const record = land.of(3);
  record.grip = 0.5; record.claim = 0.6;      // a contested zone, on the edge
  const hostile = record.sites.filter(s => s.hostile);
  let flipped = null;
  for (const site of hostile) {
    const out = land.clearSite(3, site.id);
    if (out?.flipped) flipped = out.flipped;
  }
  if (hostile.length >= 3) {
    assert.ok(record.grip < 0.5, 'clearing camps should loosen the hold');
    assert.ok(flipped, 'a contested zone whose holder is beaten should change hands');
    assert.equal(record.holder, flipped.to);
  }
});

test('a cleared camp comes back if you leave it alone', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 11, factions });
  const record = land.of(4);
  const site = record.sites.find(s => s.hostile && s.respawnHours > 0);
  if (!site) return;                                  // this holder has no hostile sites
  land.clearSite(4, site.id);
  assert.equal(site.cleared, true);
  land.tick(site.respawnHours + 1);
  assert.equal(site.cleared, false, 'it should have come back');
});

test('a save carries the deltas and nothing else', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 5, factions });
  land.of(0); land.of(1); land.of(2);                 // three zones revealed
  assert.deepEqual(land.toJSON().zones, {}, 'looking at a zone should not write anything');
  const record = land.of(2);
  land.clearSite(2, record.sites[0].id);
  const saved = land.toJSON();
  assert.ok(saved.zones[2], 'the zone you changed should be written');
  assert.equal(Object.keys(saved.zones).length, 1, 'and only that one');

  // and it comes back
  const loaded = createTerritory({ zones, seed: 5, factions, saved });
  const back = loaded.of(2);
  assert.equal(back.sites[0].cleared, true);
  assert.ok(Math.abs(back.grip - record.grip) < 2e-3, 'grip is rounded to keep the save small, but not by much');
});

// ---------------------------------------------------------------- the job generator

test('a job is only offered when everything it names actually exists', () => {
  const zones = zonesFixture();
  const zone = zones.byId(1);
  const land = createTerritory({ zones, seed: 2, factions, metresPerCell: 224 });
  const jobs = createJobGen({ frames, territory: land, factions, seed: 2 });

  // nothing in the world at all: no bindings, so no board
  assert.deepEqual(jobs.offer({ zone, level: 5, candidates: [] }).filter(j => j.frame !== 'the_neighbour'), []);

  // now give it the real thing
  const candidates = candidatesFrom({
    zone, territory: land, bestiary: BESTIARY, nodes: NODES, level: 5, metresPerCell: 224,
  });
  const board = jobs.offer({ zone, level: 5, candidates, want: 5 });
  assert.ok(board.length > 0, 'a zone with camps, a dungeon and a bestiary should offer something');
  for (const job of board) {
    assert.ok(job.title && job.text, `${job.frame} is not phrased`);
    assert.ok(!/[{}]/.test(job.title + job.text), `${job.frame} left a placeholder in: ${job.title} / ${job.text}`);
    assert.equal(job.zoneId, zone.id);
    assert.ok(job.reward.gold >= 0 && job.reward.xp > 0);
  }
});

test('a job points at somewhere in the zone you are standing in', () => {
  const zones = zonesFixture();
  const zone = zones.byId(2);
  const land = createTerritory({ zones, seed: 8, factions, metresPerCell: 224 });
  const jobs = createJobGen({ frames, territory: land, factions, seed: 8 });
  const candidates = candidatesFrom({ zone, territory: land, bestiary: BESTIARY, nodes: NODES, level: 10, metresPerCell: 224 });
  for (const job of jobs.offer({ zone, level: 10, candidates, want: 5 })) {
    assert.ok(['local', 'adjacent'].includes(job.scope), `${job.frame} is scoped ${job.scope}`);
    if (job.scope === 'local' && job.place) {
      // the pin is a real place — one of the things we handed the generator
      const known = candidates.some(c => Math.abs((c.x ?? NaN) - job.place.x) < 1 && Math.abs((c.z ?? NaN) - job.place.z) < 1);
      assert.ok(known, `${job.frame} pinned somewhere nobody put anything: ${JSON.stringify(job.place)}`);
    }
  }
});

test('a board does not repeat itself', () => {
  const zones = zonesFixture();
  const zone = zones.byId(1);
  const land = createTerritory({ zones, seed: 4, factions, metresPerCell: 224 });
  const jobs = createJobGen({ frames, territory: land, factions, seed: 4 });
  const candidates = candidatesFrom({ zone, territory: land, bestiary: BESTIARY, nodes: NODES, level: 6, metresPerCell: 224 });
  const first = jobs.offer({ zone, level: 6, candidates, want: 3 }).map(j => j.frame);
  const second = jobs.offer({ zone, level: 6, candidates, want: 3 }).map(j => j.frame);
  const shared = first.filter(f => second.includes(f));
  assert.ok(shared.length < first.length, `the same board came back: ${first.join(', ')}`);
});

test('finishing a job pays the faction, presses the grip and leaves a rumour', () => {
  const zones = zonesFixture();
  const zone = zones.byId(2);
  const standings = createStandings(factions);
  const land = createTerritory({ zones, seed: 6, factions, standings });
  const jobs = createJobGen({ frames, territory: land, factions, standings, seed: 6 });
  const candidates = candidatesFrom({ zone, territory: land, bestiary: BESTIARY, nodes: NODES, level: 10, metresPerCell: 224 });
  const board = jobs.offer({ zone, level: 10, candidates, want: 6 });
  const job = board.find(j => j.onDone?.rumour) || board[0];
  const before = standings.get(job.faction);
  const grip = land.of(zone.id).grip;
  const out = jobs.complete(job);
  if (job.reward.standing) assert.ok(standings.get(job.faction) > before, 'the people who posted it should be pleased');
  if (Number.isFinite(job.onDone.grip)) assert.notEqual(land.of(zone.id).grip, grip);
  if (job.onDone.rumour) assert.ok(out.rumour && !/[{}]/.test(out.rumour), `the rumour kept a placeholder: ${out.rumour}`);
});

test('walking away from a job you took costs you', () => {
  const standings = createStandings(factions);
  const jobs = createJobGen({ frames, factions, standings });
  jobs.abandon({ faction: 'greenhand' });
  assert.equal(standings.get('greenhand'), -3);
});

test('phrase fills a slot and leaves an unbound one alone', () => {
  assert.equal(phrase('{site.name} has {beast.name} in it', {
    site: { name: 'the Sunk Gallery' }, beast: { name: 'a Bog Lurker' },
  }), 'the Sunk Gallery has a Bog Lurker in it');
  assert.equal(phrase('{nobody.name}', {}), '{nobody.name}');
});

// ---------------------------------------------------------------- incidents

test('an incident only starts when its condition is actually met', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 9, factions });
  const trouble = createIncidents({ data: incidentData, territory: land, factions, seed: 9 });
  const zone = zones.byId(3);

  const hunger = trouble.byKind('hunger');
  assert.equal(trouble.eligible(hunger, zone, {}), false, 'nothing was lost, so nobody is short');
  assert.equal(trouble.eligible(hunger, zone, { caravanLost: true }), true);

  // and once it is running it cannot start twice
  trouble.start(zone.id, 'hunger');
  assert.equal(trouble.eligible(hunger, zone, { caravanLost: true }), false);
});

test('running incidents merge into one set of numbers the game can read', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 13, factions });
  const trouble = createIncidents({ data: incidentData, territory: land, factions, seed: 13 });
  assert.deepEqual(trouble.effects(1).spawnMult, NO_EFFECT.spawnMult);
  trouble.start(1, 'hunger');       // shop x1.5
  trouble.start(1, 'restless_dead'); // spawn x1.3, undead at night
  const out = trouble.effects(1);
  assert.ok(Math.abs(out.shopMult - 1.5) < 1e-9);
  assert.ok(Math.abs(out.spawnMult - 1.3) < 1e-9);
  assert.equal(out.nightSpawn, 'undead');
  assert.ok(out.opensFrames.includes('feed_the_hold'));
  assert.ok(out.opensFrames.includes('the_wake'));
  assert.equal(trouble.describe(1).length, 2);
});

test('an incident expires, and stops mattering', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 15, factions });
  const trouble = createIncidents({ data: incidentData, territory: land, factions, seed: 15 });
  trouble.start(2, 'ash_fall');      // 24 hours
  assert.equal(trouble.describe(2).length, 1);
  land.tick(25);
  assert.equal(trouble.describe(2).length, 0);
  assert.equal(trouble.effects(2).fireDamage, 1);
});

// ---------------------------------------------------------------- patrols

test('a patrol walks a real route and comes back round', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 21, factions });
  const patrols = createPatrols({ territory: land, factions, seed: 21 });
  const route = [{ x: 0, z: 0, name: 'a' }, { x: 300, z: 0, name: 'b' }, { x: 300, z: 300, name: 'c' }];
  const list = patrols.enter(zones.byId(1), route);
  assert.ok(list.length >= 1);
  const p = list[0];
  const start = { x: p.x, z: p.z };
  patrols.update(30);
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 1, 'it did not move');
  // and it stays on the route: never further from the nearest stop than the longest leg
  patrols.update(600);
  const nearest = Math.min(...route.map(s => Math.hypot(p.x - s.x, p.z - s.z)));
  assert.ok(nearest <= 300 + 1, 'it wandered off the road');
});

test('what a patrol does about you is your standing with the people who sent it', () => {
  assert.equal(reactionTo({ key: 'hunted' }, COMPOSITIONS.road_watch), 'attack');
  assert.equal(reactionTo({ key: 'disliked' }, COMPOSITIONS.road_watch), 'challenge');
  assert.equal(reactionTo({ key: 'known' }, COMPOSITIONS.road_watch), 'pass');
  assert.equal(reactionTo({ key: 'trusted' }, COMPOSITIONS.road_watch), 'aid');
  assert.equal(reactionTo({ key: 'sworn' }, COMPOSITIONS.road_watch), 'follow');
  // a raid band attacks whatever you have done, unless you are one of them
  assert.equal(reactionTo({ key: 'trusted' }, COMPOSITIONS.raid_band), 'attack');
  assert.equal(reactionTo({ key: 'sworn' }, COMPOSITIONS.raid_band), 'follow');
});

test('wiping out a patrol is felt, and loosens their hold', () => {
  const zones = zonesFixture();
  const standings = createStandings(factions);
  const land = createTerritory({ zones, seed: 23, factions, standings });
  const patrols = createPatrols({ territory: land, factions, standings, seed: 23 });
  const list = patrols.enter(zones.byId(2), [{ x: 0, z: 0 }, { x: 100, z: 0 }]);
  const p = list[0];
  const grip = land.of(2).grip;
  patrols.killed(p.id);
  assert.equal(standings.get(p.faction) < 0, true, 'they should have noticed');
  assert.ok(land.of(2).grip < grip);
  assert.equal(patrols.inZone(2).some(x => x.id === p.id), false);
});

// ---------------------------------------------------------------- caravans

test('a caravan travels, and one that meets trouble with nobody watching is a wreck', () => {
  /**
   * UPDATED BY THE CIVILIZATION EXPANSION §7.6, and the old assertion is why.
   *
   * This used to read `assert.equal(c.state, 'wrecked')` — flatly, for every unescorted caravan —
   * because js/caravans.js ambushed every single one of them unconditionally. That was right for
   * flavour and wrong as a rule the player is now betting money on: a trade run of the player's own
   * is a manifest, a carrier and some guards, and "you always lose it" is not a risk model. Trouble
   * is a roll made once at dispatch (`ambushChanceFor`), so this test now forces the roll it wants
   * rather than assuming it — and the world's own caravans got better at the same time, because a
   * road with a caravan on it is no longer a road with a wreck on it.
   */
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 31, factions });
  const trade = createCaravans({ territory: land, factions, seed: 31 });
  const route = [{ x: 0, z: 0, name: 'Herdalkeep' }, { x: 2000, z: 0, name: 'Menwin' }];
  const c = trade.dispatch(zones.byId(1), route, { danger: 1, guards: 0 });
  assert.equal(c.state, 'loading');
  trade.update(90);
  assert.equal(c.state, 'travelling');
  c.willAmbush = true;                       // the roll, forced, so the rest of the test is about the ROAD
  for (let i = 0; i < 60; i++) trade.update(30);
  assert.equal(c.state, 'wrecked', 'nobody was there to see it, so it should be a wreck');

  // …and a run that is not rolled into trouble simply gets there, which never used to be possible
  const lucky = trade.dispatch(zones.byId(1), route);
  lucky.willAmbush = false;
  trade.update(90);
  for (let i = 0; i < 60; i++) trade.update(30);
  assert.equal(lucky.state, 'arrived');
});

test('escorting one gets it home, and the people who own it notice', () => {
  const zones = zonesFixture();
  const standings = createStandings(factions);
  const land = createTerritory({ zones, seed: 33, factions, standings });
  const trade = createCaravans({ territory: land, factions, standings, seed: 33 });
  const c = trade.dispatch(zones.byId(1), [{ x: 0, z: 0, name: 'a' }, { x: 1200, z: 0, name: 'b' }]);
  trade.escort(c.id);
  for (let i = 0; i < 60; i++) trade.update(30);
  assert.equal(c.state, 'arrived');
  assert.ok(standings.get(c.faction) > 0, 'a delivered load should be worth something');
});

test('robbing one costs you, and the zone goes short because of it', () => {
  const zones = zonesFixture();
  const standings = createStandings(factions);
  const land = createTerritory({ zones, seed: 35, factions, standings });
  const trade = createCaravans({ territory: land, factions, standings, seed: 35 });
  const c = trade.dispatch(zones.byId(1), [{ x: 0, z: 0, name: 'a' }, { x: 900, z: 0, name: 'b' }]);
  trade.rob(c.id);
  assert.equal(c.state, 'robbed');
  assert.ok(standings.get(c.faction) <= -10, 'that should be remembered');
  assert.ok(land.of(1).incidents.some(i => i.kind === 'hunger'), 'a lost load is why a zone goes short');
});

test('a late caravan reads as overdue, which is what the frame binds to', () => {
  const zones = zonesFixture();
  const trade = createCaravans({ seed: 37 });
  const c = trade.dispatch(zones.byId(1), [{ x: 0, z: 0, name: 'a' }, { x: 5000, z: 0, name: 'b' }]);
  trade.update(90);
  c.age = c.due + 10;
  assert.equal(trade.stateOf(c), 'overdue');
  assert.ok(trade.candidates(1).some(x => x.state === 'overdue'));
});

// ---------------------------------------------------------------- wanderers

test('a wanderer only stands somewhere that suits them, at an hour that suits them', () => {
  const minstrel = wandererData.kinds.find(k => k.key === 'minstrel');
  assert.equal(suits(minstrel, { kind: 'camp', tags: ['camp'] }, { night: true }), true);
  assert.equal(suits(minstrel, { kind: 'camp', tags: ['camp'] }, { night: false }), false);
  const pedlar = wandererData.kinds.find(k => k.key === 'pedlar');
  assert.equal(suits(pedlar, { kind: 'road', tags: ['road'] }, { night: false }), true);
  assert.equal(suits(pedlar, { kind: 'mountain', tags: ['mountain'] }, { night: false }), false);
});

test('the people on the road are drawn from the real spots, and are the same today as they were an hour ago', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 41, factions });
  const folk = createWanderers({ data: wandererData, territory: land, seed: 41 });
  const spots = [
    { x: 100, z: 0, kind: 'road', tags: ['road'] },
    { x: 400, z: 0, kind: 'crossroads', tags: ['road', 'crossroads'] },
    { x: 700, z: 200, kind: 'forest', tags: ['forest'] },
  ];
  const a = folk.populate(zones.byId(1), spots, { night: false, level: 6 });
  const b = folk.populate(zones.byId(1), spots, { night: false, level: 6 });
  assert.deepEqual(a.map(w => w.kind), b.map(w => w.kind), 'the roster should be stable within a day');
  for (const w of a) {
    assert.ok(spots.some(s => s.x === w.x && s.z === w.z), `${w.kind} is standing nowhere`);
    assert.ok(w.name && w.blurb);
  }
  assert.ok(folk.near(100, 0, 20).length <= 1);
});

test('helping a poacher annoys the people whose land it was', () => {
  const zones = zonesFixture();
  const standings = createStandings(factions);
  const folk = createWanderers({ data: wandererData, standings, seed: 43 });
  const list = folk.populate(zones.byId(1), [{ x: 0, z: 0, kind: 'forest', tags: ['forest'] }], { night: true });
  const poacher = list.find(w => w.kind === 'poacher');
  if (!poacher) return;                                  // the roll did not put one there
  folk.settle(poacher.id, 'helped');
  assert.ok(standings.get('greenhand') < 0);
});

// ---------------------------------------------------------------- rumours

test('a rumour is a sentence about somewhere, and never a pin', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 51, factions });
  land.of(3).contested = 'ashen_pact';
  land.of(3).claim = 0.4;
  const talk = createRumours({ territory: land, factions, seed: 51 });
  const row = talk.hear(zones.byId(3), { from: 'a minstrel' });
  assert.ok(row, 'a contested zone should be worth talking about');
  assert.ok(row.text.includes('The Quill Steppe'));
  assert.equal(row.x, undefined, 'a rumour must not carry a position');
  assert.equal(talk.about(3).length, 1);
});

test('the same fact from a second mouth is not news', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 53, factions });
  const talk = createRumours({ territory: land, factions, seed: 53 });
  const extra = { named: 'Grix the Unquiet' };
  const first = talk.hear(zones.byId(2), { extra });
  let repeats = 0;
  for (let i = 0; i < 10; i++) if (talk.hear(zones.byId(2), { extra })) repeats++;
  assert.ok(first);
  assert.ok(talk.all().length <= 1 + repeats, 'rumours are collapsing wrongly');
  assert.equal(talk.all().filter(r => r.kind === first.kind && r.zoneId === 2).length, 1);
});

test('what you have heard about, and not been to, is the where-next list', () => {
  const zones = zonesFixture();
  const land = createTerritory({ zones, seed: 55, factions });
  const talk = createRumours({ territory: land, factions, seed: 55 });
  talk.hear(zones.byId(2), { extra: { named: 'Grix the Unquiet' } });
  talk.hear(zones.byId(3), { extra: { dungeon: 'the Sunk Gallery' } });
  const leads = talk.leads(new Set([2]));
  assert.equal(leads.length, 1);
  assert.equal(leads[0].zoneId, 3);
});

/**
 * R18 — EVERY EFFECT AN INCIDENT DECLARES IS ONE THE MERGE KNOWS ABOUT.
 *
 * `createIncidents().effects()` merges by explicit lists of key names, which is the right shape: a
 * typo in the data becomes a missing effect rather than a crash. The cost is that a key the data
 * declares and the lists do not name is dropped in SILENCE, and four were — `patrol` (the band
 * `raid_coming` puts on the road while a raid gathers, which is the whole point of the incident),
 * `patrolMult`, `namedGrowth` and `rivalHunters`.
 *
 * This is the structural version of that fix: `NO_EFFECT` is the merge's own vocabulary, so any
 * effect key in the data that is not in it is a rule nobody will ever read.
 */
test('R18 — no incident declares an effect the merge silently drops', () => {
  const incidents = incidentData;
  const known = new Set(Object.keys(NO_EFFECT));
  const orphans = [];
  for (const row of incidents.incidents || incidents.kinds || []) {
    for (const key of Object.keys(row.effects || {})) {
      // `opensFrame` is merged into the plural `opensFrames` list, which is in NO_EFFECT
      if (key === 'opensFrame') continue;
      if (!known.has(key)) orphans.push(`${row.kind || row.id}.${key}`);
    }
  }
  assert.deepEqual(orphans, [],
    'these incident effects are written in the data and read by nobody — add each to NO_EFFECT and '
    + 'to the matching list in `effects()`:\n  ' + orphans.join('\n  '));
});

/**
 * R18 — THE FACTION REWARDS FILE SAYS WHICH OF ITSELF IS REAL.
 *
 * `js/main.js` `earnedRewards()` flattens every earned rank's `effect` into one map, and exactly
 * two keys are ever read out of it: `freeTolls` and `rationPrice`. The other twenty are designed
 * and not built — the dispatcher was written, the consumers were not — so every faction but two
 * pays a rank-up reward that is a line of text. The round-10 review had already flagged this file
 * as "parsed at boot and read by nothing".
 *
 * The user's decision was to park the twenty rather than build twenty effects in one pass. Parking
 * is only honest if it is visible, so the file now carries `built` and `notBuiltYet` — and this
 * test is what stops those lists rotting: a key that is neither read nor parked fails, and a parked
 * key that no longer exists in the data fails too. Implement one, move it across, and the test says
 * so if you forget.
 */
test('R18 — every faction reward effect is either built or openly parked', () => {
  const rewards = read('../data/faction-rewards.json');
  const declared = new Set();
  for (const rows of Object.values(rewards.rewards || {})) {
    for (const r of rows) for (const k of Object.keys(r.effect || {})) declared.add(k);
  }
  const built = new Set(rewards.built || []);
  const parked = new Set(rewards.notBuiltYet || []);

  const unaccounted = [...declared].filter(k => !built.has(k) && !parked.has(k));
  assert.deepEqual(unaccounted, [],
    'these reward effects are in the data and in neither list — add them to `built` once something '
    + 'reads them, or to `notBuiltYet` so the file stops implying they work:\n  ' + unaccounted.join('\n  '));

  const stale = [...built, ...parked].filter(k => !declared.has(k));
  assert.deepEqual(stale, [], 'these are listed but no reward grants them any more: ' + stale.join(', '));

  // and the two that ARE built have to stay built, or the file quietly becomes all promise
  assert.ok(built.size >= 2, `only ${built.size} faction reward effects are implemented`);
});

/**
 * R18 — EVERY DEED IS EITHER CREDITED OR OPENLY NAMED AS NOT.
 *
 * `data/factions.json` declares twelve deeds and js/main.js DISPLAYS the table on the standings
 * screen as though it were the rules. Four of them were credited by nothing: `nemesis_killed`,
 * `incident_resolved`, `relic_returned`, `landmark_desecrated` — so the screen was telling the
 * player about consequences that did not exist.
 *
 * Two are credited now (a settled grudge, a cleared incident — both real events the game already
 * knew about). The other two have no mechanic at all: there is no relic to return and no way to
 * desecrate a place. They stay, because the screen reads this table to explain itself, and they are
 * named in `deedsNotCredited` so nobody assumes they fire. This test is what stops that list rotting
 * in either direction.
 */
test('R18 — no faction deed is silently uncredited', () => {
  const declared = Object.keys(factions.deeds || {}).filter(k => !k.startsWith('_'));
  const parked = new Set(factions.deedsNotCredited || []);

  // what the game actually credits, read off every `.deed(…, 'name')` call in js/
  /**
   * Read as TEXT, and NOT inside a try/catch that hides a mistake. The first version of this called
   * a `src()` helper this file does not have, and the catch turned that into an empty string — so
   * nothing looked credited and the test reported all ten working deeds as silent. A catch around
   * the thing the test depends on is a catch around its own correctness.
   */
  const js = ['main', 'jobgen', 'caravans', 'patrols', 'wanderers', 'territory']
    .map(f => readFileSync(join(here, `../js/${f}.js`), 'utf8')).join('\n');
  const credited = new Set([...js.matchAll(/\.deed\([^,]+,\s*'([a-z_]+)'/g)].map(m => m[1]));

  const silent = declared.filter(d => !credited.has(d) && !parked.has(d));
  assert.deepEqual(silent, [],
    'these deeds are declared and shown to the player and nothing credits them — credit them, or '
    + 'add them to `deedsNotCredited` with a reason:\n  ' + silent.join('\n  '));

  const stale = [...parked].filter(d => credited.has(d));
  assert.deepEqual(stale, [], 'these are parked but ARE credited now — take them off the list: ' + stale.join(', '));
});

/**
 * R18 — EVERY `uses` ID NAMES A REAL JOB FRAME.
 *
 * `data/landmarks.json` and `data/strongholds.json` say which errands a place can host, and nothing
 * read those lists — so three of the eleven ids named no frame at all, which is the usual sign that
 * a field has never been resolved against anything. `burn_it_out` and `cull` named nothing;
 * `hold_the_line` is a MERCENARY ABILITY id out of data/mercenaries.json.
 *
 * js/jobgen.js prefers a frame a nearby place can host now, so a dangling id is a preference that
 * can never apply — silent, and exactly the shape this round has been clearing out.
 */
test('R18 — no landmark or stronghold offers an errand that does not exist', () => {
  const frames = new Set((read('../data/job-frames.json').frames || []).map(f => f.id));
  assert.ok(frames.size > 15, 'the frame list did not load');

  const named = new Set();
  const walk = o => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const list = o.uses;
    if (list) for (const id of (Array.isArray(list) ? list : [list])) named.add(id);
    Object.values(o).forEach(walk);
  };
  walk(read('../data/landmarks.json'));
  walk(read('../data/strongholds.json'));
  assert.ok(named.size >= 8, `only ${named.size} uses ids found — re-aim this test`);

  const dangling = [...named].filter(id => !frames.has(id));
  assert.deepEqual(dangling, [],
    'these places offer errands that are not job frames, so the preference can never apply:\n  '
    + dangling.join('\n  '));
});
