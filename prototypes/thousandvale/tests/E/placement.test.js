// node --test prototypes/thousandvale/tests/E/placement.test.js
// Stream E M2: content placed at real coordinates on stream B's baked Torbor Downs zones
// (data/vignettes/placements/<world zone>.json, made by tools/place-vignettes.mjs).
// Every spot is on dry land, walkable over its radius, reachable from the province hub, off roads, streets,
// building plots and settlement circles, not on steep ground, spaced from everything else — checked here
// TWICE: once with the placer's own rule (discProblem) and once independently against B's road polylines and
// building footprints, so a bug in the placer's distance fields cannot pass its own test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { zoneContext, provinceComponents, discProblem, walkLine, fingerprint, ruleKind } from '../../tools/content-place.mjs';
import { pinnedVignettes } from '../../tools/content-lib.mjs';
import { boringWalk, LIMIT } from '../../tools/boring-walk.mjs';
import { connectedSets, gridDist } from '../../tools/province-graph.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const SHEET = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const PLACES = J('data/provinces/torbor_downs-places.json');
const RARES = J('data/provinces/rares.json');
const TREASURE = J('data/quests/treasure.json').chains;
const EVENTS = J('data/quests/events.json');
const SCHED = J('data/provinces/schedules.json');
const TRACES = J('data/names/traces.json');
const VIGS = new Map(['m1', 'm2', 'm2b'].flatMap(f => J(`data/vignettes/${f}.json`).vignettes).map(v => [v.id, v]));
const SITES = J('data/provinces/sites.json');
const ENCOUNTERS = new Set(J('data/encounters/index.json').files.map(f => f.replace(/\.json$/, '')));
const EIDS = Object.keys(MAP);
const PINS = existsSync(new URL('data/world/site-pins.json', root)) ? J('data/world/site-pins.json') : {};

const Z = {};
for (const eid of EIDS) {
  const wid = MAP[eid];
  const dir = `data/zones/${wid}/`;
  Z[eid] = {
    eid, wid, sheet: SHEET.zones[eid],
    terrain: parseTerrain(readFileSync(new URL(dir + 'terrain.bin', root))),
    nav: parseNav(readFileSync(new URL(dir + 'nav.bin', root))),
    bake: J(dir + 'placements.json').placements,
    file: J(`data/vignettes/placements/${wid}.json`),
  };
}
const se = SHEET.grid.start, hub = Z[se].bake.find(p => p.kind === 'settlement' && p.data.hub);
const PCOMP = provinceComponents(EIDS.map(e => ({ gx: Z[e].sheet.grid[0], gy: Z[e].sheet.grid[1], nav: Z[e].nav })), { gx: Z[se].sheet.grid[0], gy: Z[se].sheet.grid[1], x: hub.x, z: hub.z });
for (const z of Object.values(Z)) {
  z.ctx = zoneContext({ terrain: z.terrain, nav: z.nav, placements: z.bake, reserve: PLACES.zones[z.eid].asks, province: PCOMP, cell: { gx: z.sheet.grid[0], gy: z.sheet.grid[1] }, pinned: new Set(Object.keys(PINS[z.wid] || {})) });
  z.pl = z.file.placements;
}
const DISC = ['vignette', 'fort', 'farm', 'cave', 'camp', 'rare', 'hook', 'wayside', 'curio', 'folk'];
/** the placer's rule for a record: strays, roaming packs and the door guard are small camps (KIND_RULES.stray) */
const ruleOf = ruleKind;
const WAYSIDE = new Set(J('data/vignettes/wayside.json').kinds.map(k => k.id));

test('every Torbor Downs zone has a placement file made for the bake it sits on', () => {
  for (const z of Object.values(Z)) {
    assert.equal(z.file.zone, z.wid);
    assert.equal(z.file.sheetZone, z.eid);
    assert.equal(z.file.terrainHash, z.terrain.meta.inputHash, `${z.wid}: stale — re-run tools/place-vignettes.mjs`);
    assert.deepEqual(z.file.problems, [], `${z.wid}: ${z.file.problems.join('; ')}`);
  }
});

