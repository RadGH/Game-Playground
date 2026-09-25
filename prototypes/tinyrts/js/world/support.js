// Structural support and falling clumps.
//
// Built cells (Panel, Plate, Prism, Gate, Foam) must be held up. When something near a structure
// changes, the structure's connected group is re-checked:
//
//   anchor  = a cell resting on terrain/rubble/a building, or pressed against terrain from the
//             side (walls built into a hillside hold).
//   span    = distance from the nearest anchor, where standing on a cell costs 0 and reaching
//             sideways or hanging below costs 1 (a 0-1 breadth-first search).
//
// Cells whose span is over their material's limit break off and fall as a rigid clump. A clump
// keeps its shape while falling, then shatters on impact — the harder it lands, the more of it
// turns to Rubble.

import { M, S } from './materials.js';

const MAX_COMPONENT = 60000; // bail out on absurdly large structures (treated as supported)

export class SupportSolver {
  constructor(world) {
    this.world = world;
    const n = world.w * world.h;
    this.visit = new Uint32Array(n);   // pass stamp: cell belongs to the component being solved
    this.distStamp = new Uint32Array(n);
    this.dist = new Uint16Array(n);
    this.pass = 0;
    this.clumps = [];
    this.nextClumpId = 1;
    this.comp = new Int32Array(MAX_COMPONENT + 8);
    this.deque = new Int32Array((MAX_COMPONENT + 8) * 4);
    this.onClumpLand = null; // (clump, fallDist, cells[]) -> void, set by the game
  }

  isStructure(m) {
    const st = this.world.mats.state[m];
    return st === S.STRUCTURAL || st === S.STICKY;
  }

  // Process the queue with a budget of visited cells. Returns cells visited.
  process(budget = 80000) {
    const world = this.world;
    const q = world.supportQueue;
    let used = 0;
    const passStart = this.pass;
    while (q.length && used < budget) {
      const i = q.pop();
      if (!this.isStructure(world.mat[i])) continue;
      if (this.visit[i] > passStart) continue; // already solved as part of a component this call
      used += this.solveComponent(i);
    }
    return used;
  }

  solveComponent(start) {
    const world = this.world, W = world.w, H = world.h, mat = world.mat, st = world.mats.state;
    const pass = ++this.pass;
    const comp = this.comp;
    let n = 0;
    // Flood the connected structure (4-neighbour).
    comp[n++] = start; this.visit[start] = pass;
    for (let k = 0; k < n; k++) {
      const i = comp[k];
      const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) {
        if (j < 0 || this.visit[j] === pass) continue;
        if (!this.isStructure(mat[j])) continue;
        this.visit[j] = pass;
        if (n >= MAX_COMPONENT) return n; // too big: leave it standing
        comp[n++] = j;
      }
    }

    // 0-1 BFS from anchors (ring-buffer deque).
    const dq = this.deque, size = dq.length;
    let head = 0, tail = 0, count = 0;
    const pushBack = (j) => { dq[tail] = j; tail = (tail + 1) % size; count++; };
    const pushFront = (j) => { head = (head - 1 + size) % size; dq[head] = j; count++; };
    const dist = this.dist, ds = this.distStamp;
    const holds = (m) => { const s = st[m]; return s === S.STATIC || s === S.LOOSE || s === S.FOOTPRINT; };
    const side = (j) => { const s = st[mat[j]]; return s === S.STATIC || s === S.FOOTPRINT; };
    for (let k = 0; k < n; k++) {
      const i = comp[k];
      const x = i % W, y = (i / W) | 0;
      const m = mat[i];
      let anchored = false;
      if (y === H - 1 || holds(mat[i + W])) anchored = true;
      else if (st[m] === S.STICKY) {
        anchored = (x > 0 && holds(mat[i - 1])) || (x < W - 1 && holds(mat[i + 1])) || (y > 0 && holds(mat[i - W]));
      } else {
        // Sides: terrain or a building. Above: only terrain (a wall wedged under a rock ceiling).
        anchored = (x > 0 && side(i - 1)) || (x < W - 1 && side(i + 1)) || (y > 0 && st[mat[i - W]] === S.STATIC);
      }
      if (anchored) { ds[i] = pass; dist[i] = 0; pushBack(i); }
    }
    const relax = (j, nd, front) => {
      if (this.visit[j] !== pass) return;
      if (ds[j] === pass && dist[j] <= nd) return;
      if (count >= size - 1) return; // safety: never overflow the ring
      ds[j] = pass; dist[j] = nd;
      if (front) pushFront(j); else pushBack(j);
    };
    while (count > 0) {
      const i = dq[head]; head = (head + 1) % size; count--;
      const d = dist[i];
      const x = i % W, y = (i / W) | 0;
      // Up: rests on this cell, same distance. Down/sideways: +1.
      if (y > 0) relax(i - W, d, true);
      if (x > 0) relax(i - 1, d + 1, false);
      if (x < W - 1) relax(i + 1, d + 1, false);
      if (y < H - 1) relax(i + W, d + 1, false);
    }

