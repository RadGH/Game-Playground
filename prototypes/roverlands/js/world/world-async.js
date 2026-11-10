// generateWorldAsync(opts, onProgress) -> Promise<world>: the world built in a module worker (world-worker.js), with
// the accessors rebuilt here from its arrays. Falls back to the direct call (worldgen.js generateWorld) when workers
// are missing or the worker fails, or with ?worker=0 in the page address. Same seed + map = the same world either way.
//
// Why: Wayfare County takes ~2.4 s in desktop Chromium and 2-3x that on a phone; on the main thread the page froze
// (no progress bar, no spinner) for all of it.
import { generateWorld } from './worldgen.js';
import { SURFACES, BIOMES } from './world-data.js';

let seq = 0;

export async function generateWorldAsync(opts = {}, onProgress = () => {}) {
  const off = typeof Worker === 'undefined' || /[?&]worker=0\b/.test(globalThis.location?.search || '');
  if (!off) {
    try { return await viaWorker(opts, onProgress); } catch (e) { console.warn('[roverlands] world worker failed, building on the page instead:', e?.message || e); }
  }
  await new Promise(r => setTimeout(r, 0));
  const w = generateWorld(opts);
  w.builtIn = 'page';
  return w;
}

function viaWorker(opts, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./world-worker.js', import.meta.url), { type: 'module' });
    const id = ++seq;
    const done = (fn, v) => { worker.terminate(); fn(v); };
    worker.onmessage = (e) => {
      const m = e.data;
      if (!m || m.id !== id) return;
      if (m.error) return done(reject, new Error(m.error));
      if (m.world) { const w = attachWorldFns(m.world); w.builtIn = 'worker'; return done(resolve, w); }
      try { onProgress(m.progress, m.label); } catch { /* the caller's problem */ }
    };
    worker.onerror = (e) => { e.preventDefault?.(); done(reject, new Error(e.message || 'worker error')); };
    worker.postMessage({ id, opts: { seed: opts.seed, map: opts.map, vehicles: opts.vehicles } });
  });
}

/**
 * Put the world contract's functions back on a world that came through postMessage (functions do not survive a
 * structured clone). The arithmetic is the generator's own (worldgen.js / countygen.js), step for step, so heightAt
 * here gives exactly the number heightAt there gives.
 */
export function attachWorldFns(world) {
  const { heights, surface, biome, water, roadDist } = world;
  const DIM = world.dim, CELL = world.cell, HALF = world.size / 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const bilinear = (arr, x, z) => {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > DIM - 2) i = DIM - 2;
    if (j < 0) j = 0; else if (j > DIM - 2) j = DIM - 2;
    let tx = fx - i, tz = fz - j;
    tx = tx < 0 ? 0 : tx > 1 ? 1 : tx; tz = tz < 0 ? 0 : tz > 1 ? 1 : tz;
    const k = j * DIM + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + DIM], d = arr[k + DIM + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
  const nearestK = (x, z) => clamp(Math.round((z + HALF) / CELL), 0, DIM - 1) * DIM + clamp(Math.round((x + HALF) / CELL), 0, DIM - 1);
  Object.assign(world, {
    heightAt: (x, z) => bilinear(heights, x, z),
    normalAt(x, z, out) {
      const e = 1.0;
      const hx = bilinear(heights, x + e, z) - bilinear(heights, x - e, z);
      const hz = bilinear(heights, x, z + e) - bilinear(heights, x, z - e);
      const nx = -hx / (2 * e), nz = -hz / (2 * e);
      const l = Math.sqrt(nx * nx + 1 + nz * nz);
      if (out) { out.x = nx / l; out.y = 1 / l; out.z = nz / l; return out; }
      return [nx / l, 1 / l, nz / l];
    },
    slopeAt(x, z) { const n = this.normalAt(x, z); return 1 - n[1]; },
    surfaceIdAt: (x, z) => surface[nearestK(x, z)],
    surfaceAt: (x, z) => SURFACES[surface[nearestK(x, z)]],
    biomeIdAt: (x, z) => biome[nearestK(x, z)],
    biomeAt: (x, z) => BIOMES[biome[nearestK(x, z)]].label,
    waterAt(x, z) {
      const fx = clamp((x + HALF) / CELL, 0, DIM - 1.000001), fz = clamp((z + HALF) / CELL, 0, DIM - 1.000001);
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const k = j * DIM + i;
      const c = [water[k], water[k + 1], water[k + DIM], water[k + DIM + 1]];
      const wts = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
      let s = 0, w = 0;
      for (let q = 0; q < 4; q++) if (!Number.isNaN(c[q])) { s += c[q] * wts[q]; w += wts[q]; }
      if (w < 0.2) return null;
      const lvl = s / w;
      return lvl > bilinear(heights, x, z) ? lvl : null;
    },
    roadDistAt: (x, z) => roadDist[nearestK(x, z)],
  });
  return world;
}
