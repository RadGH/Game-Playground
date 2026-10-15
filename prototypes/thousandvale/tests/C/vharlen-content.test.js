// node --test prototypes/thousandvale/tests/C/vharlen-content.test.js
// Expansion 1, stream C: Vharlen's content (docs/EXPANSION-1.md §3–§5, §7–§8). Every id resolves to something real, the
// numbers sit in the island's band (10–20), and no player-facing string uses a banned word or a Torbor Downs place name
// (the owner: a new region shares nothing re-skinned with Torbor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FAMILIES, planDungeon } from '../../js/rules/dungeon-tiers.js';
import { joinAnglingContent } from '../../js/sim/angling.js';
import { createProfessions as createRules } from '../../js/rules/professions.js';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const has = p => existsSync(new URL(p, root));
const SHEET = J('data/provinces/vharlen.json');
const TORBOR = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.vharlen.map;
const ZONES = SHEET.zones, ZIDS = Object.keys(ZONES);
const TV = J('data/rules/monsters-tv.json').monsters;
const TVID = new Set(TV.map(m => m.id));
const FARHOLD = J('../farhold/data/enemies.json');
const BESTIARY = new Set([...[...FARHOLD.enemies, ...FARHOLD.bosses].map(e => e.id), ...TVID]);
const ENC_INDEX = new Set(J('data/encounters/index.json').files);
const script = id => (has(`data/encounters/${id}.json`) ? J(`data/encounters/${id}.json`) : null);
const QUESTS = Object.fromEntries(ZIDS.map(z => [z, J(`data/quests/${z}.json`)]));
const ALLQ = Object.entries(QUESTS).flatMap(([z, f]) => f.quests.map(q => ({ ...q, zone: z })));
const QBY = new Map(ALLQ.map(q => [q.id, q]));
const STORY = J('data/quests/vharlen-province.json');
const EVENTS = J('data/quests/events.json');
const NAMES = J('data/names/vharlen.json');
const RARES = J('data/provinces/vharlen-rares.json');
const SHOPS = J('data/provinces/vharlen-shops.json');
const ANGLING = J('data/provinces/vharlen-angling.json');
const PROF = J('data/provinces/professions.json');

// the banned list: CLAUDE.md convention 9 (+ the playground's own), whole word; "ember"/"veil"/"muster" never even inside a word
const BANNED = ['Heroic', 'Mythic', 'keystone', 'War Mode', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Renown', 'Rested XP', 'Honored', 'Revered', 'Exalted',
  'Fury', 'Focus', 'Rage', 'combo points', 'Garrote', 'Cheap Shot', 'Prowl', 'Maul', 'Rake', 'Barkskin', 'Totemic Recall', 'soul shards', 'Arcane Charge', 'Blink',
  'Counterspell', 'Lay on Hands', 'Consecration', 'Mass Resurrection', 'Healing Wave', 'Last Stand', 'Mirror Image', 'Leap of Faith', 'Hellfire', 'Starfall',
  'soulbound', 'flight path', 'attunement', 'Chi', 'Dungeon Finder', 'Trading Post'];
const SUB = ['ember', 'veil', 'muster'];
const banned = t => [...BANNED.filter(w => new RegExp(`(^|[^A-Za-z])${w}($|[^A-Za-z])`, 'i').test(t)), ...SUB.filter(w => new RegExp(w, 'i').test(t))];
// Torbor Downs' places (towns, hamlets, forts, zone names) and the province itself
const TORBOR_PLACES = [...new Set(['Torbor', ...Object.values(TORBOR.zones).flatMap(z => [z.town, ...(z.hamlets || [])])].filter(Boolean))];
const torborIn = t => TORBOR_PLACES.filter(p => new RegExp(`(^|[^A-Za-z])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`).test(t));
const SKIP_KEYS = new Set(['_doc', 'id', 'type', 'body', 'from', 'with', 'base', 'encounter', 'boss', 'monster', 'kind', 'status', 'shape', 'at', 'site', 'zone', 'giver', 'npc', 'next', 'then', 'quest', 'species', 'look', 'roster', 'family', 'element',
  'bases', 'catalog', 'minCap', 'minCapBase', 'only', 'route', 'chatter', 'props', 'guardTypes', 'guardFallback', 'guardFamily', 'role', 'sign', 'held', 'deliverTargets']);   // [W] id lists in the island's shop / road / traveller files
