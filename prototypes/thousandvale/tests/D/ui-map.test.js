// Stream D-UI, play-test 1 — the pure parts of the map, minimap, markers, journal and tooltips.
//   node --test tests/D/ui-map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildMapModel, locateQuest, collectMarkers, createFog, makeView, zoomAt, rimPoint, hitTest, simplify,
  zoneKeyAt, zoneBoundsOf, compass, distText, whereText, bandText, bandTone, ZONE_M,
} from '../../js/client/ui/map-data.js';
import { rewardWords } from '../../js/client/ui/journal.js';
import { HUB_TABS } from '../../js/client/ui/party-hub.js';
import { PANEL_KEYS, SHORTCUTS } from '../../js/client/social-core.js';
import { MENU } from '../../js/client/menubar.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => { try { return JSON.parse(fs.readFileSync(ROOT + 'data/' + p, 'utf8')); } catch { return null; } };
function realModel() {
  const world = J('world/world.json'), provinceMap = J('world/province-map.json');
  const sheets = {}, zoneJsons = {}, placements = {}, quests = {};
  for (const [prov, p] of Object.entries(provinceMap.provinces)) {
    sheets[prov] = J(`provinces/${prov}.json`);
    for (const [id, wk] of Object.entries(p.map)) { zoneJsons[wk] = J(`zones/${wk}/zone.json`); placements[wk] = J(`vignettes/placements/${wk}.json`); quests[id] = J(`quests/${id}.json`); }
  }
  return buildMapModel({ world, provinceMap, sheets, zoneJsons, placements, quests, rares: J('provinces/rares.json'), events: J('quests/events.json') });
}
const M = realModel();

test('model: the whole world, every playable zone named with a level band', () => {
  assert.ok(M.worldW > 30000 && M.worldH > 20000, 'world size in metres');
  // 2026-10-14: every built province is its own continent and the rest of the world is open sea (EXPANSION-1 §1)
  const built = Object.keys(J('world/province-map.json').provinces);
  assert.deepEqual(M.provinces.map(p => p.id).sort(), [...built].sort());
  assert.ok(M.provinces.every(p => p.playable));
  const playable = [...M.zones.values()].filter(z => z.playable);
  assert.equal(playable.length, Object.values(J('world/province-map.json').provinces).reduce((n, p) => n + Object.keys(p.map).length, 0));
  assert.ok([...M.zones.values()].filter(z => !z.playable).every(z => z.land === 0), 'outside a continent is sea');
  for (const z of playable) {
    assert.ok(z.name, `${z.key} has a name`);
    assert.ok(Array.isArray(z.band) && z.band[0] <= z.band[1], `${z.key} has a level band`);
    assert.equal(zoneKeyAt(z.bounds.minX + 5, z.bounds.minZ + 5), z.key);
  }
  assert.equal(M.zones.get('z12_02').name, 'The Torbor Fields');
  assert.deepEqual(M.zones.get('z12_02').band, [1, 4]);
});

test('model: towns, dungeons, caves, forts, event arenas, waystones-free places all in world metres inside their zone', () => {
  const kinds = new Set(M.pois.map(p => p.kind));
  for (const k of ['town', 'dungeon', 'cave', 'fort', 'event', 'hamlet']) assert.ok(kinds.has(k), `has ${k}`);
  for (const p of M.pois) {
    const b = zoneBoundsOf(p.zone);
    assert.ok(p.x >= b.minX - 1 && p.x <= b.maxX + 1 && p.z >= b.minZ - 1 && p.z <= b.maxZ + 1, `${p.name} sits in ${p.zone}`);
  }
  assert.equal(M.pois.filter(p => p.kind === 'dungeon').length, [...M.zones.values()].filter(z => z.playable).length, 'one dungeon door per zone');
  const tor = M.pois.find(p => p.name === 'Torborhold');
  assert.ok(tor && tor.hub && tor.kind === 'town');
  const crypt = M.pois.find(p => p.kind === 'dungeon' && p.zone === 'z12_02');
  assert.equal(crypt.name, "The Ploughman's Crypt");
  assert.ok(M.pois.find(p => p.kind === 'event' && p.zone === 'z12_02').name.length > 3);
  // 2026-10-14: only rivers and roads that touch a continent are drawn (the rest of the old mainland is under the sea)
  assert.ok(M.rivers.length > 5 && M.roads.length > 20, 'rivers and roads');
  for (const r of [...M.rivers, ...M.roads]) assert.ok(r.pts.some(p => M.inPlayable(p[0], p[1])), `${r.id} touches a continent`);
  assert.ok(M.roads.reduce((a, r) => a + r.pts.length, 0) < 8000, 'roads are thinned for drawing');
});

