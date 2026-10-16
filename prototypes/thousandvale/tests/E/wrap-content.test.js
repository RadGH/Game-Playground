// Wrap-up 2026-10-13, CONTENT: four things play-test 10 wrote the rules for and never switched on with data.
//   #26 (Y18)  "why can't I skin barrow hounds"      — a hide is decided by the BODY, and the rest say why not
//   #29 (Y17)  training dummies in towns              — rows `dummy` for every town and city, on open ground
//   #18 (Y21)  wilderness NPCs fight beside you       — travellers.json `fighters`: placed NPCs, wayside folk, armed crews
//   Y32        the Starcaller's class quest           — class_starcaller, offered by the trainer who teaches the class
// Everything here is asked of the REAL generated data and the real province (loopback socket, virtual clock).
//   node --test prototypes/thousandvale/tests/E/wrap-content.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { parseNav, NAV } from '../../js/rules/terrain-read.js';
import { rulesEngine } from '../../js/rules/index.js';
import { CREATURE_TYPES } from '../../../../avatar-3d/js/creature-types.js';
import { skinRule } from '../../tools/content-professions.mjs';
import { DUMMIES } from '../../tools/content-towns.mjs';
import { markFighters, fighterLevelAt } from '../../js/sim/realm.js';
import { createTravellers } from '../../js/sim/travellers.js';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const ZM = 2048;
const off = wid => { const [, x, y] = /^z(\d+)_(\d+)$/.exec(wid).map(Number); return { ox: x * ZM, oz: y * ZM }; };
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const PROF = J('data/provinces/professions.json');
const GUARDS = J('data/provinces/guards.json');
const TRAV = J('data/provinces/travellers.json');
const CLASSQ = J('data/quests/classes.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const WIDS = Object.values(MAP);

let shared = null;
const server = async () => (shared ||= await realServer({ roadEvents: false }));
test.after(async () => { if (shared) await shared.srv.stop(); });
const wildsOf = P => (P.copies && P.copies[0]) || [...P.rooms.values()].find(r => r.kind !== 'town');

// ---------------------------------------------------------------------------------------------------------------- #26
const BEASTS = (() => { const b = rulesEngine().bestiary; return [...b.enemies, ...b.bosses]; })();

test('#26: every monster with an animal\'s body can be skinned, and every other monster has a sentence saying why not', () => {
  const S = PROF.skins;
  for (const d of BEASTS) {
    const yes = S.types[d.id], no = S.none[d.id];
    assert.ok(!!yes !== !!no, `${d.id}: in exactly one of skins.types / skins.none`);
    if (no) { assert.ok(typeof no.why === 'string' && /^[A-Z].*\.$/.test(no.why) && no.why.length < 90, `${d.id}: "${no.why}"`); continue; }
    assert.equal(d.kind, 'beast', `${d.id}: only creature bodies have a hide`);
  }
  // the rule, asked body by body: a four-legged, many-legged, winged or crawling creature that is not stone, flame or a fiend
  const animal = d => d.kind === 'beast' && ['quad', 'spider', 'bat', 'snake', 'fowl'].includes((CREATURE_TYPES[d.look.creature.type] || {}).plan) && !['construct', 'elemental', 'fiend'].includes(d.family);
  const left = BEASTS.filter(d => animal(d) && !S.types[d.id]).map(d => d.id);
  assert.deepEqual(left, ['ossuary_crawler'], 'the one animal-bodied monster with no hide is the worm made of bone, and it says so');
  assert.match(S.none.ossuary_crawler.why, /bone/i);
  // FAMILY no longer decides it: the report's own monster, and the other long-dead beasts
  for (const id of ['barrow_hound', 'pale_courser']) { const d = BEASTS.find(x => x.id === id); assert.equal(d.family, 'undead'); assert.ok(S.types[id] && S.types[id].worn && S.types[id].noMeat, id); }
  for (const id of ['waste_wyrm', 'thornmother', 'kirrath_cinderwyrm', 'moor_hound', 'dread_stag']) assert.ok(S.types[id], id);
  for (const id of ['road_brigand', 'cursed_knight']) assert.equal(S.none[id].person, 1, id);
  for (const id of ['hollow_wraith', 'bog_slime', 'stone_sentinel', 'marsh_wisp', 'hoard_mimic', 'sporecap_walker', 'cinder_imp']) assert.ok(S.none[id] && !S.none[id].person, id);
  // what the generator would write today is what is in the file (nobody edited one without the other)
  for (const d of BEASTS) assert.equal(skinRule(d).ok, !!S.types[d.id], d.id);
  const n = Object.keys(S.types).length;
  // Expansion 1 §5: + the 7 Vharlen beasts with a hide (scoria crawler, ashback salamander, glasswing, steamwood prowler,
  // sulphur toad, mudback lurker, Ossathra) — the salamander's is its own (`hide: 'salamander_hide'`)
  // [Packs] (2026-10-16): + the two quarry a hunting pack runs down (Fallow Deer, Cinderhorn Goat; data/rules/monsters-tv.json)
  assert.equal(n, 24 + 7 + 2, `skinnable kinds of monster (19 before, 24 on Torbor alone): ${n}`);
  assert.equal(S.types.ashback_salamander.hide, 'salamander_hide');
});

test('#26 on the real server: a barrow hound gives a hide (worn: a grade lower, no meat); a wraith tells the skinner why not, once, and again at the knife', async () => {
  const S = await server(), P = S.world.province, W = P.professions;
  // the rule: worn hides drop a grade, never below the lowest, and never invent one
  const hides = PROF.classes.hide;
  const lvlOf = t => PROF && J('data/rules/professions.json').tiers[t - 1].levels[0];
  assert.equal(W.P.skinOf('barrow_hound', lvlOf(1)).gives[0].id, hides[0]);
  assert.equal(W.P.skinOf('barrow_hound', lvlOf(3)).gives[0].id, hides[1], 'a level that gives a wolf the third hide gives the dead hound the second');
  assert.equal(W.P.skinOf('moor_hound', lvlOf(3)).gives[0].id, hides[2]);
  assert.ok(!W.P.skinOf('barrow_hound', 3).gives.some(g => g.id === PROF.skins.meat) && W.P.skinOf('moor_hound', 3).gives.some(g => g.id === PROF.skins.meat));
  assert.equal(W.P.skinOf('hollow_wraith', 5), null);
  assert.equal(W.P.skinRefusal('hollow_wraith'), PROF.skins.none.hollow_wraith.why);
  assert.equal(W.P.skinRefusal('barrow_hound'), null);

  const a = await joinReal(S.srv, S.clock, 'Flenser'), o = rec(S.world, a);
  await run(S.clock, 1200);
  W.teach(o, 'skinning'); await run(S.clock, 300);
  const sk = on(a, 'skinnable'), chat = on(a, 'chat'), gR = on(a, 'gatherR');
  const kill = type => { const m = o.room.spawn({ kind: 'monster', type, level: 2, x: o.entity.x + 2, z: o.entity.z, team: 2 }); m.kill(o.entity); o.room.host.despawn(m, 8000); return m; };
  const hound = kill('barrow_hound'); await run(S.clock, 300);
  assert.ok(sk.some(m => m.id === hound.id && m.on), 'the corpse is offered to the knife');
  const told = () => chat.filter(m => m.ch === 'system' && m.name === 'Skinning' && !/learned/.test(m.text));
  const wraith = kill('hollow_wraith'); await run(S.clock, 300);
  assert.ok(!sk.some(m => m.id === wraith.id), 'no prompt on a wraith');
  assert.equal(told().length, 1); assert.ok(told()[0].text.includes(PROF.skins.none.hollow_wraith.why), told()[0].text);
  kill('hollow_wraith'); await run(S.clock, 300);
  assert.equal(told().length, 1, 'said once for each kind of monster, not at every kill');
  kill('road_brigand'); await run(S.clock, 300);
  assert.equal(told().length, 1, 'nobody is told that people are not skinned');
  // asking for it by hand: the refusal carries the reason
  // (asked of the server directly, with the fighting flag put down first: the kills above leave the player "in combat" for a while)
  const fresh = kill('hollow_wraith'); o.entity.setState(2, false);
  W.gather(o, { op: 'start', id: fresh.id }); await until(S.clock, () => gR.length, 2000);
  assert.equal(gR[0].ok, false); assert.equal(gR[0].why, 'noHide'); assert.equal(gR[0].msg, PROF.skins.none.hollow_wraith.why);
  // ...and so does the knife used from the bag beside it (it used to say "nothing to skin in reach"); the hound, skinnable, is preferred
  const knife = o.char.bag.findIndex(i => i.tool && i.use.prof === 'skinning');
  o.skins.delete(hound.id);      // (as if the hound had been skinned already)
  o.entity.setState(2, false); gR.length = 0; W.useItem(o, o.char.bag[knife], knife, () => {}); await until(S.clock, () => gR.length, 2000);
  assert.equal(gR[0].why, 'noHide'); assert.equal(gR[0].msg, PROF.skins.none.hollow_wraith.why);
  a.close();
});

// ---------------------------------------------------------------------------------------------------------------- #29
test('#29: every town and city has its row of training dummies, on open ground: no street, building, stall, wall, post or person under one', () => {
  const D = GUARDS.dummies;
  assert.ok(Array.isArray(D) && D.length >= 36);
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  let towns = 0;
  for (const wid of WIDS) {
    const baked = J(`data/zones/${wid}/placements.json`).placements;
    const nav = parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, root)));
    const rows = J(`data/vignettes/placements/${wid}.quest.json`).placements;
    const others = [...rows, ...J(`data/vignettes/placements/${wid}.json`).placements].filter(p => p.type !== 'dummy' && p.type !== 'camp' && Number.isFinite(p.x));
    for (const s of baked.filter(p => p.kind === 'settlement')) {
      const mine = D.filter(d => d.zone === wid && d.settlement === s.id);
      const major = s.data.kind === 'town' || s.data.kind === 'city';
      if (!major) { assert.equal(mine.length, 0, `${s.id} (${s.data.kind})`); continue; }
      towns++;
      assert.equal(mine.length, DUMMIES.n[s.data.kind], `${s.id}: ${mine.length} dummies`);
      assert.ok(mine.length >= 2);
      const wall = baked.find(p => p.kind === 'town_wall' && p.data.town === s.id), sq = baked.find(p => p.kind === 'town_square' && p.data.town === s.id);
      for (const d of mine) {
        const tag = `${d.id} at ${d.x},${d.z}`;
        // the row the server spawns from is this dummy
        const row = rows.find(p => p.type === 'dummy' && p.id === d.id);
        assert.ok(row && row.x === d.x && row.z === d.z && row.name === 'Training Dummy', tag + ': its row in ' + wid + '.quest.json');
        // the walkers' own grid: standing room on it and on every sample a metre round it
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const b = nav.at(d.x + dx, d.z + dz);
          assert.ok((b & NAV.WALK) && !(b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP | NAV.ROAD)), `${tag}: nav bits ${b} at +${dx},${dz}`);
        }
        for (const st of baked.filter(p => p.kind === 'street' && p.data.town === s.id)) for (let i = 1; i < st.data.pts.length; i++)
          assert.ok(segDist(d.x, d.z, st.data.pts[i - 1], st.data.pts[i]) >= (st.data.width || 4) / 2 + 1, `${tag}: on ${st.id}`);
        for (const g of (wall && wall.data.gates) || []) if (g.main && g.main.pts) for (let i = 1; i < g.main.pts.length; i++)
          assert.ok(segDist(d.x, d.z, g.main.pts[i - 1], g.main.pts[i]) >= (g.main.width || 5) / 2 + 1, `${tag}: on the high street from ${g.id}`);
        for (const b of baked.filter(p => p.kind === 'building' || p.kind === 'set_building')) assert.ok(Math.hypot(d.x - b.x, d.z - b.z) >= Math.hypot(b.data.w || 6, b.data.d || 6) / 2 + 1, `${tag}: against ${b.id}`);
        if (wall) assert.ok(Math.hypot(d.x - s.x, d.z - s.z) <= wall.data.radius - 4, `${tag}: at the wall`);
        if (sq) { assert.ok(Math.hypot(d.x - sq.x, d.z - sq.z) >= (sq.data.r || 4) + 3, `${tag}: in the square`); for (const [x, z] of sq.data.stalls || []) assert.ok(Math.hypot(d.x - x, d.z - z) >= 3, `${tag}: on a market stall`); }
        for (const p of others) assert.ok(Math.hypot(d.x - p.x, d.z - p.z) >= (p.radius || 1) + 2, `${tag}: on ${p.type} ${p.id}`);
        for (const e of mine) if (e !== d) assert.ok(Math.hypot(d.x - e.x, d.z - e.z) >= 2, `${tag}: on ${e.id}`);
        assert.ok(Math.hypot(d.x - (sq || s).x, d.z - (sq || s).z) <= 50, `${tag}: within a short walk of the square`);
      }
    }
  }
  assert.equal(towns, 18);
  assert.deepEqual(GUARDS.problems.filter(p => /dumm/i.test(p)), []);
});

