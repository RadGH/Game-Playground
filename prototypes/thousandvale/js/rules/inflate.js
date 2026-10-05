// Thousandvale — a small, pure DEFLATE decoder (stream B). RFC 1951 raw deflate, no zlib/gzip header.
//
// Why it exists: the zone bakes (terrain.bin / nav.bin, file version 2) are stored deflated so the
// province fits in git and downloads fast, and every reader — browser, server, Worker, node tests —
// must decode them SYNCHRONOUSLY through the same pure module (no DecompressionStream, no node:zlib,
// no library). Writers use node's zlib.deflateRawSync (tools/lib/zone-pack.mjs).
//
//   import { inflateRaw } from './inflate.js';
//   const out = inflateRaw(bytes, expectedLength);   // Uint8Array; throws on corrupt input or a wrong length
//
// Speed: ~60–120 MB/s in V8, so a 6 MB zone layer decodes in well under 100 ms.

const LEN_BASE = new Uint16Array([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]);
const LEN_EXTRA = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]);
const DIST_BASE = new Uint16Array([1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]);
const DIST_EXTRA = new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]);
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * A canonical Huffman decoding table as a flat lookup: `fast[bits & mask]` = (symbol << 4) | length for
 * every code up to MAXB bits (deflate codes are at most 15 bits, so one 2^15 table covers all of them).
 */
function buildTable(lengths, n) {
  let maxLen = 0;
  for (let i = 0; i < n; i++) if (lengths[i] > maxLen) maxLen = lengths[i];
  const table = new Int32Array(1 << Math.max(1, maxLen)).fill(-1);
  if (maxLen === 0) return { table, bits: 1 };
  const count = new Uint16Array(16), next = new Uint16Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  let code = 0;
  for (let b = 1; b <= 15; b++) { code = (code + count[b - 1]) << 1; next[b] = code; }
  for (let s = 0; s < n; s++) {
    const len = lengths[s];
    if (!len) continue;
    // deflate sends codes MSB first but we read bits LSB first, so index by the reversed code
    let c = next[len]++, r = 0;
    for (let k = 0; k < len; k++) { r = (r << 1) | (c & 1); c >>= 1; }
    for (let fill = r; fill < table.length; fill += 1 << len) table[fill] = (s << 4) | len;
  }
  return { table, bits: maxLen };
}

let FIXED_LIT = null, FIXED_DIST = null;
function fixedTables() {
  if (!FIXED_LIT) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    FIXED_LIT = buildTable(l, 288);
    FIXED_DIST = buildTable(new Uint8Array(30).fill(5), 30);
  }
  return [FIXED_LIT, FIXED_DIST];
}

/**
 * Decode raw DEFLATE bytes. `expected` (optional) is the exact output length: the output buffer is sized
 * once, and a stream that decodes to a different length throws — a truncated file is refused, never misread.
 * @param {Uint8Array} src
 * @param {number} [expected]
 * @returns {Uint8Array}
 */
export function inflateRaw(src, expected) {
  let out = new Uint8Array(expected > 0 ? expected : Math.max(1024, src.length * 4));
  let op = 0, ip = 0, bitBuf = 0, bitCnt = 0;
  const srcLen = src.length;
  const need = n => { while (bitCnt < n) { if (ip >= srcLen) { if (bitCnt === 0 || ip > srcLen + 4) throw new Error('inflate: unexpected end of data'); ip++; bitCnt += 8; } else { bitBuf |= src[ip++] << bitCnt; bitCnt += 8; } } };
  const bits = n => { need(n); const v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v; };
  const grow = min => { if (expected > 0) throw new Error('inflate: output longer than expected'); let n = out.length * 2; while (n < min) n *= 2; const o = new Uint8Array(n); o.set(out); out = o; };
  const sym = t => {
    need(t.bits);
    const e = t.table[bitBuf & ((1 << t.bits) - 1)];
    if (e < 0) throw new Error('inflate: bad Huffman code');
    const len = e & 15; bitBuf >>>= len; bitCnt -= len;
    return e >> 4;
  };

  let final = 0;
  while (!final) {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {                                     // stored block
      ip -= bitCnt >> 3; bitBuf = 0; bitCnt = 0;          // drop to a byte boundary; give back whole bytes read ahead
      if (ip + 4 > srcLen) throw new Error('inflate: unexpected end of data');
      const len = src[ip] | (src[ip + 1] << 8), nlen = src[ip + 2] | (src[ip + 3] << 8); ip += 4;
      if ((len ^ 0xffff) !== nlen) throw new Error('inflate: stored block length check failed');
      if (ip + len > srcLen) throw new Error('inflate: unexpected end of data');
      if (op + len > out.length) grow(op + len);
      out.set(src.subarray(ip, ip + len), op); op += len; ip += len;
      continue;
    }
    let lit, dist;
    if (type === 1) [lit, dist] = fixedTables();
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const clT = buildTable(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const s = sym(clT);
        if (s < 16) lens[i++] = s;
        else {
          let rep, val = 0;
          if (s === 16) { if (!i) throw new Error('inflate: repeat with no previous length'); val = lens[i - 1]; rep = 3 + bits(2); }
          else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > lens.length) throw new Error('inflate: code lengths overflow');
          lens.fill(val, i, i + rep); i += rep;
        }
      }
      lit = buildTable(lens.subarray(0, hlit), hlit);
      dist = buildTable(lens.subarray(hlit), hdist);
    } else throw new Error('inflate: bad block type');

    for (;;) {
      const s = sym(lit);
      if (s < 256) { if (op >= out.length) grow(op + 1); out[op++] = s; continue; }
      if (s === 256) break;
      const li = s - 257;
      if (li >= 29) throw new Error('inflate: bad length symbol');
      const len = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
      const di = sym(dist);
      if (di >= 30) throw new Error('inflate: bad distance symbol');
      const d = DIST_BASE[di] + (DIST_EXTRA[di] ? bits(DIST_EXTRA[di]) : 0);
      if (d > op) throw new Error('inflate: distance before the start');
      if (op + len > out.length) grow(op + len);
      if (d >= len) out.copyWithin(op, op - d, op - d + len);
      else for (let k = 0; k < len; k++) out[op + k] = out[op + k - d];
      op += len;
    }
  }
  if (ip - (bitCnt >> 3) > srcLen) throw new Error('inflate: unexpected end of data');
  if (expected > 0 && op !== expected) throw new Error(`inflate: decoded ${op} bytes, expected ${expected}`);
  return op === out.length ? out : out.slice(0, op);
}
