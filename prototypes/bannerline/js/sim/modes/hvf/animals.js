// Farm animals (docs/hvf-PLAN.md §5): they wander, crowd, stray and flee — and that is how hunters
// find a base. Never leashed. Data: data/hvf/animals.json.
//
// Each tick an animal: goes wild if its farmer is a ghost; flees a hunter in fleeRange; every 3-6 s
// (rng stream `animals`) picks a new spot within its wander radius of home (x crowdMult while its
// building holds more animals than its comfort, x wildMult when wild); walks there with grid
// collision (fences and walls stop it, briar does not). Outside wander x strayMult it is a STRAY.

import { liveGrid, canStep, cellOf } from './grid.js';
import { liveEnt, secToTicks, HUNTERS } from './state.js';
import { range, next } from '../../rng.js';
import { sin, cos, TAU } from '../../mathx.js';

export function animalTick(ctx) {
  const { state, data, map } = ctx;
  const A = data.hvf.animals, R = A.rules;
  const g = liveGrid(ctx);
  const perHome = {};
  for (const e of state.ents) if (e.kind === 'animal' && e.alive && !e._gone) perHome[e.home] = (perHome[e.home] || 0) + 1;
  const hunters = [];
  for (const e of state.ents) if (e.team === HUNTERS && (e.kind === 'hunter' || e.kind === 'army') && e.alive && !e._gone && state.tick >= state.hvf.releaseTick) hunters.push(e);
  const rng = state.rng.animals;
  const dogDef = data.hvf.buildings.kinds.sheepdog, dogR2 = dogDef.herd.radius * dogDef.herd.radius;
  const dogs = state.ents.filter(b => b.kind === 'building' && b.type === 'sheepdog' && b.alive && !b._gone);
  for (const a of state.ents) {
    if (a.kind !== 'animal' || !a.alive || a._gone) continue;
    const K = A.kinds[a.type];
    const owner = state.players[a.owner];
    a.wild = !!owner.ghost;
    const home = liveEnt(state, a.home);
    if (home) { a.hx = home.x; a.hz = home.z; }
    let radius = K.wander;
    if (home && (perHome[home.id] || 0) > home.comfort) radius *= R.crowdMult;
    if (a.wild) radius *= R.wildMult;
    // a Sheepdog nearby keeps the flock close
    for (const d of dogs) if ((d.x - a.x) * (d.x - a.x) + (d.z - a.z) * (d.z - a.z) <= dogR2) { radius *= dogDef.herd.wanderMult; break; }
    // flee
    let threat = null, td = R.fleeRange * R.fleeRange;
    for (const h of hunters) { const d = (h.x - a.x) * (h.x - a.x) + (h.z - a.z) * (h.z - a.z); if (d < td) { td = d; threat = h; } }
    if (threat) {
      const dx = a.x - threat.x, dz = a.z - threat.z, L = Math.sqrt(dx * dx + dz * dz) || 1;
      if (a.fleeUntil < state.tick) ctx.emit('flee', { id: a.id, x: a.x, z: a.z });
      a.fleeUntil = state.tick + secToTicks(R.fleeSeconds);
      a.tx = a.x + dx / L * 8; a.tz = a.z + dz / L * 8;
    } else if (state.tick >= a.nextAt && state.tick >= a.fleeUntil) {
      const ang = next(rng) * TAU, d = Math.sqrt(next(rng)) * radius;
      a.tx = a.hx + sin(ang) * d; a.tz = a.hz + cos(ang) * d;
      a.nextAt = state.tick + secToTicks(range(rng, R.wanderEvery[0], R.wanderEvery[1]));
    }
    // walk
    const fleeing = state.tick < a.fleeUntil;
    const sp = K.speed * (fleeing ? R.fleeSpeed : 1) / 20;
    const dx = a.tx - a.x, dz = a.tz - a.z, L = Math.sqrt(dx * dx + dz * dz);
    if (L > 0.05) {
      const s = L < sp ? L : sp;
      const nx = a.x + dx / L * s, nz = a.z + dz / L * s;
      const here = cellOf(map, a.x, a.z);
      if (canStep(ctx, g, 'animal', here, cellOf(map, nx, nz))) { a.x = nx; a.z = nz; }
      else if (canStep(ctx, g, 'animal', here, cellOf(map, nx, a.z))) a.x = nx;
      else if (canStep(ctx, g, 'animal', here, cellOf(map, a.x, nz))) a.z = nz;
      else { a.tx = a.x; a.tz = a.z; }   // stuck: think again next time
      if (nx !== a.x || nz !== a.z || s > 0) a.face = faceTo(dx, dz, a.face);
    }
    const hd = Math.sqrt((a.x - a.hx) * (a.x - a.hx) + (a.z - a.hz) * (a.z - a.hz));
    a.stray = hd > K.wander * (home && (perHome[home.id] || 0) > home.comfort ? R.crowdMult : 1) * R.strayMult;
  }
}

