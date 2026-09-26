// node --test prototypes/farhold/tests/save.test.js
//
// THE ONE GUARD THIS FILE EXISTS FOR: nothing js/main.js hands to `snapshot()` may be dropped.
//
// `snapshot()` destructures a FIXED argument list. A field main.js passes that is not on that list
// is silently thrown away — no error, no warning, and every unit test still green, because the
// module under test never sees it. save.js's own comment records the first three that went that way:
//
//     `world` holds the title screen's knobs, planetScale among them… that is the "saved in a town,
//      loaded into the Shallows surrounded by water" report.
//     `quests` — every load silently emptied the quest log.
//     `campaign` — and forgot the story.
//
// It then happened three more times (`props`, `logistics`, `away`) under a comment at the call site
// that says, in as many words, "each of these is added here AND in save.js's parameter list,
// together". Writing the discipline down did not enforce it. This test enforces it.
//
// It reads main.js's own `snapshot({ ... })` call as TEXT, takes every key out of it, and checks
// each one survives a round trip. That is deliberately structural: it needs no list of its own to
// go stale, so a field added to the call site tomorrow is covered tomorrow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot } from '../js/save.js';

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

/** The keys of the object literal main.js passes to `snapshot(`. */
function keysPassedToSnapshot() {
  const at = mainSrc.indexOf('snapshot({');
  assert.ok(at > 0, 'js/main.js no longer calls snapshot({ … }) — this test needs re-aiming');
  const open = mainSrc.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < mainSrc.length; i++) {
    const c = mainSrc[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > open, 'could not find the end of the snapshot call');

  // comments first: they contain commas, colons and braces, and all three would confuse the split
  const clean = mainSrc.slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  /**
   * Split on the commas that are at depth 0 of THIS literal, so `at: { systemSeed, starId }` is one
   * entry rather than three. Then each entry is either `key: value` (take what is left of the first
   * colon) or a shorthand `key`. Splitting on entries — rather than scanning for identifiers — is
   * what keeps a VALUE from being mistaken for a key: the first version of this test reported
   * `saveId`, `baseLook`, `worldOpts` and `surfaceSpot` as dropped fields, and every one of those is
   * the right-hand side of a pair whose key is stored perfectly well.
   */
  const entries = [];
  let d = 0, cur = '';
  for (const c of clean) {
    if ('{(['.includes(c)) d++;
    else if ('})]'.includes(c)) d--;
    if (c === ',' && d === 0) { entries.push(cur); cur = ''; continue; }
    cur += c;
  }
  entries.push(cur);

  const keys = [];
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const name = (entry.includes(':') ? entry.slice(0, entry.indexOf(':')) : entry).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.push(name);
  }
  return [...new Set(keys)];
}

/**
 * The few keys that are legitimately consumed rather than stored, with the reason each one is here.
 * Anything NOT on this list has to come out the other side.
 */
const CONSUMED = new Map([
  ['player', 'flattened into the `player` block field by field'],
  ['control', 'becomes `position`'],
  ['markers', 'stored, but renamed from the old `pins`'],
  ['surface', 'stored under `surface`, conditional on inDungeon'],
  ['inDungeon', 'stored under `inDungeon`'],
]);

test('every field js/main.js passes to snapshot() survives the round trip', () => {
  const passed = keysPassedToSnapshot();
  assert.ok(passed.length > 25, `only found ${passed.length} keys in the snapshot call — parser is wrong`);

  // a distinctive value per key, so a dropped field is unmistakable
  const args = {};
  for (const k of passed) args[k] = { __probe: k };
  // the handful snapshot() reads INTO other shapes need to be real enough not to throw
  args.player = {
    level: 3, xp: 10, gold: 5, attrs: {}, pendingAttr: 0, hp: 1, mp: 1, kills: 0, deaths: 0,
    equipment: {}, bag: [], passiveRanks: {}, pendingPassive: 0, pendingTalent: 0, talents: [],
    perks: ['melee:1:0', 'melee:2:0'], vehicles: [], devices: {}, held: 'weapon',
    build: null, followers: null, rideChoice: 'mount',
  };
  args.control = { x: 1, z: 2, yaw: 0, pitch: 0 };
  args.id = 's1'; args.name = 'Probe'; args.seed = 1; args.classId = 'ranger';
  args.elapsed = 0; args.playtime = 0; args.dungeonsCleared = [];
  args.inDungeon = false;

  const out = snapshot(args);
  const dropped = [];
  for (const k of passed) {
    if (CONSUMED.has(k)) continue;
    if (!(k in out)) dropped.push(k);
  }
  assert.deepEqual(dropped, [],
    'js/main.js passes these to snapshot() and snapshot() throws them away — add each one to the '
    + 'parameter list AND to the returned object, together:\n  ' + dropped.join('\n  '));
});

/**
 * …and the four that were actually being dropped, named individually.
 *
 * The structural test above is the real guard, but naming these keeps the failure readable: if the
 * parser above ever breaks, these still say what went missing and why it mattered.
 */