test('the floor (PLAN §3.4) in every zone: fort, 2+ farms, 1-4 caves, 8-12 vignettes, hook, 2 rares, waystones, camps', () => {
  for (const z of Object.values(Z)) {
    const n = t => z.pl.filter(p => p.type === t).length;
    assert.ok(n('fort') >= 1, `${z.eid} forts`);
    assert.ok(n('farm') >= 2, `${z.eid} farms`);
    assert.ok(n('cave') >= 1 && n('cave') <= 4, `${z.eid} caves ${n('cave')}`);
    assert.ok(n('vignette') >= 8 && n('vignette') <= 12, `${z.eid} vignettes ${n('vignette')}`);
    assert.equal(n('hook') + z.file.features.filter(f => f.type === 'hook').length, 1, `${z.eid} hook`);
    assert.deepEqual(z.pl.filter(p => p.type === 'rare').map(p => p.id).sort(), [...RARES[z.eid]].sort(), `${z.eid} rares`);
    assert.ok(n('camp') >= 2 * (z.sheet.camps || []).length, `${z.eid} camps`);
    assert.ok(n('waystone') >= z.file.settlements.length, `${z.eid} a waystone per settlement`);
    assert.ok(z.pl.some(p => p.type === 'waystone' && p.door), `${z.eid} a waystone by the dungeon door`);
    // a town and 1-2 hamlets: either baked or asked of stream B
    const kinds = z.file.settlements.map(s => s.kind);
    assert.ok(kinds.filter(k => k !== 'hamlet').length >= 1 || kinds.length >= 1 + (z.sheet.hamlets || []).length, `${z.eid} no town`);
    assert.ok(z.file.settlements.length >= 1 + Math.min(1, (z.sheet.hamlets || []).length), `${z.eid} settlements ${z.file.settlements.length}`);
    for (const t of z.pl.filter(p => ['fort', 'farm', 'cave'].includes(p.type))) assert.ok(SITES[t.type + 's'][t.template], `${z.eid} ${t.id}: template ${t.template}`);
  }
});

