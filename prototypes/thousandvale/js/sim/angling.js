// ANGLING — the server side (stream A, play-test 5 T25). Pure.
//
// The numbers and every roll are stream C's (js/rules/fishing.js over data/rules/fishing.json); the fish, junk, legends,
// recipes, rods and pool spots are stream E's (data/provinces/angling.json, angling-pools.json). This file runs the loop
// for real players, keeps the pools, saves the skill and the catch journal, cooks, and tells everyone near what they see.
//
//   cast   `fish {op:'cast', aim?}`  a rod in the bag, standing by water (or a pool) -> `fishR {ok, state:'wait', at, water, pool?}`
//   bite   2-9 s later               `fishBite {ms}`  (the window to answer)
//   hook   `fish {op:'hook'}`        too soon / too late -> `fishR {ok:false, why:'early'|'late'}`; else the ROLL:
//            junk comes straight in, a monster climbs out, anything else is a tug -> `fishTug {ms, band, need, pull, speed, jitter, seed, heft, rarity}`
//   land   `fish {op:'land', held}`  the tug ran in the browser; `held` = the share of it the marker stayed in the band
//            -> `fishCatch {ok, kind, item, species, size, record, first, skill, pool?, title?}` or `{ok:false, lost:true}`
//   stop   `fish {op:'stop'}` — a step of more than 2 m, a hit, a cast, swimming, dying or changing room also reel in (`fishR {state:'idle', why}`)
// Everyone near sees `ev fx {kind:'fish', id, phase, x, z, rarity?}` and the angler's `info.fishing = {x, z, tug?}`.
//
// POOLS are room objects (`type:'fishpool'`, `info.pool = {tier, minSkill, left, water}`): `meta.<zone>.live` of E's listed
// spots are open at once per copy; a pool is fished out after C's `catches` and another listed spot opens a little later.
// A cast that lands within POOL_R of one fishes the pool (better tables, shorter wait). Any other water works too.
//
// SAVED on the character (`angling`): { xp, level, casts, catches: { species: { n, best, zone, zones } }, legends, titles, bait }.
// COOKING: `cook {}` -> `cookList {fire, recipes}`; `cook {id, n?}` at a fire (a campfire, an inn's hearth = its innkeeper)
// turns fish into E's meals — ordinary food goods the existing meal code eats.
//
//   const A = createAngling({ ...province helpers })
//   A.fish(o, m) ; A.cook(o, m) ; A.tick() ; A.stop(o, why) ; A.view(ch) ; A.isFire(obj) ; A.useItem(o, item, idx, R) -> bool

import { FISH_OPS, STATE } from '../net/protocol.js';
import { createFishing } from '../rules/fishing.js';
import { crateItem } from './crates.js';
import { economy } from './economy-knobs.js';

export const ANGLING = Object.freeze({
  castMin: 1.5, castMax: 24,        // metres from your feet to the bobber
  autoMin: 3, autoMax: 16,          // with no aim: the first water this far along where you face
  minDepth: 0.25,                   // water at least this deep takes a hook
  poolR: 7,                         // a bobber this close to a pool's middle fishes the pool
  driftM: 2,                        // a step further than this from where you cast reels the line in
  graceMs: 350,                     // latency allowance on the bite window and the tug
  tugLateMs: 5000,                  // a tug not answered this long after it should have ended is lost
  fireM: 6, hearthM: 9,             // cooking: a fire / an innkeeper this close
  poolRespawnMs: [30000, 90000],    // a fished-out pool's replacement opens after this
  cookMax: 10,
  // owner feedback 7, V3 ("I've only seen the one right at the start" — 308 spots were listed and 94 open):
  liveShare: 0.6,                   // this share of a zone's listed spots is open at once (never fewer than E's meta.live)
  townReachM: 600,                  // a town with a listed spot this close keeps one always-open beginner pool (tier 1) there
  borderM: 130,                     // a spot this close outside a town's circle is in the town's room too (you see it from the gate)
});
const FIRE_TYPES = new Set(['campfire', 'hearth', 'cookfire', 'firepit', 'fire']);

