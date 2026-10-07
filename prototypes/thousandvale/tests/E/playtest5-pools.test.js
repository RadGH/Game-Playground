// Stream E — play-test 5 T25 Angling: fish pools on stream B's baked water, the anglers, the first quest, the shop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';
import { startLine } from '../../tools/content-rares.mjs';
import { ANGLER, POOL } from '../../tools/content-pools.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const AP = J('data/provinces/angling-pools.json'), ANG = J('data/provinces/angling.json'), SHEET = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const off = wid => ({ ox: +wid.slice(1, 3) * 2048, oz: +wid.slice(4, 6) * 2048 });
const bake = {};
const B = wid => (bake[wid] ||= { t: parseTerrain(readFileSync(new URL(`data/zones/${wid}/terrain.bin`, root))), nav: parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, root))) });
const pools = Object.entries(AP.zones).flatMap(([wid, l]) => l.map(p => ({ ...p, wid })));

test('T25 pools: every pool is IN the water with a bank you can stand on a cast away, inside its own zone', () => {
  assert.ok(pools.length >= 200, 'pools: ' + pools.length);
  assert.equal(new Set(pools.map(p => p.id)).size, pools.length, 'pool ids are unique');
  const bad = [];
  for (const p of pools) {
    const { t, nav } = B(p.wid), o = off(p.wid), x = p.x - o.ox, z = p.z - o.oz, sx = p.shore.x - o.ox, sz = p.shore.z - o.oz;
    if (x < 0 || z < 0 || x > 2048 || z > 2048) bad.push(p.id + ': outside its zone');
    if (!(t.waterAt(x, z).depth > 0.15)) bad.push(p.id + ': not in water');
    const d = Math.hypot(sx - x, sz - z);
    if (d < 2 || d > POOL.shore[1] + 2) bad.push(`${p.id}: bank ${d.toFixed(1)} m away`);
    if (!nav.passable(sx, sz) || (nav.at(sx, sz) & (NAV.BUILDING | NAV.STEEP))) bad.push(p.id + ': the bank is not walkable');
    if (t.waterAt(sx, sz).depth > POOL.wade + 0.05) bad.push(p.id + ': the bank is under water');
    if (!['river', 'lake', 'marsh', 'coast'].includes(p.water)) bad.push(p.id + ': water ' + p.water);
    if (![1, 2, 3].includes(p.tier)) bad.push(p.id + ': tier');
  }
  assert.deepEqual(bad, []);
});

test('T25 pools: every zone with water has pools a beginner may fish, more spots than are open at once, and a full catch table', () => {
  for (const [eid, wid] of Object.entries(MAP)) {
    const l = AP.zones[wid], m = AP.meta[wid], zs = SHEET.zones[eid];
    if (!l.length) { assert.equal(eid, 'blackthorn_scar', eid + ' has no pools'); continue; }       // the Scar has no water at all
    assert.ok(l.length >= 6, `${eid}: ${l.length} pools`);
    assert.ok(l.some(p => p.tier === 1), `${eid}: no tier-1 pool`);
    assert.ok(m.live >= 2 && m.live <= l.length, `${eid}: live ${m.live} of ${l.length}`);      // owner feedback 7 V3: most spots are open at once now
    for (const w of new Set(l.map(p => p.water))) {
      const fish = ANG.fish.filter(f => f.water.includes(w) && f.bands[0] <= zs.band[1] && f.bands[1] >= zs.band[0]);
      assert.ok(fish.filter(f => f.skill <= 10).length >= 3, `${eid} ${w}: a beginner's table has ${fish.filter(f => f.skill <= 10).length} fish`);
      assert.ok(fish.length >= 6, `${eid} ${w}: ${fish.length} fish in all`);
    }
  }
});

test('T25 pools: each zone\'s legend has water of its kind to be caught in (the dry Scar\'s swims in a neighbour)', () => {
  for (const g of ANG.legends) {
    const wid = MAP[g.foundIn || g.zone];
    assert.ok(AP.zones[wid].some(p => p.water === g.water), `${g.id}: no ${g.water} pool in ${g.foundIn || g.zone}`);
  }
  assert.equal(ANG.legends.filter(g => g.foundIn).length, 1);
});

test('T25: a walking newcomer SEES a pool early — roadside pools in the starting zone, and one beside the start chain\'s walk', () => {
  const l = AP.zones.z12_02;
  assert.ok(l.filter(p => p.road <= POOL.roadside).length >= 5, 'roadside pools in the Torbor Fields');
  const line = startLine();
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0; return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)); };
  const seen = pools.filter(p => line.some((b, i) => i && segDist(p, line[i - 1], b) <= 60));
  assert.ok(seen.length >= 2, 'pools within 60 m of the first walk: ' + seen.length);
});

