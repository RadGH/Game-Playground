// APPLE BOBBING on a screen. Everything is one 2D canvas picture of a wooden tub at night, cut into lanes (one per
// player, a rope of floats in the seat colour between them). Over each lane hangs the player's face; their apple bobs
// along the water. A glowing band under the face is the bite zone: it turns green and says NOW when a real apple is
// in it, and says "Leave it!" when the rubber spider is about. A bite dunks the face into the water: up it comes with
// the apple in its mouth (crunch!), or dripping (SPLASH!), or with the rubber spider stuck on its nose (Eek!).
//
// A phone that plays draws its own lane big with the others small above it, and a huge BITE button underneath; it
// predicts its own lane with the sim's own functions and only tells the server WHEN it pressed. A watch-only screen
// (the TV) draws one long tub with every lane side by side.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { appleX, settle, bite, newLane } from './sim.js';

const DUNK = 0.42;                                    // seconds a dunk takes (down and up)
const SAY = { red: 'CRUNCH! +1', gold: 'GOLDEN! +3', splash: 'SPLASH!', spider: 'Eek! Rubber spider! -1' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, apples = init.apples, watching = me == null;
  const others = players.filter(p => p.pid !== me);
  ui.innerHTML = `
    <div class="ab-top"><span class="ab-title">Apple Bobbing</span><span class="clock"><b>--</b></span></div>
    <div class="ab-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="ab-tub"><canvas></canvas><div class="ab-count"></div></div>
    <div class="ab-me"><span class="ab-score">0</span><span class="ab-say"></span></div>
    <button class="ab-btn big-btn" aria-label="Bite">BITE!<small>tap when the apple is under your face</small></button>
    <p class="ab-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.ab-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.22 });
  // round 12: three night-time settings, picked from the apples (so every phone in the room shows the same one)
  const SCENES = [
    { id: 'porch', water: ['#3a6fb0', '#173a6a'], leaf: null },
    { id: 'barn', water: ['#4f7fa0', '#1c3550'], leaf: '#e0902a' },
    { id: 'garden', water: ['#2f8f8a', '#12424a'], leaf: '#b7d94a' },
  ];
  const scene = SCENES[Math.floor(((apples[0]?.ph || 0) * 1000)) % SCENES.length];
  ui.classList.add('ab-scene-' + scene.id);
  const leaves = Array.from({ length: scene.leaf ? 5 : 0 }, (_, i) => ({ x: ((i * 0.37 + (apples[1]?.ph || 0)) % 1), s: 0.6 + (i % 3) * 0.25, ph: i * 1.7 }));
  let streak = 0;
  const sparks = [];                                   // gold-apple sparkles: { x, y, vx, vy, at }

  // ---- faces
  const faces = new Map();
  for (const p of players) { if (!p.portrait) continue; const img = new Image(); img.src = p.portrait; faces.set(p.pid, img); }

  // ---- the clock (counted on this device from the moment it saw the game start)
  let phase = 'count', t0 = null, last = null;
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : Math.min(init.play, nowS() - t0));
  function sync(el) {                                  // the server's clock (to half a second, never ahead of the truth): catch up if far behind
    if (t0 == null) { t0 = nowS() - el; return; }
    if (el - myT() > 0.6) t0 = nowS() - el;
  }

  // ---- lanes: mine predicted here, everyone else's from the server
  const lanes = new Map(players.map(p => [p.pid, newLane()]));
  const anim = new Map(players.map(p => [p.pid, { at: -9, r: null, kind: 'red' }]));
  let sentAt = -9, behindSince = null;
  const mine = me != null ? lanes.get(me) : null;
  function fromServer(pid, row) {
    const L = lanes.get(pid); if (!L) return;
    const S = { k: row[0], from: row[1], stun: row[2], score: row[3], red: row[4], gold: row[5], splash: row[6], yuck: row[7] };
    if (pid !== me) { Object.assign(L, S); return; }
    // my own lane: keep the prediction unless the server clearly disagrees for a while (a bite it refused)
    if (nowS() - sentAt < 0.8) return;
    const differs = S.k !== L.k || S.score !== L.score;
    if (!differs) { behindSince = null; return; }
    if (S.k > L.k) { Object.assign(L, S); behindSince = null; return; }
    behindSince ??= nowS();
    if (nowS() - behindSince > 1.6) { Object.assign(L, S, { last: Math.max(L.last, S.stun - 2) }); behindSince = null; }
  }
  function press() {
    if (watching) return;
    if (phase !== 'play') return;
    const t = myT(); settle(mine, apples, t);
    if (mine.k >= apples.length || t < mine.from || t < mine.stun) return;
    const k = mine.k, kind = apples[k].kind, r = bite(mine, apples, t);
    if (!r) return;
    sentAt = nowS(); ctx.send('bite', { k, t: Math.round(t * 1000) / 1000 });
    dunk(me, r, kind);
    const b = $('.ab-btn'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    paintMe();
  }
  function dunk(pid, r, kind) {
    const a = anim.get(pid); if (!a) return; a.at = nowS(); a.r = r; a.kind = kind;
    if (pid === me || watching) {
      if (r === 'splash') { splash(); ctx.sfx('splat'); }
      else if (r === 'spider') { tunes.fx('boing', 0.8); ctx.sfx('bad'); }
      else { crunch(); ctx.sfx(r === 'gold' ? 'coins' : 'good'); }
    }
    if (pid === me) {
      streak = r === 'red' || r === 'gold' ? streak + 1 : 0;
      const s = $('.ab-say'); s.textContent = SAY[r] + (streak >= 3 ? ` · ${streak} in a row!` : ''); s.className = 'ab-say ' + r + (streak >= 3 ? ' streak' : ''); void s.offsetWidth; s.classList.add('pop');
      if (r === 'splash' || r === 'spider') { const tb = $('.ab-tub'); tb.classList.remove('shake'); void tb.offsetWidth; tb.classList.add('shake'); }
      if (r === 'gold') for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; sparks.push({ a, v: 0.6 + (i % 3) * 0.25, at: nowS() }); }
    }
  }
  const btn = $('.ab-btn');
  btn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  canvas.addEventListener('pointerdown', e => { if (!watching) { e.preventDefault(); press(); } });
  const onKey = e => { if (e.repeat || !['Space', 'Enter', 'KeyB', 'ArrowDown'].includes(e.code)) return; e.preventDefault(); press(); };
  addEventListener('keydown', onKey);
  function paintMe() { if (mine) $('.ab-score').textContent = `${mine.score} apple${mine.score === 1 ? '' : 's'}`; }

  // ---- little sounds of our own (crunch, splash), on the tunes context
  let ac = null; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
  const nb = (() => { if (!ac) return null; const b = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate), d = b.getChannelData(0); let s = 3; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } return b; })();
  function burst(at, f0, f1, q, peak, dur, type = 'bandpass') {
    const s = ac.createBufferSource(); s.buffer = nb; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const v = ac.createGain(); v.gain.setValueAtTime(0.0001, at); v.gain.exponentialRampToValueAtTime(peak, at + 0.005); v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(v); v.connect(ac.destination); s.start(at); s.stop(at + dur + 0.05);
  }
  const ok = () => { if (!ac) return false; if (ac.state !== 'running') { ac.resume().catch(() => {}); return false; } return true; };
  function crunch() { if (!ok()) return; const at = ac.currentTime + 0.12; for (const k of [0, 0.05, 0.11]) burst(at + k, 2600, 1200, 1.4, 0.35, 0.05); }
  function splash() { if (!ok()) return; const at = ac.currentTime + 0.1; burst(at, 900, 300, 0.6, 0.5, 0.45, 'lowpass'); burst(at + 0.04, 3200, 1500, 0.8, 0.18, 0.3); }

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();

  /** The tub: night water + wooden front, across a rectangle. Returns the water line. */
  function tub(x, y, w, h) {
    const wy = y + h * 0.58, wh = h * 0.2;
    // the far rim (back of the barrel)
    g.fillStyle = '#5a3418'; g.beginPath(); g.ellipse(x + w / 2, wy, w / 2, wh * 0.55, 0, Math.PI, 0); g.fill();
    // water
    const wg = g.createLinearGradient(0, wy - wh * 0.5, 0, wy + wh); wg.addColorStop(0, scene.water[0]); wg.addColorStop(1, scene.water[1]);
    g.fillStyle = wg; g.beginPath(); g.ellipse(x + w / 2, wy, w / 2 - 4, wh * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x + 4, wy, w - 8, wh * 0.5);
    if (scene.leaf) {                                  // a few leaves drifting on the water
      const tt = nowS(); g.fillStyle = scene.leaf;
      for (const L of leaves) { const lx = x + 10 + ((L.x + tt * 0.012 * L.s) % 1) * (w - 20), ly = wy + Math.sin(tt * 1.3 + L.ph) * wh * 0.12 + wh * 0.05 * L.s;
        g.save(); g.translate(lx, ly); g.rotate(Math.sin(tt * 0.7 + L.ph) * 0.6); g.beginPath(); g.ellipse(0, 0, wh * 0.22 * L.s, wh * 0.09 * L.s, 0, 0, 7); g.fill(); g.restore(); }
    }
    // front of the tub: staves and two iron hoops
    const fy = wy + wh * 0.25, fh = y + h - fy;
    const fg = g.createLinearGradient(x, 0, x + w, 0); fg.addColorStop(0, '#6b3d1c'); fg.addColorStop(0.5, '#a0622e'); fg.addColorStop(1, '#6b3d1c');
    g.fillStyle = fg; g.beginPath(); g.moveTo(x, fy); g.ellipse(x + w / 2, fy, w / 2, wh * 0.45, 0, Math.PI, 0, true); g.lineTo(x + w - w * 0.03, y + h); g.lineTo(x + w * 0.03, y + h); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,20,8,.55)'; g.lineWidth = 2;
    for (let i = 1; i < Math.max(6, w / 46); i++) { const sx = x + i * w / Math.max(6, Math.ceil(w / 46)); g.beginPath(); g.moveTo(sx, fy + 6); g.lineTo(sx, y + h); g.stroke(); }
    g.strokeStyle = '#2b2b33'; g.lineWidth = Math.max(4, h * 0.03);
    for (const k of [0.3, 0.75]) { const hy = fy + fh * k; g.beginPath(); g.moveTo(x + 2, hy); g.lineTo(x + w - 2, hy); g.stroke(); }
    return wy;
  }
  function appleShape(cx, cy, r, kind, t) {
    g.save(); g.translate(cx, cy);
    if (kind === 'spider') {
      g.strokeStyle = '#1b1426'; g.lineWidth = Math.max(2, r * 0.16); g.lineCap = 'round';
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const a = -0.5 + i * 0.38, wig = Math.sin(t * 8 + i) * 0.12; g.beginPath(); g.moveTo(s * r * 0.5, 0); g.quadraticCurveTo(s * r * 1.3, -r * (0.7 - i * 0.35 + wig), s * r * (1.5 + i * 0.05), r * (0.2 + a * 0.6)); g.stroke(); }
      g.fillStyle = '#2a1f3a'; g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-r * 0.3, -r * 0.2, r * 0.3, 0, 7); g.arc(r * 0.3, -r * 0.2, r * 0.3, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.25 + Math.sin(t * 3) * r * 0.08, -r * 0.15, r * 0.14, 0, 7); g.arc(r * 0.35 + Math.sin(t * 3) * r * 0.08, -r * 0.15, r * 0.14, 0, 7); g.fill();
      g.strokeStyle = '#ff9ec8'; g.lineWidth = Math.max(2, r * 0.1); g.beginPath(); g.arc(0, r * 0.15, r * 0.3, 0.3, Math.PI - 0.3); g.stroke();
      g.restore(); return;
    }
    const gold = kind === 'gold', gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    if (gold) { gr.addColorStop(0, '#fff7c2'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#c98a10'); } else { gr.addColorStop(0, '#ff8a8a'); gr.addColorStop(0.5, '#e8283d'); gr.addColorStop(1, '#8a1020'); }
    g.fillStyle = gr; g.strokeStyle = '#3a0d12'; g.lineWidth = Math.max(2, r * 0.09);
    g.beginPath(); g.moveTo(0, -r * 0.7); g.bezierCurveTo(r * 0.7, -r * 1.15, r * 1.25, -r * 0.2, r * 0.85, r * 0.55); g.bezierCurveTo(r * 0.55, r * 1.05, r * 0.15, r * 0.95, 0, r * 0.85);
    g.bezierCurveTo(-r * 0.15, r * 0.95, -r * 0.55, r * 1.05, -r * 0.85, r * 0.55); g.bezierCurveTo(-r * 1.25, -r * 0.2, -r * 0.7, -r * 1.15, 0, -r * 0.7); g.fill(); g.stroke();
    g.strokeStyle = '#4a2a10'; g.lineWidth = Math.max(2, r * 0.12); g.beginPath(); g.moveTo(0, -r * 0.65); g.quadraticCurveTo(r * 0.05, -r * 1.05, r * 0.2, -r * 1.2); g.stroke();
    g.fillStyle = '#3ecf5a'; g.beginPath(); g.ellipse(r * 0.42, -r * 1.02, r * 0.3, r * 0.14, -0.5, 0, 7); g.fill();
    if (gold) { const s = (Math.sin(t * 6) + 1) / 2; g.fillStyle = `rgba(255,255,255,${0.5 + s * 0.5})`; for (const [sx, sy, sr] of [[-r * 0.9, -r * 0.8, r * 0.22], [r * 1.0, r * 0.1, r * 0.16]]) { g.beginPath(); g.moveTo(sx, sy - sr); g.lineTo(sx + sr * 0.3, sy); g.lineTo(sx, sy + sr); g.lineTo(sx - sr * 0.3, sy); g.closePath(); g.fill(); g.beginPath(); g.moveTo(sx - sr, sy); g.lineTo(sx, sy + sr * 0.3); g.lineTo(sx + sr, sy); g.lineTo(sx, sy - sr * 0.3); g.closePath(); g.fill(); } }
    g.restore();
  }
  function head(p, cx, cy, r, wet = 0) {
    // the face in a seat-colour ring (wet = a blue wash over it while you wipe your eyes)
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = p.color; g.fill(); g.clip();
    const img = faces.get(p.pid);
    if (img?.complete && img.naturalWidth) g.drawImage(img, cx - r * 1.12, cy - r * 1.1, r * 2.24, r * 2.24);
    if (wet > 0) { g.fillStyle = `rgba(90,170,255,${0.35 * wet})`; g.fillRect(cx - r, cy - r * 0.2, r * 2, r * 1.3); }
    g.restore();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = Math.max(3, r * 0.1); g.strokeStyle = p.color; g.stroke();
  }
  /** One lane: zone, apple, face, captions. */
  function lane(p, x, y, w, h, wy, t, big) {
    const L0 = lanes.get(p.pid); const L = p.pid === me ? L0 : { ...L0 }; settle(L, apples, t);
    const cx = x + w / 2, ar = Math.max(9, Math.min(w * 0.09, h * 0.085)), span = w / 2 - ar * 1.6;
    const fr = Math.max(14, Math.min(w * 0.16, h * 0.15)), a = anim.get(p.pid), da = nowS() - a.at;
    const ap = L.k < apples.length ? apples[L.k] : null, up = ap && t >= L.from, ax = up ? appleX(ap, t - L.from) : 0;
    const inZone = up && Math.abs(ax) <= init.zone[ap.kind], stunned = t < L.stun;
    // the bite zone under the face
    const zw = (init.zone[ap?.kind || 'red']) * span;
    const zc = !up || stunned ? 'rgba(255,255,255,.10)' : ap.kind === 'spider' ? 'rgba(255,95,95,.22)' : inZone ? 'rgba(62,207,90,.55)' : 'rgba(255,210,63,.22)';
    g.fillStyle = zc; g.fillRect(cx - zw, y + h * 0.12, zw * 2, wy - (y + h * 0.12) + h * 0.06);
    g.strokeStyle = !up || stunned ? 'rgba(255,255,255,.25)' : ap.kind === 'spider' ? '#ff5f5f' : inZone ? '#3ecf5a' : 'rgba(255,210,63,.7)';
    g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(cx - zw, y + h * 0.14); g.lineTo(cx - zw, wy + h * 0.05); g.moveTo(cx + zw, y + h * 0.14); g.lineTo(cx + zw, wy + h * 0.05); g.stroke(); g.setLineDash([]);
    // the apple (with ripples), unless it is in someone's mouth
    const ay = wy + Math.sin(t * 3.1 + L.k) * ar * 0.12;
    if (up && !(da < DUNK && a.r !== 'splash')) {
      const px = cx + ax * span;
      g.strokeStyle = 'rgba(200,230,255,.45)'; g.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const k = ((t * 0.9 + i * 0.5) % 1); g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(px, ay + ar * 0.55, ar * (1 + k * 1.2), ar * (0.3 + k * 0.3), 0, 0, 7); g.stroke(); }
      g.globalAlpha = 1;
      appleShape(px, ay, ar, ap.kind, t);
    }
    // the face: hangs over the middle; a dunk goes down to the water and back up
    let fy = y + h * 0.26 + Math.sin(t * 2 + p.pid) * h * 0.01;
    if (da < DUNK) { const k = da / DUNK, dip = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; fy += (wy - fr * 0.4 - fy) * Math.sin(dip * Math.PI / 2); }
    head(p, cx, fy, fr, a.r === 'splash' && da > DUNK * 0.4 ? Math.max(0, 1 - da / (init.timing.splash + 0.3)) : 0);
    // what came up with you
    if (a.r && da < 1.3) {
      if ((a.r === 'red' || a.r === 'gold') && da > DUNK * 0.4) {
        if (da < DUNK + 0.25) appleShape(cx, fy + fr * 0.85, ar * 0.9, a.r, t);
        else { const k = Math.min(1, (da - DUNK - 0.25) / 0.5); appleShape(cx + (w * 0.42) * k, fy + fr * 0.85 - (fy - y) * k * 1.4, ar * 0.9 * (1 - k * 0.5), a.r, t); }
      }
    }
    if (a.r === 'spider' && t < L.stun + 0.1 && da > DUNK * 0.4) appleShape(cx + fr * 0.2, fy + fr * 0.15, ar * 0.8, 'spider', t);
    if (a.r === 'splash' && da < init.timing.splash + 0.2) {
      g.fillStyle = 'rgba(120,190,255,.85)';
      for (let i = 0; i < 6; i++) { const dx = Math.sin(i * 2.3) * fr * 0.7, dy = ((da * 1.4 + i * 0.17) % 1) * fr * 1.4 - fr * 0.3; g.beginPath(); g.ellipse(cx + dx, fy + dy, fr * 0.07, fr * 0.11, 0, 0, 7); g.fill(); }
    }
    // captions
    const fs = Math.round(Math.max(12, Math.min(26, h * (big ? 0.075 : 0.1))));
    g.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
    const say = (txt, col, yy) => { g.lineWidth = 4; g.strokeStyle = '#0d2228'; g.strokeText(txt, cx, yy); g.fillStyle = col; g.fillText(txt, cx, yy); };
    if (a.r && da < 1.0) say(a.r === 'splash' ? 'SPLASH!' : a.r === 'spider' ? 'Eek! -1' : a.r === 'gold' ? '+3!' : '+1', a.r === 'splash' ? '#9fd4ff' : a.r === 'spider' ? '#ff5f5f' : '#ffd23f', y + h * 0.1 + fs);
    else if (big && up && !stunned) say(ap.kind === 'spider' ? 'Leave it!' : inZone ? 'NOW!' : '', ap.kind === 'spider' ? '#ff9a9a' : '#7dff8a', y + fs + 4);
    if (!big || watching) { g.font = `800 ${Math.max(11, fs * 0.7)}px "Baloo 2", system-ui, sans-serif`; say(`${p.name}: ${L.score}`, '#fff', y + h - 8); }
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (watching || !mine) {
      const pad = 8, n = players.length, wy = tub(pad, pad, W - pad * 2, H - pad * 2), lw = (W - pad * 2) / n;
      players.forEach((p, i) => lane(p, pad + i * lw, pad, lw, H - pad * 2, wy, t, true));
      g.lineWidth = 3;
      for (let i = 1; i < n; i++) { const lx = pad + i * lw; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(lx, wy - 6); g.lineTo(lx, wy + 10); g.stroke(); for (let j = 0; j < 3; j++) { g.fillStyle = players[i].color; g.beginPath(); g.arc(lx, wy - 4 + j * 6, 4, 0, 7); g.fill(); } }
      return;
    }
    // a phone: the others small in a strip at the top, mine big below
    const stripH = others.length ? Math.min(H * 0.32, 150) : 0;
    if (others.length) {
      const wy = tub(4, 2, W - 8, stripH - 4), lw = (W - 8) / others.length;
      others.forEach((p, i) => lane(p, 4 + i * lw, 2, lw, stripH - 4, wy, t, false));
    }
    const y0 = stripH + 4, wy = tub(4, y0, W - 8, H - y0 - 2);
    lane(players.find(p => p.pid === me), 4, y0, W - 8, H - y0 - 2, wy, t, true);
    // gold sparkles burst from my face
    const now = nowS(), cx = W / 2, cy = y0 + (H - y0) * 0.3;
    for (let i = sparks.length - 1; i >= 0; i--) { const sp = sparks[i], k = (now - sp.at) / 0.8; if (k >= 1) { sparks.splice(i, 1); continue; }
      const d = 20 + k * 110 * sp.v, sx = cx + Math.cos(sp.a) * d, sy = cy + Math.sin(sp.a) * d * 0.7, r = 7 * (1 - k);
      g.fillStyle = `rgba(255,${200 + Math.round(55 * (1 - k))},80,${1 - k})`; g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r * 0.35, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r * 0.35, sy); g.closePath(); g.fill(); }
  }

  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Get ready to bob for apples!' : 'Press BITE (or Space) when the apple is under your face.';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.l[me]?.[3] ?? 0, m = init.medals; return `${s} apples — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      const rows = players.map(p => [p, gs.l[p.pid]?.[3] ?? 0]), top = Math.max(...rows.map(r => r[1])), lead = rows.filter(r => r[1] === top && top > 0);
      return lead.length === 1 ? `Towels, please! ${lead[0][0].name} bobbed the most: ${top} apple${top === 1 ? '' : 's'}!` : 'Towels, please!';
    }
    if (init.solo) return `Medals: bronze ${init.medals[0]}, silver ${init.medals[1]}, gold ${init.medals[2]}.`;
    return '';
  }
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { t0 = null; sync(gs.el || 0); tunes.start('spooky'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      if (gs.phase === 'play') sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase;
      $('.clock b').textContent = gs.left;
      $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.ab-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.l).map(r => r[3]));
      for (const [pid, row] of Object.entries(gs.l)) {
        fromServer(+pid, row);
        const c = ui.querySelector(`.ab-board [data-pid="${pid}"]`); if (!c) continue;
        c.querySelector('.sc').textContent = row[3]; c.classList.toggle('lead', row[3] === best && best > 0);
      }
      paintMe();
      $('.ab-note').textContent = note(gs);
      last = gs;
    },
    event(ev) { if (ev.e === 'bite' && ev.pid !== me) dunk(ev.pid, ev.r, ev.r); },
    frame() {
      const t = phase === 'count' ? 0 : myT();
      if (mine && phase === 'play') { const can = t >= mine.from && t >= mine.stun; btn.classList.toggle('wait', !can); }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); try { ac?.close(); } catch { /* closed */ } },
  };
}
