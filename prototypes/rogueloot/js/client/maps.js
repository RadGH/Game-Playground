// The minimap and the region map (live report #2, 2026-11-16: "The game needs a minimap and a region map, in addition
// to the waypoint map"). This file owns what both share — the zone picture (painted once per area), the explored cells
// (fog of war, saved per hero), the list of places — and the minimap in the top-right corner under the bag and ☰
// buttons. The big window is js/client/region-map.js (M); the world map stays in travel-ui.js (its own tab).
//
//   const maps = createMaps({ content, state, onWorld })   state() -> { area, me: {x, z, yaw}, heroId, ch, party, foes, chests, goal }
//   maps.enterArea(area)   maps.update(now)   maps.toggleRegion()   maps.regionOpen
//
// Rules kept: the map's up is the screen's up (W = north, rule 26); the minimap has NO tooltip of its own, only the pins
// do (Thousandvale W16, rule 9); hints follow the device (rule 18); it owns its corner and never sits on the play area
// (rule 15) and shrinks on phones; collapsed or not is remembered on this device (rule 43).
import { CAM } from './scene.js';
import { mapView, compass, distText, markSeen, seenCell, exploredStore, placesOf, foePin, nearestPin, SEE } from './map-core.js';
import { paintZoneMap, createFog, drawPlace, drawFoe, drawChest, drawAlly, drawHero, drawGoal } from './map-paint.js';
import { createRegionMap } from './region-map.js';
import { uiIcon } from './icons.js';
import { isTouch } from './touch.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MINI_ZOOMS = [1.0, 1.5, 2.2, 3.2];            // px a metre (1.5 at 176 px ≈ 58 m round you)
const ls = {
  get(k, d) { try { const v = localStorage.getItem('rogueloot.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rogueloot.' + k, JSON.stringify(v)); } catch { /* private */ } },
};

