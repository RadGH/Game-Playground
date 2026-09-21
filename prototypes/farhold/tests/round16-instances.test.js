// node --test prototypes/farhold/tests/round16-instances.test.js
//
// ROUND 16 — the instance system.
//
//   "Add about 20 new overworld events that feature an instance system. It could be an abandoned
//    building, a cave entrance, a dungeon entrance. These take you to a different zone similar to
//    our current dungeon system where a quest can be found, or a boss to kill. Have one be a
//    dragons lair, which can both be discovered randomly or through a quest from someone in town
//    or elsewhere."
//
// An instance is three files agreeing with each other: data/instances.json says what the place is,
// data/setpieces.json says what its mouth looks like on the ground, and js/dungeon-plan.js builds
// the inside. The failures worth catching are all the same shape — one of the three not knowing
// about the other two. A `plan` nobody wrote is a place built out of nothing. A `look` nobody
// defined falls back to the barrow and twenty new interiors go grey. And the one that cannot be
// seen by reading any single file: a dragon's lair of two enormous rooms where the rejection
// sampler only ever fits ONE, so the boss room IS the entrance and the dragon stands in the
// doorway. That last one is why `layout()` was split out of `dungeon.js` in the first place.
//
// js/sites.js imports Three.js, so it cannot be imported here; its piece names are read out of the
// source the same way tests/poi.test.js reads them. tests/monuments.test.js guards the other
// direction — that every piece js/sites.js builds is placed by somebody.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DUNGEON_LOOKS, layout, insideLayout } from '../js/dungeon-plan.js';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const src = f => readFileSync(new URL(f, import.meta.url), 'utf8');

const DATA = read('../data/instances.json');
const SETPIECES = read('../data/setpieces.json');
const LANDMARKS = read('../data/landmarks.json');
const STRONGHOLDS = read('../data/strongholds.json');
const FACTIONS = read('../data/factions.json');
const BESTIARY = read('../data/enemies.json');
const BALANCE = read('../data/balance.json');
const SITES = src('../js/sites.js');
const DUNGEON = src('../js/dungeon.js');

const INSTANCES = DATA.instances || [];
const LAYOUTS = SETPIECES.layouts || {};

/**
 * Every piece js/sites.js can build, and how tall it stands, read out of the source.
 *
 * `PIECE_KEYS` is exported and would be the honest import, but the module's first line is
 * `import * as THREE from 'three'` and node has no such package — so the table is read instead.
 * The count assertion is what keeps this from going stale quietly: add a twenty-first piece and
 * this test asks you to look at it.
 */
const PIECES = Object.fromEntries(
  [...SITES.matchAll(/^ {2}([a-z_]+): \{ tall: ([0-9.]+)/gm)].map(m => [m[1], Number(m[2])]));
const PIECE_KEYS = new Set(Object.keys(PIECES));

test('the piece table was read, and it is the one js/sites.js exports', () => {
  assert.equal(PIECE_KEYS.size, 20, `read ${PIECE_KEYS.size} pieces out of js/sites.js`);
  assert.ok(SITES.includes('export const PIECE_KEYS = Object.keys(PIECES);'),
    'PIECE_KEYS is gone — this test is reading a table that no longer feeds the world');
  for (const key of ['den', 'hut', 'menhir', 'bonepile', 'rubble']) assert.ok(PIECE_KEYS.has(key), `no "${key}" piece`);
});

// ---------------------------------------------------------------------------- the file itself

test('about twenty instances, each one named and described', () => {
  assert.ok(INSTANCES.length >= 20, `only ${INSTANCES.length} instances`);
  assert.ok(DATA._doc && DATA._doc.length > 400, 'the schema is not documented in _doc');
  const ids = INSTANCES.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'two instances share an id');
  for (const i of INSTANCES) {
    assert.ok(i.id && /^[a-z][a-z0-9_]*$/.test(i.id), `bad id "${i.id}"`);
    assert.ok(i.name && i.name.length > 3, `${i.id} has no name`);
    assert.ok(i.blurb && i.blurb.length > 20, `${i.id} has no blurb — nothing to print when you walk up to it`);
    assert.ok(i.weight > 0, `${i.id} has no weight, so it can never be picked`);
    assert.ok((i.on || []).length, `${i.id} says nothing about where it may stand`);
    assert.ok((i.biomes || []).length, `${i.id} says nothing about what ground it stands on`);
    assert.ok(Number.isFinite(i.minBand), `${i.id} has no minBand`);
    if (i.maxBand != null) assert.ok(i.maxBand >= i.minBand, `${i.id} has maxBand under minBand`);
    assert.ok(i.townGap >= 150, `${i.id} keeps ${i.townGap} m from a village — that is inside somebody's fields`);
  }
});

