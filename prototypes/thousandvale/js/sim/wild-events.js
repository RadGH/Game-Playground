// WILD EVENTS (owner 2026-10-16: "add more events … the world should be more alive, and more dangerous"). Pure: no DOM,
// no Node APIs. These are ZONE events with no fixed arena: they happen where the players are, and each one is an
// ordinary event run (the same tracker card, map pin, start / end lines, shared credit and personal reward as the arena
// events in js/sim/events.js — the province registers every run in its `zoneRuns`).
//
//   const WE = createWildEvents({ P, online, zoneRuns, finishEvent, frameTo, tellZone, isNight, now, wallNow, isNewcomer, log, counters })
//   WE.tick()             1 Hz (js/sim/province.js eventTick): starts events where their rules say, steps the live ones
//   WE.use(o, obj)        a player used an event object (the rift) -> true when handled
//   WE.start(kind, r, o)  start one now (tests, admins) -> run | null
//
// THE SIX (data/provinces/packs.json `events`; every number below is a knob there):
//   ambush    on a road, away from towns: a crew springs from the brush on BOTH sides (two waves, a leader in the second)
//   caravan   a merchant's wagon ahead on the road is under attack: drive the attackers off before its drover falls
//   nightraid at night, raiders close on a village from three sides; three village militia fight beside you
//   rift      a rift tears open nearby and spits out waves; when a wave is down the rift falters — touch it to set a
//             seal; three seals (the last after the thing guarding it falls) close it
//   warmarch  a named warlord marches a long road with a big escort (two packs together); bring it down before it is gone
//   bounty    a wandering pack's leader is marked WANTED across its zone; its last-seen spot is on the map; kill it
// A storm event was considered and NOT built: the server has no weather (the sky's clear/cloudy is a client picture).

import { crowdScale, plural } from './events.js';

const TAU = Math.PI * 2;
export const WILD_DEFAULTS = Object.freeze({
  maxLivePerRoom: 4,          // a copy never runs more than this many at once (a tick budget)
  quietM: 300,                // never one within this of another live event
  ambush: { chancePer10s: 0.03, playerCooldownMin: 15, minLevel: 3, townM: 220, roadM: 12, count: [[4, 5], [3, 4]], durationMin: 4, r: 26, reward: { xp: 0.2, gold: 8, item: { tier: 'magic' } } },
  caravan: { chancePer10s: 0.02, playerCooldownMin: 20, minLevel: 4, townM: 260, aheadM: [95, 140], crew: 3, droverHp: 3, waves: [[4, 5], [3, 5]], durationMin: 5, r: 30, reward: { xp: 0.3, gold: 14, item: { tier: 'rare' } } },
  nightraid: { villageM: 170, villageCooldownMin: 25, minLevel: 3, sides: 3, perSide: [3, 4], militia: 3, gapSec: 25, durationMin: 6, r: 45, reward: { xp: 0.45, gold: 18, item: { tier: 'rare' } } },
  rift: { chancePerMin: 0.08, nightK: 2, roomCooldownMin: 12, minLevel: 2, nearM: [90, 150], townM: 250, seals: 3, waveEverySec: 16, falterSec: 12, wave: [3, 4], growPerMiss: 2, waveCap: 9, durationMin: 6, r: 22, reward: { xp: 0.4, gold: 16, item: { tier: 'rare' } } },
  warmarch: { everyMin: [25, 40], minBand: 4, escort: [9, 11], durationMin: 18, r: 40, reward: { xp: 0.7, gold: 30, item: { tier: 'epic' } } },
  bounty: { everyMin: [20, 30], minBand: 3, durationMin: 30, fuzzM: 120, r: 160, reward: { xp: 0.35, gold: 40, item: { tier: 'rare' } } },
});

