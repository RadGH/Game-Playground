// Engine-independent maths for the defence (PLAN §4.3: no Math.sin/cos/hypot/pow under js/sim — every engine must give
// the same answer bit for bit). Trig comes from js/sim/rng.js's table (angles in 1/1024 of a turn).
import { sinT, cosT } from '../rng.js';

/** √(x² + y²) with plain arithmetic. */
export const hyp = (x, y) => Math.sqrt(x * x + y * y);
/** Unit direction for a share of a full turn (0-1). */
export function dir(turn) { const k = Math.round(turn * 1024) & 1023; return [cosT(k) / 65536, sinT(k) / 65536]; }
/** b to the integer power n (n ≥ 0). */
export function powi(b, n) { let r = 1; for (let i = 0; i < n; i++) r *= b; return r; }