test('the ask: caves, abandoned buildings and worked ground are all covered', () => {
  // the user named three kinds out loud, and the brief named nine more. If a whole family of place
  // goes missing the file is twenty variations on one idea.
  const have = new Set(INSTANCES.map(i => i.id));
  for (const want of [
    'weeping_cave', 'bramble_burrow', 'sinkhole_stair',                 // caves and burrows
    'fallow_farmstead', 'hushed_chapel', 'drowned_mill', 'hollowed_manor', // abandoned buildings
    'spent_quarry', 'slumped_adit',                                     // mine and quarry workings
    'doorstone_barrow', 'ash_tomb',                                     // barrows and tombs
    'black_cistern', 'sealed_strongroom', 'tidewrack_hold',
    'gnawed_warren', 'pale_undercroft', 'rimeward_deep', 'the_slagworks',
    'windward_gaol', 'emberhold_lair',
  ]) assert.ok(have.has(want), `the ${want} is gone`);
});

test('a slot tag is one the world actually makes, and a band is a real band', () => {
  // js/sites.js matches `on` against the slot kind UNION the ground tags — the same set
  // data/landmarks.json's `on` is matched against. Anything outside it can never match anything.
  const SLOTS = ['landmark', 'pass', 'dungeon', 'crossing', 'road', 'junction'];
  const GROUND = ['grass', 'farmland', 'scrub', 'forest', 'wetland', 'river', 'coast', 'highland', 'mountain'];
  const ok = new Set([...SLOTS, ...GROUND]);
  for (const i of INSTANCES) {
    for (const on of i.on) assert.ok(ok.has(on), `${i.id} wants to sit on "${on}", which is neither a slot nor a ground tag`);
    assert.ok(i.minBand >= 0 && i.minBand <= 7, `${i.id} wants band ${i.minBand}; the bands are 0-7`);
    assert.ok(i.on.some(on => SLOTS.includes(on)),
      `${i.id} names only ground tags — give it a slot kind too or it can only ever appear where a road happens to run`);
  }
});

test('discovery is one of the three words, and every kind is used', () => {
  const seen = new Set();
  for (const i of INSTANCES) {
    assert.ok(['random', 'quest', 'both'].includes(i.discovery), `${i.id} is discovered by "${i.discovery}"`);
    seen.add(i.discovery);
  }
  for (const kind of ['random', 'quest', 'both']) assert.ok(seen.has(kind), `nothing is discovered by "${kind}"`);
  // a place a town job points at has to have the job to point with
  for (const i of INSTANCES) {
    if (i.discovery === 'random') continue;
    assert.ok(i.holds?.quest || i.dragon,
      `${i.id} is reached through a quest and holds no quest — there is nothing for the giver to talk about`);
  }
});

// ---------------------------------------------------------------------------- the mouth

test('every instance has a mouth layout, and it is built out of pieces that exist', () => {
  for (const i of INSTANCES) {
    const l = LAYOUTS[i.plan];
    assert.ok(l, `${i.id} has no "${i.plan}" layout in data/setpieces.json — it would be built out of nothing`);
    for (const piece of piecesIn(l)) assert.ok(PIECE_KEYS.has(piece), `${i.plan} asks for a "${piece}" and js/sites.js has no such piece`);
  }
  // one mouth each: two instances sharing a layout would be the same place under two names
  const plans = INSTANCES.map(i => i.plan);
  assert.equal(new Set(plans).size, plans.length, 'two instances share a mouth layout');
});

