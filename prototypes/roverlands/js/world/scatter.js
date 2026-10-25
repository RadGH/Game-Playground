// Where every tree, bush, reed bed, rock and fallen log goes — and the ground decor that is drawn but never collides.
// Pure: no DOM, no three. Called once by worldgen.js after the ground, water and roads are final.
//
// The method: a jittered grid of candidate points (SCATTER.step metres apart). Each candidate rolls ONE number
// (a hash of its grid cell, so the result does not depend on the order things are visited) against its biome's rule
// list. A slow noise per rule ("clump") gathers a kind into groves and leaves clearings. A candidate that wins a rule
// is then checked: dry ground, off the roads, not too steep for that kind, clear of the home pad / sandbox / flags /
// ramps, and not crowding anything already placed (a 4 m spatial hash). Nothing here uses Math.sin / cos / exp —
// see wmath.js.

import { SCATTER, BIOMES, KINDS, SURF } from './world-data.js';
import { fbm, hash01, smoothstep, lerp, dsin, dcos, TAU } from './wmath.js';

const MAX_SLOPE = { tree_pine: 0.5, tree_birch: 0.5, tree_oak: 0.42, sapling: 0.6, bush: 0.65, reeds: 0.35,
  rock_s: 0.9, rock_m: 0.95, rock_l: 1.0, boulder: 1.1, log: 0.28 };
const RED = [1.28, 0.82, 0.62], COLD = [0.92, 0.96, 1.04];

/**
 * @param world  the world under construction (heightAt, slopeAt, water, roadDist, biome, surface, size)
 * @param ctx    { S, addObj, objects, exclusions:[{x,z,hx,hz}], discs:[{x,z,r}], nearestK }
 * @returns {{ decor: Array }}
 */
