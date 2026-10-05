// Stream D — M2 client tests: the stitched province ground, the far horizon, towns from placements,
// scatter, day/night, waystone fares, dungeon looks, crowd LOD, footprints, the skill bar.
// Modules that import three are loaded through avatar-3d's loader (registered below, then dynamic import).
// Run: node --test prototypes/thousandvale/tests/D/world.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseScatter, SCATTER_KINDS } from '../../js/rules/terrain-read.js';
import { worldZone, zonesWanted, rectDist, ZONE_M } from '../../js/client/terrain.js';
import { nightness, skyAt, sunDirection, timeName } from '../../js/client/daynight.js';
import { estimateFare, ago, deedLines } from '../../js/client/world-ui.js';
import { barFromData, barFromServer, isAllySkill } from '../../js/client/skillbar.js';
import { vignettePoint } from '../../js/sim/vignettes.js';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const G = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, G));
const zoneT = key => {
  const t = parseTerrain(read(`data/zones/${key}/terrain.bin`));
  return { key, reader: t, heightAt: t.heightAt, walkable: t.walkable, waterAt: t.waterAt, slopeDeg: t.slopeAt, biomeKey: (x, z) => t.biomes[t.biomeAt(x, z)].key,
    bounds: t.bounds, origin: t.origin, extent: t.extent, res: t.size, step: t.step, heightGrid: () => t.heightGrid(), waterGrid: () => t.waterGrid(), spawn: t.meta.spawn, sites: t.meta.sites };
};
const cell = key => { const m = /^z(\d+)_(\d+)$/.exec(key); return [+m[1] * ZONE_M, +m[2] * ZONE_M]; };

test('stream: the zone you stand in, neighbours near an edge, hysteresis, a cap', () => {
  const zones = ['z11_02', 'z12_02', 'z13_02', 'z12_01', 'z12_03'].map(k => { const [x, z] = cell(k); return { key: k, bounds: { minX: x, minZ: z, maxX: x + ZONE_M, maxZ: z + ZONE_M } }; });
  const [x0, z0] = cell('z12_02');
  assert.deepEqual(zonesWanted(zones, x0 + 1024, z0 + 1024), ['z12_02'], 'the middle of a zone needs only that zone');
  const nearWest = zonesWanted(zones, x0 + 300, z0 + 1024);
  assert.ok(nearWest.includes('z12_02') && nearWest.includes('z11_02') && nearWest.length === 2, 'within 450 m of the west edge: the west neighbour too');
  assert.ok(zonesWanted(zones, x0 + 700, z0 + 1024, new Set(['z11_02'])).includes('z11_02'), 'a loaded neighbour stays until 900 m');
  assert.ok(!zonesWanted(zones, x0 + 1000, z0 + 1024, new Set(['z11_02'])).includes('z11_02'), '…and goes after that');
  assert.ok(zonesWanted(zones, x0 + 10, z0 + 10, new Set(), { max: 2 }).length <= 2, 'never more than max');
  assert.equal(rectDist(zones[1].bounds, x0 + 5, z0 + 5), 0);
});

test('stream: zones moved into world metres meet at the seam (drawn = measured across a border)', () => {
  const a = zoneT('z12_02'), b = zoneT('z13_02');
  const [ax, az] = cell('z12_02'), [bx, bz] = cell('z13_02');
  const A = worldZone(a, ax, az), B = worldZone(b, bx, bz);
  assert.equal(A.origin.x, ax); assert.equal(B.bounds.minX, bx);
  assert.equal(A.heightAt(ax + 100, az + 200), a.heightAt(100, 200), 'the wrapper reads the same sample');
  let worst = 0;
  for (let z = 0; z <= ZONE_M; z += 16) worst = Math.max(worst, Math.abs(A.heightAt(bx, az + z) - B.heightAt(bx, bz + z)));
  assert.ok(worst < 1e-6, `seam heights differ by ${worst} m`);
});

test('horizon: macro.bin decodes, and its height is the zones\' height at macro scale', async () => {
  const { decodeMacro, macroMetres, macroHeightAt } = await import('../../js/client/horizon.js');
  const m = decodeMacro(read('data/world/macro.bin'));
  const w = JSON.parse(read('data/world/world.json'));
  assert.equal(m.width, 288); assert.equal(m.height, 224);
  m.landMetres = w.landMetres; m.seaMetres = w.seaMetres; m.macroMetres = w.macroMetres;
  const H = Float32Array.from(m.elevation, e => macroMetres(m, e));
  for (const key of ['z12_02', 'z11_04', 'z14_01']) {
    const t = zoneT(key), [ox, oz] = cell(key);
    let dz = 0, dm = 0, n = 0;
    for (let z = 64; z < ZONE_M; z += 128) for (let x = 64; x < ZONE_M; x += 128) { dz += t.heightAt(x, z); dm += macroHeightAt(m, H, ox + x, oz + z); n++; }
    assert.ok(Math.abs(dz / n - dm / n) < 60, `${key}: zone mean ${(dz / n).toFixed(1)} vs horizon mean ${(dm / n).toFixed(1)}`);
  }
});