test('a mouth is a composed set piece, not a model on a coordinate', () => {
  // the same rule tests/poi.test.js holds the landmarks to (8.2), applied to these as well
  for (const i of INSTANCES) {
    const l = LAYOUTS[i.plan];
    assert.ok((l.centre || []).length >= 1, `${i.plan} has no centre`);
    const ring = (l.rings || []).reduce((n, r) => n + ((r.count || 1) - (r.skip || []).length), 0);
    const grid = (l.grids || []).reduce((n, g) => n + (g.cols || 1) * (g.rows || 1) - (g.skip || []).length, 0);
    const scatter = (l.scatter || []).reduce((n, s) => n + (s.count || 0), 0);
    const approach = (l.approach?.count || 0) * (l.approach?.both ? 2 : 1);
    const total = (l.centre || []).length + ring + grid + scatter + approach;
    assert.ok(total >= 10, `${i.plan} is ${total} pieces — that is a couple of models on top of a coordinate`);
    assert.ok(approach >= 4 || ring >= 8, `${i.plan} has neither an approach nor a surround`);
  }
});

/**
 * `tall` IS MEASURED, NOT GUESSED.
 *
 * The gibbet says `tall: 9` and its tallest piece is a cage at 1.4 scale, which is 6.16 m. `tall`
 * is what decides at what distance a set piece stops being drawn, so a layout that overstates its
 * height is culled at the wrong range and one that understates it pops in late. Every one of these
 * twenty is the real number, and this is the test that keeps it the real number.
 */
test('every mouth says how tall it really is', () => {
  const TALLEST_TREE = 9;                    // the conifer, from tests/poi.test.js
  for (const i of INSTANCES) {
    const l = LAYOUTS[i.plan];
    let real = 0;
    const consider = (piece, scale = 1) => { real = Math.max(real, PIECES[piece] * scale); };
    for (const c of l.centre || []) consider(c.piece, c.scale);
    for (const r of l.rings || []) consider(r.piece, r.scale);
    for (const g of l.grids || []) consider(g.piece, g.scale);
    for (const s of l.scatter || []) consider(s.piece, s.scale);
    if (l.approach) consider(l.approach.piece, l.approach.scale);
    assert.ok(Number.isFinite(l.tall), `${i.plan} does not say how tall it is`);
    assert.ok(Math.abs(l.tall - real) <= 0.3,
      `${i.plan} says ${l.tall} m and its tallest piece is ${real.toFixed(2)} m — that is the gibbet's mistake`);
    assert.ok(l.tall >= TALLEST_TREE, `${i.plan} stands ${l.tall} m — shorter than a conifer, so you never see it`);
  }
});

test('a fence that is meant to close, closes; a ruin says it is a ruin', () => {
  const WIDTH = { palisade: 6, wall: 9 };
  for (const i of INSTANCES) {
    for (const r of LAYOUTS[i.plan].rings || []) {
      const w = WIDTH[r.piece];
      if (!w || r.broken) continue;
      const need = Math.ceil((2 * Math.PI * r.radius) / (w * (r.scale ?? 1)));
      assert.ok((r.count || 1) >= need, `${i.plan}'s ${r.piece} ring is ${r.count} at ${r.radius} m and needs ${need}`);
    }
  }
});

test('the archway a mouth asks for is one js/dungeon.js can build', () => {
  const start = DUNGEON.indexOf('export const GATE_ARCHES = {');
  assert.ok(start > 0, 'GATE_ARCHES is gone');
  const block = DUNGEON.slice(start, DUNGEON.indexOf('};', start));
  const arches = new Set([...block.matchAll(/^ {2}([a-z]+):/gm)].map(m => m[1]));
  assert.ok(arches.has('stone'), 'the default arch is gone');
  for (const i of INSTANCES) {
    assert.ok(arches.has(i.arch), `${i.id} wants a "${i.arch}" archway, and js/dungeon.js has ${[...arches].join(', ')}`);
  }
  // …and every look built is used by something, or it is geometry nobody sees
  for (const a of arches) assert.ok(INSTANCES.some(i => i.arch === a) || a === 'stone', `the "${a}" archway is built and never asked for`);
});

// ---------------------------------------------------------------------------- the interior

