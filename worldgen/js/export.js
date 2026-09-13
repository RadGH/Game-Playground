// Saving and loading a world.
//
//   import { toJSON, fromJSON, toPNG, download } from './export.js';
//   const json = toJSON(world);              // compact: typed arrays as base64 strings
//   const world2 = fromJSON(json);           // the same world, arrays rebuilt
//
// The grid layers dominate the size (a 256×128 world is ~33k cells), so they go out as base64 rather
// than as arrays of numbers — roughly a quarter of the size and much faster to parse. Pass
// { arrays: 'plain' } if you want a file a human can read.

const FLOAT_LAYERS = ['elevation', 'temperature', 'moisture', 'flow', 'aura', 'magic', 'slope'];
const BYTE_LAYERS = ['biome', 'water', 'river', 'volcanic', 'roadCells', 'passCells'];
const SHORT_LAYERS = ['region', 'continentOf'];
/** Layers that are cheap to recompute or only useful during generation — not saved. */
const SKIP = ['filled', 'down', 'habitability', 'seaId', '_namer'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 for bytes, without Buffer or btoa, so the same code runs in node, a worker and a page. */
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}
export function base64ToBytes(str) {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    if (p < len) out[p++] = (n >> 16) & 255;
    if (p < len) out[p++] = (n >> 8) & 255;
    if (p < len) out[p++] = n & 255;
  }
  return out;
}
const packTyped = arr => bytesToBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
const unpackTyped = (str, Type) => { const bytes = base64ToBytes(str); const copy = new Uint8Array(bytes.length); copy.set(bytes); return new Type(copy.buffer); };

/**
 * A world as a plain JSON-safe object.
 * opts: { arrays: 'base64' (default) | 'plain', layers: [names] to keep, lists: true }
 */
export function toJSON(world, opts = {}) {
  const arrays = opts.arrays || 'base64';
  const out = {
    schema: 1, kind: 'world', format: arrays,
    seed: world.seed, width: world.width, height: world.height, method: world.method,
    opts: world.opts, stats: world.stats, era: world.era || null,
    layers: {},
  };
  const want = new Set(opts.layers || [...FLOAT_LAYERS, ...BYTE_LAYERS, ...SHORT_LAYERS]);
  const pack = (name, arr, type) => {
    if (!arr || !want.has(name) || SKIP.includes(name)) return;
    out.layers[name] = arrays === 'plain' ? { type, data: Array.from(arr) } : { type, b64: packTyped(arr) };
  };
  for (const n of FLOAT_LAYERS) pack(n, world[n], 'f32');
  for (const n of BYTE_LAYERS) pack(n, world[n], 'u8');
  for (const n of SHORT_LAYERS) pack(n, world[n], 'i16');

  out.regions = world.regions.map(r => ({ ...r, nodes: [...r.nodes] }));
  out.nodes = world.nodes.map(n => ({ ...n }));
  out.roads = world.roads.map(r => ({ ...r, cells: Array.from(r.cells) }));
  out.seaLanes = (world.seaLanes || []).map(r => ({ ...r, cells: Array.from(r.cells) }));
  out.rivers = world.rivers.map(r => ({ ...r, cells: Array.from(r.cells) }));
  out.lakes = world.lakes; out.seas = world.seas; out.ranges = world.ranges; out.forests = world.forests;
  out.continents = world.continents.map(c => ({ ...c }));
  out.history = world.history || [];
  out.plates = world.plates || null;
  return out;
}

/** Rebuild a world from toJSON output. The result works with every function in this folder. */
export function fromJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const world = {
    schema: 1, kind: 'world', seed: data.seed, width: data.width, height: data.height, method: data.method,
    opts: data.opts, stats: data.stats, era: data.era || null,
    regions: data.regions || [], nodes: data.nodes || [], roads: (data.roads || []).map(r => ({ ...r, cells: Int32Array.from(r.cells) })),
    seaLanes: (data.seaLanes || []).map(r => ({ ...r, cells: Int32Array.from(r.cells) })),
    rivers: (data.rivers || []).map(r => ({ ...r, cells: Int32Array.from(r.cells) })),
    lakes: data.lakes || [], seas: data.seas || [], ranges: data.ranges || [], forests: data.forests || [],
    continents: data.continents || [], history: data.history || [], plates: data.plates || null,
  };
  const TYPES = { f32: Float32Array, u8: Uint8Array, i16: Int16Array, i32: Int32Array };
  for (const [name, layer] of Object.entries(data.layers || {})) {
    const Type = TYPES[layer.type] || Float32Array;
    world[name] = layer.b64 ? unpackTyped(layer.b64, Type) : Type.from(layer.data);
  }
  if (!world.slope) world.slope = new Float32Array(world.width * world.height);
  if (!world.volcanic) world.volcanic = new Uint8Array(world.width * world.height);
  return world;
}

/** Rough size of a saved world, in kilobytes — handy for the viewer's export button. */
export function jsonSizeKB(world, opts) { return Math.round(JSON.stringify(toJSON(world, opts)).length / 1024); }

/**
 * Render the map to a PNG data URL (browser only — it needs a canvas).
 * opts are passed to renderWorld, plus { scale = 4, width, height }.
 */
export async function toPNG(world, renderWorld, opts = {}) {
  const scale = opts.scale || 4;
  const W = opts.width || world.width * scale, H = opts.height || world.height * scale;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  renderWorld(ctx, world, { ...opts, scale });
  if (canvas.convertToBlob) return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
  return canvas.toDataURL('image/png');
}

/** Kick off a browser download of any blob-able content. */
export function download(content, filename, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 0)], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
