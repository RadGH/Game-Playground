// node --test prototypes/thousandvale/tests/W/vharlen-dressing.test.js
// Expansion 1, stream W: Vharlen's wilderness is dressed with its OWN things — wayside dressing, curios, vignettes, folk,
// travellers, wanderers, road events, carter greetings and shop goods — never Torbor Downs' sheep pens, scarecrows and
// beekeepers re-skinned (the owner: a new region is completely different). Every prop an island recipe names has a model
// (js/client/vharl-props.js, or a neutral kit piece), nothing stands on stream S's hot springs, geysers or vents, every
// island dungeon door has its waystone, and Torbor's placements carry none of the island's ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { provinceDataSync } from '../../js/sim/province-files.js';

const root = new URL('../../', import.meta.url);
const at = p => fileURLToPath(new URL(p, root));
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const has = p => existsSync(new URL(p, root));
const MAPS = J('data/world/province-map.json').provinces;
const VMAP = MAPS.vharlen.map, VWIDS = Object.values(VMAP), TWIDS = Object.values(MAPS.torbor_downs.map);
const VOCAB = J('data/vignettes/vharlen-props.json');
const ISLAND = new Set(Object.keys(VOCAB.island));
const KIT = { prop: new Set(VOCAB.kit.prop), ground: new Set(VOCAB.kit.ground) };
const WAY = J('data/vignettes/vharlen-wayside.json').kinds, CUR = J('data/vignettes/vharlen-curios.json').curios, VIG = J('data/vignettes/vharlen-vignettes.json').vignettes;
const TRAV = J('data/provinces/vharlen-travellers.json'), WAND = J('data/provinces/vharlen-wanderers.json'), ROAD = J('data/provinces/vharlen-road-events.json');
const SITES = J('data/provinces/vharlen-sites.json');
const TV = new Set(J('data/rules/monsters-tv.json').monsters.map(m => m.id));
// Torbor's catalogues: every id in them is Torbor-themed by definition
const T_CURIO = new Set(J('data/vignettes/curios.json').curios.map(c => c.id));
const T_WAY = new Set(J('data/vignettes/wayside.json').kinds.map(k => k.id));
const T_VIG = new Set(['m1', 'm2', 'm2b', 'setpieces'].flatMap(f => J(`data/vignettes/${f}.json`).vignettes.map(v => v.id)));
const T_TRAV = J('data/provinces/travellers.json');
const T_FOLK = new Set(Object.keys(T_TRAV.folk)), T_KIND = new Set([...Object.keys(T_TRAV.kinds), ...Object.keys(J('data/provinces/wanderers.json').kinds)]);
// the words that give Torbor away, in an id
const TORBOR_THEMED = /sheep|scarecrow|beekeep|\bbee|hay_|haybale|plough|wheat|orchard|shepherd|drover|wolf|oak|birch|turnip|barrow|mill_?wheel/i;
const placed = wid => ['', '.quest', '.hunt'].flatMap(s => (has(`data/vignettes/placements/${wid}${s}.json`) ? J(`data/vignettes/placements/${wid}${s}.json`).placements : []));
const propOk = p => (p.kind === 'prop' && (ISLAND.has(p.id) || KIT.prop.has(p.id))) || (p.kind === 'ground' && KIT.ground.has(p.id));

test('the island catalogues: own ids (vh_), props only from the island vocabulary, island monsters, band 10-20', () => {
  const bad = [];
  const ids = new Set();
  for (const [src, list] of [['wayside', WAY], ['curios', CUR], ['vignettes', VIG]]) for (const r of list) {
    if (!/^vh_/.test(r.id)) bad.push(`${src} ${r.id}: not a vh_ id`);
    if (ids.has(r.id)) bad.push(`${src} ${r.id}: duplicate`); ids.add(r.id);
    if (T_CURIO.has(r.id) || T_WAY.has(r.id) || T_VIG.has(r.id)) bad.push(`${src} ${r.id}: a Torbor id`);
    for (const p of r.props || []) if (!propOk(p)) bad.push(`${src} ${r.id}: prop ${p.kind}:${p.id} is not in data/vignettes/vharlen-props.json`);
    for (const m of r.monsters || []) if (!TV.has(m.type)) bad.push(`${src} ${r.id}: monster ${m.type} is not an island monster`);
    const band = r.tags && r.tags.band; if (band && (band[0] < 10 || band[1] > 20)) bad.push(`${src} ${r.id}: band ${band}`);
  }
  for (const [role, f] of Object.entries(TRAV.folk || {})) for (const p of f.props || []) if (!propOk(p)) bad.push(`folk ${role}: prop ${p.kind}:${p.id}`);
  for (const k of ['forts', 'farms', 'caves']) for (const [id, t] of Object.entries(SITES[k] || {})) for (const p of t.props || []) if (!propOk(p) && !(p.kind === 'prop' && p.id === 'palisade_stake')) bad.push(`sites ${k}.${id}: prop ${p.kind}:${p.id}`);
  assert.deepEqual(bad, []);
  assert.ok(WAY.length >= 15 && CUR.length >= 30 && VIG.length >= 18, `${WAY.length} wayside, ${CUR.length} curios, ${VIG.length} vignettes`);
});

