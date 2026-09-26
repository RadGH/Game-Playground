// Movement-aware reachability (docs/REVIEW R8: reachability is an error). Builds a coarse graph of places
// the player can stand, swim or climb, joined by walks, jumps, falls and climbs using the real movement
// numbers, then floods it from an entry. Pure; used by tools/room-check.mjs and tests.
import { CLS } from './materials.js';

const STEP = 2; // sample every 2 columns

/**
 * @param g         compiled grid
 * @param movement  data/movement.json
 * @param verbs     { swim: bool, grapple: bool, doubleJump: bool, planks: n }
 * @param extra     { ropes: [{x, y0, y1}], grapplePoints: [[x,y]], openDoors: bool }
 */
export function buildReachGraph(g, movement, verbs = {}, extra = {}) {
  const W = g.W, H = g.H, mats = g.mats, cls = mats.cls;
  const solid = (x, y) => { if (x < 0 || x >= W || y >= H) return true; if (y < 0) return false; const c = cls[g.mat[y * W + x]]; return c === CLS.STATIC || c === CLS.POWDER; };
  const liquid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cls[g.mat[y * W + x]] === CLS.LIQUID;
  const climb = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mats.climbable[g.mat[y * W + x]];
  const bw = 6, bh = 12;
  // prefix sums of solid cells so "does the body fit at (cx, feet)" is O(1)
  const PW = W + 1, S = new Int32Array(PW * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += solid(x, y) ? 1 : 0; S[(y + 1) * PW + x + 1] = S[y * PW + x + 1] + row; } }
  const rectSolid = (x0, y0, x1, y1) => { if (x0 < 0 || x1 > W || y1 > H) return 1; if (y0 < 0) y0 = 0; if (y1 <= y0) return 0; return S[y1 * PW + x1] - S[y0 * PW + x1] - S[y1 * PW + x0] + S[y0 * PW + x0]; };
  const fits = (cx, feet) => rectSolid(cx - 3, feet - bh, cx + 3, feet) === 0;
  const wet = (cx, feet) => { let n = 0; for (let y = feet - bh; y < feet; y += 2) for (let x = cx - 3; x < cx + 3; x += 2) if (liquid(x, y)) n++; return n >= 10; };
  const nodes = []; const byCol = new Map();
  const add = (x, y, kind) => { const id = nodes.length; nodes.push({ x, y, kind, id }); if (!byCol.has(x)) byCol.set(x, []); byCol.get(x).push(id); return id; };
  for (let x = 3; x < W - 3; x += STEP) {
    for (let y = bh; y < H; y++) {
      const feet = y; // feet row is y-1, floor row is y
      const grounded = rectSolid(x - 3, y, x + 3, y + 1) > 0; // any cell under the 6-wide body
      if (grounded && !solid(x, y - 1) && fits(x, y)) add(x, y, 'stand');
      else if (!grounded && fits(x, y) && wet(x, y) && (y % 6 === 0)) add(x, y, 'swim');
      else if (!grounded && fits(x, y) && climb(x, y - 6) && (y % 6 === 0)) add(x, y, 'climb');
    }
  }
  const J = movement.jump, maxUp = Math.floor((J.v * J.v) / (2 * J.gravity)) + (verbs.doubleJump ? 25 : 0), maxAcross = verbs.doubleJump ? 64 : 48;
  const clearLine = (x0, y0, x1, y1) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2); for (let k = 1; k < n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); if (!fits(x, y)) return false; } return true; };
  const arcClear = (a, b) => { // up then across: apex at min(y) - 4
    const apex = Math.min(a.y, b.y) - 4;
    return clearLine(a.x, a.y, a.x, apex) && clearLine(a.x, apex, b.x, apex) || clearLine(a.x, a.y, b.x, Math.min(a.y, b.y)) && clearLine(b.x, Math.min(a.y, b.y), b.x, b.y);
  };
  const adj = nodes.map(() => []);
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  for (const n of nodes) {
    for (const cx of cols) {
      const dx = cx - n.x; if (Math.abs(dx) > maxAcross + 4) continue;
      for (const id of byCol.get(cx)) {
        if (id === n.id) continue; const m = nodes[id]; const dy = m.y - n.y;
        let ok = false;
        if (n.kind === 'swim' || m.kind === 'swim') ok = Math.abs(dx) <= 8 && Math.abs(dy) <= 8 && (verbs.swim || dy >= -4 || m.kind === 'stand');
        if (!ok && (n.kind === 'climb' || m.kind === 'climb')) ok = Math.abs(dx) <= 6 && Math.abs(dy) <= 8;
        if (!ok && Math.abs(dx) <= STEP && Math.abs(dy) <= 4) ok = true; // walk + step
        if (!ok && dy >= 0 && Math.abs(dx) <= Math.max(12, Math.min(96, dy * 0.8 + 24))) ok = clearLine(n.x, n.y, n.x + Math.sign(dx) * 4, n.y) && clearLine(n.x + Math.sign(dx) * 4, n.y, m.x, m.y); // fall
        if (!ok && dy < 0 && -dy <= maxUp && Math.abs(dx) <= maxAcross * (1 - (-dy / (maxUp + 8)) * 0.4)) ok = arcClear(n, m); // jump
        if (ok) adj[n.id].push(id);
      }
    }
  }
  return { nodes, adj, fits };
}

export function reachable(graph, from) {
  const seen = new Uint8Array(graph.nodes.length); const q = []; for (const f of from) { seen[f] = 1; q.push(f); }
  while (q.length) { const i = q.pop(); for (const j of graph.adj[i]) if (!seen[j]) { seen[j] = 1; q.push(j); } }
  return seen;
}
export function nearestNodes(graph, x, y, r = 16) { return graph.nodes.filter(n => Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r).map(n => n.id); }
export function nodesInRect(graph, [rx, ry, rw, rh], pad = 8) { return graph.nodes.filter(n => n.x >= rx - pad && n.x <= rx + rw + pad && n.y - 12 <= ry + rh + pad && n.y >= ry - pad).map(n => n.id); }