function strings(o, path = '', out = []) {
  if (typeof o === 'string') out.push([path, o]);
  else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!SKIP_KEYS.has(k)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}
const VH_EVENTS = { zone: (EVENTS.zone || []).filter(e => ZONES[e.zone]), realm: (EVENTS.realm || []).filter(e => (e.zones || [e.zone]).every(z => ZONES[z])) };
const encIds = () => [...new Set(ZIDS.flatMap(z => [...ZONES[z].rares, ZONES[z].elite, ZONES[z].eventBoss]).concat(SHEET.worldBoss.id))];
const VH_FAMILIES = [...new Set(ZIDS.map(z => ZONES[z].dungeon.family))];
const dungeonScripts = () => VH_FAMILIES.flatMap(k => (FAMILIES[k].encounterSets || []).flatMap(s => [...s.miniboss, s.boss].map(e => e.id)));

test('the sheet: 9 zones on the province map, bands 10-20 rising from the landing, camps of island monsters only', () => {
  assert.equal(ZIDS.length, 9);
  assert.deepEqual(ZIDS.slice().sort(), Object.keys(MAP).sort());
  assert.equal(SHEET.grid.start, 'blackstrand');
  assert.deepEqual(ZONES.blackstrand.band, [10, 12]);
  for (const [id, z] of Object.entries(ZONES)) {
    assert.ok(z.band[0] >= 10 && z.band[1] <= 20 && z.band[0] < z.band[1], `${id} band ${z.band}`);
    assert.ok(z.camps.length >= 5, `${id}: ${z.camps.length} camps`);
    for (const c of z.camps) {
      assert.ok(TVID.has(c.type), `${id}: camp ${c.type} is not a Vharlen monster`);
      if (c.with) assert.ok(TVID.has(c.with), `${id}: camp with ${c.with}`);
      assert.ok(c.level[0] >= z.band[0] && c.level[1] <= z.band[1], `${id}: camp ${c.type} levels ${c.level} outside ${z.band}`);
    }
    assert.ok(FAMILIES[z.dungeon.family] && FAMILIES[z.dungeon.family].ready, `${id}: dungeon family ${z.dungeon.family}`);
    assert.equal(z.rares.length, 2, id);
    assert.ok(z.elite && z.eventBoss, id);
  }
  assert.equal(SHEET.worldBoss.id, 'world_ossathra');
  assert.equal(SHEET.worldBoss.zone, 'the_caldera');
});

test('named encounters: every rare, elite, event boss and the world boss has a script listed in the index, standing on an island body', () => {
  const bad = [];
  for (const id of encIds()) {
    const s = script(id);
    if (!s) { bad.push(`${id}: no script`); continue; }
    if (!ENC_INDEX.has(id + '.json')) bad.push(`${id}: not in index.json`);
    if (!TVID.has(s.body)) bad.push(`${id}: body ${s.body} is not a Vharlen monster`);
    if (!s.name) bad.push(`${id}: no name`);
  }
  for (const id of ZIDS.map(z => ZONES[z].elite)) { const p = (script(id) || {}).place; if (!p || typeof p !== 'object' || !p.near) bad.push(`${id}: elite with no place block`); }
  assert.equal(script('world_ossathra').tier, 'world');
  // the rares table is the sheet's, slot for slot
  for (const z of ZIDS) assert.deepEqual(RARES[z], ZONES[z].rares, z);
  assert.deepEqual(bad, []);
});