test('the four that were being dropped are stored, and the perks come back', () => {
  const player = {
    level: 30, xp: 1, gold: 1, attrs: {}, pendingAttr: 0, hp: 1, mp: 1, kills: 0, deaths: 0,
    equipment: {}, bag: [], passiveRanks: {}, pendingPassive: 0, pendingTalent: 0, talents: [],
    perks: ['melee:1:0', 'defence:3:1'], vehicles: [], devices: {}, held: 'weapon',
  };
  const out = snapshot({
    id: 's', name: 'n', seed: 1, classId: 'ranger', player,
    control: { x: 0, z: 0, yaw: 0, pitch: 0 }, elapsed: 0, playtime: 0,
    props: { felled: { a: 1 } },
    logistics: { loads: [1] },
    away: { v: 1, leftAt: 12345 },
    research: { v: 1, earned: 2, spent: 1, taken: ['ironworking'] },
  });

  // C1 — the perk forest, which is the whole replacement for attribute point-buy
  assert.deepEqual(out.player.perks, ['melee:1:0', 'defence:3:1'],
    'player.perks is not in the save — every perk a character took is wiped by a reload');
  // C2 — three that main.js has been passing all along, each with a loader already waiting
  assert.deepEqual(out.props, { felled: { a: 1 } }, 'the harvest ledger is not saved: felled trees come back');
  assert.deepEqual(out.logistics, { loads: [1] }, 'carts in transit and supply lines are not saved');
  assert.equal(out.away.leftAt, 12345, '`leftAt` is not saved, so offline production never happens');
  // B4 — and the one that was not even passed
  assert.deepEqual(out.research.taken, ['ironworking'],
    'the research tree is not saved: all 31 tech-gated structures re-lock on reload');
});

/**
 * R27 M1 — the taken strongholds. A reload that forgot them stood every boss back up, so the
 * pay-once rule would have been a pay-once-per-session rule.
 */
test('the taken strongholds survive a save, and an old save loads with none taken', () => {
  const base = {
    id: 's1', name: 'Probe', seed: 1, classId: 'ranger', control: { x: 0, z: 0, yaw: 0, pitch: 0 },
    player: { level: 1, attrs: {}, equipment: {}, bag: [] },
  };
  const ledger = { '7:2': [4012, 9031], '7:5': [12] };
  const out = JSON.parse(JSON.stringify(snapshot({ ...base, strongholds: ledger })));
  assert.deepEqual(out.strongholds, ledger);
  // the snapshot is a copy: taking another one later does not rewrite a save already written
  ledger['7:2'].push(1);
  assert.deepEqual(out.strongholds['7:2'], [4012, 9031]);
  // a save written before round 27 has no field at all
  const old = snapshot(base);
  assert.deepEqual(old.strongholds, {});
  assert.ok(/save\?\.strongholds/.test(mainSrc), 'main.js never reads the ledger back out of a save');
});

/**
 * R27 M9 — a warband's grip on a zone rides in the territory deltas. A save that dropped it would
 * stand every thinned valley back up at full strength on reload; a save from before round 27 has
 * no `warGrip` and must load at the full seeded claim.
 */
test('the warband grip survives a save through the territory deltas, and an old save loads at full grip', async () => {
  const { createTerritory } = await import('../js/territory.js');
  const factions = JSON.parse(readFileSync(new URL('../data/factions.json', import.meta.url), 'utf8'));
  const zone = { id: 3, name: 'Probe Vale', minLevel: 8, maxLevel: 12, midLevel: 10, danger: 'wild', cells: [] };
  const zones = { byId: id => (id === 3 ? zone : null) };
  const band = { id: 'ashtusk', name: 'The Ashtusk Horde' };
  const make = saved => createTerritory({ zones, seed: 9, factions, saved, warbandOf: () => band, warbandCfg: { gripRegen: 0.1, patrolGrip: 0.1 } });
  const land = make(null);
  land.warbandLoss(3, 'patrol');
  land.warbandLoss(3, 'patrol');
  const base = {
    id: 's1', name: 'Probe', seed: 1, classId: 'ranger', control: { x: 0, z: 0, yaw: 0, pitch: 0 },
    player: { level: 1, attrs: {}, equipment: {}, bag: [] },
  };
  const out = JSON.parse(JSON.stringify(snapshot({ ...base, territory: land.toJSON() })));
  assert.equal(out.territory.zones[3].warGrip, 0.8);
  assert.equal(make(out.territory).warGrip(3), 0.8, 'the grip did not come back from the save');
  delete out.territory.zones[3].warGrip;
  assert.equal(make(out.territory).warGrip(3), 1, 'an old save did not load at full grip');
  assert.equal(make(null).warGrip(3), 1);
  assert.ok(/territory: holdings\.toJSON\(\)/.test(mainSrc) && /saved: save\?\.territory/.test(mainSrc), 'main.js no longer saves or loads the territory deltas');
});
