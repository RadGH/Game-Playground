// Farhold — the full-screen map, on the M key.
//
// This is World Forge's own renderer, not a second one: `renderWorld()` already draws biomes,
// hillshade, rivers, roads, settlements, labels and region borders, and already has every debug
// layer (elevation, temperature, moisture, drainage, aura, magic and now weather). The map screen
// hands it a canvas and then draws three things of its own on top: where you are, where your pins
// are, and what is hunting you.
//
//   const map = createMapScreen({ terrain, getPlayer, getEnemies, onTeleport });
//   map.toggle();          // or press M
//
// Opening it releases the mouse, so the map can be clicked. Shift-click drops a pin.

import { el, panel, button } from '../../../shared/ui.js';
// D2: one wording for a location, and one way of getting it onto the clipboard. The debug menu owns
// both so the two screens can never drift apart — see the notes there for why `execCommand` is in it.
import { locationLine, copyTextVia, COPY_WORDS } from './debug.js';
import { layersPanel } from '../../../worldgen/js/layers-panel.js';
import { zoneTone } from './zones.js';
import { MARKER_LOOKS, MARKER_VIEWS, distanceText, worldKey } from './markers.js';
// R17 — item 20: an outpost's marker is made and kept in step by the module that knows what an
// outpost IS, not by this screen. See `syncOutpostMarkers` for why it is locked.
import { syncOutpostMarkers, renameOutpostMarker } from './outposts.js';
// R17 — item 9: the hit-test is its own pure module, so the node tests drive the resolver the game
// uses rather than a second copy of it. The whole of why is at the top of that file.
import { pickHit, markHitRadius } from './map-hits.js';
import { registerTip, refreshTip, tipOpen } from '../../../shared/tooltip.js';

/**
 * R17 — the map's own stylesheet, injected rather than linked.
 *
 * Every rule in `map17.css` is either reserving space so the canvas cannot be resized by something
 * underneath it (item 8) or styling a row this round added. It is injected here, the way
 * js/civics-ui.js injects civics.css, so a whole round of map work touches neither index.html nor
 * style.css — both of which belong to other passes, and a concurrent write to either loses work.
 */
const MAP_CSS_HREF = 'map17.css';
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${MAP_CSS_HREF}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAP_CSS_HREF;
  document.head.appendChild(link);
}

/** The wash each danger step puts over a region, and the colour its number is written in. */
const TONE_RGB = {
  trivial: [120, 132, 150], easy: [90, 200, 130], even: [230, 200, 90],
  hard: [235, 150, 70], deadly: [235, 70, 60],
};
const TONE_TEXT = {
  trivial: '#aab6c6', easy: '#8fe0a0', even: '#ffe08a', hard: '#ffa860', deadly: '#ff6a5a',
};
const TONE_LABELS = [
  ['trivial', 'far below you'], ['easy', 'easy'], ['even', 'a fair fight'],
  ['hard', 'dangerous'], ['deadly', 'do not go here yet'],
];
/**
 * 4.11: ONE TABLE OF MARKS, AND THE KEY IS DRAWN FROM IT.
 *
 * "Update the map icons to have a legend, I want to be able to clearly see towns and their size at
 * a glance, as well as dungeons/caves with other icons."
 *
 * Before this the map drew a purple triangle for every dungeon mouth, an orange dot for every camp
 * and whatever World Forge's own node layer felt like underneath — a cave, a dungeon and a bandit
 * camp were three dots you could not tell apart, the five sizes of settlement were three shades of
 * cream, and the key under the canvas named three of the fifteen things on screen.
 *
 * So there is one table. `drawMark()` is the only thing that puts a place on the map AND the only
 * thing that fills a swatch in the key, which means the key cannot drift from the map: if a mark
 * changes shape, the swatch changes with it.
 *
 * The settlement ladder is a deliberate silhouette family — the same square growing, then a ring
 * around the two biggest, then a star for a capital — because "at a glance" is about size, and five
 * unrelated shapes would have to be learnt instead of read.
 */
/**
 * R14 — the ring `locate()` draws, by what it was asked to find. One table so the journal, the
 * notice board and the Find list all get the same colour for the same kind of thing.
 */
export const FOCUS_COLOURS = {
  quest: '#ffd24a', saved: '#8fe0a0', seam: '#c08a3e', fall: '#ff8a40',
  pad: '#6ad0ff', base: '#9ae06a', place: '#ffffff',
};

export const MAP_MARKS = {
  // 5.1's world bosses (js/sites.js `family: 'worldboss'`) are another agent's work this round, and
  // this file owns every mark on the map — so one is kept for them here. It is first in the order,
  // which is what puts it on top of whatever else stands on the same ground.
  worldboss: { label: 'world boss',     group: 'Beware',      shape: 'burst',  r: 6.0, fill: '#ff3a3a', line: '#2a0808', ring: true },

  capital:   { label: 'capital',        group: 'Settlements', shape: 'star',   r: 5.4, fill: '#ffe08a', line: '#3a2a10', ring: true },
  city:      { label: 'city',           group: 'Settlements', shape: 'square', r: 4.4, fill: '#f6f0e2', line: '#2a2a2a', ring: true },
  town:      { label: 'town',           group: 'Settlements', shape: 'square', r: 3.4, fill: '#e8ddc4', line: '#2a2a2a' },
  village:   { label: 'village',        group: 'Settlements', shape: 'square', r: 2.6, fill: '#c9bfa4', line: '#2a2a2a' },
  hamlet:    { label: 'hamlet',         group: 'Settlements', shape: 'square', r: 1.9, fill: '#a79e8a', line: '#2a2a2a' },
  port:      { label: 'port',           group: 'Settlements', shape: 'anchor', r: 3.2, fill: '#8fd3ff', line: '#123045' },

  dungeon:   { label: 'dungeon',        group: 'Underground', shape: 'gate',   r: 4.2, fill: '#c090ff', line: '#1d1030' },
  cave:      { label: 'cave',           group: 'Underground', shape: 'mouth',  r: 3.8, fill: '#c2a98a', line: '#241a12' },
  lair:      { label: 'beast lair',     group: 'Underground', shape: 'fang',   r: 4.0, fill: '#ff6a3a', line: '#2a1210' },
  cleared:   { label: 'already cleared', group: 'Underground', shape: 'gate',  r: 4.2, fill: '#5c6a7a', line: '#151b22' },

  camp:      { label: 'camp or stockade', group: 'Held ground', shape: 'tent', r: 3.6, fill: '#ffa860', line: '#2a1708' },
  fort:      { label: 'fort or tower',    group: 'Held ground', shape: 'keep', r: 4.2, fill: '#ff6a3a', line: '#2a1208' },
  castle:    { label: 'castle',           group: 'Held ground', shape: 'keep', r: 5.0, fill: '#ff4a4a', line: '#2a0c0c' },
  landmark:  { label: 'landmark',         group: 'Held ground', shape: 'pip',  r: 3.0, fill: '#8fd0ff', line: '#10283a' },
  pass:      { label: 'mountain pass',    group: 'Held ground', shape: 'cross', r: 3.0, fill: '#d8d2c4', line: '#2a2a2a' },

  /**
   * R14 — TEN OF WORLD FORGE'S ELEVEN LANDMARK KINDS WERE NOT ON THE MAP AT ALL.
   *
   *   "The legend also does not seem to line up with the actual icons used on the map very well."
   *
   * `markFor` tested `node.family === 'landmark'` — and a World Forge node has no `family`, only a
   * `type`. So a volcano, a waterfall, an ancient wood, a battlefield, a crater, a monolith, a
   * shrine, a tower, a ruin and a vent were all on the planet, all named, all in `world.nodes`, and
   * every one of them fell through to `return null` and was never drawn. `cave` survived by pure
   * accident, because of an unrelated `node.kind === 'cave'` line further down.
   *
   * They get their own marks rather than one shared blue pip, because the whole complaint was that
   * the map does not tell you what you are looking at.
   */
  volcano:   { label: 'volcano',          group: 'Landmarks', shape: 'peak',  r: 4.2, fill: '#ff7a3a', line: '#2a1006' },
  waterfall: { label: 'waterfall',        group: 'Landmarks', shape: 'fall',  r: 3.4, fill: '#8fd3ff', line: '#123045' },
  ancientwood: { label: 'ancient wood',   group: 'Landmarks', shape: 'tree',  r: 3.6, fill: '#7ac86a', line: '#12280e' },
  battlefield: { label: 'battlefield',    group: 'Landmarks', shape: 'blades', r: 3.6, fill: '#d0a0a0', line: '#2a1414' },
  crater:    { label: 'crater',           group: 'Landmarks', shape: 'ring',  r: 3.6, fill: '#b0a08a', line: '#241c14' },
  monolith:  { label: 'standing stone',   group: 'Landmarks', shape: 'stone', r: 3.4, fill: '#c8c0b0', line: '#2a2620' },
  shrine:    { label: 'shrine',           group: 'Landmarks', shape: 'arch',  r: 3.2, fill: '#ffd9a0', line: '#2e2010' },
  ruin:      { label: 'ruin',             group: 'Landmarks', shape: 'broken', r: 3.4, fill: '#a89c88', line: '#241e16' },
  tower:     { label: 'old tower',        group: 'Landmarks', shape: 'stone', r: 3.6, fill: '#bcae96', line: '#2a2418' },
  vent:      { label: 'vent',             group: 'Landmarks', shape: 'peak',  r: 2.8, fill: '#c8b060', line: '#2a2410' },

  /**
   * R14 — and the two things the map has always drawn and the key has never mentioned.
   *
   *   "some new icons like for waypoints are missing from the legend. The town portal icons could
   *    also be improved as the current one is too dark."
   */
  waypoint:  { label: 'waypoint (lit)',   group: 'Travel',    shape: 'sigil', r: 4.2, fill: '#7fe8ff', line: '#0c3040', ring: true },
  waypointOff: { label: 'waypoint (not lit yet)', group: 'Travel', shape: 'sigil', r: 3.8, fill: '#5a6a78', line: '#151d24' },
  portal:    { label: 'portal',           group: 'Travel',    shape: 'arch',  r: 4.0, fill: '#c88aff', line: '#2a1040', ring: true },
};

/** The order the key lists them in, which is also the order they are drawn on the map. */
/** R14: what each map layer is called in a sentence, for the legend strip and the fold's heading. */
/** R15 — one glyph and one colour per outpost role, for the Supply list and the map. */
export const ROLE_GLYPH = { mine: '\u26cf', refinery: '\u2699', farm: '\u2740', waypoint: '\u25c9', camp: '\u25a3', home: '\u2302' };
export const ROLE_COLOUR = { mine: '#c08a3e', refinery: '#9fb4d4', farm: '#7ac86a', waypoint: '#7fe8ff', camp: '#c8b48a', home: '#9ae06a' };

export const LAYER_WORDS = {
  biomes: 'Ground', elevation: 'Height', temperature: 'Temperature', rainfall: 'Rainfall',
  regions: 'Regions', weather: 'Weather', rivers: 'Water', political: 'Who holds it',
};

/**
 * R17 — the two visibility switches, as buttons. One table, read by every list that draws a marker
 * row, and keyed by `MARKER_VIEWS` so a third switch cannot be added to js/markers.js without a
 * glyph to draw it with.
 */
export const VIEW_CHIPS = {
  showOnMap: ['▣', 'Shown on the map. Click to hide it.', 'Hidden from the map. Click to show it.'],
  showInWorld: ['◍', 'Shown in the world. Click to hide it.', 'Hidden in the world. Click to show it.'],
};

export const MARK_ORDER = [
  'worldboss',
  'capital', 'city', 'town', 'village', 'hamlet', 'port',
  'dungeon', 'cave', 'lair', 'cleared',
  'camp', 'fort', 'castle', 'pass',
  // R14: the landmark kinds that were never drawn, and the travel marks the key never mentioned
  'volcano', 'waterfall', 'ancientwood', 'battlefield', 'crater', 'monolith', 'shrine', 'ruin', 'tower', 'vent',
  'landmark',
  'waypoint', 'waypointOff', 'portal',
];

/**
 * R14 — a World Forge landmark `kind` → the mark it wears.
 *
 * Anything not in here is a plain `landmark` pip, which is what all eleven of them used to be, on
 * the days they were drawn at all.
 */
export const LANDMARK_MARKS = {
  volcano: 'volcano', waterfall: 'waterfall', ancientwood: 'ancientwood',
  battlefield: 'battlefield', crater: 'crater', monolith: 'monolith',
  shrine: 'shrine', ruin: 'ruin', tower: 'tower', vent: 'vent', cave: 'cave',
};

/**
 * Which mark a place on this world wears.
 *
 * World Forge files a settlement under `kind` (its tier) and a dungeon under `type`, and farhold's
 * own strongholds carry a `pin.glyph` from `data/strongholds.json` — three vocabularies for one
 * question, answered once here so the map and the key can never disagree about a place.
 */
export function markFor(node) {
  if (!node) return null;
  if (node.family === 'worldboss' || node.worldBoss) return 'worldboss';
  if (node.family === 'landmark') {
    // R14: farhold's own landmarks carry an icon name in `pin.glyph` — the MINIMAP has been reading
    // it all along and the big map threw it away, so the small map was the more informative of the
    // two, which is backwards.
    return LANDMARK_MARKS[node.pin?.glyph] || LANDMARK_MARKS[node.type] || 'landmark';
  }
  /**
   * R14 — THE LINE THAT WAS MISSING.
   *
   * World Forge files a landmark as `{ type: 'landmark', kind: 'volcano' | … }` with no `family` at
   * all, so the test above could never match one and ten of the eleven kinds were invisible.
   */
  if (node.type === 'landmark') return LANDMARK_MARKS[node.kind] || 'landmark';
  if (node.family === 'stronghold') {
    const glyph = node.pin?.glyph || 'camp';
    if (glyph === 'castle') return 'castle';
    if (glyph === 'fort' || glyph === 'siege') return 'fort';
    if (glyph === 'tower') return 'tower';
    if (glyph === 'lair') return 'lair';
    // R14: a cult circle is not a bandit camp and should not wear its tent
    if (glyph === 'cult') return 'shrine';
    return 'camp';
  }
  if (node.type === 'settlement') return MAP_MARKS[node.kind] ? node.kind : 'village';
  if (node.type === 'port') return 'port';
  if (node.type === 'pass') return 'pass';
  if (node.type === 'dungeon') return node.kind === 'lair' ? 'lair' : 'dungeon';
  if (node.kind === 'cave') return 'cave';
  return null;
}

/** Draw one mark. `k` scales the whole thing, so the key can draw the same shapes a little larger. */
export function drawMark(ctx, key, x, y, k = 1) {
  const mark = MAP_MARKS[key];
  if (!mark) return;
  const r = mark.r * k;
  ctx.lineWidth = Math.max(0.7, r * 0.3);
  ctx.strokeStyle = mark.line;
  ctx.fillStyle = mark.fill;
  ctx.beginPath();
  switch (mark.shape) {
    case 'square':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    // a harbour ring with a bar through it — a port is a settlement, so it keeps a round silhouette
    case 'anchor':
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      break;
    // a dungeon is a doorway: square shoulders, round head, standing on the ground line
    case 'gate':
      ctx.moveTo(x - r * 0.7, y + r);
      ctx.lineTo(x - r * 0.7, y - r * 0.25);
      ctx.arc(x, y - r * 0.25, r * 0.7, Math.PI, 0);
      ctx.lineTo(x + r * 0.7, y + r);
      ctx.closePath();
      break;
    // a cave is a hole in a hillside: the same doorway with no straight sides at all
    case 'mouth':
      ctx.arc(x, y + r * 0.45, r * 0.95, Math.PI, 0);
      ctx.closePath();
      break;
    // a lair is a mouth with teeth in it
    case 'fang':
      ctx.moveTo(x - r, y + r * 0.8);
      ctx.lineTo(x - r * 0.45, y - r * 0.9);
      ctx.lineTo(x, y + r * 0.1);
      ctx.lineTo(x + r * 0.45, y - r * 0.9);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.closePath();
      break;
    case 'tent':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.95, y + r * 0.75);
      ctx.lineTo(x - r * 0.95, y + r * 0.75);
      ctx.closePath();
      break;
    // a keep: a block with two merlons, so a held place never reads as a village square
    case 'keep':
      ctx.moveTo(x - r, y + r * 0.85);
      ctx.lineTo(x - r, y - r * 0.5);
      ctx.lineTo(x - r * 0.45, y - r * 0.5);
      ctx.lineTo(x - r * 0.45, y - r);
      ctx.lineTo(x + r * 0.45, y - r);
      ctx.lineTo(x + r * 0.45, y - r * 0.5);
      ctx.lineTo(x + r, y - r * 0.5);
      ctx.lineTo(x + r, y + r * 0.85);
      ctx.closePath();
      break;
    // a world boss is a burst: eight spikes, so it never reads as a place you walk into casually
    case 'burst':
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI / 8) * i - Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    case 'cross':
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      break;
    /**
     * R14 — THE LANDMARK SHAPES.
     *
     * Ten World Forge landmark kinds were drawn as nothing at all and fourteen of farhold's own were
     * drawn as this one blue pip. Each of these is deliberately readable at 8 px and deliberately
     * unlike its neighbours in silhouette, not only in colour — three of the existing marks are
     * near-identical yellow-oranges and at that size a colour difference is not a difference.
     */
    // a volcano is a cone with its top taken off
    case 'peak':
      ctx.moveTo(x - r, y + r * 0.8);
      ctx.lineTo(x - r * 0.3, y - r * 0.9);
      ctx.lineTo(x + r * 0.3, y - r * 0.9);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.closePath();
      break;
    // a waterfall is a lip with the water going over it
    case 'fall':
      ctx.moveTo(x - r, y - r * 0.8);
      ctx.lineTo(x + r, y - r * 0.8);
      ctx.lineTo(x + r * 0.55, y + r);
      ctx.lineTo(x - r * 0.55, y + r);
      ctx.closePath();
      break;
    // an ancient wood is a canopy on a trunk
    case 'tree':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.85, y + r * 0.25);
      ctx.lineTo(x + r * 0.25, y + r * 0.25);
      ctx.lineTo(x + r * 0.25, y + r);
      ctx.lineTo(x - r * 0.25, y + r);
      ctx.lineTo(x - r * 0.25, y + r * 0.25);
      ctx.lineTo(x - r * 0.85, y + r * 0.25);
      ctx.closePath();
      break;
    // a battlefield is two blades crossed
    case 'blades':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      break;
    // a crater is a rim with nothing in it
    case 'ring':
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      break;
    // a standing stone, and an old tower, are the same upright slab at different sizes
    case 'stone':
      ctx.moveTo(x - r * 0.45, y + r);
      ctx.lineTo(x - r * 0.35, y - r * 0.7);
      ctx.lineTo(x + r * 0.35, y - r);
      ctx.lineTo(x + r * 0.45, y + r);
      ctx.closePath();
      break;
    // a shrine, and a portal, are a doorway with nothing behind it
    case 'arch':
      ctx.moveTo(x - r * 0.75, y + r);
      ctx.lineTo(x - r * 0.75, y - r * 0.2);
      ctx.arc(x, y - r * 0.2, r * 0.75, Math.PI, 0);
      ctx.lineTo(x + r * 0.75, y + r);
      ctx.closePath();
      break;
    // a ruin is a wall with a piece missing
    case 'broken':
      ctx.moveTo(x - r, y + r);
      ctx.lineTo(x - r, y - r * 0.5);
      ctx.lineTo(x - r * 0.3, y - r * 0.5);
      ctx.lineTo(x - r * 0.3, y + r * 0.1);
      ctx.lineTo(x + r * 0.3, y + r * 0.1);
      ctx.lineTo(x + r * 0.3, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.closePath();
      break;
    /**
     * R14 — the waypoint pad, which was a near-black hole.
     *
     *   "The town portal icons could also be improved as the current one is too dark."
     *
     * It filled `rgba(20, 44, 58, .95)` inside a thin blue ring, which on grassland or a beach is
     * the darkest thing on the screen and reads as a crater rather than as somewhere to travel to.
     * A sigil is a LIT disc now: a bright fill with a four-pointed star cut across it, so a lit pad
     * and an unlit one differ in brightness rather than only in outline.
     */
    case 'sigil':
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      break;
    // a landmark is a plain pip: it is scenery with a use, not somewhere to plan a route around
    case 'pip':
    default:
      ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
  }
  if (mark.shape === 'cross' || mark.shape === 'blades') ctx.stroke();
  else { ctx.fill(); ctx.stroke(); }
  if (mark.shape === 'anchor') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y); ctx.lineTo(x + r * 0.8, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  // R14: the star cut into a waypoint sigil, in its own outline colour so it reads as an inlay
  if (mark.shape === 'sigil') {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    }
    ctx.lineWidth = Math.max(0.6, r * 0.18);
    ctx.stroke();
  }
  // …and the empty middle of a crater, so it is a rim rather than a filled disc
  if (mark.shape === 'ring') {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = mark.line;
    ctx.fill();
  }
  // the two biggest settlements wear a ring, which is what makes the size ladder readable zoomed out
  if (mark.ring) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
    ctx.strokeStyle = mark.fill;
    ctx.lineWidth = Math.max(0.6, r * 0.18);
    ctx.stroke();
  }
}

