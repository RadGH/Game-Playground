// The city view: an isometric map drawn the SimCity 4 way — ground tiles with height levels and cliff faces, water,
// roads, zone tints, deposits, nests and alien plants, then every baked picture (buildings, walls, turrets, creatures,
// vehicles) back to front, then effects, weather and the night. Turns in 4 steps; zooms; picks the tile under a point
// taking heights into account.
import { toScreen, toWorld, turnXZ, dirOfHeading, groundDirOfHeading, TILE_W, TILE_H } from '../../../../citykit/js/iso.js';
import { composite } from '../../../../citykit/js/bake.js';
import { KINDS } from '../../../../citykit/js/world/horde.js';
import { TURRETS, Defence } from '../../../../citykit/js/world/defence.js';
import { BIOMES } from '../sim/world.js';
import { MAX } from '../sim/terrain.js';
import { ZONE } from '../sim/region.js';
import { pylonPlan } from '../sim/networks.js';
import { CELL, regionAt } from '../sim/world.js';
import { PYLON } from '../../../../citykit/js/kit/power.js';
import { PX_PER_HEIGHT } from '../../../../citykit/js/iso.js';

export const LEVEL = 0.26;               // one height level in tile heights (≈10 px at 1×)
const BIDS = Object.keys(BIOMES);
const ZONE_TINT = { 1: 'rgba(86, 214, 120, 0.42)', 2: 'rgba(80, 160, 255, 0.42)', 3: 'rgba(255, 190, 70, 0.42)' };
const DEP_COLOR = ['', '#9aa6b4', '#c9b79a', '#b48cff'];