test('every interior asks for a look that exists', () => {
  for (const i of INSTANCES) {
    assert.ok(DUNGEON_LOOKS[i.interior?.look],
      `${i.id} wants the "${i.interior?.look}" look, which js/dungeon-plan.js has never heard of — it would fall back to the barrow`);
  }
  // round 16 added five; the six that were there before are load-bearing for every existing dungeon
  for (const old of ['barrow', 'crypt', 'cinderworks', 'hollow', 'vault', 'rime']) assert.ok(DUNGEON_LOOKS[old], `the ${old} look is gone`);
  for (const added of ['cave', 'ruin', 'hoard', 'flooded', 'warren']) assert.ok(DUNGEON_LOOKS[added], `the ${added} look is gone`);
  // and each of the five new ones is actually used somewhere, or it is a colour nobody sees
  for (const added of ['cave', 'ruin', 'hoard', 'flooded', 'warren']) {
    assert.ok(INSTANCES.some(i => i.interior.look === added), `nothing uses the "${added}" look`);
  }
});

test('an interior is a shape createDungeon can be handed', () => {
  for (const i of INSTANCES) {
    const it = i.interior;
    for (const pair of ['rooms', 'roomSize']) {
      assert.ok(Array.isArray(it[pair]) && it[pair].length === 2, `${i.id}.interior.${pair} is not a [min, max]`);
      assert.ok(it[pair][0] <= it[pair][1], `${i.id}.interior.${pair} is back to front`);
    }
    assert.ok(it.rooms[0] >= 2, `${i.id} can be one room, and one room means the boss stands in the doorway`);
    assert.ok(it.corridor >= 2 && it.corridor <= 8, `${i.id}'s corridor is ${it.corridor} m`);
    assert.ok(it.cellSize >= 4 && it.cellSize <= 12, `${i.id}'s cellSize is ${it.cellSize}`);
    // the player is about 1.8 m and the camera lives above their head
    assert.ok(it.wallHeight >= 3.2, `${i.id}'s walls are ${it.wallHeight} m — the camera would be in the ceiling`);
    assert.ok(it.overLevel >= 0 && it.overLevel <= 6, `${i.id} is ${it.overLevel} levels over its zone`);
    assert.ok(Array.isArray(it.packs) && it.packs.length === 2 && it.packs[0] >= 1, `${i.id} has no packs per room`);
    assert.ok((it.families || []).length, `${i.id} names no families, so it fills with whatever lives on the surface above it`);
  }
});

test('a family a room is filled from is a family the bestiary has', () => {
  // `defsFor` does not throw on a typo — it quietly falls back to "anything that lives here", so a
  // warren fills with bandits and nobody ever notices. Same trap tests/poi.test.js 7.17 catches.
  const families = new Set([...BESTIARY.enemies, ...BESTIARY.bosses].map(e => e.family));
  for (const i of INSTANCES) {
    for (const f of i.interior.families) assert.ok(families.has(f), `${i.id} fills with "${f}", which is not a family in enemies.json`);
  }
});

/**
 * THE ONE THAT CANNOT BE SEEN BY READING THE DATA.
 *
 * `layout()` scatters rectangles and throws away any that land on another one, then calls the room
 * nearest the origin the entrance and the room furthest from THAT the boss room. Ask it for two
 * rooms thirty-six metres across in a space that only fits one and it hands back a single room
 * which is both — a dragon's lair where the dragon is standing in the doorway with nothing behind
 * it. Nothing in instances.json looks wrong when that happens; only running it shows you.
 */
test('every interior lays out connected, over many seeds, with the boss away from the door', () => {
  for (const i of INSTANCES) {
    const it = i.interior;
    let smallest = Infinity;
    for (let s = 1; s <= 400; s++) {
      const plan = layout({
        seed: (s * 2654435761) >>> 0,
        rooms: it.rooms, roomSize: it.roomSize, cellSize: it.cellSize, corridor: it.corridor,
      });
      smallest = Math.min(smallest, plan.rooms.length);
      assert.ok(plan.rooms.length >= 2, `${i.id} seed ${s}: ${plan.rooms.length} room(s)`);
      assert.notEqual(plan.boss, plan.entrance, `${i.id} seed ${s}: the boss room IS the entrance`);
      assert.equal(plan.entrance.kind, 'entrance');
      assert.equal(plan.boss.kind, 'boss');

      // every room reachable from the entrance, walking the halls
      const seen = new Set([plan.entrance.id]);
      for (let pass = 0; pass < plan.rooms.length; pass++) {
        for (const h of plan.halls) {
          if (seen.has(h.from)) seen.add(h.to);
          if (seen.has(h.to)) seen.add(h.from);
        }
      }
      assert.equal(seen.size, plan.rooms.length, `${i.id} seed ${s}: ${plan.rooms.length - seen.size} room(s) walled off`);

      // and the middle of every room really is floor, which is what the walls are carved out of
      for (const r of plan.rooms) assert.ok(insideLayout(plan, r.x, r.z, 0), `${i.id} seed ${s}: room ${r.id} is not floor`);
    }
    // a place that asked for six rooms and reliably gets three is not the place it says it is
    assert.ok(smallest >= Math.min(it.rooms[0], 3),
      `${i.id} asks for ${it.rooms[0]} rooms and the sampler could only fit ${smallest} — the rooms are too big for the spread`);
  }
});

