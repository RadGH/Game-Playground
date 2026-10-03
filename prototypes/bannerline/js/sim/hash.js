// FNV-1a hashing for the lockstep desync check and the data-version check.
//
//   hashValue(state)  walks plain data in key insertion order (state is built by deterministic code,
//                     and JSON snapshots keep key order), quantising numbers to 1/1000 so positions
//                     that differ only below a millimetre do not count. Keys starting with '$' are
//                     skipped (none in M1; reserved for caches).
//   hashCanonical(o)  hashes JSON with keys sorted — for data files, whose key order we do not control.

import { sorted } from './order.js';

const P = 0x01000193;

function mix(h, x) {
  h ^= x & 0xff; h = Math.imul(h, P);
  h ^= (x >>> 8) & 0xff; h = Math.imul(h, P);
  h ^= (x >>> 16) & 0xff; h = Math.imul(h, P);
  h ^= (x >>> 24) & 0xff; h = Math.imul(h, P);
  return h >>> 0;
}

function mixStr(h, s) {
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h ^= c & 0xff; h = Math.imul(h, P); h ^= c >>> 8; h = Math.imul(h, P); }
  return h >>> 0;
}

function mixNum(h, v) {
  if (v !== v) return mix(h, 0x7fc00000);            // NaN (should never happen; still hashes the same)
  if (v === Infinity) return mix(h, 0x7f800000);
  if (v === -Infinity) return mix(h, 0xff800000);
  const q = Math.round(v * 1000);
  const hi = Math.floor(q / 4294967296);
  const lo = q - hi * 4294967296;
  return mix(mix(h, lo >>> 0), hi | 0);
}

function walk(h, v) {
  if (v === null || v === undefined) return mix(h, 0xa1);
  switch (typeof v) {
    case 'number': return mixNum(mix(h, 0xa2), v);
    case 'boolean': return mix(h, v ? 0xa3 : 0xa4);
    case 'string': return mixStr(mix(h, 0xa5), v);
    case 'object':
      if (Array.isArray(v)) {
        h = mix(h, 0xa6 ^ (v.length << 8));
        for (let i = 0; i < v.length; i++) h = walk(h, v[i]);
        return h;
      } else {
        h = mix(h, 0xa7);
        for (const k in v) {   // eslint-disable-line guard-for-in -- plain data, insertion order
          if (k.charCodeAt(0) === 36) continue;   // '$'
          h = mixStr(h, k);
          h = walk(h, v[k]);
        }
        return h;
      }
    default: return h;
  }
}

/** uint32 hash of plain data (insertion order, numbers quantised to 1/1000). */
export function hashValue(v) { return walk(0x811c9dc5, v); }

/** Canonical JSON with sorted keys (used for the data hash). */
export function canonicalJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  return '{' + sorted(Object.keys(v)).map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
}

/** uint32 FNV-1a of a string. */
export function hashString(s) { return mixStr(0x811c9dc5, s); }

/** Hash of data with keys sorted. */
export function hashCanonical(v) { return hashString(canonicalJSON(v)); }
