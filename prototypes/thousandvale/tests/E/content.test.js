// node --test prototypes/thousandvale/tests/E/content.test.js
// Stream E content: provinces, archetypes, vignettes (+ placements), quests, hooks, names, encounters.
// Every id resolves to something real, every placement stands on real ground, and no player-facing
// string uses a banned name (CLAUDE.md convention 9 + PLAN §2/§16 additions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { findTown, findDoor } from '../../js/sim/realm.js';
import { planDungeon, FAMILIES } from '../../js/rules/dungeon-tiers.js';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const ARCH = J('data/provinces/archetypes.json');
const PROV = J('data/provinces/torbor_downs.json');
const VIG_M1 = J('data/vignettes/m1.json').vignettes;
const VIG = [...VIG_M1, ...J('data/vignettes/m2.json').vignettes, ...J('data/vignettes/m2b.json').vignettes];
const PLACE = J('data/vignettes/placements/test.json');
const QUESTS = J('data/quests/test.json');
const ALL_QUEST_IDS = new Set(readdirSync(new URL('data/quests/', root)).filter(f => f.endsWith('.json') && !['jobs.json', 'treasure.json', 'province.json'].includes(f)).flatMap(f => (J('data/quests/' + f).quests || []).map(q => q.id)));
const HOOKS = J('data/hooks.json').hooks;
const NAMES = J('data/names/torbor.json');
const ENC_FILES = readdirSync(new URL('data/encounters/', root)).filter(f => f.endsWith('.json'));
const ENC = Object.fromEntries(ENC_FILES.map(f => [f, J('data/encounters/' + f)]));
const SCRIPTS = Object.fromEntries(Object.values(ENC).filter(d => d.id && d.phases).map(d => [d.id, d]));
const enemies = J('../farhold/data/enemies.json');
const BESTIARY = new Set([...enemies.enemies, ...enemies.bosses].map(e => e.id));
const terrain = parseTerrain(readFileSync(new URL('data/zones/test/terrain.bin', root)));
const BIOMES = new Set(terrain.biomes.map(b => b.key));
const kitSrc = readFileSync(new URL('../../highdef-3d/js/kit/rocks.js', root), 'utf8');
const block = name => { const a = kitSrc.indexOf(`const ${name}`), b = kitSrc.indexOf('\n};', a); return new Set([...kitSrc.slice(a, b).matchAll(/^  (\w+)\(m, rng/gm)].map(m => m[1])); };
const KIT = { prop: block('PROP_BUILDERS'), ground: block('GROUND_BUILDERS'), tree: new Set(['pine', 'fir', 'oak', 'birch']) };

/** CLAUDE.md conv. 9 + PLAN §2 / §16. Whole-word, case-insensitive. */
export const BANNED = ['Heroic', 'Mythic', 'Mythic+', 'keystone', 'War Mode', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Renown', 'Rested XP',
  'Honored', 'Revered', 'Exalted', 'Fury', 'Focus', 'Rage', 'combo points', 'Garrote', 'Cheap Shot', 'Prowl', 'Maul', 'Rake', 'Barkskin',
  'Totemic Recall', 'soul shards', 'Arcane Charge', 'Blink', 'Counterspell', 'Lay on Hands', 'Consecration', 'Mass Resurrection', 'Healing Wave',
  'Last Stand', 'Mirror Image', 'Leap of Faith', 'Hellfire', 'Starfall', 'soulbound', 'flight path', 'attunement', 'Chi',
  'Shriekwing', 'Dungeon Finder', 'Challenge mode', 'Trading Post', 'Fellreach', 'bog lurker', 'muster'];
const SUB_BANNED = ['ember', 'veil'];   // not even inside a word, in NEW names

/** every string in a data tree, skipping keys that are ids of SHARED things (Farhold ids we did not name) */
function strings(o, path = '', out = []) {
  if (typeof o === 'string') out.push([path, o]);
  else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!SHARED_KEYS.has(k)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}
const SHARED_KEYS = new Set(['type', 'body', 'from', 'monsters', 'status', 'element', 'shape', 'at', 'kind', 'id', 'species', 'roster', 'with', 'yaw', '_doc', 'blurb', 'note', 'place']);
const bannedIn = (text) => {
  const hits = [];
  for (const w of BANNED) if (new RegExp(`(^|[^A-Za-z])${w.replace(/[+]/g, '\\+')}($|[^A-Za-z])`, 'i').test(text)) hits.push(w);
  for (const w of SUB_BANNED) if (new RegExp(w, 'i').test(text)) hits.push(w);
  return hits;
};

test('banned names: no player-facing string in stream E data or dungeon names uses one', () => {
  const bad = [];
  const sources = { archetypes: ARCH, province: PROV, vignettes: VIG, quests: QUESTS, hooks: HOOKS, names: NAMES,
    events: J('data/quests/events.json'), schedules: J('data/provinces/schedules.json'), traces: J('data/names/traces.json'), places: J('data/provinces/torbor_downs-places.json'),
    jobs: J('data/quests/jobs.json'),
    // the living world (P19): curios, wayside kinds, who walks the roads, what they say
    curios: J('data/vignettes/curios.json'), wayside: J('data/vignettes/wayside.json'), travellers: J('data/provinces/travellers.json'), chatter: J('data/names/chatter.json') };
  // every name the placer wrote into the world (farm/fort/waystone names built from settlement names)
  for (const f of readdirSync(new URL('data/vignettes/placements/', root)).filter(f => f.endsWith('.json'))) sources['placements/' + f] = J('data/vignettes/placements/' + f).placements.map(p => p.name || '');
  for (const [f, d] of Object.entries(ENC)) if (d.tier || d.types) sources[f] = d;
  for (const [src, d] of Object.entries(sources)) for (const [p, s] of strings(d)) for (const h of bannedIn(s)) bad.push(`${src} ${p}: "${h}" in "${s.slice(0, 60)}"`);
  for (const fam of Object.keys(FAMILIES).filter(k => FAMILIES[k].ready)) for (let s = 0; s < 200; s++) { const n = planDungeon(s, { family: fam, floors: 1 }).name; for (const h of bannedIn(n)) bad.push(`dungeon name "${n}": ${h}`); }
  assert.deepEqual(bad, []);
});

test('the banned-name check itself catches what it should', () => {
  assert.deepEqual(bannedIn('Cast Blink, then Maul'), ['Maul', 'Blink']);
  assert.deepEqual(bannedIn('Emberfall'), ['ember']);
  assert.deepEqual(bannedIn('Marrow Maul'), ['Maul']);
  assert.deepEqual(bannedIn('Chill Howl, Ossuary'), []);
});

test('archetypes: two ready for M1, all twelve named, ready ones complete', () => {
  const a = ARCH.archetypes;
  assert.equal(Object.keys(a).length, 12);
  const ready = Object.entries(a).filter(([, v]) => v.status === 'ready');
  assert.ok(ready.length >= 2);
  for (const [k, v] of ready) {
    for (const b of v.biomes) assert.ok(BIOMES.has(b), `${k} biome ${b}`);
    for (const m of v.monsters) assert.ok(BESTIARY.has(m), `${k} monster ${m}`);
    for (const id of Object.keys(v.vignetteWeights)) assert.ok(VIG.some(x => x.id === id), `${k} vignette ${id}`);
    for (const f of v.dungeonFamilies) assert.ok(FAMILIES[f], `${k} dungeon family ${f}`);
  }
});

test('province sheet: zone test resolves (archetype, camps, encounters, hook, quests, questline)', () => {
  const z = PROV.zones.test;
  assert.equal(ARCH.archetypes[z.archetype].status, 'ready');
  for (const c of z.camps) { assert.ok(BESTIARY.has(c.type), c.type); if (c.with) assert.ok(BESTIARY.has(c.with)); }
  for (const id of [z.eventBoss, z.elite, ...z.rares]) assert.ok(SCRIPTS[id], id);
  assert.ok(HOOKS.some(h => h.id === z.hook && h.zone === 'test'));
  for (const s of J(PROV.questline.file).steps) if (s.quest) assert.ok(ALL_QUEST_IDS.has(s.quest), s.quest);
  for (const n of [z.town, ...z.hamlets]) assert.ok(terrain.meta.sites.some(s => s.name === n), `${n} is a real site in the bake`);
});

test('vignettes: 8 for M1 + the M2 library, unique ids, kit ids exist, monsters exist, tags resolve, things sit inside the radius', () => {
  assert.ok(VIG.length >= 8);
  assert.equal(new Set(VIG.map(v => v.id)).size, VIG.length);
  const bad = [];
  for (const v of VIG) {
    if (!v.lore || !v.name) bad.push(`${v.id}: name/lore`);
    for (const b of v.tags.biomes) if (!BIOMES.has(b)) bad.push(`${v.id}: biome ${b}`);
    for (const a of v.tags.archetypes) if (!ARCH.archetypes[a]) bad.push(`${v.id}: archetype ${a}`);
    for (const p of v.props) { if (!KIT[p.kind]?.has(p.id)) bad.push(`${v.id}: ${p.kind} ${p.id} is not in the kit`); if (Math.hypot(p.x, p.z) > v.radius) bad.push(`${v.id}: prop outside radius`); }
    if (!v.monsters?.length) bad.push(`${v.id}: no encounter`);
    for (const m of v.monsters || []) if (!BESTIARY.has(m.type)) bad.push(`${v.id}: monster ${m.type}`);
    for (const o of v.objects || []) { if (!['chest', 'note', 'npc', 'use'].includes(o.type)) bad.push(`${v.id}: object type ${o.type}`); if (Math.hypot(o.x, o.z) > v.radius) bad.push(`${v.id}: object outside radius`); if (o.quest && !QUESTS.quests.some(q => q.id === o.quest)) bad.push(`${v.id}: quest ${o.quest}`); }
  }
  assert.deepEqual(bad, []);
});

test('placements for zone test: every vignette placed once, on dry walkable ground over its radius, clear of town/door/each other', () => {
  const town = findTown(terrain), door = findDoor(terrain, town);
  assert.equal(PLACE.terrainHash, terrain.meta.inputHash, 'placements are stale: re-run tools/place-vignettes.mjs');
  assert.deepEqual(PLACE.placements.map(p => p.id).sort(), VIG_M1.map(v => v.id).sort());
  const bad = [];
  for (const p of PLACE.placements) {
    const v = VIG.find(x => x.id === p.id);
    const dry = (x, z) => terrain.walkable(x, z) && terrain.waterAt(x, z).depth <= 0;
    if (!dry(p.x, p.z)) bad.push(`${p.id}: centre not dry ground`);
    for (let a = 0; a < 8; a++) { const x = p.x + Math.cos(a * Math.PI / 4) * v.radius, z = p.z + Math.sin(a * Math.PI / 4) * v.radius; if (!dry(x, z)) bad.push(`${p.id}: edge not dry ground`); }
    if (!v.tags.biomes.includes(terrain.biomes[terrain.biomeAt(p.x, p.z)].key)) bad.push(`${p.id}: wrong biome`);
    if (Math.hypot(p.x - town.x, p.z - town.z) < town.r + 60) bad.push(`${p.id}: inside or hugging the town`);
    if (Math.hypot(p.x - door.x, p.z - door.z) < 50) bad.push(`${p.id}: on the dungeon door`);
    for (const q of PLACE.placements) if (q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 100) bad.push(`${p.id}: too close to ${q.id}`);
  }
  assert.deepEqual(bad, []);
});

test('quests: unique ids, every reference resolves, chains point at real quests, rewards are fractions not fixed numbers', () => {
  const Q = QUESTS.quests, ids = new Set(Q.map(q => q.id));
  assert.equal(ids.size, Q.length);
  assert.ok(Q.length >= 8);
  const bad = [];
  // play-test 2: set pieces (data/vignettes/setpieces.json) are vignettes too, and a step may talk to an NPC of another zone's file
  const SETP = new Set(J('data/vignettes/setpieces.json').vignettes.map(v => v.id));
  const vig = id => VIG.some(v => v.id === id) || SETP.has(id);
  const ALL_NPCS = Object.assign({}, ...readdirSync(new URL('data/quests/', root)).filter(f => f.endsWith('.json')).map(f => J('data/quests/' + f).npcs || {}));
  for (const q of Q) {
    if (!ALL_NPCS[q.giver]) bad.push(`${q.id}: giver ${q.giver}`);
    if (q.next && !ids.has(q.next) && !ALL_QUEST_IDS.has(q.next)) bad.push(`${q.id}: next ${q.next}`);
    if (!q.offer || !q.done || !q.steps.length) bad.push(`${q.id}: text/steps`);
    if (!(q.reward.xp > 0 && q.reward.xp <= 2)) bad.push(`${q.id}: xp should be a share of a level (0..2)`);
    for (const s of q.steps) {
      if (!s.text) bad.push(`${q.id}: step without text`);
      if (s.kind === 'kill' && !BESTIARY.has(s.type)) bad.push(`${q.id}: kill ${s.type}`);
      if (s.kind === 'collect' && !BESTIARY.has(s.from)) bad.push(`${q.id}: collect from ${s.from}`);
      if (s.kind === 'killOne' && !SCRIPTS[s.encounter]) bad.push(`${q.id}: encounter ${s.encounter}`);
      if ((s.kind === 'visit' || s.kind === 'use') && s.vignette && !vig(s.vignette)) bad.push(`${q.id}: vignette ${s.vignette}`);
      if (s.kind === 'visit' && s.site && !SCRIPTS[s.site] && !terrain.meta.sites.some(x => x.name === s.site)) bad.push(`${q.id}: site ${s.site}`);
      if ((s.kind === 'talk' || s.kind === 'deliver') && !ALL_NPCS[s.npc]) bad.push(`${q.id}: npc ${s.npc}`);
      if (!['kill', 'killOne', 'collect', 'visit', 'talk', 'use', 'clear', 'deliver'].includes(s.kind)) bad.push(`${q.id}: kind ${s.kind}`);
    }
  }
  for (const n of Object.values(QUESTS.npcs)) if (!terrain.meta.sites.some(s => s.name === n.at) && !vig(n.at)) bad.push(`npc ${n.name} at unknown place ${n.at}`);
  // every M1 wilds monster family has at least one quest that sends you at it
  for (const c of PROV.zones.test.camps.filter(c => c.type !== 'marsh_wisp' && c.type !== 'bog_slime')) if (!Q.some(q => q.steps.some(s => s.type === c.type))) bad.push(`no quest for ${c.type}`);
  assert.deepEqual(bad, []);
});

test('M2 library: >= 56 vignettes, every archetype tagged by >= 12, hooks unique with valid zones and kit parts', () => {
  assert.ok(VIG.length >= 56, `${VIG.length} vignettes`);
  const bad = [];
  for (const a of Object.keys(ARCH.archetypes)) { const n = VIG.filter(v => v.tags.archetypes.includes(a)).length; if (n < 12) bad.push(`${a}: ${n} vignettes`); }
  for (const v of VIG.slice(VIG_M1.length)) if (!(v.tags.band[0] >= 1 && v.tags.band[1] <= 12 && v.tags.band[0] <= v.tags.band[1])) bad.push(`${v.id}: band`);
  assert.equal(new Set(HOOKS.map(h => h.id)).size, HOOKS.length, 'hook ids unique');
  assert.ok(HOOKS.length >= 20);
  const zones = new Set(Object.keys(PROV.zones));
  for (const h of HOOKS) {
    if (h.zone != null && !zones.has(h.zone)) bad.push(`hook ${h.id}: zone ${h.zone}`);
    if (!['compositional', 'bespoke'].includes(h.kind)) bad.push(`hook ${h.id}: kind ${h.kind}`);
    if (h.kind === 'bespoke' && !h.model) bad.push(`hook ${h.id}: bespoke without a model brief`);
    if (!h.lore || !h.what) bad.push(`hook ${h.id}: text`);
    for (const p of h.parts || []) if (!KIT[p.kind]?.has(p.id)) bad.push(`hook ${h.id}: ${p.kind} ${p.id} not in the kit`);
  }
  const placed = HOOKS.filter(h => h.zone).map(h => h.zone);
  assert.equal(new Set(placed).size, placed.length, 'one hook per zone');
  for (const z of zones) if (!placed.includes(z)) bad.push(`zone ${z} has no hook`);
  assert.deepEqual(bad, []);
});
