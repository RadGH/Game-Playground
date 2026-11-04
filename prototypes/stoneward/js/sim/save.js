// Saving and loading a world. PURE (no storage here — the page puts the result in IndexedDB).
// A save holds the settings (to regenerate the planet exactly), the clock, the sim state (towns,
// buildings, people… plain JSON) and ONLY the chunks the game has changed, each as one run-length
// encoded byte string. An untouched X-large planet costs nothing to save.

import { LAYERS, CH } from '../planet/chunkgen.js';

export const SAVE_VERSION = 1;

/** Run-length encode bytes: pairs of (count 1..255, value). */
export function rle(bytes) {
  const out = []; let k = 0;
  while (k < bytes.length) { const v = bytes[k]; let n = 1; while (k + n < bytes.length && bytes[k + n] === v && n < 255) n++; out.push(n, v); k += n; }
  return Uint8Array.from(out);
}
export function unrle(data, len) {
  const out = new Uint8Array(len); let o = 0;
  for (let k = 0; k < data.length; k += 2) { out.fill(data[k + 1], o, o + data[k]); o += data[k]; }
  return out;
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

function packChunk(c) {
  const n = CH * CH;
  const all = new Uint8Array(n * (LAYERS.length + 2));
  LAYERS.forEach((k, j) => all.set(c[k], j * n));
  const part = new Uint8Array(c.part.buffer.slice(0));   // Uint16 as bytes
  all.set(part, LAYERS.length * n);
  return { cx: c.cx, cy: c.cy, d: b64(rle(all)) };
}
function unpackChunk(p, blank) {
  const n = CH * CH;
  const all = unrle(unb64(p.d), n * (LAYERS.length + 2));
  const c = blank(p.cx, p.cy);
  LAYERS.forEach((k, j) => c[k].set(all.subarray(j * n, (j + 1) * n)));
  c.part = new Uint16Array(all.slice(LAYERS.length * n).buffer);
  return c;
}

export function saveSim(sim, settings) {
  return {
    v: SAVE_VERSION, at: Date.now(), settings, tick: sim.tick, wind: sim.wind,
    state: JSON.parse(JSON.stringify(sim.state)),
    chunks: sim.store.edited().map(packChunk),
  };
}

/** Put a save's chunks and state into a freshly made sim (same settings → same planet). */
export function loadInto(sim, save, blank) {
  sim.tick = save.tick; sim.wind = save.wind;
  for (const p of save.chunks) {
    const c = unpackChunk(p, blank);
    c.version = 1; c.dirty = false;
    sim.store.restore(c);
  }
  sim.state = save.state;
}