test('towns: every baked building faces its street and fits its plot (proctown kit, placements.json)', async () => {
  const { plotFromPlacement, localToWorld } = await import('../../js/client/town-view.js');
  const { describeBuilding, CULTURE_KIT } = await import('../../../../proctown/js/buildkit.js');
  const P = JSON.parse(read('data/zones/z12_02/placements.json')).placements;
  const buildings = P.filter(p => p.kind === 'building');
  assert.ok(buildings.length >= 20, 'the starter zone has a town');
  for (const p of buildings) {
    const plot = plotFromPlacement(p);
    const d = describeBuilding({ plot, culture: 'halfling', seed: 1 });
    assert.ok(Math.abs(Math.atan2(Math.sin(d.yaw - p.yaw), Math.cos(d.yaw - p.yaw))) < 1e-9, `${p.id}: door yaw ${d.yaw} vs placement ${p.yaw}`);
    assert.ok(d.footprint.w <= Math.max(p.data.w, p.data.d) + 1e-6 && d.footprint.d <= Math.max(p.data.w, p.data.d) + 1e-6, `${p.id}: footprint inside the plot`);
  }
  assert.ok(CULTURE_KIT.cultures.halfling, 'the province culture exists in the kit');
  // the local->world turn is the server's vignette formula
  const pl = { x: 10, z: 20, yaw: 0.7 };
  const a = localToWorld(pl.x, pl.z, pl.yaw, 3, -2), b = vignettePoint(pl, 3, -2);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-12);
});

test('scatter: every baked kind has art, and bucketing keeps every item exactly once', async () => {
  const { KIND_ART, bucketScatter } = await import('../../js/client/scatter-view.js');
  assert.deepEqual(KIND_ART.map(k => k.key), SCATTER_KINDS.map(k => k.key));
  const sc = parseScatter(read('data/zones/z12_02/scatter.bin'));
  const [ox, oz] = cell('z12_02');
  const b = bucketScatter(sc, ox, oz);
  const seen = new Uint8Array(sc.count);
  for (const bk of b) for (const i of bk.items) { seen[i]++; const x = sc.x[i] + ox, z = sc.z[i] + oz; assert.ok(Math.abs(x - bk.cx) <= 64 && Math.abs(z - bk.cz) <= 64); }
  assert.ok(seen.every(v => v === 1), 'each item in one bucket');
});

test('day/night: the server\'s night is dark here too, the key light never comes from below, names', () => {
  assert.equal(nightness(0), 1); assert.equal(nightness(0.5), 0);
  for (let t = 0; t < 1; t += 0.01) {
    const serverNight = t < 0.22 || t > 0.8;
    if (serverNight) assert.ok(nightness(t) > 0.85, `t=${t.toFixed(2)} night ${nightness(t)}`);
    const k = skyAt(t);
    assert.ok(k.keyDir[1] > 0.05, `key light below the horizon at ${t}`);
    assert.ok(k.hemiIntensity >= 0.7, 'nights stay readable (hemisphere floor)');
  }
  assert.ok(sunDirection(0.5)[1] > 0.8 && sunDirection(0.25)[0] > 0.9, 'noon overhead, sunrise in the east');
  assert.equal(timeName(0.5), 'Midday'); assert.equal(timeName(0.95), 'Night');
});

test('waystones and deeds: fares match the server rule, plain-language lines', () => {
  assert.equal(estimateFare({ x: 0, z: 0 }, { x: 800, z: 0 }), 2 + Math.round(800 / 400));
  assert.equal(estimateFare({ x: 0, z: 0 }, { x: 0, z: 0 }, true), 2 + Math.round(4000 / 400));
  assert.equal(ago(Date.now() - 4 * 60000), '4 minutes ago');
  assert.deepEqual(deedLines({ rares: 3, bosses: 0, elites: 1, deaths: 0, visitors: 1 }), ['3 rares slain here this hour', 'An elite was beaten here this hour']);
});

