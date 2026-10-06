// The minimap (play-test P13/P27): a round map in the top-right corner, north-up or turning with you, with the
// places, waystones, quest goals, live events, party and pins around you, and an ARROW on the rim (with the
// distance) for the tracked quest, live events and party members that are off the edge. In a dungeon it draws the
// dungeon floor from the room's tiles. Click it to open the big map; the wheel zooms it.

import { h } from '../ui-panel.js';
import { makeView, rimPoint, hitTest, distText, compass, bandText, bandTone } from './map-data.js';
import { drawMap, drawDungeon, label } from './map-render.js';
import { esc } from './tips.js';

const SIZE = 184;
export const MINI_ZOOMS = [0.35, 0.6, 1.0, 1.7, 2.8];            // px per metre outdoors (0.6 ≈ 150 m radius)

export function createMinimap({ atlas, me, onOpenMap, store }) {
  const root = h('div.minimap', { role: 'img', 'aria-label': 'Minimap' });
  const canvas = h('canvas.mm-canvas', { title: 'Minimap — click for the map (M), wheel to zoom' });
  const ring = h('div.mm-ring');
  const zone = h('div.mm-zone');
  const card = h('div.tipbox.mm-card', { hidden: true });
  const S = { zoom: store?.get('mm.zoom', 1) ?? 1, rotate: !!store?.get('mm.rotate', false), last: 0, markers: [], view: null };
  const btns = h('div.mm-btns',
    {}, h('button.ghost', { type: 'button', title: 'Zoom in', 'aria-label': 'Zoom the minimap in', onclick: e => { e.stopPropagation(); setZoom(S.zoom + 1); } }, '+'),
    h('button.ghost', { type: 'button', title: 'Zoom out', 'aria-label': 'Zoom the minimap out', onclick: e => { e.stopPropagation(); setZoom(S.zoom - 1); } }, '−'),
    h('button.ghost.mm-rot', { type: 'button', title: 'North up / turn with me', 'aria-label': 'Toggle minimap rotation', onclick: e => { e.stopPropagation(); S.rotate = !S.rotate; store?.set('mm.rotate', S.rotate); paintRotBtn(); } }, 'N'),
    h('button.ghost', { type: 'button', title: 'Open the map (M)', 'aria-label': 'Open the map', onclick: e => { e.stopPropagation(); onOpenMap?.(); } }, '⛶'));
  root.append(canvas, ring, btns, zone, card);
  (document.getElementById('hud') || document.body).appendChild(root);
  const paintRotBtn = () => { const b = btns.querySelector('.mm-rot'); b.textContent = S.rotate ? '⟳' : 'N'; b.classList.toggle('on', S.rotate); };
  paintRotBtn();
  function setZoom(z) { S.zoom = Math.max(0, Math.min(MINI_ZOOMS.length - 1, z)); store?.set('mm.zoom', S.zoom); }

  const d = Math.min(2, devicePixelRatio || 1);
  canvas.width = SIZE * d; canvas.height = SIZE * d;
  const g = canvas.getContext('2d'); g.__dpr = d;

  canvas.addEventListener('click', () => onOpenMap?.());
  canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(S.zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  canvas.addEventListener('pointermove', e => {
    if (!S.view) return;
    const r = canvas.getBoundingClientRect(), k = SIZE / Math.max(1, r.width), sx = (e.clientX - r.left) * k, sy = (e.clientY - r.top) * k;
    const hit = hitTest(S.markers, sx, sy, S.view, 9).find(m => m.kind !== 'me');
    const arrow = S.arrows?.find(a => Math.hypot(a.x - sx, a.y - sy) < 11);
    const m = hit || arrow?.m;
    if (!m) { card.hidden = true; return; }
    const p = me();
    const dist = p ? `${distText(Math.hypot(m.x - p.x, m.z - p.z))} ${compass(m.x - p.x, m.z - p.z)}` : '';
    card.innerHTML = `<div class="tip-title">${esc(m.name)}</div>${m.sub ? `<div class="tip-sub">${esc(m.sub)}</div>` : ''}${dist ? `<div>${esc(dist)}</div>` : ''}`;
    card.hidden = false; card.classList.add('show');
    card.style.left = (sx / k - card.offsetWidth - 14) + 'px'; card.style.top = (sy / k + 10) + 'px';
  });
  canvas.addEventListener('pointerleave', () => { card.hidden = true; });

  /** Draw at ~12 fps (and on demand); cheap enough to leave on. */
  function update(force = false) {
    const now = performance.now();
    if (!force && now - S.last < 80) return;
    S.last = now;
    const p = me(); if (!p) return;
    const dun = atlas.dungeon;
    const scale = dun ? MINI_ZOOMS[S.zoom] * 6 : MINI_ZOOMS[S.zoom];
    const rot = S.rotate ? -(Math.PI - (p.yaw || 0)) : 0;     // turn so that "ahead" is up
    let cx = p.x, cz = p.z;
    if (dun) {        // standing outside every floor (a client demo): look at the floor's middle
      const f = atlas.floorAt(p.x, p.z);
      if (f && !(p.x >= f.origin.x && p.z >= f.origin.z && p.x < f.origin.x + f.w * dun.cell && p.z < f.origin.z + f.h * dun.cell)) { cx = f.origin.x + f.w * dun.cell / 2; cz = f.origin.z + f.h * dun.cell / 2; }
    }
    const v = makeView({ cx, cz, scale, w: SIZE, h: SIZE, rot });
    S.view = v;
    const all = atlas.markers();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.beginPath(); g.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 1, 0, Math.PI * 2); g.clip();
    const shown = all.filter(m => !['farm', 'ford', 'bridge'].includes(m.kind) || scale > 0.9);
    if (dun) drawDungeon(g, v, { floors: dun.floors, cell: dun.cell, fog: dun.fog, markers: shown, opts: { minimap: true } });
    else drawMap(g, v, { model: atlas.model, world: atlas.world, zoneImage: k => atlas.src.zoneImage(k), fog: atlas.fog, markers: shown, detail: scale > 0.45 ? atlas.detailNear(p.x, p.z) : null, opts: { minimap: true, zones: true, labels: true, level: p.level } });
    g.restore();
    // rim arrows: the tracked quest, live events, party members, pins — whatever is off the edge
    g.setTransform(d, 0, 0, d, 0, 0);
    const R = SIZE / 2 - 9, arrows = [];
    for (const m of all) {
      if (!(m.tracked || m.kind === 'liveevent' || m.kind === 'rare' || m.kind === 'party' || m.kind === 'pin' || m.kind === 'questdone' || (m.kind === 'quest' && all.filter(x => x.kind === 'quest').length <= 3))) continue;
      const [sx, sy] = v.toScreen(m.x, m.z);
      if (Math.hypot(sx - SIZE / 2, sy - SIZE / 2) < R - 4) continue;
      const rp = rimPoint(sx, sy, { cx: SIZE / 2, cy: SIZE / 2, r: R });
      arrows.push({ x: rp.x, y: rp.y, m });
      const col = m.kind === 'rare' ? '#ff4a3a' : m.kind === 'liveevent' ? '#ff6a3a' : m.kind === 'party' ? '#4aa8ff' : m.kind === 'pin' ? '#e2483a' : '#ffcf3a';
      g.save(); g.translate(rp.x, rp.y); g.rotate(rp.angle);
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#1b130a'; g.stroke(); g.restore();
      if (m.tracked || m.kind === 'liveevent') {
        const dist = distText(Math.hypot(m.x - p.x, m.z - p.z));
        const tx = SIZE / 2 + Math.cos(rp.angle) * (R - 22), ty = SIZE / 2 + Math.sin(rp.angle) * (R - 18);
        label(g, dist, tx, ty, { size: 10, weight: 800, color: '#fff2c8', halo: 'rgba(10,8,6,0.9)' });
      }
    }
    S.arrows = arrows;
    S.markers = shown;
    // the zone line under it
    if (dun) zone.textContent = `${dun.name} · floor ${(atlas.floorAt(p.x, p.z)?.index ?? 0) + 1}`;
    else {
      const z = atlas.zoneAt(p.x, p.z);
      const tone = z?.band ? bandTone(z.band, p.level || 1) : 'fair';
      zone.innerHTML = z?.name ? `${esc(z.name)} <b class="tone-${tone}">${esc(bandText(z.band))}</b>` : '';
    }
  }
  return {
    root, update, setZoom,
    get state() { return { zoom: S.zoom, rotate: S.rotate, markers: S.markers.map(m => ({ id: m.id, kind: m.kind, name: m.name })), arrows: (S.arrows || []).map(a => ({ id: a.m.id, kind: a.m.kind, name: a.m.name })) }; },
    setRotate(on) { S.rotate = !!on; paintRotBtn(); },
    show(on) { root.hidden = !on; },
  };
}
