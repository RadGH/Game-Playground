// Round 7 "Variety": the weapon effects that change what a gun DOES, not just its numbers (owner 2026-11-18: "bigger
// blast radius, multiple projectiles, a different element … not just bullets, magic-like effects too"). Pure, like the
// rest of js/sim: S.rng only, dt passed in. mission.js and weapons.js call in here at a handful of fixed points:
//
//   fxOf(spec)            the effect fields of a weapon spec, bundled once (null when it has none) → shot.fx
//   fireKind(...)         the new weapon kinds: lance, prism, orbital, scythe, tesla, orbs, storm, glaive
//   afterHit(...)         a player hit landed: leech, chainOnHit, vortex (non-blast shots), overkill
//   afterBlast(...)       a player blast went off: cluster bomblets, napalm ground, vortex
//   landFx(...)           a lobbed shot that leaves a zone instead of a blast (nanite cloud)
//   specialShot(...)      shots that are not bullets: seeker orbs, the returning disc
//   seekStep / ricochet   plain bullets that curve toward an enemy / bounce to the next one
//   stepWeaponFx(S, dt)   echoes due, zones (gravity wells, burning ground, nanite clouds, storms, orbital marks), bomblets
//
// Spec fields (every one optional; absent = the weapon works as before). The lead's part mods set these too:
//   dtype 'cryo' | 'void' (damage.js) · ricochet n · chainOnHit { jumps, chance } · seek rad/s · echo 0..1 ·
//   vortex { r, t, pull, dps? } · cluster n · napalm seconds · leech 0..1 · overkill 0..1
//
// Volume is capped (lessons 54 — count what really leaves the barrel): zones per kind (ZONE_CAP; a new zone near an old
// one of the same kind refreshes it instead), 60 bomblets, and nothing an effect makes carries effects of its own (a
// bomblet never clusters, a chained arc never chains, an overkill burst never bursts).
import { fireEcho } from './weapons.js';

const FX_KEYS = ['ricochet', 'chainOnHit', 'seek', 'vortex', 'cluster', 'napalm', 'leech', 'overkill'];
const fxCache = new WeakMap();

/** Kinds whose shot is not worth an echo (shields, deployables, repair beams; a storm already lasts seconds). */
export const ECHO_SKIP = new Set(['shield', 'deploy', 'repair', 'storm']);

/** Most zones of each kind alive at once (a new one past the cap replaces the oldest). */
export const ZONE_CAP = { well: 6, fire: 14, nanite: 8, storm: 3, orbital: 8 };
const BOMBLET_CAP = 60;
/** Bomblets: share of the blast's damage, blast radius (tiles), fuse (s). Overkill burst radius. Chain arcs. */
export const FX_NUM = { bomblet: 0.35, bombletR: 0.5, bombletT: 0.4, overkillR: 0.8, chainShare: 0.4, chainReach: 1.8, ricochetReach: 3, echoDelay: 0.3, napalmDps: 0.22, napalmTick: 0.4 };

/** The effect fields of a spec as one object (cached per spec), or null when it has none. */
export function fxOf(sp) {
  if (!sp) return null;
  if (fxCache.has(sp)) return fxCache.get(sp);
  let fx = null;
  for (const k of FX_KEYS) {
    const v = sp[k];
    if (v == null || v === 0 || v === false) continue;
    if (k === 'chainOnHit' && !(v.jumps > 0 && v.chance > 0)) continue;
    if (k === 'vortex' && !(v.r > 0 && v.t > 0)) continue;
    (fx ||= {})[k] = v;
  }
  fxCache.set(sp, fx);
  return fx;
}

const clampToRange = (m, aim, range) => {
  const dx = aim.x - m.x, dz = aim.z - m.z, d = Math.hypot(dx, dz);
  if (d <= range) return { x: aim.x, z: aim.z };
  return { x: m.x + dx / d * range, z: m.z + dz / d * range };
};
const inMap = (S, x, z) => x > -0.5 && z > -0.5 && x < S.world.w + 0.5 && z < S.world.h + 0.5;
const live = e => !e.dead && !e.hidden && e.state !== 'warn';

