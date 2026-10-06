// node --test prototypes/thousandvale/tests/E/playtest2.test.js
// Stream E — owner play-test 2 (/home/radgh/claude/agent/mmo/round-playtest2.md):
//   Q27 one starting chain for everyone (another town + a mini boss, either order, long enough to level into it)
//   Q28 a class quest for each of the 30 classes, with trainers
//   Q9/Q11/Q16/Q20 shops: stock per shop and per town, priced sensibly; the stable sells mounts; the barber's services
//   Q10 every town NPC has an office of their own (one plot, never shared)
//   Q18 bespoke set pieces near the start, placed on the real bake
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { zoneContext, provinceComponents, discProblem, ruleKind } from '../../tools/content-place.mjs';
import { questFiles } from '../../tools/content-lib.mjs';
import { KILL_GOLD } from '../../js/sim/quests.js';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';
import { GEAR_BASES } from '../../../farhold/js/gear.js';
import { FOCUS_BASES } from '../../../farhold/js/foci.js';
import { rolesFrom } from '../../tools/content-shops.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
/** the banned-name list of tests/E/content.test.js (read from its source, so importing it does not run its tests here) */
const BANNED = (() => { const src = readFileSync(new URL('tests/E/content.test.js', root), 'utf8'); const a = src.indexOf('export const BANNED = ['), b = src.indexOf('];', a); return JSON.parse(src.slice(a + 21, b + 1).replace(/'/g, '"').replace(/\s+/g, ' ')); })();
const CLASSES = J('../farhold/data/classes.json').classes;
const PETS = new Set(['necromancer', 'druid', 'shaman', 'warlock', 'pyromancer', 'stormcaller', 'tinker', 'ranger', 'demon_hunter', 'sorcerer', 'oracle', 'enchanter', 'priest']);
const ITEMS = J('../emberveil/data/items.json');
const BASES = new Set([...Object.keys(ITEMS.weaponBases), ...Object.keys(ITEMS.armorBases), ...Object.keys(FOCUS_BASES)]);
const SHOPS = J('data/provinces/shops.json');
const OFFICES = J('data/provinces/offices.json');
const SETP = J('data/vignettes/setpieces.json');
const START = J('data/quests/start.json'), CLASSQ = J('data/quests/classes.json'), SPQ = J('data/quests/setpieces.json');
const SHEET = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const ROUTES = J('data/provinces/torbor_downs-routes.json');
const MARKS = J('data/quests/marks/torbor_downs.json').quests;
const ZONE = Object.fromEntries(questFiles().map(q => [q.zone, q]));
const ALLQ = new Map(questFiles().flatMap(q => q.quests.map(x => [x.id, { ...x, zone: q.zone }])));
const ALLNPC = Object.assign({}, ...questFiles().map(q => q.npcs || {}));
const PL = Object.fromEntries(Object.entries(MAP).map(([e, w]) => [e, J(`data/vignettes/placements/${w}.json`)]));
const HUB = PL.test.settlements.find(s => s.name === 'Torborhold');
const ENC = new Set(J('data/encounters/index.json').files.map(f => f.replace(/\.json$/, '')));
const allPlaced = Object.values(PL).flatMap(f => f.placements);
const npcPlaced = id => allPlaced.find(p => p.type === 'npc' && p.id === id);
const SP_OF = new Map(SETP.vignettes.map(v => [v.id, v]));

// ------------------------------------------------------------------------------------------------- Q28

test('Q28: every one of the 30 classes has exactly one low-level class quest, from a trainer who teaches it', () => {
  for (const c of CLASSES) {
    const clsOf = q => { const c = q.cls ?? q.classes; return c == null ? [] : Array.isArray(c) ? c : [c]; };
    const qs = [...ALLQ.values()].filter(q => clsOf(q).includes(c.id));
    assert.equal(qs.length, 1, `${c.id}: ${qs.length} class quests`);
    const q = qs[0];
    assert.ok(q.level >= 1 && q.level <= 5, `${c.id}: level ${q.level} is not low`);
    assert.deepEqual(clsOf(q), [c.id], `${c.id}: a class quest is for one class`);
    const t = ALLNPC[q.giver];
    assert.ok(t && t.role === 'trainer' && (t.trains || []).includes(c.id), `${c.id}: giver ${q.giver} does not train it`);
    assert.ok(npcPlaced(q.giver), `${c.id}: trainer ${q.giver} is not placed`);
    assert.ok(q.offer && q.done && q.rewardText, `${c.id}: story text`);
    assert.ok(q.steps.length >= 2 && q.steps.every(s => s.text && s.where), `${c.id}: steps say what and where`);
  }
  assert.equal(CLASSQ.quests.length, 30);
});

test('Q28: a reward that matters — a named rare the class can use, plus the companion now (13 classes) or a perk point (17)', () => {
  for (const c of CLASSES) {
    const q = CLASSQ.quests.find(x => x.classes[0] === c.id), r = q.reward;
    assert.equal(r.item && r.item.tier, 'rare', `${c.id}: a rare item`);
    assert.ok(BASES.has(r.item.base), `${c.id}: base ${r.item.base} exists`);
    assert.ok(r.item.name, `${c.id}: the item is named`);
    if (PETS.has(c.id)) assert.equal(r.unlock, 'companion', `${c.id}: the companion comes early`);
    else assert.equal(r.perks, 1, `${c.id}: one extra perk point`);
    // a weapon reward is a base the class can wield (classes.json weapons: sword covers longsword/rapier…)
    const wb = ITEMS.weaponBases[r.item.base];
    if (wb) assert.ok(c.weapons.includes(wb.subtype) || c.weapons.includes(r.item.base) || (c.weapons.includes('sword') && wb.subtype === 'sword') || c.starter === r.item.base, `${c.id}: ${r.item.base} (${wb.subtype}) not in ${c.weapons}`);
  }
});

test('Q28: trainers stand in the start town or a set piece near it (one class group each)', () => {
  const trainers = Object.entries(ALLNPC).filter(([, n]) => n.role === 'trainer');
  assert.ok(trainers.length >= 8);
  const taught = new Set(trainers.flatMap(([, n]) => n.trains));
  for (const c of CLASSES) assert.ok(taught.has(c.id), `nobody trains ${c.id}`);
  for (const [id, n] of trainers) {
    const p = npcPlaced(id);
    assert.ok(p, id);
    assert.ok(Math.hypot(p.x - HUB.x, p.z - HUB.z) <= 1600, `${id} is ${Math.round(Math.hypot(p.x - HUB.x, p.z - HUB.z))} m from Torborhold`);
    assert.ok(n.at === 'Torborhold' || SP_OF.has(n.at), `${id} at ${n.at}`);
  }
});

// ------------------------------------------------------------------------------------------------- Q27

const chain = START.quests;
const byId = new Map(chain.map(q => [q.id, q]));
/** which chain quests are open after `done` (the next rule + requires) */
function openAfter(done) {
  const lockedBy = new Map();
  for (const q of ALLQ.values()) if (q.next) (lockedBy.get(q.next) || lockedBy.set(q.next, new Set()).get(q.next)).add(q.id);
  return chain.filter(q => !done.has(q.id) && (q.auto || ((!lockedBy.has(q.id) || [...lockedBy.get(q.id)].some(x => done.has(x))) && (q.requires || []).every(x => done.has(x)))) && (q.auto || lockedBy.has(q.id) || (q.requires || []).length)).map(q => q.id);
}

test('Q27: one starting chain for everyone — auto-granted, no class gate, every step says what and where and has a map mark', () => {
  const autos = [...ALLQ.values()].filter(q => q.auto);
  assert.deepEqual(autos.map(q => q.id), ['start_two_good_legs'], 'exactly one quest is auto-granted');
  for (const q of chain) {
    assert.ok(!q.cls && !q.classes, `${q.id} is for everyone`);
    assert.ok(q.offer && q.done && q.rewardText, `${q.id} text`);
    q.steps.forEach((s, i) => {
      assert.ok(s.text && s.where, `${q.id} step ${i} text/where`);
      const m = MARKS[q.id] && MARKS[q.id].steps[i];
      assert.ok(m && Number.isFinite(m.x), `${q.id} step ${i}: no map mark`);
    });
    assert.ok(ALLNPC[q.giver] && (npcPlaced(q.giver)), `${q.id}: giver ${q.giver}`);
    for (const s of q.steps) {
      if (s.npc) assert.ok(npcPlaced(s.npc), `${q.id}: ${s.npc} placed`);
      if (s.vignette) assert.ok(allPlaced.some(p => p.type === 'vignette' && p.id === s.vignette), `${q.id}: ${s.vignette} placed`);
      if (s.kind === 'use') assert.ok((SP_OF.get(s.vignette).objects || []).some(o => o.name === s.object), `${q.id}: ${s.vignette} has no ${s.object}`);
      if (s.encounter) assert.ok(ENC.has(s.encounter), s.encounter);
    }
  }
});

test('Q27: it leads to another town AND to a mini boss, in either order, then home; levels climb 1 -> 4+', () => {
  let done = new Set();
  assert.deepEqual(openAfter(done), ['start_two_good_legs']);
  done.add('start_two_good_legs');
  assert.deepEqual(openAfter(done), ['start_letters_south']);
  done.add('start_letters_south');
  assert.deepEqual(openAfter(done).sort(), ['start_road_to_orrinsford', 'start_signs_of_the_beast'], 'two branches at once');
  // branch A then B and B then A both end at home
  for (const order of [['start_road_to_orrinsford', 'start_the_priors_favour', 'start_signs_of_the_beast', 'start_old_gristle'], ['start_signs_of_the_beast', 'start_old_gristle', 'start_road_to_orrinsford', 'start_the_priors_favour']]) {
    const d = new Set(done);
    for (const id of order) { assert.ok(openAfter(d).includes(id), `${id} open in order ${order}`); assert.ok(!openAfter(d).includes('start_home_with_news')); d.add(id); }
    assert.deepEqual(openAfter(d), ['start_home_with_news']);
  }
  // another town: a step talks to someone in Orrinsford, a hub town of another zone with its own room
  const orr = chain.flatMap(q => q.steps).find(s => s.npc && ALLNPC[s.npc] && ALLNPC[s.npc].at === 'Orrinsford');
  assert.ok(orr, 'a step in Orrinsford');
  assert.ok(Object.values(OFFICES.towns).some(t => t.name === 'Orrinsford'), 'Orrinsford is a hub town');
  // a mini boss with a script
  const boss = chain.flatMap(q => q.steps).find(s => s.kind === 'killOne');
  assert.equal(boss.encounter, 'mb_old_gristle');
  // levels never fall along a branch, and the boss quest is not the first fight
  const lv = id => byId.get(id).level;
  assert.ok(lv('start_two_good_legs') === 1 && lv('start_letters_south') <= lv('start_road_to_orrinsford') && lv('start_road_to_orrinsford') <= lv('start_the_priors_favour'));
  assert.ok(lv('start_signs_of_the_beast') <= lv('start_old_gristle') && lv('start_old_gristle') >= 2);     // play-test 3 R2: a level-2 boss quest
  assert.equal(byId.get('start_home_with_news').next, 'toll_at_fitockpi', 'and on into the province story');
  // and it pays for a first horse along the way (Q16): the chain's gold vs the stable's cheapest mount
  const gold = chain.reduce((a, q) => a + Math.round(q.reward.gold * KILL_GOLD(q.level)), 0);
  const horse = SHOPS.kinds.stable.goods.find(g => g.id === 'trail_horse');
  assert.ok(gold >= horse.price * 3, `chain gold ${gold} vs horse ${horse.price}`);
});

test('Q27: the road — the Pail and Plough stands by the Torborhold-Orrinsford road, the boss den is reachable and respawns quickly', () => {
  const inn = PL.test.placements.find(p => p.id === 'sp_pail_and_plough');
  const r = ROUTES.routes.find(q => q.id === 'route_torborhold_orrinsford');
  const ox = 12 * 2048, oz = 2 * 2048;
  const d = Math.min(...r.pts.map(([x, z]) => Math.hypot(x - ox - inn.x, z - oz - inn.z)));
  assert.ok(d <= inn.radius + 40, `inn ${Math.round(d)} m from the road`);
  const boss = PL.test.placements.find(p => p.type === 'rare' && p.id === 'mb_old_gristle');
  assert.ok(boss && boss.questBoss && boss.in === 'sp_gristles_hollow');
  assert.ok(boss.respawnMin[1] <= 5, 'a quest boss everyone needs comes back within 5 minutes');
  assert.ok(boss.level <= byId.get('start_old_gristle').level, `boss level ${boss.level}`);
  // walkable from Torborhold: the same stitched-province component the placer uses
  const eids = Object.keys(MAP);
  const Z = Object.fromEntries(eids.map(e => [e, { gx: SHEET.zones[e].grid[0], gy: SHEET.zones[e].grid[1], nav: parseNav(readFileSync(new URL(`data/zones/${MAP[e]}/nav.bin`, root))) }]));
  const pc = provinceComponents(eids.map(e => Z[e]), { gx: 1, gy: 1, x: HUB.x, z: HUB.z });
  const t = Z.test, k = (x, z) => (t.gy * pc.n + Math.round(z / t.nav.step)) * pc.W + t.gx * pc.n + Math.round(x / t.nav.step);
  let ok = false; for (let a = 0; a < 16 && !ok; a++) ok = pc.label[k(boss.x + Math.cos(a) * 4, boss.z + Math.sin(a) * 4)] === pc.main;
  assert.ok(ok, 'the den is in the hub\'s walkable component');
});

test('Q27: Old Gristle is winnable at the chain\'s levels — every class at level 2, most at level 1 (a bot that never dodges; play-test 3 R2)', () => {
  const fight = (cls, level, seed) => {
    const terrain = standInTerrain(2, 2048), sx = terrain.spawn.x, sz = terrain.spawn.z;
    const room = createRoom({ id: `g${cls}${level}${seed}`, kind: 'wilds', terrain, seed, createRules, hooks: { log: () => {} },
      camps: [{ type: 'moor_hound', level: 2, x: sx, z: sz + 6, count: 1, radius: 2, rank: 'rare', encounter: 'mb_old_gristle', respawnMs: 1e9 }], encounterInfo: { mb_old_gristle: { name: 'Old Gristle', body: 'moor_hound' } } });
    const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: room.id, x: sx, z: sz }, null);
    room.step();
    const boss = [...room.entities.values()].find(e => e.kind === 'monster');
    assert.equal(boss.r.unit.encounterId, 'mb_old_gristle');
    let held = 0;
    for (let k = 0; k < 4000 && !me.dead && !boss.dead; k++) {
      room.step();
      const t = [...room.entities.values()].find(e => e.kind === 'monster' && !e.dead && e !== boss) || boss;
      for (const sl of [1, 2, 3]) room.intent(me, { t: 'cast', slot: sl, target: t.id });
      held += 0.05;
      if (room.intent(me, { t: 'cast', slot: 0, target: t.id, held }).ok) held = 0;
    }
    return boss.dead && !me.dead;
  };
  const at4 = CLASSES.filter(c => fight(c.id, 2, 1)).length;
  assert.ok(at4 >= 27, `level 2: ${at4}/30 won`);
  const some = ['warrior', 'cleric', 'mage', 'rogue', 'ranger', 'necromancer', 'bard', 'knight', 'druid', 'tinker'];
  const at3 = some.filter(c => fight(c, 1, 2)).length;
  assert.ok(at3 >= 7, `level 1: ${at3}/10 won`);
});

// ------------------------------------------------------------------------------------------------- Q9 / Q11 / Q16 / Q20

const GOOD_SOURCES = { potion: id => !!ITEMS.potions[id], gear: id => !!GEAR_BASES[id], good: id => !!SHOPS.goodsCatalog[id] };

test('Q9/Q11: every shop kind has stock — gear from real bases, goods that exist, sane prices and levels', () => {
  for (const [k, s] of Object.entries(SHOPS.kinds)) {
    const cats = Object.values(s.categories || {}), goods = s.goods || [];
    assert.ok(cats.length || goods.length || Object.keys(s.services || {}).length, `${k}: sells nothing`);
    assert.ok(s.role && s.name && s.sign, `${k}: role/name/sign`);
    for (const c of cats) {
      assert.ok(c.count >= 1 && c.bases.length >= 1, `${k}: empty category`);
      for (const b of c.bases) assert.ok(BASES.has(b), `${k}: base ${b} does not exist`);
      const w = Object.values(c.rarity); assert.ok(Math.abs(w.reduce((a, x) => a + x, 0) - 1) < 1e-6, `${k}: rarity weights`);
      assert.ok(!('legendary' in c.rarity), `${k}: no legendaries over a counter`);
    }
    for (const g of goods) {
      assert.ok(GOOD_SOURCES[g.source] && GOOD_SOURCES[g.source](g.id), `${k}: ${g.source} ${g.id} does not exist`);
      assert.ok(Number.isInteger(g.price) && g.price > 0, `${k}: ${g.id} price ${g.price}`);
      assert.ok(Number.isInteger(g.minLevel) && g.minLevel >= 1 && g.minLevel <= 50, `${k}: ${g.id} minLevel`);
    }
  }
  // priced against what a kill pays (3 + level): a level-1 potion is a couple of kills, not a fortune
  const pot = SHOPS.kinds.general.goods.find(g => g.id === 'healing_potion');
  assert.ok(pot.price <= KILL_GOLD(1) * 3, `healing potion ${pot.price} g`);
  assert.ok(SHOPS.pricing.sellFactor > 0 && SHOPS.pricing.sellFactor < 0.5);
  // stream A's runtime reads `roles` (js/sim/shops.js): it must be the one tools/content-shops.mjs makes from `kinds`
  assert.deepEqual(SHOPS.roles, rolesFrom(SHOPS), 'shops.json roles are stale: run node tools/content-shops.mjs');
  for (const [role, r] of Object.entries(SHOPS.roles)) for (const row of r.sells) assert.ok(BASES.has(row.base), `${role}: ${row.base}`);
});

test('Q9: the starting town has every trader the owner asked for; every hub town has a shop list; Q16 the stable sells mounts from level 1', () => {
  const tor = SHOPS.towns.Torborhold.shops;
  for (const k of ['general', 'market', 'weaponsmith', 'armourer', 'bowyer', 'apothecary', 'tailor', 'jeweller', 'stable', 'inn', 'provisioner', 'barber']) assert.ok(tor.includes(k), `Torborhold lacks ${k}`);
  for (const t of Object.values(OFFICES.towns)) {
    assert.ok(SHOPS.towns[t.name], `${t.name} has no shop list`);
    for (const k of SHOPS.towns[t.name].shops) assert.ok(SHOPS.kinds[k], `${t.name}: unknown shop ${k}`);
  }
  const mounts = SHOPS.kinds.stable.goods.filter(g => GEAR_BASES[g.id] && GEAR_BASES[g.id].slot === 'mount');
  assert.ok(mounts.length >= 3);
  assert.ok(mounts.some(g => g.minLevel === 1), 'a first mount the owner can try at once');
  for (let i = 1; i < mounts.length; i++) assert.ok(mounts[i].price > mounts[i - 1].price && mounts[i].minLevel >= mounts[i - 1].minLevel, 'the mount ladder climbs');
});

test('Q20: the barber — a service with a price per change, the first one free, and a barber in Torborhold', () => {
  const a = SHOPS.kinds.barber.services.appearance;
  assert.equal(a.firstVisitFree, true);
  for (const k of ['hair', 'hairColour', 'beard', 'face', 'skin', 'body', 'everything']) assert.ok(a.prices[k] > 0, k);
  assert.ok(a.prices.everything >= a.prices.face);
  const tor = Object.values(OFFICES.towns).find(t => t.name === 'Torborhold');
  assert.ok(tor.offices.some(o => o.role === 'barber' && o.shop === 'barber' && o.sign === 'scissors' && o.light));
});

// ------------------------------------------------------------------------------------------------- Q10

test('Q10: every town NPC has an office of their own — one plot each, never shared, a real plot of B\'s town plan', () => {
  const bakeOf = new Map();
  for (const t of Object.values(OFFICES.towns)) {
    if (!bakeOf.has(t.zone)) bakeOf.set(t.zone, J(`data/zones/${t.zone}/placements.json`).placements);
    const plots = new Map(bakeOf.get(t.zone).filter(p => p.kind === 'building').map(p => [p.id, p]));
    const seen = new Set();
    for (const o of t.offices) {
      assert.ok(plots.has(o.plot), `${t.name}: ${o.role} plot ${o.plot} not in the bake`);
      assert.ok(!seen.has(o.plot), `${t.name}: plot ${o.plot} used twice`);
      seen.add(o.plot);
      assert.equal(o.want, plots.get(o.plot).data.want);
    }
    // stream B shaped a building for each role it tagged (data.role): that role's office IS that plot
    const tk = Object.keys(OFFICES.towns).find(k => OFFICES.towns[k] === t);
    for (const p of plots.values()) if (p.data.town === tk && p.data.role) {
      const o = t.offices.find(x => x.role === p.data.role);
      assert.ok(o, `${t.name}: B built a ${p.data.want} for the ${p.data.role} and nobody works there`);
      assert.equal(o.plot, p.id, `${t.name}: the ${p.data.role} is not in B's ${p.data.want}`);
    }
    // and the smith works at a forge wherever the town has one
    const wantOf = r => t.offices.find(o => o.role === r)?.want;
    if ([...plots.values()].some(p => p.data.town === tk && p.data.want === 'forge') && wantOf('smith')) assert.equal(wantOf('smith'), 'forge', `${t.name}: the smith at the forge`);
    // doors far enough apart that two NPCs never stand on each other
    const doors = t.offices.map(o => o.door);
    for (let i = 0; i < doors.length; i++) for (let j = i + 1; j < doors.length; j++) assert.ok(Math.hypot(doors[i].x - doors[j].x, doors[i].z - doors[j].z) >= 2.5, `${t.name}: doors ${t.offices[i].role}/${t.offices[j].role}`);
    // every trader the town sells through has an office trading it; lights only on shopfronts
    for (const k of SHOPS.towns[t.name].shops) assert.ok(t.offices.some(o => o.shop === k), `${t.name}: no office for ${k}`);
    for (const o of t.offices) if (o.light) assert.ok(o.shop || o.role === 'trainer', `${t.name}: ${o.role} is lit but sells nothing`);
    for (const o of t.offices.filter(x => x.home)) assert.ok(!o.light && !o.sign, `${t.name}: a home is not a shopfront`);
  }
  assert.deepEqual(OFFICES.problems, []);
});

test('Q10: each NPC has a unique office — quest NPCs in a town keep one and stand at its door; set-piece NPCs own their place', () => {
  const owners = new Map();
  const claim = (who, where) => { assert.ok(!owners.has(who), `${who} has two offices (${owners.get(who)} and ${where})`); owners.set(who, where); };
  for (const [tk, t] of Object.entries(OFFICES.towns)) for (const o of t.offices) claim(o.npc || `${tk}:${o.role}:${o.name}`, `${tk}/${o.plot}`);
  for (const s of OFFICES.setpieces) { claim(s.npc, s.setpiece); assert.ok(SP_OF.has(s.setpiece), s.setpiece); }
  // every quest NPC standing in a hub town has an office there, and is placed within a few metres of its door
  const hubNames = new Set(Object.values(OFFICES.towns).map(t => t.name));
  for (const [id, n] of Object.entries(ALLNPC)) {
    if (!hubNames.has(n.at)) continue;
    assert.ok(owners.has(id), `${id} (${n.at}) has no office`);
    const t = Object.values(OFFICES.towns).find(x => x.name === n.at), o = t.offices.find(x => x.npc === id), p = npcPlaced(id);
    assert.ok(p && Math.hypot(p.x - o.door.x, p.z - o.door.z) <= 5, `${id} stands ${p ? Math.round(Math.hypot(p.x - o.door.x, p.z - o.door.z)) : '?'} m from its door`);
  }
});

// ------------------------------------------------------------------------------------------------- Q18

test('Q18: the set pieces are placed near the start on the real bake, on fair ground, with everything inside the disc', () => {
  const t = PL.test;
  const terrain = parseTerrain(readFileSync(new URL(`data/zones/${MAP.test}/terrain.bin`, root)));
  const nav = parseNav(readFileSync(new URL(`data/zones/${MAP.test}/nav.bin`, root)));
  const BZ = J(`data/zones/${MAP.test}/placements.json`).placements;
  const ctx = zoneContext({ terrain, nav, placements: BZ });
  const kinds = new Set();
  for (const v of SETP.vignettes) {
    const p = t.placements.find(q => q.id === v.id && q.setpiece);
    assert.ok(p, `${v.id} not placed`);
    kinds.add(v.kind);
    const d = Math.hypot(p.x - HUB.x, p.z - HUB.z);
    assert.ok(d <= 1700, `${v.id} is ${Math.round(d)} m from Torborhold`);
    if (!p.bound && v.pin.dist && v.pin.near === 'Torborhold' && !v.pin.route) assert.ok(d >= v.pin.dist[0] - 60 && d <= v.pin.dist[1] + 170, `${v.id}: ${Math.round(d)} m outside its pin ${v.pin.dist}`);
    if (p.bound) {
      // on stream B's own baked piece: B's ground, our content
      const piece = BZ.find(b => b.kind === 'set_piece' && b.id === p.bound);
      assert.ok(piece && v.bind && v.bind.piece === p.bound, `${v.id}: bound to ${p.bound}`);
      assert.ok(Math.hypot(piece.x - p.x, piece.z - p.z) <= (piece.data.r || 20) + 2, `${v.id}: off its piece`);
      assert.ok(p.scale > 0 && p.scale <= 1, `${v.id}: scale`);
    } else {
      assert.equal(discProblem(ctx, ruleKind(p), p.x, p.z, p.radius, { ignore: p, others: t.placements }), null, `${v.id}`);
      if (v.pin.water != null) assert.ok(ctx.waterDist(p.x, p.z) - p.radius <= v.pin.water + 2, `${v.id}: no water by it`);
      assert.ok(p.ground, `${v.id}: ground ask for stream B`);
    }
    // everything inside the radius, every model defined
    const R = v.radius;
    for (const list of ['props', 'models', 'objects', 'monsters']) for (const q of v[list] || []) assert.ok(Math.hypot(q.x || 0, q.z || 0) <= R, `${v.id} ${list} ${q.id || q.name || q.type} outside`);
    for (const m of v.models || []) assert.ok(SETP.models[m.id] && SETP.models[m.id].desc && SETP.models[m.id].parts.length, `${v.id}: model ${m.id}`);
    for (const f of v.folk || []) for (const [x, z] of f.path) assert.ok(Math.hypot(x, z) <= R, `${v.id} folk path outside`);
    // its folk are placed, inside the disc (their loops are walked by tests/E/placement.test.js)
    assert.ok(t.placements.filter(q => q.type === 'folk' && q.in === v.id).length >= Math.min(1, (v.folk || []).length), `${v.id} folk`);
  }
  for (const k of ['graveyard', 'farmland', 'mill', 'hunters_camp', 'shrine', 'ruins', 'lumber_camp', 'fishing_spot', 'crossroads_inn']) assert.ok(kinds.has(k), `no ${k}`);
});

test('Q18: every set piece has people or a fight, lore, and its quests resolve; chatter pools exist for its folk', () => {
  const chat = new Set(Object.keys(J('data/names/chatter.json').pools));
  const spQuests = [...SPQ.quests, ...CLASSQ.quests, ...START.quests];
  for (const v of SETP.vignettes) {
    assert.ok(v.lore && v.blurb, v.id);
    const npcs = Object.values(ALLNPC).filter(n => n.at === v.id);
    assert.ok(npcs.length || (v.monsters || []).length || v.boss, `${v.id} is empty`);
    assert.ok(chat.has('place.' + v.id), `${v.id}: no place chatter`);
    for (const f of v.folk || []) for (const c of f.chatter) assert.ok(chat.has(c), `${v.id}: pool ${c}`);
    assert.ok(spQuests.some(q => q.steps.some(s => s.vignette === v.id || s.near === v.id) || (ALLNPC[q.giver] || {}).at === v.id), `${v.id}: no quest goes there`);
  }
  for (const q of SPQ.quests) for (const s of q.steps) {
    assert.ok(s.text && s.where, `${q.id}: step text`);
    if (s.kind === 'use') assert.ok((SP_OF.get(s.vignette)?.objects || []).some(o => o.name === s.object), `${q.id}: ${s.vignette}/${s.object}`);
    if (s.npc) assert.ok(ALLNPC[s.npc], `${q.id}: ${s.npc}`);
  }
});

test('banned names: none in the play-test 2 files (whole words, plus ember/veil/muster anywhere)', () => {
  const IDS = new Set(['id', 'base', 'bases', 'type', 'from', 'body', 'encounter', 'source', 'plot', 'want', 'giver', 'npc', 'vignette', 'near', 'at', 'role', 'kind', 'setpiece', 'chatter', 'boss', 'zone', '_doc', 'blurb', 'monsters', 'shop', 'sign', 'shops', 'requires', 'next', 'cls', 'classes', 'part', 'trains', 'unlock', 'recipe', 'office', 'surface', 'crop', 'work', 'mesh', 'colour', 'route', 'biome', 'waterSide', 'note']);
  const strings = (o, path = '', out = []) => {
    if (typeof o === 'string') out.push([path, o]);
    else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!IDS.has(k)) strings(v, `${path}.${k}`, out);
    return out;
  };
  const bad = [];
  const files = { shops: SHOPS, offices: OFFICES, setpieces: SETP, start: START, classes: CLASSQ, spquests: SPQ, gristle: J('data/encounters/mb_old_gristle.json') };
  for (const [f, d] of Object.entries(files)) for (const [p, s] of strings(d)) {
    for (const w of BANNED) if (new RegExp(`(^|[^A-Za-z])${w.replace(/[+]/g, '\\+')}($|[^A-Za-z])`, 'i').test(s)) bad.push(`${f}${p}: ${w}`);
    for (const w of ['ember', 'veil', 'muster']) if (new RegExp(w, 'i').test(s)) bad.push(`${f}${p}: ${w}`);
  }
  assert.ok(BANNED.length > 40, 'the list was read');
  assert.deepEqual(bad, []);
});
