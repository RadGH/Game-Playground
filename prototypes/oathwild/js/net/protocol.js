// Oathwild online: the wire between a browser and the world server. Small JSON frames both ways. Every frame from a
// browser is checked against CLIENT_MSGS (unknown type, unknown field, wrong type or too long → dropped and counted)
// and rate-limited per type before the hub or a world sees it. Pure: the server, the browser and the tests import it.
// Modelled on Wyrmroad's js/net/protocol.js (same codes, same buckets).
//
// Client → server
//   hello { v, token?, device?, ticket? }      → welcome { token, build, profile }
//   chars                                       → chars { list }                 (this profile's saved characters)
//   charNew { name, look, background, attributes, cls }  → chars | err
//   charDel { id }                              → chars
//   worlds                                      → worlds { list }                (public worlds + the ones I played)
//   worldNew { name, public }                   → worlds (and the new code)
//   join { code, char }                         → enter { … }                    (into a world with one character)
//   leave                                       → left
//   in { q, mx, mz, ax, ay, az, dx, dy, dz, at?, b, c, h, rv? }   per 50 ms step: movement + aim + buttons + cast slot
//   act { a, … }                                every window action (loot, talk, level-up, equip, shop …): ACTS below
//   ping { at }                                 → pong { at }
// Server → client
//   s      snapshot (20 a second): units near you, projectiles, zones, your input ack
//   ev     events near you (hits, heals, deaths, casts …) — sent with the snapshot
//   me     your character record + sheet numbers (when they change)
//   wstate the world's shared state (flags, quests, shrines, found places) (when it changes)
//   win    a window to open (loot, talk, shop, trainer, stable, respec, travel, enchant, repair)
//   say    a line for the log / a toast;  err  something refused (plain words)

export const PROTOCOL = 1;
export const STEP_HZ = 20;                  // the world sim's own rate (js/rules/combat.js is tuned for 20 Hz)
export const STEP = 1 / STEP_HZ;
export const MAX_FRAME = 64 * 1024;
export const MAX_PLAYERS = 10;              // per world (owner: co-op up to 10)
export const VIEW_METRES = 95;              // units further than this from you are not sent
export const EVENT_METRES = 70;             // events further than this (and not about you) are not sent
export const EMPTY_WORLD_MS = 2 * 60000;    // a world nobody is in is saved and put away after this
export const AWAY_MS = 90000;               // a dropped player keeps their place this long
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A name: 1-18 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = (s, max = 18) => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); return n.length ? n : null; };

// Input buttons (in.b bit field)
export const BTN = Object.freeze({ attack: 1, power: 2, block: 4, sprint: 8, sneak: 16, dodge: 32, mount: 64, respawn: 128, interact: 256 });
export const packButtons = o => Object.entries(BTN).reduce((b, [k, bit]) => b | (o[k] ? bit : 0), 0);
export const unpackButtons = b => Object.fromEntries(Object.entries(BTN).map(([k, bit]) => [k, !!(b & bit)]));

// Unit flags in a snapshot row
export const UF = Object.freeze({ downed: 1, mounted: 2, blocking: 4, sneaking: 8, channel: 16, returning: 32, safe: 64, casting: 128 });

// Window actions (act.a) and the fields each may carry: [name, type, max]
const S = 'string', N = 'number', B = 'boolean', A = 'array', O = 'object';
export const ACTS = {
  'loot-open': [['id', S, 64]], 'loot-take': [['id', S, 64], ['item', S, 64]], 'loot-gold': [['id', S, 64]], 'loot-all': [['id', S, 64]], 'loot-close': [['id', S, 64]],
  chest: [['id', S, 64]], pick: [['id', S, 64]], use: [['id', S, 64]],
  talk: [['npc', S, 64]], choose: [['npc', S, 64], ['option', S, 96], ['pick', N]],
  levelup: [['cls', S, 32], ['path', S, 32], ['spend', A, 12], ['attr', S, 4]],
  node: [['cls', S, 32], ['node', S, 48]], path: [['cls', S, 32], ['path', S, 32]], talent: [['id', S, 48]], attr: [['key', S, 4]],
  equip: [['item', S, 64], ['slot', S, 16]], unequip: [['slot', S, 16]], destroy: [['item', S, 64]],
  bar: [['slot', N], ['spell', S, 48]],
  buy: [['npc', S, 64], ['item', S, 64]], sell: [['npc', S, 64], ['item', S, 64]], repair: [['npc', S, 64], ['item', S, 64]],
  horse: [['npc', S, 64]], respec: [['kind', S, 16]], enchant: [['item', S, 64], ['affix', S, 64]], disenchant: [['item', S, 64]],
  travel: [['shrine', S, 64]], home: [['shrine', S, 64]], respawn: [], train: [['npc', S, 64], ['cls', S, 32]],
  rate: [['up', B], ['why', A, 6], ['text', S, 600]], chat: [['text', S, 200]],
};

