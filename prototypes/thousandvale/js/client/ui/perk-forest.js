// The perk forest graph (play-test P6): a canvas you drag to pan, wheel / pinch / buttons to zoom, click a node to
// take it, right-click (or long-press) a taken one to hand it back. Hover cards go through the shared tooltip
// (js/client/ui/tips.js, renderer 'perk'), so they can be read while a button is held. DOM + canvas only; what a
// node may do comes from talent-model.js (forestState / perkCheck / refundCheck).
//
//   const g = createPerkGraph(container, { describe: id => html, onTake: id => {}, onRefund: id => {} });
//   g.set(forest, stateMap, { arms })   // redraw with node states: taken | open | reach | locked
//   g.fit(); g.zoom(1.25); g.focus(id); g.destroy();

import { registerTip, refreshTip, hideTip, tipOpen } from './tips.js';
import { forestBounds, armSectors } from './talent-model.js';

const KIND_R = { hub: 13, minor: 7, major: 10, talent: 12, keystone: 16 };
const COL = { taken: '#f1d595', open: '#7fe08a', reach: '#c7b99b', locked: '#5c5246', staged: '#8fd0ff' };   // staged (T28): marked, not yet accepted

export function createPerkGraph(host, { describe, onTake, onRefund, unit = 64 } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'pf-wrap';
  const cv = document.createElement('canvas'); cv.className = 'pf-canvas'; cv.dataset.tipRender = 'perk';
  cv.setAttribute('aria-label', 'Perk forest — drag to move, wheel to zoom, click a glowing node to take it');
  wrap.appendChild(cv); host.appendChild(wrap);
  const g = cv.getContext('2d');
  const V = { x: 0, y: 0, s: 1, w: 1, h: 1 };          // view: world point at the centre, pixels per world unit
  let F = null, ST = new Map(), arms = [], rim = 12, hover = null, focusId = null, dirty = true, raf = 0, sectors = [], found = null, pulse = 0;
  const armColor = k => arms.find(a => a.key === k)?.color || '#b8a888';

  registerTip('perk', () => (hover ? describe?.(hover) : null));

  const toScreen = (x, y) => [(x - V.x) * V.s + V.w / 2, (y - V.y) * V.s + V.h / 2];
  const toWorld = (px, py) => [(px - V.w / 2) / V.s + V.x, (py - V.h / 2) / V.s + V.y];
  const radius = n => (KIND_R[n.kind] || 8) * Math.max(0.55, Math.min(1.5, V.s / unit));

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    V.w = Math.max(1, r.width); V.h = Math.max(1, r.height);
    cv.width = Math.round(V.w * dpr); cv.height = Math.round(V.h * dpr);
    cv.style.width = V.w + 'px'; cv.style.height = V.h + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }
  function fit() {
    if (!F) return;
    resize();
    const b = forestBounds(F), pad = 1.2;
    V.x = (b.minX + b.maxX) / 2; V.y = (b.minY + b.maxY) / 2;
    V.s = Math.min(V.w / (b.maxX - b.minX + pad * 2), V.h / (b.maxY - b.minY + pad * 2));
    dirty = true;
  }
  function zoom(f, px = V.w / 2, py = V.h / 2) {
    const [wx, wy] = toWorld(px, py);
    V.s = Math.max(8, Math.min(220, V.s * f));
    const [nx, ny] = toWorld(px, py);
    V.x += wx - nx; V.y += wy - ny; dirty = true;
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (!dirty || !F) return;
    dirty = false;
    g.clearRect(0, 0, V.w, V.h);
    // each arm's area (play-test 2 Q26): the sector its OWN nodes occupy (talent-model.js armSectors), so a branch that
    // grows sideways widens its arm's colour instead of sitting outside it
    const [cx, cy] = toScreen(0, 0);
    for (const sct of sectors) {
      const col = armColor(sct.key), R0 = Math.max(0, sct.r0) * V.s, R1 = sct.r1 * V.s;
      const grd = g.createRadialGradient(cx, cy, R0, cx, cy, R1);
      grd.addColorStop(0, hexA(col, 0.04)); grd.addColorStop(1, hexA(col, 0.13));
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R1, sct.a0, sct.a1); g.arc(cx, cy, R0, sct.a1, sct.a0, true); g.closePath(); g.fill();
      g.strokeStyle = hexA(col, 0.22); g.lineWidth = 1; g.stroke();
    }
    // links: a taken–taken edge is the path you walked (gold), taken–open is where you can go next (green)
    for (const [a, b] of F.links) {
      const A = F.byId.get(a), B = F.byId.get(b); if (!A || !B) continue;
      let sa = ST.get(a), sb = ST.get(b);
      const pend = sa === 'staged' || sb === 'staged';          // a path you have staged: blue and dashed until accepted
      if (sa === 'staged') sa = 'taken'; if (sb === 'staged') sb = 'taken';
      const [x1, y1] = toScreen(A.x, A.y), [x2, y2] = toScreen(B.x, B.y);
      if (Math.max(x1, x2) < -40 || Math.min(x1, x2) > V.w + 40 || Math.max(y1, y2) < -40 || Math.min(y1, y2) > V.h + 40) continue;
      g.strokeStyle = sa === 'taken' && sb === 'taken' ? 'rgba(241,213,149,0.95)' : (sa === 'taken' || sb === 'taken') && (sa === 'open' || sb === 'open') ? 'rgba(127,224,138,0.75)' : 'rgba(150,135,110,0.32)';
      g.lineWidth = sa === 'taken' && sb === 'taken' ? 3 : 1.6;
      if (pend && sa === 'taken' && sb === 'taken') { g.strokeStyle = 'rgba(143,208,255,0.95)'; g.setLineDash([7, 5]); }
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
    }
    // nodes (a search dims everything it did not find and rings what it did)
    const labels = V.s > unit * 1.15;
    if (found) { pulse = (pulse + 0.08) % (Math.PI * 2); dirty = true; }
    for (const n of F.nodes) {
      const [x, y] = toScreen(n.x, n.y), r = radius(n);
      if (x < -r - 4 || x > V.w + r + 4 || y < -r - 4 || y > V.h + r + 4) continue;
      const st = ST.get(n.id) || 'locked', ac = n.arm ? armColor(n.arm) : '#c9b98f';
      g.save();
      const hit = found && found.has(n.id);
      if (found && !hit) g.globalAlpha = 0.28;
      if (st === 'open') { g.shadowColor = '#7fe08a'; g.shadowBlur = 12; }
      if (st === 'taken') { g.shadowColor = '#f1d595'; g.shadowBlur = 10; }
      if (st === 'staged') { g.shadowColor = '#8fd0ff'; g.shadowBlur = 14; }
      g.beginPath();
      if (n.kind === 'keystone') poly(g, x, y, r, 8, Math.PI / 8);
      else if (n.kind === 'talent') poly(g, x, y, r, 6, 0);
      else if (n.kind === 'major') poly(g, x, y, r, 4, Math.PI / 4);
      else g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = st === 'taken' ? ac : st === 'locked' ? '#221d17' : st === 'staged' ? hexA(ac, 0.7) : hexA(ac, 0.35);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = n.id === hover ? 3 : st === 'open' ? 2.4 : st === 'staged' ? 3 : 1.6;
      g.strokeStyle = n.id === hover ? '#ffffff' : COL[st];
      if (st === 'staged') g.setLineDash([5, 3]);
      g.stroke(); g.setLineDash([]);
      if (st === 'staged') { g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2); g.strokeStyle = 'rgba(143,208,255,0.9)'; g.lineWidth = 1.5; g.stroke(); }
      if (n.id === focusId) { g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]); }
      if (hit) { g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r + 5 + Math.sin(pulse) * 2.5, 0, Math.PI * 2); g.strokeStyle = '#fff3c4'; g.lineWidth = 2.5; g.shadowColor = '#ffe08a'; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0; }
      g.restore();
      if (labels && (n.kind === 'keystone' || n.kind === 'talent' || n.kind === 'hub' || V.s > unit * 2.2 || (found && found.has(n.id)))) {
        g.font = `${n.kind === 'keystone' ? 600 : 500} ${n.kind === 'keystone' ? 13 : 11}px "Alegreya Sans", sans-serif`;
        g.textAlign = 'center'; g.fillStyle = st === 'locked' ? 'rgba(199,185,155,0.55)' : '#f3ead8';
        const t = shortName(n);
        g.fillText(t, x, y + r + 13);
      }
    }
    // arm names round the rim
    g.font = `600 ${Math.round(Math.max(9, Math.min(14, V.w / 50)))}px Cinzel, serif`; g.textAlign = 'center'; g.globalAlpha = V.w < 520 ? 0.75 : 1;
    for (const a of arms) {
      const sct = sectors.find(z => z.key === a.key);
      const ang = sct ? sct.mid : a.angle, rr = sct ? sct.r1 + 0.3 : rim + 0.9;
      if (ang == null) continue;
      const [x, y] = toScreen(Math.cos(ang) * rr, Math.sin(ang) * rr);
      if (y < 8 || y > V.h - 4) continue;
      const tw = g.measureText(a.name).width;
      g.fillStyle = hexA(a.color, 0.95); g.fillText(a.name, Math.max(tw / 2 + 6, Math.min(V.w - tw / 2 - 6, x)), Math.max(16, y));
    }
    g.globalAlpha = 1;
  }

  function nodeAt(px, py) {
    if (!F) return null;
    let best = null, bd = Infinity;
    for (const n of F.nodes) {
      const [x, y] = toScreen(n.x, n.y), d = Math.hypot(x - px, y - py), r = radius(n) + 5;
      if (d < r && d < bd) { bd = d; best = n.id; }
    }
    return best;
  }
  function setHover(id, ev) {
    if (id === hover) return;
    hover = id; dirty = true;
    cv.style.cursor = id ? (ST.get(id) === 'open' || ST.get(id) === 'staged' ? 'pointer' : 'help') : 'grab';
    if (!id) { hideTip(); return; }
    if (tipOpen()) refreshTip();
    else if (ev) cv.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }));
  }

  // ---- input: drag to pan, wheel/pinch to zoom, click to take, right-click / long-press to refund ----
  const pts = new Map(); let drag = null, pinch = null, press = 0;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y, moved: 0, button: e.button, id: nodeAt(e.offsetX, e.offsetY) };
    clearTimeout(press);
    if (e.pointerType === 'touch') press = setTimeout(() => { if (drag && drag.moved < 6 && drag.id && (ST.get(drag.id) === 'taken' || ST.get(drag.id) === 'staged')) { onRefund?.(drag.id); drag = null; } }, 650);
  });
  cv.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect();
      zoom(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      if (drag.moved > 5) { V.x = drag.vx - dx / V.s; V.y = drag.vy - dy / V.s; dirty = true; cv.style.cursor = 'grabbing'; }
      return;
    }
    setHover(nodeAt(e.offsetX, e.offsetY), e);
  });
  const end = e => {
    clearTimeout(press);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && drag.moved <= 5 && drag.id) {
      if (drag.button === 2) onRefund?.(drag.id);
      else onTake?.(drag.id);
      focusId = drag.id; dirty = true;
    }
    drag = null;
    cv.style.cursor = hover ? 'pointer' : 'grab';
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(wrap);
  draw();

  return {
    canvas: cv, view: V,
    set(forest, state, { arms: a } = {}) { const first = !F, isNew = F !== forest; F = forest; rim = Math.max(1, ...forest.nodes.map(n => Math.hypot(n.x, n.y))); ST = state || new Map(); if (a) arms = a; if (isNew) sectors = armSectors(forest); dirty = true; if (first) requestAnimationFrame(fit); },
    /** Q23: ring these node ids and dim the rest (null / [] = no search). Returns how many were found. */
    setSearch(ids) { found = ids && ids.length ? new Set(ids) : null; dirty = true; return found ? found.size : 0; },
    /** Zoom so every one of these nodes is on screen. */
    fitIds(ids) {
      const ns = (ids || []).map(id => F?.byId.get(id)).filter(Boolean); if (!ns.length) return;
      resize();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of ns) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
      const pad = 1.6;
      V.x = (minX + maxX) / 2; V.y = (minY + maxY) / 2;
      V.s = Math.max(8, Math.min(unit * 2.4, Math.min(V.w / (maxX - minX + pad * 2), V.h / (maxY - minY + pad * 2))));
      if (ns.length === 1) focusId = ns[0].id;
      dirty = true;
    },
    get sectors() { return sectors; },
    fit, zoom: f => zoom(f),
    focus(id) { const n = F?.byId.get(id); if (!n) return; V.x = n.x; V.y = n.y; V.s = Math.max(V.s, unit * 1.3); focusId = id; dirty = true; },
    redraw() { dirty = true; },
    /** Screen position of a node (tests click real nodes). */
    screenOf(id) { const n = F?.byId.get(id); if (!n) return null; const [x, y] = toScreen(n.x, n.y); return { x, y }; },
    get hover() { return hover; },
    destroy() { cancelAnimationFrame(raf); ro?.disconnect(); wrap.remove(); },
  };
}

function poly(g, x, y, r, n, rot) { for (let i = 0; i <= n; i++) { const a = rot + i / n * Math.PI * 2; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); }
function hexA(hex, a) {
  const h = String(hex || '#999999').replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
function shortName(n) { const t = String(n.name || n.id); return t.length > 26 ? t.slice(0, 25) + '…' : t; }
