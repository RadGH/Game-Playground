// Overdrive Frame online: the wire between a browser and the co-op server. Small JSON frames both ways; every frame
// from a browser is checked field by field against CLIENT_MSGS (unknown type, unknown field, wrong type or too long →
// dropped and counted) and rate-limited per type before a room sees it. Pure: the server, the browser and the tests
// import it. Modelled on Knockabout's js/net/protocol.js.
import { RARITY } from '../sim/loadout.js';
import { MOD_BY_ID } from '../sim/mods.js';
import { cleanTuning, tuningPoints } from '../sim/tuning.js';
import { cleanSkill } from '../sim/skills.js';

export const PROTOCOL = 1;
export const STEP_HZ = 30;                    // the server steps every mission 30 times a second (the sim's own step)
export const SNAP_EVERY = 2;                  // ...and sends a snapshot every 2nd step: 15 a second
export const MAX_FRAME = 24 * 1024;
export const MAX_SEATS = 4;                   // frames per mission, people + bots
export const AWAY_MS = { lobby: 5 * 60000, mission: 90000 };   // a sleeping phone keeps its seat this long
export const LOAD_WAIT_MS = 75000;            // the server waits this long for slow devices to finish loading a mission
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I or O (they read as 1 and 0)
export const CODE_LENGTH = 4;
export const cleanCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH); return c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
export const newCode = rand => { let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return c; };
/** A pilot's name: 1-16 visible characters, no control characters or markup, spaces collapsed. */
export const cleanName = s => { const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); return n.length ? n : null; };

const HEX = /^#[0-9a-fA-F]{6}$/;
const RARITIES = RARITY.map(r => r.id);
/**
 * A build from a browser made safe: every part must exist in P and fit its place, bonus lines are short and in range,
 * chips must exist, paint is 'maker' or four colours. Returns null when the frame is missing a core part.
 * The server then works out the frame's numbers itself (mechStats) — a browser never sends numbers it made up.
 */
export function cleanBuild(b, P, CHIPS, SLOTS, rank = 1) {
  if (!b || typeof b !== 'object') return null;
  const item = (it, ok) => {
    if (!it) return null;
    const id = typeof it === 'string' ? it : it.id; const part = typeof id === 'string' && P[id]; if (!part || !ok(part)) return null;
    if (typeof it === 'string') return { id };
    const rolls = Array.isArray(it.rolls) ? it.rolls.slice(0, 6).filter(r => r && typeof r.stat === 'string' && r.stat.length <= 24 && Number.isFinite(r.value) && Math.abs(r.value) <= 300)
      .map(r => ({ stat: r.stat, value: r.value, ...(r.pct ? { pct: true } : {}) })) : [];
    const mods = Array.isArray(it.mods) ? it.mods.filter(m => typeof m === 'string' && MOD_BY_ID[m]).slice(0, 2) : [];   // round 7: part mods
    return { id, uid: typeof it.uid === 'string' ? it.uid.slice(0, 24) : undefined, rarity: RARITIES.includes(it.rarity) ? it.rarity : 'common', rolls, mods, model: part.model || null };
  };
  const out = { name: typeof b.name === 'string' ? b.name.slice(0, 24) : '' };
  for (const s of SLOTS) { out[s] = item(b[s], p => p.slot === s); }
  if (!out.core || !out.legs || !out.arms || !out.head) return null;
  out.weapons = [0, 1, 2, 3].map(i => item(Array.isArray(b.weapons) ? b.weapons[i] : null, p => p.slot === 'weapon'));
  out.chips = (Array.isArray(b.chips) ? b.chips : []).slice(0, 8).filter(c => typeof c === 'string' && CHIPS[c]);
  // round 7: repair kit Mk, the build's skill (only one the pilot's rank opens), Frame Tuning within the rank's points
  // (story missions add a point each; the server can't see them, so it allows the whole campaign's worth)
  out.kit = Number.isInteger(b.kit) ? Math.max(1, Math.min(5, b.kit)) : 1;
  out.skill = cleanSkill(b.skill, rank);
  out.tuning = cleanTuning(b.tuning, tuningPoints(rank, 20));
  const pt = b.paint;
  out.paint = pt && typeof pt === 'object' && ['primary', 'secondary', 'accent', 'glow'].every(k => HEX.test(pt[k])) ? { primary: pt.primary, secondary: pt.secondary, accent: pt.accent, glow: pt.glow } : 'maker';
  return out;
}

