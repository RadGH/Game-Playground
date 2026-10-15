#!/usr/bin/env node
// Thousandvale — far-horizon bake (stream B, PLAN §12 "see it, walk to it").
//
//   node prototypes/thousandvale/tools/bake-horizon.mjs            # writes data/world/horizon.{bin,json}
//   node prototypes/thousandvale/tools/bake-horizon.mjs --check    # exit 1 if the checked-in file is stale
//
// The whole world at 32 m. In a BAKED zone each sample is copied from the zone's own terrain.bin (every 16th
// 2 m sample: height, water surface, biome), so the horizon and the zone agree exactly on every shared sample.
// Elsewhere: the zone bake's own base ground (world-core makeRefiner().baseGround), with sea and lake levels as
// the zone bake applies them, and the warped macro biome. Re-run after baking or re-baking any zone.
// Reader: js/rules/horizon-read.js (parseHorizon, horizonRef).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { loadWorld } from './bake-zone.mjs';
import { heightRange, continentAt } from './lib/world-core.mjs';
import { parseTerrain, predictHeights } from '../js/rules/terrain-read.js';
import { HORIZON_MAGIC, HORIZON_VERSION, parseHorizon } from '../js/rules/horizon-read.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = join(HERE, '..', 'data', 'world'), ZONES_DIR = join(HERE, '..', 'data', 'zones');
export const HORIZON_STEP = 32;
const BEACH = 4;                 // World Forge BIOMES index (bake-zone.mjs uses the same number)

export function bakeHorizon() {
  const { json: W, macro: m, ref } = loadWorld();
  const ZM = W.grid.zoneMetres, per = ZM / HORIZON_STEP;          // 64 horizon steps per zone edge
  const width = W.grid.cols * per + 1, height = W.grid.rows * per + 1, N = width * height;
  const { min: heightMin, max: heightMax } = heightRange(m);
  const q = v => Math.max(0, Math.min(65535, Math.round((v - heightMin) / (heightMax - heightMin) * 65535)));
  const hq = new Uint16Array(N), wq = new Uint16Array(N), biome = new Uint8Array(N), done = new Uint8Array(N);
  // baked zones first: exact copies of their samples
  const baked = [];
  let biomes = null;
  for (const z of W.zones) {
    const f = join(ZONES_DIR, z.id, 'terrain.bin');
    if (!existsSync(f)) continue;
    const t = parseTerrain(readFileSync(f));
    if (t.meta.heightMin !== heightMin || t.meta.heightMax !== heightMax) throw new Error(`${z.id}: not on the world height scale`);
    biomes ||= t.meta.biomes;
    baked.push(z.id);
    const S = t.size, stride = HORIZON_STEP / t.step, L = t.layers;
    for (let j = 0; j <= per; j++) for (let i = 0; i <= per; i++) {
      const k = (z.zy * per + j) * width + z.zx * per + i, s = j * stride * S + i * stride;
      hq[k] = L.height[s]; wq[k] = L.waterTop[s]; biome[k] = L.biome[s]; done[k] = 1;
    }
  }
  if (!biomes) throw new Error('bake at least one zone first (the biome table comes from a zone)');
  // the rest: base ground, sea + lakes, warped macro biome (the zone bake's own first steps)
  const M = m.macroMetres;
  const lakeLevel = new Map(); for (const l of W.lakes) for (const c of l.cells) lakeLevel.set(c, l.level);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i; if (done[k]) continue;
    const wx = i * HORIZON_STEP, wz = j * HORIZON_STEP;
    let g = ref.baseGround(wx, wz), top = NaN;
    const mi = Math.min(m.height - 1, Math.max(0, Math.round(wz / M))) * m.width + Math.min(m.width - 1, Math.max(0, Math.round(wx / M)));
    if (m.water[mi] === 1 || g < 0) top = 0;
    else if (m.water[mi] === 2) { const lv = lakeLevel.get(mi) ?? 0; top = lv; g = Math.min(g, lv - 2.5); }
    hq[k] = q(g); wq[k] = Number.isNaN(top) ? 0 : Math.max(1, q(top));
    biome[k] = m.biome[ref.warpedIndex(wx, wz)];
    // 2026-10-14 continents: a new coast (land the sea has risen around) gets a beach, not grass to the waterline
    if (top !== 0 && g < 6 && !continentAt(wx, wz) && m.water[mi] !== 2) biome[k] = BEACH;
  }
  const meta = {
    name: 'horizon', width, height, step: HORIZON_STEP, zoneMetres: ZM, origin: { x: 0, z: 0 }, heightMin, heightMax,
    worldInputHash: W.inputHash, baked, biomes,
  };
  return { meta, hq, wq, biome };
}

