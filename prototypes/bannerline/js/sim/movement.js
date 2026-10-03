// Thinking + moving: hero orders, unit targeting, flow-field walking, separation, field bounds and
// leaks. Runs once per tick after commands; basic attacks then run in combat.js on the targets
// chosen here (`_wantAttack`).

import { dist2, faceOf, sin, cos, clamp, TAU } from './mathx.js';
import { liveEnt, isDefender } from './state.js';
import { flowDir } from './flow.js';
import { moveFactor, isStunned, isRooted, findStatus } from './statuses.js';
import { inReach } from './combat.js';
import { tryPounce, hasTrait, isHidden } from './traits.js';
import { leakMult } from './tides.js';
import { petThink } from './pets.js';
import { turretThink } from './turrets.js';
import { heroStats } from './heroes.js';
import { KNOCK_FRICTION } from './skills.js';
const KNOCK_STOP = 0.01;   // m/tick below which a push is over

export const UNIT_AGGRO = 7;
export const UNIT_LEASH = 12;
const ARRIVE = 0.25;
const CAST_HOLD = 8;   // ticks the 'cast' animation hint is held

function setAct(e, a, tick) {
  if (e.act === 'cast' && tick - e.actTick < CAST_HOLD && a !== 'dead' && a !== 'stun') return;
  if (e.act !== a) { e.act = a; e.actTick = tick; }
}

function enemyOfHero(hero, e) {
  return e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero' && !isHidden(e, hero.x, hero.z);
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
  for (const e of state.ents) if (isDefender(e) && e.alive && !e._gone && e.field === field && e.team !== team) out.push(e);
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
    // a hero can only be fought by `econ.field.engagedBodies` units at once (econ model): the rest
    // walk on past it, so one hero cannot hold a whole road. Taunts ignore the cap while they last;
    // when one ends, units over the cap let go (counting this unit, which still targets the hero).
    const cap = ctx.data.econ.field.engagedBodies;
    if (cur && cur.field === e.field && dist2(e.x, e.z, cur.x, cur.z) <= leash * leash && (!isDefender(cur) || engagedOn(state, cur.id) <= cap)) t = cur;
    else {
      let bd = aggro * aggro;
      for (const h of defendersIn(state, e.field, e.team)) {
        const d = dist2(e.x, e.z, h.x, h.z);
        if (d < bd && engagedOn(state, h.id) < cap) { bd = d; t = h; }
      }
      if (!t && e._aggroBy >= 0) {
        const h = liveEnt(state, e._aggroBy);
        if (h && h.field === e.field && engagedOn(state, h.id) < cap) t = h;
      }
      if (t) tryPounce(ctx, e, t);
    }
  }
  e._aggroBy = -1;
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

/** One tick of a push: slide, stop at walls and field edges, bleed speed. */
function knockStep(f, e) {
  const nx = e.x + e._kvx, nz = e.z + e._kvz;
  if (nx - e.r < f.x0 || nx + e.r > f.x1) e._kvx = 0; else if (wallAt(f, e, nx, e.z)) e._kvx = 0; else e.x = nx;
  if (nz < f.z0 + 0.5 || nz > f.z1 - 0.5) e._kvz = 0; else if (wallAt(f, e, e.x, nz)) e._kvz = 0; else e.z = nz;
  e._kvx *= KNOCK_FRICTION; e._kvz *= KNOCK_FRICTION;
  if (e._kvx * e._kvx + e._kvz * e._kvz < KNOCK_STOP * KNOCK_STOP) { e._kvx = 0; e._kvz = 0; }
}

/** Is (x, z) inside a wall for this body? Heroes and pets pass lane walls at the gaps; flyers ignore lane walls. */
function wallAt(f, e, x, z) {
  for (const w of f.walls) if (x + e.r > w.x0 && x - e.r < w.x1 && z > w.z0 && z < w.z1) return w;
  if (hasTrait(e, 'flying')) return null;
  const crosser = e.kind === 'hero' || e.kind === 'pet';
  for (const w of f.laneWalls) {
    if (!(x + e.r > w.x0 && x - e.r < w.x1 && z > w.z0 && z < w.z1)) continue;
    if (crosser && w.gaps.some(g => z >= g.z0 && z <= g.z1)) continue;
    return w;
  }
  return null;
}

