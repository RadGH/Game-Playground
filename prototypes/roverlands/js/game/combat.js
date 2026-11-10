// The Rustwild's rules (Expansion 1 M8): the zone, vehicle hit points, the guns, the raider camps' simple AI, the
// raiders' slow shots and the combat job's level goals. PURE — no DOM, no three.js, no Rapier, no clock of its own
// (every step is handed `dt` / `now`), and the same seed always gives the same fight. The room runs it
// (js/game/jobs/combat.js, inside js/net/room-core.js), the page draws what the room says (js/game/combat-play.js), and
// tests/combat.test.js checks it.
//
//   inZone(sites, x, z)                    -> is (x, z) inside the Rustwild (sites.rustwild.poly)
//   groundAt(grid, x, z, fallback)         -> the ground height from the coarse grid the county carries for the room
//   vehicleMaxHp(kind, upgrades)           -> hit points of that vehicle for a driver with those upgrades
//   weaponFor(kind, seat, upgrades)        -> the WEAPONS row the seat fires (or the Second gun mount's), or null
//   gunRate(kind, seat, upgrades)          -> shots a second from that seat (Quick loader makes it faster)
//   crashDamage(dv)                        -> hp lost in a crash at dv m/s
//   createCamps(sites)                     -> every camp with its raiders (ids are fixed: camp index * 16 + k)
//   stepCamp(camp, dt, targets, ctx)       -> the raiders move, turn, aim and fire (returns the shots fired)
//   stepShots(shots, dt, targets, ctx)     -> the raiders' shots fly; returns what they hit
//   damageFoe(camp, foe, dmg)              -> hp left; marks the foe dead at 0
//   campDefenders(camp) / campCleared(camp) / campPay(job, camp)
//   goalMet(need, rec, now) / goalText(need, rec, now)
import { WEAPONS, COMBAT_VEHICLES, DEFAULT_HP, DEFAULT_RADIUS, FOOT_RADIUS, UPGRADES, CRASH, FOES, AGGRO, CAMP_LAYOUTS } from './combat-data.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; };
const hyp = (dx, dz) => Math.hypot(dx, dz);

/** Point in polygon ([[x, z], ...]). */
export function inPoly(poly, x, z) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export const inZone = (sites, x, z) => inPoly(sites?.rustwild?.poly, x, z);

/** Bilinear height from `grid` ({ x0, z0, step, nx, nz, h }) — null outside it (or with no grid). */
export function groundAt(grid, x, z, fallback = null) {
  if (!grid?.h) return fallback;
  const fx = (x - grid.x0) / grid.step, fz = (z - grid.z0) / grid.step;
  if (fx < 0 || fz < 0 || fx > grid.nx - 1 || fz > grid.nz - 1) return fallback;
  const i = Math.min(grid.nx - 2, Math.floor(fx)), j = Math.min(grid.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, H = grid.h, k = j * grid.nx + i;
  return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + grid.nx] * (1 - tx) + H[k + grid.nx + 1] * tx) * tz;
}

// ------------------------------------------------------------------------------------------------ vehicles + guns
const has = (ups, id) => Array.isArray(ups) && ups.includes(id);
export function vehicleMaxHp(kind, upgrades = []) {
  const base = COMBAT_VEHICLES[kind]?.hp ?? DEFAULT_HP;
  return Math.round(base * (has(upgrades, 'combat_armour') ? UPGRADES.combat_armour.hpScale : 1));
}
export const vehicleRadius = kind => COMBAT_VEHICLES[kind]?.r ?? DEFAULT_RADIUS;
/** The gun kind a seat fires, or null. The Second gun mount gives a driver with no gun of their own a forward one. */
export function gunKind(kind, seat, upgrades = []) {
  const g = COMBAT_VEHICLES[kind]?.guns?.[seat];
  if (g) return g;
  if (seat === 0 && COMBAT_VEHICLES[kind] && has(upgrades, 'combat_twin_gun')) return UPGRADES.combat_twin_gun.driverGun;
  return null;
}
export const weaponFor = (kind, seat, upgrades = []) => { const g = gunKind(kind, seat, upgrades); return g ? { kind: g, ...WEAPONS[g] } : null; };
/** True when the seat's gun is the Second gun mount's (fires straight ahead, no turret). */
export const isMountGun = (kind, seat, upgrades = []) => !COMBAT_VEHICLES[kind]?.guns?.[seat] && !!gunKind(kind, seat, upgrades);
export function gunRate(kind, seat, upgrades = []) {
  const w = weaponFor(kind, seat, upgrades); if (!w) return 0;
  return w.rate * (has(upgrades, 'combat_fast_guns') ? UPGRADES.combat_fast_guns.rateScale : 1);
}
export function crashDamage(dv) {
  const v = Math.abs(Number(dv) || 0);
  return v <= CRASH.safe ? 0 : Math.min(CRASH.max, Math.round((v - CRASH.safe) * CRASH.perMs));
}

