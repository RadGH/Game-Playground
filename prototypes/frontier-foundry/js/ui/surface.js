// The surface map: a 2D canvas view of the engine's local grid, plus the camera and the mouse.
//
//   const surface = new Surface({ canvas, minimap, game, sound });
//   surface.frame();                       // once per animation frame
//   surface.jumpTo(x, y);                  // centre the camera and pulse a marker
//
// Everything here is presentation. The only writes it makes to the engine are through the public
// methods (place, removeStructure, addRoute) and they all come from the tool modules, not from here.
//
// Layers, bottom to top: terrain (baked once) → roads (baked, rebuilt when a road changes) → node
// patches → structures → movers → tracers → fog (baked, refreshed a few times a second) → the tool's
// own overlay (ghost, route line, selection, range rings) → off-screen markers.

import { BIOMES } from '../../../../worldgen/js/biomes.js';
import { spriteFor, sprite } from './icons.js';
import { clamp } from './dom.js';

const MIN_ZOOM = 3.5, MAX_ZOOM = 46;

/** Biome colour, darkened by slope so relief reads without a hillshade pass. */
function terrainColour(map, i) {
  const b = BIOMES[map.biome[i]] || BIOMES[5];
  if (map.water[i]) return b.tags?.includes('water') ? b.color : '#1d4a6b';
  return b.color;
}