test('#29 on the real server: the first town has its two dummies where the data says (the stand-ins are gone), and every town room gets its own', async () => {
  const S = await server(), P = S.world.province, L = S.world.layouts[0];
  assert.equal(L.dummies.length, GUARDS.dummies.length, 'the layout carries every row');
  for (const d of L.dummies) {
    const t = L.towns.find(q => Math.hypot(d.x - q.x, d.z - q.z) < q.r);
    assert.ok(t && t.name === d.town, `${d.id} stands inside ${d.town}'s own room`);
    assert.ok(L.terrain.walkable(d.x, d.z), `${d.id} on walkable ground`);
  }
  for (const t of L.towns) assert.ok(L.dummies.filter(d => d.town === t.name).length >= 2, `${t.name} has dummies`);
  const a = await joinReal(S.srv, S.clock, 'Thumper'), o = rec(S.world, a);
  await run(S.clock, 1500);
  assert.equal(o.room.kind, 'town');
  const got = [...o.room.entities.values()].filter(e => e.type === 'training_dummy');
  const want = GUARDS.dummies.filter(d => d.town === L.towns[0].name).map(d => { const f = off(d.zone); return { x: d.x + f.ox, z: d.z + f.oz }; });
  assert.equal(got.length, 2);
  for (const w of want) assert.ok(got.some(e => Math.hypot(e.x - w.x, e.z - w.z) < 0.2), `a dummy at ${w.x},${w.z}`);
  for (const e of got) { assert.ok(o.room.rules.isDummy(e)); assert.ok(e.hpMax > 5000, 'a great deal of health'); }
  // hit one: it takes the blow and cannot die
  const d0 = got[0], hp = d0.hp;
  P.transfer(o, o.room, { x: d0.x + 1.5, z: d0.z }, 'test'); await run(S.clock, 600);
  for (let i = 0; i < 60 && d0.hp === hp; i++) { o.room.rules.intent(o.entity, { t: 'cast', slot: 0, target: d0.id }); await run(S.clock, 100); }
  assert.ok(d0.hp < hp && !d0.dead, 'attackable inside the town');
  a.close();
});

