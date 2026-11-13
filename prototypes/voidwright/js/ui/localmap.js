// The local map (play-test 2026-11-10: "add a local map so I can see nearby asteroid clusters, stations,
// etc."). The whole star system you are in: the sun, planets, stations, asteroid belts, every sector your
// sensors can read (asteroid clusters, enemy camps, wreck fields, convoys — sectors.js decides those from the
// star's seed, so they show before you get there), ships near you, points of interest. Pan, zoom, and tap
// anything to set a course marker (an arrow at the screen edge points you to it).

import { panel, el, btn } from './dom.js';
import { scanLabel, rockOre } from '../sim/scan.js';
import { missionMarks } from '../sim/missions.js';
import { MATERIALS } from '../data/types.js';
import { sectorsAround, SECTOR_KINDS, SEC } from '../sim/sectors.js';
import { RARITY_BY_ID } from '../data/types.js';

/** How far your sensors read sectors and ships. A scanner part reaches further. */
export const sensorRange = P => 14000 + (P?.stats.scan || 0) * 4000;

const KEY = [
  ['you', '#ffd27a', 'You'], ['station', '#5fd8ff', 'Station (dock here)'], ['hostileStation', '#ff3b5c', 'Enemy base'],
  ['planet', '#8a9ab8', 'Planet (low orbit: mine from above)'], ['field', SECTOR_KINDS.field.color, 'Asteroid cluster'],
  ['rich', SECTOR_KINDS.rich.color, 'Rich asteroids (better ore)'], ['wrecks', SECTOR_KINDS.wrecks.color, 'Wrecks / derelict'],
  ['camp', SECTOR_KINDS.camp.color, 'Enemy camp / enemy ship'], ['swarm', SECTOR_KINDS.swarm.color, 'Alien swarm'],
  ['gnats', SECTOR_KINDS.gnats.color, 'Gnat pack (small, easy kills)'],
  ['outpost', '#7dff9a', 'Your outpost'], ['wing', '#7dffd8', 'Your wingman'],   // sim/colony.js, sim/mercs.js
  ['friend', '#5fa8ff', 'Friendly ship / convoy'], ['outpost', SECTOR_KINDS.outpost.color, 'Outpost (dock here)'], ['anomaly', SECTOR_KINDS.rift.color, 'Anomaly (rift, ion cloud, comet)'], ['danger', SECTOR_KINDS.vault.color, 'Corsair outpost / alien nest'], ['job', '#ffd27a', 'Job marker'], ['beacon', '#ffc45a', 'Distress call'], ['boss', '#ff3b5c', 'Something enormous'],
];