test("the dragon's lair is few rooms and enormous ones", () => {
  const lair = INSTANCES.find(i => i.dragon);
  const it = lair.interior;
  assert.ok(it.rooms[1] <= 5, `the lair is up to ${it.rooms[1]} rooms; it is meant to be a handful`);
  assert.ok(it.roomSize[0] >= 20, `the lair's smallest room is ${it.roomSize[0]} m across — a wyrm does not fit in that`);
  // the biggest room anything else in the file has
  const others = Math.max(...INSTANCES.filter(i => !i.dragon).map(i => i.interior.roomSize[1]));
  assert.ok(it.roomSize[1] > others, `the lair's rooms (${it.roomSize[1]} m) are no bigger than everything else's (${others} m)`);
});

// ---------------------------------------------------------------------------- what is down there

/** What counts as a reason to go down the hole. One of these, or it is a corridor with a door. */
const HOLD_KINDS = ['boss', 'quest', 'prisoner', 'cache', 'lore'];

test('nothing is an empty walk: every instance holds something', () => {
  for (const i of INSTANCES) {
    const held = HOLD_KINDS.filter(k => i.holds?.[k]);
    assert.ok(held.length >= 2,
      `${i.id} holds only ${held.join(', ') || 'nothing'} — add one of ${HOLD_KINDS.join(', ')}`);
    assert.ok(i.holds.boss, `${i.id} has no boss, and clearing it is what pays \`gives\``);
    assert.ok(i.holds.cache, `${i.id} has nothing to find — the same rule the landmarks live by`);
  }
  // …and each kind of thing to hold is used by somebody, or it is a schema nobody wrote data for
  for (const k of HOLD_KINDS) assert.ok(INSTANCES.some(i => i.holds[k]), `nothing in the file holds a "${k}"`);
});

test('a forced boss is a real one, and a rolled one is a real family and rank', () => {
  const bosses = new Set(BESTIARY.bosses.map(b => b.id));
  const families = new Set([...BESTIARY.enemies, ...BESTIARY.bosses].map(e => e.family));
  const modifiers = (BESTIARY.modifiers || []).length;
  for (const i of INSTANCES) {
    const b = i.holds.boss;
    if (b.id) {
      assert.ok(bosses.has(b.id), `${i.id} wants the boss "${b.id}", who is not in enemies.json`);
    } else {
      assert.ok(families.has(b.family), `${i.id}'s boss is a "${b.family}", which is not a family`);
      assert.ok(['champion', 'rare', 'boss'].includes(b.rank), `${i.id}'s boss is rank "${b.rank}"`);
    }
    assert.ok((b.modifiers ?? 0) >= 1, `${i.id}'s boss wears no modifiers, so it is an ordinary body with a name`);
    assert.ok((b.modifiers ?? 0) <= modifiers, `${i.id} wants more modifiers than exist`);
  }
  // the lair holds the wyrm itself, not a rolled stand-in
  const lair = INSTANCES.find(i => i.dragon);
  assert.equal(lair.holds.boss.id, 'kirrath_cinderwyrm');
  assert.equal(BESTIARY.bosses.find(b => b.id === 'kirrath_cinderwyrm').family, 'dragonkin');
});

