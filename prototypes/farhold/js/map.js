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
import { MARKER_LOOKS, distanceText } from './markers.js';

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
};

/** The order the key lists them in, which is also the order they are drawn on the map. */
export const MARK_ORDER = [
  'worldboss',
  'capital', 'city', 'town', 'village', 'hamlet', 'port',
  'dungeon', 'cave', 'lair', 'cleared',
  'camp', 'fort', 'castle', 'landmark', 'pass',
];

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
  if (node.family === 'landmark') return 'landmark';
  if (node.family === 'stronghold') {
    const glyph = node.pin?.glyph || 'camp';
    if (glyph === 'castle') return 'castle';
    if (glyph === 'fort' || glyph === 'tower' || glyph === 'siege') return 'fort';
    if (glyph === 'lair') return 'lair';
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
    // a landmark is a plain pip: it is scenery with a use, not somewhere to plan a route around
    case 'pip':
    default:
      ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
  }
  if (mark.shape === 'cross') ctx.stroke();
  else { ctx.fill(); ctx.stroke(); }
  if (mark.shape === 'anchor') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y); ctx.lineTo(x + r * 0.8, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
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

import { renderWorld, legend as legendRows, DEFAULT_LAYERS, worldPixels } from '../../../worldgen/js/render.js';
import { generateRegionDetail } from '../../../worldgen/js/local.js';
import { cellInfo } from '../../../worldgen/js/world.js';
import { weatherAt, weatherOdds } from '../../../worldgen/js/weather.js';
import { M_PER_CELL } from './planet.js';

export function createMapScreen({ terrain, getPlayer, getEnemies = () => [], onTeleport = null, seed = 1, markers = null, zones = null, getLevel = () => 1, sites = null, gates = null, meteors = null, showCoords = () => false, rumours = null, waypoints = null } = {}) {
  // Pins used to be a bare array owned by this screen. They are markers now (`js/markers.js`), so
  // a quest destination, a story objective and a pin the player dropped are one kind of thing and
  // the minimap and space mode can see them too.
  const book = markers;
  const pins = () => (book ? book.here() : []);
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
  };

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
  function buildKey() {
    if (keyBox.dataset.built) return;
    keyBox.dataset.built = '1';
    keyBox.append(el('h4', { class: 'map-key-title', text: 'What the marks mean' }));
    let group = null;
    let list = null;
    for (const name of MARK_ORDER) {
      const mark = MAP_MARKS[name];
      if (!mark) continue;
      if (mark.group !== group) {
        group = mark.group;
        keyBox.append(el('div', { class: 'map-key-group', text: group }));
        list = el('div', { class: 'map-key-rows' });
        keyBox.append(list);
      }
      const swatch = el('canvas', { class: 'map-key-swatch', width: 22, height: 22 });
      const ctx = swatch.getContext('2d');
      // the biggest mark is 5.4 units across, so 1.7x fits a 22px box with room for the ring
      drawMark(ctx, name, 11, 11, Math.min(1.7, 8 / mark.r));
      list.append(el('div', { class: 'map-key-row' }, swatch, el('span', { text: mark.label })));
    }
    keyBox.append(el('p', { class: 'muted small', text:
      'Settlements grow with their size, and the two biggest wear a ring. Dungeons, caves and lairs '
      + 'are three different mouths; held ground is a tent or a keep.' }));
  }

  function buildSide() {
    side.replaceChildren();
    buildKey();
    const layerPanel = layersPanel({
      layer: state.layer, layers: state.layers,
      onLayer: name => { state.layer = name; buildSide(); draw(); },
      onToggle: (key, on) => { state.layers[key] = on; draw(); },
    });
    side.append(layerPanel);
    side.append(keyBox);
    side.append(compositionBox);

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

    // B8: why half the map has no names on it. One line, under the layers, where the question gets
    // asked — not buried in a tooltip.
    if (zones && world.regions?.length) {
      const total = world.regions.length;
      side.append(el('p', { class: 'muted small', text: known.size >= total
        ? `You have walked or heard of all ${total} regions on this world.`
        : `${known.size} of ${total} regions named. The rest fill in when you cross into them or hear about them.` }));
    }

    // Markers: quests, story objectives and dropped pins, each with a star that tracks or untracks
    // it. A tracked marker is the one the minimap draws and points an arrow at; an untracked one
    // still sits on this map, it just stops following you around.
    const here = pins();
    const list = el('div', { class: 'pin-list' });
    if (!here.length) {
      list.append(el('p', { class: 'muted small', text: 'Shift-click the map to drop a pin. Quests mark themselves.' }));
    } else {
      const player = whereIsPlayer();
      for (const m of here) {
        const look = MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin;
        const away = book ? book.bearing(m, player, terrain).distance : 0;
        const star = el('button', {
          class: 'pin-track' + (m.tracked ? ' on' : ''),
          text: m.tracked ? '★' : '☆',
          title: m.tracked ? 'Tracked — showing on the minimap. Click to stop.' : 'Not tracked. Click to follow it on the minimap.',
          onclick: () => { book.toggle(m); buildSide(); draw(); },
        });
        const row = el('div', { class: 'pin-row' + (m.tracked ? ' tracked' : '') },
          star,
          el('i', { class: 'pin-dot', text: look.icon, style: `color:${m.done ? '#9ae06a' : look.color}` }),
          el('span', { class: 'pin-name', text: m.name }),
          el('span', { class: 'muted small', text: distanceText(away) }),
        );
        if (m.kind === 'pin') {
          row.append(el('button', { class: 'pin-del', text: '×', title: 'Remove this pin', onclick: () => { removePin(m); } }));
        }
        list.append(row);
      }
    }
    side.append(panel('Tracking', list));

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
      side.append(panel('Other worlds', other));
    }

    if (state.selected) {
      const s = state.selected;
      const kids = [el('p', { class: 'small', text: `${s.biomeName} · ${s.heightMetres} m` })];
      if (onTeleport) kids.push(button('Go here', () => { onTeleport(s.x * M_PER_CELL, s.y * M_PER_CELL); toggle(false); }, 'small'));
      side.append(panel(`Cell ${s.x},${s.y}`, ...kids));
    }
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
      const look = MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin;
      const px = ox + (m.cell.x + 0.5) * scale, py = oy + (m.cell.y + 0.5) * scale;
      const colour = m.done ? '#9ae06a' : look.color;
      if (m.tracked) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(9, scale * 1.5), 0, Math.PI * 2);
        ctx.strokeStyle = colour; ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, scale * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#150f0a'; ctx.stroke();
      if (m.name) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#ffe6a8';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        ctx.strokeText(m.name, px + 10, py + 4);
        ctx.fillText(m.name, px + 10, py + 4);
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
    legendBox.replaceChildren(...rows);
    const parts = legendRows(world, state.layer)
      .filter(r => r.share > 0.004)
      .slice(0, 14)
      .map(r => el('span', { class: 'sw' }, el('i', { style: { background: r.color } }),
        `${r.label} ${Math.round(r.share * 100)}%`));
    if (compositionBox) {
      compositionBox.replaceChildren(
        el('summary', { text: `What ${world.planet?.name || 'this world'} is made of` }),
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

    // World Forge's places: settlements, ports, passes, dungeons, caves
    for (const node of world.nodes || []) {
      const key = markFor(node);
      if (!key) continue;
      // at a whole-world zoom only the places you would plan a route around are drawn
      if (scale < 3 && !(node.type === 'settlement' ? (node.size || 0) >= 3 : node.type === 'dungeon')) continue;
      if (scale < 1.6 && node.type === 'settlement' && (node.size || 0) < 4) continue;
      marks.push({
        key: node.type === 'dungeon' && cleared.has(node.id) ? 'cleared' : key,
        x: ox + (node.x + 0.5) * scale, y: oy + (node.y + 0.5) * scale,
      });
    }

    // farhold's own: strongholds and landmarks, which stand on the ground in metres, not cells
    for (const site of sites?.sites || []) {
      const key = markFor(site);
      if (!key) continue;
      if (scale < 2.2 && site.family !== 'stronghold' && site.family !== 'worldboss') continue;
      marks.push({
        key: site.cleared ? 'cleared' : key,
        x: ox + (site.x / M_PER_CELL + 0.5) * scale, y: oy + (site.z / M_PER_CELL + 0.5) * scale,
      });
    }

    // smallest first, so a capital is never hidden under the hamlet beside it
    marks.sort((a, b) => (order.get(b.key) ?? 0) - (order.get(a.key) ?? 0));
    const k = Math.min(1.5, Math.max(0.7, scale / 4));
    for (const m of marks) {
      if (m.x < -20 || m.y < -20 || m.x > canvas.width + 20 || m.y > canvas.height + 20) continue;
      drawMark(ctx, m.key, m.x, m.y, k);
    }
  }

  function drawWaypoints(ctx, scale, ox, oy) {
    if (!waypoints) return;
    const pads = waypoints.list();
    if (!pads.length) return;
    waypointHits.length = 0;

    for (const pad of pads) {
      const px = ox + (pad.x / M_PER_CELL) * scale;
      const py = oy + (pad.z / M_PER_CELL) * scale;
      if (px < -20 || py < -20 || px > canvas.width + 20 || py > canvas.height + 20) continue;
      const r = Math.max(5, Math.min(11, 4 + scale * 0.5));

      // the pad: a disc, then the sigil ring
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pad.lit ? 'rgba(20, 44, 58, .95)' : 'rgba(22, 26, 34, .9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pad.lit ? '#6ad0ff' : 'rgba(120, 132, 148, .65)';
      ctx.stroke();

      // the sigildry — three marks on the ring, lit or dark
      ctx.strokeStyle = pad.lit ? '#bfeaff' : 'rgba(120, 132, 148, .45)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * r * 0.32, py + Math.sin(a) * r * 0.32);
        ctx.lineTo(px + Math.cos(a) * r * 0.78, py + Math.sin(a) * r * 0.78);
        ctx.stroke();
      }
      waypointHits.push({ px, py, r: r + 5, pad });
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
    readout.className = 'readout' + (zone && zone.id >= 0 ? ' zone-' + zoneTone(zone.midLevel, getLevel()) : '');
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

  canvas.addEventListener('click', ev => {
    // a click that was really the end of a drag is not a click
    if (state.justDragged) { state.justDragged = false; return; }
    const cell = cellFromEvent(ev);
    if (!cell) return;
    if (ev.shiftKey) {
      addPin(cell.x, cell.y);
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
    let closest = null, best = Infinity;
    for (const hit of waypointHits) {
      const d = Math.hypot(hit.px - mx, hit.py - my);
      if (d <= hit.r && d < best) { best = d; closest = hit; }
    }
    if (closest && waypoints?.travel) {
      if (waypoints.travel(closest.pad.id)) toggle(false);
      return;
    }

    const info = cellInfo(world, cell.x, cell.y);
    state.selected = info ? { ...info, x: cell.x, y: cell.y } : null;
    buildSide();
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

  return {
    root, state, markers: book,
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
    /** B8: which region names you have earned, for the tests and the debug menu. */
    known: () => [...known],
    knows,
    /** Take the screen out of the page (used when the world under it is replaced). */
    dispose() {
      root.remove();
      // a new map is built for every world you land on, so the flight redraw has to go with the old
      // one or they stack up, each one drawing a screen nobody can see
      if (airTimer) { clearInterval(airTimer); airTimer = null; }
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
