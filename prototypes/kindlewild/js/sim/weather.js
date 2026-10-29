// Weather and time: the day clock, wind that wanders, rain clouds that drift and drown fire,
// passing lights, bolts, screen shake. PURE.

import { BURN, WET, setCell } from './world.js';
import { spawn, P } from './particles.js';

export function createWeather(w, ps, rng, api) {
  const M = w.M, W = w.W, H = w.H, ID = M.id;
  let windTarget = { x: w.wind.x, y: w.wind.y };

  function step() {
    if (!w.freezeTime) w.clock = (w.clock + 1 / w.dayLength) % 1;
    // wind wanders unless the player pinned it
    if (!w.windLocked && w.tick % 600 === 0) {
      const a = Math.atan2(windTarget.y, windTarget.x) + (rng() - 0.5) * 1.4;
      windTarget = { x: Math.cos(a), y: Math.sin(a) };
    }
    if (!w.windLocked) {
      w.wind.x += (windTarget.x - w.wind.x) * 0.002;
      w.wind.y += (windTarget.y - w.wind.y) * 0.002;
    }
    // rain clouds
    for (let k = w.rain.length - 1; k >= 0; k--) {
      const c = w.rain[k];
      c.ttl--;
      c.x += (c.vx ?? w.wind.x * 0.05 * w.wind.strength);
      c.y += (c.vy ?? w.wind.y * 0.05 * w.wind.strength);
      if (c.ttl <= 0) { w.rain.splice(k, 1); continue; }
      const drops = Math.round(c.r * c.r * 0.035 * (c.heavy ?? 1));
      for (let d = 0; d < drops; d++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * c.r;
        const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        spawn(ps, { kind: P.drop, mat: c.acid ? ID.acid : c.holy ? ID.holy : ID.water, x, y: y - 6, z: 6, vx: w.wind.x * 0.1, vy: 1, vz: -0.4, grav: 0.05, life: 30, rgb: c.acid ? [160, 255, 60] : c.holy ? [255, 230, 150] : [190, 220, 255], glow: c.acid || c.holy ? 0.4 : 0.15 });
      }
      // under the cloud: everything gets wet, fires drown
      for (let d = 0; d < drops * 3; d++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * c.r;
        const x = (c.x + Math.cos(a) * rr) | 0, y = (c.y + Math.sin(a) * rr) | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        w.flag[i] |= WET;
        if (w.flag[i] & BURN && rng() < 0.4) {
          w.flag[i] &= ~BURN; w.temp[i] = M.ambient + 20;
          if (w.mat[i] === ID.fire) setCell(w, i, 0);
          api.discover('rain-quench', x, y);
        }
        if (c.acid && w.mat[i] && !M.liquid[w.mat[i]] && rng() < 0.01 && M.hard[w.mat[i]] < 160) setCell(w, i, 0);
        // blessed rain cleans what it falls on: bog goo turns to water (or flowers), voidseed is unmade
        if (c.holy && (w.mat[i] === ID.goo || w.mat[i] === ID.void) && rng() < 0.035) {
          const was = w.mat[i];
          setCell(w, i, was === ID.void ? 0 : rng() < 0.3 ? ID.flowers : ID.water, was === ID.goo ? w.life[i] : undefined);
          api.discover(was === ID.void ? 'unmaking' : 'purified', x, y);
        }
        if (w.temp[i] > M.ambient) w.temp[i] -= Math.min(w.temp[i] - M.ambient, 20);
        if (w.mat[i] === ID.lava && rng() < 0.05) { setCell(w, i, ID.crust); api.discover('steam', x, y); }
        w.touch(i);
      }
      if (c.storm && rng() < 0.012) api.lightning(c.x + (rng() - 0.5) * c.r * 1.6, c.y + (rng() - 0.5) * c.r * 1.6, 0.8);
    }
    for (let k = w.lights.length - 1; k >= 0; k--) if (--w.lights[k].ttl <= 0) w.lights.splice(k, 1);
    if (w.bolts) for (let k = w.bolts.length - 1; k >= 0; k--) if (--w.bolts[k].ttl <= 0) w.bolts.splice(k, 1);
    if (w.rings) for (let k = w.rings.length - 1; k >= 0; k--) if (--w.rings[k].ttl <= 0) w.rings.splice(k, 1);
    w.shake *= 0.86;
    if (w.flashSky) w.flashSky *= 0.8;
  }

  /** Ambient daylight 0..1 for the clock. */
  function daylight() {
    const t = w.clock;
    return Math.max(0, Math.min(1, Math.sin((t - 0.2) * Math.PI / 0.6) * 1.3));
  }

  return { step, daylight };
}
