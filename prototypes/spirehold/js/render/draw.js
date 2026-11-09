// Spirehold — draws the battle: ground, city, walls, towers, mages, foes, shots, and every explosion.
// Reads the sim (G, B) and B.ev; never changes the game.

import { TOWERS, SCHOOLS, LANDMARKS, REALMS, DMG_INFO, ENEMIES, BOSSES } from '../sim/data.js';
import { slotsOf, wallMax, ringOf } from '../sim/rules.js';
import { towerPos, magePos, W, spawnR } from '../sim/battle.js';
import { rng, hash, TAU } from '../sim/rand.js';
import { foeSprite, glow, towerSprite, mageSprite, shade } from './sprites.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const R = {
    canvas, ctx, cam: { x: 0, y: 0, z: 1, fitZ: 1, user: false }, dpr: 1, w: 0, h: 0, quality: 1,
    parts: [], rings: [], bolts: [], meteors: [], craters: [], flames: [], texts: [], beams: [], shake: 0, flash: 0,
    ground: null, groundKey: '', city: null, cityKey: '', lights: [], t: 0, night: 0, select: -1, hoverSlot: -1, aim: null, wardT: 0, breachT: 0,
    numbers: true,
  };
  R.resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, R.quality >= 1 ? 2 : 1.25);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === R.w && h === R.h && dpr === R.dpr) return;
    R.w = w; R.h = h; R.dpr = dpr; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  };
  R.toWorld = (sx, sy) => ({ x: (sx - R.w / 2) / R.cam.z + R.cam.x, y: (sy - R.h / 2) / R.cam.z + R.cam.y });
  R.toScreen = (x, y) => ({ x: (x - R.cam.x) * R.cam.z + R.w / 2, y: (y - R.cam.y) * R.cam.z + R.h / 2 });
  R.fit = (G, insetBottom = 0, insetRight = 0) => {
    const portrait = R.h > R.w * 1.2; const rad = Math.max(portrait ? 250 : 330, W(G) + (portrait ? 170 : 250));
    const aw = R.w - insetRight, ah = R.h - insetBottom - 90;
    R.cam.fitZ = Math.min(aw, ah) / (rad * 2) * 1.08;
    R.cam.fitX = insetRight / 2 / R.cam.fitZ; R.cam.fitY = (insetBottom - 40) / 2 / R.cam.fitZ;
    if (!R.cam.user) { R.cam.z = R.cam.fitZ; R.cam.x = R.cam.fitX; R.cam.y = R.cam.fitY; }
  };
  return R;
}