// ------------------------------------------------------------------------------------------------ camps
/** Every camp of sites.rustwild with its raiders, in camp order. Foe ids: camp index * 16 + k (k = 0 the generator). */
export function createCamps(sites) {
  const list = Array.isArray(sites?.rustwild?.camps) ? sites.rustwild.camps : [];
  const grid = sites?.rustwild?.grid || null;
  return list.map((c, ci) => {
    const L = CAMP_LAYOUTS[c.id] || CAMP_LAYOUTS.camp_redcut;
    const y0 = Number.isFinite(c.y) ? c.y : 0;
    const at = (dx, dz) => { const x = c.x + dx, z = c.z + dz; return [x, groundAt(grid, x, z, y0), z]; };
    const foes = [];
    const g = at(L.gen[0], L.gen[1]);
    foes.push(foe(ci * 16, 'generator', g, L.genHp));
    L.foes.forEach(([type, dx, dz], k) => foes.push(foe(ci * 16 + k + 1, type, at(dx, dz))));
    return { i: ci, id: c.id, name: c.name || c.id, title: L.title, tier: L.tier, fortress: !!L.fortress, x: c.x, z: c.z, y: y0, r: c.r || 24,
      foes, state: 'held', clearedAt: 0, backAt: 0, hold: 1, awake: false, sleptAt: 0, helpers: new Map(), fightAt: 0, repairs: new Set() };
  });
  function foe(id, type, p, hp) {
    const F = FOES[type], max = hp || F.hp;
    const home = [p[0], p[1] + (type === 'drone' ? F.alt : 0), p[2]];
    return { id, type, home, p: home.slice(), yaw: 0, aim: 0, hp: max, max, dead: false, cd: 0, wind: 0, target: null, burst: 0, phase: (id * 1.7) % TAU };
  }
}
/** Put a camp back: every raider home, full health (a cleared camp coming back, or a fresh hold). */
export function resetCamp(camp) {
  for (const f of camp.foes) { f.p = f.home.slice(); f.hp = f.max; f.dead = false; f.cd = 0; f.wind = 0; f.target = null; f.burst = 0; f.yaw = 0; f.aim = 0; }
  camp.state = 'held'; camp.helpers.clear(); camp.fightAt = 0; camp.repairs.clear(); camp.hold++;
}
export const campDefenders = camp => camp.foes.filter(f => f.type !== 'generator');
export const campCleared = camp => camp.foes.every(f => f.dead);
export const campLeft = camp => camp.foes.filter(f => !f.dead).length;
export function campPay(job, camp) {
  const p = job?.pay || {};
  return Math.round((p.base ?? 120) + (p.per_enemy ?? 25) * campDefenders(camp).length + (camp.fortress ? (p.fortress ?? 200) : 0));
}
/** hp left after `dmg`; a foe at 0 is dead (its wreck stays until the camp comes back). */
export function damageFoe(camp, f, dmg) {
  if (!f || f.dead) return 0;
  f.hp = Math.max(0, f.hp - Math.max(0, dmg));
  if (f.hp <= 0) { f.dead = true; f.target = null; }
  return f.hp;
}

/**
 * The raiders think. `targets` = [{ key, p: [x,y,z], r }] (occupied vehicles and people on foot in the county — the
 * referee builds it); ctx = { grid, rand () -> 0..1 }. Returns the shots fired: [{ kind, p, d, speed, dmg, from }].
 */
