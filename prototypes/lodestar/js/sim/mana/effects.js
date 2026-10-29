// What each spell DOES when it lands (PLAN M6). PURE. Every spell is made of the world's own rules — the fire,
// blasts, debris, frost, lightning-through-water and rain of js/world — so a spell does exactly what the world would
// do: a line of fire burns what burns and stops at water and roads, a meteor's blobs set fires where they land, a frost
// snap turns a ford to ice that anyone can walk on, and the stone ridge is real cells nothing can walk through.
//
// Each effect is { land(a, def), tick?(a, def) → bool still going }. `a` is the active spell record (JSON-safe, kept in
// sim.mana.active and drawn by the console): { id, spell, x, y, x2?, y2?, castAt, landAt, until?, ... }.
// Every hit on a creature or a building goes through harm() (the damage rule call point).

import { BURN, OWNED, ROAD, BRIDGE, EDGE, SCORCH, WET, cell } from '../../world/grid.js';
import { addGas, GAS_STEAM } from '../../world/gas.js';
import { hash2 } from '../rng.js';
import { harm, wildOnes } from './harm.js';

/** Cells on the straight line from (x0, y0) to (x1, y1), both ends included (Bresenham). */
export function lineCells(x0, y0, x1, y1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/** The cells a line spell of half-width `w` covers, in order along the line, each once. */
export function bandCells(pts, w) {
  const seen = new Set(), out = [];
  const r2 = w * w;
  for (const [px, py] of pts) {
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const k = (px + dx) + ',' + (py + dy);
      if (seen.has(k)) continue;
      seen.add(k); out.push([px + dx, py + dy]);
    }
  }
  return out;
}

const d2of = (e, x, y) => { const dx = e.x / 256 - x, dy = e.y / 256 - y; return dx * dx + dy * dy; };

