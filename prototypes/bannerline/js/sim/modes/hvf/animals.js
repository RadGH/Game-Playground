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