export function createAngling({ layouts, online, provOf, grant, journal, questEvent = () => {}, consume, now, wallNow = () => Date.now(), log = () => {}, counters = {},
  safeRules = () => undefined, dayPhase = () => 'day', fighting = () => false, dismount = () => {}, endMeal = () => {}, wantSheet = () => {}, bagMax = 120, setTimeoutTicks = (fn) => fn(), opts = {} }) {
  const R = { ...ANGLING, ...opts };
  const first = layouts[0] || {};
  const D = first.angling || null;                     // { numbers, content, pools }
  const content = (D && D.content) || null;
  const F = D && D.numbers ? createFishing(D.numbers, content || {}) : null;
  const poolData = (D && D.pools) || null;
  const recipes = (content && content.recipes) || [];
  const meals = (content && content.meals) || {};
  const toolRows = new Map(((content && content.tools) || []).map(t => [t.id, t]));
  const baitRows = new Map(((content && content.bait) || []).map(b => [b.id, b]));
  const lines = new Set();                             // province records with a line out
  const reply = (o, t, x) => { if (o.conn) o.conn.sendJSON({ t, ...x }); };
  const fishR = (o, x) => reply(o, 'fishR', x);
  const refuse = (o, why, msg, extra = {}) => { fishR(o, { ok: false, state: 'idle', why, msg, ...extra }); };

  // ---- the saved record ----
  function stateOf(ch) {
    const a = ch.angling && typeof ch.angling === 'object' ? ch.angling : (ch.angling = {});
    a.xp = Math.max(0, +a.xp || 0); a.casts = a.casts | 0;
    a.catches = a.catches && typeof a.catches === 'object' ? a.catches : {};
    a.legends = Array.isArray(a.legends) ? a.legends : []; a.titles = Array.isArray(a.titles) ? a.titles : [];
    a.level = F ? F.levelOf(a.xp) : (a.level || 1);
    return a;
  }
  /** What the client gets as `you.angling` (never creates the record: a character who never fished sends level 1). */
  function view(ch) {
    const a = ch.angling && typeof ch.angling === 'object' ? ch.angling : null;
    const xp = a ? Math.max(0, +a.xp || 0) : 0, level = F ? F.levelOf(xp) : 1;
    return { level, xp, next: F ? F.next(level) : null, rank: F ? F.rank(level) : null, max: F ? F.maxLevel : 100, casts: a ? a.casts | 0 : 0,
      catches: a && a.catches ? a.catches : {}, legends: a && a.legends ? a.legends : [], titles: a && a.titles ? a.titles : [], bait: a && a.bait && a.bait.left > 0 ? { id: a.bait.id, name: a.bait.name, left: a.bait.left } : null };
  }
  function saved(o) { journal(o, 'set', { k: 'angling', v: o.char.angling }); o.dirty = true; }

  // ---- rods and bait (E's goods: `use {type:'rod', minSkill, bonus}` / `use {type:'bait', effect}`) ----
  const isRod = it => !!(it && ((it.use && it.use.type === 'rod') || toolRows.has(it.id)));
  const isBait = it => !!(it && ((it.use && it.use.type === 'bait') || baitRows.has(it.id)));
  const rodRow = it => { const t = toolRows.get(it.id) || {}; const u = it.use || {}; return { id: it.id, name: it.name || t.name || 'Rod', minSkill: u.minSkill ?? t.minSkill ?? 0, bonus: u.bonus || t.bonus || {} }; };
  /** The best rod in the bag this angler can use (else the least demanding one, so the refusal names it). */
  function rodOf(ch, level) {
    const rods = (ch.bag || []).filter(isRod).map(rodRow);
    if (!rods.length) return null;
    const usable = rods.filter(r => (r.minSkill || 0) <= level).sort((a, b) => (b.minSkill || 0) - (a.minSkill || 0));
    return usable[0] || rods.sort((a, b) => (a.minSkill || 0) - (b.minSkill || 0))[0];
  }

  // ---- water and pools ----
  const depthOf = w => (typeof w === 'number' ? w : (w && w.depth) || 0);
  function waterAt(room, x, z) {
    const t = room.terrain;
    if (!t || !t.waterAt) return null;
    const w = t.waterAt(x, z);
    return depthOf(w) >= R.minDepth ? { kind: (w && w.kind) || 'lake', depth: depthOf(w) } : null;
  }
  const zoneOf = (pv, x, z) => (pv && pv.L.zoneOf ? pv.L.zoneOf(x, z) : null);
  const zoneRow = (pv, wid) => (pv && (pv.L.zones || []).find(q => q.key === wid)) || null;
  /** What a baked water kind counts as in this zone (E's meta.<zone>.water: sea -> coast, a fen's lake -> marsh). */
  function waterKind(wid, baked) {
    const m = poolData && poolData.meta && poolData.meta[wid] && poolData.meta[wid].water;
    return (m && m[baked]) || (baked === 'sea' ? 'coast' : baked === 'none' ? 'river' : baked || 'river');
  }
  const poolSeen = new Set();        // room ids whose pools were opened
  const poolsIn = new Map();         // room id -> Map(spot id -> entity)
  /**
   * V3: every town with a listed spot within `townReachM` has ONE beginner pool: tier 1, never fished out, named for the town.
   * E's own choice wins (a spot with `town` + `always`); for a town E has not given one, the nearest listed spot is taken
   * (tier 1 first) and opened as tier 1. Worked out once per province.
   */
  const townPoolsOf = new Map();     // layout key -> Map(spot id -> town name)
  function townPools(pv) {
    let m = townPoolsOf.get(pv.L.key);
    if (m) return m;
    m = new Map();
    const all = poolData && poolData.zones ? Object.entries(poolData.zones).flatMap(([wid, list]) => (zoneRow(pv, wid) ? (list || []).map(sp => ({ ...sp, zone: wid })) : [])) : [];
    for (const t of pv.L.towns || []) {
      const mine = all.find(sp => sp.town && String(sp.town).toLowerCase() === String(t.name).toLowerCase() && (sp.always || sp.start));
      if (mine) { m.set(mine.id, t.name); continue; }
      let best = null, bd = Infinity;
      for (const sp of all) { if (m.has(sp.id)) continue; const d = Math.hypot(sp.x - t.x, sp.z - t.z) + (sp.tier === 1 ? 0 : 150); if (d < bd && Math.hypot(sp.x - t.x, sp.z - t.z) <= R.townReachM) { bd = d; best = sp; } }
      if (best) m.set(best.id, t.name);
    }
    townPoolsOf.set(pv.L.key, m);
    return m;
  }
  /** The listed spots a room holds: a wilds copy every spot of its zones; a town's room the ones in its circle + `borderM`. */
  const spotsOf = (pv, room) => {
    const out = [];
    if (!poolData || !poolData.zones) return out;
    const tp = townPools(pv);
    const ti = room.kind === 'town' ? pv.towns.indexOf(room) : -1, t = ti >= 0 ? pv.L.towns[ti] : null;
    for (const [wid, list] of Object.entries(poolData.zones)) {
      if (!zoneRow(pv, wid)) continue;
      for (const sp of list || []) {
        if (room.kind === 'town' ? !(t && Math.hypot(sp.x - t.x, sp.z - t.z) < t.r + R.borderM) : room.kind !== 'wilds') continue;
        const town = tp.get(sp.id) || null;
        out.push(town ? { ...sp, zone: wid, tier: 1, always: true, town } : { ...sp, zone: wid });
      }
    }
    return out;
  };
  function openPool(room, s) {
    const tier = Math.max(1, Math.min(3, s.tier | 0 || 1));
    const g = F ? F.pool(tier) : { minSkill: 1 };
    const always = !!(s.always || s.start);
    const left = always ? 99 : (F ? F.poolCatches(tier, () => room.host.random('fish')) : 5);
    const e = room.spawn({ kind: 'object', type: 'fishpool', name: s.town ? s.town + ' fish pool' : tier >= 3 ? 'Deep fish pool' : tier === 2 ? 'Busy fish pool' : 'Fish pool', x: s.x, z: s.z, team: 0,
      data: { key: 'pool:' + s.id, r: R.poolR, state: 'idle', pool: { id: s.id, tier, minSkill: g.minSkill, left, water: s.water || 'river', always, zone: s.zone, band: s.band || null, shore: s.shore || null, ...(s.shelf ? { shelf: true } : {}), ...(s.town ? { town: s.town } : {}) } } });
    let m = poolsIn.get(room.id); if (!m) { m = new Map(); poolsIn.set(room.id, m); }
    m.set(s.id, e);
    counters.poolsOpened = (counters.poolsOpened || 0) + 1;
    return e;
  }
  /**
   * Open a room's pools the first time anyone could see them. A WILDS copy: per zone, `liveShare` of the listed spots (never
   * fewer than E's `meta.<zone>.live`) — every always-open one (the start pool, each town's pool), then the beginner (tier-1)
   * and roadside spots first, so a walking newcomer SEES pools. A TOWN's room: every beginner spot in its reach.
   */
  function ensurePools(room) {
    if (!F || !poolData || poolSeen.has(room.id) || (room.kind !== 'wilds' && room.kind !== 'town')) return;
    poolSeen.add(room.id);
    const pv = provOf(room);
    if (!pv) return;
    const byZone = new Map();
    for (const s of spotsOf(pv, room)) (byZone.get(s.zone) || byZone.set(s.zone, []).get(s.zone)).push(s);
    for (const [wid, list] of byZone) {
      const must = list.filter(s => s.start || s.always);
      const rest = list.filter(s => !(s.start || s.always));
      if (room.kind === 'town') { for (const s of [...must, ...rest.filter(q => (q.tier | 0 || 1) === 1)]) openPool(room, s); continue; }
      const all = (poolData.zones[wid] || []).length;
      const live = Math.max(1, ((poolData.meta && poolData.meta[wid] && poolData.meta[wid].live) | 0) || 4, Math.ceil(all * R.liveShare));
      // a seeded shuffle: beginner pools first, roadside ones before the far bank
      const order = rest.map(s => ({ s, k: room.host.random('fish') + ((s.tier | 0 || 1) === 1 ? -1 : 0) + (s.road != null && s.road < 45 ? -0.5 : 0) })).sort((a, b) => a.k - b.k).map(x => x.s);
      for (const s of [...must, ...order].slice(0, Math.max(live, must.length))) openPool(room, s);
    }
  }
  function poolNear(room, x, z, r = R.poolR) {
    const m = poolsIn.get(room.id);
    if (!m) return null;
    let best = null, bd = r;
    for (const e of m.values()) { if (e.removed) continue; const d = Math.hypot(e.x - x, e.z - z); if (d <= bd) { bd = d; best = e; } }
    return best;
  }
  /** One catch out of a pool: at 0 it closes and another listed spot of its zone opens after a while. */
  function drain(room, pool) {
    const p = pool.data.pool;
    if (p.always) return p.left;
    p.left = Math.max(0, p.left - 1);
    pool.data = { ...pool.data, pool: { ...p } };
    pool.infoVer++;
    if (p.left > 0) return p.left;
    const m = poolsIn.get(room.id);
    if (m) m.delete(p.id);
    room.emit({ type: 'fx', kind: 'pool', id: pool.id, phase: 'gone', x: pool.x, z: pool.z });
    room.host.despawn(pool, 2500);
    counters.poolsFished = (counters.poolsFished || 0) + 1;
    const pv = provOf(room);
    const wait = R.poolRespawnMs[0] + room.host.random('fish') * (R.poolRespawnMs[1] - R.poolRespawnMs[0]);
    setTimeoutTicks(() => {
      if (room.removed || !pv) return;
      const live = poolsIn.get(room.id) || new Map();
      const free = spotsOf(pv, room).filter(s => s.zone === p.zone && !live.has(s.id) && s.id !== p.id);
      const pick = free.length ? free[Math.floor(room.host.random('fish') * free.length)] : spotsOf(pv, room).find(s => s.id === p.id);
      if (pick) openPool(room, pick);
    }, Math.max(1, Math.round(wait / 50)));
    return 0;
  }

  // ---- the line ----
  function stop(o, why = 'stopped', quiet = false) {
    const f = o.fishing;
    if (!f) return;
    o.fishing = null; lines.delete(o);
    const e = o.entity;
    if (e) { if (e.fishing) { e.fishing = null; e.infoVer++; } if (!e.dead && !e.removed) { e.busyUntil = 0; e.loop('idle'); } }
    if (o.room && e && !e.removed) o.room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: why === 'catch' ? 'catch' : why === 'lost' ? 'lost' : 'end', x: f.at.x, z: f.at.z });
    if (!quiet) fishR(o, { ok: true, state: 'idle', why });
  }
  function castAt(o, aim) {
    const e = o.entity, room = o.room;
    const pick = (x, z) => { const p = poolNear(room, x, z); if (p) return { x: p.x, z: p.z, pool: p }; const w = waterAt(room, x, z); return w ? { x, z, w } : null; };
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
      const d = Math.hypot(aim.x - e.x, aim.z - e.z);
      if (d > R.castMax + R.poolR) return { why: 'far', msg: 'That is too far to cast.' };
      let hit = pick(aim.x, aim.z);
      // a click just off the water's edge: the nearest water within 3 m of it
      for (let k = 0; !hit && k < 16; k++) { const a = k / 8 * Math.PI, r = k < 8 ? 1.5 : 3; hit = pick(aim.x + Math.cos(a) * r, aim.z + Math.sin(a) * r); }
      if (!hit) return { why: 'noWater', msg: 'Cast into water.' };
      if (Math.hypot(hit.x - e.x, hit.z - e.z) > R.castMax) return { why: 'far', msg: 'That is too far to cast.' };
      return hit;
    }
    // no aim: a pool in reach in front of you, else the first water along where you face (then a sweep to both sides)
    const near = poolNear(room, e.x, e.z, R.castMax);
    if (near) return { x: near.x, z: near.z, pool: near };
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const yaw = (e.yaw || 0) + turn, sx = Math.sin(yaw), sz = Math.cos(yaw);
      for (let d = R.autoMin; d <= R.autoMax; d += 1) { const hit = pick(e.x + sx * d, e.z + sz * d); if (hit) return hit; }
    }
    return { why: 'noWater', msg: 'There is no water in reach. Stand at the water\'s edge and face it.' };
  }
  function cast(o, m) {
    const e = o.entity, ch = o.char, room = o.room;
    if (!F) return refuse(o, 'notReady', 'Nothing bites on this server yet.');
    if (e.dead) return refuse(o, 'dead', 'You are dead.');
    if (e.state & STATE.swimming) return refuse(o, 'swim', 'Not while swimming.');
    if (e.airborne) return refuse(o, 'busy', 'Land first.');
    if (fighting(o, e)) return refuse(o, 'combat', 'Not while fighting.');
    const A = stateOf(ch);
    const rod = rodOf(ch, A.level);
    if (!rod) return refuse(o, 'noRod', 'You need a fishing rod. An angler by the water sells them.');
    if ((ch.bag || []).length >= (typeof bagMax === 'function' ? bagMax(o) : bagMax)) return refuse(o, 'bagFull', 'Your bag is full.');
    ensurePools(room);
    if (o.fishing) stop(o, 'recast', true);
    const hit = castAt(o, m.aim);
    if (hit.why) return refuse(o, hit.why, hit.msg);
    let pool = hit.pool || null, pd = pool ? pool.data.pool : null, note = null;
    let ok = F.canFish({ skill: A.level, pool: pd ? { tier: pd.tier } : null, rod });
    // V3: a pool above your skill does not close the water round it — the line lands beside it, as open water, and says so
    if (!ok.ok && pd && F.canFish({ skill: A.level, pool: null, rod }).ok) {
      note = 'That pool needs angling ' + (ok.need || pd.minSkill) + '. You cast beside it.';
      pool = null; pd = null; hit.pool = null;
      if (!hit.w) hit.w = waterAt(room, hit.x, hit.z) || { kind: 'river', depth: 1 };
      ok = { ok: true };
    }
    if (!ok.ok) return refuse(o, ok.why || 'skill', ok.text || 'You cannot fish here yet.', ok.need ? { need: ok.need } : {});
    const pv = provOf(room);
    const wid = zoneOf(pv, hit.x, hit.z), zr = zoneRow(pv, wid);
    const band = (pd && pd.band) || (zr && zr.sheet && zr.sheet.band) || [Math.max(1, (e.level || 1) - 1), (e.level || 1) + 1];
    const water = pd ? pd.water : waterKind(wid, hit.w ? hit.w.kind : 'river');
    if (o.mount) dismount(o, 'cast');
    if (e.sitting) endMeal(o, 'cast');
    const bait = A.bait && A.bait.left > 0 ? A.bait : null;
    const waitMs = Math.round(F.wait(() => room.host.random('fish'), { bait: bait ? bait.effect : null, pool: pd ? { tier: pd.tier } : null, rod }) * 1000);
    if (bait) { bait.left--; if (bait.left <= 0) A.bait = null; }
    A.casts++;
    const t = now();
    o.fishing = { state: 'wait', at: { x: Math.round(hit.x * 10) / 10, z: Math.round(hit.z * 10) / 10 }, from: { x: e.x, z: e.z }, room, pool, water, zone: wid, eid: (zr && (zr.eid || (zr.sheet && zr.sheet.id))) || wid, band, rod, bait: bait ? bait.effect : null,
      startedAt: t, biteAt: t + waitMs, biteUntil: 0, catch: null, tug: null, tugAt: 0 };
    lines.add(o);
    e.face(Math.atan2(hit.x - e.x, hit.z - e.z));
    e.fishing = { x: o.fishing.at.x, z: o.fishing.at.z }; e.infoVer++;
    e.busyUntil = 0; e.loop('fish');
    room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: 'cast', x: hit.x, z: hit.z, ...(pool ? { pool: pool.id } : {}) });
    counters.casts = (counters.casts || 0) + 1;
    fishR(o, { ok: true, state: 'wait', at: o.fishing.at, water, ...(pool ? { pool: pool.id, tier: pd.tier, left: pd.left } : {}), rod: rod.id, ...(bait ? { bait: { id: bait.id, left: bait.left } } : {}), ...(note ? { note, msg: note } : {}) });
  }
  function hook(o) {
    const f = o.fishing, e = o.entity, ch = o.char;
    if (!f) return fishR(o, { ok: false, state: 'idle', why: 'idle', msg: 'Cast first.' });
    const t = now();
    if (f.state === 'wait') { stop(o, 'early', true); return fishR(o, { ok: false, state: 'idle', why: 'early', msg: 'Too soon — you pulled the hook away. Wait for the float to dip.' }); }
    if (f.state !== 'bite') return;
    if (t > f.biteUntil + R.graceMs) { stop(o, 'lost', true); return fishR(o, { ok: false, state: 'idle', why: 'late', msg: 'Too late — it took the bait and left.' }); }
    const A = stateOf(ch), room = o.room, pd = f.pool && !f.pool.removed ? f.pool.data.pool : null;
    let c;
    try { c = F.roll({ water: f.water, band: f.band, time: dayPhase(), skill: A.level, zone: f.eid, pool: pd ? { tier: pd.tier } : null, rod: f.rod, bait: f.bait, caught: new Set(A.legends), rng: () => room.host.random('fish') }); }
    catch (err) { log('fishing roll failed', err && err.message); stop(o, 'lost', true); return fishR(o, { ok: false, state: 'idle', why: 'failed', msg: 'The line went slack.' }); }
    f.catch = c;
    if (c.kind === 'monster') return pullBack(o, c);
    const tug = F.tug(c, A.level, f.rod);
    if (!tug) return land(o, c);                      // junk comes straight in
    f.state = 'tug'; f.tug = tug; f.tugAt = t;
    e.fishing = { ...e.fishing, tug: 1 }; e.infoVer++;
    e.busyUntil = 0; e.loop('reel');
    room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: 'tug', x: f.at.x, z: f.at.z, rarity: tug.rarity, heft: tug.heft });
    reply(o, 'fishTug', { ...tug, hint: c.kind === 'crate' ? 'Something heavy and square.' : c.kind === 'legend' ? 'The rod bends double. This is no ordinary fish.' : tug.heft === 'huge' ? 'A monster of a fish!' : tug.heft === 'heavy' ? 'A heavy one.' : 'A light tug.' });
  }
  /** "Something pulls back": a water creature climbs out between the float and the angler and fights. */
  function pullBack(o, c) {
    const f = o.fishing, e = o.entity, room = o.room;
    const dx = f.at.x - e.x, dz = f.at.z - e.z, d = Math.max(0.1, Math.hypot(dx, dz));
    let x = e.x + dx / d * 3.5, z = e.z + dz / d * 3.5;
    if (!room.walkable(x, z)) { x = e.x + dx / d * 1.5; z = e.z + dz / d * 1.5; }
    if (!room.walkable(x, z)) { x = e.x; z = e.z; }
    const level = Math.max(1, Math.min(Math.max(f.band[0] || 1, e.level || 1), (f.band[1] || e.level || 1)));
    const A = stateOf(o.char);
    const add = F.xp(c, {}), g = F.gain({ xp: A.xp }, add);
    A.xp = g.xp; A.level = g.level; saved(o);
    stop(o, 'monster', true);
    let m = null;
    try { m = room.spawn({ kind: 'monster', type: c.monster.type, level, x, z, yaw: Math.atan2(e.x - x, e.z - z), rank: 'normal', data: { fished: o.char.id, noRank: true, path: [[e.x + 1, e.z], [e.x - 1, e.z]] } }); }
    catch (err) { log('pull-back spawn failed', err && err.message); }
    if (m) room.host.despawn(m, 5 * 60000);
    counters.pullBacks = (counters.pullBacks || 0) + 1;
    room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: 'monster', x: f.at.x, z: f.at.z, ...(m ? { monster: m.id } : {}) });
    reply(o, 'fishCatch', { ok: true, kind: 'monster', monster: m ? m.name : c.monster.type, monsterId: m ? m.id : 0, msg: c.say || 'Something pulls back.', skill: skillView(g) });
    reply(o, 'you', { angling: view(o.char) });
  }
  const skillView = g => ({ level: g.level, xp: g.xp, next: g.next, ...(g.up > 0 ? { up: g.up } : {}) });
  /** The catch is on the bank: into the bag, the journal, the skill, the pool, the quests. */
  function land(o, c) {
    const f = o.fishing, e = o.entity, ch = o.char, room = o.room;
    const A = stateOf(ch);
    const items = [];
    let title = null;
    if (c.kind === 'crate') {
      const spec = { ...(c.crate || { slot: 'any', min: 'uncommon' }), name: c.name || 'Sunken Crate', label: c.name || 'Sunken Crate' };
      const made = room.rules.makeCrate ? safeRules(room, 'makeCrate', e, spec) : null;
      items.push(made && typeof made === 'object' && made.name ? made : crateItem(spec, { name: c.name || 'Sunken Crate' }));
    } else {
      const it = F.item(c);
      if (it) { it.value = it.price; it.stack = 1; items.push(it); }
      if (c.kind === 'legend') {
        if (c.trophy && c.trophy.name) items.push({ id: 'trophy_' + c.id, kind: 'trophy', type: 'trophy', name: c.trophy.name, desc: c.trophy.desc || '', rarity: 'legendary', stack: 1, value: 1, price: 0, trophy: c.id });
        if (!A.legends.includes(c.id)) A.legends.push(c.id);
        if (c.title) { title = c.title; if (!A.titles.includes(c.title)) A.titles.push(c.title); }
      }
    }
    let first = false, best = false;
    if (c.kind === 'fish' || c.kind === 'legend') {
      const rec = A.catches[c.id] ||= { n: 0, best: 0, zone: f.zone, zones: [] };
      first = rec.n === 0;
      best = (c.size || 0) > (rec.best || 0);
      rec.n++; if (best) rec.best = c.size;
      if (f.zone && !rec.zones.includes(f.zone)) rec.zones.push(f.zone);
    }
    const add = F.xp(c, { first, best });
    const g = F.gain({ xp: A.xp }, add);
    A.xp = g.xp; A.level = g.level;
    saved(o);
    let poolLeft = null, poolId = null;
    const pool = f.pool && !f.pool.removed ? f.pool : null;
    if (pool && c.kind !== 'junk') { poolId = pool.id; poolLeft = drain(room, pool); }
    stop(o, 'catch', true);
    const added = grant(o, { items, gold: 0, reason: 'fish' }) || [];
    counters.catches = (counters.catches || 0) + 1;
    counters['catch_' + c.kind] = (counters['catch_' + c.kind] || 0) + 1;
    room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: 'landed', x: f.at.x, z: f.at.z, what: c.kind, rarity: c.rarity || undefined, ...(c.kind === 'legend' ? { legend: 1 } : {}) });
    reply(o, 'fishCatch', { ok: true, kind: c.kind, item: added[0] || null, items: added, species: c.kind === 'fish' || c.kind === 'legend' ? { id: c.id, name: c.name, rarity: c.rarity, ...(c.kind === 'legend' ? { legend: true } : {}) } : undefined,
      name: c.name, size: c.size || undefined, record: best && !first ? true : undefined, best: best || undefined, first: first || undefined, crate: c.kind === 'crate' ? true : undefined,
      xp: add, skill: skillView(g), ...(poolId != null ? { pool: { id: poolId, left: poolLeft } } : {}), ...(title ? { title } : {}), msg: c.say || (c.kind === 'junk' ? 'Not a fish.' : first ? 'A new one for the journal!' : undefined) });
    reply(o, 'you', { angling: view(ch) });
    if (g.up > 0) { reply(o, 'chat', { ch: 'system', from: 0, name: 'Angling', text: 'Your angling is now ' + g.level + (F.rank(g.level) ? ' (' + F.rank(g.level) + ')' : '') + '.' }); wantSheet(o); }
    if (c.kind === 'legend') room.emit({ type: 'say', id: e.id, text: ch.name + ' has landed ' + c.name + '!', style: 'bark' });
    // quests and jobs: E's `catch` steps (junk and crates are not fish)
    if (c.kind === 'fish' || c.kind === 'legend') questEvent(o, { kind: 'fish', species: c.id, rarity: c.rarity || 'common', zone: f.zone, water: f.water, legend: c.kind === 'legend', pool: !!pool, x: e.x, z: e.z });
  }
  function landOp(o, m) {
    const f = o.fishing;
    if (!f || f.state !== 'tug') return fishR(o, { ok: false, state: f ? f.state : 'idle', why: 'idle', msg: 'Nothing on the line.' });
    const t = now(), ran = t - f.tugAt;
    let score = Math.max(0, Math.min(1, Number.isFinite(m.held) ? m.held : Number.isFinite(m.score) ? m.score : 0));
    // a tug answered before it could have been played out only counts for the part that was played
    if (ran + R.graceMs < f.tug.ms) score *= Math.max(0, ran + R.graceMs) / f.tug.ms;
    if (F.lands(f.tug, score)) return land(o, f.catch);
    return lose(o, 'It slipped the hook.');
  }
  function lose(o, msg) {
    const f = o.fishing, c = f && f.catch;
    stop(o, 'lost', true);
    counters.fishLost = (counters.fishLost || 0) + 1;
    reply(o, 'fishCatch', { ok: false, lost: true, kind: c ? c.kind : undefined, species: c && (c.kind === 'fish' || c.kind === 'legend') ? { id: c.id, name: c.name, rarity: c.rarity } : undefined, msg, skill: (() => { const v = view(o.char); return { level: v.level, xp: v.xp, next: v.next }; })() });
  }

  function fish(o, m) {
    if (!FISH_OPS.includes(m.op)) return 'op';
    if (m.op === 'cast') return cast(o, m);
    if (m.op === 'hook') return hook(o);
    if (m.op === 'land') return landOp(o, m);
    if (o.fishing) stop(o, 'stopped'); else fishR(o, { ok: true, state: 'idle' });
  }

  /** Every tick: bites come, windows close, and a line whose angler moved, was hit, swims, died or left is reeled in. */
  function tick() {
    if (!lines.size) return;
    const t = now();
    for (const o of [...lines]) {
      const f = o.fishing, e = o.entity;
      if (!f) { lines.delete(o); continue; }
      const why = !e || e.removed || o.room !== f.room ? 'left' : e.dead ? 'dead' : (e.state & STATE.swimming) ? 'swim' : (o.lastHitAt || 0) > f.startedAt ? 'hit'
        : Math.hypot(e.x - f.from.x, e.z - f.from.z) > R.driftM ? 'moved' : !o.conn && f.state !== 'wait' ? 'left' : null;
      if (why) { stop(o, why); continue; }
      if (f.state === 'wait' && t >= f.biteAt) {
        const ms = F.biteMs(stateOf(o.char).level);
        f.state = 'bite'; f.biteUntil = t + ms;
        f.room.emit({ type: 'fx', kind: 'fish', id: e.id, phase: 'bite', x: f.at.x, z: f.at.z });
        reply(o, 'fishBite', { ms });
      } else if (f.state === 'bite' && t > f.biteUntil + R.graceMs) {
        stop(o, 'lost', true);
        fishR(o, { ok: false, state: 'idle', why: 'late', msg: 'It took the bait and left.' });
      } else if (f.state === 'tug' && t > f.tugAt + f.tug.ms + R.tugLateMs) lose(o, 'It broke the line.');
    }
  }

  // ---- rods and bait used from the bag (`item {op:'use'}`) ----
  /** Returns true when `item` was an angling item and has been handled (R = the itemR reply). */
  function useItem(o, item, idx, Rr) {
    if (isRod(item)) { Rr({ ok: true, id: item.id, fish: true }); cast(o, {}); return true; }
    if (!isBait(item)) return false;
    const row = baitRows.get(item.id) || {};
    const effect = (item.use && item.use.effect) || row.effect || {};
    const A = stateOf(o.char);
    A.bait = { id: item.id, name: item.name || row.name || 'Bait', effect, left: Math.max(1, effect.casts | 0 || 10) };
    consume(o, idx);
    saved(o);
    Rr({ ok: true, id: item.id, msg: (item.name || 'Bait') + ' on the hook: ' + A.bait.left + ' casts.' });
    reply(o, 'you', { angling: view(o.char) });
    return true;
  }

  // ---- cooking ----
  const isFire = obj => !!(obj && obj.data && ((obj.data.trace && obj.data.trace.kind === 'campfire') || FIRE_TYPES.has(obj.type) || (obj.data.npc && obj.data.npc.role === 'innkeeper') || (obj.data.site && /camp/.test(String(obj.data.site.kind || '')) && obj.data.site.fire)));
  function fireNear(o) {
    const e = o.entity;
    for (const x of o.room.host.near(e.x, e.z, R.hearthM, q => q.kind === 'object' || q.kind === 'npc')) {
      if (!isFire(x)) continue;
      const lim = x.kind === 'npc' ? R.hearthM : R.fireM;
      if (Math.hypot(x.x - e.x, x.z - e.z) <= lim) return x;
    }
    return null;
  }
  const fishCounts = ch => { const c = {}; for (const it of ch.bag || []) if (it && it.kind === 'fish' && !it.legend) { const id = it.species || it.id; c[id] = (c[id] || 0) + 1; } return c; };
  function recipeView(rc, counts, level) {
    const r = F.canCook(rc, counts, level);
    const meal = meals[rc.makes] || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { id: rc.id, name: rc.name, desc: rc.desc || '', skill: rc.skill || 0, can: !!r.ok, ...(r.ok ? {} : { why: r.text || 'You cannot cook that yet.' }),
      needs: (rc.needs || []).map(nd => { const sp = nd.fish ? F.species(nd.fish) : null; return { id: nd.fish || nd.tag || 'any', name: sp ? sp.name : nd.fish ? nd.fish : (nd.tag && nd.tag !== 'any' ? nd.tag + ' fish' : 'any fish'), n: nd.count || 1, have: nd.fish ? (counts[nd.fish] || 0) : total, ...(nd.tag ? { tag: nd.tag } : {}) }; }),
      makes: { id: rc.makes, name: meal.name || rc.name, text: meal.desc || '', desc: meal.desc || '' } };
  }
  function cook(o, m) {
    const ch = o.char, e = o.entity;
    const op = m.op || (m.id ? 'make' : 'list');
    if (op !== 'list' && op !== 'make') return 'op';
    if (!F) { reply(o, op === 'list' ? 'cookList' : 'cookR', { ok: false, fire: false, recipes: [], why: 'notReady', msg: 'Nobody cooks on this server yet.' }); return; }
    const A = stateOf(ch), fire = fireNear(o), counts = fishCounts(ch);
    if (op === 'list') return reply(o, 'cookList', { ok: true, fire: !!fire, fireName: fire ? fire.name : null, level: A.level, recipes: recipes.map(rc => recipeView(rc, counts, A.level)) });
    const Rr = x => reply(o, 'cookR', { id: m.id, ...x });
    if (e.dead) return Rr({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (fighting(o, e)) return Rr({ ok: false, why: 'combat', msg: 'Not while fighting.' });
    if (!fire) return Rr({ ok: false, why: 'fire', msg: 'You need a fire: a campfire, or the hearth of an inn.' });
    const rc = recipes.find(x => x.id === m.id || x.makes === m.id);
    if (!rc) return Rr({ ok: false, why: 'recipe', msg: 'No such recipe.' });
    const meal = meals[rc.makes];
    if (!meal) return Rr({ ok: false, why: 'recipe', msg: 'Nobody remembers how that is made.' });
    if (o.fishing) stop(o, 'cook');
    const made = [];
    const want = Math.max(1, Math.min(R.cookMax, m.n | 0 || 1));
    let why = null;
    for (let k = 0; k < want; k++) {
      const r = F.canCook(rc, fishCounts(ch), A.level);
      if (!r.ok) { why = r; break; }
      // the fish that go in the pan: for each species, the cheapest ones first
      let gone = 0;
      for (const [sp, n] of Object.entries(r.uses || {})) {
        for (let i = 0; i < n; i++) {
          let bi = -1;
          ch.bag.forEach((it, j) => { if (it && it.kind === 'fish' && !it.legend && (it.species || it.id) === sp && (bi < 0 || (it.price || 0) < (ch.bag[bi].price || 0))) bi = j; });
          if (bi >= 0) { consume(o, bi); gone++; }
        }
      }
      if (!gone) { why = { text: 'You have no fish for that.' }; break; }
      made.push({ kind: 'good', id: rc.makes, name: meal.name || rc.name, desc: meal.desc || '', rarity: 'normal', stack: 1, cooked: true, value: economy().cook.mealValue, ...(meal.use ? { use: meal.use } : {}) });
    }
    if (!made.length) return Rr({ ok: false, why: (why && why.why) || 'fish', msg: (why && why.text) || 'You cannot cook that.' });
    const added = grant(o, { items: made, gold: 0, reason: 'cook' }) || [];
    counters.cooked = (counters.cooked || 0) + made.length;
    if (e && !e.dead) e.anim('interact');
    o.room.emit({ type: 'fx', kind: 'cook', id: e.id, at: fire.id, x: fire.x, z: fire.z });
    for (let k = 0; k < made.length; k++) questEvent(o, { kind: 'cook', recipe: rc.id, meal: rc.makes, x: e.x, z: e.z });
    Rr({ ok: true, item: added[0] || null, items: added, n: made.length, msg: 'You cook ' + (made.length > 1 ? made.length + ' x ' : '') + (meal.name || rc.name) + '.' });
    reply(o, 'cookList', { ok: true, fire: true, fireName: fire.name, level: A.level, recipes: recipes.map(x => recipeView(x, fishCounts(ch), A.level)) });
  }

  return {
    fish, cook, tick, stop, view, isFire, useItem, isRod, isBait, ensurePools, poolNear, poolsIn, lines, F, R,
    npcExtra: (o, obj) => (obj && obj.data && obj.data.npc && obj.data.npc.role === 'angler' ? { angler: true, angling: view(o.char) } : {}),
    /** Tests: the fish list for a spot. */
    listAt(room, x, z, skill = 1) { const pv = provOf(room), wid = zoneOf(pv, x, z), zr = zoneRow(pv, wid); const w = waterAt(room, x, z); return F && w ? F.listFor({ water: waterKind(wid, w.kind), band: (zr && zr.sheet && zr.sheet.band) || 1, time: dayPhase(), skill }) : []; },
  };
}
