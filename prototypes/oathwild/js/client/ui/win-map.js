// The world map: Brightwater Vale and Thornmere Wilds painted from the terrain's own ground (biomes, water, roads),
// with the places your world has found (named), the ones it has not (faded), shrines (bright once found; travel from
// here while you stand at one), camps (cleared or not), where your active quests point, and you and your party.
// North (−z) is up. Pan by dragging (or the right stick), zoom with the wheel, a pinch, the buttons or the triggers;
// press a place for its details. The drawing and every clickable spot share ONE scaled box (lessons rule 69), so a
// spot always sits on the thing it names at any window size or zoom.
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { shrineName } from './win-services.js';
import { myLog } from './win-quests.js';
import { BIOMES } from '../../world/terrain.js';
import { fmt } from '../../../../../shared/format.js';

const PAINT = {
  meadow: [138, 178, 96], wildgrass: [112, 152, 82], forest: [70, 112, 62], field: [214, 190, 116], village: [190, 164, 124],
  road: [204, 176, 128], trail: [186, 158, 112], boardwalk: [150, 112, 72], water: [84, 140, 186], shore: [206, 194, 150],
  marsh: [102, 128, 92], rock: [150, 142, 130],
};
const PX = 2;                       // map pixels per biome cell
let baked = null;                   // the painted ground, made once per page
const REGION = { brightwater_vale: 'Brightwater Vale', thornmere_wilds: 'Thornmere Wilds' };
const KIND = { town: 'Town', landmark: 'Landmark', camp: 'Camp', shrine: 'Shrine', pass: 'Pass' };

function bake(T) {
  if (baked) return baked;
  const B = T.biomeGrid;
  const c = document.createElement('canvas'); c.width = B.nx * PX; c.height = B.nz * PX;
  const x = c.getContext('2d');
  const img = x.createImageData(B.nx, B.nz);
  for (let k = 0; k < B.nz; k++) for (let i = 0; i < B.nx; i++) {
    const b = BIOMES[B.ids[k * B.nx + i]];
    const col = PAINT[b] || PAINT.meadow;
    // a little light from the north-west: the slope shades the paint so hills read
    const wx = B.minX + (i + 0.5) * B.cell, wz = B.minZ + (k + 0.5) * B.cell;
    const h0 = T.heightAt(wx, wz), h1 = T.heightAt(wx - B.cell, wz - B.cell);
    const shade = Math.max(0.78, Math.min(1.18, 1 + (h0 - h1) * 0.06));
    const o = (k * B.nx + i) * 4;
    img.data[o] = col[0] * shade; img.data[o + 1] = col[1] * shade; img.data[o + 2] = col[2] * shade; img.data[o + 3] = 255;
  }
  const small = document.createElement('canvas'); small.width = B.nx; small.height = B.nz;
  small.getContext('2d').putImageData(img, 0, 0);
  x.imageSmoothingEnabled = true; x.drawImage(small, 0, 0, c.width, c.height);
  // roads on top, as thin warm lines
  const toPx = (wx, wz) => [(wx - B.minX) / B.cell * PX, (wz - B.minZ) / B.cell * PX];
  for (const r of T.roads) {
    x.strokeStyle = r.class === 'road' ? 'rgba(120,88,52,.85)' : r.class === 'boardwalk' ? 'rgba(96,66,40,.9)' : 'rgba(132,100,66,.7)';
    x.lineWidth = r.class === 'road' ? 2.2 : 1.4; x.lineJoin = 'round';
    x.beginPath(); r.pts.forEach((p, n) => { const [px, pz] = toPx(p.x, p.z); if (n) x.lineTo(px, pz); else x.moveTo(px, pz); }); x.stroke();
  }
  // a soft frame darkening the mountains at the edge
  const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,28,14,.45)');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  baked = { canvas: c, w: c.width, h: c.height, toPx };
  return baked;
}