// ---------------------------------------------------------------------------------------------------------------- #18
test('#18: the data says who fights — guards, patrols, hunters and armed crews; never a trader, a farmer, a pilgrim or a child', () => {
  const F = TRAV.fighters;
  assert.ok(F && F.roles.length >= 6 && F.crew === 'armed');
  for (const r of ['merchant', 'trader', 'farmer', 'shepherd', 'pilgrim', 'porter', 'refugee', 'child', 'elder', 'herbalist', 'innkeeper', 'carter', 'courier']) assert.ok(!F.roles.includes(r), r + ' does not fight');
  for (const r of ['guard', 'caravan_guard', 'guard_patrol', 'hunter', 'hunter_lone']) assert.ok(F.roles.includes(r), r);
  // every armed crew row is a role that fights, and no unarmed one is
  const crew = Object.values(TRAV.kinds).flatMap(k => k.crew);
  assert.ok(crew.filter(c => c.armed).length >= 4);
  for (const c of crew) assert.equal(!!c.armed, F.roles.includes(c.role), `${c.role}: armed ${c.armed}`);
  // the marker: only NPC objects with a listed role, at the floor of their zone's band; one that says so itself is left alone
  const zones = [{ bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, sheet: { band: [4, 7] } }, { bounds: { minX: 100, maxX: 200, minZ: 0, maxZ: 100 }, sheet: { band: [8, 10] } }];
  const objs = [{ type: 'npc', npc: { role: 'guard' }, x: 10, z: 10 }, { type: 'npc', npc: { role: 'trader' }, x: 10, z: 10 }, { type: 'npc', npc: { role: 'hunter' }, x: 150, z: 10 }, { type: 'npc', npc: { role: 'scout' }, x: 10, z: 10, fighter: { level: 9 } }, { type: 'chest', npc: { role: 'guard' }, x: 1, z: 1 }];
  assert.equal(markFighters(objs, { roles: ['guard', 'hunter', 'scout'], levelOver: 1 }, zones), 2);
  assert.deepEqual(objs.map(o => o.fighter || null), [{ level: 5 }, null, { level: 9 }, { level: 9 }, null]);
  assert.equal(fighterLevelAt(zones, 150, 50), 8);
  assert.equal(markFighters([{ type: 'npc', npc: { role: 'guard' }, x: 1, z: 1 }], null, zones), 0, 'no data, nobody fights (the old behaviour)');
});

