// The cell rules on a CHUNKED, wrapping world. PURE. Fire, heat, liquids (water and lava), lava
// cooling to crust and basalt, vents that erupt now and then.
//
// Kindlewild's rules (prototypes/kindlewild/js/sim/cells.js) run over one flat W x H array with hard
// edges. Here the world is chunks that come and go, so every neighbour read goes through `nb()`,
// which stays inside the chunk on the fast path and asks the store for the next chunk (x wraps) on the
// slow one. A neighbour chunk that is not in memory is treated as a wall: nothing spreads into
// land nobody has generated, and it will be generated the moment anyone looks at it.
//
// Only AWAKE chunks are stepped. A chunk wakes when something happens in it (fire, moving liquid,
// heat, an eruption) and goes back to sleep after a tick with nothing to do.
//
// Generated seas and rivers are STILL water: they do not flow (their beds are not flat, so letting
// them flow would drain every sea into its deepest point). Anything that disturbs water — a blast,
// a dug channel — clears STILL on the cells it touches.

import { CH } from '../planet/chunkgen.js';

export const BURN = 1, WET = 2, OWNED = 4, CHARGED = 8, STILL = 16;
export const LEVEL = 8;
const DX = [1, 0, -1, 0, 1, -1, -1, 1], DY = [0, 1, 0, -1, 1, 1, -1, -1];