export function open(app, opts = {}) {
  const T = app.W.terrain;
  const B = bake(T);
  const view = { z: 0, x: 0, y: 0, fitted: false };           // stage translate (px) and scale
  const w = openWin({
    id: 'map', title: 'Map', sub: 'Brightwater Vale and Thornmere Wilds', size: 'wide', cls: 'ow-map',
    render(body, tab, win) {
      win.data.sel = win.data.sel || null;
      const marks = markers(app, B);
      win.data.marks = marks;
      const sel = marks.find(m => m.key === win.data.sel) || null;
      body.innerHTML = `<div class="ow-map-wrap">
        <div class="ow-map-view" data-mapview>
          <div class="ow-map-stage" data-stage>
            <div class="ow-map-paint" data-paint></div>
            ${marks.map(m => `<button type="button" class="ow-map-mark ow-map-${m.type}${m.found === false ? ' ow-map-unfound' : ''}${sel?.key === m.key ? ' ow-map-on' : ''}" data-mark="${esc(m.key)}" style="left:${m.px}px;top:${m.py}px" aria-label="${esc(m.label)}"><span class="ow-map-pin">${m.icon}</span>${m.showName ? `<span class="ow-map-label">${esc(m.label)}</span>` : ''}</button>`).join('')}
          </div>
          <div class="ow-map-zoom"><button type="button" class="ow-btn ow-small" data-zoom="1" aria-label="Zoom in">${glyph('plus', 18)}</button><button type="button" class="ow-btn ow-small" data-zoom="-1" aria-label="Zoom out">${glyph('minus', 18)}</button><button type="button" class="ow-btn ow-small" data-zoom="0" aria-label="Show me">${glyph('eye', 18)}</button></div>
          <div class="ow-map-north">N</div>
        </div>
        <aside class="ow-map-side">${sel ? details(app, sel) : legend(app)}</aside>
      </div>`;
      body.querySelector('[data-paint]').append(B.canvas);
      const vp = body.querySelector('[data-mapview]'), stage = body.querySelector('[data-stage]');
      stage.style.width = `${B.w}px`; stage.style.height = `${B.h}px`;
      win.data.apply = () => {
        stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
        stage.style.setProperty('--inv', String(1 / view.z));
        declutter();
      };
      // labels keep their size while the map zooms, so zoomed out they pile up: show them by importance and hide any
      // that would land on one already shown (the pin stays; tapping it still names the place)
      const PRIO = { town: 0, party: 1, quest: 2, shrine: 3, camp: 4, place: 5 };
      const labels = [...stage.querySelectorAll('.ow-map-label')].map(el => ({ el, p: PRIO[[...el.parentElement.classList].find(c => c.startsWith('ow-map-') && c !== 'ow-map-mark' && c !== 'ow-map-on' && c !== 'ow-map-unfound')?.slice(7)] ?? 6 }))
        .sort((a, b) => a.p - b.p);
      const declutter = () => {
        const shown = [];
        for (const L of labels) {
          L.el.style.visibility = '';
          const r = L.el.getBoundingClientRect();
          const hit = shown.some(o => r.left < o.right + 4 && r.right > o.left - 4 && r.top < o.bottom + 2 && r.bottom > o.top - 2);
          if (hit) L.el.style.visibility = 'hidden'; else shown.push(r);
        }
      };
      const fit = () => {
        const r = vp.getBoundingClientRect();
        const z = Math.min(r.width / B.w, r.height / B.h) || 1;
        view.z = z; view.x = (r.width - B.w * z) / 2; view.y = (r.height - B.h * z) / 2;
      };
      const centre = (px, py, z) => { const r = vp.getBoundingClientRect(); view.z = z; view.x = r.width / 2 - px * z; view.y = r.height / 2 - py * z; };
      if (!view.fitted) {
        view.fitted = true;
        requestAnimationFrame(() => {
          fit();
          if (opts.focus) { const [px, py] = B.toPx(opts.focus[0], opts.focus[1]); centre(px, py, view.z * 2.6); }
          win.data.apply();
        });
      }
      win.data.apply();
      const zoomAt = (k, cx, cy) => {
        const r = vp.getBoundingClientRect();
        const ox = cx ?? r.width / 2, oy = cy ?? r.height / 2;
        const nz = Math.max(0.4, Math.min(8, view.z * k));
        view.x = ox - (ox - view.x) * (nz / view.z); view.y = oy - (oy - view.y) * (nz / view.z); view.z = nz;
        win.data.apply();
      };
      body.querySelectorAll('[data-zoom]').forEach(b => {
        b.onclick = () => {
          const d = +b.dataset.zoom;
          if (d) return zoomAt(d > 0 ? 1.4 : 1 / 1.4);
          const me = marks.find(m => m.type === 'me');
          if (me) { centre(me.px, me.py, Math.max(view.z, 2.5)); win.data.apply(); }
        };
      });
      vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      // drag to pan, two fingers to pinch
      const ptrs = new Map(); let moved = 0, pinch = null;
      vp.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; } });
      vp.addEventListener('pointermove', e => {
        const p = ptrs.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = vp.getBoundingClientRect(); zoomAt(d / (pinch.d || d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d; return; }
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) { try { vp.setPointerCapture?.(e.pointerId); } catch { /* the pointer already lifted */ } view.x += dx; view.y += dy; win.data.apply(); }
      });
      const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
      vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
      body.querySelectorAll('[data-mark]').forEach(b => { b.onclick = () => { if (moved > 6) return; win.data.sel = b.dataset.mark; win.render(); }; });
      body.querySelector('[data-travel]')?.addEventListener('click', e => { app.act('travel', { shrine: e.currentTarget.dataset.travel }); win.close(); });
      body.querySelector('[data-unsel]')?.addEventListener('click', () => { win.data.sel = null; win.render(); });
    },
    onClose() { cancelAnimationFrame(raf); },
  });
  // the controller: right stick pans, triggers zoom (the left stick and d-pad walk the buttons)
  let raf = 0, last = performance.now();
  const padLoop = t => {
    raf = requestAnimationFrame(padLoop);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (!pad || !w.open || !w.data.apply) return;
    const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0, zi = pad.buttons[7]?.value || 0, zo = pad.buttons[6]?.value || 0;
    let any = false;
    if (Math.hypot(rx, ry) > 0.15) { view.x -= rx * 600 * dt; view.y -= ry * 600 * dt; any = true; }
    if (zi > 0.1 || zo > 0.1) { const k = 1 + (zi - zo) * 1.6 * dt; view.z = Math.max(0.4, Math.min(8, view.z * k)); any = true; }
    if (any) w.data.apply();
  };
  raf = requestAnimationFrame(padLoop);
  // the party moves: redraw their dots now and then while the map is open
  const tick = setInterval(() => { if (!w.open) { clearInterval(tick); return; } const vp = w.body?.querySelector('[data-stage]'); if (!vp) return; for (const m of markers(app, B).filter(m => m.type === 'me' || m.type === 'party')) { const el = vp.querySelector(`[data-mark="${CSS.escape(m.key)}"]`); if (el) { el.style.left = `${m.px}px`; el.style.top = `${m.py}px`; } } }, 500);
  // redraw only when what the map shows changed (an escort walking sends the world state every half second)
  const sig = () => JSON.stringify([app.ws?.found, app.ws?.shrines, app.ws?.quests && Object.entries(app.ws.quests).map(([k, q]) => [k, q.step, q.done]), app.me?.home, app.settings.tracked]);
  let last0 = sig();
  const off = app.on('wstate', () => { if (!w.open) { off(); return; } const s = sig(); if (s !== last0) { last0 = s; w.render(); } });
  return w;
}