export function stepCamp(camp, dt, targets, ctx = {}) {
  const shots = [];
  const rand = ctx.rand || Math.random, grid = ctx.grid || null;
  for (const f of camp.foes) {
    if (f.dead || f.type === 'generator') continue;
    const F = FOES[f.type];
    // who to fight: the current target while it is still in reach, else the nearest one in reach
    const reach = f.type === 'turret' ? F.range + 12 : AGGRO;
    const fromCamp = t => hyp(t.p[0] - camp.x, t.p[2] - camp.z);
    let tgt = f.target ? targets.find(t => t.key === f.target) : null;
    if (tgt && (f.type === 'turret' ? hyp(tgt.p[0] - f.p[0], tgt.p[2] - f.p[2]) > reach : fromCamp(tgt) > (F.leash || AGGRO * 1.4))) tgt = null;
    if (!tgt) {
      let bd = Infinity;
      for (const t of targets) {
        const d = f.type === 'turret' ? hyp(t.p[0] - f.p[0], t.p[2] - f.p[2]) : fromCamp(t);
        if (d <= reach && d < bd) { bd = d; tgt = t; }
      }
      if (tgt && tgt.key !== f.target) f.wind = F.wind;       // a new target: a moment of aiming first (readable)
    }
    f.target = tgt ? tgt.key : null;
    const dx = tgt ? tgt.p[0] - f.p[0] : 0, dz = tgt ? tgt.p[2] - f.p[2] : 0, dist = hyp(dx, dz);
    if (f.type === 'turret') {
      if (tgt) f.aim += Math.max(-F.turn * dt, Math.min(F.turn * dt, angDiff(f.aim, Math.atan2(dx, dz))));
      f.yaw = f.aim;
    } else if (f.type === 'drone') {
      f.phase = (f.phase + dt * (tgt ? 0.45 : 0.3)) % TAU;
      const cx = tgt ? tgt.p[0] : f.home[0], cz = tgt ? tgt.p[2] : f.home[2], rr = tgt ? F.orbit : 10;
      const wx = cx + Math.cos(f.phase) * rr, wz = cz + Math.sin(f.phase) * rr;
      const wy = (tgt ? groundAt(grid, wx, wz, tgt.p[1]) : f.home[1] - F.alt) + F.alt;
      const mx = wx - f.p[0], my = wy - f.p[1], mz = wz - f.p[2], m = Math.hypot(mx, my, mz), step = Math.min(m, F.move * dt);
      if (m > 0.01) { f.p[0] += mx / m * step; f.p[1] += my / m * step; f.p[2] += mz / m * step; }
      f.yaw = tgt ? Math.atan2(dx, dz) : f.phase;
      f.aim = f.yaw;
    } else if (f.type === 'buggy') {
      // chase to `keep` metres, then circle the target (a moving gun that is not too hard to hit); home if led too far
      let want;
      if (!tgt) { const hx = f.home[0] - f.p[0], hz = f.home[2] - f.p[2]; want = hyp(hx, hz) > 3 ? Math.atan2(hx, hz) : null; }
      else if (dist > F.keep + 6) want = Math.atan2(dx, dz);
      else want = Math.atan2(dx, dz) + (f.id % 2 ? 1 : -1) * Math.PI / 2 * 0.9;
      let sp = 0;
      if (want != null) {
        const d = angDiff(f.yaw, want);
        f.yaw += Math.max(-F.turn * dt, Math.min(F.turn * dt, d));
        sp = F.move * (1 - Math.min(0.6, Math.abs(d) / Math.PI)) * (tgt ? 1 : 0.6);
      }
      f.p[0] += Math.sin(f.yaw) * sp * dt; f.p[2] += Math.cos(f.yaw) * sp * dt;
      f.p[1] = groundAt(grid, f.p[0], f.p[2], f.p[1]);
      f.aim = tgt ? Math.atan2(dx, dz) : f.yaw;
    }
    // firing
    if (!tgt) { f.burst = 0; continue; }
    if (f.wind > 0) { f.wind -= dt; continue; }
    f.cd -= dt;
    const aimed = f.type !== 'turret' || Math.abs(angDiff(f.aim, Math.atan2(dx, dz))) < 0.2;
    const d3 = Math.hypot(dx, tgt.p[1] - f.p[1], dz);
    if (f.burst > 0 && f.cd <= 0) { shots.push(fire(f, F, tgt, rand)); f.burst--; f.cd = f.burst > 0 ? F.gap : F.every; }
    else if (f.cd <= 0 && aimed && d3 <= F.range) {
      shots.push(fire(f, F, tgt, rand));
      if (F.burst) { f.burst = F.burst - 1; f.cd = F.gap; } else f.cd = F.every;
    }
  }
  return shots;
}
function fire(f, F, tgt, rand) {
  const lift = f.type === 'turret' ? 6.4 : f.type === 'buggy' ? 1.6 : 0;      // the turret's gun is up on its tower
  const p = [f.p[0], f.p[1] + lift, f.p[2]];
  // aim at where the target is NOW (no leading — moving dodges), with a little scatter
  const s = 0.03;
  let dx = tgt.p[0] - p[0] + (rand() - 0.5) * s * 20, dy = tgt.p[1] - p[1] + (rand() - 0.5) * s * 10, dz = tgt.p[2] - p[2] + (rand() - 0.5) * s * 20;
  const m = Math.hypot(dx, dy, dz) || 1; dx /= m; dy /= m; dz /= m;
  return { kind: F.shot, p, d: [dx, dy, dz], speed: F.speed, dmg: F.dmg, from: f.id };
}