test('every island prop id has a model: js/client/vharl-props.js draws exactly the vocabulary, each a real piece on the ground', { skip: !existsSync(at('../../avatar-3d/tests/three-register.mjs')) && 'the playground three loader is not here' }, () => {
  const code = `
    import { VHARL_PROP_IDS, buildVharlProp, VHARL_FIRE } from ${JSON.stringify(at('js/client/vharl-props.js'))};
    const out = {};
    for (const id of VHARL_PROP_IDS) { const g = buildVharlProp(id); const b = g.boundingBox; out[id] = { tris: g.attributes.position.count / 3, minY: b.min.y, maxY: b.max.y, w: Math.max(b.max.x - b.min.x, b.max.z - b.min.z), colours: !!g.attributes.color }; }
    console.log(JSON.stringify({ out, fire: [...VHARL_FIRE], none: buildVharlProp('hay_bale') }));`;
  const r = JSON.parse(execFileSync(process.execPath, ['--import', at('../../avatar-3d/tests/three-register.mjs'), '--input-type=module', '-e', code], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(r.out).sort(), [...ISLAND].sort(), 'the builder file and the vocabulary list the same ids');
  for (const [id, g] of Object.entries(r.out)) {
    const v = VOCAB.island[id];
    assert.ok(g.tris >= 20 && g.tris <= 600, `${id}: ${g.tris} triangles (low-poly, but a real shape)`);
    assert.ok(g.minY > -0.35 && g.minY < 0.1, `${id}: stands on the ground (min y ${g.minY.toFixed(2)})`);
    assert.ok(g.maxY > v.h * 0.6 && g.maxY < v.h * 1.5 + 0.2, `${id}: height ${g.maxY.toFixed(2)} for a listed ${v.h}`);
    assert.ok(g.w < v.size * 1.7 + 0.6, `${id}: ${g.w.toFixed(1)} m across for a listed ${v.size}`);
    assert.ok(g.colours, `${id}: vertex-coloured`);
  }
  assert.deepEqual(r.fire.sort(), Object.entries(VOCAB.island).filter(([, v]) => v.fire).map(([k]) => k).sort(), 'what burns is what the vocabulary says burns');
  assert.equal(r.none, null, 'a kit id is not the island file\'s');
  // and the one door every view draws props through asks it (decor.js propGeo)
  assert.match(readFileSync(at('js/client/decor.js'), 'utf8'), /id\.startsWith\('vh_'\)[^\n]*buildVharlProp\(id\)/);
});

test('no Torbor-themed thing is placed in any Vharlen zone; every island placement resolves to the island\'s own catalogue', () => {
  const C = new Map(CUR.map(c => [c.id, c])), W = new Map(WAY.map(k => [k.id, k])), V = new Map(VIG.map(v => [v.id, v]));
  const bad = [], count = { curio: 0, wayside: 0, vignette: 0, folk: 0, props: 0 };
  for (const wid of VWIDS) for (const p of placed(wid)) {
    const id = String(p.recipe || p.kind || p.role || p.id || '');
    if (p.type === 'curio') { count.curio++; if (T_CURIO.has(p.recipe) || !C.has(p.recipe)) bad.push(`${wid} curio ${p.recipe}`); }
    if (p.type === 'wayside') { count.wayside++; if (T_WAY.has(p.kind) || !W.has(p.kind)) bad.push(`${wid} wayside ${p.kind}`); }
    if (p.type === 'vignette') { count.vignette++; if (T_VIG.has(p.id) || !V.has(p.id)) bad.push(`${wid} vignette ${p.id}`); }
    if (p.type === 'folk') { count.folk++; if (T_FOLK.has(p.role) || !TRAV.folk[p.role]) bad.push(`${wid} folk ${p.role}`); }
    if (['curio', 'wayside', 'vignette', 'folk'].includes(p.type) && TORBOR_THEMED.test(id)) bad.push(`${wid} ${p.type} ${id}: a Torbor-themed id`);
    const recipe = p.type === 'curio' ? C.get(p.recipe) : p.type === 'wayside' ? W.get(p.kind) : p.type === 'vignette' ? V.get(p.id) : null;
    for (const q of [...((recipe && recipe.props) || []), ...(p.type === 'folk' ? p.props || [] : [])]) {
      count.props++;
      if (!propOk(q)) bad.push(`${wid} ${p.id}: prop ${q.kind}:${q.id} has no island model`);
      if (TORBOR_THEMED.test(q.id)) bad.push(`${wid} ${p.id}: prop ${q.id} is Torbor's`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), []);
  assert.ok(count.curio > 100 && count.wayside > 100 && count.vignette >= 30 && count.folk > 30 && count.props > 1000, JSON.stringify(count));
  // the farms and forts round the island's towns are drawn from the island's own templates (site-view.js reads <prov>-sites)
  for (const wid of VWIDS) assert.equal(J(`data/vignettes/placements/${wid}.json`).province, 'vharlen', `${wid}: the client knows whose site templates to draw`);
});

test('the people and the roads are the island\'s: travellers, folk, wanderers, road events, chatter, carters and shop goods', () => {
  const T = provinceDataSync(J, 'vharlen', 'travellers'), Wd = provinceDataSync(J, 'vharlen', 'wanderers'), R = provinceDataSync(J, 'vharlen', 'road-events'), S = provinceDataSync(J, 'vharlen', 'shops');
  const chatter = J('data/names/chatter.json').pools;
  const bad = [];
  for (const k of Object.keys(T.kinds)) if (T_KIND.has(k)) bad.push(`traveller kind ${k} is Torbor's`);
  for (const k of Object.keys(T.folk)) if (T_FOLK.has(k)) bad.push(`folk ${k} is Torbor's`);
  for (const k of Object.keys(Wd.kinds)) if (T_KIND.has(k)) bad.push(`wanderer ${k} is Torbor's`);
  for (const [id, k] of [...Object.entries(T.kinds), ...Object.entries(Wd.kinds), ...Object.entries(T.folk)]) {
    if (TORBOR_THEMED.test(id)) bad.push(`${id}: Torbor-themed`);
    for (const pool of k.chatter || []) { if (!chatter[pool]) bad.push(`${id}: chatter pool ${pool} missing`); else if (/^(road|role)\./.test(pool) && T_TRAV && Object.values(T_TRAV.kinds).concat(Object.values(T_TRAV.folk)).some(t => (t.chatter || []).includes(pool))) bad.push(`${id}: speaks from Torbor's pool ${pool}`); }
  }
  // the carts for hire on the island's roads are the island's kind
  const carts = J('data/provinces/vharlen-carts.json');
  assert.ok(Wd.kinds[carts.roaming.kind] && Wd.kinds[carts.roaming.kind].offers === 'cart', 'the roaming cart is an island wanderer that offers the cart window');
  for (const run of carts.roaming.runs || []) for (const k of run.only || []) if (!Wd.kinds[k]) bad.push(`cart run ${run.id}: kind ${k}`);
  assert.ok(Array.isArray(carts.rules.greetings) && carts.rules.greetings.length >= 6, 'the island carters have their own greetings');
  const greet = new Set(carts.rules.greetings);
  const carters = Object.keys(VMAP).flatMap(z => Object.values(J(`data/quests/${z}.json`).npcs || {}).filter(n => n.role === 'carter'));
  assert.ok(carters.length >= 5, 'carters stand in the island towns');
  for (const n of carters) if (![...greet].some(g => g.replace('{town}', n.at) === n.greeting)) bad.push(`carter ${n.name}: greeting "${n.greeting}" is not an island greeting`);
  // road events: island guards, drawn chest looks
  const looks = readFileSync(at('js/client/objects.js'), 'utf8');
  for (const c of R.chests) {
    for (const g of [...(c.guardTypes || []), ...(c.guardFallback || [])]) if (!TV.has(g)) bad.push(`chest ${c.id}: guard ${g}`);
    if (!['chest_iron', 'chest_small'].includes(c.look) && !new RegExp(`^  ${c.look}: \\{`, 'm').test(looks)) bad.push(`chest ${c.id}: look ${c.look} is not drawn`);
  }
  for (const k of ['chests', 'deliver', 'escort', 'rescue']) for (const r of R[k]) { if (!r.info) bad.push(`${k} ${r.id}: no info (run tools/content-events.mjs --province=vharlen)`); if (TORBOR_THEMED.test(r.id)) bad.push(`${k} ${r.id}`); }
  // the island's shops sell island goods: no horseshoes, oats or trail ale on an island shelf
  for (const [kind, k] of Object.entries(S.kinds)) for (const g of k.goods || []) {
    if (g.source === 'good' && !S.goodsCatalog[g.id]) bad.push(`shop ${kind}: good ${g.id} not in the catalogue`);
    if (['lucky_horseshoe', 'oat_sack', 'trail_ale', 'travel_rations', 'hearty_stew', 'cart_token', 'saddle_bags'].includes(g.id)) bad.push(`shop ${kind}: sells Torbor's ${g.id}`);
  }
  for (const t of Wd.tips || []) if (t.kind === 'good' && !S.goodsCatalog[t.id]) bad.push(`tip good ${t.id}`);
  assert.ok(S.roles && Object.values(S.roles).some(r => (r.goods || []).some(g => !J('data/provinces/shops.json').goodsCatalog[g.id])), 'the island roles (made by content-shops) carry island goods');
  assert.deepEqual(bad, []);
});

test('nothing of ours stands on a hot spring, a geyser or a lava vent (stream S\'s sites)', { skip: !has('data/provinces/vharlen-hazards.json') && 'no hazards yet' }, () => {
  const H = J('data/provinces/vharlen-hazards.json'), bad = [];
  const segD = (x, z, h) => { const dx = h.bx - h.ax, dz = h.bz - h.az, l = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - h.ax) * dx + (z - h.az) * dz) / l)); return Math.hypot(x - h.ax - dx * u, z - h.az - dz * u); };
  for (const wid of VWIDS) {
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number), ox = zx * 2048, oz = zy * 2048;
    for (const p of placed(wid)) {
      if (!['curio', 'wayside', 'vignette', 'folk', 'farm', 'fort'].includes(p.type)) continue;
      const x = p.x + ox, z = p.z + oz, r = p.radius || 4;
      for (const h of H.springs || []) if (h.zone === wid && Math.hypot(x - h.x, z - h.z) < r + h.r) bad.push(`${p.id} on spring ${h.id}`);
      for (const h of H.geysers || []) if (h.zone === wid && Math.hypot(x - h.x, z - h.z) < r + h.r + 3) bad.push(`${p.id} on geyser ${h.id}`);
      for (const h of H.vents || []) if (h.zone === wid && segD(x, z, h) < r + (h.w || 2)) bad.push(`${p.id} on vent ${h.id}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every island dungeon door is pinned and has its waystone 6-36 m away', () => {
  const pins = J('data/world/site-pins.json');
  for (const wid of VWIDS) {
    const door = J(`data/zones/${wid}/placements.json`).placements.find(p => p.kind === 'dungeon_door');
    assert.ok(door, `${wid}: a door`);
    assert.ok(pins[wid] && pins[wid].door_1, `${wid}: door pinned`);
    assert.ok(Math.hypot(pins[wid].door_1.x - door.x, pins[wid].door_1.z - door.z) < 1, `${wid}: the bake honoured the pin`);
    const ws = J(`data/vignettes/placements/${wid}.json`).placements.find(p => p.type === 'waystone' && p.door);
    assert.ok(ws, `${wid}: the door has a waystone`);
    const d = Math.hypot(ws.x - door.x, ws.z - door.z);
    assert.ok(d >= 6 && d <= 36, `${wid}: door stone ${d.toFixed(1)} m from the door`);
  }
});

test('Torbor Downs carries none of the island\'s dressing, and the client draws only island wayside kinds', () => {
  const vh = new Set([...WAY, ...CUR, ...VIG].map(r => r.id));
  for (const wid of TWIDS) for (const p of placed(wid)) {
    assert.ok(!vh.has(p.recipe) && !vh.has(p.kind) && !vh.has(p.id), `${wid} ${p.id}: an island recipe in Torbor`);
    assert.ok(!p.props, `${wid} ${p.id}: Torbor folk records carry no camp props`);
  }
  const vp = readFileSync(at('js/client/vignette-props.js'), 'utf8');
  assert.match(vp, /const DRAWN_WAYSIDE = \['vharlen-wayside'\];/, 'Torbor\'s wayside dressing stays undrawn, as it always was');
});
