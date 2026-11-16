// The region map (M): the whole current zone in a big window — what you have explored, you, your party, every way out
// with the name of where it leads, dungeon entrances, waypoints, portals, your own portal, quest spots and the guide's
// next goal. Drag / wheel / pinch to pan and zoom; on a controller the right stick pans and LB / RB zoom while the d-pad
// walks the place list (padnav.js; pressing a place centres the map on it). M or Esc closes; the World map tab (or Tab)
// switches to the waypoint map in travel-ui.js. js/client/maps.js gives it the shared picture and pins.
import { mapView, fitScale, clampCentre, levelText, PLACE_ORDER, nearestPin } from './map-core.js';
import { uiIcon } from './icons.js';
import { isTouch } from './touch.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUPS = [['quest', 'Quests'], ['ways', 'Ways on'], ['waypoint', 'Waypoint'], ['npc', 'People']];
const groupOf = p => p.kind === 'quest' || p.kind === 'goal' ? 'quest' : p.kind === 'npc' ? 'npc' : p.kind === 'waypoint' ? 'waypoint' : 'ways';
const DOT = { exit: '#3e9a4a', entrance: '#5a3a22', portal: '#6a4ad8', waypoint: '#2f7ad8', npc: '#e8b64a', quest: '#ffd040', recall: '#3a7aff', goal: '#ffd040' };

