// Play-test 10 (stream D-UI) — the pure half: no DOM, no storage, no three.js. Node-tested in tests/D/pt10.test.js.
//   Y37 one row per party member · Y11 events the server no longer lists · Y30 the changelog · Y36 tracking a player,
//   edge arrows · Y22 quests with no place · Y16/Y26 hand + attack-speed lines · Y5 emotes · Y29 the title's states

// ------------------------------------------------------------------------------------------ Y37: the party, once each
const same = (a, b) => a != null && b != null && String(a) === String(b);
/**
 * The party's members, one row per character (report S#55: after a reconnect the player's OWN character was listed at
 * the bottom of the party). Two causes are closed here whatever the server sends: a member listed twice (the row that
 * is online wins), and "which one is me" being unknown for a moment after a reconnect (`party.me` from the server, else
 * the id we joined with, else — as the last resort — our own name).
 * -> { all: [...], others: [...], me: <member|null> }
 */
export function partyRows(party, { me = null, name = null } = {}) {
  const all = [];
  for (const m of party?.members || []) {
    if (!m || m.char == null) continue;
    const i = all.findIndex(x => same(x.char, m.char));
    if (i < 0) all.push(m); else if (m.online && !all[i].online) all[i] = m;
  }
  const mine = party?.me ?? me;
  let self = mine != null ? all.find(m => same(m.char, mine)) || null : null;
  if (!self && name) { const named = all.filter(m => m.name === name); if (named.length === 1) self = named[0]; }
  return { all, others: all.filter(m => m !== self), me: self };
}

// ------------------------------------------------------------------------------- Y11: events the server no longer lists
/** Is this event in the server's `eventSync {live:[uid…], realm}`? `e` = { uid?, id?, key?, scope? }. */
export function eventListed(e, sync) {
  if (!e || !sync) return true;                                  // no list: nothing to say
  const live = new Set((sync.live || []).map(String));
  if (sync.realm != null) live.add(String(sync.realm));
  for (const k of [e.uid, e.id, e.key]) if (k != null && live.has(String(k))) return true;
  if ((e.scope === 'realm' || e.realm || e.key === 'realm') && sync.realm != null) return true;
  return false;
}
/**
 * Which of the events we are showing must go (report #35: a finished siege stayed on the HUD after a disconnect, and
 * "Travel there free" answered "Nothing is happening right now")? Everything that claims to be RUNNING and is not in
 * the server's list. A countdown ("starts in 2 minutes") stays until its time has passed by half a minute; a result
 * card ("Won: …") stays until its own timer takes it away.
 * `entries` = [{ key, uid?, id?, scope?, state?, at? }] -> [key…]
 */
export function staleEvents(entries, sync, now = Date.now()) {
  const out = [];
  for (const e of entries || []) {
    const st = e.state || 'live';
    if (st === 'won' || st === 'lost' || st === 'cooldown' || st === 'ready') continue;
    if (st === 'soon') { if (Number.isFinite(e.at) && now - e.at > 30000 && !eventListed(e, sync)) out.push(e.key); continue; }
    if (!eventListed(e, sync)) out.push(e.key);
  }
  return out;
}

// ----------------------------------------------------------------------------------- Y29: the title's front card
/**
 * What the front card ("Your characters") shows. Report #37: while the character list was still on its way the title
 * showed the NEW-character form, and with no characters it dropped you straight into creation.
 *   loading  a browser that has an account, list not here yet: a "finding your characters" line and nothing to click
 *   list     the characters + "New character"
 *   empty    no characters (a new visitor, an empty account, or the server did not answer): one "Create character" button
 */
export function titleFront({ hasToken = false, loaded = false, failed = false, count = 0 } = {}) {
  if (hasToken && !loaded && !failed) return { state: 'loading', button: '', note: 'Finding your characters…' };
  if (loaded && count > 0) return { state: 'list', button: 'New character', note: '' };
  if (failed) return { state: 'empty', button: 'Create character', note: 'The game server did not answer, so your characters are not listed. You can still make a new one.' };
  return { state: 'empty', button: 'Create character', note: loaded ? 'You have no characters yet.' : 'New here? Make a character — or log in to an account you already have.' };
}
/** Which character the title's figure shows first: the one played last on this browser, else the first in the list. */
export function titleFirstChar(chars = [], lastId = null, lastName = null) {
  if (!chars.length) return null;
  return chars.find(c => lastId != null && String(c.id) === String(lastId)) || chars.find(c => lastName && c.name?.toLowerCase() === String(lastName).toLowerCase()) || chars[0];
}
/**
 * The look the title's figure is built from: the character's SAVED look and the gear it wears (the server's `gear` on
 * the row when it sends it, else what this browser last saw the character wearing). With neither, the gear key is left
 * out — the body builder then dresses the saved face in its calling's plain outfit rather than in nothing.
 */