export function createCellRules(sim) {
  const { M, store } = sim;
  const ID = M.id, amb = M.ambient, fireT = M.fireTemp;
  const wind8 = new Float32Array(8);
  // the neighbour found by nb(): chunk + index (module-level so the hot loop does not allocate)
  let nc = null, ni = 0;

  /** Find the neighbour of (c, lx, ly) at (dx, dy). Sets nc/ni; false if that chunk is not loaded. */
  function nb(c, lx, ly, dx, dy) {
    let x = lx + dx, y = ly + dy;
    if (x >= 0 && x < CH && y >= 0 && y < CH) { nc = c; ni = y * CH + x; return true; }
    let cx = c.cx, cy = c.cy;
    if (x < 0) { cx--; x += CH; } else if (x >= CH) { cx++; x -= CH; }
    if (y < 0) { cy--; y += CH; } else if (y >= CH) { cy++; y -= CH; }
    const o = store.peek(cx, cy);
    if (!o) return false;
    nc = o; ni = y * CH + x; return true;
  }

  function windWeights() {
    const wd = sim.wind;
    for (let d = 0; d < 8; d++) {
      const len = d < 4 ? 1 : Math.SQRT2;
      const dot = (DX[d] * wd.x + DY[d] * wd.y) / len;
      wind8[d] = Math.max(0.2, 1 + dot * wd.strength * M.fire.wind) * (d < 4 ? 1 : 0.7);
    }
  }

  /** Put material m in a cell (with its default height and hit points). */
  function setCell(c, i, m, amount) {
    c.mat[i] = m;
    c.tall[i] = m ? M.tall[m] : 0;
    c.hp[i] = m && M.hard[m] ? 255 : 0;
    c.flag[i] &= ~(BURN | STILL);
    c.life[i] = amount ?? (M.liquid[m] ? LEVEL : M.fuel[m] || 0);
    if (M.hot[m]) c.temp[i] = Math.max(c.temp[i], M.hot[m]);
    c.dirty = true;
    sim.wake(c);
  }

  /** Set something alight (the thing standing there, or the ground under it). */
  function ignite(c, i) {
    if (c.flag[i] & BURN) return false;
    const m = c.mat[i];
    if (m && M.ignite[m]) { c.flag[i] |= BURN; if (!c.life[i]) c.life[i] = M.fuel[m]; }
    else if (!m && M.ignite[c.ground[i]]) { c.mat[i] = ID.fire; c.tall[i] = 0; c.life[i] = M.fuel[c.ground[i]] || 10; c.flag[i] |= BURN; }
    else return false;
    c.temp[i] = Math.max(c.temp[i], fireT);
    c.dirty = true; sim.wake(c); sim.events.push({ t: 'fire', c, i });
    return true;
  }

  function burn(c, i, lx, ly, rng) {
    const m = c.mat[i];
    c.temp[i] = Math.max(c.temp[i], fireT);
    // water beside it puts it out
    for (let d = 0; d < 4; d++) {
      if (!nb(c, lx, ly, DX[d], DY[d])) continue;
      if (M.douses[nc.mat[ni]] && rng() < 0.35) { put_out(c, i); return; }
    }
    if (c.flag[i] & WET && rng() < 0.2) { put_out(c, i); return; }
    const g = c.ground[i];
    let heat = M.fire.heatBase + M.fuel[m] * M.fire.heatPerFuel + (m === ID.fire ? M.fuel[g] * M.fire.heatPerFuel : 0);
    // a WILD fire (far from every town, js/sim/wildfire.js) spreads at a little over half the heat
    // and burns out twice as fast, so a lightning strike in a distant forest stays a patch, not a
    // sea of fire that eats the frame rate (play-test 1)
    const wild = sim.wildfire?.isWild(c);
    if (wild) { heat *= 0.55; sim.wildfire.count(c, i); if (sim.wildfire.dousing(c) && rng() < 0.08) { put_out(c, i); return; } }
    for (let d = 0; d < 8; d++) {
      if (!nb(c, lx, ly, DX[d], DY[d])) continue;
      if (nc.flag[ni] & BURN) continue;
      if (sim.shielded && sim.shielded(nc, ni)) continue;
      const t = nc.temp[ni] + heat * wind8[d] * (nc.flag[ni] & WET ? 0.35 : 1) * (0.5 + rng());
      nc.temp[ni] = t > 255 ? 255 : t;
      if (nc !== c) sim.wake(nc);
    }
    if (rng() < M.fire.burnRate * (wild ? 2 : 1)) c.life[i]--;
    if (c.life[i] <= 0) burnOut(c, i, m);
    if (rng() < 0.02) sim.events.push({ t: 'smoke', c, i, big: M.fuel[m] > 40 });
  }

  function put_out(c, i) {
    c.flag[i] &= ~BURN; c.temp[i] = amb + 30;
    if (c.mat[i] === ID.fire) { c.mat[i] = 0; c.tall[i] = 0; }
    c.dirty = true;
  }

  // A ground with hard 255 (train track, M10) is never replaced by any rule: track can't be
  // destroyed (PLAN §0.3). Every rule that changes a cell's ground must ask this first.
  const fixedGround = g => M.hard[g] >= 255;

  function burnOut(c, i, m) {
    c.flag[i] &= ~BURN;
    const g = c.ground[i];
    if (fixedGround(g)) {
      // whatever burned on the track is gone; the track stays
      if (m === ID.fire) { c.mat[i] = 0; c.tall[i] = 0; }
      else { const to = M.burnsTo[m] === 255 ? 0 : M.burnsTo[m]; c.mat[i] = to; c.life[i] = to ? M.fuel[to] : 0; c.tall[i] = to ? Math.min(M.tall[to] || 1, c.tall[i]) : 0; sim.events.push({ t: 'burnt', c, i, m }); }
      c.temp[i] = 150; c.dirty = true; return;
    }
    if (m === ID.fire) {
      c.mat[i] = 0; c.tall[i] = 0;
      if (M.ignite[g]) c.ground[i] = M.burnsTo[g] !== 255 ? M.burnsTo[g] : ID.scorched;
    } else {
      const to = M.burnsTo[m] === 255 ? 0 : M.burnsTo[m];
      const tall = c.tall[i];
      c.mat[i] = to; c.life[i] = to ? M.fuel[to] : 0;
      c.tall[i] = to ? Math.min(M.tall[to] || 1, tall) : 0;
      if (M.burnGround[m] !== 255) c.ground[i] = M.burnGround[m];
      else if (M.ignite[g]) c.ground[i] = ID.scorched;
      sim.events.push({ t: 'burnt', c, i, m });
    }
    c.temp[i] = 150; c.dirty = true;
  }

  // ---- liquids: move amount toward lower surfaces (height*LEVEL + amount), steepest first
  const cj = new Int32Array(4), cd = new Int32Array(4); const cc = [null, null, null, null];
  function flow(c, i, lx, ly, m, rng) {
    const a = c.life[i];
    if (a === 0) { c.mat[i] = 0; c.dirty = true; return true; }
    if (rng() > M.flow[m]) return true;
    if (a < M.minFlow[m]) {
      // too thin to spread: roll downhill whole, lava leaving a cooling crust behind it
      let bc = null, bi = 0, bh = c.height[i];
      const s0 = (rng() * 4) | 0;
      for (let k = 0; k < 4; k++) {
        const d = (s0 + k) & 3;
        if (!nb(c, lx, ly, DX[d], DY[d])) continue;
        const n = nc.mat[ni];
        if (nc.height[ni] < bh && (n === 0 || n === m || (!M.blocksLiquid[n] && !M.liquid[n]))) { bh = nc.height[ni]; bc = nc; bi = ni; }
      }
      if (!bc) { c.flag[i] |= STILL; return false; }
      const n = bc.mat[bi];
      if (n === m) bc.life[bi] = Math.min(255, bc.life[bi] + a);
      else { if (n && m === ID.lava && M.ignite[n]) { ignite(bc, bi); return true; } setCell(bc, bi, m, a); if (m === ID.lava) bc.temp[bi] = 235; }
      if (m === ID.lava && rng() < 0.35) { setCell(c, i, ID.crust); c.temp[i] = 200; }
      else { c.mat[i] = 0; c.life[i] = 0; c.dirty = true; }
      sim.wake(bc);
      return true;
    }
    const s = c.height[i] * LEVEL + a;
    let n_ = 0;
    for (let d = 0; d < 4; d++) {
      if (!nb(c, lx, ly, DX[d], DY[d])) continue;
      const n = nc.mat[ni];
      let ns;
      if (n === m) ns = nc.height[ni] * LEVEL + nc.life[ni];
      else if (n === 0 || (!M.blocksLiquid[n] && !M.liquid[n])) ns = nc.height[ni] * LEVEL;
      else { if (M.liquid[n] && n !== m) meet(c, i, m, nc, ni, n, rng); continue; }
      const diff = s - ns;
      if (diff <= 1) continue;
      let k = n_++; const dd = diff * 4 + ((rng() * 4) | 0);
      while (k > 0 && cd[k - 1] < dd) { cd[k] = cd[k - 1]; cj[k] = cj[k - 1]; cc[k] = cc[k - 1]; k--; }
      cd[k] = dd; cj[k] = ni; cc[k] = nc;
    }
    if (!n_) { c.flag[i] |= STILL; return false; }
    for (let k = 0; k < n_ && c.life[i] > 0; k++) {
      const oc = cc[k], j = cj[k];
      const ns = oc.mat[j] === m ? oc.height[j] * LEVEL + oc.life[j] : oc.height[j] * LEVEL;
      const give = Math.max(1, Math.min(c.life[i], ((c.height[i] * LEVEL + c.life[i] - ns) >> 1)));
      if (oc.mat[j] === m) oc.life[j] += give;
      else {
        const o = oc.mat[j];
        if (o && m === ID.lava && M.ignite[o]) { ignite(oc, j); continue; }
        setCell(oc, j, m, give);
        if (m === ID.lava) oc.temp[j] = 235;
      }
      oc.flag[j] &= ~STILL;
      c.life[i] -= give;
      sim.wake(oc); oc.dirty = true;
    }
    if (c.life[i] === 0) { c.mat[i] = 0; c.tall[i] = 0; }
    c.dirty = true;
    return true;
  }

  /** Two different liquids touch: lava + water → stone and steam. */
  function meet(c, i, m, oc, j, n, rng) {
    if ((m === ID.lava && n === ID.water) || (m === ID.water && n === ID.lava)) {
      const [lc, li] = m === ID.lava ? [c, i] : [oc, j];
      const [wc, wi] = m === ID.lava ? [oc, j] : [c, i];
      setCell(lc, li, ID.obsidian); lc.temp[li] = 120;
      if (rng() < 0.5) { wc.life[wi] = Math.max(0, wc.life[wi] - 2); wc.flag[wi] &= ~STILL; if (!wc.life[wi]) { wc.mat[wi] = 0; } wc.dirty = true; }
      sim.events.push({ t: 'steam', c: lc, i: li });
    }
  }

  /**
   * One pass over every awake chunk. `slow` chunks (awake but far from anything the player cares
   * about) are stepped only every `farEvery` ticks — far land catching up instead of costing.
   */
  function step(rng) {
    windWeights();
    const tick = sim.tick;
    const list = sim.takeAwake();
    for (const c of list) {
      if (!c.hot && (tick % sim.farEvery) !== (c.cx & 3)) { sim.wake(c); continue; }
      stepChunk(c, rng, tick);
    }
  }

  function stepChunk(c, rng, tick) {
    let busy = false;
    const flip = tick & 1;
    for (let yy = 0; yy < CH; yy++) {
      const ly = flip ? CH - 1 - yy : yy;
      for (let xx = 0; xx < CH; xx++) {
        const lx = flip ? CH - 1 - xx : xx;
        const i = ly * CH + lx;
        const m = c.mat[i], f = c.flag[i];
        if (f & BURN) { burn(c, i, lx, ly, rng); busy = true; continue; }
        let t = c.temp[i];
        if (M.hot[m] && t < M.hot[m]) { c.temp[i] = t = M.hot[m]; }
        if (t !== amb) {
          busy = true;
          // catch fire / melt / cool
          const ig = m ? M.ignite[m] : (M.ignite[c.ground[i]] ? M.ignite[c.ground[i]] : 0);
          if (ig && t >= ig && !(c.flag[i] & WET)) { ignite(c, i); continue; }
          // share heat with the 4 neighbours, then drift back to ambient
          for (let d = 0; d < 4; d++) {
            if (!nb(c, lx, ly, DX[d], DY[d])) continue;
            if (nc.flag[ni] & BURN) continue;
            const tj = nc.temp[ni], q = (t - tj) >> 5;
            if (q > 0) { nc.temp[ni] = tj + q; t -= q; if (nc !== c) sim.wake(nc); }
          }
          t += t > amb ? -Math.max(1, (t - amb) >> 5) : 1;
          c.temp[i] = t;
        }
        if (!m) continue;
        if (m === ID.crust) {
          busy = true;
          if (c.life[i] < 255) c.life[i]++;   // a byte: count up to 255 and stay there
          if (c.life[i] >= 250 && rng() < 0.01) { c.mat[i] = 0; c.tall[i] = 0; if (!fixedGround(c.ground[i])) c.ground[i] = ID.basalt; c.dirty = true; }
          continue;
        }
        if (m === ID.lava && (tick & 3) === 0) {
          // lava touching water hardens even when neither is flowing
          for (let d = 0; d < 4; d++) if (nb(c, lx, ly, DX[d], DY[d]) && nc.mat[ni] === ID.water) { meet(c, i, m, nc, ni, ID.water, rng); break; }
          if (c.mat[i] !== ID.lava) { busy = true; continue; }
        }
        if (M.liquid[m] && !(f & STILL)) {
          if (flow(c, i, lx, ly, m, rng)) busy = true;
          else if (m === ID.lava && rng() < 0.004 / (1 + c.life[i] / 6)) { setCell(c, i, ID.crust); c.life[i] = 0; busy = true; }
          continue;
        }
        if (m === ID.lava) { busy = true; if (rng() < 0.004) { setCell(c, i, ID.crust); c.life[i] = 0; } continue; }
        if (M.source[m] !== 255) {
          // vents erupt for a while, then rest (each vent on its own clock)
          const phase = (tick + ((c.cx * 73856093) ^ (c.cy * 19349663) ^ (i * 83492791))) >>> 0;
          busy = true;
          if (phase % sim.ventCycle < sim.ventBurst && rng() < M.sourceRate[m] * 0.5) {
            const d = (rng() * 4) | 0;
            if (nb(c, lx, ly, DX[d], DY[d])) {
              const n = nc.mat[ni], liq = M.source[m];
              if (n === liq) { nc.life[ni] = Math.min(255, nc.life[ni] + M.sourceAmt[m]); nc.flag[ni] &= ~STILL; sim.wake(nc); }
              else if (!n || !M.blocksLiquid[n]) { if (n && M.ignite[n]) ignite(nc, ni); else { setCell(nc, ni, liq, M.sourceAmt[m]); nc.temp[ni] = 235; } }
            }
          }
        }
      }
    }
    if (busy) sim.wake(c);
    if (c.dirty && !c.editedTick) { store.markEdited(c); }
    if (c.dirty) c.version++;
  }

  return { step, setCell, ignite, nb };
}
