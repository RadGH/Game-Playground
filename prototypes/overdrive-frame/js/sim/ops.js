// Mission types beyond "kill things" (owner: wipe out, defend, escort, demolition, sabotage, convoy raid, extract,
// hunt, nest, orbital drop). The parts that need more than a kill count live here, hooked into mission.js at three
// points (setupOps after createMission, stepOps every step, opsObjective for the objective types it owns):
//   place      enemies placed far from the drop point (nests, a marked hunt target)
//   plant      sabotage: stand at each marked mast for a few seconds
//   carry      recovery: pick up a data core, bring it to the dropship (the carrier is slower; drop it when downed)
//   intercept  convoy raid: enemy trucks drive across the district to an exit; stop enough before they're through
//   escort     friendly trucks drive across; enemies go for them; get enough through
//   orbital    orbital drop: steer where you land while falling; the landing is a shockwave
// Pure and seeded like the rest of the rules.
import { makeRng } from './rng.js';
import { blocked } from './world.js';
import { makeFlow, updateFlow, flowDir, flowDist } from './flow.js';
import { JOBS } from './enemies.js';

const open = (S, x, z) => !blocked(S.world, x, z, 0) && !blocked(S.world, x + 0.3, z, 0) && !blocked(S.world, x - 0.3, z, 0) && !blocked(S.world, x, z + 0.3, 0) && !blocked(S.world, x, z - 0.3, 0);

/** Open spots far from the drop point, spread apart, reachable from it (the flow field from the start reaches them). */
export function farSpots(S, R, n, { minFromStart = 12, apart = 6 } = {}) {
  const st = S.def.start[0], F = makeFlow(S.world); updateFlow(F, S.world, [st]);
  const cand = [];
  for (let z = 1; z < S.world.h - 1; z++) for (let x = 1; x < S.world.w - 1; x++) {
    const px = x + 0.5, pz = z + 0.5, d = flowDist(F, px, pz);
    if (d < minFromStart || !Number.isFinite(d) || !open(S, px, pz)) continue;
    cand.push({ x: px, z: pz, d });
  }
  const out = [];
  for (let tries = 0; out.length < n && tries < 4000 && cand.length; tries++) {
    const c = cand[Math.floor(R.next() * cand.length)];
    if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= apart)) out.push(c);
  }
  for (let a = apart * 0.7; out.length < n && a > 1; a *= 0.7) for (const c of cand) { if (out.length >= n) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= a)) out.push(c); }
  return out;
}

/** The road end furthest from the drop point and the one furthest from that: a convoy's way in and out. */
function convoyRoute(S) {
  const edges = S.def.map.edges?.length ? S.def.map.edges : [{ x: 0.5, z: S.world.h / 2 }, { x: S.world.w - 0.5, z: S.world.h / 2 }];
  const st = S.def.start[0];
  const exit = edges.reduce((b, e) => (Math.hypot(e.x - st.x, e.z - st.z) > Math.hypot(b.x - st.x, b.z - st.z) ? e : b), edges[0]);
  const F = makeFlow(S.world); updateFlow(F, S.world, [exit]);
  const entry = edges.filter(e => Number.isFinite(flowDist(F, e.x, e.z))).reduce((b, e) => (flowDist(F, e.x, e.z) > flowDist(F, b.x, b.z) ? e : b), edges[0]);
  return { entry, exit, flow: F };
}

export function setupOps(S) {
  const def = S.def, R = makeRng((def.seed || 1) * 7 + 911);
  S.allies = []; S.ops = { plants: [], core: null, route: null, escaped: 0, arrived: 0, lost: 0, convoyLeft: 0, landed: false, convoyUnits: [] };
  // enemies placed far away (nests, the hunt's marked target)
  for (const p of def.place || []) {
    for (const spot of farSpots(S, R, p.count || 1, { apart: 7 })) {
      const e = S.spawn(p.kind, spot.x, spot.z, { warn: 0, elite: !!p.elite, force: true });
      if (e) { if (p.tag) e.tag = p.tag; if (p.hpMul) { e.hp *= p.hpMul; e.hpMax *= p.hpMul; } }
    }
  }
  for (const o of S.objectives) {
    if (o.type === 'plant') { S.ops.plants = farSpots(S, R, o.count, { apart: 8 }).map((p, i) => ({ id: 'mast' + i, x: p.x, z: p.z, t: 0, done: false })); o.points = S.ops.plants; }
    if (o.type === 'carry') { const p = farSpots(S, R, 1, { minFromStart: 16 })[0] || { x: S.world.w / 2, z: S.world.h / 2 }; S.ops.core = { x: p.x, z: p.z, carrier: null, pick: 0, home: false }; o.core = S.ops.core; }
  }
  if (def.convoy) {
    S.ops.route = convoyRoute(S);
    S.ops.convoyLeft = def.convoy.count; S.ops.convoyAt = def.convoy.at ?? 10;
  }
  if (def.orbital) { S.ops.orbital = { alt0: def.drop }; }
  // enemies can hurt the convoy's trucks
  const hurt = S.hurtPlayer;
  S.hurtPlayer = (m, amount, dtype, from) => (m.ally ? hurtAlly(S, m, amount) : hurt(m, amount, dtype, from));
}

