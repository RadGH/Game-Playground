// WANDERING PACKS in a wilds copy (owner 2026-10-16: "groups or parties of mobs, either the same mobs or an assortment,
// sometimes led by an elite … they would not stick to one place but would wander around … at least 5 enemies … up to 10
// … feel more like an action RPG … the world should be more alive, and more dangerous"). Pure: no DOM, no Node APIs.
//
//   const P = createPacks({ room, routes, comps, rules, rng, bandAt, isNight, now, onWipe, log })
//   P.step(dtMs)                 every tick (one SLICE of the packs per call, like travellers.js)
//   P.onHit(ev)                  a room `hit` event: who is fighting which pack (crowd size + who shares the spoils)
//   P.packs                      [pack]   P.stats()   P.dispose()   P.packOf(entity) -> pack | null
//
// HOW IT RUNS (the travellers' trick). A pack is a point on its ROUTE (data/provinces/<p>-pack-routes.json, made by
// tools/content-packs.mjs from js/sim/pack-routes.js): distance `s` along it, a direction, walking at its pace and
// stopping at the route's rest points. That is cheap arithmetic for every pack in the province. Its bodies only EXIST
// as room monsters while a player is within MATERIAL_R; it is put away again (survivors remembered, health and all)
// when nobody has been near for PARK_MS and it is not fighting. While it exists the RULES walk it (js/rules/packs.js,
// monster-ai.js): the leader walks the route, the others keep their places round it, the whole pack wakes when one
// member fights and leashes together.
//
// WHAT A PACK DOES AT A REST (its composition's `doing`, data/provinces/packs.json):
//   hunt    a deer (goat on Vharlen) breaks cover ahead and the pack runs it down; then it feeds round the carcass
//   graze   it spreads out and noses about
//   camp    a fire is lit and the crew sits round it (the fire is a real campfire you can cook at once they are gone)
//   rite    the band stands in a ring round its leader
//   march   it never rests: a slow column
// A rest lasts `restSec`; a pack in a fight never rests; a pack whose leader fell picks a new walker when it is calm.
// When every member is dead the pack's spoils are left where it fell (onWipe: the province's chest, only for those who
// fought it), and a new pack forms on the same route `respawnMin` minutes later, out of everyone's sight.

import { polyline } from './travellers.js';

export const MATERIAL_R = 220;      // a pack's bodies exist while a player is this close to its head
export const PARK_MS = 30000;       // ...and are put away when nobody has been within MATERIAL_R + 60 for this long
export const SLICES = 4;
export const MAKE_PER_STEP = 2;
export const SPAWN_CLEAR_M = 250;   // a NEW pack (after a wipe) forms at least this far from every player
export const PACK_DEFAULTS = Object.freeze({
  member: { hp: 0.45, dmg: 0.3, reward: 0.45 },  // a member against a lone monster of its kind (data/provinces/packs.json wins)
  leader: { hp: 0.6, dmg: 0.55, reward: 1 },     // the leader against a champion of its kind (its rank's own numbers on top)
  size: [5, 10],                                  // bodies in a pack, leader included
  crowdPerPlayer: 0.5, crowdCap: 10,              // health x (1 + 0.5 (n - 1)) for n players fighting it
  restSec: [22, 40], respawnMin: [6, 10], regrowMin: 4, pace: 0.45, speedMps: 1.8,
  leaderChance: 0.65, starterLeaderLevel: 3, starterMinLevel: 2,
});

const pickIn = (rng, r, d = 1) => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : (r ?? d));
const TAU = Math.PI * 2;

