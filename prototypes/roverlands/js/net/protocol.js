// Roverlands online: the wire between a browser and the room (the server's, or the page's own loopback for solo play).
// Small JSON text frames both ways. Every frame a browser sends is checked here field by field before a room sees it:
// unknown type, unknown field, wrong type, a number that is not finite or is absurdly large, an array that is too long
// — and the frame is dropped (and counted). Each message type also has its own rate (a token bucket per socket).
// Pure: the server, the browser, the loopback and the tests all import it. Contract: docs/PLAN.md "Net contract"
// (+ "Net contract additions").

export const PROTOCOL = 1;
export const MAX_FRAME = 24 * 1024;           // one client frame (a `pos` with 24 bodies is ~5 KB)
export const MAX_PLAYERS = 12;                // people with a seat in the world, per room (spectators extra, up to MAX_WATCHERS)
export const MAX_WATCHERS = 8;
export const MAX_ENTS = 96;                   // bodies in a room (parked + spawned)
export const MAX_SPAWNED_EACH = 4;            // sandbox: vehicles one player may have put down at once
export const STATE_HZ = 20;                   // the room sends `state` 20 times a second
export const POS_HZ = 20;                     // a client sends `pos` up to 20 times a second
export const SEAT_RANGE = 6;                  // metres: how close you must be to a body to get a seat in it
export const MIN_RUN_MS = 10_000;            // a Flag Run shorter than this records no time (it cannot be real)
export const FLAG_RANGE = 3;                  // metres: how close (on foot) to take the flag
export const GONE_RUN_MS = 90_000;            // a dropped player keeps their seat this long while driving...
export const GONE_LOBBY_MS = 5 * 60_000;      // ...and this long in the lobby
export const EMPTY_ROOM_MS = 5 * 60_000;      // a room with nobody connected stays open this long
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I or O (they read as 1 and 0 across a room)
export const CODE_LENGTH = 4;
export const WORLD_LIMIT = 5000;              // |coordinate| above this is junk (the world is 1536 m across)

export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A player's name: 1-14 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = s => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return n.length ? n : null; };
/** Free text (a rating's "tell us more"): no control characters, at most n characters. */
export const cleanText = (s, n = 400) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);

/**
 * A look from a browser, made safe to pass on to every other browser: a plain JSON object, at most 4 KB, at most 5
 * levels deep, short strings, finite numbers, no prototype keys (the same rule as Knockabout's). The renderer builds
 * whatever parts it knows from it and ignores the rest, so the server does not need to know the part lists.
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

/**
 * Vehicle ratings (game-standards §5: reasons say WHAT kind of good or bad). ids go on the wire; labels are the
 * player-facing words (js/client/ui/rating.js shows them).
 */
export const RATE_REASONS = Object.freeze({
  up: [['grippy', 'Grippy'], ['jumps', 'Fun to jump'], ['fast', 'Fast'], ['heavy', 'Feels heavy (good)'], ['mud', 'Good on mud']],
  down: [['floaty', 'Floaty'], ['slides', 'Slides too much'], ['slow', 'Too slow'], ['flips', 'Flips too easily'], ['stuck', 'Stuck easily'], ['steer', 'Hard to steer'], ['buggy', 'Buggy']],
});
export const cleanReasons = (up, list) => {
  const ok = new Set((up ? RATE_REASONS.up : RATE_REASONS.down).map(r => r[0]));
  return [...new Set((Array.isArray(list) ? list : String(list || '').split(',')).map(s => String(s).trim()).filter(id => ok.has(id)))].slice(0, 6);
};

