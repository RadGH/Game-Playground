// Visual effects driven by simulation events: beams, arcs, muzzle flashes, sparks, explosions,
// dust, debris. Purely cosmetic — nothing here affects the game. Drawn in cell space into the
// low-resolution buffer, mostly with additive blending so it glows.

import { PAL } from './sprites.js';

const TEAM_BEAM = { 1: '#6ff0ff', 2: '#ffb347', 3: '#ff5fe0' };

export class Fx {
  constructor() {
    this.parts = [];   // {x,y,vx,vy,life,max,col,size,g,add}
    this.beams = [];   // {segs, col, ttl, max, w}
    this.arcs = [];    // {pts, ttl}
    this.rings = [];   // {x,y,r,max,ttl,col}
    this.columns = []; // orbital strikes {x,w,ttl,max,warn}
    this.density = 1;
    this.hurt = new Map();   // id -> {amt, x, y, t, team}: damage summed briefly, then shown
    this.texts = [];         // floating damage numbers {x, y, text, ttl, col}
    this.shake = null; // callback(amount)
  }

  attach(game, cam, settings) {
    this.parts.length = 0; this.beams.length = 0; this.arcs.length = 0; this.rings.length = 0; this.columns.length = 0;
    this.cam = cam;
    this.settings = settings;
    const E = game.events;
    const on = (t, f) => E.on(t, f);
    this.hurt.clear(); this.texts.length = 0;
    on('hurt', (e) => {
      const h = this.hurt.get(e.id);
      if (h) { h.amt += e.amt; h.x = e.x; h.y = e.y; } else this.hurt.set(e.id, { amt: e.amt, x: e.x, y: e.y, t: 0.3, team: e.team });
    });
    on('beam', (e) => this.beams.push({ segs: e.segs, col: TEAM_BEAM[e.team], ttl: e.ttl, max: e.ttl, w: e.kind === 'beam' ? 2 : 1 }));
    on('arc', (e) => { this.arcs.push({ pts: jag(e.pts), ttl: 0.18, team: e.team }); for (const p of e.pts) this.burst(p.x, p.y, 3, '#bfe8ff', 30, 0.3); });
    on('reflect', (e) => this.burst(e.x, e.y, 3, '#f0d8ff', 40, 0.25));
    on('shot', (e) => { if (e.kind !== 'arc') this.burst(e.x, e.y, e.kind === 'rail' ? 6 : 2, e.kind === 'rail' ? '#ffffff' : TEAM_BEAM[e.team] || '#fff', 25, 0.12); });
    on('blast', (e) => this.explosion(e.x, e.y, e.r));
    on('flakPop', (e) => this.burst(e.x, e.y, 5, '#ffe9a0', 35, 0.25));
    on('intercept', (e) => { this.burst(e.x, e.y, 8, '#ffffff', 45, 0.35); this.rings.push({ x: e.x, y: e.y, r: 0, max: 6, ttl: 0.25, col: '#ffffff' }); });
    on('splash', (e) => this.burst(e.x, e.y, 10, '#b6ff5a', 40, 0.5, 60));
    on('bite', (e) => this.burst(e.x, e.y, 2, e.acid ? '#b6ff5a' : '#ffa0ec', 20, 0.2));
    on('mined', (e) => this.burst(e.x + 0.5, e.y + 0.5, 3, e.key === 'c' ? '#46e8f5' : '#f59f55', 20, 0.4, 20));
    on('railHit', (e) => this.burst(e.x, e.y, 6, '#ffffff', 50, 0.3));
    on('railEnd', (e) => this.burst(e.x, e.y, 8, '#e0e0ff', 40, 0.4));
    on('unitKilled', (e) => this.death(e));
    on('buildingDestroyed', (e) => { this.explosion(e.x, e.y, Math.max(e.w, e.h) * 0.7); this.shakeBy(Math.min(8, e.w / 3)); });
    on('built', (e) => this.rings.push({ x: e.x, y: e.y, r: 0, max: 14, ttl: 0.5, col: '#9cf7ff' }));
    on('clumpLand', (e) => { this.dust(e.x, e.y, Math.min(40, 4 + e.count / 6)); this.shakeBy(Math.min(6, e.count / 60 + e.fell / 20)); });
    on('buildingLanded', (e) => { this.dust(e.x, e.y, 20); this.shakeBy(3); });
    on('orbitalHit', (e) => { this.columns.push({ x: e.x, w: e.w, ttl: 0.6, max: 0.6, top: e.top }); this.explosion(e.x, e.top, 14); this.shakeBy(10); });
    on('ability', (e) => {
      if (e.key === 'orbital') this.columns.push({ x: e.x, w: 12, ttl: e.delay, max: e.delay, warn: true });
      if (e.key === 'overcharge') this.rings.push({ x: e.x, y: e.y, r: 0, max: e.r, ttl: 0.6, col: '#ffe066' });
      if (e.key === 'blink') { this.burst(e.x, e.y, 14, '#d8fbff', 50, 0.4); this.burst(e.x2, e.y2, 14, '#d8fbff', 50, 0.4); }
    });
    on('borerSurfaced', (e) => this.dust(e.x, e.y, 16));
    on('spawned', (e) => this.burst(e.x, e.y, 6, '#ff5fe0', 30, 0.4));
    on('trained', (e) => this.rings.push({ x: e.x, y: e.y - 3, r: 0, max: 6, ttl: 0.3, col: '#ffffff' }));
  }

  shakeBy(a) { if (this.shake) this.shake(a); }