test('dungeon looks: all 8 families have a distinct look, props hug the walls, same plan = same dressing', async () => {
  const { LOOKS, FAMILY_LOOK, lookFor, dressRooms } = await import('../../js/client/dungeon-view.js');
  const { planDungeon } = await import('../../js/rules/dungeon-tiers.js');
  const fams = ['crypt_spiral', 'mine_descent', 'flooded_cistern', 'fortress_keep', 'cave_river', 'tower_climb', 'barrow_maze', 'sunken_temple'];
  const looks = new Set();
  for (const f of fams) {
    const plan = planDungeon(5, { family: f, floors: 2, level: 3 });
    const look = lookFor(plan);
    assert.ok(LOOKS[look], `${f}: look ${plan.look}`);
    looks.add(look);
    const tileAt = (i, j, fl) => (i >= 0 && j >= 0 && i < fl.w && j < fl.h ? fl.tiles[j * fl.w + i] : 0);
    const dress = dressRooms(plan.floors, plan.cell, LOOKS[look], tileAt);
    assert.ok(dress.props.length > 10, `${f}: dressed`);
    for (const p of dress.props) {
      const fl = plan.floors.find(q => p.x >= q.origin.x && p.z >= q.origin.z && p.x < q.origin.x + q.w * plan.cell && p.z < q.origin.z + q.h * plan.cell);
      const i = Math.floor((p.x - fl.origin.x) / plan.cell), j = Math.floor((p.z - fl.origin.z) / plan.cell);
      assert.ok(tileAt(i, j, fl), 'on a floor tile');
      assert.ok(!tileAt(i - 1, j, fl) || !tileAt(i + 1, j, fl) || !tileAt(i, j - 1, fl) || !tileAt(i, j + 1, fl), 'beside a wall, not in the fight');
    }
    assert.deepEqual(dressRooms(plan.floors, plan.cell, LOOKS[look], tileAt), dress, 'deterministic');
  }
  assert.equal(looks.size, 8, 'eight different looks');
  assert.equal(Object.keys(FAMILY_LOOK).filter(k => fams.includes(k)).length, 8);
});

test('crowd LOD: 100 players -> the nearest 30 get bodies (and always you), every monster in reach does', async () => {
  const { chooseFull } = await import('../../js/client/actors.js');
  const list = [];
  for (let i = 0; i < 100; i++) list.push({ id: i, kind: 'player', d: i * 1.5 });
  list.push({ id: 'me', kind: 'player', d: 500 });
  for (let i = 0; i < 20; i++) list.push({ id: 'mon' + i, kind: 'monster', d: 20 + i * 10 });
  const full = chooseFull(list, { fullMax: 30, selfId: 'me', monsterRange: 120 });
  const players = [...full].filter(id => typeof id === 'number');
  assert.equal(players.length, 30);
  assert.ok(full.has('me'));
  assert.ok(players.every(id => id < 30), 'the nearest ones');
  assert.equal([...full].filter(id => String(id).startsWith('mon')).length, 10, 'monsters within 120 m');
});

test('footprints: bounded, deterministic, busier cells get more', async () => {
  const { footprintSpots } = await import('../../js/client/traces.js');
  const heat = [[100, 100, 200], [300, 100, 5]];
  const a = footprintSpots(heat), b = footprintSpots(heat);
  assert.deepEqual(a, b);
  const near = (cx, cz) => a.filter(p => Math.hypot(p.x - cx, p.z - cz) < 25).length;
  assert.ok(near(100, 100) > near(300, 100));
  assert.ok(footprintSpots(Array.from({ length: 400 }, (_, i) => [i * 32, 0, 255])).length <= 2400);
});

test('skill bar: all 30 classes get six named skills with Farhold\'s unlock levels; heals go to friends', () => {
  const d = JSON.parse(readFileSync(new URL('../farhold/data/skills.json', G)));
  const classes = JSON.parse(readFileSync(new URL('../farhold/data/classes.json', G))).classes;
  assert.equal(classes.length, 30);
  for (const c of classes) {
    const bar = barFromData(d, c.id, 1);
    assert.equal(bar.length, 6, c.id);
    assert.deepEqual(bar.map(b => b.level), d.unlockAt);
    assert.ok(bar.every(b => b.name && b.slot >= 1 && b.slot <= 6));
    assert.ok(!bar[0].locked && bar[1].locked, 'level 1: first skill open, second not');
  }
  assert.equal(isAllySkill(d.skills.cleave), false);
  const healers = classes.filter(c => ['cleric', 'druid', 'bard', 'paladin'].includes(c.id)).flatMap(c => barFromData(d, c.id, 50));
  assert.ok(healers.some(b => b.ally), 'some healer skill targets friends');
});