/** Every spot on the map, in map pixels. */
function markers(app, B) {
  const T = app.W.terrain, P = app.W.data.placements;
  const found = new Set(app.ws?.found || []), shrines = new Set(app.ws?.shrines || []);
  const out = [];
  const at = (x, z) => B.toPx(x, z);
  for (const [id, p] of Object.entries(T.places)) {
    if (!p?.at || p.kind === 'shrine') continue;
    const [px, py] = at(p.at[0], p.at[1]);
    const f = found.has(id);
    const camp = p.kind === 'camp' ? campState(app, id) : null;
    out.push({ key: 'place:' + id, type: p.kind === 'town' ? 'town' : p.kind === 'camp' ? 'camp' : 'place', id, px, py, x: p.at[0], z: p.at[1], found: f, label: f ? p.name : 'Not found yet', name: p.name, place: p, camp, showName: f && (p.kind === 'town' || p.kind === 'camp' || p.radius >= 20), icon: glyph(p.kind === 'town' ? 'door' : p.kind === 'camp' ? (camp === 'cleared' ? 'check' : 'sword') : 'star', 16) });
  }
  for (const s of P.shrines || []) {
    const [px, py] = at(s.at[0], s.at[1]);
    const f = shrines.has(s.id);
    out.push({ key: 'shrine:' + s.id, type: 'shrine', id: s.id, px, py, x: s.at[0], z: s.at[1], found: f, label: f ? s.name : 'A shrine not found yet', name: s.name, showName: f, icon: glyph('shrine', 16) });
  }
  const log = myLog(app);
  for (const q of [...log.active, ...log.ready]) {
    if (!q.marker?.at) continue;
    const tracked = (app.settings.tracked || []).includes(q.id);
    const [px, py] = at(q.marker.at[0], q.marker.at[1]);
    out.push({ key: 'quest:' + q.id, type: 'quest', id: q.id, px, py, x: q.marker.at[0], z: q.marker.at[1], label: `${q.title}: ${q.marker.label}`, quest: q, showName: tracked, icon: glyph('scroll', 16) });
  }
  for (const p of app.play?.positions?.() || []) {
    const [px, py] = at(p.x, p.z);
    out.push({ key: (p.me ? 'me:' : 'party:') + p.id, type: p.me ? 'me' : 'party', id: p.id, px, py, x: p.x, z: p.z, label: p.me ? 'You' : p.name, showName: !p.me, icon: glyph(p.me ? 'level' : 'people', 16) });
  }
  return out;
}