test('#18: an armed traveller carries the fighter mark, an unarmed one does not, and a group waits for a crew member who is fighting', () => {
  const made = [];
  let fighting = null, clock = 0;
  const player = { kind: 'player', id: 1, x: 5, z: 0, dead: false };
  const room = { now: () => clock, clients: new Map([[1, { entity: player }]]), entities: new Map(), rules: { npcFighting: e => e === fighting }, emit() {},
    spawn(spec) { const e = { ...spec, id: 100 + made.length, removed: false, moveTo(x, z) { this.x = x; this.z = z; this.moved = (this.moved || 0) + 1; }, face() {}, loop() {} }; made.push(e); return e; }, remove(e) { e.removed = true; } };
  const tr = createTravellers({ room, rng: () => 0.42, fighterLevel: (x, z) => 6,
    travel: { fighters: TRAV.fighters, rules: { ...TRAV.rules, perRouteKm: 1 }, kinds: { merchant_caravan: TRAV.kinds.merchant_caravan }, chatter: { pools: {}, rules: {} }, names: { given: { f: ['Ada'], m: ['Wat'] }, family: ['Reed'] },
      routes: [{ id: 'r', pts: [[0, 0], [1000, 0]], kinds: ['merchant_caravan'], from: { name: 'A' }, to: { name: 'B' } }] },
    folk: [{ id: 'f1', role: 'hunter_lone', name: 'Hunter', x: 8, z: 4, path: [[8, 4], [12, 4], [10, 8]] }, { id: 'f2', role: 'shepherd', name: 'Shepherd', x: 8, z: -4, path: [[8, -4], [12, -4], [10, -8]] }] });
  const g = tr.groups[0]; g.s = 20; g.dir = 1;
  for (let i = 0; i < 8; i++) { clock += 200; tr.step(200); }
  const crew = g.crew.map(c => c.e);
  assert.ok(crew.every(Boolean), 'the crew is in the room');
  const guard = crew.find(e => e.data.npc.role === 'caravan_guard'), trader = crew.find(e => e.data.npc.role === 'merchant');
  assert.deepEqual(guard.data.fighter, { level: 6 }, 'a caravan guard fights at the level of the zone it walks through');
  assert.equal(trader.data.fighter, undefined, 'the trader does not');
  const hunter = made.find(e => e.data.folk && e.data.folk.role === 'hunter_lone'), shepherd = made.find(e => e.data.folk && e.data.folk.role === 'shepherd');
  assert.deepEqual(hunter.data.fighter, { level: 6 }); assert.equal(shepherd.data.fighter, undefined);
  // walking: the group moves on. Fighting: it stands, and the fighter's feet are left to the rules.
  g.pauseUntil = 0; g.nextStopAt = 1e9;
  let s0 = g.s; for (let i = 0; i < 8; i++) { clock += 200; tr.step(200); }
  assert.ok(g.s > s0 + 0.5, 'it walks');
  fighting = guard; s0 = g.s; const moved = guard.moved, tm = trader.moved;
  for (let i = 0; i < 20; i++) { clock += 200; tr.step(200); }
  assert.equal(g.s, s0, 'the caravan waits for its guard');
  assert.equal(guard.moved, moved, 'nobody walks a fighter on mid-fight');
  assert.ok(trader.moved > tm, 'the others keep their places');
  fighting = null; g.pauseUntil = 0;
  for (let i = 0; i < 12; i++) { clock += 200; tr.step(200); }
  assert.ok(g.s > s0 + 0.5 && guard.moved > moved, 'and goes on when it is over');
});