test('ON LAND, OPEN, OFF ROADS/PLOTS/SETTLEMENTS, NOT STEEP, SPACED: every disc passes the placer rule against everything else', () => {
  const bad = [];
  for (const z of Object.values(Z)) {
    const others = z.pl;
    for (const p of z.pl.filter(p => DISC.includes(p.type) && p.radius != null)) {
      const why = discProblem(z.ctx, ruleOf(p), p.x, p.z, p.radius, { ignore: p, others });
      if (why) bad.push(`${z.wid} ${p.type} ${p.id}: ${why}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('independent check against stream B geometry: no disc touches a road polyline, a bridge, a building plot or a settlement circle', () => {
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
  const bad = [];
  for (const z of Object.values(Z)) {
    const roads = z.bake.filter(p => p.kind === 'road' || p.kind === 'street');
    const plots = z.bake.filter(p => p.kind === 'building');
    const circles = [...z.bake.filter(p => p.kind === 'settlement').map(p => ({ x: p.x, z: p.z, r: p.data.radius })), ...PLACES.zones[z.eid].asks];
    for (const p of z.pl.filter(p => DISC.includes(p.type) && p.radius != null)) {
      for (const r of roads) for (let i = 1; i < r.data.pts.length; i++) {
        const d = segDist(p.x, p.z, r.data.pts[i - 1], r.data.pts[i]);
        if (d < p.radius + r.data.width / 2) { bad.push(`${z.wid} ${p.id}: on ${r.kind} ${r.id} (${d.toFixed(1)} m)`); break; }
      }
      for (const b of z.bake.filter(q => q.kind === 'bridge')) if (Math.hypot(p.x - b.x, p.z - b.z) < p.radius + b.data.span / 2) bad.push(`${z.wid} ${p.id}: on bridge ${b.id}`);
      for (const b of plots) if (Math.hypot(p.x - b.x, p.z - b.z) < p.radius + Math.hypot(b.data.w, b.data.d) / 2) bad.push(`${z.wid} ${p.id}: on plot ${b.id}`);
      for (const c of circles) if (Math.hypot(p.x - c.x, p.z - c.z) < p.radius + c.r) bad.push(`${z.wid} ${p.id}: inside settlement at ${c.x},${c.z}`);
      // dry and gentle at the centre, measured straight off the terrain
      if (z.terrain.waterAt(p.x, p.z).depth > 0) bad.push(`${z.wid} ${p.id}: in water`);
      if (z.terrain.slopeAt(p.x, p.z) > (p.type === 'wayside' ? 34 : 30)) bad.push(`${z.wid} ${p.id}: slope ${z.terrain.slopeAt(p.x, p.z).toFixed(0)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('REACHABLE: everything stands in the walkable component of the province hub (stitched nav.bin, across zone borders)', () => {
  const bad = [];
  for (const z of Object.values(Z)) for (const p of [...z.pl, ...z.file.features]) {
    const pts = p.pts ? p.pts.map(([x, zz]) => ({ x, z: zz })) : [p];
    // a feature AT a ford stands on the river: it counts when the bank within 30 m is reached (B's zone-reach rule)
    const near = p.where === 'at the crossing' ? 30 : 0;
    const ok = q => { if (z.ctx.inMainLoose(q.x, q.z)) return true; for (let r = 2; r <= near; r += 2) for (let a = 0; a < 16; a++) if (z.ctx.inMain(q.x + Math.cos(a * 0.3927) * r, q.z + Math.sin(a * 0.3927) * r)) return true; return false; };
    for (const q of pts) if (!ok(q)) bad.push(`${z.wid} ${p.type} ${p.id} at ${q.x},${q.z}`);
  }
  assert.deepEqual(bad, []);
  // and stream B's own sites: the dungeon door, the event arenas, the world boss arena
  for (const z of Object.values(Z)) for (const c of z.file.checks) assert.ok(c.reachable, `${z.wid} B site ${c.id} is not reachable from the hub`);
});

test('rares, roaming packs and folk walk: every leg of every loop is a walkable corridor in the main component', () => {
  for (const z of Object.values(Z)) for (const r of z.pl.filter(p => p.type === 'rare' || p.roam || p.type === 'folk')) {
    assert.ok(r.path.length >= (r.type === 'folk' ? 3 : 4), `${r.id} path`);
    const pts = r.path.map(([x, zz]) => ({ x, z: zz }));
    for (let i = 0; i < pts.length; i++) assert.ok(walkLine(z.ctx, pts[i], pts[(i + 1) % pts.length]), `${z.wid} ${r.id} leg ${i}`);
    assert.ok(walkLine(z.ctx, r, pts[0]), `${z.wid} ${r.id} spawn -> loop`);
  }
});

test('stream B keeps its sites: every placement clears B\'s door (r + 40) and arenas (r + arena + 20) by B\'s own rule — unless the site is pinned', () => {
  // tools/lib/zone-sites.mjs re-searches the door and arenas each bake with our placements as avoid discs (radius || 12);
  // a PINNED site (data/world/site-pins.json) never moves, so our things may stand close to it
  const bad = [];
  for (const z of Object.values(Z)) for (const p of z.pl) {
    const r = p.radius || 12;
    for (const s of z.bake) {
      if (PINS[z.wid] && PINS[z.wid][s.id]) continue;
      if (s.kind === 'dungeon_door' && Math.hypot(p.x - s.x, p.z - s.z) < r + 40) bad.push(`${z.wid} ${p.id} vs ${s.id}`);
      if ((s.kind === 'event_site' || s.kind === 'camp_site') && Math.hypot(p.x - s.x, p.z - s.z) < r + s.data.r + 20) bad.push(`${z.wid} ${p.id} vs ${s.id}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('LONGEST BORING WALK <= 250 m (PLAN §16): on every road, and cross-country through the emptiest reachable pocket', () => {
  const zones = EIDS.map(e => ({ id: Z[e].wid, gx: Z[e].sheet.grid[0], gy: Z[e].sheet.grid[1], nav: Z[e].nav, bake: Z[e].bake, file: Z[e].file }));
  const r = boringWalk(zones, { reachable: gi => PCOMP.label[gi] === PCOMP.main });
  assert.ok(r.road.worst <= LIMIT, `road: ${r.road.worst} m with nothing in sight on ${JSON.stringify(r.road.at)}`);
  assert.ok(r.open.worst <= LIMIT, `open ground: ${r.open.worst} m (pocket ${JSON.stringify(r.open.at)})`);
  // fillers are what they say: a wayside kind from wayside.json, or a camp from the zone's own mix
  for (const z of Object.values(Z)) for (const p of z.pl.filter(q => q.filler)) {
    if (p.type === 'wayside') assert.ok(WAYSIDE.has(p.kind), `${z.wid} ${p.id}: kind ${p.kind}`);
    else { assert.equal(p.type, 'camp'); assert.ok((z.sheet.camps || []).some(c => c.type === p.monster), `${z.wid} ${p.id}: ${p.monster}`); }
  }
});

test('minimum spacing: vignettes >= 140 m apart, NPCs >= 3 m apart, waystones >= 60 m apart (P14)', () => {
  for (const z of Object.values(Z)) {
    const near = (list, d) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) < d) return `${list[i].id} / ${list[j].id}`; return null; };
    assert.equal(near(z.pl.filter(p => p.type === 'vignette'), 140), null, z.wid);
    assert.equal(near(z.pl.filter(p => p.type === 'npc'), 3), null, z.wid);
    assert.equal(near(z.pl.filter(p => p.type === 'waystone'), 60), null, z.wid);
  }
});

test('quest NPCs, quest vignettes and treasure steps: everything the zone\'s quests name is placed in that zone', () => {
  const pins = pinnedVignettes();
  for (const z of Object.values(Z)) {
    const ids = new Set(z.pl.filter(p => p.type === 'vignette').map(p => p.id));
    for (const v of pins[z.eid] || []) assert.ok(ids.has(v), `${z.eid}: quest vignette ${v} not placed`);
    const q = J(`data/quests/${z.eid}.json`);
    for (const nid of Object.keys(q.npcs || {})) assert.ok(z.pl.some(p => p.type === 'npc' && p.id === nid), `${z.eid}: npc ${nid}`);
    // an NPC in a town stands inside that town's circle, never in a building
    for (const n of z.pl.filter(p => p.type === 'npc')) {
      const s = z.file.settlements.find(s2 => s2.name === n.at);
      if (s) assert.ok(Math.hypot(n.x - s.x, n.z - s.z) <= s.r, `${z.eid}: ${n.id} outside ${s.name}`);
      assert.ok(!(z.ctx.bitsAt(n.x, n.z) & 128), `${z.eid}: ${n.id} inside a building`);
    }
  }
  for (const c of TREASURE) {
    c.steps.forEach((s, k) => assert.ok(Z[s.zone].pl.some(p => p.type === 'treasure_clue' && p.chain === c.id && p.step === k), `${c.id} step ${k} (${s.zone})`));
    assert.ok(Z[c.cache.zone].pl.some(p => p.type === 'treasure_cache' && p.chain === c.id), `${c.id} cache (${c.cache.zone})`);
  }
});

test('VARIETY on the placed world: any 5 connected zones hold >= 40 distinct vignettes; none twice within 2 zones', () => {
  const ids = EIDS, cells = ids.map(e => Z[e].sheet.grid);
  const sets = connectedSets(cells, 5);
  let worst = Infinity;
  for (const s of sets) worst = Math.min(worst, new Set(s.flatMap(i => Z[ids[i]].pl.filter(p => p.type === 'vignette').map(p => p.id))).size);
  assert.ok(worst >= 40, `worst 5-zone set holds ${worst}`);
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    if (gridDist(cells[a], cells[b]) > 2) continue;
    const A = fingerprint(Z[ids[a]].file).vignettes, B = fingerprint(Z[ids[b]].file).vignettes;
    const shared = [...A].filter(v => B.has(v));
    assert.deepEqual(shared, [], `${ids[a]} / ${ids[b]}`);
  }
});

test('SAMENESS: no two zones carry the same content mix (vignettes + site templates + camp monsters), neighbours least of all', () => {
  const jac = (a, b) => { const A = new Set(a), B = new Set(b); const i = [...A].filter(x => B.has(x)).length; return i / (A.size + B.size - i || 1); };
  const fp = Object.fromEntries(EIDS.map(e => [e, fingerprint(Z[e].file)]));
  for (let a = 0; a < EIDS.length; a++) for (let b = a + 1; b < EIDS.length; b++) {
    const A = fp[EIDS[a]], B = fp[EIDS[b]];
    const all = jac([...A.vignettes, ...A.templates.map(t => 't:' + t), ...A.camps.map(c => 'c:' + c)], [...B.vignettes, ...B.templates.map(t => 't:' + t), ...B.camps.map(c => 'c:' + c)]);
    const adj = gridDist(Z[EIDS[a]].sheet.grid, Z[EIDS[b]].sheet.grid) === 1;
    assert.ok(all < (adj ? 0.35 : 0.6), `${EIDS[a]} / ${EIDS[b]} too alike (${all.toFixed(2)})`);
  }
  // and no layout is a copy: the vignettes' positions relative to the zone differ between any two zones
  const sig = e => Z[e].pl.filter(p => p.type === 'vignette').map(p => `${Math.round(p.x / 100)},${Math.round(p.z / 100)}`).sort().join(' ');
  assert.equal(new Set(EIDS.map(sig)).size, EIDS.length);
});

test('settlement names and asks for stream B: renames key real World Forge places; asks are baked where asked, or clear of baked towns', () => {
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  for (const eid of EIDS) {
    const p = PLACES.zones[eid], z = Z[eid];
    assert.equal(p.world, z.wid);
    // B imposes our names and keeps the World Forge one as data.wfName: a rename key is that old name's slug
    const named = z.bake.filter(b => b.data && (b.data.name || b.data.wfName));
    for (const [k, v] of Object.entries(p.rename)) {
      // (a crossing B renamed may not keep wfName: then the target name itself must be baked)
      const site = named.find(b => slug(b.data.wfName || b.data.name) === k || b.id === k) || named.find(b => b.data.name === v);
      assert.ok(site, `${eid}: rename of unknown ${k}`);
      if (site.data.wfName) assert.equal(site.data.name, v, `${eid}: ${k} baked as ${site.data.name}, wanted ${v}`);
    }
    const names = [z.sheet.town, ...(z.sheet.hamlets || [])];
    const baked = z.bake.filter(q => q.kind === 'settlement');
    for (const a of p.asks) {
      assert.ok(names.includes(a.name), `${eid}: ask ${a.name} is not a sheet name`);
      const m = a.r + 70;
      assert.ok(a.x >= m && a.z >= m && a.x <= 2048 - m && a.z <= 2048 - m, `${eid}: ask ${a.name} too close to the edge`);
      const done = baked.find(b => b.data.name === a.name);
      if (done) { assert.ok(Math.hypot(done.x - a.x, done.z - a.z) < 1, `${eid}: ${a.name} baked away from its ask`); continue; }
      for (const b of baked) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.data.radius + 100, `${eid}: ask ${a.name} on ${b.id}`);
    }
    // every sheet town/hamlet is a baked settlement now, or still an open ask
    const have = new Set([...p.asks.map(a => a.name), ...baked.map(b => b.data.name)]);
    for (const n of names) assert.ok(have.has(n), `${eid}: ${n} has no place`);
  }
});

test('event director: one zone event per zone at B\'s arena with a real boss script; Grimtallow is a fixed-time scheduled realm event', () => {
  assert.equal(EVENTS.zone.length, EIDS.length);
  for (const e of EVENTS.zone) {
    const z = Z[e.zone];
    assert.ok(z, e.id);
    assert.ok(z.bake.some(p => p.kind === 'event_site' && p.id === e.site), `${e.id}: no arena ${e.site} in ${z.wid}`);
    assert.ok(ENCOUNTERS.has(e.boss), `${e.id}: boss ${e.boss}`);
    assert.ok(e.waves.length >= 1 && e.durationMinutes > 0);
  }
  assert.equal(new Set(EVENTS.zone.map(e => e.boss)).size, EVENTS.zone.length, 'every zone event has its own boss');
  const wb = EVENTS.realm.find(e => e.kind === 'worldboss');
  assert.equal(wb.id, SHEET.worldBoss.id);
  assert.equal(wb.schedule.type, 'fixed');
  assert.ok(ENCOUNTERS.has(wb.encounter));
  assert.ok(Z[wb.zone].bake.some(p => p.id === wb.site), 'world boss arena baked');
  assert.ok(EVENTS.director.oneRealmEventAtATime && EVENTS.director.announceMinutes === 10 && EVENTS.director.freeWaystoneTravel);
  for (const e of EVENTS.realm) for (const zz of e.zones || [e.zone]) assert.ok(SHEET.zones[zz], `${e.id}: zone ${zz}`);
});

test('NPC schedules: every block names a phase and an anchor that resolves; every anchor want is a proctown building want', () => {
  const wants = new Set(Object.values(Z).flatMap(z => z.bake.filter(p => p.kind === 'building').map(p => p.data.want)));
  const phases = new Set(Object.keys(SCHED.clock.phases));
  const check = (who, blocks) => { for (const b of blocks) { assert.ok(phases.has(b.from) || (b.from >= 0 && b.from <= 1), `${who}: from ${b.from}`); assert.ok(SCHED.anchors[b.at], `${who}: anchor ${b.at}`); } };
  for (const [id, r] of Object.entries(SCHED.roles)) check(id, r.blocks);
  check('guard', SCHED.guard.blocks); check('questNpc', SCHED.questNpc.blocks);
  for (const [id, a] of Object.entries(SCHED.anchors)) {
    for (const w of a.want || []) assert.ok(wants.has(w), `anchor ${id}: want ${w} never baked`);
    for (const f of a.fallback || []) assert.ok(SCHED.anchors[f], `anchor ${id}: fallback ${f}`);
  }
  for (const list of [SCHED.perTown.town, SCHED.perTown.city, SCHED.perTown.hamlet]) for (const r of list) assert.ok(SCHED.roles[r], r);
  // a service is never switched off: every role with a service has a block covering night that serves
  for (const [id, r] of Object.entries(SCHED.roles)) if (r.service.length) assert.ok(r.says.night && r.says.night.length, `${id}: no night line`);
});

test('player traces: every template uses only the declared placeholders', () => {
  const allowed = new Set(['name', 'level', 'class', 'killer', 'party', 'ago', 'place', 'count', 'zone', 'what']);
  const walk = (o, path) => {
    if (typeof o === 'string') { for (const m of o.matchAll(/\{(\w+)\}/g)) assert.ok(allowed.has(m[1]), `${path}: {${m[1]}}`); }
    else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== '_doc') walk(v, `${path}.${k}`);
  };
  walk(TRACES, 'traces');
  for (const k of ['grave', 'campfire', 'banner', 'deeds']) assert.ok(TRACES[k], k);
  assert.equal(TRACES.grave.fadeMinutes, 60, 'graves fade after an hour (PLAN §5.4)');
});