export function encodeHorizon({ meta, hq, wq, biome }) {
  const N = meta.width * meta.height;
  const layers = new Uint8Array(N * 5), lv = new DataView(layers.buffer);
  const r = predictHeights(hq, meta.width, meta.height);
  for (let k = 0; k < N; k++) { lv.setUint16(k * 2, r[k], true); lv.setUint16(N * 2 + k * 2, wq[k], true); }
  layers.set(biome, N * 4);
  const body = deflateRawSync(layers, { level: 9 });
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const off = (12 + json.length + 3) & ~3;
  const out = new Uint8Array(off + 4 + body.length), dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = HORIZON_MAGIC.charCodeAt(k);
  dv.setUint32(4, HORIZON_VERSION, true); dv.setUint32(8, json.length, true); out.set(json, 12);
  dv.setUint32(off, body.length, true); out.set(body, off + 4);
  return out;
}

/** FNV-1a of the decoded layers — the `hash` the client caches on (stable across zlib versions). */
export function horizonHash(h) {
  let x = 2166136261;
  for (const a of [h.hq, h.wq, h.biome]) { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let k = 0; k < b.length; k += 7) x = Math.imul(x ^ b[k], 16777619) >>> 0; }
  return x.toString(16).padStart(8, '0');
}

export function manifestFor(h, bytes) {
  return { _doc: 'Stream B far-horizon manifest (tools/bake-horizon.mjs). Reader: js/rules/horizon-read.js; the server sends horizonRef(manifest, zoneId) in `joined`.', file: 'data/world/horizon.bin', bytes: bytes.length, hash: horizonHash(h), step: h.meta.step, width: h.meta.width, height: h.meta.height, zoneMetres: h.meta.zoneMetres, baked: h.meta.baked };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const t0 = performance.now();
  const h = bakeHorizon();
  const bytes = encodeHorizon(h);
  const man = manifestFor(h, bytes);
  const fb = join(WORLD_DIR, 'horizon.bin'), fj = join(WORLD_DIR, 'horizon.json');
  if (process.argv.includes('--check')) {
    let same = false;
    try { const old = JSON.parse(readFileSync(fj, 'utf8')); same = old.hash === man.hash && existsSync(fb) && horizonHash(parseHorizonLayers(readFileSync(fb))) === man.hash; } catch { same = false; }
    console.log(same ? 'horizon is up to date' : 'horizon is STALE — re-run without --check'); process.exit(same ? 0 : 1);
  }
  writeFileSync(fb, bytes); writeFileSync(fj, JSON.stringify(man, null, 1) + '\n');
  console.log(`wrote ${fb}: ${h.meta.width} x ${h.meta.height} at ${h.meta.step} m, ${h.meta.baked.length} baked zones exact, ${(bytes.length / 1024).toFixed(0)} KB, hash ${man.hash}, ${Math.round(performance.now() - t0)} ms`);
}

/** Decoded layers of a horizon.bin, in the shape horizonHash takes. */
export function parseHorizonLayers(bytes) { const p = parseHorizon(bytes); return { hq: p.layers.height, wq: p.layers.waterTop, biome: p.layers.biome }; }
