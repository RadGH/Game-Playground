// node --test prototypes/farhold/tests/worldbosses.test.js
//
// "Add world bosses of varying tiers, which are stronger than the level they reside in and are much
// larger and swarming in minions. These events should be displayed on the map for the region you
// are in."
//
// Four claims in one sentence, and each of them is a number somebody can quietly get wrong later:
//
//   varying tiers      -> all four tiers exist, and the ladder never goes backwards.
//   stronger           -> `over` is a real number of levels above the ground it stands on.
//   much larger        -> rendered size is twice the biggest thing the bestiary otherwise holds.
//   swarming           -> a `minions` block that actually keeps adding while the boss lives.
//   on the map         -> a pin with a colour and a radius js/main.js can forward.
//
// The geometry and the spawning live in js/sites.js and js/actors.js, which import Three.js and so
// cannot be loaded here. Their SOURCE is read instead — which catches the thing that actually goes
// wrong, a data file naming a hook nobody wired.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const wb = read('../data/worldbosses.json');
const setpieces = read('../data/setpieces.json');
const bestiary = read('../data/enemies.json');
const balance = read('../data/balance.json');
const items = read('../../emberveil/data/items.json');
const sitesSrc = src('../js/sites.js');
const actorsSrc = src('../js/actors.js');
const spellfxSrc = src('../../../avatar-3d/js/spellfx.js');
const creatureSrc = src('../../../avatar-3d/js/creature-types.js');

const BOSSES = wb.bosses || [];
const LAYOUTS = setpieces.layouts || {};
const CHEST_KINDS = new Set(Object.keys(balance.chests?.kinds || {}));
const MODIFIERS = new Set((bestiary.modifiers || []).map(m => m.id));
const FAMILIES = new Set((bestiary.enemies || []).map(e => e.family));
const ROLES = new Set((bestiary.enemies || []).map(e => e.role));
const ITEM_BASES = new Set([
  ...Object.keys(items.weaponBases || {}),
  ...Object.keys(items.armorBases || {}),
]);

/** The keys of an `export const NAME = { … }` block, read out of a module we cannot import. */
function exportedKeys(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  assert.ok(start >= 0, `${name} is not exported any more`);
  const keys = new Set();
  let depth = 0;
  for (const line of source.slice(start).split('\n').slice(1)) {
    const opens = (line.match(/[{[(]/g) || []).length;
    const closes = (line.match(/[}\])]/g) || []).length;
    if (depth === 0) {
      const m = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s*:/i);
      if (m) keys.add(m[1]);
      if (/^\};/.test(line)) break;
    }
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
  return keys;
}

const PIECES = exportedKeys(sitesSrc, 'PIECES');
const STATUS_FX = exportedKeys(spellfxSrc, 'STATUS_FX');
const CREATURES = exportedKeys(creatureSrc, 'CREATURE_TYPES');

/** The ladder from the file's own `_tierDoc`. Change one and this is what tells you. */
const LADDER = {
  1: { over: 2, scale: 1.9, chest: 'iron', minBand: 0 },
  2: { over: 3, scale: 2.2, chest: 'gilded', minBand: 2 },
  3: { over: 4, scale: 2.6, chest: 'gilded', minBand: 4 },
  4: { over: 5, scale: 3.0, chest: 'warded', minBand: 5 },
};

/** What counts as a reason to go. Same table tests/poi.test.js enforces for every other place. */
const REWARD_HOOKS = [
  'loot', 'prisoners', 'xp', 'perkPoint', 'rest', 'reviveDaily', 'revealZone', 'opensDungeon',
  'bench', 'crossing', 'callsBeast', 'callsPatrol', 'namesFoe', 'travelBonus', 'standing', 'clears',
];

test('5.1 — varying tiers: all four exist, and none of them is alone', () => {
  assert.ok(BOSSES.length >= 8, `${BOSSES.length} world bosses is not a spread`);
  for (const tier of [1, 2, 3, 4]) {
    const n = BOSSES.filter(b => b.tier === tier).length;
    assert.ok(n >= 2, `tier ${tier} has ${n} world boss — a tier with one entry is a fixed encounter`);
  }
  const names = BOSSES.map(b => b.name);
  assert.equal(new Set(names).size, names.length, 'two world bosses share a name');
  const ids = BOSSES.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'two world bosses share an id');
});

