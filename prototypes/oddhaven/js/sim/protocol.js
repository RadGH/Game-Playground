// What may come down a socket from a browser. Pure: the room server and the tests share it. Everything from a client is checked here BEFORE the
// room sees it, so a bad message is a dropped message and never an exception in the sim. The server writes `owner`, `crew`, `noWheel`, `comp`, `guest`;
// the lists below leave those out, so a client sending them is sending nothing.
export const PROTOCOL = 1;
export const LIMITS = Object.freeze({
  frame: 256 * 1024,          // the biggest ordinary message (a made person's design is the big one)
  saveFrame: 6 * 1024 * 1024, // a town coming in from a phone: the first message of a hosted room only
  saveChars: 5 * 1024 * 1024,
  rate: 80, burst: 160,       // messages a second, and the most at once. A healthy page sends about 12
  strikes: 300,               // bad or dropped messages before the socket is closed
  players: 8, nameChars: 24, codeChars: 12,
  focusPoints: 4, focusParty: 12, posRows: 8, carRows: 8,
  saidPerSecond: 4, heavyPerSecond: 12,
});
const WORLD = 200000;
const int = v => Number.isInteger(v) && v >= -1 && v < 1e7;
const num = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= WORLD;
const opt = f => v => v === undefined || v === null || f(v);
const bool = v => typeof v === 'boolean';
const str = n => v => typeof v === 'string' && v.length <= n;
const obj = (v, n) => v !== null && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length <= n;

const person = int, ids = (n, f = int) => v => Array.isArray(v) && v.length <= n && v.every(f);
const posRow = r => Array.isArray(r) && r.length >= 4 && r.length <= 9 && int(r[0]) && num(r[1]) && num(r[2]) && num(r[3]) && opt(str(40))(r[4]) && opt(bool)(r[5]) && opt(num)(r[6]) && opt(int)(r[7]) && opt(int)(r[8]);
const carRow = r => Array.isArray(r) && r.length >= 5 && r.length <= 8 && int(r[0]) && num(r[1]) && num(r[2]) && num(r[3]) && num(r[4]) && opt(str(40))(r[5]) && opt(bool)(r[6]) && opt(num)(r[7]);
const point = p => obj(p, 200) && num(p.x) && num(p.z);
const order = o => obj(o, 400) && str(16)(o.kind);

/** Sim commands a client may ask for, field by field. A field not listed is thrown away. The sim's own rules then apply. */
export const COMMANDS = Object.freeze({
  focus: { points: ids(LIMITS.focusPoints, point), party: ids(LIMITS.focusParty) },
  order: { who: person, order },
  cancelOrders: { who: person },
  work: { who: person, verb: str(12), tree: opt(int), bench: opt(int), cart: opt(v => typeof v === 'boolean' || int(v)), q: opt(num) },
  fire: { who: person, verb: str(12), room: opt(v => typeof v === 'string' ? v.length <= 40 : int(v)), secs: opt(num), door: opt(v => typeof v === 'string' ? v.length <= 40 : int(v)), q: opt(num), person: opt(int) },
  law: { who: person, verb: str(12), id: opt(int), how: opt(str(10)), q: opt(num) },
  fight: { who: person, verb: str(12), q: opt(num) },
  permit: { who: person, permit: str(12) },
  cast: { who: person, spell: str(20), target: opt(int), near: opt(ids(8)) },
  addPerson: { given: str(24), family: opt(str(24)), gender: str(1), race: str(20), age: opt(num), traits: opt(ids(8, str(24))), quirk: opt(str(24)), voice: opt(v => obj(v, 300)), design: opt(v => obj(v, 6000)), household: opt(int), job: opt(str(24)) },
  editPerson: { who: person, given: str(24), family: opt(str(24)), gender: str(1), race: str(20), age: opt(num), traits: opt(ids(8, str(24))), quirk: opt(str(24)), voice: opt(v => obj(v, 300)), design: opt(v => obj(v, 6000)) },
  wear: { who: person, wear: str(12), indoors: opt(bool) },
  mailRead: { household: int, id: int },
  autonomy: { household: int, level: str(16) },
  setJob: { who: person, job: str(24) },
  take: { who: person, x: opt(num), z: opt(num), h: opt(num) },
  partyAdd: { who: person },
  release: { who: opt(person) },
  pos: { people: opt(ids(LIMITS.posRows, posRow)), cars: opt(ids(LIMITS.carRows, carRow)) },
  rideOut: { who: person },
  carIn: { who: person, car: int },
  carOut: { who: person },
  summon: { car: int, x: num, z: num, yaw: opt(num) },
  swap: { who: person },
  liveAdd: { model: str(24) },
  liveDrop: { id: int },
  press: { who: person, building: str(40), thing: v => typeof v === 'string' ? v.length <= 40 : int(v) },
  plate: { who: person, building: str(40), thing: v => typeof v === 'string' ? v.length <= 40 : int(v), on: bool },
});
/** Allowed only on a dev server, for tests. */
export const DEV_COMMANDS = Object.freeze({
  startFire: { building: str(40), room: opt(v => true), cause: opt(str(20)), who: opt(int), noCall: opt(bool), jam: opt(v => true) },
  startCall: { call: str(20), household: opt(int) }, startRift: { site: opt(str(40)), size: opt(str(12)), now: opt(bool) },
  printSheet: {}, ringNow: { building: str(40) }, releaseAll: {},
  placeObstacle: { edge: str(40), pos: opt(num), len: opt(num), dir: opt(num) },
});