export function createWildEvents({ P, online, zoneRuns, finishEvent, frameTo, tellZone, isNight = () => false, now, wallNow, isNewcomer = () => false, log = () => {}, counters = {}, packsOf = r => r.packs || null }) {
  const live = new Map();            // uid -> { run, room, def, kind }
  let uidN = 0;
  const cfgOf = pv => {
    const E = (pv.L.packs && pv.L.packs.events) || {};
    const out = { ...WILD_DEFAULTS, ...E };
    for (const k of ['ambush', 'caravan', 'nightraid', 'rift', 'warmarch', 'bounty']) out[k] = { ...WILD_DEFAULTS[k], ...(E[k] || {}) };
    return out;
  };
  const textOf = (pv, kind) => ((pv.L.packs && pv.L.packs.eventText) || {})[kind] || {};
  const listsOf = pv => (pv.L.packs && pv.L.packs.eventMonsters) || {};
  const rngOf = r => () => r.host.random('wild');
  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const between = (rng, r) => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : r);
  const fill = (s, tok) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (tok[k] != null ? tok[k] : m));

  // ------------------------------------------------------------------ the province's ground
  const ground = new Map();          // province key -> { roads, villages, zones }
  function groundOf(pv) {
    if (ground.has(pv.L.key)) return ground.get(pv.L.key);
    const L = pv.L;
    // road samples every 8 m in a 16 m grid (onRoad / along the road)
    const cells = new Map(), routes = [];
    const key = (x, z) => Math.floor(x / 16) * 100003 + Math.floor(z / 16);
    for (const rt of (L.travel && L.travel.routes) || []) {
      const P0 = (rt.pts || []).map(p => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
      const pts = [];
      for (let i = 1; i < P0.length; i++) { const a = P0[i - 1], b = P0[i], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 8)); for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }); }
      const ri = routes.push({ id: rt.id, pts }) - 1;
      pts.forEach((p, i) => { const k = key(p.x, p.z); (cells.get(k) || cells.set(k, []).get(k)).push({ r: ri, i }); });
    }
    const towns = L.towns || [];
    const villages = ((L.terrain && L.terrain.reader && L.terrain.reader.meta && L.terrain.reader.meta.sites) || [])
      .filter(s => s.type === 'settlement' && !s.hub && s.kind !== 'town' && s.kind !== 'city' && !towns.some(t => Math.hypot(t.x - s.x, t.z - s.z) < (t.r || 60)))
      .map(s => ({ name: s.name, x: s.x, z: s.z, r: s.radius || 40, kind: s.kind || 'hamlet' }));
    const g = {
      towns, villages, routes,
      onRoad(x, z, m = 12) {
        let best = null, bd = m;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const h of cells.get(key(x + dx * 16, z + dz * 16)) || []) { const p = routes[h.r].pts[h.i], d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = h; } }
        return best;
      },
      along(h, metres) { const R = routes[h.r], i = Math.max(0, Math.min(R.pts.length - 1, h.i + Math.round(metres / 8))); return R.pts[i]; },
      townDist(x, z) { let d = Infinity; for (const t of towns) d = Math.min(d, Math.hypot(t.x - x, t.z - z) - (t.r || 60)); return d; },
      zoneOf: (x, z) => (L.zoneOf ? L.zoneOf(x, z) : null),
      zone(x, z) { const k = this.zoneOf(x, z); return (L.zones || []).find(q => q.key === k) || null; },
      band(x, z) { const zs = this.zone(x, z); return (zs && zs.sheet && zs.sheet.band) || (L.sheet && L.sheet.band) || [1, 4]; },
      zoneName(x, z) { const zs = this.zone(x, z); return (zs && zs.sheet && zs.sheet.name) || L.name || null; },
    };
    ground.set(L.key, g);
    return g;
  }

  // ------------------------------------------------------------------ the run every event is
  /**
   * The parts every wild event shares: who is in it (everyone within `reach`), the crowd, the clock, the spawned bodies,
   * win / lose, and the view the tracker card reads. `spec` = { kind, name, x, z, r, level, durationMs, reward, info, zone }.
   */
  function baseRun(room, pv, spec) {
    const uid = `wild:${spec.kind}:${room.id}:${++uidN}`;
    const T0 = textOf(pv, spec.kind);
    spec.info = { ...(spec.info || {}), ...(T0.onSuccess ? { onSuccess: T0.onSuccess } : {}), ...(T0.onFail ? { onFail: T0.onFail } : {}) };
    const ev = { uid, id: 'wild_' + spec.kind, name: spec.name, kind: spec.kind, province: pv.L.key, zone: spec.zone || null, zoneName: spec.zoneName || null, x: spec.x, z: spec.z, r: spec.r,
      level: spec.level, reward: spec.reward, durationMs: spec.durationMs, info: spec.info || null, blurb: (spec.info && spec.info.what) || null, wild: true };
    const run = { ev, enrolled: new Set(), contrib: new Map(), t0: now(), spawned: new Set(), boss: null, result: 'live', why: null, at: { x: spec.x, z: spec.z } };
    run.reach = Math.max(150, spec.r * 2.5);
    run.leash = { m: run.reach + 60, s: 60 };
    run.fighters = (pad = 0) => room.host.near(run.at.x, run.at.z, run.reach + pad, x => x.kind === 'player' && x.char && !x.dead);
    run.crowd = () => crowdScale(run.fighters(40).length, {});
    run.enrol = () => { for (const p of room.host.near(run.at.x, run.at.z, run.reach, x => x.kind === 'player' && x.char)) run.enrolled.add(p.char.id); };
    run.alive = e => e && !e.dead && !e.removed;
    run.spawn = (type, level, x, z, extra = {}) => {
      const { data = {}, ...rest } = extra;
      const m = room.spawn({ kind: 'monster', type, level, x, z, yaw: Math.atan2(run.at.x - x, run.at.z - z), ...rest, data: { event: uid, noRank: true, leash: run.leash, ...data } });
      run.spawned.add(m);
      return m;
    };
    run.clear = () => { for (const m of run.spawned) if (!m.removed) room.remove(m); run.spawned.clear(); };
    run.lose = why => { run.result = 'lost'; run.why = why; run.clear(); return run.result; };
    run.win = () => { run.result = 'won'; run.why = null; return run.result; };
    run.leftMs = () => Math.max(0, run.t0 + spec.durationMs - now());
    run.abandoned = () => {
      if (run.fighters(40).length) { run.aloneSince = 0; return false; }
      run.aloneSince ||= now();
      return now() - run.aloneSince >= 60000;
    };
    run.stop = run.clear;
    run.baseView = (objective, stage) => ({ uid, id: ev.id, name: ev.name, kind: ev.kind, zoneName: ev.zoneName, x: run.at.x, z: run.at.z, r: spec.r, phase: 'live', wave: stage ? stage.n : 0, waves: stage ? stage.of : 0,
      boss: run.boss && !run.boss.removed ? run.boss.id : 0, hp: run.boss && !run.boss.removed ? run.boss.hp / Math.max(1, run.boss.hpMax) : 1, players: run.enrolled.size,
      what: (spec.info && spec.info.what) || null, text: (spec.info && spec.info.what) || null, goal: (spec.info && spec.info.objective) || null, objective, stage: stage || { n: 0, of: 0, name: null },
      leftMs: run.leftMs(), level: ev.level, ...(spec.where ? { where: spec.where } : {}) });
    return run;
  }
  /** A knot of bodies `d` metres out from (cx, cz) at bearing `a`, spread across `spread` metres. Never in a wall or water. */
  function knotAt(room, cx, cz, a, d, n, spread = 9) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const side = (n > 1 ? i / (n - 1) - 0.5 : 0) * spread, ux = Math.cos(a), uz = Math.sin(a);
      let x = cx + ux * d - uz * side, z = cz + uz * d + ux * side;
      for (let q = 0; q < 10 && room.walkable && !room.walkable(x, z); q++) { x = cx + ux * d * (0.9 - q * 0.08) - uz * side * 0.5; z = cz + uz * d * (0.9 - q * 0.08) + ux * side * 0.5; }
      if (room.walkable && !room.walkable(x, z)) { x = cx; z = cz; }
      out.push({ x, z });
    }
    return out;
  }
  /** Make a monster go for `who` from the start (an ambush, the caravan, the village militia). */
  function goFor(m, who) {
    const u = m.r && m.r.unit, w = who && who.r && who.r.unit;
    if (!u || !w) return;
    (u.threat || (u.threat = new Map())).set(who.id, Math.max(20, (u.maxHp || 40) * 0.2));
    u.state = 'chase'; u.targetId = who.id; u.guardFoe = true; u.lastCombatAt = 0;
    if (who.kind === 'npc') u.npcFoe = true;      // it keeps at the crew / militia whoever else is about (monster-ai.js)
  }
  /** The kinds of this zone that travel together (its pack routes' compositions), filtered by what they are. */
  function zoneComps(pv, x, z, kinds = null) {
    const P0 = pv.L.packs || {}, comps = P0.compositions || {}, routes = (pv.L.packRoutes && pv.L.packRoutes.routes) || [];
    const zk = groundOf(pv).zoneOf(x, z);
    const ids = new Set();
    for (const rt of routes) if (rt.zone === zk || (rt.zones || []).includes(zk)) for (const id of Object.keys(rt.comps || {})) ids.add(id);
    const list = [...ids].filter(id => comps[id] && (!kinds || kinds.includes(comps[id].kind)));
    return list.map(id => ({ id, ...comps[id] }));
  }
  const bodyList = (C, rng) => { const out = []; for (const m of C.members || []) { const n = between(rng, m.count); for (let i = 0; i < n; i++) out.push(m.type); } return out; };
  function levelAt(pv, x, z, rng) { const b = groundOf(pv).band(x, z); return Math.max(1, between(rng, b)); }

  // ------------------------------------------------------------------ AMBUSH
  function ambush(room, pv, o, cfg, rng) {
    const A = cfg.ambush, g = groundOf(pv), e = o.entity;
    const comps = zoneComps(pv, e.x, e.z, ['bandits', 'cultists', 'slagborn']);
    const C = comps.length ? pick(rng, comps) : pick(rng, zoneComps(pv, e.x, e.z) || []);
    if (!C) return null;
    const level = levelAt(pv, e.x, e.z, rng);
    const T = textOf(pv, 'ambush');
    const crew = C.name || 'raiders';
    const run = baseRun(room, pv, { kind: 'ambush', name: fill(T.name || 'Ambush on the Road', { crew }), x: e.x, z: e.z, r: A.r, level, durationMs: A.durationMin * 60000, reward: A.reward, zone: g.zoneOf(e.x, e.z), zoneName: g.zoneName(e.x, e.z),
      info: { what: fill(T.what || 'Lying in wait by the road: the {crew}. They spring out on both sides.', { crew }), objective: T.objective || 'Fight your way out: defeat both waves', rewardText: null } });
    const types = bodyList(C, rng);
    const head = e.yaw || 0;
    // the two flanks: left and right of the way you were walking
    const sides = [head + Math.PI / 2, head - Math.PI / 2].map(a => Math.atan2(Math.cos(a), Math.sin(a)));
    let wave = 0, waveAt = now(), mobs = [];
    const spawnWave = k => {
      const cs = run.crowd();
      const n = Math.min(14, Math.round(between(rng, A.count[k] || A.count[0]) * cs.waveCount));
      const pts = knotAt(room, run.at.x, run.at.z, sides[k % 2], 16 + rng() * 5, n, 10);
      mobs = pts.map((p, i) => run.spawn(types[i % types.length] || types[0], level, p.x, p.z, { data: cs.waveHp !== 1 ? { scale: Math.round(cs.waveHp * 100) / 100 } : {} }));
      if (k === 1 && C.leader) {
        const p = knotAt(room, run.at.x, run.at.z, sides[1], 20, 1)[0];
        const L = run.spawn(C.leader.type, level + 1, p.x, p.z, { rank: 'champion', name: pick(rng, C.leader.names || ['the Ambusher']), data: { keepName: true, affixes: (C.leader.affixes || ['packleader']).slice(0, 2) } });
        mobs.push(L); run.boss = L;
      }
      for (const m of mobs) goFor(m, e);
      if (C.says && C.says.pull && mobs[0]) room.emit({ type: 'say', id: mobs[0].id, text: pick(rng, C.says.pull), style: 'yell' });
    };
    run.step = () => {
      if (run.result !== 'live') return run.result;
      run.enrol();
      if (now() - run.t0 > A.durationMin * 60000) return run.lose('time');
      if (wave > 0 && run.abandoned()) return run.lose(room.host.near(run.at.x, run.at.z, run.reach + 40, x => x.kind === 'player' && x.dead).length ? 'wiped' : 'left');
      const left = mobs.some(run.alive);
      if (wave === 0 || (!left && now() - waveAt > 2500)) {
        if (wave >= 2) return run.win();
        spawnWave(wave); wave++; waveAt = now();
      }
      return 'live';
    };
    run.view = () => { const of = mobs.length, n = mobs.filter(m => !run.alive(m)).length; return run.baseView({ kind: 'kill', text: n >= of && wave < 2 ? 'More are coming from the other side!' : 'Defeat the ' + crew.toLowerCase(), n, of }, { n: wave, of: 2, name: wave === 1 ? 'First wave' : 'Second wave' }); };
    run.announce = fill(T.start || 'Ambush! The {crew} spring out of the brush on both sides of the road!', { crew });
    return run;
  }

  // ------------------------------------------------------------------ CARAVAN
  function caravan(room, pv, o, cfg, rng) {
    const A = cfg.caravan, g = groundOf(pv), e = o.entity;
    const h = g.onRoad(e.x, e.z, cfg.ambush.roadM);
    if (!h) return null;
    // ahead along the road, the way you are facing
    const a1 = g.along(h, 120), a2 = g.along(h, -120), fwd = { x: Math.sin(e.yaw || 0), z: Math.cos(e.yaw || 0) };
    const ahead = ((a1.x - e.x) * fwd.x + (a1.z - e.z) * fwd.z) >= ((a2.x - e.x) * fwd.x + (a2.z - e.z) * fwd.z) ? 1 : -1;
    const at = g.along(h, ahead * (A.aheadM[0] + rng() * (A.aheadM[1] - A.aheadM[0])));
    if (g.townDist(at.x, at.z) < A.townM || (room.walkable && !room.walkable(at.x, at.z))) return null;
    const comps = zoneComps(pv, at.x, at.z, ['bandits', 'beasts', 'slagborn', 'fiends', 'cultists']);
    if (!comps.length) return null;
    const C = pick(rng, comps);
    const level = levelAt(pv, at.x, at.z, rng);
    const T = textOf(pv, 'caravan');
    const names = (pv.L.travel && pv.L.travel.names) || {};
    const given = (names.given && (names.given.m || names.given.f)) || ['Wat'];
    const drover = fill(T.drover || '{first} the Carter', { first: pick(rng, given) });
    const run = baseRun(room, pv, { kind: 'caravan', name: T.name || 'Caravan Under Attack', x: at.x, z: at.z, r: A.r, level, durationMs: A.durationMin * 60000, reward: A.reward, zone: g.zoneOf(at.x, at.z), zoneName: g.zoneName(at.x, at.z),
      info: { what: fill(T.what || 'A merchant wagon on the road ahead is under attack by the {crew}. Its drover, {drover}, cannot hold them off alone.', { crew: C.name || 'raiders', drover }), objective: fill(T.objective || 'Drive off the attackers — keep {drover} alive', { drover }) } });
    // the wagon, its drover and its guards: travelling fighters (js/rules/guards.js wanderers), the drover tougher
    const crew = [];
    const yaw = Math.atan2(a1.x - a2.x, a1.z - a2.z);
    const npc = (name, role, x, z, lead) => {
      const n = room.spawn({ kind: 'npc', type: 'npc', name, x, z, yaw, team: 1, state: 128, data: { npc: { role, says: [], titled: lead }, fighter: { level: level + 1 }, ...(lead ? { traveller: { kind: 'merchant_wagon', vehicle: 'ox_cart', cart: true, name: 'Merchant wagon' }, title: 'Drover — save the wagon!' } : { traveller: { kind: 'merchant_wagon', armed: true } }), wildEvent: run.ev.uid } });
      run.spawned.add(n); crew.push(n);
      return n;
    };
    const dr = npc(drover, 'carter', at.x, at.z, true);
    if (dr.r && dr.r.unit) { const u = dr.r.unit; u.maxHp = Math.round(u.maxHp * A.droverHp); u.hp = u.maxHp; dr.setMax(u.maxHp, 0); dr.setHp(u.hp); }
    for (let i = 0; i < A.crew; i++) { const a = i / A.crew * TAU; npc(pick(rng, ['Wagon Guard', 'Hired Blade', 'Outrider']), 'guard', at.x + Math.cos(a) * 3, at.z + Math.sin(a) * 3, false); }
    run.boss = null;
    const types = bodyList(C, rng);
    let wave = 0, waveAt = now(), mobs = [];
    const spawnWave = k => {
      const cs = run.crowd();
      const n = Math.min(14, Math.round(between(rng, A.waves[k] || A.waves[0]) * cs.waveCount));
      const pts = knotAt(room, at.x, at.z, rng() * TAU, 26 + rng() * 6, n, 12);
      mobs = pts.map((p, i) => run.spawn(types[i % types.length] || types[0], level, p.x, p.z, { data: cs.waveHp !== 1 ? { scale: Math.round(cs.waveHp * 100) / 100 } : {} }));
      if (k === 1 && C.leader) { const p = knotAt(room, at.x, at.z, rng() * TAU, 30, 1)[0]; const L = run.spawn(C.leader.type, level + 1, p.x, p.z, { rank: 'champion', name: pick(rng, C.leader.names || ['the Raider']), data: { keepName: true, affixes: (C.leader.affixes || ['packleader']).slice(0, 2) } }); mobs.push(L); run.boss = L; }
      mobs.forEach((m, i) => goFor(m, crew[i % crew.length]));
    };
    const droverDown = () => !dr || dr.removed || !(dr.r && dr.r.unit) || dr.r.unit.hp <= 0 || dr.r.unit.state === 'down';
    run.step = () => {
      if (run.result !== 'live') return run.result;
      run.enrol();
      if (droverDown()) { room.emit({ type: 'say', id: dr.id, text: T.lost || 'Help… the wagon…', style: 'yell' }); return run.lose('drover'); }
      if (now() - run.t0 > A.durationMin * 60000) return run.lose('time');
      if (wave > 0 && run.abandoned()) return run.lose('left');
      const left = mobs.some(run.alive);
      if (wave === 0 || (!left && now() - waveAt > 3000)) {
        if (wave >= A.waves.length) { room.emit({ type: 'say', id: dr.id, text: T.saved || 'You saved my wagon — and my neck! Take what you can carry.', style: 'say' }); return run.win(); }
        spawnWave(wave); wave++; waveAt = now();
        if (wave === 1) room.emit({ type: 'say', id: dr.id, text: T.help || 'Help! Anyone! They are on us!', style: 'yell' });
      }
      return 'live';
    };
    run.view = () => { const of = mobs.length, n = mobs.filter(m => !run.alive(m)).length, u = dr.r && dr.r.unit; return { ...run.baseView({ kind: 'kill', text: 'Drive off the attackers — keep ' + drover + ' alive', n, of }, { n: wave, of: A.waves.length, name: 'Wave ' + wave }), hp: u ? Math.max(0, u.hp) / Math.max(1, u.maxHp) : 0, guard: { name: drover, id: dr.id } }; };
    const clear0 = run.clear;
    run.clear = () => { clear0(); };
    run.stop = run.clear;
    // the wagon and its crew drive on (are put away) a little after a win; on a loss they lie where they fell
    run.after = 20000;
    run.announce = fill(T.start || 'A merchant wagon ahead is under attack! Its drover {drover} is calling for help.', { drover });
    return run;
  }

  // ------------------------------------------------------------------ NIGHT RAID
  function nightraid(room, pv, village, cfg, rng) {
    const A = cfg.nightraid, g = groundOf(pv);
    const comps = zoneComps(pv, village.x, village.z);
    if (!comps.length) return null;
    const level = levelAt(pv, village.x, village.z, rng);
    const T = textOf(pv, 'nightraid');
    const run = baseRun(room, pv, { kind: 'nightraid', name: fill(T.name || 'Night Raid on {village}', { village: village.name }), x: village.x, z: village.z, r: Math.max(A.r, village.r), level, durationMs: A.durationMin * 60000, reward: A.reward, zone: g.zoneOf(village.x, village.z), zoneName: g.zoneName(village.x, village.z),
      where: village.name, info: { what: fill(T.what || 'Under cover of dark, raiders are closing on {village} from three sides. Its militia have turned out.', { village: village.name }), objective: fill(T.objective || 'Defend {village}: defeat every raiding party', { village: village.name }) } });
    // the militia at the square
    const militia = [];
    for (let i = 0; i < A.militia; i++) {
      const a = i / A.militia * TAU, x = village.x + Math.cos(a) * 5, z = village.z + Math.sin(a) * 5;
      const n = room.spawn({ kind: 'npc', type: 'npc', name: pick(rng, ['Militia Spear', 'Village Watch', 'Militia Bow']), x, z, team: 1, state: 128, data: { npc: { role: 'guard', says: [], titled: false }, fighter: { level }, filler: true, wildEvent: run.ev.uid } });
      run.spawned.add(n); militia.push(n);
    }
    const a0 = rng() * TAU;
    const sides = Array.from({ length: A.sides }, (_, i) => a0 + i / A.sides * TAU + (rng() - 0.5) * 0.5);
    let k = 0, nextAt = now(), mobs = [], total = 0;
    const spawnSide = i => {
      const C = pick(rng, comps), cs = run.crowd(), types = bodyList(C, rng);
      const n = Math.min(12, Math.round(between(rng, A.perSide) * cs.waveCount));
      const pts = knotAt(room, village.x, village.z, sides[i], village.r + 45 + rng() * 15, n, 10);
      const made = pts.map((p, j) => run.spawn(types[j % types.length] || types[0], level, p.x, p.z, { data: { path: [[village.x + (rng() - 0.5) * 8, village.z + (rng() - 0.5) * 8], [village.x, village.z]], ...(cs.waveHp !== 1 ? { scale: Math.round(cs.waveHp * 100) / 100 } : {}) } }));
      if (i === A.sides - 1 && C.leader) { const p = knotAt(room, village.x, village.z, sides[i], village.r + 55, 1)[0]; const L = run.spawn(C.leader.type, level + 1, p.x, p.z, { rank: 'champion', name: pick(rng, C.leader.names || ['the Raid-Leader']), data: { keepName: true, affixes: (C.leader.affixes || ['packleader']).slice(0, 2), path: [[village.x, village.z], [village.x + 2, village.z]] } }); made.push(L); run.boss = L; }
      // they walk in on the village and go for its militia first (the rules' raider: guards fight it, it fights guards)
      made.forEach((m, j) => { const u = m.r && m.r.unit; if (u) u.raider = true; if (militia.length && j % 2 === 0) goFor(m, militia[j % militia.length]); });
      mobs.push(...made); total += made.length;
    };
    run.step = () => {
      if (run.result !== 'live') return run.result;
      run.enrol();
      if (now() - run.t0 > A.durationMin * 60000) return run.lose('time');
      if (k > 0 && run.abandoned()) return run.lose('left');
      if (k < A.sides && now() >= nextAt) { spawnSide(k); k++; nextAt = now() + A.gapSec * 1000; }
      if (k >= A.sides && !mobs.some(run.alive)) return run.win();
      return 'live';
    };
    run.view = () => { const n = mobs.filter(m => !run.alive(m)).length; return run.baseView({ kind: 'kill', text: k < A.sides ? 'More raiders are coming — hold the village' : 'Defeat the last raiders', n, of: total }, { n: k, of: A.sides, name: 'Raiding party ' + k }); };
    run.announce = fill(T.start || 'Raiders are closing on {village} in the dark! Its militia are calling for help.', { village: village.name });
    return run;
  }

  // ------------------------------------------------------------------ RIFT
  function rift(room, pv, o, cfg, rng) {
    const A = cfg.rift, g = groundOf(pv), e = o.entity;
    let at = null;
    for (let q = 0; q < 16 && !at; q++) {
      const a = rng() * TAU, d = A.nearM[0] + rng() * (A.nearM[1] - A.nearM[0]), x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
      if (room.walkable && !room.walkable(x, z)) continue;
      if (g.townDist(x, z) < A.townM || g.villages.some(v => Math.hypot(v.x - x, v.z - z) < v.r + 80)) continue;
      at = { x, z };
    }
    if (!at) return null;
    const level = levelAt(pv, at.x, at.z, rng);
    const L = listsOf(pv).rift || [];
    const tier = L.find(t => level <= (t.upTo ?? 99)) || L[L.length - 1];
    if (!tier) return null;
    const T = textOf(pv, 'rift');
    const zn = g.zoneName(at.x, at.z);
    const run = baseRun(room, pv, { kind: 'rift', name: T.name || 'A Rift Tears Open', x: at.x, z: at.z, r: A.r, level, durationMs: A.durationMin * 60000, reward: A.reward, zone: g.zoneOf(at.x, at.z), zoneName: zn,
      info: { what: T.what || 'A tear in the air is spilling things from somewhere else. Each time a wave is beaten the rift falters — touch it then to set a seal.', objective: T.objective || 'Close the rift: three seals' } });
    const gate = room.spawn({ kind: 'object', type: 'rift', name: T.object || 'The Rift', x: at.x, z: at.z, team: 0, data: { state: 'open', rift: run.ev.uid, r: 2.5 } });
    run.spawned.add(gate); run.gate = gate;
    let seals = 0, waveAt = now(), mobs = [], falterUntil = 0, waves = 0, missed = 0, guardian = null;
    const setState = st => { if (gate.data.state !== st) { gate.data.state = st; gate.infoVer++; room.emit({ type: 'obj', id: gate.id, state: st, x: gate.x, z: gate.z }); } };
    const spawnWave = () => {
      const cs = run.crowd();
      const n = Math.min(A.waveCap, Math.round((between(rng, A.wave) + missed * A.growPerMiss) * cs.waveCount));
      mobs = [];
      for (let i = 0; i < n; i++) { const a = rng() * TAU, d = 3 + rng() * 5; const t = pick(rng, tier.types); mobs.push(run.spawn(t, level, at.x + Math.cos(a) * d, at.z + Math.sin(a) * d, { data: cs.waveHp !== 1 ? { scale: Math.round(cs.waveHp * 100) / 100 } : {} })); }
      // the last seal is guarded: the thing holding the rift open comes through with the third wave
      if (seals === A.seals - 1 && tier.guardian && !guardian) {
        guardian = run.spawn(tier.guardian, level + 1, at.x + 2, at.z, { rank: 'champion', name: T.guardian || 'The Rift-Warden', data: { keepName: true, affixes: tier.guardianAffixes || ['packleader'] } });
        mobs.push(guardian); run.boss = guardian;
      }
      const f = run.fighters()[0];
      if (f) for (const m of mobs) goFor(m, f);
      waves++; waveAt = now();
      room.emit({ type: 'fx', kind: 'impact', id: gate.id, x: at.x, z: at.z, element: 'arcane' });
    };
    run.step = () => {
      if (run.result !== 'live') return run.result;
      run.enrol();
      if (now() - run.t0 > A.durationMin * 60000) return run.lose('time');
      if (waves > 0 && run.abandoned()) return run.lose('left');
      const left = mobs.some(run.alive);
      if (falterUntil) {
        if (now() >= falterUntil) { falterUntil = 0; missed++; setState('open'); spawnWave(); room.emit({ type: 'say', id: gate.id, text: T.missed || 'The rift flares again — more are coming through!', style: 'warn' }); }
        return 'live';
      }
      if (waves === 0 || (!left && now() - waveAt > 2000 && waves > 0 && !falterUntil && (seals < A.seals))) {
        if (waves === 0) { spawnWave(); return 'live'; }
        // a wave is down: the rift falters — a seal can be set now
        falterUntil = now() + A.falterSec * 1000; setState('faltering');
        room.emit({ type: 'say', id: gate.id, text: T.falter || 'The rift falters! Touch it now to set a seal!', style: 'warn' });
        return 'live';
      }
      if (!left && now() - waveAt > A.waveEverySec * 1000) spawnWave();
      return 'live';
    };
    run.seal = (o2) => {
      if (run.result !== 'live' || !falterUntil) return { ok: false, msg: 'The rift is too wild to touch — beat the wave that came through.' };
      seals++; falterUntil = 0;
      if (o2 && o2.char) run.contrib.set(o2.char.id, (run.contrib.get(o2.char.id) || 0) + 50);
      room.emit({ type: 'say', id: gate.id, text: fill(T.sealed || 'A seal holds — {n} of {of}.', { n: seals, of: A.seals }), style: 'emote' });
      if (seals >= A.seals) { setState('closed'); run.win(); return { ok: true, msg: T.closed || 'The last seal holds and the rift folds shut.' }; }
      setState('open'); spawnWave();
      return { ok: true, msg: fill(T.sealed || 'A seal holds — {n} of {of}.', { n: seals, of: A.seals }) };
    };
    run.view = () => {
      const of = mobs.length, n = mobs.filter(m => !run.alive(m)).length;
      const obj = falterUntil ? { kind: 'use', text: 'The rift falters — touch it to set a seal! (' + Math.ceil((falterUntil - now()) / 1000) + ' s)', n: seals, of: A.seals } : { kind: 'kill', text: 'Beat what comes through (seal ' + (seals + 1) + ' of ' + A.seals + ')', n, of };
      return run.baseView(obj, { n: seals, of: A.seals, name: 'Seal ' + (seals + 1) });
    };
    run.after = 5000;      // a closed rift stays a moment, folding shut (the client shrinks it)
    run.announce = fill(T.start || 'A rift has torn open nearby, in {zone}! Things are coming through it.', { zone: zn || 'the wilds' });
    return run;
  }

  // ------------------------------------------------------------------ WARLORD'S MARCH
  function warmarch(room, pv, cfg, rng, zoneKey) {
    const A = cfg.warmarch, g = groundOf(pv), P0 = packsOf(room);
    if (!P0 || !P0.add) return null;
    const routes = ((pv.L.packRoutes && pv.L.packRoutes.routes) || []).filter(r => r.zone === zoneKey && (r.kind === 'road' || r.kind === 'cross' || r.length >= 900));
    if (!routes.length) return null;
    const routeId = pick(rng, routes).id, route = P0.lines.find(l => l.id === routeId);
    if (!route) return null;
    const W = (listsOf(pv).warlords || []);
    const band = (pv.L.zones.find(q => q.key === zoneKey) || {}).sheet?.band || [4, 8];
    const level = Math.max(band[0], band[1]);
    const lord = W.find(w => level <= (w.upTo ?? 99)) || W[W.length - 1];
    if (!lord) { log('warmarch: no lord'); return null; }
    const comps = zoneComps(pv, route.line.pts[0].x, route.line.pts[0].z);
    if (!comps.length) { log('warmarch: no comps'); return null; }
    const T = textOf(pv, 'warmarch');
    const name = pick(rng, lord.names || ['the Warlord']);
    const zn = (pv.L.zones.find(q => q.key === zoneKey) || {}).sheet?.name || pv.L.name;
    const s0 = rng() * route.line.length, h = route.line.at(s0);
    const run = baseRun(room, pv, { kind: 'warmarch', name: fill(T.name || '{name} Marches', { name }), x: h.x, z: h.z, r: A.r, level, durationMs: A.durationMin * 60000, reward: A.reward, zone: zoneKey, zoneName: zn,
      info: { what: fill(T.what || '{name} leads a war-band across {zone}, burning what it passes. It will not stay long — bring friends.', { name, zone: zn }), objective: fill(T.objective || 'Bring down {name}', { name }) } });
    // two of the zone's packs marching as one, the warlord at their head (a pack: they wake together, leash together)
    const members = [];
    const want = between(rng, A.escort);
    for (let k = 0; members.length < want && k < 6; k++) { const C = pick(rng, comps); for (const t of bodyList(C, rng)) if (members.length < want) members.push({ type: t }); }
    const pk = P0.add({ route, s: s0, comp: comps[0].id, level, members, lead: { type: lord.type, rank: 'rare', affixes: (lord.affixes || ['packleader', 'vital']).slice(0, 2), name, title: T.title || 'Warlord — wanted across the zone', level: level + 1 },
      event: run.ev.uid, leash: run.leash, now: true, pace: 0.42 });
    if (!pk) return null;
    run.pack = pk;
    run.step = () => {
      if (run.result !== 'live') return run.result;
      const lead = pk.ents.find(x => x.lead);
      const w = lead && lead.e;
      if (w && !w.removed) { run.at.x = w.x; run.at.z = w.z; run.boss = w; }
      else { const p = pk.route.line.at(pk.s); run.at.x = p.x; run.at.z = p.z; }
      run.enrol();
      if ((w && w.dead) || pk.leadDeadAt != null) { P0.retire(pk); return run.win(); }      // (the whole band can fall between two of these steps)
      if (now() - run.t0 > A.durationMin * 60000) { P0.retire(pk); room.emit({ type: 'say', id: w ? w.id : 0, text: T.gone || 'The war-band marches on out of reach.', style: 'yell' }); return run.lose('fled'); }
      return 'live';
    };
    run.clear = () => { P0.retire(pk); };
    run.stop = run.clear;
    run.view = () => { const alive = pk.ents.filter(x => run.alive(x.e)).length; return run.baseView({ kind: 'boss', text: 'Bring down ' + name + (alive ? ' (' + alive + ' in the war-band)' : ''), n: 0, of: 1, hp: run.boss ? run.boss.hp / Math.max(1, run.boss.hpMax) : 1, id: run.boss ? run.boss.id : 0 }, { n: 1, of: 1, name }); };
    run.moving = true;
    run.announce = fill(T.start || 'A warlord marches! {name} leads a war-band across {zone}. Bring friends.', { name, zone: zn });
    return run;
  }

  // ------------------------------------------------------------------ BOUNTY
  function bounty(room, pv, cfg, rng, zoneKey) {
    const A = cfg.bounty, P0 = packsOf(room);
    if (!P0) return null;
    const cands = P0.packs.filter(pk => pk.lead && !pk.gone && !pk.event && !pk.bounty && pk.route.zone === zoneKey && !(pk.leadDeadAt != null));
    if (!cands.length) return null;
    const pk = pick(rng, cands);
    const T = textOf(pv, 'bounty');
    const zn = (pv.L.zones.find(q => q.key === zoneKey) || {}).sheet?.name || pv.L.name;
    const name = pk.lead.name;
    const h = pk.route.line.at(pk.s);
    const fz = () => ({ x: Math.round((h.x + (rng() - 0.5) * A.fuzzM) / 10) * 10, z: Math.round((h.z + (rng() - 0.5) * A.fuzzM) / 10) * 10 });
    const run = baseRun(room, pv, { kind: 'bounty', name: fill(T.name || 'Wanted: {name}', { name }), x: h.x, z: h.z, r: A.r, level: pk.lead.level, durationMs: A.durationMin * 60000, reward: A.reward, zone: zoneKey, zoneName: zn,
      info: { what: fill(T.what || 'The people of {zone} have put a price on {name}, who leads the {pack}. It was last seen in the circle on your map — it does not stay put.', { name, zone: zn, pack: (pk.name || 'pack').toLowerCase() }), objective: fill(T.objective || 'Hunt down and kill {name}', { name }) } });
    pk.bounty = run.ev.uid;
    const ownTitle = pk.lead.title || null;
    pk.lead.title = fill(T.title || 'Wanted — a bounty on its head', {});
    const markLive = () => { for (const x of pk.ents) if (x.lead && x.e && !x.e.removed && x.e.data && x.e.data.pack) { x.e.data.pack.title = pk.lead.title; x.e.data.event = run.ev.uid; x.e.infoVer++; } };
    markLive();
    let lastFix = 0, seen = fz();
    run.at = { ...seen };
    run.step = () => {
      if (run.result !== 'live') return run.result;
      // the circle on the map follows the pack, a rough last-seen spot every 15 s
      if (now() - lastFix > 15000) { lastFix = now(); const w = pk.live ? (pk.ents.find(x => x.lead) || {}).e : null; const p = w && !w.removed ? w : pk.route.line.at(pk.s); h.x = p.x; h.z = p.z; seen = fz(); run.at.x = seen.x; run.at.z = seen.z; markLive(); }
      for (const p of room.host.near(run.at.x, run.at.z, A.r + 200, x => x.kind === 'player' && x.char)) run.enrolled.add(p.char.id);
      if (pk.leadDeadAt != null || (pk.gone && !pk.live)) { unmark(); return run.contrib.size ? run.win() : run.lose('fled'); }
      if (now() - run.t0 > A.durationMin * 60000) { unmark(); return run.lose('time'); }
      return 'live';
    };
    // the leader wears its own line again once the bounty is over
    const unmark = () => { pk.bounty = null; if (pk.lead) pk.lead.title = ownTitle; for (const x of pk.ents) if (x.lead && x.e && !x.e.removed && x.e.data && x.e.data.pack) { x.e.data.pack.title = ownTitle; x.e.infoVer++; } };
    run.clear = unmark;
    run.stop = run.clear;
    run.view = () => run.baseView({ kind: 'boss', text: 'Hunt down ' + name + ' — last seen in the circle', n: 0, of: 1 }, { n: 1, of: 1, name });
    run.moving = true;
    run.announce = fill(T.start || 'A bounty is posted: {name}, leader of the {pack}, is wanted in {zone}. Its last-seen spot is marked on your map.', { name, pack: (pk.name || 'pack').toLowerCase(), zone: zn });
    // credit: whoever damages the pack (the pack's own tally — js/sim/packs.js onHit) counts for the bounty
    run.contrib = pk.contrib;
    return run;
  }

  // ------------------------------------------------------------------ the director (1 Hz)
  const MAKERS = { ambush, caravan, nightraid, rift, warmarch, bounty };
  const roomState = r => (r.wild ||= { cool: {}, player: new Map(), village: new Map(), tick: 0, nextMarch: 0, nextBounty: 0 });
  function begin(room, pv, run, kind) {
    const key = room.id + '|' + run.ev.uid;
    const def = { id: run.ev.id, name: run.ev.name, zone: run.ev.zone, level: run.ev.level, kind, wild: true };
    zoneRuns.set(key, { run, room, def });
    live.set(run.ev.uid, { run, room, def, key, kind, pv, lastPin: now() });
    counters['wild_' + kind] = (counters['wild_' + kind] || 0) + 1;
    run.step();
    const hear = hearers(room, run);
    tellZone(hear, { kind: 'start', ev: run.view(), text: run.announce });
    for (const c of hear) c.send(JSON.stringify({ t: 'chat', ch: 'system', from: 0, name: run.ev.name, text: run.announce }));
    return run;
  }
  /** Who hears an event: everyone in its zone, and anyone within reach of it. */
  function hearers(room, run) {
    const out = new Set();
    const zk = run.ev.zone;
    const pv = live.get(run.ev.uid)?.pv;
    for (const c of room.clients.values()) {
      const e = c.entity; if (!e) continue;
      const inZone = pv && zk && pv.L.zoneOf && pv.L.zoneOf(e.x, e.z) === zk;
      if (inZone && (run.ev.kind === 'warmarch' || run.ev.kind === 'bounty')) { out.add(c); continue; }
      if (Math.hypot(e.x - run.at.x, e.z - run.at.z) <= run.reach * 1.6) out.add(c);
    }
    return [...out];
  }
  function liveNear(room, x, z, m) {
    for (const l of live.values()) if (l.room === room && Math.hypot(l.run.at.x - x, l.run.at.z - z) < m) return true;
    for (const z2 of zoneRuns.values()) if (z2.room === room && !z2.def.wild) { const v = z2.run.ev; if (Math.hypot(v.x - x, v.z - z) < m) return true; }
    // ...nor beside a zone event's arena at all (it comes alive when a player walks up: two events on one spot is a muddle)
    const pv = [...P.values()].find(q => q.copies.includes(room));
    if (pv) for (const a of pv.L.zoneEvents || []) if (Math.hypot(a.x - x, a.z - z) < (a.r || 40) + (a.nearM ?? 50) + 150) return true;
    return false;
  }
  function tick() {
    const t = now();
    // step the live ones
    for (const [uid, l] of [...live]) {
      const { run, room } = l;
      let res;
      try { res = run.step(); } catch (err) { log('wild event ' + l.kind, err && err.stack); res = run.lose ? run.lose('error') : 'lost'; }
      if (res === 'live') {
        frameTo(run, room);
        if (run.moving && t - l.lastPin > 10000) { l.lastPin = t; tellZone(hearers(room, run), { kind: 'update', ev: run.view() }); }
        continue;
      }
      const hear = hearers(room, run);
      finishEvent(run, room, res, hear);
      tellZone(hear, { kind: 'end', ev: run.view(), won: res === 'won', result: res === 'won' ? 'success' : 'fail', ...(res === 'won' ? {} : { why: run.why || 'time' }), text: res === 'won' ? ((run.ev.info && run.ev.info.onSuccess) || run.ev.name + ' is over. Well fought.') : ((run.ev.info && run.ev.info.onFail) || run.ev.name + ' was lost.') });
      zoneRuns.delete(l.key); live.delete(uid);
      // what a won event leaves standing (the caravan) is put away a little later; whatever else it made goes now
      const leftovers = [...run.spawned];
      if (res === 'won' && run.after) setTimeout0(room, () => { for (const m of leftovers) if (!m.removed) room.remove(m); }, run.after);
      else if (res === 'won') for (const m of leftovers) { if (m.kind !== 'monster' && !m.removed) room.remove(m); }
      counters['wild_' + l.kind + '_' + res] = (counters['wild_' + l.kind + '_' + res] || 0) + 1;
    }
    // start new ones (each copy, each rule)
    for (const pv of P.values()) {
      const cfg = cfgOf(pv);
      if (cfg.off) continue;
      const g = groundOf(pv);
      for (const room of pv.copies) {
        if (!room.clients.size) continue;
        const S = roomState(room), rng = rngOf(room);
        S.tick++;
        const nLive = [...live.values()].filter(l => l.room === room).length;
        if (nLive >= cfg.maxLivePerRoom) continue;
        const players = [];
        for (const c of room.clients.values()) { const e = c.entity; if (!e || e.dead || !e.char) continue; const o = online.get(e.char.id); if (o && o.entity === e) players.push(o); }
        if (!players.length) continue;
        // every 10 s: the road events for each player on a road (ambush, caravan) and the rift
        if (S.tick % 10 === 0) for (const o of players) {
          const e = o.entity, lvl = o.char.level || 1;
          const skip = why => { counters['wildSkip_' + why] = (counters['wildSkip_' + why] || 0) + 1; };
          if (isNewcomer(o)) { skip('newcomer'); continue; }
          if ((e.state & 2) || o.room !== room) { skip('fighting'); continue; }
          const pc = S.player.get(o.char.id) || {};
          if (liveNear(room, e.x, e.z, cfg.quietM)) { skip('busy'); continue; }
          const onRoad = g.onRoad(e.x, e.z, cfg.ambush.roadM) && g.townDist(e.x, e.z) >= cfg.ambush.townM;
          let run = null, kind = null;
          if (onRoad && lvl >= cfg.ambush.minLevel && !(t < (pc.ambush || 0)) && rng() < cfg.ambush.chancePer10s) { kind = 'ambush'; run = ambush(room, pv, o, cfg, rng); }
          else if (onRoad && lvl >= cfg.caravan.minLevel && !(t < (pc.caravan || 0)) && rng() < cfg.caravan.chancePer10s) { kind = 'caravan'; run = caravan(room, pv, o, cfg, rng); }
          if (run) { pc[kind] = t + cfg[kind].playerCooldownMin * 60000; S.player.set(o.char.id, pc); begin(room, pv, run, kind); break; }
        }
        if (S.tick % 60 === 30 && !(t < (S.cool.rift || 0))) {
          const o = pick(rng, players), e = o.entity;
          const k = cfg.rift.chancePerMin * (isNight() ? cfg.rift.nightK : 1);
          if (!isNewcomer(o) && (o.char.level || 1) >= cfg.rift.minLevel && !liveNear(room, e.x, e.z, cfg.quietM) && rng() < k) {
            const run = rift(room, pv, o, cfg, rng);
            if (run) { S.cool.rift = t + cfg.rift.roomCooldownMin * 60000; begin(room, pv, run, 'rift'); }
          }
        }
        // night: a village near a player is raided
        if (isNight() && S.tick % 15 === 7) for (const o of players) {
          if (isNewcomer(o) || (o.char.level || 1) < cfg.nightraid.minLevel) continue;
          const e = o.entity;
          const v = g.villages.find(q => Math.hypot(q.x - e.x, q.z - e.z) < cfg.nightraid.villageM && !(t < (S.village.get(q.name) || 0)));
          if (!v || liveNear(room, v.x, v.z, cfg.quietM)) continue;
          const run = nightraid(room, pv, v, cfg, rng);
          S.village.set(v.name, t + cfg.nightraid.villageCooldownMin * 60000);
          if (run) { begin(room, pv, run, 'nightraid'); break; }
        }
        // the warlord's march and the bounty: now and then, in a zone where someone is (not the newcomers' fields)
        const zonesHere = [...new Set(players.map(o => g.zoneOf(o.entity.x, o.entity.z)).filter(Boolean))];
        const bandOf = zk => ((pv.L.zones.find(q => q.key === zk) || {}).sheet || {}).band || [1, 4];
        if (!S.nextMarch) S.nextMarch = t + (cfg.warmarch.everyMin[0] + rng() * (cfg.warmarch.everyMin[1] - cfg.warmarch.everyMin[0])) * 60000;
        if (t >= S.nextMarch && ![...live.values()].some(l => l.room === room && l.kind === 'warmarch')) {
          S.nextMarch = t + (cfg.warmarch.everyMin[0] + rng() * (cfg.warmarch.everyMin[1] - cfg.warmarch.everyMin[0])) * 60000;
          const zs = zonesHere.filter(zk => bandOf(zk)[0] >= cfg.warmarch.minBand);
          if (zs.length) { const run = warmarch(room, pv, cfg, rng, pick(rng, zs)); if (run) begin(room, pv, run, 'warmarch'); }
        }
        if (!S.nextBounty) S.nextBounty = t + (cfg.bounty.everyMin[0] + rng() * (cfg.bounty.everyMin[1] - cfg.bounty.everyMin[0])) * 60000 * 0.5;
        if (t >= S.nextBounty && ![...live.values()].some(l => l.room === room && l.kind === 'bounty')) {
          S.nextBounty = t + (cfg.bounty.everyMin[0] + rng() * (cfg.bounty.everyMin[1] - cfg.bounty.everyMin[0])) * 60000;
          const zs = zonesHere.filter(zk => bandOf(zk)[0] >= cfg.bounty.minBand);
          if (zs.length) { const run = bounty(room, pv, cfg, rng, pick(rng, zs)); if (run) begin(room, pv, run, 'bounty'); }
        }
      }
    }
  }
  // a delayed removal on the room's own clock (no timers in a pure module: checked on the next ticks)
  const later = [];
  function setTimeout0(room, fn, ms) { later.push({ room, at: room.now() + ms, fn }); }
  function tickLater() { for (let i = later.length - 1; i >= 0; i--) if (later[i].room.now() >= later[i].at) { const f = later[i].fn; later.splice(i, 1); try { f(); } catch { /* gone */ } } }

  function use(o, obj) {
    const d = obj.data || {};
    if (!d.rift) return false;
    const l = live.get(d.rift);
    const res = l && l.run.seal ? l.run.seal(o) : { ok: false, msg: 'The rift has closed.' };
    if (o.conn) o.conn.sendJSON({ t: 'used', id: obj.id, ok: !!res.ok, kind: 'rift', name: obj.name, text: res.msg, ...(res.ok ? {} : { why: 'rift', msg: res.msg }) });
    return true;
  }
  /** Start one now: `kind` at a player (`o`) in copy `r` (a village by name for a night raid; a zone key for march/bounty). */
  function start(kind, r, o, arg = null) {
    const pv = [...P.values()].find(q => q.copies.includes(r));
    if (!pv || !MAKERS[kind]) return null;
    const cfg = cfgOf(pv), rng = rngOf(r), g = groundOf(pv);
    let run = null;
    if (kind === 'nightraid') { const v = arg ? g.villages.find(q => q.name === arg) : g.villages.slice().sort((a, b) => Math.hypot(a.x - o.entity.x, a.z - o.entity.z) - Math.hypot(b.x - o.entity.x, b.z - o.entity.z))[0]; run = v ? nightraid(r, pv, v, cfg, rng) : null; }
    else if (kind === 'warmarch' || kind === 'bounty') run = MAKERS[kind](r, pv, cfg, rng, arg || g.zoneOf(o.entity.x, o.entity.z));
    else run = MAKERS[kind](r, pv, o, cfg, rng);
    return run ? begin(r, pv, run, kind) : null;
  }
  return { tick() { tickLater(); tick(); }, use, start, live, groundOf, plural };
}
