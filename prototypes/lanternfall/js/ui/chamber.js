// The Wick builder's test chamber (docs/02 §15.4, 03 §16.1): a tiny 160 × 96-cell room run by the REAL cell
// simulation and the REAL spell code (createGame + enterRoom + tickGame + castPlan), drawn flat-coloured from
// data/materials.json ramps. A water pool, a wood post, an oil puddle, an ice block and an unkillable training
// dummy. Oil is unlimited but counted, so damage per oil is real; a private meters/ Meter records every hit.
// Also used by the class select preview (02 §9). Runs only while its canvas is on screen.
import { createGame, enterRoom } from '../core/state.js';
import { tickGame } from '../core/tick.js';
import { castPlan } from '../spells/instances.js';
import { compileWick, wickName } from '../spells/wick.js';
import { createActor } from '../entities/actor.js';
import { Meter } from '../../../../meters/js/meter.js';

export const CHAMBER_W = 160, CHAMBER_H = 96;
const FLOOR = 80;
/** The room, as a normal room file (10 §6), so it goes through the same loader as every other room. */
export function chamberRoom(preset = 'sandbox_mixed') {
  const row = c => c.repeat(CHAMBER_W / 8);
  const map = []; for (let r = 0; r < CHAMBER_H / 8; r++) map.push(r === 0 ? row('#') : r >= FLOOR / 8 ? row('#') : '#' + '.'.repeat(CHAMBER_W / 8 - 2) + '#');
  const ops = [];
  if (preset === 'sandbox_flooded') ops.push({ op: 'rect', rect: [8, 60, 144, 20], mat: 'water' });
  else ops.push(
    { op: 'rect', rect: [54, 70, 2, 10], mat: 'stone' }, { op: 'rect', rect: [88, 70, 2, 10], mat: 'stone' }, { op: 'rect', rect: [56, 71, 32, 9], mat: 'water' },
    { op: 'rect', rect: [26, 78, 1, 2], mat: 'stone' }, { op: 'rect', rect: [47, 78, 1, 2], mat: 'stone' }, { op: 'rect', rect: [27, 78, 20, 2], mat: 'oil' },
    { op: 'rect', rect: [100, 54, 4, 26], mat: 'wood' }, { op: 'rect', rect: [112, 70, 10, 10], mat: 'ice' }, { op: 'rect', rect: [70, 20, 6, 6], mat: 'brick' });
  return { format: 1, id: 'chamber_' + preset, name: 'Test chamber', act: 'none', kind: 'bench', size: [CHAMBER_W, CHAMBER_H], block: 8, seed: 11, theme: 'bench', rain: { density: 0 },
    map, ops, things: [{ t: 'entry', id: 'w', at: [14, FLOOR - 1], face: 'r' }], decor: {} };
}

