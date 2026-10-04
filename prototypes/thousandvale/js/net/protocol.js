// Thousandvale wire protocol (stream A, shared ★). The machine-readable copy of docs/protocol.md.
// Pure: no DOM, no Node APIs. Imported by the server sim (js/sim), the client (js/net/client.js),
// bots and tests.
//
//   validate(t, msg)   -> null if fine, else a short reason string ('type', 'field:x', 'extra:y', ...)
//   parseFrame(str)    -> { msg } | { bad: reason }   (JSON text frame -> validated message)
//   createBuckets()    -> per-socket rate limiter: take(t) -> true if allowed

export const PROTOCOL_VERSION = 2;
export const SNAP_VERSION = 1;
export const TICK_MS = 50;
export const MAX_FRAME = 16 * 1024;

export const KIND = Object.freeze({ player: 1, monster: 2, npc: 3, object: 4 });
/** Join codes reuse Bannerline's alphabet (no I/O, no digits). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 5;
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c.length !== CODE_LENGTH || [...c].some(ch => !CODE_ALPHABET.includes(ch))) return null;
  return c;
}

export const KIND_NAMES = Object.freeze(['', 'player', 'monster', 'npc', 'object']);

/** Animation names; index = wire id. APPEND ONLY. */
export const ANIMS = Object.freeze(['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'swim',
  'attack', 'attack2', 'cast', 'channel', 'hit', 'die', 'dead',
  'bite', 'howl', 'emote', 'interact']);
export const ANIM_ID = Object.freeze(Object.fromEntries(ANIMS.map((n, i) => [n, i])));

export const STATE = Object.freeze({ dead: 1, combat: 2, casting: 4, airborne: 8, swimming: 16, sprinting: 32, elite: 64, friendly: 128 });
export const IN = Object.freeze({ SPRINT: 1, JUMP: 2 });

/** Snapshot record mask bits (docs/protocol.md §4). */
export const F = Object.freeze({ POS: 1, Y: 2, YAW: 4, HP: 8, ANIM: 16, STATE: 32, TARGET: 64, FULL: 128 });
export const NO_TARGET = 0xFFFF;

/** Close/kick/err codes with plain-language text the client can show as is. */
export const CODES = Object.freeze({
  version: 'A new version is out. Reload the page.',
  build: 'The server was updated. Reload the page.',
  full: 'The world is full right now. Try again in a minute.',
  banned: 'This account is banned.',
  auth: 'That login did not work.',
  name: 'That name is taken or not allowed.',
  cls: 'Unknown class.',
  ticket: 'Your entry pass expired. Reconnecting.',
  state: 'Not now.',
  elsewhere: 'You logged in somewhere else.',
  abuse: 'Too many bad messages.',
  restart: 'The server is restarting. Back in a moment.',
  idle: 'Disconnected for being idle.',
  party: 'Party action not possible.',
  partyFull: 'That party is full.',
  noCode: 'No party with that code.',
  notFound: 'Nobody by that name is online.',
  muted: 'You are muted.',
  item: 'You do not have that item.',
  far: 'Too far away.',
  bagFull: 'Your bag is full.',
  human: 'Please finish the "are you human" check.',
  tooMany: 'Too many new accounts from your network. Try again later.',
  trade: 'Trade not possible.',
  tradeBusy: 'One of you is already trading.',
  tradeFar: 'Too far apart to trade.',
  tradeFailed: 'The trade did not go through. Nothing changed hands.',
  busy: 'Busy, try again in a moment.',
});

