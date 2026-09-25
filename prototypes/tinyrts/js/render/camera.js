// Camera in cell coordinates. `scale` is the whole-number count of screen pixels per cell.
// x/y may be fractional for smooth scrolling; the renderer handles the sub-cell offset.

import { clamp } from '../core/util.js';

export const MIN_SCALE = 2, MAX_SCALE = 8;

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.scale = 3;
    this.autoScale = true;
    this.screenW = 800; this.screenH = 600;
    this.worldW = 100; this.worldH = 100;
    this.bottomPad = 116; // px of HUD overlay at the bottom — allow scrolling that far past the map
    this.topPad = 28;
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
  }

  get viewW() { return this.screenW / this.scale; }
  get viewH() { return this.screenH / this.scale; }

  resize(w, h) {
    this.screenW = w; this.screenH = h;
    if (this.autoScale) this.scale = clamp(Math.round(h / 190), MIN_SCALE, MAX_SCALE);
    this.clampPos();
  }

  setWorld(w, h) { this.worldW = w; this.worldH = h; this.clampPos(); }

  // Zoom by whole-number steps, keeping the cell under (sx, sy) fixed on screen.
  zoom(dir, sx = this.screenW / 2, sy = this.screenH / 2) {
    const ns = clamp(this.scale + dir, MIN_SCALE, MAX_SCALE);
    if (ns === this.scale) return;
    const wx = this.x + sx / this.scale, wy = this.y + sy / this.scale;
    this.scale = ns; this.autoScale = false;
    this.x = wx - sx / ns; this.y = wy - sy / ns;
    this.clampPos();
  }

  clampPos() {
    const vw = this.viewW, vh = this.viewH;
    const minY = -this.topPad / this.scale - 40; // a little sky above the map
    const maxY = this.worldH - vh + this.bottomPad / this.scale;
    this.x = vw >= this.worldW ? (this.worldW - vw) / 2 : clamp(this.x, 0, this.worldW - vw);
    this.y = clamp(this.y, minY, Math.max(minY, maxY));
  }

  centerOn(wx, wy) { this.x = wx - this.viewW / 2; this.y = wy - this.viewH / 2; this.clampPos(); }

  screenToWorld(sx, sy) { return { x: this.x + sx / this.scale, y: this.y + sy / this.scale }; }
  worldToScreen(wx, wy) { return { x: (wx - this.x) * this.scale, y: (wy - this.y) * this.scale }; }

  addShake(amount) { this.shake = Math.min(12, this.shake + amount); }
  updateShake(dt, strength = 1) {
    if (this.shake > 0.05 && strength > 0) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake * strength;
      this.shakeY = (Math.random() * 2 - 1) * this.shake * strength;
      this.shake *= Math.pow(0.02, dt);
    } else { this.shake = 0; this.shakeX = 0; this.shakeY = 0; }
  }
}
