// Wildfires far from people (play-test 1, owner: "a system that prevents them going out of control
// … I don't mind it except these are fires far away that don't affect me"). PURE.
//   * isWild(chunk): no town of yours, no building and no rival town within WILD_M metres. Cached
//     per chunk, re-checked every 20 s. cells.js burn() asks it: a wild fire spreads at ~half the
//     heat and burns out twice as fast.
//   * count(): every wild burning cell is counted; every 5 s, if the wild fire is still big, rain
//     clouds roll in over its middle (a real natural Call Rain, the same thing the power does) and
//     cells in that chunk also go out on their own a little at a time while it lasts.
// Fires near your towns are untouched: firefighters, bucket lines and firebreaks still matter.

const WILD_M = 220, BIG = 120, CHECK = 100, DOUSE_TICKS = 1200;

export function createWildfire(sim) {
  const W = sim.W;
  let n = 0, sx = 0, sy = 0, refX = null;
  const douse = new Map();         // chunk key → tick until which its wild fire goes out on its own
  function far(ax, bx) { let d = Math.abs(ax - bx) % W; return Math.min(d, W - d); }
  function isWild(c) {
    if (c.wildAt != null && sim.tick - c.wildAt < 400) return c.wild;
    const x = c.cx * 64 + 32, y = c.cy * 64 + 32;
    const S = sim.state.town || {};
    const near = (px, py) => far(px, x) < WILD_M && Math.abs(py - y) < WILD_M;
    let wild = !(S.towns || []).some(t => near(t.x, t.y)) && !(S.buildings || []).some(b => near(b.x, b.y));
    if (wild) for (const rv of sim.state.rivals?.list || []) if ((rv.towns || []).some(t => near(t.x ?? t[0], t.y ?? t[1]))) { wild = false; break; }
    c.wildAt = sim.tick; c.wild = wild;
    return wild;
  }
  function count(c, i) {
    const x = c.cx * 64 + (i & 63), y = c.cy * 64 + (i >> 6);
    if (refX == null) refX = x;
    let dx = x - refX; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    n++; sx += dx; sy += y;
  }
  const key = c => c.cx + ',' + c.cy;
  function dousing(c) { const t = douse.get(key(c)); return t != null && t > sim.tick; }
  function step() {
    if (sim.tick % CHECK) return;
    const avg = n / CHECK;
    if (avg > BIG && refX != null) {
      const x = ((refX + sx / n) % W + W) % W, y = sy / n;
      const P = sim.powers;
      const raining = P?.state?.active?.some(a => a.k === 'rain' && far(a.x, x) < 120 && Math.abs(a.y - y) < 120);
      if (!raining && P?.start) {
        P.start('rain', avg > BIG * 3 ? 2 : 1, x, y, true);
        sim.events.push({ t: 'say', text: 'Rain clouds roll in over a distant wildfire.', kind: '', x: Math.round(x), y: Math.round(y) });
      }
      // the chunks around the middle go out a little at a time for the next minute
      const cx = Math.floor(x / 64), cy = Math.floor(y / 64), CW = Math.ceil(W / 64);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) douse.set((((cx + dx) % CW) + CW) % CW + ',' + (cy + dy), sim.tick + DOUSE_TICKS);
    }
    for (const [k, t] of douse) if (t <= sim.tick) douse.delete(k);
    n = 0; sx = 0; sy = 0; refX = null;
  }
  return { id: 'wildfire', step, isWild, count, dousing };
}