// ---- field types -------------------------------------------------------------------------------
const isInt = v => Number.isSafeInteger(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
function check(type, v) {
  if (type === 'int') return isInt(v);
  if (type === 'num') return isNum(v);
  if (type === 'bool') return v === true || v === false;
  if (type === 'id') return isInt(v) && v >= 0 && v <= 0xFFFF;
  if (type === 'vec2') return v !== null && typeof v === 'object' && !Array.isArray(v) && isNum(v.x) && isNum(v.z) && Object.keys(v).length === 2;
  if (type === 'obj') return v !== null && typeof v === 'object' && !Array.isArray(v);
  if (type === 'uids') return Array.isArray(v) && v.length <= 12 && v.every(u => typeof u === 'string' && u.length <= 40);
  if (type.startsWith('str:')) return typeof v === 'string' && v.length <= +type.slice(4);
  return false;
}

/**
 * Client -> server messages. `on`: which socket accepts it ('gw', 'p', 'both').
 * fields: name -> type ('?' prefix = optional). rate/burst: token bucket per socket.
 */
export const CLIENT_MSGS = Object.freeze({
  hello:   { on: 'both', fields: { v: 'int', build: 'str:64' }, rate: 2, burst: 2 },
  guest:   { on: 'gw', fields: { name: '?str:24', human: '?str:2048' }, rate: 1, burst: 3 },
  auth:    { on: 'gw', fields: { token: 'str:64' }, rate: 1, burst: 3 },
  chars:   { on: 'gw', fields: {}, rate: 2, burst: 4 },
  create:  { on: 'gw', fields: { name: 'str:24', cls: 'str:32', look: '?obj' }, rate: 1, burst: 3 },
  play:    { on: 'gw', fields: { char: 'int', join: '?str:8' }, rate: 1, burst: 3 },
  party:   { on: 'gw', fields: { op: 'str:8', name: '?str:24', code: '?str:64', char: '?int' }, rate: 2, burst: 10 },
  chat:    { on: 'gw', fields: { ch: 'str:8', text: 'str:200' }, rate: 1, burst: 5 },
  ignore:  { on: 'gw', fields: { name: 'str:24', on: 'bool' }, rate: 1, burst: 5 },
  ping:    { on: 'both', fields: { c: 'num' }, rate: 2, burst: 4 },
  enter:   { on: 'p', fields: { ticket: 'str:256' }, rate: 1, burst: 3 },
  in:      { on: 'p', fields: { s: 'int', dt: 'num', mx: 'num', mz: 'num', yaw: 'num', b: 'int' }, rate: 40, burst: 60 },
  cast:    { on: 'p', fields: { slot: 'int', aim: '?vec2', target: '?id', ct: '?num', held: '?num' }, rate: 10, burst: 15 },
  target:  { on: 'p', fields: { id: '?id' }, rate: 10, burst: 20 },
  say:     { on: 'p', fields: { text: 'str:200' }, rate: 1, burst: 5 },
  respawn: { on: 'p', fields: {}, rate: 1, burst: 2 },
  use:     { on: 'p', fields: { id: 'id' }, rate: 4, burst: 8 },
  item:    { on: 'p', fields: { op: 'str:8', uid: 'str:40', slot: '?str:16' }, rate: 5, burst: 10 },
  travel:  { on: 'p', fields: { to: 'str:48' }, rate: 1, burst: 3 },
  trace:   { on: 'p', fields: { kind: 'str:16' }, rate: 1, burst: 2 },
  trade:   { on: 'p', fields: { op: 'str:8', id: '?int', items: '?uids', gold: '?int' }, rate: 5, burst: 10 },
  leave:   { on: 'both', fields: {}, rate: 1, burst: 2 },
});

/** Server -> client JSON messages (documentation + tests; the server is trusted, the client does not validate). */
export const SERVER_MSGS = Object.freeze({
  welcome: ['v', 'build', 'server', 'tickMs', 'time'],
  refuse: ['code', 'msg'],
  authed: ['account', 'token', 'claimed'],
  charList: ['chars'],
  created: ['char'],
  ticket: ['path', 'ticket', 'room'],
  pong: ['c', 's', 'k'],
  joined: ['room', 'you', 'tickMs', 'tick', 'time'],
  info: ['ents'],
  ev: ['k', 'e'],
  you: [],
  chat: ['ch', 'from', 'name', 'text'],
  castR: ['slot', 'ok', 'why'],
  err: ['code', 'msg'],
  kick: ['code', 'msg'],
  used: ['id', 'ok', 'why'],
  bag: ['add', 'remove', 'gold'],
  equip: ['slot', 'item'],
  partyState: ['party'],
  partyInvite: ['from', 'name', 'party'],
  partyFrames: ['m'],
  targetR: ['id', 'ok', 'why'],
  ignored: ['list'],
  tradeAsk: ['trade', 'from', 'name'],
  relocate: ['path', 'ticket', 'province'],
  groupHint: ['key', 'with'],
  realm: ['kind', 'ev', 'at', 'won'],
  zone: ['zone', 'name', 'deeds'],
  travelR: ['ok', 'why', 'cost'],
  tradeState: ['trade', 'done', 'why'],
});

/** Party ops (`party {op}`); docs/protocol.md §3.3. */
export const PARTY_OPS = Object.freeze(['invite', 'accept', 'decline', 'leave', 'kick', 'lead', 'join', 'code', 'group']);
export const PARTY_MAX = 5;
/** Item ops (`item {op}`). */
export const ITEM_OPS = Object.freeze(['equip', 'unequip', 'destroy']);
/** Chat channels a client may send on the gateway (`say` is local, on the province socket). */
export const CHAT_CHANNELS = Object.freeze(['party']);
/** Room kinds (`joined.room.kind`). */
export const ROOM_KINDS = Object.freeze(['wilds', 'town', 'instance']);

export const EVENT_TYPES = Object.freeze(['cast', 'hit', 'miss', 'die', 'xp', 'level', 'loot', 'aggro', 'fx', 'open',
  'tele', 'teleR', 'castbar', 'castX', 'phase', 'enrage', 'say', 'obj', 'boss']);

/**
 * Event fields (docs/protocol.md §6, encounter rows from docs/encounters.md §7). Every event also has
 * `type`, and `x, z` (the room fills them in). Ids are local room entity ids. `?` = optional.
 */
export const EVENT_FIELDS = Object.freeze({
  cast: ['s', 'slot?', 'skill', 'aim?', 'target?'],
  hit: ['s', 'd', 'n', 'crit?', 'el?', 'kind', 'skill?'],
  miss: ['s', 'd', 'why'],
  die: ['d', 'by?'],
  xp: ['n', 'total'],
  level: ['d', 'level'],
  loot: ['d', 'items', 'gold?'],
  aggro: ['s', 'd'],
  fx: ['id', 'kind'],
  open: ['d'],
  tele: ['id', 's', 'ab', 'k', 'ms', 'shape', 'yaw?', 'r?', 'r2?', 'arc?', 'len?', 'w?', 'el?', 'follow?'],
  teleR: ['id', 'hits?', 'x?'],
  castbar: ['id', 'ab', 'name', 'ms', 'int?'],
  castX: ['id', 'ab', 'why'],
  phase: ['id', 'n', 'name?', 'bar', 'hpMax?', 'reset?'],
  enrage: ['id', 'soft?', 'hard?'],
  say: ['id', 'text', 'style'],
  obj: ['id', 'state?', 'otype?', 'r?', 'key?', 'hp?', 'gone?'],
  boss: ['id', 'name?', 'title?', 'bars?', 'phases?', 'enrageMs?', 'arena?', 'end?', 'won?'],
});
/** Telegraph shapes (`tele.shape`) and object states (`obj.state`, `info.state`). */
export const TELE_SHAPES = Object.freeze(['circle', 'ring', 'donut', 'cone', 'line', 'cross']);
export const OBJ_STATES = Object.freeze(['idle', 'lit', 'used', 'broken', 'open', 'closed']);
export const OBJ_TYPES = Object.freeze(['portal', 'stairs', 'exit', 'chest', 'gate', 'lever', 'pillar', 'rock', 'brazier', 'pool', 'cracked_floor', 'sarcophagus', 'support_beam', 'ore_cart']);

/** Validate a decoded client message. Returns null when fine, else a reason. */
export function validate(msg, socketKind = null) {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return 'shape';
  const t = msg.t;
  if (typeof t !== 'string' || !Object.prototype.hasOwnProperty.call(CLIENT_MSGS, t)) return 'type';
  const spec = CLIENT_MSGS[t];
  if (socketKind && spec.on !== 'both' && spec.on !== socketKind) return 'socket';
  for (const k of Object.keys(msg)) {
    if (k === 't') continue;
    if (!Object.prototype.hasOwnProperty.call(spec.fields, k)) return 'extra:' + k;
  }
  for (const [k, typeRaw] of Object.entries(spec.fields)) {
    const opt = typeRaw[0] === '?';
    const type = opt ? typeRaw.slice(1) : typeRaw;
    const v = msg[k];
    if (v === undefined || (opt && v === null)) { if (!opt) return 'field:' + k; continue; }
    if (!check(type, v)) return 'field:' + k;
  }
  return null;
}

/** Parse + validate one text frame. */
export function parseFrame(data, socketKind = null) {
  if (typeof data !== 'string') return { bad: 'binary' };
  if (data.length > MAX_FRAME) return { bad: 'size' };
  let msg;
  try { msg = JSON.parse(data); } catch { return { bad: 'json' }; }
  const why = validate(msg, socketKind);
  return why ? { bad: why } : { msg };
}

/** Per-socket token buckets keyed by message type. `now` in ms. */
export function createBuckets(now = () => Date.now()) {
  const b = new Map();
  return {
    take(t) {
      const spec = CLIENT_MSGS[t];
      if (!spec) return false;
      const n = now();
      let s = b.get(t);
      if (!s) { s = { tokens: spec.burst, at: n }; b.set(t, s); }
      s.tokens = Math.min(spec.burst, s.tokens + (n - s.at) / 1000 * spec.rate);
      s.at = n;
      if (s.tokens < 1) return false;
      s.tokens -= 1;
      return true;
    },
  };
}

/** Character names: 2-16 letters, spaces, apostrophes, hyphens; must start with a letter. */
export function cleanName(s) {
  const n = String(s || '').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 16) return null;
  if (!/^\p{L}[\p{L} '\-]*$/u.test(n)) return null;
  return n;
}
