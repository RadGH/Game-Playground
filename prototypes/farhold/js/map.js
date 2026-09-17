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
import { renderWorld, legend as legendRows, DEFAULT_LAYERS } from '../../../worldgen/js/render.js';
import { cellInfo } from '../../../worldgen/js/world.js';
import { weatherAt, weatherOdds } from '../../../worldgen/js/weather.js';
import { M_PER_CELL } from './planet.js';

export function createMapScreen({ terrain, getPlayer, getEnemies = () => [], onTeleport = null, seed = 1, markers = null, zones = null, getLevel = () => 1, sites = null, gates = null, meteors = null } = {}) {
  // Pins used to be a bare array owned by this screen. They are markers now (`js/markers.js`), so
  // a quest destination, a story objective and a pin the player dropped are one kind of thing and
  // the minimap and space mode can see them too.
  const book = markers;
  const pins = () => (book ? book.here() : []);
  const world = terrain.world;

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
  const coords = el('span', { class: 'map-coords' });

  const root = el('section', { class: 'map-screen hidden', id: 'map-screen' },
    el('div', { class: 'map-head' },
      el('h2', { text: world.planet?.name || 'The map' }),
      coords,
      el('button', { class: 'map-close', text: '×', onclick: () => toggle(false) }),
    ),
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

    // Markers: quests, story objectives and dropped pins, each with a star that tracks or untracks
    // it. A tracked marker is the one the minimap draws and points an arrow at; an untracked one
    // still sits on this map, it just stops following you around.
    const here = pins();
    const list = el('div', { class: 'pin-list' });
    if (!here.length) {
      list.append(el('p', { class: 'muted small', text: 'Shift-click the map to drop a pin. Quests mark themselves.' }));
    } else {
      const player = getPlayer();
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
  function fit() {
    const wrap = canvas.parentElement;
    const w = Math.max(320, wrap.clientWidth), h = Math.max(240, wrap.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function draw() {
    if (!state.open) return;
    fit();
    const ctx = canvas.getContext('2d');
    // draw the map at the zoom the wheel asked for, positioned around the player. renderWorld takes
    // its own scale and offset, so there is no second transform to keep in step with the overlays.
    const { scale, offsetX: ox, offsetY: oy } = viewBox();
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    state.view = renderWorld(ctx, world, {
      layers: state.layers, layer: state.layer,
      scale, offsetX: ox, offsetY: oy,
    });

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
      for (const zone of zones.zones) {
        const spot = world.regions?.[zone.id]?.label || zone.center;
        if (!spot || zone.cells < 18) continue;
        const lx = ox + (spot.x + 0.5) * scale;
        // sit under the name when labels are on, and in its place when they are not
        const ly = oy + (spot.y + 0.5) * scale + (state.layers.labels ? 15 : 0);
        const tone = zoneTone(zone.midLevel, myLevel);
        const label = `${zone.minLevel}\u2013${zone.maxLevel}`;
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
    const player = getPlayer();
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
    rows.push(...legendRows(world, state.layer).slice(0, state.levels && zones ? 6 : 14).map(r =>
      el('span', { class: 'sw' }, el('i', { style: { background: r.color } }), `${r.label}${r.share > 0.004 ? ' ' + Math.round(r.share * 100) + '%' : ''}`)));
    legendBox.replaceChildren(...rows);

    coords.textContent = `seed ${seed} · ${Math.round(player.x)}, ${Math.round(player.z)} m`
      + ` · cell ${Math.round(player.x / M_PER_CELL)},${Math.round(player.z / M_PER_CELL)}`
      + ` · zoom ${state.zoom}× (wheel)`;
  }

  /**
   * The same fit renderWorld used, so overlays land on the right pixels — then the zoom on top.
   *
   * `zoom` is a whole-map multiplier and `centre` is the cell the view is built around (the player,
   * unless the map has been dragged). At zoom 1 it is exactly what renderWorld drew.
   */
  function viewBox() {
    const fit = Math.min(canvas.width / world.width, canvas.height / world.height);
    const scale = fit * state.zoom;
    const c = state.centre || playerCell();
    return {
      scale, fit,
      offsetX: Math.round(canvas.width / 2 - c.x * scale),
      offsetY: Math.round(canvas.height / 2 - c.y * scale),
    };
  }

  /** Where the player is, in map cells. */
  function playerCell() {
    const p = getPlayer();
    return { x: p.x / M_PER_CELL, y: p.z / M_PER_CELL };
  }

  const ZOOMS = [1, 1.8, 3.2, 5.6, 10];

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
      + (info.region ? ` · ${info.region.name}` : '')
      + (zone && zone.id >= 0 ? ` · level ${zone.minLevel}\u2013${zone.maxLevel} (${zone.danger})` : '')
      + (odds ? ` · usually ${odds.name.toLowerCase()}` : '');
    readout.className = 'readout' + (zone && zone.id >= 0 ? ' zone-' + zoneTone(zone.midLevel, getLevel()) : '');
  });

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

  function toggle(open = !state.open) {
    state.open = open;
    root.classList.toggle('hidden', !open);
    if (open) {
      document.exitPointerLock?.();
      buildSide();
      draw();
    }
    return open;
  }

  window.addEventListener('resize', () => { if (state.open) draw(); });

  return {
    root, state, markers: book,
    get pins() { return pins(); },
    /** Step the zoom from a button or a test. */
    setZoom(z) { state.zoom = ZOOMS.includes(z) ? z : 1; if (state.zoom === 1) state.centre = null; draw(); },
    /** Turn the level overlay on or off (the checkbox, the debug menu and the tests). */
    setLevels(on) { state.levels = !!on; buildSide(); draw(); },
    get isOpen() { return state.open; },
    toggle, draw, addPin, removePin,
    /** Take the screen out of the page (used when the world under it is replaced). */
    dispose() { root.remove(); },
    /** Keep the player arrow moving while the map is open. */
    tick() { if (state.open) draw(); },
  };
}