test('#18 on the real province: fighters stand in the wilds; one beside two Ossuary Crawlers fights them when a player is near, and thanks the player who helps', async () => {
  const S = await server(), P = S.world.province, L = S.world.layouts[0];
  const marked = L.objects.filter(o => o.type === 'npc' && o.fighter);
  assert.ok(marked.length >= 40, `${marked.length} placed wilderness NPCs fight`);
  for (const o of marked) { assert.ok(TRAV.fighters.roles.includes(o.npc.role), o.npc.role); assert.ok(o.fighter.level >= 1); }
  assert.ok(new Set(marked.map(o => L.zoneOf(o.x, o.z))).size >= 12, 'in nearly every zone');
  assert.equal(L.townObjects.flat().filter(o => o.fighter).length, 0, 'nobody inside a town room is marked (the town guards are their own thing)');
  assert.ok(L.folk.filter(f => TRAV.fighters.roles.includes(f.role)).length >= 10, 'wayside hunters and poachers too');
  assert.ok(L.travel.fighters, 'the travellers runner is handed the rule');

  const a = await joinReal(S.srv, S.clock, 'Helper'), o = rec(S.world, a);
  await run(S.clock, 1200);
  const spot = marked.find(x => x.npc.role === 'guard');
  P.transfer(o, wildsOf(P), { x: spot.x + 30, z: spot.z }, 'test'); await run(S.clock, 1500);
  const room = o.room;
  const npc = [...room.entities.values()].filter(e => e.kind === 'npc' && e.data && e.data.fighter).sort((p, q) => Math.hypot(p.x - spot.x, p.z - spot.z) - Math.hypot(q.x - spot.x, q.z - spot.z))[0];
  assert.ok(npc && npc.r.unit && npc.r.unit.wanderer, 'the placed NPC has its fighter');
  for (const x of [...room.entities.values()]) if (x.kind === 'monster' && Math.hypot(x.x - npc.x, x.z - npc.z) < 80) room.remove(x);
  // (a) the player 150 m off: the two stand side by side and nothing happens (cosmetic only)
  P.transfer(o, room, { x: npc.x + 150, z: npc.z }, 'test'); await run(S.clock, 500);
  const mob = dx => room.spawn({ kind: 'monster', type: 'ossuary_crawler', level: npc.r.unit.baseLevel, x: npc.x + dx, z: npc.z + 2, team: 2 });
  let mobs = [mob(3), mob(-3)];
  await run(S.clock, 4000);
  assert.deepEqual(mobs.map(m => m.hp), mobs.map(m => m.hpMax), 'no damage with nobody watching');
  assert.equal(room.rules.npcFighting(npc), false);
  // (b) the player walks up: the NPC takes them on
  P.transfer(o, room, { x: npc.x + 8, z: npc.z - 6 }, 'test');
  await run(S.clock, 5000);
  assert.equal(room.rules.npcFighting(npc), true, 'it fights');
  assert.ok(mobs.some(m => m.hp < m.hpMax), 'the monsters are struck by the NPC alone');
  assert.ok(a.evs.some(e => e.type === 'hit' && e.s === npc.id), 'and the player sees the blows');
  // (c) the player joins in: when the last one falls the NPC says thanks, and the purse rule can pay
  const before = a.evs.length;
  npc.r.unit.dmg = [1, 1];      // (from here the player does the work: a helper is someone who dealt a fifth of the foes' health)
  for (let i = 0; i < 6000 && mobs.some(m => !m.dead); i++) {
    const t = mobs.find(m => !m.dead); o.entity.setHp(o.entity.hpMax); const u = npc.r.unit; u.hp = Math.max(u.hp, Math.round(u.maxHp * 0.6));
    P.transfer(o, room, { x: t.x, z: t.z - 1.5 }, 'test'); room.rules.intent(o.entity, { t: 'cast', slot: 0, target: t.id }); await run(S.clock, 50);
  }
  assert.ok(mobs.every(m => m.dead), 'the crawlers are dead');
  await run(S.clock, 8000);
  const after = a.evs.slice(before);
  assert.ok(after.some(e => e.type === 'fx' && e.kind === 'npcThanks' && e.id === npc.id && ['helped', 'saved'].includes(e.why)), 'the thanks is sent to the helper');
  assert.ok(after.some(e => e.type === 'say' && e.id === npc.id && e.text.length > 8), 'the NPC says it aloud');
  assert.ok(!npc.dead && !npc.removed, 'a wilderness NPC is never killed');
  assert.equal(room.rules.npcFighting(npc), false);
  a.close();
});