export function titleCharLook(c, { remembered = null } = {}) {
  if (!c) return null;
  const base = c.look && (c.look.race || c.look.avatar || c.look.custom || c.look.body) ? { ...c.look } : { seed: (Number(c.id) >>> 0) || 1 };
  const gear = c.gear && typeof c.gear === 'object' ? c.gear : remembered && typeof remembered === 'object' ? remembered : null;
  const out = { ...base, cls: c.cls || base.cls };
  if (gear) out.gear = gear; else delete out.gear;
  return out;
}

// ------------------------------------------------------------------------------------------------ Y30: the changelog
/**
 * The changelog as the window shows it. `entries` = the lead's data/ops/changelog.json list, NEWEST FIRST; an entry is
 * newer than `seen` when it comes before it in that list (ids are dates today, but only their place is compared — the
 * same rule the server uses). `seen` null/unknown = a first visit: nothing is "new" (a new player gets no "the game was
 * updated" popup), and the caller should store `latest` as seen.
 * -> { rows: [{ id, date, title, items, isNew }], unseen, latest, first }
 */
export function changelogView(entries, seen = null) {
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.id != null && Array.isArray(e.items));
  const latest = list.length ? String(list[0].id) : null;
  const at = seen == null ? -1 : list.findIndex(e => String(e.id) === String(seen));
  const first = at < 0;
  const rows = list.map((e, i) => ({ id: String(e.id), date: e.date || '', title: e.title || '', items: e.items.map(String), isNew: !first && i < at }));
  return { rows, unseen: rows.filter(r => r.isNew).length, latest, first };
}
/** The newer of two markers (the account's and this browser's), by place in the list. */
export function changelogNewer(entries, a, b) {
  const idx = id => (id == null ? Infinity : (i => (i < 0 ? Infinity : i))((entries || []).findIndex(e => String(e.id) === String(id))));
  return idx(a) <= idx(b) ? (idx(a) === Infinity ? null : String(a)) : String(b);
}
/** "8 October 2026" from "2026-10-08" (no Date parsing: the string is the lead's, and time zones must not move it). */
export function changelogDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return String(s || '');
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1];
  return M ? `${+m[3]} ${M} ${m[1]}` : String(s);
}
/** The popup's line: "2 updates since you last played" / "1 update since you last played". */
export const changelogPopupText = n => `${n} update${n === 1 ? '' : 's'} since you last played.`;

// ------------------------------------------------------------------------------- Y36: where are my friends (tracking)
export const TRACK_MAX = 5;          // the server follows up to five people for you
export const TRACK_NEAR_M = 25;      // "until you are near": inside this the arrow goes away
/** One `whereabouts` row `[char, name, province, zoneName, town, x, z, roomKind, level, cls]` as an object. */
export function whereRow(r) {
  if (!Array.isArray(r)) return null;
  const [char, name, province, zoneName, town, x, z, roomKind, level, cls] = r;
  return { char, name: name || 'Someone', province: province || null, zoneName: zoneName || null, town: town || null, x: +x, z: +z, roomKind: roomKind || null, level: level || null, cls: cls || null };
}
/** Is a room an instance (a dungeon / a private floor)? Its coordinates are its own, not the world's: no map marker. */
export const isInstance = room => typeof room === 'string' ? /^i:|^d:|dungeon|instance/.test(room) : false;
/** "Torborhold" / "Torbor Downs" / "In a dungeon" / "Offline" — where someone is, in a few words. */
export function whereText(p = {}) {
  if (p.online === false) return 'Offline';
  if (p.dead) return 'Fallen';
  if (p.roomKind === 'instance' || p.roomKind === 'dungeon' || isInstance(p.room)) return 'In a dungeon';
  return p.town || p.zoneName || (p.province ? String(p.province).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '') || '';
}
/**
 * The rows of the map's PARTY section — every member, yourself first, each with what a "zoom to" button needs.
 *   party   net.party ({ members, leader, me })        frames  the last partyFrames rows ({ char, room, x, z, dead, online })
 *   self    { char, name, x, z, level, cls, room }     tracked Set of char ids being tracked
 *   where   Map(char -> whereabouts row) for members the frames cannot place
 */