test('a cache is a chest grade the game can actually open, and it climbs with the band', () => {
  const grades = BALANCE.chests?.kinds || {};
  const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
  for (const i of INSTANCES) {
    const c = i.holds.cache;
    assert.ok(grades[c.kind], `${i.id} wants a "${c.kind}" chest, which balance.json has never heard of`);
    assert.ok(c.name && c.name.length > 3, `${i.id}'s cache has no name for the reward screen`);
    const floor = RANK[grades[c.kind].floor || 'normal'];
    // a band-4 place paying a band-0 cave's chest is the bug: the walk got longer and the pay did not
    if (i.minBand >= 4) assert.ok(floor >= 3, `${i.id} is band ${i.minBand} and pays a "${c.kind}" chest`);
    else if (i.minBand >= 2) assert.ok(floor >= 2, `${i.id} is band ${i.minBand} and pays a "${c.kind}" chest`);
  }
  // and the lair is the best thing in the file
  const lair = INSTANCES.find(i => i.dragon);
  assert.equal(grades[lair.holds.cache.kind].floor, 'legendary');
  assert.ok((lair.holds.cache.extra ?? 0) >= 1, "the lair's hoard is one chest, which is not a hoard");
});

test('a quest found inside is a shape the quest log understands and points somewhere real', () => {
  const KINDS = ['hunt', 'visit', 'gather', 'clear'];            // js/quests.js QUEST_KINDS
  const ids = new Set(INSTANCES.map(i => i.id));
  const seen = new Set();
  for (const i of INSTANCES) {
    const q = i.holds.quest;
    if (!q) continue;
    assert.ok(!seen.has(q.id), `two instances hold the quest "${q.id}"`);
    seen.add(q.id);
    assert.ok(KINDS.includes(q.kind), `${i.id}'s quest is a "${q.kind}", which js/quests.js does not make`);
    assert.ok(q.title && q.found && q.text, `${i.id}'s quest has no title, object or text`);
    assert.ok(q.reward?.xp > 0 && Array.isArray(q.reward.gold), `${i.id}'s quest pays nothing`);
    if (q.to.startsWith('instance:')) {
      const target = q.to.slice('instance:'.length);
      assert.ok(ids.has(target), `${i.id}'s quest sends you to the "${target}" instance, which does not exist`);
      assert.notEqual(target, i.id, `${i.id}'s quest sends you to where you already are`);
    } else {
      assert.ok(['here', 'town'].includes(q.to), `${i.id}'s quest goes "${q.to}"`);
    }
  }
  // the ask: the lair is findable through somebody else's directions as well as by walking
  const lair = INSTANCES.find(i => i.dragon);
  assert.equal(lair.discovery, 'both');
  assert.ok(INSTANCES.some(i => i.holds.quest?.to === `instance:${lair.id}`),
    "nothing anywhere points at the dragon's lair — 'or through a quest from someone in town or elsewhere'");
});

test('a prisoner is promised only where somebody is kept, and thanks a real faction', () => {
  const keys = new Set(FACTIONS.factions.map(f => f.key));
  for (const i of INSTANCES) {
    const p = i.holds.prisoner;
    if (!p) continue;
    assert.ok(p.count >= 1, `${i.id} frees ${p.count} people`);
    assert.ok(p.who, `${i.id} does not say who is down there`);
    assert.ok(keys.has(p.standing), `${i.id}'s prisoners belong to "${p.standing}", who are nobody`);
    // the mouth has to show it: a place that frees three people with no cage standing is a claim
    const cages = (LAYOUTS[i.plan].rings || []).filter(r => r.piece === 'cage').reduce((n, r) => n + (r.count || 1), 0);
    if (i.plan === 'inst_windward_gaol' || cages) assert.ok(cages >= p.count, `${i.id} frees ${p.count} and has ${cages} cage(s) outside`);
  }
});

// ---------------------------------------------------------------------------- what it pays

