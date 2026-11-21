// Wyrmroad online: the wire between a browser and the room server. Small JSON frames both ways; every frame from a
// browser is checked field by field against CLIENT_MSGS (unknown type, unknown field, wrong type or too long → dropped
// and counted) and rate-limited per type before a room sees it. cleanHero makes a hero a browser brings safe: the class
// exists, the level is 1–12, every item is a real base for that slot and class with a real rarity and bonus lines in
// the range the loot roller can make, spells belong to the class and are unlocked. Pure: the server, the browser and
// the tests import it. Modelled on Overdrive Frame's js/net/protocol.js (round 4).
import { SLOTS, baseOf } from '../sim/items.js';

export const PROTOCOL = 1;
export const STEP_HZ = 60;                    // the server runs every room's brawl 60 steps a second (the sim's own step)
export const SNAP_EVERY = 3;                  // ...and sends a snapshot every 3rd step: 20 a second (events go every step)
export const INPUT_BATCH = 1;                 // a browser sends its input every step: 60 tiny messages a second (two at a time measured 15-25 ms slower)
export const MAX_FRAME = 16 * 1024;
export const MAX_SEATS = 4;                   // one hero per device, up to four
export const AWAY_MS = { lobby: 5 * 60000, play: 90000 };   // a sleeping phone keeps its seat this long (game-standards §2)
export const READY_MS = 25000;                // the ready check before a chapter
export const SCENE_MS = 60000;                // a story scene waits at most this long for everyone to skip
export const RESULTS_MS = 45000;              // the results screen, then everyone is back in the room
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I or O (they read as 1 and 0)
export const CODE_LENGTH = 4;
export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A hero's name: 1-16 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = s => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); return n.length ? n : null; };

// ------------------------------------------------------------------------------------------------ the hero a player brings
const ID = /^[A-Za-z0-9_-]{1,48}$/, HEX = /^#[0-9a-fA-F]{3,8}$/;
const LOOK_VAL = v => (typeof v === 'string' && v.length <= 40) || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100) || typeof v === 'boolean';
/** A Chibi look: { part: { id, color, color2, … } | value }. Bounded in size; anything odd is dropped. */
export function cleanLook(look) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
  const out = {};
  for (const [k, v] of Object.entries(look).slice(0, 32)) {
    if (!/^[A-Za-z0-9_]{1,24}$/.test(k)) continue;
    if (LOOK_VAL(v)) { out[k] = v; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = {}; for (const [kk, vv] of Object.entries(v).slice(0, 10)) if (/^[A-Za-z0-9_]{1,24}$/.test(kk) && LOOK_VAL(vv)) o[kk] = vv;
      out[k] = o;
    }
  }
  return out;
}

/**
 * One owned item made safe, or null. The base must exist, fit the slot and the class; the rarity must exist; bonus
 * lines are the roller's stats, one per stat, no more than the rarity gives, each within what the roller can make
 * for that base's chapter (min × scale … max × scale, a little slack for rounding).
 */
export function cleanItem(ITEMS, item, slot, cls) {
  if (!item || typeof item !== 'object') return null;
  const b = typeof item.base === 'string' && baseOf(ITEMS, item.base);
  if (!b || (slot && b.slot !== slot) || (cls && !b.cls.includes(cls))) return null;
  const R = ITEMS.rarity.find(r => r.id === item.rarity); if (!R) return null;
  if (b.legendary && R.id !== 'legendary') return null;
  const lines = b.legendary ? 1 : R.lines, scale = 1 + b.chapter * 0.6, bonus = [], taken = new Set();
  for (const ln of Array.isArray(item.bonus) ? item.bonus : []) {
    const o = ln && ITEMS.bonus.find(x => x.stat === ln.stat);
    if (!o || taken.has(o.stat) || !Number.isFinite(ln.v)) return null;
    if (ln.v < 0 || ln.v > o.max * scale + 1.01) return null;
    taken.add(o.stat); bonus.push({ stat: o.stat, v: ln.v });
  }
  if (bonus.length > lines) return null;
  const uid = typeof item.uid === 'string' && ID.test(item.uid) ? item.uid : 'i' + b.id.length + bonus.length;
  return { uid, base: b.id, rarity: R.id, bonus };
}

/**
 * The hero a browser brings, made safe — or { error } saying what was wrong (the screen shows it).
 *   { name, cls, level, xp, gear: { slot: item }, spells: [id, id], look, story: { reached } }
 * Returns { name, cls, level, xp, gear, spells, look, reached }. The server works out every number itself (heroStats).
 */
export function cleanHero(data, h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return { error: 'No hero.' };
  const C = data.classes.classes[h.cls]; if (!C || !Object.hasOwn(data.classes.classes, h.cls)) return { error: 'That hero\'s class does not exist.' };
  const maxLv = data.classes.levels.length;
  if (!Number.isInteger(h.level) || h.level < 1 || h.level > maxLv) return { error: `Hero level must be 1–${maxLv}.` };
  const lo = data.classes.levels[h.level - 1], hi = data.classes.levels[h.level] ?? Infinity;
  const xp = Number.isFinite(h.xp) ? Math.max(lo, Math.min(hi - 1, Math.round(h.xp))) : lo;
  const gear = {};
  if (h.gear != null && (typeof h.gear !== 'object' || Array.isArray(h.gear))) return { error: 'Gear is not readable.' };
  for (const [slot, it] of Object.entries(h.gear || {})) {
    if (!SLOTS.includes(slot)) return { error: 'Unknown gear slot.' };
    if (it == null) continue;
    const c = cleanItem(data.items, it, slot, h.cls); if (!c) return { error: 'An item in your gear is not valid.' };
    gear[slot] = c;
  }
  const spells = Array.isArray(h.spells) ? h.spells : C.spells.slice(0, 2);
  if (spells.length < 1 || spells.length > 2 || new Set(spells).size !== spells.length) return { error: 'Carry one or two different spells.' };
  for (const s of spells) {
    if (typeof s !== 'string' || !C.spells.includes(s)) return { error: 'A spell does not belong to this class.' };
    if (data.classes.spells[s].level > h.level) return { error: 'A spell is not learned yet.' };
  }
  const chapters = data.chapters.chapters.length;
  const reached = Number.isInteger(h.story?.reached) ? Math.max(0, Math.min(chapters - 1, h.story.reached)) : 0;
  return { name: cleanName(h.name) || C.name, cls: h.cls, level: h.level, xp, gear, spells: [...spells], look: cleanLook(h.look), reached };
}