// ---------------------------------------------------------------------------------------------------------------- Y32
test('Y32: the Starcaller has a class quest shaped like the other thirty, from the trainer who teaches it, with a mark for every step', () => {
  const tv = J('data/rules/classes-tv.json').classes.find(c => c.id === 'starcaller');
  const qs = CLASSQ.quests.filter(q => (q.classes || []).includes('starcaller'));
  assert.equal(qs.length, 1);
  const q = qs[0], like = CLASSQ.quests.find(x => x.id === 'class_mage'), others = CLASSQ.quests.filter(x => x !== q);
  assert.equal(CLASSQ.quests.length, 32);      // + the Star Blade (round 11, #53)
  assert.deepEqual(Object.keys(q).sort(), Object.keys(like).sort(), 'the same fields as a caster class with no companion');
  assert.deepEqual(q.classes, ['starcaller']);
  assert.ok(q.level >= 1 && q.level <= 5);
  const t = CLASSQ.npcs[q.giver];
  assert.ok(t.role === 'trainer' && t.trains.includes('starcaller'));
  const len = x => x.offer.length + x.done.length, lens = others.map(len).sort((a, b) => a - b);
  assert.ok(len(q) >= lens[0] && len(q) <= lens[lens.length - 1] * 1.2, `as long as the others (${len(q)} against ${lens[0]}-${lens[lens.length - 1]})`);
  assert.ok(q.steps.length >= 2 && q.steps.length <= Math.max(...others.map(x => x.steps.length)));
  // every step is something the world holds: a real object of a real set piece, a real monster beside a real camp of it
  const SP = new Map(J('data/vignettes/setpieces.json').vignettes.map(v => [v.id, v]));
  const best = rulesEngine().bestiary.enemies;
  for (const s of q.steps) {
    assert.ok(s.text && s.where, 'what and where');
    if (s.kind === 'use') assert.ok(SP.get(s.vignette).objects.some(o => o.type === 'use' && o.name === s.object), `${s.vignette} has "${s.object}"`);
    // round 11 (World, owner #31): the kill step moved next to the stones — the set piece's own monsters, or a live hunting area of them within 160 m
    else if (s.kind === 'kill') { assert.ok(best.some(e => e.id === s.type)); const sp = SP.get(s.near), areas = J('data/quests/marks/torbor_downs-hunts.json').types[s.type] || [], at = J('data/quests/marks/torbor_downs.json').quests[q.id].steps[q.steps.indexOf(s) - 1]; assert.ok(sp.monsters.some(m => (m.type || m.monster) === s.type) || areas.some(h => Math.hypot(h.x - at.x, h.z - at.z) < 160), `${s.type} lives at ${s.near}`); }
    else assert.fail('step kind ' + s.kind);
    assert.ok(others.some(x => x.steps.some(y => y.where === s.where)), 'the place is named as the other quests name it');
  }
  // the reward: a rare the class can hold, and a perk point (no companion class)
  assert.equal(q.reward.item.tier, 'rare'); assert.ok(tv.weapons.includes(q.reward.item.base)); assert.equal(q.reward.perks, 1); assert.equal(q.reward.unlock, undefined);
  assert.ok(q.rewardText.includes(q.reward.item.name));
  assert.ok(!others.some(x => x.reward.item.name === q.reward.item.name || x.name === q.name), 'its own names');
  // original words only
  const text = JSON.stringify(q) + JSON.stringify(t.says);
  for (const w of ['starfall', 'ember', 'veil', 'muster', 'hearthstone', 'mythic', 'heroic', 'blink']) assert.ok(!new RegExp('\\b' + w, 'i').test(text), w);
  // the map: giver and one mark a step, in the start zone
  const m = J('data/quests/marks/torbor_downs.json').quests.class_starcaller, sib = J('data/quests/marks/torbor_downs.json').quests.class_mage;
  assert.ok(m && m.steps.length === q.steps.length && m.steps.every(s => s && Number.isFinite(s.x) && s.r > 0));
  assert.deepEqual(m.giver, sib.giver, 'the same trainer as the Mage');
  // and the index and the two copies of the trainer's class list agree
  const g = J('data/quests/marks/givers.json').npcs[q.giver];
  assert.ok(g.gives.includes(q.id) && g.trains.includes('starcaller'));
  const office = Object.values(J('data/provinces/offices.json').towns).flatMap(x => x.offices).find(x => x.npc === q.giver);
  assert.ok(office.trains.includes('starcaller'));
  assert.ok(J('data/vignettes/placements/z12_02.json').placements.find(p => p.id === q.giver).trains.includes('starcaller'));
});