// ------------------------------------------------------------------------------------------------ new weapon kinds
/**
 * Fire one shot of a round 7 kind. Returns true when the kind is one of ours (the shot is done), false otherwise.
 * o = { dir, mx, mz, my, aim, power, echo }.
 */
export function fireKind(S, m, w, sp, base, o) {
  const { dir, mx, mz, my, aim } = o;
  switch (sp.kind) {
    case 'lance': {          // a held beam: a fast stream of instant lines that pierce a crowd (stops at buildings)
      S.hitLine(base, mx, mz, my, dir, sp.range, sp.pierce || 12, sp.width || 0.16);
      return true;
    }
    case 'prism': {          // one bright line; where it strikes it splits into a fan of three
      const hit = S.hitLine(base, mx, mz, my, dir, sp.range, 0, sp.width || 0.1);
      const first = hit?.first;
      if (first) {
        const sub = { ...base, dmg: base.dmg * (sp.splitShare || 0.45), fx: null, look: 'prism' };
        const n = sp.splits || 3, fan = sp.splitFan || 0.9;
        for (let i = 0; i < n; i++) {
          const a = dir + (n > 1 ? (i / (n - 1) - 0.5) * fan : 0), off = (first.r || 0.1) + 0.06;
          S.hitLine(sub, first.x + Math.cos(a) * off, first.z + Math.sin(a) * off, 0.3, a, sp.splitRange || 3, 1, 0.08);
        }
      }
      return true;
    }
    case 'orbital': {        // paint a spot; a beam from the sky lands there after a delay
      const p = clampToRange(m, aim, sp.range);
      addZone(S, { kind: 'orbital', x: p.x, z: p.z, r: Math.max(0.5, sp.splash || 1), t: sp.delay || 1.2, owner: m.id, team: m.team, dmg: base.dmg, dtype: base.dtype, shot: base });
      S.events.push({ type: 'orbitalMark', owner: m.id, x: p.x, z: p.z, r: Math.max(0.5, sp.splash || 1), t: sp.delay || 1.2 });
      return true;
    }
    case 'scythe': {         // a wide swing, and the swing throws a crescent wave that cuts through a line of enemies
      S.melee(base, m, dir, sp.range, sp.arc || 2.2);
      const spd = sp.speed || 9;
      S.shots.push({ ...base, kind: 'wave', wave: true, dmg: base.dmg * (sp.waveShare ?? 0.55), x: mx, z: mz, y: 0.3, vx: Math.cos(dir) * spd, vz: Math.sin(dir) * spd,
        life: (sp.waveRange || 5) / spd, age: 0, hits: [], pierce: 99, splash: 0, knock: 1.2 });
      return true;
    }
    case 'tesla': {          // a pulse of lightning from the coil to the nearest few enemies around the frame
      const near = [];
      for (const e of S.candidates(m.x, m.z, sp.range)) near.push([Math.hypot(e.x - m.x, e.z - m.z), e]);
      near.sort((a, b) => a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1));
      const pts = [];
      for (const [, e] of near.slice(0, sp.jumps || 4)) { S.hitEnemy(base, e, 1, e.x, e.z); pts.push([e.x, e.z]); }
      S.events.push({ type: 'tesla', owner: m.id, x: m.x, z: m.z, r: sp.range, pts });
      return true;
    }
    case 'orbs': {           // slow glowing orbs that drift toward enemies and zap whatever they pass
      const n = sp.count || 3, spd = sp.speed || 3;
      for (let i = 0; i < n; i++) {
        const a = dir + (n > 1 ? (i / (n - 1) - 0.5) * (sp.spread || 0.8) : 0);
        S.shots.push({ ...base, kind: 'orb', orb: true, x: mx, z: mz, y: 0.45, vx: Math.cos(a) * spd, vz: Math.sin(a) * spd, life: sp.life || 4, age: 0,
          hits: [], pierce: 99, splash: 0, zapT: 0.15 + i * 0.07, seekId: null, seekT: 0, zapR: sp.zapR || 0.5, zaps: sp.zaps || 2, turn: sp.turn || 3 });
      }
      return true;
    }
    case 'storm': {          // a storm over the aim area: lightning strikes rain on it for a few seconds
      const p = clampToRange(m, aim, sp.range), r = Math.max(0.6, sp.splash || 1.3);
      addZone(S, { kind: 'storm', x: p.x, z: p.z, r, t: sp.life || 4, owner: m.id, team: m.team, dmg: base.dmg, dtype: base.dtype, shot: base, every: sp.every || 0.22, boltR: sp.boltR || 0.4 });
      S.events.push({ type: 'stormCall', owner: m.id, x: p.x, z: p.z, r });
      return true;
    }
    case 'glaive': {         // a spinning disc: flies out, cuts everything it passes, and comes back to the hand
      const spd = sp.speed || 8;
      S.shots.push({ ...base, kind: 'glaive', glaive: true, x: mx, z: mz, y: 0.35, vx: Math.cos(dir) * spd, vz: Math.sin(dir) * spd, life: sp.life || 5, age: 0,
        hits: [], pierce: 99, splash: 0, out: true, went: 0, reach: sp.range, spd });
      return true;
    }
    default: return false;
  }
}

