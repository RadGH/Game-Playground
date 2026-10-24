// CAULDRON BOBBING on a screen. One 2D canvas: a fat black cauldron over a little fire, bubbling green potion, cut
// into lanes (one per player). Over each lane hangs the player's face; their gummy eyeball drifts across the potion and
// bobs up and down — when it is deep it is drawn lower, smaller and faded under the bubbles. A glowing band under the
// face is the bite zone: green + NOW when the eyeball is under you AND up, amber "wait for it…" when it is under you
// but sunk. A bite dunks the face in: up it comes with the eyeball (chomp!), dripping green (SPLASH! / Too deep!), or
// with the crowned toad sitting on its head (Ribbit! -1).
//
// A playing phone draws its own lane big with the others small above it and a huge BITE button underneath; it predicts
// its own lane with the sim's functions and tells the server only WHEN it pressed. A watch-only screen draws one wide
// cauldron with every lane side by side.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { eyeX, eyeD, settle, bite, newLane, IRIS } from './sim.js';

const DUNK = 0.42;
const SAY = { red: 'CHOMP! +1', gold: 'GOLDEN EYE! +3', splash: 'SPLASH!', deep: 'Too deep! Wait for it to pop up', toad: 'Ribbit! The toad! -1' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, eyes = init.eyes, zone = init.zone, surf = init.surface, watching = me == null;
  const others = players.filter(p => p.pid !== me);
  ui.innerHTML = `
    <div class="cb-top"><span class="cb-title">Cauldron Bobbing</span><span class="clock"><b>--</b></span></div>
    <div class="cb-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="cb-pot"><canvas></canvas><div class="cb-count"></div></div>
    <div class="cb-me"><span class="cb-score">0</span><span class="cb-say"></span></div>
    <button class="cb-btn big-btn" aria-label="Bite">BITE!<small>when it is under your face AND at the top</small></button>
    <p class="cb-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.cb-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.22 });
  const sparks = [];

  const faces = new Map();
  for (const p of players) { if (!p.portrait) continue; const img = new Image(); img.src = p.portrait; faces.set(p.pid, img); }

  // ---- the clock (this device's own, from the moment it saw play start)
  let phase = 'count', t0 = null;
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : Math.min(init.play, nowS() - t0));
  function sync(el) { if (t0 == null) { t0 = nowS() - el; return; } if (el - myT() > 0.6) t0 = nowS() - el; }

  // ---- lanes: mine predicted, the rest from the server
  const lanes = new Map(players.map(p => [p.pid, newLane()]));
  const anim = new Map(players.map(p => [p.pid, { at: -9, r: null }]));
  let sentAt = -9, behindSince = null;
  const mine = me != null ? lanes.get(me) : null;
  function fromServer(pid, row) {
    const L = lanes.get(pid); if (!L) return;
    const S = { k: row[0], from: row[1], stun: row[2], score: row[3], red: row[4], gold: row[5], yuck: row[7], run: row[8], bonus: row[9] };
    if (pid !== me) { Object.assign(L, S); return; }
    if (nowS() - sentAt < 0.8) return;
    if (S.k === L.k && S.score === L.score) { behindSince = null; return; }
    if (S.k > L.k) { Object.assign(L, S); behindSince = null; return; }
    behindSince ??= nowS();
    if (nowS() - behindSince > 1.6) { Object.assign(L, S, { last: Math.max(L.last, S.stun - 2) }); behindSince = null; }
  }
  function press() {
    if (watching || phase !== 'play') return;
    const t = myT(); settle(mine, eyes, t);
    if (mine.k >= eyes.length || t < mine.from || t < mine.stun) return;
    const k = mine.k, bonus = mine.bonus, r = bite(mine, eyes, t, zone);
    if (!r) return;
    sentAt = nowS(); ctx.send('bite', { k, t: Math.round(t * 1000) / 1000 });
    dunk(me, r, mine.bonus > bonus);
    const b = $('.cb-btn'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    paintMe();
  }
  function dunk(pid, r, streak = false) {
    const a = anim.get(pid); if (!a) return; a.at = nowS(); a.r = r;
    if (pid === me || watching) {
      if (r === 'splash' || r === 'deep') { ctx.sfx('splat'); tunes.fx('slime', 1); }
      else if (r === 'toad') { tunes.fx('boing', 0.7); ctx.sfx('bad'); }
      else { ctx.sfx(r === 'gold' ? 'coins' : 'good'); tunes.fx('pop', r === 'gold' ? 1.3 : 1); }
    }
    if (pid === me) {
      const s = $('.cb-say'); s.textContent = SAY[r] + (streak ? ' · Eye-catching! +1' : ''); s.className = 'cb-say ' + r + (streak ? ' streak' : ''); void s.offsetWidth; s.classList.add('pop');
      if (r === 'splash' || r === 'deep' || r === 'toad') { const tb = $('.cb-pot'); tb.classList.remove('shake'); void tb.offsetWidth; tb.classList.add('shake'); }
      if (r === 'gold' || streak) for (let i = 0; i < 14; i++) sparks.push({ a: i / 14 * Math.PI * 2, v: 0.6 + (i % 3) * 0.25, at: nowS() });
    }
  }
  const btn = $('.cb-btn');
  btn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  canvas.addEventListener('pointerdown', e => { if (!watching) { e.preventDefault(); press(); } });
  const onKey = e => { if (e.repeat || !['Space', 'Enter', 'KeyB', 'ArrowDown'].includes(e.code)) return; e.preventDefault(); press(); };
  addEventListener('keydown', onKey);
  function paintMe() { if (mine) $('.cb-score').textContent = `${mine.score} eyeball${mine.score === 1 ? '' : 's'}`; }

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();

  /** The cauldron: potion surface + black iron pot + fire, across a rectangle. Returns { wy, wh } (surface line, depth). */
  function pot(x, y, w, h, t) {
    const wy = y + h * 0.5, wh = h * 0.26;
    // the back rim
    g.fillStyle = '#2a2433'; g.beginPath(); g.ellipse(x + w / 2, wy, w / 2, wh * 0.42, 0, Math.PI, 0); g.fill();
    // potion: a green glow from below
    const pg = g.createLinearGradient(0, wy - wh * 0.4, 0, wy + wh); pg.addColorStop(0, '#9dff6a'); pg.addColorStop(0.35, '#3fbf4a'); pg.addColorStop(1, '#1d5a2a');
    g.fillStyle = pg; g.beginPath(); g.ellipse(x + w / 2, wy, w / 2 - 5, wh * 0.38, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x + 5, wy, w - 10, wh);
    // the pot's belly in front
    const by = wy + wh * 0.2;
    const ig = g.createLinearGradient(x, 0, x + w, 0); ig.addColorStop(0, '#15111c'); ig.addColorStop(0.45, '#4a4258'); ig.addColorStop(1, '#15111c');
    g.fillStyle = ig; g.beginPath(); g.moveTo(x, by); g.ellipse(x + w / 2, by, w / 2, wh * 0.38, 0, Math.PI, 0, true);
    g.bezierCurveTo(x + w, y + h * 0.9, x + w * 0.85, y + h * 0.88, x + w * 0.78, y + h * 0.86); g.lineTo(x + w * 0.22, y + h * 0.86); g.bezierCurveTo(x + w * 0.15, y + h * 0.88, x, y + h * 0.9, x, by); g.fill();
    // logs and flames licking the pot's bottom
    g.fillStyle = '#6b3d1c'; g.fillRect(x + w * 0.3, y + h * 0.95, w * 0.4, h * 0.04);
    for (let i = 0; i < 7; i++) { const fx = x + w * (0.3 + i * 0.066), fh = h * (0.06 + 0.025 * Math.sin(t * 9 + i * 2.1)), fw = w * 0.035; g.fillStyle = i % 2 ? '#ffd23f' : '#ff7a14';
      g.beginPath(); g.moveTo(fx - fw, y + h * 0.96); g.quadraticCurveTo(fx - fw * 0.6, y + h * 0.96 - fh, fx + Math.sin(t * 7 + i) * fw * 0.5, y + h * 0.96 - fh * 1.6); g.quadraticCurveTo(fx + fw * 0.6, y + h * 0.96 - fh, fx + fw, y + h * 0.96); g.fill(); }
    g.strokeStyle = '#6a5f7a'; g.lineWidth = Math.max(4, h * 0.03); g.beginPath(); g.ellipse(x + w / 2, by, w / 2 - 2, wh * 0.36, 0, 0, Math.PI); g.stroke();
    // bubbles rising
    g.fillStyle = 'rgba(200,255,170,.55)';
    for (let i = 0; i < Math.max(6, w / 40); i++) { const k = (t * 0.6 + i * 0.37) % 1, bx = x + 12 + ((i * 0.61) % 1) * (w - 24), r = 3 + (i % 3) * 2;
      g.globalAlpha = 1 - k; g.beginPath(); g.arc(bx, wy + wh * 0.15 - k * wh * 0.45, r * (0.6 + k), 0, 7); g.fill(); }
    g.globalAlpha = 1;
    return { wy, wh };
  }
  function eyeShape(cx, cy, r, kind, t, k, sunk) {
    g.save(); g.translate(cx, cy); g.globalAlpha = sunk ? 0.45 : 1;
    if (kind === 'toad') {
      g.fillStyle = '#4caf50'; g.strokeStyle = '#15381a'; g.lineWidth = Math.max(2, r * 0.1);
      g.beginPath(); g.ellipse(0, r * 0.15, r * 1.05, r * 0.75, 0, 0, 7); g.fill(); g.stroke();
      for (const s of [-1, 1]) { g.fillStyle = '#4caf50'; g.beginPath(); g.arc(s * r * 0.45, -r * 0.45, r * 0.32, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(s * r * 0.45, -r * 0.47, r * 0.2, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(s * r * 0.45, -r * 0.45, r * 0.09, 0, 7); g.fill(); }
      g.strokeStyle = '#15381a'; g.beginPath(); g.arc(0, r * 0.1, r * 0.45, 0.25, Math.PI - 0.25); g.stroke();
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#7a5200'; g.lineWidth = Math.max(1.5, r * 0.07);           // a little crown
      g.beginPath(); g.moveTo(-r * 0.35, -r * 0.72); g.lineTo(-r * 0.35, -r * 1.05); g.lineTo(-r * 0.17, -r * 0.88); g.lineTo(0, -r * 1.12); g.lineTo(r * 0.17, -r * 0.88); g.lineTo(r * 0.35, -r * 1.05); g.lineTo(r * 0.35, -r * 0.72); g.closePath(); g.fill(); g.stroke();
      g.restore(); return;
    }
    const gold = kind === 'gold', gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    if (gold) { gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.6, '#ffe066'); gr.addColorStop(1, '#d19a10'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#f3eef8'); gr.addColorStop(1, '#c9bcd8'); }
    g.fillStyle = gr; g.strokeStyle = '#2a1840'; g.lineWidth = Math.max(2, r * 0.08);
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.stroke();
    const look = Math.sin(t * 1.7 + k) * r * 0.18;
    g.fillStyle = gold ? '#ff8a1a' : IRIS[k % IRIS.length]; g.beginPath(); g.arc(look, r * 0.05, r * 0.48, 0, 7); g.fill();
    g.fillStyle = '#1a0f26'; g.beginPath(); g.arc(look, r * 0.05, r * 0.24, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(look - r * 0.14, -r * 0.1, r * 0.1, 0, 7); g.fill();
    if (gold) { const s = (Math.sin(t * 6) + 1) / 2; g.fillStyle = `rgba(255,255,255,${0.5 + s * 0.5})`; g.beginPath(); g.arc(r * 0.8, -r * 0.8, r * 0.16, 0, 7); g.fill(); }
    g.restore();
  }
  function head(p, cx, cy, r, wet = 0) {
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = p.color; g.fill(); g.clip();
    const img = faces.get(p.pid);
    if (img?.complete && img.naturalWidth) g.drawImage(img, cx - r * 1.12, cy - r * 1.1, r * 2.24, r * 2.24);
    if (wet > 0) { g.fillStyle = `rgba(110,230,90,${0.45 * wet})`; g.fillRect(cx - r, cy - r * 0.3, r * 2, r * 1.4); }
    g.restore();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = Math.max(3, r * 0.1); g.strokeStyle = p.color; g.stroke();
  }
  function lane(p, x, y, w, h, P, t, big) {
    const L0 = lanes.get(p.pid), L = p.pid === me ? L0 : { ...L0 }; settle(L, eyes, t);
    const cx = x + w / 2, er = Math.max(9, Math.min(w * 0.085, h * 0.08)), span = w / 2 - er * 1.6;
    const fr = Math.max(14, Math.min(w * 0.15, h * 0.14)), a = anim.get(p.pid), da = nowS() - a.at;
    const e = L.k < eyes.length ? eyes[L.k] : null, up = e && t >= L.from, s = t - L.from;
    const ex = up ? eyeX(e, s) : 0, ed = up ? eyeD(e, s) : 0, under = up && Math.abs(ex) <= zone[e.kind], high = up && ed >= surf[e.kind];
    const stunned = t < L.stun;
    // the bite zone
    const zw = zone[e?.kind || 'red'] * span;
    const zc = !up || stunned ? 'rgba(255,255,255,.10)' : e.kind === 'toad' ? 'rgba(255,95,95,.22)' : under && high ? 'rgba(62,207,90,.55)' : under ? 'rgba(255,170,40,.32)' : 'rgba(255,210,63,.16)';
    g.fillStyle = zc; g.fillRect(cx - zw, y + h * 0.1, zw * 2, P.wy - (y + h * 0.1) + P.wh * 0.3);
    g.strokeStyle = !up || stunned ? 'rgba(255,255,255,.25)' : e.kind === 'toad' ? '#ff5f5f' : under && high ? '#3ecf5a' : 'rgba(255,210,63,.7)';
    g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(cx - zw, y + h * 0.12); g.lineTo(cx - zw, P.wy + P.wh * 0.3); g.moveTo(cx + zw, y + h * 0.12); g.lineTo(cx + zw, P.wy + P.wh * 0.3); g.stroke(); g.setLineDash([]);
    // the eyeball: at the top it rides the surface; deep it sinks lower, smaller and faded
    if (up && !(da < DUNK && a.r !== 'splash' && a.r !== 'deep')) {
      const px = cx + ex * span, depth = (1 - ed) / 2, py = P.wy - er * 0.3 + depth * P.wh * 0.55, rr = er * (1 - depth * 0.35);
      if (ed >= surf[e.kind]) { g.strokeStyle = 'rgba(210,255,190,.5)'; g.lineWidth = 2; for (let i = 0; i < 2; i++) { const k = ((t * 0.9 + i * 0.5) % 1); g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(px, py + rr * 0.6, rr * (1 + k * 1.2), rr * (0.3 + k * 0.3), 0, 0, 7); g.stroke(); } g.globalAlpha = 1; }
      eyeShape(px, py, rr, e.kind, t, L.k, ed < surf[e.kind]);
      if (ed < surf[e.kind]) { g.fillStyle = 'rgba(80,200,80,.35)'; g.beginPath(); g.ellipse(px, py, rr * 1.3, rr * 1.1, 0, 0, 7); g.fill(); }
    }
    // the face
    let fy = y + h * 0.24 + Math.sin(t * 2 + p.pid) * h * 0.01;
    if (da < DUNK) { const k = da / DUNK, dip = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; fy += (P.wy - fr * 0.4 - fy) * Math.sin(dip * Math.PI / 2); }
    head(p, cx, fy, fr, (a.r === 'splash' || a.r === 'deep') && da > DUNK * 0.4 ? Math.max(0, 1 - da / (init.timing.splash + 0.3)) : 0);
    if ((a.r === 'red' || a.r === 'gold') && da > DUNK * 0.4 && da < 1.3) {
      if (da < DUNK + 0.25) eyeShape(cx, fy + fr * 0.85, er * 0.9, a.r, t, L.k - 1, false);
      else { const k = Math.min(1, (da - DUNK - 0.25) / 0.5); eyeShape(cx + (w * 0.42) * k, fy + fr * 0.85 - (fy - y) * k * 1.4, er * 0.9 * (1 - k * 0.5), a.r, t, L.k - 1, false); }
    }
    if (a.r === 'toad' && t < L.stun + 0.1 && da > DUNK * 0.4) eyeShape(cx, fy - fr * 0.95, er * 0.85, 'toad', t, 0, false);
    if ((a.r === 'splash' || a.r === 'deep') && da < init.timing.splash + 0.2) {
      g.fillStyle = 'rgba(140,255,110,.9)';
      for (let i = 0; i < 6; i++) { const dx = Math.sin(i * 2.3) * fr * 0.7, dy = ((da * 1.4 + i * 0.17) % 1) * fr * 1.4 - fr * 0.3; g.beginPath(); g.ellipse(cx + dx, fy + dy, fr * 0.07, fr * 0.11, 0, 0, 7); g.fill(); }
    }
    const fs = Math.round(Math.max(12, Math.min(26, h * (big ? 0.07 : 0.1))));
    g.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
    const say = (txt, col, yy) => { g.lineWidth = 4; g.strokeStyle = '#140c1e'; g.strokeText(txt, cx, yy); g.fillStyle = col; g.fillText(txt, cx, yy); };
    if (a.r && da < 1.0) say(a.r === 'splash' ? 'SPLASH!' : a.r === 'deep' ? 'Too deep!' : a.r === 'toad' ? 'Ribbit! -1' : a.r === 'gold' ? '+3!' : '+1', a.r === 'splash' || a.r === 'deep' ? '#b8ff9a' : a.r === 'toad' ? '#ff5f5f' : '#ffd23f', y + h * 0.08 + fs);
    else if (big && up && !stunned) say(e.kind === 'toad' ? 'Leave him!' : under && high ? 'NOW!' : under ? 'wait for it…' : '', e.kind === 'toad' ? '#ff9a9a' : under && high ? '#7dff8a' : '#ffd88a', y + fs + 4);
    if (!big || watching) { g.font = `800 ${Math.max(11, fs * 0.7)}px "Baloo 2", system-ui, sans-serif`; say(`${p.name}: ${L.score}`, '#fff', y + h - 8); }
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    const tt = nowS();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (watching || !mine) {
      const pad = 8, n = players.length, P = pot(pad, pad, W - pad * 2, H - pad * 2, tt), lw = (W - pad * 2) / n;
      players.forEach((p, i) => lane(p, pad + i * lw, pad, lw, H - pad * 2, P, t, true));
      for (let i = 1; i < n; i++) { const lx = pad + i * lw; g.fillStyle = players[i].color; for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(lx, P.wy - 4 + j * 6, 4, 0, 7); g.fill(); } }
      return;
    }
    const stripH = others.length ? Math.min(H * 0.32, 150) : 0;
    if (others.length) { const P = pot(4, 2, W - 8, stripH - 4, tt), lw = (W - 8) / others.length; others.forEach((p, i) => lane(p, 4 + i * lw, 2, lw, stripH - 4, P, t, false)); }
    const y0 = stripH + 4, P = pot(4, y0, W - 8, H - y0 - 2, tt);
    lane(players.find(p => p.pid === me), 4, y0, W - 8, H - y0 - 2, P, t, true);
    const now = nowS(), cx = W / 2, cy = y0 + (H - y0) * 0.28;
    for (let i = sparks.length - 1; i >= 0; i--) { const sp = sparks[i], k = (now - sp.at) / 0.8; if (k >= 1) { sparks.splice(i, 1); continue; }
      const d = 20 + k * 110 * sp.v, sx = cx + Math.cos(sp.a) * d, sy = cy + Math.sin(sp.a) * d * 0.7, r = 7 * (1 - k);
      g.fillStyle = `rgba(255,${200 + Math.round(55 * (1 - k))},80,${1 - k})`; g.beginPath(); g.arc(sx, sy, r, 0, 7); g.fill(); }
  }
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Get ready to bob for eyeballs!' : 'BITE (or Space) when an eyeball is under your face AND bobbing at the top.';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.l[me]?.[3] ?? 0, m = init.medals; return `${s} eyeballs — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      const rows = players.map(p => [p, gs.l[p.pid]?.[3] ?? 0]), top = Math.max(...rows.map(r => r[1])), lead = rows.filter(r => r[1] === top && top > 0);
      return lead.length === 1 ? `Towels, please! ${lead[0][0].name} gobbled the most: ${top}!` : 'Towels, please!';
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
      $('.cb-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.l).map(r => r[3]));
      for (const [pid, row] of Object.entries(gs.l)) {
        fromServer(+pid, row);
        const c = ui.querySelector(`.cb-board [data-pid="${pid}"]`); if (!c) continue;
        c.querySelector('.sc').textContent = row[3]; c.classList.toggle('lead', row[3] === best && best > 0);
      }
      paintMe();
      $('.cb-note').textContent = note(gs);
    },
    event(ev) { if (ev.e === 'bite' && ev.pid !== me) dunk(ev.pid, ev.r); },
    frame() {
      const t = phase === 'count' ? 0 : myT();
      if (mine && phase === 'play') { const can = t >= mine.from && t >= mine.stun; btn.classList.toggle('wait', !can); }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