const MSGS = {
  hello: [['v', N], ['token', S, 64], ['device', S, 64], ['ticket', S, 256]],
  chars: [], charNew: [['name', S, 40], ['look', O], ['background', S, 32], ['attributes', O], ['cls', S, 32], ['body', S, 16]], charDel: [['id', S, 64]],
  worlds: [], worldNew: [['name', S, 40], ['public', B]], worldDel: [['code', S, 8]],
  join: [['code', S, 8], ['char', S, 64]], leave: [],
  devTp: [['x', N], ['z', N]],               // dev builds only (screenshots); the world room ignores it elsewhere
  devGear: [['base', S, 24], ['style', S, 24], ['el', S, 12], ['slot', S, 8]],   // dev builds only: hold a styled magic weapon
  devDown: [],                              // dev builds only: fall where you stand (death / shrine checks)
  devGold: [['n', N], ['magic', N]],        // dev builds only: set your gold, add `magic` magic items to the bag (shop / trade checks)
  devDummy: [['n', N], ['hp', N]],          // dev builds only: still target dummies ahead (hp: a weak one, for a corpse)
  in: [['q', N], ['mx', N], ['mz', N], ['ax', N], ['ay', N], ['az', N], ['dx', N], ['dy', N], ['dz', N], ['at', A, 3], ['b', N], ['c', N], ['h', B], ['rv', S, 64], ['tg', S, 64]],
  act: [['a', S, 24]],                       // + the fields of that action (ACTS[a])
  ping: [['at', N]],
};

/** Parse and check one frame from a browser. → { msg } or { bad: reason }. */
export function parseFrame(text) {
  if (typeof text !== 'string' || text.length > MAX_FRAME) return { bad: 'size' };
  let m; try { m = JSON.parse(text); } catch { return { bad: 'json' }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return { bad: 'shape' };
  const spec = MSGS[m.t];
  if (!spec) return { bad: 'type' };
  if (m.t === 'act' && !Object.hasOwn(ACTS, m.a)) return { bad: 'act' };
  const allowed = new Map((m.t === 'act' ? [...spec, ...ACTS[m.a]] : spec).map(f => [f[0], f]));
  for (const [k, v] of Object.entries(m)) {
    if (k === 't') continue;
    const f = allowed.get(k);
    if (!f) return { bad: 'field:' + k };
    if (v == null) continue;
    const [, type, max] = f;
    if (type === A) { if (!Array.isArray(v) || v.length > (max || 16)) return { bad: 'array:' + k }; continue; }
    if (type === O) { if (typeof v !== 'object' || Array.isArray(v) || JSON.stringify(v).length > 4000) return { bad: 'object:' + k }; continue; }
    if (type === N) { if (typeof v !== 'number' || !Number.isFinite(v)) return { bad: 'number:' + k }; continue; }
    if (typeof v !== type) return { bad: 'type:' + k };
    if (type === S && max && v.length > max) return { bad: 'long:' + k };
  }
  if (m.t === 'act' && !ACTS[m.a]) return { bad: 'act' };
  return { msg: m };
}

/** Per-type rate limits: tokens per second and a burst. Inputs come 20 a second (+ slack for a catch-up burst). */
const RATES = { in: [30, 60], act: [12, 30], ping: [2, 4], hello: [1, 3], chars: [2, 5], charNew: [1, 3], charDel: [1, 3], worlds: [2, 5], worldNew: [0.2, 2], worldDel: [0.5, 2], join: [1, 4], leave: [1, 3], devTp: [2, 4], devGear: [4, 8], devDummy: [1, 3], devDown: [1, 3], devGold: [1, 3] };
export function createBuckets(now = () => Date.now()) {
  const B = new Map();
  return {
    take(type) {
      const [rate, burst] = RATES[type] || [5, 10];
      const t = now();
      let b = B.get(type);
      if (!b) { b = { n: burst, at: t }; B.set(type, b); }
      b.n = Math.min(burst, b.n + (t - b.at) / 1000 * rate); b.at = t;
      if (b.n < 1) return false;
      b.n -= 1; return true;
    },
  };
}

/** A look from the creator, made safe: only the fields Tabard reads (face.js contract), bounded strings. */
const HEX = /^#[0-9a-fA-F]{6}$/, ID = /^[a-z0-9_]{1,32}$/;
export function cleanLook(look) {
  if (!look || typeof look !== 'object') return null;
  const hex = v => (typeof v === 'string' && HEX.test(v) ? v : null), id = v => (typeof v === 'string' && ID.test(v) ? v : null);
  const out = {
    body: look.body === 'female' ? 'female' : 'male',
    skin: { color: hex(look.skin?.color) || '#e7b48f' },
    hair: { id: id(look.hair?.id) || 'short', color: hex(look.hair?.color) || '#3b2618' },
    eyes: { id: id(look.eyes?.id) || 'round', color: hex(look.eyes?.color) || '#5a3a22' },
    brows: { id: id(look.brows?.id) || 'straight' },
    extras: { id: id(look.extras?.id) || 'none' },
    facialHair: { id: id(look.facialHair?.id) || 'none' },
    cloth: hex(look.cloth) || null,
  };
  return out;
}