test('skill bar: the server bar (protocol §15.10) is used as sent — ally flag, empty slots, locked from level when missing', () => {
  const bar = barFromServer([
    { slot: 1, id: 'cleave', name: 'Cleave', cd: 6000, level: 1, locked: false, ally: false },
    { slot: 2, id: 'mend', name: 'Mend', level: 3, ally: true },
    { slot: 3, id: 'rally', name: 'Rally', level: 1, ally: true, group: true },
    { slot: 4, empty: true, desc: 'Slot 4 opens at level 12', level: 12 },
  ], 2);
  assert.equal(bar.length, 4);
  assert.equal(bar[0].ally, false); assert.equal(bar[0].cd, 6000);
  assert.ok(bar[1].ally && bar[1].locked, 'level 2 < 3: locked worked out from the level');
  assert.ok(bar[2].ally && bar[2].group && !bar[2].locked);
  assert.ok(bar[3].empty && bar[3].desc.includes('level 12'));
  assert.deepEqual(barFromServer(null), []);
});

test('camera solids: a wall between focus and camera is found, an open line is clear, owners come and go', async () => {
  const { createSolids } = await import('../../js/client/solids.js');
  const S = createSolids();
  S.add('z1', [{ x: 10, z: 0, r: 2, bottom: 0, top: 8 }]);
  assert.ok(S.blockAt(10, 3, 1) && !S.blockAt(10, 9, 0) && !S.blockAt(14, 3, 0));
  const t = S.firstHit(0, 2, 0, 20, 2, 0);
  assert.ok(t > 0.35 && t < 0.42, `stops before the wall (t=${t})`);
  assert.equal(S.firstHit(0, 2, 5, 20, 2, 5), 1, 'a parallel line misses');
  assert.equal(S.firstHit(0, 12, 0, 20, 12, 0), 1, 'over the top is clear');
  S.remove('z1');
  assert.equal(S.firstHit(0, 2, 0, 20, 2, 0), 1);
});

test("E's placed content: every fort, farm, cave and hook in Torbor Downs gets something drawn, from real files", async () => {
  const { sitePlan } = await import('../../js/client/site-view.js');
  const { readdirSync } = await import('node:fs');
  const sites = JSON.parse(read('data/provinces/sites.json'));
  const hooks = new Map(JSON.parse(read('data/hooks.json')).hooks.map(h => [h.id, h]));
  const files = readdirSync(new URL('data/vignettes/placements/', G)).filter(f => /^z\d+_\d+\.json$/.test(f));
  assert.equal(files.length, 16);
  const kinds = new Set();
  let thorn = 0;
  for (const f of files) {
    const file = JSON.parse(read('data/vignettes/placements/' + f));
    for (const p of [...file.placements, ...(file.features || [])].filter(p => ['fort', 'farm', 'cave', 'hook'].includes(p.type))) {
      const plan = sitePlan([p], [], { sites, hooks });
      const n = plan.props.length + plan.parts.length + plan.buildings.length + plan.bushes.length;
      const bespokeOnly = p.type === 'hook' && !(hooks.get(p.id)?.parts || []).some(q => ['prop', 'tree', 'ground'].includes(q.kind)) && !p.pts;
      if (!bespokeOnly) assert.ok(n > 0, `${f} ${p.type} ${p.template || p.id} draws something`);
      kinds.add(p.type + ':' + (p.template || 'hook'));
      if (p.pts) thorn += plan.bushes.length;
      // everything lands near its placement (local offsets turned by yaw, not flung across the map)
      for (const q of [...plan.props, ...plan.parts]) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < (p.radius || 30) + 25, `${p.id} piece within reach`);
    }
  }
  for (const k of ['fort:watchtower_garrison', 'fort:palisade_fort', 'fort:stone_keep', 'fort:ruined_fort', 'farm:sheep', 'farm:arable', 'cave:beast_den', 'cave:barrow_mound']) assert.ok(kinds.has(k), k);
  assert.ok(thorn > 100, 'the Thorn Wall is a line of brambles');
});

test('far stand-ins: a chibi silhouette (head ~ a third of the height) in two small coloured meshes', async () => {
  const { farBodyGeometry, farHeadGeometry } = await import('../../js/client/actors.js');
  const b = farBodyGeometry(), h = farHeadGeometry();
  b.computeBoundingBox(); h.computeBoundingBox();
  const top = h.boundingBox.max.y, headH = h.boundingBox.max.y - h.boundingBox.min.y;
  assert.ok(top > 1.3 && top < 1.7, `about 1.5 m tall (${top.toFixed(2)})`);
  assert.ok(headH / top > 0.3 && headH / top < 0.6, 'chibi: a big head');
  assert.ok(b.boundingBox.min.y >= -0.01 && b.boundingBox.max.y <= h.boundingBox.min.y + 0.15, 'body under the head, feet on the ground');
  assert.ok(b.attributes.color && h.attributes.color, 'vertex colours (class tint on the tunic, skin x hair on the head)');
  assert.ok(b.attributes.position.count + h.attributes.position.count < 700, 'cheap enough for 400 instances');
});
