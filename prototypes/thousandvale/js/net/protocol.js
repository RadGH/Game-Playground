// Thousandvale wire protocol (stream A, shared ★). The machine-readable copy of docs/protocol.md.
// Pure: no DOM, no Node APIs. Imported by the server sim (js/sim), the client (js/net/client.js),
// bots and tests.
//
//   validate(t, msg)   -> null if fine, else a short reason string ('type', 'field:x', 'extra:y', ...)
//   parseFrame(str)    -> { msg } | { bad: reason }   (JSON text frame -> validated message)
//   createBuckets()    -> per-socket rate limiter: take(t) -> true if allowed

export const PROTOCOL_VERSION = 8;      // v8: owner feedback 8 (feedbackMine, questMarks, cart, meter/hits, you.acct, you.bagMax, mount cancel) — all additive; v7: play-test 5 (create.kit, kits, revive, sheet, feedback, admin, fish, cook) — all additive; v6: play-test 2
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
  'bite', 'howl', 'emote', 'interact', 'sit',     // 'sit' (play-test 4 S20): eating / drinking — sitting on the ground
  'fish', 'reel',
  'mine', 'chop', 'gather', 'skin', 'craft']);     // round 8 W9 (P-core): working a node / a corpse / at a station                               // play-test 5 T25: a line in the water / fighting the fish
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
  loggedOut: 'You logged out.',
  claimFirst: 'Claim this account first (pick a username and password), or you could never get back in.',
  tooManyLogins: 'Too many tries. Wait a few minutes and try again.',
  chatGate: 'Public channels open at level 5 on a claimed account.',
  slow: 'Slow down: one message every few seconds on this channel.',
  ignored: 'They are not listening to you.',
  guild: 'Guild action not possible.',
  mail: 'Mail action not possible.',
  market: 'Market action not possible.',
  callboard: 'Callboard action not possible.',
  kit: 'That starting kit is not one your class can pick.',
  forbidden: 'Admins only.',
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
  if (type === 'nums') return Array.isArray(v) && v.length <= 64 && v.every(isNum);
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
  create:  { on: 'gw', fields: { name: 'str:24', cls: 'str:32', look: '?obj', kit: '?obj' }, rate: 1, burst: 3 },   // kit {armour, weapons}: play-test 5 T5
  play:    { on: 'gw', fields: { char: 'int', join: '?str:8' }, rate: 1, burst: 3 },
  party:   { on: 'gw', fields: { op: 'str:8', name: '?str:24', code: '?str:64', char: '?int' }, rate: 2, burst: 10 },
  chat:    { on: 'gw', fields: { ch: 'str:8', text: 'str:200', to: '?str:24' }, rate: 1, burst: 5 },
  ignore:  { on: 'gw', fields: { name: 'str:24', on: 'bool' }, rate: 1, burst: 5 },
  ping:    { on: 'both', fields: { c: 'num' }, rate: 2, burst: 4 },
  enter:   { on: 'p', fields: { ticket: 'str:256' }, rate: 1, burst: 3 },
  in:      { on: 'p', fields: { s: 'int', dt: 'num', mx: 'num', mz: 'num', yaw: 'num', b: 'int' }, rate: 40, burst: 60 },
  cast:    { on: 'p', fields: { slot: 'int', aim: '?vec2', target: '?id', ct: '?num', held: '?num' }, rate: 10, burst: 15 },
  target:  { on: 'p', fields: { id: '?id' }, rate: 10, burst: 20 },
  say:     { on: 'p', fields: { text: 'str:200' }, rate: 1, burst: 5 },
  respawn: { on: 'p', fields: {}, rate: 1, burst: 2 },
  use:     { on: 'p', fields: { id: 'id', to: '?str:16' }, rate: 4, burst: 8 },      // to (play-test 6 U12): a lift's floor, 'f:<n>'
  item:    { on: 'p', fields: { op: 'str:8', uid: '?str:40', slot: '?str:16', n: '?int', onto: '?str:40' }, rate: 5, burst: 10 },      // n / onto: split and merge a stack (owner feedback 7)
  travel:  { on: 'p', fields: { to: 'str:48' }, rate: 1, burst: 3 },
  trace:   { on: 'p', fields: { kind: 'str:16' }, rate: 1, burst: 2 },
  quest:   { on: 'p', fields: { op: 'str:8', id: 'str:120', npc: '?id' }, rate: 2, burst: 6 },
  trade:   { on: 'p', fields: { op: 'str:8', id: '?int', items: '?uids', gold: '?int' }, rate: 5, burst: 10 },
  leave:   { on: 'both', fields: {}, rate: 1, burst: 2 },
  // M3 (protocol v4, docs/protocol.md §16)
  account: { on: 'gw', fields: { op: 'str:8', user: '?str:24', pass: '?str:128', old: '?str:128', email: '?str:120', code: '?str:16', human: '?str:2048', guest: '?str:64' }, rate: 0.5, burst: 4 },
  friend:  { on: 'gw', fields: { op: 'str:8', name: '?str:24', char: '?int' }, rate: 1, burst: 5 },      // ops add | remove | list | seen (seen: clears the unseen badge; char = one, none = all)
  guild:   { on: 'gw', fields: { op: 'str:8', name: '?str:24', char: '?int', id: '?int', text: '?str:200' }, rate: 1, burst: 5 },
  callboard: { on: 'gw', fields: { op: 'str:8', dungeon: '?str:64', role: '?str:8', id: '?int' }, rate: 1, burst: 5 },
  report:  { on: 'gw', fields: { name: 'str:24', why: 'str:16', text: '?str:200' }, rate: 0.1, burst: 3 },
  mail:    { on: 'p', fields: { op: 'str:8', id: '?int', to: '?str:24', subject: '?str:60', body: '?str:500', items: '?uids', gold: '?int' }, rate: 2, burst: 8 },
  // play-test 1 (docs/protocol.md §17): talents + the perk forest (P6), the world map (P3/P27)
  talent:  { on: 'p', fields: { op: 'str:8', skill: '?str:48', tier: '?int', node: '?str:48' }, rate: 3, burst: 10 },
  perk:    { on: 'p', fields: { op: 'str:8', id: '?str:64' }, rate: 3, burst: 10 },
  map:     { on: 'p', fields: { op: 'str:8' }, rate: 1, burst: 3 },
  // play-test 2 (docs/protocol.md §18): corpse loot + party rolls (Q3/Q4), shops (Q11), mounts (Q16), barber (Q20),
  // display prefs (Q22), follow check (Q2); on the gateway: account settings (Q15), a title-screen look (Q21)
  loot:    { on: 'p', fields: { op: 'str:8', id: '?id', uid: '?str:40', roll: '?int', choice: '?str:8', gold: '?bool', near: '?bool' }, rate: 8, burst: 16 },
  shop:    { on: 'p', fields: { op: 'str:8', npc: 'id', id: '?str:48', uid: '?str:40' }, rate: 4, burst: 10 },
  mount:   { on: 'p', fields: { op: 'str:8', id: '?str:32' }, rate: 1, burst: 3 },
  barber:  { on: 'p', fields: { npc: 'id', look: 'obj' }, rate: 0.5, burst: 3 },
  pref:    { on: 'p', fields: { k: 'str:16', v: 'bool' }, rate: 2, burst: 6 },
  follow:  { on: 'p', fields: { id: 'id' }, rate: 2, burst: 4 },
  inspect: { on: 'p', fields: { id: 'id' }, rate: 2, burst: 6 },
  bind:    { on: 'p', fields: { npc: 'id' }, rate: 1, burst: 3 },
  settings: { on: 'gw', fields: { op: 'str:8', data: '?obj' }, rate: 1, burst: 4 },
  look:    { on: 'gw', fields: { char: 'int', look: 'obj' }, rate: 0.5, burst: 3 },
  // play-test 5 (docs/protocol.md §21): starter kits (T5), revive answers (T4), the character sheet (T18), feedback (T19),
  // admins (T21), angling + cooking (T25)
  kits:    { on: 'gw', fields: { cls: 'str:32' }, rate: 10, burst: 40 },      // a creation screen may ask for every calling at once (30): none may be dropped silently
  revive:  { on: 'p', fields: { op: 'str:8', id: '?int' }, rate: 2, burst: 4 },
  sheet:   { on: 'p', fields: {}, rate: 2, burst: 4 },
  feedback: { on: 'both', fields: { kind: '?str:16', text: '?str:2000', ctx: '?obj', ref: '?int', op: '?str:8', limit: '?int', before: '?int' }, rate: 0.5, burst: 10 },      // the real limit is js/sim/feedback.js (answered). ref (round 8, W29): a reply to your own report #ref
  cart:    { on: 'p', fields: { op: 'str:8', id: 'id', to: '?str:48', token: '?bool' }, rate: 2, burst: 4 },      // owner feedback 8, W5: ox-cart travel — op list | go
  ship:    { on: 'p', fields: { op: 'str:8', id: '?id', to: '?str:48', party: '?bool' }, rate: 2, burst: 4 },      // [V] Expansion 1 §6: the voyage — op list | go | skip (js/sim/ships.js)
  emote:   { on: 'p', fields: { id: 'str:16' }, rate: 0.7, burst: 3 },      // owner feedback 10, Y5: wave | sit | dance | cheer | bow | point
  meter:   { on: 'p', fields: { on: 'bool' }, rate: 1, burst: 4 },      // owner feedback 8, W21: the damage meter's per-hit feed (`hits`) on / off — off by default
  track:   { on: 'gw', fields: { char: 'int', off: '?bool' }, rate: 2, burst: 8 },      // owner feedback 10, Y36: follow where a party member / mutual friend is -> trackR, whereabouts (char 0 = stop all)
  delete:  { on: 'gw', fields: { char: 'int', name: 'str:24' }, rate: 0.5, burst: 3 },      // owner feedback 9, X6: delete a character (the typed name confirms it) -> deleted, then charList
  feedbackMine: { on: 'both', fields: { limit: '?int', before: '?int' }, rate: 1, burst: 5 },      // round 8, W29: my own reports -> feedbackMine (`feedback {op:'mine'}` is the same call)
  admin:   { on: 'both', fields: { op: 'str:16', id: '?int', state: '?str:16', kind: '?str:16', limit: '?int', before: '?int', note: '?str:500' }, rate: 2, burst: 10 },
  fish:    { on: 'p', fields: { op: 'str:8', aim: '?vec2', held: '?num', score: '?num', holds: '?nums', pool: '?id' }, rate: 4, burst: 8 },      // round 11 (P, live #12): `pool` = the fish pool E was pressed on (casting is only at a pool)
  cook:    { on: 'p', fields: { op: '?str:8', id: '?str:64', n: '?int' }, rate: 2, burst: 6 },
  // round 8 W9 (P-core, docs/protocol.md §25): professions — learn / gather / make. `inputs` = the mini-game's raw [t, v, t, v, …]
  prof:    { on: 'p', fields: { op: 'str:8', id: 'str:16', npc: 'id' }, rate: 2, burst: 6 },
  gather:  { on: 'p', fields: { op: 'str:8', id: '?id', inputs: '?nums' }, rate: 4, burst: 8 },
  craft:   { on: 'p', fields: { op: '?str:8', id: '?str:48', npc: '?id', base: '?str:48', n: '?int', uid: '?str:40', index: '?int', element: '?str:16', inputs: '?nums' }, rate: 4, burst: 10 },
  // round 11 (Market, owner #25; docs/protocol.md "Round 11 — Market"): browse | mine | sell {uid, price} | buy {id, price} | cancel {id}
  market:  { on: 'p', fields: { op: 'str:8', q: '?str:40', tab: '?str:8', slot: '?str:16', sort: '?str:8', page: '?int', uid: '?str:40', price: '?int', id: '?int' }, rate: 2, burst: 8 },
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
  zoneEvent: ['kind', 'ev'],
  quests: ['active', 'done'],
  questR: ['op', 'id', 'ok'],
  zone: ['zone', 'name', 'deeds'],
  travelR: ['ok', 'why', 'cost'],
  tradeState: ['trade', 'done', 'why'],
  // M3
  accountR: ['op', 'ok', 'why', 'msg', 'username', 'claimed', 'chars', 'moved', 'left'],
  friends: ['list'],
  friendState: ['char', 'name', 'cls', 'level', 'online', 'zone'],
  guildState: ['guild'],
  guildInvite: ['guild', 'name', 'from', 'ms'],
  guildR: ['op', 'ok', 'why', 'msg'],
  callboard: ['state'],
  reportR: ['ok', 'msg'],
  mailNew: ['unread'],
  mailList: ['mail', 'unread'],
  mailOpen: ['mail'],
  mailR: ['op', 'ok', 'why', 'msg'],
  marketList: ['list', 'total', 'page', 'per'],
  marketMine: ['list', 'cap', 'feePct', 'quotes'],
  marketR: ['op', 'ok'],
  muted: ['until', 'by', 'msg'],
  // play-test 1
  talentR: ['op', 'ok'],
  perkR: ['op', 'ok'],
  mapData: ['province', 'zones', 'places', 'events'],
  discover: ['places'],
  // play-test 2
  lootable: ['id', 'on'],
  lootWin: ['id'],
  lootR: ['op', 'ok'],
  lootRoll: ['roll', 'corpse', 'item', 'ms', 'members'],
  lootRolled: ['roll', 'item', 'rolls', 'winner'],
  shopView: ['npc', 'stock', 'buyback'],
  shopR: ['op', 'ok'],
  mountR: ['ok'],
  lookR: ['ok'],
  followR: ['id', 'ok'],
  inspectR: ['id', 'ok'],
  itemR: ['op', 'ok'],
  bindR: ['ok'],
  settings: ['data'],
  // play-test 5
  kitsR: ['cls', 'kits'],
  reviveAsk: ['id', 'from', 'fromId', 'skill', 'skillId', 'hpPct', 'ms', 'until', 'note'],
  reviveR: ['op', 'id', 'ok'],
  sheet: ['core', 'advanced', 'abilities', 'angling'],
  eventTrack: ['uid', 'id', 'name', 'state', 'what', 'objective', 'endsAt', 'leftMs', 'reward', 'inside'],
  eventDone: ['uid', 'id', 'name', 'result', 'credited', 'xp', 'gold', 'items', 'text'],
  eventAt: ['uid'],
  feedbackR: ['ok', 'id', 'first', 'why', 'msg', 'state', 'ref'],
  feedbackMine: ['ok', 'list', 'more', 'why'],
  // owner feedback 8 (docs/protocol.md §24)
  questMarks: ['marks', 'full'],
  deleted: ['ok', 'char', 'name', 'freeAt', 'returned', 'why', 'msg'],
  adminOnline: ['ok', 'at', 'count', 'accounts', 'list'],
  hits: ['l'],
  emoteR: ['id', 'ok', 'why', 'msg'],
  eventSync: ['live', 'realm', 'at'],
  trackR: ['ok', 'char', 'why', 'msg', 'tracking'],
  whereabouts: ['l'],
  cartList: ['id', 'from', 'name', 'stops', 'gold', 'tokens'],
  cartR: ['op', 'ok', 'to', 'fare', 'why', 'msg'],
  cartRide: ['to', 'from', 'ms', 'fare'],
  meterR: ['on'],
  adminReports: ['list', 'counts'],
  adminR: ['op', 'ok', 'id', 'state'],
  fishR: ['ok', 'state', 'at', 'why', 'msg'],
  fishBite: ['ms'],
  fishTug: ['ms', 'band', 'pull', 'jitter', 'need', 'rarity'],
  fishCatch: ['ok', 'lost', 'kind', 'item', 'species', 'size', 'record', 'skill'],
  cookList: ['fire', 'recipes'],
  cookR: ['ok', 'item', 'items', 'msg'],
  // round 8 W9 (P-core)
  profR: ['op', 'ok', 'id', 'why', 'msg', 'tool'],
  gatherR: ['ok', 'state', 'id', 'prof', 'node', 'game', 'why', 'msg'],
  gatherDone: ['ok', 'id', 'prof', 'quality', 'score', 'marks', 'items', 'got', 'xp', 'skill', 'key', 'reopenMs', 'msg'],
  skinnable: ['id', 'on', 'tier', 'minSkill', 'name'],
  craftList: ['ok', 'station', 'level', 'recipes'],
  craftR: ['ok', 'state', 'id', 'game', 'cost', 'why', 'msg'],
  craftDone: ['ok', 'id', 'prof', 'quality', 'score', 'marks', 'items', 'got', 'item', 'xp', 'skill', 'msg'],
  craftQuote: ['ok', 'id', 'uid', 'can', 'why', 'needs', 'gold', 'text'],
});
/** Play-test 5: feedback kinds + report states (T19/T21), revive answers (T4), fishing ops (T25). */
export const FEEDBACK_KINDS = Object.freeze(['suggestion', 'bug']);
export const FEEDBACK_STATES = Object.freeze(['new', 'approved', 'declined', 'trashed', 'completed']);      // completed (round 8, W28): the fix is live; its note says how it was fixed
export const REVIVE_OPS = Object.freeze(['accept', 'decline']);
export const FISH_OPS = Object.freeze(['cast', 'hook', 'land', 'stop', 'cancel']);
export const ADMIN_OPS = Object.freeze(['reports', 'feedback', 'report', 'state', 'online']);      // online: owner feedback 9, X1
/** Talent ops (`talent {op}`) and perk ops (`perk {op}`), province socket (P6). */
export const TALENT_OPS = Object.freeze(['pick', 'clear']);
export const PERK_OPS = Object.freeze(['take', 'refund', 'reset']);

