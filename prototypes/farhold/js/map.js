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
import { renderWorld, legend as legendRows, DEFAULT_LAYERS } from '../../../worldgen/js/render.js';
import { cellInfo } from '../../../worldgen/js/world.js';
import { weatherAt, weatherOdds } from '../../../worldgen/js/weather.js';
import { M_PER_CELL } from './planet.js';

export function createMapScreen({ terrain, getPlayer, getEnemies = () => [], onTeleport = null, seed = 1, pins = [] } = {}) {
  const world = terrain.world;

  const state = {
    open: false,
    layer: 'biomes',
    layers: { ...DEFAULT_LAYERS, labels: true, nodes: true, rivers: true, roads: true },
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
    side.append(layersPanel({
      layer: state.layer, layers: state.layers,
      onLayer: name => { state.layer = name; buildSide(); draw(); },
      onToggle: (key, on) => { state.layers[key] = on; draw(); },
    }));

    const list = el('div', { class: 'pin-list' });
    if (!pins.length) {
      list.append(el('p', { class: 'muted small', text: 'Shift-click the map to drop a pin.' }));
    } else {
      for (const pin of pins) {
        list.append(el('div', { class: 'pin-row' },
          el('i', { class: 'pin-dot' }),
          el('span', { class: 'pin-name', text: pin.name }),
          el('span', { class: 'muted small', text: `${pin.x},${pin.y}` }),
          el('button', { class: 'pin-del', text: '×', onclick: () => { removePin(pin); } }),
        ));
      }
    }
    side.append(panel('Pins', list));

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
    state.view = renderWorld(ctx, world, { layers: state.layers, layer: state.layer });
    const { scale, offsetX: ox, offsetY: oy } = viewBox();

    // pins
    for (const pin of pins) {
      const px = ox + (pin.x + 0.5) * scale, py = oy + (pin.y + 0.5) * scale;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, scale * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = '#ffd070';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#2a2010'; ctx.stroke();
      if (pin.name) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#ffe6a8';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        ctx.strokeText(pin.name, px + 8, py + 4);
        ctx.fillText(pin.name, px + 8, py + 4);
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
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#102030'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // legend for whichever layer is up
    legendBox.replaceChildren(...legendRows(world, state.layer).slice(0, 14).map(r =>
      el('span', { class: 'sw' }, el('i', { style: { background: r.color } }), `${r.label}${r.share > 0.004 ? ' ' + Math.round(r.share * 100) + '%' : ''}`)));

    coords.textContent = `seed ${seed} · ${Math.round(player.x)}, ${Math.round(player.z)} m · cell ${Math.round(player.x / M_PER_CELL)},${Math.round(player.z / M_PER_CELL)}`;
  }

  /** The same fit renderWorld used, so overlays land on the right pixels. */
  function viewBox() {
    const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
    return {
      scale,
      offsetX: Math.round((canvas.width - world.width * scale) / 2),
      offsetY: Math.round((canvas.height - world.height * scale) / 2),
    };
  }

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
    readout.textContent = `${cell.x},${cell.y} · ${info.biomeName} · ${info.water === 'land' ? info.elevationMetres + ' m' : 'water'} · ${info.temperatureC}°C`
      + (info.region ? ` · ${info.region.name}` : '')
      + (odds ? ` · usually ${odds.name.toLowerCase()}` : '');
  });

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
    const pin = { x, y, name: name || `Pin ${pins.length + 1}` };
    pins.push(pin);
    buildSide();
    draw();
    return pin;
  }
  function removePin(pin) {
    const i = pins.indexOf(pin);
    if (i >= 0) pins.splice(i, 1);
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
    root, state, pins,
    get isOpen() { return state.open; },
    toggle, draw, addPin, removePin,
    /** Keep the player arrow moving while the map is open. */
    tick() { if (state.open) draw(); },
  };
}