test('zone events: one per zone, run by its event boss at its arena, waves of its own monsters; Ossathra is a realm event in the Caldera', () => {
  for (const z of ZIDS) {
    const e = VH_EVENTS.zone.filter(x => x.zone === z);
    assert.equal(e.length, 1, `${z}: ${e.length} zone events`);
    assert.equal(e[0].boss, ZONES[z].eventBoss, z);
    assert.equal(e[0].site, 'event_' + z, z);
    for (const w of e[0].waves) assert.ok(TVID.has(w.type), `${z}: wave ${w.type}`);
    assert.ok(Array.isArray(e[0].words) && e[0].words.length === 4, `${z}: words`);
    assert.ok(e[0].info && e[0].info.what && e[0].info.objective, `${z}: info (run tools/content-events.mjs --province=vharlen)`);
  }
  const wb = VH_EVENTS.realm.find(e => e.id === 'world_ossathra');
  assert.ok(wb && wb.kind === 'worldboss' && wb.zone === 'the_caldera' && wb.encounter === 'world_ossathra');
  assert.ok(wb.info && wb.info.what);
});

test('quests: 4-6 per zone, givers and NPCs in the zone town, kill/collect types from the zone\'s camps, levels in band, a dungeon and a rare quest each', () => {
  const bad = [];
  const ids = new Set();
  for (const z of ZIDS) {
    const f = QUESTS[z], camp = new Set(ZONES[z].camps.flatMap(c => [c.type, c.with]).filter(Boolean));
    if (f.zone !== z) bad.push(`${z}: zone field ${f.zone}`);
    if (f.quests.length < 4 || f.quests.length > 6) bad.push(`${z}: ${f.quests.length} quests`);
    for (const [id, n] of Object.entries(f.npcs)) if (n.at !== ZONES[z].town && !n.placedBy) bad.push(`${z}: npc ${id} at ${n.at}`);
    for (const q of f.quests) {
      if (ids.has(q.id)) bad.push(`duplicate ${q.id}`); ids.add(q.id);
      if (!f.npcs[q.giver]) bad.push(`${q.id}: giver ${q.giver}`);
      if (q.level < ZONES[z].band[0] - 1 || q.level > ZONES[z].band[1] + 1) bad.push(`${q.id}: level ${q.level}`);
      if (!(q.reward.xp > 0 && q.reward.xp <= 2)) bad.push(`${q.id}: xp ${q.reward.xp}`);
      if (q.next && !QBY.has(q.next)) bad.push(`${q.id}: next ${q.next}`);
      for (const s of q.steps) {
        if (!s.text || !s.where) bad.push(`${q.id}: step text/where`);
        if (s.vignette) bad.push(`${q.id}: a vignette step (Vharlen has none)`);
        if (s.kind === 'kill' && !camp.has(s.type)) bad.push(`${q.id}: kill ${s.type} not in ${z}'s camps`);
        if (s.kind === 'collect' && !camp.has(s.from)) bad.push(`${q.id}: collect from ${s.from}`);
        if (s.kind === 'killRare' && (s.zone !== z || ![0, 1].includes(s.slot))) bad.push(`${q.id}: rare ${s.zone}/${s.slot}`);
        if (s.kind === 'killOne' && !script(s.encounter)) bad.push(`${q.id}: encounter ${s.encounter}`);
        if ((s.kind === 'talk' || s.kind === 'deliver') && !f.npcs[s.npc]) bad.push(`${q.id}: npc ${s.npc}`);
        if (s.kind === 'visit' && s.site && s.site !== ZONES[z].town) bad.push(`${q.id}: visit ${s.site}`);
      }
    }
    if (!f.quests.some(q => q.steps.some(s => s.kind === 'clear' && s.boss))) bad.push(`${z}: no dungeon quest`);
    if (!f.quests.some(q => q.steps.some(s => s.kind === 'killRare' && s.zone === z))) bad.push(`${z}: no rare quest`);
  }
  // no clash with any other province's quest ids
  for (const z of Object.keys(TORBOR.zones)) for (const q of J(`data/quests/${z}.json`).quests) if (ids.has(q.id)) bad.push(`${q.id} is also a Torbor quest`);
  assert.deepEqual(bad, []);
});

