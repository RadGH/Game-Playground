// The cell rules (fire, heat, melting, freezing, liquids, sources, reactions). PURE.
// One pass per tick over the awake chunks only. Every number lives in materials.json /
// reactions.json; this file names only the handful of materials the rules themselves are about.

import { BURN, WET, CHARGED, STILL, LEVEL, CH, setCell, ignite } from './world.js';
import { addGas, GAS, FLAMMABLE_GAS } from './gas.js';
import { spawn, P } from './particles.js';
import { hexRgb } from './materials.js';

const DX = [1, 0, -1, 0, 1, -1, -1, 1];
const FIREWORKS = [
  [[255, 80, 160], [255, 160, 220], [255, 255, 255]],
  [[90, 200, 255], [160, 240, 255], [255, 255, 255]],
  [[120, 255, 120], [220, 255, 140], [255, 255, 255]],
  [[255, 210, 60], [255, 140, 40], [255, 255, 220]],
  [[190, 120, 255], [255, 120, 255], [140, 200, 255]],
];
const DY = [0, 1, 0, -1, 1, 1, -1, -1];

/** Compile reactions.json against the material table. */
export function compileReactions(json, M) {
  const table = new Int16Array(256 * 256).fill(-1);
  M.reacts = new Uint8Array(256);
  const list = json.list.map((r, k) => {
    const a = M.id[r.a], b = M.id[r.b];
    if (a === undefined || b === undefined) throw new Error('reactions: unknown material in ' + r.a + '+' + r.b);
    const to = (v) => (v === undefined || v === 'keep' ? -1 : M.id[v] ?? (() => { throw new Error('reactions: unknown ' + v); })());
    table[a * 256 + b] = k;
    table[b * 256 + a] = k;
    M.reacts[a] = 1; M.reacts[b] = 1;
    return {
      a, b, chance: r.chance ?? 0.5, aTo: to(r.aTo), bTo: to(r.bTo),
      gas: r.gas ? GAS[r.gas] : 0, gasAmt: r.gasAmt ?? 60, heat: r.heat ?? 0, blast: r.blast ?? 0,
      light: r.light ? hexRgb(r.light) : null, sound: r.sound || null, discover: r.discover || null, spawn: r.spawn || null,
    };
  });
  return { table, list };
}