/** A clean copy of a sim command, or null. */
export function cleanCommand(cmd, { dev = false } = {}) {
  if (!obj(cmd, LIMITS.frame) || typeof cmd.kind !== 'string') return null;
  const shape = (Object.hasOwn(COMMANDS, cmd.kind) ? COMMANDS[cmd.kind] : null) ?? (dev && Object.hasOwn(DEV_COMMANDS, cmd.kind) ? DEV_COMMANDS[cmd.kind] : null);
  if (!shape) return null;
  const out = { kind: cmd.kind };
  for (const [k, ok] of Object.entries(shape)) { if (!ok(cmd[k])) return null; if (cmd[k] !== undefined) out[k] = cmd[k]; }
  return out;
}

/** The room's own messages. A type not here is a bad message. */
const ROOM = Object.freeze({
  inspect: { id: int }, phone: { household: int, who: opt(int) }, facts: { a: int, b: int }, health: { id: opt(v => true) }, save: { id: opt(int), now: opt(v => true) }, resend: {}, control: { on: bool },
  perm: { to: str(8), key: str(10), on: bool }, setRoom: { public: opt(bool), name: opt(str(40)), defaults: opt(v => obj(v, 200)) }, kick: { to: str(8) },
  partyInvite: { to: str(8) }, partyAsk: { to: str(8) }, partyAnswer: { from: str(8), yes: bool, ask: opt(bool) }, partyLeave: {}, partySplit: {},
  takeback: { who: int }, yielded: { n: int }, give: { who: int, to: str(8) },
  vote: { what: str(8) }, voteAnswer: { yes: bool }, said: { id: str(80), d: num }, bye: {}, takeHome: {}, ping: { t: num }, name: { name: str(LIMITS.nameChars) },
  speed: { x: opt(v => true) }, turbo: { x: opt(v => true) }, step: { n: opt(v => true) },
});
export function cleanMessage(m) {
  if (!obj(m, LIMITS.saveFrame) || typeof m.type !== 'string') return null;
  if (m.type === 'cmd') return obj(m.cmd, LIMITS.frame) ? m : null;
  const shape = Object.hasOwn(ROOM, m.type) ? ROOM[m.type] : null;
  if (!shape) return null;
  const out = { type: m.type };
  for (const [k, ok] of Object.entries(shape)) { if (!ok(m[k])) return null; if (m[k] !== undefined) out[k] = m[k]; }
  return out;
}

export const CODE_LETTERS = 'BCDFGHJKMNPQRSTVWXYZ';    // no vowels, so no words; none of the look-alikes
export const isCode = (c, dev = false) => typeof c === 'string' && (dev ? /^[A-Za-z0-9_-]{1,12}$/ : /^[BCDFGHJKMNPQRSTVWXYZ]{4}$/).test(c);
export const cleanName = n => String(n ?? '').replace(/[<>\n\r\t]/g, '').trim().slice(0, LIMITS.nameChars);

/** A bucket: `take()` false means too fast. Time comes from outside. */
export function createBucket(rate, burst) {
  let have = burst, was = null;
  return { take(now, n = 1) { if (was !== null) have = Math.min(burst, have + (now - was) / 1000 * rate); was = now; if (have < n) return false; have -= n; return true; } };
}