test('The Burning Isle: 5 steps from Port Vharl to the Caldera, levels never fall, ending at Ossathra', () => {
  assert.equal(STORY.province, 'vharlen');
  assert.equal(STORY.steps.length, 5);
  assert.equal(STORY.steps[0].zone, 'blackstrand');
  let lv = 0;
  for (const s of STORY.steps) {
    const q = QBY.get(s.quest);
    assert.ok(q && q.zone === s.zone, `${s.quest} in ${s.zone}`);
    assert.ok(q.level >= lv, `${s.quest} falls`); lv = q.level;
  }
  for (let i = 0; i < STORY.steps.length - 1; i++) assert.equal(QBY.get(STORY.steps[i].quest).next, STORY.steps[i + 1].quest);
  const last = STORY.steps.at(-1);
  assert.equal(last.zone, 'the_caldera');
  assert.equal(last.encounter, 'world_ossathra');
  const then = QBY.get(last.then);
  assert.ok(then.steps.some(s => s.kind === 'killOne' && s.encounter === 'world_ossathra'));
});

test('dungeons: the 8 island families are their own — island rosters, scripts that exist, no Torbor name in a rolled title', () => {
  for (const k of ['lava_tube', 'steam_grotto', 'sulphur_mine', 'drowned_vent', 'glass_tomb', 'buried_town', 'kiln_forge', 'caldera_deep']) {
    const f = FAMILIES[k];
    assert.ok(f && f.ready, k);
    for (const t of [...f.roster.normal, f.roster.elite]) assert.ok(TVID.has(t), `${k}: roster ${t}`);
    assert.ok((f.encounterSets || []).length >= 1, `${k}: an encounter set of its own`);
    for (let s = 0; s < 40; s++) { const n = planDungeon(s, { family: k, floors: 1 }).name; assert.deepEqual([...banned(n), ...torborIn(n)], [], `${k}: "${n}"`); }
  }
  for (const id of dungeonScripts()) { const s = script(id); assert.ok(s && ENC_INDEX.has(id + '.json'), id); assert.ok(TVID.has(s.body), `${id}: body ${s.body}`); }
});

test('names: a Vharl style of its own — no given or family name shared with Torbor Downs', () => {
  const T = J('data/names/torbor.json');
  const tGiven = new Set([...T.given.f, ...T.given.m]), tFam = new Set(T.family);
  assert.ok(NAMES.given.f.length >= 30 && NAMES.given.m.length >= 30 && NAMES.family.length >= 30);
  assert.deepEqual([...NAMES.given.f, ...NAMES.given.m].filter(n => tGiven.has(n)), []);
  assert.deepEqual(NAMES.family.filter(n => tFam.has(n)), []);
});

test('no banned word and no Torbor Downs place name in any Vharlen text', () => {
  const sources = { sheet: SHEET, names: NAMES, rares: RARES, shops: SHOPS, angling: ANGLING, events: VH_EVENTS, story: { ...STORY, prelude: null }, monsters: TV,   // (the prelude is the mainland quest that sends you here: it names Gullwick on purpose)
    ...Object.fromEntries(ZIDS.map(z => ['quests/' + z, QUESTS[z]])),
    ...Object.fromEntries([...encIds(), ...dungeonScripts()].filter(script).map(id => ['encounters/' + id, script(id)])),
    families: VH_FAMILIES.map(k => ({ name: FAMILIES[k].name, blurb: FAMILIES[k].blurb, sets: (FAMILIES[k].encounterSets || []).map(s => s.name) })),
    // [W] the island's own wilderness dressing, people and roads (the Torbor goods kept in the catalogue are not shelved here)
    ...Object.fromEntries(['data/vignettes/vharlen-wayside.json', 'data/vignettes/vharlen-curios.json', 'data/vignettes/vharlen-vignettes.json', 'data/provinces/vharlen-travellers.json',
      'data/provinces/vharlen-wanderers.json', 'data/provinces/vharlen-road-events.json'].filter(has).map(f => [f, J(f)])),
    carts: { service: J('data/provinces/vharlen-carts.json').service, rules: J('data/provinces/vharlen-carts.json').rules },
    chatter: (() => { const pools = J('data/names/chatter.json').pools, T = has('data/provinces/vharlen-travellers.json') ? J('data/provinces/vharlen-travellers.json') : { kinds: {}, folk: {} }, Wd = has('data/provinces/vharlen-wanderers.json') ? J('data/provinces/vharlen-wanderers.json') : { kinds: {} };
      const ids = new Set([...Object.values(T.kinds), ...Object.values(T.folk), ...Object.values(Wd.kinds)].flatMap(k => k.chatter || []).filter(id => /^(role|road)\./.test(id) && /isle|^role\./.test(id)));
      const torborPools = new Set([...Object.values(J('data/provinces/travellers.json').kinds), ...Object.values(J('data/provinces/travellers.json').folk)].flatMap(k => k.chatter || []));
      return Object.fromEntries([...ids].filter(id => !torborPools.has(id)).map(id => [id, pools[id] || []])); })() };
  const bad = [];
  for (const [src, d] of Object.entries(sources)) for (const [p, s] of strings(d)) {
    for (const h of banned(s)) bad.push(`${src} ${p}: banned "${h}" in "${s.slice(0, 70)}"`);
    for (const h of torborIn(s)) bad.push(`${src} ${p}: Torbor place "${h}" in "${s.slice(0, 70)}"`);
  }
  assert.deepEqual(bad, []);
});