// ---------------------------------------------------------------- painted layers (re-made only when the city changes)
function paintGround(R, G) {
  const realm = REALMS[G.realm] || REALMS.greenvale; const rad = Math.round(spawnR(G) + 480);
  const key = `${G.realm}|${G.seed}|${rad}|${R.quality}`; if (R.groundKey === key) return;
  R.groundKey = key;
  const sc = R.quality >= 1 ? 1 : 0.6; const size = Math.round(rad * 2 * sc);
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.scale(sc, sc); x.translate(rad, rad);
  const r = rng(hash('ground', G.seed, G.realm));
  x.fillStyle = realm.ground[0]; x.fillRect(-rad, -rad, rad * 2, rad * 2);
  for (let i = 0; i < 900; i++) { x.globalAlpha = 0.08 + r() * 0.12; x.fillStyle = realm.ground[r.int(3)]; x.beginPath(); x.ellipse(r.range(-rad, rad), r.range(-rad, rad), 20 + r() * 90, 12 + r() * 50, r() * 3, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  for (let i = 0; i < 2500; i++) { x.fillStyle = shade(realm.ground[r.int(3)], r() < 0.5 ? 0.18 : -0.25); x.fillRect(r.range(-rad, rad), r.range(-rad, rad), 1.5, 1.5); }
  // roads from the four gates
  const wr = W(G);
  x.strokeStyle = shade(realm.ground[2], 0.25); x.lineCap = 'round';
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.3; x.lineWidth = 16; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(Math.cos(a) * wr, Math.sin(a) * wr); let px = Math.cos(a) * wr, py = Math.sin(a) * wr; for (let d = wr; d < rad; d += 40) { const aa = a + Math.sin(d * 0.01 + k) * 0.06; px = Math.cos(aa) * d; py = Math.sin(aa) * d; x.lineTo(px, py); } x.stroke(); }
  x.globalAlpha = 1;
  // woods and stones outside the walls
  const treeCol = G.realm === 'frostmarch' ? ['#4a6a6a', '#5a7a7a'] : G.realm === 'ashreach' ? ['#4a3a2a', '#3a2e24'] : G.realm === 'bonefields' ? ['#5a5a3a', '#4a4a30'] : ['#2a4a20', '#36582a'];
  for (let i = 0; i < 520; i++) {
    const a = r() * TAU, d = r.range(wr + 70, rad - 20); const px = Math.cos(a) * d, py = Math.sin(a) * d;
    const near = [0, 1, 2, 3].some(k => { let da = a - (k / 4 * TAU + 0.3); da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.abs(da) * d < 26; }); if (near) continue;
    if (r() < 0.75) { const s = 6 + r() * 9; x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(px + 3, py + 4, s, s * 0.8, 0, 0, 7); x.fill(); x.fillStyle = treeCol[r.int(2)]; x.beginPath(); x.arc(px, py, s, 0, 7); x.fill(); x.fillStyle = shade(treeCol[0], 0.2); x.beginPath(); x.arc(px - s * 0.3, py - s * 0.3, s * 0.45, 0, 7); x.fill(); }
    else if (r() < 0.4) { const s = 3 + r() * 5; x.fillStyle = '#6a665e'; x.beginPath(); x.ellipse(px, py, s, s * 0.7, r() * 3, 0, 7); x.fill(); x.fillStyle = '#8a857a'; x.beginPath(); x.ellipse(px - 1, py - 1, s * 0.5, s * 0.35, 0, 0, 7); x.fill(); }
  }
  // the ditch outside the wall
  x.strokeStyle = 'rgba(30,20,10,0.35)'; x.lineWidth = 10; x.beginPath(); x.arc(0, 0, wr + 16, 0, TAU); x.stroke();
  R.ground = { c, rad, sc };
}
function paintCity(R, G) {
  const wr = W(G); const cap = Math.max(1, G.city.pop);
  const lmk = Object.keys(LANDMARKS).filter(id => G.city.landmarks[id]).join(',');
  const houses = Math.floor(cap / 5);
  const key = `${wr}|${Math.min(2000, houses)}|${lmk}|${G.realm}|${R.quality}`; if (R.cityKey === key) return;
  R.cityKey = key;
  const size = Math.round((wr + 4) * 2); const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.translate(size / 2, size / 2);
  const r = rng(hash('city', G.seed));
  const roof = G.realm === 'frostmarch' ? ['#5a6a8a', '#6a7a9a', '#4a5a70'] : G.realm === 'ashreach' ? ['#6a3a2a', '#5a2a20', '#7a4a30'] : ['#9a4a32', '#7a3a2a', '#5a5a6a', '#8a5a3a', '#6a4a5a'];
  // cobbles inside the wall
  x.fillStyle = '#4a463e'; x.beginPath(); x.arc(0, 0, wr - 4, 0, TAU); x.fill();
  x.fillStyle = '#56514a'; for (let i = 0; i < wr * 6; i++) { const a = r() * TAU, d = Math.sqrt(r()) * (wr - 6); x.fillRect(Math.cos(a) * d, Math.sin(a) * d, 2, 2); }
  // streets: rings and spokes
  x.strokeStyle = '#6a645a'; x.lineWidth = 5; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.3; x.beginPath(); x.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); x.lineTo(Math.cos(a) * wr, Math.sin(a) * wr); x.stroke(); }
  for (let rr = 60; rr < wr - 20; rr += 44) { x.lineWidth = 3; x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.stroke(); }
  // landmarks sit in the inner ring at fixed bearings
  const spots = []; const lids = Object.keys(LANDMARKS);
  lids.forEach((id, i) => { const a = i / lids.length * TAU + 0.65; const d = Math.min(wr - 26, 48 + (i % 2) * 14); spots.push({ id, x: Math.cos(a) * d, y: Math.sin(a) * d, a }); });
  // houses fill outward from the keep as people move in
  R.lights = [];
  let placed = 0; const want = Math.min(houses, 2400);
  for (let rr = 40; rr < wr - 12 && placed < want; rr += 11) {
    const n = Math.floor(rr * TAU / 12);
    for (let i = 0; i < n && placed < want; i++) {
      const a = i / n * TAU + rr * 0.07; const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if ([0, 1, 2, 3].some(k => { let da = a - (k / 4 * TAU + 0.3); da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.abs(da) * rr < 7; })) continue;
      if (spots.some(s => G.city.landmarks[s.id] && Math.hypot(s.x - px, s.y - py) < 17)) continue;
      if (Math.abs(rr % 44 - 16) < 3) continue;
      if (r() < 0.12) continue;
      const w = 7 + r() * 3, h = 5 + r() * 3; const col = roof[r.int(roof.length)];
      x.save(); x.translate(px, py); x.rotate(a);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, w, h);
      x.fillStyle = col; x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = shade(col, -0.3); x.fillRect(-w / 2, 0, w, h / 2);
      x.fillStyle = shade(col, 0.2); x.fillRect(-w / 2, -0.4, w, 0.8);
      x.restore();
      placed++; if (r() < 0.35) R.lights.push({ x: px, y: py, f: r() });
    }
  }
  // landmarks
  for (const s of spots) { if (!G.city.landmarks[s.id]) continue; drawLandmark(x, s.id, s.x, s.y, G.city.landmarks[s.id]); R.lights.push({ x: s.x, y: s.y, f: 0.5, big: true }); }
  // the keep
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-18, -18, 40, 40);
  x.fillStyle = '#8a8476'; x.fillRect(-20, -20, 40, 40); x.fillStyle = '#9e988a'; x.fillRect(-14, -14, 28, 28);
  x.fillStyle = '#6a3a5a'; x.fillRect(-8, -8, 16, 16); x.fillStyle = '#7a4a6a'; x.fillRect(-8, -8, 16, 7);
  for (const [cx, cy] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) { x.fillStyle = '#7a7466'; x.beginPath(); x.arc(cx, cy, 7, 0, TAU); x.fill(); x.fillStyle = '#5a3a5a'; x.beginPath(); x.arc(cx, cy, 4.5, 0, TAU); x.fill(); }
  x.fillStyle = '#d8b040'; x.fillRect(-1, -30, 2, 12); x.fillStyle = '#b03030'; x.fillRect(1, -30, 8, 5);
  R.city = { c, half: size / 2 };
}
function drawLandmark(x, id, px, py, lv) {
  x.save(); x.translate(px, py);
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(2, 2, 12, 0, TAU); x.fill();
  const box = (w, h, c1, c2) => { x.fillStyle = c1; x.fillRect(-w / 2, -h / 2, w, h); x.fillStyle = c2; x.fillRect(-w / 2, 0, w, h / 2); };
  switch (id) {
    case 'market': x.fillStyle = '#c8a050'; x.beginPath(); x.arc(0, 0, 12, 0, TAU); x.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.fillStyle = i % 2 ? '#c03a3a' : '#e8e0c8'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 9, a, a + TAU / 6); x.fill(); } break;
    case 'granary': box(18, 12, '#b08a50', '#8a6a3a'); x.fillStyle = '#d8c070'; x.beginPath(); x.arc(-4, 0, 3, 0, TAU); x.arc(4, 0, 3, 0, TAU); x.fill(); break;
    case 'forge': box(16, 14, '#5a4a40', '#3a302a'); x.fillStyle = '#ff7a20'; x.shadowColor = '#ff7a20'; x.shadowBlur = 8; x.fillRect(-3, -3, 6, 6); x.shadowBlur = 0; break;
    case 'temple': x.fillStyle = '#e8e0c8'; x.beginPath(); x.arc(0, 0, 12, 0, TAU); x.fill(); x.fillStyle = '#e8c860'; x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.fill(); x.fillStyle = '#fff6c0'; x.beginPath(); x.arc(0, 0, 3, 0, TAU); x.fill(); break;
    case 'tavern': box(18, 13, '#8a5a30', '#6a4220'); x.fillStyle = '#e8c860'; x.fillRect(6, -10, 5, 4); break;
    case 'academy': x.fillStyle = '#5a4a8a'; x.beginPath(); x.arc(0, 0, 11, 0, TAU); x.fill(); x.fillStyle = '#c070ff'; x.shadowColor = '#c070ff'; x.shadowBlur = 10; x.beginPath(); x.arc(0, 0, 4, 0, TAU); x.fill(); x.shadowBlur = 0; break;
    case 'library': box(20, 12, '#7a6a5a', '#5a4a3a'); x.fillStyle = '#d8d0b8'; for (let i = -2; i <= 2; i++) x.fillRect(i * 3.6 - 1, -5, 2, 10); break;
    case 'observatory': x.fillStyle = '#c8d0e0'; x.beginPath(); x.arc(0, 0, 11, 0, TAU); x.fill(); x.fillStyle = '#20304a'; x.fillRect(-2, -11, 4, 12); break;
    case 'guildhall': box(20, 16, '#6a4a3a', '#4a3424'); x.fillStyle = '#3a6ac0'; x.fillRect(-2, -14, 4, 8); x.fillStyle = '#e8c860'; x.fillRect(-1, -16, 2, 3); break;
  }
  x.restore();
}