// ---------------------------------------------------------------------------------------------------- field checks
const num = v => typeof v === 'number' && Number.isFinite(v);
const coord = v => num(v) && Math.abs(v) <= WORLD_LIMIT;
const small = v => num(v) && Math.abs(v) <= 1e6;
export const isV3 = v => Array.isArray(v) && v.length === 3 && v.every(coord);
const isV3s = v => Array.isArray(v) && v.length === 3 && v.every(small);
const isQ = v => Array.isArray(v) && v.length === 4 && v.every(x => num(x) && Math.abs(x) <= 1.01);
const isId = v => Number.isInteger(v) && v >= 0 && v < 1e7;
/** Me = { p:[x,y,z], yaw, a: animId, on?: entId, rel?:[x,y,z], ryaw?, seat?: [entId, seatIdx], rag?: 1 } */
export function isMe(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  for (const k of Object.keys(m)) if (!ME_KEYS.has(k)) return false;
  if (!isV3(m.p) || !num(m.yaw)) return false;
  if (m.a != null && !(Number.isInteger(m.a) && m.a >= 0 && m.a < 256) && !(typeof m.a === 'string' && m.a.length <= 24)) return false;
  if (m.on != null && !isId(m.on)) return false;
  if (m.rel != null && !isV3(m.rel)) return false;
  if (m.ryaw != null && !num(m.ryaw)) return false;
  if (m.seat != null && !(Array.isArray(m.seat) && m.seat.length === 2 && isId(m.seat[0]) && Number.isInteger(m.seat[1]) && m.seat[1] >= 0 && m.seat[1] < 16)) return false;
  if (m.rag != null && m.rag !== 1 && m.rag !== 0) return false;
  if (m.rq != null && !isQ(m.rq)) return false;           // a tumbling body's rotation (thrown out of a vehicle)
  return true;
}
const ME_KEYS = new Set(['p', 'yaw', 'a', 'on', 'rel', 'ryaw', 'seat', 'rag', 'rq']);
const ENT_KEYS = new Set(['id', 'p', 'q', 'v', 'w', 'x']);
/** Ent = { id, p:[x,y,z], q:[x,y,z,w], v:[x,y,z], w:[x,y,z], x?: [numbers] } */
export function isEnt(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  for (const k of Object.keys(e)) if (!ENT_KEYS.has(k)) return false;
  if (!isId(e.id) || !isV3(e.p) || !isQ(e.q)) return false;
  if (e.v != null && !isV3s(e.v)) return false;
  if (e.w != null && !isV3s(e.w)) return false;
  if (e.x != null && !(Array.isArray(e.x) && e.x.length <= 32 && e.x.every(small))) return false;
  return true;
}

