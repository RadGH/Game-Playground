// node --test prototypes/farhold/tests/poi.test.js
//
// "Points of Interest should be indicated on the map … and each one should have either quests,
// prisoners to set free, loot crate to receive, etc; there should be a purpose for going to every
// point of interest." — and item 8.20 of TOWN_EXPANSION.md asks for exactly this file: a
// table-driven test that every POI type has a reward hook.
//
// So the rule these tests enforce is one sentence: NOTHING ON THE MAP IS AN EMPTY VISIT. Every kind
// of place — the fourteen landmarks and the eight enemy structures — must declare something a
// player takes away, must have a layout that is a composed set piece rather than a model on a
// coordinate, and must be tall enough to see before you are standing in it.
//
// The geometry lives in js/sites.js and js/props.js, which import Three.js and so cannot be loaded
// here. The piece and builder NAMES are read out of the source instead: that is enough to catch the
// thing that actually goes wrong, which is a layout naming a piece nobody ever built.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const strongholds = read('../data/strongholds.json');
const setpieces = read('../data/setpieces.json');
const landmarks = read('../data/landmarks.json');
const megaflora = read('../data/megaflora.json');
const balance = read('../data/balance.json');
const sitesSrc = src('../js/sites.js');
const propsSrc = src('../js/props.js');