export function createCellRules(w, R, ps, rng, api) {
  const M = w.M, W = w.W, H = w.H;
  const { mat, ground, height, temp, life, flag } = w;
  const amb = M.ambient;
  const fireT = M.fireTemp;
  const ID = M.id;
  const wind8 = new Float32Array(8);
  let scanFlip = 0;

  function windWeights() {
    const s = w.wind.strength;
    for (let d = 0; d < 8; d++) {
      const len = d < 4 ? 1 : Math.SQRT2;
      const dot = (DX[d] * w.wind.x + DY[d] * w.wind.y) / len;
      wind8[d] = Math.max(0.2, 1 + dot * s * M.fire.wind) * (d < 4 ? 1 : 0.7);
    }
  }

  function react(i, j, rule) {
    const r = R.list[rule];
    if (rng() > r.chance) return false;
    const a = mat[i];
    const ia = a === r.a ? i : j, ib = ia === i ? j : i;
    if (r.aTo >= 0) setCell(w, ia, r.aTo);
    if (r.bTo >= 0) setCell(w, ib, r.bTo);
    const x = ia % W, y = (ia / W) | 0;
    if (r.gas) addGas(w, x, y, r.gas, r.gasAmt);
    if (r.heat) { temp[ia] = Math.min(255, temp[ia] + r.heat); temp[ib] = Math.min(255, temp[ib] + r.heat); }
    if (r.light) w.lights.push({ x, y, r: r.light[0], g: r.light[1], b: r.light[2], rad: 10, ttl: 12, max: 12 });
    if (r.blast) api.blast(x, y, r.blast * 2, r.blast, { by: 'reaction' });
    if (r.spawn) w.emit('spawn', { species: r.spawn, x, y });
    if (r.sound && rng() < 0.15) w.emit('sound', { id: r.sound, x, y });
    if (r.discover) api.discover(r.discover, x, y);
    return true;
  }

  /** A burning cell: spend fuel, heat the neighbours (downwind more), smoke, embers. */
  function burn(i, x, y, m) {
    let f = life[i];
    temp[i] = Math.max(temp[i], fireT);
    // water next to it puts it out
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const n = mat[j];
      if (M.douses[n]) {
        if (rng() < 0.35) {
          flag[i] &= ~BURN; temp[i] = amb + 40;
          if (m === ID.fire) setCell(w, i, 0);
          life[j] = Math.max(0, life[j] - 1);
          if (life[j] === 0) setCell(w, j, 0);
          if (rng() < 0.5) addGas(w, x, y, GAS.steam, 40);
          w.burnOut++;
          return;
        }
      }
    }
    const heatAmt = M.fire.heatBase + M.fuel[m] * M.fire.heatPerFuel + (M.flag.heatBoost[m] ? 4 : 0) + (m === ID.fire ? M.fuel[ground[i]] * M.fire.heatPerFuel : 0);
    const sh = w.shield;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (flag[j] & BURN) continue;
      if (sh && sh[j]) continue;
      const add = heatAmt * wind8[d];
      const t = temp[j] + add * (flag[j] & WET ? 0.35 : 1) * (0.5 + rng());
      temp[j] = t > 255 ? 255 : t;
      w.touch(j);
    }
    if (rng() < 0.03 * M.smoke[m] + 0.01) addGas(w, x, y, GAS.smoke, 30 + M.smoke[m] * 12);
    if (M.fuel[m] > 40 && rng() < 0.005) {
      spawn(ps, { kind: P.ember, x: x + 0.5, y: y + 0.5, z: 1, vx: w.wind.x * 0.25 * w.wind.strength + (rng() - 0.5) * 0.3, vy: w.wind.y * 0.25 * w.wind.strength + (rng() - 0.5) * 0.3, vz: 0.25 + rng() * 0.35, grav: 0.02, life: 80, rgb: [255, 150 + (rng() * 80 | 0), 40], glow: 0.9 });
    }
    f -= rng() < M.fire.burnRate ? 1 : 0;
    life[i] = f;
    if (f <= 0) burnOut(i, x, y, m);
  }

  function burnOut(i, x, y, m) {
    flag[i] &= ~BURN;
    const g = ground[i];
    if (M.explode[m] > 0) {
      setCell(w, i, 0);
      if (M.flag.fireworks[m]) {
        const pal = FIREWORKS[(rng() * FIREWORKS.length) | 0];
        api.blast(x, y, M.explode[m] * 1.6, M.explode[m] * 0.6, { by: 'powder', fire: false, color: pal[0], palette: pal, sparkScale: 3 });
        api.discover('fireworks', x, y, true);
      } else {
        api.blast(x, y, M.explode[m] * 2.2, M.explode[m], { by: 'powder', fire: true });
        api.discover('chain-blast', x, y, true);
      }
      return;
    }
    const to = M.burnsTo[m];
    if (m === ID.fire) {
      setCell(w, i, 0);
      if (M.ignite[g]) ground[i] = M.burnsTo[g] !== 255 ? M.burnsTo[g] : ID.scorched;
    } else {
      setCell(w, i, to === 255 ? 0 : to);
      if (M.burnGround[m] !== 255) ground[i] = M.burnGround[m];
      else if (M.ignite[g]) ground[i] = ID.scorched;
    }
    temp[i] = 150;
    w.burnOut++;
    if (rng() < 0.3) addGas(w, x, y, GAS.smoke, 60);
  }

  /** Liquid flow: move amount toward lower surfaces (height*LEVEL + amount), steepest first, so a
   *  liquid on a slope runs downhill as a stream instead of spreading as a disc. */
  const candJ = new Int32Array(4), candD = new Int32Array(4), candN = new Uint8Array(4);
  function flow(i, x, y, m) {
    const a = life[i];
    if (a === 0) { setCell(w, i, 0); return; }
    if (rng() > M.flow[m]) { w.touch(i); return; }
    if (a < M.minFlow[m]) {
      // too thin to spread: it can still ROLL downhill as a whole, leaving a cooling trail
      let best = -1, bh = height[i];
      const start = (rng() * 4) | 0;
      for (let k = 0; k < 4; k++) {
        const d = (start + k) & 3;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx, n = mat[j];
        if (m === ID.lava && w.shield && w.shield[j]) continue;
        if (height[j] < bh && (n === 0 || n === m || (!M.blocksLiquid[n] && !M.liquid[n]))) { bh = height[j]; best = j; }
      }
      if (best < 0) { flag[i] |= STILL; return; }
      const n = mat[best];
      if (n === m) life[best] = Math.min(255, life[best] + a);
      else {
        if (n !== 0 && m === ID.lava && M.ignite[n]) { ignite(w, best, true); w.touch(i); return; }
        setCell(w, best, m, a);
        if (m === ID.lava) temp[best] = 235;
      }
      if (m === ID.lava && rng() < 0.35) { setCell(w, i, ID.crust); temp[i] = 200; }
      else setCell(w, i, 0);
      w.touch(best);
      return;
    }
    const s = height[i] * LEVEL + a;
    let moved = false, nc = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const n = mat[j];
      let ns;
      if (n === m) ns = height[j] * LEVEL + life[j];
      else if (n === 0 || (!M.blocksLiquid[n] && !M.liquid[n])) ns = height[j] * LEVEL;
      else {
        if (M.liquid[n]) { const rr = R.table[m * 256 + n]; if (rr >= 0) react(i, j, rr); }
        continue;
      }
      const diff = s - ns;
      if (diff <= 1) continue;
      // insertion sort, steepest first (ties broken at random so it never favours one side)
      let k = nc++;
      const dd = diff * 4 + ((rng() * 4) | 0);
      while (k > 0 && candD[k - 1] < dd) { candD[k] = candD[k - 1]; candJ[k] = candJ[k - 1]; candN[k] = candN[k - 1]; k--; }
      candD[k] = dd; candJ[k] = j; candN[k] = n;
    }
    for (let k = 0; k < nc; k++) {
      const j = candJ[k], n = candN[k];
      if (mat[j] !== n) continue;
      if (m === ID.lava && w.shield && w.shield[j]) continue;
      const ns = n === m ? height[j] * LEVEL + life[j] : height[j] * LEVEL;
      const diff = height[i] * LEVEL + life[i] - ns;
      if (diff <= 1) continue;
      let mv = diff >> 1;
      const keep = n === m ? 0 : 1;
      if (mv > life[i] - keep) mv = life[i] - keep;
      if (mv <= 0) continue;
      if (n !== m) {
        if (n !== 0) {
          // the liquid washes over grass tufts, flame, seeds...: lava lights them on its way
          if (m === ID.lava && M.ignite[n]) { ignite(w, j, true); continue; }
          if (n === ID.fire && M.douses[m]) api.discover('doused', j % W, (j / W) | 0);
        }
        setCell(w, j, m, mv);
        if (m === ID.lava) temp[j] = 235;
      } else {
        life[j] = Math.min(255, life[j] + mv); w.touch(j);
      }
      life[i] -= mv;
      moved = true;
      if (life[i] === 0) { setCell(w, i, 0); return; }
    }
    if (moved) w.touch(i);
    else flag[i] |= STILL;
  }

  function step() {
    windWeights();
    w.burnOut = 0;
    let burning = 0, liquid = 0, lava = 0;
    const CW = w.CW, CHh = w.CHh;
    const tmp = w.awake; w.awake = w.next; w.next = tmp; w.next.fill(0);
    scanFlip ^= 1;
    for (let cy0 = 0; cy0 < CHh; cy0++) {
      const cy = scanFlip ? CHh - 1 - cy0 : cy0;
      for (let cx0 = 0; cx0 < CW; cx0++) {
        const cx = scanFlip ? CW - 1 - cx0 : cx0;
        if (!w.awake[cy * CW + cx]) continue;
        const x0 = cx * CH, y0 = cy * CH;
        const x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH);
        for (let yy = y0; yy < y1; yy++) {
          const y = scanFlip ? y1 - 1 - (yy - y0) : yy;
          for (let xx = x0; xx < x1; xx++) {
            const x = scanFlip ? x1 - 1 - (xx - x0) : xx;
            const i = y * W + x;
            const m = mat[i];
            let t = temp[i];
            const f = flag[i];
            let busy = false;
            if (f & BURN) { burning++; burn(i, x, y, m); if (mat[i] !== m || !(flag[i] & BURN)) continue; busy = true; t = temp[i]; }
            if (M.hot[m]) { if (t < M.hot[m]) temp[i] = t = M.hot[m]; busy = true; }
            // thresholds
            if (m !== 0) {
              if (!(f & BURN) && M.ignite[m] && t >= M.ignite[m]) { ignite(w, i); continue; }
              if (M.melt[m] && t >= M.melt[m]) {
                setCell(w, i, M.meltTo[m]);
                if (M.liquid[M.meltTo[m]]) life[i] = LEVEL;
                continue;
              }
              if (M.freeze[m] && t <= M.freeze[m]) { setCell(w, i, M.freezeTo[m]); api.discover('frozen', x, y); continue; }
              if (M.boil[m] && t >= M.boil[m]) {
                life[i] = Math.max(0, life[i] - 2); addGas(w, x, y, GAS.steam, 50); temp[i] = t = t - 30;
                if (life[i] === 0) { setCell(w, i, 0); api.discover('steam', x, y); continue; }
              }
            } else {
              const g = ground[i];
              if (M.ignite[g] && t >= M.ignite[g] && !(f & WET)) { ignite(w, i); continue; }
              if (M.melt[g] && t >= M.melt[g]) {
                const to = M.meltTo[g];
                if (M.liquid[to]) { setCell(w, i, to, 3); ground[i] = M.meltGround[g] !== 255 ? M.meltGround[g] : ID.dirt; }
                else { setCell(w, i, to); ground[i] = ID.rock; }
                if (to === ID.glass) api.discover('glass', x, y);
                continue;
              }
            }
            // timed materials
            if (M.lifeTicks[m]) {
              busy = true;
              if (life[i] > 0) life[i]--;
              if (life[i] === 0) { setCell(w, i, 0); continue; }
              if (M.flag.chill[m]) chill(i, x, y);
              if (M.flag.devours[m]) devour(i, x, y);
            } else if (M.coolTicks[m] && !M.liquid[m]) {
              busy = true;
              if (life[i] > 0 && rng() < 0.5) life[i]--;
              if (life[i] === 0) {
                const cg = M.coolGround[m];
                setCell(w, i, M.coolTo[m] === 255 ? 0 : M.coolTo[m]);
                if (cg !== 255) ground[i] = cg;
                temp[i] = amb + 60;
                continue;
              }
            }
            if (M.source[m] !== 255) { busy = true; source(i, x, y, M.source[m]); }
            // liquids
            if (M.liquid[m]) {
              liquid++;
              if (m === ID.lava) {
                lava++;
                // thin, slow lava crusts over; deep lava stays molten a long time
                if ((f & STILL) && rng() < 0.012 / (1 + life[i] / 6)) { setCell(w, i, ID.crust); temp[i] = 200; continue; }
              } else if (life[i] <= 1 && rng() < 0.004) {
                // a thin film soaks in
                setCell(w, i, 0);
                if (M.wetTo[ground[i]] !== 255) ground[i] = M.wetTo[ground[i]];
                flag[i] |= WET;
                continue;
              }
              flag[i] &= ~STILL;
              // burning stays put: lighting a liquid fills its `life` to its fuel, so a burning cell that kept
              // flowing shared out fuel it had just been given and pitch multiplied across the map (report #11)
              if (!(flag[i] & BURN)) flow(i, x, y, m);
              if (mat[i] !== m) continue;
              if (M.wets[m]) {
                flag[i] |= WET;
                if (M.wetTo[ground[i]] !== 255 && rng() < 0.01) ground[i] = M.wetTo[ground[i]];
              }
              if (f & CHARGED) { busy = true; if (rng() < 0.08) flag[i] &= ~CHARGED; }
              if (!(flag[i] & STILL)) busy = true;
            }
            // reactions with one random neighbour (non-liquids too: frostfire, acid next to walls...)
            if (m !== 0 && M.reacts[m]) {
              const d = (rng() * 4) | 0;
              const nx = x + DX[d], ny = y + DY[d];
              if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
                const j = ny * W + nx;
                const rr = R.table[m * 256 + mat[j]];
                if (rr >= 0) { busy = true; if (react(i, j, rr)) continue; }
              }
            }
            // heat: share with neighbours, drift back to ambient
            t = temp[i];
            if (t !== amb && !(flag[i] & BURN)) {
              busy = true;
              let sum = 0;
              for (let d = 0; d < 4; d++) {
                const nx = x + DX[d], ny = y + DY[d];
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const j = ny * W + nx;
                const tj = temp[j];
                // `>> 5` floors, so a colder cell takes at least a whole degree from a warmer neighbour.
                // Near a fire that is a damper the levels are balanced on, so it stays; but pulling
                // AMBIENT ground below ambient spread one Frost Nova's chill over the whole map and woke
                // every chunk for good (the owner's iPhone: 50 ms a tick on the dragon level). Into
                // ground at or under ambient, round toward zero instead.
                const dd = t - tj;
                const diff = dd < 0 && tj <= amb ? (dd / 32) | 0 : dd >> 5;
                if (diff > 0 && !(flag[j] & BURN)) { temp[j] = tj + diff; sum += diff; w.touch(j); }
                else if (diff < 0) { temp[j] = tj + diff; sum += diff; w.touch(j); }
              }
              let nt = t - sum;
              if (nt > amb) nt -= nt > amb + 60 ? 2 : 1;
              // freezing ground (under 12 stiffens whatever walks on it) thaws slowly: a Frost Nova's
              // patch stays icy for ~4 s, then warms back to ambient quickly
              else if (nt < amb && rng() < (nt < 12 ? 0.06 : 0.3)) nt += 1;
              temp[i] = nt < 0 ? 0 : nt > 255 ? 255 : nt;
            }
            if (f & WET && rng() < 0.0015 && !M.liquid[m]) flag[i] &= ~WET;
            if (busy) w.touch(i);
          }
        }
      }
    }
    w.stats.burning = burning; w.stats.liquid = liquid; w.stats.lava = lava;
  }

  function chill(i, x, y) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      temp[j] = Math.max(0, temp[j] - 12);
      if (flag[j] & BURN) { flag[j] &= ~BURN; if (mat[j] === ID.fire) setCell(w, j, 0); }
      const n = mat[j];
      // frostfire creeps over plants, leaving them frozen solid
      if ((M.tree[n] || n === ID.tallgrass || n === ID.bush || n === ID.flowers) && rng() < 0.05) setCell(w, j, ID.frostfire);
      else if (n === 0 && M.ignite[ground[j]] && rng() < 0.02) { ground[j] = ID.snow; }
      w.touch(j);
    }
  }

  function devour(i, x, y) {
    const d = (rng() * 8) | 0;
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
    const j = ny * W + nx;
    const n = mat[j];
    if (n === ID.void || n === ID.vent) return;
    if (n !== 0 && rng() < 0.25) {
      setCell(w, j, rng() < 0.2 ? ID.void : 0);
      if (mat[j] === ID.void) life[j] = Math.max(20, life[i] - 40);
      spawn(ps, { kind: P.mote, x: nx + 0.5, y: ny + 0.5, vx: (x - nx) * 0.15, vy: (y - ny) * 0.15, life: 14, rgb: [120, 60, 255], glow: 0.7 });
    }
    if (rng() < 0.05) ground[j] = ID.basalt;
    api.discover('void', x, y);
  }

  function source(i, x, y, liq) {
    if (rng() > M.sourceRate[mat[i]]) return;
    const d = (rng() * 4) | 0;
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
    const j = ny * W + nx;
    const n = mat[j];
    const amt = M.sourceAmt[mat[i]];
    if (n === liq) { if (life[j] < 250 - amt) { life[j] += amt; w.touch(j); } }
    else if (n === 0 || (!M.blocksLiquid[n] && !M.liquid[n])) { setCell(w, j, liq, amt + 2); if (liq === ID.lava) temp[j] = 240; }
    if (liq === ID.lava && rng() < 0.04) {
      spawn(ps, { kind: P.ember, x: x + 0.5, y: y + 0.5, z: 1, vx: (rng() - 0.5) * 0.6, vy: (rng() - 0.5) * 0.6, vz: 0.6 + rng() * 0.6, grav: 0.03, life: 90, rgb: [255, 120, 30], glow: 1 });
    }
  }

  /** Does gas burn here? (spores / marsh gas over fire). Called by the sim on gas cells. */
  function gasFlash() {
    if (!w.gasTotal) return;
    for (let k = 0; k < 40; k++) {
      const gx = (rng() * w.GW) | 0, gy = (rng() * w.GH) | 0;
      const j = gy * w.GW + gx;
      if (!FLAMMABLE_GAS[w.gasKind[j]] || w.gasDens[j] < 30) continue;
      const x = gx * 2, y = gy * 2, i = y * W + x;
      if ((flag[i] & BURN) || temp[i] > 150) {
        const p = w.gasDens[j] / 255;
        w.gasDens[j] = 0;
        api.blast(x, y, 2 + p * 4, 0.6 + p * 1.4, { by: 'gas', fire: true, quiet: p < 0.4 });
        api.discover(w.gasKind[j] === GAS.spores ? 'spore-flash' : 'marsh-flare', x, y);
      }
    }
  }

  return { step, gasFlash, react };
}