const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class Surface {
  constructor({ canvas, minimap, game = null, onSelect = null, onHover = null, sound = null }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mctx = minimap ? minimap.getContext('2d') : null;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.sound = sound;

    this.cam = { x: 48, y: 48, zoom: 15 };
    this.mode = 'select';                     // select | build | route
    this.tool = null;                         // the active tool object (see build-tool.js / route-tool.js)
    this.selection = [];                      // selected entities: { kind, ... } from game.selectAt
    this.hover = null;
    this.pulse = null;                        // { x, y, until } - the jump-to marker
    this.keys = new Set();
    this.drag = null;
    this.box = null;                          // box-select rectangle in tile space
    this.showGrid = false;
    this.dirty = { terrain: true, roads: true, fog: 0 };
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0, inside: false };
    this.last = performance.now();

    if (game) this.setGame(game);
    this._bind();
  }

  // ------------------------------------------------------------------ wiring
  setGame(game) {
    this.game = game;
    game.recordShots = true;
    this.selection = [];
    this.dirty = { terrain: true, roads: true, fog: 0 };
    this.terrainCanvas = null; this.roadCanvas = null; this.fogCanvas = null;
    const hq = game.hq();
    if (hq) { this.cam.x = hq.x + hq.w / 2; this.cam.y = hq.y + hq.h / 2; }
    game.on('structure:done', () => { this.dirty.roads = true; });
    game.on('structure:removed', () => { this.dirty.roads = true; });
  }

  _bind() {
    const c = this.canvas;
    c.tabIndex = 0;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => this._down(e));
    c.addEventListener('pointermove', e => this._move(e));
    c.addEventListener('pointerup', e => this._up(e));
    c.addEventListener('pointerleave', () => { this.mouse.inside = false; this.hover = null; });
    c.addEventListener('wheel', e => this._wheel(e), { passive: false });
    if (this.minimap) {
      const jump = e => {
        const r = this.minimap.getBoundingClientRect();
        const m = this.game.map;
        this.centreOn((e.clientX - r.left) / r.width * m.width, (e.clientY - r.top) / r.height * m.height);
      };
      this.minimap.addEventListener('pointerdown', e => { this.minimapDrag = true; jump(e); });
      this.minimap.addEventListener('pointermove', e => { if (this.minimapDrag) jump(e); });
      addEventListener('pointerup', () => { this.minimapDrag = false; });
    }
  }

  // ------------------------------------------------------------------ camera
  get view() {
    const { width, height } = this.canvas;
    const z = this.cam.zoom;
    return { w: width, h: height, z, ox: width / 2 - this.cam.x * z, oy: height / 2 - this.cam.y * z };
  }
  tileToScreen(x, y) { const v = this.view; return { x: v.ox + x * v.z, y: v.oy + y * v.z }; }
  screenToTile(px, py) { const v = this.view; return { x: (px - v.ox) / v.z, y: (py - v.oy) / v.z }; }

  centreOn(x, y) {
    const m = this.game.map;
    this.cam.x = clamp(x, 0, m.width);
    this.cam.y = clamp(y, 0, m.height);
  }

  /** Centre on a tile and drop a marker that pulses for a couple of seconds. */
  jumpTo(x, y) {
    this.centreOn(x, y);
    this.pulse = { x, y, until: performance.now() + 2600 };
  }

  setZoom(z, anchorPx = null) {
    const before = anchorPx ? this.screenToTile(anchorPx.x, anchorPx.y) : null;
    this.cam.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (before) {
      const after = this.screenToTile(anchorPx.x, anchorPx.y);
      this.cam.x += before.x - after.x;
      this.cam.y += before.y - after.y;
    }
  }

  // ------------------------------------------------------------------ input
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / r.width);
    const py = (e.clientY - r.top) * (this.canvas.height / r.height);
    return { px, py, ...this.screenToTile(px, py) };
  }

  _down(e) {
    this.canvas.focus();
    const p = this._pos(e);
    if (e.button === 1 || e.button === 2 || this.keys.has('space')) {
      if (e.button === 2 && this.mode !== 'select') { this.cancelTool(); return; }
      if (e.button === 2 && this.mode === 'select') { this._order(p); return; }
      this.drag = { px: e.clientX, py: e.clientY, camx: this.cam.x, camy: this.cam.y, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode !== 'select' && this.tool) { this.tool.down(p, e); return; }
    this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, px: e.clientX, py: e.clientY, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  }

  _move(e) {
    const p = this._pos(e);
    this.mouse = { x: p.px, y: p.py, tx: p.x, ty: p.y, inside: true };
    if (this.drag) {
      const v = this.view;
      this.cam.x = this.drag.camx - (e.clientX - this.drag.px) * (this.canvas.width / this.canvas.getBoundingClientRect().width) / v.z;
      this.cam.y = this.drag.camy - (e.clientY - this.drag.py) * (this.canvas.height / this.canvas.getBoundingClientRect().height) / v.z;
      this.drag.moved = true;
      this.centreOn(this.cam.x, this.cam.y);
      return;
    }
    if (this.box) {
      this.box.x1 = p.x; this.box.y1 = p.y;
      if (Math.hypot(e.clientX - this.box.px, e.clientY - this.box.py) > 5) this.box.moved = true;
      return;
    }
    if (this.mode !== 'select' && this.tool) this.tool.move(p, e);
    else {
      const h = this.game?.selectAt(p.x, p.y);
      this.hover = h && h.kind !== 'tile' ? h : null;
      this.onHover?.(this.hover, p);
    }
  }

  _up(e) {
    const p = this._pos(e);
    if (this.drag) { this.drag = null; return; }
    if (this.box) {
      const b = this.box; this.box = null;
      if (b.moved) this._boxSelect(b);
      else this._click(p, e);
      return;
    }
    if (this.mode !== 'select' && this.tool) this.tool.up(p, e);
  }

  _wheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const anchor = { x: (e.clientX - r.left) * (this.canvas.width / r.width), y: (e.clientY - r.top) * (this.canvas.height / r.height) };
    this.setZoom(this.cam.zoom * (e.deltaY < 0 ? 1.16 : 1 / 1.16), anchor);
  }

  _click(p, e) {
    const hit = this.game.selectAt(p.x, p.y);
    if (hit.kind === 'tile' && !e.shiftKey) this.select([]);
    else if (e.shiftKey) this.select([...this.selection, hit]);
    else this.select([hit]);
    this.sound?.ui('click');
  }

  _boxSelect(b) {
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const picked = [];
    for (const u of this.game.units) if (u.alive && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) picked.push({ kind: 'unit', unit: u });
    for (const v of this.game.vehicles) if (v.alive && v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1) picked.push({ kind: 'vehicle', vehicle: v });
    if (!picked.length) for (const s of this.game.structures) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) picked.push({ kind: 'structure', structure: s });
    }
    this.select(picked);
  }

  /** Right-click order: walk there, or go and work on that outline. */
  _order(p) {
    const movers = this.selection.filter(s => s.kind === 'unit' && s.unit.alive);
    if (!movers.length) return;
    const hit = this.game.selectAt(p.x, p.y);
    for (const m of movers) {
      if (hit.kind === 'structure' && hit.structure.state !== 'done' && m.unit.def.buildRate) m.unit.target = hit.structure.id;
      else { m.unit.target = null; m.unit.moveTo = { x: p.x, y: p.y }; }
    }
    this.orderMarker = { x: p.x, y: p.y, until: performance.now() + 700 };
    this.sound?.ui('tab');
  }

  select(list) {
    const seen = new Set();
    this.selection = list.filter(s => {
      const key = s.kind + ':' + (s.structure?.id ?? s.unit?.id ?? s.vehicle?.id ?? s.enemy?.id ?? s.nest?.id ?? s.node?.id ?? s.x + ',' + s.y);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    this.onSelect?.(this.selection);
  }

  /**
   * Switch between pointing, placing and routing. The outgoing tool is reset (not cancelled) - a
   * tool's own cancel() calls back into here, so resetting is what keeps the two from bouncing off
   * each other forever.
   */
  setMode(mode, tool = null) {
    const prev = this.tool;
    this.mode = mode;
    this.tool = tool;
    if (prev && prev !== tool) prev.reset?.();
    this.canvas.style.cursor = mode === 'select' ? 'default' : mode === 'route' ? 'crosshair' : 'copy';
  }
  cancelTool() { this.setMode('select'); this.onSelect?.(this.selection); }

  // ------------------------------------------------------------------ baked layers
  _bakeTerrain() {
    const m = this.game.map;
    const c = this.terrainCanvas ||= document.createElement('canvas');
    c.width = m.width; c.height = m.height;
    const g = c.getContext('2d');
    const img = g.createImageData(m.width, m.height);
    const d = img.data;
    for (let i = 0; i < m.width * m.height; i++) {
      let [r, gg, b] = hexToRgb(terrainColour(m, i));
      const slope = m.slope ? m.slope[i] : 0;
      // relief: light the uphill side, darken the steep side, so cliffs read at a glance
      const shade = 1 - clamp(slope * 0.7, 0, 0.4) + (i % m.width > 0 && m.elevation ? (m.elevation[i] - m.elevation[i - 1]) * 1.4 : 0);
      const k = clamp(shade, 0.6, 1.2);
      if (m.forest[i]) { r = r * 0.72 + 30 * 0.28; gg = gg * 0.72 + 74 * 0.28; b = b * 0.72 + 40 * 0.28; }
      if (!m.buildable[i] && !m.water[i]) { r = r * 0.6 + 120 * 0.4; gg = gg * 0.6 + 112 * 0.4; b = b * 0.6 + 104 * 0.4; }
      const o = i * 4;
      d[o] = clamp(r * k, 0, 255); d[o + 1] = clamp(gg * k, 0, 255); d[o + 2] = clamp(b * k, 0, 255); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.dirty.terrain = false;
  }

  _bakeRoads() {
    const m = this.game.map;
    const c = this.roadCanvas ||= document.createElement('canvas');
    c.width = m.width; c.height = m.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, m.width, m.height);
    const img = g.createImageData(m.width, m.height);
    const d = img.data;
    const TINT = [null, [92, 78, 62, 190], [126, 120, 112, 205], [150, 152, 158, 225], [96, 176, 200, 235]];
    let any = false;
    for (let i = 0; i < m.width * m.height; i++) {
      const t = m.road[i];
      if (!t) continue;
      any = true;
      const [r, gg, b, a] = TINT[Math.min(4, t)];
      const o = i * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = a;
    }
    if (any) g.putImageData(img, 0, 0);
    this.roadEmpty = !any;
    this.dirty.roads = false;
  }

  _bakeFog() {
    const m = this.game.map, fog = this.game.fog;
    const c = this.fogCanvas ||= document.createElement('canvas');
    c.width = m.width; c.height = m.height;
    const g = c.getContext('2d');
    const img = g.createImageData(m.width, m.height);
    const d = img.data;
    for (let i = 0; i < fog.explored.length; i++) {
      const o = i * 4;
      d[o] = 5; d[o + 1] = 7; d[o + 2] = 11;
      d[o + 3] = fog.explored[i] ? (fog.visible[i] ? 0 : 112) : 246;
    }
    g.putImageData(img, 0, 0);
    this.dirty.fog = performance.now() + 180;
  }

  // ------------------------------------------------------------------ the frame
  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this._pan(dt);
    this.draw();
    if (now - (this._miniAt || 0) > 240) { this._miniAt = now; this.drawMinimap(); }
  }

  _pan(dt) {
    const k = this.keys;
    const speed = 22 / this.cam.zoom * 60 * dt;
    let dx = 0, dy = 0;
    if (k.has('a') || k.has('arrowleft')) dx -= speed;
    if (k.has('d') || k.has('arrowright')) dx += speed;
    if (k.has('w') || k.has('arrowup')) dy -= speed;
    if (k.has('s') || k.has('arrowdown')) dy += speed;
    if (dx || dy) this.centreOn(this.cam.x + dx, this.cam.y + dy);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.max(240, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  draw() {
    if (!this.game) return;
    this.resize();
    const g = this.ctx, m = this.game.map, v = this.view, now = performance.now();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, v.w, v.h);

    if (this.dirty.terrain) this._bakeTerrain();
    if (this.dirty.roads) this._bakeRoads();
    if (now > this.dirty.fog) this._bakeFog();

    g.imageSmoothingEnabled = v.z < 7;
    g.drawImage(this.terrainCanvas, v.ox, v.oy, m.width * v.z, m.height * v.z);
    if (!this.roadEmpty) g.drawImage(this.roadCanvas, v.ox, v.oy, m.width * v.z, m.height * v.z);
    g.imageSmoothingEnabled = true;

    if (this.showGrid && v.z >= 10) this._drawGrid(g, v, m);
    this._drawNodes(g, v);
    this._drawRoutes(g, v, now);
    this._drawStructures(g, v, now);
    this._drawMovers(g, v, now);
    this._drawShots(g, v);

    // fog last of the world layers, so nothing hidden shows through
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogCanvas, v.ox, v.oy, m.width * v.z, m.height * v.z);

    this._drawSelection(g, v, now);
    if (this.tool?.draw) this.tool.draw(g, v, this);
    if (this.box) this._drawBox(g, v);
    this._drawPulse(g, v, now);
    this._drawOffscreen(g, v);
  }

  _drawGrid(g, v, m) {
    g.strokeStyle = 'rgba(120,200,220,0.07)'; g.lineWidth = 1;
    g.beginPath();
    const x0 = Math.max(0, Math.floor((0 - v.ox) / v.z)), x1 = Math.min(m.width, Math.ceil((v.w - v.ox) / v.z));
    const y0 = Math.max(0, Math.floor((0 - v.oy) / v.z)), y1 = Math.min(m.height, Math.ceil((v.h - v.oy) / v.z));
    for (let x = x0; x <= x1; x++) { g.moveTo(v.ox + x * v.z, v.oy + y0 * v.z); g.lineTo(v.ox + x * v.z, v.oy + y1 * v.z); }
    for (let y = y0; y <= y1; y++) { g.moveTo(v.ox + x0 * v.z, v.oy + y * v.z); g.lineTo(v.ox + x1 * v.z, v.oy + y * v.z); }
    g.stroke();
  }

  _drawNodes(g, v) {
    const game = this.game, fog = game.fog;
    for (const n of game.map.nodes) {
      if (!n.scanned) continue;
      const i = n.y * game.map.width + n.x;
      if (!fog.explored[i]) continue;
      const res = game.data.resource[n.resource];
      const s = this.tileToScreen(n.x + 0.5, n.y + 0.5);
      const r = (n.radius + 0.4) * v.z;
      if (s.x + r < 0 || s.y + r < 0 || s.x - r > v.w || s.y - r > v.h) continue;
      g.save();
      g.globalAlpha = n.depleted ? 0.08 : 0.15;
      g.fillStyle = res?.color || '#888';
      g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = n.depleted ? 0.25 : 0.6;
      g.strokeStyle = res?.color || '#888'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.stroke();
      g.restore();
      const px = Math.min(44, Math.max(12, v.z * 2));
      const sp = spriteFor('res', res, px);
      if (sp && v.z >= 5) {
        g.globalAlpha = n.depleted ? 0.35 : 1;
        g.drawImage(sp, s.x - px / 2, s.y - px / 2, px, px);
        g.globalAlpha = 1;
      }
      if (v.z >= 13 && !n.depleted) {
        const pct = n.initial ? n.amount / n.initial : 1;
        g.fillStyle = 'rgba(4,8,12,0.72)';
        g.fillRect(s.x - px / 2, s.y + px / 2 + 2, px, 4);
        g.fillStyle = pct > 0.4 ? '#3fd0c0' : pct > 0.15 ? '#e8b53c' : '#e8683c';
        g.fillRect(s.x - px / 2, s.y + px / 2 + 2, px * pct, 4);
      }
    }
  }

  /** Delivery runs: a dashed line along the planned path, brighter for the route you have selected. */
  _drawRoutes(g, v, now) {
    const game = this.game, m = game.map;
    if (!game.routes.length) return;
    const selIds = new Set(this.selection.filter(s => s.kind === 'structure').map(s => s.structure.id));
    g.save();
    g.lineCap = 'round';
    const dash = (now / 60) % 14;
    for (const r of game.routes) {
      if (!r.path?.length) continue;
      const lit = selIds.has(r.from) || selIds.has(r.to);
      g.setLineDash([8, 6]);
      g.lineDashOffset = -dash;
      g.strokeStyle = lit ? 'rgba(255,182,72,0.95)' : r.waiting ? 'rgba(255,90,90,0.5)' : 'rgba(90,220,240,0.38)';
      g.lineWidth = lit ? 2.5 : 1.5;
      g.beginPath();
      const step = Math.max(1, Math.round(2 / Math.max(0.4, v.z / 8)));
      for (let k = 0; k < r.path.length; k += step) {
        const i = r.path[k];
        const p = this.tileToScreen(i % m.width + 0.5, ((i / m.width) | 0) + 0.5);
        k === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
      }
      const last = r.path[r.path.length - 1];
      const lp = this.tileToScreen(last % m.width + 0.5, ((last / m.width) | 0) + 0.5);
      g.lineTo(lp.x, lp.y);
      g.stroke();
    }
    g.restore();
  }

  _drawStructures(g, v, now) {
    const game = this.game;
    const sel = new Set(this.selection.filter(s => s.kind === 'structure').map(s => s.structure.id));
    for (const s of game.structures) {
      const p = this.tileToScreen(s.x, s.y);
      const w = s.w * v.z, h = s.h * v.z;
      if (p.x + w < 0 || p.y + h < 0 || p.x > v.w || p.y > v.h) continue;
      const road = !!s.def.roadTier;
      if (road && s.state === 'done') continue;               // already painted into the road layer

      if (s.state !== 'done') {
        // an outline: a dashed box with the icon ghosted inside it and a progress bar under it
        g.save();
        g.setLineDash([5, 4]);
        g.strokeStyle = s.state === 'building' ? 'rgba(90,220,240,0.95)' : 'rgba(90,220,240,0.5)';
        g.lineWidth = 1.6;
        g.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
        g.setLineDash([]);
        g.fillStyle = 'rgba(30,110,130,0.2)';
        g.fillRect(p.x + 1, p.y + 1, w - 2, h - 2);
        g.globalAlpha = 0.45;
        this._icon(g, s, p, w, h);
        g.restore();
        const t = clamp(s.progress / Math.max(1, s.def.buildTime || 1), 0, 1);
        g.fillStyle = 'rgba(4,8,12,0.8)';
        g.fillRect(p.x, p.y + h - 5, w, 5);
        g.fillStyle = '#4fe0d8';
        g.fillRect(p.x, p.y + h - 5, w * t, 5);
        continue;
      }

      const hurt = s.hp / s.maxHp;
      g.save();
      // body: a plate under the icon so a building reads as a building even at low zoom
      g.fillStyle = sel.has(s.id) ? 'rgba(28,74,86,0.96)' : 'rgba(9,14,20,0.92)';
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = sel.has(s.id) ? '#63e6ff' : s === game.hq() ? 'rgba(255,190,80,0.95)' : 'rgba(140,190,210,0.55)';
      g.lineWidth = sel.has(s.id) ? 2 : 1;
      g.strokeRect(p.x + 0.5, p.y + 0.5, w - 1, h - 1);
      this._icon(g, s, p, w, h);
      if (hurt < 0.999) {
        g.fillStyle = `rgba(220,60,50,${(1 - hurt) * 0.42})`;
        g.fillRect(p.x, p.y, w, h);
        g.fillStyle = 'rgba(4,8,12,0.8)'; g.fillRect(p.x, p.y - 4, w, 3);
        g.fillStyle = hurt > 0.5 ? '#7ad07a' : hurt > 0.25 ? '#e8b53c' : '#e8683c';
        g.fillRect(p.x, p.y - 4, w * hurt, 3);
      }
      g.restore();

      if (v.z >= 8) this._statusPips(g, s, p, w, h, v);
    }
  }

  _icon(g, s, p, w, h) {
    const px = Math.max(8, Math.min(w, h) * 0.92);
    const sp = spriteFor('bld', s.def, px);
    if (!sp) {
      g.fillStyle = 'rgba(90,200,220,0.5)';
      g.fillRect(p.x + w * 0.25, p.y + h * 0.25, w * 0.5, h * 0.5);
      return;
    }
    const size = Math.min(w, h) * 0.92;
    const cx = p.x + w / 2, cy = p.y + h / 2;
    if (s.rot) {
      g.save(); g.translate(cx, cy); g.rotate(s.rot * Math.PI / 2);
      g.drawImage(sp, -size / 2, -size / 2, size, size);
      g.restore();
    } else g.drawImage(sp, cx - size / 2, cy - size / 2, size, size);
  }

  /** The three little lights that answer "why has this stopped": no power, starved, output full. */
  _statusPips(g, s, p, w, h, v) {
    const pips = [];
    if (s.def.powerUse && s.powered < 0.5 && s.enabled) pips.push('#ffd24a');
    if (s.starvedFor && !s.crafting) pips.push('#ff8a4a');
    if (s.blocked) pips.push('#ff5a5a');
    if (!s.enabled) pips.push('#7c8a99');
    if (!pips.length) return;
    const r = Math.min(4, v.z * 0.22);
    pips.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath(); g.arc(p.x + w - 4 - i * (r * 2 + 2), p.y + 4, r, 0, Math.PI * 2); g.fill();
    });
  }

  _drawMovers(g, v, now) {
    const game = this.game, fog = game.fog, m = game.map;
    const selIds = new Set(this.selection.map(s => s.unit?.id ?? s.vehicle?.id ?? -1));
    const px = clamp(v.z * 1.25, 9, 30);
    // vehicles first (bigger), then crew, then enemies on top
    for (const veh of game.vehicles) {
      if (!veh.alive) continue;
      const p = this.tileToScreen(veh.x + 0.5, veh.y + 0.5);
      if (p.x < -40 || p.y < -40 || p.x > v.w + 40 || p.y > v.h + 40) continue;
      const sp = spriteFor('veh', veh.def, px * 1.2);
      if (sp) g.drawImage(sp, p.x - px * 0.6, p.y - px * 0.6, px * 1.2, px * 1.2);
      else { g.fillStyle = '#9ad'; g.fillRect(p.x - 4, p.y - 4, 8, 8); }
      if (veh.cargo > 0 && v.z >= 10) {
        g.fillStyle = '#2fd8b0';
        g.beginPath(); g.arc(p.x + px * 0.5, p.y - px * 0.5, 3, 0, Math.PI * 2); g.fill();
      }
      if (selIds.has(veh.id)) this._ring(g, p, px * 0.8, '#63e6ff');
    }
    for (const u of game.units) {
      if (!u.alive) continue;
      const p = this.tileToScreen(u.x, u.y);
      if (p.x < -30 || p.y < -30 || p.x > v.w + 30 || p.y > v.h + 30) continue;
      const sp = spriteFor('unit', u.def, px);
      if (sp) g.drawImage(sp, p.x - px / 2, p.y - px / 2, px, px);
      else { g.fillStyle = '#8fe'; g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill(); }
      if (selIds.has(u.id)) this._ring(g, p, px * 0.68, '#63e6ff');
      if (u.hp < u.maxHp) {
        g.fillStyle = 'rgba(4,8,12,0.8)'; g.fillRect(p.x - px / 2, p.y - px / 2 - 4, px, 3);
        g.fillStyle = '#7ad07a'; g.fillRect(p.x - px / 2, p.y - px / 2 - 4, px * (u.hp / u.maxHp), 3);
      }
    }
    for (const n of game.nests) {
      if (!n.alive || !n.known) continue;
      const i = (n.y | 0) * m.width + (n.x | 0);
      if (!fog.explored[i]) continue;
      const p = this.tileToScreen(n.x, n.y);
      const s2 = px * 1.6;
      const sp = spriteFor('unit', n.def, s2);
      g.save(); g.globalAlpha = fog.visible[i] ? 1 : 0.55;
      if (sp) g.drawImage(sp, p.x - s2 / 2, p.y - s2 / 2, s2, s2);
      g.strokeStyle = 'rgba(220,70,90,0.8)'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, s2 * 0.62, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const i = (e.y | 0) * m.width + (e.x | 0);
      if (i < 0 || i >= fog.visible.length || !fog.visible[i]) continue;
      const p = this.tileToScreen(e.x, e.y);
      if (p.x < -30 || p.y < -30 || p.x > v.w + 30 || p.y > v.h + 30) continue;
      const s2 = px * (e.def.boss ? 1.7 : 1);
      const sp = spriteFor('unit', e.def, s2);
      if (sp) {
        g.save();
        g.shadowColor = 'rgba(255,60,60,0.9)'; g.shadowBlur = e.def.boss ? 14 : 6;
        g.drawImage(sp, p.x - s2 / 2, p.y - s2 / 2, s2, s2);
        g.restore();
      } else { g.fillStyle = '#f46'; g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill(); }
      if (e.hp < e.maxHp && v.z >= 8) {
        g.fillStyle = 'rgba(4,8,12,0.8)'; g.fillRect(p.x - s2 / 2, p.y - s2 / 2 - 4, s2, 3);
        g.fillStyle = '#ff5a5a'; g.fillRect(p.x - s2 / 2, p.y - s2 / 2 - 4, s2 * (e.hp / e.maxHp), 3);
      }
    }
  }

  _ring(g, p, r, colour) {
    g.strokeStyle = colour; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
  }

  _drawShots(g, v) {
    const shots = this.game.shots;
    if (!shots?.length) return;
    const t = this.game.time;
    const COLOUR = { energy: '#8ad6ff', laser: '#ff6a8a', fire: '#ffa040', electric: '#b6a0ff', explosive: '#ffc24a' };
    g.save();
    g.lineCap = 'round';
    for (let k = shots.length - 1; k >= 0; k--) {
      const s = shots[k];
      const age = t - s.t;
      if (age > 1.2) break;
      const a = this.tileToScreen(s.x1, s.y1), b = this.tileToScreen(s.x2, s.y2);
      g.globalAlpha = clamp(1 - age / 1.2, 0, 1) * 0.9;
      g.strokeStyle = COLOUR[s.type] || '#ffe08a';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.fillStyle = g.strokeStyle;
      g.beginPath(); g.arc(b.x, b.y, 3 + (1 - age) * 2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // drop anything older than the longest tracer, so the list does not creep
    while (shots.length && t - shots[0].t > 1.4) shots.shift();
  }

  _drawSelection(g, v, now) {
    for (const s of this.selection) {
      if (s.kind === 'structure') {
        const st = s.structure;
        const p = this.tileToScreen(st.x, st.y);
        g.strokeStyle = '#63e6ff'; g.lineWidth = 2;
        g.strokeRect(p.x - 2, p.y - 2, st.w * v.z + 4, st.h * v.z + 4);
        this._ranges(g, v, st);
      } else if (s.kind === 'node') {
        const p = this.tileToScreen(s.node.x + 0.5, s.node.y + 0.5);
        this._ring(g, p, (s.node.radius + 1) * v.z, '#63e6ff');
      }
    }
    // hovering a turret or a pole shows its reach without having to click it
    if (this.hover?.kind === 'structure' && !this.selection.some(s => s.structure === this.hover.structure)) {
      this._ranges(g, v, this.hover.structure, 0.45);
    }
  }

  /** Range rings: what it shoots, what it powers, what it stores for, what it sees. */
  _ranges(g, v, s, alpha = 0.85) {
    const c = this.tileToScreen(s.x + s.w / 2, s.y + s.h / 2);
    const rings = [];
    if (s.def.range && s.def.dps) rings.push([s.def.range, 'rgba(255,110,90,ALPHA)', 'fire']);
    if (s.def.minRange) rings.push([s.def.minRange, 'rgba(255,110,90,ALPHA)', 'dead zone']);
    if (s.def.supplyRadius) rings.push([s.def.supplyRadius, 'rgba(255,210,74,ALPHA)', 'power']);
    if (s.def.linkRadius) rings.push([s.def.linkRadius, 'rgba(90,220,240,ALPHA)', 'store link']);
    if (s.def.scanRadius) rings.push([s.def.scanRadius, 'rgba(160,255,180,ALPHA)', 'scan']);
    if (s.def.shieldRadius) rings.push([s.def.shieldRadius, 'rgba(150,170,255,ALPHA)', 'shield']);
    if (s.def.repairRadius) rings.push([s.def.repairRadius, 'rgba(120,255,210,ALPHA)', 'repair']);
    g.save();
    g.setLineDash([6, 5]);
    for (const [r, colour] of rings) {
      g.strokeStyle = colour.replace('ALPHA', String(alpha));
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(c.x, c.y, r * v.z, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  _drawBox(g, v) {
    const a = this.tileToScreen(this.box.x0, this.box.y0), b = this.tileToScreen(this.box.x1, this.box.y1);
    g.save();
    g.strokeStyle = '#63e6ff'; g.fillStyle = 'rgba(60,200,230,0.12)'; g.lineWidth = 1.5;
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.restore();
  }

  _drawPulse(g, v, now) {
    if (this.orderMarker && now < this.orderMarker.until) {
      const p = this.tileToScreen(this.orderMarker.x, this.orderMarker.y);
      const t = 1 - (this.orderMarker.until - now) / 700;
      g.strokeStyle = `rgba(120,255,200,${1 - t})`; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, 6 + t * 16, 0, Math.PI * 2); g.stroke();
    }
    if (!this.pulse || now > this.pulse.until) return;
    const p = this.tileToScreen(this.pulse.x, this.pulse.y);
    const phase = ((this.pulse.until - now) / 650) % 1;
    g.save();
    for (let k = 0; k < 2; k++) {
      const t = (phase + k * 0.5) % 1;
      g.strokeStyle = `rgba(255,190,80,${(1 - t) * 0.9})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(p.x, p.y, 10 + t * 44, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  /** Arrows at the edge of the screen for things happening off-camera. */
  _drawOffscreen(g, v) {
    const game = this.game;
    const marks = [];
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const i = (e.y | 0) * game.map.width + (e.x | 0);
      if (i < 0 || i >= game.fog.visible.length || !game.fog.visible[i]) continue;
      const p = this.tileToScreen(e.x, e.y);
      if (p.x >= 0 && p.y >= 0 && p.x <= v.w && p.y <= v.h) continue;
      marks.push({ x: e.x, y: e.y, colour: '#ff5a5a' });
      if (marks.length > 40) break;
    }
    if (!marks.length) return;
    g.save();
    const cx = v.w / 2, cy = v.h / 2, pad = 16;
    const seen = new Set();
    for (const mk of marks) {
      const p = this.tileToScreen(mk.x, mk.y);
      let dx = p.x - cx, dy = p.y - cy;
      const scale = Math.min((cx - pad) / Math.max(1, Math.abs(dx)), (cy - pad) / Math.max(1, Math.abs(dy)));
      const x = cx + dx * scale, y = cy + dy * scale;
      const key = Math.round(x / 22) + ':' + Math.round(y / 22);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = Math.atan2(dy, dx);
      g.translate(x, y); g.rotate(a);
      g.fillStyle = mk.colour;
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, 5); g.lineTo(-6, -5); g.closePath(); g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.restore();
  }

  // ------------------------------------------------------------------ minimap
  drawMinimap() {
    if (!this.mctx || !this.game) return;
    const c = this.minimap, g = this.mctx, m = this.game.map;
    const size = c.width;
    const k = size / m.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05070b'; g.fillRect(0, 0, size, c.height);
    if (this.dirty.terrain) this._bakeTerrain();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.terrainCanvas, 0, 0, size, size);
    if (this.fogCanvas) g.drawImage(this.fogCanvas, 0, 0, size, size);
    for (const s of this.game.structures) {
      if (s.def.roadTier) continue;
      g.fillStyle = s === this.game.hq() ? '#ffc85a' : s.state === 'done' ? '#6fe0ff' : 'rgba(110,220,255,0.5)';
      g.fillRect(s.x * k, s.y * k, Math.max(1.5, s.w * k), Math.max(1.5, s.h * k));
    }
    for (const n of this.game.nests) if (n.alive && n.known) { g.fillStyle = '#c04060'; g.fillRect(n.x * k - 1, n.y * k - 1, 3, 3); }
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const i = (e.y | 0) * m.width + (e.x | 0);
      if (i < 0 || i >= this.game.fog.visible.length || !this.game.fog.visible[i]) continue;
      g.fillStyle = '#ff4a4a'; g.fillRect(e.x * k - 1, e.y * k - 1, 3, 3);
    }
    // where the camera is looking
    const v = this.view;
    const vw = v.w / v.z * k, vh = v.h / v.z * k;
    g.strokeStyle = 'rgba(240,250,255,0.85)'; g.lineWidth = 1.5;
    g.strokeRect(this.cam.x * k - vw / 2, this.cam.y * k - vh / 2, vw, vh);
  }
}
