// PIE TOSS on a screen: one 2D canvas picture of a pie booth — a striped awning, a painted back wall, three wooden
// rails with painted face cut-outs on sticks sliding along them (or swinging up from behind the counter), and a
// counter in front piled with cream pies. Tap the booth: a pie in your seat colour flies there in a short arc and
// SPLATS (whipped cream all over the face, which flips down) or plops on the wall. Everyone's pies are drawn, so you
// can see a splat being stolen. The cut-outs move on this phone's own clock (toss-kit.js createPhoneClock), the same
// motion the server judges with. Halloween: the faces become a pumpkin, a ghost, a mummy… and Granny wears an orange bow.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock, arcY } from '../toss-kit.js';
import { targetAt } from './sim.js';

const SAY = { face: '+1 SPLAT!', gold: 'GOLDEN SPLAT! +3', granny: 'Oh no, Granny! -3' };
const HW_LOOK = { clown: 'pumpkin', bear: 'wolfie', pirate: 'skully', robot: 'frankie', frog: 'witch', strongman: 'vampy', knight: 'mummy', owl: 'ghost' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const BW = init.bw, BH = init.bh, targets = init.targets;
  ui.innerHTML = `
    <div class="pt-top"><span class="pt-title">${HW ? 'Spooky Pie Toss' : 'Pie Toss'}</span><span class="clock"><b>--</b></span></div>
    <div class="pt-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="pt-booth"><canvas></canvas><div class="pt-count"></div></div>
    <div class="pt-me"><span class="pt-pie" title="pie ready"></span><span class="pt-say"></span></div>
    <p class="pt-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.pt-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.2 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 1);
  const byPid = new Map(players.map(p => [p.pid, p]));
  const seatX = p => BW * (players.length === 1 ? 0.5 : 0.18 + 0.64 * (players.indexOf(p) / Math.max(1, players.length - 1)));

  // ---- what is happening: pies in the air, splats on faces, plops on the wall
  const flying = [];            // { pid, x, y, t, T, mine }
  const splatAt = new Map();    // target id -> { T, pid }
  const plops = [];             // { x, y, at, color }
  let phase = 'count', lastThrow = -9, sayT = 0;
  function throwAt(x, y) {
    if (watching || phase !== 'play') return;
    const t = clock.t(); if (t - lastThrow < init.reload) return;
    lastThrow = t;
    ctx.send('throw', { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, t: Math.round(t * 1000) / 1000 });
    flying.push({ pid: me, x, y, t, T: t + init.flight, mine: true }); ctx.sfx('throw');
  }
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); const r = canvas.getBoundingClientRect(), b = boothBox();
    throwAt((e.clientX - r.left - b.x) / b.k, (e.clientY - r.top - b.y) / b.k);
  });

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  /** Booth units -> canvas pixels: the 160 x 100 booth fitted into the canvas (with room for the counter below). */
  function boothBox() { const k = Math.min(W / BW, H / (BH + 22)); return { k, x: (W - BW * k) / 2, y: (H - (BH + 22) * k) / 2 + 4 * k }; }
  const C = HW ? { sky: ['#2a1d4a', '#140f26'], wall: '#3b2c5c', wall2: '#33264f', awn: ['#ff8a1a', '#2a1d4a'], rail: '#6b4a2a', counter: '#5a3a22', counterTop: '#7a5230', text: '#ffd9a8' }
    : { sky: ['#bfe8ff', '#8fd0f5'], wall: '#ffe7b8', wall2: '#ffd98f', awn: ['#e8394a', '#ffffff'], rail: '#8a5a32', counter: '#b06a3a', counterTop: '#d68a4a', text: '#7a3a12' };

  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function face(look, x, y, s, flip, splat) {
    // a painted wooden cut-out, centred on (x, y), radius ~11*s units (already in pixels)
    g.save(); g.translate(x, y); g.scale(1, Math.max(0.05, flip));
    const R = s, L = HW ? (HW_LOOK[look] || look) : look;
    const disc = (r, fill, cx = 0, cy = 0) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke(); };
    g.lineWidth = Math.max(1.5, R * 0.09); g.strokeStyle = '#0d2228'; g.lineJoin = 'round';
    const eyes = (dx = 0.34, dy = -0.12, r = 0.12, fill = '#0d2228') => { disc(R * r, fill, -R * dx, R * dy); disc(R * r, fill, R * dx, R * dy); };
    const smile = (w = 0.42, y0 = 0.22) => { g.beginPath(); g.arc(0, R * y0 - R * 0.12, R * w, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); };
    switch (L) {
      case 'clown': disc(R * 0.32, '#ff8a1a', -R * 0.85, -R * 0.45); disc(R * 0.32, '#ff8a1a', R * 0.85, -R * 0.45); disc(R, '#fff8ef'); eyes(0.36, -0.15, 0.1, '#2f7ff0'); disc(R * 0.2, '#e8394a', 0, R * 0.08); smile(0.48, 0.3); break;
      case 'bear': disc(R * 0.32, '#8a5a32', -R * 0.72, -R * 0.72); disc(R * 0.32, '#8a5a32', R * 0.72, -R * 0.72); disc(R, '#a8703c'); g.beginPath(); g.ellipse(0, R * 0.3, R * 0.45, R * 0.34, 0, 0, Math.PI * 2); g.fillStyle = '#e8c79a'; g.fill(); g.stroke(); eyes(0.36, -0.2); disc(R * 0.13, '#0d2228', 0, R * 0.16); break;
      case 'pirate': disc(R, '#f2c49a'); g.beginPath(); g.moveTo(-R, -R * 0.15); g.quadraticCurveTo(0, -R * 1.5, R, -R * 0.15); g.closePath(); g.fillStyle = '#e8394a'; g.fill(); g.stroke(); disc(R * 0.1, '#0d2228', R * 0.35, -R * 0.05); g.fillStyle = '#0d2228'; g.beginPath(); g.ellipse(-R * 0.35, -R * 0.05, R * 0.2, R * 0.16, 0, 0, Math.PI * 2); g.fill(); smile(0.4, 0.35); break;
      case 'robot': rr(-R * 0.9, -R * 0.85, R * 1.8, R * 1.7, R * 0.25); g.fillStyle = '#b8c4cc'; g.fill(); g.stroke(); g.fillStyle = '#39d0e0'; rr(-R * 0.6, -R * 0.35, R * 0.4, R * 0.25, 3); g.fill(); g.stroke(); rr(R * 0.2, -R * 0.35, R * 0.4, R * 0.25, 3); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -R * 0.85); g.lineTo(0, -R * 1.25); g.stroke(); disc(R * 0.14, '#e8394a', 0, -R * 1.3); g.strokeRect(-R * 0.4, R * 0.3, R * 0.8, R * 0.2); break;
      case 'frog': disc(R * 0.32, '#4fc35a', -R * 0.5, -R * 0.75); disc(R * 0.32, '#4fc35a', R * 0.5, -R * 0.75); disc(R, '#4fc35a'); disc(R * 0.16, '#fff', -R * 0.5, -R * 0.75); disc(R * 0.16, '#fff', R * 0.5, -R * 0.75); disc(R * 0.08, '#0d2228', -R * 0.5, -R * 0.72); disc(R * 0.08, '#0d2228', R * 0.5, -R * 0.72); smile(0.62, 0.25); break;
      case 'strongman': disc(R, '#f2b98a'); eyes(0.34, -0.2); g.fillStyle = '#0d2228'; g.beginPath(); g.ellipse(-R * 0.28, R * 0.2, R * 0.32, R * 0.12, 0.3, 0, Math.PI * 2); g.ellipse(R * 0.28, R * 0.2, R * 0.32, R * 0.12, -0.3, 0, Math.PI * 2); g.fill(); smile(0.25, 0.55); break;
      case 'knight': disc(R, '#cfd6dd'); g.fillStyle = '#0d2228'; g.fillRect(-R * 0.6, -R * 0.2, R * 1.2, R * 0.16); g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(R * 0.6, -R * 1.6, R * 0.2, -R * 1.5); g.lineWidth = R * 0.25; g.strokeStyle = '#e8394a'; g.stroke(); g.lineWidth = Math.max(1.5, R * 0.09); g.strokeStyle = '#0d2228'; g.beginPath(); g.moveTo(0, -R * 0.1); g.lineTo(0, R * 0.8); g.stroke(); break;
      case 'owl': disc(R, '#c8834a'); disc(R * 0.32, '#ffd23f', -R * 0.38, -R * 0.15); disc(R * 0.32, '#ffd23f', R * 0.38, -R * 0.15); disc(R * 0.13, '#0d2228', -R * 0.38, -R * 0.15); disc(R * 0.13, '#0d2228', R * 0.38, -R * 0.15); g.beginPath(); g.moveTo(-R * 0.12, R * 0.15); g.lineTo(R * 0.12, R * 0.15); g.lineTo(0, R * 0.42); g.closePath(); g.fillStyle = '#ff8a1a'; g.fill(); g.stroke(); break;
      case 'gold': disc(R * 1.05, '#ffd23f'); g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(-R * 0.35, -R * 0.4, R * 0.25, 0, Math.PI * 2); g.fill(); star(-R * 0.34, -R * 0.12, R * 0.2); star(R * 0.34, -R * 0.12, R * 0.2); smile(0.45, 0.32);
        g.fillStyle = '#ffb300'; g.beginPath(); g.moveTo(-R * 0.6, -R * 0.85); g.lineTo(-R * 0.6, -R * 1.35); g.lineTo(-R * 0.3, -R * 1.05); g.lineTo(0, -R * 1.45); g.lineTo(R * 0.3, -R * 1.05); g.lineTo(R * 0.6, -R * 1.35); g.lineTo(R * 0.6, -R * 0.85); g.closePath(); g.fill(); g.stroke(); break;
      case 'granny':
        disc(R * 0.45, '#d9dde3', 0, -R * 1.0); disc(R, '#ffd9c7'); g.beginPath(); g.arc(0, -R * 0.15, R * 1.0, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = R * 0.32; g.strokeStyle = '#d9dde3'; g.stroke(); g.lineWidth = Math.max(1.5, R * 0.09); g.strokeStyle = '#0d2228';
        disc(R * 0.14, '#ff9ab8', -R * 0.55, R * 0.22); disc(R * 0.14, '#ff9ab8', R * 0.55, R * 0.22);
        g.beginPath(); g.arc(-R * 0.32, -R * 0.1, R * 0.22, 0, Math.PI * 2); g.moveTo(R * 0.54, -R * 0.1); g.arc(R * 0.32, -R * 0.1, R * 0.22, 0, Math.PI * 2); g.moveTo(-R * 0.1, -R * 0.1); g.lineTo(R * 0.1, -R * 0.1); g.stroke();
        disc(R * 0.06, '#0d2228', -R * 0.32, -R * 0.1); disc(R * 0.06, '#0d2228', R * 0.32, -R * 0.1); smile(0.3, 0.42);
        if (HW) { g.fillStyle = '#ff8a1a'; g.beginPath(); g.ellipse(-R * 0.55, -R * 1.05, R * 0.3, R * 0.18, -0.4, 0, Math.PI * 2); g.ellipse(R * 0.55, -R * 1.05, R * 0.3, R * 0.18, 0.4, 0, Math.PI * 2); g.fill(); g.stroke(); }   // a pumpkin-orange bow, not a hat (the witch has the hat)
        break;
      // Halloween faces (looks only)
      case 'pumpkin': g.beginPath(); g.ellipse(0, 0, R * 1.05, R * 0.92, 0, 0, Math.PI * 2); g.fillStyle = '#ff8a1a'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(R * 0.15, -R * 1.25); g.lineWidth = R * 0.18; g.strokeStyle = '#3f7a2a'; g.stroke(); g.lineWidth = Math.max(1.5, R * 0.09); g.strokeStyle = '#0d2228';
        g.fillStyle = '#ffe14a'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * R * 0.2, -R * 0.05); g.lineTo(sx * R * 0.55, -R * 0.05); g.lineTo(sx * R * 0.38, -R * 0.38); g.closePath(); g.fill(); g.stroke(); } smile(0.5, 0.3); break;
      case 'ghost': g.beginPath(); g.moveTo(-R * 0.9, R); g.lineTo(-R * 0.9, -R * 0.1); g.arc(0, -R * 0.1, R * 0.9, Math.PI, 0); g.lineTo(R * 0.9, R); for (let i = 0; i < 4; i++) g.lineTo(R * (0.9 - (i + 0.5) * 0.45), R * (i % 2 ? 1 : 0.75)); g.closePath(); g.fillStyle = '#f4f6ff'; g.fill(); g.stroke(); g.fillStyle = '#0d2228'; g.beginPath(); g.ellipse(-R * 0.32, -R * 0.15, R * 0.12, R * 0.18, 0, 0, Math.PI * 2); g.ellipse(R * 0.32, -R * 0.15, R * 0.12, R * 0.18, 0, 0, Math.PI * 2); g.fill(); smile(0.25, 0.45); break;
      case 'mummy': disc(R, '#efe6cf'); g.save(); g.clip(); g.strokeStyle = '#b8a888'; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-R, i * R * 0.3); g.lineTo(R, i * R * 0.3 + R * 0.15); g.stroke(); } g.restore(); g.strokeStyle = '#0d2228'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#0d2228'; g.fillRect(-R * 0.6, -R * 0.25, R * 1.2, R * 0.22); disc(R * 0.09, '#ffd23f', -R * 0.3, -R * 0.14); disc(R * 0.09, '#ffd23f', R * 0.3, -R * 0.14); break;
      case 'frankie': rr(-R * 0.85, -R * 0.9, R * 1.7, R * 1.8, R * 0.2); g.fillStyle = '#8fd07a'; g.fill(); g.stroke(); g.fillStyle = '#0d2228'; g.fillRect(-R * 0.85, -R * 0.9, R * 1.7, R * 0.4); disc(R * 0.14, '#b8c4cc', -R * 1.0, R * 0.3); disc(R * 0.14, '#b8c4cc', R * 1.0, R * 0.3); eyes(0.32, 0.0); g.beginPath(); g.moveTo(-R * 0.35, R * 0.5); g.lineTo(R * 0.35, R * 0.5); g.stroke(); break;
      case 'witch': disc(R, '#9be07a'); eyes(0.34, -0.05); smile(0.4, 0.4); g.fillStyle = '#2a1d4a'; g.beginPath(); g.moveTo(-R * 1.2, -R * 0.55); g.lineTo(R * 1.2, -R * 0.55); g.lineTo(-R * 0.1, -R * 2.0); g.closePath(); g.fill(); g.stroke(); break;
      case 'vampy': disc(R, '#e6e6f2'); g.fillStyle = '#0d2228'; g.beginPath(); g.moveTo(-R, -R * 0.2); g.quadraticCurveTo(0, -R * 1.4, R, -R * 0.2); g.lineTo(0, -R * 0.45); g.closePath(); g.fill(); eyes(0.34, 0.05); smile(0.32, 0.45); break;
      case 'wolfie': disc(R * 0.32, '#8a8f9a', -R * 0.72, -R * 0.78); disc(R * 0.32, '#8a8f9a', R * 0.72, -R * 0.78); disc(R, '#9aa0ab'); g.beginPath(); g.ellipse(0, R * 0.3, R * 0.45, R * 0.32, 0, 0, Math.PI * 2); g.fillStyle = '#e6e6ee'; g.fill(); g.stroke(); eyes(0.36, -0.2, 0.12, '#ffd23f'); disc(R * 0.13, '#0d2228', 0, R * 0.15); break;
      case 'skully': disc(R, '#f6f2e6'); disc(R * 0.24, '#0d2228', -R * 0.35, -R * 0.1); disc(R * 0.24, '#0d2228', R * 0.35, -R * 0.1); disc(R * 0.08, '#0d2228', 0, R * 0.25); smile(0.38, 0.45); break;
      default: disc(R, '#ffd9a8'); eyes(); smile();
    }
    if (splat) { // whipped cream all over it
      g.fillStyle = '#fffdf6'; g.strokeStyle = '#d8cfc0'; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rad = R * (i % 2 ? 0.75 : 1.15); i ? g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.9) : g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.9); } g.closePath(); g.fill(); g.stroke();
      g.fillStyle = splat; g.beginPath(); g.arc(R * 0.1, -R * 0.05, R * 0.28, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  function star(x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); g.fillStyle = '#fff'; g.fill(); g.stroke(); }
  function pie(x, y, r, color) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#c98a3a'; g.strokeStyle = '#0d2228'; g.lineWidth = Math.max(1.5, r * 0.15);
    g.beginPath(); g.ellipse(0, r * 0.2, r, r * 0.55, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fffdf6'; g.beginPath(); g.ellipse(0, 0, r * 0.85, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(0, -r * 0.12, r * 0.22, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const b = boothBox(), k = b.k, X = u => b.x + u * k, Y = v => b.y + v * k;
    // back wall + awning
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, C.sky[0]); sky.addColorStop(1, C.sky[1]); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = C.wall; g.fillRect(X(0), Y(6), BW * k, (BH - 2) * k);
    g.fillStyle = C.wall2; for (let i = 0; i < 10; i++) if (i % 2) g.fillRect(X(i * 16), Y(6), 16 * k, (BH - 2) * k);
    for (let i = 0; i < 12; i++) { g.fillStyle = C.awn[i % 2]; g.beginPath(); g.moveTo(X(i * BW / 12), Y(-6)); g.lineTo(X((i + 1) * BW / 12), Y(-6)); g.lineTo(X((i + 1) * BW / 12), Y(6)); g.arc(X((i + 0.5) * BW / 12), Y(6), BW / 24 * k, 0, Math.PI); g.closePath(); g.fill(); }
    g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.strokeRect(X(0), Y(-6), BW * k, (BH + 2) * k);
    if (HW) for (let i = 0; i < 9; i++) { g.fillStyle = ['#ff8a1a', '#b57bff', '#7dff5a'][i % 3]; g.beginPath(); g.arc(X(8 + i * 18), Y(10 + (i % 2) * 2), 2.2 * k, 0, Math.PI * 2); g.fill(); }
    // wall plops
    for (let i = plops.length - 1; i >= 0; i--) { const P = plops[i], a = nowS() - P.at; if (a > 2.5) { plops.splice(i, 1); continue; } g.globalAlpha = Math.max(0, 1 - a / 2.5); g.fillStyle = '#fffdf6'; g.beginPath(); g.ellipse(X(P.x), Y(P.y) + a * 4 * k, 5 * k, 3.6 * k, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    // rails, back to front, each with its cut-outs
    for (let r = 0; r < init.rails.length; r++) {
      const R = init.rails[r], ry = Y(R.y + init.faceH * R.s + 4);
      for (const c of targets) {
        if (c.rail !== r || t < c.t0 - 0.05 || t > c.t1 + 0.6) continue;
        const hitInfo = splatAt.get(c.id), sp = hitInfo && t >= hitInfo.T;
        let p = targetAt(c, Math.min(t, c.t1)); if (!p && !sp) continue;
        if (!p) p = targetAt(c, Math.min(c.t1, hitInfo.T)); if (!p) continue;
        let up = p.up;
        if (sp) { const a = t - hitInfo.T; up = a < 0.35 ? 1 : Math.max(0, 1 - (a - 0.35) / 0.3); if (up <= 0) continue; p = { ...targetAt(c, Math.min(c.t1, hitInfo.T)) || p }; }
        const px = X(p.x), py = Y(p.y), s = init.faceR * p.s * k;
        g.strokeStyle = '#0d2228'; g.lineWidth = Math.max(2, s * 0.14); g.fillStyle = '#a0703a';
        const stickTop = py + s * 0.6, stickBot = ry;
        g.save(); g.beginPath(); g.rect(0, 0, W, ry); g.clip();
        const lift = (1 - up) * (s * 2.4);
        g.fillRect(px - s * 0.12, stickTop + lift, s * 0.24, stickBot - stickTop); g.strokeRect(px - s * 0.12, stickTop + lift, s * 0.24, stickBot - stickTop);
        face(c.look, px, py + lift, s, 1, sp ? (byPid.get(hitInfo.pid)?.color || '#ff5f5f') : null);
        g.restore();
      }
      g.fillStyle = C.rail; g.fillRect(X(0), ry, BW * k, 4 * k); g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.strokeRect(X(0), ry, BW * k, 4 * k);
    }
    // counter with pies
    g.fillStyle = C.counter; g.fillRect(X(-4), Y(BH), (BW + 8) * k, 22 * k); g.fillStyle = C.counterTop; g.fillRect(X(-4), Y(BH), (BW + 8) * k, 5 * k);
    g.strokeStyle = '#0d2228'; g.strokeRect(X(-4), Y(BH), (BW + 8) * k, 22 * k);
    for (const p of players) { const x = X(seatX(p)); pie(x, Y(BH + 12), 6 * k, p.color); if (p.pid === me) { g.fillStyle = '#fff'; g.font = `900 ${Math.round(5 * k)}px sans-serif`; g.textAlign = 'center'; g.fillText('YOU', x, Y(BH + 21)); } }
    // pies in the air
    for (let i = flying.length - 1; i >= 0; i--) {
      const F = flying[i], u = (t - F.t) / (F.T - F.t);
      if (u >= 1) { flying.splice(i, 1); continue; }
      if (u < 0) continue;
      const p = byPid.get(F.pid), sx = seatX(p), sy = BH + 8;
      const x = sx + (F.x - sx) * u, y = sy + (F.y - sy) * u - arcY(u, 26);
      if (F.mine) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.beginPath(); g.arc(X(F.x), Y(F.y), 5 * k, 0, Math.PI * 2); g.moveTo(X(F.x) - 7 * k, Y(F.y)); g.lineTo(X(F.x) + 7 * k, Y(F.y)); g.moveTo(X(F.x), Y(F.y) - 7 * k); g.lineTo(X(F.x), Y(F.y) + 7 * k); g.stroke(); }
      pie(X(x), Y(y), (7 - 2.5 * u) * k, p?.color || '#fff');
    }
  }
  function say(text, cls) { const s = $('.pt-say'); s.textContent = text; s.className = 'pt-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }

  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Pies at the ready!' : 'Tap the booth to throw. Aim ahead of a moving face!';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      return 'What a mess!';
    }
    if (init.solo) return `Medals: bronze ${init.medals[0]}, silver ${init.medals[1]}, gold ${init.medals[2]}.`;
    return watching ? '' : 'Gold faces 3 · leave Granny alone!';
  }
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'jig'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase;
      for (const [id, pid] of gs.hit || []) if (!splatAt.has(id)) splatAt.set(id, { T: clock.t(), pid });
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.pt-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.pt-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); }
      $('.pt-note').textContent = note(gs);
    },
    event(ev) {
      if (ev.e === 'throw' && ev.pid !== me) flying.push({ pid: ev.pid, x: ev.x, y: ev.y, t: ev.t, T: ev.t + init.flight });
      else if (ev.e === 'splat') {
        splatAt.set(ev.id, { T: ev.T, pid: ev.pid });
        if (ev.pid === me) { say(SAY[ev.kind], ev.kind); ctx.sfx(ev.kind === 'granny' ? 'bad' : ev.kind === 'gold' ? 'coins' : 'splat'); if (ev.kind === 'granny') tunes.fx('honk', 0.8); }
        else if (watching) ctx.sfx('splat');
      } else if (ev.e === 'miss') { plops.push({ x: ev.x, y: ev.y, at: nowS() }); if (ev.pid === me) tunes.fx('pop', 0.7); }
      else if (ev.e === 'end') tunes.stop();
    },
    frame() {
      const t = phase === 'count' ? 0 : clock.t();
      const pieEl = $('.pt-pie'); if (pieEl) pieEl.classList.toggle('ready', phase === 'play' && t - lastThrow >= init.reload);
      if (sayT && nowS() - sayT > 1.2) { $('.pt-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { ro?.disconnect(); tunes.dispose(); },
  };
}