  burst(x, y, n, col, speed = 30, life = 0.3, g = 0) {
    n = Math.max(1, Math.round(n * this.density));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, col, size: 1, g, add: true });
    }
  }

  explosion(x, y, r) {
    this.rings.push({ x, y, r: 0, max: r * 1.3, ttl: 0.3, col: '#fff2c0' });
    this.burst(x, y, 10 + r * 1.5, '#ffd27a', 20 + r * 5, 0.5, 20);
    this.burst(x, y, 6 + r, '#ff7a2e', 15 + r * 3, 0.7, 40);
    this.dust(x, y, 6 + r);
    this.shakeBy(Math.min(7, r / 3));
  }

  dust(x, y, n) {
    n = Math.max(1, Math.round(n * this.density));
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 35, life: 0.9, max: 0.9, col: '#8d8aae', size: 1, g: 30, add: false });
    }
  }

  death(e) {
    const col = e.hollow ? '#ff5fe0' : e.team === 2 ? '#ffab40' : '#6ff0ff';
    this.burst(e.x, e.y, 6 + e.w * 1.5, col, 40, 0.5, 60);
    this.burst(e.x, e.y, 4, '#ffffff', 30, 0.2);
    if (e.boss) { this.explosion(e.x, e.y, 20); this.shakeBy(8); }
  }

  update(dt) {
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(k, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97;
    }
    if (this.parts.length > 3000) this.parts.splice(0, this.parts.length - 3000);
    for (const list of [this.beams, this.arcs, this.rings, this.columns]) {
      for (let k = list.length - 1; k >= 0; k--) { list[k].ttl -= dt; if (list[k].ttl <= 0) list.splice(k, 1); }
    }
    for (const r of this.rings) r.r = r.max * (1 - r.ttl / 0.5);
    for (const [id, h] of this.hurt) {
      h.t -= dt;
      if (h.t > 0) continue;
      this.hurt.delete(id);
      if (h.amt >= 1) this.texts.push({ x: h.x + (Math.random() - 0.5) * 4, y: h.y, text: String(Math.round(h.amt)), ttl: 0.9, col: h.team === 3 ? '#ffe066' : h.team === 1 ? '#ff8a8a' : '#ffd0a0' });
    }
    for (let k = this.texts.length - 1; k >= 0; k--) { const t = this.texts[k]; t.ttl -= dt; t.y -= dt * 12; if (t.ttl <= 0) this.texts.splice(k, 1); }
    if (this.texts.length > 80) this.texts.splice(0, this.texts.length - 80);
  }

  // Draw in world coords (the buffer is translated by the renderer).
  draw(b) {
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const bm of this.beams) {
      const a = Math.max(0, bm.ttl / bm.max);
      for (const [x0, y0, x1, y1] of bm.segs) {
        b.strokeStyle = bm.col; b.globalAlpha = 0.28 * a; b.lineWidth = 3 * bm.w;
        line(b, x0, y0, x1, y1);
        b.globalAlpha = 0.95 * a; b.lineWidth = bm.w === 2 ? 1.2 : 1; b.strokeStyle = '#ffffff';
        line(b, x0, y0, x1, y1);
      }
    }
    for (const ar of this.arcs) {
      b.globalAlpha = Math.min(1, ar.ttl * 8);
      b.strokeStyle = '#bfe8ff'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(ar.pts[0].x, ar.pts[0].y);
      for (const p of ar.pts) b.lineTo(p.x, p.y);
      b.stroke();
      b.globalAlpha *= 0.3; b.lineWidth = 3; b.stroke();
    }
    for (const r of this.rings) {
      b.globalAlpha = Math.max(0, r.ttl * 2); b.strokeStyle = r.col; b.lineWidth = 1;
      b.beginPath(); b.arc(r.x, r.y, Math.max(0.5, r.r), 0, Math.PI * 2); b.stroke();
    }
    for (const c of this.columns) {
      const a = c.ttl / c.max;
      if (c.warn) {
        b.globalAlpha = 0.25 + 0.25 * Math.sin(c.ttl * 30);
        b.fillStyle = '#ff5a6e';
        b.fillRect(c.x - c.w / 2, -200, c.w, 2000);
      } else {
        b.globalAlpha = a; b.fillStyle = '#ffffff';
        b.fillRect(c.x - c.w / 2 + 2, -200, c.w - 4, (c.top || 0) + 240);
        b.globalAlpha = a * 0.5; b.fillStyle = '#9cf7ff';
        b.fillRect(c.x - c.w / 2 - 2, -200, c.w + 4, (c.top || 0) + 240);
      }
    }
    for (const p of this.parts) {
      if (!p.add) continue;
      b.globalAlpha = Math.min(1, p.life / p.max * 1.4);
      b.fillStyle = p.col;
      b.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    b.globalCompositeOperation = 'source-over';
    for (const p of this.parts) {
      if (p.add) continue;
      b.globalAlpha = Math.min(1, p.life / p.max);
      b.fillStyle = p.col;
      b.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
    }
    b.restore();
  }
}

function line(b, x0, y0, x1, y1) { b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y1); b.stroke(); }

function jag(pts) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], c = pts[k];
    for (let s = 1; s <= 3; s++) {
      const t = s / 4;
      out.push({ x: a.x + (c.x - a.x) * t + (Math.random() - 0.5) * 4, y: a.y + (c.y - a.y) * t + (Math.random() - 0.5) * 4 });
    }
    out.push(c);
  }
  return out;
}