function hurtAlly(S, a, amount) {
  if (a.down || a.arrived) return;
  a.hp -= amount; a.hurtT = 0.2; S.events.push({ type: 'allyHit', id: a.id, amount, x: a.x, z: a.z });
  if (a.hp <= 0) { a.down = true; a.hp = 0; S.ops.lost++; S.events.push({ type: 'allyDown', id: a.id, x: a.x, z: a.z }); }
}

/** Every step (called from stepMission after the shots have moved). */
export function stepOps(S, inputs, dt) {
  const O = S.ops; if (!O) return;
  // orbital drop: steer the landing point while falling; land with a shockwave
  if (O.orbital && S.phase === 'drop') {
    for (const p of S.players) {
      const inp = inputs?.[p.id] || {}, m = p.mech, sp = 5;
      const nx = Math.max(1, Math.min(S.world.w - 1, m.x + (inp.mx || 0) * sp * dt)), nz = Math.max(1, Math.min(S.world.h - 1, m.z + (inp.mz || 0) * sp * dt));
      m.x = nx; m.z = nz; m.vx = m.vz = 0;
      m.y = Math.max(0, S.phaseT) * 3; m.vy = 0; m.air = true;      // high above the roofs until the last moment
    }
  }
  if (O.orbital && !O.landed && S.phase !== 'drop') {
    O.landed = true;
    for (const p of S.players) {
      const m = p.mech;
      if (blocked(S.world, m.x, m.z, 0)) { m.y = 0; S.world && pushFree(S, m); }    // landed on a roof edge: slide off it
      for (const e of S.candidates(m.x, m.z, 2.2)) { const d = Math.hypot(e.x - m.x, e.z - m.z); S.damageEnemy(e, (S.def.orbitalDmg || 900) * (1 - d / 2.4), 'explosive', m.id, 0); const a = Math.atan2(e.z - m.z, e.x - m.x); e.vx += Math.cos(a) * 4; e.vz += Math.sin(a) * 4; }
      S.events.push({ type: 'orbitalLand', id: m.id, x: m.x, z: m.z });
    }
  }
  // sabotage masts: anyone standing at one fills it
  for (const pl of O.plants) {
    if (pl.done) continue;
    const on = S.mechs.some(m => !m.down && m.team !== 'enemy' && Math.hypot(m.x - pl.x, m.z - pl.z) < 0.6);
    pl.t = on ? pl.t + dt : Math.max(0, pl.t - dt * 0.5);
    if (pl.t >= (S.objectives.find(o => o.type === 'plant')?.time || 3)) { pl.done = true; S.events.push({ type: 'planted', id: pl.id, x: pl.x, z: pl.z }); }
  }
  // the data core
  const c = O.core;
  if (c && !c.home) {
    if (c.carrier) {
      const m = S.byId.get(c.carrier);
      if (!m || m.down) { S.events.push({ type: 'coreDrop', x: c.x, z: c.z }); c.carrier = null; c.pick = 0; if (m) carry(m, false); }
      else { c.x = m.x; c.z = m.z; const ex = S.def.extract; if (ex && Math.hypot(m.x - ex.x, m.z - ex.z) < (ex.r || 1.4)) { c.home = true; carry(m, false); S.events.push({ type: 'coreHome', x: c.x, z: c.z }); } }
    } else {
      const m = S.mechs.find(q => !q.down && q.team !== 'enemy' && Math.hypot(q.x - c.x, q.z - c.z) < 0.5);
      c.pick = m ? c.pick + dt : 0;
      if (m && c.pick > 1.2) { c.carrier = m.id; carry(m, true); S.events.push({ type: 'corePick', id: m.id, x: c.x, z: c.z }); }
    }
  }
  // convoys
  const cv = S.def.convoy;
  if (cv && O.convoyLeft > 0 && S.phase !== 'drop' && S.time >= (S.def.drop ?? 3) + O.convoyAt) {
    const { entry } = O.route, i = cv.count - O.convoyLeft;
    if (cv.side === 'enemy') { const e = S.spawn(cv.kind, entry.x, entry.z, { warn: 0, force: true }); if (e) { e.tag = 'convoy'; e.convoy = true; O.convoyUnits.push(e); } }
    else S.allies.push({ id: 'a' + i, ally: true, kind: cv.kind, x: entry.x, z: entry.z, vx: 0, vz: 0, face: 0, r: 0.22, hp: 2600 + (S.def.tier || 1) * 900, hpMax: 2600 + (S.def.tier || 1) * 900, down: false, arrived: false, hurtT: 0 });
    O.convoyLeft--; O.convoyAt += 4.5;
  }
  if (cv?.side === 'ally') {
    for (const a of S.allies) {
      a.hurtT = Math.max(0, a.hurtT - dt);
      if (a.down || a.arrived) continue;
      const f = routeDir(S, O.route.flow, a);
      const near = S.candidates ? [...S.candidates(a.x, a.z, 1.4)].length : 0;
      const sp = 1.1 * (near > 3 ? 0.35 : near ? 0.7 : 1);       // harassed trucks slow down — clear the road for them
      if (f) {
        a.vx = f[0] * sp; a.vz = f[1] * sp; a.face = Math.atan2(a.vz, a.vx);
        const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;           // slide along walls rather than into them
        if (open(S, nx, nz)) { a.x = nx; a.z = nz; } else if (open(S, nx, a.z)) a.x = nx; else if (open(S, a.x, nz)) a.z = nz;
      }
      if (Math.hypot(a.x - O.route.exit.x, a.z - O.route.exit.z) < 1 || flowDist(O.route.flow, a.x, a.z) < 0.8) { a.arrived = true; O.arrived++; S.events.push({ type: 'allyArrived', id: a.id }); }
    }
    // enemy shots that reach a truck hit it (shots only test mechs on their own)
    for (const s of S.shots) {
      if (s.team === 'player' || s.life <= 0) continue;
      for (const a of S.allies) if (!a.down && !a.arrived && (a.x - s.x) ** 2 + (a.z - s.z) ** 2 < (a.r + 0.05) ** 2) { hurtAlly(S, a, s.dmg); s.life = 0; break; }
    }
  }
}

