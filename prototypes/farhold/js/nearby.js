// Farhold — what is going on within walking distance, as a list.
//
//   "Add a 'Nearby Activities' area below the minimap when walking around, similar to World of
//    Warcraft's quest log. It should show what nearby activities are available including the ones
//    that pop up in chat or have a location nearby. These should also appear in the journal with a
//    button to view location."
//
// The game already knows all of this and never said any of it in one place. `encounters.events`
// (js/encounters.js:428) returns every road event running right now, each with a position, a clock
// and a reward — a finished activity feed that nothing read. `js/caravans.js` knows which load is
// under attack and where. `roadFolk` knows which four people with offers are standing on the road
// and said nothing at all. The one thing the player actually got was a sentence in a twelve-line
// log that scrolled away during the next fight.
//
// Pure JavaScript: arrays in, array out. No DOM, no Three.js, so the node tests drive the same code
// the game does and the sort order is something you can assert rather than something you squint at.
//
//   import { nearbyList } from './nearby.js';
//   const rows = nearbyList({ events, sites, caravans, folk, markers, meteors, at, wrapM });

import { compassTo } from './ambient.js';
import { distanceText } from './markers.js';

/**
 * One glyph a kind. Deliberately the same glyphs the map and the minimap use where there is
 * already one — an impact is `☄` in MARKER_LOOKS and it must not be something else here.
 */
export const NEARBY_ICONS = {
  event: '⌛',      // ⌛ something with a clock on it
  foe: '☠',        // ☠ a rare, a champion, a named thing
  fall: '☄',       // ☄ an impact site
  person: '◈',     // ◈ somebody with an offer
  caravan: '▣',    // ▣ a load on the road
  site: '⚑',       // ⚑ a hostile place
  quest: '!',           // a job you are already carrying
};

/**
 * A row's clock decides where it sorts, not only how it reads.
 *
 * Anything with under this many seconds left goes to the top whatever the distance — a rescue you
 * are about to fail is the thing you need to see, and it is hardly ever the nearest thing. That one
 * exception is the whole difference between a useful panel and an annoying one.
 */
export const URGENT_SECONDS = 30;

/** Metres past which something stops being "nearby" and becomes somebody else's problem. */
export const NEARBY_RANGE = 1600;

/** Shortest way round a world that wraps east to west. */
function offset(ax, az, bx, bz, wrapM = 0) {
  let dx = ax - bx;
  if (wrapM > 0) {
    if (dx > wrapM / 2) dx -= wrapM;
    if (dx < -wrapM / 2) dx += wrapM;
  }
  return [dx, az - bz];
}

/**
 * Everything worth a row, nearest first, clocks first.
 *
 * Every argument is optional: a caller that has no caravans passes none rather than passing an
 * empty shape it had to build. `at` is the player in world metres.
 */
export function nearbyList({
  events = [], sites = [], caravans = [], folk = [], quests = [], meteors = [],
  at = { x: 0, z: 0 }, wrapM = 0, range = NEARBY_RANGE, limit = 5,
} = {}) {
  const rows = [];
  const add = (row, x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const [dx, dz] = offset(x, z, at.x, at.z, wrapM);
    const distance = Math.hypot(dx, dz);
    if (distance > range) return;
    rows.push({ ...row, x, z, distance, compass: compassTo(dx, dz), where: distanceText(distance) });
  };

  // road events: a clock, a place and a reward. This is the feed nothing was reading.
  for (const e of events) {
    add({
      id: 'ev:' + e.id, kind: 'event', name: e.name || 'Something on the road',
      ttl: e.left ?? null, state: e.sprung ? 'sprung' : 'go now',
    }, e.x, e.z);
  }
  // a meteor still in the air, or a crater with a crate in it
  for (const m of meteors) {
    add({
      id: 'fall:' + Math.round(m.x) + ',' + Math.round(m.z), kind: 'fall', name: 'Impact site',
      ttl: m.secondsLeft ?? null, state: 'still hot',
    }, m.x, m.z);
  }
  // a load being taken apart on the road is the clearest thing you can run to
  for (const c of caravans) {
    add({
      id: 'car:' + (c.id ?? c.name), kind: 'caravan', name: c.name || 'A load on the road',
      ttl: null, state: c.state || 'on the road',
    }, c.x, c.z);
  }
  // people with offers. They never said a word before — a row and no line is the right trade.
  for (const p of folk) {
    if (!p.offer && !p.wants) continue;
    add({
      id: 'who:' + (p.id ?? p.name), kind: 'person', name: p.name || 'Somebody on the road',
      ttl: null, state: p.offer || p.wants || '',
    }, p.x, p.z);
  }
  // somewhere hostile you can see from here
  for (const s of sites) {
    if (s.cleared) continue;
    add({
      id: 'site:' + (s.key ?? s.id), kind: s.worldBoss ? 'foe' : 'site',
      name: s.name || 'A camp', ttl: null,
      state: s.worldBoss ? 'far bigger than you' : (s.spec?.name || 'hostile'),
    }, s.x, s.z);
  }
  // and the jobs you are already carrying, so the panel is the whole answer to "what now"
  for (const q of quests) {
    if (!q.place || q.done) continue;
    add({
      id: 'q:' + q.id, kind: q.markerKind === 'fall' ? 'fall' : 'quest',
      name: q.title || 'A job', ttl: null, state: q.progress || '',
    }, q.place.x, q.place.z);
  }

  /**
   * Nearest first — with the one exception above. Ties break on `id` so the order is stable and
   * rows do not swap places while the player walks, which is what makes a panel unreadable.
   */
  rows.sort((a, b) => {
    const au = a.ttl != null && a.ttl <= URGENT_SECONDS;
    const bu = b.ttl != null && b.ttl <= URGENT_SECONDS;
    if (au !== bu) return au ? -1 : 1;
    if (au && bu) return a.ttl - b.ttl || a.id.localeCompare(b.id);
    return a.distance - b.distance || a.id.localeCompare(b.id);
  });

  const shown = rows.slice(0, Math.max(0, limit));
  return Object.assign(shown, { total: rows.length, more: Math.max(0, rows.length - shown.length) });
}

/** "1:04", or "0:07". The panel turns it amber under 20 s and red under 8. */
export function mmss(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