/**
 * R17 — THE MARK, ON ITS OWN, AT ANY SIZE.
 *
 *   "if you are hovering over an icon on the map, can we show the icon itself in the tooltip to the
 *    left of the name so it's clear that icon is corresponding to what is on the map? This will
 *    help with understanding that a village is a white square."
 *
 * One function, called by the key AND by the hover card, and it calls `drawMark()` — so there are
 * still exactly two places a mark is ever drawn (the map and this), and this one is the map's own
 * code. A swatch cannot go stale because there is nothing in it to go stale.
 *
 * `box` is the CSS size; the buffer is twice that so it is sharp on a retina screen. The scale is
 * worked out from the mark's own radius so the biggest (a capital, 5.4) and the smallest (a vent,
 * 2.8) both fill the square instead of the vent being a speck.
 */
export function markSwatch(key, box = 20) {
  const mark = MAP_MARKS[key];
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(box * dpr);
  canvas.height = Math.round(box * dpr);
  canvas.style.width = `${box}px`;
  canvas.style.height = `${box}px`;
  if (!mark) return canvas;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  // leave room for the ring the two biggest settlements and the world boss wear (1.55x)
  drawMark(ctx, key, box / 2, box / 2, (box / 2 - 1) / (mark.r * (mark.ring ? 1.55 : 1)));
  return canvas;
}

/**
 * R17 — ONE ICON PER MARKER, WITH THE FAVOURITE ON IT RATHER THAN BESIDE IT.
 *
 *   "the markers for ore is confusing. It shows a star icon to the top-left and a green circle to
 *    the bottom-right. It is not clear which of these is the actual location of the ore. Can we
 *    combine them into one icon?"
 *
 * They were one marker all along. The dot was drawn at the marker's true position and the star was
 * drawn at `px - r*1.5, py - r*1.5` — a marker and a half up and to the left of it — with a comment
 * explaining that this was so the star "never sits on the glyph it belongs to". Which is precisely
 * the problem: two sprites a dozen pixels apart, neither labelled, and the one that catches the eye
 * is the one that is NOT where the ore is.
 *
 * So a favourite is now a gold rim around the marker's own disc. Same position, same glyph, one
 * thing on the ground. The key says what the gold ring means.
 *
 * Exported because the minimap and the world beacons should draw markers the same way; see
 * `research/round17-map-handoff.md`.
 */
export function drawMarkerDot(ctx, marker, x, y, r) {
  const look = MARKER_LOOKS[marker.kind] || MARKER_LOOKS.pin;
  /**
   * R17 — an outpost's marker wears its ROLE, so a mine and a depot are not one flag twice.
   *
   * `syncOutpostMarkers()` copies the role onto the marker; the two tables are the same ones the
   * Supply list reads, which is what stops the map and that list disagreeing about what a place is.
   */
  const role = marker.kind === 'outpost' ? marker.role : null;
  const glyph = (role && ROLE_GLYPH[role]) || look.icon;
  const colour = marker.done ? '#9ae06a'
    : (marker.colour || (role && ROLE_COLOUR[role]) || look.color);

  // the favourite rim, drawn first so the disc sits inside it rather than on top of it
  if (marker.starred) {
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(2, r * 0.5), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.4, r * 0.34);
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.34);
  ctx.strokeStyle = '#150f0a';
  ctx.stroke();

  // the glyph the kind already carries, once the disc is big enough to hold one
  if (glyph && r >= 5) {
    ctx.font = `700 ${Math.round(Math.min(15, r * 1.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#150f0a';
    ctx.fillText(glyph, x, y + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

/** The same combined icon on its own, for the key and the hover card. */
export function markerSwatch(marker, box = 20) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(box * dpr);
  canvas.height = Math.round(box * dpr);
  canvas.style.width = `${box}px`;
  canvas.style.height = `${box}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawMarkerDot(ctx, marker, box / 2, box / 2, box * 0.3);
  return canvas;
}

import { renderWorld, legend as legendRows, DEFAULT_LAYERS, worldPixels } from '../../../worldgen/js/render.js';
import { generateRegionDetail } from '../../../worldgen/js/local.js';
import { cellInfo } from '../../../worldgen/js/world.js';
import { weatherAt, weatherOdds } from '../../../worldgen/js/weather.js';
import { M_PER_CELL } from './planet.js';

export function createMapScreen({ terrain, getPlayer, getEnemies = () => [], onTeleport = null, seed = 1, markers = null, zones = null, getLevel = () => 1, sites = null, gates = null, meteors = null, showCoords = () => false, rumours = null, waypoints = null, allowDebugTeleport = () => true, bases = null,
  /**
   * R14 — FINDING THINGS. The other half of the map's job.
   *
   *   "I previously asked for a scan tool to locate resources. Where is that? Where do you find
   *    clay? We need a way for the player to locate materials, through combination of scanning in
   *    the world or filters on the map."
   *
   * The scanner already existed, buried three clicks deep inside build mode with a 144 m radius. It
   * belongs on the map, which is where a player goes when the question is "where is X".
   *
   *   `findables`  () => [{ id, name, colour, where }]   what can be swept for, and where it lives
   *   `onSweep`    (materialId) => { found, hits }        run a sweep from where the player stands
   *   `scanState`  () => ({ want, hits, until })          what the last sweep turned up
   *   `onKeep`     (hit) => marker                        keep one of them as a saved place
   */
  findables = null, onSweep = null, scanState = null, onKeep = null,
  /** R16 — `() => boolean`: is the hand scanner running? See `pins` below. */
  scanning = null,
  /** R16 — `() => [{ id, x, z, name, resource, distance }]`: everything ever scanned. */
  scanned = null,
  /**
   * R15 — THE SUPPLY TAB: your outposts, and what runs between them.
   *
   *   "Then I would like the map to show outposts on it and allow creating connections between
   *    then to transport items, in either direction with a max limit. Trade routes should be
   *    visualized on the map using a filter."
   *
   *   `outposts()`   () => [{ id, name, role, x, z, count, poolId }]
   *   `supplyLinks()` () => [{ id, from, to, fromName, toName, batch, only, quote }]
   *   `onLink`       (fromId, toId, opts) => { ok, why?, quote? }
   *   `onUnlink`     (linkId) => boolean
   */
  outposts = null, supplyLinks = null, onLink = null, onUnlink = null,
  /**
   * R14 — THE PORTAL, WHICH HAD A FINISHED `mapMarkers()` THAT NOTHING IMPORTED.
   *
   * `js/portal.js:211` has built both ends of the town portal into map-ready rows since §6.8 landed,
   * and nothing anywhere called it — the thirteenth module of this kind this project has turned up.
   * The portal was on the ground, in the save, in the journal, and not on the map.
   */
  portals = null,
  /**
   * R17 — `() => void`, called when the player changes something the save carries: a favourite, a
   * tracked deposit, a visibility switch, an outpost's name.
   *
   * Optional, and the map works without it — the marker book is already inside `markers.toJSON()`
   * and therefore inside the periodic autosave, so nothing is ever LOST. It only decides whether a
   * change is written immediately or at the next tick of the clock. js/main.js belongs to another
   * pass this round; the one line to wire it is in `research/round17-map-handoff.md`.
   */
  onChanged = null,
} = {}) {
  // Pins used to be a bare array owned by this screen. They are markers now (`js/markers.js`), so
  // a quest destination, a story objective and a pin the player dropped are one kind of thing and
  // the minimap and space mode can see them too.
  const book = markers;
  /**
   * R16 — WHILE THE SCANNER IS RUNNING, THE MAP IS A PROSPECTING MAP.
   *
   *   "When scanning for nodes, hide all the quest/markers and only show node markers for
   *    simplicity, and show the name of the resource on the floating indicator."
   *
   * Which is the right instinct: a marker book with forty entries in it is unreadable exactly when
   * you are trying to read one class of them. `scanning` is a predicate handed in by js/main.js so
   * this file does not have to know what a scanner is.
   */
  const pins = () => {
    const all = book ? book.here() : [];
    return scanning && scanning() ? all.filter(m => m.kind === 'seam') : all;
  };
  const world = terrain.world;

  /**
   * B8: THE MAP NO LONGER NAMES PLACES YOU HAVE NEVER BEEN.
   *
   * Opening the map on your first morning listed all fifty-nine regions by name, which made the
   * Journal's "Word going round" pointless — the rumour had nothing left to tell you. So a region's
   * NAME is now something you learn: you get it by crossing into it, or by hearing a rumour about
   * it. Everything else about it is still drawn — the coastline, the roads, the towns, the danger
   * wash and the level band — because the point was never to hide the ground, only to stop the map
   * doing the talking. There is no fog of war.
   *
   * Two ways in, both of which already exist elsewhere in the game:
   *
   *   * `tick()` runs five times a second whether the map is open or not, so it can watch which
   *     region you are standing in — that is the border crossing, with no hook in main.js;
   *   * the rumour book files every line under the zone it is about, so anything you have been told
   *     about counts as heard of.
   *
   * The rumour book is passed in where the caller has it and read off `window.farhold` otherwise —
   * main.js builds the map screen without it and that file belongs to another pass this round.
   *
   * What you know is kept per world in this browser rather than in the save, so a reload does not
   * blank a map you walked across. `world.planet.id` keys it, so landing somewhere else starts a
   * fresh sheet.
   */
  const KNOWN_KEY = `farhold.seen.${seed}.${world.planet?.id || world.planet?.name || 'world'}`;
  const known = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]');
    if (Array.isArray(raw)) for (const id of raw) known.add(Number(id));
  } catch { /* a browser with storage switched off just re-learns the names by walking */ }

  function remember(id) {
    if (id == null || id < 0 || known.has(id)) return false;
    known.add(id);
    try { localStorage.setItem(KNOWN_KEY, JSON.stringify([...known])); } catch { /* not worth a word */ }
    return true;
  }

  /** Everything you have been told about, whoever handed the book over. */
  function heardOf() {
    const talk = rumours || (typeof window !== 'undefined' ? window.farhold?.rumours : null);
    for (const r of talk?.all?.() || []) remember(r.zoneId);
  }

  /** Which region you are standing in, right now. Crossing the border is what names it. */
  function noteWhereYouAre() {
    if (!zones) return;
    // Underground, the player's x/z belong to the dungeon's own floor and mean nothing to the
    // planet's regions — main.js skips the zone lookup for the same reason. Learning a name from
    // those coordinates would hand you a region on the far side of the world for free.
    if (typeof window !== 'undefined' && window.farhold?.dungeon) return;
    const p = whereIsPlayer();
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    const zone = zones.at(p.x, p.z);
    if (zone && zone.id >= 0) remember(zone.id);
  }

  const knows = id => id != null && id >= 0 && known.has(id);

  /**
   * The world handed to World Forge's renderer, with the names of unknown regions taken out.
   *
   * `renderWorld()` draws region names straight off `world.regions[i].name` and there is no knob to
   * pick which — so the map gives it a shallow copy with the unknown ones blanked. The copy is
   * rebuilt only when the number of names you know changes, because a redraw happens on every pan
   * and every frame the map is open.
   */
  let maskedWorld = null, maskedFor = -1;
  function drawnWorld() {
    if (!zones || !world.regions?.length) return world;
    if (known.size >= world.regions.length) return world;
    if (maskedWorld && maskedFor === known.size) return maskedWorld;
    maskedFor = known.size;
    maskedWorld = { ...world, regions: world.regions.map(r => (knows(r.id) ? r : { ...r, name: '' })) };
    return maskedWorld;
  }

  const state = {
    open: false,
    layer: 'biomes',
    layers: { ...DEFAULT_LAYERS, labels: true, nodes: true, rivers: true, roads: true },
    // Round 4: the level-band overlay. The user asked for it by name — "a level range overlay to
    // the map so players can see at a glance and plan their route" — and it is on by default,
    // because deciding where to walk next is the whole point of banding the regions.
    levels: true,
    // The map is a whole planet at once, which is unreadable for anything closer than "which
    // continent". The wheel steps through five zooms, centred on the player.
    zoom: 1,
    centre: null,
    view: null,
    hover: null,
    selected: null,
    /** Which waypoint pad the player has clicked. The travel button reads this; a click never does. */
    padPick: null,
    /**
     * R14 — the place `locate()` was asked to show, and when the ring over it stops pulsing.
     * `{ x, y, name, kind, until }` in map cells, or null.
     */
    focus: null,
    /**
     * R15 — which of the four questions the sidebar is answering: work, places, find, supply.
     * "The useful stuff is still at the bottom" — it is at the top now, and this says which.
     */
    tab: 'work',
    /** …and whether the reference fold at the bottom was left open. */
    legendOpen: false,
  };
  /** R14: which material the Find panel is set to. Outside `state` because it is pure interface. */
  let findWant = null;