export function createPacks({ room, routes = [], comps = {}, rules = {}, rng = Math.random, bandAt = () => [1, 4], isNight = () => false, now = () => room.now(), onWipe = null, onPull = null, log = () => {}, uidPrefix = 'pk' } = {}) {
  const K = { ...PACK_DEFAULTS, ...(rules || {}), member: { ...PACK_DEFAULTS.member, ...((rules && rules.member) || {}) }, leader: { ...PACK_DEFAULTS.leader, ...((rules && rules.leader) || {}) } };
  const packs = [];
  let nextId = 1, phaseN = 0, t = 0;
  const counters = { materialised: 0, parked: 0, wiped: 0, reformed: 0, rests: 0, hunts: 0, kills: 0, fires: 0, pulls: 0 };
  const lines = routes.filter(r => Array.isArray(r.pts) && r.pts.length >= 2).map(r => {
    const pts = r.loop ? [...r.pts, r.pts[0]] : r.pts;
    const line = polyline(pts);
    // the distance along the line of every rest waypoint
    const cum = [0]; for (let i = 1; i < line.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(line.pts[i].x - line.pts[i - 1].x, line.pts[i].z - line.pts[i - 1].z));
    return { ...r, line, cum, restS: (r.rests || []).map(i => cum[i]).filter(Number.isFinite) };
  });

  // ---------------------------------------------------------------- composing a pack
  function compFor(route) {
    // tools/content-packs.mjs lists the compositions that may walk a route with their weights (the zone's own kinds, liked ground first)
    const W = route.comps && typeof route.comps === 'object' && !Array.isArray(route.comps) ? route.comps : null;
    const ids = (W ? Object.keys(W) : Array.isArray(route.comps) ? route.comps : Object.keys(comps)).filter(id => comps[id] && (!comps[id].night || isNight()) && (!comps[id].day || !isNight()));
    if (!ids.length) return null;
    const wt = id => (W ? W[id] : comps[id].weight || 1) || 0;
    const total = ids.reduce((a, id) => a + wt(id), 0);
    let x = rng() * total;
    for (const id of ids) { x -= wt(id); if (x <= 0) return id; }
    return ids[ids.length - 1];
  }
  function roll(pk) {
    const C = comps[pk.comp] || {};
    const at = pk.route.line.at(pk.s);
    const band = bandAt(at.x, at.z) || [1, 4];
    const starter = band[0] <= 1;
    let level = Math.max(starter ? K.starterMinLevel : 1, pickIn(rng, band));
    const members = [];
    const lead = C.leader && !(pk.route.noLead || []).includes(pk.comp) && rng() < (C.leader.chance ?? K.leaderChance) && (!starter || level >= K.starterLeaderLevel) ? C.leader : null;
    for (const m of C.members || []) { const n = pickIn(rng, m.count, 1); for (let i = 0; i < n; i++) members.push({ type: m.type, role: m.role || null }); }
    // 5 to 10 bodies, leader included (a small pack fills up with its first kind; a big one is cut from the end)
    const [lo, hi] = C.size || K.size;
    const want = Math.max(lo - (lead ? 1 : 0), Math.min(hi - (lead ? 1 : 0), members.length));
    while (members.length < want) members.push({ ...members[0] || { type: (C.members || [{}])[0].type } });
    members.length = want;
    pk.level = level;
    pk.lead = lead ? { type: lead.type || members[0].type, rank: lead.rank || 'champion', affixes: (lead.affixes || ['packleader']).slice(0, 2), name: leaderName(lead), title: lead.title || null, level: Math.min(band[1] + 1, level + 1) } : null;
    pk.members = members.map((m, i) => ({ ...m, i, deadAt: null }));
    pk.leadDeadAt = null;
    pk.name = C.name || 'A pack';
  }
  function leaderName(L) {
    const names = L.names || [];
    const base = names.length ? names[Math.floor(rng() * names.length)] : 'the Old One';
    const eps = L.epithets || [];
    return eps.length && rng() < 0.5 ? base + ' the ' + eps[Math.floor(rng() * eps.length)] : base;
  }
  function newPack(route, s = null) {
    const pk = { id: nextId++, uid: `${uidPrefix}${room.id}:${nextId - 1}`, route, s: s ?? rng() * route.line.length, dir: rng() < 0.5 ? 1 : -1, comp: null, live: false, ents: [],
      restUntil: 0, nextRest: 0, resting: null, lastNear: -Infinity, fighting: false, contrib: new Map(), tappers: new Set(), crowd: 1, respawnAt: 0, gone: false, pulledAt: 0, said: 0 };
    if (route.loop) pk.dir = 1;
    pk.comp = compFor(route);
    if (!pk.comp) return null;
    roll(pk);
    packs.push(pk);
    return pk;
  }
  for (const r of lines) newPack(r);

  // ---------------------------------------------------------------- bodies
  const players = () => { const out = []; for (const c of room.clients.values()) if (c.entity && !c.entity.dead && !c.entity.removed) out.push(c.entity); if (!room.clients.size) for (const e of room.entities.values()) if (e.kind === 'player' && !e.dead) out.push(e); return out; };
  function nearest(ps, x, z, r) {
    let best = Infinity;
    for (const p of ps) { const dx = p.x - x, dz = p.z - z; if (dx > r || dx < -r || dz > r || dz < -r) continue; const d = Math.hypot(dx, dz); if (d < best) best = d; }
    return best;
  }
  /** Where member i stands in its pack's walking order. */
  function slotOf(C, i) {
    const f = C.formation || 'wedge', row = Math.floor(i / 2) + 1, side = i % 2 ? 1 : -1;
    if (f === 'column') return { back: 2.4 * row, side: side * 1.05 };
    if (f === 'loose') { const a = (i * 2.399) % TAU, r = 3 + (i % 3) * 2.2; return { back: Math.abs(Math.cos(a)) * r + 1.5, side: Math.sin(a) * r }; }
    return { back: 2.1 * row, side: side * 1.5 * row };
  }
  function nextIndex(pk) {
    const L = pk.route.line, cum = pk.route.cum;
    let seg = 0; while (seg < cum.length - 2 && cum[seg + 1] <= pk.s) seg++;
    if (pk.route.loop) return (seg + 1) % (L.pts.length - 1);
    return pk.dir > 0 ? Math.min(seg + 1, L.pts.length - 1) : seg;
  }
  function materialise(pk) {
    if (pk.live || pk.gone) return;
    const C = comps[pk.comp] || {};
    const head = pk.route.line.at(pk.s);
    const yaw = pk.dir > 0 ? head.yaw : head.yaw + Math.PI;
    const tNow = now();
    const regrow = K.regrowMin * 60000;
    const data = (extra) => ({ noRank: true, pack: { id: pk.uid, ...extra }, ...(pk.event ? { event: pk.event, leash: pk.leash || undefined } : {}) });      // an event's pack (the warlord's march) carries the event
    pk.ents = [];
    const ok = (x, z) => !room.walkable || room.walkable(x, z);
    const place = (back, side) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      let x = head.x - fx * back + fz * side, z = head.z - fz * back - fx * side;
      if (!ok(x, z)) { x = head.x; z = head.z; }
      return { x, z };
    };
    let leader = null;
    if (pk.lead && !(pk.leadDeadAt != null && tNow - pk.leadDeadAt < regrow)) {
      pk.leadDeadAt = null;
      const L = pk.lead;
      leader = room.spawn({ kind: 'monster', type: L.type, level: L.level, x: head.x, z: head.z, yaw, rank: L.rank, name: L.name,
        data: { ...data({ lead: true, hp: K.leader.hp, dmg: K.leader.dmg, reward: K.leader.reward, fall: C.onLeaderFall || 'rout', name: L.name, title: L.title || (C.name ? 'Leads the ' + C.name.replace(/^an? /i, '').toLowerCase() : null), comp: pk.comp }), affixes: L.affixes, path: pk.route.pts } });
      pk.ents.push({ e: leader, lead: true });
    }
    for (const m of pk.members) {
      if (m.deadAt != null && tNow - m.deadAt < regrow) continue;
      m.deadAt = null;
      const sl = slotOf(C, m.i), p = place(sl.back, sl.side);
      const e = room.spawn({ kind: 'monster', type: m.type, level: pk.level, x: p.x, z: p.z, yaw, data: data({ hp: K.member.hp, dmg: K.member.dmg, reward: K.member.reward, comp: pk.comp }) });
      pk.ents.push({ e, m });
    }
    if (!pk.ents.length) { pk.gone = true; return; }
    pk.live = true; pk.fighting = false; pk.resting = null; counters.materialised++;
    if (pk.crowd > 1) for (const x of pk.ents) grow(x.e, 1 + K.crowdPerPlayer * (pk.crowd - 1));
    link(pk);
  }
  /** The walker (leader, else the first living member) walks the route; the rest follow it. */
  function link(pk) {
    const C = comps[pk.comp] || {};
    const alive = pk.ents.filter(x => alive_(x.e));
    if (!alive.length) return;
    let w = alive.find(x => x.lead) || alive[0];
    const wu = w.e.r && w.e.r.unit;
    if (!wu) return;
    pk.walker = w.e;
    const pts = pk.route.pts.map(([x, z]) => ({ x, z }));
    wu.patrol = { pts, i: nextIndex(pk) % pts.length, pingpong: !pk.route.loop, dir: pk.dir, pace: pk.pace ?? C.pace ?? K.pace, reached: 0, hold: false };
    pk.reached = 0;
    wu.follow = null;
    let k = 0;
    for (const x of alive) { if (x === w) continue; const u = x.e.r && x.e.r.unit; if (!u) continue; u.patrol = null; u.follow = { id: w.e.id, ...slotOf(C, k++) }; }
  }
  const alive_ = e => e && !e.dead && !e.removed;
  function park(pk) {
    if (!pk.live) return;
    // where it got to: the nearest point of the route to its walker, searched round where it was
    const w = alive_(pk.walker) ? pk.walker : pk.ents.map(x => x.e).find(alive_);
    if (w) pk.s = projectS(pk, w.x, w.z);
    if (pk.walker && pk.walker.r && pk.walker.r.unit && pk.walker.r.unit.patrol) pk.dir = pk.walker.r.unit.patrol.dir || pk.dir;
    for (const x of pk.ents) if (x.e && !x.e.removed && !x.e.dead) room.remove(x.e);
    endRest(pk);
    pk.ents = []; pk.walker = null; pk.live = false; counters.parked++;
  }
  function projectS(pk, x, z) {
    const L = pk.route.line, cum = pk.route.cum;
    let best = pk.s, bd = Infinity;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
      const f = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
      const d = Math.hypot(a.x + ex * f - x, a.z + ez * f - z);
      if (d < bd) { bd = d; best = cum[i - 1] + Math.sqrt(l2) * f; }
    }
    return best;
  }
  function grow(e, k) {
    const u = e && e.r && e.r.unit;
    if (!u || !(k > 0) || k === 1) return;
    u.maxHp = Math.max(1, Math.round(u.maxHp * k)); u.hp = Math.max(1, Math.round(u.hp * k));
    e.setMax(u.maxHp, 0); e.setHp(u.hp);
  }

  // ---------------------------------------------------------------- resting
  function startRest(pk) {
    const C = comps[pk.comp] || {};
    const doing = C.doing || 'graze';
    if (doing === 'march') return;
    const w = pk.walker, wu = w && w.r && w.r.unit;
    if (!wu || !wu.patrol) return;
    const secs = (K.restSec[0] + rng() * (K.restSec[1] - K.restSec[0])) * (C.restK || 1);
    pk.resting = { doing, until: now() + secs * 1000, x: w.x, z: w.z, fire: null, prey: null, fed: false };
    counters.rests++;
    wu.patrol.hold = true; wu.patrol.face = null; wu.patrol.anim = null;
    const mates = pk.ents.filter(x => alive_(x.e) && x.e !== w);
    const ring = (r, cx, cz, faceIn, anim) => mates.forEach((x, i) => { const u = x.e.r && x.e.r.unit; if (!u) return; const a = i / Math.max(1, mates.length) * TAU + 0.4; const at = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; u.follow = { ...(u.follow || { id: w.id }), at, face: faceIn ? Math.atan2(cx - at.x, cz - at.z) : rng() * TAU, anim: anim && (i % 2 === 0) ? anim : null }; });
    if (doing === 'camp') {
      const fx = w.x + Math.sin(wu.facing || 0) * 3.2, fz = w.z + Math.cos(wu.facing || 0) * 3.2;
      if (!room.walkable || room.walkable(fx, fz)) {
        pk.resting.fire = room.spawn({ kind: 'object', type: 'campfire', name: C.fireName || 'A campfire', x: fx, z: fz, team: 0, data: { state: 'idle', trace: { kind: 'campfire', who: null, at: 0, until: 0 }, packFire: pk.uid } });
        counters.fires++;
      }
      ring(3.4, fx, fz, true, C.sit || 'sit');
      wu.patrol.face = Math.atan2(fx - w.x, fz - w.z);
    } else if (doing === 'rite') {
      ring(4.2, w.x, w.z, true, null);
    } else if (doing === 'hunt' && C.prey) {
      // the quarry breaks cover 18-26 m ahead of the pack and runs; the pack runs it down
      const a = (wu.facing || 0) + (rng() - 0.5) * 1.2, d = 18 + rng() * 8;
      const px = w.x + Math.sin(a) * d, pz = w.z + Math.cos(a) * d;
      if (!room.walkable || room.walkable(px, pz)) {
        const prey = room.spawn({ kind: 'monster', type: C.prey, level: Math.max(1, pk.level - 1), x: px, z: pz, yaw: a, data: { noRank: true, pack: { id: pk.uid, prey: true, speed: C.preySpeed || 3.4 } } });
        pk.resting.prey = prey; counters.hunts++;
        for (const x of pk.ents) { const u = x.e.r && x.e.r.unit; if (u && alive_(x.e)) u.huntOn = prey.id; }
        pk.resting.until = now() + 45000;        // a hunt runs until the kill (or 45 s), then the feed
      } else ring(5, w.x, w.z, false, null);
    } else {
      // graze: spread out round the rest point, each nosing about its own spot
      mates.forEach(x => { const u = x.e.r && x.e.r.unit; if (!u) return; const a = rng() * TAU, r = 3 + rng() * 6; u.follow = { ...(u.follow || { id: w.id }), at: { x: w.x + Math.cos(a) * r, z: w.z + Math.sin(a) * r }, face: rng() * TAU, anim: null }; });
    }
  }
  function endRest(pk) {
    const R = pk.resting;
    if (!R) return;
    if (R.fire && !R.fire.removed) room.remove(R.fire);
    if (R.prey && !R.prey.removed && !R.prey.dead) room.remove(R.prey);
    pk.resting = null;
    for (const x of pk.ents) { const u = x.e && x.e.r && x.e.r.unit; if (!u) continue; u.huntOn = null; if (u.follow) { delete u.follow.at; delete u.follow.face; delete u.follow.anim; } }
    const wu = pk.walker && pk.walker.r && pk.walker.r.unit;
    if (wu && wu.patrol) { wu.patrol.hold = false; wu.patrol.face = null; wu.patrol.anim = null; }
  }
  function restTick(pk) {
    const R = pk.resting;
    if (!R) return;
    if (R.doing === 'hunt' && R.prey) {
      if ((R.prey.dead || R.prey.removed) && !R.fed) {
        // the kill: the pack gathers round the carcass and feeds a while
        R.fed = true; counters.kills++;
        const cx = R.prey.x, cz = R.prey.z;
        const list = pk.ents.filter(x => alive_(x.e));
        list.forEach((x, i) => { const u = x.e.r && x.e.r.unit; if (!u) return; u.huntOn = null; const a = i / Math.max(1, list.length) * TAU; const at = { x: cx + Math.cos(a) * 1.9, z: cz + Math.sin(a) * 1.9 }; if (u.patrol) { u.patrol.hold = true; u.patrol.face = Math.atan2(cx - x.e.x, cz - x.e.z); } else u.follow = { ...(u.follow || {}), id: (pk.walker || x.e).id, at, face: Math.atan2(cx - at.x, cz - at.z) }; });
        R.until = now() + 18000;
      }
      if (R.fed && rng() < 0.08) { const x = pk.ents[Math.floor(rng() * pk.ents.length)]; if (x && alive_(x.e)) x.e.anim('bite'); }
    }
    if (R.doing === 'rite' && rng() < 0.05) { const x = pk.ents[Math.floor(rng() * pk.ents.length)]; if (x && alive_(x.e)) x.e.anim('cast'); }
    if (now() >= R.until) { endRest(pk); pk.nextRestAfter = now() + 20000; }
  }

  // ---------------------------------------------------------------- the step
  function step(dtMs) {
    t = now();
    const slice = phaseN++ % SLICES;
    const dt = dtMs * SLICES / 1000;
    const ps = players();
    let made = 0;          // at most MAKE_PER_STEP packs get their bodies in one tick (a teleport into a busy valley spreads over a few ticks)
    for (const pk of packs) {
      if (pk.id % SLICES !== slice) continue;
      const C = comps[pk.comp] || {};
      // a wiped pack waits, then a new one forms on the route out of everyone's sight
      if (pk.gone) {
        if (t < pk.respawnAt) continue;
        const L = pk.route.line;
        let s = null;
        for (let k = 0; k < 8 && s == null; k++) { const c = rng() * L.length, h = L.at(c); if (nearest(ps, h.x, h.z, SPAWN_CLEAR_M) >= SPAWN_CLEAR_M) s = c; }
        if (s == null) { pk.respawnAt = t + 20000; continue; }
        pk.s = s; pk.gone = false; pk.comp = compFor(pk.route) || pk.comp; roll(pk); pk.contrib.clear(); pk.tappers.clear(); pk.crowd = 1; counters.reformed++;
        continue;
      }
      if (!pk.live) {
        // on paper: walk the route, rest at its rest points
        if (t < pk.restUntil) { /* resting */ }
        else {
          const L = pk.route.line, v = (C.speedMps || K.speedMps) * (C.pace ?? K.pace) / K.pace * dt;
          const before = pk.s;
          if (pk.route.loop) pk.s = (pk.s + v) % L.length;
          else { pk.s += pk.dir * v; if (pk.s >= L.length) { pk.s = L.length; pk.dir = -1; } else if (pk.s <= 0) { pk.s = 0; pk.dir = 1; } }
          if (C.doing !== 'march') for (const rs of pk.route.restS) if ((before < rs && pk.s >= rs) || (before > rs && pk.s <= rs)) { pk.restUntil = t + (K.restSec[0] + rng() * (K.restSec[1] - K.restSec[0])) * 1000; break; }
        }
        const h = pk.route.line.at(pk.s);
        if (nearest(ps, h.x, h.z, MATERIAL_R) <= MATERIAL_R && made < MAKE_PER_STEP) { pk.lastNear = t; materialise(pk); made++; }
        continue;
      }
      // ---- live: the rules walk it; here we watch it
      const live = pk.ents.filter(x => alive_(x.e));
      for (const x of pk.ents) if (!alive_(x.e) && !x.noted) {
        x.noted = true;
        if (x.m) x.m.deadAt = t;
        if (!x.lead) continue;
        pk.leadDeadAt = t;
        // the leader is down: say what the pack does (the rules rout or madden it — js/rules/packs.js)
        const mate = live.find(y => !y.lead);
        if (mate) { const fall = C.onLeaderFall || 'rout'; room.emit({ type: 'say', id: mate.e.id, text: (C.says && C.says.fall) || (fall === 'enrage' ? `With ${pk.lead.name} down, the ${String(pk.name).toLowerCase()} turns savage!` : `With ${pk.lead.name} down, the ${String(pk.name).toLowerCase()} breaks and scatters!`), style: 'emote' }); }
      }
      if (!live.length) { wipe(pk); continue; }
      const fighting = live.some(x => x.e.r && x.e.r.unit && (x.e.r.unit.state === 'chase' || x.e.r.unit.state === 'return'));
      if (fighting && !pk.fighting) { pk.pulledAt = t; counters.pulls++; endRest(pk); pull(pk); }
      pk.fighting = fighting;
      // a walker that fell: when it is calm, the next one takes the route
      if (!fighting && (!alive_(pk.walker) || !(pk.walker.r && pk.walker.r.unit && pk.walker.r.unit.patrol))) link(pk);
      // the walker's route position (so the pack is where it was when it is put away)
      const w = pk.walker;
      if (w && alive_(w) && !fighting) {
        pk.s = projectS(pk, w.x, w.z);
        const P = w.r && w.r.unit && w.r.unit.patrol;
        if (P && P.reached !== pk.reached) {
          pk.reached = P.reached;
          const at = P.pingpong ? P.i - (P.dir || 1) : (P.i - 1 + P.pts.length) % P.pts.length;      // the waypoint it just reached
          if (!pk.resting && (pk.route.rests || []).includes(at) && C.doing !== 'march' && !(t < (pk.nextRestAfter || 0))) startRest(pk);
        }
      }
      if (pk.resting && !fighting) restTick(pk);
      const head = w && alive_(w) ? w : live[0].e;
      const d = nearest(ps, head.x, head.z, MATERIAL_R + 60);
      if (d <= MATERIAL_R + 60) pk.lastNear = t;
      else if (t - pk.lastNear > PARK_MS && !fighting) park(pk);
      // a line now and then for a player who comes close (a crew at its fire, a cult at its rite)
      if (C.says && C.says.near && !fighting && d < 34 && t - pk.said > 40000 && rng() < 0.2) { pk.said = t; say(pk, C.says.near); }
    }
  }
  function say(pk, pool) {
    const list = Array.isArray(pool) ? pool : [pool];
    if (!list.length) return;
    const who = (pk.ents.find(x => x.lead && alive_(x.e)) || pk.ents.find(x => alive_(x.e)) || {}).e;
    if (who) room.emit({ type: 'say', id: who.id, text: list[Math.floor(rng() * list.length)], style: 'bark' });
  }
  function pull(pk) {
    const C = comps[pk.comp] || {};
    if (C.says && C.says.pull) say(pk, C.says.pull);
    if (onPull) { try { onPull(pk); } catch (err) { log('pack pull', err && err.message); } }
  }
  function wipe(pk) {
    const C = comps[pk.comp] || {};
    const at = pk.ents.map(x => x.e).filter(Boolean);
    const x = at.reduce((a, e) => a + e.x, 0) / Math.max(1, at.length), z = at.reduce((a, e) => a + e.z, 0) / Math.max(1, at.length);
    endRest(pk);
    counters.wiped++;
    const info = { uid: pk.uid, name: pk.name, comp: pk.comp, level: pk.level, lead: pk.lead ? pk.lead.name : null, led: !!pk.lead, x, z, contrib: new Map(pk.contrib), bodies: pk.ents.length, says: C.says || null };
    pk.ents = []; pk.walker = null; pk.live = false; pk.gone = true;
    if (pk.event) { retire(pk); return; }          // an event's pack is paid by its event, and never comes back
    const rm = C.respawnMin || K.respawnMin;
    pk.respawnAt = t + (rm[0] + rng() * (rm[1] - rm[0])) * 60000;
    if (onWipe) { try { onWipe(info, pk); } catch (err) { log('pack wipe', err && err.stack); } }
  }

  // ---------------------------------------------------------------- who is fighting it
  const byEntity = new Map();
  function packOf(e) {
    const id = e && e.data && e.data.pack && e.data.pack.id;
    if (!id) return null;
    let pk = byEntity.get(id);
    if (!pk) { pk = packs.find(p => p.uid === id) || null; if (pk) byEntity.set(id, pk); }
    return pk;
  }
  function onHit(ev) {
    if (ev.type !== 'hit' || ev.kind !== 'dmg') return;
    const dst = room.entities.get(ev.d), src = room.entities.get(ev.s);
    if (!dst || dst.kind !== 'monster' || !src || src.kind !== 'player' || !src.char) return;
    const pk = packOf(dst);
    if (!pk || (dst.data.pack && dst.data.pack.prey)) return;
    pk.contrib.set(src.char.id, (pk.contrib.get(src.char.id) || 0) + Math.max(1, ev.n || 1));
    if (pk.tappers.has(src.char.id)) return;
    pk.tappers.add(src.char.id);
    // round 11's crowd rule (World #5), per pack: health x (1 + 0.5 (n - 1)) for n players fighting it; it grows, never shrinks
    const n = Math.min(K.crowdCap, pk.tappers.size);
    if (n <= pk.crowd) return;
    const k = (1 + K.crowdPerPlayer * (n - 1)) / (1 + K.crowdPerPlayer * (pk.crowd - 1));
    pk.crowd = n;
    for (const x of pk.ents) if (alive_(x.e)) grow(x.e, k);
  }

  /**
   * An EVENT's pack (js/sim/wild-events.js, the warlord's march): its own members and leader on a route, carrying the
   * event's uid (credit, leash) — walked like any pack, never rolled again, never re-formed. `retire(pk)` takes it away.
   */
  function add({ route, s = 0, comp = null, level = 1, members = [], lead = null, event = null, leash = null, pace = null } = {}) {
    if (!route) return null;
    const pk = { id: nextId++, uid: `${uidPrefix}${room.id}:${nextId - 1}`, route, s, dir: route.loop ? 1 : (rng() < 0.5 ? 1 : -1), comp: comp || Object.keys(comps)[0], live: false, ents: [],
      restUntil: 0, nextRest: 0, resting: null, lastNear: -Infinity, fighting: false, contrib: new Map(), tappers: new Set(), crowd: 1, respawnAt: 0, gone: false, pulledAt: 0, said: 0,
      level, lead, members: members.map((m, i) => ({ type: m.type, role: null, i, deadAt: null })), leadDeadAt: null, name: (comps[comp] || {}).name || 'War-band', event, leash, pace, special: true };
    packs.push(pk);
    return pk;
  }
  function retire(pk) {
    if (!pk) return;
    if (pk.live) { for (const x of pk.ents) if (x.e && !x.e.removed && !x.e.dead) room.remove(x.e); endRest(pk); pk.ents = []; pk.live = false; }
    const i = packs.indexOf(pk); if (i >= 0) packs.splice(i, 1);
    byEntity.delete(pk.uid);
  }

  return {
    packs, counters, step, onHit, packOf, lines, add, retire,
    /** Testing / ops: put a pack's bodies down now (as if a player had walked up); rest now (as if it had reached a rest point). */
    materialise, park, restNow: pk => startRest(pk),
    stats: () => ({ packs: packs.length, live: packs.filter(p => p.live).length, bodies: packs.reduce((a, p) => a + (p.live ? p.ents.filter(x => alive_(x.e)).length : 0), 0), onPaper: packs.reduce((a, p) => a + (p.live || p.gone ? 0 : (p.members.length + (p.lead ? 1 : 0))), 0), ...counters }),
    dispose() { for (const pk of packs) park(pk); },
  };
}