export function openLocalMap(app) {
  const w = app.w, P = app.P; if (!w || !P) return;
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const p = panel(`Local map — ${w.system.name}`, () => { if (app.mode === 'paused') app.mode = wasMode === 'fly' ? 'fly' : wasMode; });
  const cv = el('canvas', { style: 'width:100%;height:100%;display:block;touch-action:none' });
  const info = el('div', { class: 'card lm-info' });
  const legend = el('div', { class: 'lm-key' }, ...KEY.map(([, c, label]) => el('div', {}, el('i', { style: `background:${c}` }), label)));
  const keyBtn = btn('Key', () => legend.classList.toggle('hidden'), 'small');
  if (innerWidth < 640) legend.classList.add('hidden');
  p.body.style.position = 'relative'; p.body.style.padding = '0'; p.body.append(cv, legend, info);
  const range = sensorRange(P);
  let view = { x: P.x, y: P.y, k: 1 };
  const ctx = cv.getContext('2d');
  let picks = [];
  function size() { const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); return d; }
  function draw() {
    const d = size(); const W = cv.width, H = cv.height;
    const k = view.k * Math.min(W, H) / (range * 2.2);
    const X = x => (x - view.x) * k + W / 2, Y = y => (y - view.y) * k + H / 2;
    picks = [];
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);
    // sector grid (faint) inside sensor range
    ctx.strokeStyle = 'rgba(95,216,255,0.05)'; ctx.lineWidth = 1;
    const gx0 = Math.floor((view.x - W / 2 / k) / SEC), gx1 = Math.ceil((view.x + W / 2 / k) / SEC);
    const gy0 = Math.floor((view.y - H / 2 / k) / SEC), gy1 = Math.ceil((view.y + H / 2 / k) / SEC);
    if (gx1 - gx0 < 80) { for (let gx = gx0; gx <= gx1; gx++) { ctx.beginPath(); ctx.moveTo(X(gx * SEC), 0); ctx.lineTo(X(gx * SEC), H); ctx.stroke(); } for (let gy = gy0; gy <= gy1; gy++) { ctx.beginPath(); ctx.moveTo(0, Y(gy * SEC)); ctx.lineTo(W, Y(gy * SEC)); ctx.stroke(); } }
    // system edge and belts
    ctx.strokeStyle = 'rgba(255,90,106,0.35)'; ctx.setLineDash([6 * d, 6 * d]); ctx.beginPath(); ctx.arc(X(0), Y(0), w.size * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    for (const b of w.belts || []) { ctx.strokeStyle = 'rgba(184,168,144,0.10)'; ctx.lineWidth = Math.max(1, b.width * 2 * k); ctx.beginPath(); ctx.arc(X(0), Y(0), b.r * k, 0, 7); ctx.stroke(); }
    ctx.lineWidth = 1;
    // sensor range
    ctx.strokeStyle = 'rgba(95,216,255,0.25)'; ctx.beginPath(); ctx.arc(X(P.x), Y(P.y), range * k, 0, 7); ctx.stroke();
    // sun + planets
    if (w.sun) { ctx.fillStyle = w.sun.color; ctx.beginPath(); ctx.arc(X(w.sun.x), Y(w.sun.y), Math.max(4 * d, w.sun.r * k), 0, 7); ctx.fill(); }
    ctx.font = `${11 * d}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
    for (const pl of w.planets) {
      ctx.fillStyle = 'rgba(138,154,184,0.55)'; ctx.beginPath(); ctx.arc(X(pl.x), Y(pl.y), Math.max(4 * d, pl.r * k), 0, 7); ctx.fill();
      ctx.fillStyle = '#9aa8c4'; ctx.fillText(pl.name, X(pl.x), Y(pl.y) + Math.max(4 * d, pl.r * k) + 12 * d);
      picks.push({ x: pl.x, y: pl.y, label: pl.name, what: 'Planet — fly over it to mine the surface from low orbit.' });
    }
    // sectors the sensors can read
    for (const s of sectorsAround(w, P.x, P.y, range)) {
      if (Math.hypot(s.x - P.x, s.y - P.y) > range) continue;
      const K = SECTOR_KINDS[s.kind]; const x = X(s.x), y = Y(s.y);
      const rr = Math.max(5 * d, 800 * k);
      ctx.globalAlpha = s.cleared ? 0.3 : 0.8;
      if (s.kind === 'field' || s.kind === 'rich' || K.mapAs === 'field') { /* [encounters] an ambush looks like a field */ ctx.fillStyle = K.color; for (let i = 0; i < 5; i++) { const a = i * 1.3 + s.x * 0.001, q = rr * (0.3 + (i % 3) * 0.25); ctx.beginPath(); ctx.arc(x + Math.cos(a) * q, y + Math.sin(a) * q, Math.max(1.5 * d, rr * 0.18), 0, 7); ctx.fill(); } }
      else { ctx.strokeStyle = K.color; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, rr * 0.6, 0, 7); ctx.stroke(); ctx.fillStyle = K.color; ctx.beginPath(); ctx.arc(x, y, 2.5 * d, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      picks.push({ x: s.x, y: s.y, label: K.name, what: s.kind === 'camp' ? 'Enemy camp — a pack waits here.' : s.kind === 'swarm' ? 'An alien swarm drifts here.' : s.kind === 'gnats' ? 'A pack of gnats — small, unshielded, easy kills.' : s.kind === 'wrecks' ? 'Old wrecks — cut them up for salvage.' : s.kind === 'convoy' ? 'Friendly traders.' : s.kind === 'rich' ? 'Asteroids full of better ore.' : K.what || 'Asteroids to mine.' });   // [encounters] K.what
    }
    // scanned asteroids (Scan, V): a dot in their ore's colour, the valuable ones labelled
    for (const s of w.bodies) {
      if (s.dead || s.kind !== 'rock' || !s.scanned || rockOre(s).type === 'rock') continue;
      const L = scanLabel(s); const real = rockOre(s).type; const x = X(s.x), y = Y(s.y); const r = Math.max(2.5 * d, s.r * k);
      ctx.fillStyle = L.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (MATERIALS[real]?.role === 'exotic' || real === 'mixed') { ctx.fillText(L.label, x, y - r - 4 * d); }
      picks.push({ x: s.x, y: s.y, label: `${L.label} asteroid`, what: 'Scanned: point a mining laser at it.' });
    }
    // live bodies within sensor range (ships, stations, wrecks); rocks are already shown as their cluster
    for (const s of w.bodies) {
      if (s.dead || s === P || s.kind === 'rock') continue;
      if (s.kind !== 'station' && Math.hypot(s.x - P.x, s.y - P.y) > range) continue;
      const x = X(s.x), y = Y(s.y);
      let col = '#888', r = Math.max(2.2 * d, s.r * k);
      if (s.kind === 'station') { col = s.team === 'hostile' ? '#ff3b5c' : s.colony ? '#7dff9a' : '#5fd8ff'; r = Math.max(6 * d, s.r * k); }
      else if (s.kind === 'ship') { col = s.wing ? '#7dffd8' : s.team === 'hostile' ? '#ff5a6a' : s.team === 'friendly' ? '#5fa8ff' : '#aaa'; if (s.wing) r = Math.max(3.5 * d, r); }
      else if (s.kind === 'ground') col = s.team === 'hostile' ? '#ff8a6a' : '#5fff9a';
      else if (s.kind === 'wreck') { if (!s.derelict && !s.sector) continue; col = '#c48cff'; }
      ctx.fillStyle = col;
      if (s.kind === 'station') { ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillText(s.name, x, y - r - 5 * d); picks.push({ x: s.x, y: s.y, label: s.name, what: s.team === 'hostile' ? 'Enemy base. Heavily armed.' : s.colony ? 'Your outpost. Dock to collect what it made and build modules.' : s.dockable ? 'Dock here: trade, refit, repairs.' : '' }); }
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      if (s.boss) { ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, r + 5 * d, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    }
    // points of interest
    for (const q of w.poi || []) {
      if (q.done || q.mission || (q.body && q.body.dead)) continue;   // job markers are drawn below, on top
      const qx = q.body?.x ?? q.x, qy = q.body?.y ?? q.y; const x = X(qx), y = Y(qy);
      const col = q.color || (q.kind === 'boss' ? '#ff3b5c' : q.kind === 'beacon' ? '#ffc45a' : q.kind === 'claim' ? '#5fff9a' : q.kind === 'stronghold' ? '#ff5a6a' : '#c48cff');   // [encounters] POIs may carry their own colour + label
      const label = q.label || (q.kind === 'boss' ? q.name : q.kind === 'beacon' ? 'Distress call' : q.kind === 'claim' ? 'Rich field' : q.kind === 'stronghold' ? 'Stronghold' : 'Derelict');
      ctx.strokeStyle = col; ctx.lineWidth = 2 * d; ctx.strokeRect(x - 5 * d, y - 5 * d, 10 * d, 10 * d); ctx.lineWidth = 1;
      ctx.fillStyle = col; if (q.body?.kind !== 'station') ctx.fillText(label, x, y - 9 * d);   // [encounters] a station already prints its own name
      picks.push({ x: qx, y: qy, label, what: '' });
    }
    // loot on the map
    for (const it of w.pickups) if (it.kind === 'item') { ctx.fillStyle = RARITY_BY_ID[it.rarity]?.color || '#fff'; ctx.fillRect(X(it.x) - 2 * d, Y(it.y) - 2 * d, 4 * d, 4 * d); }
    // course marker
    if (app.waypoint) { const x = X(app.waypoint.x), y = Y(app.waypoint.y); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(x, y - 10 * d); ctx.lineTo(x + 8 * d, y); ctx.lineTo(x, y + 10 * d); ctx.lineTo(x - 8 * d, y); ctx.closePath(); ctx.stroke(); ctx.setLineDash([4 * d, 5 * d]); ctx.beginPath(); ctx.moveTo(X(P.x), Y(P.y)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
    // jobs (live reports #43/#46): a filled diamond in the job's colour with its label, over everything else
    for (const mk of missionMarks(app.G, w, app.G.system)) {
      const x = X(mk.x), y = Y(mk.y); const on = app.waypoint?.mission === mk.m.id; const s = (on ? 9 : 7) * d;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
      ctx.fillStyle = mk.color; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3 * d; ctx.stroke(); ctx.fill();
      if (on) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * d; ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.font = `600 ${12 * d}px Rajdhani, sans-serif`; const tw = ctx.measureText(mk.label).width + 10 * d;
      ctx.fillStyle = 'rgba(4,8,18,0.85)'; ctx.fillRect(x - tw / 2, y - s - 20 * d, tw, 16 * d);
      ctx.fillStyle = mk.color; ctx.fillText(mk.label, x, y - s - 8 * d);
      ctx.font = `${11 * d}px Rajdhani, sans-serif`;
      picks.push({ x: mk.x, y: mk.y, label: mk.label, what: `Job: ${mk.m.title}.`, mission: mk.m.id });
    }
    // you
    ctx.save(); ctx.translate(X(P.x), Y(P.y)); ctx.rotate(P.a); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(9 * d, 0); ctx.lineTo(-6 * d, -5.5 * d); ctx.lineTo(-6 * d, 5.5 * d); ctx.fill(); ctx.restore();
    cv._X = X; cv._Y = Y; cv._k = k;
  }
  function showInfo(pk) {
    info.innerHTML = '';
    if (!pk) { info.append(el('b', {}, w.system.name), el('div', { class: 'hint' }, 'Tap anything to set a course marker. Your sensors read the sectors inside the blue ring.')); return; }
    const dist = Math.max(0.1, Math.round(Math.hypot(pk.x - P.x, pk.y - P.y) / 100) / 10);
    info.append(el('b', {}, pk.label), pk.what ? el('div', { class: 'hint' }, pk.what) : '', el('div', {}, `${dist} km away`),
      el('div', { class: 'row' }, btn('Set course', () => { app.waypoint = { x: pk.x, y: pk.y, label: pk.label, ...(pk.mission ? { mission: pk.mission } : {}) }; draw(); showInfo(pk); }, 'primary'),
        app.waypoint ? btn('Clear course', () => { app.waypoint = null; draw(); showInfo(pk); }) : ''));
  }
  showInfo(null); requestAnimationFrame(draw);
  let drag = null, moved = 0;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag) return; const d = cv.width / cv.getBoundingClientRect().width; moved += Math.abs(e.movementX) + Math.abs(e.movementY); view.x = drag.vx - (e.clientX - drag.x) * d / cv._k; view.y = drag.vy - (e.clientY - drag.y) * d / cv._k; draw(); });
  cv.addEventListener('pointerup', e => {
    const was = drag; drag = null; if (!was || moved > 8) return;
    const r = cv.getBoundingClientRect(); const d = cv.width / r.width; const mx = (e.clientX - r.left) * d, my = (e.clientY - r.top) * d;
    let best = null, bd = 28 * d;
    for (const pk of picks) { const dd = Math.hypot(cv._X(pk.x) - mx, cv._Y(pk.y) - my); if (dd < bd) { bd = dd; best = pk; } }
    showInfo(best);
  });
  cv.addEventListener('wheel', e => { view.k = Math.max(0.15, Math.min(12, view.k * (e.deltaY > 0 ? 0.85 : 1.18))); draw(); e.preventDefault(); }, { passive: false });
  const zoomRow = el('div', { class: 'row', style: 'position:absolute;left:10px;top:10px' },
    btn('+', () => { view.k = Math.min(12, view.k * 1.4); draw(); }, 'small'), btn('−', () => { view.k = Math.max(0.15, view.k / 1.4); draw(); }, 'small'),
    btn('Me', () => { view.x = P.x; view.y = P.y; view.k = 1; draw(); }, 'small'), btn('Whole system', () => { view.x = 0; view.y = 0; view.k = range * 2.2 / (w.size * 2.1); draw(); }, 'small'), keyBtn,
    app.G?.unlocked.galaxy ? btn('Star map', () => { p.close(); app.openMap(); }, 'small') : '');
  p.body.append(zoomRow);
  const onResize = () => draw(); addEventListener('resize', onResize);
  return p;
}