// ------------------------------------------------------------------------------------------------ zones
/** Add a zone (merging with a near one of the same kind and owner: it refreshes instead — rapid fire can't stack 50). */
export function addZone(S, z) {
  const Z = S.zones ||= [];
  if (z.kind !== 'orbital' && z.kind !== 'storm') {
    const near = Z.find(o => o.kind === z.kind && o.owner === z.owner && Math.hypot(o.x - z.x, o.z - z.z) < Math.max(o.r, z.r) * 0.6);
    if (near) { near.t = Math.max(near.t, z.t); near.life = Math.max(near.life, near.t); near.r = Math.max(near.r, z.r); near.dmg = Math.max(near.dmg || 0, z.dmg || 0); return near; }
  }
  const same = Z.filter(o => o.kind === z.kind);
  if (same.length >= (ZONE_CAP[z.kind] || 8)) Z.splice(Z.indexOf(same[0]), 1);
  const zone = { id: 'z' + (S.nextId++), cd: 0, life: z.t, ...z };
  Z.push(zone);
  if (z.kind === 'well') S.events.push({ type: 'well', x: z.x, z: z.z, r: z.r });
  if (z.kind === 'fire') S.events.push({ type: 'napalm', x: z.x, z: z.z, r: z.r });
  if (z.kind === 'nanite') S.events.push({ type: 'nanite', x: z.x, z: z.z, r: z.r });
  return zone;
}

/** A quiet area hit (lightning bolts, burning ground, nanites): no explosion look, no building damage. */
function areaHit(S, shot, x, z, r, fall = true) {
  let n = 0;
  if (shot.team === 'enemy') return 0;
  for (const e of S.grid.within(x, z, r)) {
    if (!live(e)) continue;
    const d = Math.hypot(e.x - x, e.z - z), k = fall ? 1 - 0.4 * Math.min(1, d / Math.max(0.01, r + e.r)) : 1;
    S.hitEnemy(shot, e, k, e.x, e.z, x, z); n++;
  }
  return n;
}

/** How hard a gravity well can drag this enemy (bosses and structures not at all, big army units a little). */
const pullOf = e => (e.boss || e.parts || e.structure || e.ace || e.dummy ? 0 : (e.r || 0.1) > 0.2 ? 0.3 : 1);

