// FAIR DARTS on a screen: a darts stall (striped awning, plank wall, plushies) with a big round board in bright rings
// and a gold bullseye. A phone that plays sees ITS OWN board, its wandering aim ring (with a faint tail so you can see
// where it is heading, and a glow that grows as it breathes in close), and one big THROW button (Space works, or tap the
// board). A watching screen shows every player's board side by side. Darts stick in the board in seat colours (each
// set of three is pulled out before the next). Halloween: a pumpkin-orange and purple board on a cobwebbed night wall,
// a bat for the aim and a jack-o'-lantern bullseye.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { aimAt, isDouble } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const byPid = new Map(players.map(p => [p.pid, p])), seatIdx = new Map(init.order.map((p, i) => [p, i]));
  ui.innerHTML = `
    <div class="fd-top"><span class="fd-title">${HW ? 'Spooky Darts' : 'Fair Darts'}</span><span class="clock"><b>--</b></span></div>
    <div class="fd-board">${players.map(p => chip(p, '<em class="sc">0</em><i class="fd-pips"></i>')).join('')}</div>
    <div class="fd-stall"><canvas></canvas><div class="fd-count"></div><div class="fd-say"></div></div>
    <div class="fd-panel${watching ? ' hidden' : ''}">
      <div class="fd-row"><b class="fd-n">Dart 1/${init.darts}</b><span class="fd-x2">Last 3 darts: DOUBLE</span></div>
      <button class="fd-btn big-btn" disabled>THROW!</button>
    </div>
    <p class="fd-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.fd-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d'), btn = $('.fd-btn');
  const tunes = createTunes({ volume: 0.2 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 1);

  let phase = 'count', myN = 0, lastThrow = -9, sayT = 0, darts = {}, flying = [], behind = null;
  const pathOf = (pid, k) => init.paths[seatIdx.get(pid)]?.[Math.min(k, init.darts - 1)];
  function press() {
    if (watching || phase !== 'play' || myN >= init.darts) return;
    const t = clock.t(); if (t - lastThrow < init.cool) return;
    lastThrow = t; ctx.send('throw', { t: Math.round(t * 1000) / 1000 });
    const [x, y] = aimAt(pathOf(me, myN), t); flying.push({ pid: me, x, y, at: nowS() });
    myN++; showN(); ctx.sfx('throw');
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  canvas.addEventListener('pointerdown', e => { if (!watching) { e.preventDefault(); press(); } });
  const onKey = e => { if (watching || e.repeat || !['Space', 'Enter'].includes(e.code) || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); press(); };
  addEventListener('keydown', onKey);
  function showN() {
    $('.fd-n').textContent = myN >= init.darts ? 'All darts thrown' : `Dart ${myN + 1}/${init.darts}${isDouble(myN) ? ' · DOUBLE!' : ''}`;
    $('.fd-x2').classList.toggle('on', isDouble(myN) && myN < init.darts);
    btn.disabled = !(phase === 'play' && myN < init.darts);
  }

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const C = HW ? { wall: ['#2a1d4a', '#1a1230'], plank: 'rgba(0,0,0,.25)', rings: ['#ff8a1a', '#3a2466', '#ff8a1a', '#7a4ab8', '#ff8a1a'], alt: ['#e06a00', '#2a1850', '#e06a00', '#5e3496', '#e06a00'], bull: '#ffd23f', rim: '#14091f' }
    : { wall: ['#ffe2a8', '#f5c77a'], plank: 'rgba(120,70,20,.18)', rings: ['#e8394a', '#ffffff', '#3d8bff', '#ffffff', '#3ecf6a'], alt: ['#c92a3a', '#f1ecdf', '#2f6fd8', '#f1ecdf', '#2fae58'], bull: '#ffd23f', rim: '#0d2228' };
  /** Board centres for the boards this screen shows (mine on a phone, everyone's on a TV). */
  function layout() {
    const list = watching ? players.map(p => p.pid) : [me];
    const n = list.length, cols = n <= 2 ? n : n === 3 ? 3 : (W > H ? 4 : 2), rows = Math.ceil(n / cols);
    const cw = W / cols, ch = H / rows, rad = Math.min(cw, ch) * 0.42;
    return list.map((pid, i) => ({ pid, cx: cw * (i % cols + 0.5), cy: ch * (Math.floor(i / cols) + 0.5) + (watching ? 8 : 0), k: rad / init.r }));
  }
  function board(b) {
    const { cx, cy, k } = b, rings = init.rings;
    g.save(); g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(cx + 4, cy + 7, (init.r + 5) * k, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = C.rim; g.beginPath(); g.arc(cx, cy, (init.r + 5) * k, 0, Math.PI * 2); g.fill();
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i].r * k;
      if (i === 0) { g.fillStyle = C.bull; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); continue; }
      for (let s = 0; s < 16; s++) { g.fillStyle = s % 2 ? C.alt[i] : C.rings[i]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, s * Math.PI / 8, (s + 1) * Math.PI / 8); g.closePath(); g.fill(); }
      g.strokeStyle = C.rim; g.lineWidth = Math.max(1, 0.5 * k); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    }
    if (HW) { // a jack-o'-lantern face on the bullseye
      const r = rings[0].r * k; g.fillStyle = '#3a1a00'; g.beginPath(); g.moveTo(cx - r * 0.55, cy - r * 0.1); g.lineTo(cx - r * 0.25, cy - r * 0.5); g.lineTo(cx - r * 0.1, cy - r * 0.1); g.fill(); g.beginPath(); g.moveTo(cx + r * 0.55, cy - r * 0.1); g.lineTo(cx + r * 0.25, cy - r * 0.5); g.lineTo(cx + r * 0.1, cy - r * 0.1); g.fill();
      g.beginPath(); g.arc(cx, cy + r * 0.1, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); g.fill();
    } else { g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(cx - rings[0].r * k * 0.3, cy - rings[0].r * k * 0.3, rings[0].r * k * 0.3, 0, Math.PI * 2); g.fill(); }
    // ring values, small, on the right-hand side of each band
    g.font = `900 ${Math.max(9, 4.6 * k)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = C.rim; g.fillStyle = '#fff';
    for (let i = 1; i < rings.length; i++) { const r = (rings[i].r + rings[i - 1].r) / 2 * k; g.strokeText(rings[i].pts, cx + r * 0.71, cy - r * 0.71); g.fillText(rings[i].pts, cx + r * 0.71, cy - r * 0.71); }
  }
  function dart(x, y, color, k, s = 1) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = C.rim; g.lineWidth = 2; g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(3.2 * k, -6 * k); g.lineTo(1.4 * k, -6.6 * k); g.closePath(); g.fill(); g.stroke();   // barrel
    g.beginPath(); g.moveTo(2.4 * k, -6.4 * k); g.lineTo(6.5 * k, -11 * k); g.lineTo(1.8 * k, -10.2 * k); g.lineTo(3.4 * k, -7.2 * k); g.closePath(); g.fill(); g.stroke();   // flights
    g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(0, 0, Math.max(1.5, 0.7 * k), 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function reticle(x, y, k, t, close, color) {
    g.save();
    if (HW) { // a little bat
      g.fillStyle = '#14091f'; g.strokeStyle = color; g.lineWidth = 2.5; const f = Math.sin(t * 18) * 0.35;
      g.beginPath(); g.moveTo(x, y - 2 * k); g.quadraticCurveTo(x - 5 * k, y - (5 + f * 6) * k, x - 10 * k, y - 1 * k); g.quadraticCurveTo(x - 6 * k, y + 0.5 * k, x - 4 * k, y + 2.5 * k); g.quadraticCurveTo(x - 2 * k, y + 1 * k, x, y + 3 * k);
      g.quadraticCurveTo(x + 2 * k, y + 1 * k, x + 4 * k, y + 2.5 * k); g.quadraticCurveTo(x + 6 * k, y + 0.5 * k, x + 10 * k, y - 1 * k); g.quadraticCurveTo(x + 5 * k, y - (5 + f * 6) * k, x, y - 2 * k); g.fill(); g.stroke();
      g.fillStyle = '#ffd23f'; g.fillRect(x - 1.6 * k, y - 0.6 * k, 1 * k, 1 * k); g.fillRect(x + 0.6 * k, y - 0.6 * k, 1 * k, 1 * k);
    }
    g.globalAlpha = 0.35 + 0.65 * close; g.fillStyle = `rgba(255,240,140,${0.25 + 0.4 * close})`; g.beginPath(); g.arc(x, y, (5 + 6 * close) * k, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 4.2 * k, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = color; g.lineWidth = 2.5; g.stroke();
    if (!HW) { g.beginPath(); for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { g.moveTo(x + a * 2.2 * k, y + b * 2.2 * k); g.lineTo(x + a * 6.4 * k, y + b * 6.4 * k); } g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.strokeStyle = color; g.lineWidth = 1.6; g.stroke(); }
    g.restore();
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C.wall[0]); bg.addColorStop(1, C.wall[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = C.plank; for (let x = 0; x < W; x += 34) g.fillRect(x, 0, 2, H);
    if (HW) { g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1; for (const [ox, oy, s] of [[0, 0, 1], [W, 0, -1]]) { for (let a = 0; a <= 4; a++) { const an = a / 4 * Math.PI / 2; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + s * Math.cos(an) * 70, oy + Math.sin(an) * 70); g.stroke(); } for (let r = 18; r <= 66; r += 16) { g.beginPath(); for (let a = 0; a <= 4; a++) { const an = a / 4 * Math.PI / 2; const px = ox + s * Math.cos(an) * r, py = oy + Math.sin(an) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); } } }
    for (const b of layout()) {
      board(b);
      const p = byPid.get(b.pid), col = p?.color || '#fff';
      for (const [x, y] of darts[b.pid] || []) dart(b.cx + x * b.k, b.cy + y * b.k, col, b.k);
      for (const f of flying) if (f.pid === b.pid) { const u = Math.min(1, (nowS() - f.at) / 0.22); dart(b.cx + f.x * b.k, b.cy + f.y * b.k + (1 - u) * 60, col, b.k, 1 + (1 - u) * 1.4); }
      if (watching) { g.font = '900 16px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = C.rim; g.fillStyle = col; const ty = b.cy - (init.r + 9) * b.k; g.strokeText(p?.name || '', b.cx, ty); g.fillText(p?.name || '', b.cx, ty); }
      const n = b.pid === me ? myN : (lastN[b.pid] || 0);
      if (phase === 'play' && n < init.darts) {
        const path = pathOf(b.pid, n);
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i <= 10; i++) { const [x, y] = aimAt(path, t - 0.3 + i * 0.03); i ? g.lineTo(b.cx + x * b.k, b.cy + y * b.k) : g.moveTo(b.cx + x * b.k, b.cy + y * b.k); } g.stroke();
        const [x, y] = aimAt(path, t), d = Math.hypot(x, y);
        reticle(b.cx + x * b.k, b.cy + y * b.k, b.k, t, Math.max(0, 1 - d / 22), col);
      }
    }
    for (let i = flying.length - 1; i >= 0; i--) if (nowS() - flying[i].at > 0.5) flying.splice(i, 1);
  }
  const lastN = {};
  function say(text, cls) { const s = $('.fd-say'); s.textContent = text; s.className = 'fd-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Step up to the oche!' : 'Wait for the ring to drift in close… then THROW!';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      return 'Every dart thrown!';
    }
    if (init.solo) return `Medals: bronze ${init.medals[0]}, silver ${init.medals[1]}, gold ${init.medals[2]}.`;
    return watching ? '' : 'Bullseye 10 · then 5, 3, 2, 1';
  }
  const SAY = ['BULLSEYE!', 'Great shot!', 'Nice!', 'OK', 'Edge', 'Off the board!'];
  showN();
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'jig'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase;
      if (me != null && gs.n?.[me] > myN) myN = gs.n[me];
      if (me != null && gs.phase === 'play' && gs.n?.[me] < myN) { behind ??= nowS(); if (nowS() - behind > 2.2) { myN = gs.n[me]; behind = null; } } else behind = null;
      Object.assign(lastN, gs.n || {}); darts = gs.dt || darts; showN();
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.fd-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) {
        const c = ui.querySelector(`.fd-board [data-pid="${pid}"]`); if (!c) continue;
        c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0);
        const left = init.darts - (gs.n?.[pid] || 0), pips = '•'.repeat(Math.max(0, left)); const pe = c.querySelector('.fd-pips'); if (pe.textContent !== pips) pe.textContent = pips;
      }
      $('.fd-note').textContent = note(gs);
    },
    event(ev) {
      if (ev.e !== 'dart') { if (ev.e === 'end') tunes.stop(); return; }
      if (ev.pid !== me) flying.push({ pid: ev.pid, x: ev.x, y: ev.y, at: nowS() });
      darts[ev.pid] = ev.k % init.set === 0 ? [[ev.x, ev.y]] : [...(darts[ev.pid] || []), [ev.x, ev.y]];
      lastN[ev.pid] = ev.k + 1;
      tunes.fx('knock', ev.ring === 0 ? 1.5 : 1);
      if (ev.pid === me) { say(ev.pts ? `${SAY[ev.ring]} +${ev.pts}` : SAY[ev.ring], ev.ring === 0 ? 'gold' : ev.pts ? 'good' : 'bad'); ctx.sfx(ev.ring === 0 ? 'coins' : ev.pts >= 3 ? 'good' : ev.pts ? 'tap' : 'bad'); }
      else if (watching && ev.ring === 0) ctx.sfx('coins');
    },
    frame() {
      const t = phase === 'count' ? 0 : clock.t();
      if (sayT && nowS() - sayT > 1.3) { $('.fd-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