/** Push a body back out of a wall to the side it came from (its previous position). */
function keepOutOfWalls(f, e) {
  const w = wallAt(f, e, e.x, e.z);
  if (!w) return;
  if (!wallAt(f, e, e.x, e.pz)) { e.z = e.pz; return; }
  const mid = (w.x0 + w.x1) / 2;
  e.x = e.px <= mid ? w.x0 - e.r - 0.01 : w.x1 + e.r + 0.01;
}

/** Think + move every entity, then separate and clamp. */
export function moveTick(ctx) {
  const { state, data, map } = ctx;
  for (const e of state.ents) {
    if (e._gone) continue;
    if (e.kind === 'hero') heroThink(ctx, e, data.heroes.heroes[e.type]);
    else if (e.kind === 'turret') { if (e.alive) { const t = turretThink(ctx, e); if (t) e.face = faceOf(t.x - e.x, t.z - e.z); } }
    else if (e.kind === 'pet') { if (e.alive) { const t = petThink(ctx, e, inReach); if (t && e._wantAttack) e.face = faceOf(t.x - e.x, t.z - e.z); } }
    else if (e.alive) unitThink(ctx, e);
  }
  for (const e of state.ents) {
    if (e._gone || !e.alive) continue;
    // a body being pushed slides and does not walk (R2.5)
    if (e._kvx !== 0 || e._kvz !== 0) { knockStep(map.fields[e.field], e); setAct(e, 'stun', state.tick); continue; }
    const len = Math.sqrt(e._vx * e._vx + e._vz * e._vz);
    if (len < 1e-6 || isRooted(e)) {
      if (!e._wantAttack && !isStunned(e)) setAct(e, 'idle', state.tick);
      else if (e._wantAttack && e.act !== 'attack') setAct(e, 'attack', state.tick);
      continue;
    }
    const f = map.fields[e.field];
    let sp = e._spd * e._sp * moveFactor(e, data);
    if (e.kind === 'hero') sp *= 1 + heroStats(data, state.players[e.owner]).movePct;   // a form's speed (Druid Wolf)
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
    if (f.walls.length || f.laneWalls.length) keepOutOfWalls(f, e);
    e.x = clamp(e.x, f.x0 + e.r, f.x1 - e.r);
    e.z = isDefender(e) ? clamp(e.z, f.z0 + 0.5, f.leakZ - 0.5) : clamp(e.z, f.z0, f.z1);
  }
  leaks(ctx);
}

const SHOVE_SHARE = 0.5;   // share of the push along the contact that a struck body takes
function shareMomentum(a, b, nx, nz, take) {
  if (a._kvx === 0 && a._kvz === 0) return;
  const along = a._kvx * nx + a._kvz * nz;   // toward b
  if (along <= 0 || (b._traits && b._traits.indexOf('unstoppable') >= 0)) return;
  const give = along * SHOVE_SHARE * (take * 2 > 1 ? 1 : take * 2);
  b._kvx += nx * give; b._kvz += nz * give;
  a._kvx -= nx * give; a._kvz -= nz * give;
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
      if (p.kind === 'turret') { wp = 0; wq = 1; } else if (q.kind === 'turret') { wp = 1; wq = 0; }   // turrets never move
      // a pushed body shoves what it runs into: the part of its push along the contact passes on
      shareMomentum(p, q, nx, nz, wq);
      shareMomentum(q, p, -nx, -nz, wp);
      p.x -= nx * push * wp * 2; p.z -= nz * push * wp * 2;
      q.x += nx * push * wq * 2; q.z += nz * push * wq * 2;
    }
  }
}

function leaks(ctx) {
  const { state, data, map } = ctx;
  for (const e of state.ents) {
    if (e._gone || !e.alive || isDefender(e)) continue;
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