function stepZones(S, dt) {
  const Z = S.zones; if (!Z?.length) return;
  for (const z of Z) {
    z.t -= dt; z.cd -= dt;
    if (S.versus) S.useGrid?.(z.team);
    if (z.kind === 'well') {
      for (const e of S.grid.within(z.x, z.z, z.r)) {
        if (!live(e)) continue;
        const k = pullOf(e); if (!k) continue;
        const dx = z.x - e.x, dz = z.z - e.z, d = Math.hypot(dx, dz); if (d < 0.12) continue;
        const step = Math.min(d - 0.1, z.pull * k * dt * (0.5 + 0.5 * Math.min(1, d / z.r)));
        e.x += dx / d * step; e.z += dz / d * step; e.vx *= 0.7; e.vz *= 0.7;
      }
      if (z.dps > 0 && z.cd <= 0) { z.cd = 0.5; areaHit(S, { ...z.shot, dmg: z.dps * 0.5, fx: null, crit: 0, status: 0 }, z.x, z.z, z.r * 0.6, false); }
    } else if (z.kind === 'fire' || z.kind === 'nanite') {
      if (z.cd <= 0) {
        z.cd = FX_NUM.napalmTick;
        const shot = z.kind === 'fire'
          ? { ...z.shot, dtype: 'fire', dmg: z.dmg * FX_NUM.napalmDps * FX_NUM.napalmTick, status: 0.5, fx: null, crit: 0 }
          : { ...z.shot, dmg: z.dmg * FX_NUM.napalmTick, corrode: true, fx: null, crit: 0, status: 0 };
        areaHit(S, shot, z.x, z.z, z.r, false);
      }
    } else if (z.kind === 'storm') {
      if (z.cd <= 0) {
        z.cd += z.every;
        const a = S.rng.next() * Math.PI * 2, rr = Math.sqrt(S.rng.next()) * z.r * 0.85, x = z.x + Math.cos(a) * rr, zz = z.z + Math.sin(a) * rr;
        // the bolt prefers an enemy under the cloud half the time (the storm feels like it hunts)
        let tx = x, tz = zz;
        if (S.rng.next() < 0.5) { const under = S.grid.within(z.x, z.z, z.r).filter(live); if (under.length) { const e = under[S.rng.int(0, under.length - 1)]; tx = e.x; tz = e.z; } }
        areaHit(S, { ...z.shot, fx: z.shot.fx, status: Math.max(z.shot.status || 0, 0.3) }, tx, tz, z.boltR);
        S.events.push({ type: 'bolt', x: tx, z: tz, r: z.boltR });
      }
    } else if (z.kind === 'orbital' && z.t <= 0) {
      S.events.push({ type: 'orbitalBeam', x: z.x, z: z.z, r: z.r });
      S.blast(z.shot, z.x, z.z, z.r);
    }
  }
  S.zones = Z.filter(z => z.t > 0);
}