test('gathering: the six island materials exist with an icon class, feed recipes, and come from a node or a corpse', async () => {
  const want = { obsidian_ore: 'ore', sulphur: 'resin', steamcap: 'mushroom', ironpalm_log: 'wood', cinderbloom: 'herb', salamander_hide: 'hide' };
  const recipes = PROF.recipes;
  const gives = new Set([...Object.values(PROF.nodeKinds).map(k => k.gives), ...Object.values(PROF.skins.types).map(t => t.hide).filter(Boolean)]);
  for (const [id, icon] of Object.entries(want)) {
    const m = PROF.materials[id];
    assert.ok(m, id);
    assert.equal(m.icon, icon, id);
    assert.ok(m.tier >= 4 && m.tier <= 5, `${id} tier ${m.tier}`);
    assert.ok(recipes.some(r => r.needs.some(n => n.id === id)), `${id}: no recipe uses it`);
    assert.ok(gives.has(id), `${id}: nothing gives it`);
  }
  // the island kinds stand only in Vharlen; Torbor never grows a tier-4/5 node
  const nodes = J('data/provinces/professions-nodes.json');
  const island = new Set(['obsidian', 'sulphur', 'ironpalm', 'steamcap', 'cinderbloom']);
  for (const list of Object.values(nodes.zones)) for (const n of list) { assert.ok(!island.has(n.k), `Torbor node ${n.id} is ${n.k}`); assert.ok(PROF.nodeKinds[n.k].tier <= 3, n.id); }
  if (has('data/provinces/vharlen-professions-nodes.json')) {
    const vn = J('data/provinces/vharlen-professions-nodes.json');
    assert.deepEqual(Object.keys(vn.zones).sort(), Object.values(MAP).sort());
    const kinds = new Set(Object.values(vn.zones).flat().map(n => n.k));
    for (const k of island) assert.ok(kinds.has(k), `no ${k} node on the island`);
  }
  // a skinner's knife on a salamander gives its own hide (js/rules/professions.js skinOf `hide`)
  const P = createRules(J('data/rules/professions.json'), PROF);
  const sk = P.skinOf('ashback_salamander', 14);
  assert.ok(sk && sk.gives[0].id === 'salamander_hide', JSON.stringify(sk));
  assert.ok(!sk.gives.some(g => g.id === 'game_meat'), 'nobody eats a salamander');
});

