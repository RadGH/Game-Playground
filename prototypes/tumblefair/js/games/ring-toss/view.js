// RING TOSS on a screen: one 2D canvas of the stall — striped awning, prize plushies on the back wall, a red-cloth
// table seen from the front (the back row smaller) crowded with green, blue and amber bottles and one tall gold one,
// sliding from side to side. Rings in seat colours fly in an arc, clink off rims, and stack up on the necks they
// ring. A phone that plays has the panel underneath (Long Drive's meters, toss-kit.js): ring count + wind, the AIM
// needle, the POWER bar, and one big button (Space works too). While the power bar runs, a marker slides up your
// dashed aim line to show where the ring would land if the table stood still. Halloween: potion bottles, a pumpkin
// for the gold one, purple night.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock, pingPong, sweep, arcY } from '../toss-kit.js';
import { shift, landing } from './sim.js';

const SAY = { ringer: 'RINGER!', lucky: 'Lucky bounce! RINGER!', rim: 'Clink! Off the rim', table: 'Missed', short: 'Too short!', long: 'Too far!' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const TW = init.tw, TD = init.td, bottles = init.bottles;
  ui.innerHTML = `
    <div class="rt-top"><span class="rt-title">${HW ? 'Potion Ring Toss' : 'Ring Toss'}</span><span class="clock"><b>--</b></span></div>
    <div class="rt-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="rt-stall"><canvas></canvas><div class="rt-count"></div><div class="rt-say"></div></div>
    <div class="rt-panel${watching ? ' hidden' : ''}" data-mode="wait">
      <div class="rt-row"><b class="rt-n">Ring 1/${init.rings}</b><span class="rt-wind">No wind</span></div>
      <div class="rt-meter rt-aim"><span>Aim</span><div class="rt-track"><i class="rt-needle"></i></div></div>
      <div class="rt-meter rt-power"><span>Power</span><div class="rt-track"><i class="rt-fill"></i></div></div>
      <button class="rt-btn big-btn">SET AIM</button>
    </div>
    <p class="rt-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.rt-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.2 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 1);
  const byPid = new Map(players.map(p => [p.pid, p]));

  // ---- the throw: aim, then power (the meters run here, on this phone)
  const panel = $('.rt-panel'), btn = $('.rt-btn'), needleEl = $('.rt-needle'), fillEl = $('.rt-fill');
  let phase = 'count', mode = 'wait', m0 = 0, aim = 0, myN = 0, busyTill = 0, sayT = 0, behind = null;
  const setMode = m => { mode = m; panel.dataset.mode = m; btn.textContent = m === 'aim' ? 'SET AIM' : m === 'power' ? 'THROW!' : m === 'done' ? 'All thrown!' : '…'; btn.disabled = !(m === 'aim' || m === 'power'); };
  function press() {
    if (watching || phase !== 'play') return;
    const t = clock.t();
    if (mode === 'aim') { aim = Math.round(sweep(t - m0, L.aim) * 1000) / 1000; m0 = t; setMode('power'); ctx.sfx('tap'); }
    else if (mode === 'power') {
      const p = Math.round(pingPong(t - m0, L.power) * 1000) / 1000;
      ctx.send('toss', { aim, p, t: Math.round(t * 1000) / 1000 });
      const at = landing(aim, p, init.winds[myN] || 0);
      flying.push({ pid: me, k: myN, x: at.x, d: at.d, t, T: t + init.flight, mine: true });
      myN++; busyTill = t + init.flight + 0.45; setMode(myN >= init.rings ? 'done' : 'fly'); ctx.sfx('throw'); showWind();
    }
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  canvas.addEventListener('pointerdown', e => { if (!watching) { e.preventDefault(); press(); } });
  const onKey = e => { if (watching || e.repeat || !['Space', 'Enter'].includes(e.code) || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); press(); };
  addEventListener('keydown', onKey);
  function showWind() {
    const w = init.winds[Math.min(myN, init.rings - 1)] || 0, el = $('.rt-wind');
    el.textContent = !w ? 'No wind' : `Wind ${w > 0 ? '→' : '←'} ${Math.abs(Math.round(w))}`; el.classList.toggle('on', !!w);
    $('.rt-n').textContent = myN >= init.rings ? 'All rings thrown' : `Ring ${myN + 1}/${init.rings}`;
  }

  // ---- drawing
  const flying = [];                 // { pid, k, x, d, t, T, mine }
  const bounces = [];                // { pid, from:[tx,d], to:[tx,d], at, res }
  let stacks = [];
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const C = HW ? { bg: ['#2a1d4a', '#140f26'], wall: '#3b2c5c', awn: ['#ff8a1a', '#2a1d4a'], cloth: '#5a2a7a', cloth2: '#4a2066', bottle: ['#7dff5a', '#b57bff', '#ff8a1a'] }
    : { bg: ['#bfe8ff', '#8fd0f5'], wall: '#ffe7b8', awn: ['#2f7ff0', '#ffffff'], cloth: '#e8394a', cloth2: '#c92a3a', bottle: ['#3ecf6a', '#3d8bff', '#e0a040'] };
  /** table point (table x, depth) -> canvas pixels; `sh` = how far the table has slid now */
  function view() { const k = Math.min(W / (TW + 20), H / 120); return { k, cx: W / 2, yf: H - 18 * k, yb: H - 18 * k - 62 * k }; }
  const P = (v, x, d) => { const s = 1 - 0.32 * Math.max(-10, Math.min(TD + 10, d)) / TD; return { x: v.cx + (x - TW / 2) * s * v.k, y: v.yf + (v.yb - v.yf) * (d / TD), s: s * v.k }; };
  function ringAt(x, y, s, color, tilt = 0.32) { g.save(); g.lineWidth = Math.max(2.5, 2.2 * s); g.strokeStyle = '#0d2228'; g.beginPath(); g.ellipse(x, y, 5.2 * s, 5.2 * s * tilt, 0, 0, Math.PI * 2); g.stroke(); g.lineWidth = Math.max(1.5, 1.3 * s); g.strokeStyle = color; g.stroke(); g.restore(); }
  function bottle(b, v, sh) {
    const p = P(v, b.x + sh, b.d), s = p.s, h = (b.gold ? 30 : 22) * s, w = (b.gold ? 6.4 : 5.6) * s, col = b.gold ? '#ffd23f' : C.bottle[b.row];
    g.save(); g.lineWidth = Math.max(1.5, 0.9 * s); g.strokeStyle = '#0d2228';
    g.globalAlpha = 0.25; g.fillStyle = '#000'; g.beginPath(); g.ellipse(p.x, p.y, w * 1.1, w * 0.35, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    if (HW && b.gold) { // a pumpkin on a tall stand
      g.fillStyle = '#7a5230'; g.fillRect(p.x - w * 0.18, p.y - h * 0.62, w * 0.36, h * 0.62);
      g.fillStyle = '#ff8a1a'; g.beginPath(); g.ellipse(p.x, p.y - h * 0.72, w * 1.05, w * 0.85, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#3f7a2a'; g.fillRect(p.x - w * 0.12, p.y - h * 0.98, w * 0.24, h * 0.14);
    } else {
      g.fillStyle = col; g.beginPath();
      g.moveTo(p.x - w, p.y); g.lineTo(p.x - w, p.y - h * 0.55); g.quadraticCurveTo(p.x - w, p.y - h * 0.72, p.x - w * 0.32, p.y - h * 0.78);
      g.lineTo(p.x - w * 0.32, p.y - h); g.lineTo(p.x + w * 0.32, p.y - h); g.lineTo(p.x + w * 0.32, p.y - h * 0.78);
      g.quadraticCurveTo(p.x + w, p.y - h * 0.72, p.x + w, p.y - h * 0.55); g.lineTo(p.x + w, p.y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(p.x - w * 0.62, p.y - h * 0.55, w * 0.22, h * 0.45);
      if (HW) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y - h * 0.3, w * 0.35, 0, Math.PI * 2); g.fill(); }
      if (b.gold) { g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(p.x, p.y - h * 0.32, w * 0.4, 0, Math.PI * 2); g.fill(); }
    }
    // rings stacked on this neck
    const mine = stacks.filter(r => r[0] === b.i);
    mine.forEach((r, j) => ringAt(p.x, p.y - h * (b.gold && HW ? 0.4 : 0.5) + j * 1.6 * s, s * 0.95, byPid.get(r[1])?.color || '#fff'));
    g.restore();
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const v = view(), sh = shift(init.table, t);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C.bg[0]); bg.addColorStop(1, C.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // back wall with plushies, awning
    const back = P(v, 0, TD + 8), back2 = P(v, TW, TD + 8);
    g.fillStyle = C.wall; g.fillRect(back.x - 20 * v.k, 12 * v.k, back2.x - back.x + 40 * v.k, back.y - 12 * v.k);
    for (let i = 0; i < 7; i++) { const x = back.x + (i + 0.5) * (back2.x - back.x) / 7, y = 26 * v.k; g.fillStyle = HW ? ['#f4f6ff', '#ff8a1a', '#b57bff'][i % 3] : ['#ff9ab8', '#8ff07a', '#ffd23f', '#9fd3ff'][i % 4]; g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + 6 * v.k, 5.5 * v.k, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(x - 3.6 * v.k, y + 1 * v.k, 2 * v.k, 0, Math.PI * 2); g.arc(x + 3.6 * v.k, y + 1 * v.k, 2 * v.k, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#0d2228'; g.fillRect(x - 2 * v.k, y + 5 * v.k, 1.2 * v.k, 1.2 * v.k); g.fillRect(x + 0.8 * v.k, y + 5 * v.k, 1.2 * v.k, 1.2 * v.k); }
    for (let i = 0; i < 12; i++) { g.fillStyle = C.awn[i % 2]; const x0 = i * W / 12; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + W / 12, 0); g.lineTo(x0 + W / 12, 10 * v.k); g.arc(x0 + W / 24, 10 * v.k, W / 24, 0, Math.PI); g.closePath(); g.fill(); }
    // the table (it slides)
    const a = P(v, -6 + sh, -4), b = P(v, TW + 6 + sh, -4), c = P(v, TW + 6 + sh, TD + 4), d = P(v, -6 + sh, TD + 4);
    g.fillStyle = C.cloth; g.strokeStyle = '#0d2228'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = C.cloth2; g.fillRect(a.x, a.y, b.x - a.x, 14 * v.k); g.strokeRect(a.x, a.y, b.x - a.x, 14 * v.k);
    for (let i = 0; i < 9; i++) { g.fillStyle = '#fff3b8'; g.beginPath(); g.arc(a.x + (i + 0.5) * (b.x - a.x) / 9, a.y + 14 * v.k, 3 * v.k, 0, Math.PI); g.fill(); }
    for (const bt of [...bottles].sort((x, y) => y.d - x.d)) bottle(bt, v, sh);
    // my aim line and marker (screen space: it does NOT slide with the table)
    if (!watching && phase === 'play' && (mode === 'aim' || mode === 'power')) {
      const am = mode === 'aim' ? sweep(t - m0, L.aim) : aim, f = landing(am, 0, 0), q0 = P(v, f.x, -8), q1 = P(v, f.x, TD + 6);
      g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke(); g.setLineDash([]);
      if (mode === 'power') { const at = landing(aim, pingPong(t - m0, L.power), 0), q = P(v, at.x, at.d); ringAt(q.x, q.y, q.s, byPid.get(me)?.color || '#fff'); }
    }
    // rings in the air
    for (let i = flying.length - 1; i >= 0; i--) {
      const F = flying[i], u = (t - F.t) / (F.T - F.t); if (u >= 1) { flying.splice(i, 1); continue; } if (u < 0) continue;
      const p = byPid.get(F.pid), from = P(v, TW * (0.3 + 0.4 * (players.indexOf(p) / Math.max(1, players.length - 1 || 1))), -14), to = P(v, F.x, F.d);
      ringAt(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - arcY(u, 40 * v.k), from.s + (to.s - from.s) * u, p?.color || '#fff', 0.32 + 0.5 * Math.abs(Math.sin(u * 9)));
    }
    for (let i = bounces.length - 1; i >= 0; i--) {
      const B = bounces[i], u = (nowS() - B.at) / 0.45; if (u >= 1.6) { bounces.splice(i, 1); continue; }
      const uu = Math.min(1, u), x = B.from[0] + (B.to[0] - B.from[0]) * uu + sh, d2 = B.from[1] + (B.to[1] - B.from[1]) * uu, q = P(v, x, d2);
      if (B.res === 'lucky' && u >= 1) continue;
      g.globalAlpha = u > 1 ? Math.max(0, 1.6 - u) / 0.6 : 1; ringAt(q.x, q.y - arcY(uu, 14 * v.k), q.s, byPid.get(B.pid)?.color || '#fff'); g.globalAlpha = 1;
    }
  }
  function say(text, cls) { const s = $('.rt-say'); s.textContent = text; s.className = 'rt-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Step right up!' : 'Tap once to set your aim, then again to throw.';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      return 'Every ring thrown!';
    }
    if (init.solo) return `Medals: bronze ${init.medals[0]}, silver ${init.medals[1]}, gold ${init.medals[2]}.`;
    return watching ? '' : 'Front 1 · middle 2 · back 3 · GOLD 8';
  }
  setMode('wait'); showWind();
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); m0 = clock.t(); tunes.start(HW ? 'spooky' : 'boogie'); setMode(myN >= init.rings ? 'done' : 'aim'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); setMode('done'); }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase;
      if (me != null && gs.n?.[me] > myN) { myN = gs.n[me]; showWind(); if (mode === 'aim' && myN >= init.rings) setMode('done'); }   // (after a reconnect)
      // a throw the server refused (a late or doubled message): after a couple of seconds, believe the server's count
      if (me != null && gs.phase === 'play' && gs.n?.[me] < myN) { behind ??= nowS(); if (nowS() - behind > 2.2) { myN = gs.n[me]; behind = null; showWind(); if (mode === 'done') { setMode('aim'); m0 = clock.t(); } } } else behind = null;
      stacks = gs.st || stacks;
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.rt-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.rt-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); }
      $('.rt-note').textContent = note(gs);
    },
    event(ev) {
      if (ev.e === 'toss' && ev.pid !== me) flying.push({ pid: ev.pid, k: ev.k, x: ev.x, d: ev.d, t: ev.t, T: ev.t + init.flight });
      else if (ev.e === 'land') {
        if (ev.res === 'rim' || ev.res === 'lucky') { bounces.push({ pid: ev.pid, from: [ev.tx, ev.d], to: [ev.bx, ev.bd], at: nowS(), res: ev.res }); tunes.fx('ding', 1.6); }
        if (ev.res === 'ringer' || ev.res === 'lucky') { stacks = [...stacks, [ev.b, ev.pid]]; if (ev.pid === me || watching) ctx.sfx(bottles[ev.b]?.gold ? 'coins' : 'good'); }
        if (ev.pid === me) { say(ev.pts ? `${SAY[ev.res]} +${ev.pts}` : SAY[ev.res], ev.pts ? (bottles[ev.b]?.gold ? 'gold' : 'good') : 'bad'); if (!ev.pts) ctx.sfx('bad'); }
      } else if (ev.e === 'end') tunes.stop();
    },
    frame() {
      const t = phase === 'count' ? 0 : clock.t();
      if (mode === 'fly' && t >= busyTill) { setMode('aim'); m0 = t; }
      if (mode === 'aim') { needleEl.style.left = `${(sweep(t - m0, L.aim) + 1) * 50}%`; fillEl.style.width = '0%'; }
      else if (mode === 'power') { needleEl.style.left = `${(aim + 1) * 50}%`; fillEl.style.width = `${pingPong(t - m0, L.power) * 100}%`; }
      if (sayT && nowS() - sayT > 1.4) { $('.rt-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
