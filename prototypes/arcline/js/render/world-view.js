// The world map, drawn the SimCity 4 region-map way: the whole planet as one big iso diamond, each region outlined and
// filled with its biome's ground, sea and coast from the world noise (sim/world.js sample), rivers (riverAt), a little
// hill shading so the ground reads as land, your cities as glowing markers with their name and people, and interstate
// links between neighbouring cities. Used by the New world preview (small, no cities) and the World map screen.
//
//   const v = new WorldView(canvas, world, { ppc: 20 });   // ppc = picture pixels per world cell
//   v.resize(cssW, cssH, dpr); v.fit({ x, y, w, h });     // fit the diamond into a part of the canvas (CSS px)
//   v.draw(timeSeconds);                                   // cheap: one picture + vector lines
//   v.pick(cssX, cssY) → region | null; v.panBy(dx, dy); v.zoomAt(factor, cssX, cssY); v.centreOn(region, area)
import { sample, riverAt, BIOMES, SEA, CELL, neighbours } from '../sim/world.js';

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SEA_DEEP = hex('#081d36'), SEA_SHALLOW = hex('#1a6489'), SAND = hex('#d9c99c'), RIVER = hex('#53c8f2');

/** The planet as a top-down picture, cells*ppc square, one pixel = CELL/ppc tiles. Also returns the land share. */
export function worldPicture(world, ppc = 20) {
  const n = world.cells * ppc, step = CELL / ppc, seed = world.seed;
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = sample(seed, (i + 0.5) * step, (j + 0.5) * step).h;
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  const cols = {}; for (const [k, b] of Object.entries(BIOMES)) cols[k] = [hex(b.ground), hex(b.alt), hex(b.dark)];
  let land = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = H[j * n + i], o = (j * n + i) * 4;
    let rgb;
    if (h < SEA) {
      const t = clamp((SEA - h) / 0.13, 0, 1); rgb = mix(SEA_SHALLOW, SEA_DEEP, Math.sqrt(t));
      // a soft light band where the sea meets land
      if (SEA - h < 0.008) rgb = mix(rgb, [120, 200, 220], 0.35);
    } else {
      land++;
      const r = world.regions[world.grid[Math.floor(j / ppc) * world.cells + Math.floor(i / ppc)]];
      const [base, alt, dark] = cols[r?.biome || 'verdant'];
      const up = clamp((h - SEA) / 0.4, 0, 1);
      rgb = mix(mix(base, alt, ((i * 7 + j * 13) % 5) / 10), dark, up * 0.25);
      if (h > 0.66) rgb = mix(rgb, [235, 238, 245], clamp((h - 0.66) / 0.12, 0, 0.55));   // high ground pales
      // hill shading: light from the top-left of the picture (which is the top of the diamond on screen)
      const hl = H[j * n + Math.max(0, i - 1)], hr = H[j * n + Math.min(n - 1, i + 1)], hu = H[Math.max(0, j - 1) * n + i], hd = H[Math.min(n - 1, j + 1) * n + i];
      const slope = ((hl - hr) + (hu - hd)) / (2 * step);
      const k = clamp(1 + slope * 55, 0.72, 1.3); rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
      if (h - SEA < 0.011) rgb = mix(rgb, SAND, 0.45);
      if (riverAt(seed, (i + 0.5) * step, (j + 0.5) * step)) rgb = RIVER;
    }
    d[o] = clamp(rgb[0], 0, 255); d[o + 1] = clamp(rgb[1], 0, 255); d[o + 2] = clamp(rgb[2], 0, 255); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, land: land / (n * n) };
}