export class TestChamber {
  /** opts: { hero, stats, burn, dummyHp, preset, loop: seconds between auto casts, onCast } */
  constructor(canvas, data, opts = {}) {
    this.canvas = canvas; this.data = data; this.opts = { loop: 2, dummyHp: 10000, preset: 'sandbox_mixed', ...opts };
    canvas.width = CHAMBER_W; canvas.height = CHAMBER_H;
    this.ctx2 = canvas.getContext('2d'); this.img = this.ctx2.createImageData(CHAMBER_W, CHAMBER_H);
    this.ramps = []; for (const m of data.materials.list) this.ramps[m.id] = (m.ramp || ['#000']).map(h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
    this.meter = new Meter({ maxFights: 1 }); this.meter.startFight('chamber');
    this.wick = null; this.auto = true; this.running = false; this.t = 0; this.nextCast = 0.4; this.oilSpent = 0; this.casts = 0; this.cellsChanged = 0; this.lastErr = null;
    this.frameMs = 0; this.slow = false; this.aim = null; this.beamHold = 0;
    this.reset();
  }
  reset() {
    const d = this.data;
    const game = this.game = createGame({ data: d, seed: 7 });
    game.meter = this.meter;
    enterRoom(game, chamberRoom(this.opts.preset), 'w', { noDecor: true, settle: 20 });
    const p = game.player; Object.assign(p, { name: this.opts.hero?.name || 'You', hp: 1e6, maxHp: 1e6, oil: 1e6, maxOil: 1e6, team: 'player', stats: this.opts.stats || { level: 1 }, crit: this.opts.stats?.critChance || 0, critMult: this.opts.stats?.critMult || 1.5 });
    p.lantern = { x: p.x + 6, y: p.y - 16 };
    const hp = this.opts.dummyHp;
    this.dummy = createActor('dummy', { name: 'Training Dummy', x: 136, y: FLOOR, w: 6, h: 11, hp, extra: { refillT: 0 } });
    game.entities.push(this.dummy);
    this.base = game.grid.mat.slice();
    this.game.aim = { x: this.dummy.x, y: this.dummy.y - 5 };
  }
  setWick(wick, stats = this.opts.stats, burn = this.opts.burn) { this.wick = wick; this.opts.stats = stats; this.opts.burn = burn; if (this.game?.player) { this.game.player.stats = stats || { level: 1 }; } this.nextCast = Math.min(this.nextCast, 0.3); }
  plan() { if (!this.wick?.flame || !this.wick?.shape) return null; try { return compileWick(this.wick, this.data, this.opts.stats || {}, { burn: this.opts.burn }); } catch (e) { this.lastErr = e; return null; } }
  /** Cast the current wick at a chamber point (defaults to the dummy). */
  castAt(x, y) {
    const plan = this.plan(); if (!plan) return false;
    const g = this.game, p = g.player; const tx = x ?? this.dummy.x, ty = y ?? (plan.shape === 'rune' ? FLOOR - 1 : this.dummy.y - 5);
    p.facing = tx >= p.x ? 1 : -1; p.lantern = { x: p.x + p.facing * 6, y: p.y - 16 };
    const inst = castPlan(g, p, plan, { ox: p.lantern.x, oy: p.lantern.y, x: tx, y: ty }, { wickId: this.wick.id || 'test', wickName: wickName(this.wick, this.data) });
    if (plan.shape === 'beam' && inst[0]) { inst[0].aimFn = () => ({ x: tx, y: ty }); this.beamHold = 1.2; this.beam = inst[0]; }
    else this.oilSpent += plan.oil;
    this.casts++; this.opts.onCast?.(plan);
    return true;
  }
  step() {
    const g = this.game, p = g.player;
    // unlimited oil, but counted (beams pay per tick inside the spell code)
    const before = p.oil;
    try { tickGame(g, {}, null); } catch (e) { this.lastErr = e; }
    if (p.oil < before) this.oilSpent += before - p.oil; p.oil = 1e6; p.hp = 1e6; p.dead = false;
    if (this.beam) { this.beamHold -= 1 / 60; if (this.beamHold <= 0) { this.beam.holding = false; this.beam = null; } }
    // the unkillable dummy: refills after 3 s of no damage
    const d = this.dummy; if (d.hp < d.maxHp) { d.refillT = (d.refillT || 0) + 1 / 60; if (d.hp !== d.lastHp) d.refillT = 0; d.lastHp = d.hp; if (d.refillT > 3) d.hp = d.maxHp; }
    if (d.dead || d.hp <= 0) { d.dead = false; d.deadT = 0; d.hp = d.maxHp; if (!g.entities.includes(d)) g.entities.push(d); }
    this.t += 1 / 60; this.ticks = (this.ticks || 0) + 1; if (d.statuses && Object.keys(d.statuses).length) this.statusTicks = (this.statusTicks || 0) + 1;
    if (this.auto && this.wick && this.t >= this.nextCast) { this.nextCast = this.t + this.opts.loop; this.castAt(); }
  }
  /** Rolling 10 s numbers from the private meter (02 §15.5 Measured). */
  measured(window = 10) {
    const now = this.game.tick / 60, recs = this.meter.records('current').filter(r => r.t >= now - window && r.source === 'player');
    const dmg = recs.filter(r => r.kind === 'damage'); const total = dmg.reduce((s, r) => s + r.amount, 0);
    const span = Math.max(1, Math.min(window, now));
    let changed = 0; const m = this.game.grid.mat; for (let i = 0; i < m.length; i++) if (m[i] !== this.base[i]) changed++;
    this.cellsChanged = changed;
    return { dps: total / span, hits: dmg.length, perOil: this.oilSpent ? this.meter.records('current').filter(r => r.kind === 'damage' && r.source === 'player').reduce((s, r) => s + r.amount, 0) / this.oilSpent : 0,
      crit: dmg.length ? dmg.filter(r => r.crit).length / dmg.length : 0, cells: changed, oil: this.oilSpent, casts: this.casts,
      statusUptime: this.ticks ? (this.statusTicks || 0) / this.ticks : 0 };
  }
  clearStats() { this.meter = new Meter({ maxFights: 1 }); this.meter.startFight('chamber'); this.game.meter = this.meter; this.oilSpent = 0; this.casts = 0; this.ticks = 0; this.statusTicks = 0; }
  draw() {
    const g = this.game.grid, px = this.img.data, R = this.ramps, W = CHAMBER_W;
    for (let i = 0; i < g.n; i++) {
      const m = g.mat[i]; let c;
      if (m) { const r = R[m] || R[2]; c = r[g.shade[i] % r.length]; }
      else { const b = g.bg[i]; const r = R[b] || R[1]; const q = r[g.shade[i] % r.length]; c = [q[0] * 0.35, q[1] * 0.35, q[2] * 0.4]; }
      const o = i * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
      if (g.flags[i] & 1) { px[o] = 255; px[o + 1] = Math.min(255, px[o + 1] + 90); }
    }
    const put = (x, y, rgb) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= CHAMBER_H) return; const o = (y * W + x) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; };
    const box = (e, rgb) => { for (let y = Math.round(e.y - e.h); y < e.y; y++) for (let x = Math.round(e.x - e.w / 2); x < e.x + e.w / 2; x++) put(x, y, rgb); };
    const hex = h => { const n = parseInt((h || '#ffffff').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const d = this.dummy; box(d, d.hurtFlash > 0 ? [255, 255, 255] : [150, 118, 84]); put(d.x - 1, d.y - d.h + 2, [255, 210, 110]); put(d.x + 1, d.y - d.h + 2, [255, 210, 110]);
    const p = this.game.player; box(p, [70, 80, 110]); const lc = hex(this.plan()?.color || '#ff8a2a'); put(p.lantern?.x ?? p.x + 6, p.lantern?.y ?? p.y - 16, lc); put((p.lantern?.x ?? p.x + 6), (p.lantern?.y ?? p.y - 16) + 1, lc);
    for (const I of this.game.spells) {
      const c = hex(I.plan?.color);
      if (I.shape === 'beam' && I.ex != null) { const n = Math.hypot(I.ex - I.x, I.ey - I.y) | 0; for (let s = 0; s < n; s++) put(I.x + (I.ex - I.x) * s / n, I.y + (I.ey - I.y) * s / n, c); }
      else if (I.shape === 'tether' && I.ax != null) { const n = Math.hypot(I.bx - I.ax, I.by - I.ay) | 0; for (let s = 0; s < n; s += 2) put(I.ax + (I.bx - I.ax) * s / n, I.ay + (I.by - I.ay) * s / n, c); }
      else if (I.shape === 'ring' && I.radius) { for (let a = 0; a < 64; a++) put(I.x + Math.cos(a / 10.2) * I.radius, I.y + Math.sin(a / 10.2) * I.radius, c); }
      else { const r = Math.max(1, Math.min(3, (I.plan?.size || 2) / 2)); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(I.x + x, I.y + y, c); }
    }
    for (const f of this.game.fields || []) if (f.x != null) put(f.x, f.y, hex(f.color || '#ffaa55'));
    this.ctx2.putImageData(this.img, 0, 0);
  }
  start() {
    if (this.running) return; this.running = true; let last = performance.now(), acc = 0, skip = 0;
    const frame = now => {
      if (!this.running) return;
      if (!this.canvas.isConnected) { this.running = false; return; }
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      const t0 = performance.now(); let n = 0;
      const stepDt = this.slow ? 1 / 30 : 1 / 60;
      while (acc >= stepDt && n < 4) { this.step(); if (this.slow) this.step(); acc -= stepDt; n++; }
      if (!this.slow || (skip++ & 1) === 0) this.draw();
      this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
      if (this.frameMs > 12 && !this.slow) { this.slow = true; this.opts.onSlow?.(); } // 02 §15.4 fallback: 30 fps
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  /** Canvas pixel -> chamber cell. */
  cellAt(ev) { const r = this.canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * CHAMBER_W, y: (ev.clientY - r.top) / r.height * CHAMBER_H }; }
}
