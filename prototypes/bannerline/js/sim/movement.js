// Thinking + moving: hero orders, unit targeting, flow-field walking, separation, field bounds and
// leaks. Runs once per tick after commands; basic attacks then run in combat.js on the targets
// chosen here (`_wantAttack`).

import { dist2, faceOf, sin, cos, clamp, TAU } from './mathx.js';
import { liveEnt } from './state.js';
import { flowDir } from './flow.js';
import { moveFactor, isStunned, isRooted, findStatus } from './statuses.js';
import { inReach } from './combat.js';
import { tryPounce, hasTrait } from './traits.js';
import { leakMult } from './tides.js';

export const UNIT_AGGRO = 7;
export const UNIT_LEASH = 12;
const ARRIVE = 0.25;
const CAST_HOLD = 8;   // ticks the 'cast' animation hint is held

function setAct(e, a, tick) {
  if (e.act === 'cast' && tick - e.actTick < CAST_HOLD && a !== 'dead' && a !== 'stun') return;
  if (e.act !== a) { e.act = a; e.actTick = tick; }
}

function enemyOfHero(hero, e) {
  return e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero';
}

function nearestEnemy(state, hero, radius) {
  let best = null, bd = radius * radius;
  for (const e of state.ents) {
    if (!enemyOfHero(hero, e)) continue;
    const d = dist2(hero.x, hero.z, e.x, e.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function heroThink(ctx, hero, def) {
  const { state } = ctx;
  hero._wantAttack = false; hero._vx = 0; hero._vz = 0; hero._sp = 1;
  if (!hero.alive) return;
  if (isStunned(hero)) { setAct(hero, 'stun', state.tick); return; }
  const o = hero._ord;
  const chase = t => {
    hero.target = t.id;
    if (inReach(hero, t, hero._range)) { hero._wantAttack = true; hero.face = faceOf(t.x - hero.x, t.z - hero.z); }
    else { hero._vx = t.x - hero.x; hero._vz = t.z - hero.z; }
  };
  const walkTo = (x, z) => {
    const d2 = dist2(hero.x, hero.z, x, z);
    if (d2 <= ARRIVE * ARRIVE) return true;
    hero._vx = x - hero.x; hero._vz = z - hero.z;
    return false;
  };
  switch (o.k) {
    case 'move':
      hero.target = -1;
      if (walkTo(o.x, o.z)) o.k = 'idle';
      break;
    case 'dir': {
      hero.target = -1;
      const a = o.dir * TAU / 16;
      hero._vx = sin(a); hero._vz = cos(a); hero._sp = o.speed / 3;
      break;
    }
    case 'attack': {
      const t = liveEnt(state, o.target);
      if (!t || !enemyOfHero(hero, t)) { o.k = 'idle'; hero.target = -1; break; }
      chase(t);
      break;
    }
    case 'amove': {
      let t = liveEnt(state, hero.target);
      if (!t || !enemyOfHero(hero, t) || dist2(hero.x, hero.z, t.x, t.z) > (def.aggro + 3) * (def.aggro + 3)) t = nearestEnemy(state, hero, def.aggro);
      if (t) chase(t);
      else { hero.target = -1; if (walkTo(o.x, o.z)) o.k = 'idle'; }
      break;
    }
    case 'stop': {
      let t = liveEnt(state, hero.target);
      if (!t || !enemyOfHero(hero, t) || !inReach(hero, t, hero._range)) t = nearestEnemy(state, hero, hero._range + hero.r + 1.2);
      if (t && inReach(hero, t, hero._range)) { hero.target = t.id; hero._wantAttack = true; hero.face = faceOf(t.x - hero.x, t.z - hero.z); }
      else hero.target = -1;
      break;
    }
    default: {   // idle: defend the spot, chase what comes close
      let t = liveEnt(state, hero.target);
      if (!t || !enemyOfHero(hero, t) || dist2(hero.x, hero.z, t.x, t.z) > (def.aggro + 3) * (def.aggro + 3)) t = nearestEnemy(state, hero, def.aggro);
      if (t) chase(t); else hero.target = -1;
    }
  }
}

function defendersIn(state, field, team) {
  const out = [];
  for (const e of state.ents) if (e.kind === 'hero' && e.alive && e.field === field && e.team !== team) out.push(e);
  return out;
}

function engagedOn(state, heroId) {
  let n = 0;
  for (const o of state.ents) if (o.target === heroId && o.alive && !o._gone && o.kind !== 'hero') n++;
  return n;
}

function unitThink(ctx, e) {
  const { state, map } = ctx;
  e._wantAttack = false; e._vx = 0; e._vz = 0; e._sp = 1;
  if (isStunned(e)) { setAct(e, 'stun', state.tick); return; }
  let t = null;
  const taunt = findStatus(e, 'taunt');
  if (taunt) t = liveEnt(state, taunt.src);
  if (!t) {
    const cur = liveEnt(state, e.target);
    const aggro = e._range > 3 ? Math.max(UNIT_AGGRO, e._range + 2) : UNIT_AGGRO;
    const leash = aggro + UNIT_LEASH - UNIT_AGGRO;
    if (cur && cur.field === e.field && dist2(e.x, e.z, cur.x, cur.z) <= leash * leash) t = cur;
    else {
      // a hero can only be fought by `econ.field.engagedBodies` units at once (econ model): the rest
      // walk on past it, so one hero cannot hold a whole road. Taunts ignore the cap.
      const cap = ctx.data.econ.field.engagedBodies;
      let bd = aggro * aggro;
      for (const h of defendersIn(state, e.field, e.team)) {
        const d = dist2(e.x, e.z, h.x, h.z);
        if (d < bd && engagedOn(state, h.id) < cap) { bd = d; t = h; }
      }
      if (t) tryPounce(ctx, e, t);
    }
  }
  e.target = t ? t.id : -1;
  if (t) {
    if (inReach(e, t, e._range)) { e._wantAttack = true; e.face = faceOf(t.x - e.x, t.z - e.z); return; }
    e._vx = t.x - e.x; e._vz = t.z - e.z;
    return;
  }
  const d = flowDir(map.fields[e.field].flow, e.x, e.z);
  e._vx = d.x; e._vz = d.z;
}

function inFord(f, e) { return e.z >= f.ford.z0 && e.z <= f.ford.z1; }

/** Think + move every entity, then separate and clamp. */
export function moveTick(ctx) {
  const { state, data, map } = ctx;
  for (const e of state.ents) {
    if (e._gone) continue;
    if (e.kind === 'hero') heroThink(ctx, e, data.heroes.heroes[e.type]);
    else if (e.alive) unitThink(ctx, e);
  }
  for (const e of state.ents) {
    if (e._gone || !e.alive) continue;
    const len = Math.sqrt(e._vx * e._vx + e._vz * e._vz);
    if (len < 1e-6 || isRooted(e)) {
      if (!e._wantAttack && !isStunned(e)) setAct(e, 'idle', state.tick);
      else if (e._wantAttack && e.act !== 'attack') setAct(e, 'attack', state.tick);
      continue;
    }
    const f = map.fields[e.field];
    let sp = e._spd * e._sp * moveFactor(e);
    if (inFord(f, e) && !hasTrait(e, 'flying')) sp *= 1 - f.ford.slow;
    let step = sp / 20;
    if (e.kind === 'hero' && (e._ord.k === 'move' || e._ord.k === 'amove') && e.target < 0) step = Math.min(step, len);
    e.x += e._vx / len * step;
    e.z += e._vz / len * step;
    e.face = faceOf(e._vx, e._vz);
    setAct(e, 'walk', state.tick);
  }
  separate(ctx);
  for (const e of state.ents) {
    if (e._gone || !e.alive) continue;
    const f = map.fields[e.field];
    e.x = clamp(e.x, f.x0 + e.r, f.x1 - e.r);
    e.z = e.kind === 'hero' ? clamp(e.z, f.z0 + 0.5, f.leakZ - 0.5) : clamp(e.z, f.z0, f.z1);
  }
  leaks(ctx);
}

// pairwise push-apart inside each field (hero moves less than units; flying units ignore ground bodies)
function separate(ctx) {
  const a = ctx.state.ents;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const p = a[i];
    if (p._gone || !p.alive) continue;
    const pf = hasTrait(p, 'flying');
    for (let j = i + 1; j < n; j++) {
      const q = a[j];
      if (q._gone || !q.alive || q.field !== p.field || hasTrait(q, 'flying') !== pf) continue;
      const min = p.r + q.r;
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2), nx, nz;
      if (d < 1e-6) { nx = ((p.id + q.id) & 1) ? 1 : -1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
      const push = (min - d) * 0.5;
      let wp = 0.5, wq = 0.5;
      if (p.kind === 'hero' && q.kind !== 'hero') { wp = 0.15; wq = 0.85; }
      else if (q.kind === 'hero' && p.kind !== 'hero') { wp = 0.85; wq = 0.15; }
      p.x -= nx * push * wp * 2; p.z -= nz * push * wp * 2;
      q.x += nx * push * wq * 2; q.z += nz * push * wq * 2;
    }
  }
}

function leaks(ctx) {
  const { state, data, map } = ctx;
  for (const e of state.ents) {
    if (e._gone || !e.alive || e.kind === 'hero') continue;
    const f = map.fields[e.field];
    if (e.z < f.leakZ) continue;
    const team = state.teams[f.team];
    const amount = e._leak * leakMult(state, data);
    if (!state.endless) team.banners -= amount;
    if (e.team >= 0) state.teams[e.team].dealt += amount;
    if (e.owner >= 0) {
      const p = state.players[e.owner];
      p.stats.dealt += amount;
      if (e._refund > 0) { p.gold += e._refund; ctx.emit('refund', { player: p.id, amount: Math.round(e._refund * 10) / 10 }); }
    }
    for (const pid of team.players) state.players[pid].stats.leaked += amount;
    e._gone = true; e.alive = false;
    ctx.emit('leak', { team: f.team, banners: Math.round(amount * 1000) / 1000, src: e.id, unit: e.type });
    ctx.emit('remove', { id: e.id, why: 'leaked' });
  }
}
