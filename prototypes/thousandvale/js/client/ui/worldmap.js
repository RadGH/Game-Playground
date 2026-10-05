// The world map (play-test P3, key M): the whole Vale with every province, the playable province's zones with their
// names and LEVEL BANDS, towns, roads, rivers, waystones (travel from the map), dungeons, caves, forts, event arenas,
// live events, quest markers, your pins, your position and your party; zoom from the whole world down to the streets
// of a town; drag to pan, wheel or pinch to zoom; fog over what you have not seen; a hover card for every marker and
// for every zone. Inside a dungeon it is the dungeon's map instead (P13), drawn from the room's tiles.

import { createPanel, h } from '../ui-panel.js';
import { makeView, zoomAt, hitTest, bandText, bandTone, distText, compass, titleCase, zoneKeyAt, ZONE_M, poiLabel } from './map-data.js';
import { drawMap, drawDungeon, drawIcon, COLORS } from './map-render.js';
import { estimateFare } from '../world-ui.js';
import { esc } from './tips.js';

const LEGEND = [
  ['me', 'You'], ['party', 'Party member'], ['quest', 'Quest goal'], ['questdone', 'Hand a quest in'], ['liveevent', 'Event happening now'],
  ['waystone', 'Waystone (touched)'], ['town', 'Town'], ['hamlet', 'Hamlet / village'], ['dungeon', 'Dungeon'], ['cave', 'Cave'], ['fort', 'Fort'],
  ['event', 'Event arena'], ['farm', 'Farm'], ['landmark', 'Landmark'], ['pin', 'Your pin (right-click the map)'],
];

