// STEADY HAND on a screen. A tall board (the sim's 100 x 150 units on one 2D canvas) with the path drawn as a glowing
// groove: a dark edge, a bright middle, a start pad at the bottom and a chequered flag at the top. Your dot is solid in
// your colour; the others' dots are see-through ghosts with their initial. Drag ANYWHERE on the screen: the dot moves
// with your finger like a trackpad cursor (so the finger never hides it). Your dot is simulated HERE with the sim's own
// `advance`, one 50 ms tick at a time, and every tick's finger movement is sent to the server, which plays the same
// ticks; if the two ever disagree the phone rolls back to the server's dot (priv) and replays. A buzz flashes red,
// shakes the board and says BZZT. Keys: arrows / WASD; a controller's left stick. Halloween: a night board, a path
// of green slime with an orange glowing edge, a candle-yellow start pad and a little ghost over the flag.
import { chip, esc } from '../../client/gamehud.js';
import { createPhoneClock } from '../toss-kit.js';
import { buildPath, advance, newTracer, DT } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const BW = init.bw, BH = init.bh, byPid = new Map(players.map(p => [p.pid, p]));
  const paths = init.specs.map(s => buildPath(s, L));
  ui.innerHTML = `
    <div class="pt-top"><span class="pt-title">Steady Hand</span><span class="pt-round"></span><span class="clock"><b>--</b></span></div>
    <div class="pt-chips">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="pt-wrap"><canvas class="pt-board"></canvas><div class="pt-fx"></div><div class="pt-msg"></div><div class="pt-card"></div></div>
    <p class="pt-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.pt-chips [data-pid="${me}"]`)?.classList.add('me');
  const cv = $('.pt-board'), g2 = cv.getContext('2d'), wrap = $('.pt-wrap'), fx = $('.pt-fx');
  const clock = createPhoneClock(() => performance.now() / 1000);

  // ---- my dot, simulated here
  let phase = 'count', round = -1, last = null, mine = null, k = 0, hist = new Map(), out = [], outK = 0, pend = [0, 0], shake = 0, flash = 0, showAt = 0;
  const ghost = new Map();
  function newRound(r) { round = r; mine = newTracer(paths[r]); k = 0; hist.clear(); out = []; pend = [0, 0]; ghost.clear(); }
  function onMine(ev) {
    if (!ev) return;
    if (ev.e === 'buzz') { ctx.sfx('bad'); navigator.vibrate?.(90); shake = 0.35; flash = 0.4; pop('BZZT!', 'bad', ev.x, ev.y); }
    if (ev.e === 'finish') { ctx.sfx('win'); pop(mine.buzz ? 'TOP!' : 'TOP! Clean run!', 'gold', mine.x, mine.y); }
  }
  function tickMine() {
    if (phase !== 'go' || watching || !mine) return;
    const target = Math.min(Math.floor(clock.t() / DT), Math.round(init.rounds[round].limit / DT));
    let n = 0; const max = L.vmax * DT;
    while (k < target && n++ < 10) {
      let [dx, dy] = pend; const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      dx = Math.round(dx * 10) / 10; dy = Math.round(dy * 10) / 10; pend = [pend[0] - dx, pend[1] - dy];
      hist.set(k, { tr: { ...mine }, d: [dx, dy] });
      if (!out.length) outK = k;
      out.push([dx, dy]); onMine(advance(mine, dx, dy, paths[round], L)); hist.delete(k - 90); k++;
      if (out.length >= 6) flush();
    }
    if (k < target) k = target;
    flush();
  }
  function flush() { if (out.length) { ctx.send('tr', { k: outK, d: out }); out = []; } }
  function reconcile(p) {
    if (!p?.tr || p.r !== round || !mine) return;
    const s = p.tr, h = hist.get(s.k);
    if (s.k > k) { mine = { ...s }; k = s.k; hist.clear(); return; }
    if (!h) return;
    const a = h.tr;
    if (Math.abs(a.x - s.x) < 1e-6 && Math.abs(a.y - s.y) < 1e-6 && a.prog === s.prog && a.frz === s.frz && a.done === s.done) return;
    mine = { ...s };
    for (let j = s.k; j < k; j++) { const H = hist.get(j); if (!H) continue; H.tr = { ...mine }; advance(mine, H.d[0], H.d[1], paths[round], L); }
  }
  // ---- finger, keys, stick
  let drag = null;
  const kOf = () => BW / cv.getBoundingClientRect().width;
  const capped = () => { const l = Math.hypot(pend[0], pend[1]); if (l > 10) { pend[0] *= 10 / l; pend[1] *= 10 / l; } };
  ui.addEventListener('pointerdown', e => { if (watching || e.target.closest('button')) return; e.preventDefault(); try { ui.setPointerCapture(e.pointerId); } catch {} drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  ui.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const s = kOf(); if (phase === 'go') { pend[0] += (e.clientX - drag.x) * s; pend[1] += (e.clientY - drag.y) * s; capped(); } drag.x = e.clientX; drag.y = e.clientY; });
  const up = e => { if (drag && e.pointerId === drag.id) drag = null; }; ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
  const keys = new Set();
  const onKey = e => { if (watching || !/^(Arrow|Key[WASD])/.test(e.code) || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  function steer(dt) {
    if (phase !== 'go' || watching) return;
    let mx = 0, my = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1; if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1; if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
    for (const p of navigator.getGamepads?.() || []) { if (!p) continue; if (Math.abs(p.axes[0]) > 0.15) mx += p.axes[0]; if (Math.abs(p.axes[1]) > 0.15) my += p.axes[1]; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    if (l) { pend[0] += mx * 34 * dt; pend[1] += my * 34 * dt; capped(); }
  }

  // ---- drawing
  function fit() { const r = cv.getBoundingClientRect(), z = Math.min(2, devicePixelRatio || 1), w = Math.max(60, Math.round(r.width * z)), h = Math.round(w * BH / BW); if (cv.width !== w) { cv.width = w; cv.height = h; } }
  const ro = new ResizeObserver(fit); ro.observe(cv);
  function pop(text, cls, x, y) { const el = document.createElement('i'); el.className = 'pt-pop ' + cls; el.style.left = (x / BW * 100) + '%'; el.style.top = (y / BH * 100) + '%'; el.textContent = text; fx.append(el); setTimeout(() => el.remove(), 1200); }
  function drawPath(g, P, s, reveal = 1) {
    const n = Math.max(2, Math.floor(P.n * reveal));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const pass = (extra, color) => { for (let i = 0; i < n - 1; i++) { g.strokeStyle = color; g.lineWidth = (P.w[i] * 2 + extra) * s; g.beginPath(); g.moveTo(P.pts[i][0] * s, P.pts[i][1] * s); g.lineTo(P.pts[i + 1][0] * s, P.pts[i + 1][1] * s); g.stroke(); } };
    pass(2.4, HW ? '#ff8a1a' : '#1b2a6a');
    pass(0, HW ? '#3a7a2a' : '#7fe3ff');
    g.strokeStyle = HW ? 'rgba(200,255,140,.6)' : 'rgba(255,255,255,.75)'; g.lineWidth = s * 0.7; g.setLineDash([s * 2, s * 2.4]); g.beginPath();
    for (let i = 0; i < n; i++) (i ? g.lineTo : g.moveTo).call(g, P.pts[i][0] * s, P.pts[i][1] * s);
    g.stroke(); g.setLineDash([]);
    const [sx, sy] = P.pts[0]; g.fillStyle = HW ? '#ffd23f' : '#4fdc6a'; g.beginPath(); g.arc(sx * s, sy * s, P.w[0] * s * 1.1, 0, 7); g.fill();
    if (reveal >= 1) {
      const [ex, ey] = P.pts[P.n - 1], c = 2.2 * s;
      for (let i = -2; i < 2; i++) for (let j = -2; j < 1; j++) { g.fillStyle = (i + j) & 1 ? '#fff' : '#1b1b2a'; g.fillRect(ex * s + i * c, ey * s + j * c, c, c); }
      if (HW) { g.fillStyle = '#f4f4ff'; g.beginPath(); g.arc(ex * s, (ey - 6) * s, s * 2.6, Math.PI, 0); g.lineTo(ex * s + 2.6 * s, (ey - 3.6) * s); g.lineTo(ex * s - 2.6 * s, (ey - 3.6) * s); g.fill(); }
    }
  }
  function drawDot(g, x, y, s, color, label, ghostly, frozen) {
    g.globalAlpha = ghostly ? 0.6 : 1;
    g.fillStyle = color; g.strokeStyle = '#0d1020'; g.lineWidth = s * 0.6;
    g.beginPath(); g.arc(x * s, y * s, s * (ghostly ? 2.8 : 2.4), 0, 7); g.fill(); g.stroke();
    if (!ghostly) { g.strokeStyle = frozen ? '#ff5f5f' : '#fff'; g.lineWidth = s * 0.5; g.beginPath(); g.arc(x * s, y * s, s * 3.6, 0, 7); g.stroke(); }
    if (label) { g.fillStyle = '#fff'; g.font = `900 ${Math.round(s * 2.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x * s, y * s + s * 0.1); }
    g.globalAlpha = 1;
  }
  function draw(dt) {
    fit(); const w = cv.width, h = cv.height, s = w / BW, g = g2;
    g.fillStyle = HW ? '#24163a' : '#ffe8b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = HW ? 'rgba(255,138,26,.12)' : 'rgba(200,140,60,.14)';
    for (let i = 0; i < 70; i++) { g.beginPath(); g.arc(((i * 37.7) % 100) * s, ((i * 61.3) % 150) * s, s * (HW ? 0.9 : 1.4), 0, 7); g.fill(); }
    if (round < 0) return;
    const P = paths[round];
    drawPath(g, P, s, phase === 'show' ? Math.min(1, (performance.now() / 1000 - showAt) / 1.2) : 1);
    if (phase === 'show') return;
    for (const p of players) {
      if (p.pid === me && !watching) continue;
      const d = last?.d?.[p.pid]; if (!d) continue;
      const G = ghost.get(p.pid) || { x: d[0], y: d[1] }; G.x += (d[0] - G.x) * Math.min(1, dt * 14); G.y += (d[1] - G.y) * Math.min(1, dt * 14); ghost.set(p.pid, G);
      drawDot(g, G.x, G.y, s, p.color, (p.name || '?')[0].toUpperCase(), !watching, false);
    }
    if (mine && !watching) drawDot(g, mine.x, mine.y, s, byPid.get(me)?.color || '#fff', '', false, mine.frz > 0);
    if (flash > 0) { g.fillStyle = `rgba(255,60,60,${flash * 0.6})`; g.fillRect(0, 0, w, h); }
  }
  const nameOf = pid => (pid === me ? 'You' : byPid.get(pid)?.name || '?');
  function note() {
    if (phase === 'count') return 'Drag anywhere to move your dot. Stay on the path!';
    if (phase === 'show') return 'Ready… the path is coming!';
    if (phase === 'go') { if (watching) return 'Touch the edge = BZZT!'; if (mine?.done >= 0) return 'You made it! Waiting for the others…'; if (mine?.frz > 0) return 'BZZT! Sent back…'; return 'Drag to steer up the path — steady!'; }
    if (phase === 'done') return round + 1 < init.rounds.length ? 'Next path: trickier!' : init.solo ? soloLine() : 'All done!';
    return '';
  }
  function soloLine() { const sc = last?.sc?.[me ?? players[0].pid] ?? 0, m = init.medals.filter(v => sc >= v).length; return `${sc} points — ${['no medal yet', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at ${init.medals.join(' / ')})`; }
  function card(rows) {
    const list = players.map(p => ({ p, r: rows[p.pid] })).sort((a, b) => b.r.pts - a.r.pts);
    $('.pt-card').innerHTML = `<b>Path ${round + 1}</b>` + list.map(({ p, r }) => `<span>${esc(nameOf(p.pid))}: ${r.fin ? `#${r.place} ${r.t}s` : `${r.prog}%`}${r.fin && !r.buzz ? ' ✨' : ''} <em>+${r.pts}</em></span>`).join('');
    $('.pt-card').classList.add('show');
  }

  return {
    state(g) {
      if (g.r !== round && g.r >= 0) newRound(g.r);
      if (g.phase !== phase) {
        if (g.phase === 'show') { showAt = performance.now() / 1000; $('.pt-card').classList.remove('show'); }
        if (g.phase === 'go') { clock.reset(); clock.sync(0); ctx.sfx('good'); }
        phase = g.phase;
      }
      if (g.phase === 'go') clock.sync(g.tick * DT);
      last = g;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'go' && g.left <= 4);
      $('.pt-round').textContent = g.r >= 0 ? `Path ${g.r + 1}/${init.rounds.length}` : '';
      ui.dataset.phase = g.phase;
      let lead = -Infinity; for (const p of players) lead = Math.max(lead, g.sc[p.pid]);
      for (const p of players) { const el = ui.querySelector(`.pt-chips [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.sc[p.pid]; el.classList.toggle('lead', players.length > 1 && g.sc[p.pid] === lead && lead > 0); }
      $('.pt-msg').textContent = g.phase === 'count' ? (g.left || 'Go!') : '';
    },
    priv(d) { reconcile(d); },
    event(ev) {
      if (ev.e === 'go') { $('.pt-msg').textContent = ''; pop('GO!', 'gold', 50, 70); }
      if (ev.e === 'finish' && ev.pid !== me) { ctx.sfx('pick'); if (ev.place === 1) { const G = ghost.get(ev.pid); pop(`${nameOf(ev.pid)} is up first!`, 'good', 50, Math.max(14, G?.y ?? 20)); } }
      if (ev.e === 'roundEnd') card(ev.rows);
    },
    frame(dt) {
      steer(dt); tickMine();
      if (shake > 0) { shake -= dt; wrap.style.transform = shake > 0 ? `translate(${Math.sin(shake * 90) * 5}px, ${Math.cos(shake * 70) * 3}px)` : ''; }
      if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
      draw(dt);
      const n = $('.pt-note'), s = note(); if (n.textContent !== s) n.textContent = s;
    },
    dispose() { ro.disconnect(); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); },
  };
}
