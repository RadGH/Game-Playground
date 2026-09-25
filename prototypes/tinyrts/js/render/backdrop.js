// Space backdrop: gradient, two parallax star layers, soft nebula blobs and a ringed planet.
// Pre-rendered once into canvases at cell resolution, then drawn with parallax offsets.

import { Rng } from '../core/rng.js';

export class Backdrop {
  constructor(seed = 1) {
    this.rng = new Rng(seed * 7 + 3);
    this.layers = [];
    this.w = 0; this.h = 0;
  }

  // Build layer canvases sized for the view (wrapping horizontally).
  build(viewW, viewH) {
    const w = Math.ceil(viewW) + 2, h = Math.ceil(viewH) + 2;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const rng = new Rng(this.rng.state);
    this.grad = null;
    // Far stars + nebula (parallax 0.1), near stars (0.3).
    const tile = 512;
    const far = mk(tile, h), near = mk(tile, h);
    const fc = far.getContext('2d'), nc = near.getContext('2d');
    for (let k = 0; k < 7; k++) {
      const x = rng.range(0, tile), y = rng.range(0, h * 0.7), r = rng.range(30, 90);
      const g = fc.createRadialGradient(x, y, 0, x, y, r);
      const hue = rng.pick(['96,40,160', '40,60,160', '140,40,120', '30,90,140']);
      g.addColorStop(0, `rgba(${hue},0.16)`); g.addColorStop(1, `rgba(${hue},0)`);
      fc.fillStyle = g;
      for (const dx of [-tile, 0, tile]) { fc.save(); fc.translate(dx, 0); fc.fillRect(x - r, y - r, r * 2, r * 2); fc.restore(); }
    }
    for (let k = 0; k < 220; k++) {
      const x = rng.int(0, tile - 1), y = rng.int(0, h - 1);
      const b = rng.range(0.25, 0.7);
      fc.fillStyle = `rgba(200,210,255,${b})`; fc.fillRect(x, y, 1, 1);
    }
    for (let k = 0; k < 70; k++) {
      const x = rng.int(0, tile - 1), y = rng.int(0, h - 1);
      const b = rng.range(0.5, 1);
      nc.fillStyle = rng.chance(0.2) ? `rgba(160,255,250,${b})` : `rgba(255,255,255,${b})`;
      nc.fillRect(x, y, 1, 1);
      if (rng.chance(0.12)) { nc.fillStyle = `rgba(255,255,255,${b * 0.35})`; nc.fillRect(x - 1, y, 3, 1); nc.fillRect(x, y - 1, 1, 3); }
    }
    // Planet with a ring.
    const planet = mk(90, 60), pc = planet.getContext('2d');
    const px = 45, py = 30, pr = 16;
    const pg = pc.createRadialGradient(px - 5, py - 6, 2, px, py, pr);
    pg.addColorStop(0, '#6b5fa8'); pg.addColorStop(1, '#231d45');
    pc.fillStyle = pg; pc.beginPath(); pc.arc(px, py, pr, 0, Math.PI * 2); pc.fill();
    pc.strokeStyle = 'rgba(190,170,255,0.55)'; pc.lineWidth = 1.5;
    pc.beginPath(); pc.ellipse(px, py, 34, 6, -0.25, 0, Math.PI * 2); pc.stroke();
    pc.fillStyle = '#231d45'; pc.beginPath(); pc.arc(px, py, pr, Math.PI * 1.02, Math.PI * 1.98); pc.fill();
    pg.addColorStop(0, '#6b5fa8');
    this.layers = [{ c: far, p: 0.08, tile }, { c: near, p: 0.25, tile }];
    this.planet = planet;
  }

  draw(ctx, camX, camY, viewW, viewH, worldH) {
    this.build(viewW, viewH);
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, '#05040b'); g.addColorStop(0.6, '#0b0a1c'); g.addColorStop(1, '#141030');
    ctx.fillStyle = g; ctx.fillRect(0, 0, viewW + 2, viewH + 2);
    const [far, near] = this.layers;
    tileDraw(ctx, far, camX, viewW);
    ctx.drawImage(this.planet, Math.round(viewW * 0.68 - camX * 0.04), Math.round(viewH * 0.12));
    tileDraw(ctx, near, camX, viewW);
  }
}

function tileDraw(ctx, layer, camX, viewW) {
  const off = -((camX * layer.p) % layer.tile + layer.tile) % layer.tile;
  for (let x = off; x < viewW + 2; x += layer.tile) ctx.drawImage(layer.c, Math.round(x), 0);
}

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