// field types: int, num, bool, str:N, v3, v2, id, me, ents, look, list:N (array of short strings), '?type' = optional,
// 'a|b' = either. A message's `rate` is how many a second it may come, `burst` how many in a row.
export const CLIENT_MSGS = Object.freeze({
  // ---- the front desk (server/hub.js; the loopback answers the same way)
  hello:   { fields: { v: 'int', token: '?str:64', ticket: '?str:200' }, rate: 2, burst: 4 },
  create:  { fields: { mode: 'str:10', public: '?bool', start: '?bool', seed: '?int', flagId: '?str:40', name: '?str:40', look: '?look' }, rate: 0.5, burst: 3 },
  join:    { fields: { code: 'str:8', spectate: '?bool', name: '?str:40', look: '?look' }, rate: 1, burst: 6 },
  leave:   { fields: {}, rate: 1, burst: 3 },
  // ---- the room (js/net/room-core.js)
  me:      { fields: { name: '?str:40', look: '?look' }, rate: 2, burst: 6 },            // my name / look changed
  opt:     { fields: { key: 'str:16', value: 'str:40|bool|int' }, rate: 6, burst: 12 },  // host, lobby: mode / public / flagId
  start:   { fields: {}, rate: 1, burst: 3 },                                            // host: lobby -> driving
  kick:    { fields: { pid: 'int' }, rate: 1, burst: 4 },                                // host: remove a player (they stay out)
  votekick:{ fields: { pid: 'int', on: '?bool' }, rate: 1, burst: 4 },                   // anyone: vote to remove a player
  pos:     { fields: { me: 'me', ents: '?ents' }, rate: 25, burst: 40 },
  seat:    { fields: { id: 'id', seat: 'int' }, rate: 4, burst: 8 },
  unseat:  { fields: { thrown: '?int' }, rate: 4, burst: 8 },
  spawn:   { fields: { kind: 'str:32', p: 'v3', yaw: 'num' }, rate: 1, burst: 3 },
  own:     { fields: { id: 'id' }, rate: 10, burst: 20 },
  give:    { fields: { id: 'id', to: 'int' }, rate: 5, burst: 10 },
  bump:    { fields: { id: 'id', j: 'v3', at: 'v3' }, rate: 30, burst: 40 },
  break:   { fields: { obj: 'id', dir: 'v3', speed: 'num' }, rate: 30, burst: 60 },
  flag:    { fields: { act: 'str:6', p: 'v3' }, rate: 3, burst: 6 },
  fire:    { fields: { id: 'id', p: 'v3', d: 'v3', kind: '?str:24' }, rate: 12, burst: 20 },
  horn:    { fields: { id: 'id' }, rate: 2, burst: 4 },
  cut:     { fields: { cells: 'ids:400' }, rate: 6, burst: 12 },   // wheat the harvester cut (world sample indexes)
  act:     { fields: { id: 'id', what: 'str:16', on: '?bool' }, rate: 6, burst: 12 },   // a seat's switch: siren, lights, ladder…
  crash:   { fields: { id: 'id', v: 'v3' }, rate: 2, burst: 3 },                         // owner: my open vehicle crashed hard (riders react)
  pin:     { fields: { p: '?v2' }, rate: 2, burst: 5 },                                  // my map pin (null clears it)
  rate:    { fields: { what: 'str:32', up: 'bool', reasons: '?list:8', note: '?str:400' }, rate: 0.5, burst: 4 },
  reset:   { fields: { flagId: '?str:40' }, rate: 0.5, burst: 2 },                       // host: a new run
  ping:    { fields: { c: 'num' }, rate: 2, burst: 6 },
});

function typeOk(v, type) {
  for (const t of type.split('|')) {
    if (t === 'int' && Number.isInteger(v) && Math.abs(v) < 2 ** 31) return true;
    if (t === 'id' && isId(v)) return true;
    if (t === 'num' && num(v) && Math.abs(v) <= 1e6) return true;
    if (t === 'bool' && typeof v === 'boolean') return true;
    if (t === 'v3' && isV3(v)) return true;
    if (t === 'v2' && Array.isArray(v) && v.length === 2 && v.every(coord)) return true;
    if (t === 'me' && isMe(v)) return true;
    if (t === 'ents' && Array.isArray(v) && v.length <= 24 && v.every(isEnt)) return true;
    if (t === 'look' && v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length <= 4096) return true;
    if (t.startsWith('ids:') && Array.isArray(v) && v.length <= +t.slice(4) && v.every(isId)) return true;
    if (t.startsWith('list:') && Array.isArray(v) && v.length <= +t.slice(5) && v.every(s => typeof s === 'string' && s.length <= 24)) return true;
    if (t.startsWith('str:') && typeof v === 'string' && v.length <= +t.slice(4)) return true;
  }
  return false;
}
/** null when the message is well formed, else a short reason. */
export function validate(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return 'shape';
  if (!Object.prototype.hasOwnProperty.call(CLIENT_MSGS, msg.t)) return 'type';
  const spec = CLIENT_MSGS[msg.t];
  for (const k of Object.keys(msg)) if (k !== 't' && !(k in spec.fields)) return 'extra:' + k;
  for (const [k, type] of Object.entries(spec.fields)) {
    const opt = type[0] === '?', v = msg[k];
    if (v === undefined || v === null) { if (opt) continue; return 'field:' + k; }
    if (!typeOk(v, opt ? type.slice(1) : type)) return 'field:' + k;
  }
  return null;
}
/** A text frame -> { msg } or { bad: reason }. */
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
export const MODES = Object.freeze(['flag', 'sandbox']);