export function partyPeople({ party = null, frames = [], self = {}, tracked = new Set(), where = new Map(), bodies = null } = {}) {
  const P = partyRows(party, { me: self.char, name: self.name });
  const out = [];
  const meRow = P.me || (self.char != null || self.name ? { char: self.char, name: self.name, level: self.level, cls: self.cls, online: true } : null);
  if (meRow) out.push({ char: meRow.char, name: meRow.name || self.name || 'You', self: true, level: self.level || meRow.level || null, cls: self.cls || meRow.cls || null, online: true,
    x: self.x, z: self.z, placed: Number.isFinite(self.x) && Number.isFinite(self.z) && !isInstance(self.room), where: 'You', leader: party ? same(party.leader, meRow.char) : false, tracked: false, canTrack: false });
  for (const m of P.others) {
    const f = frames.find(r => same(r.char, m.char)) || null, w = where.get(m.char) || where.get(String(m.char)) || null, b = bodies?.(m.char, f) || null;
    const online = f ? !!f.online : m.online !== false;
    const inst = f ? isInstance(f.room) : w ? (w.roomKind === 'instance' || w.roomKind === 'dungeon') : false;
    const x = b ? b.x : f && Number.isFinite(f.x) ? f.x : w ? w.x : NaN, z = b ? b.z : f && Number.isFinite(f.z) ? f.z : w ? w.z : NaN;
    const placed = online && Number.isFinite(x) && Number.isFinite(z) && !inst;      // a dungeon's coordinates are its own: no spot on the world map
    const dist = placed && Number.isFinite(self.x) ? Math.hypot(x - self.x, z - self.z) : null;
    out.push({ char: m.char, name: m.name || 'Party member', self: false, level: m.level || w?.level || null, cls: m.cls || w?.cls || null, online, dead: !!f?.dead,
      x, z, placed, dist, where: whereText({ online, dead: f?.dead, room: f?.room, roomKind: w?.roomKind, town: w?.town, zoneName: w?.zoneName, province: w?.province }),
      leader: party ? same(party.leader, m.char) : false, tracked: tracked.has(m.char) || tracked.has(String(m.char)), canTrack: online });
  }
  return out;
}
/** "240 m north-east" needs the caller's compass; this is just the distance: "240 m" / "1.2 km". */
export function metresText(d) {
  if (!Number.isFinite(d)) return '';
  return d >= 1000 ? `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)} km` : `${Math.max(0, Math.round(d / 5) * 5)} m`;
}
/** Why the server would not track someone, in words (`trackR.why`). */
export const TRACK_WHY = { notFriend: 'You can only track a party member or a friend who has added you back.', offline: 'They are offline.', hidden: 'They have switched off sharing where they are.', full: `You can track ${TRACK_MAX} people at once. Stop tracking someone first.` };
export const trackRefusal = r => r?.msg || TRACK_WHY[r?.why] || 'You cannot track them right now.';

/**
 * An arrow on the EDGE of a rectangle pointing at something outside it (or too close to its edge to notice).
 *   (sx, sy) the target in the rectangle's own pixels · (w, h) its size · margin: how far in from the edge the arrow sits
 *   near: a target closer than this to an edge still gets an arrow (0 = only when it is outside)
 * -> null when the target is comfortably on screen, else { x, y, angle (radians, 0 = pointing right), outside }
 */
