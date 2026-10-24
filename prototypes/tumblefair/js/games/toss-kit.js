// TOSS KIT — the shared rules for the fair's throwing games (round 11: Pie Toss, Ring Toss). Pure: imported by each
// game's sim.js (the server) AND view.js (the phone), so both work a throw out the same way.
//
//   pingPong(t, period)        a meter that sweeps 0 -> 1 -> 0 once a period (the power bar)
//   sweep(t, period)           the same as -1 .. 1 (an aim needle)
//   arcY(u, h)                 height of a throw at u = 0..1 of its flight (a parabola peaking at h)
//   phoneTime(d, el, last, o)  check the time a phone says it threw at: a number, not in the future (beyond `ahead`),
//                              not older than `lag`, not before its previous throw + `gap`. -> the time, or null
//   placeOrder(pids, key)      result groups, best first, ties share (key(pid) = a number, bigger is better)
//   createPhoneClock(nowS)     browser side: the phone counts its own clock from the moment it saw play start and
//                              catches up when the server's half-second clock says it is far behind (Apple Bobbing's
//                              trick, so a throw is judged by what the player SAW and network delay does not matter)
//
// The server never trusts a verdict: a phone sends WHEN it let go (and where it aimed); the sim works out where
// everything was at the moment the throw lands, from the same seeded motion the phone drew.
export const pingPong = (t, period) => { const f = (((t % period) + period) % period) / (period / 2); return f <= 1 ? f : 2 - f; };
export const sweep = (t, period) => pingPong(t, period) * 2 - 1;
export const arcY = (u, h) => 4 * h * u * (1 - u);
export const r1 = v => Math.round(v * 10) / 10;
export const r2 = v => Math.round(v * 100) / 100;

export function phoneTime(d, el, last, { ahead = 0.15, lag = 1.0, gap = 0, max = Infinity } = {}) {
  const t = d && typeof d === 'object' ? d.t : NaN;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > max) return null;
  if (t > el + ahead || t < el - lag) return null;
  if (last != null && t < last + gap - 1e-6) return null;
  return t;
}

export function placeOrder(pids, key) {
  const groups = new Map();
  for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  return [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k));
}

/** Browser-side clock. sync(el) on every state (el = the server's play time to half a second, never ahead of it). */
export function createPhoneClock(nowS, max = Infinity) {
  let t0 = null;
  return {
    reset() { t0 = null; },
    sync(el) { if (t0 == null) { t0 = nowS() - el; return; } if (el - this.t() > 0.6) t0 = nowS() - el; },
    t() { return t0 == null ? 0 : Math.min(max, nowS() - t0); },
    get started() { return t0 != null; },
  };
}