/** Party ops (`party {op}`); docs/protocol.md §3.3. */
export const PARTY_OPS = Object.freeze(['invite', 'accept', 'decline', 'leave', 'kick', 'lead', 'join', 'code', 'group', 'loot']);
/** Loot ops (`loot {op}`), shop ops (`shop {op}`), mount ops (`mount {op}`), display prefs (`pref {k}`), play-test 2. */
export const LOOT_OPS = Object.freeze(['open', 'take', 'all', 'close', 'roll']);
/** Shop op aliases D-UI's first draft used ('list' = open, 'buyback' = back, 'repair' = refused: no durability). */
export const ROLL_CHOICES = Object.freeze(['need', 'greed', 'skip']);
export const SHOP_OPS = Object.freeze(['open', 'buy', 'sell', 'back', 'list', 'buyback', 'repair']);
export const MOUNT_OPS = Object.freeze(['summon', 'off', 'cancel', 'pick']);      // pick {id} (round 11, #44): the mount in the Mount slot      // cancel (round 8, W26): stop the call, stay on foot
export const PREF_KEYS = Object.freeze(['showGear', 'showHelm']);
/** Party loot thresholds (`party {op:'loot', code}`), lowest first; Farhold's rarity ladder. */
export const LOOT_MINS = Object.freeze(['magic', 'rare', 'legendary', 'unique']);   // = C's js/rules/loot-rules.js LOOT_THRESHOLDS ('epic' -> legendary)
export const PARTY_MAX = 5;
/** Item ops (`item {op}`). */
export const ITEM_OPS = Object.freeze(['equip', 'unequip', 'destroy', 'use', 'stand', 'open', 'split', 'merge']);   // split {uid, n} / merge {uid, onto}: consumable stacks   // open (play-test 5 T9): a crate / gift box (= use)   // stand (play-test 4 S20): get up from a meal   // use: potions + food (uid, or 'id:<item id>' for a hotbar slot)
/** Chat channels a client may send on the gateway (`say` is local, on the province socket; `w` = whisper, needs `to`).
 *  The server also sends `system` lines (admin announcements). */