// ---------------------------------------------------------------- effects from sim events
const MAXP = 1600;
function part(R, p) { if (R.parts.length < MAXP * R.quality) R.parts.push(p); }
export function handleEvents(R, G, B) {
  const q = R.quality;
  for (const e of B.ev) {
    switch (e.k) {
      case 'die': {
        const n = Math.min(10, 3 + e.size / 2) * q;
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 20 + Math.random() * 60; part(R, { x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, size: 1.5 + Math.random() * 2, color: e.look === 'skeleton' ? '#e0dcc8' : e.look === 'ghost' ? '#c0e0ff' : '#7a2a1a', drag: 3 }); }
        R.craters.push({ x: e.x, y: e.y, r: e.size * 0.8, t: 6, max: 6, blood: e.look !== 'ghost' && e.look !== 'flame' });
        if (e.boss) { ring(R, e.x, e.y, 140, '#ffd040', 0.9); R.shake = Math.max(R.shake, 8); for (let i = 0; i < 30; i++) spark(R, e.x, e.y, '#ffd040', 200); }
        if (R.numbers && e.gold >= 1 && Math.random() < (e.boss ? 1 : 0.06)) R.texts.push({ x: e.x, y: e.y - 6, t: 1, text: '+' + fmtShort(e.gold), color: '#ffd860' });
        break;
      }
      case 'blast': {
        const col = DMG_INFO[e.type]?.color || '#fff';
        flash(R, e.x, e.y, e.r * 1.4, col, e.big ? 0.5 : 0.28);
        ring(R, e.x, e.y, e.r, col, e.big ? 0.5 : 0.3);
        const n = (e.big ? 26 : 8) * q;
        for (let i = 0; i < n; i++) spark(R, e.x, e.y, col, e.r * 3);
        if (e.big) for (let i = 0; i < 10 * q; i++) smoke(R, e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r);
        if (e.big) R.craters.push({ x: e.x, y: e.y, r: e.r * 0.5, t: 14, max: 14, scorch: true });
        break;
      }
      case 'impact': {
        R.shake = Math.max(R.shake, Math.min(14, e.r / 8)); R.flash = Math.max(R.flash, 0.25);
        ring(R, e.x, e.y, e.r * 1.6, '#ffd8a0', 0.7);
        for (let i = 0; i < 26 * q; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 200; part(R, { x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 80 + Math.random() * 160, z: 0, life: 1.2, max: 1.2, size: 2 + Math.random() * 3, color: '#4a3a2a', drag: 1.2, debris: true }); }
        for (let i = 0; i < 16 * q; i++) smoke(R, e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 1.6);
        R.craters.push({ x: e.x, y: e.y, r: e.r * 0.6, t: 30, max: 30, scorch: true, glow: true });
        break;
      }
      case 'meteor': R.meteors.push({ x: e.x, y: e.y, r: e.r, t: 0, d: e.delay, big: e.big }); break;
      case 'bolt': R.bolts.push({ pts: jag(e.pts), t: e.big ? 0.32 : 0.2, max: e.big ? 0.32 : 0.2, big: e.big }); for (const p of e.pts.slice(1)) flash(R, p.x, p.y, 26, '#d9b8ff', 0.15); break;
      case 'flame': R.flames.push({ x: e.x, y: e.y, a: e.a, len: e.len, cone: e.cone, t: 0.25 }); for (let i = 0; i < 5 * q; i++) { const a = e.a + (Math.random() - 0.5) * e.cone * 2, s = e.len * (1.6 + Math.random()); part(R, { x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, size: 3 + Math.random() * 4, color: Math.random() < 0.5 ? '#ff7a20' : '#ffc040', add: true, grow: 2 }); } break;
      case 'frost': ring(R, e.x, e.y, e.r, '#bfe8ff', e.big ? 0.6 : 0.35); flash(R, e.x, e.y, e.r * 1.2, '#8fd8ff', 0.3); for (let i = 0; i < (e.big ? 30 : 8) * q; i++) { const a = Math.random() * TAU, d = Math.random() * e.r; part(R, { x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: 0, vy: -10, life: 0.8, max: 0.8, size: 1.5 + Math.random() * 1.5, color: '#e8f8ff', add: true }); } break;
      case 'beam': R.beams.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, t: 0.18, max: 0.18, color: e.color }); break;
      case 'pillar': R.beams.push({ x: e.x, y: e.y - (e.small ? 80 : 260), tx: e.x, ty: e.y, t: e.small ? 0.3 : 0.6, max: e.small ? 0.3 : 0.6, color: '#fff2b0', w: e.small ? 6 : 18 }); flash(R, e.x, e.y, e.small ? 40 : 90, '#ffe38a', 0.4); break;
      case 'arrowrain': for (let i = 0; i < 24 * q; i++) { const a = Math.random() * TAU, d = Math.random() * 70; part(R, { x: e.x + Math.cos(a) * d - 30, y: e.y + Math.sin(a) * d - 60, vx: 100, vy: 200, life: 0.3, max: 0.3, size: 1, color: '#d8c8a8', streak: true }); } break;
      case 'nova': ring(R, e.x, e.y, e.r, '#ff7a20', 0.5); flash(R, e.x, e.y, e.r * 1.3, '#ff7a20', 0.4); break;
      case 'quake': R.rings.push({ x: 0, y: 0, r: e.r, t: 0.9, max: 0.9, color: '#c0a070', w: 14 }); for (let i = 0; i < 80 * q; i++) { const a = Math.random() * TAU, d = W(G) + Math.random() * 260; smoke(R, Math.cos(a) * d, Math.sin(a) * d, 1, '#8a7a5a'); } break;
      case 'ward': R.wardT = 6; break;
      case 'heal': part(R, { x: e.x, y: e.y, vx: 0, vy: -20, life: 0.6, max: 0.6, size: 8, color: '#80ffb0', add: true, ringP: true }); break;
      case 'cast': flash(R, e.x, e.y, 22, e.color, 0.3); break;
      case 'spark': spark(R, e.x, e.y, e.color, 60); break;
      case 'shake': R.shake = Math.max(R.shake, e.amt); break;
      case 'breach': R.breachT = 2.5; R.shake = 12; break;
      case 'flee': smoke(R, e.x, e.y, 0.6); break;
      case 'shoot': if (e.tower === 'shell') for (let i = 0; i < 3; i++) smoke(R, e.x, e.y, 0.5); break;
    }
  }
}
const fmtShort = n => n >= 1e12 ? (n / 1e12).toFixed(1) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n) + '';
function spark(R, x, y, color, sp) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.7); part(R, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, max: 0.6, size: 1.2 + Math.random() * 1.8, color, add: true, drag: 2.5 }); }
function smoke(R, x, y, k = 1, color = '#3a3632') { part(R, { x, y, vx: (Math.random() - 0.5) * 12, vy: -8 - Math.random() * 10, life: 1.4 * k, max: 1.4 * k, size: 5 + Math.random() * 6, color, smoke: true, grow: 6 }); }
function ring(R, x, y, r, color, t) { R.rings.push({ x, y, r, t, max: t, color }); }
function flash(R, x, y, r, color, t) { part(R, { x, y, vx: 0, vy: 0, life: t, max: t, size: r, color, glow: true, add: true }); }
function jag(pts) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let k = 1; k <= 4; k++) { const f = k / 4; out.push(k === 4 ? b : { x: a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 14, y: a.y + (b.y - a.y) * f + (Math.random() - 0.5) * 14 }); } } return out; }