    // Collect unsupported cells.
    const loose = [];
    for (let k = 0; k < n; k++) {
      const i = comp[k];
      const m = mat[i];
      let limit = world.mats.maxSpan[m];
      if (ds[i] !== pass || dist[i] > limit) loose.push(i);
    }
    if (loose.length) this.detach(loose);
    return n;
  }

  // Split unsupported cells into connected groups and turn each into a falling clump.
  detach(cells) {
    const world = this.world, W = world.w;
    const set = new Set(cells);
    const done = new Set();
    for (const s of cells) {
      if (done.has(s)) continue;
      const group = [s]; done.add(s);
      for (let k = 0; k < group.length; k++) {
        const i = group[k];
        for (const j of [i - 1, i + 1, i - W, i + W]) {
          if (set.has(j) && !done.has(j)) { done.add(j); group.push(j); }
        }
      }
      this.makeClump(group);
    }
  }

  makeClump(group) {
    const world = this.world, W = world.w;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of group) {
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const cmat = new Uint8Array(cw * chh), cteam = new Uint8Array(cw * chh), chp = new Uint8Array(cw * chh);
    for (const i of group) {
      const x = i % W, y = (i / W) | 0;
      const k = (y - y0) * cw + (x - x0);
      cmat[k] = world.mat[i]; cteam[k] = world.team[i]; chp[k] = world.hp[i];
      if (world.plan[i] && world.plan[i] === world.mat[i]) world.planLost.push(i);
      world.mat[i] = M.EMPTY; world.hp[i] = 0; world.team[i] = 0; world.aux[i] = 0;
      world.touch(x, y);
      world.queueSupportAround(x, y);
    }
    // Bottom profile: lowest filled row per column (for collision).
    const bottom = new Int16Array(cw).fill(-1);
    for (let cx = 0; cx < cw; cx++) for (let cy = chh - 1; cy >= 0; cy--) if (cmat[cy * cw + cx]) { bottom[cx] = cy; break; }
    const clump = {
      id: this.nextClumpId++, x: x0, y: y0, fy: y0, vy: 0, vx: 0, fx: x0, w: cw, h: chh,
      mat: cmat, team: cteam, hp: chp, bottom, fallen: 0, count: group.length, gfxDirty: true,
    };
    this.clumps.push(clump);
    return clump;
  }

  // Would the clump collide if its top-left were at (x, y)? Checks every filled cell.
  collides(c, x, y) {
    const world = this.world;
    for (let cy = 0; cy < c.h; cy++) for (let cx = 0; cx < c.w; cx++) {
      if (!c.mat[cy * c.w + cx]) continue;
      const wx = x + cx, wy = y + cy;
      if (wy < 0) continue;
      if (wx < 0 || wx >= world.w || wy >= world.h) return true;
      if (world.mat[wy * world.w + wx] !== M.EMPTY) return true;
    }
    return false;
  }

  // Would moving down one cell hit something? Uses the bottom profile (fast path).
  blockedBelow(c, x, y) {
    const world = this.world;
    for (let cx = 0; cx < c.w; cx++) {
      const b = c.bottom[cx];
      if (b < 0) continue;
      const wx = x + cx, wy = y + b + 1;
      if (wy >= world.h) return true;
      if (wx < 0 || wx >= world.w) return true;
      if (wy >= 0 && world.mat[wy * world.w + wx] !== M.EMPTY) return true;
    }
    return false;
  }

  // Advance all falling clumps one tick. rng for shatter randomness.
  stepClumps(dt, rng) {
    const g = 260; // cells/s^2
    for (let k = this.clumps.length - 1; k >= 0; k--) {
      const c = this.clumps[k];
      c.vy = Math.min(c.vy + g * dt, 240);
      c.fy += c.vy * dt;
      // Sideways drift from explosions, blocked by anything in the way.
      if (c.vx) {
        c.fx += c.vx * dt; c.vx *= 0.96;
        const nx = Math.round(c.fx);
        if (nx !== c.x) {
          if (this.collides(c, nx, c.y)) { c.fx = c.x; c.vx = 0; } else c.x = nx;
        }
        if (Math.abs(c.vx) < 1) c.vx = 0;
      }
      const target = Math.floor(c.fy);
      let landed = false;
      while (c.y < target) {
        if (this.blockedBelow(c, c.x, c.y)) { landed = true; break; }
        c.y++; c.fallen++;
      }
      if (!landed && this.blockedBelow(c, c.x, c.y) && c.vy > 0 && c.fy - c.y > 0.9) landed = true;
      if (!landed && c.y >= this.world.h + 5) { this.clumps.splice(k, 1); continue; }
      if (landed) { this.land(c, rng); this.clumps.splice(k, 1); }
    }
  }

  land(c, rng) {
    const world = this.world, W = world.w;
    const shatter = Math.min(0.95, Math.max(0, (c.fallen - 3) / 22));
    const placed = [];
    for (let cy = c.h - 1; cy >= 0; cy--) for (let cx = 0; cx < c.w; cx++) {
      const k = cy * c.w + cx;
      const m = c.mat[k];
      if (!m) continue;
      let wx = c.x + cx, wy = c.y + cy;
      if (wx < 0 || wx >= W) continue;
      // Find a free spot at or above (something may have moved in).
      while (wy >= 0 && world.mat[wy * W + wx] !== M.EMPTY) wy--;
      if (wy < 0) continue;
      const broken = rng ? rng.next() < shatter : shatter > 0.5;
      const i = wy * W + wx;
      if (broken) { world.mat[i] = M.RUBBLE; world.hp[i] = world.mats.hp[M.RUBBLE]; world.team[i] = 0; }
      else {
        world.mat[i] = m; world.team[i] = c.team[k];
        world.hp[i] = Math.max(1, Math.round(c.hp[k] * (1 - shatter * 0.5)));
      }
      world.aux[i] = 0;
      world.touch(wx, wy);
      world.queueSupportAround(wx, wy);
      placed.push(i);
    }
    if (this.onClumpLand) this.onClumpLand(c, c.fallen, placed);
  }
}
