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
import { renderWorld, legend as legendRows, DEFAULT_LAYERS, worldPixels } from '../../../worldgen/js/render.js';
import { generateRegionDetail } from '../../../worldgen/js/local.js';
import { cellInfo } from '../../../worldgen/js/world.js';
import { weatherAt, weatherOdds } from '../../../worldgen/js/weather.js';
import { M_PER_CELL } from './planet.js';

export function createMapScreen({ terrain, getPlayer, getEnemies = () => [], onTeleport = null, seed = 1, markers = null, zones = null, getLevel = () => 1, sites = null, gates = null, meteors = null, showCoords = () => false, rumours = null } = {}) {
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
  function buildSide() {
    side.replaceChildren();
    const layerPanel = layersPanel({
      layer: state.layer, layers: state.layers,
      onLayer: name => { state.layer = name; buildSide(); draw(); },
      onToggle: (key, on) => { state.layers[key] = on; draw(); },
    });
    side.append(layerPanel);
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
    const detail = state.zoom >= DETAIL_FROM ? detailUnderView() : null;
    if (detail) {
      drawDetail(ctx, detail, scale, ox, oy);
      state.view = { scale, offsetX: ox, offsetY: oy, detail: detail.regionId };
    } else {
      state.view = renderWorld(ctx, drawnWorld(), {
        layers: state.layers, layer: state.layer,
        scale, offsetX: ox, offsetY: oy,
      });
    }

    // B8: where a name has been held back, say so in grey rather than leaving a gap the player
    // reads as empty ground. The band under it still tells them whether they could survive there.
    // The two tests are renderWorld's own (`worldgen/js/render.js:278-281`), so the grey word lands
    // exactly where the name would have, at exactly the zooms that would have shown one.
    if (zones && state.layers.labels && !detail && scale >= 1.6) {
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
      const myLevel = getLevel();
      const img = ctx.getImageData(ox, oy, Math.round(world.width * scale), Math.round(world.height * scale));
      const px = img.data;
      const w = img.width, h = img.height;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cx = Math.min(world.width - 1, Math.floor(x / scale));
          const cy = Math.min(world.height - 1, Math.floor(y / scale));
          const id = world.region ? world.region[cy * world.width + cx] : -1;
          if (id < 0) continue;
          const zone = zones.byId(id);
          const [r, g, b] = TONE_RGB[zoneTone(zone.midLevel, myLevel)] || TONE_RGB.even;
          const i = (y * w + x) * 4;
          px[i] = px[i] * 0.62 + r * 0.38;
          px[i + 1] = px[i + 1] * 0.62 + g * 0.38;
          px[i + 2] = px[i + 2] * 0.62 + b * 0.38;
        }
      }
      ctx.putImageData(img, ox, oy);

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

    // ---- dungeon mouths and camps, so a route can be planned around what is on it
    for (const g of gates?.nodes || []) {
      const gx = ox + (g.x / M_PER_CELL + 0.5) * scale, gy = oy + (g.z / M_PER_CELL + 0.5) * scale;
      ctx.beginPath();
      ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy + 4); ctx.lineTo(gx - 5, gy + 4); ctx.closePath();
      ctx.fillStyle = g.cleared ? '#6a7a8a' : '#c090ff';
      ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(8,6,14,.9)'; ctx.stroke();
    }
    for (const v of sites?.sites || []) {
      const sx = ox + (v.x / M_PER_CELL + 0.5) * scale, sy = oy + (v.z / M_PER_CELL + 0.5) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, v.kind === 'lair' ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = v.kind === 'lair' ? '#ff6a3a' : '#ffa860';
      ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(10,6,4,.9)'; ctx.stroke();
    }

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
      rows.push(el('span', { class: 'sw' }, el('i', { style: { background: '#c090ff' } }), 'dungeon'));
      rows.push(el('span', { class: 'sw' }, el('i', { style: { background: '#ff6a3a' } }), 'lair'));
      rows.push(el('span', { class: 'sw' }, el('i', { style: { background: '#ffa860' } }), 'camp'));
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
    if (!world.region || !world.regions?.length) return null;
    const c = state.centre || playerCell();
    const cx = Math.max(0, Math.min(world.width - 1, Math.round(c.x)));
    const cy = Math.max(0, Math.min(world.height - 1, Math.round(c.y)));
    const id = world.region[cy * world.width + cx];
    if (id == null || !world.regions[id]) return null;
    if (!detailCache.has(id)) {
      try {
        detailCache.set(id, generateRegionDetail(world, id, { factor: 6, maxCells: 260000 }));
      } catch {
        detailCache.set(id, null);
      }
    }
    const d = detailCache.get(id);
    return d ? { ...d, regionId: id } : null;
  }

  /**
   * Draw a region's detail where that region actually sits on the world map, so panning and zooming
   * stay continuous — the detail lands exactly over the cells it was generated from.
   */
  function drawDetail(ctx, detail, scale, ox, oy) {
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the plain world underneath, so the ground outside this region is still there
    renderWorld(ctx, drawnWorld(), { layers: state.layers, layer: state.layer, scale, offsetX: ox, offsetY: oy });
    const factor = detail.factor || 6;
    const px = worldPixels(detail, { layer: state.layer || 'biomes', hillshade: state.layers?.hillshade !== false, shade: 3 });
    const img = ctx.createImageData(detail.width, detail.height);
    img.data.set(px.data);
    if (!detailBuffer || detailBuffer.width !== detail.width || detailBuffer.height !== detail.height) {
      detailBuffer = document.createElement('canvas');
      detailBuffer.width = detail.width;
      detailBuffer.height = detail.height;
    }
    detailBuffer.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    //  is the top-left WORLD cell the detail was generated from, and  how many
    // of them it covers — so the detail lands exactly over the ground it came from.
    ctx.drawImage(
      detailBuffer,
      ox + detail.origin.x * scale, oy + detail.origin.y * scale,
      detail.worldCells.w * scale, detail.worldCells.h * scale,
    );
  }
  let detailBuffer = null;

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