// ---------------------------------------------------------------- the frame
export function draw(R, G, B, dt, opts = {}) {
  R.resize(); R.t += dt;
  const { ctx } = R; const dpr = R.dpr;
  paintGround(R, G); paintCity(R, G);
  // gentle day and night (12-minute day)
  const day = (G.playTime / 720) % 1; R.night = Math.max(0, Math.cos(day * TAU) * -1) * 0.55;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = (REALMS[G.realm] || REALMS.greenvale).ground[0]; ctx.fillRect(0, 0, R.w, R.h);
  let sx = 0, sy = 0; if (R.shake > 0 && opts.shake !== false) { sx = (Math.random() - 0.5) * R.shake; sy = (Math.random() - 0.5) * R.shake; R.shake = Math.max(0, R.shake - dt * 30); }
  const z = R.cam.z;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.w / 2 - R.cam.x * z + sx), dpr * (R.h / 2 - R.cam.y * z + sy));
  const g = R.ground; ctx.drawImage(g.c, -g.rad, -g.rad, g.rad * 2, g.rad * 2);
  // craters, blood, scorch
  R.craters = R.craters.filter(c => (c.t -= dt) > 0); if (R.craters.length > 220) R.craters.splice(0, R.craters.length - 220);
  for (const c of R.craters) { const f = c.t / c.max; ctx.globalAlpha = Math.min(1, f * 2) * (c.scorch ? 0.55 : 0.35); ctx.fillStyle = c.scorch ? '#1a1410' : c.blood ? '#3a1410' : '#2a2a2a'; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.85, 0, 0, TAU); ctx.fill(); if (c.glow && f > 0.6) { ctx.globalAlpha = (f - 0.6) * 2; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(255,120,40,0.9)'), c.x - c.r, c.y - c.r, c.r * 2, c.r * 2); ctx.globalCompositeOperation = 'source-over'; } }
  ctx.globalAlpha = 1;
  // burning ground
  for (const gr of B.ground) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, gr.t) * 0.55; ctx.drawImage(glow('rgba(255,100,30,0.9)'), gr.x - gr.r, gr.y - gr.r, gr.r * 2, gr.r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; if (Math.random() < 0.3 * R.quality) part(R, { x: gr.x + (Math.random() - 0.5) * gr.r, y: gr.y + (Math.random() - 0.5) * gr.r, vx: 0, vy: -25, life: 0.6, max: 0.6, size: 2.5, color: '#ffa040', add: true }); }
  // city
  const c = R.city; ctx.drawImage(c.c, -c.half, -c.half);
  drawWall(R, G, B, ctx, dt);
  // foes
  drawFoes(R, G, B, ctx);
  // towers
  const slots = slotsOf(G);
  for (let s = 0; s < slots; s++) {
    const p = towerPos(G, s); const t = G.towers.find(x => x.slot === s);
    if (!t) { ctx.globalAlpha = R.select === s ? 0.9 : 0.45; ctx.strokeStyle = '#e8dcc0'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#e8dcc0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', p.x, p.y + 0.5); ctx.globalAlpha = 1; continue; }
    const T = TOWERS[t.type]; const sp = towerSprite(t.type, T.color, t.lvl);
    ctx.drawImage(sp.c, p.x - sp.half, p.y - sp.half);
    if (R.select === s) { ctx.strokeStyle = 'rgba(255,230,160,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(p.x, p.y, opts.range?.(t) || T.range, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, TAU); ctx.stroke(); }
    if (opts.labels !== false && z > 0.55) { ctx.font = `bold ${Math.max(8, 9 / Math.max(0.7, z))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; const lx = p.x + Math.cos(p.a) * 24, ly = p.y + Math.sin(p.a) * 24; ctx.strokeText(t.lvl, lx, ly); ctx.fillStyle = opts.due?.(t) ? '#80ff90' : '#f4e8c8'; ctx.fillText(t.lvl, lx, ly); }
  }
  // mages
  G.mages.forEach((m, i) => { const p = magePos(G, i); const S = SCHOOLS[m.school]; const sp = mageSprite(S.color); ctx.drawImage(sp.c, p.x - sp.half, p.y - sp.half); });
  drawShots(R, G, B, ctx);
  drawFx(R, G, ctx, dt);
  // night: dim the world, light the windows
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (R.night > 0.02) {
    ctx.fillStyle = `rgba(10,14,40,${R.night})`; ctx.fillRect(0, 0, R.w, R.h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.w / 2 - R.cam.x * z + sx), dpr * (R.h / 2 - R.cam.y * z + sy));
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = R.night * 1.4;
    const gl = glow('rgba(255,190,90,0.9)', 32);
    for (const l of R.lights) { const fl = 0.8 + Math.sin(R.t * 3 + l.f * 20) * 0.2; const s = (l.big ? 22 : 7) * fl; ctx.drawImage(gl, l.x - s, l.y - s, s * 2, s * 2); }
    for (const t of G.towers) { const p = towerPos(G, t.slot); ctx.drawImage(glow('rgba(255,200,120,0.8)', 32), p.x - 20, p.y - 20, 40, 40); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (R.flash > 0) { ctx.fillStyle = `rgba(255,230,190,${R.flash})`; ctx.fillRect(0, 0, R.w, R.h); R.flash = Math.max(0, R.flash - dt * 1.5); }
  if (R.breachT > 0) { R.breachT -= dt; ctx.fillStyle = `rgba(160,20,10,${Math.min(0.35, R.breachT * 0.2)})`; ctx.fillRect(0, 0, R.w, R.h); }
  // aim marker for a spell being placed
  if (R.aim) { const p = R.toScreen(R.aim.x, R.aim.y); ctx.strokeStyle = R.aim.color || '#ffd080'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, (R.aim.r || 50) * z, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
}

function drawWall(R, G, B, ctx, dt) {
  const wr = W(G); const hpF = G.wall.hp / wallMax(G); const ring = ringOf(G.city.level);
  ctx.lineWidth = 12 + ring * 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(3, 4, wr, 0, TAU); ctx.stroke();
  const hit = (B.wallDps || 0) > 0 ? 0.5 + Math.sin(R.t * 18) * 0.5 : 0;
  ctx.strokeStyle = hpF < 0.3 ? shade('#8a7a6a', -0.3 + hit * 0.2) : '#8a8274'; ctx.beginPath(); ctx.arc(0, 0, wr, 0, TAU); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = '#a8a092'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(0, 0, wr + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#4a463e'; ctx.beginPath(); ctx.arc(0, 0, wr - 6 - ring * 0.3, 0, TAU); ctx.stroke();
  // gates
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.3; ctx.save(); ctx.translate(Math.cos(a) * wr, Math.sin(a) * wr); ctx.rotate(a); ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-7, -9, 14, 18); ctx.fillStyle = '#7a7266'; ctx.fillRect(-8, -12, 16, 4); ctx.fillRect(-8, 8, 16, 4); ctx.restore(); }
  // cracks as the wall gets low
  if (hpF < 0.6) { const r = rng(7); ctx.strokeStyle = 'rgba(20,10,5,0.7)'; ctx.lineWidth = 1.2; const n = Math.round((0.6 - hpF) * 60); for (let i = 0; i < n; i++) { const a = r() * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (wr - 5), Math.sin(a) * (wr - 5)); ctx.lineTo(Math.cos(a + 0.02) * (wr + 5), Math.sin(a + 0.02) * (wr + 5)); ctx.stroke(); } }
  if (R.wardT > 0 || B.wardT > 0) { R.wardT = Math.max(0, R.wardT - dt); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,220,120,${0.35 + Math.sin(R.t * 6) * 0.15})`; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, wr + 6, 0, TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
}
function drawFoes(R, G, B, ctx) {
  const t = R.t; const z = R.cam.z;
  const list = B.enemies;
  // shadows for flyers first, then the ground, then flyers on top
  for (let pass = 0; pass < 2; pass++) {
    for (const e of list) {
      if (!e.alive || e.flying !== !!pass) continue;
      const frame = ((t * (e.sp / 8) + e.id * 0.37) % 1) < 0.5 && !e.atWall && e.stunT <= 0 ? 1 : 0;
      const s = e.size; const fy = e.flying ? -10 : 0;
      if (e.flying) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, s * 0.8, s * 0.5, 0, 0, TAU); ctx.fill(); }
      if (!e.flying) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x + 1.5, e.y + 2, s * 1.05, s * 0.8, 0, 0, TAU); ctx.fill(); }
      const spr = foeSprite(e.look, e.color, s * 1.6, frame, e.hitT > 0 ? 'w' : 'n');
      const ang = Math.atan2(-e.y, -e.x);
      const bob = e.atWall ? Math.sin(t * 9 + e.id) * 1.5 : 0;
      ctx.save(); ctx.translate(e.x + Math.cos(ang) * bob, e.y + fy + Math.sin(ang) * bob); ctx.rotate(ang);
      ctx.drawImage(spr.c, -spr.half, -spr.half);
      ctx.restore();
      if (e.stunT > 0 && e.slowF < 1) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.arc(e.x, e.y + fy, s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (e.slowT > 0) { ctx.strokeStyle = 'rgba(160,220,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(e.x, e.y + fy, s + 1.5, 0, TAU); ctx.stroke(); }
      if (e.burnT > 0 && Math.random() < 0.25 * R.quality) part(R, { x: e.x + (Math.random() - 0.5) * s, y: e.y + fy, vx: 0, vy: -30, life: 0.4, max: 0.4, size: 2, color: '#ff8a30', add: true });
      if (e.stunT > 0 && !(e.slowF < 1)) { ctx.fillStyle = '#ffe080'; for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; ctx.fillRect(e.x + Math.cos(a) * s * 0.8 - 1, e.y + fy - s - 2 + Math.sin(a) * 2, 2, 2); } }
      if (e.ward > 0) { ctx.strokeStyle = 'rgba(230,120,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y + fy, s + 3, 0, TAU); ctx.stroke(); }
      if (e.boss || e.big || e.hp < e.max) {
        if (e.boss || e.hp < e.max * 0.999) {
          const w = Math.max(10, s * 2), hf = Math.max(0, e.hp / e.max);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y + fy - s - 6, w, 2.5);
          ctx.fillStyle = e.boss ? '#ffb030' : hf > 0.5 ? '#6ad04a' : '#e0503a'; ctx.fillRect(e.x - w / 2, e.y + fy - s - 6, w * hf, 2.5);
        }
      }
      if (e.boss) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(t * 4) * 0.1; ctx.drawImage(glow('rgba(255,80,40,0.8)'), e.x - s * 2, e.y + fy - s * 2, s * 4, s * 4); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (z > 0.4) { ctx.font = `bold ${10 / Math.max(0.6, z)}px serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(e.name, e.x, e.y + fy - s - 12); ctx.fillStyle = '#ffd070'; ctx.fillText(e.name, e.x, e.y + fy - s - 12); }
      }
      if (e.stack > 1 && z > 0.5) { ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('×' + e.stack, e.x, e.y + s + 8); }
    }
  }
}
function drawShots(R, G, B, ctx) {
  for (const s of B.shots) {
    switch (s.k) {
      case 'arrow': { const a = s.a ?? 0; ctx.strokeStyle = s.adv ? '#b8e0a0' : '#e8d8b0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(a) * 7, s.y - Math.sin(a) * 7); ctx.stroke(); break; }
      case 'bolt': { const a = s.a ?? 0; ctx.strokeStyle = '#d0b080'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(a) * 14, s.y - Math.sin(a) * 14); ctx.stroke(); break; }
      case 'shell': case 'boulder': { const h = Math.sin((s.p || 0) * Math.PI) * 26; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, TAU); ctx.fill(); ctx.fillStyle = s.k === 'boulder' ? '#8a7a5a' : '#222'; ctx.beginPath(); ctx.arc(s.x, s.y - h, s.k === 'boulder' ? 5 : 3.5, 0, TAU); ctx.fill(); break; }
      case 'frost': ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(140,210,255,0.9)', 32), s.x - 9, s.y - 9, 18, 18); ctx.globalCompositeOperation = 'source-over'; break;
      case 'missile': ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(200,110,255,0.95)', 32), s.x - 8, s.y - 8, 16, 16); ctx.globalCompositeOperation = 'source-over'; if (Math.random() < 0.5 * R.quality) part(R, { x: s.x, y: s.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 2, color: '#c070ff', add: true }); break;
      case 'fireball': case 'firebolt': { const big = s.k === 'fireball'; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('rgba(255,140,40,0.95)', 32), s.x - (big ? 18 : 10), s.y - (big ? 18 : 10), big ? 36 : 20, big ? 36 : 20); ctx.globalCompositeOperation = 'source-over'; part(R, { x: s.x, y: s.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.35, max: 0.35, size: big ? 5 : 3, color: '#ff8a30', add: true, grow: -4 }); break; }
    }
  }
}
function drawFx(R, G, ctx, dt) {
  // meteors falling: a shadow that grows, a stone that streaks in from the upper right
  R.meteors = R.meteors.filter(m => (m.t += dt) < m.d + 0.05);
  for (const m of R.meteors) {
    const f = Math.min(1, m.t / m.d); const hx = m.x + (1 - f) * 420, hy = m.y - (1 - f) * 620;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + f * 0.35})`; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r * 0.3 * f + 4, m.r * 0.22 * f + 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,120,40,${0.3 + f * 0.4})`; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    const sz = m.big ? 26 : 16;
    ctx.drawImage(glow('rgba(255,150,60,0.95)'), hx - sz * 2, hy - sz * 2, sz * 4, sz * 4);
    for (let i = 0; i < 2 * R.quality; i++) part(R, { x: hx + (Math.random() - 0.5) * 8, y: hy + (Math.random() - 0.5) * 8, vx: 60, vy: -90, life: 0.5, max: 0.5, size: sz * 0.35, color: Math.random() < 0.5 ? '#ff7a20' : '#ffd060', add: true, grow: -sz * 0.5 });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(hx, hy, sz * 0.4, 0, TAU); ctx.fill();
  }
  // flames
  R.flames = R.flames.filter(f => (f.t -= dt) > 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const f of R.flames) { ctx.globalAlpha = f.t * 1.6; ctx.fillStyle = 'rgba(255,120,30,0.35)'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.len, f.a - f.cone, f.a + f.cone); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1;
  // beams
  R.beams = R.beams.filter(b => (b.t -= dt) > 0);
  for (const b of R.beams) { const f = b.t / b.max; ctx.strokeStyle = b.color; ctx.globalAlpha = f; ctx.lineWidth = (b.w || 4) * f; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.tx, b.ty); ctx.stroke(); ctx.lineWidth = (b.w || 4) * 0.35 * f; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  // lightning
  R.bolts = R.bolts.filter(b => (b.t -= dt) > 0);
  for (const b of R.bolts) {
    const f = b.t / b.max; ctx.globalAlpha = f;
    for (const [w, col] of [[b.big ? 7 : 4, 'rgba(180,140,255,0.5)'], [b.big ? 2.5 : 1.5, '#f4eaff']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); b.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // rings
  R.rings = R.rings.filter(r => (r.t -= dt) > 0);
  for (const r of R.rings) { const f = 1 - r.t / r.max; ctx.strokeStyle = r.color; ctx.globalAlpha = (1 - f) * 0.8; ctx.lineWidth = (r.w || 3) * (1 - f) + 0.5; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + f * 0.8), 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // particles
  const keep = [];
  for (const p of R.parts) {
    p.life -= dt; if (p.life <= 0) continue; keep.push(p);
    const d = p.drag ? Math.exp(-p.drag * dt) : 1; p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.debris) { p.vz -= 400 * dt; p.z = Math.max(0, (p.z || 0) + p.vz * dt); if (p.z === 0) { p.vx *= 0.8; p.vy *= 0.8; } }
    if (p.grow) p.size = Math.max(0.3, p.size + p.grow * dt);
    const f = p.life / p.max;
    if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; const rr = p.size * (1.2 - f * 0.4); ctx.drawImage(glow(rgba(p.color, 0.9)), p.x - rr, p.y - rr, rr * 2, rr * 2); continue; }
    if (p.ringP) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - f), 0, TAU); ctx.stroke(); continue; }
    ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    ctx.globalAlpha = p.smoke ? f * 0.35 : f;
    ctx.fillStyle = p.color;
    if (p.streak) { ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); continue; }
    if (p.smoke) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2 - (p.z || 0), p.size, p.size);
  }
  R.parts = keep; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // floating numbers
  R.texts = R.texts.filter(t => (t.t -= dt) > 0); if (R.texts.length > 40) R.texts.splice(0, R.texts.length - 40);
  ctx.font = `bold ${10 / Math.max(0.6, R.cam.z)}px sans-serif`; ctx.textAlign = 'center';
  for (const t of R.texts) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - (1 - t.t) * 16); }
  ctx.globalAlpha = 1;
}
const rgbaCache = new Map();
function rgba(hex, a) { const k = hex + a; let v = rgbaCache.get(k); if (v) return v; if (hex.startsWith('rgb')) return hex; const n = parseInt(hex.slice(1), 16); v = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; rgbaCache.set(k, v); return v; }
export { fmtShort };