test('clearing an instance is worth something, and the payout uses words somebody reads', () => {
  // the same vocabulary data/landmarks.json uses, so the existing switch in main.js can take it
  const KNOWN = ['xp', 'loot', 'gold', 'standing', 'perkPoint', 'revealZone', 'clears'];
  const RARITY = ['normal', 'magic', 'rare', 'legendary'];
  const keys = new Set(FACTIONS.factions.map(f => f.key));
  for (const i of INSTANCES) {
    const g = i.gives || {};
    for (const k of Object.keys(g)) assert.ok(KNOWN.includes(k), `${i.id} gives "${k}", which nothing pays out`);
    assert.ok(g.xp > 0, `${i.id} pays no XP for being cleared`);
    assert.ok(RARITY.includes(g.loot), `${i.id}'s loot floor is "${g.loot}"`);
    assert.ok(Array.isArray(g.gold) && g.gold.length === 2 && g.gold[0] < g.gold[1], `${i.id}'s gold is not a [low, high] span`);
    assert.equal(g.clears, true, `${i.id} never clears, so its mouth stays hostile forever`);
    if (g.standing) assert.ok(keys.has(g.standing), `${i.id} pays standing to "${g.standing}", who are nobody`);
  }
});

test('the pay climbs with the band, and the lair is the best-paid thing in the file', () => {
  const byBand = new Map();
  for (const i of INSTANCES) byBand.set(i.minBand, Math.max(byBand.get(i.minBand) ?? 0, i.gives.xp));
  const bands = [...byBand.keys()].sort((a, b) => a - b);
  let best = -1;
  for (const b of bands) {
    assert.ok(byBand.get(b) >= best, `band ${b} pays less XP than the band under it`);
    best = byBand.get(b);
  }
  const lair = INSTANCES.find(i => i.dragon);
  const others = Math.max(...INSTANCES.filter(i => !i.dragon).map(i => i.gives.xp));
  assert.ok(lair.gives.xp > others * 2, `the lair pays ${lair.gives.xp} against ${others} for everything else`);
});

// ---------------------------------------------------------------------------- against the map

test('8.17 — no instance shares a map glyph with anything already on the map', () => {
  const taken = new Map();
  for (const l of LANDMARKS.landmarks) taken.set(l.icon, `the ${l.kind} landmark`);
  for (const k of STRONGHOLDS.kinds) if (!taken.has(k.icon)) taken.set(k.icon, `the ${k.kind} stronghold`);
  for (const i of INSTANCES) {
    assert.ok(i.icon, `${i.id} has no map icon — it would be drawn as the same dot as everything else`);
    assert.ok(!taken.has(i.icon), `${i.id} draws the "${i.icon}" glyph, which is already ${taken.get(i.icon)}`);
    taken.set(i.icon, `the ${i.id} instance`);
  }
});

test('the twenty new layouts did not disturb the twenty-six that were there', () => {
  const inst = new Set(INSTANCES.map(i => i.plan));
  for (const key of Object.keys(LAYOUTS)) {
    if (key.startsWith('inst_')) assert.ok(inst.has(key), `the "${key}" layout is an instance mouth nothing opens`);
  }
  // the two the brief said to copy the shape of, untouched
  assert.equal(LAYOUTS.gibbet?.tall, 9);
  assert.equal(LAYOUTS.collapsed_mine?.tall, 14);
  // every layout that was there before round 16 is still there. Named rather than counted, so
  // adding a twenty-seventh layout later is not a failure but deleting one is.
  for (const key of [
    'wayshrine', 'standing_stones', 'watchtower', 'gibbet', 'burnt_farm', 'collapsed_mine',
    'ferry_landing', 'toll_bridge', 'hunting_blind', 'cairn_field', 'beacon', 'sunken_wreck',
    'forge_fire', 'broken_road', 'bandit_camp', 'raider_stockade', 'watchtower_hold',
    'border_fort', 'castle', 'cult_circle', 'beast_lair', 'siege_camp',
    'boss_bonefield', 'boss_barrow', 'boss_slagpit', 'boss_ironmuster',
  ]) assert.ok(LAYOUTS[key], `the "${key}" layout has gone`);
  assert.equal(Object.keys(LAYOUTS).filter(k => k.startsWith('inst_')).length, 20, 'there are not twenty mouths');
});

/** Every place a layout can name a piece — the same list tests/poi.test.js keeps. */
function piecesIn(l) {
  const out = new Set();
  for (const c of l.centre || []) out.add(c.piece);
  for (const r of l.rings || []) out.add(r.piece);
  for (const g of l.grids || []) out.add(g.piece);
  for (const s of l.scatter || []) out.add(s.piece);
  if (l.approach) out.add(l.approach.piece);
  return out;
}