/** The keys of an `export const NAME = { … }` block, read out of a module we cannot import. */
function exportedKeys(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  assert.ok(start >= 0, `${name} is not exported any more`);
  const body = source.slice(start);
  const keys = new Set();
  // only the keys at depth 1 of the block — a nested `{ geometry: … }` must not count
  let depth = 0;
  for (const line of body.split('\n').slice(1)) {
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
const MEGA = exportedKeys(propsSrc, 'MEGA_BUILDERS');
const PROPS = exportedKeys(propsSrc, 'PROP_KINDS');

/** Everything in the world that a player can walk up to, as one table. */
const POIS = [
  ...(landmarks.landmarks || []).map(l => ({ kind: l.kind, name: l.name, spec: l, hostile: false })),
  ...(strongholds.kinds || []).map(k => ({ kind: k.kind, name: k.name, spec: k, hostile: true, plan: k.plan })),
];

/** What counts as a reason to walk over there. One of these, or the place is scenery. */
const REWARD_HOOKS = [
  'loot', 'prisoners', 'xp', 'perkPoint', 'rest', 'reviveDaily', 'revealZone', 'opensDungeon',
  'bench', 'crossing', 'callsBeast', 'callsPatrol', 'namesFoe', 'travelBonus', 'standing',
  'clears', 'liftsSiege', 'curse', 'startsIncident', 'toll',
];

test('POI table: every kind of place is here and is named', () => {
  assert.ok(POIS.length >= 22, `only ${POIS.length} points of interest`);
  const kinds = POIS.map(p => p.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'two places share a kind');
  for (const p of POIS) {
    assert.ok(p.name && p.name.length > 2, `${p.kind} has no name`);
    assert.ok(p.spec.blurb, `${p.kind} has no blurb — nothing to print when you arrive`);
  }
});

test('8.17 — every POI type has its own map icon', () => {
  const seen = new Map();
  for (const p of POIS) {
    assert.ok(p.spec.icon, `${p.kind} has no map icon — it would be drawn as the same dot as everything else`);
    // two kinds may share a silhouette only if they really are the same thing on the ground
    const already = seen.get(p.spec.icon);
    if (already) assert.ok(['tower'].includes(p.spec.icon), `${p.kind} and ${already} share the "${p.spec.icon}" icon`);
    seen.set(p.spec.icon, p.kind);
  }
});

test('8.19 — arriving somewhere for the first time is worth something', () => {
  for (const p of POIS) {
    const xp = p.spec.gives?.xp || 0;
    assert.ok(xp > 0, `${p.kind} pays no discovery XP`);
    if (p.hostile) assert.ok(xp >= 40, `${p.kind} is a fight and pays ${xp} XP`);
  }
});

test('8.20 — no POI without a purpose', () => {
  for (const p of POIS) {
    const gives = p.spec.gives || {};
    const hooks = Object.keys(gives).filter(k => REWARD_HOOKS.includes(k) && gives[k] !== false && gives[k] !== 0);
    assert.ok(hooks.length > 0,
      `${p.kind} gives nothing: an empty visit. Add one of ${REWARD_HOOKS.join(', ')} to its \`gives\`.`);
  }
});

test('7.2 / 7.3 — every enemy structure has a chest and a named boss', () => {
  const grades = Object.keys(balance.chests?.kinds || {});
  for (const k of strongholds.kinds || []) {
    assert.ok(k.chest?.kind, `${k.kind} has no chest`);
    assert.ok(grades.includes(k.chest.kind), `${k.kind} wants a "${k.chest.kind}" chest, which balance.json has never heard of`);
    assert.ok(k.boss?.rank, `${k.kind} has no boss`);
    assert.ok((k.boss.epithets || []).length >= 3, `${k.kind}'s boss has fewer than three epithets, so every one of them is called the same thing`);
    assert.ok(k.garrison?.count?.length === 2, `${k.kind} has no garrison`);
    assert.ok(k.garrison.count[0] >= 3, `${k.kind} garrisons ${k.garrison.count[0]} — that is a straggler, not a camp`);
  }
});

test('7.2 — the chest grade climbs with the tier, and never falls', () => {
  // the floor a chest guarantees, worst to best. A tier-4 castle paying a tier-1 camp's chest is
  // the bug this catches.
  const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
  const byTier = new Map();
  for (const k of strongholds.kinds || []) {
    const floor = balance.chests.kinds[k.chest.kind].floor || 'normal';
    const at = byTier.get(k.tier) || [];
    at.push({ kind: k.kind, floor: RANK[floor] });
    byTier.set(k.tier, at);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  let seen = -1;
  for (const t of tiers) {
    const best = Math.max(...byTier.get(t).map(e => e.floor));
    assert.ok(best >= seen, `tier ${t} pays worse than tier ${t - 1}`);
    seen = best;
  }
  const castle = (strongholds.kinds || []).find(k => k.tier === 4);
  assert.ok(castle && balance.chests.kinds[castle.chest.kind].floor === 'legendary',
    'the biggest thing on the map should be the best-paid thing on the map');
});

test('7.17 — a garrison asks for families and roles the bestiary actually has', () => {
  // `defsFor` filters on these, and a typo does not throw — it silently falls back to "anything that
  // lives here", so a cult circle quietly fills with moor hounds and nobody ever notices.
  const bestiary = read('../data/enemies.json');
  const families = new Set([...bestiary.enemies, ...bestiary.bosses].map(e => e.family));
  const roles = new Set(bestiary.enemies.map(e => e.role));
  for (const k of strongholds.kinds || []) {
    for (const f of k.garrison.prefer?.families || []) assert.ok(families.has(f), `${k.kind} garrisons "${f}", which is not a family in enemies.json`);
    for (const r of k.garrison.prefer?.roles || []) assert.ok(roles.has(r), `${k.kind} garrisons "${r}", which is not a role in enemies.json`);
  }
  // …and a boss that asks for a real boss must be able to get one
  for (const k of strongholds.kinds || []) {
    if (k.boss.rank === 'boss') assert.ok(bestiary.bosses.length > 0, 'nothing in the boss table');
    else assert.ok(['champion', 'rare'].includes(k.boss.rank), `${k.kind}'s boss is rank "${k.boss.rank}"`);
    assert.ok((k.boss.modifiers ?? 0) >= 1, `${k.kind}'s boss wears no modifiers, so it is an ordinary body with a name`);
    assert.ok((k.boss.modifiers ?? 0) <= bestiary.modifiers.length, `${k.kind} wants more modifiers than exist`);
  }
});

test('7.16 — a garrison sits on a real slot, not on a coordinate', () => {
  const SLOTS = ['landmark', 'pass', 'dungeon', 'crossing', 'road', 'junction'];
  for (const k of strongholds.kinds || []) {
    assert.ok((k.on || []).length, `${k.kind} says nothing about where it may stand`);
    for (const on of k.on) assert.ok(SLOTS.includes(on), `${k.kind} wants to sit on "${on}", which js/sites.js does not make slots for`);
  }
  // …and the chance table has a number for every one of them
  for (const on of SLOTS) assert.ok(Number.isFinite(strongholds.chance?.[on]), `no placement chance for a ${on} slot`);
  assert.ok(strongholds.chance.road <= 0.2, 'a garrison on one road slot in five turns the highway into a gauntlet');
});

test('7.17 — the big ones are kept out of the starting valley', () => {
  for (const k of strongholds.kinds || []) {
    if (k.tier >= 3) assert.ok((k.minBand ?? 1) >= 2, `${k.kind} is tier ${k.tier} and may appear in a band-1 zone`);
    if (k.tier >= 4) assert.ok((k.minBand ?? 1) >= 3, `a castle in band ${k.minBand} is a wall, not a landmark`);
  }
});

test('8.2 — every POI has a layout, and it is a composed set piece', () => {
  const layouts = setpieces.layouts || {};
  for (const p of POIS) {
    const key = p.plan || p.kind;
    const l = layouts[key];
    assert.ok(l, `${p.kind} has no layout in data/setpieces.json — it would be built out of nothing`);
    assert.ok((l.centre || []).length >= 1, `${key} has no centre`);
    const ringPieces = (l.rings || []).reduce((n, r) => n + (r.count || 1), 0);
    const scatter = (l.scatter || []).reduce((n, r) => n + (r.count || 0), 0);
    const approach = (l.approach?.count || 0) * (l.approach?.both ? 2 : 1);
    const total = (l.centre || []).length + ringPieces + scatter + approach;
    assert.ok(total >= 10, `${key} is ${total} pieces — that is "a couple of random models thrown on top of a coordinate"`);
    assert.ok(approach >= 4 || ringPieces >= 8, `${key} has neither an approach nor a surround`);
  }
});

test('8.3 — a set piece is visible from the next ridge', () => {
  // the tallest ordinary prop is the conifer, at 9 m. A landmark you cannot pick out over the trees
  // is a landmark you will never walk to.
  const TALLEST_TREE = 9;
  for (const [key, l] of Object.entries(setpieces.layouts || {})) {
    assert.ok(Number.isFinite(l.tall), `${key} does not say how tall it is`);
    assert.ok(l.tall >= TALLEST_TREE, `${key} stands ${l.tall} m — shorter than a conifer`);
  }
  const castle = setpieces.layouts.castle;
  assert.ok(castle.tall >= 28, 'a castle should be the thing you navigate by');
});

test('8.2 — every piece a layout asks for has been built', () => {
  for (const [key, l] of Object.entries(setpieces.layouts || {})) {
    const asked = new Set();
    for (const c of l.centre || []) asked.add(c.piece);
    for (const r of l.rings || []) asked.add(r.piece);
    for (const s of l.scatter || []) asked.add(s.piece);
    if (l.approach) asked.add(l.approach.piece);
    for (const piece of asked) assert.ok(PIECES.has(piece), `${key} asks for a "${piece}", and js/sites.js has no such piece`);
  }
  // and nothing was built that nothing uses
  const used = new Set();
  for (const l of Object.values(setpieces.layouts || {})) {
    for (const c of l.centre || []) used.add(c.piece);
    for (const r of l.rings || []) used.add(r.piece);
    for (const s of l.scatter || []) used.add(s.piece);
    if (l.approach) used.add(l.approach.piece);
  }
  for (const piece of PIECES) assert.ok(used.has(piece), `the "${piece}" piece is built and never placed`);
});

test('7.14 — a faction-owned structure names a faction that exists', () => {
  const factions = read('../data/factions.json');
  const keys = new Set((factions.factions || []).map(f => f.key));
  for (const p of POIS) {
    if (!p.spec.faction) continue;
    assert.ok(keys.has(p.spec.faction), `${p.kind} is held by "${p.spec.faction}", who are nobody`);
  }
});

test('7.15 — prisoners are only promised where there is somewhere to keep them', () => {
  for (const k of strongholds.kinds || []) {
    const n = k.gives?.prisoners || 0;
    if (!n) continue;
    const l = setpieces.layouts[k.plan];
    const cages = (l.rings || []).filter(r => r.piece === 'cage').reduce((s, r) => s + (r.count || 1), 0);
    assert.ok(cages >= n, `${k.kind} frees ${n} but has ${cages} cage(s) standing`);
  }
});

// ---------------------------------------------------------------------------- megaflora (F16)

test('F16 — megaflora is two to three times the tallest tree', () => {
  // the tallest ordinary prop, read out of js/props.js rather than written down twice
  const talls = [...propsSrc.matchAll(/^\s{2}([a-z_]+):\s*\{\s*tall:\s*([\d.]+)/gim)].map(m => [m[1], Number(m[2])]);
  const tallest = Math.max(...talls.map(t => t[1]));
  assert.equal(tallest, 9, `the tallest ordinary prop is now ${tallest} m — recheck the 2-3x band`);
  for (const [key, spec] of Object.entries(megaflora.kinds || {})) {
    assert.ok(spec.tall >= tallest * 2, `${key} is ${spec.tall} m, under twice the tallest tree`);
    assert.ok(spec.tall <= tallest * 3, `${key} is ${spec.tall} m, over three times the tallest tree`);
    assert.ok(MEGA.has(key), `data/megaflora.json wants a "${key}" and js/props.js has no builder for one`);
    assert.ok(Array.isArray(spec.solid) && spec.solid.length === 2, `${key} has no collision box — you would walk through a 24 m tree`);
  }
  for (const key of MEGA) assert.ok(megaflora.kinds[key], `js/props.js builds a "${key}" that no biome ever asks for`);
});

test('F16 — every land biome got a pass', () => {
  // the biome list is the one js/props.js already plants, so a new biome cannot quietly miss out
  const kitKeys = [...propsSrc.matchAll(/^\s{2}([A-Za-z]+):\s*\[\['/gm)].map(m => m[1]);
  assert.ok(kitKeys.length >= 20, `only found ${kitKeys.length} biome kits in props.js`);
  for (const key of kitKeys) {
    const mix = megaflora.biomes[key];
    assert.ok(mix && mix.length, `${key} has no megaflora — the ask was "another pass over each biome"`);
    for (const [kind, chance] of mix) {
      assert.ok(megaflora.kinds[kind], `${key} asks for a "${kind}" that is not in the catalogue`);
      assert.ok(chance > 0 && chance <= 0.05,
        `${key}/${kind} at ${chance} per cell: over 0.05 and they stop being landmarks`);
    }
  }
  assert.ok(PROPS.size >= 17, `the ordinary prop catalogue shrank to ${PROPS.size}`);
});
