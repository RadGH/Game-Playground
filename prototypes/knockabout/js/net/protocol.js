// Knockabout online: the wire between a browser and the server. Small JSON text frames from the browser (checked
// field by field against CLIENT_MSGS before a room sees them — unknown type, unknown field, wrong type or too long and
// the frame is dropped and counted), JSON text + binary snapshot frames (js/net/pack.js) back. Pure: the server, the
// browser and the tests all import it. Modelled on Tumblefair's js/shared/protocol.js.

export const PROTOCOL = 1;
export const STEP_HZ = 60;                    // the server steps every match at 60 a second (the sim's own step)
export const SNAP_EVERY = 2;                  // ...and sends a snapshot every 2nd step: 30 a second
export const MAX_FRAME = 16 * 1024;
export const MAX_FIGHTERS = 8;                // per room, people + CPUs (goons in Waves do not count)
export const MAX_LOCAL = 4;                   // players one device may bring (pads + keyboard halves + its touch screen)
export const GONE_MS = 60000;                 // a dropped device keeps its players this long
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I or O (they read as 1 and 0 across a room)
export const CODE_LENGTH = 4;
export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A fighter's name: 1-14 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = s => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return n.length ? n : null; };

/**
 * A look from a browser, made safe to pass on to every other browser: a plain JSON object, at most 4 KB, at most 5
 * levels deep, short strings, finite numbers, no prototype keys. The renderer builds whatever parts it knows from it
 * (js/client/look.js avatarOf) and ignores the rest, so the server does not need to know the part lists.
 */
export function cleanLook(look) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
  const walk = (v, d) => {
    if (d > 5) return undefined;
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.slice(0, 60);
    if (Array.isArray(v)) return v.slice(0, 24).map(x => walk(x, d + 1)).filter(x => x !== undefined);
    if (typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 40)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k.length > 32) continue; const x = walk(v[k], d + 1); if (x !== undefined) o[k] = x; }
      return o;
    }
    return undefined;
  };
  const out = walk(look, 0);
  return out && JSON.stringify(out).length <= 4096 ? out : null;
}

/** Ratings: the same reasons the couch game offers (js/client/report.js RATE_REASONS). Buggy + Unfair on both thumbs. */
export const RATE_IDS = Object.freeze({ up: ['fun', 'funny', 'again', 'buggy', 'unfair'], down: ['boring', 'confusing', 'hard', 'laggy', 'unplayable', 'buggy', 'unfair'] });
export const cleanReasons = (v, why) => { const ok = new Set(v > 0 ? RATE_IDS.up : RATE_IDS.down); return [...new Set(String(why || '').split(',').map(s => s.trim()).filter(id => ok.has(id)))].slice(0, 5); };

/** Held input as one integer (the browser sends `b`, the room turns it back into the sim's held object). */
export const BITS = Object.freeze({ jump: 1, grabL: 2, grabR: 4, raiseL: 8, raiseR: 16, duck: 32 });
export const toBits = h => { let b = 0; for (const [k, v] of Object.entries(BITS)) if (h?.[k]) b |= v; return b; };
export const fromBits = (b, mx = 0, mz = 0) => ({ mx, mz, jump: !!(b & 1), grabL: !!(b & 2), grabR: !!(b & 4), raiseL: !!(b & 8), raiseR: !!(b & 16), duck: !!(b & 32) });

// field types: int, num, bool, str:N, obj, arr, '?type' = optional, 'a|b' = either
export const CLIENT_MSGS = Object.freeze({
  hello:  { fields: { v: 'int', token: '?str:64' }, rate: 2, burst: 4 },
  create: { fields: { public: '?bool' }, rate: 0.5, burst: 3 },
  join:   { fields: { code: 'str:8' }, rate: 1, burst: 6 },
  leave:  { fields: {}, rate: 1, burst: 3 },
  rooms:  { fields: {}, rate: 1, burst: 4 },
  // this device's local players: [{ local: 0..3, name, look }] — the whole list each time (add / remove / rename)
  locals: { fields: { list: 'arr' }, rate: 4, burst: 10 },
  ready:  { fields: { local: 'int', on: 'bool' }, rate: 6, burst: 12 },
  opt:    { fields: { key: 'str:24', value: 'num|str:40|bool' }, rate: 8, burst: 16 },      // host only
  cpu:    { fields: { add: '?bool', pid: '?int', level: '?str:8' }, rate: 4, burst: 10 },  // host only: add / remove / level
  team:   { fields: { pid: 'int' }, rate: 6, burst: 12 },                                  // host, or the player's own device
  start:  { fields: {}, rate: 1, burst: 3 },                                                // host only
  end:    { fields: {}, rate: 1, burst: 3 },                                                // host only: back to the room
  // held input of this device's players: p = [[local, mx, mz, bits], …]
  in:     { fields: { p: 'arr' }, rate: 70, burst: 120 },
  rate:   { fields: { v: 'int', why: '?str:120' }, rate: 2, burst: 8 },
  vote:   { fields: { local: 'int', i: 'int' }, rate: 6, burst: 16 },
  go:     { fields: {}, rate: 1, burst: 3 },                                                // host: finish the vote now
  ping:   { fields: { at: 'num' }, rate: 2, burst: 6 },
});

function typeOk(v, type) {
  for (const t of type.split('|')) {
    if (t === 'int' && Number.isInteger(v)) return true;
    if (t === 'num' && typeof v === 'number' && Number.isFinite(v)) return true;
    if (t === 'bool' && typeof v === 'boolean') return true;
    if (t === 'obj' && v && typeof v === 'object' && !Array.isArray(v)) return true;
    if (t === 'arr' && Array.isArray(v) && v.length <= 16) return true;
    if (t.startsWith('str:') && typeof v === 'string' && v.length <= +t.slice(4)) return true;
  }
  return false;
}
/** null when the message is well formed, else a short reason. */
export function validate(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return 'shape';
  const spec = CLIENT_MSGS[msg.t];
  if (!spec) return 'type';
  for (const k of Object.keys(msg)) if (k !== 't' && !(k in spec.fields)) return 'extra:' + k;
  for (const [k, type] of Object.entries(spec.fields)) {
    const opt = type[0] === '?', v = msg[k];
    if (v === undefined || v === null) { if (opt) continue; return 'field:' + k; }
    if (!typeOk(v, opt ? type.slice(1) : type)) return 'field:' + k;
  }
  return null;
}
export function parseFrame(data) {
  if (typeof data !== 'string') return { bad: 'binary' };
  if (data.length > MAX_FRAME) return { bad: 'size' };
  let msg; try { msg = JSON.parse(data); } catch { return { bad: 'json' }; }
  const why = validate(msg);
  return why ? { bad: why } : { msg };
}
/** A token bucket per message type for one socket: take(type) is false when that type is being sent too fast. */
export function createBuckets(now) {
  const b = new Map();
  return { take(type) {
    const spec = CLIENT_MSGS[type]; if (!spec) return false;
    const t = now(); let s = b.get(type); if (!s) { s = { n: spec.burst, at: t }; b.set(type, s); }
    s.n = Math.min(spec.burst, s.n + (t - s.at) / 1000 * spec.rate); s.at = t;
    if (s.n < 1) return false; s.n -= 1; return true;
  } };
}
