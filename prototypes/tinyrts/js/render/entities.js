// Draws buildings, units, clumps, projectiles, debris and overlays. The world pass draws into the
// low-res buffer in cell coordinates; the screen pass draws crisp HP bars, selection brackets and
// range circles at screen resolution.

import { sprite, PAL } from './sprites.js';
import { M } from '../world/materials.js';
import { hash2 } from '../core/rng.js';

const TEAM_COL = { 1: '#4ee6ff', 2: '#ffab40', 3: '#ff4fd8' };

export class EntityRenderer {
  constructor(app) {
    this.app = app;
    this.clumpCache = new Map();
    this.t = 0;
  }

  world(b, cam, game, alpha, dt) {
    if (!game) return;
    this.t += dt;
    const view = this.app.view;
    const x0 = cam.x - 30, x1 = cam.x + cam.viewW + 30, y0 = cam.y - 40, y1 = cam.y + cam.viewH + 40;
    const frame = Math.floor(this.t * 4);

    // Dig marks and link beams under everything.
    this.drawDig(b, game, x0, x1, y0, y1);
    if (view.showLinks || this.app.controller.mode === 'place') this.drawLinks(b, game, 1);
    if (view.debug) this.drawDebug(b, game, x0, x1, y0, y1);

    // Buildings.
    for (const bl of game.buildings) {
      if (bl.x + bl.w < x0 || bl.x > x1 || bl.y + bl.h < y0 || bl.y > y1) continue;
      this.drawBuilding(b, game, bl, frame, alpha);
    }
    // Clumps (falling wall chunks).
    for (const c of game.support.clumps) this.drawClump(b, game, c);
    // Units.
    for (const u of game.units) {
      if (u.x < x0 || u.x > x1 || u.y < y0 || u.y - u.h > y1) continue;
      this.drawUnit(b, game, u, frame);
    }
    // Projectiles.
    for (const p of game.projectiles) {
      if (p.x < x0 || p.x > x1) continue;
      if (p.kind === 'shell') { b.fillStyle = '#ffe9a0'; b.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2); b.fillStyle = 'rgba(255,200,120,0.5)'; b.fillRect(Math.floor(p.x - p.vx * 0.02), Math.floor(p.y - p.vy * 0.02), 1, 1); }
      else if (p.kind === 'glob') { b.fillStyle = '#b6ff5a'; b.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2); }
      else if (p.kind === 'bomb') { b.fillStyle = '#ff9ae8'; b.fillRect(Math.floor(p.x) - 1, Math.floor(p.y), 3, 3); b.fillStyle = '#fff'; b.fillRect(Math.floor(p.x), Math.floor(p.y) + 1, 1, 1); }
      else if (p.kind === 'flak') { b.fillStyle = '#ffe066'; b.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1); }
      else if (p.kind === 'rail') {
        b.save(); b.globalCompositeOperation = 'lighter';
        const tr = p.trail || [];
        b.strokeStyle = 'rgba(200,220,255,0.6)'; b.lineWidth = 1;
        if (tr.length >= 4) { b.beginPath(); b.moveTo(tr[0], tr[1]); for (let k = 2; k < tr.length; k += 2) b.lineTo(tr[k], tr[k + 1]); b.stroke(); }
        b.fillStyle = '#ffffff'; b.fillRect(Math.floor(p.x) - 1, Math.floor(p.y), 3, 1);
        b.restore();
      }
    }
    // Sim debris.
    for (const d of game.debris) { b.fillStyle = d.mat === M.SLAG ? '#ffb347' : '#8d91ab'; b.fillRect(Math.floor(d.x), Math.floor(d.y), 1, 1); }
    // Acid puddles.
    for (const a of game.acids) {
      b.fillStyle = `rgba(160,255,80,${0.25 + 0.15 * Math.sin(this.t * 10 + a.x)})`;
      for (let k = 0; k < 5; k++) { const h = hash2(Math.floor(a.x) + k, frame + k); b.fillRect(Math.floor(a.x + (h % 7) - 3), Math.floor(a.y + ((h >> 3) % 5) - 2), 1, 1); }
    }
    // Borer tremors: shaking dust along the surface above the tunnel.
    for (const u of game.units) {
      if (!u.burrowed || !u.tremor) continue;
      const tx = u.tremor.tx;
      const dir = Math.sign(tx - u.x) || 1;
      for (let k = 0; k < 18; k++) {
        const x = Math.floor(u.x + dir * k * 5);
        if ((x - tx) * dir > 0) break;
        const sy = game.world.surfaceY(x);
        if ((frame + k) % 2 === 0) { b.fillStyle = k === 0 ? '#ff4fd8' : 'rgba(255,90,200,0.55)'; b.fillRect(x, sy - 1 - ((frame + k) % 2), 2, 1); }
      }
    }
    // Drone work beams.
    b.save(); b.globalCompositeOperation = 'lighter';
    for (const u of game.units) {
      if (u.type !== 'drone' || !u.working || !u.workAt) continue;
      b.strokeStyle = u.team === 1 ? 'rgba(120,240,255,0.7)' : 'rgba(255,180,90,0.7)'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(u.x, u.y - 1); b.lineTo(u.workAt.x, u.workAt.y); b.stroke();
    }
    b.restore();
    // Effects.
    this.app.fx.draw(b);
    // Tutorial hint box: a pulsing outline where the hint wants you to act.
    if (view.hintBox) {
      const h = view.hintBox;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      b.strokeStyle = `rgba(255,224,102,${0.4 + 0.6 * pulse})`; b.lineWidth = 1;
      b.setLineDash([2, 2]);
      b.strokeRect(h.x - 1.5, h.y - 1.5, h.w + 3, h.h + 3);
      b.setLineDash([]);
      b.fillStyle = `rgba(255,224,102,${0.08 + 0.08 * pulse})`; b.fillRect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    }
    // Placement ghost.
    if (view.ghost) this.drawGhost(b, game, view.ghost);
    if (view.brush) this.drawBrush(b, game, view.brush);
    if (view.showRanges) {
      for (const bl of game.buildings) {
        const d = game.data.buildings.list[bl.type];
        if (!d.weapon || bl.team !== 1) continue;
        b.strokeStyle = 'rgba(78,230,255,0.18)'; b.lineWidth = 1;
        b.beginPath(); b.arc(bl.x + bl.w / 2, bl.y + 2, d.weapon.range, 0, Math.PI * 2); b.stroke();
      }
    }
  }

  drawBuilding(b, game, bl, frame, alpha) {
    const def = game.data.buildings.list[bl.type];
    const x = bl.x, y = bl.falling ? Math.floor(bl.fy) : bl.y;
    const spr = sprite('b', bl.type, bl.team, bl.w, bl.h, frame % 2, bl.team === 2);
    if (!bl.done) {
      // Construction: scaffold outline + sprite revealed from the bottom.
      const hh = Math.max(1, Math.round(bl.h * bl.progress));
      b.globalAlpha = 0.35;
      b.drawImage(spr, x, y);
      b.globalAlpha = 1;
      b.drawImage(spr, 0, bl.h - hh, bl.w, hh, x, y + bl.h - hh, bl.w, hh);
      b.fillStyle = TEAM_COL[bl.team];
      for (let k = 0; k < bl.w; k += 2) { b.fillRect(x + k, y, 1, 1); b.fillRect(x + k, y + bl.h - 1, 1, 1); }
      for (let k = 0; k < bl.h; k += 2) { b.fillRect(x, y + k, 1, 1); b.fillRect(x + bl.w - 1, y + k, 1, 1); }
      b.fillStyle = '#ffffff'; b.fillRect(x, y + bl.h - hh, bl.w, 1);
      return;
    }
    const hitFlash = game.time - bl.lastHit < 0.08;
    b.drawImage(spr, x, y);
    if (hitFlash) { b.globalAlpha = 0.5; b.fillStyle = '#ffffff'; b.fillRect(x, y, bl.w, bl.h); b.globalAlpha = 1; }
    // Moving parts.
    const w = def.weapon;
    if (w && bl.type !== 'core') {
      const mx = x + bl.w / 2, my = y + 2;
      const len = { pulse: 5, lance: 5, mortar: 6, railgun: 9, flak: 5, arc: 0 }[bl.type] ?? 4;
      if (len) {
        const a = bl.target || bl.firing ? bl.aim : (bl.team === 2 ? Math.PI + 0.2 : -0.2);
        b.strokeStyle = PAL[bl.team].light; b.lineWidth = bl.type === 'mortar' || bl.type === 'railgun' ? 2 : 1;
        b.beginPath(); b.moveTo(mx, my); b.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len); b.stroke();
        if (bl.firing > 0.05) { b.fillStyle = '#ffffff'; b.fillRect(Math.floor(mx + Math.cos(a) * len), Math.floor(my + Math.sin(a) * len), 1, 1); }
      }
      if (bl.overcharge > game.time) { b.fillStyle = (frame % 2) ? '#ffe066' : '#fff6c0'; b.fillRect(x, y - 1, bl.w, 1); }
    }
    if (bl.type === 'drill' && bl.linked && bl.on && !bl.depleted) {
      // Bore line pulsing down.
      b.fillStyle = 'rgba(120,240,255,0.35)';
      const d = def.mine.h;
      for (let k = (frame * 3) % 6; k < d; k += 6) b.fillRect(x + Math.floor(bl.w / 2), y + bl.h + k, 1, 2);
    }
    if (!bl.linked && def.weapon !== undefined || (!bl.linked && bl.type !== 'core' && !def.noLink)) {
      if (!bl.linked && bl.type !== 'core' && !def.noLink && frame % 2 === 0) { b.fillStyle = '#ff5a6e'; b.fillRect(x + bl.w / 2 - 1, y - 4, 3, 3); b.fillStyle = '#000'; b.fillRect(x + bl.w / 2, y - 3, 1, 1); }
    }
    if (bl.type === 'beacon') {
      // Linked beacons send a pillar of light into the sky.
      b.save(); b.globalCompositeOperation = 'lighter';
      if (bl.linked) {
        const a = 0.35 + 0.15 * Math.sin(this.t * 4);
        b.fillStyle = `rgba(120,240,255,${a})`; b.fillRect(x + 2, y - 400, 2, 400);
        b.fillStyle = `rgba(120,240,255,${a * 0.35})`; b.fillRect(x, y - 400, 6, 400);
      } else if (frame % 2) { b.fillStyle = 'rgba(255,90,110,0.8)'; b.fillRect(x + 2, y - 2, 2, 1); }
      b.restore();
    }
    if (bl.salvage && frame % 2) { b.strokeStyle = '#ffe066'; b.lineWidth = 1; b.strokeRect(x + 0.5, y + 0.5, bl.w - 1, bl.h - 1); }
  }

  drawUnit(b, game, u, frame) {
    const moving = Math.abs(u.vxEst || 0) > 1;
    const fr = u.flying ? frame : moving ? frame : 0;
    if (u.burrowed) return;
    const spr = sprite('u', u.type, u.team, u.w, u.h, fr % 2, u.dir < 0, { deployed: u.deployed });
    const x = Math.round(u.x - u.w / 2), y = Math.round(u.y - u.h);
    b.drawImage(spr, x, y);
    if (game.time - u.lastHit < 0.08) { b.globalAlpha = 0.6; b.fillStyle = '#ffffff'; b.fillRect(x, y, u.w, u.h); b.globalAlpha = 1; }
    const def = game.data.units.list[u.type];
    if (def && def.weapon && u.firing > 0.05 && def.weapon.kind !== 'beam') {
      b.fillStyle = '#ffffff'; b.fillRect(Math.round(u.x + u.dir * u.w / 2), Math.round(u.y - u.h * 0.7), 1, 1);
    }
    if (u.type === 'commander') { b.fillStyle = frame % 2 ? '#d8fbff' : '#4ee6ff'; b.fillRect(x + Math.floor(u.w / 2), y - 2, 1, 1); }
  }

  drawClump(b, game, c) {
    let e = this.clumpCache.get(c.id);
    if (!e) {
      const cv = document.createElement('canvas'); cv.width = c.w; cv.height = c.h;
      const ctx = cv.getContext('2d');
      for (let yy = 0; yy < c.h; yy++) for (let xx = 0; xx < c.w; xx++) {
        const m = c.mat[yy * c.w + xx];
        if (!m) continue;
        const cols = game.mats.colors[m];
        ctx.fillStyle = cols[hash2(xx + c.x, yy) % cols.length];
        ctx.fillRect(xx, yy, 1, 1);
      }
      e = cv; this.clumpCache.set(c.id, e);
      if (this.clumpCache.size > 200) this.clumpCache.delete(this.clumpCache.keys().next().value);
    }
    b.drawImage(e, c.x, Math.floor(c.fy));
  }

  drawLinks(b, game, team) {
    b.save(); b.globalCompositeOperation = 'lighter';
    const col = team === 1 ? 'rgba(78,230,255,' : 'rgba(255,171,64,';
    for (const [a, c] of game.linkEdges[team] || []) {
      const n1 = game.byId.get(a), n2 = game.byId.get(c);
      if (!n1 || !n2) continue;
      b.strokeStyle = col + '0.5)'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(n1.x + n1.w / 2, n1.y + 1); b.lineTo(n2.x + n2.w / 2, n2.y + 1); b.stroke();
    }
    for (const id of game.linkNodes[team] || []) {
      const n = game.byId.get(id);
      if (!n) continue;
      const r = game.data.buildings.list[n.type].linkRange * (n.type === 'core' ? (game.teams[team].mods.linkRange || 1) : 1);
      b.strokeStyle = col + '0.16)';
      b.beginPath(); b.arc(n.x + n.w / 2, n.y + 1, r, 0, Math.PI * 2); b.stroke();
    }
    for (const bl of game.buildings) {
      if (bl.team !== team || !bl.linkFrom) continue;
      const n = game.byId.get(bl.linkFrom);
      if (!n) continue;
      b.strokeStyle = col + '0.22)';
      b.beginPath(); b.moveTo(n.x + n.w / 2, n.y + 1); b.lineTo(bl.x + bl.w / 2, bl.y + 2); b.stroke();
    }
    b.restore();
  }

  // Debug overlay (\ with ?debug): awake physics chunks, closed nav nodes, unit paths.
  drawDebug(b, game, x0, x1, y0, y1) {
    const w = game.world;
    b.strokeStyle = 'rgba(255,255,0,0.5)'; b.lineWidth = 1;
    for (let cy = 0; cy < w.ch; cy++) for (let cx = 0; cx < w.cw; cx++) {
      if (!w.awake[cy * w.cw + cx]) continue;
      b.strokeRect(cx * 32 + 0.5, cy * 32 + 0.5, 31, 31);
    }
    const nav = game.nav;
    b.fillStyle = 'rgba(255,0,0,0.18)';
    for (let j = Math.max(0, Math.floor(y0 / 4)); j < Math.min(nav.nh, y1 / 4); j++) for (let i = Math.max(0, Math.floor(x0 / 4)); i < Math.min(nav.nw, x1 / 4); i++) {
      const c = nav.cache[1][j * nav.nw + i];
      if (c === 0) b.fillRect(i * 4, j * 4, 4, 4);
    }
    b.strokeStyle = 'rgba(109,255,158,0.7)';
    for (const u of game.units) {
      if (!u.path || u.path.length < 2) continue;
      b.beginPath(); b.moveTo(u.path[0].x, u.path[0].y);
      for (const p of u.path) b.lineTo(p.x, p.y);
      b.stroke();
    }
  }

  drawDig(b, game, x0, x1, y0, y1) {
    const set = game.digCells[1];
    if (!set || !set.size) return;
    const W = game.world.w;
    b.fillStyle = 'rgba(255,224,102,0.45)';
    for (const i of set) {
      const x = i % W, y = (i / W) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if ((x + y) % 2 === 0) b.fillRect(x, y, 1, 1);
    }
  }

  drawGhost(b, game, g) {
    const def = game.data.buildings.list[g.type];
    const [w, h] = def.size;
    const spr = sprite('b', g.type, 1, w, h, 0, false);
    b.globalAlpha = 0.55;
    b.drawImage(spr, g.x, g.y);
    b.globalAlpha = 1;
    b.fillStyle = g.ok ? 'rgba(109,255,158,0.25)' : 'rgba(255,90,110,0.35)';
    b.fillRect(g.x, g.y, w, h);
    b.strokeStyle = g.ok ? '#6dff9e' : '#ff5a6e'; b.lineWidth = 1;
    b.strokeRect(g.x + 0.5, g.y + 0.5, w - 1, h - 1);
    if (def.weapon) {
      b.strokeStyle = 'rgba(255,255,255,0.3)';
      b.beginPath(); b.arc(g.x + w / 2, g.y + 2, def.weapon.range, 0, Math.PI * 2); b.stroke();
      if (def.weapon.minRange) { b.strokeStyle = 'rgba(255,90,110,0.3)'; b.beginPath(); b.arc(g.x + w / 2, g.y + 2, def.weapon.minRange, 0, Math.PI * 2); b.stroke(); }
    }
    if (def.linkRange) {
      b.strokeStyle = 'rgba(78,230,255,0.25)';
      b.beginPath(); b.arc(g.x + w / 2, g.y + 1, def.linkRange, 0, Math.PI * 2); b.stroke();
    }
    if (def.mine) {
      const cx = g.x + Math.floor(w / 2);
      b.strokeStyle = 'rgba(255,224,102,0.5)';
      b.strokeRect(cx - def.mine.w / 2 + 0.5, g.y + h + 0.5, def.mine.w - 1, def.mine.h - 1);
    }
    if (g.link) {
      b.strokeStyle = 'rgba(78,230,255,0.8)';
      b.setLineDash([2, 2]);
      b.beginPath(); b.moveTo(g.link.x + g.link.w / 2, g.link.y + 1); b.lineTo(g.x + w / 2, g.y + 2); b.stroke();
      b.setLineDash([]);
    }
  }

  drawBrush(b, game, br) {
    // Brush preview: the cells that would be painted, colored by what would happen.
    b.globalAlpha = 0.7;
    for (const c of br.cells) {
      b.fillStyle = c[2] === 2 ? 'rgba(255,90,110,0.8)' : c[2] === 1 ? br.color : 'rgba(255,255,255,0.15)';
      b.fillRect(c[0], c[1], 1, 1);
    }
    b.globalAlpha = 1;
    if (br.box) {
      b.strokeStyle = br.boxColor || '#ffe066'; b.lineWidth = 1;
      b.strokeRect(br.box.x0 + 0.5, br.box.y0 + 0.5, br.box.x1 - br.box.x0, br.box.y1 - br.box.y0);
    }
  }

  // Screen pass: HP bars, selection brackets, rally points, drag box.
  screen(ctx, cam, game) {
    if (!game) return;
    const view = this.app.view;
    const s = cam.scale;
    const toS = (x, y) => [(x - cam.x) * s + cam.shakeX, (y - cam.y) * s + cam.shakeY];
    const sel = view.selection;
    const bar = (x, y, w, frac, col) => {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, Math.round(w * frac)), 3);
    };
    const hpCol = (f) => (f > 0.6 ? '#6dff9e' : f > 0.3 ? '#ffe066' : '#ff5a6e');
    for (const bl of game.buildings) {
      const [sx, sy] = toS(bl.x, bl.falling ? bl.fy : bl.y);
      if (sx > cam.screenW || sx + bl.w * s < 0) continue;
      const isSel = sel.has(bl.id);
      if (isSel) this.brackets(ctx, sx, sy, bl.w * s, bl.h * s, TEAM_COL[bl.team]);
      const f = bl.hp / bl.maxHp;
      if (isSel || view.alt || (f < 0.999 && game.time - bl.lastHit < 4) || (!bl.done)) {
        bar(sx + 2, sy - 7, bl.w * s - 4, bl.done ? f : bl.progress, bl.done ? hpCol(f) : '#4ee6ff');
      }
      if (isSel && bl.rally) {
        const [rx, ry] = toS(bl.rally.x, bl.rally.y);
        ctx.strokeStyle = 'rgba(78,230,255,0.6)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(sx + bl.w * s / 2, sy + bl.h * s / 2); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#4ee6ff'; ctx.fillRect(rx - 1, ry - 12, 2, 12); ctx.fillRect(rx + 1, ry - 12, 6, 4);
      }
      if (isSel) {
        const d = game.data.buildings.list[bl.type];
        if (d.weapon) {
          ctx.strokeStyle = 'rgba(78,230,255,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); const [cx, cy] = toS(bl.x + bl.w / 2, bl.y + 2); ctx.arc(cx, cy, d.weapon.range * s, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    for (const u of game.units) {
      if (u.burrowed) continue;
      const [sx, sy] = toS(u.x - u.w / 2, u.y - u.h);
      if (sx > cam.screenW + 20 || sx < -40) continue;
      const isSel = sel.has(u.id);
      if (isSel) this.brackets(ctx, sx - 2, sy - 2, u.w * s + 4, u.h * s + 4, TEAM_COL[u.team]);
      const f = u.hp / u.maxHp;
      const def = game.data.enemies.list[u.type];
      const isBoss = def && def.boss;
      if (isSel || view.alt || (f < 0.999 && game.time - u.lastHit < 3) || isBoss) {
        const bw = Math.max(12, u.w * s);
        bar(sx + (u.w * s - bw) / 2, sy - 6, bw, f, u.hollow ? '#ff4fd8' : hpCol(f));
      }
    }
    // Drag box.
    if (view.dragBox) {
      const d = view.dragBox;
      ctx.strokeStyle = '#6dff9e'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.fillStyle = 'rgba(109,255,158,0.08)';
      ctx.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
    // Order target marker.
    if (view.marker && view.marker.t > 0) {
      const [mx, my] = toS(view.marker.x, view.marker.y);
      const r = 6 + (1 - view.marker.t) * 8;
      ctx.strokeStyle = view.marker.col || '#6dff9e'; ctx.globalAlpha = view.marker.t;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // Floating damage numbers.
    if (this.app.fx.texts.length) {
      ctx.font = '10px Silkscreen, monospace'; ctx.textAlign = 'center';
      for (const t of this.app.fx.texts) {
        const [x, y] = toS(t.x, t.y);
        ctx.globalAlpha = Math.min(1, t.ttl * 2);
        ctx.fillStyle = '#000'; ctx.fillText(t.text, x + 1, y + 1);
        ctx.fillStyle = t.col; ctx.fillText(t.text, x, y);
      }
      ctx.globalAlpha = 1;
    }
    // Off-screen boss/wave arrows: Hollow outside the view that are close to your stuff.
    this.edgeArrows(ctx, cam, game);
  }

  brackets(ctx, x, y, w, h, col) {
    const k = Math.min(8, w / 3, h / 3);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
    ctx.moveTo(x + w - k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + k);
    ctx.moveTo(x, y + h - k); ctx.lineTo(x, y + h); ctx.lineTo(x + k, y + h);
    ctx.moveTo(x + w - k, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - k);
    ctx.stroke();
  }

  edgeArrows(ctx, cam, game) {
    const left = [], right = [];
    for (const u of game.units) {
      if (!u.hollow && u.team !== 2) continue;
      if (u.team === 2 && u.type === 'drone') continue;
      if (u.x < cam.x) left.push(u); else if (u.x > cam.x + cam.viewW) right.push(u);
    }
    const draw = (list, side) => {
      if (!list.length) return;
      const n = list.length;
      const x = side < 0 ? 10 : cam.screenW - 10;
      const y = cam.screenH * 0.45;
      ctx.fillStyle = list.some((u) => u.team === 3) ? '#ff4fd8' : '#ffab40';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - side * 12, y - 9); ctx.lineTo(x - side * 12, y + 9); ctx.closePath(); ctx.fill();
      ctx.font = '10px Silkscreen, monospace'; ctx.textAlign = side < 0 ? 'left' : 'right';
      ctx.fillText(String(n), x - side * 16 + (side < 0 ? 0 : 0), y + 22);
    };
    draw(left, -1); draw(right, 1);
  }
}
