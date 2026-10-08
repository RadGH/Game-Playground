// node --test prototypes/thousandvale/tests/E/quests.test.js
// Stream E M2 quest data: the 15 zone quest files, the province story chain, radiant job frames,
// treasure chains and site templates (forts/farms/caves). Every reference resolves; no banned names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const PROV = J('data/provinces/torbor_downs.json');
const ZONES = PROV.zones;
const VIG = new Set(['m1', 'm2', 'm2b'].flatMap(f => J(`data/vignettes/${f}.json`).vignettes.map(v => v.id)));
const ARCH = J('data/provinces/archetypes.json').archetypes;
const enemies = J('../farhold/data/enemies.json');
const BESTIARY = new Set([...enemies.enemies, ...enemies.bosses].map(e => e.id));
const ENCOUNTERS = new Set(readdirSync(new URL('data/encounters/', root)).filter(f => f.endsWith('.json')).map(f => J('data/encounters/' + f)).filter(d => d.id && d.phases).map(d => d.id));
const kitSrc = readFileSync(new URL('../../highdef-3d/js/kit/rocks.js', root), 'utf8');
const block = name => { const a = kitSrc.indexOf(`const ${name}`), b = kitSrc.indexOf('\n};', a); return new Set([...kitSrc.slice(a, b).matchAll(/^  (\w+)\(m, rng/gm)].map(m => m[1])); };
const KIT = { prop: block('PROP_BUILDERS'), ground: block('GROUND_BUILDERS'), tree: new Set(['pine', 'fir', 'oak', 'birch']) };

const ZONE_FILES = Object.keys(ZONES).filter(z => z !== 'test');
const FILES = Object.fromEntries([...ZONE_FILES, 'test'].map(z => [z, J(`data/quests/${z}.json`)]));
const ALL_Q = Object.entries(FILES).flatMap(([z, f]) => f.quests.map(q => ({ ...q, zone: z })));
const QBY = new Map(ALL_Q.map(q => [q.id, q]));
const PCHAIN = J('data/quests/province.json');
const JOBS = J('data/quests/jobs.json');
const TREASURE = J('data/quests/treasure.json');
const SITES = J('data/provinces/sites.json');

/** names of real places in a zone: town, hamlets, fort */
const BAKED = { test: J('data/zones/test/zone.json').sites.map(s => s.name) };   // zones baked so far: their real sites count too
const placesOf = z => new Set([ZONES[z].town, ...(ZONES[z].hamlets || []), ZONES[z].fort, ...(BAKED[z] || [])].filter(Boolean));
const ALL_PLACES = new Set(Object.keys(ZONES).flatMap(z => [...placesOf(z)]));

// W5 (owner feedback 8): a carter stands at EVERY baked settlement, including the ones the sheet does not name
const CART_TOWNS = new Set(JSON.parse(readFileSync(new URL('../../data/provinces/carts.json', import.meta.url), 'utf8')).stops.map(s => s.town));
test('every non-test zone has a quest file with 5-7 quests; quest ids unique across all zone files', () => {
  for (const z of ZONE_FILES) {
    assert.equal(FILES[z].zone, z);
    assert.ok(FILES[z].quests.length >= 5 && FILES[z].quests.length <= 7, `${z}: ${FILES[z].quests.length}`);
  }
  assert.equal(QBY.size, ALL_Q.length, 'duplicate quest id across zones');
});

test('zone quests: givers, places, monster types, encounters, vignettes, rares, nexts all resolve', () => {
  const bad = [];
  const KINDS = ['kill', 'killOne', 'killRare', 'collect', 'visit', 'talk', 'use', 'clear', 'deliver'];
  for (const z of ZONE_FILES) {
    const f = FILES[z];
    for (const [id, n] of Object.entries(f.npcs)) if (!placesOf(z).has(n.at) && !VIG.has(n.at) && !(n.placedBy === 'content-towns' && CART_TOWNS.has(n.at))) bad.push(`${z} npc ${id} at "${n.at}"`);
    for (const q of f.quests) {
      if (!f.npcs[q.giver]) bad.push(`${q.id}: giver ${q.giver}`);
      if (!q.offer || !q.done || !q.steps.length) bad.push(`${q.id}: text/steps`);
      if (!(q.reward.xp > 0 && q.reward.xp <= 2)) bad.push(`${q.id}: xp share ${q.reward.xp}`);
      if (q.level < ZONES[z].band[0] - 1 || q.level > ZONES[z].band[1] + 1) bad.push(`${q.id}: level ${q.level} outside ${z} band ${ZONES[z].band}`);
      if (q.next && !QBY.has(q.next)) bad.push(`${q.id}: next ${q.next}`);
      for (const s of q.steps) {
        if (!KINDS.includes(s.kind)) bad.push(`${q.id}: kind ${s.kind}`);
        if (!s.text) bad.push(`${q.id}: step text`);
        if (s.kind === 'kill' && !BESTIARY.has(s.type)) bad.push(`${q.id}: kill ${s.type}`);
        if (s.kind === 'collect' && !BESTIARY.has(s.from)) bad.push(`${q.id}: collect from ${s.from}`);
        if (s.kind === 'killOne' && !ENCOUNTERS.has(s.encounter) && s.encounter !== 'world_province') bad.push(`${q.id}: encounter ${s.encounter}`);
        if (s.kind === 'killRare' && (!ZONES[s.zone] || ![0, 1].includes(s.slot))) bad.push(`${q.id}: rare ${s.zone}/${s.slot}`);
        if (s.vignette && !VIG.has(s.vignette)) bad.push(`${q.id}: vignette ${s.vignette}`);
        if (s.kind === 'visit' && s.site && !placesOf(z).has(s.site)) bad.push(`${q.id}: site ${s.site}`);
        if ((s.kind === 'talk' || s.kind === 'deliver') && !f.npcs[s.npc]) bad.push(`${q.id}: npc ${s.npc}`);
      }
    }
    // every zone sends you into its own dungeon and after its own rare
    if (!f.quests.some(q => q.steps.some(s => s.kind === 'clear' && s.boss))) bad.push(`${z}: no dungeon quest`);
    if (!f.quests.some(q => q.steps.some(s => s.kind === 'killRare' && s.zone === z))) bad.push(`${z}: no rare quest`);
  }
  assert.deepEqual(bad, []);
});

test('quests string zones together: cross-zone `next` links exist and every zone is reached by one or by the story chain', () => {
  const cross = ALL_Q.filter(q => q.next && QBY.get(q.next).zone !== q.zone);
  assert.ok(cross.length >= 12, `${cross.length} cross-zone links`);
  const linked = new Set(cross.flatMap(q => [q.zone, QBY.get(q.next).zone]));
  for (const s of PCHAIN.steps) linked.add(s.zone);
  for (const z of Object.keys(ZONES)) assert.ok(linked.has(z), `${z} is not strung to any other zone`);
});

test('province story chain: 8-10 steps, >= 8 zones, quest levels never fall, quests exist in their zones, ends at the world boss', () => {
  const st = PCHAIN.steps;
  assert.ok(st.length >= 8 && st.length <= 10, `${st.length} steps`);
  assert.ok(new Set(st.map(s => s.zone)).size >= 8);
  let band = 0;
  for (const s of st) {
    assert.ok(ZONES[s.zone], s.zone);
    const q = QBY.get(s.quest);
    assert.ok(q && q.zone === s.zone, `${s.quest} in ${s.zone}`);
    if (s.then) assert.ok(QBY.get(s.then)?.zone === s.zone, `${s.then}`);
    // the zone bands are ramps from the start hub now (P26): the chain's own quest levels never fall
    assert.ok((q.level || 1) >= band, `${s.quest} (level ${q.level}) falls below ${band}`);
    band = q.level || 1;
  }
  const last = st[st.length - 1];
  assert.equal(last.zone, PROV.grid.worldBossZone);
  assert.equal(last.kind, 'killOne');
  assert.ok(last.encounter === 'world_province' || ENCOUNTERS.has(last.encounter));
  // story quests point at the next step's quest (from step 2 on; step 1 is M1's file)
  for (let i = 1; i < st.length - 1; i++) assert.equal(QBY.get(st[i].quest).next, st[i + 1].quest, `step ${st[i].n} -> ${st[i + 1].n}`);
  for (const c of PCHAIN.crossZone) for (const ref of [c.from, c.to]) { const [z, id] = ref.split(':'); assert.equal(QBY.get(id)?.zone, z, ref); }
});

test('radiant jobs: ~20 frames, slots typed, every {placeholder} is a declared slot, undiscovered places preferred', () => {
  const TYPES = ['monster', 'vignette', 'settlement', 'fort', 'rare', 'dungeon', 'farm', 'cave', 'fish'];   // fish: play-test 5 angler jobs (data/provinces/angling.json)
  assert.ok(JOBS.frames.length >= 18);
  assert.ok(JOBS.rules.preferUndiscovered);
  const ids = new Set();
  for (const f of JOBS.frames) {
    assert.ok(!ids.has(f.id), f.id); ids.add(f.id);
    const slots = new Set(f.needs.map(n => n.slot));
    for (const n of f.needs) assert.ok(TYPES.includes(n.type), `${f.id}: ${n.type}`);
    for (const m of (f.title + ' ' + f.text + ' ' + JSON.stringify(f.goal)).matchAll(/\{(\w+)\.\w+\}|\{(\w+)\}/g)) {
      const s = m[1] || m[2];
      if (['zone', 'giver'].includes(s)) continue;
      assert.ok(slots.has(s), `${f.id}: {${s}} has no slot`);
    }
    assert.ok(f.reward.xp > 0 && f.reward.xp <= 1);
  }
  for (const t of ['monster', 'vignette', 'settlement', 'fort', 'rare', 'farm', 'cave']) assert.ok(JOBS.frames.some(f => f.needs.some(n => n.type === t)), `no frame uses ${t}`);
});

test('treasure: one chain starts in every zone, ~1 in 4 crosses 2-3 adjacent zones, clues resolve, caches shimmer', () => {
  const C = TREASURE.chains;
  assert.deepEqual(C.map(c => c.zone).sort(), Object.keys(ZONES).sort(), 'one chain per zone');
  const cross = C.filter(c => c.zones.length > 1);
  assert.ok(cross.length >= 3 && cross.length <= 6, `${cross.length} cross-zone chains`);
  const CLUES = ['note', 'map_piece', 'gravestone', 'carved_arrow', 'drunks_story'];
  const adj = (a, b) => Math.abs(ZONES[a].grid[0] - ZONES[b].grid[0]) + Math.abs(ZONES[a].grid[1] - ZONES[b].grid[1]) === 1;
  for (const c of C) {
    assert.ok(c.zones.length <= 3);
    for (let i = 1; i < c.zones.length; i++) assert.ok(adj(c.zones[i - 1], c.zones[i]), `${c.id}: ${c.zones[i - 1]} -> ${c.zones[i]} not neighbours`);
    assert.ok(c.steps.length >= 2);
    for (const s of c.steps) {
      assert.ok(c.zones.includes(s.zone) && ZONES[s.zone], `${c.id} step zone`);
      assert.ok(CLUES.includes(s.clue), `${c.id}: clue ${s.clue}`);
      assert.ok(s.text);
      if (typeof s.at === 'string') assert.ok(VIG.has(s.at), `${c.id}: vignette ${s.at}`);
      else if (s.at.site) assert.ok(placesOf(s.zone).has(s.at.site), `${c.id}: site ${s.at.site} in ${s.zone}`);
      else assert.ok(s.at.landmark);
    }
    assert.ok(ZONES[c.cache.zone] && c.cache.shimmer === 15 && ['dig', 'chest'].includes(c.cache.how) && c.cache.tier, `${c.id} cache`);
    if (c.cache.at.site) assert.ok(placesOf(c.cache.zone).has(c.cache.at.site));
  }
});

test('sites: 5+ fort kinds, 5+ farm kinds, 4+ cave kinds; props are kit ids; monsters exist; every archetype has weights that resolve', () => {
  assert.ok(Object.keys(SITES.forts).length >= 5);
  assert.ok(Object.keys(SITES.farms).length >= 5);
  assert.ok(Object.keys(SITES.caves).length >= 4);
  const bad = [];
  for (const group of ['forts', 'farms']) for (const [k, s] of Object.entries(SITES[group])) {
    for (const p of s.props) { if (!KIT[p.kind]?.has(p.id)) bad.push(`${group}.${k}: ${p.kind} ${p.id}`); if (Math.hypot(p.x, p.z) > s.radius) bad.push(`${group}.${k}: prop outside radius`); }
    for (const t of s.pests || []) if (!BESTIARY.has(t)) bad.push(`${k}: pest ${t}`);
    for (const mix of Object.values(s.garrison || {})) for (const m of mix) if (m.type && !BESTIARY.has(m.type)) bad.push(`${k}: ${m.type}`);
  }
  for (const [k, c] of Object.entries(SITES.caves)) {
    if (c.plan.floors !== 1) bad.push(`${k}: caves are single-floor`);
    if (!BESTIARY.has(c.boss.type) || c.boss.rank !== 'elite') bad.push(`${k}: boss`);
    for (const t of c.packs) if (!BESTIARY.has(t)) bad.push(`${k}: ${t}`);
  }
  for (const a of Object.keys(ARCH)) {
    const w = SITES.byArchetype[a];
    if (!w) { bad.push(`no site weights for ${a}`); continue; }
    for (const g of ['forts', 'farms', 'caves']) { if (!Object.keys(w[g] || {}).length) bad.push(`${a}: no ${g}`); for (const k of Object.keys(w[g] || {})) if (!SITES[g][k]) bad.push(`${a}: ${g}.${k}`); }
  }
  assert.deepEqual(bad, []);
});

const BANNED = ['Heroic', 'Mythic', 'Mythic+', 'keystone', 'War Mode', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Renown', 'Rested XP',
  'Honored', 'Revered', 'Exalted', 'Fury', 'Focus', 'Rage', 'combo points', 'Garrote', 'Cheap Shot', 'Prowl', 'Maul', 'Rake', 'Barkskin',
  'Totemic Recall', 'soul shards', 'Arcane Charge', 'Blink', 'Counterspell', 'Lay on Hands', 'Consecration', 'Mass Resurrection', 'Healing Wave',
  'Last Stand', 'Mirror Image', 'Leap of Faith', 'Hellfire', 'Starfall', 'soulbound', 'flight path', 'attunement', 'Chi',
  'Shriekwing', 'Dungeon Finder', 'Challenge mode', 'Trading Post', 'Fellreach', 'bog lurker', 'muster'];
const SKIP = new Set(['type', 'from', 'id', 'kind', 'family', 'band', 'slot', 'species', 'packs', 'pests', '_doc', 'blurb', 'encounter', 'quest', 'then', 'next', 'giver', 'npc', 'zone', 'zones', 'vignette', 'at', 'role', 'how', 'tier', 'clue']);
function strings(o, path = '', out = []) {
  if (typeof o === 'string') out.push([path, o]);
  else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!SKIP.has(k)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}
const bannedIn = t => [...BANNED.filter(w => new RegExp(`(^|[^A-Za-z])${w.replace(/[+]/g, '\\+')}($|[^A-Za-z])`, 'i').test(t)), ...['ember', 'veil'].filter(w => new RegExp(`(^|[^a-z])${w}`, 'i').test(t))]   // at a word start: 'Emberfall' yes, 'remember' no;

test('banned names: none in the M2 quest, job, treasure and site files', () => {
  const bad = [];
  const sources = { ...Object.fromEntries(ZONE_FILES.map(z => [z, FILES[z]])), province: PCHAIN, jobs: JOBS, treasure: TREASURE, sites: SITES };
  for (const [src, d] of Object.entries(sources)) for (const [p, s] of strings(d)) for (const h of bannedIn(s)) bad.push(`${src} ${p}: "${h}" in "${s.slice(0, 70)}"`);
  assert.deepEqual(bad, []);
});
