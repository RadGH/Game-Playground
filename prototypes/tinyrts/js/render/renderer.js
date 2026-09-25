// Draws a frame: backdrop + world cells + entities + effects into a low-resolution buffer
// (1 pixel per cell), scales it up by the whole-number pixel scale onto the screen canvas, then
// draws crisp screen-resolution overlays (HP bars, text, ghosts) on top.

import { TerrainLayer } from './terrain-layer.js';
import { Backdrop } from './backdrop.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.terrain = null;
    this.backdrop = new Backdrop(1);
    this.layers = [];          // extra draw passes: {world(bctx, cam, game), screen(ctx, cam, game)}
    this.dpr = 1;
  }

  attach(game, opts = {}) {
    this.game = game;
    this.terrain = game ? new TerrainLayer(game.world, opts) : null;
    this.backdrop = new Backdrop(game ? game.seed : 1);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }

  render(cam, alpha, frameDt) {
    const ctx = this.ctx, scale = cam.scale;
    const vx = cam.x + cam.shakeX / scale, vy = cam.y + cam.shakeY / scale;
    const ix = Math.floor(vx), iy = Math.floor(vy);
    const fx = vx - ix, fy = vy - iy;
    const bw = Math.ceil(cam.screenW / scale) + 2, bh = Math.ceil(cam.screenH / scale) + 2;
    if (this.buf.width !== bw || this.buf.height !== bh) { this.buf.width = bw; this.buf.height = bh; }
    const b = this.bctx;
    b.imageSmoothingEnabled = false;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    this.backdrop.draw(b, vx, vy, bw, bh);
    if (this.terrain) {
      this.terrain.update();
      // World cells: copy the visible part of the world canvas.
      const sx = Math.max(0, ix), sy = Math.max(0, iy);
      const ex = Math.min(this.game.world.w, ix + bw), ey = Math.min(this.game.world.h, iy + bh);
      if (ex > sx && ey > sy) b.drawImage(this.terrain.canvas, sx, sy, ex - sx, ey - sy, sx - ix, sy - iy, ex - sx, ey - sy);
    }
    // World-space passes draw with the buffer translated so world (x, y) lands at the right pixel.
    b.setTransform(1, 0, 0, 1, -ix, -iy);
    for (const l of this.layers) if (l.world) l.world(b, cam, this.game, alpha, frameDt);
    b.setTransform(1, 0, 0, 1, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05040b';
    ctx.fillRect(0, 0, cam.screenW, cam.screenH);
    ctx.drawImage(this.buf, Math.round(-fx * scale), Math.round(-fy * scale), bw * scale, bh * scale);
    for (const l of this.layers) if (l.screen) l.screen(ctx, cam, this.game, alpha, frameDt);
  }
}
