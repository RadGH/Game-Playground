// The wire format between a browser and the Tumblefair server: small JSON text frames, one message type per row.
// Everything a client sends is checked against CLIENT_MSGS before the room sees it (unknown type, unknown field,
// wrong type or too long -> the frame is dropped and counted). Pure: the server, the client and the tests import it.

export const PROTOCOL = 1;
export const TICK_MS = 50;
export const MAX_FRAME = 24 * 1024;
export const MAX_SEATS = 4;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';        // no I or O: they read as 1 and 0 on a TV across the room
export const CODE_LENGTH = 4;
export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A player's name: 1-14 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = s => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return n.length ? n : null; };

/**
 * Round 7 (owner 2026-10-22): players rate a minigame after playing it — 👍 or 👎, then any of these reasons. The ids
 * travel comma-separated in `rate.why`; anything not on the list is dropped. The labels are what the buttons say.
 */
export const RATE_REASONS = Object.freeze({
  up: [['fun', 'Fun'], ['funny', 'Funny'], ['exciting', 'Exciting'], ['teamwork', 'Good teamwork'], ['pretty', 'Looks great'], ['again', 'Play it again!'], ['buggy', 'But buggy'], ['unfair', 'But unfair']],      // a fun game can still be buggy (owner 2026-10-22)
  down: [['confusing', 'Confusing'], ['controls', 'Awkward controls'], ['hard', 'Too hard'], ['easy', 'Too easy'], ['long', 'Too long'], ['unfair', 'Unfair'], ['laggy', 'Laggy'], ['boring', 'Boring'], ['buggy', 'Buggy'], ['unplayable', 'Unplayable']],      // buggy / unplayable: owner 2026-10-22
});
export const cleanReasons = (v, why) => { const ok = new Set((v > 0 ? RATE_REASONS.up : RATE_REASONS.down).map(r => r[0])); return [...new Set(String(why || '').split(',').map(s => s.trim()).filter(id => ok.has(id)))].slice(0, 4); };

/** Input bits of an arena step. */
export const IN = Object.freeze({ A: 1, B: 2 });
/** The four seat colours (reference card: red / blue / green / magenta), with a shape each so colour is never the only cue. */
export const SEATS = Object.freeze([
  { id: 0, name: 'Red', color: '#ff4d4d', dark: '#a81f2a', shape: 'circle' },
  { id: 1, name: 'Blue', color: '#3d8bff', dark: '#1c4fb0', shape: 'square' },
  { id: 2, name: 'Green', color: '#3ecf5a', dark: '#1d8a37', shape: 'triangle' },
  { id: 3, name: 'Pink', color: '#f04fd8', dark: '#a02391', shape: 'diamond' },
]);

// field types: int, num, bool, str:N, obj (any JSON object, size-bounded by the frame), '?type' = optional
export const CLIENT_MSGS = Object.freeze({
  hello:   { fields: { v: 'int', token: '?str:64', name: '?str:32' }, rate: 2, burst: 4 },
  create:  { fields: {}, rate: 0.5, burst: 3 },
  join:    { fields: { code: 'str:8', display: '?bool' }, rate: 1, burst: 6 },
  leave:   { fields: {}, rate: 1, burst: 3 },
  profile: { fields: { name: '?str:32', look: '?obj' }, rate: 4, burst: 12 },
  ready:   { fields: { on: 'bool' }, rate: 4, burst: 8 },
  opt:     { fields: { key: 'str:24', value: 'obj|num|str:64|bool' }, rate: 6, burst: 12 },
  start:   { fields: {}, rate: 1, burst: 3 },
  end:     { fields: {}, rate: 1, burst: 3 },                       // host: back to the lobby
  kick:    { fields: { pid: 'int' }, rate: 1, burst: 4 },
  roll:    { fields: {}, rate: 3, burst: 6 },
  choose:  { fields: { i: 'int' }, rate: 4, burst: 8 },
  vote:    { fields: { i: 'int' }, rate: 4, burst: 8 },
  skip:    { fields: {}, rate: 2, burst: 6 },                        // "I have read the rules" on an intro / results card
  in:      { fields: { s: 'int', mx: 'num', mz: 'num', b: 'int' }, rate: 30, burst: 60 },
  act:     { fields: { a: 'str:24', d: '?obj|num|str:400|bool' }, rate: 30, burst: 90 },
  buy:     { fields: { id: 'str:40' }, rate: 2, burst: 6 },
  equip:   { fields: { id: 'str:40' }, rate: 4, burst: 12 },
  emote:   { fields: { e: 'str:16' }, rate: 2, burst: 5 },
  ping:    { fields: { at: 'num' }, rate: 2, burst: 6 },
  rate:    { fields: { game: 'str:40', v: 'int', why: '?str:120' }, rate: 2, burst: 10 },   // round 7: 👍/👎 a minigame you played (+ reasons)
  rooms:   { fields: {}, rate: 1, burst: 4 },                         // round 7: the public games list
});

function typeOk(v, type) {
  for (const t of type.split('|')) {
    if (t === 'int' && Number.isInteger(v)) return true;
    if (t === 'num' && typeof v === 'number' && Number.isFinite(v)) return true;
    if (t === 'bool' && typeof v === 'boolean') return true;
    if (t === 'obj' && v && typeof v === 'object') return true;
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