export function createRegionMap({ snapshot, paint, where, area, onWorld, world, yaw }) {
  let el = null, canvas = null, g = null, card = null, ro = null;
  const V = { cx: 0, cz: 0, scale: 1, fit: 1, w: 0, h: 0, dpr: 1, hot: null, pins: [], last: 0, follow: false };
  const pointers = new Map(); let drag = null, pinch = null, moved = 0;
  const pad = { prev: {} };

  function open() {
    if (el?.isConnected) return;
    const a = area(); if (!a?.bounds) return;
    el = document.createElement('div'); el.className = 'modal rmap';
    el.innerHTML = `<div class="rm-panel" role="dialog" aria-label="Region map">
      <header class="rm-top">
        <div class="rm-tabs"><button class="on" data-tab="region">This area${isTouch() ? '' : ' <kbd>M</kbd>'}</button><button data-tab="world">World map${isTouch() ? '' : ' <kbd>Tab</kbd>'}</button></div>
        <h2><span class="rm-name"></span> <small class="rm-lv"></small></h2>
        <button class="rm-x" data-close aria-label="Close the map">${uiIcon('close', 22)}</button>
      </header>
      <div class="rm-body">
        <div class="rm-view"><canvas></canvas><div class="rm-card" hidden></div>
          <div class="rm-zoom"><button data-z="1" aria-label="Zoom in">+</button><button data-z="-1" aria-label="Zoom out">−</button><button data-me aria-label="Centre on you">${uiIcon('locate', 20)}</button><button data-all aria-label="Show the whole area">${uiIcon('map', 20)}</button></div>
        </div>
        <aside class="rm-list"></aside>
      </div></div>`;
    document.body.append(el);
    canvas = el.querySelector('canvas'); g = canvas.getContext('2d'); card = el.querySelector('.rm-card');
    el.querySelector('.rm-name').textContent = a.name || '';
    el.querySelector('.rm-lv').textContent = a.zone?.town ? 'Town' : levelText(a.levels);
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t && e.target === el) return close();
      if (!t) return;
      if (t.dataset.close != null) return close();
      if (t.dataset.tab === 'world') { close(); onWorld(); return; }
      if (t.dataset.z) return zoomBy(t.dataset.z === '1' ? 1.4 : 1 / 1.4);
      if (t.dataset.me != null) { const s = snapshot(); if (s.me) { V.cx = s.me.x; V.cz = s.me.z; V.scale = Math.max(V.scale, V.fit * 2.2); clamp(); } return; }
      if (t.dataset.all != null) return fitAll();
      if (t.dataset.place) { const p = V.places?.find(x => x.id === t.dataset.place); if (p) focusPlace(p); }
    });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) card.hidden = true; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    ro = new ResizeObserver(() => size()); ro.observe(el.querySelector('.rm-view'));
    size(); fitAll(); list();
    // focus the first useful thing for a controller (rule 27): the first place in the list, not Close
    requestAnimationFrame(() => el?.querySelector('.rm-list button')?.focus({ preventScroll: true }));
  }
  function close() { ro?.disconnect(); ro = null; el?.remove(); el = null; pointers.clear(); drag = pinch = null; }
  function size() {
    if (!el) return;
    const box = el.querySelector('.rm-view').getBoundingClientRect();
    V.w = Math.max(1, Math.round(box.width)); V.h = Math.max(1, Math.round(box.height)); V.dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(V.w * V.dpr); canvas.height = Math.round(V.h * V.dpr);
    const b = area()?.bounds; if (b) { const old = V.fit; V.fit = fitScale(rot(b), V.w, V.h, 18); if (old && V.scale) V.scale = Math.max(V.fit * 0.8, V.scale); }
    V.last = 0;
  }
  // a turned camera turns the zone too: fit the rotated box (yaw 0 today, so this is the bounds as they are)
  const rot = b => { const y = yaw(); if (!y) return b; const w = b.x1 - b.x0, d = b.z1 - b.z0, c = Math.abs(Math.cos(y)), s = Math.abs(Math.sin(y)); return { x0: 0, z0: 0, x1: w * c + d * s, z1: w * s + d * c }; };
  function fitAll() { const b = area()?.bounds; if (!b) return; V.cx = (b.x0 + b.x1) / 2; V.cz = (b.z0 + b.z1) / 2; V.scale = V.fit; V.last = 0; }
  function clamp() { const b = area()?.bounds; if (b) [V.cx, V.cz] = clampCentre(b, V.cx, V.cz); V.last = 0; }
  function zoomBy(f, sx = V.w / 2, sy = V.h / 2) {
    const v = view(), [wx, wz] = v.toWorld(sx, sy);
    V.scale = Math.max(V.fit * 0.8, Math.min(9, V.scale * f));
    const v2 = view(), [nx, nz] = v2.toWorld(sx, sy);
    V.cx += wx - nx; V.cz += wz - nz; clamp();
  }
  const view = () => mapView({ cx: V.cx, cz: V.cz, scale: V.scale, w: V.w, h: V.h, yaw: yaw() });
  function focusPlace(p) { V.cx = p.x; V.cz = p.z; V.scale = Math.max(V.scale, V.fit * 2); clamp(); V.hot = p.id; draw(performance.now()); showCard(p); }
  // ---- pointer: drag pans, two fingers pinch, a tap shows what is under it ----
  function down(e) {
    if (e.pointerType === 'touch' && pointers.size && ![...pointers.values()].some(p => p.type === 'touch')) pointers.clear();
    if (e.pointerType === 'touch' && e.isPrimary) pointers.clear();          // iOS can skip pointerup: start clean (rule 30)
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    moved = 0;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: V.scale }; drag = null; }
  }
  function move(e) {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = canvas.getBoundingClientRect();
      const f = (pinch.scale * d / Math.max(1, pinch.d)) / V.scale; zoomBy(f, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); moved += 10; return;
    }
    if (drag && p) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); drag = { x: e.clientX, y: e.clientY };
      const v = view(), [ax, az] = v.toWorld(0, 0), [bx, bz] = v.toWorld(dx, dy); V.cx -= bx - ax; V.cz -= bz - az; clamp(); card.hidden = true; return;
    }
    if (e.pointerType === 'mouse') hover(e);
  }
  function up(e) {
    const was = pointers.has(e.pointerId); pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) { const [q] = pointers.values(); drag = { x: q.x, y: q.y }; } else if (!pointers.size) drag = null;
    if (was && !pointers.size && moved < 6) hover(e, true);
  }
  function hover(e, tap = false) {
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const hit = nearestPin(V.pins, view(), sx, sy, tap && e.pointerType !== 'mouse' ? 18 : 11);
    if (!hit) { card.hidden = true; if (tap) { V.hot = null; V.last = 0; } return; }
    if (tap) { V.hot = hit.id || null; V.last = 0; }
    showCard(hit);
  }
  function showCard(p) {
    const s = snapshot(), v = view(), [x, y] = v.toScreen(p.x, p.z);
    card.innerHTML = `<b>${esc(p.name)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}${p.kind !== 'me' && s.me ? `<span>${esc(where(s.me, p))}</span>` : ''}`;
    card.hidden = false;
    // beside the pin, flipped to stay inside the map (never on top of the pin)
    const cw = card.offsetWidth, chh = card.offsetHeight;
    let left = x + 14, top = y - chh / 2;
    if (left + cw > V.w - 6) left = x - 14 - cw;
    top = Math.max(6, Math.min(V.h - chh - 6, top));
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(top) + 'px';
  }
  // ---- the list of places beside the map ----
  function list() {
    if (!el) return;
    const s = snapshot(), me = s.me;
    const places = [...s.places];
    if (s.goal && s.goal.x != null && !places.some(p => Math.hypot(p.x - s.goal.x, p.z - s.goal.z) < 1 && p.kind !== 'npc')) places.push({ id: 'goal', kind: 'goal', x: s.goal.x, z: s.goal.z, name: s.goal.label || 'Your next goal', sub: 'Next goal' });
    places.sort((a, b) => (PLACE_ORDER[a.kind] ?? (a.kind === 'goal' ? -1 : 9)) - (PLACE_ORDER[b.kind] ?? (b.kind === 'goal' ? -1 : 9)) || (me ? Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z) : 0));
    V.places = places;
    const html = GROUPS.map(([gk, title]) => {
      const rows = places.filter(p => groupOf(p) === gk); if (!rows.length) return '';
      return `<h3>${title}</h3>${rows.map(p => `<button data-place="${esc(p.id)}" class="rm-row${V.hot === p.id ? ' on' : ''}"><i class="rm-dot k-${p.kind}" style="--c:${DOT[p.kind] || '#999'}"></i><span class="rm-t"><b>${esc(p.name)}</b><small>${esc(p.sub || '')}</small></span><em class="rm-d" data-d="${esc(p.id)}">${esc(me ? where(me, p) : '')}</em></button>`).join('')}`;
    }).join('');
    const L = el.querySelector('.rm-list'), keep = L.scrollTop;
    L.innerHTML = html || '<p class="rm-none">Nothing marked here yet.</p>';
    L.scrollTop = keep;                                       // the list keeps its place when it redraws (rule 12)
  }
  /** distances in the list follow you as you walk (text only: the rows are not rebuilt, so the pad focus stays) */
  function refreshDistances(s) {
    if (!s.me) return;
    for (const em of el.querySelectorAll('.rm-d')) { const p = V.places?.find(x => x.id === em.dataset.d); if (p) { const t = where(s.me, p); if (em.textContent !== t) em.textContent = t; } }
  }
  function draw(now) {
    if (!el || !g) return;
    const s = snapshot(), v = view();
    g.save();
    V.pins = paint(g, v, s, { k: 1.35, dpr: V.dpr, now, hot: V.hot, labels: true, foeRange: 30 });
    g.restore();
    return s;
  }
  // controller: right stick pans, LB / RB zoom (padnav owns the d-pad, left stick, A and B)
  function padStep(dt) {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!gp) return;
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.hypot(rx, ry) > 0.2) { const v = view(), sp = 420 * dt, [ax, az] = v.toWorld(0, 0), [bx, bz] = v.toWorld(rx * sp, ry * sp); V.cx += bx - ax; V.cz += bz - az; clamp(); }
    const lb = !!gp.buttons[4]?.pressed, rb = !!gp.buttons[5]?.pressed;
    if (lb && !pad.prev.lb) zoomBy(1 / 1.4); if (rb && !pad.prev.rb) zoomBy(1.4);
    pad.prev = { lb, rb };
  }
  let lastT = 0, listT = 0;
  function update(now) {
    if (el && !el.isConnected) { close(); return; }               // padnav's B removes the top .modal itself
    if (!el) return;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
    padStep(dt);
    if (now - V.last >= 33) { V.last = now; const s = draw(now); if (now - listT > 500) { listT = now; refreshDistances(s); } }
  }
  // keys while the window is open (the game's own key handler stands aside while a .modal is up)
  addEventListener('keydown', e => {
    if (e.target?.tagName === 'INPUT') return;
    // the world map's window (travel-ui.js) shares the keys: M closes it, Tab comes back here
    if (!el?.isConnected && world.isOpen()) {
      if (e.code === 'KeyM') { e.preventDefault(); e.stopImmediatePropagation(); world.close(); }
      else if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); world.close(); open(); }
      return;
    }
    if (!el?.isConnected) return;
    if (e.code === 'KeyM' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.code === 'Tab') { e.preventDefault(); close(); onWorld(); return; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(1.4);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1 / 1.4);
  }, true);
  return {
    open, close, update,
    enterArea() { if (el) { close(); open(); } },
    get isOpen() { return !!el?.isConnected; },
    state: () => el ? { open: true, scale: +V.scale.toFixed(3), fit: +V.fit.toFixed(3), cx: Math.round(V.cx), cz: Math.round(V.cz), places: (V.places || []).map(p => ({ kind: p.kind, name: p.name })), pins: V.pins.map(p => p.kind) } : { open: false },
  };
}