/** Where a segment p0 -> p1 first meets a sphere (c, r): t in 0..1, or null. */
export function segSphere(p0, p1, c, r) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const fx = p0[0] - c[0], fy = p0[1] - c[1], fz = p0[2] - c[2];
  const a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  if (a < 1e-9) return null;
  const disc = b * b - 4 * a * cc; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
/**
 * The raiders' shots fly for `dt`. shots = [{ id, kind, p, d, speed, dmg, life }] (changed in place: the ones that hit
 * or land are taken out). Returns [{ shot, target | null, at }] — a null target = it hit the ground.
 */
export function stepShots(shots, dt, targets, ctx = {}) {
  const out = [], grid = ctx.grid || null;
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const p1 = [s.p[0] + s.d[0] * s.speed * dt, s.p[1] + s.d[1] * s.speed * dt, s.p[2] + s.d[2] * s.speed * dt];
    let best = null, bt = Infinity;
    for (const t of targets) { const k = segSphere(s.p, p1, t.c || t.p, t.r); if (k != null && k < bt) { bt = k; best = t; } }
    // a shack in the way stops the shot first (ctx.cover: boxes { x, z, hx, hz, y0, y1 })
    let wall = Infinity;
    for (const b of ctx.cover || []) { const k = segBox(s.p, p1, b); if (k != null && k < wall) wall = k; }
    if (wall < bt) { out.push({ shot: s, target: null, at: [s.p[0] + (p1[0] - s.p[0]) * wall, s.p[1] + (p1[1] - s.p[1]) * wall, s.p[2] + (p1[2] - s.p[2]) * wall] }); shots.splice(i, 1); continue; }
    if (best) { out.push({ shot: s, target: best, at: [s.p[0] + (p1[0] - s.p[0]) * bt, s.p[1] + (p1[1] - s.p[1]) * bt, s.p[2] + (p1[2] - s.p[2]) * bt] }); shots.splice(i, 1); continue; }
    const g = groundAt(grid, p1[0], p1[2], null);
    s.life -= dt;
    if ((g != null && p1[1] < g - 0.2) || s.life <= 0) { out.push({ shot: s, target: null, at: p1 }); shots.splice(i, 1); continue; }
    s.p = p1;
  }
  return out;
}
/** Where (0..1) the segment a -> b first enters the upright box { x, z, hx, hz, y0, y1 }, or null. */
export function segBox(a, b, box) {
  const lo = [box.x - box.hx, box.y0, box.z - box.hz], hi = [box.x + box.hx, box.y1, box.z + box.hz];
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < lo[k] || a[k] > hi[k]) return null; continue; }
    let u = (lo[k] - a[k]) / d, v = (hi[k] - a[k]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return null;
  }
  return t0;
}
export const footRadius = () => FOOT_RADIUS;

// ------------------------------------------------------------------------------------------------ level goals
/**
 * A level's goal (data/jobs.json combat level.need) against a player's record rec = { clears: [{ camp, at, clean }] }:
 *   { clears: n, within?: s }   n camps cleared (within the last s seconds, if given)
 *   { clean: true }             the camp just cleared, without your vehicle being wrecked during that fight
 *   { camp: id }                the camp just cleared is that one (the fortress)
 *   { distinct: n, within: s }  n different camps cleared within s seconds of each other (all five in one run)
 */
export function goalMet(need, rec, now) {
  if (!need) return false;
  const C = rec?.clears || [];
  const recent = s => (s ? C.filter(c => now - c.at <= s * 1000) : C);
  const last = C[C.length - 1];
  if (need.clean) return !!last?.clean;                  // the clear just made (levels are done in order)
  if (need.camp) return last?.camp === need.camp;
  if (need.distinct) return new Set(recent(need.within).map(c => c.camp)).size >= need.distinct;
  if (need.clears) return recent(need.within).length >= need.clears;
  return false;
}
export function goalText(need, rec, now, names = {}) {
  if (!need) return '';
  const C = rec?.clears || [];
  const recent = s => (s ? C.filter(c => now - c.at <= s * 1000) : C);
  const mins = s => `${Math.round(s / 60)} min`;
  if (need.clean) return 'Clear a camp without your vehicle being wrecked';
  if (need.camp) return `Clear ${names[need.camp] || 'the fortress'}`;
  if (need.distinct) return `Different camps cleared in ${mins(need.within)}: ${Math.min(need.distinct, new Set(recent(need.within).map(c => c.camp)).size)} / ${need.distinct}`;
  if (need.clears) return need.clears === 1 ? 'Clear any raider camp' : `Camps cleared${need.within ? ` in the last ${mins(need.within)}` : ''}: ${Math.min(need.clears, recent(need.within).length)} / ${need.clears}`;
  return '';
}
