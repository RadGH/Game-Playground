// The Scene: a slice of Arcline to judge the look AND the feel before the game exists — a river with two bridges (the
// choke points), a wall line with gates, turrets behind it, a small city, and alien creatures flocking in from their
// nests. Turrets fire visible shots; a mortar lobs shells; the Orbital strike falls for 2.2 s and lands with the full
// boom recipe from prototypes/arcline/docs/research-boom-feel.md. Weather and the day/night cycle play over it.
//
// Simulation: fixed 1/30 s steps, drawn smoothly between the last two steps (lessons rule 28). Effects run in real
// time (the research: big effects never follow game speed).
import { Baker, composite } from './bake.js';
import { toScreen, toWorld, turnXZ, dirOfHeading, headingOfDir, TILE_W, TILE_H } from './iso.js';
import { RECIPES, build } from './kit/buildings.js';
import './kit/all.js';
import { Grid, T } from './world/field.js';
import { Horde, KINDS } from './world/horde.js';
import { Defence, TURRETS } from './world/defence.js';
import { Fx } from './world/fx.js';
import { Weather } from './world/weather.js';
import * as snd from './world/sound.js';
import { fmt } from '../../shared/format.js';

const STEP = 1 / 30;
const MAP_W = 26, MAP_D = 26;
const CORE = [13, 22];
const NESTS = [[6, 3], [20, 4], [13, 1]];
const BRIDGES = [8, 18];      // x of the two bridges over the river at z = 10..11
const WALL_Z = 14;            // the wall line runs along x at this z, with gates at the bridge roads

export class Scene {
  constructor(canvas, ui = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ui = ui;
    this.baker = new Baker({ scale: 2 });
    this.sprites = new Map(); this.bakeQueue = []; this.bakeBusy = false;
    this.cam = { x: 13, z: 13, zoom: 1, rot: 0 };
    this.time = 0.15; this.autoTime = false; this.speed = 1; this.paused = false; this.spawnRate = 1;
    this.stats = { killed: 0, strikes: 0 };
    this.strike = { charges: 3, arming: false, falling: [] };
    this.fx = new Fx({ phone: matchMedia('(max-width: 700px)').matches });
    this.weather = new Weather({ onThunder: pan => snd.play('thunder', { pan, gain: 0.7 }) });
    this._build();
    this._input();
    this.acc = 0; this.last = performance.now(); this.running = false;
  }

