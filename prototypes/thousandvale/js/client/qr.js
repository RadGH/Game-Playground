// A small QR code encoder (play-test 12, #73: "show a QR code a phone can scan to sign in"). Written for Thousandvale,
// no third-party code and nothing fetched from a CDN. Byte mode only, error correction L / M / Q / H, versions 1-40,
// all eight masks scored with the standard penalty rules. It follows the ISO/IEC 18004 construction step by step; the
// layout of the code (function patterns, interleaving, placement) mirrors the well-known reference structure so it can
// be checked against any decoder (tests/G/qr.test.js decodes what it makes).
//
//   import { qrMatrix, qrSvg } from './qr.js';
//   const m = qrMatrix('https://example.com/?signin=…', { ecl: 'M' });   // { size, version, mask, dark(x, y) }
//   el.innerHTML = qrSvg('https://…', { ecl: 'M', px: 6 });              // a crisp SVG with a quiet zone
//
// Pure: no DOM (qrSvg returns a string), so node tests import it as-is.

const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT = [1, 0, 3, 2];
// codewords of error correction per block, and number of blocks — [ecl][version]
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Modules a version spends on data + error correction (everything but the function patterns). */
function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * NUM_BLOCKS[e][v];

// ---- Reed-Solomon over GF(256), polynomial 0x11D ----
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], f); }
  return r;
}

const utf8 = s => Array.from(new TextEncoder().encode(String(s)));

/**
 * The QR code for `text` as a module grid.
 * @param {string} text
 * @param {{ ecl?: 'L'|'M'|'Q'|'H', minVersion?: number, mask?: number }} [o]  mask: force one (0-7); default = the best by penalty
 */
export function qrMatrix(text, { ecl = 'M', minVersion = 1, mask = -1 } = {}) {
  const e = ECL[ecl] ?? 1;
  const bytes = utf8(text);
  // smallest version that holds it (byte mode: 4 bits mode + 8 or 16 bits length)
  let v = Math.max(1, minVersion | 0), cap = 0;
  for (; v <= 40; v++) { cap = dataCodewords(v, e) * 8; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
  if (v > 40) throw new Error('qr: text too long');
  // ---- data bits ----
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  // ---- blocks + error correction, interleaved ----
  const nb = NUM_BLOCKS[e][v], eccLen = ECC_PER_BLOCK[e][v], raw = Math.floor(rawModules(v) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += d.length;
    const ecc = rsRemainder(d, div);
    if (i < nShort) d.push(0);
    blocks.push(d.concat(ecc));
  }
  const words = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (i !== shortLen - eccLen || j >= nShort) words.push(blocks[j][i]);
  // ---- the grid ----
  const size = v * 4 + 17;
  const mod = Array.from({ length: size }, () => new Uint8Array(size));
  const fn = Array.from({ length: size }, () => new Uint8Array(size));
  const set = (x, y, d) => { mod[y][x] = d ? 1 : 0; fn[y][x] = 1; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // timing
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = [];
  if (v > 1) {
    const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6); for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p);
  }
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = m => {
    const d = (ECL_FORMAT[e] << 3) | m; let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = i => (b >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, 1);
  };
  format(0);                                                  // reserve the format area (rewritten once the mask is chosen)
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const d = (b >>> i) & 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // data, in the two-column zigzag from the bottom right
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < words.length * 8) { mod[y][x] = (words[i >>> 3] >>> (7 - (i & 7))) & 1; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] ^= 1; };
  let best = mask;
  if (best < 0 || best > 7) {
    let low = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); format(m); const p = penalty(mod, size); if (p < low) { low = p; best = m; } applyMask(m); }
  }
  applyMask(best); format(best);
  return { size, version: v, mask: best, ecl, modules: mod, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && mod[y][x] === 1 };
}

/** The standard penalty score (lower scans better). */
function penalty(mod, size) {
  let p = 0, dark = 0;
  const line = get => {
    let run = 1, s = 0, hist = [];
    for (let i = 0; i < size; i++) {
      const c = get(i);
      if (i && c === get(i - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s += 1; } else run = 1;
      hist.push(c);
    }
    const t = hist.join('');
    for (const pat of ['10111010000', '00001011101']) { let k = t.indexOf(pat); while (k >= 0) { s += 40; k = t.indexOf(pat, k + 1); } }
    return s;
  };
  for (let y = 0; y < size; y++) { p += line(x => mod[y][x]); for (let x = 0; x < size; x++) dark += mod[y][x]; }
  for (let x = 0; x < size; x++) p += line(y => mod[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
  const total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return p + Math.max(0, k) * 10;
}

/** An SVG string of the code: dark modules on a light square with a 4-module quiet zone. */
export function qrSvg(text, { ecl = 'M', px = 6, dark = '#111', light = '#fff', border = 4, label = 'QR code' } = {}) {
  const q = qrMatrix(text, { ecl });
  const n = q.size + border * 2;
  let path = '';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) path += `M${x + border} ${y + border}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * px}" height="${n * px}" shape-rendering="crispEdges" role="img" aria-label="${String(label).replace(/[<>&"]/g, '')}"><rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
