// SPIKE (throwaway): falling-sand world with water, oil, sand, steam + rain, to measure sim cost.
export const AIR = 0, STONE = 1, SAND = 2, WATER = 3, OIL = 4, STEAM = 5, WOOD = 6, FIRE = 7;
const KIND = [0, 1, 2, 3, 3, 4, 1, 5]; // 0 air 1 static 2 powder 3 liquid 4 gas 5 fire
const DENS = [0, 9, 5, 3, 2, 0, 9, 0];
export class World {
  constructor(w, h) {
    this.w = w; this.h = h; this.n = w * h;
    this.mat = new Uint8Array(this.n); this.var = new Uint8Array(this.n); this.stamp = new Uint16Array(this.n);
    this.cs = 32; this.cw = Math.ceil(w / 32); this.ch = Math.ceil(h / 32);
    this.awake = new Uint8Array(this.cw * this.ch).fill(1); this.next = new Uint8Array(this.cw * this.ch);
    this.tick = 0; this.seed = 12345;
  }
  rnd() { let t = (this.seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  set(x, y, m) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = y * this.w + x; this.mat[i] = m; this.var[i] = (this.rnd() * 255) | 0; this.wake(x, y); }
  wake(x, y) { const cx = (x / 32) | 0, cy = (y / 32) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = cx + dx, b = cy + dy; if (a >= 0 && b >= 0 && a < this.cw && b < this.ch) this.next[b * this.cw + a] = 1; } }
  swap(i, j, x, y, x2, y2) { const m = this.mat[i]; this.mat[i] = this.mat[j]; this.mat[j] = m; const v = this.var[i]; this.var[i] = this.var[j]; this.var[j] = v; this.stamp[j] = this.st; this.stamp[i] = this.st; this.wake(x, y); this.wake(x2, y2); }
  step() {
    this.tick++; this.st = (this.tick % 65000) + 1; const W = this.w, H = this.h, mat = this.mat;
    const lf = (this.tick & 1) === 0; let active = 0;
    for (let cy = this.ch - 1; cy >= 0; cy--) for (let k = 0; k < this.cw; k++) {
      const cx = lf ? k : this.cw - 1 - k; if (!this.awake[cy * this.cw + cx]) continue; active++;
      const x0 = cx * 32, y0 = cy * 32, x1 = Math.min(W, x0 + 32), y1 = Math.min(H, y0 + 32);
      for (let y = y1 - 1; y >= y0; y--) for (let q = 0; q < x1 - x0; q++) {
        const x = lf ? x0 + q : x1 - 1 - q, i = y * W + x, m = mat[i], kind = KIND[m];
        if (kind < 2 || this.stamp[i] === this.st) continue;
        if (kind === 4) { // gas rises
          if (this.rnd() < 0.004) { mat[i] = WATER; this.wake(x, y); continue; }
          if (y > 0) { const u = i - W; if (mat[u] === AIR) { this.swap(i, u, x, y, x, y - 1); continue; } }
          const d = this.rnd() < 0.5 ? -1 : 1; const nx = x + d; if (nx >= 0 && nx < W && mat[i + d] === AIR) this.swap(i, i + d, x, y, nx, y); continue;
        }
        if (kind === 5) { if (this.rnd() < 0.08) { mat[i] = this.rnd() < 0.3 ? STEAM : AIR; this.wake(x, y); } else this.wake(x, y); continue; }
        if (y >= H - 1) continue;
        const b = i + W, mb = mat[b];
        if (mb === AIR || (KIND[mb] === 3 && DENS[mb] < DENS[m] && kind !== 4)) { this.swap(i, b, x, y, x, y + 1); continue; }
        const d = ((x + this.tick) & 1) ? 1 : -1;
        let moved = false;
        for (const dd of [d, -d]) { const nx = x + dd; if (nx < 0 || nx >= W) continue; const t = mat[b + dd]; if (t === AIR || (kind === 2 && KIND[t] === 3)) { this.swap(i, b + dd, x, y, nx, y + 1); moved = true; break; } }
        if (moved || kind !== 3) continue;
        // liquid: disperse sideways up to 5
        let tx = -1;
        for (let s = 1; s <= 5; s++) { const nx = x + d * s; if (nx < 0 || nx >= W) break; const t = mat[i + d * s]; if (t === AIR) tx = nx; else if (!(KIND[t] === 3 && DENS[t] < DENS[m])) break; if (tx >= 0) break; }
        if (tx >= 0) this.swap(i, y * W + tx, x, y, tx, y);
      }
    }
    const t = this.awake; this.awake = this.next; this.next = t; this.next.fill(0);
    return active;
  }
}
