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
    // scorch decals (stay all mission)
    for (const d of this.decals) {
      if (!this.visible(d.x, d.z, 1)) continue;
      const p = this.P(d.x, d.z), rx = d.r * TILE_W * 0.5 * this.zoom;
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rx);
      g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.6, 'rgba(14,12,12,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5); ctx.translate(-p.sx, -p.sy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  scorch(x, z, r) { this.decals.push({ x, z, r }); if (this.decals.length > 400) this.decals.shift(); }

  // ---------- one frame ----------
  /**
   * S = mission state; lerp(obj) → { x, z, y } drawn position (between sim steps); me = the local player's mech.
   */
  draw(S, lerp, me, dt, t) {
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fx.update(dt);
    const sh = this.fx.shakeOffset(14); this.shx = sh?.x || sh?.[0] || 0; this.shy = sh?.y || sh?.[1] || 0;
    const map = S.def.map;
    this.fadedNow = 0;
    this._ground(ctx, map);
    const P = (x, z, y) => this.P(x, z, y);
    this.fx.drawGround?.(ctx, P, this.zoom);

    // markers on the ground: objectives, extraction, artillery circles, pickups
    this._markers(ctx, S, t);

    const items = [];
    const mechPts = S.mechs.map(m => { const p = lerp(m); return { m, p, s: this.P(p.x, p.z, (p.y || 0) + 0.4) }; });
    for (const l of S.world.lots) {
      if (!this.visible(l.x + l.w / 2, l.z + l.d / 2, 2 + Math.max(l.w, l.d))) continue;
      const depth = l.x + l.w + l.z + l.d - 1;
      items.push({ d: depth, draw: () => this._lot(ctx, l, depth, mechPts, dt) });
    }
    for (const e of S.enemies) {
      if (e.dead && !e.deadT) continue;
      const p = lerp(e); if (!this.visible(p.x, p.z, 1)) continue;
      items.push({ d: p.x + p.z, draw: () => this._enemy(ctx, S, e, p, t) });
    }
    for (const d of S.deployed) items.push({ d: d.x + d.z, draw: () => this._deployed(ctx, d, t) });
    // the drop-in: the dropship comes down over the start with your frame under it, lets go, and climbs away
    let dropAlt = 0;
    if (S.phase === 'drop' && S.def.drop) {
      const k = 1 - Math.max(0, S.phaseT) / S.def.drop, st = S.def.start[0];      // 0 → 1 over the drop
      const shipY = k < 0.55 ? 3.6 - k / 0.55 * 2.0 : k < 0.7 ? 1.6 : 1.6 + (k - 0.7) * 12;
      dropAlt = k < 0.6 ? shipY - 0.75 : 0.85 * (1 - ((k - 0.6) / 0.4) ** 2);       // let go at 0.6, lands as the drop ends
      items.push({ d: st.x + st.z + 50, draw: () => this._dropship(ctx, st, shipY, t) });
    }
    this.dropAlt = dropAlt;
    for (const q of mechPts) items.push({ d: q.p.x + q.p.z + 0.01, draw: () => this._mech(ctx, q.m, { ...q.p, y: (q.p.y || 0) + (q.m.pid === S.localPid ? dropAlt : 0) }, t) });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();

    this._shots(ctx, S, t);
    this.fx.drawSolid(ctx, P, this.zoom);
    this.fx.drawLights(ctx, P, this.zoom);
    this._numbers(ctx, dt);
    this.fx.drawFlash?.(ctx, this.W, this.H);
  }

  _lot(ctx, l, depth, mechPts, dt) {
    const params = l.params || {};
    const sp = this.sprites.building(l.recipe || 'fuel-tanks', params, l.stage);
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
    if (this.mechDrawer) this.mechDrawer(ctx, m, g.sx, g.sy, this.zoom, this.night * UNIT_NIGHT, t, p.y || 0);
    else { ctx.fillStyle = '#9aa4b4'; ctx.fillRect(q.sx - 8, q.sy - 40, 16, 40); }
    if (m.down) { ctx.save(); ctx.fillStyle = '#ff5a3a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); ctx.beginPath(); ctx.arc(q.sx, q.sy - 0.9 * PX_PER_HEIGHT * this.zoom, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }

  _dropship(ctx, st, y, t) {
    const sp = this.sprites.facing('of-dropship', { cargo: 0 }, 5, 'hover', Math.floor(t * 8) % 4);
    const g = this.P(st.x, st.z, 0); ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 0.7 * TILE_W * this.zoom * 0.5, 0.7 * TILE_H * this.zoom * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (!sp) return;
    // the ship model hovers 1.1 tiles up inside its own picture; lift the whole picture so its belly is at y
    const q = this.P(st.x, st.z, y - 1.1); composite(ctx, sp, q.sx, q.sy, this.night * UNIT_NIGHT, this.zoom / this.sprites.scale);
    this.fx.light(st.x, st.z, 0.9, 0.05, '#3ff0ff', 0.5);
  }

  _markers(ctx, S, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const ring = (x, z, r, color, alpha = 0.8, dash = null) => { const p = this.P(x, z); ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 2; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r * TILE_W * 0.5 * this.zoom * Math.SQRT2, r * TILE_H * 0.5 * this.zoom * Math.SQRT2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); };
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
    if (S.phase === 'extract' && S.def.extract) { const e = S.def.extract; ring(e.x, e.z, e.r, '#5fffb0', 0.6 + 0.4 * pulse); ring(e.x, e.z, e.r * (1 + pulse * 0.3), '#5fffb0', 0.3); }
    for (const p of S.pickups) {
      if (p.owner !== S.localPid) continue;
      const q = this.P(p.x, p.z, 0.08 + Math.sin(t * 4 + p.x) * 0.03);
      const col = p.part ? '#c46bff' : p.mat === 'exotic' ? '#ff9a2e' : p.mat === 'alloy' ? '#4aa8ff' : '#c9ced6';
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

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