/** A truck's way along the route: toward the centre of the next tile on the path (one step, so it never cuts a corner
 *  into a building); off the path (shoved), back to the nearest tile that is on it. */
function routeDir(S, F, a) {
  const w = F.w, tx = Math.floor(a.x), tz = Math.floor(a.z), i = tz * w + tx;
  let n = F.next[i];
  if (n < 0) { let best = -1, bd = Infinity; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const j = (tz + dz) * w + tx + dx; if (tx + dx < 0 || tz + dz < 0 || tx + dx >= w || tz + dz >= F.h || F.next[j] < 0) continue; const d = dx * dx + dz * dz + F.dist[j] * 0.01; if (d < bd) { bd = d; best = j; } } n = best; }
  if (n < 0 || n === i) return null;
  const ax = (n % w) + 0.5 - a.x, az = ((n / w) | 0) + 0.5 - a.z, l = Math.hypot(ax, az) || 1;
  return [ax / l, az / l];
}

/** The core is heavy: a quarter off running and boosting while you hold it. */
function carry(m, on) {
  if (!!m.carrying === on) return;
  m.carrying = on; const k = on ? 0.75 : 1 / 0.75;
  m.stats = { ...m.stats, speedMul: m.stats.speedMul * k, boostMul: m.stats.boostMul * k };
}

function pushFree(S, m) {
  for (let r = 0.3; r < 4; r += 0.3) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r; if (open(S, x, z)) { m.x = x; m.z = z; return; } }
}

/** Objective types this module owns. Returns { progress, goal, failed? } or null for types it doesn't know. */
export function opsObjective(S, o) {
  const O = S.ops; if (!O) return null;
  if (o.type === 'plant') return { progress: O.plants.filter(p => p.done).length, goal: O.plants.length || o.count };
  if (o.type === 'carry') return { progress: O.core?.home ? 1 : 0, goal: 1 };
  if (o.type === 'intercept') {
    const killed = O.convoyUnits.filter(e => e.dead && !e.escaped).length;
    return { progress: killed, goal: o.count, failed: O.escaped > (o.of - o.count) };
  }
  if (o.type === 'escort') return { progress: O.arrived, goal: o.count, failed: O.lost > (o.of - o.count) };
  return null;
}

// Convoy trucks drive their route and never attack; one that reaches the far side has escaped.
JOBS.drive = (S, e, K, P, g, dt) => {
  const O = S.ops; if (!O?.route) return;
  const f = flowDir(O.route.flow, e.x, e.z);
  if (f) { e.vx = f[0] * K.speed; e.vz = f[1] * K.speed; e.face = Math.atan2(f[1], f[0]); }
  e.anim = 'drive';
  if (flowDist(O.route.flow, e.x, e.z) < 0.8) {
    e.dead = true; e.escaped = true; e.hp = 0; S._dead = (S._dead || 0) + 1; O.escaped++;
    S.events.push({ type: 'escaped', id: e.id, x: e.x, z: e.z });
  }
};