test('T25: an angler in every hub town, on walkable ground, as an NPC the server spawns; Tam stands by the water at Torborhold', () => {
  assert.equal(AP.anglers.length, ANG.anglers.length);
  for (const a of AP.anglers) {
    const { nav } = B(a.zone), o = off(a.zone);
    assert.ok(nav.passable(a.x - o.ox, a.z - o.oz) && !(nav.at(a.x - o.ox, a.z - o.oz) & NAV.BUILDING), a.id + ': not standing on open ground');
    const rec = J(`data/vignettes/placements/${a.zone}.quest.json`).placements.find(p => p.type === 'npc' && p.id === a.id);
    assert.ok(rec && rec.role === 'angler' && rec.x === a.x - o.ox && rec.z === a.z - o.oz, a.id + ': not in the zone\'s .quest.json (run tools/content-hunts.mjs)');
    const def = J(`data/quests/${a.sheet === 'test' ? 'angling' : a.sheet}.json`).npcs[a.id];
    assert.ok(def && def.role === 'angler' && def.greeting && def.placedBy, a.id + ': no npc entry in its zone\'s quest file');
  }
  const tam = AP.anglers.find(a => a.id === 'angler_torborhold');
  assert.ok(tam.byWater && tam.fromTown <= 120, `Tam is ${tam.fromTown} m from the middle of Torborhold`);
  const start = AP.zones.z12_02.filter(p => p.start);
  assert.equal(start.length, 1);
  assert.ok(start[0].always && start[0].tier === 1);
  const d = Math.hypot(start[0].shore.x - tam.x, start[0].shore.z - tam.z);
  assert.ok(d <= ANGLER.startPool && d >= 2, `the first pool is ${Math.round(d)} m from Tam`);      // V3: Tam stands beside the town pool
});

test('T25: the first quest hands over the rod, walks you to the start pool, counts three catches; the chain goes on to cooking and a legend', () => {
  const Q = J('data/quests/angling.json'), by = Object.fromEntries(Q.quests.map(q => [q.id, q]));
  assert.ok(J('data/quests/test.json').include.includes('angling.json'));
  const first = by.angle_first_cast, start = AP.zones.z12_02.find(p => p.start);
  assert.equal(first.giver, 'angler_torborhold');
  assert.equal(ANG.anglers.find(a => a.id === 'angler_torborhold').quest, 'angle_first_cast');
  assert.deepEqual(first.grant, [{ good: 'angling_rod', count: 1 }]);
  assert.deepEqual(first.steps.map(s => s.kind), ['visit', 'catch', 'talk']);
  assert.deepEqual([first.steps[0].at.x, first.steps[0].at.z], [start.shore.x, start.shore.z]);
  assert.ok(first.steps[1].pool && first.steps[1].count === 3 && first.level === 1);
  // the chain: every `next` resolves, catch steps name real fish, there is a cook step, every step has text + where + a map mark
  const marks = J('data/quests/marks/torbor_downs.json');
  let cook = 0;
  for (const q of Q.quests) {
    if (q.next) assert.ok(by[q.next], q.id + ' -> ' + q.next);
    assert.ok(marks.quests[q.id] && marks.quests[q.id].giver, q.id + ': no marks');
    q.steps.forEach((s, i) => {
      assert.ok(s.text && s.where, `${q.id}#${i}: text / where`);
      assert.ok(marks.quests[q.id].steps[i], `${q.id}#${i}: no map mark`);
      if (s.fish) assert.ok(ANG.fish.some(f => f.id === s.fish), `${q.id}: fish ${s.fish}`);
      if (s.kind === 'cook') cook++;
    });
    for (const g of [...(q.grant || []).map(x => x.good), ...((q.reward.goods || []).map(x => x.id))]) assert.ok(J('data/provinces/shops.json').goodsCatalog[g], `${q.id}: good ${g}`);
  }
  assert.ok(cook >= 1);
});

test('T25: the angler is a shop — every rod and bait is a good with a price, and the role opens it', () => {
  const S = J('data/provinces/shops.json'), k = S.kinds.angler;
  assert.equal(k.role, 'angler');
  assert.ok(S.roles.angler && S.roles.angler.kind === 'angler' && S.roles.angler.goods.length === k.goods.length, 'run tools/content-shops.mjs');
  for (const t of [...ANG.tools, ...ANG.bait]) {
    const g = k.goods.find(x => x.id === t.id);
    assert.ok(g && g.source === 'good' && g.price === t.price, t.id + ': not on the angler\'s shelf at its price');
    assert.ok(S.goodsCatalog[t.id] && S.goodsCatalog[t.id].name === t.name && S.goodsCatalog[t.id].use, t.id + ': not in goodsCatalog');
  }
  assert.equal(S.goodsCatalog.angling_rod.use.type, 'rod');
});

test('T25: the pool file is what tools/content-pools.mjs makes from the bake', () => {
  execFileSync(process.execPath, [new URL('tools/content-pools.mjs', root).pathname, '--check'], { stdio: 'pipe' });
});
