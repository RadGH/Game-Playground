// node --test prototypes/thousandvale/tests/E/playtest3.test.js
// Owner play-test 3 (~/claude/agent/mmo/round-playtest3.md), stream E's content:
//   R7  "The Chained Saint: 'get behind the chain' but there are no chains — 4 pillars". The arena must match the
//       call-out, and EVERY call-out that tells the player to go behind / onto / into / light / pull a thing must
//       name a thing that is really there (an arena object the script spawns, or a zone the client draws).
//   R2  the starting chain: Old Gristle and his quest are level 2, the Ploughman's Crypt is a level 2 dungeon
//   R3  zone events start when someone comes near, with a short countdown
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';

const DIR = new URL('../../data/encounters/', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const SCRIPTS = readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => read(f)).filter(d => d.phases);

/** Every line a player can read from a script (call-outs; not the design notes). */
function lines(s) {
  const out = [];
  const walk = (v, k) => {
    if (typeof v === 'string' && /^(say|failSay|shieldDown|pull|death|reset)$/.test(k)) out.push(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (!/^(_doc|party|place|blurb|note)$/.test(kk)) walk(vv, kk);
  };
  walk(s, '');
  return out;
}
/** The objects a script can put on the floor (arena + actions + `leave`), as "type name" strings. */
function objectsOf(s) {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.type === 'string' && /^(pillar|rock|brazier|lever|pool|cracked_floor)$/.test(v.type)) out.push(v);
      Object.values(v).forEach(walk);
    }
  };
  walk([s.arena, s.abilities, s.phases, s.triggers]);
  return out;
}
const hasZones = s => /"kind":\s*"(safe|soak|stack)"|"shape":\s*"(donut|ring)"/.test(JSON.stringify(s));
/** Words that name a zone the client DRAWS (a safe / soak / stack telegraph, or the safe middle of a ring), for scripts that place one. */
const DRAWN = /^(circles?|rings?|light|cracks?|craters?|spots?|ground|dry|shadows?|middle|centre|candlelight|lantern)$/;
/** A player instruction that sends you to a THING: hide behind it, climb onto it, light it, pull it... */
const INSTR = /\b(?:hide behind|get behind|stay behind|climb onto|climb up on|get onto|get up on|stand on|get into|step into|come into|light all (?:three|four|two)|light the|pull the|pull a|smash all (?:three|four)|smash the|douse the|use the)\s+(?:one of the (?:two |three |four )?|the |a |an |each |every |both )?([a-z'-]+)(?:\s([a-z'-]+))?/gi;
const SELF = /^(him|her|it|them|you|me|{target}|{boss})$/i;

test('R7: the Chained Saint — four chained PILLARS with a chain to the Saint, and the call-outs say pillar / dry circles', () => {
  const s = read('mb_chained_saint.json');
  const posts = s.arena.objects.filter(o => o.type === 'pillar');
  assert.equal(posts.length, 4);
  for (const p of posts) {
    assert.match(p.name, /pillar/i, 'the nameplate says what it is');
    assert.equal(p.look, 'chained', 'the client dresses it with a shackle and chain');
    assert.equal(p.tether, true, 'and runs the chain to the Saint');
  }
  assert.match(s.abilities.gaze.say, /behind a pillar/);
  assert.ok(s.abilities.gaze.telegraphs[0].los, 'the gaze is a line-of-sight blast the pillars block');
  assert.match(s.abilities.plinths.say, /dry circles/);
  assert.ok(s.abilities.plinths.telegraphs.every(t => t.kind === 'safe'), 'the dry circles are drawn safe zones');
  for (const t of lines(s)) assert.ok(!/chain post|behind the chain|plinths/i.test(t), `no prop that is not there: "${t}"`);
});

test('R7: every call-out that sends the player to a thing names a thing that is there (all scripts)', () => {
  const bad = [];
  let checked = 0;
  for (const s of SCRIPTS) {
    const objs = objectsOf(s).map(o => `${o.type} ${o.name || ''}`.toLowerCase());
    const zones = hasZones(s);
    // a quoted shout is the boss talking to its own crew ("Light the swivel!"), not an instruction to the player
    for (const t of lines(s)) for (const m of t.replace(/"[^"]*"/g, '').matchAll(INSTR)) {
      checked++;
      const w = [m[1], m[2] || ''].map(x => x.toLowerCase());
      if (SELF.test(w[0])) continue;
      const sing = x => x.replace(/(es|s)$/, '');
      if (objs.some(o => o.includes(sing(w[0])) || (w[1] && o.includes(sing(w[1]))))) continue;
      if (zones && (DRAWN.test(w[0]) || DRAWN.test(w[1]))) continue;
      bad.push(`${s.id}: "${m[0]}" in "${t}"`);
    }
  }
  assert.ok(checked >= 30, `${checked} instructions checked`);
  assert.deepEqual(bad, []);
});

