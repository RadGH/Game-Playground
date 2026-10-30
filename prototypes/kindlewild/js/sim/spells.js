// Spells: each one is made of the world's own rules (blasts, heat, water, height, creatures).
// PURE. sim.spells.cast(id, x, y, { x2, y2, level }) does it; mana is the game layer's job.
// Lasting spells (tornado, void, shower, blessing, gale) live in `active` and step each tick.

import { setCell, ignite, raise, BURN, WET, LEVEL } from './world.js';
import { spawn, burst, P } from './particles.js';
import { addGas, GAS } from './gas.js';
import { hexRgb } from './materials.js';

const TPS = 30;

export function createSpells(sim, json) {
  const w = sim.world, M = w.M, ID = M.id, W = w.W, H = w.H;
  const rng = sim.rng;
  const defs = json.spells;
  const active = [];
  const S = { defs, active };
  const landers = {};      // particle onLand id -> function
  let landId = 10;

  // projectile landing: spells register a callback id on the particle
  sim.on('land', (e) => {
    const id = sim.ps.cb[e.i];
    const fn = landers[id];
    if (fn) { delete landers[id]; fn(e.x, e.y); }
  });
  function lander(fn) { const id = landId++; if (landId > 30000) landId = 10; landers[id] = fn; return id; }

  const lv = (o) => 1 + 0.2 * ((o && o.level) || 0);
  const fx = (x, y, color, n = 14, o = {}) => burst(sim.ps, rng, x, y, n, { kind: P.mote, life: 26, rgb: hexRgb(color), glow: 1, speed: 0.4, ...o });

  const cast = {
    fireball(x, y, d, o) {
      faller(x, y, x - 12, y - 8, 30, 22, [255, 170, 60], 1, (lx, ly) => sim.blast(lx, ly, d.radius * lv(o), d.power * lv(o), { by: 'fireball', fire: true, debris: 0.3 }));
      return true;
    },
    meteor(x, y, d, o) {
      const T = 60; // two seconds of fall
      const r = d.radius * lv(o), p = d.power * lv(o);
      w.warnings = w.warnings || [];
      w.warnings.push({ x, y, r, ttl: T, max: T, color: [255, 120, 40] });
      faller(x, y, x - 40, y - 30, 80, T, [255, 220, 150], 2, (lx, ly) => meteorHit(lx, ly, r, p, (d.crater ?? 8) * lv(o), o));
      sim.fire('sound', { id: 'meteor-fall', x, y });
      return true;
    },
    shower(x, y, d, o) {
      active.push({ kind: 'shower', x, y, r: d.radius, left: d.count + (o?.level || 0) * 2, next: 0, level: o?.level || 0 });
      return true;
    },
    lightning(x, y, d, o) { sim.lightning(x, y, d.power * lv(o), { by: 'lightning' }); return true; },
    chain(x, y, d, o) {
      sim.lightning(x, y, d.power * lv(o), { by: 'chain' });
      let from = { x, y };
      const hit = new Set();
      let jumps = d.jumps + (o?.level || 0);
      const next = () => {
        if (jumps-- <= 0) return;
        const t = sim.creatures.nearest(from.x, from.y, 26, (c) => !hit.has(c) && c.team !== 'village' && (c.team === 'monster' || c.sp.tags.has('predator')));
        if (!t) return;
        hit.add(t);
        w.bolts = w.bolts || [];
        w.bolts.push({ pts: [[from.x, from.y], [(from.x + t.x) / 2 + (rng() - 0.5) * 4, (from.y + t.y) / 2 + (rng() - 0.5) * 4], [t.x, t.y]], ttl: 8, color: [160, 210, 255] });
        sim.creatures.hurt(t, 45 * lv(o), 'lightning', 'chain');
        w.lights.push({ x: t.x, y: t.y, r: 160, g: 200, b: 255, rad: 16, ttl: 8, max: 8 });
        from = { x: t.x, y: t.y };
        sim.api.later(next, 3);
        if (hit.size === 4) sim.api.discover('chain-four', t.x, t.y);
      };
      sim.api.later(next, 3);
      return true;
    },
    rain(x, y, d, o) { w.rain.push({ x, y, r: d.radius * lv(o), ttl: d.secs * TPS, heavy: 1 }); return true; },
    storm(x, y, d, o) { w.rain.push({ x, y, r: d.radius * lv(o), ttl: d.secs * TPS, heavy: 1.4, storm: true }); return true; },
    acidrain(x, y, d, o) { w.rain.push({ x, y, r: d.radius * lv(o), ttl: d.secs * TPS, heavy: 1, acid: true }); active.push({ kind: 'acid', x, y, r: d.radius, ttl: d.secs * TPS }); return true; },
    holyrain(x, y, d, o) { w.rain.push({ x, y, r: d.radius * lv(o), ttl: d.secs * TPS, heavy: 1, holy: true }); active.push({ kind: 'holy', x, y, r: d.radius, ttl: d.secs * TPS }); return true; },
    frost(x, y, d, o) {
      const r = d.radius * lv(o);
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!w.inside(xx, yy) || Math.hypot(xx - x, yy - y) > r) continue;
        const i = yy * W + xx, m = w.mat[i];
        if (m === ID.water || m === ID.holy) setCell(w, i, ID.ice);
        else if (m === ID.lava) { setCell(w, i, rng() < 0.5 ? ID.obsidian : ID.crust); sim.api.discover('frozen-lava', xx, yy); }
        else if (m === ID.fire) setCell(w, i, 0);
        if (w.flag[i] & BURN) w.flag[i] &= ~BURN;
        if (m === 0 && rng() < 0.4 && !M.liquid[m]) { if (w.ground[i] === ID.grass || w.ground[i] === ID.dirt || w.ground[i] === ID.meadow) w.ground[i] = ID.snow; }
        w.temp[i] = 4;
        w.touch(i);
      }
      burst(sim.ps, rng, x, y, 60, { kind: P.frost, speed: 0.9 * lv(o), life: 22, palette: [[200, 245, 255], [140, 220, 255], [255, 255, 255]], glow: 0.8, spread: 2 });
      w.lights.push({ x, y, r: 120, g: 220, b: 255, rad: r * 3, ttl: 16, max: 16 });
      sim.creatures.near(x, y, r, (c) => { c.frozen = 160; c.burning = 0; sim.creatures.hurt(c, c.sp.tags.has('fiery') ? 30 : 4, 'frost', 'frost'); });
      sim.fire('sound', { id: 'frost', x, y });
      return true;
    },
    growth(x, y, d, o) {
      const r = d.radius * lv(o);
      for (let k = 0; k < r * r * 2; k++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
        const xx = (x + Math.cos(a) * rr) | 0, yy = (y + Math.sin(a) * rr) | 0;
        if (!w.inside(xx, yy)) continue;
        const i = yy * W + xx, m = w.mat[i], g = w.ground[i];
        if (M.liquid[m] || M.solid[m] || M.built[m]) continue;
        if (g === ID.scorched || g === ID.ashfloor || g === ID.dirt || g === ID.basalt || g === ID.mud) w.ground[i] = rng() < 0.3 ? ID.meadow : ID.grass;
        if (m === ID.charwood || m === ID.deadtree) setCell(w, i, ID.tree);
        else if (m === 0 && rng() < 0.12) setCell(w, i, rng() < 0.35 ? ID.seed : rng() < 0.5 ? ID.flowers : ID.tallgrass);
        if (m === ID.crop) w.life[i] = 255;
        w.touch(i);
      }
      fx(x, y, '#7aff6a', 30, { speed: 0.6 });
      return true;
    },
    heal(x, y, d, o) {
      const r = d.radius * lv(o);
      sim.creatures.near(x, y, r, (c) => {
        if (c.sp.undead) { sim.creatures.hurt(c, d.power, 'holy', 'heal'); return; }
        if (c.team === 'monster') return;
        c.hp = Math.min(c.maxHp, c.hp + d.power * lv(o)); c.burning = 0; c.hunger = Math.max(0, c.hunger - 0.3);
      });
      // and the light puts out fires on the ground too (the owner read "puts out those on fire" that way)
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!w.inside(xx, yy) || Math.hypot(xx - x, yy - y) > r) continue;
        const i = yy * W + xx;
        if (w.mat[i] === ID.fire) setCell(w, i, 0);
        else if (w.flag[i] & BURN) { w.flag[i] &= ~BURN; w.touch(i); }
        if (w.temp[i] > M.ambient + 20) w.temp[i] = M.ambient + 20;
      }
      fx(x, y, '#ffe9a8', 40, { speed: 0.5 });
      w.lights.push({ x, y, r: 255, g: 230, b: 150, rad: r * 2.5, ttl: 24, max: 24 });
      return true;
    },
    bless(x, y, d, o) {
      active.push({ kind: 'bless', x, y, r: d.radius * lv(o), ttl: d.secs * TPS });
      fx(x, y, '#ff8ad0', 30);
      return true;
    },
    gale(x, y, d, o) {
      const dx = (o?.x2 ?? x + 1) - x, dy = (o?.y2 ?? y) - y, len = Math.hypot(dx, dy) || 1;
      w.wind.x = dx / len; w.wind.y = dy / len; w.wind.strength = 3;
      w.windLocked = true;
      active.push({ kind: 'gale', ttl: d.secs * TPS });
      burst(sim.ps, rng, x, y, 30, { kind: P.mote, life: 30, rgb: [220, 240, 255], glow: 0.2, speed: 0.2 });
      for (let k = 0; k < 40; k++) spawn(sim.ps, { kind: P.mote, x: x + (rng() - 0.5) * 30, y: y + (rng() - 0.5) * 30, vx: dx / len * 1.2, vy: dy / len * 1.2, life: 40, rgb: [230, 245, 255], glow: 0.1 });
      return true;
    },
    quake(x, y, d, o) {
      const r = d.radius * lv(o);
      w.shake = 14;
      // cracks: a few jagged lines of split ground
      for (let k = 0; k < 4; k++) {
        let cx = x, cy = y, a = rng() * Math.PI * 2;
        for (let s = 0; s < r; s++) {
          a += (rng() - 0.5) * 0.8;
          cx += Math.cos(a); cy += Math.sin(a);
          const xx = cx | 0, yy = cy | 0;
          if (!w.inside(xx, yy)) break;
          const i = yy * W + xx;
          if (!M.liquid[w.mat[i]]) { if (w.mat[i] && M.hard[w.mat[i]] < 200) setCell(w, i, rng() < 0.5 ? ID.rubble : 0); w.ground[i] = ID.rock; w.height[i] = Math.max(0, w.height[i] - 3); }
        }
      }
      w.heightVer++;
      for (let k = 0; k < r * r; k++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
        const xx = (x + Math.cos(a) * rr) | 0, yy = (y + Math.sin(a) * rr) | 0;
        if (!w.inside(xx, yy)) continue;
        const i = yy * W + xx, m = w.mat[i];
        if (M.built[m] && rng() < 0.25 * (1 - rr / r) * (200 / (M.hard[m] + 50))) { setCell(w, i, ID.rubble); }
        else if (M.tree[m] && rng() < 0.15) setCell(w, i, ID.deadtree);
        else if (m === ID.boulder && rng() < 0.1) setCell(w, i, ID.rubble);
        w.touch(i);
      }
      sim.creatures.near(x, y, r, (c) => { if (c.sp.flies) return; const dd = Math.hypot(c.x - x, c.y - y) || 1; c.kx += (rng() - 0.5) * 2; c.ky += (rng() - 0.5) * 2; sim.creatures.hurt(c, 10 * d.power * (1 - dd / r), 'quake', 'quake'); });
      burst(sim.ps, rng, x, y, 60, { kind: P.debris, mat: 0, speed: 1, up: 1, grav: 0.06, life: 40, palette: [[140, 120, 100], [110, 95, 80]], spread: r });
      sim.fire('sound', { id: 'quake', x, y });
      return true;
    },
    earth(x, y, d, o) {
      // a line from (x,y) to (x2,y2): stone ridge
      return line(x, y, o?.x2 ?? x, o?.y2 ?? y, (i, xx, yy) => {
        const m = w.mat[i];
        if (m === ID.vent || m === ID.spring) return false;
        if (M.liquid[m] && m !== ID.lava && w.life[i] > 40) return false;
        setCell(w, i, ID.boulder);
        w.height[i] = Math.min(255, w.height[i] + 4);
        w.ground[i] = ID.rock;
        if (rng() < 0.2) spawn(sim.ps, { kind: P.debris, mat: 0, x: xx + 0.5, y: yy + 0.5, z: 0.5, vz: 0.4, grav: 0.05, vx: (rng() - 0.5) * 0.3, vy: (rng() - 0.5) * 0.3, life: 20, rgb: [150, 130, 110] });
        return true;
      }, () => { w.heightVer++; });
    },
    firewall(x, y, d, o) {
      return line(x, y, o?.x2 ?? x, o?.y2 ?? y, (i) => {
        const m = w.mat[i];
        if (M.liquid[m] || M.solid[m]) return false;
        if (M.ignite[m]) ignite(w, i, true); else setCell(w, i, ID.fire);
        w.life[i] = Math.max(w.life[i], 60);
        return true;
      });
    },
    spring(x, y) {
      const i = (y | 0) * W + (x | 0);
      setCell(w, i, ID.spring);
      fx(x, y, '#4fb2ff', 16);
      return true;
    },
    sinkhole(x, y, d, o) {
      const r = d.radius * lv(o);
      raise(w, x, y, r, -d.power * lv(o));
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!w.inside(xx, yy) || Math.hypot(xx - x, yy - y) > r * 0.8) continue;
        const i = yy * W + xx;
        if (w.mat[i] && !M.liquid[w.mat[i]]) setCell(w, i, rng() < 0.2 ? ID.rubble : 0);
        w.ground[i] = ID.dirt;
        w.flag[i] &= ~0x10; // STILL: neighbouring water must wake
      }
      w.wakeAll();
      burst(sim.ps, rng, x, y, 40, { kind: P.debris, mat: 0, speed: 0.5, up: 0.6, grav: 0.06, life: 30, palette: [[120, 90, 60], [90, 70, 50]], spread: r });
      w.shake += 5;
      return true;
    },
    tornado(x, y, d, o) {
      active.push({ kind: 'tornado', x, y, r: d.radius * lv(o), ttl: d.secs * TPS, a: rng() * 6.28, vx: 0, vy: 0, fire: 0 });
      return true;
    },
    smite(x, y, d, o) {
      const r = d.radius * lv(o);
      w.bolts = w.bolts || [];
      w.bolts.push({ pts: [[x, y - 80], [x, y]], ttl: 14, color: [255, 230, 120] });
      w.lights.push({ x, y, r: 255, g: 230, b: 120, rad: 30, ttl: 20, max: 20 });
      sim.creatures.near(x, y, r + 1, (c) => sim.creatures.hurt(c, d.power * lv(o) * (c.sp.undead ? 2 : 1), 'holy', 'smite'));
      sim.blast(x, y, r, 1.2, { by: 'smite', fire: false, quiet: true, color: [255, 230, 120] });
      burst(sim.ps, rng, x, y, 40, { kind: P.mote, speed: 0.8, life: 24, palette: [[255, 240, 160], [255, 255, 255]], glow: 1.4 });
      for (let k = 0; k < 6; k++) { const xx = (x + (rng() - 0.5) * r * 2) | 0, yy = (y + (rng() - 0.5) * r * 2) | 0; if (w.inside(xx, yy) && w.ground[yy * W + xx] === ID.sand && !w.mat[yy * W + xx]) setCell(w, yy * W + xx, ID.glass); }
      return true;
    },
    volcano(x, y, d, o) {
      const r = d.radius * lv(o);
      raise(w, x, y, r * 1.6, 40);
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!w.inside(xx, yy) || Math.hypot(xx - x, yy - y) > r) continue;
        const i = yy * W + xx;
        if (w.mat[i] && !M.liquid[w.mat[i]]) setCell(w, i, rng() < 0.15 ? ID.boulder : 0);
        w.ground[i] = rng() < 0.6 ? ID.basalt : ID.rock;
      }
      const i = (y | 0) * W + (x | 0);
      setCell(w, i, ID.vent);
      sim.blast(x, y, r * 0.6, 3, { by: 'volcano', fire: true });
      w.shake += 10;
      sim.api.discover('volcano', x, y);
      return true;
    },
    void(x, y, d, o) {
      const r = d.radius * lv(o);
      for (let k = 0; k < 10; k++) {
        const xx = (x + (rng() - 0.5) * r) | 0, yy = (y + (rng() - 0.5) * r) | 0;
        if (w.inside(xx, yy)) setCell(w, yy * W + xx, ID.void);
      }
      active.push({ kind: 'pull', x, y, r: r * 5, ttl: d.secs * TPS });
      w.lights.push({ x, y, r: 120, g: 40, b: 255, rad: 30, ttl: 40, max: 40 });
      return true;
    },
    barrier(x, y, d, o) {
      w.barriers = w.barriers || [];
      w.barriers.push({ x, y, r: d.radius * lv(o), ttl: d.secs * TPS, max: d.secs * TPS });
      rebuildShield();
      burst(sim.ps, rng, x, y, 40, { kind: P.mote, speed: 0.7, life: 24, palette: [[140, 220, 255], [220, 250, 255]], glow: 1.2, spread: 2 });
      sim.fire('sound', { id: 'chime', x, y });
      return true;
    },
    missiles(x, y, d, o) {
      const n = d.count + (o?.level || 0);
      const foes = [];
      sim.creatures.near(x, y, d.radius, (c) => { if (sim.creatures.enemyOf('player')(c)) foes.push(c); });
      foes.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      for (let k = 0; k < n; k++) {
        const t = foes.length ? foes[k % foes.length] : null;
        sim.creatures.missile(x + (rng() - 0.5) * 6, y - 14 + (rng() - 0.5) * 4, 8, t, d.power * lv(o), 'player', [200, 130, 255], k * 2);
      }
      w.lights.push({ x, y: y - 10, r: 190, g: 120, b: 255, rad: 18, ttl: 12, max: 12 });
      if (!foes.length) sim.fire('nofoes', { x, y });
      return true;
    },
    fireflies(x, y) {
      for (let k = 0; k < 6; k++) sim.creatures.add('wisp', (x + (rng() - 0.5) * 8) | 0, (y + (rng() - 0.5) * 8) | 0);
      return true;
    },
  };

  function faller(x, y, fx, fy, z, T, color, size, hit) {
    active.push({ kind: 'faller', x, y, fx, fy, z, T, ttl: T, color, size, hit });
  }

  function meteorHit(x, y, r, p, crater, o) {
    const i = (y | 0) * W + (x | 0);
    const wet = w.inside(x | 0, y | 0) && M.liquid[w.mat[i]] && w.mat[i] !== ID.lava;
    sim.blast(x, y, r, p, { by: 'meteor', fire: true, crater, debris: 0.35, throwScale: 1.4, heat: 1.3 });
    if (wet) { addGas(w, x, y, GAS.steam, 255); for (let k = 0; k < 8; k++) addGas(w, x + (rng() - 0.5) * r * 2, y + (rng() - 0.5) * r * 2, GAS.steam, 200); sim.api.discover('steam-crater', x, y); }
    // a glowing core of molten rock in the middle
    for (let k = 0; k < r; k++) {
      const xx = (x + (rng() - 0.5) * r * 0.5) | 0, yy = (y + (rng() - 0.5) * r * 0.5) | 0;
      if (w.inside(xx, yy) && w.mat[yy * W + xx] === 0) setCell(w, yy * W + xx, rng() < 0.6 ? ID.crust : ID.lava, 6);
    }
    burst(sim.ps, rng, x, y, Math.round(r * 3), { kind: P.ember, speed: 1.2, up: 1.6, grav: 0.04, life: 90, palette: [[255, 200, 80], [255, 120, 30], [255, 80, 20]], glow: 1.2, spread: 2 });
    w.flashSky = 0.7;
    w.shake = 16;
    sim.fire('meteor', { x, y, r });
  }

  function line(x0, y0, x1, y1, fn, after) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    let done = 0;
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
        const xx = x + ox, yy = y + oy;
        if (!w.inside(xx, yy)) continue;
        if (fn(yy * W + xx, xx, yy)) done++;
      }
    }
    if (after) after();
    return done;
  }

  S.cast = function (id, x, y, o = {}) {
    const d = defs[id];
    if (!d || !cast[id]) return false;
    const r = cast[id](x, y, d, o);
    sim.fire('cast', { id, x, y, ok: !!r });
    return r;
  };
  /** Mana this cast costs (line spells: by length). */
  S.costOf = function (id, x, y, o = {}) {
    const d = defs[id];
    if (!d) return 0;
    if (d.aim === 'line' && !d.flat) {
      const n = Math.max(1, Math.ceil(Math.hypot((o.x2 ?? x) - x, (o.y2 ?? y) - y)));
      return Math.ceil(n * d.cost);
    }
    return d.cost;
  };

  S.step = function () {
    for (let k = active.length - 1; k >= 0; k--) {
      const a = active[k];
      a.ttl = (a.ttl ?? 1) - 1;
      switch (a.kind) {
        case 'faller': {
          const t = 1 - a.ttl / a.T;
          const px = a.fx + (a.x - a.fx) * t, py = a.fy + (a.y - a.fy) * t, pz = a.z * (1 - t);
          const n = a.size > 1 ? 4 : 2;
          for (let q = 0; q < n; q++) spawn(sim.ps, { kind: P.spark, x: px + (rng() - 0.5) * a.size, y: py + (rng() - 0.5) * a.size, z: pz + rng(), life: a.size > 1 ? 18 : 10, rgb: rng() < 0.5 ? [255, 200, 90] : [255, 110, 40], glow: 1.2 });
          for (let q = 0; q < a.size * 2; q++) spawn(sim.ps, { kind: P.spark, x: px + (rng() - 0.5) * a.size, y: py + (rng() - 0.5) * a.size, z: pz, life: 1, rgb: a.color, glow: 2.5 });
          w.lights.push({ x: px, y: py - pz * 0.7, r: 255, g: 170, b: 80, rad: 10 + a.size * 10, ttl: 2, max: 2 });
          if (a.ttl <= 0) a.hit(a.x, a.y);
          break;
        }
        case 'shower':
          if (--a.next <= 0 && a.left > 0) {
            a.left--; a.next = 10 + (rng() * 12 | 0);
            const rr = Math.sqrt(rng()) * a.r, aa = rng() * 6.28;
            cast.meteor(a.x + Math.cos(aa) * rr, a.y + Math.sin(aa) * rr, { ...defs.meteor, radius: 7, power: 3.5, crater: 6 }, { level: a.level });
          }
          if (a.left <= 0) a.ttl = 0;
          break;
        case 'bless':
          if (sim.tick % 6 === 0) spawn(sim.ps, { kind: P.mote, x: a.x + (rng() - 0.5) * a.r * 2, y: a.y + (rng() - 0.5) * a.r * 2, vy: -0.05, life: 30, rgb: [255, 140, 210], glow: 0.7 });
          break;
        case 'gale':
          if (a.ttl <= 0) { w.windLocked = false; w.wind.strength = 1; }
          break;
        case 'acid': case 'holy':
          if (sim.tick % 10 === 0) sim.creatures.near(a.x, a.y, a.r, (c) => {
            if (a.kind === 'acid') sim.creatures.hurt(c, 1.5, 'acid', 'acidrain');
            else if (c.sp.undead) sim.creatures.hurt(c, 3, 'holy', 'holyrain'); else c.hp = Math.min(c.maxHp, c.hp + 2);
          });
          break;
        case 'pull':
          sim.creatures.near(a.x, a.y, a.r, (c) => {
            const dx = a.x - c.x, dy = a.y - c.y, d = Math.hypot(dx, dy) || 1;
            const f = 0.06 * (1 - d / a.r) / (c.sp.boss ? 4 : 1);
            c.kx += dx / d * f; c.ky += dy / d * f;
            if (d < 2) sim.creatures.hurt(c, 3, 'void', 'void');
          });
          if (sim.tick % 2 === 0) { const aa = rng() * 6.28, rr = a.r * (0.4 + rng() * 0.6); spawn(sim.ps, { kind: P.mote, x: a.x + Math.cos(aa) * rr, y: a.y + Math.sin(aa) * rr, vx: -Math.cos(aa) * rr / 25, vy: -Math.sin(aa) * rr / 25, life: 25, rgb: [140, 70, 255], glow: 0.8 }); }
          break;
        case 'tornado': tornado(a); break;
      }
      if (a.ttl <= 0) active.splice(k, 1);
    }
    // barriers fade
    if (w.barriers && w.barriers.length) {
      let gone = false;
      for (let k = w.barriers.length - 1; k >= 0; k--) {
        const b = w.barriers[k];
        if (--b.ttl <= 0) { w.barriers.splice(k, 1); gone = true; continue; }
        // put out anything that was burning under it
        if (sim.tick % 10 === 0) for (let q = 0; q < 30; q++) {
          const a = rng() * 6.28, rr = Math.sqrt(rng()) * b.r, xx = (b.x + Math.cos(a) * rr) | 0, yy = (b.y + Math.sin(a) * rr) | 0;
          if (!w.inside(xx, yy)) continue;
          const i = yy * W + xx;
          if (w.flag[i] & BURN) { w.flag[i] &= ~BURN; if (w.mat[i] === ID.fire) setCell(w, i, 0); }
          if (w.temp[i] > M.ambient + 30) w.temp[i] = M.ambient + 30;
        }
      }
      if (gone) rebuildShield();
    }
    // warnings (meteor rings)
    if (w.warnings) for (let k = w.warnings.length - 1; k >= 0; k--) if (--w.warnings[k].ttl <= 0) w.warnings.splice(k, 1);
  };

  function tornado(a) {
    // wander with the wind
    a.a += (rng() - 0.5) * 0.3;
    a.vx += (Math.cos(a.a) * 0.15 + w.wind.x * 0.05 - a.vx) * 0.05;
    a.vy += (Math.sin(a.a) * 0.15 + w.wind.y * 0.05 - a.vy) * 0.05;
    a.x = Math.max(4, Math.min(W - 4, a.x + a.vx)); a.y = Math.max(4, Math.min(H - 4, a.y + a.vy));
    // rip up loose things and fling them
    for (let k = 0; k < 6; k++) {
      const aa = rng() * 6.28, rr = rng() * a.r;
      const xx = (a.x + Math.cos(aa) * rr) | 0, yy = (a.y + Math.sin(aa) * rr) | 0;
      if (!w.inside(xx, yy)) continue;
      const i = yy * W + xx, m = w.mat[i];
      if (w.flag[i] & BURN) a.fire = 90;
      if (m && !M.liquid[m] && M.hard[m] < 50 && rng() < 0.5) {
        const hot = a.fire > 0 || (w.flag[i] & BURN);
        setCell(w, i, 0);
        const t = aa + 1.6;
        spawn(sim.ps, { kind: P.debris, mat: m === ID.fire ? 0 : m, x: xx + 0.5, y: yy + 0.5, z: 1, vx: Math.cos(t) * 0.9, vy: Math.sin(t) * 0.9, vz: 0.8 + rng() * 0.8, grav: 0.04, life: 120, rgb: hot ? [255, 140, 40] : [M.r[m], M.g[m], M.b[m]], glow: hot ? 1 : 0 });
      }
      if (M.liquid[m] && m === ID.water && rng() < 0.3) { w.life[i] = Math.max(0, w.life[i] - 2); spawn(sim.ps, { kind: P.drop, mat: ID.water, x: xx, y: yy, z: 2, vx: Math.cos(aa + 1.6), vy: Math.sin(aa + 1.6), vz: 1, grav: 0.05, life: 50, rgb: [150, 200, 255] }); a.fire = 0; }
      if (m === 0 && (w.ground[i] === ID.grass || w.ground[i] === ID.meadow) && rng() < 0.1) w.ground[i] = ID.dirt;
      w.touch(i);
    }
    if (a.fire > 0) a.fire--;
    // the funnel itself, drawn with particles
    // two arms winding up it, so it reads as a spinning column and not a cloud of specks
    const hot = a.fire > 0;
    for (let k = 0; k < 28; k++) {
      const h = (k + rng()) / 28;
      const aa = sim.tick * 0.45 + h * 9 + (k & 1) * 3.14;
      const rr = (0.18 + h * h) * a.r * 0.8;
      const v = 130 + (rng() * 90 | 0);
      spawn(sim.ps, { kind: P.mote, x: a.x + Math.cos(aa) * rr, y: a.y + Math.sin(aa) * rr * 0.5, z: h * 34, vx: -Math.sin(aa) * 0.7, vy: Math.cos(aa) * 0.35, life: 5, rgb: hot ? [255, 120 + (rng() * 110 | 0), 40] : [v, v + 6, v + 12], glow: hot ? 1 : 0.12 });
    }
    // dust thrown out round its foot, and streaks of wind circling further out
    for (let k = 0; k < 5; k++) {
      const aa = rng() * 6.28, rr = a.r * (0.5 + rng() * 0.5);
      spawn(sim.ps, { kind: P.spark, x: a.x + Math.cos(aa) * rr, y: a.y + Math.sin(aa) * rr * 0.6, z: 0.5, vx: -Math.sin(aa) * 0.8 + Math.cos(aa) * 0.25, vy: Math.cos(aa) * 0.5 + Math.sin(aa) * 0.15, vz: 0.12, grav: 0.01, life: 14, rgb: hot ? [255, 150, 60] : [150, 125, 90] });
    }
    for (let k = 0; k < 3; k++) {
      const aa = rng() * 6.28, rr = a.r * (1.1 + rng() * 0.8);
      spawn(sim.ps, { kind: P.mote, x: a.x + Math.cos(aa) * rr, y: a.y + Math.sin(aa) * rr * 0.6, z: 2 + rng() * 8, vx: -Math.sin(aa) * 1.5, vy: Math.cos(aa) * 0.9, life: 9, rgb: [235, 240, 245], glow: 0.25 });
    }
    sim.creatures.near(a.x, a.y, a.r * 1.4, (c) => {
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
      const f = c.sp.boss ? 0.02 : c.sp.tags.has('big') ? 0.06 : 0.18;
      c.kx += (-dy / d * 0.9 - dx / d * 0.3) * f; c.ky += (dx / d * 0.9 - dy / d * 0.3) * f;
      if (a.fire > 0 && !c.sp.fireproof) c.burning = 90;
      if (sim.tick % 15 === 0) sim.creatures.hurt(c, 2, 'wind', 'tornado');
    });
    if (a.fire > 0) { sim.api.discover('fire-twister', a.x, a.y); w.lights.push({ x: a.x, y: a.y, r: 255, g: 130, b: 40, rad: 24, ttl: 2, max: 2 }); }
  }

  // the cells under every barrier dome, for the cell rules (fire, lava, blasts stop at the skin)
  function rebuildShield() {
    w.shield = w.shield || new Uint8Array(w.N);
    w.shield.fill(0);
    for (const b of w.barriers || []) {
      for (let yy = Math.max(0, Math.floor(b.y - b.r)); yy <= Math.min(H - 1, b.y + b.r); yy++) for (let xx = Math.max(0, Math.floor(b.x - b.r)); xx <= Math.min(W - 1, b.x + b.r); xx++) {
        if ((xx - b.x) ** 2 + (yy - b.y) ** 2 <= b.r * b.r) w.shield[yy * W + xx] = 1;
      }
    }
  }
  S.rebuildShield = rebuildShield;
  S.blessAt = (x, y) => active.some(a => a.kind === 'bless' && Math.hypot(a.x - x, a.y - y) < a.r);
  w.blessAt = S.blessAt;
  return S;
}