/** Per-region screen centre etc. live in the view; this class only draws and maps coordinates. */
export class WorldView {
  constructor(canvas, world, { ppc = 20, labels = true, cities = true } = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.world = world; this.labels = labels; this.showCities = cities;
    this.pic = worldPicture(world, ppc); this.ppc = ppc;
    this.s = 20; this.ox = 0; this.oy = 0; this.dpr = 1; this.W = 1; this.H = 1;
    this.sel = null; this.hover = null; this.fitS = 20; this.anim = null;
  }
  get land() { return this.pic.land; }
  resize(w, h, dpr = 1) { this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
  /** Fit the whole diamond in an area (CSS px). */
  fit(a, pad = 16) {
    const n = this.world.cells;
    const s = Math.max(2, Math.min((a.w - pad * 2) / (2 * n), (a.h - pad * 2 - 14) / n));
    this.s = this.fitS = s; this.ox = a.x + a.w / 2; this.oy = a.y + (a.h - n * s - 14) / 2; this.area = a;
  }
  /** World cell coords (u, v) → CSS px. */
  toScreen(u, v) { return { x: this.ox + (u - v) * this.s, y: this.oy + (u + v) * this.s / 2 }; }
  toCell(x, y) { const a = (x - this.ox) / this.s, b = (y - this.oy) * 2 / this.s; return { u: (a + b) / 2, v: (b - a) / 2 }; }
  pick(x, y) { const { u, v } = this.toCell(x, y); const n = this.world.cells; if (u < 0 || v < 0 || u >= n || v >= n) return null; return this.world.regions[this.world.grid[Math.floor(v) * n + Math.floor(u)]] || null; }
  centre(r) { return this.toScreen(r.cx + r.span / 2, r.cz + r.span / 2); }
  panBy(dx, dy) { this.anim = null; this.ox += dx; this.oy += dy; this.clampView(); }
  zoomAt(f, x, y) {
    this.anim = null;
    const s2 = clamp(this.s * f, this.fitS * 0.85, this.fitS * 7); const k = s2 / this.s;
    this.ox = x + (this.ox - x) * k; this.oy = y + (this.oy - y) * k; this.s = s2; this.clampView();
  }
  /** Keep some of the map on screen. */
  clampView() {
    const n = this.world.cells, a = this.area || { x: 0, y: 0, w: this.W, h: this.H };
    const L = this.ox - n * this.s, R = this.ox + n * this.s, T = this.oy, B = this.oy + n * this.s;
    const m = 60;
    if (R < a.x + m) this.ox += a.x + m - R; if (L > a.x + a.w - m) this.ox -= L - (a.x + a.w - m);
    if (B < a.y + m) this.oy += a.y + m - B; if (T > a.y + a.h - m) this.oy -= T - (a.y + a.h - m);
  }
  /** Slide the view so region r sits in the middle of `area` (CSS px). */
  centreOn(r, area, ms = 380) {
    const c = this.centre(r), tx = area.x + area.w / 2, ty = area.y + area.h / 2;
    this.anim = { fx: this.ox, fy: this.oy, tx: this.ox + tx - c.x, ty: this.oy + ty - c.y, t0: performance.now(), ms };
  }
  isVisible(r, area, m = 30) { const c = this.centre(r); return c.x > area.x + m && c.x < area.x + area.w - m && c.y > area.y + m && c.y < area.y + area.h - m; }

  draw(t = 0, cities = {}) {
    if (this.anim) {
      const k = clamp((performance.now() - this.anim.t0) / this.anim.ms, 0, 1), e = 1 - (1 - k) ** 3;
      this.ox = this.anim.fx + (this.anim.tx - this.anim.fx) * e; this.oy = this.anim.fy + (this.anim.ty - this.anim.fy) * e;
      if (k >= 1) this.anim = null;
    }
    const d = this.dpr, n = this.world.cells, s = this.s;
    // the still layer (slab, ground, outlines, claimed tint) is drawn only when the view or the cities change
    const claimed = this.world.regions.reduce((a, r) => a + (r.city?.founded ? 1 + r.id : 0), 0);
    const key = `${this.ox}|${this.oy}|${s}|${this.cv.width}|${this.cv.height}|${claimed}`;
    if (key !== this._key) { this._key = key; this.drawBase(); }
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height); g.drawImage(this._base, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0); g.lineJoin = 'round';
    const poly = r => { const a = this.toScreen(r.cx, r.cz), b = this.toScreen(r.cx + r.span, r.cz), c = this.toScreen(r.cx + r.span, r.cz + r.span), e = this.toScreen(r.cx, r.cz + r.span); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(e.x, e.y); g.closePath(); };
    if (this.hover && this.hover !== this.sel) { poly(this.hover); g.fillStyle = 'rgba(255, 255, 255, 0.08)'; g.fill(); g.strokeStyle = 'rgba(255, 255, 255, 0.7)'; g.lineWidth = 1.5; g.stroke(); }
    if (this.sel) {
      poly(this.sel); g.fillStyle = 'rgba(63, 240, 255, 0.14)'; g.fill();
      g.strokeStyle = 'rgba(63, 240, 255, 0.28)'; g.lineWidth = 8 + Math.sin(t * 3) * 2; g.stroke(); g.strokeStyle = '#3ff0ff'; g.lineWidth = 2.5; g.stroke();   // a glow without shadowBlur (cheap on phones)
    }
    if (!this.showCities) return;
    // interstate links between neighbouring cities
    const founded = this.world.regions.filter(r => r.city?.founded);
    const done = new Set();
    g.save(); g.lineCap = 'round';
    for (const r of founded) for (const o of neighbours(this.world, r)) {
      if (!o.city?.founded) continue; const key = Math.min(r.id, o.id) + ':' + Math.max(r.id, o.id); if (done.has(key)) continue; done.add(key);
      const a = this.centre(r), b = this.centre(o);
      g.strokeStyle = 'rgba(255, 176, 46, 0.35)'; g.lineWidth = 6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = '#ffb02e'; g.lineWidth = 2; g.setLineDash([8, 7]); g.lineDashOffset = -t * 18; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    }
    g.restore();
    // city markers: a beam of light, a pulsing ring, the name and people
    this.placed = [];
    const later = [];
    for (const r of founded) {
      const c = this.centre(r), pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + r.id), beam = 16 + Math.min(40, s * 0.9);
      g.save(); g.globalCompositeOperation = 'lighter';
      const bg = g.createLinearGradient(0, c.y - beam, 0, c.y); bg.addColorStop(0, 'rgba(255,79,216,0)'); bg.addColorStop(1, 'rgba(255,79,216,0.85)');
      g.fillStyle = bg; g.fillRect(c.x - 1.5, c.y - beam, 3, beam);
      const rg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 14 + pulse * 6); rg.addColorStop(0, 'rgba(255,120,230,0.9)'); rg.addColorStop(1, 'rgba(255,79,216,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(c.x, c.y, 14 + pulse * 6, 0, Math.PI * 2); g.fill();
      g.restore();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(c.x, c.y, 9 + pulse * 3, (9 + pulse * 3) / 2, 0, 0, Math.PI * 2); g.stroke();
      if (this.labels) later.push([r === this.sel ? 0 : 1, c.x, c.y + 14, r.city.name || r.name, cities.peopleText?.(r) || '']);
    }
    // the hovered / selected region's name (desktop hover, controller, keys)
    for (const r of [this.sel, this.hover]) if (r && !r.city?.founded && this.labels) { const c = this.centre(r); later.push([r === this.sel ? 0 : 2, c.x, c.y - 8, r.name, '', true]); }
    // the picked one first, then the rest, each nudged off the ones already drawn (no label on top of another)
    later.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, name, sub, quiet] of later) this.label(x, y, name, sub, quiet);
  }
  drawBase() {
    const d = this.dpr, n = this.world.cells, s = this.s;
    if (!this._base || this._base.width !== this.cv.width || this._base.height !== this.cv.height) { this._base = document.createElement('canvas'); this._base.width = this.cv.width; this._base.height = this.cv.height; }
    const g = this._base.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this._base.width, this._base.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    // the slab under the map (gives the planet piece some thickness)
    const L = this.toScreen(0, n), B = this.toScreen(n, n), R = this.toScreen(n, 0), T = this.toScreen(0, 0), depth = Math.max(6, s * 0.5);
    g.save();
    g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(B.x, B.y); g.lineTo(R.x, R.y); g.lineTo(R.x, R.y + depth); g.lineTo(B.x, B.y + depth); g.lineTo(L.x, L.y + depth); g.closePath();
    const sg = g.createLinearGradient(0, B.y - depth, 0, B.y + depth); sg.addColorStop(0, '#16223a'); sg.addColorStop(1, '#070b16');
    g.fillStyle = sg; g.fill();
    g.strokeStyle = 'rgba(63, 240, 255, 0.16)'; g.lineWidth = 10; g.stroke(); g.strokeStyle = 'rgba(63, 240, 255, 0.35)'; g.lineWidth = 1.5; g.stroke();   // rim light (no shadowBlur: cheap)
    g.restore();
    // the picture, sheared into the diamond
    const p = this.pic.canvas, k = s / this.ppc;
    g.save();
    g.setTransform(k * d, k / 2 * d, -k * d, k / 2 * d, this.ox * d, this.oy * d);
    g.imageSmoothingEnabled = s / this.ppc < 2.2; g.imageSmoothingQuality = 'high';
    g.drawImage(p, 0, 0);
    g.restore();
    g.setTransform(d, 0, 0, d, 0, 0);
    // region outlines
    g.lineJoin = 'round';
    const poly = r => { const a = this.toScreen(r.cx, r.cz), b = this.toScreen(r.cx + r.span, r.cz), c = this.toScreen(r.cx + r.span, r.cz + r.span), e = this.toScreen(r.cx, r.cz + r.span); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(e.x, e.y); g.closePath(); };
    g.strokeStyle = 'rgba(6, 12, 24, 0.55)'; g.lineWidth = Math.max(1, Math.min(2, s / 18));
    for (const r of this.world.regions) { poly(r); g.stroke(); }
    // claimed regions get a faint tint
    for (const r of this.world.regions) if (r.city?.founded) { poly(r); g.fillStyle = 'rgba(255, 79, 216, 0.08)'; g.fill(); g.strokeStyle = 'rgba(255, 79, 216, 0.45)'; g.lineWidth = 1.2; g.stroke(); }
  }
  label(x, y, name, sub, quiet = false) {
    const g = this.ctx;
    g.font = '600 13px "Exo 2", system-ui, sans-serif';
    const w1 = g.measureText(name).width; g.font = '500 12px "Exo 2", system-ui, sans-serif'; const w2 = sub ? g.measureText(sub).width : 0;
    const w = Math.max(w1, w2) + 16, h = sub ? 38 : 22;
    const hits = yy => (this.placed || []).some(p => x - w / 2 < p.x + p.w && x + w / 2 > p.x && yy < p.y + p.h && yy + h > p.y);
    for (const dy of [0, h + 4, -(h + 36), 2 * (h + 4), -(2 * h + 40)]) if (!hits(y + dy)) { y += dy; break; }
    (this.placed ||= []).push({ x: x - w / 2 - 2, y: y - 2, w: w + 4, h: h + 4 });
    g.save();
    g.fillStyle = quiet ? 'rgba(7, 11, 22, 0.72)' : 'rgba(9, 12, 26, 0.86)'; g.strokeStyle = quiet ? 'rgba(255,255,255,0.25)' : 'rgba(255, 79, 216, 0.6)'; g.lineWidth = 1;
    roundRect(g, x - w / 2, y, w, h, 7); g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = '#f2f6ff'; g.font = '600 13px "Exo 2", system-ui, sans-serif'; g.fillText(name, x, y + 4);
    if (sub) { g.fillStyle = '#ffd38a'; g.font = '500 12px "Exo 2", system-ui, sans-serif'; g.fillText(sub, x, y + 21); }
    g.restore();
  }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Facts for the New world preview: region counts by size, sea share, biome shares (by land area). */
export function worldFacts(world, land) {
  const by = { 1: 0, 2: 0, 4: 0 }, biomes = {};
  for (const r of world.regions) { by[r.span] = (by[r.span] || 0) + 1; biomes[r.biome] = (biomes[r.biome] || 0) + r.span * r.span * r.land; }
  const tot = Object.values(biomes).reduce((a, b) => a + b, 0) || 1;
  return { regions: world.regions.length, small: by[1], medium: by[2], large: by[4], sea: 1 - land, biomes: Object.entries(biomes).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, share: v / tot })) };
}
