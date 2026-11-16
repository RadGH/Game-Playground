// Traffic you can see: hover-cars, haulers and trams driving the roads (visual only — the sim's traffic numbers live
// in networks.js solveTraffic). More people and jobs → more vehicles; avenues and highways carry more. Each vehicle
// follows road tiles, keeps to its lane, never turns back unless it reaches a dead end, and fades out after a while.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Traffic {
  constructor() { this.list = []; this.seed = 1; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  update(r, dt) {
    const N = r.size; if (!r.core) { this.list.length = 0; return; }
    const want = Math.min(80, Math.round((r.people.total / 12) + (r.lots.reduce((s, l) => s + (l.jobs || 0), 0) / 30)));
    if (!this._roads || r.dirty !== this._dirtySeen || this._roadCount !== countRoads(r)) { this._roads = []; for (let i = 0; i < N * N; i++) if (r.tiles.road[i]) this._roads.push(i); this._roadCount = this._roads.length; }
    if (!this._roads.length) return;
    while (this.list.length < want) {
      const i = this._roads[Math.floor(this.rnd() * this._roads.length)];
      const x = i % N, z = (i / N) | 0;
      const lv = r.tiles.road[i];
      const roll = this.rnd();
      const id = lv === 3 && roll < 0.35 ? 'veh-hauler' : roll < 0.12 ? 'veh-hauler' : roll < 0.18 && lv >= 2 ? 'veh-tram' : 'veh-car';
      this.list.push({ id, x: x + 0.5, z: z + 0.5, tx: x, tz: z, dir: null, t: this.rnd() * 10, life: 18 + this.rnd() * 20, speed: id === 'veh-hauler' ? 1.1 : id === 'veh-tram' ? 1.3 : 1.7 + this.rnd() * 0.6, heading: 0, seed: 1 + Math.floor(this.rnd() * 9), fade: 0 });
    }
    if (this.list.length > want + 5) this.list.length = want;
    for (const v of this.list) {
      v.t += dt; v.life -= dt; v.fade = Math.min(1, v.fade + dt * 2);
      // at a tile centre: choose the next road tile (not back the way we came unless it's a dead end)
      const cx = v.tx + 0.5, cz = v.tz + 0.5;
      if (!v.dir || Math.hypot(v.x - (cx + lane(v.dir)[0]), v.z - (cz + lane(v.dir)[1])) < 0.08) {
        const opts = N4.filter(([dx, dz]) => { const nx = v.tx + dx, nz = v.tz + dz; return nx >= 0 && nz >= 0 && nx < N && nz < N && r.tiles.road[nz * N + nx] && !(v.dir && dx === -v.dir[0] && dz === -v.dir[1]); });
        const pick = opts.length ? opts[Math.floor(this.rnd() * opts.length)] : v.dir ? [-v.dir[0], -v.dir[1]] : null;
        if (!pick) { v.life = 0; continue; }
        v.dir = pick; v.tx += pick[0]; v.tz += pick[1];
        if (!r.tiles.road[v.tz * N + v.tx]) { v.life = 0; continue; }
      }
      const [ox, oz] = lane(v.dir), gx = v.tx + 0.5 + ox, gz = v.tz + 0.5 + oz;
      const dx = gx - v.x, dz = gz - v.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, v.speed * dt);
      v.x += dx / d * step; v.z += dz / d * step; v.heading = Math.atan2(dz, dx);
    }
    this.list = this.list.filter(v => v.life > 0);
  }
}
/** Drive on the right: offset from the road's centre line, to the right of the direction of travel. */
function lane(dir) { if (!dir) return [0, 0]; return [-dir[1] * 0.18, dir[0] * 0.18]; }
function countRoads(r) { let n = 0; const a = r.tiles.road; for (let i = 0; i < a.length; i += 7) if (a[i]) n++; return n; }