export function scatterObjects(world, ctx) {
  const { S, addObj, objects, exclusions, discs, nearestK } = ctx;
  const half = world.size / 2;
  const { water, roadDist, biome, surface } = world;

  // --- spatial hash of everything that collides ---------------------------------------------------------------------
  const HC = 4, HN = Math.ceil(world.size / HC) + 1;
  const hash = new Map();
  const hkey = (x, z) => Math.floor((x + half) / HC) * HN + Math.floor((z + half) / HC);
  const footprint = (o) => (o.shape.t === 'box' ? Math.max(o.shape.hx, o.shape.hz) : o.shape.r || 1);
  const put = (o, r) => { const k = hkey(o.x, o.z); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push([o.x, o.z, r]); };
  for (const o of objects) put(o, footprint(o));
  function crowded(x, z, r) {
    const ci = Math.floor((x + half) / HC), cj = Math.floor((z + half) / HC);
    const reach = Math.ceil((r + 4) / HC);
    for (let di = -reach; di <= reach; di++) for (let dj = -reach; dj <= reach; dj++) {
      const a = hash.get((ci + di) * HN + (cj + dj));
      if (!a) continue;
      for (const [ox, oz, or] of a) {
        const dx = ox - x, dz = oz - z, m = r + or;
        if (dx * dx + dz * dz < m * m) return true;
      }
    }
    return false;
  }
  function excluded(x, z, pad = 0) {
    if (x < -half + 5 || x > half - 5 || z < -half + 5 || z > half - 5) return true;
    for (const e of exclusions) if (Math.abs(x - e.x) < e.hx + pad && Math.abs(z - e.z) < e.hz + pad) return true;
    for (const d of discs) { const dx = x - d.x, dz = z - d.z; if (dx * dx + dz * dz < (d.r + pad) * (d.r + pad)) return true; }
    return false;
  }
  const wetAt = (x, z) => !Number.isNaN(water[nearestK(x, z)]);
  const depthAt = (x, z) => { const lv = world.waterAt(x, z); return lv == null ? 0 : lv - world.heightAt(x, z); };
  function dryAround(x, z, r) {
    if (wetAt(x, z)) return false;
    for (let a = 0; a < 6; a++) if (wetAt(x + r * dcos(a * 1.0472), z + r * dsin(a * 1.0472))) return false;
    return true;
  }

  // --- the collidable scatter -----------------------------------------------------------------------------------------
  const step = SCATTER.step;
  const G = Math.floor(world.size / step);
  const clumpCache = new Map();
  const clumpAt = (rule, ri, b, x, z) => {
    if (!rule.clump) return 1;
    const n = fbm(x * 0.011, z * 0.011, S + 300 + ri * 17 + b * 131, 3);
    return lerp(1, smoothstep(0.30, 0.66, n) * 1.9, rule.clump);
  };
  void clumpCache;
  for (let gj = 0; gj < G; gj++) for (let gi = 0; gi < G; gi++) {
    const x = -half + (gi + 0.5 + (hash01(gi, gj, S + 3) - 0.5) * 0.92) * step;
    const z = -half + (gj + 0.5 + (hash01(gi, gj, S + 4) - 0.5) * 0.92) * step;
    const k = nearestK(x, z);
    const b = biome[k];
    const rules = SCATTER.biomes[BIOMES[b].key];
    if (!rules || !rules.length) continue;
    const roll = hash01(gi, gj, S + 5);
    let acc = 0, rule = null, ri = -1;
    for (let q = 0; q < rules.length; q++) {
      acc += rules[q].p * (SCATTER.density ?? 1) * clumpAt(rules[q], q, b, x, z);
      if (roll < acc) { rule = rules[q]; ri = q; break; }
    }
    if (!rule) continue;
    const K = KINDS[rule.kind];
    const u1 = hash01(gi, gj, S + 6), u2 = hash01(gi, gj, S + 7), u3 = hash01(gi, gj, S + 8);
    const s = lerp(rule.s[0], rule.s[1], u1);
    const look = rule.look[Math.floor(u2 * rule.look.length) % rule.look.length];
    const yaw = u3 * TAU;
    const kind = rule.kind;
    void ri;

    // where it may stand
    const isTree = kind.startsWith('tree_');
    const rad = kind === 'log' ? 0 : (K.r || 0.5) * s;
    const roadMargin = isTree ? 2.2 + rad : kind === 'log' ? 2.5 : kind.startsWith('rock') || kind === 'boulder' ? 1.2 + rad : 0.6 + rad;
    if (roadDist[k] < roadMargin) continue;
    if (excluded(x, z, isTree ? 4 : 2)) continue;
    if (world.slopeAt(x, z) > (MAX_SLOPE[kind] ?? 0.6)) continue;
    if (kind === 'reeds') {
      if (depthAt(x, z) > 0.35) continue;
    } else if (!dryAround(x, z, Math.max(1, rad))) continue;
    if (surface[k] === SURF.road || surface[k] === SURF.ice) continue;

    const spacing = isTree ? rad + 1.4 : kind === 'boulder' || kind === 'rock_l' ? rad + 0.6 : rad + 0.3;
    let o;
    if (kind === 'log') {
      const len = (5 + 3 * hash01(gi, gj, S + 9)) * s;
      const r = K.r * s * (0.85 + 0.3 * hash01(gi, gj, S + 10));
      const fx = dsin(yaw), fz = dcos(yaw);
      const xa = x + fx * len / 2, za = z + fz * len / 2, xb = x - fx * len / 2, zb = z - fz * len / 2;
      const ha = world.heightAt(xa, za), hb = world.heightAt(xb, zb), hc = world.heightAt(x, z);
      if (Math.abs(ha - hb) > 1.0 || wetAt(xa, za) || wetAt(xb, zb)) continue;
      if (roadDist[nearestK(xa, za)] < 2.5 || roadDist[nearestK(xb, zb)] < 2.5) continue;
      if (crowded(x, z, len / 2 + 0.3)) continue;
      // a log rests on its lowest support, sunk a little into the ground
      const y = Math.min(ha, hb, hc);
      o = addObj({ kind, x: round3(x), y: round3(y), z: round3(z), yaw: round3(yaw), s: round3(s), look, breakAt: null, mass: Math.round(600 * 3.1416 * r * r * len),
        fall: 'topple', shape: { t: 'box', hx: r, hy: r * 0.9, hz: len / 2, lift: r * 0.72, round: 'z' } });
      put(o, len / 2);
      continue;
    }
    if (crowded(x, z, spacing)) continue;
    const y = world.heightAt(x, z);
    let shape, breakAt = K.breakAt ?? null, mass = K.mass || 0, sink = 0.08;
    if (isTree) {
      const r = K.r * s, h = K.colH * s;
      shape = { t: 'cyl', r: round3(r), h: round3(h) };
      if (kind === 'tree_oak') breakAt = s < 0.75 ? 26000 : null;
      else breakAt = r < 0.12 ? 9000 : r < 0.2 ? 16000 : r < 0.3 ? 26000 : null;
      mass = Math.round(600 * 3.1416 * r * r * K.h * s * 0.55);
      sink = 0.15;
    } else if (kind.startsWith('rock') || kind === 'boulder') {
      const r = K.r * s, h = K.colH * s;
      shape = { t: 'cyl', r: round3(r), h: round3(h) };
      sink = h * 0.18;
    } else {
      shape = { t: 'cyl', r: round3(K.r * s), h: round3(K.colH * s) };
      mass = Math.round(mass * s * s);
    }
    const tint = b === 3 ? undefined : (BIOMES[b].key === 'canyon' && (kind.startsWith('rock') || kind === 'boulder')) ? RED
      : (BIOMES[b].key === 'snow' && (kind.startsWith('rock') || kind === 'boulder')) ? COLD : undefined;
    o = addObj({ kind, x: round3(x), y: round3(y - sink), z: round3(z), yaw: round3(yaw), s: round3(s), look,
      shape, breakAt, mass, fall: K.fall || 'topple', ...(tint ? { tint } : {}) });
    put(o, spacing);
  }

  // --- decor: drawn, never simulated -------------------------------------------------------------------------------
  const decor = [];
  const ds = SCATTER.decorStep;
  const DG = Math.floor(world.size / ds);
  for (let gj = 0; gj < DG; gj++) for (let gi = 0; gi < DG; gi++) {
    const x = -half + (gi + 0.5 + (hash01(gi, gj, S + 13) - 0.5) * 0.95) * ds;
    const z = -half + (gj + 0.5 + (hash01(gi, gj, S + 14) - 0.5) * 0.95) * ds;
    const k = nearestK(x, z);
    const rules = SCATTER.decor[BIOMES[biome[k]].key];
    if (!rules || !rules.length) continue;
    const roll = hash01(gi, gj, S + 15);
    let acc = 0, rule = null;
    for (const r of rules) { acc += r.p; if (roll < acc) { rule = r; break; } }
    if (!rule) continue;
    if (roadDist[k] < 0.8) continue;
    const isReed = rule.kind === 'reed';
    if (isReed ? depthAt(x, z) > 0.3 : wetAt(x, z)) continue;
    if (excluded(x, z, 1)) continue;
    if (world.slopeAt(x, z) > 0.7) continue;
    if (surface[k] === SURF.road || surface[k] === SURF.ice || (surface[k] === SURF.mud && !isReed && rule.kind !== 'debris')) continue;
    const look = rule.look[Math.floor(hash01(gi, gj, S + 16) * rule.look.length) % rule.look.length];
    decor.push({ kind: rule.kind, look, x: round3(x), y: round3(world.heightAt(x, z) - 0.02), z: round3(z),
      yaw: round3(hash01(gi, gj, S + 17) * TAU), s: round3(0.75 + 0.6 * hash01(gi, gj, S + 18)) });
  }
  return { decor };
}

function round3(v) { return Math.round(v * 1000) / 1000; }