export function createEffects(sim, { combos }) {
  const { world } = sim;
  const { g, M } = world;
  const rng = sim.rng.split('mana.effects');
  const amb = M.ambient;
  const how = (a) => ({ spell: a.spell, x: a.x, y: a.y });

  /** Team-0 things a spell can touch (buildings, squads) whose middle is within r of (x, y). */
  function ownNear(x, y, r) {
    const out = [];
    for (const b of sim.ents.list('building')) {
      const half = Math.max(b.w || 1, b.h || 1) / 2;
      const rr = r + half;
      if (d2of(b, x, y) <= rr * rr) out.push(b);
    }
    for (const s of sim.ents.list('squad')) if (d2of(s, x, y) <= r * r) out.push(s);
    return out;
  }
  const wildNear = (x, y, r) => wildOnes(sim).filter((e) => d2of(e, x, y) <= r * r);
  const at = (x, y) => (g.inside(x, y) ? g.cells[g.idx(x, y)] : 0);
  const put = (x, y, v) => { const i = g.idx(x, y); g.cells[i] = v >>> 0; g.ver[i >>> 12]++; };

  // ---------------------------------------------------------------- Lightning
  const lightning = {
    land(a, def) {
      const H = def.hit, hit = new Set(), chain = [[a.x, a.y]];
      let waterHits = 0;
      const strike = (x, y, dmg) => {
        const flood = world.lightning(x, y);
        if (flood.length) {
          const wet = new Set(flood);
          let n = 0;
          for (const e of wildOnes(sim)) {
            if (hit.has(e.id)) continue;
            if (wet.has(((e.x >> 8) & 0xffff) | ((e.y >> 8) << 16))) { harm(sim, e, H.waterDamage, how(a)); hit.add(e.id); n++; }
          }
          waterHits += n;
          return true;
        }
        for (const e of wildNear(x, y, H.radius)) { if (hit.has(e.id)) continue; harm(sim, e, dmg, how(a)); hit.add(e.id); }
        return false;
      };
      const wet = strike(a.x, a.y, H.damage);
      if (wet) { if (waterHits >= 2) combos.hit('charged-water', a); }
      else {
        // on dry land the bolt jumps to the nearest creature it has not hit, and on, each jump a little weaker
        let cx = a.x, cy = a.y, dmg = H.damage;
        for (let hop = 0; hop < H.chain; hop++) {
          let best = null, bd = H.chainRange * H.chainRange;
          for (const e of wildOnes(sim)) { if (hit.has(e.id)) continue; const d = d2of(e, cx, cy); if (d < bd) { bd = d; best = e; } }
          if (!best) break;
          dmg = Math.round(dmg * H.chainFall);
          const ex = best.x >> 8, ey = best.y >> 8;
          chain.push([ex, ey]);
          strike(ex, ey, dmg);
          if (!hit.has(best.id)) { harm(sim, best, dmg, how(a)); hit.add(best.id); }
          cx = ex; cy = ey;
        }
        if (chain.length >= 4) combos.hit('chain', a);
      }
      a.chain = chain; a.hits = hit.size; a.water = wet;
      return { chain, hits: hit.size, water: wet };
    },
  };

  // ---------------------------------------------------------------- Shield bubble
  const shield = {
    land(a, def) { a.r = def.shield.r; a.until = sim.tick + def.shield.ticks; a.suppressed = 0; shield.tick(a, def); return { r: a.r }; },
    tick(a, def) {
      if (sim.tick >= a.until) return false;
      // fire dies at the skin: nothing inside may burn or warm up toward burning
      const r = a.r, r2 = r * r, cx = a.x, cy = a.y;
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy; if (y < 0 || y >= g.H) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const x = cx + dx; if (x < 0 || x >= g.W) continue;
          const i = g.idx(x, y), c = g.cells[i];
          if (c & BURN) { g.cells[i] = ((c & ~BURN & ~0xff00) | (amb << 8)) >>> 0; g.heat[i] = 0; g.ver[i >>> 12]++; a.suppressed++; }
          else if (M.flammable[c & 255] && ((c >>> 8) & 255) > amb) { g.cells[i] = ((c & ~0xff00) | (amb << 8)) >>> 0; g.heat[i] = 0; }
        }
      }
      if (a.suppressed >= 12) combos.hit('firebreak', a);
      // the dome keeps the smoke out too (so the scope still sees what it shelters)
      if ((sim.tick & 1) === 0) {
        const rq = Math.floor((r - 2) / 4), qx0 = (cx + 0.5) / 4, qy0 = (cy + 0.5) / 4;
        for (let qy = Math.floor(qy0 - rq); qy <= Math.ceil(qy0 + rq); qy++) for (let qx = Math.floor(qx0 - rq); qx <= Math.ceil(qx0 + rq); qx++) {
          if (qx < 0 || qy < 0 || qx >= g.QW || qy >= g.QH) continue;
          const dx = qx + 0.5 - qx0, dy = qy + 0.5 - qy0;
          if (dx * dx + dy * dy > rq * rq) continue;
          const q = qy * g.QW + qx;
          if (g.gasDensity[q]) { g.gasDensity[q] = 0; g.gasVer[((qy >> 4) * g.CW) + (qx >> 4)]++; }
        }
      }
      // creatures cannot come in: anything inside is put back outside the skin
      const out = r + def.shield.pushOut;
      for (const e of wildOnes(sim)) {
        const dx = e.x / 256 - cx - 0.5, dy = e.y / 256 - cy - 0.5, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
        e.x = Math.round((cx + 0.5 + ux * out) * 256); e.y = Math.round((cy + 0.5 + uy * out) * 256);
        e.shoved = sim.tick;
      }
      return true;
    },
  };

  // ---------------------------------------------------------------- Line of fire
  function fireCell(a, def, x, y) {
    if (!g.inside(x, y)) return;
    const c = at(x, y), m = c & 255;
    if (c & EDGE) return;
    if (M.water[m]) { addGas(g, x, y, GAS_STEAM, 18); return; }
    if (M.hot[m]) return;
    if (world.fire.canBurn(c)) {
      if (!(c & BURN)) { if (m === M.id.dry_grass) a.dry = (a.dry || 0) + 1; world.fire.ignite(x, y); a.lit = (a.lit || 0) + 1; }
      return;
    }
    if (c & (OWNED | ROAD | BRIDGE)) return; // the fire does not cook buildings' cells or roads; buildings are hit through harm()
    if (!M.walk[m]) return;
    // bare ground: scorched and glowing hot for a while (the streak leaves a burn mark you can see at night)
    const t = (c >>> 8) & 255;
    const sh = M.shade[m];
    let nc = (c & ~0xff00) | (Math.max(t, def.fire.groundHeat) << 8);
    if (sh === 0 || sh === 1) nc |= SCORCH;
    put(x, y, nc);
    g.wakeAt(x, y); g.emitHint[g.idx(x, y) >>> 12] = 1;
  }
  const fireline = {
    land(a, def) {
      a.pts = lineCells(a.x, a.y, a.x2, a.y2);
      a.prog = 0; a.hitIds = []; a.hitB = [];
      a.until = sim.tick + Math.ceil(a.pts.length / def.fire.speed) + def.fire.burnTicks;
      fireline.tick(a, def);
      return { len: a.pts.length };
    },
    tick(a, def) {
      const F = def.fire;
      if (a.prog < a.pts.length) {
        const end = Math.min(a.pts.length, a.prog + F.speed);
        for (let k = a.prog; k < end; k++) {
          const [px, py] = a.pts[k];
          for (let dy = -F.width; dy <= F.width; dy++) for (let dx = -F.width; dx <= F.width; dx++) if (dx * dx + dy * dy <= F.width * F.width) fireCell(a, def, px + dx, py + dy);
          for (const e of wildNear(px + 0.5, py + 0.5, F.reach)) if (!a.hitIds.includes(e.id)) { a.hitIds.push(e.id); harm(sim, e, F.damage, how(a)); }
          const b = sim.buildings.at(px, py);
          if (b && !a.hitB.includes(b.id)) { a.hitB.push(b.id); harm(sim, b, F.damage, how(a)); }
        }
        a.prog = end;
        if (a.prog >= a.pts.length && (a.dry || 0) >= 20) combos.hit('kindling', a);
      }
      // creatures standing in the burning line keep getting burnt (once a second)
      if ((sim.tick - a.landAt) % 20 === 0) {
        for (const e of wildOnes(sim)) {
          const ex = e.x >> 8, ey = e.y >> 8;
          if ((at(ex, ey) & BURN) && a.pts.some(([px, py]) => Math.abs(px - ex) <= F.reach && Math.abs(py - ey) <= F.reach)) harm(sim, e, F.burnDamagePerSecond, how(a));
        }
      }
      return sim.tick < a.until;
    },
  };

  // ---------------------------------------------------------------- Sensor flare
  const flare = {
    land(a, def) { a.r = def.flare.r; a.until = sim.tick + def.flare.ticks; return { r: a.r }; },
    tick(a) { return sim.tick < a.until; },
  };

  // ---------------------------------------------------------------- Meteor
  const meteor = {
    land(a, def) {
      const B = def.blast, x = a.x, y = a.y;
      // M4 wraps world.blast: its onBlast hurts what is in reach through the damage rule, so the meteor's own
      // damage rides on the blast (o.damage / o.splash); with no defence module the effect hits them itself below
      const res = world.blast(x, y, B.r, B.power, { by: 'spell', spell: 'meteor', damage: B.damage, splash: B.damageR });
      // the thrown rim: a ragged ring of rubble just outside the crater
      const r0 = B.r * 0.82, r1 = B.r * B.ringR, R = Math.ceil(r1);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r0 || d > r1) continue;
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy)) continue;
        if ((hash2(xx, yy, 4111 + a.id) & 1023) > B.ringChance * 1023) continue;
        const c = at(xx, yy), m = c & 255;
        if (c & (OWNED | ROAD | BRIDGE | EDGE)) continue;
        if (M.water[m] || M.hot[m] || M.ore[m] || !M.walk[m]) continue;
        put(xx, yy, ((c & ~0xff & ~0xff0000 & ~BURN) | M.id.rubble | SCORCH) >>> 0);
        g.regrowHint[g.idx(xx, yy) >>> 12] = 1;
      }
      // the core stays white hot
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy) || dx * dx + dy * dy > 5) continue;
        const c = at(xx, yy);
        if (M.water[c & 255] || (c & EDGE)) continue;
        put(xx, yy, (c & ~0xff00) | (B.coreHot << 8));
      }
      g.wakeAt(x, y);
      // burning blobs flung out on the debris arcs
      for (let k = 0; k < B.blobs; k++) {
        const ang = rng.int(1024);
        const ux = sim.trig.cos(ang) / 65536, uy = sim.trig.sin(ang) / 65536;
        const sp = B.blobSpeed * (0.45 + rng.float() * 0.75);
        world.debris.spawn(x + 0.5 + ux * B.r * 0.3, y + 0.5 + uy * B.r * 0.3, ux * sp, uy * sp, B.blobLift * (0.6 + rng.float() * 0.7), M.id.rubble, true);
      }
      if (!sim.defence) for (const e of wildNear(x + 0.5, y + 0.5, B.damageR)) {
        const d = Math.sqrt(d2of(e, x + 0.5, y + 0.5));
        harm(sim, e, Math.round(B.damage * (1 - 0.7 * d / B.damageR)), how(a));
      }
      if (!sim.defence) for (const o of ownNear(x + 0.5, y + 0.5, B.r)) harm(sim, o, Math.round(B.damage * 0.6), how(a));
      if (res.water > res.land) combos.hit('steam-bath', a);
      a.r = B.r; a.shake = 1;
      return { r: B.r, water: res.water > res.land, shake: 1 };
    },
  };

  // ---------------------------------------------------------------- Frost snap
  const frost = {
    land(a, def) {
      const F = def.frost;
      const caught = wildNear(a.x + 0.5, a.y + 0.5, F.r);
      const wading = caught.filter((e) => M.water[at(e.x >> 8, e.y >> 8) & 255]).length;
      const frozen = world.frost(a.x, a.y, F.r);
      for (const e of caught) { harm(sim, e, F.damage, how(a)); e.slowUntil = sim.tick + F.slowTicks; e.slowBy = F.slow; }
      if (wading > 0 && frozen > 0) combos.hit('ice-trap', a);
      a.r = F.r;
      return { r: F.r, frozen, caught: caught.length };
    },
  };

  // ---------------------------------------------------------------- Call rain
  const rain = {
    land(a, def) {
      const R = def.rain, r = R.r;
      let burning = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && (at(a.x + dx, a.y + dy) & BURN)) burning++;
      world.rain(a.x, a.y, r, R.ticks);
      if (burning >= 20) combos.hit('doused', a);
      a.r = r; a.until = sim.tick + R.ticks;
      return { r, burning };
    },
    tick(a) { return sim.tick < a.until; },
  };

  // ---------------------------------------------------------------- Stone ridge
  const RIDGE = M.id.ridge_stone;
  const ridge = {
    land(a, def) {
      const R = def.ridge;
      a.pts = lineCells(a.x, a.y, a.x2, a.y2);
      a.band = bandCells(a.pts, R.width - 1 || 1);
      a.prog = 0; a.raised = []; a.phase = 'rise';
      a.until = sim.tick + Math.ceil(a.pts.length / R.speed) + R.ticks;
      ridge.tick(a, def);
      return { len: a.pts.length };
    },
    tick(a, def) {
      const R = def.ridge;
      if (a.phase === 'rise') {
        if (a.prog < a.band.length) {
          const per = Math.ceil(a.band.length / Math.max(1, Math.ceil(a.pts.length / R.speed)));
          const busy = new Set();
          for (const k of ['enemy', 'vehicle', 'worker', 'squad']) for (const e of sim.ents.list(k)) busy.add((e.x >> 8) + ',' + (e.y >> 8));
          const end = Math.min(a.band.length, a.prog + per);
          for (let k = a.prog; k < end; k++) {
            const [x, y] = a.band[k];
            if (!g.inside(x, y) || busy.has(x + ',' + y)) continue;
            const c = at(x, y), m = c & 255;
            // never on water, lava, cliffs, buildings, roads (a ridge across a road leaves a gap: a gate for your carts), or ore
            if (c & (OWNED | ROAD | BRIDGE | EDGE)) continue;
            if (M.water[m] || M.hot[m] || M.ore[m] || !M.walk[m]) continue;
            put(x, y, cell(RIDGE, amb, 0, c & WET));
            g.wakeAt(x, y);
            a.raised.push(g.idx(x, y));
          }
          a.prog = end;
          sim.routeVer++;
        }
        if (sim.tick >= a.until) { a.phase = 'crumble'; a.left = a.raised.slice(); a.crumbleAt = sim.tick; }
        return true;
      }
      // crumble: a few cells a tick fall to rubble, in a jumbled order, until none are left
      const per = Math.max(1, Math.ceil(a.raised.length / R.crumbleTicks));
      for (let k = 0; k < per && a.left.length; k++) {
        const j = rng.int(a.left.length), i = a.left[j];
        a.left[j] = a.left[a.left.length - 1]; a.left.pop();
        const c = g.cells[i];
        if ((c & 255) !== RIDGE) continue;
        g.cells[i] = ((c & ~0xff) | M.id.rubble) >>> 0; g.ver[i >>> 12]++; g.regrowHint[i >>> 12] = 1;
      }
      sim.routeVer++;
      return a.left.length > 0;
    },
  };

  // ---------------------------------------------------------------- Mend
  const mend = {
    land(a, def) {
      const R = def.mend, r = R.r;
      let healed = 0;
      for (const o of ownNear(a.x + 0.5, a.y + 0.5, r)) {
        if (o.hpMax > 0 && o.hp < o.hpMax) { o.hp = Math.min(o.hpMax, o.hp + R.heal * o.hpMax); healed++; sim.dirty.add(o.id); }
        if (o.kind === 'squad' && o.str !== undefined && o.str < 1) { o.str = Math.min(1, o.str + R.heal); healed++; }
      }
      // wall sections (M4: vectors of kind 'wall' with sections [{ hp, max }], one per 4 m = 8 cells)
      for (const v of world.vectors.list || []) {
        if (v.kind !== 'wall' || !v.sections) continue;
        let along = 0;
        const segs = [];
        for (let k = 1; k < v.pts.length; k++) { const [x0, y0] = v.pts[k - 1], [x1, y1] = v.pts[k]; const L = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)); segs.push([x0, y0, x1, y1, along, L]); along += L; }
        v.sections.forEach((s, si) => {
          const max = s.max ?? s.hpMax; if (!max || s.hp >= max) return;
          const d = (si + 0.5) * 8;
          const sg = segs.find((q) => d >= q[4] && d <= q[4] + q[5]) || segs[segs.length - 1];
          if (!sg) return;
          const t = sg[5] ? (d - sg[4]) / sg[5] : 0, px = sg[0] + (sg[2] - sg[0]) * t, py = sg[1] + (sg[3] - sg[1]) * t;
          if ((px - a.x) * (px - a.x) + (py - a.y) * (py - a.y) <= r * r) { s.hp = Math.min(max, s.hp + R.heal * max); healed++; sim.vectorsDirty.add(v.id); }
        });
      }
      let regrown = 0, doused = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = a.x + dx, y = a.y + dy;
        if (!g.inside(x, y)) continue;
        const c = at(x, y), m = c & 255;
        if (R.douse && (c & BURN) && (c & OWNED)) { put(x, y, (c & ~BURN & ~0xff00) | (amb << 8)); doused++; continue; }
        if (!R.regrow || (c & (OWNED | ROAD | BRIDGE | BURN))) continue;
        if ((m === M.id.scorched || m === M.id.ash) && (hash2(x, y, 977 + a.id) & 1023) < 780) { put(x, y, cell(M.id.grass, amb, 0, c & WET)); regrown++; }
      }
      a.r = r;
      return { r, healed, regrown, doused };
    },
  };

  return { lightning, shield, fireline, flare, meteor, frost, rain, ridge, mend };
}
