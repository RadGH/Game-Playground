// The mission view: a fixed iso camera (Arcline's angle) that sits between the player's mech and where it aims
// (twin-stick "camera-leads-aim"), the ground (streets, sidewalks, plazas, scorch), baked buildings in their wreck
// stages, enemies, mechs, shots and effects, depth-sorted like SimCity 4. Buildings in front of a mech fade
// see-through (no view turning — owner finds it disorienting). Canvas 2D.
import { TILE_W, TILE_H, PX_PER_HEIGHT, toScreen, toWorld, dirOfHeading } from '../../../../citykit/js/iso.js';
import { composite } from '../../../../citykit/js/bake.js';

/** composite() with an overall alpha that also applies to the night lights (City Kit's sets its own alpha for them).
 *  Its own night-tint cache, so a faded building costs the same as a solid one. */
const tints = new WeakMap();
function nightTint(pair, t) {
  const q = Math.round(t * 10) / 10;
  let m = tints.get(pair); if (!m) { m = new Map(); tints.set(pair, m); }
  if (!m.has(q)) {
    const c = document.createElement('canvas'); c.width = pair.w; c.height = pair.h;
    const g = c.getContext('2d'); g.drawImage(pair.day, 0, 0); g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgba(8, 12, 34, ${0.78 * q})`; g.fillRect(0, 0, c.width, c.height); m.set(q, c);
  }
  return m.get(q);
}
function compositeA(ctx, pair, x, y, t, scale, a) {
  if (a >= 0.999) return composite(ctx, pair, x, y, t, scale);
  const dx = x - pair.ax * scale, dy = y - pair.ay * scale, w = pair.w * scale, h = pair.h * scale;
  ctx.save(); ctx.globalAlpha = a; ctx.drawImage(pair.day, dx, dy, w, h);
  if (t > 0) { ctx.drawImage(nightTint(pair, t), dx, dy, w, h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * Math.min(1, t * 1.4); ctx.drawImage(pair.lights, dx, dy, w, h); }
  ctx.restore();
}
import { Fx } from '../../../../citykit/js/world/fx.js';
import { DIRS } from './sprites.js';
import { drawBoss, drawBossMarks, drawEnemyMech } from './boss-art.js';
import { drawMoonGround } from './moon-ground.js';   // round 5: the moon's dust, craters, mine and pads
import { drawForestGround } from './forest-ground.js';   // Pinewatch: grass, woods floor, trails, road, river
import { drawSnowGround, drawSnowOver, drawSnowfall } from './snow-ground.js';   // round 6: the snowfield (ground, lift cables, snowfall)
import { drawDesertGround } from './desert-ground.js';   // Red Mesa: sand, washes, the highway, the base basin
import { drawRoles } from './roles-art.js';
import { objectiveTargets } from './targets.js';     // the mission's targets: edge arrows here, the minimap in ui/minimap.js          // round 5: bulwark domes, heal beams, flamer cones, spore clouds

const C = {
  ground: '#1b1f27', groundNight: '#0c0f16', road: '#262a33', lane: '#c9b04a', walk: '#343944', plaza: '#2c313b', curb: '#4a5160',
};

export class View {
  constructor(canvas, sprites, { zoom = 2.5 } = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.sprites = sprites;
    this.zoom = zoom; this.cam = { x: 10, z: 10 }; this.night = 0; this.fx = new Fx();
    this.fade = new Map();             // lot id → current alpha (smooth fade in/out)
    this.decals = [];                  // scorch marks that stay for the whole mission
    this.numbers = [];                 // floating damage numbers
    this.pings = [];                   // co-op pings: { x, z, target, by, age } (ping events)
    this.shx = 0; this.shy = 0;
    this.mechDrawer = null;            // set by the game: (ctx, mech, sx, sy, scale, night) => void
    this.dpr = 1; this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1); this.dpr = dpr;
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.W = w; this.H = h;
  }

  /** Screen px (CSS) of a world point. */
  P(x, z, y = 0) {
    const s = toScreen(x - this.cam.x, z - this.cam.z, y, 0);
    return { sx: this.W / 2 + s.sx * this.zoom + this.shx, sy: this.H / 2 + s.sy * this.zoom + this.shy };
  }
  /** World point (on the ground plane at height y) under a screen px. */
  toWorldPoint(px, py, y = 0.35) {
    const sx = (px - this.W / 2) / this.zoom, sy = (py - this.H / 2) / this.zoom + y * PX_PER_HEIGHT;
    const [x, z] = toWorld(sx, sy, 0); return { x: x + this.cam.x, z: z + this.cam.z };
  }

  /** Camera: between the mech and its aim point, eased (the drawn mech position, never the raw one — lessons 51). */
  follow(mx, mz, ax, az, dt, lead = 0.28, maxLead = 2.2) {
    let lx = (ax - mx) * lead, lz = (az - mz) * lead; const ll = Math.hypot(lx, lz); if (ll > maxLead) { lx *= maxLead / ll; lz *= maxLead / ll; }
    const tx = mx + lx, tz = mz + lz;
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.z += (tz - this.cam.z) * k;
  }

  visible(x, z, pad = 3) { const p = this.P(x, z, 0); return p.sx > -pad * TILE_W * this.zoom && p.sx < this.W + pad * TILE_W * this.zoom && p.sy > -pad * 3 * TILE_H * this.zoom && p.sy < this.H + pad * TILE_H * this.zoom; }

  // ---------- ground ----------
  _diamond(ctx, x, z, w, d, fill) {
    const a = this.P(x, z), b = this.P(x + w, z), c = this.P(x + w, z + d), e = this.P(x, z + d);
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(e.sx, e.sy); ctx.closePath(); ctx.fill();
  }
  _ground(ctx, map) {
    if (map.interior) return this._interior(ctx, map);
    if (map.moon) { drawMoonGround(this, ctx, map); return this._scorch(ctx); }   // round 5: the moon outpost
    if (map.forest) { drawForestGround(this, ctx, map); return this._scorch(ctx); }   // Pinewatch: the pine forest
    if (map.snow) { drawSnowGround(this, ctx, map); return this._scorch(ctx); }   // round 6: the snowfield
    if (map.desert) { drawDesertGround(this, ctx, map); return this._scorch(ctx); }   // Red Mesa: the desert badlands
    const n = this.night;
    ctx.fillStyle = mixHex(C.ground, C.groundNight, n); ctx.fillRect(0, 0, this.W, this.H);
    // sidewalks under every block, then roads with lane marks, then plazas
    const walk = mixHex(C.walk, '#1a1d25', n * 0.7), road = mixHex(C.road, '#12151c', n * 0.6), plaza = mixHex(C.plaza, '#171a22', n * 0.7);
    this._diamond(ctx, 0, 0, map.w, map.h, walk);
    for (const [x, z, w, d] of map.plazas) this._diamond(ctx, x, z, w, d, plaza);
    for (const [x, z, w, d] of map.roads) this._diamond(ctx, x, z, w, d, road);
    ctx.save(); ctx.strokeStyle = mixHex(C.lane, '#6a5a20', n * 0.5); ctx.lineWidth = Math.max(1, 0.9 * this.zoom); ctx.setLineDash([6 * this.zoom, 7 * this.zoom]); ctx.globalAlpha = 0.55;
    for (const [x, z, w, d] of map.roads) {
      const horiz = w > d, a = horiz ? this.P(x, z + d / 2) : this.P(x + w / 2, z), b = horiz ? this.P(x + w, z + d / 2) : this.P(x + w / 2, z + d);
      if (Math.min(w, d) >= 2) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    }
    ctx.restore();
    this._scorch(ctx);
  }
  /** Scorch decals (stay all mission). */
  _scorch(ctx) {
    for (const d of this.decals) {
      if (!this.visible(d.x, d.z, 1)) continue;
      const p = this.P(d.x, d.z), rx = d.r * TILE_W * 0.5 * this.zoom;
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rx);
      g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.6, 'rgba(14,12,12,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5); ctx.translate(-p.sx, -p.sy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  /** Inside a hangar (map.interior): a concrete floor in big slabs, pools of light from the ceiling and the bays' neon,
   *  painted bay boxes with hazard stripes at their mouths, walkway lanes, the launch pad, and each bay's name
   *  stencilled on the floor (map.decor — see sim/hangarmap.js). Outside the walls is dark. */
  _interior(ctx, map) {
    const D = map.decor || {}, z = this.zoom;
    ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, this.W, this.H);
    this._diamond(ctx, 0, 0, map.w, map.h, '#2a2e35');
    // slab seams every 2 tiles + fine expansion joints
    ctx.save(); ctx.lineWidth = 1;
    for (let x = 0; x <= map.w; x += 1) { const a = this.P(x, 0), b = this.P(x, map.h); ctx.strokeStyle = x % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    for (let q = 0; q <= map.h; q += 1) { const a = this.P(0, q), b = this.P(map.w, q); ctx.strokeStyle = q % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    ctx.restore();
    // light pools (ceiling lamps, bay neon) — added light
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of D.lights || []) {
      if (!this.visible(L.x, L.z, L.r + 1)) continue;
      const p = this.P(L.x, L.z), rx = L.r * TILE_W * 0.5 * z * Math.SQRT2;
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rx);
      g.addColorStop(0, hexA(L.color, L.a ?? 0.2)); g.addColorStop(0.55, hexA(L.color, (L.a ?? 0.2) * 0.35)); g.addColorStop(1, hexA(L.color, 0));
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5); ctx.translate(-p.sx, -p.sy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    const outline = (x, q, w, d, color, width, dash = null) => { const a = this.P(x, q), b = this.P(x + w, q), c = this.P(x + w, q + d), e = this.P(x, q + d); ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(e.sx, e.sy); ctx.closePath(); ctx.stroke(); ctx.restore(); };
    // walkway lanes: dashed double lines
    for (const [x, q, w, d] of D.walkways || []) for (const off of [-0.18, 0.18]) {
      const a = this.P(x + (d ? off : 0), q + (w ? off : 0)), b = this.P(x + w + (d ? off : 0), q + d + (w ? off : 0));
      ctx.save(); ctx.strokeStyle = 'rgba(214,190,90,0.38)'; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.setLineDash([5 * z, 4 * z]); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.restore();
    }
    // bay boxes: a faint wash of the bay's colour, a painted yellow edge, a thin neon inner line
    for (const b of D.bays || []) {
      this._diamond(ctx, b.x, b.z, b.w, b.d, hexA(b.color, 0.07));
      outline(b.x + 0.06, b.z + 0.06, b.w - 0.12, b.d - 0.12, 'rgba(222,186,64,0.8)', Math.max(1.5, 1.1 * z));
      outline(b.x + 0.22, b.z + 0.22, b.w - 0.44, b.d - 0.44, hexA(b.color, 0.35), 1, [3 * z, 3 * z]);
    }
    // hazard stripes (bay mouths, the firing line)
    for (const s of D.stripes || []) this._stripes(ctx, s.x, s.z, s.w, s.d);
    // the launch pad: rings, a landing cross, corner chevrons and blinking edge lights
    if (D.pad) {
      const { x, z: q, r, color } = D.pad, p = this.P(x, q), rx = r * TILE_W * 0.5 * z * Math.SQRT2;
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5);
      ctx.fillStyle = 'rgba(30,38,52,0.55)'; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3 * z; ctx.strokeStyle = 'rgba(222,186,64,0.85)'; ctx.beginPath(); ctx.arc(0, 0, rx * 0.97, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.2 * z; ctx.strokeStyle = hexA(color, 0.55); ctx.setLineDash([8 * z, 6 * z]); ctx.beginPath(); ctx.arc(0, 0, rx * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const t = performance.now() / 1000;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, on = (Math.floor(t * 2) + i) % 3 === 0; ctx.fillStyle = on ? '#ffd27a' : 'rgba(255,210,122,0.25)'; ctx.beginPath(); ctx.arc(Math.cos(a) * rx * 0.97, Math.sin(a) * rx * 0.97, (on ? 2.6 : 1.8) * z, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // stencilled names on the floor (always visible: a new player sees where everything is)
    for (const L of D.labels || []) this._floorText(ctx, L);
    // the floor's open edges: a painted kerb line
    outline(0.02, 0.02, map.w - 0.04, map.h - 0.04, 'rgba(222,186,64,0.45)', Math.max(1, 0.8 * z));
  }

  /** Yellow/black diagonal stripes filling a floor rectangle (tiles). */
  _stripes(ctx, x, q, w, d) {
    const a = this.P(x, q), b = this.P(x + w, q), c = this.P(x + w, q + d), e = this.P(x, q + d);
    ctx.save(); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(e.sx, e.sy); ctx.closePath();
    ctx.fillStyle = 'rgba(20,20,22,0.85)'; ctx.fill(); ctx.clip();
    const minX = Math.min(a.sx, b.sx, c.sx, e.sx), maxX = Math.max(a.sx, b.sx, c.sx, e.sx), minY = Math.min(a.sy, b.sy, c.sy, e.sy), maxY = Math.max(a.sy, b.sy, c.sy, e.sy), st = 7 * this.zoom;
    ctx.strokeStyle = 'rgba(226,182,46,0.85)'; ctx.lineWidth = st * 0.5;
    for (let k = minX - (maxY - minY); k < maxX + st; k += st) { ctx.beginPath(); ctx.moveTo(k, maxY); ctx.lineTo(k + (maxY - minY), minY); ctx.stroke(); }
    ctx.restore();
  }

  /** A word painted flat on the floor: { text, x, z, axis: 'x' (reads along +x, wall at −z) | 'z' (reads along −z, wall at −x), size (tiles), color }. */
  _floorText(ctx, L) {
    if (!this.visible(L.x, L.z, 4)) return;
    const o = this.P(L.x, L.z), k = 1 / 100;                         // draw at 100 px per tile, then map onto the floor
    const ux = L.axis === 'x' ? this.P(L.x + 1, L.z) : this.P(L.x, L.z - 1), vx = L.axis === 'x' ? this.P(L.x, L.z + 1) : this.P(L.x + 1, L.z);
    ctx.save();
    ctx.transform((ux.sx - o.sx) * k, (ux.sy - o.sy) * k, (vx.sx - o.sx) * k, (vx.sy - o.sy) * k, o.sx, o.sy);
    ctx.font = `800 ${Math.round(L.size * 100)}px "Barlow Condensed", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = `${Math.round(L.size * 12)}px`; } catch { /* older canvas */ }
    const text = String(L.text).toUpperCase();
    if (L.maxW) { const w = ctx.measureText(text).width; if (w > L.maxW * 100) { const k2 = L.maxW * 100 / w; ctx.scale(k2, k2); } }   // long names shrink to fit their bay
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(text, 3, 3);
    ctx.fillStyle = hexA(L.color || '#e2b62e', 0.82); ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  scorch(x, z, r) { this.decals.push({ x, z, r }); if (this.decals.length > 400) this.decals.shift(); }

  // ---------- one frame ----------
  /**
   * S = mission state; lerp(obj) → { x, z, y } drawn position (between sim steps); me = the local player's mech.
   */
  draw(S, lerp, me, dt, t) {
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.localPid = S.localPid; this.reviveTime = S.T?.reviveTime || 3;
    this.localTeam = S.versus ? S.mechs.find(m => m.pid === S.localPid)?.team : null;
    this.fx.update(dt);
    const sh = this.fx.shakeOffset(14); this.shx = sh?.x || sh?.[0] || 0; this.shy = sh?.y || sh?.[1] || 0;
    const map = S.def.map;
    this.fadedNow = 0;
    this._ground(ctx, map);
    const P = (x, z, y) => this.P(x, z, y);
    this.fx.drawGround?.(ctx, P, this.zoom);
    this.underlay?.(ctx, P, t);           // a screen's own floor marks (the hangar's bay rings)

    // markers on the ground: objectives, extraction, artillery circles, pickups
    this._markers(ctx, S, t);
    drawBossMarks(ctx, this, S, t);       // boss wind-ups: the claw sweep and charge lane fill before they land

    const items = [];
    const mechPts = S.mechs.map(m => { const p = lerp(m); return { m, p, s: this.P(p.x, p.z, (p.y || 0) + 0.4) }; });
    // a boss stands as tall as the buildings: those in front of her fade too, so she is never lost behind a tower
    const fadePts = mechPts.concat(S.enemies.filter(e => e.parts && !e.dead).map(e => { const p = lerp(e); return { m: e, p, s: this.P(p.x, p.z, 0.5) }; }));
    for (const l of S.world.lots) {
      if (!this.visible(l.x + l.w / 2, l.z + l.d / 2, 2 + Math.max(l.w, l.d))) continue;
      const depth = l.x + l.w + l.z + l.d - 1;
      items.push({ d: depth, draw: () => this._lot(ctx, l, depth, fadePts, dt) });
    }
    for (const e of S.enemies) {
      if (e.dead && !e.deadT) continue;
      const p = lerp(e); if (!this.visible(p.x, p.z, 1)) continue;
      items.push({ d: p.x + p.z, draw: () => this._enemy(ctx, S, e, p, t) });
    }
    for (const d of S.deployed) items.push({ d: d.x + d.z, draw: () => this._deployed(ctx, d, t) });
    for (const a of S.allies || []) if (!a.arrived && this.visible(a.x, a.z, 1)) { const p = lerp(a); items.push({ d: p.x + p.z, draw: () => this._ally(ctx, S, a, p, t) }); }
    // the drop-in: the dropship comes down over the start with your frame under it, lets go, and climbs away
    let dropAlt = 0;
    if (S.phase === 'drop' && S.def.drop && S.def.orbital) {       // orbital drop: a burning streak falling onto the landing reticle
      for (const q of mechPts) items.push({ d: q.p.x + q.p.z + 60, draw: () => this._fall(ctx, q.m, q.p, t) });
    } else if (S.phase === 'drop' && S.def.drop && !S.versus) {        // versus: the sides start on the ground
      const k = 1 - Math.max(0, S.phaseT) / S.def.drop, st = S.def.start[0];      // 0 → 1 over the drop
      const shipY = k < 0.55 ? 3.6 - k / 0.55 * 2.0 : k < 0.7 ? 1.6 : 1.6 + (k - 0.7) * 12;
      dropAlt = k < 0.6 ? shipY - 0.75 : 0.85 * (1 - ((k - 0.6) / 0.4) ** 2);       // let go at 0.6, lands as the drop ends
      items.push({ d: st.x + st.z + 50, draw: () => this._dropship(ctx, st, shipY, t) });
    }
    this.dropAlt = dropAlt;
    for (const q of mechPts) items.push({ d: q.p.x + q.p.z + 0.01, draw: () => this._mech(ctx, q.m, { ...q.p, y: (q.p.y || 0) + (q.m.pid === S.localPid ? dropAlt : 0) }, t) });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();
    drawRoles(ctx, this, S, lerp, t);     // round 5 roles, over the scene (render/roles-art.js)
    if (map.snow) drawSnowOver(ctx, this, map, t);   // round 6: the ski lift's cables and cabins, over everything on the ground

    this._shots(ctx, S, t);
    this._pings(ctx, S, lerp, dt, t);
    this.fx.drawSolid(ctx, P, this.zoom);
    this.fx.drawLights(ctx, P, this.zoom);
    this._ambient(ctx, S, t);
    this._numbers(ctx, dt);
    this.fx.drawFlash?.(ctx, this.W, this.H);
  }

  /** Drifting motes over the whole view — dust under the hangar lights, ash over a city at war. Cheap (a few dozen
   *  dots in screen space, tied to the camera so they read as being in the air), and the scene is never dead still. */
  _ambient(ctx, S, t) {
    if (S.def.map.snow) return drawSnowfall(this, ctx, t);           // round 6: falling snow instead of ash
    const indoor = !!S.def.map.interior || S.def.kind === 'hangar' || S.def.kind === 'range', n = indoor ? 60 : 44;
    const W = this.W, H = this.H, cx = this.cam.x * 40, cz = this.cam.z * 40;
    ctx.save(); ctx.globalCompositeOperation = indoor ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.123, r1 = h1 - Math.floor(h1), r2 = h2 - Math.floor(h2);
      const sp = 6 + r2 * 14, x = ((r1 * W * 1.3 + t * sp * (indoor ? 0.6 : 1.4) - cx * 0.3) % (W * 1.1) + W * 1.1) % (W * 1.1) - W * 0.05;
      const y = ((r2 * H * 1.2 + t * sp * (indoor ? -0.35 : 0.8) + Math.sin(t * 0.7 + i) * 8 - cz * 0.3) % (H * 1.1) + H * 1.1) % (H * 1.1) - H * 0.05;
      const a = (indoor ? 0.18 : 0.22) * (0.5 + 0.5 * Math.sin(t * (0.8 + r1) + i));
      ctx.fillStyle = indoor ? `rgba(255,232,190,${a.toFixed(3)})` : S.def.map.forest ? `rgba(236,232,170,${a.toFixed(3)})` : `rgba(150,140,130,${a.toFixed(3)})`;   // forest: pollen and seed fluff in the sun
      const sz = 2 + r1 * 2.2; ctx.fillRect(x, y, sz, sz);
    }
    ctx.restore();
  }

  _lot(ctx, l, depth, mechPts, dt) {
    const params = l.params || {};
    // props that face a way (forklifts, crew, the parked dropship) bake per screen direction; buildings per wreck stage
    const sp = l.face != null ? this.sprites.facing(l.recipe, params, l.face) : this.sprites.building(l.recipe || 'fuel-tanks', params, l.stage);
    // fade when it stands in front of a mech and covers it on screen
    let want = 1;
    for (const q of mechPts) {
      if (q.p.x + q.p.z > depth + 0.2) continue;
      const a = this.P(l.x, l.z + l.d), b = this.P(l.x + l.w, l.z), top = this.P(l.x + l.w / 2, l.z + l.d / 2, l.h);
      if (q.s.sx > a.sx - 10 && q.s.sx < b.sx + 10 && q.s.sy > top.sy - 20 && q.s.sy < this.P(l.x + l.w, l.z + l.d).sy) { want = 0.28; break; }
    }
    if (want < 1) this.fadedNow = (this.fadedNow || 0) + 1;
    const cur = this.fade.get(l.id) ?? 1, a = cur + (want - cur) * Math.min(1, dt * 8); this.fade.set(l.id, a);
    const c = this.P(l.x + l.w / 2, l.z + l.d / 2);
    if (sp) compositeA(ctx, sp, c.sx, c.sy, this.night, this.zoom / this.sprites.scale, a);
    else { ctx.save(); ctx.globalAlpha = a; this._box(ctx, l); ctx.restore(); }
    if (l.flash > 0) { l.flash -= dt; }
  }

  /** Stand-in while a building's picture bakes: a plain block of the right size. */
  _box(ctx, l) {
    const h = l.stage >= 3 ? 0.05 : l.h, top = [[0, 0], [l.w, 0], [l.w, l.d], [0, l.d]].map(([dx, dz]) => this.P(l.x + dx, l.z + dz, h));
    const base = [[l.w, 0], [l.w, l.d], [0, l.d]].map(([dx, dz]) => this.P(l.x + dx, l.z + dz, 0));
    ctx.fillStyle = '#3a404c'; ctx.beginPath(); ctx.moveTo(top[1].sx, top[1].sy); ctx.lineTo(base[0].sx, base[0].sy); ctx.lineTo(base[1].sx, base[1].sy); ctx.lineTo(top[2].sx, top[2].sy); ctx.fill();
    ctx.fillStyle = '#2e333d'; ctx.beginPath(); ctx.moveTo(top[2].sx, top[2].sy); ctx.lineTo(base[1].sx, base[1].sy); ctx.lineTo(base[2].sx, base[2].sy); ctx.lineTo(top[3].sx, top[3].sy); ctx.fill();
    ctx.fillStyle = '#4a5160'; ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy))); ctx.fill();
  }

  _enemy(ctx, S, e, p, t) {
    if (e.parts) return drawBoss(ctx, this, S, e, p, t);    // part-breakable bosses (render/boss-art.js)
    const K = S.kinds[e.kind];
    const sc = this.zoom / this.sprites.scale;
    const dir = dirOfHeading(e.anim === 'fire' || e.anim === 'aim' ? e.aim ?? e.face : e.face, DIRS, 0);
    if (e.state === 'warn') {                  // spawn warning: a pulsing ring + a faint ghost, never a surprise
      const q = this.P(p.x, p.z), k = 0.5 + 0.5 * Math.sin(t * 18);
      ctx.save(); ctx.strokeStyle = K.faction === 'swarm' ? '#ff5a3a' : '#ffb02e'; ctx.globalAlpha = 0.35 + 0.4 * k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(q.sx, q.sy, e.r * TILE_W * 0.8 * this.zoom + 4, e.r * TILE_H * 0.8 * this.zoom + 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      return;
    }
    if (e.hidden) {                            // burrowing: a moving ripple in the ground shows where
      const q = this.P(p.x, p.z); ctx.save(); ctx.fillStyle = 'rgba(120,90,60,0.55)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(q.sx + Math.sin(t * 9 + i) * 3, q.sy, (6 + i * 3) * this.zoom * 0.5, (3 + i * 1.5) * this.zoom * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore(); return;
    }
    const anim = this.sprites.animOf(K.recipe, e.anim || 'walk');
    const nf = this.sprites.frames(K.recipe, anim);
    const fps = anim === 'walk' || anim === 'run' ? 10 : 8;
    const frame = Math.floor((e.animT || 0) * fps) % Math.max(1, nf);
    const sp = this.sprites.facing(K.recipe, { seed: e.elite ? 2 : 1 }, dir, anim, frame);
    const q = this.P(p.x, p.z, e.flying || 0);
    if (e.flying) { const g = this.P(p.x, p.z, 0); ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, e.r * TILE_W * this.zoom * 0.7, e.r * TILE_H * this.zoom * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (sp) {
      const n = this.night * UNIT_NIGHT;
      if (e.hurtT > 0 || (S.time - (e.lastHit || -9)) < 0.06) { composite(ctx, sp, q.sx, q.sy, n, sc); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; composite(ctx, sp, q.sx, q.sy, 0, sc); ctx.restore(); }
      else composite(ctx, sp, q.sx, q.sy, n, sc);
    } else {
      ctx.fillStyle = K.faction === 'swarm' ? '#7a3a2a' : '#5a6070'; ctx.beginPath(); ctx.ellipse(q.sx, q.sy - e.r * 20 * this.zoom, e.r * TILE_W * 0.6 * this.zoom, e.r * TILE_W * 0.45 * this.zoom, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (e.elite) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6); ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.ellipse(q.sx, q.sy, e.r * TILE_W * this.zoom, e.r * TILE_H * this.zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    // health bar only on big things that have been hit
    if ((K.radius > 0.2 || K.structure || e.elite || e.boss) && e.hp < e.hpMax) {
      const w = Math.max(26, e.r * 120) * this.zoom * 0.5, y = q.sy - (e.r * 2.6 + (e.flying ? 0.3 : 0.35)) * PX_PER_HEIGHT * this.zoom;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(q.sx - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = K.faction === 'swarm' ? '#ff6b4a' : '#ffb02e'; ctx.fillRect(q.sx - w / 2, y, w * Math.max(0, e.hp / e.hpMax), 3);
    }
  }

  _deployed(ctx, d, t) {
    const q = this.P(d.x, d.z, d.flying || 0);
    ctx.save(); ctx.fillStyle = d.kind === 'mine' ? '#ff4040' : '#9fe8ff'; ctx.globalAlpha = d.kind === 'mine' ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
    ctx.beginPath(); ctx.arc(q.sx, q.sy - 4, d.kind === 'mine' ? 3 : 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  _mech(ctx, m, p, t) {
    const q = this.P(p.x, p.z, p.y || 0), g = this.P(p.x, p.z, 0);
    if (m.team === 'enemy' && drawEnemyMech(ctx, this, m, p, t, true)) return;   // a rival ace dropping in
    if (m.odT > 0) {                               // an Overload running: an aura on the ground in its colour
      const col = m.odK === 'surge' ? '255,176,46' : m.odK === 'bastion' ? '63,240,255' : '196,107,255', rx = (0.55 + 0.08 * Math.sin(t * 9)) * TILE_W * 0.5 * this.zoom * Math.SQRT2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, rx);
      gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.fill();
      if (m.odK === 'bastion') { ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(g.sx, g.sy - 0.45 * PX_PER_HEIGHT * this.zoom, rx * 0.9, 0.6 * PX_PER_HEIGHT * this.zoom, 0, Math.PI, 0); ctx.stroke(); }
      ctx.restore();
    }
    if (this.mechDrawer) this.mechDrawer(ctx, m, g.sx, g.sy, this.zoom, this.night * UNIT_NIGHT, t, p.y || 0);
    else { ctx.fillStyle = '#9aa4b4'; ctx.fillRect(q.sx - 8, q.sy - 40, 16, 40); }
    if (m.team === 'enemy') { drawEnemyMech(ctx, this, m, p, t, false); return; }
    if (m.down) {
      ctx.save(); ctx.fillStyle = '#ff5a3a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); ctx.beginPath(); ctx.arc(q.sx, q.sy - 0.9 * PX_PER_HEIGHT * this.zoom, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // revive: a ring on the ground that fills while a teammate stands in it
      const rx = 0.7 * TILE_W * 0.5 * this.zoom * Math.SQRT2, k = Math.min(1, (m.reviveT || 0) / this.reviveTime);
      ctx.save(); ctx.strokeStyle = '#5fffb0'; ctx.lineWidth = 2; ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 4); ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (k > 0) { ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    // a teammate: name and health over the frame (yours is in the cockpit arcs)
    if (m.pid && m.pid !== this.localPid) {
      const y = q.sy - 1.15 * PX_PER_HEIGHT * this.zoom, w = 46, f = Math.max(0, m.hp / (m.hpMax || 1));
      const foe = this.localTeam && m.team !== this.localTeam, side = m.team === 'red' ? '#ff8a8a' : m.team === 'blue' ? '#8ac8ff' : foe ? '#ffb46a' : null;   // versus: by side
      ctx.save(); ctx.font = '600 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(m.name || 'Pilot', q.sx, y - 5); ctx.fillStyle = m.down ? '#ff8a6a' : side || '#bff8ff'; ctx.fillText(m.name || 'Pilot', q.sx, y - 5);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(q.sx - w / 2 - 1, y - 1, w + 2, 5); ctx.fillStyle = foe ? '#ff5a3a' : f > 0.35 ? '#3ff0ff' : '#ff5a3a'; ctx.fillRect(q.sx - w / 2, y, w * f, 3);
      ctx.restore();
    }
  }

  /** A co-op ping (ping events): a marker the whole team sees for a few seconds — a ring and a beam on the spot (red
   *  over an enemy), and an arrow at the screen edge while it's off screen. Teammates off screen get an edge arrow too. */
  ping(ev) { this.pings.push({ x: ev.x, z: ev.z, target: ev.target, by: ev.id, kind: ev.kind, age: 0 }); if (this.pings.length > 12) this.pings.shift(); }
  _pings(ctx, S, lerp, dt, t) {
    const edge = (x, z, col, label) => {
      const p = this.P(x, z, 0.4), m = 28; if (p.sx > m && p.sx < this.W - m && p.sy > m && p.sy < this.H - m) return false;
      const cx = this.W / 2, cy = this.H / 2, dx = p.sx - cx, dy = p.sy - cy, k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k, ay = cy + dy * k, a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      if (label) { ctx.save(); ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; const ly = ay + (ay > cy ? -16 : 22); ctx.strokeText(label, ax, ly); ctx.fillText(label, ax, ly); ctx.restore(); }
      return true;
    };
    this.pings = this.pings.filter(p => (p.age += dt) < 6);
    for (const p of this.pings) {
      const tgt = p.target && S.byId.get(p.target); if (tgt && !tgt.dead) { const q = lerp(tgt); p.x = q.x; p.z = q.z; }
      const col = p.kind === 'enemy' ? '#ff4a3a' : '#ffd34a', fade = Math.min(1, (6 - p.age) / 0.8), pulse = 0.5 + 0.5 * Math.sin(t * 8);
      const g = this.P(p.x, p.z), top = this.P(p.x, p.z, 2.6), rx = (0.55 + 0.25 * Math.min(1, p.age * 3)) * TILE_W * 0.5 * this.zoom * Math.SQRT2;
      ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * (0.35 + 0.3 * pulse); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
      ctx.restore();
      const who = S.byId.get(p.by)?.name || '';
      if (!edge(p.x, p.z, col, who)) { ctx.save(); ctx.globalAlpha = fade; ctx.font = '700 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(who, top.sx, top.sy - 4); ctx.fillText(who, top.sx, top.sy - 4); ctx.restore(); }
    }
    for (const m of S.mechs) if (m.pid && m.pid !== S.localPid && m.team !== 'enemy') { const q = lerp(m); edge(q.x, q.z, m.down ? '#ff8a6a' : '#3ff0ff', m.name || ''); }
    // where the job is (owner reports 2026-11-18: an arrow to the dropship after the job; "I don't know what the tank
    // farms look like — no indicators"): an arrow at the screen edge to each target off screen (the nearest few, with
    // their distance), a beam on each one on screen. One list: render/targets.js (the minimap reads it too).
    const me = S.mechs.find(m => m.pid === S.localPid) || S.mechs[0];
    const list = objectiveTargets(S).map(g => ({ ...g, d: me ? Math.hypot(g.x - me.x, g.z - me.z) : 0 })).sort((a, b) => a.d - b.d);
    const k = 0.5 + 0.5 * Math.sin(t * 4), groups = [];
    for (const g of list) {
      const p = this.P(g.x, g.z, 0.4), m = 28, onScreen = p.sx > m && p.sx < this.W - m && p.sy > m && p.sy < this.H - m;
      if (!onScreen) {                                // off screen: one arrow per direction (the nearest leads, the rest count)
        const ang = Math.atan2(p.sy - this.H / 2, p.sx - this.W / 2), grp = groups.find(q => q.label === g.label && Math.abs(Math.atan2(Math.sin(q.ang - ang), Math.cos(q.ang - ang))) < 0.3);
        if (grp) grp.n++; else groups.push({ ...g, ang, n: 1 });
        continue;
      }
      const a = this.P(g.x, g.z, 0), b = this.P(g.x, g.z, g.kind === 'build' ? (g.lot?.h || 1) + 1.6 : 2.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
      gr.addColorStop(0, g.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.strokeStyle = gr; ctx.lineWidth = g.kind === 'extract' ? 6 : 4;
      ctx.globalAlpha = 0.45 + 0.35 * k; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.restore();
    }
    for (const q of groups.slice(0, 4)) edge(q.x, q.z, q.color, `${q.n > 1 ? `${q.n} ${q.label.toLowerCase()}s` : q.label} ${Math.round(q.d * 16)} m`);
  }

  _dropship(ctx, st, y, t) {
    const sp = this.sprites.facing('of-dropship', { cargo: 0 }, 5, 'hover', Math.floor(t * 8) % 4);
    const g = this.P(st.x, st.z, 0); ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 0.7 * TILE_W * this.zoom * 0.5, 0.7 * TILE_H * this.zoom * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (!sp) return;
    // the ship model hovers 1.1 tiles up inside its own picture; lift the whole picture so its belly is at y
    const q = this.P(st.x, st.z, y - 1.1); composite(ctx, sp, q.sx, q.sy, this.night * UNIT_NIGHT, this.zoom / this.sprites.scale);
    this.fx.light(st.x, st.z, 0.9, 0.05, '#3ff0ff', 0.5);
  }

  /** A friendly convoy truck (escort missions): the City Kit hauler in cobalt, a cyan ring, a health bar once hit. */
  _ally(ctx, S, a, p, t) {
    const sc = this.zoom / this.sprites.scale, dir = dirOfHeading(a.face || 0, DIRS, 0), q = this.P(p.x, p.z);
    ctx.save(); ctx.strokeStyle = a.down ? 'rgba(255,90,58,0.6)' : 'rgba(63,240,255,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(q.sx, q.sy, a.r * TILE_W * this.zoom * 1.1, a.r * TILE_H * this.zoom * 1.1, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    const sp = this.sprites.facing('veh-hauler', { paint: a.down ? 5 : 3 }, dir, 'drive', a.down ? 0 : Math.floor(t * 8) % 2);
    if (sp) { ctx.save(); if (a.down) ctx.filter = 'brightness(0.45)'; composite(ctx, sp, q.sx, q.sy, this.night * UNIT_NIGHT, sc); ctx.restore(); }
    if (!a.down && a.hp < a.hpMax) {
      const w = 34 * this.zoom * 0.5, y = q.sy - 0.75 * PX_PER_HEIGHT * this.zoom;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(q.sx - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = a.hp / a.hpMax > 0.35 ? '#3ff0ff' : '#ff5a3a'; ctx.fillRect(q.sx - w / 2, y, w * a.hp / a.hpMax, 3);
    }
  }

  /** Orbital drop: the frame falls as a burning streak; a reticle on the ground shows where it will land. */
  _fall(ctx, m, p, t) {
    const g = this.P(p.x, p.z), k = 0.5 + 0.5 * Math.sin(t * 10), rx = 1.6 * TILE_W * 0.5 * this.zoom * Math.SQRT2;
    ctx.save(); ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + 0.3 * k;
    ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx * 0.5, rx * 0.25, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.beginPath(); ctx.moveTo(g.sx + Math.cos(a) * rx * 0.6, g.sy + Math.sin(a) * rx * 0.3); ctx.lineTo(g.sx + Math.cos(a) * rx * 1.15, g.sy + Math.sin(a) * rx * 0.575); ctx.stroke(); }
    ctx.restore();
    const alt = Math.min(p.y || 0, 4.5);                         // drawn height: high enough to read as falling, still on screen
    const hi = this.P(p.x, p.z, alt + 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(hi.sx, hi.sy - 160 * this.zoom, hi.sx, hi.sy);
    grad.addColorStop(0, 'rgba(255,120,40,0)'); grad.addColorStop(1, 'rgba(255,200,120,0.9)');
    ctx.strokeStyle = grad; ctx.lineWidth = 10 * this.zoom * 0.5; ctx.beginPath(); ctx.moveTo(hi.sx, hi.sy - 160 * this.zoom); ctx.lineTo(hi.sx, hi.sy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,160,0.95)'; ctx.beginPath(); ctx.arc(hi.sx, hi.sy, (7 + 3 * k) * this.zoom * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    this._mech(ctx, m, { ...p, y: alt }, t);
  }

  _markers(ctx, S, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const ring = (x, z, r, color, alpha = 0.8, dash = null) => { const p = this.P(x, z); ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 2; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r * TILE_W * 0.5 * this.zoom * Math.SQRT2, r * TILE_H * 0.5 * this.zoom * Math.SQRT2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); };
    const beacon = (x, z, color) => { const a = this.P(x, z, 0), b = this.P(x, z, 2.2); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.globalAlpha = 0.5 + 0.3 * pulse; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.restore(); };
    const O = S.ops;
    if (O) {
      // sabotage masts: an amber ring that fills as the charge is set
      for (const m of O.plants) {
        const q = this.P(m.x, m.z), rx = 0.6 * TILE_W * 0.5 * this.zoom * Math.SQRT2, f = Math.min(1, m.t / 3);
        ctx.save(); ctx.strokeStyle = m.done ? '#5fffb0' : '#ffb02e'; ctx.lineWidth = 2; ctx.globalAlpha = m.done ? 0.5 : 0.7 + 0.3 * pulse;
        ctx.beginPath(); ctx.ellipse(q.sx, q.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
        if (!m.done && f > 0) { ctx.fillStyle = 'rgba(255,176,46,0.35)'; ctx.beginPath(); ctx.ellipse(q.sx, q.sy, rx * f, rx * f / 2, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore(); if (!m.done) beacon(m.x, m.z, '#ffb02e');
      }
      // the data core: a cyan crystal on the ground (or over its carrier)
      const c = O.core;
      if (c && !c.home) {
        const q = this.P(c.x, c.z, c.carrier ? 1.0 : 0.15 + Math.sin(t * 3) * 0.04), s = 6 * this.zoom * 0.5;
        ctx.save(); ctx.fillStyle = '#3ff0ff'; ctx.shadowColor = '#3ff0ff'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(q.sx, q.sy - s * 1.6); ctx.lineTo(q.sx + s, q.sy); ctx.lineTo(q.sx, q.sy + s * 1.6); ctx.lineTo(q.sx - s, q.sy); ctx.fill(); ctx.restore();
        if (!c.carrier) { beacon(c.x, c.z, '#3ff0ff'); if (c.pick > 0) { const g = this.P(c.x, c.z); ctx.save(); ctx.strokeStyle = '#3ff0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.sx, g.sy - 18, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.pick / 1.2)); ctx.stroke(); ctx.restore(); } }
        else if (S.def.extract) { const e = S.def.extract; ring(e.x, e.z, e.r, '#3ff0ff', 0.5 + 0.4 * pulse); }
      }
      // convoys: where the trucks are heading (red = stop them before it, cyan = get them there)
      if (O.route && S.def.convoy) { const x = O.route.exit, col = S.def.convoy.side === 'ally' ? '#3ff0ff' : '#ff5a3a'; ring(x.x, x.z, 1.4, col, 0.4 + 0.4 * pulse, [10, 6]); beacon(x.x, x.z, col); }
      for (const e of O.convoyUnits) if (!e.dead && this.visible(e.x, e.z, 1)) ring(e.x, e.z, 0.4, '#ff5a3a', 0.5 + 0.3 * pulse);
    }
    for (const e of S.enemies) if (e.tag === 'target' && !e.dead) { ring(e.x, e.z, e.r + 0.35, '#ff3b3b', 0.6 + 0.4 * pulse, [6, 4]); beacon(e.x, e.z, '#ff3b3b'); }
    for (const k of S.strikes) {                                  // artillery: a red circle that fills as the shell falls
      const p = this.P(k.x, k.z), rx = k.r * TILE_W * 0.5 * this.zoom * Math.SQRT2, ry = rx / 2, fill = Math.max(0, 1 - k.t / 1.6);
      ctx.save(); ctx.fillStyle = 'rgba(255,60,40,0.18)'; ctx.strokeStyle = '#ff4030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,80,50,0.35)'; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx * fill, ry * fill, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    for (const o of S.objectives) if (o.lots && !o.done && o.type === 'destroy') for (const id of o.lots) {
      const l = S.world.lots.find(x => x.id === id); if (!l || l.stage >= 3) continue;
      ring(l.x + l.w / 2, l.z + l.d / 2, Math.max(l.w, l.d) * 0.75, '#ffb02e', 0.5 + 0.4 * pulse, [8, 6]);
    }
    // round 5: a zone to hold (survive with x/z/r — the moon's landing pad): solid while a frame holds it, dashed when empty
    for (const o of S.objectives) if (o.type === 'survive' && o.r && !o.done) { ring(o.x, o.z, o.r, '#3ff0ff', o.held ? 0.75 : 0.45 + 0.4 * pulse, o.held ? null : [10, 6]); if (!o.held) beacon(o.x, o.z, '#3ff0ff'); }
    if (S.phase === 'extract' && S.def.extract) { const e = S.def.extract; ring(e.x, e.z, e.r, '#5fffb0', 0.6 + 0.4 * pulse); ring(e.x, e.z, e.r * (1 + pulse * 0.3), '#5fffb0', 0.3); }
    for (const p of S.pickups) {
      if (p.owner !== S.localPid) continue;
      const q = this.P(p.x, p.z, 0.08 + Math.sin(t * 4 + p.x) * 0.03);
      const col = p.part ? '#c46bff' : p.mat === 'chitin' ? '#a8ff2e' : p.mat === 'siegeplate' ? '#ffd24a' : p.mat === 'exotic' ? '#ff9a2e' : p.mat === 'alloy' ? '#4aa8ff' : '#c9ced6';
      ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath();
      const s = (p.part ? 6 : 4) * this.zoom * 0.5; ctx.moveTo(q.sx, q.sy - s); ctx.lineTo(q.sx + s, q.sy); ctx.lineTo(q.sx, q.sy + s); ctx.lineTo(q.sx - s, q.sy); ctx.fill(); ctx.restore();
    }
  }

  _shots(ctx, S, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of S.shots) {
      const a = this.P(s.x, s.z, s.y ?? 0.4);
      const col = SHOT_COLOURS[s.dtype] || '#ffd27a';
      if (s.kind === 'missile') {
        const b = this.P(s.x - s.vx * 0.05, s.z - s.vz * 0.05, s.y ?? 0.4);
        ctx.strokeStyle = '#ffe2a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        ctx.fillStyle = '#ffb35a'; ctx.beginPath(); ctx.arc(b.sx, b.sy, 3, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.18) this.fx.smoke(s.x, s.z, 1, { life: [0.3, 0.5], size: [2, 4], spread: 0.02, rise: 0.1, color: '#9a9aa0' });
        continue;
      }
      if (s.lob) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a.sx, a.sy, s.team === 'enemy' ? 4 : 3.5, 0, Math.PI * 2); ctx.fill(); if (s.team === 'enemy' && s.tx != null) { const g = this.P(s.tx, s.tz); ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(255,90,50,0.6)'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, (s.splash || 0.4) * TILE_W * 0.7 * this.zoom, (s.splash || 0.4) * TILE_H * 0.7 * this.zoom, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } continue; }
      if (s.flame) { const k = s.age / s.life; ctx.fillStyle = k < 0.4 ? '#ffe08a' : '#ff6a2a'; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(a.sx, a.sy, (3 + k * 10) * this.zoom * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; continue; }
      const len = s.team === 'enemy' ? 0.05 : 0.07;
      const b = this.P(s.x - s.vx * len, s.z - s.vz * len, s.y ?? 0.4);
      ctx.strokeStyle = s.team === 'enemy' ? '#ff7a5a' : col; ctx.lineWidth = s.team === 'enemy' ? 3 : 2.5;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.restore();
  }

  /** Damage numbers: rounded, colour by crit tier (white, yellow, orange, red), small for chip damage. */
  number(x, z, y, amount, tier = 0) {
    if (amount < 1) return;
    this.numbers.push({ x, z, y: y + 0.5, vy: 0.9, life: 0.8, age: 0, text: String(Math.round(amount)), tier, size: Math.min(1.6, 0.85 + Math.log10(amount + 1) * 0.18) * (tier ? 1.15 + tier * 0.1 : 1) });
    if (this.numbers.length > 120) this.numbers.splice(0, this.numbers.length - 120);
  }
  _numbers(ctx, dt) {
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const n of this.numbers) {
      n.age += dt; n.y += n.vy * dt; n.vy *= 0.92;
      const k = n.age / n.life; if (k >= 1) continue;
      const p = this.P(n.x, n.z, n.y);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `800 ${Math.round(13 * n.size)}px "Barlow Condensed", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(n.text, p.sx, p.sy);
      ctx.fillStyle = CRIT_COLOURS[Math.min(n.tier, CRIT_COLOURS.length - 1)]; ctx.fillText(n.text, p.sx, p.sy);
    }
    ctx.restore();
    this.numbers = this.numbers.filter(n => n.age < n.life);
  }
}

/** Mechs and enemies are lit by the fight (muzzle flashes, fires, street light): they darken only half as much as the
 *  buildings at night, so they always read against the street. */
const UNIT_NIGHT = 0.5;

export const SHOT_COLOURS = { kinetic: '#ffd27a', energy: '#7fe8ff', explosive: '#ffb35a', fire: '#ff8a3a', electric: '#b49bff' };
export const CRIT_COLOURS = ['#f2f4f8', '#ffe14a', '#ff9a2e', '#ff3b3b', '#ff5adf'];

/** '#rrggbb' + alpha → rgba(). */
function hexA(h, a) { const v = parseInt(h.slice(1), 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; }

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