test('quests: every authored step of every quest is placed on the map (exact for all but drop-from-anything steps)', () => {
  let tot = 0, exact = 0;
  for (const [id, q] of M.quests) for (let s = 0; s < q.steps.length; s++) {
    tot++;
    const L = locateQuest({ id, zone: q.zone, giver: q.giver, step: s, steps: q.steps.map(x => ({ text: x.text })) }, M);
    assert.ok(L, `${id} step ${s} located`);
    assert.ok(Number.isFinite(L.x) && Number.isFinite(L.z));
    if (L.exact) exact++;
  }
  assert.ok(tot > 100);
  assert.ok(exact / tot > 0.97, `${exact}/${tot} exact`);
  // a ready quest points at the giver; a server-sent `at` wins
  const ready = locateQuest({ id: 'wolves_at_the_fold', zone: 'z12_02', giver: 'elder_maud', ready: true, step: 1, steps: [{}] }, M);
  assert.equal(ready.name, 'Elder Maud Torbor');
  const at = locateQuest({ id: 'x', step: 0, steps: [{ at: { x: 10, z: 20, r: 5, name: 'Here' } }] }, M);
  assert.deepEqual([at.x, at.z, at.name], [10, 20, 'Here']);
  // an unknown job still lands in its zone ("somewhere in")
  const job = locateQuest({ id: 'job:none:1', zone: 'z13_02', step: 0, steps: [{ text: 'Do it' }] }, M);
  assert.equal(job.exact, false); assert.equal(job.name, M.zones.get('z13_02').name);
});

test('words: compass, distance, where, band tone', () => {
  assert.equal(compass(0, -10), 'north'); assert.equal(compass(10, 0), 'east'); assert.equal(compass(0, 10), 'south'); assert.equal(compass(-7, -7), 'north-west');
  assert.equal(distText(42), '40 m'); assert.equal(distText(850), '850 m'); assert.equal(distText(1240), '1.2 km'); assert.equal(distText(12400), '12 km');
  assert.equal(whereText({ x: 0, z: 0 }, { x: 300, z: -300 }), '420 m north-east');
  assert.equal(whereText({ x: 0, z: 0 }, { x: 3, z: 0 }), 'here');
  assert.equal(bandText([1, 4]), 'levels 1–4'); assert.equal(bandText([5, 5]), 'level 5');
  assert.equal(bandTone([1, 4], 2), 'fair'); assert.equal(bandTone([6, 8], 2), 'deadly'); assert.equal(bandTone([4, 6], 2), 'hard'); assert.equal(bandTone([1, 4], 9), 'easy');
});

test('views: toScreen/toWorld round-trip (rotated too); zoom keeps the point under the pointer; rim arrows', () => {
  for (const rot of [0, 0.7, -2.1]) {
    const v = makeView({ cx: 1000, cz: 2000, scale: 0.5, w: 300, h: 200, rot });
    const [sx, sy] = v.toScreen(1100, 1950); const [x, z] = v.toWorld(sx, sy);
    assert.ok(Math.abs(x - 1100) < 1e-6 && Math.abs(z - 1950) < 1e-6);
  }
  const v = makeView({ cx: 0, cz: 0, scale: 1, w: 200, h: 200 });
  const [wx, wz] = v.toWorld(150, 40);
  const z2 = zoomAt(v, 150, 40, 2);
  const v2 = makeView({ ...z2, w: 200, h: 200 });
  const [wx2, wz2] = v2.toWorld(150, 40);
  assert.ok(Math.abs(wx - wx2) < 1e-6 && Math.abs(wz - wz2) < 1e-6);
  const rp = rimPoint(400, 100, { cx: 100, cy: 100, r: 80 });
  assert.ok(Math.abs(rp.x - 180) < 1e-6 && Math.abs(rp.y - 100) < 1e-6 && Math.abs(rp.angle) < 1e-9);
  const rr = rimPoint(100, 900, { cx: 100, cy: 100, w: 200, h: 200, pad: 10 });
  assert.ok(Math.abs(rr.y - 190) < 1e-6);
  // rotate-with-me: facing (yaw) is drawn straight up
  const yaw = 1.1, rot = yaw - Math.PI;
  const vr = makeView({ cx: 0, cz: 0, scale: 1, w: 100, h: 100, rot });
  const [ax, ay] = vr.toScreen(Math.sin(yaw) * 10, Math.cos(yaw) * 10);
  assert.ok(Math.abs(ax - 50) < 1e-6 && ay < 50);
});

test('hit test: the higher-priority marker wins a tie; hidden ones are skipped', () => {
  const v = makeView({ cx: 0, cz: 0, scale: 1, w: 100, h: 100 });
  const ms = [{ id: 'a', x: 0, z: 0, priority: 1 }, { id: 'b', x: 2, z: 0, priority: 5 }, { id: 'c', x: 0, z: 0, priority: 9, hidden: true }];
  assert.equal(hitTest(ms, 50, 50, v)[0].id, 'b');
  assert.equal(hitTest(ms, 90, 90, v).length, 0);
});

