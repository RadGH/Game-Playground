// Effects on a 2D iso canvas, built to prototypes/arcline/docs/research-boom-feel.md (why Kindlewild's meteor felt
// good and Stoneward's didn't): everything moves every drawn frame in REAL time; hot things are drawn additively from
// a soft glow sprite; every blast lights the ground; particles fade and shrink; chunks fly on a real height, bounce once
// and stay as rubble; shake is "trauma" in screen pixels; flung bodies arc, spin and land with a puff.
//
// World positions are tiles (x, z) plus a height y in tiles; the owner gives fx a project(x, z, y) → {sx, sy} and a
// zoom (px per tile at 1× is set by iso.js). Nothing here knows about the map or the creatures.
import { PX_PER_HEIGHT } from '../iso.js';

const BUDGET = { desktop: 1500, phone: 600 };

/** A soft round glow (white-hot core, wide faint halo), made once and tinted by drawing with globalAlpha. */
const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.12, color); gr.addColorStop(0.45, color + '55'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c); return c;
}
const HEAT = ['#ffffff', '#fff1a8', '#ffb347', '#ff6a2a', '#a8321e', '#505058'];
const heat = t => HEAT[Math.min(HEAT.length - 1, Math.floor(t * (HEAT.length - 1)))];
const rnd = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor({ phone = false } = {}) {
    this.parts = []; this.lights = []; this.rings = []; this.decals = []; this.bodies = []; this.beams = []; this.arcs = [];
    this.trauma = 0; this.roll = 0; this.flash = 0; this.time = 0; this.budget = phone ? BUDGET.phone : BUDGET.desktop;
    this.shakeScale = 1;
  }

  // ---------------- spawning ----------------
  _add(p) {
    if (this.parts.length >= this.budget) {
      if (p.kind === 'smoke') return; if (p.kind === 'spark' && this.parts.length >= this.budget * 1.15) return;
    }
    this.parts.push(p);
  }
  spark(x, z, y, n, { speed = [3, 6], life = [0.15, 0.3], color = '#ffd27a', up = [0, 2] } = {}) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(...speed);
      this._add({ kind: 'spark', x, z, y, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(...up), life: rnd(...life), age: 0, size: rnd(2, 4), color }); }
  }
  chunks(x, z, n, { speed = [3, 5], up = [3, 5], hot = 0.4, colors = ['#3a3f48', '#55505a'], stay = [15, 30] } = {}) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(...speed);
      this._add({ kind: 'chunk', x, z, y: 0.05, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(...up), life: rnd(...stay), age: 0, size: rnd(2, 4.5), bounced: false, hot: Math.random() < hot ? rnd(2.5, 4) : 0, color: colors[i % colors.length], spin: rnd(-8, 8), rot: 0 }); }
  }
  embers(x, z, n, { speed = [1, 3], up = [4, 7], life = [2, 3], g = 4 } = {}) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(...speed);
      this._add({ kind: 'ember', x, z, y: 0.1, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(...up), g, life: rnd(...life), age: 0, size: rnd(2, 3.5) }); }
  }
  smoke(x, z, n, { rise = 0.3, life = [1.5, 2.5], size = [10, 22], spread = 0.6, color = '#3b3d44' } = {}) {
    for (let i = 0; i < n; i++) this._add({ kind: 'smoke', x: x + rnd(-spread, spread), z: z + rnd(-spread, spread), y: rnd(0.05, 0.4), vx: rnd(-0.2, 0.2), vz: rnd(-0.2, 0.2), vy: rise * rnd(0.6, 1.4), life: rnd(...life), age: 0, size: rnd(...size), color });
  }
  light(x, z, radius, life, color = '#ffb35a', strength = 1) { this.lights.push({ x, z, radius, life, age: 0, color, strength }); }
  ring(x, z, radius, life, color = 'rgba(255,240,210,0.9)', width = 3) { this.rings.push({ x, z, radius, life, age: 0, color, width }); }
  decal(x, z, radius, life, molten = 0) { this.decals.push({ x, z, radius, life, age: 0, molten }); }
  shake(trauma) { this.trauma = Math.min(1, this.trauma + trauma); }
  screenFlash(v) { this.flash = Math.max(this.flash, v); }
  /** A thrown body: a sprite (death frame) flying on an arc, spinning, landing in a puff. */
  fling(x, z, vx, vz, vy, sprite, { spin = rnd(-9, 9), colors = ['#888'] } = {}) {
    this.bodies.push({ x, z, y: 0.05, vx, vz, vy, sprite, spin, rot: 0, age: 0, landed: false, life: 1.6, colors });
  }
  beam(x1, z1, y1, x2, z2, y2, { life = 0.15, color = '#9fe8ff', width = 4 } = {}) { this.beams.push({ x1, z1, y1, x2, z2, y2, life, age: 0, color, width }); }
  arc(points, { life = 0.12, color = '#b49bff' } = {}) { this.arcs.push({ points, life, age: 0, color, seed: Math.random() * 1000 }); }
  /** The death burst: 8-12 bits in the creature's own colours. */
  burst(x, z, colors, n = 10) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(1.5, 4);
      this._add({ kind: 'chunk', x, z, y: 0.15, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(2, 4), life: rnd(2, 4), age: 0, size: rnd(2, 3.5), bounced: false, hot: 0, color: i % 2 ? colors[0] : colors[2] || colors[0], spin: rnd(-8, 8), rot: 0, glow: i % 4 === 0 ? colors[1] : null }); }
  }

  // ---------------- update (real time) ----------------
  update(dt) {
    this.time += dt;
    const keep = [];
    for (const p of this.parts) {
      p.age += dt; if (p.age >= p.life) continue;
      if (p.kind === 'spark') { const k = Math.pow(0.88, dt * 60); p.vx *= k; p.vz *= k; p.vy *= k; p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.max(0, p.y + p.vy * dt); }
      else if (p.kind === 'ember') { p.vy -= p.g * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; if (p.y < 0) { p.y = 0; p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; } }
      else if (p.kind === 'smoke') { p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.size += dt * 6; }
      else if (p.kind === 'chunk') {
        if (p.y > 0 || p.vy > 0) {
          p.vy -= 12 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          if (p.y <= 0) { p.y = 0; if (!p.bounced) { p.bounced = true; p.vy = -p.vy * 0.3; p.vx *= 0.5; p.vz *= 0.5; } else { p.vy = 0; p.vx *= 0.2; p.vz *= 0.2; } }
        } else { const k = Math.pow(0.02, dt); p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt; }
        if (p.hot > 0) p.hot = Math.max(0, p.hot - dt);
      }
      keep.push(p);
    }
    this.parts = keep;
    const age = list => list.filter(o => (o.age += dt) < o.life);
    this.lights = age(this.lights); this.rings = age(this.rings); this.decals = age(this.decals); this.beams = age(this.beams); this.arcs = age(this.arcs);
    this.bodies = this.bodies.filter(b => {
      b.age += dt;
      if (!b.landed) { b.vy -= 14 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
        if (b.y <= 0) { b.y = 0; b.landed = true; b.landedAt = b.age; this.smoke(b.x, b.z, 3, { life: [0.5, 0.9], size: [6, 12], rise: 0.15, spread: 0.15, color: '#5a5048' }); this.burst(b.x, b.z, b.colors, 4); } }
      return !b.landed || b.age - b.landedAt < 0.35;
    });
    this.trauma = Math.max(0, this.trauma - 1.8 * dt);
    this.roll = Math.max(0, this.roll - dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }
  /** Screen-pixel offset from shake: max px × trauma², smooth noise (not a new random number every frame). */
  shakeOffset(maxPx = 14) {
    const t = this.time, a = maxPx * this.trauma * this.trauma * this.shakeScale, r = 3 * Math.min(1, this.roll) * this.shakeScale;
    return { x: a * Math.sin(t * 47.3) * Math.cos(t * 13.1) + r * Math.sin(t * 9.0), y: a * Math.cos(t * 41.7) * Math.sin(t * 17.9) + r * Math.cos(t * 7.3) };
  }

  // ---------------- drawing ----------------
  /** Ground layer (under sprites): decals (scorch, cooling molten crater) and ground lights. */
  drawGround(ctx, P, zoom) {
    for (const d of this.decals) {
      const { sx, sy } = P(d.x, d.z, 0), k = 1 - d.age / d.life, rx = d.radius * 32 * zoom, ry = rx / 2;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 3) * 0.55;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx); gr.addColorStop(0, '#120c08'); gr.addColorStop(0.7, '#2a221c'); gr.addColorStop(1, 'rgba(30,24,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  /** Light layer (after sprites, additive): ground lights, molten crater glow, hot chunks, embers, sparks. */
  drawLights(ctx, P, zoom) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const d of this.decals) if (d.molten) {
      const cool = Math.max(0, 1 - d.age / d.molten); if (!cool) continue;
      const { sx, sy } = P(d.x, d.z, 0), r = d.radius * 0.45 * 32 * zoom;
      ctx.globalAlpha = cool * 0.9; ctx.drawImage(glowSprite('#ff6a1a'), sx - r * 2, sy - r, r * 4, r * 2);
    }
    for (const l of this.lights) {
      const k = 1 - l.age / l.life, { sx, sy } = P(l.x, l.z, 0), rx = l.radius * 32 * zoom;
      ctx.globalAlpha = Math.min(1, k * k * l.strength); ctx.drawImage(glowSprite(l.color), sx - rx, sy - rx / 2, rx * 2, rx);
    }
    for (const p of this.parts) {
      const glowing = p.glow && p.age < 0.6;
      if (p.kind === 'spark' || p.kind === 'ember' || (p.kind === 'chunk' && (p.hot > 0 || glowing))) {
        const k = 1 - p.age / p.life, fade = k < 0.35 ? k / 0.35 : 1;
        const { sx, sy } = P(p.x, p.z, p.y);
        const col = p.kind === 'spark' ? p.color : p.kind === 'ember' ? heat(0.25 + (1 - k) * 0.5) : glowing ? p.glow : heat(1 - p.hot / 4);
        const s = (p.kind === 'chunk' ? p.size * 3 : p.size * 3.5) * zoom * (0.5 + 0.5 * fade);
        ctx.globalAlpha = fade * (p.kind === 'chunk' ? (glowing ? 1 - p.age / 0.6 : Math.min(1, p.hot / 2)) : 1);
        ctx.drawImage(glowSprite(col), sx - s, sy - s, s * 2, s * 2);
      }
    }
    for (const b of this.beams) {
      const k = 1 - b.age / b.life, a = P(b.x1, b.z1, b.y1), c = P(b.x2, b.z2, b.y2);
      ctx.globalAlpha = k; ctx.strokeStyle = b.color; ctx.lineCap = 'round';
      ctx.lineWidth = b.width * 3 * zoom * k; ctx.globalAlpha = k * 0.35; line(ctx, a, c);
      ctx.lineWidth = b.width * zoom; ctx.globalAlpha = k; line(ctx, a, c);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, b.width * 0.35 * zoom); line(ctx, a, c);
    }
    for (const r of this.arcs) {
      const k = 1 - r.age / r.life; ctx.globalAlpha = k; ctx.strokeStyle = r.color; ctx.lineWidth = 2.2 * zoom;
      for (let i = 0; i + 1 < r.points.length; i++) jagged(ctx, P(...r.points[i]), P(...r.points[i + 1]), r.seed + i + Math.floor(this.time * 30));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      for (let i = 0; i + 1 < r.points.length; i++) jagged(ctx, P(...r.points[i]), P(...r.points[i + 1]), r.seed + i + Math.floor(this.time * 30));
    }
    ctx.restore();
  }
  /** Things in the air with normal drawing: rubble chunks, smoke, rings, flung bodies, shadows of airborne bits. */
  drawSolid(ctx, P, zoom) {
    for (const p of this.parts) {
      const k = 1 - p.age / p.life, fade = k < 0.35 ? k / 0.35 : 1;
      if (p.kind === 'chunk') {
        const { sx, sy } = P(p.x, p.z, p.y), s = p.size * zoom;
        if (p.y > 0.05) { const g = P(p.x, p.z, 0); ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = '#000'; ctx.fillRect(g.sx - s / 2, g.sy - s / 4, s, s / 2); }
        ctx.globalAlpha = fade; ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s * 0.8); ctx.restore();
      } else if (p.kind === 'smoke') {
        const { sx, sy } = P(p.x, p.z, p.y), s = p.size * zoom;
        ctx.globalAlpha = 0.32 * Math.min(1, p.age * 4) * (k < 0.4 ? k / 0.4 : 1);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const r of this.rings) {
      const k = r.age / r.life, { sx, sy } = P(r.x, r.z, 0), rx = r.radius * k * 32 * zoom;
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = r.width * zoom * (1 - k * 0.5);
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const b of this.bodies) {
      if (!b.sprite) continue;
      const { sx, sy } = P(b.x, b.z, b.y), g = P(b.x, b.z, 0);
      const fade = b.landed ? 1 - (b.age - b.landedAt) / 0.35 : 1;
      ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 8 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade; ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.rot);
      const s = b.sprite, sc = s.scale * zoom; ctx.drawImage(s.img, -s.ax * sc, -s.ay * sc * 0.6, s.w * sc, s.h * sc); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  /** Full-screen flash: additive white-blue, 2 frames up, fading. */
  drawFlash(ctx, W, H) {
    if (this.flash <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.8, this.flash); ctx.fillStyle = '#cfe0ff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
function jagged(ctx, a, b, seed) {
  const n = 6; let s = seed * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  const dx = b.sx - a.sx, dy = b.sy - a.sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy);
  for (let i = 1; i < n; i++) { const t = i / n, o = r() * len * 0.18; ctx.lineTo(a.sx + dx * t + nx * o, a.sy + dy * t + ny * o); }
  ctx.lineTo(b.sx, b.sy); ctx.stroke();
}
export { glowSprite, PX_PER_HEIGHT };
