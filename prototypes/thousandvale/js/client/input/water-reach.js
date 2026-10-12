// Input layer (play-test 10, Y34 — stream G2): "is there water I could cast into from here?" — for the phone's Fish
// button, which is lit only when a cast would land and dimmed (with a plain reason) when it would not.
//
// This is the SERVER's own rule for a cast with no aim (js/sim/angling.js castAt), read-only and on the client's terrain:
//   · an open pool within `castMax` metres of your feet, or
//   · the first water at least `minDepth` deep, `autoMin`..`autoMax` metres along a fan of headings from where you face.
// The server has the last word (`fishR {why:'noWater'}`); this only saves the tap. Pure — no DOM, no three.

/** The numbers js/sim/angling.js uses (R.castMax, R.autoMin, R.autoMax, R.minDepth) and its fan of turns. */
export const CAST = Object.freeze({ castMax: 24, autoMin: 3, autoMax: 16, minDepth: 0.25 });
export const CAST_TURNS = Object.freeze([0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4, Math.PI]);

const depthOf = w => (typeof w === 'number' ? w : (w && w.depth) || 0);

/**
 * me = { x, z, yaw } · waterAt(x, z) -> { depth, kind } | number | null · pools = [{ x, z }]
 * -> null when nothing is in reach, else { x, z, pool: bool, dist }
 */
export function waterInReach(me, waterAt, pools = [], R = CAST) {
  if (!me || !Number.isFinite(me.x) || !Number.isFinite(me.z)) return null;
  let best = null;
  for (const p of pools || []) { const d = Math.hypot(p.x - me.x, p.z - me.z); if (d <= R.castMax && (!best || d < best.dist)) best = { x: p.x, z: p.z, pool: true, dist: d }; }
  if (best) return best;
  if (typeof waterAt !== 'function') return null;
  for (const turn of CAST_TURNS) {
    const yaw = (me.yaw || 0) + turn, sx = Math.sin(yaw), sz = Math.cos(yaw);
    for (let d = R.autoMin; d <= R.autoMax; d += 1) {
      let w = null; try { w = waterAt(me.x + sx * d, me.z + sz * d); } catch { w = null; }
      if (depthOf(w) >= R.minDepth) return { x: me.x + sx * d, z: me.z + sz * d, pool: false, dist: d };
    }
  }
  return null;
}