test('5.1 — the tier ladder never goes backwards', () => {
  for (const b of BOSSES) {
    const want = LADDER[b.tier];
    assert.ok(want, `${b.id} is tier ${b.tier}, which is not on the ladder`);
    assert.equal(b.over, want.over, `${b.id} is tier ${b.tier} but sits ${b.over} levels over, not ${want.over}`);
    assert.equal(b.scale, want.scale, `${b.id} is tier ${b.tier} but is scale ${b.scale}, not ${want.scale}`);
    assert.equal(b.chest?.kind, want.chest, `${b.id} is tier ${b.tier} but pays a ${b.chest?.kind} chest, not ${want.chest}`);
    assert.equal(b.minBand, want.minBand, `${b.id} is tier ${b.tier} but may sit in band ${b.minBand}, not ${want.minBand}`);
  }
  // and a tier 1 really can stand in the starting valley, which is the whole point of "varying"
  assert.ok(BOSSES.some(b => b.tier === 1 && b.minBand === 0),
    'no world boss the starting region may hold — then there are no tiers, only a late-game boss');
});

test('5.1 — "stronger than the level they reside in"', () => {
  for (const b of BOSSES) {
    assert.ok(b.over > 0, `${b.id} is built at its zone's own level — it is just a big enemy`);
    assert.ok(b.hp > 0 && Array.isArray(b.dmg) && b.dmg.length === 2, `${b.id} has no stat block`);
    assert.ok(b.dmg[1] > b.dmg[0], `${b.id}'s damage range is back to front`);
  }
  // the ladder has to be worth climbing: each tier's raw health beats the tier below it
  for (const tier of [2, 3, 4]) {
    const below = Math.max(...BOSSES.filter(b => b.tier === tier - 1).map(b => b.hp));
    const here_ = Math.min(...BOSSES.filter(b => b.tier === tier).map(b => b.hp));
    assert.ok(here_ > below, `the weakest tier-${tier} world boss has less health than the toughest tier-${tier - 1}`);
  }
});

test('5.1 — "much larger": twice anything else that lives on this planet', () => {
  // the biggest body the bestiary otherwise puts on the ground, rank scaling included: a rare is
  // 1.35x (js/rpg.js) and the Giant modifier is 3.2x, but a Giant rare is a rarity — the honest
  // comparison is the hand-written dungeon bosses, which are the largest thing you see as a matter
  // of course.
  const biggestBoss = Math.max(...(bestiary.bosses || []).map(b => b.look?.creature?.size || 0));
  for (const b of BOSSES) {
    const size = b.look?.creature?.size;
    assert.ok(size > 0, `${b.id} has no creature look, so nothing sizes it`);
    const rendered = size * b.scale;
    assert.ok(rendered >= biggestBoss * 1.5,
      `${b.id} renders at ${rendered.toFixed(1)} against a dungeon boss's ${biggestBoss} — that is not "much larger"`);
    assert.ok(b.reach >= 4, `${b.id} is ${rendered.toFixed(1)} across and swings ${b.reach} m — it would have to hug you`);
  }
  // …and the ladder shows in the body too
  for (const tier of [2, 3, 4]) {
    const below = Math.max(...BOSSES.filter(b => b.tier === tier - 1).map(b => b.scale));
    const here_ = Math.min(...BOSSES.filter(b => b.tier === tier).map(b => b.scale));
    assert.ok(here_ > below, `tier ${tier} is no bigger than tier ${tier - 1}`);
  }
});