test('Y32 on the real server: a new Starcaller is offered the quest by Magister Voss and can take it; a Mage is offered the Mage\'s and not this one', async () => {
  const S = await server(), P = S.world.province;
  const voss = [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && x.e.data.npc.id === 'trainer_arcane');
  assert.ok(voss, 'the trainer stands in the world');
  const ask = async (name, cls) => {
    const a = await joinReal(S.srv, S.clock, name, cls), o = rec(S.world, a);
    await run(S.clock, 1200);
    assert.equal(o.char.cls, cls);
    P.transfer(o, voss.rm, { x: voss.e.x + 1.5, z: voss.e.z }, 'test'); await run(S.clock, 600);
    const used = on(a, 'used');
    a.use(voss.e.id); await until(S.clock, () => used.length, 2000);
    return { a, o, offers: (used[0].offers || []).map(q => q.id) };
  };
  const star = await ask('Sabel', 'starcaller');
  assert.ok(star.offers.includes('class_starcaller'), 'offered: ' + star.offers.join(', '));
  assert.ok(!star.offers.some(id => id.startsWith('class_') && id !== 'class_starcaller'), 'and no other class\'s');
  const mage = await ask('Pellam', 'mage');
  assert.ok(mage.offers.includes('class_mage') && !mage.offers.includes('class_starcaller'), mage.offers.join(', '));
  // taking it puts it on the character at its first step
  star.a.quest('accept', 'class_starcaller', voss.e.id); await run(S.clock, 500);
  assert.ok(JSON.stringify(star.o.char.quests || {}).includes('class_starcaller'), 'the quest is on the character: ' + JSON.stringify(star.o.char.quests || {}).slice(0, 200));
  mage.a.quest('accept', 'class_starcaller', voss.e.id); await run(S.clock, 500);
  assert.ok(!JSON.stringify(mage.o.char.quests || {}).includes('class_starcaller'), 'and a Mage cannot take it by asking');
  star.a.close(); mage.a.close();
});
