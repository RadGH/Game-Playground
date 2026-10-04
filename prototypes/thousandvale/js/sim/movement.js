// The movement step (stream A). Pure, shared: the server runs it on every `in` message, and the client
// runs the SAME function to predict its own character (docs/protocol.md §9). Same inputs give the same
// floats on both sides, so a well-behaved client reconciles to within rounding.
//
//   stepMove(state, input, dtMs, terrain) -> state (mutated)
//     state   = { x, y, z, vy, airborne }
//     input   = { mx, mz, b }      world-space direction (length <= 1, longer is normalised), b = IN bits
//     terrain = { heightAt(x,z), walkable?(x,z), bounds?: {minX,minZ,maxX,maxZ} }

import { IN } from '../net/protocol.js';

export const MOVE = Object.freeze({
  run: 5.4,          // m/s on foot (Farhold's walk speed)
  sprint: 8.1,       // m/s with IN.SPRINT
  jumpV: 6.5,        // m/s upward at take-off
  gravity: 20,       // m/s²
  fallGap: 0.6,      // walking off a ledge higher than this starts a fall
  maxDtMs: 100,      // one input never covers more than this
});

export function stepMove(state, input, dtMs, terrain) {
  const dt = Math.max(0, Math.min(MOVE.maxDtMs, +dtMs || 0)) / 1000;
  if (dt === 0) return state;
  let mx = +input.mx || 0, mz = +input.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const b = input.b | 0;
  const speed = (b & IN.SPRINT) ? MOVE.sprint : MOVE.run;
  let nx = state.x + mx * speed * dt, nz = state.z + mz * speed * dt;
  const bd = terrain.bounds;
  if (bd) {
    nx = Math.min(bd.maxX, Math.max(bd.minX, nx));
    nz = Math.min(bd.maxZ, Math.max(bd.minZ, nz));
  }
  // Blocked ground (too steep / deep water): slide along one axis, else stay. Standing somewhere
  // unwalkable already (a bad spawn) never traps you.
  const ok = terrain.walkable;
  if (ok && (nx !== state.x || nz !== state.z) && !ok(nx, nz) && ok(state.x, state.z)) {
    if (ok(nx, state.z)) nz = state.z;
    else if (ok(state.x, nz)) nx = state.x;
    else { nx = state.x; nz = state.z; }
  }
  state.x = nx; state.z = nz;
  const ground = terrain.heightAt(nx, nz);
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