test('5.1 — js/actors.js actually folds def.scale and def.fx in', () => {
  // the data above is inert unless the field reads it. This is the hook that makes a world boss big.
  assert.match(actorsSrc, /\(def\.scale \?\? 1\)/,
    'js/actors.js `add()` no longer multiplies by def.scale — every world boss is back to ordinary size');
  assert.match(actorsSrc, /unit\.fx = \[\.\.\.\(def\.fx \|\| \[\]\)/,
    'js/actors.js no longer reads def.fx — world bosses lose their auras');
  assert.match(actorsSrc, /e\.quarry/,
    'js/actors.js no longer turns a runner away from the player — the chase events cannot be lost');
});

test('5.1 — "swarming in minions": a wave block that keeps adding', () => {
  for (const b of BOSSES) {
    const m = b.minions;
    assert.ok(m, `${b.id} has no minions — then it is a lair boss standing on its own`);
    for (const key of ['first', 'add']) {
      assert.ok(Array.isArray(m[key]) && m[key].length === 2, `${b.id}.minions.${key} is not a [min,max]`);
      assert.ok(m[key][1] >= m[key][0] && m[key][0] >= 1, `${b.id}.minions.${key} is back to front or empty`);
    }
    assert.ok(m.every > 0 && m.every <= 30, `${b.id} calls a wave every ${m.every} s — that is not a swarm`);
    assert.ok(m.max >= m.first[1] + m.add[0],
      `${b.id} caps its swarm at ${m.max}, which is at or under what it opens with — no wave could ever land`);
    assert.ok(m.radius >= 12, `${b.id}'s minions come up ${m.radius} m out — they would be inside the boss`);
    assert.ok(m.weaken > 0 && m.weaken <= 1, `${b.id}'s minions are rolled at ${m.weaken}x its level`);
    assert.ok(typeof m.announce === 'string' && m.announce.length > 8, `${b.id} says nothing when a wave arrives`);
    for (const f of m.prefer?.families || []) assert.ok(FAMILIES.has(f), `${b.id} wants "${f}" minions and the bestiary has none`);
    for (const r of m.prefer?.roles || []) assert.ok(ROLES.has(r), `${b.id} wants "${r}" minions and the bestiary has none`);
  }
  // and the swarm grows with the tier
  for (const tier of [2, 3, 4]) {
    const below = Math.max(...BOSSES.filter(b => b.tier === tier - 1).map(b => b.minions.max));
    const here_ = Math.min(...BOSSES.filter(b => b.tier === tier).map(b => b.minions.max));
    assert.ok(here_ >= below, `tier ${tier} swarms no harder than tier ${tier - 1}`);
  }
});

test('5.1 — js/sites.js runs the waves, and stops when the boss goes down', () => {
  assert.match(sitesSrc, /function tickWaves\(/, 'the swarm clock is gone');
  assert.match(sitesSrc, /tickWaves\(px, pz\);[\s\S]{0,400}if \(!force && lastCentre/,
    'tickWaves is below the 180 m movement guard, so a wave would only land when you walk a furlong');
  assert.match(sitesSrc, /rec\.site\.cleared = true/, 'a dead world boss no longer clears its site — it would come back');
  assert.match(sitesSrc, /family === 'worldboss' && waveFor\(s\.key\)/,
    "relax() no longer skips a live world boss — walking away and back would put a second one on the same spot");
});

test('5.1 — every world boss is findable: a map pin and a slot somebody would fortify', () => {
  for (const b of BOSSES) {
    assert.ok(b.pin?.color && /^#[0-9a-f]{6}$/i.test(b.pin.color), `${b.id} has no map colour`);
    assert.ok(b.pin.r >= 5, `${b.id}'s pin is ${b.pin.r} across — the same size as a bandit camp`);
    assert.ok((b.on || []).length, `${b.id} may not sit anywhere`);
    for (const on of b.on) {
      assert.ok(['landmark', 'pass', 'dungeon', 'crossing'].includes(on), `${b.id} may sit on a "${on}"`);
      assert.ok(on !== 'road' && on !== 'junction', `${b.id} may stand on the road, which is a wall and not an event`);
    }
  }
  assert.equal(wb.chance.road, 0, 'a world boss on a road slot blocks the only way out of a zone');
  assert.equal(wb.chance.junction, 0, 'a world boss on a crossroads blocks the only way out of a zone');
  // a pin the tiers are told apart by
  const colours = new Set(BOSSES.map(b => `${b.tier}:${b.pin.color}`));
  assert.equal(colours.size, 4, 'the tiers do not each have their own pin colour');
});

test('5.1 — no world boss is an empty visit', () => {
  for (const b of BOSSES) {
    const gives = b.gives || {};
    const hooks = REWARD_HOOKS.filter(h => gives[h] !== undefined && gives[h] !== false);
    assert.ok(hooks.length, `${b.id} gives nothing — the same bug tests/poi.test.js exists to catch`);
    assert.ok(gives.clears, `${b.id} does not clear its site, so it would refill after you killed it`);
    assert.ok(CHEST_KINDS.has(b.chest?.kind), `${b.id}'s chest is a "${b.chest?.kind}", which balance.json has never heard of`);
    for (const base of b.dropBases || []) {
      assert.ok(ITEM_BASES.has(base), `${b.id} drops a "${base}", which items.json does not carry`);
    }
  }
});

test('5.1 — every arena is a real set piece and is built out of real pieces', () => {
  for (const b of BOSSES) {
    const l = LAYOUTS[b.plan];
    assert.ok(l, `${b.id} names the layout "${b.plan}", and data/setpieces.json has no such thing`);
    assert.ok(l.hostile, `${b.plan} is not marked hostile`);
    assert.ok(l.tall >= 14, `${b.plan} stands ${l.tall} m — a world boss arena you cannot see coming`);
    const asked = new Set();
    for (const c of l.centre || []) asked.add(c.piece);
    for (const r of l.rings || []) asked.add(r.piece);
    for (const sc of l.scatter || []) asked.add(sc.piece);
    if (l.approach) asked.add(l.approach.piece);
    for (const piece of asked) assert.ok(PIECES.has(piece), `${b.plan} asks for a "${piece}" and js/sites.js has no such piece`);
    // room to back off in: the swarm comes up inside `minions.radius`, so the ring has to be wider
    const widest = Math.max(0, ...(l.rings || []).map(r => r.radius || 0), ...(l.scatter || []).map(r => r.radius || 0));
    assert.ok(widest >= b.minions.radius,
      `${b.plan} is ${widest} m across and ${b.id}'s swarm comes up at ${b.minions.radius} m — outside its own arena`);
  }
});

test('5.1 — the middle of an arena is empty, because the boss stands in it', () => {
  // Found in a screenshot: boss_bonefield put a den at the centre and boss_ironmuster a keep, and
  // js/sites.js spawns the boss at the site's own coordinate — so a nine-metre body stood inside a
  // solid model and you could not see the thing you had walked two kilometres to look at.
  const CLEAR = 9;   // metres of ground the body itself needs
  for (const plan of new Set(BOSSES.map(b => b.plan))) {
    const l = LAYOUTS[plan];
    for (const c of l.centre || []) {
      const d = Math.hypot(c.x || 0, c.z || 0);
      assert.ok(d >= CLEAR, `${plan} puts a "${c.piece}" ${d.toFixed(1)} m from the middle — the boss spawns inside it`);
    }
    for (const r of l.rings || []) {
      assert.ok((r.radius || 0) - (r.jitter || 0) >= CLEAR, `${plan}'s ${r.piece} ring reaches the middle`);
    }
    for (const sc of l.scatter || []) {
      assert.ok((sc.inner ?? 0) >= CLEAR, `${plan} scatters "${sc.piece}" from ${sc.inner ?? 0} m — into the boss`);
    }
  }
});

test('5.1 — the look, the auras and the phases all name things that exist', () => {
  for (const b of BOSSES) {
    const type = b.look?.creature?.type;
    assert.ok(CREATURES.has(type), `${b.id} is a "${type}", which avatar-3d has no body plan for`);
    for (const key of b.fx || []) assert.ok(STATUS_FX.has(key), `${b.id} wears a "${key}" aura, which spellfx.js does not have`);
    for (const p of b.phases || []) {
      assert.ok(MODIFIERS.has(p.modifier), `${b.id}'s phase turns on "${p.modifier}", which data/enemies.json has never heard of`);
      assert.ok(p.at > 0 && p.at < 1, `${b.id} has a phase at ${p.at} of its health`);
      assert.ok(p.say, `${b.id}'s phase happens silently`);
    }
    const ats = (b.phases || []).map(p => p.at);
    assert.deepEqual(ats, [...ats].sort((x, y) => y - x), `${b.id}'s phases are out of order`);
  }
});

test('5.1 — the biomes are the vocabulary js/sites.js actually matches on', () => {
  // `tagsFor` builds its tag set out of GROUND_TAGS plus the slot type. A world boss asking for
  // "lava" would silently never be placed, which is the worst kind of bug: no error, no boss.
  const ground = new Set(['any']);
  const block = sitesSrc.slice(sitesSrc.indexOf('const GROUND_TAGS = {'));
  for (const m of block.slice(0, block.indexOf('};')).matchAll(/'([a-z]+)'/g)) ground.add(m[1]);
  for (const b of BOSSES) {
    for (const t of b.biomes || []) {
      assert.ok(ground.has(t), `${b.id} wants "${t}" ground, which js/sites.js's GROUND_TAGS never produces`);
    }
  }
});