test('R7: every line-of-sight blast has something on the floor to hide behind', () => {
  const bad = [];
  for (const s of SCRIPTS) {
    if (!/"los":\s*true/.test(JSON.stringify(s.abilities || {}))) continue;
    const blockers = objectsOf(s).filter(o => o.blocks ?? (o.type === 'pillar' || o.type === 'rock'));
    if (!blockers.length) bad.push(s.id);
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------------------------------------- R2: monsters near the start

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const SHEET = J('data/provinces/torbor_downs.json');

test('R2: the start zone and its neighbours have extra solo / pair monsters (<zone>.hunt.json) — level 1-3, on open walkable ground, out of town', () => {
  const start = MAP[SHEET.grid.start];
  const files = Object.values(MAP).filter(w => existsSync(new URL(`data/vignettes/placements/${w}.hunt.json`, root)));
  assert.ok(files.includes(start), 'the start zone has a hunt file');
  assert.ok(files.length >= 4, `${files.length} zones near the start have one`);
  const ids = new Set();
  for (const wid of files) {
    const h = J(`data/vignettes/placements/${wid}.hunt.json`);
    const terrain = parseTerrain(readFileSync(new URL(`data/zones/${wid}/terrain.bin`, root)));
    const nav = parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, root)));
    assert.equal(h.terrainHash, terrain.meta.inputHash, `${wid}: hunt file made for this bake`);
    const main = J(`data/vignettes/placements/${wid}.json`).placements;
    for (const p of h.placements) {
      assert.ok(!ids.has(p.id), `unique id ${p.id}`); ids.add(p.id);
      assert.equal(p.type, 'camp');
      assert.ok(p.hunt && (p.stray || p.roam));
      assert.ok(p.count[1] <= 2, `${p.id}: solos and pairs only`);
      assert.ok(p.level[1] <= 4 && p.level[0] >= 1, `${p.id}: level ${p.level}`);
      const b = nav.at(p.x, p.z);
      assert.ok((b & NAV.WALK) && !(b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN)), `${p.id} at (${p.x}, ${p.z}) on open ground`);
      for (const q of p.path || []) assert.ok(nav.at(q[0], q[1]) & NAV.WALK, `${p.id} path on walkable ground`);
      assert.ok(!main.some(q => q.id === p.id), 'not also in the main file');
    }
  }
  const sh = J(`data/vignettes/placements/${start}.hunt.json`);
  assert.ok(sh.placements.length >= 150, `${sh.placements.length} hunt camps in the start zone`);
  assert.ok(sh.stats.covered >= 0.95, `${sh.stats.covered} of the low-level open ground has a monster within 55 m`);
  assert.ok(sh.placements.filter(p => p.roam).length >= 30, 'a third of them roam');
});

test('R2: near the start hub, a monster camp (any kind) within 60 m of almost every open sample, and along every road', () => {
  const start = MAP[SHEET.grid.start];
  const nav = parseNav(readFileSync(new URL(`data/zones/${start}/nav.bin`, root)));
  const bake = J(`data/zones/${start}/placements.json`).placements;
  const hub = bake.find(p => p.kind === 'settlement' && p.data.hub);
  const camps = [...J(`data/vignettes/placements/${start}.json`).placements, ...J(`data/vignettes/placements/${start}.hunt.json`).placements].filter(p => p.type === 'camp' || p.type === 'rare');
  const towns = bake.filter(p => p.kind === 'settlement');
  const pts = camps.flatMap(c => [[c.x, c.z], ...(c.path || [])]);     // a roaming pack covers its loop
  let open = 0, near = 0, road = 0, roadNear = 0;
  for (let z = hub.z - 700; z <= hub.z + 700; z += 16) for (let x = hub.x - 700; x <= hub.x + 700; x += 16) {
    if (x < 40 || z < 40 || x > 2008 || z > 2008) continue;
    const b = nav.at(x, z);
    if (!(b & NAV.WALK) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN | NAV.SHALLOW))) continue;
    if (towns.some(t => Math.hypot(t.x - x, t.z - z) < (t.data.radius || 40) + 80)) continue;
    const d = Math.min(...pts.map(c => Math.hypot(c[0] - x, c[1] - z)));
    if (b & NAV.ROAD) { road++; if (d <= 70) roadNear++; } else { open++; if (d <= 60) near++; }
  }
  assert.ok(open > 500, `${open} open samples`);
  assert.ok(near / open >= 0.9, `${(100 * near / open).toFixed(1)}% of the open ground near the start has a monster within 60 m`);
  assert.ok(road === 0 || roadNear / road >= 0.85, `${(100 * roadNear / Math.max(1, road)).toFixed(1)}% of the road near the start`);
});