test('angling: island fish (bands 10+), a legend per zone, an angler per town; the server joins them into one catch table', () => {
  const T = J('data/provinces/angling.json');
  for (const f of ANGLING.fish) assert.ok(f.bands[0] >= 10 && f.bands[1] <= 20, `${f.id} bands ${f.bands}`);
  assert.deepEqual(ANGLING.legends.map(l => l.zone).sort(), ZIDS.slice().sort());
  assert.deepEqual(ANGLING.anglers.map(a => a.town).sort(), ZIDS.map(z => ZONES[z].town).sort());
  for (const p of ANGLING.pullBack) assert.ok(TVID.has(p.type), p.type);
  const tIds = new Set([...T.fish, ...T.legends].map(f => f.id));
  for (const f of [...ANGLING.fish, ...ANGLING.legends]) assert.ok(!tIds.has(f.id), `${f.id} clashes with Torbor`);
  const joined = joinAnglingContent([T, { ...T, ...ANGLING }]);
  assert.equal(joined.fish.length, T.fish.length + ANGLING.fish.length);
  assert.equal(joined.legends.length, T.legends.length + ANGLING.legends.length);
  assert.equal(joinAnglingContent([T]), T, 'one province: its own content, untouched');
});

test('shops: every island town is stocked to its band and Port Vharl\'s pier is a harbour', () => {
  const ships = J('data/provinces/ships.json');
  for (const z of ZIDS) {
    const t = SHOPS.towns[ZONES[z].town];
    assert.ok(t, ZONES[z].town);
    assert.ok(t.levelCap >= ZONES[z].band[1], `${ZONES[z].town} levelCap ${t.levelCap}`);
    assert.ok(t.priceMult >= 1, ZONES[z].town);
  }
  const pv = SHOPS.towns['Port Vharl'];
  assert.ok(ships.harbours.some(h => h.id === pv.harbour && h.province === 'vharlen'), 'Port Vharl names its harbour');
  if (has('data/provinces/vharlen-town-services.json')) assert.ok(J('data/provinces/vharlen-town-services.json').towns['Port Vharl'].includes('harbourmaster'));
});

test('placed: every island zone has camps of its own monsters, its quest givers and its rares on the map', () => {
  const bad = [];
  for (const [eid, wid] of Object.entries(MAP)) {
    const f = `data/vignettes/placements/${wid}.json`;
    if (!has(f)) { bad.push(`${wid}: not placed`); continue; }
    const pl = J(f).placements || [];
    const camps = pl.filter(p => p.type === 'camp');
    if (camps.length < 5) bad.push(`${eid}: ${camps.length} camps`);
    for (const c of camps) if (!BESTIARY.has(c.monster || c.type)) bad.push(`${eid}: camp ${c.monster}`);
    for (const c of camps) if (c.monster && !TVID.has(c.monster)) bad.push(`${eid}: a Torbor monster ${c.monster}`);
    const npcs = new Set(pl.filter(p => p.type === 'npc').map(p => p.id));
    for (const [id, n] of Object.entries(QUESTS[eid].npcs)) if (!n.placedBy && !npcs.has(id)) bad.push(`${eid}: npc ${id} not placed`);
    for (const r of ZONES[eid].rares) if (!pl.some(p => p.type === 'rare' && p.id === r)) bad.push(`${eid}: rare ${r} not placed`);
  }
  assert.deepEqual(bad, []);
});

test('map marks and givers: every Vharlen quest step has a mark, every giver is in the island\'s giver index and has a body', () => {
  const MARKS = J('data/quests/marks/vharlen.json'), GIVERS = J('data/quests/marks/vharlen-givers.json');
  assert.deepEqual(MARKS.missing, []);
  assert.deepEqual(GIVERS.missing, []);
  const bodies = new Set(Object.values(MAP).flatMap(wid => [`${wid}.json`, `${wid}.quest.json`].flatMap(f => (has('data/vignettes/placements/' + f) ? J('data/vignettes/placements/' + f).placements : []))).filter(p => p.type === 'npc').map(p => p.id));
  const bad = [];
  for (const q of ALLQ) {
    const m = MARKS.quests[q.id];
    if (!m || !m.giver) bad.push(`${q.id}: no marks`);
    else q.steps.forEach((s, i) => { if (!m.steps[i]) bad.push(`${q.id}#${i}: no mark`); });
    const g = GIVERS.npcs[q.giver];
    if (!g || !g.gives.includes(q.id)) bad.push(`${q.id}: giver ${q.giver} not indexed`);
    if (!bodies.has(q.giver)) bad.push(`${q.id}: giver ${q.giver} has no body`);
  }
  assert.deepEqual(bad, []);
});