test('fog: reveal, share of a zone, save/load round trip, merge', () => {
  const f = createFog({ w: M.worldW, h: M.worldH, cell: 128 });
  assert.equal(f.seen(25000, 5000), false);
  const n = f.reveal(25000, 5000, 260);
  assert.ok(n >= 12 && n <= 24, `revealed ${n}`);
  assert.ok(f.seen(25000, 5000) && f.seen(25200, 5000) && !f.seen(25600, 5000));
  const share = f.shareIn(zoneBoundsOf('z12_02'));
  assert.ok(share > 0 && share < 0.1);
  const g = createFog({ w: M.worldW, h: M.worldH, cell: 128 });
  assert.ok(g.load(f.save()));
  assert.equal(g.count(), f.count());
  assert.equal(g.merge([[0, 0], [1, 0]]), 2);
  assert.equal(g.load('not base64 of the right size'), false);
});

test('markers: towns always, small places only once seen, waystones known vs not, quests + events + pins + me', () => {
  const fog = createFog({ w: M.worldW, h: M.worldH, cell: 128 });
  const tor = M.pois.find(p => p.name === 'Torborhold');
  const room = { waystones: [{ key: 'w1', name: 'Torborhold', x: tor.x, z: tor.z }, { key: 'w2', name: 'Far Stone', x: tor.x + 1500, z: tor.z }] };
  let ms = collectMarkers({ model: M, room, known: new Set(['w1']), fog, me: { x: tor.x, z: tor.z } });
  assert.ok(ms.some(m => m.kind === 'town' && m.name === 'Torborhold'));
  assert.ok(!ms.some(m => m.kind === 'farm'), 'unseen farms are hidden');
  assert.ok(ms.find(m => m.id === 'ws:w1').act === 'travel');
  assert.ok(!ms.some(m => m.id === 'ws:w2'), 'an untouched waystone far away is hidden');
  fog.reveal(tor.x, tor.z, 600);
  ms = collectMarkers({ model: M, room, known: new Set(['w1']), fog, quests: [{ id: 'q1', name: 'Q', loc: { x: 1, z: 2, r: 30, exact: true }, goal: 'Do it' }], tracked: 'q1',
    events: [{ uid: 'e', name: 'Ev', x: 5, z: 5, free: true }], pins: [{ id: 'p', x: 3, z: 3 }], me: { x: tor.x, z: tor.z } });
  assert.ok(ms.some(m => m.kind === 'farm'), 'seen farms show');
  const q = ms.find(m => m.id === 'q:q1'); assert.ok(q.tracked && q.act === 'track');
  assert.equal(ms.find(m => m.kind === 'liveevent').act, 'event');
  assert.equal(ms.find(m => m.kind === 'pin').act, 'unpin');
  assert.ok(ms.find(m => m.kind === 'me'));
});

test('simplify keeps the ends and the corners', () => {
  const pts = [[0, 0], [1, 0.01], [2, 0], [3, 0], [3, 5], [3, 10]];
  const s = simplify(pts, 0.5);
  assert.deepEqual(s, [[0, 0], [3, 0], [3, 10]]);
});

test('journal: reward words', () => {
  assert.deepEqual(rewardWords({ xp: 0.35, gold: 9, item: 'uncommon' }), ['35% of a level in experience', '9 gold', 'an uncommon item']);
  assert.deepEqual(rewardWords(null), []);
});

test('windows: M = map, J = journal, mail + Group Finder are Party-menu tabs; every hotkey is in the help and on the menu bar', () => {
  assert.equal(PANEL_KEYS.KeyM, 'map');
  assert.equal(PANEL_KEYS.KeyJ, 'journal');
  assert.ok(!Object.values(PANEL_KEYS).includes('mail') && !Object.values(PANEL_KEYS).includes('callboard'));
  assert.deepEqual(HUB_TABS.map(t => t.id), ['party', 'friends', 'guild', 'mail', 'callboard']);
  assert.equal(HUB_TABS.find(t => t.id === 'callboard').label, 'Group Finder');
  const listed = SHORTCUTS.flatMap(g => g.keys.map(k => k[0]));
  for (const code of Object.keys(PANEL_KEYS)) assert.ok(listed.includes(code.replace('Key', '')), `${code} in the help`);
  for (const id of ['map', 'journal', 'skills', 'perks', 'party', 'bag']) assert.ok(MENU.some(m => m.id === id), `${id} on the menu bar`);
  assert.ok(!MENU.some(m => ['mail', 'friends', 'guild', 'callboard'].includes(m.id)), 'social windows moved into the Party menu');
});

test('P5: no native title tooltips in the client (source scan)', () => {
  const files = [ROOT + 'index.html', ...fs.readdirSync(ROOT + 'js/client').filter(f => f.endsWith('.js')).map(f => ROOT + 'js/client/' + f),
    ...fs.readdirSync(ROOT + 'js/client/ui').filter(f => f.endsWith('.js')).map(f => ROOT + 'js/client/ui/' + f)];
  const bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (/\stitle="|\.title\s*=[^=]|setAttribute\(\s*'title'/.test(code)) bad.push(`${f.replace(ROOT, '')}:${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(bad, []);
});