// ------------------------------------------------------------------------------------------------ hits and blasts
/** A player hit on an enemy landed (dealt = damage taken, killed = this hit killed it). */
export function afterHit(S, shot, e, dealt, killed, scale = 1) {
  const fx = shot.fx; if (!fx) return;
  if (fx.leech > 0 && dealt > 0) {
    const m = S.byId.get(shot.owner);
    if (m && !m.down && m.hp < m.hpMax) { m.hp = Math.min(m.hpMax, m.hp + dealt * fx.leech); if ((m.leechT ?? -9) < S.time - 0.4) { m.leechT = S.time; S.events.push({ type: 'leech', id: m.id, x: m.x, z: m.z }); } }
  }
  if (fx.chainOnHit && !shot.arced && S.rng.next() < fx.chainOnHit.chance) {
    const arc = { owner: shot.owner, team: shot.team, dtype: 'electric', dmg: shot.dmg * scale * FX_NUM.chainShare, crit: shot.crit || 0, status: 0.1, arced: true, fx: fx.leech ? { leech: fx.leech } : null, weapon: shot.weapon };
    const pts = [[e.x, e.z]], hit = new Set([e.id]);
    let from = e;
    for (let j = 0; j < fx.chainOnHit.jumps; j++) {
      let best = null, bd = Infinity;
      for (const o of S.candidates(from.x, from.z, FX_NUM.chainReach)) { if (hit.has(o.id)) continue; const d = Math.hypot(o.x - from.x, o.z - from.z); if (d < bd) { bd = d; best = o; } }
      if (!best) break;
      hit.add(best.id); pts.push([best.x, best.z]); S.hitEnemy(arc, best, Math.pow(0.85, j), best.x, best.z); from = best;
    }
    if (pts.length > 1) S.events.push({ type: 'chain', owner: shot.owner, pts, spark: true });
  }
  if (fx.vortex && !shot.splash) addZone(S, { kind: 'well', x: e.x, z: e.z, r: fx.vortex.r, t: fx.vortex.t, pull: fx.vortex.pull ?? 1.5, dps: fx.vortex.dps || 0, owner: shot.owner, team: shot.team, shot: { ...shot, fx: null } });
  if (fx.overkill > 0 && killed && !shot.burst) {
    const b = { owner: shot.owner, team: shot.team, dtype: shot.dtype, dmg: shot.dmg * scale * fx.overkill, crit: 0, status: shot.status || 0, burst: true, fx: null, weapon: shot.weapon };
    S.events.push({ type: 'overkill', x: e.x, z: e.z, dtype: shot.dtype });
    S.blast(b, e.x, e.z, FX_NUM.overkillR);
  }
}

/** A player blast went off at (x, z), radius r. */
export function afterBlast(S, shot, x, z, r) {
  const fx = shot.fx; if (!fx || shot.team === 'enemy') return;
  if (fx.cluster > 0 && !shot.bomblet) {
    const B = S.bomblets ||= [];
    const n = Math.min(fx.cluster, 12), child = { ...shot, dmg: shot.dmg * FX_NUM.bomblet, bomblet: true, fx: null, splash: FX_NUM.bombletR };
    const pts = [];
    for (let i = 0; i < n && B.length < BOMBLET_CAP; i++) {
      const a = (i / n) * Math.PI * 2 + S.rng.range(-0.4, 0.4), d = Math.max(0.6, r) * S.rng.range(0.7, 1.4);
      const b = { id: 'b' + (S.nextId++), x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, x0: x, z0: z, t: FX_NUM.bombletT + S.rng.range(0, 0.15), shot: child };
      B.push(b); pts.push([b.x, b.z]);
    }
    S.events.push({ type: 'bomblets', x, z, pts });
  }
  if (fx.napalm > 0) addZone(S, { kind: 'fire', x, z, r: Math.max(0.5, r * 0.9), t: fx.napalm, owner: shot.owner, team: shot.team, dmg: shot.dmg, shot: { ...shot, fx: null } });
  if (fx.vortex) addZone(S, { kind: 'well', x, z, r: fx.vortex.r, t: fx.vortex.t, pull: fx.vortex.pull ?? 1.5, dps: fx.vortex.dps || 0, owner: shot.owner, team: shot.team, shot: { ...shot, fx: null } });
}