/** R16 — how the Find list is ordered, and whether it is cut down to the starred ones. */
let findSort = 'distance';
let findFavOnly = false;
  /** R15: the outpost a supply route is being drawn FROM, mid two-click. */
  let supplyFrom = null;
  /** …and the most one cart may carry, which is the "max limit" the route is created with. */
  let supplyBatch = 60;
  /**
   * R14: every mark drawn this frame, in screen pixels, so a hover can be resolved.
   *
   * R17 — AND IT IS ONE LIST NOW, IN PAINT ORDER, RESOLVED BY WHOSE CENTRE IS NEAREST.
   *
   *   "I found a spikey icon on the map with a red circle that appears to be a world boss. However
   *    if I hover directly over it it says something about 'ancient wood' that I think is from the
   *    surrounding. There is only a few pixels at the top-left of the icon that give me the correct
   *    World Boss tooltip."
   *
   * Nothing was offset. The hit list was built in DRAW order — `marks` is sorted smallest-last so a
   * capital is never hidden under the hamlet beside it, which puts the world boss (first in
   * MARK_ORDER, therefore drawn on top) at the very END of the list — and the hover loop then took
   * the FIRST entry whose circle contained the pointer and `break`ed. So whatever was painted
   * UNDERNEATH won every overlap. An ancient wood a few metres away had its hit circle over most of
   * the boss's burst, and the only pixels left for the boss were the ones outside that circle: the
   * sliver at the top-left.
   *
   * Two separate lists (places and pads) made it worse — pads were only consulted if no place
   * matched at all — and the marker branch had a third bug: it destructured `{ scale, ox, oy }` out
   * of `viewBox()`, which returns `offsetX`/`offsetY`, so every marker's screen position was NaN
   * and a marker could never be hovered at all.
   *
   * So: one list, every drawable pushes into it with the radius it was actually drawn at, and the
   * winner is the one whose CENTRE is nearest the pointer — ties going to whatever was painted last,
   * which is the thing you can see. Terrain is the fallback and only the fallback, so an icon always
   * beats the ground under it.
   */
  const hits = [];

  /** The backing-buffer scale in use, so a hit radius can be stated in CSS pixels. Set by `fit()`. */
  let bufferDpr = 1;

  /**
   * What is under this point, in buffer pixels. `null` means bare ground.
   *
   * `want` narrows it to one tier — the click handler asks for `'pad'` only, because clicking a pad
   * picks it and clicking anything else selects a cell.
   */
  function hitAt(mx, my, want = null) {
    return pickHit(hits, mx, my, want);
  }

  /** Push one drawable onto the hit list, in paint order. */
  function pushHit(tier, x, y, r, extra) {
    hits.push({ tier, x, y, r, order: hits.length, ...extra });
  }

  const canvas = el('canvas', { class: 'map-canvas', id: 'map-canvas' });
  const readout = el('div', { class: 'map-readout muted small' });
  const side = el('aside', { class: 'map-side' });
  const legendBox = el('div', { class: 'legend' });
  // the biome breakdown, out of the legend and into a fold in the side panel
  const compositionBox = el('details', { class: 'map-composition' });
  // 4.11: what every mark on the map means, built once from MAP_MARKS — see `buildKey`
  const keyBox = el('div', { class: 'map-key' });
  const coords = el('span', { class: 'map-coords' });

  /**
   * B9: WHERE THE PLAYER IS, WHICHEVER BODY THEY ARE FLYING.
   *
   * `getPlayer()` hands back the walking controller, which stops moving the moment you board the
   * ship — so in the air the arrow, the "you are here" recentre and the region you are learning all
   * stayed stuck at the spot you took off from. In the air the ship IS the player, and `air.state`
   * carries the same x/z/yaw the controller does.
   */
  /**
   * R17 — "something the save cares about just changed."
   *
   * Every favourite, tracked deposit, visibility switch and outpost rename goes through here. The
   * data itself is already inside `markers.toJSON()` and `waypoints.toJSON()`, so a change is never
   * lost — this only decides whether it is written now or at the next autosave.
   */
  function noteChange() {
    try { onChanged?.(); } catch { /* a save that refuses is not worth losing the click over */ }
  }

  /**
   * The waypoint book that can be WRITTEN to.
   *
   * js/main.js hands this screen a narrowed `{ list, travel }` view of the network — enough to draw
   * the pads and to travel, and not enough to star one. The real book is on `window.farhold`, which
   * is the same door this file already uses for the rumour book and the dungeon check, and it is the
   * honest one to use until main.js (another pass's file this round) passes the whole thing in. See
   * `research/round17-map-handoff.md`.
   */
  const padBook = () => (waypoints && typeof waypoints.star === 'function')
    ? waypoints
    : (typeof window !== 'undefined' ? window.farhold?.waypoints || null : null);

  const airborne = () => typeof window !== 'undefined' && window.farhold?.mode === 'air';
  function whereIsPlayer() {
    const ship = airborne() ? window.farhold?.air?.state : null;
    return ship && Number.isFinite(ship.x) ? ship : getPlayer?.();
  }

  /**
   * D2: the block a bug report quotes, on the clipboard from the map as well as the debug menu.
   *
   * It is a real input rather than a toast because the page is served over plain http, where there
   * is no clipboard API at all — the text has to be on screen and selected for Ctrl+C to be the way
   * out. Hidden until the button is pressed.
   */
  const copyArea = el('input', { type: 'text', class: 'map-copy-text', readonly: 'readonly', spellcheck: 'false' });
  const copyNote = el('span', { class: 'map-copy-note' });
  const copyBar = el('div', { class: 'map-copy hidden' },
    copyArea, copyNote,
    el('button', { class: 'chip', text: 'Close', onclick: () => copyBar.classList.add('hidden') }),
  );

  /** seed, planet, biome, x, z, altitude — the six things every report of ours carries. */
  function locationNow() {
    const p = whereIsPlayer() || { x: 0, z: 0, y: 0 };
    return locationLine({
      seed,
      planet: world.planet?.name || 'this world',
      biome: terrain.biomeAt(p.x, p.z)?.name || '—',
      x: p.x, z: p.z,
      // in the air `y` is the ship's height; on foot it is the ground you are standing on
      altitude: Number.isFinite(p.y) ? p.y : terrain.heightAt(p.x, p.z),
    });
  }

  async function copyLocation() {
    copyBar.classList.remove('hidden');
    copyNote.textContent = 'Copying…';
    const how = await copyTextVia(copyArea, locationNow());
    copyNote.textContent = COPY_WORDS[how] || '';
    copyNote.classList.toggle('bad', how === 'shown');
  }

  const root = el('section', { class: 'map-screen hidden', id: 'map-screen' },
    el('div', { class: 'map-head' },
      el('h2', { text: world.planet?.name || 'The map' }),
      coords,
      el('button', {
        class: 'chip map-copy-btn', id: 'map-copy-location', text: 'Copy location',
        title: 'Seed, world, biome and coordinates — the block to paste into a bug report.',
        onclick: copyLocation,
      }),
      el('button', { class: 'map-close', text: '×', onclick: () => toggle(false) }),
    ),
    copyBar,
    el('div', { class: 'map-body' },
      el('div', { class: 'map-canvas-wrap' }, canvas, legendBox, readout),
      side,
    ),
  );
  document.body.append(root);

  // ---------------------------------------------------------------- the side panel

  /**
   * THE KEY: every mark, drawn by the same code that draws the map.
   *
   * Each swatch is a tiny canvas with `drawMark()` called on it, so a change to a shape or a colour
   * shows up here without anybody remembering to update a list of coloured squares. Built once —
   * nothing in it depends on where you are — and the settlement rows come first because the size
   * ladder is the thing the report was actually asking to be able to read.
   */
  /**
   * R14 — THE KEY IS REBUILT, AND IT SAYS WHEN IT IS LYING.
   *
   * It used to return early on `dataset.built`, so nothing whose presence depends on the state of
   * the run could ever be in it — a waypoint row that should only appear once you have lit one, a
   * marker row, a scan filter. And the layers panel's `nodes` chip hides every place on the map
   * while the key goes on listing all of them, so switching it off reads as a rendering fault
   * rather than as something you did.
   */
  function buildKey() {
    keyBox.replaceChildren();
    keyBox.append(el('h4', { class: 'map-key-title', text: 'What the marks mean' }));
    if (state.layers.nodes === false) {
      keyBox.append(el('p', { class: 'map-key-off', text:
        'Places are switched off — turn "nodes" back on in Layers, above, to see them.' }));
    }
    /**
     * R16 — ONE HEADING PER GROUP.
     *
     * This emitted a heading every time the group CHANGED while walking `MARK_ORDER`, which is only
     * the same thing as "one per group" if the order happens to keep every group together. It does
     * not: the five "Held ground" marks sit either side of the eleven "Landmarks" ones, so the key
     * has read `Beware / Settlements / Underground / Held ground / Landmarks / Held ground /
     * Travel / Yours` — eight headings for seven groups, with one of them twice, which reads as a
     * mistake because it is one. Gathering first keeps `MARK_ORDER` inside each group and the order
     * a group first appears in for the headings.
     */
    const byGroup = new Map();
    for (const name of MARK_ORDER) {
      const mark = MAP_MARKS[name];
      if (!mark) continue;
      if (!byGroup.has(mark.group)) byGroup.set(mark.group, []);
      byGroup.get(mark.group).push(name);
    }
    let list = null;
    for (const [group, names] of byGroup) {
      keyBox.append(el('div', { class: 'map-key-group', text: group }));
      list = el('div', { class: 'map-key-rows' });
      keyBox.append(list);
      for (const name of names) {
      const mark = MAP_MARKS[name];
      const swatch = el('canvas', { class: 'map-key-swatch', width: 22, height: 22 });
      const ctx = swatch.getContext('2d');
      // the biggest mark is 5.4 units across, so 1.7x fits a 22px box with room for the ring
      drawMark(ctx, name, 11, 11, Math.min(1.7, 8 / mark.r));
      list.append(el('div', { class: 'map-key-row' }, swatch, el('span', { text: mark.label })));
      }
    }
    /**
     * R14 — the six things the map has always drawn and the key never mentioned: the markers. They
     * are drawn from `MARKER_LOOKS`, the same table the minimap and the side list read, so a glyph
     * here and a glyph on the map cannot drift apart.
     */
    keyBox.append(el('div', { class: 'map-key-group', text: 'Yours' }));
    const mine = el('div', { class: 'map-key-rows' });
    for (const [kind, look] of Object.entries(MARKER_LOOKS)) {
      // `waypoint` is not a marker — it is a pad, and it already has a row under Travel above. It
      // only lives in MARKER_LOOKS so the minimap can draw a starred pad; see js/markers.js.
      if (kind === 'waypoint') continue;
      /**
       * R17 — the swatch is the marker icon itself, drawn by `drawMarkerDot()`, which is the one
       * function that puts a marker on the map. The key used to print the bare glyph in the
       * marker's colour, which is not what the map draws at all — the map draws a filled disc with
       * the glyph cut into it — so the two did not match, on the one panel whose job is matching.
       */
      mine.append(el('div', { class: 'map-key-row' },
        markerSwatch({ kind }, 18),
        el('span', { text: look.label.toLowerCase() })));
    }
    /**
     * R17 — and what the gold ring means, because it replaced the star that used to float up and
     * to the left of a favourite. One icon, in one place, with its state drawn on it.
     */
    mine.append(el('div', { class: 'map-key-row' },
      markerSwatch({ kind: 'saved', starred: true }, 18),
      el('span', { text: 'a gold ring — one of your Favorites' })));
    keyBox.append(mine);

    keyBox.append(el('p', { class: 'muted small', text:
      'Settlements grow with their size, and the two biggest wear a ring. Dungeons, caves and lairs '
      + 'are three different mouths; held ground is a tent or a keep. Small places appear as you '
      + 'zoom in.' }));
  }

  /**
   * R15 — WHAT THE MAP IS FOR GOES AT THE TOP.
   *
   *   "The map does not seem like it was redesigned to my expectations and the useful stuff is
   *    still at the bottom."
   *
   * Correct, and it was my fault: round 14 fixed what the map DREW and left the sidebar in the
   * order it had grown in, which was Layers, then the key, then the biome breakdown, and only then
   * the things you open the map to do. Three panels of reference material above the first thing
   * anybody came for.
   *
   * The order is the argument. A player opens this screen to answer one of four questions — where
   * is my work, where are the places I kept, where do I find X, and what is my industry doing — so
   * those are four tabs at the top and one of them is always showing. Layers, the key and the
   * composition are reference: true, occasionally needed, and now in a fold at the BOTTOM that
   * remembers whether you left it open.
   */
  const SIDE_TABS = [
    { key: 'work', name: 'Work' },
    { key: 'places', name: 'Places' },
    { key: 'find', name: 'Find' },
    { key: 'supply', name: 'Supply' },
  ];

  function buildSide() {
    side.replaceChildren();
    buildKey();

    // ---- the rail, first, always
    const rail = el('div', { class: 'map-tabs' });
    for (const t of SIDE_TABS) {
      rail.append(el('button', {
        class: 'map-tab' + (state.tab === t.key ? ' on' : ''),
        text: t.name,
        onclick: () => { state.tab = t.key; buildSide(); draw(); },
      }));
    }
    side.append(rail);

    const layerPanel = layersPanel({
      layer: state.layer, layers: state.layers,
      onLayer: name => { state.layer = name; buildSide(); draw(); },
      // R14: `nodes` hides every place on the map, and the key has to say so — so a toggle that
      // changes what the key should read rebuilds the side, not only the canvas
      onToggle: (key, on) => { state.layers[key] = on; if (key === 'nodes') buildSide(); draw(); },
    });

    /**
     * R15 — "Trade routes should be visualized on the map using a filter." This is the filter: one
     * more chip beside the rest, because a player looking to switch something off looks in Layers.
     */
    if (outposts) {
      const chips = layerPanel.querySelector('.chips') || layerPanel.querySelector('div');
      const chip = el('span', {
        class: 'chip' + (state.layers.supply !== false ? ' on' : ''),
        text: 'supply',
        title: 'Your outposts, and the carts running between them.',
        dataset: { layer: 'supply' },
      });
      chip.onclick = () => { state.layers.supply = state.layers.supply === false; buildSide(); draw(); };
      if (chips) chips.append(chip); else side.append(chip);
    }

    // "levels" reads as one more layer chip, sitting with Biomes / Elevation / … / Regions, because
    // that is where a player will look for it. It is an overlay rather than a base layer, so it
    // stacks on whichever of those is drawn underneath.
    if (zones) {
      const chips = layerPanel.querySelector('.chips') || layerPanel.querySelector('div');
      const chip = el('span', {
        class: 'chip' + (state.levels ? ' on' : ''),
        text: 'levels',
        title: 'Wash every region in how dangerous it is to you right now, and write its level range on the map.',
        dataset: { layer: 'levels' },
      });
      chip.onclick = () => { state.levels = !state.levels; buildSide(); draw(); };
      if (chips) chips.append(chip); else side.append(chip);
    }

    // R15: everything from here to the fold at the bottom belongs to one tab or another.
    const tab = state.tab;

    // B8: why half the map has no names on it. One line, where the question gets asked.
    if (tab === 'places' && zones && world.regions?.length) {
      const total = world.regions.length;
      side.append(el('p', { class: 'muted small', text: known.size >= total
        ? `You have walked or heard of all ${total} regions on this world.`
        : `${known.size} of ${total} regions named. The rest fill in when you cross into them or hear about them.` }));
    }

    // Markers: quests, story objectives and dropped pins, each with a star that tracks or untracks
    // it. A tracked marker is the one the minimap draws and points an arrow at; an untracked one
    // still sits on this map, it just stops following you around.
    /**
     * R15 — a quest marker is Work; anything you dropped or kept is a Place. The `fall` of a meteor
     * counts as work: somebody did not set it, but it is a thing to go and do and it expires.
     */
    const WORK_KINDS = new Set(['quest', 'campaign', 'fall']);

    /**
     * R17 — ONE ROW BUILDER FOR EVERY MARKER LIST.
     *
     * Work in hand, Favorites, Places and Tracked Resources are four lists of the same thing, and
     * before this round three of them were three copies of the same twenty lines with different
     * bits missing — which is why the Find tab's star could only be switched ON ("I starred Copper
     * Ore from the Find menu and I can see it under Places you keep menu, but I don't see a way to
     * un-star it"). One builder, and every list gets every control.
     *
     * The controls, left to right:
     *   ★  favourite — files it under Favorites. Works in both directions, everywhere.
     *   ◉  the icon, drawn by the same routine the map uses
     *   name — an editable field on an outpost marker (item 20), plain text otherwise
     *   ◎  tracked — the minimap's arrow
     *   ▣  show on the map (item 19)
     *   ◍  show in the world (item 19)
     *   ×  remove — or a padlock on a marker that is not yours to remove
     */
    function markerRow(m, { showDistance = true } = {}) {
      const player = whereIsPlayer();
      // R22 — `bearing` answers null for a marker with no place. A row with no distance is
      // still a row you can rename or delete; an exception here takes the whole pin list down.
      const away = (book ? book.bearing(m, player, terrain) : null)?.distance ?? 0;
      const row = el('div', { class: 'pin-row' + (m.tracked ? ' tracked' : '') });

      row.append(el('button', {
        class: 'pin-track' + (m.starred ? ' on' : ''),
        text: m.starred ? '★' : '☆',
        title: m.starred ? 'A favorite. Click to un-star it.' : 'Add to Favorites',
        onclick: () => { book.star(m, !m.starred); noteChange(); buildSide(); draw(); },
      }));

      /**
       * The icon itself, so the list and the map teach each other. 18px rather than 15: the glyph
       * inside the disc only draws above a radius of 5 (below that it is illegible anyway), and a
       * 15px box lands at 4.5 — so a list of quests, pins and deposits would have been a column of
       * identical coloured circles, which is the thing the swatch is here to stop.
       */
      row.append(markerSwatch(m, 18));

      /**
       * Item 20 — "The marker should also let you rename the location which can appear on the map
       * too." Only an outpost's marker gets the field, because it is the only kind whose name the
       * game picked for you; everything else you already named when you put it down.
       */
      if (m.kind === 'outpost') {
        const field = el('input', { class: 'pin-rename', value: m.name, title: 'Name this place' });
        const commit = () => {
          if (field.value.trim() && field.value.trim() !== m.name) {
            renameOutpostMarker(book, m, field.value);
            noteChange();
            draw();
          }
        };
        field.onchange = commit;
        field.onblur = commit;
        field.onkeydown = ev => { if (ev.key === 'Enter') field.blur(); };
        row.append(field);
      } else {
        row.append(el('span', { class: 'pin-name', text: m.name }));
      }

      if (showDistance) row.append(el('span', { class: 'muted small', text: distanceText(away) }));

      row.append(el('button', {
        class: 'pin-go', text: '⌖', title: `Show ${m.name} on the map`,
        onclick: () => locate({ cell: { x: m.cell.x, y: m.cell.y }, name: m.name, kind: m.kind }),
      }));

      row.append(el('button', {
        class: 'pin-eye' + (m.tracked ? ' on' : ''),
        text: '◎',
        title: m.tracked ? 'Tracked — the minimap points at this. Click to stop.' : 'Not tracked. Click to follow it on the minimap.',
        onclick: () => { book.toggle(m); noteChange(); buildSide(); draw(); },
      }));

      /**
       * Item 19 — the two switches, as two small squares.
       *
       *   "Can they have a toggle to show on the map, and show on the game world? That way you can
       *    uncheck those to keep them favorited but hide them from the map/world so they are not
       *    distracting."
       */
      for (const where of MARKER_VIEWS) {
        const [glyph, on, off] = VIEW_CHIPS[where];
        const lit = m[where] !== false;
        row.append(el('button', {
          class: 'pin-eye' + (lit ? ' on' : ''),
          text: glyph,
          title: lit ? on : off,
          onclick: () => { book.show(m, where, !lit); noteChange(); buildSide(); draw(); },
        }));
      }

      /**
       * You may throw away what you put there yourself — a dropped pin, a kept place, or a deposit
       * you are tracking. A quest marker is not yours to delete (untracking it is what the ◎ is
       * for), and an outpost's marker is not either: it says what is standing on the ground, and
       * the way to get rid of it is to knock the buildings down.
       */
      if (book.canRemove(m) && !m.questId && !WORK_KINDS.has(m.kind)) {
        row.append(el('button', {
          class: 'pin-del', text: '×',
          title: m.kind === 'seam' ? 'Stop tracking this deposit' : 'Remove this marker',
          onclick: () => { removePin(m); },
        }));
      } else if (m.locked) {
        row.append(el('span', { class: 'pin-locked', text: '⚭', title: 'This marker stands as long as the buildings do.' }));
      }
      return row;
    }

    /** A list of markers, or one grey line saying why there are none. */
    function markerList(rows, emptyText) {
      const list = el('div', { class: 'pin-list' });
      if (!rows.length) list.append(el('p', { class: 'map-empty', text: emptyText }));
      else for (const m of rows) list.append(markerRow(m));
      return list;
    }

    /**
     * R17 — THE SELECTED GROUP: what you just clicked, and what you can do about it.
     *
     * The click handler works out what was under the pointer from the same hit list the tooltip
     * uses, so this names the village rather than the field it stands in. If there is already a
     * marker there it is shown as a full row — every control, including the un-star — and if there
     * is not, the one button that makes one.
     */
    function selectedRows() {
      const s = state.selected;
      if (!s) {
        return [el('p', { class: 'map-empty', text:
          'Click anywhere on the map. What you clicked shows up here, with a button to keep it.' })];
      }
      const hit = s.hit;
      // a marker on that ground already — the click may have landed on it, or a cell beside it
      const marker = hit?.marker
        || (book ? book.here().find(m => Math.abs(m.cell.x - s.x) <= 1 && Math.abs(m.cell.y - s.y) <= 1) : null);

      const kids = [];
      const swatch = marker ? markerSwatch(marker, 18)
        : hit?.mark ? markSwatch(hit.mark.key, 18)
        : hit?.pad ? markSwatch(hit.pad.lit ? 'waypoint' : 'waypointOff', 18)
        : null;
      const head = el('div', { class: 'map-selected' });
      if (swatch) head.append(swatch);
      head.append(el('span', { class: 'pin-name', text: s.name || marker?.name || s.biomeName || 'somewhere' }));
      kids.push(head);
      kids.push(el('p', { class: 'small muted', text: `cell ${s.x},${s.y} · ${s.biomeName} · ${s.heightMetres} m` }));

      if (marker) {
        kids.push(markerRow(marker, { showDistance: false }));
      } else {
        kids.push(button('Add to Favorites', () => {
          /**
           * The default name is what the ground actually IS there, which beats "Place 4" — the same
           * rule ctrl-shift-click follows, and for the same reason. A region you have not been to
           * does not get named (B8).
           */
          const region = s.region && knows(s.region.id) ? s.region.name : '';
          const name = s.name || [s.biomeName || 'Somewhere', region].filter(Boolean).join(', ');
          book?.save?.({ cellX: s.x, cellY: s.y, name, from: { type: 'place' } });
          noteChange();
          buildSide();
          draw();
        }, 'small'));
      }

      /**
       * "Make the current teleport feature a debug option, but keep it enabled by default."
       * It answers to Settings → Debug; the waypoint button never does.
       */
      if (onTeleport && allowDebugTeleport()) {
        kids.push(button('Go here', () => { onTeleport(s.x * M_PER_CELL, s.y * M_PER_CELL); toggle(false); }, 'small'));
        kids.push(el('p', { class: 'small muted', text: 'Debug teleport — Settings → Debug turns this off.' }));
      }
      return kids;
    }

    /**
     * R17 — THE WAYPOINTS YOU HAVE LIT, WITH A STAR AND THE TWO SWITCHES.
     *
     * A pad is not a marker (see the note on `MARKER_LOOKS.waypoint`), so it needs its own rows. The
     * star is what item 19 asked for: `js/waypoints.js` keeps it, `minimapPads()` hands the starred
     * ones to the small map, and the two switches hide a pad you want to keep but stop seeing.
     *
     * Returns null when there is nothing to show, so the panel is not drawn empty.
     */
    function padList() {
      const all = waypoints?.list?.() || [];
      const lit = all.filter(p => p.lit);
      if (!lit.length) return null;
      const api = padBook();
      const player = playerCell();
      const sorted = [...lit].sort((a, b) =>
        (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
      const list = el('div', { class: 'pin-list' });
      for (const pad of sorted.slice(0, 18)) {
        const row = el('div', { class: 'pin-row' + (pad.starred ? ' tracked' : '') });
        if (api) {
          row.append(el('button', {
            class: 'pin-track' + (pad.starred ? ' on' : ''),
            text: pad.starred ? '★' : '☆',
            title: pad.starred ? 'A favorite — showing on the minimap. Click to un-star it.' : 'Add to Favorites, and to the minimap',
            onclick: () => { api.star(pad.id); noteChange(); buildSide(); draw(); },
          }));
        }
        row.append(markSwatch('waypoint', 15));
        row.append(el('span', { class: 'pin-name', text: pad.name }));
        row.append(el('span', { class: 'muted small', text:
          distanceText(Math.hypot(pad.x / M_PER_CELL - player.x, pad.z / M_PER_CELL - player.y) * M_PER_CELL) }));
        row.append(el('button', {
          class: 'pin-go', text: '⌖', title: `Show ${pad.name} on the map`,
          onclick: () => { state.padPick = pad.id; locate({ x: pad.x, z: pad.z, name: pad.name, kind: 'pad' }); },
        }));
        if (api) {
          for (const where of MARKER_VIEWS) {
            const [glyph, on, off] = VIEW_CHIPS[where];
            const isOn = pad[where] !== false;
            row.append(el('button', {
              class: 'pin-eye' + (isOn ? ' on' : ''), text: glyph, title: isOn ? on : off,
              onclick: () => { api.show(pad.id, where, !isOn); noteChange(); buildSide(); draw(); },
            }));
          }
        }
        list.append(row);
      }
      return list;
    }

    /**
     * R15 — the tracking list is two different questions, so it is two tabs.
     *
     * "Work" is what somebody has asked you to do and where it is. "Places" is what you decided to
     * remember. They were one list called Tracking, sorted by nothing in particular, which is why
     * the answer to "where is my quest" was to read fourteen rows.
     */
    if (tab === 'work') {
      side.append(panel('Work in hand', markerList(
        pins().filter(m => WORK_KINDS.has(m.kind)),
        'Nothing on your list. Notice boards are in settlements; people on the road ask too.',
      )));
    }

    if (tab === 'places') {
      /**
       * R17 — ITEM 11, THE WHOLE OF IT.
       *
       *   "On the map from the Places menu add a 'Selected' group that shows where you click on,
       *    and from there add an 'Add to Favorites' button that stores it under 'Places you keep'.
       *    Also rename 'Places you keep' which sounds weird, why not simply 'Favorites' or 'My
       *    Locations' or 'Starred Places'. … My idea is just keeping Places clean to actual
       *    locations you may want to visit."
       *
       * So the tab is three groups instead of one:
       *
       *   Selected   — what you last clicked, with the button that keeps it
       *   Favorites  — everything starred, whatever put it there (was "Places you keep")
       *   Places     — the rest of what you dropped or kept
       *
       * and deposits are NOT here at all any more: they are the Find tab's Tracked Resources, which
       * is the "keeping Places clean" half of the ask. A deposit you starred is a favourite like
       * anything else and appears in the first list — one marker, two lists, still one icon.
       */
      side.append(panel('Selected', ...selectedRows()));

      const mine = pins().filter(m => !WORK_KINDS.has(m.kind));
      side.append(panel('Favorites', markerList(
        mine.filter(m => m.starred),
        'Nothing starred yet. The ☆ on any row here or in Find adds it.',
      )));
      side.append(panel('Places', markerList(
        mine.filter(m => !m.starred && m.kind !== 'seam'),
        'Shift-click the map to drop a pin, or ctrl-shift-click to keep a place.',
      )));

      /**
       * Item 19 named waypoints specifically — "Waypoints favorited on the map with a star do not
       * show a star on the minimap" — and a pad is not a marker, so it needs its own row. Only the
       * lit ones: an unlit pad is somewhere you have not been, and sixty of those would bury the
       * handful you use. `js/waypoints.js` keeps the star and the two switches per pad.
       */
      const padRows = padList();
      if (padRows) side.append(panel('Waypoints', padRows));
    }

    /**
     * R14 — FIND. A material, a sweep, and where the hits are.
     *
     *   "The scanner tool should let you select a material and scan for it, displaying it with a
     *    marker in the world for some time and displaying it on the world map as well."
     *
     * A dropdown of everything the world can yield, each row saying where it lives, so the answer to
     * "where do you find clay?" is on the screen BEFORE you sweep — a sweep that comes back empty
     * still has to teach you something. The hits are listed nearest first with a ⌖ and a Keep.
     */
    if (tab === 'find' && findables && onSweep) {
      const kids = [];
      const rows = findables() || [];
      const st = scanState?.() || {};
      const pick = el('select', { class: 'find-pick' });
      pick.append(el('option', { value: '', text: 'anything at all' }));
      for (const r of rows) {
        const o = el('option', { value: r.id, text: r.name });
        if (r.id === findWant) o.selected = true;
        pick.append(o);
      }
      pick.onchange = () => { findWant = pick.value || null; buildSide(); };
      kids.push(pick);

      const chosen = rows.find(r => r.id === findWant);
      if (chosen?.where) kids.push(el('p', { class: 'muted small', text: chosen.where }));

      kids.push(el('button', {
        class: 'chip',
        text: findWant ? `Sweep for ${(chosen?.name || findWant).toLowerCase()}` : 'Sweep for anything',
        onclick: () => { onSweep(findWant); buildSide(); draw(); },
      }));

      /**
       * R16 — THE FIND TAB READS THE SURVEY, NOT JUST THE LAST SWEEP.
       *
       *   "We should update the map in 'Find' mode to respect this and have a sort by distance
       *    option and filter by favorites."
       *
       * Two lists were being kept and only one was being shown. The Sweep button's hits are a
       * snapshot that a second sweep throws away; the hand scanner's survey is everything you have
       * ever walked past with it running, and it survives the save. They are merged here, deduped
       * by node id, so a deposit found by either route is in the one list.
       *
       * FAVOURITES are the marker book's starred entries — the same ✦ the Keep button files — so
       * "filter by favourites" means the places you already said mattered, not a second idea of
       * the word.
       */
      /**
       * R17 — FAVOURITED AND TRACKED ARE TWO DIFFERENT ANSWERS, AND BOTH COME OFF THE MARKER.
       *
       *   "Also marking a resource on the map shouldn't necessarily favorite the location. Maybe we
       *    should have 'Tracked Resources' under the Find menu that is persistent list of what
       *    you've tracked (until you untrack it) but you can also favorite these locations to put
       *    them under Places."
       *
       * R16 worked a row's favourite state out by rounding its METRES and looking the string up in a
       * set built from marker CELLS multiplied back into metres — which agreed only by accident, and
       * only for a marker whose cell happened to round the same way. Worse, it was one-way: there
       * was a ✦ that kept a place and nothing anywhere that un-kept it ("I starred Copper Ore from
       * the Find menu and I can see it under Places you keep menu, but I don't see a way to un-star
       * it").
       *
       * Both questions are now asked of the marker that is actually standing on that ground, so
       * there is one answer and it can be toggled from either end.
       */
      const me = whereIsPlayer();
      const cellOf = h => ({ x: Math.floor(h.x / M_PER_CELL), y: Math.floor(h.z / M_PER_CELL) });
      const markerFor = h => {
        if (!book) return null;
        const c = cellOf(h);
        return book.trackedResource({ id: h.id, cellX: c.x, cellY: c.y })
          || book.here().find(m => Math.abs(m.cell.x - c.x) <= 1 && Math.abs(m.cell.y - c.y) <= 1)
          || null;
      };
      const survey = (scanned?.() || []).map(r => ({ ...r, from: 'survey' }));
      const seen = new Set();
      const merged = [];
      for (const h of [...(st.hits || []).map(h => ({ ...h, from: 'sweep' })), ...survey]) {
        const key = String(h.id ?? `${Math.round(h.x)},${Math.round(h.z)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        const distance = h.distance ?? Math.hypot(h.x - me.x, h.z - me.z);
        const mark = markerFor(h);
        merged.push({ ...h, distance, mark, fav: !!mark?.starred, kept: !!mark && mark.kind === 'seam' });
      }
      const shown = merged
        .filter(h => !findWant || h.resource === findWant)
        .filter(h => !findFavOnly || h.fav)
        .sort((a, b) => (findSort === 'name'
          ? String(a.name).localeCompare(String(b.name)) || a.distance - b.distance
          : a.distance - b.distance));

      const sortRow = el('div', { class: 'find-row' });
      const sortPick = el('select', { class: 'find-pick' });
      for (const [v, t] of [['distance', 'Nearest first'], ['name', 'By name']]) {
        const o = el('option', { value: v, text: t });
        if (v === findSort) o.selected = true;
        sortPick.append(o);
      }
      sortPick.onchange = () => { findSort = sortPick.value; buildSide(); };
      const favBox = el('label', { class: 'find-fav' });
      const favTick = el('input');
      favTick.type = 'checkbox';
      favTick.checked = findFavOnly;
      favTick.onchange = () => { findFavOnly = favTick.checked; buildSide(); };
      favBox.append(favTick, el('span', { class: 'small', text: 'Favorites only' }));
      sortRow.append(sortPick, favBox);
      kids.push(sortRow);

      if (!shown.length) {
        kids.push(el('p', {
          class: 'muted small',
          text: st.swept || survey.length
            ? (findFavOnly
              ? 'Nothing in your survey is starred yet. The \u2606 on a row adds it to Favorites.'
              : 'Nothing found. Sweep from somewhere else, or carry the scanner and walk.')
            : 'Sweep from here, or build a Prospector\u2019s Scanner and everything you walk past is remembered.',
        }));
      } else {
        const list = el('div', { class: 'pin-list' });
        for (const h of shown.slice(0, 24)) {
          const row = el('div', { class: 'pin-row' + (h.kept ? ' tracked' : '') });

          /**
           * The star: Favorites, in both directions, from this tab as well as from Places. It stars
           * whatever marker is on that ground; where there is none it asks the game to keep the
           * place (`onKeep`, which logs it and writes the save), and `MarkerBook.save()` absorbs a
           * deposit you are already tracking rather than laying a second icon on top of it.
           */
          row.append(el('button', {
            class: 'pin-track' + (h.fav ? ' on' : ''),
            text: h.fav ? '\u2605' : '\u2606',
            title: h.fav ? 'A favorite. Click to un-star it.' : 'Add to Favorites',
            onclick: () => {
              if (h.mark) book.star(h.mark, !h.mark.starred);
              else if (onKeep) onKeep(h);
              else book?.save?.({ cellX: cellOf(h).x, cellY: cellOf(h).y, name: h.name });
              noteChange();
              buildSide();
              draw();
            },
          }));

          row.append(el('i', { class: 'pin-dot', text: '\u25c6', style: `color:${h.colour || '#c08a3e'}` }));
          row.append(el('span', { class: 'pin-name', text: h.name }));
          row.append(el('span', { class: 'muted small', text: distanceText(h.distance) }));
          row.append(el('button', {
            class: 'pin-go', text: '\u2316', title: `Show this ${String(h.name).toLowerCase()} on the map`,
            onclick: () => locate({ x: h.x, z: h.z, name: h.name, kind: 'seam' }),
          }));

          /**
           * \u2026and the track, which is the new thing: a persistent mark on the map that is NOT a
           * favourite. "marking a resource on the map shouldn't necessarily favorite the location."
           */
          row.append(el('button', {
            class: 'pin-eye' + (h.kept ? ' on' : ''),
            text: '\u25c8',
            title: h.kept ? 'Tracked \u2014 on the map until you untrack it. Click to stop.' : 'Track this deposit: keep it on the map',
            onclick: () => {
              const c = cellOf(h);
              if (h.kept) book.untrackResource(h.mark);
              else book.trackResource({ id: h.id, name: h.name, cellX: c.x, cellY: c.y, colour: h.colour, note: h.band ? `${h.band} seam` : '' });
              noteChange();
              buildSide();
              draw();
            },
          }));
          list.append(row);
        }
        kids.push(list);
        if (shown.length > 24) kids.push(el('p', { class: 'muted small', text: `and ${shown.length - 24} more` }));
      }
      side.append(panel('Find', ...kids));

      /**
       * R17 \u2014 TRACKED RESOURCES: the persistent list, under Find, where the user asked for it.
       *
       *   "\u2026a persistent list of what you've tracked (until you untrack it) \u2026 My idea is just
       *    keeping Places clean to actual locations you may want to visit."
       *
       * So deposits are here and NOT in Places any more. They are the same `seam` markers the map
       * draws, which is why this list survives a save without anything new going into one: they are
       * already inside `markers.toJSON()`.
       */
      side.append(panel('Tracked Resources', markerList(
        book ? book.resourceTracks() : [],
        'Nothing tracked. The \u25c8 on a row above keeps a deposit on the map until you untrack it.',
      )));
    }

    // Markers on OTHER worlds. They cannot be drawn on this map, so they are listed with the world
    // they are on — the same list space mode puts a ring around.
    const away = book ? book.elsewhere() : [];
    if (away.length) {
      const other = el('div', { class: 'pin-list' });
      for (const g of away) {
        other.append(el('div', { class: 'pin-row' },
          el('i', { class: 'pin-dot', text: '◉', style: 'color:#9fb4d4' }),
          el('span', { class: 'pin-name', text: g.planetName || 'an unnamed world' }),
          el('span', { class: 'muted small', text: `${g.markers.length}${g.tracked ? ' · ' + g.tracked + ' tracked' : ''}` }),
        ));
      }
      if (tab === 'places') side.append(panel('Other worlds', other));
    }

    /**
     * YOUR BASES, WHEREVER THEY ARE.
     *
     * The pads above are this world's. This list is not: it is every base the character ever
     * raised, in this system or any other, each with how many legs the trip home takes. A base four
     * hundred light years away is still one button — "It should be easy to teleport back to your
     * bases even if you go to a different star system" — it just costs more of the clock.
     */
    if (bases) {
      const rows = bases.list() || [];
      if (rows.length) {
        const list = el('div', { class: 'pin-list' });
        for (const b of rows) {
          const where = b.step === 'here'
            ? (b.away != null ? distanceText(b.away / M_PER_CELL) : 'on this world')
            : b.step === 'land' ? (b.planetName || 'another world')
            : (b.starName || 'another system');
          const row = el('div', { class: 'pin-row' },
            el('i', { class: 'pin-dot', text: '⌂', style: `color:${b.ok ? '#6ad0ff' : '#8a8f98'}` }),
            el('span', { class: 'pin-name', text: b.name }),
            el('span', { class: 'muted small', text: where }),
          );
          const go = el('button', { class: 'small', text: b.step === 'here' ? 'Travel' : 'Fold home' });
          go.disabled = !b.ok;
          if (!b.ok) go.title = b.reason || '';
          go.onclick = () => { if (bases.go && bases.go(b.id)) toggle(false); };
          row.append(go);
          list.append(row);
        }
        if (tab === 'places' || tab === 'supply') side.append(panel('Your bases', list));
      }
    }

    /**
     * The picked waypoint, and the one button that carries you there.
     *
     * The refusal is printed here rather than only in the log, because this panel is where the
     * decision is made — being told "you have not been to Hollowcrown yet" after the screen has
     * closed is a worse answer than being told before you press anything.
     */
    if (state.padPick != null && waypoints) {
      const pad = (waypoints.list() || []).find(p => p.id === state.padPick);
      if (!pad) {
        state.padPick = null;
      } else {
        const me = playerCell();
        const away = Math.hypot(pad.x / M_PER_CELL - me.x, pad.z / M_PER_CELL - me.y);
        const can = waypoints.canTravel ? waypoints.canTravel(pad.id) : { ok: pad.lit };
        const kids = [
          el('p', { class: 'small', text: `${pad.kind === 'built' ? 'your own waypoint' : 'a settlement'} · ${distanceText(away)}` }),
          el('p', { class: 'small', text: pad.lit ? 'The sigils are lit.' : 'The sigils are dark. Walk in once to wake them.' }),
        ];
        if (!can.ok && can.why) kids.push(el('p', { class: 'small bad', text: can.why }));
        const go = button('Travel to this waypoint', () => {
          if (waypoints.travel && waypoints.travel(pad.id)) toggle(false);
        }, 'small');
        go.disabled = !can.ok;
        kids.push(go);
        side.append(panel(pad.name, ...kids));
      }
    }

    /**
     * R17: on the Places tab this is the Selected group, built above — everything this panel used to
     * say, plus what you clicked and the button that keeps it. On the other three tabs the old
     * cell panel stays, so the debug teleport does not vanish when you are looking at Supply.
     */
    if (state.selected && tab !== 'places') {
      const s = state.selected;
      const kids = [el('p', { class: 'small', text: `${s.biomeName} · ${s.heightMetres} m` })];
      /**
       * "Make the current teleport feature a debug option, but keep it enabled by default."
       *
       * Standing on any cell you can see is not a game rule, it is a way of getting to a bug. It
       * answers to Settings → Debug now; the waypoint button above it never does.
       */
      if (onTeleport && allowDebugTeleport()) {
        kids.push(button('Go here', () => { onTeleport(s.x * M_PER_CELL, s.y * M_PER_CELL); toggle(false); }, 'small'));
        kids.push(el('p', { class: 'small muted', text: 'Debug teleport — Settings → Debug turns this off.' }));
      }
      side.append(panel(`Cell ${s.x},${s.y}`, ...kids));
    }

    // ---- R15: Supply — the outposts you have built and the carts running between them
    if (tab === 'supply' && outposts) {
      const posts = outposts() || [];
      const links = (supplyLinks?.() || []);
      const kids = [];

      if (!posts.length) {
        kids.push(el('p', { class: 'muted small', text:
          'Nothing built yet. A drill and a crate standing near each other is an outpost — you do '
          + 'not have to declare one. An Outpost Marker names it and claims ninety metres around itself.' }));
      }

      for (const p of posts) {
        const row = el('div', { class: 'pin-row' + (supplyFrom === p.id ? ' tracked' : '') });
        row.append(
          el('i', { class: 'pin-dot', text: ROLE_GLYPH[p.role] || '\u25a3', style: `color:${ROLE_COLOUR[p.role] || '#c8b48a'}` }),
          el('span', { class: 'pin-name', text: p.name }),
          el('span', { class: 'muted small', text: `${p.count} piece${p.count === 1 ? '' : 's'}` }),
          el('button', {
            class: 'pin-go', text: '\u2316', title: `Show ${p.name} on the map`,
            onclick: () => locate({ x: p.x, z: p.z, name: p.name, kind: 'base' }),
          }),
        );
        /**
         * Two clicks make a route: pick a source, then pick a destination. The same two-click shape
         * the Route tool uses in build mode, because it is the same idea and learning it twice
         * would be one time too many.
         */
        if (p.poolId) {
          row.append(el('button', {
            class: 'pin-keep',
            text: supplyFrom === p.id ? '\u2717' : '\u2192',
            title: supplyFrom === p.id
              ? 'Stop — do not send from here after all'
              : supplyFrom ? `Send from ${posts.find(q => q.id === supplyFrom)?.name} to ${p.name}` : `Send goods FROM ${p.name}`,
            onclick: () => {
              if (supplyFrom === p.id) { supplyFrom = null; buildSide(); return; }
              if (!supplyFrom) { supplyFrom = p.id; buildSide(); return; }
              const a = posts.find(q => q.id === supplyFrom);
              const out = onLink?.(a?.poolId, p.poolId, { batch: supplyBatch });
              supplyFrom = null;
              buildSide(); draw();
              return out;
            },
          }));
        }
        kids.push(row);
      }

      if (posts.length) {
        /**
         * The max limit, as the user asked for it. It is per SHIPMENT, not per hour: a cart holds
         * what a cart holds, and a number of things per trip is something a player can picture.
         */
        const cap = el('div', { class: 'pin-row' },
          el('span', { class: 'pin-name', text: 'Most per cart' }),
          el('input', {
            class: 'supply-cap', type: 'number', min: '1', max: '500', value: String(supplyBatch),
            oninput: ev => { supplyBatch = Math.max(1, Math.min(500, Number(ev.target.value) || 1)); },
          }),
        );
        kids.push(cap);
      }

      if (links.length) {
        kids.push(el('div', { class: 'divider', text: 'Running' }));
        for (const l of links) {
          const row = el('div', { class: 'pin-row' },
            el('i', { class: 'pin-dot', text: '\u2192', style: 'color:#8fd3ff' }),
            el('span', { class: 'pin-name', text: `${l.fromName} → ${l.toName}` }),
            el('span', { class: 'muted small', text: l.quote?.ok ? `${Math.round(l.quote.seconds)}s · ${l.batch}/cart` : 'no way through' }),
          );
          row.append(el('button', {
            class: 'pin-del', text: '\u00d7', title: 'Stop this route',
            onclick: () => { onUnlink?.(l.id); buildSide(); draw(); },
          }));
          kids.push(row);
        }
      }
      side.append(panel('Supply', ...kids));
    }

    /**
     * R15 — AND THE REFERENCE MATERIAL, AT THE BOTTOM, FOLDED.
     *
     * Layers, the key and the biome breakdown used to be the first three things on this panel, which
     * put three blocks of "here is what the colours mean" above the first thing anybody opened the
     * map for. They are true and occasionally needed and they are not what the screen is FOR.
     *
     * `state.legendOpen` survives a rebuild, so a player who wants the layers open while they work
     * keeps them open — the fold is a default, not a rule.
     */
    const ref = el('details', { class: 'map-ref' });
    ref.open = !!state.legendOpen;
    ref.addEventListener('toggle', () => { state.legendOpen = ref.open; });
    ref.append(el('summary', { text: 'Layers, key and what this world is made of' }));
    const refBody = el('div', { class: 'map-ref-body' });
    refBody.append(layerPanel, keyBox, compositionBox);
    ref.append(refBody);
    side.append(ref);
  }

  // ---------------------------------------------------------------- drawing
  /**
   * Size the backing buffer to the canvas's OWN box.
   *
   * It used to measure the WRAPPER — which has 26px of padding and also holds the legend and the
   * readout underneath — and then force that size back on to the canvas with `style.width`. So the
   * canvas was wider and taller than the space it had, ran under the opaque layers panel, and cut
   * region names off the right-hand edge mid-word. The wrapper is a column flex and the canvas is
   * `flex: 1` in it, so its box is already right; only the buffer needs setting. (Exactly the bug
   * the perk canvas had, for exactly the same reason.)
   */
  function fit() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width || canvas.clientWidth || 640);
    const h = Math.max(240, rect.height || canvas.clientHeight || 480);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // R17: remembered so a hit radius can be written in CSS pixels and scaled once. A 9-BUFFER-pixel
    // target is four and a half real pixels on a retina screen, which is not a target.
    bufferDpr = dpr;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    const moved = canvas.width !== bw || canvas.height !== bh;
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    return moved;
  }

  /**
   * The legend under the canvas changes height as it fills, which changes the canvas's own height —
   * so the first draw of a freshly opened map can be one row out. One re-fit settles it, and the
   * guard stops that becoming a loop.
   */
  let settling = false;
  function draw() {
    if (!state.open) return;
    if (fit() && !settling) { settling = true; requestAnimationFrame(() => { settling = false; draw(); }); }
    // R17: one hit list, rebuilt in paint order every draw, so it can never describe a mark that
    // has moved and the thing on top is the thing you point at. See `hitAt()`.
    hits.length = 0;
    /**
     * R17 — item 20: an outpost is a place on the map, and this is where it becomes one.
     *
     * Done in `draw()` rather than in main.js because this screen is already handed `outposts()` and
     * the marker book, and a join made in the file that has both ends of it is a join that cannot
     * be forgotten. It is cheap: the ledger is already being read for the Supply layer.
     */
    if (outposts && book) {
      try { syncOutpostMarkers(book, outposts() || [], { metresPerCell: M_PER_CELL }); }
      catch { /* a half-built ledger is not worth losing the whole map over */ }
    }
    const ctx = canvas.getContext('2d');
    // draw the map at the zoom the wheel asked for, positioned around the player. renderWorld takes
    // its own scale and offset, so there is no second transform to keep in step with the overlays.
    const { scale, offsetX: ox, offsetY: oy } = viewBox();
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    /**
     * ZOOMING IN GIVES YOU MORE MAP, NOT A BIGGER BLUR.
     *
     * "When zooming in it gets extremely laggy / low FPS yet the map doesn't actually get more
     * detailed. Can the map get more detailed, eventually fading into the interim and then fully
     * zoomed in levels like seen in the Star Forge experiment?"
     *
     * Past `DETAIL_FROM` the view switches to World Forge's own **region detail** — the same six-
     * times pass the World Forge viewer uses — for whichever region is under the middle of the
     * screen. It is generated once per region and cached, so panning around inside one costs
     * nothing, and it is a genuinely different map rather than the same pixels made larger.
     */
    const details = state.zoom >= DETAIL_FROM ? detailsUnderView() : [];
    if (details.length) {
      drawDetail(ctx, details, scale, ox, oy);
      state.view = { scale, offsetX: ox, offsetY: oy, detail: details[0].regionId, details: details.length };
    } else {
      state.view = renderWorld(ctx, drawnWorld(), {
        // 4.11: the place marks are ours now — `drawPlaces` puts every one of them down from the
        // one table the key is drawn from. Labels stay World Forge's.
        layers: { ...state.layers, nodes: false }, layer: state.layer,
        scale, offsetX: ox, offsetY: oy,
      });
    }

    drawWaypoints(ctx, scale, ox, oy);
    drawPortals(ctx, scale, ox, oy);
    drawScan(ctx, scale, ox, oy);
    drawSupply(ctx, scale, ox, oy);

    // B8: where a name has been held back, say so in grey rather than leaving a gap the player
    // reads as empty ground. The band under it still tells them whether they could survive there.
    // The two tests are renderWorld's own (`worldgen/js/render.js:278-281`), so the grey word lands
    // exactly where the name would have, at exactly the zooms that would have shown one.
    if (zones && state.layers.labels && !details.length && scale >= 1.6) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px system-ui, sans-serif';
      for (const zone of zones.zones) {
        if (knows(zone.id) || (zone.cells || 0) < 40 / Math.max(0.6, scale / 4)) continue;
        const spot = world.regions?.[zone.id]?.label || zone.center;
        if (!spot) continue;
        const lx = ox + (spot.x + 0.5) * scale, ly = oy + (spot.y + 0.5) * scale;
        if (lx < ox - 40 || ly < oy - 20 || lx > ox + world.width * scale + 40) continue;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText('unknown', lx, ly);
        ctx.fillStyle = 'rgba(150, 162, 178, .85)';
        ctx.fillText('unknown', lx, ly);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // ---- the level-band overlay: every region washed in how dangerous it is to YOU right now
    if (state.levels && zones) {
      /**
       * WASH ONLY WHAT IS ON SCREEN.
       *
       * "It still gets exponentially laggy when I zoom in on the world map while on a planet."
       *
       * This grabbed `world.width * scale` by `world.height * scale` pixels — the whole world at the
       * current zoom — and walked every one of them in JavaScript. At the top of the zoom ladder
       * that is a 13,670 x 13,670 pixel buffer: 186 million pixels, about 747 MB, for a canvas that
       * can show maybe two million of them. It is quadratic in the zoom, which is exactly the
       * "exponentially laggy" the player saw, and it was three and a quarter seconds a frame.
       *
       * The fix is the whole of the bug: you can only see the canvas, so only read back the part of
       * the world rectangle that lands on it. At zoom 1 that is everything and nothing changes.
       */
      const myLevel = getLevel();
      const x0 = Math.max(0, Math.floor(ox));
      const y0 = Math.max(0, Math.floor(oy));
      const x1 = Math.min(canvas.width, Math.ceil(ox + world.width * scale));
      const y1 = Math.min(canvas.height, Math.ceil(oy + world.height * scale));
      if (x1 > x0 && y1 > y0) {
        const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
        const px = img.data;
        const w = img.width, h = img.height;
        // a row of canvas pixels is a row of world cells; work the cell out once per row and column
        for (let y = 0; y < h; y++) {
          const cy = Math.min(world.height - 1, Math.max(0, Math.floor((y + y0 - oy) / scale)));
          const row = cy * world.width;
          for (let x = 0; x < w; x++) {
            const cx = Math.min(world.width - 1, Math.max(0, Math.floor((x + x0 - ox) / scale)));
            const id = world.region ? world.region[row + cx] : -1;
            if (id < 0) continue;
            const zone = zones.byId(id);
            if (!zone) continue;
            const [r, g, b] = TONE_RGB[zoneTone(zone.midLevel, myLevel)] || TONE_RGB.even;
            const i = (y * w + x) * 4;
            px[i] = px[i] * 0.62 + r * 0.38;
            px[i + 1] = px[i + 1] * 0.62 + g * 0.38;
            px[i + 2] = px[i + 2] * 0.62 + b * 0.38;
          }
        }
        ctx.putImageData(img, x0, y0);
      }

      // The band, written ON the map under the region's own name — the user asked for it to read
      // "similar to how region names appear", and renderWorld puts those at `region.label`, which
      // is the open middle of the region rather than its centroid.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      /**
       * Forty-odd regions, each with a name, a level band and a danger word, all drawn wherever their
       * own centre happens to be — in the dense middle of a continent that is a wall of overlapping
       * text. Biggest regions first, and a label is only drawn if its box is clear of the ones
       * already down. Nothing is hidden that could have been read.
       */
      const placed = [];
      const clearOf = (x, y, halfW) => {
        for (const b of placed) if (Math.abs(b.x - x) < b.halfW + halfW && Math.abs(b.y - y) < 22) return false;
        return true;
      };
      for (const zone of [...zones.zones].sort((a, b) => (b.cells || 0) - (a.cells || 0))) {
        const spot = world.regions?.[zone.id]?.label || zone.center;
        if (!spot || zone.cells < 18) continue;
        const lx = ox + (spot.x + 0.5) * scale;
        // sit under the name when labels are on, and in its place when they are not
        const ly = oy + (spot.y + 0.5) * scale + (state.layers.labels ? 15 : 0);
        const tone = zoneTone(zone.midLevel, myLevel);
        const label = `${zone.minLevel}\u2013${zone.maxLevel}`;
        const halfW = Math.max(30, (zone.name?.length || 8) * 3.4);
        if (!clearOf(lx, ly, halfW)) continue;
        placed.push({ x: lx, y: ly, halfW });
        ctx.font = '700 14px system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.88)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = TONE_TEXT[tone] || '#ffe08a';
        ctx.fillText(label, lx, ly);
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeText(zone.danger, lx, ly + 12);
        ctx.fillText(zone.danger, lx, ly + 12);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // ---- every place on this world, in one pass, so a route can be planned around what is on it
    drawPlaces(ctx, scale, ox, oy);

    // anything still falling, so you can plan the walk before it lands
    for (const m of meteors?.marks || []) {
      const mx = ox + (m.x / M_PER_CELL + 0.5) * scale, my = oy + (m.z / M_PER_CELL + 0.5) * scale;
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff8a40'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = '#ff8a40'; ctx.textAlign = 'center';
      ctx.fillText('\u2604', mx, my + 4);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`${m.secondsLeft}s`, mx, my + 18);
      ctx.textAlign = 'left';
    }

    // markers: quests, story objectives, dropped pins. A tracked one gets a ring around it, so you
    // can tell at a glance which of them the minimap is going to keep pointing at.
    for (const m of pins()) {
      /**
       * R17 — item 19: a marker you switched off is not drawn here.
       *
       *   "That way you can uncheck those to keep them favorited but hide them from the map/world
       *    so they are not distracting."
       *
       * `showOnMap !== false` rather than `showOnMap` on purpose: a marker out of a save written
       * before this round has no such field, and an absent switch must read as ON.
       */
      if (m.showOnMap === false) continue;
      const look = MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin;
      const px = ox + (m.cell.x + 0.5) * scale, py = oy + (m.cell.y + 0.5) * scale;
      const colour = m.done ? '#9ae06a' : (m.colour || look.color);
      if (m.tracked) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(9, scale * 1.5), 0, Math.PI * 2);
        ctx.strokeStyle = colour; ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      /**
       * R17 — the disc, the glyph and the favourite, as ONE icon at the marker's true position.
       *
       * See `drawMarkerDot` at the top of this file for the whole of why: the star used to be
       * painted a marker and a half up and to the left, so a kept ore seam read as two unrelated
       * things and the eye went to the one that was not where the ore is.
       */
      const dotR = Math.max(4, scale * 0.8);
      drawMarkerDot(ctx, m, px, py, dotR);
      // R17: and it goes on the one hit list, at the size it was actually drawn
      pushHit('marker', px, py, Math.max(10 * bufferDpr, dotR + 5 * bufferDpr), { marker: m, key: 'm:' + m.id });
      if (m.name) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#ffe6a8';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        ctx.strokeText(m.name, px + 10, py + 4);
        ctx.fillText(m.name, px + 10, py + 4);
      }
    }

    /**
     * R14 — WHERE YOU ASKED TO BE SHOWN.
     *
     *   "add a target icon to 'locate on map' which opens the map, centered on that location."
     *
     * Centring alone is not enough on a map that draws a couple of hundred marks: you get taken
     * somewhere and then have to work out which of the things in front of you was the answer. Three
     * dashed rings breathe outward over 1.4 s and restart, for as long as `focus.until` says, with
     * the name beside them. Drawn after the places and before the player, so nothing important hides
     * under it.
     */
    if (state.focus) {
      const f = state.focus;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now >= f.until) state.focus = null;
      else {
        const fx = ox + (f.x + 0.5) * scale, fy = oy + (f.y + 0.5) * scale;
        const t = ((now - (f.start || 0)) % 1400) / 1400;
        const grow = 1 + t * 0.35;
        const base = Math.max(10, scale * 1.4);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = FOCUS_COLOURS[f.kind] || FOCUS_COLOURS.place;
        for (const [k, alpha] of [[1, 0.9], [1.7, 0.55], [2.6, 0.3]]) {
          ctx.globalAlpha = alpha * (1 - t);
          ctx.beginPath();
          ctx.arc(fx, fy, base * k * grow, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        if (f.name) {
          ctx.font = '700 13px system-ui, sans-serif';
          ctx.fillStyle = FOCUS_COLOURS[f.kind] || FOCUS_COLOURS.place;
          ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 3;
          const ly = fy - base * 2.6 - 8;
          ctx.strokeText(f.name, fx + 8, ly);
          ctx.fillText(f.name, fx + 8, ly);
        }
      }
    }

    // enemies near the player
    const player = whereIsPlayer();
    ctx.fillStyle = '#ff5a3c';
    for (const e of getEnemies()) {
      if (e.dying != null) continue;
      const cx = ox + (e.x / M_PER_CELL + 0.5) * scale, cy = oy + (e.z / M_PER_CELL + 0.5) * scale;
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }

    // the player, pointing the way they face
    const px = ox + (player.x / M_PER_CELL + 0.5) * scale;
    const py = oy + (player.z / M_PER_CELL + 0.5) * scale;
    ctx.save();
    ctx.translate(px, py);
    // see hud.js drawMinimap: the map draws +z downward, so the rotation that points a tip-up arrow
    // along the player's heading is `π - yaw`, not `-yaw`. It pointed north while you walked south.
    ctx.rotate(Math.PI - player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#102030'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    /**
     * Crosshairs through the player when the whole planet is on screen. At zoom 1 a person is four
     * pixels on a map of a world and finding yourself is genuinely hard; two hairlines solve it
     * without cluttering a zoomed-in view, so they fade out as you zoom in.
     */
    if (state.zoom <= 1.2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(160, 220, 255, .38)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.moveTo(0, py); ctx.lineTo(canvas.width, py);
      ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height);
      ctx.stroke();
      ctx.restore();
    }

    // legend: the danger scale first when the overlay is up, then whichever layer is drawn
    const rows = [];
    if (state.levels && zones) {
      for (const [tone, label] of TONE_LABELS) {
        rows.push(el('span', { class: 'sw' }, el('i', { style: { background: TONE_TEXT[tone] } }), label));
      }
      // the three place swatches that used to sit here were a colour each for fifteen kinds of
      // place; the key in the side panel draws all of them, with their real shapes
      rows.push(el('span', { class: 'sw muted' }, 'places and their marks are in the key, right'));
    }
    /**
     * The legend used to mix two unrelated scales on one line: "far below you / a fair fight / do not
     * go here yet" next to "Sea Ice 22% Grassland 13%", which is World Forge's own composition
     * readout — a debug number, not something a player is planning a route with. The danger scale
     * stays under the map; the biome breakdown moves into the side panel, behind a fold.
     */
    /**
     * R14 — THE STRIP UNDER THE MAP GOES BLANK WHEN THE LEVEL OVERLAY IS OFF.
     *
     *   "The legend also does not seem to line up with the actual icons used on the map very well."
     *
     * `rows` was only filled `if (state.levels && zones)`, so turning the bands off — or switching
     * to Elevation, or Temperature — left the strip empty and the colour ramp for the layer you were
     * actually looking at buried in a collapsed fold in the side panel. Whichever layer is drawn now
     * always has its own key under it.
     *
     * And the danger strip never said what the numbers ON the map are: the map writes "14–17" and
     * "Hostile" in those colours and nothing explained that the top line is a level range and the
     * bottom is the region's own character.
     */
    if (rows.length) {
      rows.unshift(el('span', { class: 'sw muted' }, 'a region shows its level range and how rough it is:'));
    } else {
      const ramp = legendRows(world, state.layer)
        .filter(r => r.share > 0.004)
        .slice(0, 10)
        .map(r => el('span', { class: 'sw' }, el('i', { style: { background: r.color } }), r.label));
      if (ramp.length) rows.push(el('span', { class: 'sw muted' }, `${LAYER_WORDS[state.layer] || state.layer}:`), ...ramp);
    }

    legendBox.replaceChildren(...rows);
    const parts = legendRows(world, state.layer)
      .filter(r => r.share > 0.004)
      .slice(0, 14)
      .map(r => el('span', { class: 'sw' }, el('i', { style: { background: r.color } }),
        `${r.label} ${Math.round(r.share * 100)}%`));
    if (compositionBox) {
      compositionBox.replaceChildren(
        /**
         * R14: this always said "What <planet> is made of" while the rows below it came from
         * whichever layer was drawn — so on the Temperature layer it offered to tell you what the
         * planet was made of and then listed temperature bands.
         */
        el('summary', { text: state.layer === 'biomes'
          ? `What ${world.planet?.name || 'this world'} is made of`
          : `${LAYER_WORDS[state.layer] || state.layer}, across the whole world` }),
        el('div', { class: 'legend' }, ...parts),
      );
      compositionBox.hidden = !parts.length;
    }

    // …and the seed and the metres are a debug readout too, behind the same switch as the HUD's
    coords.textContent = (showCoords?.()
      ? `seed ${seed} · ${Math.round(player.x)}, ${Math.round(player.z)} m · cell ${Math.round(player.x / M_PER_CELL)},${Math.round(player.z / M_PER_CELL)} · `
      : '')
      + `${Math.round(world.width * M_PER_CELL / 1000)} km across · zoom ${state.zoom}× · scroll to zoom, drag to pan`;
  }

  /**
   * The same fit renderWorld used, so overlays land on the right pixels — then the zoom on top.
   *
   * `zoom` is a whole-map multiplier and `centre` is the cell the view is built around (the player,
   * unless the map has been dragged). At zoom 1 it is exactly what renderWorld drew.
   */
  /**
   * The view, kept ON the world.
   *
   * It centred on the player without caring where the edges were, so a player near the north coast
   * opened the map to a third of a screen of empty space above the world and the south cut off. The
   * offset is clamped to the world's own edges now — and when the drawn world is smaller than the
   * canvas on an axis, it is centred on that axis instead, which is the only sensible answer.
   */
  function viewBox() {
    const fit = Math.min(canvas.width / world.width, canvas.height / world.height);
    const scale = fit * state.zoom;
    const c = state.centre || playerCell();
    const drawnW = world.width * scale, drawnH = world.height * scale;
    const clamp = (want, drawn, box) => drawn <= box
      ? Math.round((box - drawn) / 2)
      : Math.round(Math.max(box - drawn, Math.min(0, want)));
    return {
      scale, fit,
      offsetX: clamp(canvas.width / 2 - c.x * scale, drawnW, canvas.width),
      offsetY: clamp(canvas.height / 2 - c.y * scale, drawnH, canvas.height),
    };
  }

  /**
   * The region detail under the middle of the view, generated once and kept.
   *
   * A detail pass is a quarter of a million cells of noise, so it is cached by region id and only
   * ever built for the one you are looking at. Falls back to null (and therefore to the plain world
   * image) on a world with no named regions.
   */
  const detailCache = new Map();
  function detailUnderView() {
    const all = detailsUnderView();
    return all.length ? all[0] : null;
  }

  /**
   * EVERY REGION ON SCREEN, NOT JUST THE ONE UNDER THE MIDDLE.
   *
   * "I see some tiles are higher quality when zooming in, but others surrounding it are still blurry
   * chunky pixels. It should be more seamless so as you zoom in you see more detail."
   *
   * That is exactly what it did: the detail pass ran for whichever region sat under the centre of
   * the view and nothing else, so one region sharpened and its neighbours stayed at world
   * resolution — and the seam moved around as you panned, which is worse than no detail at all.
   *
   * The visible world rectangle is sampled for which regions it actually touches, and each of those
   * is generated and drawn. Generation is cached per region and the shaded raster is cached on top
   * of that (`rasterFor`), so this costs once per region per session and a pan across a border is
   * free afterwards. The cap is there because a zoomed-OUT view can touch forty regions, and at that
   * zoom the detail would not be visible anyway — `DETAIL_FROM` already keeps us above it.
   */
  function detailsUnderView() {
    if (!world.region || !world.regions?.length) return [];
    const { scale, offsetX: ox, offsetY: oy } = viewBox();

    // which world cells the canvas can actually show
    const x0 = Math.max(0, Math.floor((0 - ox) / scale));
    const y0 = Math.max(0, Math.floor((0 - oy) / scale));
    const x1 = Math.min(world.width, Math.ceil((canvas.width - ox) / scale));
    const y1 = Math.min(world.height, Math.ceil((canvas.height - oy) / scale));
    if (x1 <= x0 || y1 <= y0) return [];

    // sample rather than walk: a region is tens of cells across, so a stride cannot miss one that
    // covers enough of the screen to be worth sharpening
    const stride = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
    const ids = [];
    const seen = new Set();
    const centreId = world.region[
      Math.min(world.height - 1, Math.max(0, Math.round((y0 + y1) / 2))) * world.width
      + Math.min(world.width - 1, Math.max(0, Math.round((x0 + x1) / 2)))
    ];
    if (centreId != null && world.regions[centreId]) { ids.push(centreId); seen.add(centreId); }

    for (let y = y0; y < y1 && ids.length < DETAIL_REGION_CAP; y += stride) {
      for (let x = x0; x < x1 && ids.length < DETAIL_REGION_CAP; x += stride) {
        const id = world.region[y * world.width + x];
        if (id == null || seen.has(id) || !world.regions[id]) continue;
        seen.add(id);
        ids.push(id);
      }
    }

    const out = [];
    for (const id of ids) {
      if (!detailCache.has(id)) {
        try {
          detailCache.set(id, generateRegionDetail(world, id, { factor: 6, maxCells: 260000 }));
        } catch {
          detailCache.set(id, null);
        }
      }
      const d = detailCache.get(id);
      if (d) out.push({ ...d, regionId: id });
    }
    return out;
  }

  /**
   * Draw a region's detail where that region actually sits on the world map, so panning and zooming
   * stay continuous — the detail lands exactly over the cells it was generated from.
   */
  function drawDetail(ctx, details, scale, ox, oy) {
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the plain world underneath, so anything without detail yet is still there rather than a hole
    renderWorld(ctx, drawnWorld(), { layers: { ...state.layers, nodes: false }, layer: state.layer, scale, offsetX: ox, offsetY: oy });
    ctx.imageSmoothingEnabled = false;
    // `origin` is the top-left WORLD cell each detail was generated from and `worldCells` how many
    // of them it covers, so each one lands exactly over the ground it came from and they tile
    for (const detail of details) {
      ctx.drawImage(
        rasterFor(detail),
        ox + detail.origin.x * scale, oy + detail.origin.y * scale,
        detail.worldCells.w * scale, detail.worldCells.h * scale,
      );
    }
    ctx.imageSmoothingEnabled = true;
    drawWays(ctx, details, scale, ox, oy);
  }

  /**
   * R17 — THE ROADS AND RIVERS SURVIVE THE ZOOM.
   *
   *   "Can we find a way to incorporate roads and rivers on the higher detailed maps? Currently they
   *    shown when zoomed out all the way but disappear when you zoom in. Ideally they should exist
   *    at all zoom levels, including the map."
   *
   * They were never removed — they were BURIED. `renderWorld()` draws the world image and then
   * strokes the rivers and the roads on top of it as vectors; `drawDetail()` calls it for the ground
   * underneath and then paints the region-detail raster over the lot, which is opaque. So the
   * moment the zoom crossed `DETAIL_FROM` every river and every road on screen was covered by a
   * sharper picture of the same ground with no water and no roads in it. Past that zoom the map
   * became genuinely harder to navigate than the blurry one it replaced.
   *
   * So the ways are re-drawn ON TOP of the rasters, from two sources at once:
   *
   *   * the WORLD's own rivers, sea lanes and roads, which carry on past the edge of a region and
   *     are what a route is actually planned along — so a highway does not stop dead at a border;
   *   * the DETAIL's own `streams` and `paths`, which are the same drainage model run six times
   *     finer, so zooming in adds tributaries rather than fattening the same blue line. That is the
   *     whole point of the detail pass and it had never been drawn.
   *
   * Colours and widths are World Forge's own (`worldgen/js/render.js`), deliberately, so the ways
   * do not change appearance at the zoom where the source changes.
   */
  function drawWays(ctx, details, scale, ox, oy) {
    const wantRivers = state.layers.rivers !== false;
    const wantRoads = state.layers.roads !== false;
    if (!wantRivers && !wantRoads) return;

    /** Stroke a run of cell indices from any grid, given how to turn one into a world position. */
    const run = (cells, toWorld) => {
      ctx.beginPath();
      for (let i = 0; i < cells.length; i++) {
        const p = toWorld(cells[i]);
        const x = ox + p.x * scale, y = oy + p.y * scale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    const worldCell = c => ({ x: (c % world.width) + 0.5, y: ((c / world.width) | 0) + 0.5 });
    /** A detail cell sits `factor` to a world cell, offset by the region's top-left corner. */
    const detailCell = d => {
      const f = d.factor || 1;
      return c => ({
        x: d.origin.x + ((c % d.width) + 0.5) / f,
        y: d.origin.y + (((c / d.width) | 0) + 0.5) / f,
      });
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (wantRivers) {
      // the world's rivers first — they are the big ones, and they leave the region
      for (const r of world.rivers || []) {
        ctx.strokeStyle = '#3f8fc4';
        ctx.lineWidth = Math.max(1.1, scale * (0.3 + r.width * 0.2));
        run(r.cells, worldCell);
      }
      // …then the region's own streams, which is the detail you zoomed in for
      for (const d of details) {
        const at = detailCell(d);
        for (const s of d.streams || []) {
          ctx.strokeStyle = s.major ? '#3f8fc4' : 'rgba(80,150,200,0.7)';
          ctx.lineWidth = Math.max(0.8, (scale / (d.factor || 1)) * (s.major ? 0.5 : 0.26));
          run(s.cells, at);
        }
      }
    }

    if (wantRoads) {
      ctx.setLineDash([scale * 1.2, scale * 1.2]);
      ctx.strokeStyle = 'rgba(190,220,255,0.45)';
      ctx.lineWidth = Math.max(0.6, scale * 0.14);
      for (const l of world.seaLanes || []) run(l.cells, worldCell);
      ctx.setLineDash([]);

      const order = { trail: 0, road: 1, highway: 2 };
      for (const road of [...(world.roads || [])].sort((a, b) => (order[a.class] ?? 0) - (order[b.class] ?? 0))) {
        if (road.class === 'highway') { ctx.strokeStyle = 'rgba(50,36,24,0.85)'; ctx.lineWidth = Math.max(1.1, scale * 0.34); }
        else if (road.class === 'road') { ctx.strokeStyle = 'rgba(62,48,34,0.7)'; ctx.lineWidth = Math.max(0.8, scale * 0.22); }
        else { ctx.strokeStyle = 'rgba(70,60,48,0.5)'; ctx.lineWidth = Math.max(0.6, scale * 0.14); ctx.setLineDash([scale * 0.7, scale * 0.7]); }
        run(road.cells, worldCell);
        ctx.setLineDash([]);
      }

      // the region's own tracks between the places inside it, in the detail view's own palette
      for (const d of details) {
        const at = detailCell(d);
        const step = scale / (d.factor || 1);
        for (const p of d.paths || []) {
          ctx.strokeStyle = p.class === 'highway' ? 'rgba(226,205,160,0.95)'
            : p.class === 'road' ? 'rgba(206,186,146,0.85)' : 'rgba(196,180,150,0.6)';
          ctx.lineWidth = Math.max(1.0, step * (p.class === 'highway' ? 0.8 : 0.55));
          if (p.class === 'trail') ctx.setLineDash([step * 1.4, step * 1.2]);
          run(p.cells, at);
          ctx.setLineDash([]);
        }
      }
    }

    ctx.restore();
  }

  /**
   * THE RASTER IS CACHED, NOT JUST THE DETAIL.
   *
   * "It still gets exponentially laggy when I zoom in on the world map while on a planet."
   *
   * The region detail itself was already cached — but every single draw then re-ran `worldPixels()`
   * over it, built a fresh ImageData and pushed it into a canvas. That is a quarter of a million
   * cells shaded from scratch per frame, and the map redraws on every wheel notch, every drag step
   * and five times a second while you are flying. Zooming looked exponential because each notch
   * enlarges the detail AND the redraws come faster as you keep turning the wheel.
   *
   * Nothing about that image depends on the zoom or the pan — only on WHICH region it is and which
   * layer is showing — so it is shaded once per (region, layer, hillshade) and after that a zoom is
   * one `drawImage` of an existing canvas.
   */
  /**
   * How many regions may be sharpened at once.
   *
   * Each one is a 260,000-cell generate and a few megabytes of shaded raster, both cached, so the
   * cost is paid once — but a first look at a busy view should not stall for a dozen of them.
   */
  const DETAIL_REGION_CAP = 9;

  const rasterCache = new Map();
  function rasterFor(detail) {
    const key = `${detail.regionId}|${state.layer || 'biomes'}|${state.layers?.hillshade !== false}`;
    const hit = rasterCache.get(key);
    if (hit) return hit;

    const px = worldPixels(detail, {
      layer: state.layer || 'biomes',
      hillshade: state.layers?.hillshade !== false,
      shade: 3,
    });
    const buffer = document.createElement('canvas');
    buffer.width = detail.width;
    buffer.height = detail.height;
    const img = new ImageData(new Uint8ClampedArray(px.data), detail.width, detail.height);
    buffer.getContext('2d').putImageData(img, 0, 0);

    // a handful of regions is all anyone looks at in one sitting, and each one is a few megabytes
    if (rasterCache.size > DETAIL_REGION_CAP * 2) rasterCache.delete(rasterCache.keys().next().value);
    rasterCache.set(key, buffer);
    return buffer;
  }

  /** Where each pad landed on screen this draw, so a click can find it again. */
  const waypointHits = [];

  /**
   * THE WAYPOINT PADS.
   *
   * One design everywhere — "a round concrete surface with some arcane sigildry that lights up when
   * activated" — so they are drawn identically wherever they are, lit or not. An unlit pad is still
   * drawn, because Diablo 2's rule is that the network is always THERE and it is your knowledge of
   * it that grows; greying it out tells a player where to go next, which a missing icon cannot.
   */
  /**
   * 4.11: EVERY PLACE ON THE MAP, DRAWN FROM THE ONE TABLE.
   *
   * World Forge's own `nodes` layer is switched off for this screen (see `draw`) and this replaces
   * it, for two reasons beyond the key: its settlement ladder was three shades of cream, and at the
   * zooms where the region detail is drawn its icons were painted over by the detail raster — so
   * zooming in far enough used to make every town on the map disappear.
   *
   * What is shown thins out as you zoom out, the way World Forge's own did, because at zoom 1 a
   * world has a few hundred of these on it. The biggest places survive to the bottom.
   */
  function drawPlaces(ctx, scale, ox, oy) {
    if (!state.layers.nodes) return;
    const cleared = new Set((gates?.nodes || []).filter(g => g.cleared).map(g => g.id));
    const order = new Map(MARK_ORDER.map((key, i) => [key, i]));
    const marks = [];

    /**
     * R14 — THE THINNING WAS DEAD CODE, AND IT WAS DEAD FOR AN INTERESTING REASON.
     *
     * These tests used to read `scale`, which is BUFFER pixels per map cell: `fit * zoom`, where
     * `fit` divides `canvas.width` — the backing buffer, up to twice the CSS width on a retina
     * display — by the world's 256 cells. On an ordinary 1600 px canvas at dpr 2 that is 12.5 at
     * zoom 1, four times the highest threshold here. So nothing was ever thinned: every hamlet,
     * cave, pass, port and stronghold on the whole planet was drawn at the whole-world zoom, which
     * is several hundred marks piled on top of each other — and the thresholds silently moved with
     * the display's pixel ratio, so the map drew differently on two machines.
     *
     * `state.zoom` is a number this file owns, off a fixed ladder (1, 1.6, 2.6, 4.2, …), and means
     * the same thing everywhere. Zoomed all the way out you get the places you would plan a route
     * around; zoom in and the rest arrive.
     */
    const z = state.zoom;

    // World Forge's places: settlements, ports, passes, dungeons, caves
    for (const node of world.nodes || []) {
      const key = markFor(node);
      if (!key) continue;
      // at a whole-world zoom only the places you would plan a route around are drawn
      if (z < 1.6 && !(node.type === 'settlement' ? (node.size || 0) >= 3 : node.type === 'dungeon')) continue;
      if (z < 1.3 && node.type === 'settlement' && (node.size || 0) < 4) continue;
      // …and a landmark is scenery: it arrives once you are close enough to walk to it
      if (z < 2.6 && node.type === 'landmark') continue;
      marks.push({
        key: node.type === 'dungeon' && cleared.has(node.id) ? 'cleared' : key,
        x: ox + (node.x + 0.5) * scale, y: oy + (node.y + 0.5) * scale,
        // R14: what the hover card reads
        id: 'node:' + node.id, name: node.name || '', type: node.type, kind: node.kind,
        cell: { x: node.x, y: node.y },
      });
    }

    // farhold's own: strongholds and landmarks, which stand on the ground in metres, not cells
    for (const site of sites?.sites || []) {
      const key = markFor(site);
      if (!key) continue;
      if (z < 2.6 && site.family !== 'stronghold' && site.family !== 'worldboss') continue;
      marks.push({
        key: site.cleared ? 'cleared' : key,
        x: ox + (site.x / M_PER_CELL + 0.5) * scale, y: oy + (site.z / M_PER_CELL + 0.5) * scale,
        id: 'site:' + site.key, name: site.name || '', type: site.family, kind: site.type,
        blurb: site.blurb || site.spec?.blurb || '', cleared: !!site.cleared,
        cell: { x: Math.floor(site.x / M_PER_CELL), y: Math.floor(site.z / M_PER_CELL) },
      });
    }

    /**
     * R14 — WHAT IS UNDER THE POINTER.
     *
     *   "It would also be great if the map had hover tooltips to show what icons mean and some
     *    other meta info about the region and what the icon is for."
     *
     * The map is a canvas, so there is nothing to hang a `title` on — a hover has to be hit-tested.
     * The marks are already being positioned here, in screen pixels, so the hit list is free: it is
     * the same loop, one push longer. Rebuilt on every draw, which is also every pan and zoom, so it
     * can never describe a mark that has moved.
     */
    // smallest first, so a capital is never hidden under the hamlet beside it
    marks.sort((a, b) => (order.get(b.key) ?? 0) - (order.get(a.key) ?? 0));
    const k = Math.min(1.5, Math.max(0.7, scale / 4));
    for (const m of marks) {
      if (m.x < -20 || m.y < -20 || m.x > canvas.width + 20 || m.y > canvas.height + 20) continue;
      drawMark(ctx, m.key, m.x, m.y, k);
      /**
       * R17 — the hit radius, in real pixels rather than buffer pixels.
       *
       * It used to be `Math.max(9, r * k + 4)`, and every number in that line is a BUFFER pixel:
       * `scale` divides `canvas.width`, which is up to twice the CSS width on a retina display. So
       * the nine-pixel floor that was meant to make a 3 px pip clickable was four and a half real
       * pixels, and the target silently changed size depending on the machine. Both constants are
       * scaled by the buffer ratio now, so a mark is the same size target everywhere.
       *
       * The circle also follows the mark's own drawn size — including the 1.55x ring a capital and
       * a world boss wear — so the whole of what you can see is what you can point at.
       */
      pushHit('place', m.x, m.y, markHitRadius(MAP_MARKS[m.key], k, bufferDpr), { mark: m, key: m.id });
    }
  }

  /**
   * R15 — YOUR OUTPOSTS, AND THE CARTS BETWEEN THEM.
   *
   *   "I would like the map to show outposts on it and allow creating connections between then to
   *    transport items… Trade routes should be visualized on the map using a filter."
   *
   * Both are behind `state.layers.supply`, which is a chip in the Layers panel like every other
   * layer — that is the filter. The routes are drawn UNDER the outposts so a line never crosses the
   * mark it belongs to, and they are dashed and animated along their length so a glance tells you
   * which way the goods are going, which is the one thing a plain line cannot say.
   */
  function drawSupply(ctx, scale, ox, oy) {
    if (state.layers.supply === false || !outposts) return;
    const posts = outposts() || [];
    if (!posts.length) return;
    const at = p => [ox + (p.x / M_PER_CELL + 0.5) * scale, oy + (p.z / M_PER_CELL + 0.5) * scale];
    const byPool = new Map(posts.filter(p => p.poolId).map(p => [p.poolId, p]));

    // ---- the routes, first, so the marks sit on top of them
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    ctx.save();
    ctx.lineWidth = Math.max(1.6, scale * 0.16);
    ctx.strokeStyle = '#8fd3ff';
    ctx.setLineDash([7, 6]);
    // the dashes crawl from source to destination: direction, without an arrowhead to place
    ctx.lineDashOffset = -(now / 55) % 13;
    for (const l of supplyLinks?.() || []) {
      const a = byPool.get(l.from), b = byPool.get(l.to);
      if (!a || !b) continue;
      const [ax, ay] = at(a), [bx, by] = at(b);
      ctx.globalAlpha = l.quote?.ok === false ? 0.3 : 0.85;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.restore();

    /**
     * ---- and the outposts themselves.
     *
     * R17 — ONCE, NOT TWICE. Item 20 gives every outpost a marker of its own (`syncOutpostMarkers`
     * in `draw()`), drawn in the same role colour with the same role glyph and carrying the name you
     * gave it. Leaving this loop switched on as well would put a second disc and a second copy of
     * the name on exactly the same pixel — which is the complaint item 11 made about ore seams,
     * made again. So where there is a marker book, the supply layer draws only the CARTS, which is
     * the half of it a marker cannot show.
     */
    if (book) return;
    for (const p of posts) {
      const [px, py] = at(p);
      if (px < -20 || py < -20 || px > canvas.width + 20 || py > canvas.height + 20) continue;
      const r = Math.max(5, Math.min(11, 4 + scale * 0.5));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = ROLE_COLOUR[p.role] || '#c8b48a';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1a1208';
      ctx.stroke();
      if (scale >= 5) {
        ctx.font = `700 ${Math.round(Math.min(13, Math.max(9, r * 1.3)))}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a1208';
        ctx.fillText(ROLE_GLYPH[p.role] || '\u25a3', px, py + 0.5);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      // a name, once there is room for one
      if (p.name && scale >= 4) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#eaf6ff';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        ctx.strokeText(p.name, px + r + 4, py + 4);
        ctx.fillText(p.name, px + r + 4, py + 4);
      }
    }
  }

  /**
   * R14 — WHAT THE LAST SWEEP TURNED UP, ON THE MAP.
   *
   *   "The scanner tool should let you select a material and scan for it, displaying it with a
   *    marker in the world for some time and displaying it on the world map as well."
   *
   * The world half is js/beacon.js, a column of light over each hit. This is the map half: a small
   * diamond in the material's own colour at every hit, for as long as the sweep is lit. They are
   * deliberately NOT markers — a sweep can turn up fifty seams and fifty entries in the marker book
   * would bury the pins you placed by hand. Keep one and it becomes a saved place, which is a
   * decision rather than a side effect.
   */
  function drawScan(ctx, scale, ox, oy) {
    const st = scanState?.();
    if (!st?.hits?.length) return;
    for (const h of st.hits) {
      const px = ox + (h.x / M_PER_CELL + 0.5) * scale;
      const py = oy + (h.z / M_PER_CELL + 0.5) * scale;
      if (px < -10 || py < -10 || px > canvas.width + 10 || py > canvas.height + 10) continue;
      const r = Math.max(3, Math.min(7, scale * 0.6));
      ctx.beginPath();
      ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py);
      ctx.closePath();
      ctx.fillStyle = h.colour || '#c08a3e';
      ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#1a1208';
      ctx.stroke();
    }
  }

  /**
   * R14 — both ends of the town portal, from `portals.mapMarkers()`.
   *
   * Drawn after the waypoints and before the markers, so a portal standing on a pad is visible over
   * it rather than under it. Only the ends on THIS world are drawn; the book files them per world
   * for the same reason the marker book does.
   */
  function drawPortals(ctx, scale, ox, oy) {
    const ends = portals?.mapMarkers?.() || [];
    for (const end of ends) {
      if (end.world && book && worldKey(end.world) !== book.key) continue;
      const px = ox + (end.x / M_PER_CELL + 0.5) * scale;
      const py = oy + (end.z / M_PER_CELL + 0.5) * scale;
      if (px < -20 || py < -20 || px > canvas.width + 20 || py > canvas.height + 20) continue;
      drawMark(ctx, 'portal', px, py, Math.min(1.5, Math.max(0.8, scale / 5)));
    }
  }

  function drawWaypoints(ctx, scale, ox, oy) {
    if (!waypoints) return;
    const pads = waypoints.list();
    if (!pads.length) return;
    waypointHits.length = 0;

    for (const pad of pads) {
      // R17 — item 19: a pad you switched off is not drawn. Absent reads as ON, as everywhere else.
      if (pad.showOnMap === false) continue;
      const px = ox + (pad.x / M_PER_CELL) * scale;
      const py = oy + (pad.z / M_PER_CELL) * scale;
      if (px < -20 || py < -20 || px > canvas.width + 20 || py > canvas.height + 20) continue;
      const r = Math.max(5, Math.min(11, 4 + scale * 0.5));

      /**
       * R14 — A LIT WAYPOINT IS LIT.
       *
       *   "The town portal icons could also be improved as the current one is too dark."
       *
       * A lit pad filled `rgba(20, 44, 58, .95)` — near-black with a blue cast — inside a thin
       * blue ring. On grassland (#6f9f52) or a beach (#d3c592) that is the darkest thing on the
       * screen, so the one place you can travel to read as a hole in the ground. The lit one is a
       * bright disc now with a soft halo around it, and the unlit one stays dark: the difference
       * between them is brightness, which is what "lit" means, rather than the colour of an
       * outline nobody can see at eight pixels.
       */
      if (pad.lit) {
        const halo = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 2.1);
        halo.addColorStop(0, 'rgba(127, 232, 255, .55)');
        halo.addColorStop(1, 'rgba(127, 232, 255, 0)');
        ctx.beginPath();
        ctx.arc(px, py, r * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pad.lit ? '#9fe9ff' : 'rgba(30, 36, 46, .92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pad.lit ? '#0c3040' : 'rgba(120, 132, 148, .65)';
      ctx.stroke();

      // the sigildry — three marks on the ring, dark on a lit pad so they read as an inlay
      ctx.strokeStyle = pad.lit ? 'rgba(12, 48, 64, .85)' : 'rgba(120, 132, 148, .45)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * r * 0.32, py + Math.sin(a) * r * 0.32);
        ctx.lineTo(px + Math.cos(a) * r * 0.78, py + Math.sin(a) * r * 0.78);
        ctx.stroke();
      }
      // the picked pad wears a ring outside the disc, so it reads as chosen at every zoom
      if (state.padPick === pad.id) {
        ctx.beginPath();
        ctx.arc(px, py, r + 4.5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffd98a';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // R17: the pad's star, drawn ON the disc's rim rather than beside it — same rule as a marker
      if (pad.starred) {
        ctx.beginPath();
        ctx.arc(px, py, r + Math.max(2, r * 0.45), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.4, r * 0.3);
        ctx.strokeStyle = '#ffd24a';
        ctx.stroke();
      }

      waypointHits.push({ px, py, r: r + 5, pad });
      // R17: …and onto the one hit list, so a pad and a landmark on the same ground are resolved by
      // which of them you are actually pointing at rather than by which list was consulted first.
      pushHit('pad', px, py, r + 5 * bufferDpr, { pad, key: 'pad:' + pad.id });
    }
  }

  /** Where the player is, in map cells. */
  function playerCell() {
    const p = whereIsPlayer();
    return { x: p.x / M_PER_CELL, y: p.z / M_PER_CELL };
  }

/**
 * The zoom ladder.
 *
 * "Ideally the map should work more like Google Maps and when zoomed out I should see all of it…
 * Can the map get more detailed, eventually fading into the interim and then fully zoomed in levels
 * like seen in the Star Forge experiment?"
 *
 * `1` is the whole planet, edge to edge, which is the thing that was missing — the old ladder
 * bottomed out at a zoom that still cropped the poles on a tall map. Above that the steps get
 * bigger, and past `DETAIL_FROM` the renderer stops upscaling the world image and starts drawing
 * the **region detail** instead, which is genuinely more map rather than a bigger blur.
 */
  const ZOOMS = [1, 1.6, 2.6, 4.2, 6.8, 11, 18];

  /** Past this zoom, draw the interim detail rather than a magnified world image. */
  const DETAIL_FROM = 4.2;

  function cellFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
    const { scale, offsetX, offsetY } = viewBox();
    const x = Math.floor((px - offsetX) / scale), y = Math.floor((py - offsetY) / scale);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
    return { x, y };
  }

  canvas.addEventListener('mousemove', ev => {
    const cell = cellFromEvent(ev);
    if (!cell) { readout.textContent = ''; return; }
    const info = cellInfo(world, cell.x, cell.y);
    if (!info) return;
    const odds = weatherOdds(weatherAt(world, cell.x, cell.y))[0];
    // the level band under the cursor, so hovering anywhere on the map answers "can I go there yet"
    const zone = zones && world.region ? zones.byId(world.region[cell.y * world.width + cell.x]) : null;
    readout.textContent = `${cell.x},${cell.y} · ${info.biomeName} · ${info.water === 'land' ? info.elevationMetres + ' m' : 'water'} · ${info.temperatureC}°C`
      // B8: the cursor does not get to read out a name the map is holding back either
      + (info.region ? ` · ${knows(info.region.id) ? info.region.name : 'somewhere you have not been'}` : '')
      + (zone && zone.id >= 0 ? ` · level ${zone.minLevel}\u2013${zone.maxLevel} (${zone.danger})` : '')
      + (odds ? ` · usually ${odds.name.toLowerCase()}` : '');
    /**
     * R17 — THE LINE THAT MOVED THE WHOLE MAP.
     *
     *   "When you hover over the full screen planetary map a bar appears with your hover tooltip.
     *    Can that bars space be reserved so that the map doesn't shift position and size when you
     *    hover? Also when I open the map the first time I click on the map canvas element the sides
     *    shrink in."
     *
     * This read `readout.className = 'readout' + tone`, which REPLACES the class list rather than
     * adding to it — so the first time the pointer crossed the canvas, the strip under it lost
     * `map-readout` (12px monospace, `min-height: 18px`) and `small`. `.readout` is not a class
     * style.css has ever defined, so the strip fell back to the body font and its reserved height
     * went with it.
     *
     * That is the whole bug, both halves of it. The strip lives in the same column flex as the
     * canvas, the canvas is `flex: 1` in that column, and `viewBox()` fits the whole planet into
     * whatever height the canvas ends up with — so a strip that grew by a few pixels took them out
     * of the map and the map redrew SMALLER, its left and right edges moving inward. "The sides
     * shrink in", exactly, and it happened on the first pointer move rather than on the click.
     *
     * Two fixes, because one of them alone would leave the trap set for the next person: the class
     * list is added to rather than overwritten here, and `map17.css` makes the wrap a grid whose
     * bottom two rows are a fixed height, so nothing written into them can ever resize the map again.
     */
    readout.className = 'map-readout muted small readout'
      + (zone && zone.id >= 0 ? ' zone-' + zoneTone(zone.midLevel, getLevel()) : '');

    /**
     * R14 — and what the hover card should describe.
     *
     * A place first, then a waypoint pad, then a marker, then the ground: most specific wins. `key`
     * is a stable identity, and when it changes while a card is already open the shared engine's
     * `refreshTip()` re-renders in place without moving the box — which is the whole reason that
     * function exists and is already how the item cards work.
     */
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, rect.width);
    const mx = (ev.clientX - rect.left) * dpr, my = (ev.clientY - rect.top) * dpr;

    // R17: one list, nearest centre wins, ground only when nothing is under the pointer at all
    const hit = hitAt(mx, my);
    const hover = hit
      ? { tier: hit.tier, key: hit.key, mark: hit.mark, pad: hit.pad, marker: hit.marker }
      : { tier: 'cell', key: `c:${cell.x},${cell.y}`, cell };

    if (state.hover?.key !== hover.key) {
      state.hover = hover;
      if (tipOpen()) refreshTip();
    }
  });

  /**
   * DRAG TO PAN, like every map anyone has used.
   *
   * "Ideally the map should work more like Google Maps… I could not zoom out all the way to see the
   * entire planet, nor could I pan the camera around." A left-drag moves the view; a drag that
   * barely moved is still treated as a click, so shift-clicking a pin and dragging the map are not
   * in each other's way.
   */
  let dragFrom = null;
  canvas.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    dragFrom = { x: ev.clientX, y: ev.clientY, centre: { ...(state.centre || playerCell()) }, moved: 0 };
    canvas.setPointerCapture?.(ev.pointerId);
  });
  canvas.addEventListener('pointermove', ev => {
    if (!dragFrom) return;
    const { scale } = viewBox();
    const dx = ev.clientX - dragFrom.x, dy = ev.clientY - dragFrom.y;
    dragFrom.moved = Math.max(dragFrom.moved, Math.hypot(dx, dy));
    if (dragFrom.moved < 4) return;
    state.justDragged = true;
    const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    state.centre = {
      x: dragFrom.centre.x - (dx * dpr) / scale,
      y: dragFrom.centre.y - (dy * dpr) / scale,
    };
    state.dragged = true;
    canvas.style.cursor = 'grabbing';
    draw();
  });
  const endDrag = ev => {
    if (!dragFrom) return;
    canvas.releasePointerCapture?.(ev?.pointerId);
    canvas.style.cursor = 'crosshair';
    dragFrom = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /** Put the view back on the player — the button, and what Escape-less closing does. */
  function recentre() {
    state.centre = null;
    state.dragged = false;
    draw();
  }

  // the wheel zooms, in steps, around the pointer
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    const at = cellFromEvent(ev) || playerCell();
    const i = ZOOMS.indexOf(state.zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 0 : i) + (ev.deltaY < 0 ? 1 : -1)))];
    if (next === state.zoom) return;
    // keep the cell under the pointer under the pointer
    state.centre = state.zoom === 1 ? { ...at } : { ...(state.centre || playerCell()) };
    if (next > state.zoom) state.centre = { x: at.x, y: at.y };
    state.zoom = next;
    if (state.zoom === 1) state.centre = null;
    draw();
  }, { passive: false });

  /**
   * R14: the shared tooltip engine hides on `pointerdown`, and `pointerover` does not fire again
   * while the pointer is still inside the same element — so after one click the map's hover card
   * would not come back until you moved off the canvas entirely. Re-arming it here is one line and
   * keeps `shared/tooltip.js` untouched, which matters because Emberveil uses it too.
   */
  canvas.addEventListener('pointerup', ev => {
    canvas.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }));
  });

  canvas.addEventListener('click', ev => {
    // a click that was really the end of a drag is not a click
    if (state.justDragged) { state.justDragged = false; return; }
    const cell = cellFromEvent(ev);
    if (!cell) return;
    if (ev.shiftKey) {
      /**
       * R14 — SHIFT DROPS A PIN, CTRL-SHIFT KEEPS A PLACE.
       *
       * Two different promises. A pin is the quick one you drop while reading the map and throw
       * away in a minute; a kept place is the clay bank you want to be able to find in an hour, and
       * it carries a star that highlights it and a row in the journal. The default name is what the
       * ground actually is there, which beats "Place 4".
       */
      if (ev.ctrlKey || ev.metaKey) {
        const info = cellInfo(world, cell.x, cell.y) || {};
        // only a region you have actually been to gets named — B8's rule, the same one the readout
        // under the cursor obeys
        const region = info.region && knows(info.region.id) ? info.region.name : '';
        const name = [info.biomeName || 'Somewhere', region].filter(Boolean).join(', ');
        const m = book?.save?.({ cellX: cell.x, cellY: cell.y, name, from: { type: 'pin' } });
        if (m) { buildSide(); draw(); }
      } else addPin(cell.x, cell.y);
      return;
    }

    /**
     * A CLICK ON A PAD IS A TRAVEL, and it is tested before anything else.
     *
     * "Allow clicking on waypoints on the map to fast travel between them." The pads are small, so
     * the hit radius is a little wider than the drawn disc; an unlit one still answers, because
     * being told "you have not been to Hollowcrown yet" is the point of drawing it at all.
     */
    const rect = canvas.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const my = (ev.clientY - rect.top) * (canvas.height / rect.height);
    // R17: the same hit list the hover uses, narrowed to pads — so what you click and what the
    // tooltip just told you was there can never be two different things
    const closest = hitAt(mx, my, 'pad');
    if (closest) {
      /**
       * CLICKING A PAD PICKS IT. IT DOES NOT TRAVEL.
       *
       * "let you click on them, indicate as selected, and click a button to teleport to it." It
       * used to travel on the click itself, which meant a misplaced click on a world map could cost
       * you a day on the road with no way to say no. Now the pad is marked on the canvas, the side
       * panel says where it is and whether the sigils are lit, and the button is the commitment.
       */
      state.padPick = closest.pad.id;
      state.selected = null;
      buildSide();
      draw();
      return;
    }

    /**
     * R17 — WHAT YOU CLICKED, AS A THING YOU CAN DO SOMETHING WITH.
     *
     *   "On the map from the Places menu add a 'Selected' group that shows where you click on, and
     *    from there add an 'Add to Favorites' button that stores it under 'Places you keep'."
     *
     * A click already produced `state.selected` — the CELL, with its biome and height and a debug
     * teleport button — and nothing else. So clicking a village told you "Grassland, 210 m" and
     * gave you no way to keep it. What was clicked is worked out from the same hit list the hover
     * uses, so the Selected panel names the village rather than the field it stands in, and the
     * marker under the pointer (if any) is carried along so the button can un-star as well as star.
     */
    const on = hitAt(mx, my);
    const info = cellInfo(world, cell.x, cell.y);
    state.selected = info ? { ...info, x: cell.x, y: cell.y } : { x: cell.x, y: cell.y, biomeName: 'somewhere', heightMetres: 0 };
    state.selected.hit = on || null;
    state.selected.name = on?.marker?.name || on?.mark?.name || on?.pad?.name || '';
    state.padPick = null;
    buildSide();
    draw();
  });

  // ---------------------------------------------------------------- pins
  function addPin(x, y, name = null) {
    if (!book) return null;
    const pin = book.drop(x, y, name);
    buildSide();
    draw();
    return pin;
  }
  function removePin(pin) {
    if (book) book.remove(pin);
    buildSide();
    draw();
  }

  /**
   * B9: while flying, main.js's tick never reaches `map.tick()` — it returns out of `stepFlight`
   * long before it — so an open map would freeze at the frame you opened it. Five redraws a second
   * while the map is up and the ship is moving; nothing at all on foot, where `tick()` already runs.
   */
  let airTimer = null;
  function toggle(open = !state.open) {
    state.open = open;
    root.classList.toggle('hidden', !open);
    if (airTimer) { clearInterval(airTimer); airTimer = null; }
    if (open) {
      document.exitPointerLock?.();
      // B8: catch up on anything you were told since you last looked, then draw
      noteWhereYouAre();
      heardOf();
      buildSide();
      draw();
      airTimer = setInterval(() => { if (state.open && airborne()) { noteWhereYouAre(); draw(); } }, 200);
    }
    return open;
  }

  /**
   * B9: IN THE AIR, M IS THE PLANET MAP — NOT THE STAR CHART.
   *
   * "Once you are in the atmosphere it should switch to the planet minimap and the full planet map."
   * The key itself is routed by js/main.js, which sends M here for `ground` and `air` and to the
   * star chart only once there is no ground under you. What lives here is the other half: while you
   * are flying, the map redraws five times a second (`airTimer` above) and the player arrow and the
   * region-learning both read the flight controller rather than the parked walking one.
   */

  window.addEventListener('resize', () => { if (state.open) draw(); });

  /**
   * R14 — WHAT IS THAT?
   *
   *   "It would also be great if the map had hover tooltips to show what icons mean and some other
   *    meta info about the region and what the icon is for."
   *
   * The readout under the canvas stays — it is the always-visible fact line, and the house rule is
   * that a fact must never hide inside a tooltip. This is the detail on top of it: what the mark you
   * are pointing at IS, which is the half the readout cannot give you, because the readout is about
   * the ground and a mark is about a thing standing on it.
   *
   * A place first, then a marker, then the cell itself, because that is the order of specificity.
   */
  function hoverCard() {
    const h = state.hover;
    if (!h) return null;
    const card = el('div', { class: 'tip-map' });

    /**
     * R17 — THE ICON, BESIDE THE NAME.
     *
     *   "can we show the icon itself in the tooltip to the left of the name so it's clear that icon
     *    is corresponding to what is on the map? This will help with understanding that a village is
     *    a white square."
     *
     * `markSwatch()` calls `drawMark()`, which is the function that put the thing on the map in the
     * first place, so the swatch is the same shape in the same colours by construction — there is
     * no second drawing of a village to keep in step.
     */
    const head = (swatch, name) => el('div', { class: 'tip-map-head' }, swatch, el('b', { text: name }));

    if (h.tier === 'place') {
      const m = h.mark;
      const mark = MAP_MARKS[m.key] || {};
      card.append(head(markSwatch(m.key, 20), m.name || mark.label || 'somewhere'));
      card.append(el('div', { class: 'tip-what', text: mark.label || m.type || '' }));
      if (m.cleared) card.append(el('div', { class: 'tip-note', text: 'You have already cleared this.' }));
      else if (m.blurb) card.append(el('div', { class: 'tip-note', text: m.blurb }));
      const zone = zoneAtCell(m.cell);
      if (zone) card.append(el('div', { class: 'tip-note', text: zoneWords(zone) }));
      return card;
    }

    if (h.tier === 'marker') {
      const look = MARKER_LOOKS[h.marker.kind] || MARKER_LOOKS.pin;
      card.append(head(markerSwatch(h.marker, 20), h.marker.name));
      card.append(el('div', { class: 'tip-what', text: look.label + (h.marker.starred ? ' · favorite' : '') }));
      if (h.marker.note) card.append(el('div', { class: 'tip-note', text: h.marker.note }));
      card.append(el('div', { class: 'tip-note', text: h.marker.tracked
        ? 'The minimap is pointing at this.' : 'Not tracked — the minimap is ignoring it.' }));
      // R17: the outpost marker says why it has no × on it, rather than leaving that a mystery
      if (h.marker.locked) {
        card.append(el('div', { class: 'tip-note', text: 'This one stands as long as the buildings do.' }));
      }
      return card;
    }

    if (h.tier === 'pad') {
      card.append(head(markSwatch(h.pad.lit ? 'waypoint' : 'waypointOff', 20), h.pad.name));
      card.append(el('div', { class: 'tip-what', text: h.pad.lit ? 'Waypoint — lit' : 'Waypoint — not lit yet' }));
      card.append(el('div', { class: 'tip-note', text: h.pad.lit
        ? 'You can travel here from any other lit waypoint.'
        : 'Walk into this settlement once and the sigils light.' }));
      return card;
    }

    // the ground itself
    const info = cellInfo(world, h.cell.x, h.cell.y);
    if (!info) return null;
    card.append(el('b', { text: info.region && knows(info.region.id) ? info.region.name : info.biomeName }));
    card.append(el('div', { class: 'tip-what', text:
      `${info.biomeName} \u00b7 ${info.water === 'land' ? info.elevationMetres + ' m' : 'water'} \u00b7 ${info.temperatureC}\u00b0C` }));
    const zone = zoneAtCell(h.cell);
    if (zone) card.append(el('div', { class: 'tip-note', text: zoneWords(zone) }));
    else if (info.region && !knows(info.region.id)) {
      card.append(el('div', { class: 'tip-note', text: 'You have not been here, and nobody has told you about it.' }));
    }
    return card;
  }

  /** The zone standing on a cell, or null over open water. */
  function zoneAtCell(cell) {
    if (!zones || !world.region || !cell) return null;
    const id = world.region[cell.y * world.width + cell.x];
    const zone = id >= 0 ? zones.byId(id) : null;
    return zone && zone.id >= 0 ? zone : null;
  }

  /** "level 9–12 · Wild · dangerous for you" — the two lines the map writes, explained. */
  function zoneWords(zone) {
    return `level ${zone.minLevel}\u2013${zone.maxLevel} \u00b7 ${zone.danger} \u00b7 ${Object.fromEntries(TONE_LABELS)[zoneTone(zone.midLevel, getLevel())] || ''}`;
  }

  registerTip('mapHover', () => hoverCard());
  canvas.dataset.tipRender = 'mapHover';
  canvas.dataset.tipClass = 'tip-map-box';

  /**
   * R14 — SHOW ME THAT ONE.
   *
   *   "add a target icon to 'locate on map' which opens the map, centered on that location."
   *
   * The one door every screen uses: the journal's work-in-hand rows, the notice board, the Nearby
   * Activities panel and the map's own lists. It takes world metres OR map cells, because the quest
   * log thinks in metres and the marker book thinks in cells and neither should have to convert.
   *
   * Refuses rather than lying when the place is on another world — a journal row for a job two
   * systems away must not quietly centre the map on the wrong ground.
   */
  let focusRaf = null;
  function locate(place, opts = {}) {
    if (!place) return { ok: false, why: 'There is nowhere to go.' };
    const cell = place.cell
      ? { x: Math.round(place.cell.x), y: Math.round(place.cell.y) }
      : (Number.isFinite(place.x) && Number.isFinite(place.z))
        ? { x: Math.floor(place.x / M_PER_CELL), y: Math.floor(place.z / M_PER_CELL) }
        : null;
    if (!cell) return { ok: false, why: 'That place has no position on it.' };
    if (place.world && book && worldKey(place.world) !== book.key) {
      return { ok: false, why: 'That is on another world.' };
    }
    const w = world?.width ?? world?.size ?? 0, h = world?.height ?? world?.size ?? 0;
    if (w && h && (cell.x < 0 || cell.y < 0 || cell.x >= w || cell.y >= h)) {
      return { ok: false, why: 'That is not on this world.' };
    }

    if (opts.open !== false && !state.open) toggle(true);
    const want = opts.zoom ?? 4.2;
    // snap to the zoom ladder rather than inventing a step nothing else can reach
    state.zoom = ZOOMS.reduce((best, z) => (Math.abs(z - want) < Math.abs(best - want) ? z : best), ZOOMS[0]);
    state.centre = { ...cell };
    state.justDragged = true;              // so "you are here" still means back to the player
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    state.focus = {
      x: cell.x, y: cell.y,
      name: place.name || '',
      kind: place.kind || 'place',
      start: now,
      until: now + (opts.hold ?? 6000),
    };
    buildSide();
    draw();

    /**
     * `tick()` runs about five times a second (main.js redraws the map every twelve frames), which
     * turns a 1.4-second pulse into a stutter. So the ring gets its own frame loop for as long as
     * it is alive, and stops the moment it is not. Cancelled in `dispose()` beside `airTimer`, or a
     * map replaced mid-pulse leaves a loop drawing a screen nobody can see.
     */
    if (focusRaf) cancelAnimationFrame(focusRaf);
    const step = () => {
      if (!state.focus || !state.open) { focusRaf = null; draw(); return; }
      draw();
      focusRaf = requestAnimationFrame(step);
    };
    focusRaf = requestAnimationFrame(step);
    return { ok: true, cell, zoom: state.zoom };
  }

  return {
    root, state, markers: book,
    locate,
    get pins() { return pins(); },
    /** Step the zoom from a button or a test. */
    setZoom(z) { state.zoom = ZOOMS.includes(z) ? z : 1; if (state.zoom === 1) state.centre = null; draw(); },
    /** Put the view back over the player. */
    recentre,
    ZOOMS, DETAIL_FROM,
    /** Turn the level overlay on or off (the checkbox, the debug menu and the tests). */
    setLevels(on) { state.levels = !!on; buildSide(); draw(); },
    get isOpen() { return state.open; },
    toggle, draw, addPin, removePin,
    /** The same action a click on a pad runs, for main.js's handle and the tests. */
    travelTo: id => !!waypoints?.travel?.(id),
    /** Pick a pad from outside the canvas — the journal's network list, and the tests. */
    /**
     * A settlement id is a NUMBER, and the first settlement on a world is 0 — so every `id || null`
     * and every `if (padPick)` in this file silently dropped the pad the player most often clicks:
     * the one nearest the middle of the map. All the checks here are against `null` on purpose.
     */
    pickPad(id) { state.padPick = id == null ? null : id; buildSide(); draw(); return state.padPick; },
    get padPick() { return state.padPick; },
    /** Where every pad is drawn right now, so a test can click one without knowing the projection. */
    get padHits() { return waypointHits.map(h => ({ x: h.px, y: h.py, r: h.r, id: h.pad.id, lit: h.pad.lit })); },
    /**
     * R17 — everything drawn this frame that can be pointed at, and the resolver itself.
     *
     * Exposed so a browser spec can ask "what is under the centre of the world boss?" without
     * reimplementing the projection — which is exactly how the reported bug survived a round: the
     * only thing that knew where a mark was drawn was the drawing code, and the only thing that
     * knew where it could be clicked was a second list beside it.
     */
    get hits() { return hits.map(h => ({ tier: h.tier, x: h.x, y: h.y, r: h.r, key: h.key })); },
    hitAt: (x, y, want = null) => {
      const h = hitAt(x, y, want);
      return h ? { tier: h.tier, key: h.key, name: h.marker?.name || h.mark?.name || h.pad?.name || '' } : null;
    },
    /**
     * R17 — WHAT THE MINIMAP SHOULD DRAW.
     *
     * One call, so js/hud.js never has to know that a favourite is a different checkbox to a track,
     * or that a waypoint pad is not a marker. See `research/round17-map-handoff.md` for the line.
     */
    minimapMarkers(player) {
      const rows = [];
      for (const m of book?.minimap?.() || []) {
        const b = book.bearing(m, player, terrain);
        if (!b) continue;                       // R22 — nothing to point at, so no arrow
        rows.push({ ...m, x: b.x, z: b.z, distance: b.distance });
      }
      for (const p of padBook()?.minimapPads?.() || []) {
        rows.push({ ...p, distance: Math.hypot(p.x - player.x, p.z - player.z) });
      }
      return rows;
    },
    /** …and what the 3D world should put a beacon over. */
    worldMarkers() {
      return [
        ...(book?.inWorld?.() || []),
        ...(padBook()?.worldPads?.() || []).map(p => ({ ...p, kind: 'waypoint' })),
      ];
    },
    /** B8: which region names you have earned, for the tests and the debug menu. */
    known: () => [...known],
    knows,
    /**
     * R18 — PUT A REGION ON THE CHART.
     *
     * `map.revealZone(id)` was CALLED at five sites in js/main.js — behind `?.`, so it failed
     * silently — and did not exist. `data/job-frames.json` pays `reveals: "zone"`,
     * `data/worldbosses.json`, `data/landmarks.json` and `data/strongholds.json` all pay
     * `revealZone: true`, and every one of them printed "Greyfen goes on your chart" while the map
     * went on saying "somewhere you have not been".
     *
     * `remember` is exactly what those call sites wanted and was simply private: it adds the id,
     * persists the set and reports whether it was new. This is that function under the name the
     * game had already agreed on.
     */
    revealZone: id => remember(id),
    /** Take the screen out of the page (used when the world under it is replaced). */
    dispose() {
      root.remove();
      // a new map is built for every world you land on, so the flight redraw has to go with the old
      // one or they stack up, each one drawing a screen nobody can see
      if (airTimer) { clearInterval(airTimer); airTimer = null; }
      // R14: and the focus pulse, for the same reason
      if (focusRaf) { cancelAnimationFrame(focusRaf); focusRaf = null; }
    },
    /**
     * Keep the player arrow moving while the map is open — and, open or not, watch which region you
     * are walking through, because that is how names get learned (B8).
     */
    tick() {
      noteWhereYouAre();
      if (state.open) draw();
    },
  };
}