export const CHAT_CHANNELS = Object.freeze(['party', 'guild', 'zone', 'trade', 'world', 'w']);
/** Mail ops (`mail {op}`, province socket). */
export const MAIL_OPS = Object.freeze(['list', 'read', 'send', 'take', 'return', 'delete']);
/** Market ops (`market {op}`, province socket; round 11, owner #25). */
export const MARKET_OPS = Object.freeze(['browse', 'mine', 'sell', 'buy', 'cancel']);
/** Room kinds (`joined.room.kind`). */
export const ROOM_KINDS = Object.freeze(['wilds', 'town', 'instance']);

export const EVENT_TYPES = Object.freeze(['cast', 'hit', 'miss', 'die', 'xp', 'level', 'loot', 'aggro', 'fx', 'open',
  'tele', 'teleR', 'teleM', 'castbar', 'castX', 'phase', 'enrage', 'say', 'obj', 'boss', 'mp', 'emote']);      // teleM (C, round 10 Y12): a wind-up moved with its caster; emote (Y5)

/**
 * Event fields (docs/protocol.md §6, encounter rows from docs/encounters.md §7). Every event also has
 * `type`, and `x, z` (the room fills them in). Ids are local room entity ids. `?` = optional.
 */
export const EVENT_FIELDS = Object.freeze({
  cast: ['s', 'slot?', 'skill', 'aim?', 'target?', 'every?', 'clip?', 'wk?', 'wt?', 'el?', 'two?', 'hand?', 'step?', 'wind?', 'reach?', 'arc?', 'strike?'],
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
  teleM: ['id', 'x', 'z'],
  emote: ['id', 'e', 'ms?', 'end?'],
  castbar: ['id', 'ab', 'name', 'ms', 'int?'],
  castX: ['id', 'ab', 'why'],
  phase: ['id', 'n', 'name?', 'bar', 'hpMax?', 'reset?'],
  enrage: ['id', 'soft?', 'hard?'],
  say: ['id', 'text', 'style'],
  obj: ['id', 'state?', 'otype?', 'r?', 'key?', 'hp?', 'gone?'],
  boss: ['id', 'name?', 'title?', 'bars?', 'phases?', 'enrageMs?', 'arena?', 'end?', 'won?'],
  mp: ['id', 'n', 'max'],                  // play-test 3 R6+: a player's mana, <= 2 Hz, only on change
});
/** Telegraph shapes (`tele.shape`) and object states (`obj.state`, `info.state`). */
export const TELE_SHAPES = Object.freeze(['circle', 'ring', 'donut', 'cone', 'line', 'cross']);
export const OBJ_STATES = Object.freeze(['idle', 'lit', 'used', 'broken', 'open', 'closed']);
export const OBJ_TYPES = Object.freeze(['portal', 'stairs', 'exit', 'chest', 'gate', 'lever', 'pillar', 'rock', 'brazier', 'pool', 'cracked_floor', 'sarcophagus', 'support_beam', 'ore_cart',
  'door', 'lift', 'fishpool', 'node']);      // play-test 6: the way you came in (U10), the stair up that asks which floor (U12); play-test 5 fish pools

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