export function createMaps({ content, state, onWorld = () => {}, world = { isOpen: () => false, close: () => {} } }) {
  const zoneName = id => content.zones?.[id]?.name || content.acts?.[0]?.nodes?.find(n => n.id === id)?.name || 'somewhere';
  const explored = exploredStore({ read: k => { try { return localStorage.getItem(k); } catch { return null; } }, write: (k, v) => localStorage.setItem(k, v) });
  // ---- what both maps draw ----
  const Z = { area: null, terrain: null, grid: null, fog: null, heroId: null, dirty: false, savedAt: 0, places: [], placesKey: '' };
  const fogless = a => !!a?.zone?.town || a?.id === 'proving_meadow' || !a?.zone;
  function enterArea(area) {
    flush();
    Z.area = area; Z.terrain = null; Z.grid = null; Z.fog = null; Z.places = []; Z.placesKey = '';
    if (!area?.bounds) return;
    try { Z.terrain = paintZoneMap(area, 3); } catch (e) { console.warn('map paint', e.message); }
    region.enterArea();
  }
  function ensureFog(heroId) {
    if (!Z.area || fogless(Z.area) || !heroId) return;
    if (Z.grid && Z.heroId === heroId) return;
    flush(); Z.heroId = heroId;
    Z.grid = explored.get(heroId, Z.area.id, Z.area.bounds);
    Z.fog = createFog(Z.grid, seenCell);
  }
  function flush() { if (Z.dirty && Z.grid && Z.heroId && Z.area) { explored.put(Z.heroId, Z.area.id, Z.grid); Z.dirty = false; Z.savedAt = performance.now(); } }
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  function places(s) {
    const ch = s.ch, key = `${Z.area?.id}|${ch?.recall ? ch.recall.area + ch.recall.x + ',' + ch.recall.z : ''}`;
    if (key !== Z.placesKey) {
      Z.placesKey = key;
      const isTown = !!Z.area?.zone?.town, m = (Z.area?.markers || []).find(x => x.kind === 'waypoint') || Z.area?.spawn;
      const recall = ch?.recall ? (isTown ? { area: ch.recall.area, x: m.x - 3, z: m.z + 3 } : ch.recall) : null;      // the town swirl stands where travel-ui.js recallSpot puts it
      Z.places = placesOf(Z.area, { zoneName, recall, isTown });
    }
    return Z.places;
  }
  /** One frame of everything both maps need, in world units. */
  function snapshot() {
    const s = state() || {};
    if (s.area && s.area !== Z.area) enterArea(s.area);
    if (s.heroId) ensureFog(s.heroId);
    return { ...s, places: Z.area ? places(s) : [] };
  }
  /** Paint the zone picture, the fog and every pin onto a 2D context with `view` (map-core mapView). */
  function paint(g, view, s, { k = 1, dpr = 1, now = 0, hot = null, labels = false, foeRange = Infinity } = {}) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2a1f12'; g.fillRect(0, 0, view.w, view.h);
    const T = Z.terrain, b = Z.area?.bounds;
    if (T && b) {
      g.setTransform(...view.matrix(dpr)); g.imageSmoothingEnabled = true;
      g.drawImage(T.canvas, b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      if (Z.fog && Z.grid) g.drawImage(Z.fog.canvas, Z.grid.x0, Z.grid.z0, Z.grid.cols * Z.grid.cell, Z.grid.rows * Z.grid.cell);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const me = s.me, out = []; taken.length = 0;
    for (const c of s.chests || []) if (!c.open && seen(c.x, c.z)) { drawChest(g, view, c, k); out.push({ kind: 'chest', x: c.x, z: c.z, name: 'Chest', sub: 'Unopened' }); }
    for (const p of s.places) { const [x, y] = drawPlace(g, view, p, k, hot === p.id); out.push(p); if (labels && p.kind !== 'npc') labelPlace(g, p, x, y, k, view.w); }
    if (labels) for (const p of s.places) if (p.kind === 'npc') { const [x, y] = view.toScreen(p.x, p.z); labelPlace(g, p, x, y, k, view.w); }
    for (const f of s.foes || []) {
      if (me && Math.hypot(f.x - me.x, f.z - me.z) > foeRange) continue;
      drawFoe(g, view, f, foePin(f.rk, f.role), k); out.push({ kind: 'foe', x: f.x, z: f.z, name: f.name, sub: rankText(f) });
    }
    for (const a of s.party || []) { drawAlly(g, view, a, k); out.push({ kind: 'ally', x: a.x, z: a.z, name: a.name || 'Party member', sub: 'Party' }); if (labels && a.name) { const [x, y] = view.toScreen(a.x, a.z); labelLine(g, a.name, x, y + 12 * k, k, '#bfe0ff', view.w); } }
    if (s.goal && s.goal.x != null) { drawGoal(g, view, s.goal, k, now); out.push({ kind: 'goal', x: s.goal.x, z: s.goal.z, name: s.goal.label || 'Your next goal', sub: 'Quest' }); }
    if (me) { drawHero(g, view, me, k); out.push({ kind: 'me', x: me.x, z: me.z, name: 'You', sub: '' }); }
    return out;
  }
  const taken = [];
  const seen = (x, z) => !Z.grid || isSeenAt(x, z);
  const isSeenAt = (x, z) => { const g = Z.grid, c = Math.floor((x - g.x0) / g.cell), r = Math.floor((z - g.z0) / g.cell); return c >= 0 && r >= 0 && c < g.cols && r < g.rows && seenCell(g, c, r); };
  const rankText = f => ({ boss: 'Boss', rare: 'Rare', champion: 'Champion', elite: 'Elite' }[f.rk] || 'Monster') + (f.lvl ? ` · Level ${f.lvl}` : '');
  function labelLine(g, text, x, y, k, color, w = Infinity) {
    g.font = `700 ${Math.round(11 * k)}px Spectral, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const half = g.measureText(text).width / 2 + 4; x = Math.max(half, Math.min(w - half, x)); y = Math.max(8 * k, y);      // never cut off at the window's edge
    // declutter (rule 15): a label that would overlap one already drawn is left off (its pin, card and list row remain)
    const box = [x - half, y - 7 * k, x + half, y + 7 * k];
    if (taken.some(t => box[0] < t[2] && t[0] < box[2] && box[1] < t[3] && t[1] < box[3])) return;
    taken.push(box);
    g.lineWidth = 3; g.strokeStyle = 'rgba(24,16,8,.9)'; g.lineJoin = 'round'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  }
  function labelPlace(g, p, x, y, k, w) { labelLine(g, p.name, x, y - 13 * k, k * (p.kind === 'npc' ? 0.9 : 1), p.kind === 'exit' || p.kind === 'entrance' ? '#eaffd8' : p.kind === 'npc' ? '#ffe9b0' : '#fff6dc', w); }
  /** "35 m north-west" from you. */
  const where = (me, p) => me ? `${distText(Math.hypot(p.x - me.x, p.z - me.z))} ${compass(p.x - me.x, p.z - me.z, CAM.yaw)}`.trim() : '';

  // ---- the minimap ----
  const root = document.createElement('div'); root.className = 'minimap'; root.setAttribute('role', 'img'); root.setAttribute('aria-label', 'Minimap');
  root.innerHTML = `<canvas class="mm-canvas"></canvas><div class="mm-btns"><button class="mm-b mm-in" aria-label="Zoom the minimap in">+</button><button class="mm-b mm-out" aria-label="Zoom the minimap out">−</button></div>
    <button class="mm-b mm-hide" aria-label="Hide the minimap">${uiIcon('close', 14)}</button><span class="mm-key">M</span><div class="mm-card" hidden></div>`;
  const opener = document.createElement('button'); opener.className = 'mm-open'; opener.setAttribute('aria-label', 'Show the minimap'); opener.innerHTML = uiIcon('map', 26); opener.hidden = true;
  document.body.append(root, opener);
  const canvas = root.querySelector('canvas'), g = canvas.getContext('2d'), card = root.querySelector('.mm-card');
  const M = { zoom: Math.max(0, Math.min(MINI_ZOOMS.length - 1, ls.get('mm.zoom', 1) | 0)), hidden: !!ls.get('mm.hidden', false), last: 0, view: null, pins: [], size: 0 };
  root.querySelector('.mm-key').hidden = isTouch();
  const setZoom = z => { M.zoom = Math.max(0, Math.min(MINI_ZOOMS.length - 1, z)); ls.set('mm.zoom', M.zoom); M.last = 0; };
  const setHidden = h => { M.hidden = h; ls.set('mm.hidden', h); root.hidden = h; opener.hidden = !h; card.hidden = true; M.last = 0; document.body.classList.toggle('mm-off', h); };
  setHidden(M.hidden);
  const stop = e => { e.stopPropagation(); e.preventDefault(); };
  for (const [sel, fn] of [['.mm-in', () => setZoom(M.zoom + 1)], ['.mm-out', () => setZoom(M.zoom - 1)], ['.mm-hide', () => setHidden(true)]]) { const b = root.querySelector(sel); b.addEventListener('pointerdown', stop); b.addEventListener('click', e => { stop(e); fn(); }); }
  opener.addEventListener('pointerdown', stop); opener.addEventListener('click', e => { stop(e); setHidden(false); });
  canvas.addEventListener('pointerdown', stop);
  canvas.addEventListener('click', e => { stop(e); card.hidden = true; region.open(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(M.zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !M.view) return;
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const hit = nearestPin(M.pins, M.view, sx, sy, 9);
    if (!hit) { card.hidden = true; return; }
    const s = M.lastState;
    card.innerHTML = `<b>${esc(hit.name)}</b>${hit.sub ? `<small>${esc(hit.sub)}</small>` : ''}${hit.kind !== 'me' && s?.me ? `<span>${esc(where(s.me, hit))}</span>` : ''}`;
    card.hidden = false;
    // to the LEFT of the pointer (the minimap sits at the right edge), never over the pin itself
    card.style.left = Math.round(sx - card.offsetWidth - 14) + 'px'; card.style.top = Math.round(sy + 8) + 'px';
  });
  canvas.addEventListener('pointerleave', () => { card.hidden = true; });

  function drawMini(s, now) {
    const size = canvas.clientWidth || 0; if (!size) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (M.size !== size) { M.size = size; canvas.width = canvas.height = Math.round(size * dpr); }
    const me = s.me; if (!me) return;
    const view = mapView({ cx: me.x, cz: me.z, scale: MINI_ZOOMS[M.zoom] * size / 176, w: size, h: size, yaw: CAM.yaw });
    M.view = view;
    g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, size, size);
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); g.clip();
    const k = size < 140 ? 0.85 : 1;
    M.pins = paint(g, view, s, { k, dpr, now, foeRange: size / view.scale });
    // the clip survives paint()'s setTransform calls (a clip is not part of the transform)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // off the edge: the quest goal and party members get an arrow on the rim (Thousandvale's minimap)
    const R = size / 2 - 7;
    const rim = (x, z, col) => { const [px, py] = view.toScreen(x, z), dx = px - size / 2, dy = py - size / 2; if (Math.hypot(dx, dy) < R - 3) return; const a = Math.atan2(dy, dx); g.save(); g.translate(size / 2 + Math.cos(a) * R, size / 2 + Math.sin(a) * R); g.rotate(a); g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5); g.lineTo(-1.5, 0); g.lineTo(-4, 5); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#1b130a'; g.stroke(); g.restore(); };
    if (s.goal && s.goal.x != null) rim(s.goal.x, s.goal.z, '#ffd040');
    for (const a of s.party || []) rim(a.x, a.z, '#4aa8ff');
    // north on the rim
    { const a = view.angle(0, -1), x = size / 2 + Math.cos(a) * (R - 2), y = size / 2 + Math.sin(a) * (R - 2); g.font = '800 10px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(24,16,8,.9)'; g.strokeText('N', x, y); g.fillStyle = '#ffe9b0'; g.fillText('N', x, y); }
    g.restore();
  }

  // ---- the region map window ----
  const region = createRegionMap({ snapshot, paint, where, zoneName, area: () => Z.area, onWorld, world, yaw: () => CAM.yaw });

  function update(now) {
    const inGame = document.body.classList.contains('in-game');
    if (!inGame) return;
    const s = snapshot(); M.lastState = s;
    if (Z.grid && s.me) { const cells = markSeen(Z.grid, s.me.x, s.me.z, SEE); if (cells.length) { Z.fog.reveal(cells); Z.dirty = true; } }
    if (Z.dirty && now - Z.savedAt > 4000) flush();
    if (!M.hidden && now - M.last >= 80) { M.last = now; drawMini(s, now); }
    region.update(now);
  }
  return {
    enterArea, update,
    toggleRegion() { if (region.isOpen) region.close(); else region.open(); },
    openRegion: () => region.open(), closeRegion: () => region.close(),
    get regionOpen() { return region.isOpen; },
    forget: heroId => explored.forget(heroId),
    /** tests / game-eye: what the minimap shows right now */
    state() { const s = M.lastState || {}; return { hidden: M.hidden, zoom: M.zoom, size: M.size, area: Z.area?.id || null, fog: !!Z.grid, pins: M.pins.map(p => ({ kind: p.kind, name: p.name })), region: region.state() }; },
    /** tests: the minimap's screen point of a world point */
    screenOf(x, z) { if (!M.view) return null; const r = canvas.getBoundingClientRect(), [sx, sy] = M.view.toScreen(x, z); return { x: r.left + sx, y: r.top + sy }; },
    flush,
  };
}
