// Support and collapse (docs/06 §10): stone "island" rule (connected to bedrock / edge / PINNED), built
// materials' "span" rule (0-1 BFS: up is free, sideways/down costs 1, past the reach breaks), and "hang"
// for rope/web. Loose groups become falling fragments (world/fragments.js). Budgeted per tick. Pure.
import { CLS } from './materials.js';
import { F } from './grid.js';

const RULE_NONE = 0, RULE_ISLAND = 1, RULE_SPAN = 2, RULE_HANG = 3;

export function createSupport(world) {
  const g = world.grid, W = g.W, H = g.H, mats = g.mats, sup = mats.support, span = mats.span;
  const stamp = new Uint32Array(g.n); let sid = 1;
  const dist = new Int16Array(g.n);
  const S = { detached: 0, visited: 0 };

  function anchoredStatic(i) { // a cell every rule treats as a fixed anchor
    const m = g.mat[i]; return m === 1 || (g.flags[i] & F.PINNED) !== 0;
  }
  const isStruct = m => { const r = sup[m]; return (r === RULE_ISLAND || r === RULE_SPAN || r === RULE_HANG) && mats.cls[m] === CLS.STATIC; };

  /** Flood a 4-connected (8 for hang) group of structural cells from i. Returns { cells, anchored } within budget. */
  function flood(i0, budget) {
    const id = ++sid; const cells = [i0]; stamp[i0] = id; let anchored = false, k = 0;
    const hang = sup[g.mat[i0]] === RULE_HANG;
    while (k < cells.length) {
      const i = cells[k++]; const x = i % W, y = (i / W) | 0;
      if (x === 0 || x === W - 1 || y === H - 1 || y === 0) anchored = true;
      if (cells.length > budget) return { cells, anchored: true, overflow: true };
      const nbs = hang ? [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1] : [i - 1, i + 1, i - W, i + W];
      for (const j of nbs) {
        if (j < 0 || j >= g.n || stamp[j] === id) continue;
        const jx = j % W; if (Math.abs(jx - x) > 1) continue;
        const m = g.mat[j];
        if (anchoredStatic(j)) { anchored = true; continue; }
        if (hang) { // hang: held by any non-hang solid
          if (mats.cls[m] === CLS.STATIC && sup[m] !== RULE_HANG) { anchored = true; continue; }
          if (sup[m] === RULE_HANG) { stamp[j] = id; cells.push(j); }
        } else if (isStruct(m) && sup[m] !== RULE_HANG) { stamp[j] = id; cells.push(j); }
      }
    }
    return { cells, anchored };
  }

  /** Span rule on a built group: cells farther than their material's reach from an anchor are loose. */
  function spanLoose(cells) {
    const id = sid; const deque = []; const loose = [];
    for (const i of cells) dist[i] = 32767;
    for (const i of cells) {
      const x = i % W, y = (i / W) | 0, below = i + W;
      let anchor = y === H - 1;
      if (!anchor && below < g.n) { const mb = g.mat[below]; const cb = mats.cls[mb]; if (mb === 1 || (g.flags[below] & F.PINNED) || (cb === CLS.STATIC && sup[mb] === RULE_ISLAND) || cb === CLS.POWDER) anchor = true; }
      if (!anchor) for (const j of [i - 1, i + 1]) { if (j < 0 || Math.abs((j % W) - x) > 1) continue; const mj = g.mat[j]; if (mj === 1 || (mats.cls[mj] === CLS.STATIC && sup[mj] === RULE_ISLAND)) anchor = true; }
      if (anchor || (g.flags[i] & F.PINNED)) { dist[i] = 0; deque.push(i); }
    }
    let head = 0;
    // 0-1 BFS approximated with two passes of a queue (costs are 0 upward, 1 otherwise)
    while (head < deque.length) {
      const i = deque[head++]; const d = dist[i];
      const x = i % W;
      for (const [j, cost] of [[i - W, 0], [i - 1, 1], [i + 1, 1], [i + W, 1]]) {
        if (j < 0 || j >= g.n || stamp[j] !== id) continue; if (Math.abs((j % W) - x) > 1) continue;
        const nd = d + cost; if (nd < dist[j]) { dist[j] = nd; if (cost === 0) deque.splice(head, 0, j); else deque.push(j); }
      }
    }
    for (const i of cells) if (dist[i] > span[g.mat[i]]) loose.push(i);
    return loose;
  }

  /** Process queued cells, up to budget visited cells. Returns groups of loose cell indices. */
  S.process = function (budget = 12000) {
    const q = g.supportQueue; if (!q.length) return [];
    const groups = []; let visited = 0; const next = [];
    const seen = new Set();
    while (q.length && visited < budget) {
      const src = q.pop();
      for (const i of [src - 1, src + 1, src - W, src + W, src]) {
        if (i < 0 || i >= g.n || seen.has(i)) continue;
        const m = g.mat[i]; if (!isStruct(m) || anchoredStatic(i)) continue;
        seen.add(i);
        const rule = sup[m];
        const f = flood(i, rule === RULE_ISLAND ? 4096 : 8192); visited += f.cells.length;
        for (const c of f.cells) seen.add(c);
        if (f.overflow) continue;
        if (rule === RULE_SPAN) { const loose = spanLoose(f.cells); if (loose.length) groups.push(...splitGroups(loose)); }
        else if (!f.anchored) groups.push(f.cells);
      }
    }
    if (q.length) next.push(...q); g.supportQueue = next;
    S.visited = visited; S.detached += groups.length;
    return groups;
  };
  function splitGroups(cells) {
    const set = new Set(cells), out = [];
    for (const c of cells) {
      if (!set.has(c)) continue; const grp = [c]; set.delete(c); let k = 0;
      while (k < grp.length) { const i = grp[k++]; for (const j of [i - 1, i + 1, i - W, i + W]) if (set.has(j)) { set.delete(j); grp.push(j); } }
      out.push(grp);
    }
    return out;
  }
  return S;
}