/** Held input packed small: i = [mx, mz, ax, az, bits] (move and aim to hundredths, buttons as bits). */
export const BITS = Object.freeze({ f0: 1, f1: 2, f2: 4, f3: 8, boost: 16, jump: 32, jumpPressed: 64, qb: 128, lockOnPressed: 256, ping: 512, interact: 1024, swap: 2048, pad: 4096, overload: 8192, kit: 16384, skill: 32768 });
const PRESS = ['jumpPressed', 'qb', 'lockOnPressed', 'ping', 'interact', 'swap', 'overload', 'kit', 'skill'];
export function packInput(inp) {
  let b = 0;
  for (let k = 0; k < 4; k++) if (inp.fire?.[k]) b |= 1 << k;
  for (const k of ['boost', 'jump', ...PRESS, 'pad']) if (inp[k]) b |= BITS[k];
  const r = v => Math.round((v || 0) * 100);
  return [r(inp.mx), r(inp.mz), r(inp.ax), r(inp.az), b];
}
export function unpackInput(a) {
  if (!Array.isArray(a) || a.length !== 5 || !a.every(Number.isFinite)) return null;
  const [mx, mz, ax, az, b] = a, cl = v => Math.max(-1, Math.min(1, v / 100));
  const out = { mx: cl(mx), mz: cl(mz), ax: ax / 100, az: az / 100, fire: [!!(b & 1), !!(b & 2), !!(b & 4), !!(b & 8)] };
  for (const k of ['boost', 'jump', ...PRESS, 'pad']) out[k] = !!(b & BITS[k]);
  return out;
}
/** Two inputs into one (when the server uses two at once, a tap in either still counts). */
export function mergePresses(into, from) { for (const k of PRESS) if (from[k]) into[k] = true; return into; }
export const clearPresses = inp => { const o = { ...inp }; for (const k of PRESS) o[k] = false; return o; };

// field types: int, num, bool, str:N, obj, arr, '?type' = optional, 'a|b' = either
export const CLIENT_MSGS = Object.freeze({
  hello:  { fields: { v: 'int', token: '?str:64' }, rate: 2, burst: 4 },
  create: { fields: { public: '?bool' }, rate: 0.5, burst: 3 },
  join:   { fields: { code: 'str:8' }, rate: 1, burst: 6 },
  leave:  { fields: {}, rate: 1, burst: 3 },
  rooms:  { fields: {}, rate: 1, burst: 4 },
  // this pilot: name, rank, the frame they bring (cleanBuild on the server)
  me:     { fields: { name: 'str:40', rank: 'int', build: 'obj' }, rate: 2, burst: 6 },
  ready:  { fields: { on: 'bool' }, rate: 4, burst: 8 },
  opt:    { fields: { key: 'str:16', value: 'num|str:40|bool' }, rate: 6, burst: 12 },      // host only
  // host: the mission — a story mission id, or a contract (index on the host's board + what makes that board)
  pick:   { fields: { story: '?str:40', contract: '?int', played: '?int', grades: '?obj' }, rate: 2, burst: 6 },
  start:  { fields: { fromCheckpoint: '?bool' }, rate: 1, burst: 3 },                        // host only (a long mission lost: again from its checkpoint)
  loaded: { fields: {}, rate: 1, burst: 3 },                                                 // this device has the mission drawn
  in:     { fields: { s: 'int', i: 'arr' }, rate: 45, burst: 90 },                           // input, 30 a second
  kick:   { fields: { pid: 'str:12' }, rate: 2, burst: 4 },                                  // host only
  vote:   { fields: { pid: 'str:12' }, rate: 2, burst: 4 },                                  // vote to remove someone
  end:    { fields: {}, rate: 1, burst: 3 },                                                 // host: abandon → back to the room
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