export function edgeArrow(sx, sy, w, h, { margin = 26, near = 0 } = {}) {
  if (!(w > 0 && h > 0) || !Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const outside = sx < 0 || sy < 0 || sx > w || sy > h;
  if (!outside && sx >= near && sy >= near && sx <= w - near && sy <= h - near) return null;
  const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
  if (!dx && !dy) return null;
  const hx = Math.max(1, cx - margin), hy = Math.max(1, cy - margin);
  const k = Math.min(hx / Math.abs(dx || 1e-9), hy / Math.abs(dy || 1e-9));
  const t = Math.min(1, k);
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx), outside };
}
/**
 * The HUD's arrow for a tracked player: which way to turn, as a screen angle. `camYaw` = the camera's heading (the way
 * the screen's "up" points in the world, radians, 0 = +z as in controls.js); the target lies at world bearing
 * atan2(dx, dz). -> { angle (0 = right, -PI/2 = straight ahead/up), dist } or null when near.
 */
export function trackBearing(me, target, camYaw = 0, nearM = TRACK_NEAR_M) {
  if (!me || !target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  const dx = target.x - me.x, dz = target.z - me.z, dist = Math.hypot(dx, dz);
  if (dist < nearM) return null;
  const rel = Math.atan2(dx, dz) - camYaw;                 // 0 = dead ahead, + = to the right
  return { angle: rel - Math.PI / 2, rel, dist };
}

// ------------------------------------------------------------------------------------------------------ Y5: emotes
/** The emotes the server knows (A: `emote {id}`), with the chat command and the wheel's label. */
export const EMOTES = Object.freeze([
  { id: 'wave', cmd: '/wave', label: 'Wave' }, { id: 'sit', cmd: '/sit', label: 'Sit' }, { id: 'dance', cmd: '/dance', label: 'Dance' },
  { id: 'cheer', cmd: '/cheer', label: 'Cheer' }, { id: 'bow', cmd: '/bow', label: 'Bow' }, { id: 'point', cmd: '/point', label: 'Point' },
]);
/** `/wave` -> 'wave' (also without the slash, any case); null when it is not an emote. */
export function emoteFor(cmd) { const k = String(cmd || '').trim().replace(/^\//, '').toLowerCase(); return EMOTES.find(e => e.id === k)?.id || null; }
export const EMOTE_WHY = { dead: 'Not while you are down.', swimming: 'Not while swimming.', mounted: 'Get down from your mount first.', combat: 'Not in the middle of a fight.', fighting: 'Not in the middle of a fight.', rate: 'Give it a moment.', unknown: 'Nobody knows that gesture.' };
export const emoteRefusal = r => r?.msg || EMOTE_WHY[r?.why] || 'You cannot do that right now.';

// --------------------------------------------------------------------------- Y16 / Y26: hands and attack speed on a card
/** The hand line of an item card: the rules' own words (`item.handText`, C round 10). Never Farhold's numeric `hands`. */
export function handLine(it) {
  if (!it) return '';
  if (typeof it.handText === 'string' && it.handText) return it.handText;
  const hnd = it.hand;
  return hnd === 'main' ? 'Main hand' : hnd === 'off' ? 'Off hand' : hnd === 'one' ? 'One-hand' : hnd === 'two' ? 'Two-hand' : '';
}
/** The attack-speed line under a weapon's damage ("1.6 attacks per second"); nothing for an orb (`noAttack`). */
export function apsLine(it) {
  if (!it || it.noAttack) return '';
  if (typeof it.apsText === 'string' && it.apsText) return it.apsText;
  return Number.isFinite(it.aps) && it.aps > 0 ? `${(+it.aps).toFixed(2).replace(/\.?0+$/, '')} attacks per second` : '';
}
/** May the damage line be shown? An orb / focus has no attack of its own. */
export const showsDamage = it => !!it && !it.noAttack;

/**
 * Y16 (reports #31 #32): may this item go in that hand? null = yes, else the reason in the rules' own words
 * ("Storm Tome is a main-hand weapon — it cannot go in the off hand."). The server's `itemR {why:'hand'}` has the
 * last word; this only saves the round trip. `slot` = 'weapon' | 'offhand'.
 */
export function handRefusal(it, slot) {
  if (!it || !it.hand || (slot !== 'weapon' && slot !== 'offhand')) return null;
  const name = it.name || 'That';
  if (slot === 'offhand' && it.hand === 'main') return `${name} is a main-hand weapon — it cannot go in the off hand.`;
  if (slot === 'weapon' && it.hand === 'off') return `${name} is an off-hand item — it cannot go in the main hand.`;
  return null;
}
