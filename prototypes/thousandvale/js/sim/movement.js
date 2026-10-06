// The movement step (stream A). Pure, shared: the server runs it on every `in` message, and the client
// runs the SAME function to predict its own character (docs/protocol.md §9). Same inputs give the same
// floats on both sides, so a well-behaved client reconciles to within rounding.
//
//   stepMove(state, input, dtMs, terrain) -> state (mutated)
//     state   = { x, y, z, vy, airborne, swim?, wade?, speedMul? }   (swim/wade are OUTPUTS; speedMul = riding, Q16)
//     input   = { mx, mz, b }      world-space direction (length <= 1, longer is normalised), b = IN bits
//     terrain = { heightAt(x,z), walkable?(x,z), waterAt?(x,z), moveAt?(x,z), bounds?: {minX,minZ,maxX,maxZ} }
//
// WATER (play-test 1, P2 + P25). How you move at a point comes from stream B's depth layer: `terrain.moveAt`
// ('out' | 'steep' | 'walk' | 'wade' | 'swim', js/rules/terrain-read.js) when the terrain has it, else the
// same answer worked out from `walkable` + `waterAt` with the same thresholds — so a client whose terrain
// only has waterAt predicts exactly what the server does. Deep water is SWUM, never a wall: a stream whose
// middle is deeper than WADE_DEPTH used to stop you dead in the middle ("an invisible wall"). Swimming is
// slower (MOVE.swim), floats you at the surface (y = surface - MOVE.swimSink), cannot jump, and the room
// refuses attacks while you swim. Wading is a little slower. A terrain with neither moveAt nor waterAt keeps
// the old behaviour (unwalkable = blocked).

import { IN } from '../net/protocol.js';
import * as TR from '../rules/terrain-read.js';

const WADE_DEPTH = TR.WADE_DEPTH ?? 1.1;
const DRY_FOOT_DEPTH = TR.DRY_FOOT_DEPTH ?? 0.25;

export const MOVE = Object.freeze({
  run: 5.4,          // m/s on foot (Farhold's walk speed)
  sprint: 8.1,       // m/s with IN.SPRINT
  swim: 2.7,         // m/s swimming (Farhold's swim)
  swimSprint: 3.6,   // m/s swimming hard (IN.SPRINT)
  wade: 0.8,         // speed factor while wading (water above the ankle, below WADE_DEPTH)
  swimSink: 1.1,     // a swimmer floats this far below the surface (feet; the head stays above water)
  jumpV: 6.5,        // m/s upward at take-off
  gravity: 20,       // m/s²
  fallGap: 0.6,      // walking off a ledge higher than this starts a fall
  maxDtMs: 100,      // one input never covers more than this
});

/** Water depth at (x, z) from a terrain's waterAt (object {depth} or a number), 0 when it has none. */
function depthAt(terrain, x, z) {
  if (!terrain.waterAt) return 0;
  const w = terrain.waterAt(x, z);
  const d = typeof w === 'number' ? w : (w && w.depth) || 0;
  return d > 0 ? d : 0;
}
/** Water surface at (x, z), or NaN. */
function surfaceAt(terrain, x, z) {
  if (terrain.surfaceAt) return terrain.surfaceAt(x, z);
  if (!terrain.waterAt) return NaN;
  const w = terrain.waterAt(x, z);
  if (w && typeof w === 'object') return w.depth > 0 ? w.surface : NaN;
  return w > 0 ? terrain.heightAt(x, z) + w : NaN;
}

/**
 * How a body moves at (x, z): 'out' | 'steep' | 'walk' | 'wade' | 'swim'. B's moveAt when present, else the
 * same rules from walkable + waterAt (a terrain with neither: walkable -> 'walk', not -> 'steep').
 */
export function moveKind(terrain, x, z) {
  if (terrain.moveAt) return terrain.moveAt(x, z);
  const d = depthAt(terrain, x, z);
  if (d > WADE_DEPTH && terrain.waterAt) return 'swim';
  if (terrain.walkable && !terrain.walkable(x, z)) return 'steep';
  return d > DRY_FOOT_DEPTH ? 'wade' : 'walk';
}
const open = k => k !== 'out' && k !== 'steep';

export function stepMove(state, input, dtMs, terrain) {
  const dt = Math.max(0, Math.min(MOVE.maxDtMs, +dtMs || 0)) / 1000;
  if (dt === 0) return state;
  let mx = +input.mx || 0, mz = +input.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const b = input.b | 0;
  const water = !!(terrain.moveAt || terrain.waterAt);
  // speed from where you stand NOW (positional: the client and the server need no shared hidden state)
  const here = water ? moveKind(terrain, state.x, state.z) : 'walk';
  const swimming = here === 'swim' && !state.airborne;
  let speed = swimming ? ((b & IN.SPRINT) ? MOVE.swimSprint : MOVE.swim) : (b & IN.SPRINT) ? MOVE.sprint : MOVE.run;
  if (here === 'wade' && !state.airborne) speed *= MOVE.wade;
  // riding (play-test 2, Q16): the mount's factor on land; the client predicts with the same `you.speedMul`
  if (!swimming && state.speedMul > 0 && state.speedMul !== 1) speed *= Math.min(3, state.speedMul);
  let nx = state.x + mx * speed * dt, nz = state.z + mz * speed * dt;
  const bd = terrain.bounds;
  if (bd) {
    nx = Math.min(bd.maxX, Math.max(bd.minX, nx));
    nz = Math.min(bd.maxZ, Math.max(bd.minZ, nz));
  }
  // Blocked ground (too steep / off the map; deep water only when the terrain cannot say it is water): slide
  // along one axis, else stay. Standing somewhere blocked already (a bad spawn) never traps you.
  const ok = water ? (x, z) => open(moveKind(terrain, x, z)) : terrain.walkable;
  if (ok && (nx !== state.x || nz !== state.z) && !ok(nx, nz) && ok(state.x, state.z)) {
    if (ok(nx, state.z)) nz = state.z;
    else if (ok(state.x, nz)) nx = state.x;
    else { nx = state.x; nz = state.z; }
  }
  state.x = nx; state.z = nz;
  const ground = terrain.heightAt(nx, nz);
  const kind = water ? moveKind(terrain, nx, nz) : 'walk';
  state.wade = kind === 'wade';
  if (kind === 'swim') {
    const surf = surfaceAt(terrain, nx, nz);
    const float = Number.isFinite(surf) ? Math.max(ground, surf - MOVE.swimSink) : ground;
    // falling into water: keep falling until the body reaches the float line, then swim
    if (state.airborne && state.y + state.vy * dt > float) { state.vy -= MOVE.gravity * dt; state.y += state.vy * dt; state.swim = false; return state; }
    state.swim = true; state.airborne = false; state.vy = 0; state.y = float;
    return state;
  }
  state.swim = false;
  if (!state.airborne) {
    if (b & IN.JUMP) { state.airborne = true; state.vy = MOVE.jumpV; state.y = Math.max(state.y, ground); }
    else if (state.y - ground > MOVE.fallGap) { state.airborne = true; state.vy = 0; }
    else { state.y = ground; state.vy = 0; return state; }
  }
  state.vy -= MOVE.gravity * dt;
  state.y += state.vy * dt;
  if (state.y <= ground) { state.y = ground; state.vy = 0; state.airborne = false; }
  return state;
}