/** A lobbed shot landed: one that leaves a zone (a nanite canister) does so here. Returns true when handled. */
export function landFx(S, s, x, z) {
  if (s.zone === 'nanite') {
    addZone(S, { kind: 'nanite', x, z, r: s.zoneR || 0.9, t: s.zoneT || 5, owner: s.owner, team: s.team, dmg: s.dmg, shot: { ...s, fx: null } });
    return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ shots that are not bullets
/** Seeker orbs and the returning disc. Returns 'keep' | 'drop', or null for any other shot. */
export function specialShot(S, s, dt) {
  if (s.orb) return stepOrb(S, s, dt);
  if (s.glaive) return stepGlaive(S, s, dt);
  return null;
}

function stepOrb(S, s, dt) {
  s.age += dt;
  if (s.age >= s.life || !inMap(S, s.x, s.z)) { S.events.push({ type: 'spark', x: s.x, z: s.z, y: s.y, dtype: s.dtype }); return 'drop'; }
  s.seekT -= dt;
  if (s.seekT <= 0) {           // pick the nearest enemy within 3 tiles, a few times a second
    s.seekT = 0.2; let best = null, bd = 9;
    for (const e of S.candidates(s.x, s.z, 3)) { const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2; if (d < bd) { bd = d; best = e; } }
    s.seekId = best?.id || null;
  }
  const t = s.seekId && S.byId.get(s.seekId), sp = Math.hypot(s.vx, s.vz) || 1;
  if (t && !t.dead) {
    const want = Math.atan2(t.z - s.z, t.x - s.x), cur = Math.atan2(s.vz, s.vx);
    let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    const a = cur + Math.max(-s.turn * dt, Math.min(s.turn * dt, d));
    const slow = Math.hypot(t.x - s.x, t.z - s.z) < 0.4 ? 0.35 : 1;          // hang over a target while zapping it
    s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.x += s.vx * dt * slow; s.z += s.vz * dt * slow;
  } else { s.x += s.vx * dt; s.z += s.vz * dt; }
  s.y = 0.45 + Math.sin(s.age * 6) * 0.04;
  s.zapT -= dt;
  if (s.zapT <= 0) {
    const near = S.grid.within(s.x, s.z, s.zapR).filter(live).sort((a, b) => (a.x - s.x) ** 2 + (a.z - s.z) ** 2 - ((b.x - s.x) ** 2 + (b.z - s.z) ** 2)).slice(0, s.zaps);
    if (near.length) {
      s.zapT = 0.3;
      for (const e of near) S.hitEnemy(s, e, 1, e.x, e.z);
      S.events.push({ type: 'zap', x: s.x, z: s.z, y: s.y, pts: near.map(e => [e.x, e.z]), dtype: s.dtype });
    } else s.zapT = 0.05;
  }
  return 'keep';
}

function stepGlaive(S, s, dt) {
  s.age += dt;
  const owner = S.byId.get(s.owner);
  if (s.age >= s.life || !owner || owner.down) { S.events.push({ type: 'spark', x: s.x, z: s.z, y: s.y, dtype: s.dtype }); return 'drop'; }
  if (!s.out) {                 // homing back to the hand
    const dx = owner.x - s.x, dz = owner.z - s.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { S.events.push({ type: 'catch', id: owner.id, x: owner.x, z: owner.z }); return 'drop'; }
    const sp = s.spd * 1.15; s.vx = dx / d * sp; s.vz = dz / d * sp;
  }
  const ox = s.x, oz = s.z;
  s.x += s.vx * dt; s.z += s.vz * dt;
  if (s.out) {
    s.went += Math.hypot(s.x - ox, s.z - oz);
    const l = S.lotAt(s.x, s.z);
    if (s.went >= s.reach || (l && l.solid && l.stage < 3 && l.h > s.y) || !inMap(S, s.x, s.z)) {
      if (l && l.solid && l.stage < 3) S.damageLot(l, s.dmg);
      s.out = false; s.hits = []; s.x = ox; s.z = oz;       // turns back; the way home cuts again
      S.events.push({ type: 'spark', x: s.x, z: s.z, y: s.y, dtype: s.dtype });
    }
  }
  sweep(S, s, ox, oz, 0.12, e => { S.hitEnemy(s, e, 1, s.x, s.z); s.hits.push(e.id); });
  return 'keep';
}

/** Everything a shot's path this step touched (start → end), each once (s.hits), nearest first. */
function sweep(S, s, ox, oz, pad, fn) {
  const sx0 = s.x - ox, sz0 = s.z - oz, sl2 = sx0 * sx0 + sz0 * sz0 || 1e-9, hits = [];
  S.grid.near((s.x + ox) / 2, (s.z + oz) / 2, 0.6 + Math.sqrt(sl2) / 2, e => {
    if (!live(e) || s.hits.includes(e.id)) return;
    const k = Math.max(0, Math.min(1, ((e.x - ox) * sx0 + (e.z - oz) * sz0) / sl2)), rr = e.r + pad;
    if ((e.x - (ox + sx0 * k)) ** 2 + (e.z - (oz + sz0 * k)) ** 2 <= rr * rr) hits.push([k, e]);
  });
  hits.sort((a, b) => a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1));
  for (const [, e] of hits) fn(e);
}

/** `seek`: a plain bullet curves toward the nearest enemy in front of it (re-picked a few times a second). */
export function seekStep(S, s, dt) {
  const rate = s.fx.seek;
  s.seekT = (s.seekT ?? 0) - dt;
  const cur = Math.atan2(s.vz, s.vx);
  if (s.seekT <= 0) {
    s.seekT = 0.15; let best = null, bs = Infinity;
    for (const e of S.candidates(s.x, s.z, 6)) {
      const a = Math.atan2(e.z - s.z, e.x - s.x); let d = Math.abs(a - cur); if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > 0.75 || s.hits.includes(e.id)) continue;
      const sc = Math.hypot(e.x - s.x, e.z - s.z) + d * 2; if (sc < bs) { bs = sc; best = e; }
    }
    s.seekId = best?.id || null;
  }
  const t = s.seekId && S.byId.get(s.seekId); if (!t || t.dead) return;
  let d = Math.atan2(t.z - s.z, t.x - s.x) - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const a = cur + Math.max(-rate * dt, Math.min(rate * dt, d)), sp = Math.hypot(s.vx, s.vz);
  s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp;
}