function campState(app, id) {
  const st = app.ws?.camps?.[id];
  if (!st) return 'held';
  let respawn = 20;
  for (const r of Object.values(app.rules.data.regions.regions)) if (r.camps?.[id]) respawn = r.camps[id].respawnMinutes ?? 20;
  return (app.ws.time ?? 0) - st.clearedAt < respawn * 60 ? 'cleared' : 'held';
}

function myPos(app) { return app.play?.positions?.()?.find(p => p.me) || null; }
function details(app, m) {
  const T = app.W.terrain;
  const me = myPos(app);
  const d = me ? Math.round(Math.hypot(m.x - me.x, m.z - me.z)) : null;
  const band = T.levelBandAt(m.x, m.z);
  const region = REGION[T.regionAt(m.x, m.z)] || '';
  let h = `<div class="ow-map-det"><h3>${esc(m.found === false ? 'Not found yet' : m.name || m.label)}</h3><p class="ow-dim">${esc(m.type === 'shrine' ? 'Shrine' : m.place ? KIND[m.place.kind] || 'Place' : m.type === 'quest' ? 'Quest' : m.type === 'me' ? 'You' : 'Party')} · ${esc(region)}</p>`;
  if (m.type !== 'me' && m.type !== 'party') h += `<p>Monsters here: level ${fmt(band[0])}–${fmt(band[1])}</p>`;
  if (d != null && m.type !== 'me') h += `<p>${fmt(d)} m from you</p>`;
  if (m.camp) h += `<p class="${m.camp === 'cleared' ? 'ow-good' : 'ow-bad'}">${m.camp === 'cleared' ? 'Cleared for now' : 'Held by its owners'}</p>`;
  if (m.quest) h += `<p><b>${esc(m.quest.title)}</b></p><p>${esc(m.quest.steps.find(s => s.current)?.text || m.quest.marker?.label || '')}${m.quest.progress ? ` (${esc(m.quest.progress)})` : ''}</p>`;
  if (m.type === 'shrine') {
    if (m.found) {
      const here = me && (app.W.data.placements.shrines || []).some(s => Math.hypot(s.at[0] - me.x, s.at[1] - me.z) < 12);
      const atThis = me && Math.hypot(m.x - me.x, m.z - me.z) < 12;
      if (app.me?.home === m.id) h += '<p class="ow-good">You wake here after a fall.</p>';
      if (here && !atThis) h += `<button type="button" class="ow-btn ow-primary" data-travel="${esc(m.id)}" data-primary>${glyph('shrine', 18)}<span>Travel here</span></button>`;
      else if (!here) h += '<p class="ow-dim">Travel starts at any shrine your world has found.</p>';
    } else h += '<p class="ow-dim">Find it on foot and everyone in this world can travel to it.</p>';
  }
  h += `<button type="button" class="ow-btn ow-ghost ow-small" data-unsel>${glyph('back', 16)}<span>Back to the key</span></button></div>`;
  return h;
}
function legend(app) {
  const n = (app.ws?.shrines || []).length;
  return `<div class="ow-map-det"><h3>Key</h3><ul class="ow-map-key">
    <li><span class="ow-map-pin ow-map-me">${glyph('level', 14)}</span>You</li>
    <li><span class="ow-map-pin ow-map-party">${glyph('people', 14)}</span>Your party</li>
    <li><span class="ow-map-pin ow-map-quest">${glyph('scroll', 14)}</span>Where a quest points</li>
    <li><span class="ow-map-pin ow-map-shrine">${glyph('shrine', 14)}</span>Shrine (${fmt(n)} found)</li>
    <li><span class="ow-map-pin ow-map-camp">${glyph('sword', 14)}</span>Camp</li>
    <li><span class="ow-map-pin ow-map-town">${glyph('door', 14)}</span>Town</li>
  </ul><p class="ow-dim">Home shrine: ${esc(shrineName(app, app.me?.home))}</p></div>`;
}
