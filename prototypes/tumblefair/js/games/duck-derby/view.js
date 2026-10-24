// DUCK DERBY on a screen. One 2D canvas: the stream runs UP the screen, one lane per duck with rope-and-float lane
// lines, reeds on the banks, white chevron rapids pointing the way they push, grey rocks, and a chequered finish. The
// view follows your duck (a watching screen follows the leader). Under it, two big paddle buttons (A / D or the arrow
// keys too) and a tempo word that says how your last stroke was ("Steady!", "Too fast!"). Strokes carry this phone's
// clock so the server measures your rhythm as you tapped it. Halloween: a moonlit purple stream, ducks in witch hats.
import { chip } from '../../client/gamehud.js';
import { quality, CPU } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const lanes = [...players.map(p => ({ pid: p.pid, color: p.color, name: p.name })), ...(init.solo ? [{ pid: CPU, color: '#9aa0a8', name: init.cpu }] : [])];
  ui.innerHTML = `
    <div class="dd2-top"><span class="dd2-title">Duck Derby</span><span class="dd2-dist"></span><span class="clock"><b>--</b></span></div>
    <div class="dd2-wrap"><canvas class="dd2-river"></canvas><div class="dd2-msg"></div><div class="dd2-tempo"></div></div>
    <div class="dd2-pads"><button class="dd2-pad" data-s="L" aria-label="Left paddle"><b>LEFT</b><small>A · ←</small></button><button class="dd2-pad" data-s="R" aria-label="Right paddle"><b>RIGHT</b><small>D · →</small></button></div>
    <div class="dd2-players">${players.map(p => chip(p, '<em class="sc">0 m</em>')).join('')}${init.solo ? `<span class="chip dd2-cpu"><b class="nm">${init.cpu}</b><em class="sc">0 m</em></span>` : ''}</div>
    <p class="dd2-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.dd2-players [data-pid="${me}"]`)?.classList.add('me');
  const cv = $('.dd2-river'), g2 = cv.getContext('2d');
  const shown = new Map(lanes.map(l => [l.pid, { y: 0, x: 0 }]));
  let phase = 'count', last = null, t0 = null, lastSide = null, lastT = -9, camY = 0, splashes = [];
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : nowS() - t0);
  function sync(el) { if (t0 == null || Math.abs(el - myT()) > 0.4) t0 = nowS() - el; }
  function fit() { const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), w = Math.max(60, Math.round(r.width * k)), h = Math.max(60, Math.round(r.height * k)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
  const ro = new ResizeObserver(fit); ro.observe(cv);

  // ---- paddling
  const TEMPO = q => q >= 0.95 ? ['Steady!', 'good'] : q < 0.2 ? ['Too fast!', 'bad'] : q < 0.6 ? ['A bit slower', 'meh'] : ['Faster!', 'meh'];
  function paddle(s) {
    if (watching || phase !== 'play') return;
    const t = myT(), gap = t - lastT, same = lastSide === s;
    ctx.send('p', { s, t: Math.round(t * 1000) / 1000 });
    if (lastSide && lastSide !== s && gap <= 0.1) { tempo('SPLASH!', 'splash'); }
    else if (lastT > 0) { const q = quality(gap, same); const [w, c] = same ? ['Steer!', 'meh'] : gap > 0.6 ? ['Faster!', 'meh'] : TEMPO(q); tempo(w, c); }
    lastSide = s; lastT = t;
    const b = ui.querySelector(`.dd2-pad[data-s="${s}"]`); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    ctx.sfx('tap');
  }
  function tempo(text, cls) { const el = $('.dd2-tempo'); el.textContent = text; el.className = 'dd2-tempo ' + cls; void el.offsetWidth; el.classList.add('pop'); }
  let guard = 0;
  for (const b of ui.querySelectorAll('.dd2-pad')) {
    b.addEventListener('pointerdown', e => { e.preventDefault(); guard = nowS(); paddle(b.dataset.s); });
    b.addEventListener('click', e => { e.preventDefault(); if (nowS() - guard > 0.4) paddle(b.dataset.s); });
  }
  const KEY = { KeyA: 'L', ArrowLeft: 'L', KeyJ: 'L', KeyD: 'R', ArrowRight: 'R', KeyL: 'R' };
  const onKey = e => { if (e.repeat || !KEY[e.code]) return; e.preventDefault(); paddle(KEY[e.code]); };
  addEventListener('keydown', onKey);

  // ---- drawing
  function duck(g, x, y, s, color, row) {
    const stun = row?.[3], soak = row?.[4];
    g.save(); g.translate(x, y); if (stun) g.rotate(Math.sin(nowS() * 20) * 0.5);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, s * 0.25, s * 0.95, s * 0.55, 0, 0, 7); g.fill();
    g.fillStyle = HW ? '#ffb347' : '#ffd23f'; g.strokeStyle = '#0d2228'; g.lineWidth = Math.max(1.5, s * 0.08);
    g.beginPath(); g.ellipse(0, s * 0.15, s * 0.8, s * 0.6, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -s * 0.45, s * 0.42, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#ff8a1a'; g.beginPath(); g.moveTo(-s * 0.16, -s * 0.78); g.lineTo(s * 0.16, -s * 0.78); g.lineTo(0, -s * 1.02); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#0d2228'; for (const sx of [-0.17, 0.17]) { g.beginPath(); g.arc(s * sx, -s * 0.55, s * 0.06, 0, 7); g.fill(); }
    g.fillStyle = color; g.fillRect(-s * 0.42, -s * 0.18, s * 0.84, s * 0.14); g.strokeRect(-s * 0.42, -s * 0.18, s * 0.84, s * 0.14);
    if (HW) { g.fillStyle = '#4a2a7a'; g.beginPath(); g.moveTo(-s * 0.42, -s * 0.72); g.lineTo(s * 0.42, -s * 0.72); g.lineTo(s * 0.05, -s * 1.5); g.closePath(); g.fill(); g.stroke(); }
    if (soak) { g.fillStyle = '#7fd6ff'; for (let i = 0; i < 4; i++) { const a = nowS() * 6 + i * 1.6; g.beginPath(); g.arc(Math.cos(a) * s * 0.7, -s * 0.8 + ((nowS() * 3 + i * 0.25) % 1) * s, s * 0.09, 0, 7); g.fill(); } }
    if (stun) { g.fillStyle = '#ffd23f'; g.font = `900 ${Math.round(s * 0.5)}px sans-serif`; g.textAlign = 'center'; g.fillText('★', s * 0.7, -s * 0.9); }
    g.restore();
  }
  function draw() {
    fit(); const w = cv.width, h = cv.height, n = lanes.length, lw = w / n, py = h / 13, t = nowS();
    const follow = me != null ? me : lanes.reduce((a, l) => (shown.get(l.pid).y > shown.get(a.pid).y ? l : a), lanes[0]).pid;
    const want = (shown.get(follow)?.y ?? 0) + 3.5; camY += (want - camY) * 0.15;
    const Y = m => h - (m - camY + 6.5) * py;          // camY sits a little above the middle
    g2.fillStyle = HW ? '#2a2058' : '#3aa6dd'; g2.fillRect(0, 0, w, h);
    g2.strokeStyle = HW ? 'rgba(200,170,255,.25)' : 'rgba(255,255,255,.35)'; g2.lineWidth = Math.max(1, w * 0.004);
    for (let m = Math.floor(camY - 8); m < camY + 8; m += 1.3) { const y = Y(m) + ((t * py * 0.6) % (py * 1.3)); for (let i = 0; i < n; i++) { const x = lw * (i + 0.3 + ((m * 0.37) % 0.4)); g2.beginPath(); g2.moveTo(x, y); g2.quadraticCurveTo(x + lw * 0.08, y - py * 0.15, x + lw * 0.16, y); g2.stroke(); } }
    for (const r of init.course.rapids) {
      const y0 = Y(r.y0), y1 = Y(r.y1); if (y0 < 0 || y1 > h) { if (y1 > h || y0 < 0) { /* partly in view */ } }
      g2.fillStyle = HW ? 'rgba(160,120,255,.25)' : 'rgba(255,255,255,.22)'; g2.fillRect(0, y1, w, y0 - y1);
      g2.strokeStyle = HW ? 'rgba(230,210,255,.85)' : 'rgba(255,255,255,.9)'; g2.lineWidth = Math.max(2, w * 0.007);
      const dir = Math.sign(r.c);
      for (let m = r.y0 + 0.6; m < r.y1; m += 1.4) for (let i = 0; i < n; i++) {
        const cx = lw * (i + 0.5) + dir * ((t * 30) % (lw * 0.3)) - dir * lw * 0.15, y = Y(m);
        g2.beginPath(); g2.moveTo(cx - dir * lw * 0.08, y - py * 0.3); g2.lineTo(cx + dir * lw * 0.08, y); g2.lineTo(cx - dir * lw * 0.08, y + py * 0.3); g2.stroke();
      }
    }
    for (const k of init.course.rocks) for (let i = 0; i < n; i++) {
      const x = lw * (i + 0.5 + k.x / (init.half * 2)), y = Y(k.y), r = Math.min(lw * 0.16, py * 0.5);
      g2.fillStyle = '#8a8f99'; g2.strokeStyle = '#0d2228'; g2.lineWidth = 2; g2.beginPath(); g2.ellipse(x, y, r, r * 0.8, 0, 0, 7); g2.fill(); g2.stroke();
      g2.fillStyle = 'rgba(255,255,255,.35)'; g2.beginPath(); g2.ellipse(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.2, 0, 0, 7); g2.fill();
    }
    for (let i = 0; i <= n; i++) {                       // reeds on the outside banks, rope lines between lanes
      const x = lw * i;
      if (i === 0 || i === n) { g2.fillStyle = HW ? '#2f5a3a' : '#4caf50'; g2.fillRect(i === 0 ? 0 : w - lw * 0.08, 0, lw * 0.08, h); }
      else { g2.strokeStyle = 'rgba(255,255,255,.7)'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, h); g2.stroke(); g2.fillStyle = '#ff5f5f'; for (let m = Math.floor(camY - 8); m < camY + 8; m += 1) { g2.beginPath(); g2.arc(x, Y(m), Math.max(2, w * 0.008), 0, 7); g2.fill(); } }
    }
    const fy = Y(init.len);
    if (fy > -py && fy < h) { const sq = Math.max(6, lw * 0.1); for (let x = 0, k = 0; x < w; x += sq, k++) for (let j = 0; j < 2; j++) { g2.fillStyle = (k + j) % 2 ? '#fff' : '#0d2228'; g2.fillRect(x, fy - sq * (j + 1), sq, sq); } }
    const sy = Y(0); if (sy < h) { g2.fillStyle = 'rgba(255,255,255,.8)'; g2.fillRect(0, sy, w, 4); }
    lanes.forEach((l, i) => {
      const s = shown.get(l.pid), row = last?.d?.[l.pid];
      duck(g2, lw * (i + 0.5 + s.x / (init.half * 2)), Y(s.y), Math.min(lw * 0.34, py * 1.05), l.color, row);
    });
    // the race at a glance: a bar across the top with every duck on it
    const bx = w * 0.06, bw = w * 0.88, by = Math.max(10, h * 0.025);
    g2.fillStyle = 'rgba(13,34,40,.55)'; g2.fillRect(bx, by - 3, bw, 6); g2.fillStyle = '#fff'; g2.fillRect(bx + bw - 3, by - 8, 6, 16);
    lanes.forEach(l => { const s = shown.get(l.pid); g2.fillStyle = l.color; g2.strokeStyle = '#0d2228'; g2.lineWidth = 2; g2.beginPath(); g2.arc(bx + bw * Math.min(1, s.y / init.len), by, Math.max(5, w * 0.018) * (l.pid === me ? 1.35 : 1), 0, 7); g2.fill(); g2.stroke(); });
    for (let i = splashes.length - 1; i >= 0; i--) { const sp = splashes[i], k = (t - sp.t) / 0.8; if (k > 1) { splashes.splice(i, 1); continue; }
      const li = lanes.findIndex(l => l.pid === sp.to); if (li < 0) continue; const s = shown.get(sp.to), x = lw * (li + 0.5 + s.x / (init.half * 2)), y = Y(s.y);
      g2.strokeStyle = `rgba(160,225,255,${1 - k})`; g2.lineWidth = 4; g2.beginPath(); g2.arc(x, y, lw * 0.2 + k * lw * 0.3, 0, 7); g2.stroke(); }
  }
  function note(g) {
    if (g.phase === 'count') return 'LEFT, RIGHT, LEFT, RIGHT: find a steady beat!';
    if (g.phase === 'end') { const r = me != null ? g.d[me] : null; return init.solo ? (r?.[5] != null && (g.d[CPU]?.[5] == null || r[5] < g.d[CPU][5]) ? `You beat ${init.cpu}!` : `${init.cpu} wins this time!`) : 'The derby is over! First across wins.'; }
    if (watching) return 'Steady paddling beats mashing!';
    const r = g.d[me]; if (r?.[5] != null) return `Finished in ${r[5].toFixed(1)} s!`;
    return r?.[6] ? `Splash ready in ${r[6]} s` : 'Splash ready: both buttons together!';
  }
  return {
    state(g) {
      last = g; if (g.phase !== phase) { if (g.phase === 'play') ctx.sfx('good'); if (g.phase === 'end') ctx.sfx('win'); phase = g.phase; }
      ui.dataset.phase = g.phase; if (g.phase === 'play') sync(g.el);
      $('.clock b').textContent = g.left;
      const myRow = g.d[me ?? lanes[0].pid];
      $('.dd2-dist').textContent = `${Math.floor(myRow?.[0] ?? 0)} / ${init.len} m`;
      for (const p of players) ui.querySelector(`.dd2-players [data-pid="${p.pid}"] .sc`).textContent = g.d[p.pid][5] != null ? `🏁 ${g.d[p.pid][5].toFixed(1)}s` : `${g.sc[p.pid]} m`;
      if (init.solo) $('.dd2-cpu .sc').textContent = g.d[CPU][5] != null ? `🏁 ${g.d[CPU][5].toFixed(1)}s` : `${Math.floor(g.d[CPU][0])} m`;
      $('.dd2-msg').textContent = g.phase === 'count' ? (g.left || 'Go!') : g.phase === 'end' ? 'Finish!' : '';
      $('.dd2-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e === 'splash') { if (ev.to != null) splashes.push({ to: ev.to, t: nowS() }); if (ev.to === me) { tempo('Soaked!', 'bad'); ctx.sfx('splat'); } else if (ev.pid === me) ctx.sfx(ev.to != null ? 'hit' : 'tap'); }
      if (ev.e === 'bonk' && ev.pid === me) { tempo('Bonk!', 'bad'); ctx.sfx('bad'); }
      if (ev.e === 'finish') { if (ev.pid === me) ctx.sfx(ev.place === 1 ? 'win' : 'good'); else ctx.sfx('pick'); }
    },
    frame(dt) {
      const k = 1 - Math.exp(-dt * 12);
      if (last) for (const l of lanes) { const r = last.d[l.pid], s = shown.get(l.pid); if (!r) continue; s.y += (r[0] + (phase === 'play' ? r[2] * 0.05 : 0) - s.y) * k; s.x += (r[1] - s.x) * k; }
      draw();
    },
    dispose() { ro.disconnect(); removeEventListener('keydown', onKey); },
  };
}