/** `ricochet`: after hitting e, the bullet bounces to the nearest other enemy within 3 tiles. True = it bounced. */
export function ricochet(S, s, e) {
  if ((s.ricLeft ??= s.fx?.ricochet || 0) <= 0) return false;
  let best = null, bd = FX_NUM.ricochetReach ** 2;
  for (const o of S.candidates(e.x, e.z, FX_NUM.ricochetReach)) {
    if (o === e || s.hits.includes(o.id)) continue;
    const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2; if (d < bd) { bd = d; best = o; }
  }
  if (!best) return false;
  const sp = Math.hypot(s.vx, s.vz) || 10, d = Math.sqrt(bd) || 1e-6;
  s.x = e.x; s.z = e.z; s.vx = (best.x - e.x) / d * sp; s.vz = (best.z - e.z) / d * sp;
  s.age = 0; s.life = (FX_NUM.ricochetReach + 0.5) / sp; s.ricLeft--; s.seekId = best.id;
  S.events.push({ type: 'ricochet', x: e.x, z: e.z, x2: best.x, z2: best.z, dtype: s.dtype });
  return true;
}

// ------------------------------------------------------------------------------------------------ the step
/** Once a step, after the shots: echoes that are due, zones, bomblets. */
export function stepWeaponFx(S, dt) {
  if (S.echoes?.length) {
    const later = [];
    for (const q of S.echoes) {
      q.t -= dt; if (q.t > 0) { later.push(q); continue; }
      const m = S.byId.get(q.m); if (!m || m.down || m.dead) continue;
      const w = m.weapons.find(x => x.slot === q.slot); if (!w) continue;
      if (S.versus) S.useGrid?.(m.team);
      fireEcho(S, m, w, S.T, { x: q.x, z: q.z }, q.power, { locks: q.locks.filter(id => S.byId.get(id) && !S.byId.get(id).dead) });
    }
    S.echoes = later;
  }
  stepZones(S, dt);
  if (S.bomblets?.length) {
    const keep = [];
    for (const b of S.bomblets) { b.t -= dt; if (b.t > 0) keep.push(b); else { if (S.versus) S.useGrid?.(b.shot.team); S.blast(b.shot, b.x, b.z, FX_NUM.bombletR); } }
    S.bomblets = keep;
  }
}

/** For co-op mirrors and tests: the world things this module adds to a mission. */
export const FX_LISTS = ['zones', 'bomblets', 'echoes'];