// ------------------------------------------------------------------------------------------------ inputs
/** Input packed small: [mx, mz, bits] — move in hundredths, block held + the press edges as bits. */
export const EDGES = ['attack', 'heavy', 'jump', 'dash', 'grab', 'spell1', 'spell2', 'breaker'];
export const BITS = Object.freeze({ block: 1, attack: 2, heavy: 4, jump: 8, dash: 16, grab: 32, spell1: 64, spell2: 128, breaker: 256 });
export function packInput(inp = {}) {
  let b = 0;
  for (const k of ['block', ...EDGES]) if (inp[k]) b |= BITS[k];
  const r = v => Math.max(-100, Math.min(100, Math.round((v || 0) * 100)));
  return [r(inp.mx), r(inp.mz), b];
}
export function unpackInput(a) {
  if (!Array.isArray(a) || a.length !== 3 || !a.every(Number.isInteger)) return null;
  const [mx, mz, b] = a, cl = v => Math.max(-1, Math.min(1, v / 100));
  const out = { mx: cl(mx), mz: cl(mz) };
  for (const k of ['block', ...EDGES]) out[k] = !!(b & BITS[k]);
  return out;
}
/** A press in `from` is kept in `into` (two inputs used as one: a tap in either still counts — never dropped). */
export function mergePresses(into, from) { for (const k of EDGES) if (from[k]) into[k] = true; return into; }
export const clearPresses = inp => { const o = { ...inp }; for (const k of EDGES) o[k] = false; return o; };

// ------------------------------------------------------------------------------------------------ messages
// field types: int, num, bool, str:N, obj, arr, '?type' = optional, 'a|b' = either
export const CLIENT_MSGS = Object.freeze({
  hello:  { fields: { v: 'int', token: '?str:64' }, rate: 2, burst: 4 },
  create: { fields: { public: '?bool' }, rate: 0.5, burst: 3 },
  join:   { fields: { code: 'str:8' }, rate: 1, burst: 6 },
  leave:  { fields: {}, rate: 1, burst: 3 },
  rooms:  { fields: {}, rate: 1, burst: 4 },
  me:     { fields: { hero: 'obj' }, rate: 2, burst: 6 },                       // the hero you bring (cleanHero on the server)
  opt:    { fields: { key: 'str:16', value: 'bool' }, rate: 4, burst: 8 },      // host: public on/off
  pick:   { fields: { chapter: 'str:24' }, rate: 3, burst: 6 },                 // host: a chapter from the host's unlocked list
  start:  { fields: {}, rate: 1, burst: 3 },                                    // host: begin the ready check
  ready:  { fields: { on: 'bool' }, rate: 4, burst: 8 },                        // ready check + "skip" in story scenes
  loaded: { fields: {}, rate: 1, burst: 3 },                                    // this device has the chapter drawn
  in:     { fields: { s: 'int', i: 'arr' }, rate: 75, burst: 150 },             // inputs, one step per message (a slow device sends a few at once)
  retry:  { fields: { on: 'bool' }, rate: 1, burst: 3 },                        // host after a loss: true = from the last fight, false = back to the room
  ending: { fields: { id: 'str:16' }, rate: 1, burst: 3 },                     // host, last chapter: which ending
  back:   { fields: {}, rate: 1, burst: 3 },                                    // host: results → room now
  kick:   { fields: { pid: 'str:12' }, rate: 2, burst: 4 },                     // host: remove (stays out)
  vote:   { fields: { pid: 'str:12' }, rate: 2, burst: 4 },                     // everyone else: vote to remove
  host:   { fields: { pid: 'str:12' }, rate: 1, burst: 3 },                     // host: pass host to someone
  end:    { fields: {}, rate: 1, burst: 3 },                                    // host: stop the chapter, everyone back to the room
  ping:   { fields: { at: 'num' }, rate: 2, burst: 6 },
});

function typeOk(v, type) {
  for (const t of type.split('|')) {
    if (t === 'int' && Number.isInteger(v)) return true;
    if (t === 'num' && typeof v === 'number' && Number.isFinite(v)) return true;
    if (t === 'bool' && typeof v === 'boolean') return true;
    if (t === 'obj' && v && typeof v === 'object' && !Array.isArray(v)) return true;
    if (t === 'arr' && Array.isArray(v) && v.length <= 8) return true;
    if (t.startsWith('str:') && typeof v === 'string' && v.length <= +t.slice(4)) return true;
  }
  return false;
}
/** null when the message is well formed, else a short reason. */
export function validate(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return 'shape';
  const spec = Object.hasOwn(CLIENT_MSGS, msg.t) && CLIENT_MSGS[msg.t];
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