  // ---------------- the map ----------------
  _build() {
    const g = this.grid = new Grid(MAP_W, MAP_D);
    this.roads = new Set();
    for (let x = 0; x < MAP_W; x++) { g.set(x, 10, T.WATER); g.set(x, 11, T.WATER); }
    for (const bx of BRIDGES) {
      g.set(bx, 10, T.BRIDGE); g.set(bx, 11, T.BRIDGE);
      for (let z = 6; z < 22; z++) if (g.at(bx, z) === T.LAND) this.roads.add(`${bx},${z}`);
    }
    for (let x = 4; x < 23; x++) this.roads.add(`${x},21`);
    this.walls = [];
    for (let x = 0; x < MAP_W; x++) { const gate = BRIDGES.includes(x); g.set(x, WALL_Z, T.WALL, gate ? 260 : 200); this.walls.push({ x, z: WALL_Z, gate, max: gate ? 260 : 200 }); }
    g.solve([CORE]);
    // the city: lots placed behind the wall (each lot's tiles are BUILDING, chewable but costly)
    this.lots = [
      { id: 'com-hotel', x: 9, z: 17, params: { floors: 18, style: 'pearl', seed: 4 } },
      { id: 'com-office', x: 15, z: 17, params: { floors: 30, style: 'chrome', seed: 2, shape: 1 } },
      { id: 'res-tower', x: 19, z: 18, params: { floors: 26, style: 'graphite', seed: 7, taper: 2 } },
      { id: 'res-block', x: 4, z: 18, params: { floors: 9, style: 'copper', seed: 3 } },
      { id: 'com-shops', x: 11, z: 22, params: { floors: 2, style: 'graphite', seed: 5 } },
      { id: 'res-pods', x: 2, z: 23, params: { floors: 2, style: 'pearl', seed: 8 } },
      { id: 'com-market', x: 16, z: 22, params: { stalls: 5, style: 'concrete', seed: 6 } },
      { id: 'res-terrace', x: 19, z: 22, params: { floors: 3, style: 'chrome', seed: 9 } },
    ];
    if (RECIPES['col-core']) this.lots.push({ id: 'col-core', x: 12, z: 23, params: { style: 'chrome', seed: 1 } });
    for (const l of this.lots) { const [w, d] = RECIPES[l.id].size; for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) if (g.at(l.x + i, l.z + k) === T.LAND && !this.roads.has(`${l.x + i},${l.z + k}`)) g.set(l.x + i, l.z + k, T.BUILDING, 400); }
    g.solve([CORE]);
    this.horde = new Horde(g, {
      onKill: (c, from) => this._onKill(c, from),
      onWallBroken: (x, z) => { this.grid.solve([CORE]); this._wallBroke(x, z); },
    });
    this.defence = new Defence(this.horde, {
      muzzle: t => this._muzzle(t),
      onFire: (t, kind, d) => this._onFire(t, kind, d),
      onImpact: (kind, d) => this._onImpact(kind, d),
    });
    const slots = [[3, 'pulse'], [6, 'mortar'], [7, 'pulse'], [9, 'arc'], [10, 'pulse'], [12, 'rail'], [14, 'mortar'], [16, 'pulse'], [17, 'arc'], [19, 'pulse'], [21, 'rail'], [23, 'pulse']];
    for (const [x, k] of slots) this.defence.add(k, x, WALL_Z + 1 + (x % 2));
    this.spawnClock = 0; this.bigClock = 0;
  }

  reset() { this.fx = new Fx({ phone: this.fx.budget < 1000 }); this.stats = { killed: 0, strikes: 0 }; this.strike = { charges: 3, arming: false, falling: [] }; this._build(); this.ui.update?.(); }

  // ---------------- spawning: constant pressure (owner: no set waves) ----------------
  _spawn(dt) {
    this.spawnClock -= dt * this.spawnRate;
    if (this.spawnClock <= 0) {
      this.spawnClock = 1.6 + Math.random() * 1.8;
      const [nx, nz] = NESTS[Math.floor(Math.random() * NESTS.length)];
      const roll = Math.random();
      const kind = roll < 0.75 ? 'swarmer' : roll < 0.87 ? 'breaker' : roll < 0.985 ? 'sapper' : 'brute';
      const n = kind === 'swarmer' ? 4 + Math.floor(Math.random() * 7) : kind === 'brute' ? 1 : 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) this.horde.spawn(kind, nx + 0.5 + (Math.random() - 0.5) * 1.6, nz + 0.5 + (Math.random() - 0.5) * 1.6);
    }
  }
  swarm() {
    for (let i = 0; i < 70; i++) { const [nx, nz] = NESTS[i % NESTS.length]; this.horde.spawn(i % 14 === 0 ? 'breaker' : i % 23 === 0 ? 'sapper' : 'swarmer', nx + 0.5 + (Math.random() - 0.5) * 2.4, nz + 0.5 + (Math.random() - 0.5) * 2.4); }
    this.horde.spawn('brute', NESTS[0][0] + 0.5, NESTS[0][1] + 0.5);
  }

  // ---------------- events → effects + sound ----------------
  _pan(x, z) { const p = this.P(x, z, 0); return (p.sx / Math.max(1, this.W)) * 2 - 1; }
  _onFire(t, kind, d) {
    const fx = this.fx;
    if (kind === 'pulse') { fx.light(d.x, d.z, 0.7, 0.06, '#7fe8ff', 0.8); fx.spark(d.x, d.z, d.y, 2, { speed: [1, 2], life: [0.05, 0.1], color: '#bff4ff' }); snd.play('tower.shot', { pan: this._pan(d.x, d.z), gain: 0.45, pitch: 1.1 + Math.random() * 0.2 }); }
    else if (kind === 'arc') { fx.arc(d.pts, { life: 0.14, color: '#b49bff' }); for (const p of d.pts.slice(1)) fx.light(p[0], p[1], 1.1, 0.18, '#a58bff', 1); snd.play('spell.lightning.impact', { pan: this._pan(t.x, t.z), gain: 0.55 }); }
    else if (kind === 'rail') { fx.beam(d.muzzle.x, d.muzzle.z, d.muzzle.y, d.end.x, d.end.z, d.end.y, { life: 0.16, color: '#9fe8ff', width: 4 }); fx.light(d.muzzle.x, d.muzzle.z, 1.2, 0.15, '#9fe8ff', 1); fx.shake(0.1); snd.play('thunder', { pan: this._pan(t.x, t.z), gain: 0.35, pitch: 1.6 }); }
    else if (kind === 'mortar') { fx.light(d.x, d.z, 1.0, 0.1, '#ffb35a', 0.9); fx.smoke(d.x, d.z, 6, { life: [0.6, 1.1], size: [5, 10], rise: 0.5, spread: 0.15, color: '#6a6a70' }); snd.play('explosion.small', { pan: this._pan(d.x, d.z), gain: 0.4, pitch: 0.62 + Math.random() * 0.08 }); }
  }
  _onImpact(kind, d) {
    const fx = this.fx;
    if (kind === 'pulse-hit') { fx.light(d.x, d.z, 0.5, 0.08, '#bff4ff', 1); fx.spark(d.x, d.z, 0.25, 7, { speed: [3, 6], life: [0.15, 0.3], color: '#d6f6ff' }); if (Math.random() < 0.5) fx.smoke(d.x, d.z, 1, { life: [0.4, 0.7], size: [3, 6], spread: 0.05 }); snd.play('spell.physical.impact', { pan: this._pan(d.x, d.z), gain: 0.3 }); }
    else if (kind === 'rail-hit') { fx.spark(d.x, d.z, 0.3, 12, { speed: [4, 8], life: [0.2, 0.4], color: '#d6f6ff' }); }
    else if (kind === 'arc-hit') { fx.spark(d.x, d.z, 0.3, 5, { speed: [2, 4], life: [0.1, 0.25], color: '#d2c4ff' }); }
    else if (kind === 'mortar') {
      const { x, z } = d;
      fx.light(x, z, 3, 0.3, '#ffb35a', 1.2); fx.ring(x, z, 2.2, 0.2); fx.decal(x, z, 1.2, 20);
      fx.spark(x, z, 0.2, 36, { speed: [4, 8], life: [0.25, 0.5], color: '#ffd27a', up: [1, 4] });
      fx.chunks(x, z, 16, { speed: [1.5, 3.5], up: [3, 5], hot: 0.5 });
      fx.embers(x, z, 12, { speed: [0.8, 2], up: [3, 5], life: [1.2, 1.8], g: 6 });
      fx.smoke(x, z, 10, { life: [1.5, 2.5], rise: 0.3 });
      if (this._onScreen(x, z)) fx.shake(0.22);
      snd.play('explosion.small', { pan: this._pan(x, z), gain: 0.8, pitch: 0.9 + Math.random() * 0.2 });
      snd.play('fragment.crash.small', { pan: this._pan(x, z), gain: 0.35, delay: 0.15 + Math.random() * 0.15 });
    }
  }
  _onKill(c, from) {
    this.stats.killed++;
    const k = KINDS[c.kind], fx = this.fx;
    const dx = c.x - (from?.[0] ?? c.x), dz = c.z - (from?.[1] ?? c.z), l = Math.hypot(dx, dz) || 1;
    const big = !!this._blastKill;   // a kill inside a blast flies further
    const s = big ? 2 + Math.random() * 3 : 0.5 + Math.random() * 1;
    fx.fling(c.x, c.z, dx / l * s / (k.mass ** 0.3), dz / l * s / (k.mass ** 0.3), big ? 4 + Math.random() * 3 : 2 + Math.random(), this._deathSprite(c), { colors: k.colors });
    fx.burst(c.x, c.z, k.colors, 9 + Math.floor(Math.random() * 4));
    snd.play('death.beast', { pan: this._pan(c.x, c.z), gain: 0.35, pitch: c.kind === 'brute' ? 0.6 : c.kind === 'swarmer' ? 1.4 : 1 });
  }
  _wallBroke(x, z) {
    this.fx.chunks(x + 0.5, z + 0.5, 14, { speed: [1, 3], up: [2, 4], colors: ['#7a808a', '#5d636c'] });
    this.fx.smoke(x + 0.5, z + 0.5, 6, { color: '#6b6e74' });
    snd.play('stone.crumble', { pan: this._pan(x, z), gain: 0.6 });
  }

  // ---------------- orbital strike ----------------
  armStrike(on = !this.strike.arming) { if (this.strike.charges <= 0) on = false; this.strike.arming = on; this.ui.update?.(); }
  _castStrike(x, z) {
    this.strike.charges--; this.strike.arming = false; this.stats.strikes++;
    // the fall always starts on screen: a fixed screen offset above the target (research: zoom can't hide it)
    this.strike.falling.push({ x, z, age: 0, fall: 2.2 });
    snd.play('meteor.fall', { pan: this._pan(x, z), gain: 0.9, delay: Math.max(0, 2.2 - 2.0 - 0.15) });
    this.ui.update?.();
  }
  _strikeUpdate(dt) {
    for (const s of this.strike.falling) {
      s.age += dt;
      const k = Math.min(1, s.age / s.fall);
      if (Math.random() < 0.9) { const p = this._strikePos(s); this.fx.light(s.x, s.z, 1 + 3 * k * k, 0.05, '#ff9a3a', 0.4 + k * 0.6); }
      if (s.age >= s.fall && !s.done) { s.done = true; this._strikeHit(s.x, s.z); }
    }
    this.strike.falling = this.strike.falling.filter(s => !s.done);
  }
  _strikePos(s) {
    // screen position: starts ~70% of the screen height above the target, a little to one side, accelerating down
    const k = Math.min(1, s.age / s.fall), e = k * k;
    const g = this.P(s.x, s.z, 0);
    return { sx: g.sx + (1 - e) * this.W * 0.12, sy: g.sy - (1 - e) * this.H * 0.7, k };
  }
  _strikeHit(x, z) {
    const fx = this.fx;
    this._blastKill = true;
    const r = this.horde.blast(x, z, { radius: 4.5, damage: 520, core: 2.7, edge: 0.2, push: 9, lift: 5, stun: 0.5 });
    this._blastKill = false;
    this.hitStop = 0.07;
    fx.screenFlash(0.8); fx.light(x, z, 10, 0.8, '#ffd6a0', 1.5); fx.light(x, z, 3, 0.5, '#ffffff', 1.5);
    fx.ring(x, z, 7, 0.35, 'rgba(255,245,220,0.95)', 5); fx.ring(x, z, 5, 1, 'rgba(120,96,70,0.8)', 8);
    fx.decal(x, z, 3.2, 40, 8);
    fx.spark(x, z, 0.3, 160, { speed: [8, 14], life: [0.3, 0.6], color: '#ffe0a0', up: [1, 5] });
    fx.chunks(x, z, 50, { speed: [2, 6], up: [6, 10], hot: 0.6, colors: ['#3a3f48', '#4b4440', '#2c2a2e'] });
    fx.embers(x, z, 50, { speed: [1, 3], up: [4, 7], life: [2, 3], g: 4 });
    fx.smoke(x, z, 32, { life: [3, 5], size: [16, 34], rise: 0.45, spread: 1.6, color: '#3b3d44' });
    fx.shake(0.8); fx.roll = 1;
    const pan = this._pan(x, z);
    snd.play('explosion.large', { pan, gain: 1.3, pitch: 0.85 + Math.random() * 0.1 });
    snd.play('quake.rumble', { pan, gain: 0.6 });
    snd.play('fragment.crash.large', { pan, gain: 0.5, delay: 0.25 });
    snd.play('stone.crumble', { pan, gain: 0.35, delay: 0.6 });
    navigator.vibrate?.(80);
    this.lastStrike = { x, z, ...r };
    this.ui.update?.();
  }

  // ---------------- sprites (baked on demand, a few per frame) ----------------
  _sprite(key, make) {
    const s = this.sprites.get(key);
    if (s) return s;
    if (!this.bakeQueue.some(q => q.key === key)) this.bakeQueue.push({ key, make });
    return null;
  }
  _bakeSome(budgetMs = 10) {
    const t0 = performance.now();
    while (this.bakeQueue.length && performance.now() - t0 < budgetMs) {
      const { key, make } = this.bakeQueue.shift();
      try { this.sprites.set(key, make()); } catch (e) { this.sprites.set(key, { failed: String(e) }); }
    }
  }
  _buildingSprite(id, params, rot) { return this._sprite(`b|${id}|${JSON.stringify(params)}|${rot}`, () => this.baker.bakePair(build(id, params), { rot })); }
  _facingSprite(id, params, dir, n, anim = null, frame = 0) {
    if (!RECIPES[id]) return null;
    return this._sprite(`f|${id}|${JSON.stringify(params)}|${dir}|${anim}|${frame}`, () => {
      const g = build(id, params), h = headingOfDir(dir, n, 0);
      if (anim && g.userData.pose) g.userData.pose(anim, frame / RECIPES[id].anims[anim].frames, h);
      else g.userData.face?.(h);
      return this.baker.bakePair(g, { rot: 0 });
    });
  }
  _creatureSprite(c, anim) {
    const k = KINDS[c.kind], r = RECIPES[k.recipe]; if (!r?.anims?.[anim]) return null;
    const a = r.anims[anim], dir = dirOfHeading(c.heading, r.dirs || 8, this.cam.rot);
    const frame = anim === 'die' ? a.frames - 1 : Math.floor(c.t * (a.fps || 10)) % a.frames;
    return this._facingSprite(k.recipe, {}, dir, r.dirs || 8, anim, frame);
  }
  _deathSprite(c) {
    const s = this._creatureSprite(c, 'die') || this._creatureSprite(c, 'walk');
    return s && !s.failed ? { img: s.day, ax: s.ax, ay: s.ay, w: s.w, h: s.h, scale: 1 / this.baker.scale } : null;
  }
  _muzzle(t) {
    const r = RECIPES[TURRETS[t.kind].recipe];
    if (r) {
      this._muzzleModel ??= {};
      const g = this._muzzleModel[t.kind] ??= build(TURRETS[t.kind].recipe, {});
      const m = g.userData.muzzle?.(t.heading);
      if (m) return { x: t.x + 0.5 + m.x, z: t.z + 0.5 + m.z, y: m.y };
    }
    return { x: t.x + 0.5 + Math.cos(t.heading) * 0.3, z: t.z + 0.5 + Math.sin(t.heading) * 0.3, y: 0.55 };
  }

  // ---------------- projection + input ----------------
  P = (x, z, y = 0) => {
    const { sx, sy } = toScreen(x - this.cam.x, z - this.cam.z, y, this.cam.rot);
    return { sx: this.W / 2 + sx * this.cam.zoom + this.shk.x, sy: this.H / 2 + sy * this.cam.zoom + this.shk.y };
  };
  shk = { x: 0, y: 0 };
  _toWorld(px, py) { const [x, z] = toWorld((px - this.W / 2) / this.cam.zoom, (py - this.H / 2) / this.cam.zoom, this.cam.rot); return [x + this.cam.x, z + this.cam.z]; }
  _onScreen(x, z) { const p = this.P(x, z); return p.sx > -40 && p.sy > -40 && p.sx < this.W + 40 && p.sy < this.H + 40; }
  _input() {
    const cv = this.cv; const ptrs = new Map(); let drag = null, pinch = null, moved = 0;
    cv.addEventListener('pointerdown', e => {
      if (e.isPrimary) ptrs.clear();           // iOS can skip pointerup (lessons H4)
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); moved = 0;
      if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: this.cam.x, cz: this.cam.z };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: this.cam.zoom }; drag = null; }
      snd.startSound().then(() => this.ui.update?.());
    });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) { this.hover = this._toWorld(e.offsetX, e.offsetY); return; }
      ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      this.hover = this._toWorld(e.offsetX, e.offsetY);
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; this.cam.zoom = clamp(pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 0.4, 3); return; }
      if (drag) {
        moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        const [ax, az] = toWorld((e.offsetX - drag.x) / this.cam.zoom, (e.offsetY - drag.y) / this.cam.zoom, this.cam.rot);
        this.cam.x = clamp(drag.cx - ax, 0, MAP_W); this.cam.z = clamp(drag.cz - az, 0, MAP_D);
      }
    });
    const up = e => {
      if (ptrs.size === 1 && moved < 8 && this.strike.arming) { const [x, z] = this._toWorld(e.offsetX, e.offsetY); this._castStrike(x, z); }
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = pinch = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.cam.zoom = clamp(this.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 3); }, { passive: false });
  }

  // ---------------- loop ----------------
  start() { if (this.running) return; this.running = true; this.last = performance.now(); const tick = now => { if (!this.running) return; this.frame(now); this.raf = requestAnimationFrame(tick); }; this.raf = requestAnimationFrame(tick); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(now) {
    const real = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.hitStop = Math.max(0, (this.hitStop || 0) - real);
    if (!this.paused && !this.hitStop) {
      this.acc += real * this.speed;
      let n = 0;
      while (this.acc >= STEP && n++ < 8) {
        for (const c of this.horde.list) { c.px = c.x; c.pz = c.z; }
        for (const b of this.defence.shots) { b.ppx = b.x; b.ppz = b.z; }
        this._spawn(STEP); this.horde.step(STEP); this.defence.step(STEP);
        this.acc -= STEP;
      }
      if (this.acc > STEP * 8) this.acc = 0;
    }
    this.alpha = this.acc / STEP;
    if (this.autoTime) this.time = (this.time + real / 120) % 1;
    this._strikeUpdate(real);      // real time, whatever the game speed
    this.fx.update(real);
    const night = this.night();
    this.weather.update(real, this.W || 1, this.H || 1, night);
    this._bakeSome(this.sprites.size < 40 ? 30 : 8);
    this.draw();
    if ((this._uiTick = (this._uiTick || 0) + real) > 0.25) { this._uiTick = 0; this.ui.update?.(); }
  }
  /** 0 noon … 1 deep night, from the cycle position (0..1: 0 = noon, 0.5 = midnight). */
  night() { const t = this.time; const d = Math.cos(t * Math.PI * 2); return clamp(0.5 - d * 0.75, 0, 1); }

  draw() {
    const cv = this.cv, ctx = this.ctx, dpr = Math.min(2, devicePixelRatio || 1);
    const W = this.W = cv.clientWidth, H = this.H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shk = this.fx.shakeOffset(14); this.shk = shk;
    const night = this.night(), zoom = this.cam.zoom, rot = this.cam.rot;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const rainy = this.weather.raining ? 0.35 : 0;
    sky.addColorStop(0, mix(mix('#87b2d6', '#4a5866', rainy), '#060915', night)); sky.addColorStop(1, mix(mix('#cfe0ea', '#7a8792', rainy), '#141a2e', night));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night > 0.4) this._stars(ctx, W, H, night);
    this.weather.drawSky(ctx, W, H, night);
    // ground
    this._ground(ctx, night);
    this.fx.drawGround(ctx, this.P, zoom);
    // things, back to front
    const items = [];
    const depth = (x, z) => { const [rx, rz] = turnXZ(x, z, rot); return rx + rz; };
    for (const w of this.walls) {
      const i = this.grid.i(w.x, w.z), hp = this.grid.hp[i], up = this.grid.kind[i] === T.WALL;
      if (!up) continue;
      const dmg = hp > w.max * 0.66 ? 0 : hp > w.max * 0.33 ? 1 : 2;
      const id = w.gate ? 'wall-gate' : 'wall-straight';
      if (!RECIPES[id]) { items.push({ d: depth(w.x + 0.5, w.z + 0.5), draw: () => this._fallbackBox(w.x + 0.5, w.z + 0.5, 0.5, '#7a8290') }); continue; }
      const params = w.gate ? { open: 0, tier: 2 } : { tier: 2, damage: dmg };
      items.push({ d: depth(w.x + 0.5, w.z + 0.5), draw: () => this._drawPair(this._buildingSprite(id, params, rot), w.x + 0.5, w.z + 0.5) });
    }
    for (const l of this.lots) {
      const [w, d] = RECIPES[l.id].size; const cx = l.x + w / 2, cz = l.z + d / 2;
      // depth = the lot's front corner after turning, so tall buildings sort behind what stands in front of them
      let best = -Infinity; for (const [ox, oz] of [[0, 0], [w, 0], [0, d], [w, d]]) best = Math.max(best, depth(l.x + ox, l.z + oz));
      items.push({ d: best - 0.5, draw: () => this._drawPair(this._buildingSprite(l.id, l.params, rot), cx, cz) });
    }
    for (const t of this.defence.turrets) {
      const r = RECIPES[TURRETS[t.kind].recipe];
      items.push({ d: depth(t.x + 0.5, t.z + 0.5), draw: () => {
        if (!r) return this._fallbackBox(t.x + 0.5, t.z + 0.5, 0.35, '#5ab0ff');
        const dir = dirOfHeading(t.heading, r.dirs || 16, rot);
        this._drawPair(this._facingSprite(TURRETS[t.kind].recipe, {}, dir, r.dirs || 16), t.x + 0.5, t.z + 0.5, -t.recoil * 1.5);
      } });
    }
    const a = this.alpha;
    for (const c of this.horde.list) {
      const x = lerp(c.px ?? c.x, c.x, a), z = lerp(c.pz ?? c.z, c.z, a);
      items.push({ d: depth(x, z), draw: () => {
        const s = this._creatureSprite(c, c.state === 'attack' ? 'attack' : 'walk');
        if (!s || s.failed) return this._fallbackCreature(c, x, z);
        const g = this.P(x, z, c.lift);
        composite(this.ctx, s, g.sx, g.sy, night, zoom / this.baker.scale);
        if (c.flash > 0) { this.ctx.save(); this.ctx.globalCompositeOperation = 'lighter'; this.ctx.globalAlpha = 0.6; composite(this.ctx, s, g.sx, g.sy, 0, zoom / this.baker.scale); this.ctx.restore(); }
      } });
    }
    items.sort((p, q) => p.d - q.d);
    for (const it of items) it.draw();
    // shots and shells
    this._shots(ctx, zoom, a);
    this.fx.drawSolid(ctx, this.P, zoom);
    this.fx.drawLights(ctx, this.P, zoom);
    this._strikeDraw(ctx, zoom);
    this.weather.drawOver(ctx, W, H, night);
    this.fx.drawFlash(ctx, W, H);
    if (this.strike.arming && this.hover) this._aimRing(ctx, this.hover[0], this.hover[1], 4.5, zoom);
    if (this.bakeQueue.length > 20) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(12, H - 34, 210, 24); ctx.fillStyle = '#fff'; ctx.font = '13px system-ui'; ctx.fillText(`Drawing pictures… ${this.bakeQueue.length} to go`, 20, H - 17); }
  }
  _drawPair(pair, x, z, lift = 0) {
    if (!pair || pair.failed) return;
    const g = this.P(x, z, 0); composite(this.ctx, pair, g.sx, g.sy + lift, this.night(), this.cam.zoom / this.baker.scale);
  }
  _ground(ctx, night) {
    const zoom = this.cam.zoom, t = performance.now() / 1000;
    for (let z = 0; z < MAP_D; z++) for (let x = 0; x < MAP_W; x++) {
      const k = this.grid.at(x, z), road = this.roads.has(`${x},${z}`);
      const g = this.P(x + 0.5, z + 0.5, 0);
      if (g.sx < -TILE_W * zoom || g.sy < -TILE_H * zoom || g.sx > this.W + TILE_W * zoom || g.sy > this.H + TILE_H * zoom) continue;
      const wild = z < 10;
      let col = k === T.WATER ? mix('#2a6f9e', '#3b8bbf', 0.5 + 0.5 * Math.sin(t * 1.3 + x * 0.7 + z * 1.1))
        : k === T.BRIDGE ? '#6a6f78' : road ? '#4b5058' : wild ? ((x * 7 + z * 13) % 5 ? '#5d6b48' : '#566444') : ((x + z) % 2 ? '#6b8a5c' : '#668456');
      if (NESTS.some(([nx, nz]) => Math.hypot(nx - x, nz - z) < 1.6)) col = '#4a3a52';
      if (k === T.LAND && this.walls.some(w => w.x === x && w.z === z)) col = '#4d4a46';   // rubble where a wall fell
      col = mix(col, k === T.WATER ? '#0c1830' : '#141a26', night * 0.82);
      diamond(ctx, g.sx, g.sy, TILE_W * zoom / 2 + 0.5, TILE_H * zoom / 2 + 0.5, col);
      if (k === T.BRIDGE) { ctx.strokeStyle = mix('#9aa2ac', '#2a3040', night * 0.7); ctx.lineWidth = Math.max(1, 2 * zoom); ctx.beginPath(); const a = this.P(x, z + 0.1), b = this.P(x, z + 0.9), c = this.P(x + 1, z + 0.1), d = this.P(x + 1, z + 0.9); ctx.moveTo(a.sx, a.sy - 3 * zoom); ctx.lineTo(b.sx, b.sy - 3 * zoom); ctx.moveTo(c.sx, c.sy - 3 * zoom); ctx.lineTo(d.sx, d.sy - 3 * zoom); ctx.stroke(); }
    }
    // nests glow a little at night
    if (night > 0.2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const [nx, nz] of NESTS) { const g = this.P(nx + 0.5, nz + 0.5); ctx.globalAlpha = night * 0.5; const r = 46 * zoom; const gr = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, r); gr.addColorStop(0, '#b06bff'); gr.addColorStop(1, 'rgba(176,107,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, r, r / 2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  }
  _stars(ctx, W, H, night) {
    this._starList ??= Array.from({ length: 140 }, () => [Math.random(), Math.random() * 0.6, Math.random()]);
    ctx.fillStyle = '#ffffff';
    for (const [x, y, b] of this._starList) { ctx.globalAlpha = (night - 0.4) * 1.6 * (0.3 + b * 0.7) * (0.75 + 0.25 * Math.sin(performance.now() / 700 + b * 40)); ctx.fillRect(x * W, y * H, 1.5, 1.5); }
    ctx.globalAlpha = 1;
  }
  _shots(ctx, zoom, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const b of this.defence.shots) {
      const x = lerp(b.ppx ?? b.x, b.x, a), z = lerp(b.ppz ?? b.z, b.z, a);
      const p = this.P(x, z, b.y * 0.6), q = this.P(x - b.vx * 0.045, z - b.vz * 0.045, b.y * 0.6);
      ctx.strokeStyle = 'rgba(120,230,255,0.55)'; ctx.lineWidth = 5 * zoom; ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
      ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2 * zoom; ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
    }
    for (const s of this.defence.shells) {
      const pos = Defence.shellPos(s), p = this.P(pos.x, pos.z, pos.y), g = this.P(pos.x, pos.z, 0);
      // shadow shrinks as it climbs, grows as it falls
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; const sh = (4 - pos.y) * 1.6 * zoom; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, sh, sh / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (pos.k > 0.7) { ctx.strokeStyle = `rgba(255,80,60,${(pos.k - 0.7) * 2})`; ctx.lineWidth = 1.5; const e = this.P(s.tx, s.tz); const r = s.radius * 32 * zoom; ctx.beginPath(); ctx.ellipse(e.sx, e.sy, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#ffd27a'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(p.sx, p.sy, 7 * zoom, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.5 * zoom, 0, Math.PI * 2); ctx.fill();
      if (Math.random() < 0.6) this.fx.spark(pos.x, pos.z, pos.y, 1, { speed: [0.2, 0.6], life: [0.2, 0.3], color: '#ffb35a', up: [0, 0] });
    }
    ctx.restore();
  }
  _strikeDraw(ctx, zoom) {
    for (const s of this.strike.falling) {
      const p = this._strikePos(s), k = p.k;
      this._aimRing(ctx, s.x, s.z, 4.5 * (1 - k * 0.6), zoom, `rgba(255,${120 - k * 80},60,${0.4 + k * 0.5})`);
      this._aimRing(ctx, s.x, s.z, 4.5, zoom, 'rgba(255,200,120,0.35)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = 30 + k * 30;
      const gr = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, halo); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.15, '#ffd08a'); gr.addColorStop(0.5, 'rgba(255,140,50,0.4)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.sx, p.sy, halo, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // trail
      const [tx, tz] = this._toWorld(p.sx, p.sy);
      if (Math.random() < 0.8) this.fx.smoke(tx, tz, 1, { life: [0.4, 0.6], size: [4, 8], rise: 0, spread: 0.05, color: '#8a7f78' });
    }
  }
  _aimRing(ctx, x, z, r, zoom, color = 'rgba(255,190,90,0.9)') {
    const g = this.P(x, z); const rx = r * 32 * zoom; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -performance.now() / 40;
    ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  _fallbackBox(x, z, h, col) { const g = this.P(x, z, 0), t = this.P(x, z, h); this.ctx.fillStyle = col; this.ctx.fillRect(g.sx - 12 * this.cam.zoom, t.sy, 24 * this.cam.zoom, g.sy - t.sy); }
  _fallbackCreature(c, x, z) { const g = this.P(x, z, c.lift), r = KINDS[c.kind].radius * 32 * this.cam.zoom; this.ctx.fillStyle = KINDS[c.kind].colors[0]; this.ctx.beginPath(); this.ctx.ellipse(g.sx, g.sy - r * 0.5, r, r * 0.6, 0, 0, Math.PI * 2); this.ctx.fill(); }

  /** Numbers for the scene's status line (and tests). */
  info() {
    let up = 0; for (const w of this.walls) if (this.grid.kind[this.grid.i(w.x, w.z)] === T.WALL) up++;
    return { creatures: this.horde.list.length, killed: this.stats.killed, walls: up, wallsTotal: this.walls.length, charges: this.strike.charges, arming: this.strike.arming, sound: snd.soundOn(), particles: this.fx.parts.length, lastStrike: this.lastStrike || null };
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function diamond(ctx, x, y, hw, hh, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y); ctx.closePath(); ctx.fill(); }
function mix(a, b, t) {
  const p = s => s.startsWith('rgb') ? s.match(/\d+/g).slice(0, 3).map(Number) : [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
export { fmt };