export function createWorldMap({ atlas, net, me, hud, worldUi, inCombat = () => false }) {
  const panel = createPanel({ id: 'map', title: 'Map', width: 0, cls: 'map-panel centered', onOpen: () => { fitPreset(state.preset || 'region'); loop(); }, onClose: () => { hideCard(); } });
  const canvas = h('canvas.map-canvas', { 'aria-label': 'World map' });
  const card = h('div.tipbox.map-card', { hidden: true, role: 'tooltip' });
  const zoomBox = h('div.map-zoom', {},
    h('button.ghost', { type: 'button', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.6) }, '+'),
    h('button.ghost', { type: 'button', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.6) }, '−'),
    h('button.ghost', { type: 'button', title: 'Centre on me', 'aria-label': 'Centre on me', onclick: () => centreOnMe() }, '⌖'));
  const legend = h('div.map-legend', { hidden: true }, ...LEGEND.map(([k, t]) => {
    const c = document.createElement('canvas'); c.width = 22; c.height = 22; const g = c.getContext('2d'); drawIcon(g, k, 11, 11, 6, { known: true, yaw: Math.PI });
    return h('div.lg-row', {}, c, h('span', {}, t));
  }));
  const presets = h('div.map-presets', { role: 'tablist' });
  const layers = h('div.map-layers');
  const side = h('aside.map-side');
  const stage = h('div.map-stage', {}, canvas, zoomBox, legend, card);
  panel.fill(h('div.map-top', {}, presets, h('span.grow'), layers), h('div.map-main', {}, stage, side));

  const state = { cx: 0, cz: 0, scale: 0.1, preset: 'region', opts: { roads: true, rivers: true, quests: true, events: true, places: true, party: true, names: true }, hover: null, drag: null, w: 0, h: 0, raf: 0, lastSide: '' };
  const PRESETS = [['world', 'World'], ['province', 'Province'], ['region', 'Region'], ['here', 'Around me']];
  const DPRESETS = [['floor', 'This floor'], ['all', 'Whole dungeon']];
  function drawPresets() {
    const list = atlas.dungeon ? DPRESETS : PRESETS;
    presets.replaceChildren(...list.map(([k, t]) => h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(state.preset === k), onclick: () => fitPreset(k) }, t)),
      h('button.ghost.small', { type: 'button', title: 'What the symbols mean', onclick: () => { legend.hidden = !legend.hidden; } }, 'Legend'));
    layers.replaceChildren(...(atlas.dungeon ? [] : [['roads', 'Roads'], ['rivers', 'Rivers'], ['places', 'Places'], ['quests', 'Quests'], ['events', 'Events'], ['names', 'Names']].map(([k, t]) =>
      h('label.map-toggle', {}, h('input', { type: 'checkbox', checked: state.opts[k], onchange: e => { state.opts[k] = e.target.checked; } }), t))));
  }

  // ---- sizing + presets ----
  function size() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    state.w = Math.max(50, r.width); state.h = Math.max(50, r.height);
    if (canvas.width !== Math.round(state.w * d) || canvas.height !== Math.round(state.h * d)) { canvas.width = Math.round(state.w * d); canvas.height = Math.round(state.h * d); }
    const g = canvas.getContext('2d'); g.__dpr = d;
    return g;
  }
  const view = () => makeView({ cx: state.cx, cz: state.cz, scale: state.scale, w: state.w, h: state.h });
  function fit(minX, minZ, maxX, maxZ, pad = 0.06) {
    size();
    state.cx = (minX + maxX) / 2; state.cz = (minZ + maxZ) / 2;
    state.scale = Math.min(state.w / ((maxX - minX) * (1 + pad * 2)), state.h / ((maxZ - minZ) * (1 + pad * 2)));
  }
  function fitPreset(k) {
    state.preset = k;
    hideCard();
    const p = me(), m = atlas.model;
    if (atlas.dungeon) {
      const d = atlas.dungeon, f = k === 'all' ? null : atlas.floorAt(p?.x ?? 0, p?.z ?? 0);
      const fl = f ? [f] : d.floors;
      fit(Math.min(...fl.map(q => q.origin.x)), Math.min(...fl.map(q => q.origin.z)), Math.max(...fl.map(q => q.origin.x + q.w * d.cell)), Math.max(...fl.map(q => q.origin.z + q.h * d.cell)), 0.04);
    } else if (k === 'world' && m) fit(0, 0, m.worldW, m.worldH, 0.01);
    else if (k === 'province' && m?.playable) { const b = m.playable.block, s = m.playable.size; fit(b[0] * ZONE_M, b[1] * ZONE_M, (b[0] + s[0]) * ZONE_M, (b[1] + s[1]) * ZONE_M, 0.03); }
    else if (k === 'region' && p) { const zx = Math.floor(p.x / ZONE_M), zy = Math.floor(p.z / ZONE_M); fit(zx * ZONE_M, zy * ZONE_M, zx * ZONE_M + ZONE_M, zy * ZONE_M + ZONE_M, 0.02); }
    else if (p) { size(); state.cx = p.x; state.cz = p.z; state.scale = 0.9; }
    drawPresets();
  }
  function zoomBy(f, sx = state.w / 2, sy = state.h / 2) { const z = zoomAt(view(), sx, sy, f, { min: 0.003, max: atlas.dungeon ? 40 : 4 }); Object.assign(state, z); state.preset = null; drawPresets(); }
  function centreOnMe() { const p = me(); if (p) { state.cx = p.x; state.cz = p.z; if (state.scale < 0.2 && !atlas.dungeon) state.scale = 0.5; } }

  // ---- drawing ----
  function markers() {
    const all = atlas.markers();
    const o = state.opts;
    return all.filter(m => {
      if (m.kind === 'quest' || m.kind === 'questdone') return o.quests;
      if (m.kind === 'liveevent') return o.events;
      if (['town', 'city', 'capital', 'hamlet', 'village', 'dungeon', 'cave', 'fort', 'farm', 'event', 'ford', 'bridge', 'landmark'].includes(m.kind)) {
        if (!o.places) return false;
        // small places only show when close enough to read
        if ((m.kind === 'farm' || m.kind === 'ford' || m.kind === 'bridge') && state.scale < 0.14) return false;
        if ((m.kind === 'hamlet' || m.kind === 'village' || m.kind === 'landmark' || m.kind === 'cave' || m.kind === 'fort') && state.scale < 0.04) return false;
        if ((m.kind === 'dungeon' || m.kind === 'event') && state.scale < 0.02) return false;
        if (m.kind === 'town' && state.scale < 0.02 && m.priority < 3) return false;
      }
      if (m.kind === 'waystone' && state.scale < 0.03) return false;
      return true;
    });
  }
  let lastMarkers = [];
  function draw() {
    const g = size();
    const v = view();
    lastMarkers = markers();
    if (atlas.dungeon) {
      const d = atlas.dungeon;
      drawDungeon(g, v, { floors: d.floors, cell: d.cell, fog: d.fog, markers: lastMarkers, opts: {} });
    } else {
      const detail = state.scale > 0.45 ? detailOnScreen(v) : null;
      drawMap(g, v, { model: atlas.model, world: atlas.world, zoneImage: k => atlas.src.zoneImage(k), fog: atlas.fog, markers: lastMarkers, detail, opts: { ...state.opts, level: me()?.level || 1 } });
      if (!atlas.model) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#e8dcc0'; g.font = '600 15px Alegreya Sans, sans-serif'; g.textAlign = 'center'; g.fillText('Unrolling the map…', state.w / 2 * (g.__dpr || 1), state.h / 2 * (g.__dpr || 1)); }
      drawScale(g, v);
    }
    drawSide();
  }
  function detailOnScreen(v) {
    const b = v.bounds(), m = new Map();
    for (let zx = Math.floor(b.minX / ZONE_M); zx <= Math.floor(b.maxX / ZONE_M); zx++) for (let zy = Math.floor(b.minZ / ZONE_M); zy <= Math.floor(b.maxZ / ZONE_M); zy++) {
      const k = zoneKeyAt(zx * ZONE_M + 1, zy * ZONE_M + 1);
      if (atlas.model?.zones.get(k)?.playable) m.set(k, atlas.zoneDetail(k));
    }
    return m;
  }
  function drawScale(g, v) {
    // a scale bar: the round number of metres closest to 110 px
    const want = 110 / v.scale, steps = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
    const m = steps.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    const px = m * v.scale, d = g.__dpr || 1;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = 'rgba(20,16,12,0.7)'; g.fillRect(12, state.h - 30, px + 16, 20);
    g.fillStyle = '#e8dcc0'; g.fillRect(20, state.h - 18, px, 3);
    g.font = '600 11px Alegreya Sans, sans-serif'; g.textAlign = 'left'; g.fillText(distText(m), 22, state.h - 23);
  }
  function loop() {
    cancelAnimationFrame(state.raf);
    const step = () => { if (!panel.isOpen) return; draw(); state.raf = requestAnimationFrame(step); };
    state.raf = requestAnimationFrame(step);
  }

  // ---- the side panel: where you are, what you are doing, how to get there ----
  function drawSide() {
    const p = me(); if (!p) return;
    const z = atlas.zoneAt(p.x, p.z), m = atlas.model;
    const tq = atlas.trackedQuest;
    const evs = atlas.events;
    const ws = (net()?.joined?.room?.waystones || []);
    const known = new Set(worldUi?.knownWaystones?.() || []);
    const atStone = ws.find(w => Math.hypot(w.x - p.x, w.z - p.z) < 8);
    const key = JSON.stringify([z?.key, tq?.id, tq?.goal, tq?.loc && Math.round(Math.hypot(tq.loc.x - p.x, tq.loc.z - p.z) / 20), evs.map(e => e.uid + e.sub), [...known].join(), !!atStone, atlas.dungeon?.id, atlas.quests.length, Math.round((atlas.fog?.version || 0) / 20)]);
    if (key === state.lastSide) return;
    state.lastSide = key;
    const kids = [];
    if (atlas.dungeon) {
      const d = atlas.dungeon, f = atlas.floorAt(p.x, p.z);
      kids.push(h('section', {}, h('h4', {}, d.name), h('p', {}, `Floor ${(f?.index ?? 0) + 1} of ${d.floors.length}${d.level ? ` · level ${d.level}` : ''}`), h('p.tiny', {}, 'The map fills in as you explore. Stairs, the way out and the reward chest are marked once you have seen them.')));
    } else if (z) {
      const tone = bandTone(z.band, p.level || 1);
      const share = atlas.fog ? Math.round(atlas.fog.shareIn(z.bounds) * 100) : 0;
      kids.push(h('section', {}, h('h4', {}, z.name || 'The wilds'), h('p', {}, h('b.tone-' + tone, {}, bandText(z.band) || 'unknown levels'), ` · ${share}% explored`),
        z.town ? h('p.tiny', {}, `Town: ${z.town}${z.dungeon ? ` · Dungeon: ${z.dungeon.name}` : ''}`) : null,
        h('p.tiny', {}, `${m?.playable?.name || ''}${m?.playable?.band ? ` (${bandText(m.playable.band)})` : ''}`)));
    }
    if (tq) {
      kids.push(h('section.map-quest', {}, h('h4', {}, 'Tracked quest'), h('b', {}, tq.name), h('p', {}, tq.goal),
        tq.loc ? h('p.tiny', {}, tq.loc.exact ? `${tq.loc.name ? tq.loc.name + ' — ' : ''}${atlas.whereText(tq.loc, tq.loc.r)}` : `Somewhere in ${tq.loc.name} — ${atlas.whereText(tq.loc, 0)}`) : null,
        tq.loc ? h('button.ghost.small', { type: 'button', onclick: () => showAt(tq.loc.x, tq.loc.z, tq.loc.exact ? 0.6 : 0.2) }, 'Show on map') : null));
    }
    if (evs.length) {
      kids.push(h('section', {}, h('h4', {}, 'Events'), ...evs.map(e => h('div.map-ev', {}, h('b', {}, e.name || 'Event'), h('p.tiny', {}, `${e.sub || ''}${Number.isFinite(e.x) ? ' — ' + atlas.whereText(e, e.r) : ''}`),
        h('div.row', {}, Number.isFinite(e.x) ? h('button.ghost.small', { type: 'button', onclick: () => showAt(e.x, e.z, 0.5) }, 'Show') : null, e.free ? h('button.primary.small', { type: 'button', onclick: () => travel('event') }, 'Travel there free') : null)))));
    }
    if (!atlas.dungeon) {
      const rows = ws.filter(w => known.has(w.key)).map(w => {
        const here = atStone && atStone.key === w.key;
        return h('li', {}, h('span', {}, w.name), h('small', {}, here ? 'You are here' : `${estimateFare(p, w)} g · ${distText(Math.hypot(w.x - p.x, w.z - p.z))}`),
          !here ? h('button.ghost.small', { type: 'button', disabled: !atStone, title: atStone ? `Travel for ${estimateFare(p, w)} gold` : 'Stand at any waystone to travel', onclick: () => travel(w.key) }, 'Travel') : null);
      });
      kids.push(h('section', {}, h('h4', {}, `Waystones (${known.size} of ${ws.length})`),
        h('p.tiny', {}, atStone ? `You stand at ${atStone.name}. Pick where to go.` : 'Travel works while you stand at any waystone. Touch new ones to add them.'),
        rows.length ? h('ul.map-ws', {}, rows) : h('p.tiny', {}, 'You have not touched a waystone yet.')));
    }
    side.replaceChildren(...kids);
  }
  function showAt(x, z, scale) { state.cx = x; state.cz = z; if (scale) state.scale = Math.max(state.scale, scale); state.preset = null; drawPresets(); }
  function travel(key) {
    const n = net(); if (!n) return;
    if (key !== 'event') {
      const p = me(), ws = n.joined?.room?.waystones || [];
      if (!ws.some(w => Math.hypot(w.x - p.x, w.z - p.z) < 8)) { hud.toast('Stand at a waystone to travel.', 'warn'); return; }
    }
    if (inCombat()) { hud.toast('Not while fighting.', 'warn'); return; }
    n.travel(key); panel.close();
  }

  // ---- hover cards ----
  function cardFor(m) {
    const p = me();
    const d = p ? Math.hypot(m.x - p.x, m.z - p.z) : 0;
    const where = p && m.kind !== 'me' ? `${distText(d)} ${compass(m.x - p.x, m.z - p.z)}` : '';
    const lvl = m.level ? `<span class="${'tone-' + bandTone([m.level, m.level], p?.level || 1)}">level ${esc(m.level)}</span>` : '';
    const act = m.act === 'travel' ? (net()?.joined?.room?.waystones || []).some(w => Math.hypot(w.x - p.x, w.z - p.z) < 8) ? `Click to travel here (${estimateFare(p, m)} gold)` : 'Stand at any waystone to travel here'
      : m.act === 'track' ? (m.tracked ? 'Tracked — shown on the minimap' : 'Click to track this quest') : m.act === 'unpin' ? 'Click to remove the pin' : m.act === 'event' ? 'Click to travel there free' : '';
    return `<div class="tip-title">${esc(m.name)}</div>${m.sub ? `<div class="tip-sub">${esc(m.sub)}</div>` : ''}${lvl || where ? `<div class="tip-row"><span>${lvl}</span><span>${esc(where)}</span></div>` : ''}${act ? `<hr><div class="tip-act">${esc(act)}</div>` : ''}`;
  }
  function zoneCard(x, z) {
    const zr = atlas.zoneAt(x, z), m = atlas.model;
    if (!zr) return null;
    const p = me();
    if (!zr.playable) {
      const pr = m?.provinces.find(q => q.id === zr.province);
      if (!pr || zr.land < 0.08) return `<div class="tip-title">Open sea</div>`;
      return `<div class="tip-title">${esc(pr.name)}</div><div class="tip-sub">${esc(titleCase(pr.biome || ''))} · not open yet</div><hr><div>Another province of the Vale. The roads there are closed for now.</div>`;
    }
    const share = atlas.fog ? Math.round(atlas.fog.shareIn(zr.bounds) * 100) : 0;
    const tone = bandTone(zr.band, p?.level || 1);
    const toneText = { easy: 'Easy for you', fair: 'Right for your level', hard: 'Hard for you', deadly: 'Deadly at your level' }[tone];
    return `<div class="tip-title">${esc(zr.name)}</div><div class="tip-sub">${esc(m?.playable?.name || '')}${zr.archetype ? ' · ' + esc(titleCase(zr.archetype)) : ''}</div>
      <div class="tip-row"><b class="tone-${tone}">${esc(bandText(zr.band))}</b><span>${share}% explored</span></div><div class="tone-${tone}">${toneText}</div>
      ${zr.town ? `<hr><div>Town: ${esc(zr.town)}</div>` : ''}${zr.dungeon ? `<div>Dungeon: ${esc(zr.dungeon.name)}${zr.dungeon.level ? ` (level ${esc(zr.dungeon.level)})` : ''}</div>` : ''}`;
  }
  function showCard(html, sx, sy) {
    if (!html) return hideCard();
    card.innerHTML = html; card.hidden = false; card.classList.add('show');
    const r = stage.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight;
    let x = sx + 16, y = sy + 14;
    if (x + cw > r.width - 6) x = sx - cw - 14;
    if (y + ch > r.height - 6) y = Math.max(6, sy - ch - 10);
    card.style.left = Math.max(6, x) + 'px'; card.style.top = y + 'px';
  }
  function hideCard() { card.hidden = true; card.classList.remove('show'); state.hover = null; }

  // ---- input: drag, wheel, pinch, hover, click, right-click ----
  const pointers = new Map();
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    state.drag = { at: local(e), cx: state.cx, cz: state.cz, moved: 0, button: e.button, pinch: pointers.size === 2 ? pinchInfo() : null };
  });
  function pinchInfo() { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], scale: state.scale }; }
  canvas.addEventListener('pointermove', e => {
    const [sx, sy] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
    if (state.drag && pointers.size === 2 && state.drag.pinch) {
      const pi = pinchInfo(), f = pi.d / Math.max(1, state.drag.pinch.d);
      const z = zoomAt(view(), pi.mid[0], pi.mid[1], (state.drag.pinch.scale * f) / state.scale, { min: 0.003, max: atlas.dungeon ? 40 : 4 });
      Object.assign(state, z); state.drag.moved = 99; hideCard(); return;
    }
    if (state.drag && pointers.size === 1) {
      const dx = sx - state.drag.at[0], dy = sy - state.drag.at[1];
      state.drag.moved = Math.max(state.drag.moved, Math.hypot(dx, dy));
      if (state.drag.moved > 4) { state.cx = state.drag.cx - dx / state.scale; state.cz = state.drag.cz - dy / state.scale; state.preset = null; hideCard(); canvas.style.cursor = 'grabbing'; return; }
    }
    hover(sx, sy);
  });
  function hover(sx, sy) {
    const hit = hitTest(lastMarkers, sx, sy, view(), 12)[0] || null;
    state.hover = hit;
    canvas.style.cursor = hit?.act ? 'pointer' : 'grab';
    if (hit) showCard(cardFor(hit), sx, sy);
    else if (!atlas.dungeon) { const [wx, wz] = view().toWorld(sx, sy); showCard(zoneCard(wx, wz), sx, sy); }
    else hideCard();
  }
  const endPointer = e => {
    pointers.delete(e.pointerId);
    const d = state.drag;
    if (!d || pointers.size) return;
    state.drag = null; canvas.style.cursor = 'grab';
    if (d.moved > 4) { drawPresets(); return; }
    const [sx, sy] = local(e);
    if (d.button === 2) { const [wx, wz] = view().toWorld(sx, sy); atlas.addPin(wx, wz); hud.toast('Pin dropped — it shows on your minimap.', 'info'); return; }
    const hit = hitTest(lastMarkers, sx, sy, view(), 12)[0];
    if (!hit) return;
    if (hit.act === 'travel') travel(hit.key);
    else if (hit.act === 'track') { atlas.setTracked(hit.quest); hud.toast(`Tracking: ${hit.name}`, 'info'); }
    else if (hit.act === 'unpin') atlas.removePin(hit.pin);
    else if (hit.act === 'event') travel('event');
    else if (['dungeon', 'town', 'city', 'cave', 'fort'].includes(hit.kind) && state.scale < 0.5) { showAt(hit.x, hit.z, Math.min(1.2, state.scale * 3)); }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); state.drag = null; });
  canvas.addEventListener('pointerleave', () => hideCard());
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('dblclick', e => { const [sx, sy] = local(e); zoomBy(2, sx, sy); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = local(e); zoomBy(Math.exp(-e.deltaY * 0.0016), sx, sy); hover(sx, sy); }, { passive: false });
  panel.root.addEventListener('keydown', e => {
    if (e.code === 'KeyM') { panel.close(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.4); else if (e.key === '-') zoomBy(1 / 1.4);
  });

  drawPresets();
  return {
    panel, draw, fitPreset, showAt,
    get state() { return { cx: state.cx, cz: state.cz, scale: state.scale, preset: state.preset, markers: lastMarkers.map(m => ({ id: m.id, kind: m.kind, name: m.name, x: m.x, z: m.z })) }; },
    /** tests: what the hover card says for a marker id (or a world point when no id). */
    cardText(id, x, z) { const m = lastMarkers.find(k => k.id === id); const d = document.createElement('div'); d.innerHTML = m ? cardFor(m) : zoneCard(x, z) || ''; return d.textContent; },
    hoverAt(x, z) { const [sx, sy] = view().toScreen(x, z); hover(sx, sy); return card.hidden ? '' : card.textContent; },
    COLORS, poiLabel,
  };
}