// facing without trig in the hot loop: keep the old face unless the move is clear
import { faceOf } from '../../mathx.js';
function faceTo(dx, dz, old) { return dx * dx + dz * dz > 1e-6 ? faceOf(dx, dz) : old; }

/** The Bell (H3 ability, used by tests now): every own animal within r m goes home at a trot. */
export function ringBell(ctx, p, x, z, r) {
  let n = 0;
  for (const a of ctx.state.ents) {
    if (a.kind !== 'animal' || a.owner !== p.id || !a.alive || a._gone) continue;
    if ((a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) > r * r) continue;
    a.tx = a.hx; a.tz = a.hz; a.fleeUntil = ctx.state.tick + 40; a.nextAt = ctx.state.tick + 120; n++;
  }
  return n;
}

/**
 * Noise and tracks (docs/hvf-PLAN.md §4): an animal calls every `noiseEvery` s on its own beat
 * ((tick + id * 7) % period === 0); a hunter inside its noise radius hears it through the fog (event
 * `noise`, the AI uses the same rule). Strays and fleeing animals leave a track every 2 s, kept 20 s.
 */
export function noiseTick(ctx) {
  const { state, data } = ctx;
  const A = data.hvf.animals.kinds, T = data.hvf.hunter.tracking;
  const hunters = state.ents.filter(h => h.kind === 'hunter' && h.alive && !h._gone);
  const every = Math.round(T.every * 20), keep = Math.round(T.keep * 20);
  for (const a of state.ents) {
    if (a.kind !== 'animal' || !a.alive || a._gone) continue;
    const K = A[a.type], period = Math.round(K.noiseEvery * 20);
    if ((state.tick + a.id * 7) % period === 0) {
      const heard = [];
      for (const h of hunters) if ((h.x - a.x) * (h.x - a.x) + (h.z - a.z) * (h.z - a.z) <= K.noise * K.noise) heard.push(h.owner);
      ctx.emit('noise', { x: Math.round(a.x), z: Math.round(a.z), kind: a.type, src: a.id, heard });
    }
    if ((a.stray || state.tick < a.fleeUntil) && (state.tick + a.id * 3) % every === 0) {
      const dx = a.x - a.px, dz = a.z - a.pz;
      state.hvf.tracks.push({ x: Math.round(a.x * 10) / 10, z: Math.round(a.z * 10) / 10, dir: dx * dx + dz * dz > 1e-8 ? Math.round(faceOf(dx, dz) * 100) / 100 : 0, tick: state.tick, owner: a.owner });
    }
  }
  if (state.hvf.tracks.length && state.hvf.tracks[0].tick < state.tick - keep) state.hvf.tracks = state.hvf.tracks.filter(t => t.tick >= state.tick - keep);
  if (state.hvf.tracks.length > 600) state.hvf.tracks = state.hvf.tracks.slice(-600);
}
