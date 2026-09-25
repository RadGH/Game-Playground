// The cell grid. Every cell has a material, an HP value, a team (who built it, 0 = nature) and
// an aux byte (slag heat, etc). Buildings claim cells with the FOOTPRINT material and their id in
// `owner`. Wall blueprints live in `plan`/`planTeam`.
//
// The map is split into 32x32 chunks. Changing a cell marks its chunk:
//   - awake   : loose-cell physics should step this chunk
//   - dirtyGfx: renderer must redraw this chunk's pixels
//   - dirtyNav: navigation grid must be rebuilt here
// and pushes structural neighbors onto the support queue.

import { M, S } from './materials.js';

export const CHUNK = 32;

export class World {
  constructor(width, height, materials) {
    this.w = width;
    this.h = height;
    this.mats = materials;
    const n = width * height;
    this.mat = new Uint8Array(n);
    this.hp = new Uint8Array(n);
    this.team = new Uint8Array(n);
    this.aux = new Uint8Array(n);
    this.owner = new Uint16Array(n);
    this.plan = new Uint8Array(n);     // blueprint material (0 = none)
    this.planTeam = new Uint8Array(n);
    this.moved = new Uint16Array(n);   // loose-physics stamp (tick number) so a cell moves once per tick
    this.cw = Math.ceil(width / CHUNK);
    this.ch = Math.ceil(height / CHUNK);
    const nc = this.cw * this.ch;
    this.awake = new Uint8Array(nc);
    this.awakeNext = new Uint8Array(nc);
    this.dirtyGfx = new Uint8Array(nc);
    this.dirtyNav = new Uint8Array(nc);
    this.anyGfxDirty = true;
    this.anyNavDirty = true;
    this.supportQueue = [];            // cell indices to check for structural support
    this.planLost = [];                // blueprint cells that lost their built cell (to rebuild)
    this.onCellDestroyed = null;       // hook(x, y, mat, team) set by the game (debris, stats)
    this.dirtyGfx.fill(1);
    this.dirtyNav.fill(1);
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? M.BEDROCK : this.mat[y * this.w + x]; }
  isEmpty(x, y) { return this.inBounds(x, y) && this.mat[y * this.w + x] === M.EMPTY; }

  // Solid for movement/collision purposes. Gate buildings (footprint cells with aux = 1) are
  // passable to their own team.
  solidFor(x, y, team = 0) {
    if (x < 0 || x >= this.w || y >= this.h) return true;
    if (y < 0) return false;
    const i = y * this.w + x;
    const m = this.mat[i];
    if (m === M.EMPTY) return false;
    if (m === M.FOOTPRINT && this.aux[i] === 1 && team && this.team[i] === team) return false; // own gate
    return true;
  }

  // Set a cell and mark everything that depends on it.
  set(x, y, mat, team = 0, hp = -1) {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    const old = this.mat[i];
    this.mat[i] = mat;
    this.hp[i] = hp >= 0 ? hp : this.mats.hp[mat];
    this.team[i] = mat === M.EMPTY ? 0 : team;
    this.aux[i] = 0;
    if (mat !== M.FOOTPRINT) this.owner[i] = 0;
    this.touch(x, y);
    if (this.plan[i] && old === this.plan[i] && mat !== old) this.planLost.push(i);
    if (this.mats.state[old] === S.STRUCTURAL || this.mats.state[old] === S.STICKY || this.mats.state[old] === S.FOOTPRINT ||
        this.mats.state[mat] === S.STRUCTURAL || this.mats.state[mat] === S.STICKY) {
      this.queueSupportAround(x, y);
    } else if (old !== mat && (this.mats.state[old] === S.STATIC || this.mats.state[old] === S.LOOSE)) {
      // Removing terrain or rubble can un-support walls sitting on it.
      this.queueSupportAround(x, y);
    }
  }

  // Mark chunk(s) touched by a change at (x, y): wake physics in the 3x3 chunk area around it
  // (so sand at a chunk edge notices its neighbor), redraw, rebuild nav.
  touch(x, y) {
    const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0;
    const ci = cy * this.cw + cx;
    this.dirtyGfx[ci] = 1; this.anyGfxDirty = true;
    this.dirtyNav[ci] = 1; this.anyNavDirty = true;
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    this.awakeNext[ci] = 1;
    if (lx === 0 && cx > 0) this.awakeNext[ci - 1] = 1;
    if (lx === CHUNK - 1 && cx < this.cw - 1) this.awakeNext[ci + 1] = 1;
    if (ly === 0 && cy > 0) { this.awakeNext[ci - this.cw] = 1; if (cx > 0) this.awakeNext[ci - this.cw - 1] = 1; if (cx < this.cw - 1) this.awakeNext[ci - this.cw + 1] = 1; }
    if (ly === CHUNK - 1 && cy < this.ch - 1) { this.awakeNext[ci + this.cw] = 1; }
  }

  // Mark graphics only (hp crack shading, plan outlines) without waking physics.
  touchGfx(x, y) {
    const ci = ((y / CHUNK) | 0) * this.cw + ((x / CHUNK) | 0);
    this.dirtyGfx[ci] = 1; this.anyGfxDirty = true;
  }

  queueSupportAround(x, y) {
    const q = this.supportQueue;
    const w = this.w, h = this.h;
    if (x > 0) q.push(y * w + x - 1);
    if (x < w - 1) q.push(y * w + x + 1);
    if (y > 0) q.push((y - 1) * w + x);
    if (y < h - 1) q.push((y + 1) * w + x);
    q.push(y * w + x);
  }

  // Apply damage to one cell. Returns true if the cell was destroyed.
  damageCell(x, y, amount, type = 'blast') {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    const m = this.mat[i];
    if (m === M.EMPTY || m === M.FOOTPRINT || this.mats.indestructible[m]) return false;
    const dmg = amount * this.mats.resistance(m, type);
    if (dmg <= 0) return false;
    const left = this.hp[i] - dmg;
    if (left <= 0) {
      const team = this.team[i];
      this.set(x, y, M.EMPTY);
      if (this.onCellDestroyed) this.onCellDestroyed(x, y, m, team, type);
      return true;
    }
    this.hp[i] = Math.max(1, Math.round(left));
    if (this.mats.built[m]) this.touchGfx(x, y);
    return false;
  }

  // Heights: first solid cell from the top in a column (terrain surface), or h if none.
  surfaceY(x, fromY = 0) {
    x = Math.max(0, Math.min(this.w - 1, x | 0));
    for (let y = Math.max(0, fromY); y < this.h; y++) if (this.mat[y * this.w + x] !== M.EMPTY) return y;
    return this.h;
  }

  // Ground under a point, ignoring cells of `team`'s gates. Returns the y of the first solid cell
  // at or below y.
  groundBelow(x, y, team = 0) {
    for (let yy = Math.max(0, y | 0); yy < this.h; yy++) if (this.solidFor(x, yy, team)) return yy;
    return this.h;
  }

  countIn(x0, y0, w, h, pred) {
    let n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.inBounds(x, y)) continue;
      if (pred(this.mat[y * this.w + x], x, y)) n++;
    }
    return n;
  }

  // Swap wake buffers (called by the cell sim at the end of a tick).
  swapAwake() {
    const t = this.awake; this.awake = this.awakeNext; this.awakeNext = t; this.awakeNext.fill(0);
  }
}