export class MapView {
  constructor(canvas, sprites) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.sprites = sprites;
    this.cam = { x: 32, z: 32, zoom: 1, rot: 0 };
    this.shk = { x: 0, y: 0 }; this.W = 1; this.H = 1;
    this.overlay = null;               // null | 'pipes' | 'power' | 'value' | 'threat' | 'edu' | 'leisure'
    this.ghost = null;                 // { tiles: [[x,z]], ok, color, sprite? {id, params, x, z, w, d} }
    this.hover = null;
  }
  /** world (optional) = the generated world, for naming the neighbours at the region's edge. */
  setRegion(r, world = null) { this.r = r; this.N = r.size; this._colors = null; this.world = world; this._edgeKey = null; }

  // ---------------- projection ----------------
  h(x, z) { const N = this.N, tx = Math.max(0, Math.min(N - 1, Math.floor(x))), tz = Math.max(0, Math.min(N - 1, Math.floor(z))); return this.r.ter.height[tz * N + tx] * LEVEL; }
  P = (x, z, y = 0) => {
    const { sx, sy } = toScreen(x - this.cam.x, z - this.cam.z, y, this.cam.rot);
    return { sx: this.W / 2 + sx * this.cam.zoom + this.shk.x, sy: this.H / 2 + sy * this.cam.zoom + this.shk.y };
  };
  /** Ground point at (x, z) with the terrain's height added (for things standing on the ground). */
  G = (x, z, y = 0) => this.P(x, z, this.h(x, z) + y);
  /** The tile under a screen point, topmost first (heights count). */
  pick(px, py) {
    for (let lv = MAX; lv >= 0; lv--) {
      const [x, z] = toWorld((px - this.W / 2 - this.shk.x) / this.cam.zoom, (py - this.H / 2 - this.shk.y) / this.cam.zoom + lv * LEVEL * 39.19, this.cam.rot);
      const tx = Math.floor(x + this.cam.x), tz = Math.floor(z + this.cam.z);
      if (tx < 0 || tz < 0 || tx >= this.N || tz >= this.N) continue;
      if (this.r.ter.height[tz * this.N + tx] === lv) return [tx, tz, x + this.cam.x, z + this.cam.z];
    }
    const [x, z] = toWorld((px - this.W / 2) / this.cam.zoom, (py - this.H / 2) / this.cam.zoom, this.cam.rot);
    const tx = Math.floor(x + this.cam.x), tz = Math.floor(z + this.cam.z);
    return tx >= 0 && tz >= 0 && tx < this.N && tz < this.N ? [tx, tz, x + this.cam.x, z + this.cam.z] : null;
  }
  /** World point (continuous) under the screen point at ground height — for aiming strikes. */
  pickPoint(px, py) { const p = this.pick(px, py); return p ? [p[2], p[3]] : null; }

  // ---------------- drawing ----------------
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), W = this.cv.clientWidth, H = this.cv.clientHeight;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    this.W = W; this.H = H; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  /** Visible tiles in painter's order (back to front at this turn). */
  *visible(pad = 3) {
    const N = this.N, rot = this.cam.rot, z = this.cam.zoom;
    const corners = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]].flatMap(([px, py]) => [0, MAX * LEVEL * 39.19 + 300].map(dy => toWorld((px - this.W / 2) / z, (py + dy - this.H / 2) / z, rot)));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, zz] of corners) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, zz); z1 = Math.max(z1, zz); }
    x0 = Math.max(0, Math.floor(x0 + this.cam.x) - pad); x1 = Math.min(N - 1, Math.ceil(x1 + this.cam.x) + pad);
    z0 = Math.max(0, Math.floor(z0 + this.cam.z) - pad); z1 = Math.min(N - 1, Math.ceil(z1 + this.cam.z) + pad);
    // walk in turned space so drawing order is back → front
    const inv = (4 - rot) & 3;
    const cs = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([a, b]) => turnXZ(a, b, rot));
    const rx0 = Math.min(...cs.map(c => c[0])), rx1 = Math.max(...cs.map(c => c[0])), rz0 = Math.min(...cs.map(c => c[1])), rz1 = Math.max(...cs.map(c => c[1]));
    for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
      const [x, zz] = turnXZ(rx, rz, inv);
      if (x < x0 || x > x1 || zz < z0 || zz > z1) continue;
      yield [x, zz];
    }
  }
  depth(x, z) { const [rx, rz] = turnXZ(x, z, this.cam.rot); return rx + rz; }

  draw({ night = 0, fx = null, weather = null, horde = null, defence = null, alpha = 1, shots = true, vehicles = [], strikeDraw = null, pods = [], dt = 0 }) {
    this.resize();
    const ctx = this.ctx, W = this.W, H = this.H, r = this.r, N = this.N, zoom = this.cam.zoom, rot = this.cam.rot;
    this.shk = fx ? fx.shakeOffset(14) : { x: 0, y: 0 };
    // sky
    const rain = weather?.raining ? 0.35 : 0;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(mix('#87b2d6', '#4a5866', rain), '#060915', night)); sky.addColorStop(1, mix(mix('#cfe0ea', '#7a8792', rain), '#141a2e', night));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night > 0.4) this._stars(ctx, night);
    weather?.drawSky(ctx, W, H, night);

    // ---- ground ----
    const t = performance.now() / 1000, hw = TILE_W * zoom / 2 + 0.5, hh = TILE_H * zoom / 2 + 0.5;
    const nightK = night * 0.82;
    const items = [];
    const lp = LEVEL * 39.19 * zoom;
    for (const [x, z] of this.visible()) {
      const i = z * N + x, lv = r.ter.height[i], wat = r.ter.water[i];
      const c = this.P(x + 0.5, z + 0.5, lv * LEVEL);
      if (c.sx < -hw * 2 || c.sx > W + hw * 2 || c.sy < -hh * 4 || c.sy > H + hh * 2 + lv * lp) continue;
      // cliff faces toward the camera where the neighbour in front is lower
      const [fx1, fz1] = frontNeighbours(rot);
      for (const [dx, dz, side] of [[fx1[0], fx1[1], 0], [fz1[0], fz1[1], 1]]) {
        const nx = x + dx, nz = z + dz; const nlv = nx >= 0 && nz >= 0 && nx < N && nz < N ? r.ter.height[nz * N + nx] : 0;
        if (nlv < lv) { const drop = (lv - nlv) * lp; ctx.fillStyle = mix(side ? '#5a4c40' : '#4a3e35', '#0d1018', nightK); cliff(ctx, c.sx, c.sy, hw, hh, drop, side); }
      }
      let col;
      if (wat) col = mix(wat === 2 ? '#24618f' : '#2f7fb0', wat === 2 ? '#2d74a8' : '#3b92c6', 0.5 + 0.5 * Math.sin(t * 1.2 + x * 0.7 + z * 1.1));
      else {
        const B = BIOMES[BIDS[r.ter.biome[i]]] || BIOMES.verdant;
        const n = ((x * 73856093) ^ (z * 19349663)) >>> 0; col = (n % 7 < 2) ? B.alt : B.ground;   // scattered, not striped
        col = shade(col, (lv - 2) * 0.035);
        if (r.ter.deposit[i]) col = mix(col, DEP_COLOR[r.ter.deposit[i]], ((x * 31 + z * 17) % 3) * 0.08 + 0.18);
      }
      const road = r.tiles.road[i];
      if (road) col = road === 3 ? '#3a3e45' : road === 2 ? '#454a52' : '#50565e';
      diamond(ctx, c.sx, c.sy, hw, hh, mix(col, wat ? '#0b1730' : '#141a26', nightK));
      if (road) this._roadMarks(ctx, x, z, c, hw, hh, road, night, wat);
      const zn = r.tiles.zone[i]; if (zn && r.tiles.lot[i] < 0) { diamondFill(ctx, c.sx, c.sy, hw * 0.86, hh * 0.86, ZONE_TINT[zn]); }
      if (this.overlay) this._overlayTile(ctx, i, c, hw, hh);
      if (r.tiles.transit[i]) items.push({ d: this.depth(x + 0.5, z + 0.5) + 0.05, draw: () => this._track(ctx, x, z, r.tiles.transit[i], night) });
      if (r.ter.flora[i] && !road && r.tiles.lot[i] < 0 && !r.tiles.wall[i]) items.push({ d: this.depth(x + 0.5, z + 0.5) - 0.01, draw: () => this._plant(ctx, x, z, r.ter.flora[i], night) });
    }
    // power lines: pylons every few tiles, wires between them (networks.js pylonPlan)
    const pl = pylonPlan(r);
    for (const p of pl.poles) { if (!this._near(p.x + 0.5, p.z + 0.5)) continue; items.push({ d: this.depth(p.x + 0.5, p.z + 0.5), draw: () => this._pole(ctx, p, night) }); }
    for (const [a, b, axis] of pl.spans) {
      const A = pl.poles[a], Bp = pl.poles[b];
      if (!this._near((A.x + Bp.x) / 2 + 0.5, (A.z + Bp.z) / 2 + 0.5, Math.abs(A.x - Bp.x) + Math.abs(A.z - Bp.z) + 4)) continue;
      items.push({ d: (this.depth(A.x + 0.5, A.z + 0.5) + this.depth(Bp.x + 0.5, Bp.z + 0.5)) / 2 + 0.01, draw: () => this._wire(ctx, A, Bp, axis, night) });
    }
    // nests
    for (const n of r.nests) { if (!this._near(n.x, n.z)) continue; items.push({ d: this.depth(n.x + 0.5, n.z + 0.5), draw: () => this._nest(ctx, n, night, t) }); }
    fx?.drawGround(ctx, this.G, zoom);

    // ---- things ----
    for (let li = 0; li < r.lots.length; li++) {
      const l = r.lots[li]; if (!this._near(l.x + l.w / 2, l.z + l.d / 2, Math.max(l.w, l.d) + 6)) continue;
      let best = -Infinity; for (const [ox, oz] of [[0, 0], [l.w, 0], [0, l.d], [l.w, l.d]]) best = Math.max(best, this.depth(l.x + ox, l.z + oz));
      items.push({ d: best - 0.5, draw: () => this._lot(ctx, l, night) });
    }
    this._walls(items, night);
    if (defence) for (const tu of defence.turrets) { if (!this._near(tu.x, tu.z)) continue; items.push({ d: this.depth(tu.x + 0.5, tu.z + 0.5), draw: () => this._turret(ctx, tu, night) }); }
    if (horde) for (const c of horde.list) {
      const x = lerp(c.px ?? c.x, c.x, alpha), z = lerp(c.pz ?? c.z, c.z, alpha); if (!this._near(x, z)) continue;
      items.push({ d: this.depth(x, z), draw: () => this._creature(ctx, c, x, z, night) });
    }
    for (const v of vehicles) { if (!this._near(v.x, v.z)) continue; items.push({ d: this.depth(v.x, v.z), draw: () => this._vehicle(ctx, v, night) }); }
    for (const p of pods) items.push({ d: this.depth(p.x, p.z) + 0.2, draw: () => this._pod(ctx, p) });
    if (this.ghost?.sprite) { const g = this.ghost.sprite; items.push({ d: this.depth(g.x + g.w, g.z + g.d) - 0.4, draw: () => this._ghostSprite(ctx, g) }); }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();

    if (shots && defence) this._shots(ctx, defence, alpha, zoom);
    fx?.drawSolid(ctx, this.G, zoom);
    fx?.drawLights(ctx, this.G, zoom);
    strikeDraw?.(ctx);
    this._edges(ctx, night);
    if (this.ghost) this._ghostTiles(ctx, hw, hh);
    if (this.hover && !this.ghost) { const [x, z] = this.hover; const c = this.G(x + 0.5, z + 0.5); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; diamondStroke(ctx, c.sx, c.sy, hw, hh); }
    weather?.drawOver(ctx, W, H, night);
    fx?.drawFlash(ctx, W, H);
  }
  /**
   * A small overhead picture of the whole region for the world map (SimCity 4's region view): the same iso angle as the
   * world map (turn 0), daylight, the ground as one picture of tile colours, then every building, wall and pylon from
   * the pictures already baked (a stand-in block where one isn't). Transparent outside the region's diamond.
   * → { url (WebP data URL), w, h, top } — the diamond's top corner sits at (w / 2, top) and it is w wide.
   */
  snapshot({ width = 288, quality = 0.7 } = {}) {
    const r = this.r, N = this.N, zoom = width / (N * TILE_W), top = Math.ceil(width * 0.1), H = Math.ceil(top + width / 2 + 2);
    const cv = document.createElement('canvas'); cv.width = width; cv.height = H;
    const ctx = cv.getContext('2d');
    // the ground: one pixel per tile, sheared into the diamond
    const tc = document.createElement('canvas'); tc.width = N; tc.height = N;
    const tg = tc.getContext('2d'), img = tg.createImageData(N, N), d = img.data;
    const ZC = { 1: [86, 214, 120], 2: [80, 160, 255], 3: [255, 190, 70] };
    for (let i = 0; i < N * N; i++) {
      const x = i % N, z = (i / N) | 0, lv = r.ter.height[i], wat = r.ter.water[i];
      let c;
      if (wat) c = wat === 2 ? [36, 97, 143] : [47, 127, 176];
      else { const B = BIOMES[BIDS[r.ter.biome[i]]] || BIOMES.verdant; c = rgbOf(shade(((((x * 73856093) ^ (z * 19349663)) >>> 0) % 7 < 2) ? B.alt : B.ground, (lv - 2) * 0.05)); }
      if (r.tiles.road[i]) c = r.tiles.road[i] === 3 ? [58, 62, 69] : [72, 77, 85];
      else if (r.tiles.zone[i] && r.tiles.lot[i] < 0) c = c.map((v, k) => v * 0.6 + ZC[r.tiles.zone[i]][k] * 0.4);
      if (r.tiles.lot[i] >= 0) c = c.map(v => v * 0.55 + 40);
      if (r.tiles.wall[i]) c = [150, 158, 170];
      if (r.tiles.transit?.[i]) c = [63, 200, 220];
      const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    const ox = width / 2, oy = top, a = TILE_W / 2 * zoom, b = TILE_H / 2 * zoom;   // tile (x, z) → (ox + (x − z)a, oy + (x + z)b)
    ctx.save(); ctx.setTransform(a, b, -a, b, ox, oy); ctx.imageSmoothingEnabled = false; ctx.drawImage(tc, 0, 0); ctx.restore();
    // things standing on it, back to front, from the baked pictures (turn 0)
    const at = (x, z) => ({ sx: ox + (x - z) * a, sy: oy + (x + z) * b });
    const things = r.lots.map(l => ({ d: l.x + l.z + l.w + l.d, l })).sort((p, q) => p.d - q.d);
    for (const { l } of things) {
      const g = at(l.x + l.w / 2, l.z + l.d / 2), pair = this.sprites.building(l.recipe, spriteParams(l), (l.face || 0) & 3);
      if (pair && !pair.failed) { composite(ctx, pair, g.sx, g.sy, 0, zoom / this.sprites.scale); continue; }
      // stand-in: a small block as tall as its storeys
      const hgt = (0.25 + (l.params?.floors || 1) * 0.22) * PX_PER_HEIGHT * zoom, w = (l.w + l.d) / 2 * a * 0.8;
      ctx.fillStyle = '#9aa6b6'; ctx.fillRect(g.sx - w / 2, g.sy - hgt, w, hgt); ctx.fillStyle = '#c8d2de'; ctx.fillRect(g.sx - w / 2, g.sy - hgt, w, Math.max(1, hgt * 0.15));
    }
    let url = null; try { url = cv.toDataURL('image/webp', quality); if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/png'); } catch { /* tainted or unsupported */ }
    return url ? { url, w: width, h: H, top } : null;
  }
  _near(x, z, pad = 4) { const p = this.P(x, z, 0); const m = pad * TILE_W * this.cam.zoom; return p.sx > -m && p.sx < this.W + m && p.sy > -m * 3 && p.sy < this.H + m; }

  _roadMarks(ctx, x, z, c, hw, hh, level, night, wat) {
    const r = this.r, N = this.N, con = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => { const nx = x + dx, nz = z + dz; return nx >= 0 && nz >= 0 && nx < N && nz < N && r.tiles.road[nz * N + nx] > 0; });
    const along = (con[0] || con[1]) && !(con[2] || con[3]) ? 'x' : (con[2] || con[3]) && !(con[0] || con[1]) ? 'z' : null;
    const lvl = this.r.ter.height[z * N + x] * LEVEL;
    ctx.save();
    if (wat) {   // bridge deck rails
      ctx.strokeStyle = mix('#9aa2ac', '#2a3040', night * 0.7); ctx.lineWidth = Math.max(1, 2 * this.cam.zoom);
      const a = along === 'z' ? [[x + 0.08, z], [x + 0.08, z + 1], [x + 0.92, z], [x + 0.92, z + 1]] : [[x, z + 0.08], [x + 1, z + 0.08], [x, z + 0.92], [x + 1, z + 0.92]];
      for (let k = 0; k < 4; k += 2) { const p = this.P(a[k][0], a[k][1], lvl + 0.08), q = this.P(a[k + 1][0], a[k + 1][1], lvl + 0.08); ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke(); }
    }
    if (along) {
      const mid = along === 'x' ? [[x, z + 0.5], [x + 1, z + 0.5]] : [[x + 0.5, z], [x + 0.5, z + 1]];
      const p = this.P(mid[0][0], mid[0][1], lvl), q = this.P(mid[1][0], mid[1][1], lvl);
      ctx.strokeStyle = level === 3 ? `rgba(255,200,80,${0.75 - night * 0.3})` : `rgba(235,235,225,${0.55 - night * 0.25})`;
      ctx.lineWidth = Math.max(1, (level === 1 ? 1 : 1.6) * this.cam.zoom); ctx.setLineDash(level === 1 ? [4 * this.cam.zoom, 5 * this.cam.zoom] : []);
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke(); ctx.setLineDash([]);
    }
    // street lights glow at night
    if (night > 0.4 && (x * 3 + z) % 4 === 0) { const g = this.P(x + 0.12, z + 0.12, lvl); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.8, (night - 0.4) * 1.4); const s = 7 * this.cam.zoom; const gr = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, s); gr.addColorStop(0, 'rgba(255,214,140,0.9)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  _overlayTile(ctx, i, c, hw, hh) {
    const r = this.r, o = this.overlay; let col = null;
    if (o === 'pipes') { if (r.tiles.pipe[i]) col = 'rgba(70,170,255,0.9)'; else if (r.waterNet?.reach?.[i]) col = 'rgba(70,170,255,0.25)'; else col = 'rgba(0,0,0,0.35)'; }
    else if (o === 'power') {
      // like the pipes: the line itself bright, everything within reach of a live grid softly lit, the rest dimmed
      const short = r.power?.share < 1, reach = r.power?.reach;
      if (r.tiles.power[i]) col = `rgba(255,220,80,${short ? 0.6 : 0.85})`;
      else if (reach?.[i]) col = short ? 'rgba(255,160,60,0.24)' : 'rgba(255,220,80,0.24)';
      else col = 'rgba(0,0,0,0.35)';
    }
    else if (o === 'value') { const v = r.tiles.value[i]; col = `hsla(${Math.round(v * 120)}, 80%, 50%, 0.5)`; }
    else if (o === 'edu') { const v = r.tiles.edu[i]; if (v > 0.02) col = `rgba(120,160,255,${Math.min(0.7, v)})`; }
    else if (o === 'leisure') { const v = r.tiles.leisure[i]; if (v > 0.02) col = `rgba(120,255,160,${Math.min(0.7, v)})`; }
    else if (o === 'traffic') { const v = r.tiles.traffic[i]; if (r.tiles.road[i]) col = `hsla(${Math.round(Math.max(0, 1 - v) * 120)}, 85%, 50%, 0.75)`; }
    if (col) diamondFill(ctx, c.sx, c.sy, TILE_W * this.cam.zoom / 2, TILE_H * this.cam.zoom / 2, col);
  }
  _lot(ctx, l, night) {
    const cx = l.x + l.w / 2, cz = l.z + l.d / 2, base = this.r.ter.height[l.z * this.N + l.x] * LEVEL;
    const pair = this.sprites.building(l.recipe, spriteParams(l), (this.cam.rot + (l.face || 0)) & 3);   // the lot's own turn (its front faces its road) + the view's
    const g = this.P(cx, cz, base);
    if (!pair || pair.failed) { const top = this.P(cx, cz, base + 0.2 + (l.params.floors || 1) * 0.12); ctx.fillStyle = mix('#7f8a96', '#1a2030', night * 0.7); ctx.fillRect(g.sx - 14 * this.cam.zoom * l.w, top.sy, 28 * this.cam.zoom * l.w, g.sy - top.sy); return; }
    composite(ctx, pair, g.sx, g.sy, night, this.cam.zoom / this.sprites.scale);
    if ((l.powered ?? 1) <= 0 && (l.power ?? 0) < 0) this._badge(ctx, g, 'power');
    else if (l.kind === 'zoned' && l.tier >= 2 && !l.wet) this._badge(ctx, g, 'water');
  }
  _badge(ctx, g, kind) {
    const z = this.cam.zoom, s = 9 * z; if (z < 0.6) return;
    ctx.save(); ctx.fillStyle = kind === 'power' ? '#ffcf3a' : '#4ab0ff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.sx, g.sy - 34 * z, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath();
    if (kind === 'power') { ctx.moveTo(g.sx + 1 * z, g.sy - 41 * z); ctx.lineTo(g.sx - 3 * z, g.sy - 33 * z); ctx.lineTo(g.sx, g.sy - 33 * z); ctx.lineTo(g.sx - 1 * z, g.sy - 27 * z); ctx.lineTo(g.sx + 3 * z, g.sy - 35 * z); ctx.lineTo(g.sx, g.sy - 35 * z); }
    else { ctx.moveTo(g.sx, g.sy - 41 * z); ctx.quadraticCurveTo(g.sx + 5 * z, g.sy - 32 * z, g.sx, g.sy - 29 * z); ctx.quadraticCurveTo(g.sx - 5 * z, g.sy - 32 * z, g.sx, g.sy - 41 * z); }
    ctx.fill(); ctx.restore();
  }
  _walls(items, night) {
    const r = this.r, N = this.N;
    // walls are few: walk them all (cheap), cull by screen
    // rescan a few times a second (cheap) — other code clears r.wallsChanged, so the renderer keeps its own clock
    if (!r._wallList || (this._wallScan = (this._wallScan || 0) + 1) % 10 === 0) { r._wallList = []; for (let i = 0; i < N * N; i++) if (r.tiles.wall[i]) r._wallList.push(i); }
    for (const i of r._wallList) {
      const x = i % N, z = (i / N) | 0; if (!r.tiles.wall[i] || !this._near(x + 0.5, z + 0.5)) continue;
      items.push({ d: this.depth(x + 0.5, z + 0.5), draw: () => this._wall(this.ctx, x, z, night) });
    }
  }
  _wall(ctx, x, z, night) {
    const r = this.r, N = this.N, i = z * N + x, v = r.tiles.wall[i], gate = v === 9, tier = gate ? 2 : v;
    const max = [0, 220, 520, 1100][tier] || 300, hp = r.tiles.wallHp[i], damage = hp > max * 0.66 ? 0 : hp > max * 0.33 ? 1 : 2;
    const at = (dx, dz) => { const nx = x + dx, nz = z + dz; return nx >= 0 && nz >= 0 && nx < N && nz < N && r.tiles.wall[nz * N + nx] > 0; };
    const ax = at(1, 0) || at(-1, 0), az = at(0, 1) || at(0, -1);
    let id = 'wall-straight', params = { tier, damage }, rot = this.cam.rot;
    if (gate) { id = 'wall-gate'; params = { tier: 2, open: 0 }; if (az && !ax) rot = (rot + 1) & 3; }
    else if (ax && az) { id = 'wall-post'; params = { tier, arms: (at(1, 0) ? 1 : 0) | (at(0, 1) ? 2 : 0) | (at(-1, 0) ? 4 : 0) | (at(0, -1) ? 8 : 0) }; }
    else if (az) rot = (rot + 1) & 3;
    else if (!ax && !az) { id = 'wall-post'; params = { tier, arms: 0 }; }
    const pair = this.sprites.building(id, params, rot), g = this.G(x + 0.5, z + 0.5);
    if (!pair || pair.failed) { ctx.fillStyle = '#7a8290'; ctx.fillRect(g.sx - 12 * this.cam.zoom, g.sy - 18 * this.cam.zoom, 24 * this.cam.zoom, 18 * this.cam.zoom); return; }
    composite(ctx, pair, g.sx, g.sy, night, this.cam.zoom / this.sprites.scale);
  }
  _turret(ctx, tu, night) {
    const kind = TURRETS[tu.kind], rec = this.sprites.recipe(kind.recipe), g = this.G(tu.x + 0.5, tu.z + 0.5);
    if (!rec) { ctx.fillStyle = '#5ab0ff'; ctx.fillRect(g.sx - 8, g.sy - 16, 16, 16); return; }
    const dir = dirOfHeading(tu.heading ?? 0, rec.dirs || 16, this.cam.rot);
    const pair = this.sprites.facing(kind.recipe, { tier: tu.tier || 1 }, dir, rec.dirs || 16);
    if (pair && !pair.failed) composite(ctx, pair, g.sx, g.sy + (tu.recoil || 0) * 1.5 * this.cam.zoom, night, this.cam.zoom / this.sprites.scale);
    if ((tu.powered ?? 1) <= 0) this._badge(ctx, g, 'power');
  }
  _creature(ctx, c, x, z, night) {
    const k = KINDS[c.kind], rec = this.sprites.recipe(k.recipe), g = this.G(x, z, c.lift || 0);
    const anim = c.state === 'attack' ? 'attack' : 'walk';
    if (!rec?.anims?.[anim]) { const rr = k.radius * 32 * this.cam.zoom; ctx.fillStyle = k.colors[0]; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - rr * 0.5, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.fill(); return; }
    const a = rec.anims[anim], dir = dirOfHeading(c.heading, rec.dirs || 8, this.cam.rot), frame = Math.floor(c.t * (a.fps || 10)) % a.frames;
    const pair = this.sprites.facing(k.recipe, {}, dir, rec.dirs || 8, anim, frame) || this.sprites.facing(k.recipe, {}, dir, rec.dirs || 8, 'walk', 0);
    if (!pair || pair.failed) { const rr = k.radius * 32 * this.cam.zoom; ctx.fillStyle = k.colors[0]; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - rr * 0.5, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.fill(); return; }
    composite(ctx, pair, g.sx, g.sy, night, this.cam.zoom / this.sprites.scale);
    if (c.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; composite(ctx, pair, g.sx, g.sy, 0, this.cam.zoom / this.sprites.scale); ctx.restore(); }
  }
  _vehicle(ctx, v, night) {
    const rec = this.sprites.recipe(v.id); if (!rec) return;
    // ground directions, not screen directions: a road runs ~26.6° off the screen's horizontal, so only a heading baked
    // in the grid's own steps lies along it (owner report 2026-11-16: cars drifting at an angle)
    const n = rec.dirs || 8, dir = groundDirOfHeading(v.heading, n, this.cam.rot), frame = Math.floor(v.t * 6) % (rec.anims?.drive?.frames || 1);
    const pair = this.sprites.ground(v.id, { seed: v.seed }, dir, n, rec.anims?.drive ? 'drive' : null, frame);
    if (pair && !pair.failed) { const g = this.G(v.x, v.z); composite(ctx, pair, g.sx, g.sy, night, this.cam.zoom / this.sprites.scale); }
  }
  _pod(ctx, p) {
    // a landing pod: a glowing capsule falling from above with a thruster flame, then a dust puff (drawn by fx)
    if (p.age < 0) return;   // not launched yet (pods drop one after another)
    const g = this.G(p.x, p.z), k = Math.max(0, Math.min(1, p.age / p.fall)), y = (1 - k * k) * this.H * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(g.sx, g.sy - y, 0, g.sx, g.sy - y, 22 * this.cam.zoom); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#9fe8ff'); gr.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.sx, g.sy - y, 22 * this.cam.zoom, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#d8dee6'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - y - 4 * this.cam.zoom, 4 * this.cam.zoom, 7 * this.cam.zoom, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.3 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 7 * this.cam.zoom * k, 3.5 * this.cam.zoom * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  _shots(ctx, defence, a, zoom) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const b of defence.shots) {
      const x = lerp(b.ppx ?? b.x, b.x, a), z = lerp(b.ppz ?? b.z, b.z, a), y = this.h(x, z) + b.y * 0.6;
      const p = this.P(x, z, y), q = this.P(x - b.vx * 0.045, z - b.vz * 0.045, y);
      ctx.strokeStyle = 'rgba(120,230,255,0.55)'; ctx.lineWidth = 5 * zoom; ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
      ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2 * zoom; ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
    }
    for (const s of defence.shells) {
      const pos = Defence.shellPos(s), base = this.h(pos.x, pos.z), p = this.P(pos.x, pos.z, base + pos.y), g = this.P(pos.x, pos.z, base);
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; const sh = Math.max(1, (4 - pos.y) * 1.6 * zoom); ctx.beginPath(); ctx.ellipse(g.sx, g.sy, sh, sh / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (pos.k > 0.7) { ctx.strokeStyle = `rgba(255,80,60,${(pos.k - 0.7) * 2})`; ctx.lineWidth = 1.5; const e = this.G(s.tx, s.tz); const rr = s.radius * 32 * zoom; ctx.beginPath(); ctx.ellipse(e.sx, e.sy, rr, rr / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#ffd27a'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(p.sx, p.sy, 7 * zoom, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.5 * zoom, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  /** Elevated track: a pillar at each tile, beams to every neighbouring tile of the same line. */
  _track(ctx, x, z, level, night) {
    const r = this.r, N = this.N, zm = this.cam.zoom, deck = 0.62, base = r.ter.height[z * N + x] * LEVEL;
    const g = this.P(x + 0.5, z + 0.5, base), top = this.P(x + 0.5, z + 0.5, base + deck);
    ctx.strokeStyle = mix('#8f98a4', '#2a303c', night * 0.7); ctx.lineWidth = Math.max(2, 4 * zm);
    ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N || r.tiles.transit[nz * N + nx] !== level) continue;
      const nb = r.ter.height[nz * N + nx] * LEVEL, b = this.P(x + 0.5 + dx * 0.5, z + 0.5 + dz * 0.5, (base + nb) / 2 + deck);
      ctx.strokeStyle = mix('#b8c0cb', '#353c4a', night * 0.7); ctx.lineWidth = Math.max(3, 7 * zm);
      ctx.beginPath(); ctx.moveTo(top.sx, top.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = night > 0.3 ? 'lighter' : 'source-over';
      ctx.strokeStyle = level === 2 ? `rgba(183,125,255,${0.5 + night * 0.4})` : `rgba(63,240,255,${0.45 + night * 0.45})`; ctx.lineWidth = Math.max(1, 1.6 * zm);
      ctx.beginPath(); ctx.moveTo(top.sx, top.sy - 2 * zm); ctx.lineTo(b.sx, b.sy - 2 * zm); ctx.stroke(); ctx.restore();
    }
  }
  /** A pylon (City Kit 'pwr-pylon'): its crossarm runs across the line, so a line along z uses the next view turn. */
  _pole(ctx, p, night) {
    const rot = p.axis === 'z' ? (this.cam.rot + 1) & 3 : this.cam.rot, g = this.G(p.x + 0.5, p.z + 0.5);
    const pair = this.sprites.building('pwr-pylon', { cross: p.corner ? 1 : 0 }, rot);
    if (pair && !pair.failed) { composite(ctx, pair, g.sx, g.sy, night, this.cam.zoom / this.sprites.scale); return; }
    const t = this.G(p.x + 0.5, p.z + 0.5, PYLON.TOP_Y), zm = this.cam.zoom;   // until the picture is baked
    ctx.strokeStyle = mix('#59606c', '#2a2f3a', night * 0.6); ctx.lineWidth = Math.max(1, 2 * zm);
    ctx.beginPath(); ctx.moveTo(g.sx - 5 * zm, g.sy); ctx.lineTo(t.sx, t.sy); ctx.lineTo(g.sx + 5 * zm, g.sy); ctx.stroke();
  }
  /** The wires between two pylons: two conductors from the arm tips and a thinner earth wire from the peaks, each
   *  sagging in the middle; at night they carry a faint cyan glow. */
  _wire(ctx, a, b, axis, night) {
    const A = PYLON.ARM_HALF, Y = PYLON.ARM_Y - 0.1, zm = this.cam.zoom;
    const offs = axis === 'x' ? [[0, -A, Y], [0, A, Y], [0, 0, PYLON.TOP_Y]] : [[-A, 0, Y], [A, 0, Y], [0, 0, PYLON.TOP_Y]];
    const len = Math.abs(a.x - b.x) + Math.abs(a.z - b.z), sag = (0.06 + 0.035 * len) * PX_PER_HEIGHT * zm;
    ctx.save(); ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const [dx, dz, y] = offs[k];
      const p = this.G(a.x + 0.5 + dx, a.z + 0.5 + dz, y), q = this.G(b.x + 0.5 + dx, b.z + 0.5 + dz, y);
      const cx = (p.sx + q.sx) / 2, cy = (p.sy + q.sy) / 2 + sag * (k === 2 ? 1.4 : 2);
      const path = () => { ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.quadraticCurveTo(cx, cy, q.sx, q.sy); };
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.strokeStyle = mix('#232a36', '#0c1018', night * 0.5); ctx.lineWidth = Math.max(0.7, (k === 2 ? 0.7 : 1.1) * zm); path(); ctx.stroke();
      if (night > 0.3 && k < 2) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (night - 0.3) * 0.55; ctx.strokeStyle = 'rgba(95,242,255,0.5)'; ctx.lineWidth = Math.max(1, 1.8 * zm); path(); ctx.stroke(); }
    }
    ctx.restore();
  }
  /** Roads and transit lines that reach the region's edge: an arrow on the ground and a plate naming the neighbour
   *  ("To Ravel Basin") — where an interstate link to that region leaves the map. */
  _edges(ctx, night) {
    // a cheap scan of the 4 edges, a couple of times a second (roads change rarely)
    if (!this._edgeList || this._edgeKey === null || (this._edgeT = (this._edgeT || 0) + 1) % 30 === 0) { this._edgeKey = 1; this._edgeList = this._scanEdges(); }
    if (!this._edgeList.length) return;
    const zm = this.cam.zoom, t = performance.now() / 1000;
    ctx.save();
    for (const e of this._edgeList) {
      for (const [x, z] of e.tiles) {
        if (!this._near(x + 0.5, z + 0.5, 2)) continue;
        const [ox, oz] = e.out, c = (dx, dz) => this.G(x + 0.5 + dx, z + 0.5 + dz, 0.02);
        const tip = c(ox * 0.48, oz * 0.48), l = c(-ox * 0.05 - oz * 0.3, -oz * 0.05 - ox * 0.3), rr = c(-ox * 0.05 + oz * 0.3, -oz * 0.05 + ox * 0.3), back = c(ox * 0.12, oz * 0.12);
        ctx.globalCompositeOperation = night > 0.3 ? 'lighter' : 'source-over';
        ctx.fillStyle = `rgba(255,176,46,${0.55 + 0.25 * Math.sin(t * 3 + x + z)})`;
        ctx.beginPath(); ctx.moveTo(tip.sx, tip.sy); ctx.lineTo(l.sx, l.sy); ctx.lineTo(back.sx, back.sy); ctx.lineTo(rr.sx, rr.sy); ctx.closePath(); ctx.fill();
      }
      const m = e.tiles[e.tiles.length >> 1]; if (!this._near(m[0] + 0.5, m[1] + 0.5, 3) || zm < 0.45) continue;
      const g = this.G(m[0] + 0.5 - e.out[0] * 1.6, m[1] + 0.5 - e.out[1] * 1.6, 0.4);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'; const text = e.name ? `To ${e.name}` : 'Out of the region', w = ctx.measureText(text).width + 18;
      ctx.fillStyle = 'rgba(9,12,26,0.85)'; ctx.strokeStyle = 'rgba(255,176,46,0.75)'; ctx.lineWidth = 1;
      rrect(ctx, g.sx - w / 2, g.sy - 11, w, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd38a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, g.sx, g.sy + 0.5);
    }
    ctx.restore();
  }
  /** Edge road/transit tiles grouped by side and neighbour: [{ out: [dx, dz], name, tiles: [[x, z]] }]. */
  _scanEdges() {
    const r = this.r, N = this.N, wr = this.world?.regions?.[r.id], groups = new Map();
    const across = (x, z, side) => {
      if (!wr || !this.world) return null;
      const o = side === 'w' ? regionAt(this.world, wr.cx - 1, wr.cz + Math.floor(z / CELL)) : side === 'e' ? regionAt(this.world, wr.cx + wr.span, wr.cz + Math.floor(z / CELL))
        : side === 'n' ? regionAt(this.world, wr.cx + Math.floor(x / CELL), wr.cz - 1) : regionAt(this.world, wr.cx + Math.floor(x / CELL), wr.cz + wr.span);
      return o && o.id !== wr.id ? o : null;
    };
    for (let k = 0; k < N; k++) for (const [x, z, side, out] of [[0, k, 'w', [-1, 0]], [N - 1, k, 'e', [1, 0]], [k, 0, 'n', [0, -1]], [k, N - 1, 's', [0, 1]]]) {
      const i = z * N + x; if (!r.tiles.road[i] && !r.tiles.transit?.[i]) continue;
      const o = across(x, z, side), name = o ? (o.city?.name || o.name) : null, key = `${side}|${o?.id ?? '-'}`;
      if (!groups.has(key)) groups.set(key, { out, name, tiles: [] });
      groups.get(key).tiles.push([x, z]);
    }
    return [...groups.values()];
  }
  _plant(ctx, x, z, kind, night) {
    // alien plants: glow a little at night. Shapes by kind: crystal spikes, bulb stalks, fan fronds
    const B = BIOMES[BIDS[this.r.ter.biome[z * this.N + x]]] || BIOMES.verdant;
    const seed = (x * 73856093) ^ (z * 19349663), ox = ((seed & 255) / 255 - 0.5) * 0.5, oz = (((seed >> 8) & 255) / 255 - 0.5) * 0.5;
    const g = this.G(x + 0.5 + ox, z + 0.5 + oz), zm = this.cam.zoom, hgt = (10 + (seed & 7)) * zm;
    const body = mix(shade(B.dark, 0.15), '#0a0e18', night * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(g.sx + 3 * zm, g.sy, 6 * zm, 3 * zm, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    if (kind === 1) { ctx.beginPath(); ctx.moveTo(g.sx - 4 * zm, g.sy); ctx.lineTo(g.sx - 1 * zm, g.sy - hgt); ctx.lineTo(g.sx + 1 * zm, g.sy - hgt * 0.6); ctx.lineTo(g.sx + 3 * zm, g.sy - hgt * 0.9); ctx.lineTo(g.sx + 5 * zm, g.sy); ctx.fill(); }
    else if (kind === 2) { ctx.fillRect(g.sx - 1 * zm, g.sy - hgt, 2 * zm, hgt); ctx.beginPath(); ctx.arc(g.sx, g.sy - hgt, 4 * zm, 0, Math.PI * 2); ctx.fill(); }
    else { for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.quadraticCurveTo(g.sx + k * 4 * zm, g.sy - hgt * 0.6, g.sx + k * 6 * zm, g.sy - hgt * 0.8); ctx.lineWidth = 2 * zm; ctx.strokeStyle = body; ctx.stroke(); } }
    if (night > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (night - 0.3) * 0.9; const glow = kind === 1 ? '#7df0ff' : kind === 2 ? '#b77dff' : '#7dffb0'; const gy = g.sy - hgt * (kind === 2 ? 1 : 0.7); const gr = ctx.createRadialGradient(g.sx, gy, 0, g.sx, gy, 8 * zm); gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(g.sx - 8 * zm, gy - 8 * zm, 16 * zm, 16 * zm); ctx.restore(); }
  }
  _nest(ctx, n, night, t) {
    const g = this.G(n.x + 0.5, n.z + 0.5), zm = this.cam.zoom, s = (14 + n.size * 10) * zm;
    ctx.fillStyle = mix('#3a2a44', '#140c1c', night * 0.6); ctx.beginPath(); ctx.ellipse(g.sx, g.sy, s, s / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix('#5a3a6a', '#1f1228', night * 0.5);
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + n.x; const px = g.sx + Math.cos(a) * s * 0.55, py = g.sy + Math.sin(a) * s * 0.27; ctx.beginPath(); ctx.moveTo(px - 4 * zm, py); ctx.lineTo(px, py - (12 + (k % 3) * 5) * zm); ctx.lineTo(px + 4 * zm, py); ctx.fill(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.35 * night + 0.15 * Math.sin(t * 2 + n.x); const gr = ctx.createRadialGradient(g.sx, g.sy - 4 * zm, 0, g.sx, g.sy - 4 * zm, s * 0.8); gr.addColorStop(0, '#c07bff'); gr.addColorStop(1, 'rgba(192,123,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - 4 * zm, s * 0.8, s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  _stars(ctx, night) {
    this._starList ??= Array.from({ length: 160 }, () => [Math.random(), Math.random() * 0.6, Math.random()]);
    ctx.fillStyle = '#ffffff';
    for (const [x, y, b] of this._starList) { ctx.globalAlpha = (night - 0.4) * 1.6 * (0.3 + b * 0.7); ctx.fillRect(x * this.W, y * this.H, 1.5, 1.5); }
    ctx.globalAlpha = 1;
  }
  _ghostTiles(ctx, hw, hh) {
    const g = this.ghost; const col = g.ok ? (g.color || 'rgba(90,220,140,0.45)') : 'rgba(255,80,70,0.45)';
    if (g.reach && g.ok) for (const i of g.reach) { const x = i % this.N, z = (i / this.N) | 0; if (!this._near(x + 0.5, z + 0.5, 1)) continue; const c = this.G(x + 0.5, z + 0.5); diamondFill(ctx, c.sx, c.sy, hw * 0.96, hh * 0.96, g.reachColor || 'rgba(255,220,80,0.16)'); }
    for (const [x, z] of g.tiles || []) { if (x < 0 || z < 0 || x >= this.N || z >= this.N) continue; const c = this.G(x + 0.5, z + 0.5); diamondFill(ctx, c.sx, c.sy, hw * 0.94, hh * 0.94, col); }
  }
  _ghostSprite(ctx, s) {
    const pair = this.sprites.building(s.id, s.params || {}, this.cam.rot, true); if (!pair || pair.failed) return;
    const g = this.G(s.x + s.w / 2, s.z + s.d / 2);
    ctx.save(); ctx.globalAlpha = 0.7; composite(ctx, pair, g.sx, g.sy, 0, this.cam.zoom / this.sprites.scale); ctx.restore();
  }
}

/** Zoned lots reuse a few looks: seed modulo 6 keeps a city varied without a bake per building. */
export function spriteParams(l) {
  const p = { ...l.params }; if (l.kind === 'zoned') p.seed = (p.seed % 6) + 1;
  if (p.style === 'graphite') p.style = ['chrome', 'pearl', 'copper', 'concrete'][(p.seed || 1) % 4];   // retired style (owner 2026-11-16): old saves redraw lighter
  return p;
}

function frontNeighbours(rot) {
  // the two neighbours whose faces the camera sees, per map turn (camera toward +x +z at turn 0)
  return [[[1, 0], [0, 1]], [[0, -1], [1, 0]], [[-1, 0], [0, -1]], [[0, 1], [-1, 0]]][rot & 3];
}
function cliff(ctx, x, y, hw, hh, drop, side) {
  ctx.beginPath();
  if (side === 0) { ctx.moveTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x, y + hh + drop); ctx.lineTo(x + hw, y + drop); }
  else { ctx.moveTo(x - hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x, y + hh + drop); ctx.lineTo(x - hw, y + drop); }
  ctx.closePath(); ctx.fill();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function diamond(ctx, x, y, hw, hh, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y); ctx.closePath(); ctx.fill(); }
function diamondFill(ctx, x, y, hw, hh, col) { diamond(ctx, x, y, hw, hh, col); }
function diamondStroke(ctx, x, y, hw, hh) { ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y); ctx.closePath(); ctx.stroke(); }
const lerp = (a, b, t) => a + (b - a) * t;
export function mix(a, b, t) {
  const p = s => s.startsWith('rgb') ? s.match(/[\d.]+/g).slice(0, 3).map(Number) : [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
function rgbOf(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
export function shade(hex, k) { const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); const f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return '#' + n.map(v => f(v).toString(16).padStart(2, '0')).join(''); }
export { ZONE };
