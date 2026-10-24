// DIRT DASH on a screen: a side-on canvas. A phone that plays shows ITS lane — the camera follows its own bike — with
// the other riders as see-through ghosts on the same dirt, a progress strip along the top (everyone's dot, the
// finish flag), and two big hold buttons: LEAN on the left, GAS on the right (multi-touch; keys: → / Space = gas,
// ← / Shift = lean; a controller's A / right trigger = gas, B / left trigger = lean). A watching screen stacks one lane
// per rider. The rider's own bike is simulated HERE with the sim's stepBike on this phone's 50 ms ticks (so the
// buttons answer at once) and rolled back to the server's copy (priv) whenever the two disagree. Halloween: a night
// track — moon, purple dirt, pumpkins along the track, a headlamp on every bike.
import { chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { buildTrack, groundAt, stepBike, newBike, TRACK, DT } from './sim.js';

const SAY = { loop: 'Flipped over! Tap LEAN', land: 'Crash! Land level!' };
export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const byPid = new Map(players.map(p => [p.pid, p])), H = buildTrack(init.features);
  const faces = new Map(players.map(p => { const im = new Image(); if (p.portrait) im.src = p.portrait; return [p.pid, im]; }));
  ui.innerHTML = `
    <div class="dd-top"><span class="dd-title">${HW ? 'Night Ride' : 'Dirt Dash'}</span><span class="clock"><b>--</b></span></div>
    <div class="dd-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="dd-track"><canvas></canvas><div class="dd-count"></div><div class="dd-say"></div></div>
    <div class="dd-pads${watching ? ' hidden' : ''}"><button class="dd-pad dd-lean big-btn" data-k="l">◀ LEAN</button><button class="dd-pad dd-gas big-btn" data-k="g">GAS ▶</button></div>
    <p class="dd-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.dd-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.16 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 2);

  // ---- my buttons (touch, keys, controller)
  const held = { g: new Set(), l: new Set() };
  for (const b of ui.querySelectorAll('.dd-pad')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} held[k].add('p' + e.pointerId); b.classList.add('on'); });
    const off = e => { held[k].delete('p' + e.pointerId); if (![...held[k]].some(x => x.startsWith('p'))) b.classList.remove('on'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  const KEYS = { ArrowRight: 'g', Space: 'g', KeyD: 'g', ArrowUp: 'g', KeyW: 'g', ArrowLeft: 'l', ShiftLeft: 'l', ShiftRight: 'l', KeyA: 'l', ArrowDown: 'l', KeyS: 'l' };
  const onKey = down => e => { const k = KEYS[e.code]; if (!k || watching || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); if (down) held[k].add(e.code); else held[k].delete(e.code); };
  const kd = onKey(true), ku = onKey(false); addEventListener('keydown', kd); addEventListener('keyup', ku);
  function padInput() { let gp = 0, lp = 0; for (const p of navigator.getGamepads?.() || []) { if (!p) continue; if (p.buttons[0]?.pressed || p.buttons[7]?.value > 0.3 || p.buttons[15]?.pressed) gp = 1; if (p.buttons[1]?.pressed || p.buttons[6]?.value > 0.3 || p.buttons[14]?.pressed) lp = 1; } return { gp, lp }; }
  const input = () => { const P = padInput(); return { g: held.g.size || P.gp ? 1 : 0, l: held.l.size || P.lp ? 1 : 0 }; };

  // ---- my bike, simulated here; rolled back to the server's when they differ
  let phase = 'count', mine = newBike(), k = 0, hist = new Map(), lastSent = '', bikes = {}, shown = new Map(), sayT = 0, pops = [], fx = [];
  const copy = b => ({ ...b });
  function tickMine() {
    const target = Math.floor(clock.t() / DT);
    let n = 0;
    while (k < target && n++ < 12) {
      const inp = input(); hist.set(k, { b: copy(mine), inp });
      for (const ev of stepBike(mine, inp, H, L)) onMine(ev);
      const key = inp.g + ',' + inp.l; if (key !== lastSent || k % 4 === 0) { ctx.send('in', { k, ...inp }); lastSent = key; }
      hist.delete(k - 80); k++;
    }
    if (k < target) k = target;                          // (a phone that stalled for a while: skip ahead, the server carried us)
  }
  function onMine(ev) {
    if (ev.e === 'land') { if (ev.pts) { pop(ev.flips ? `${ev.flips > 1 ? ev.flips + 'x ' : ''}${ev.front ? 'FRONT FLIP' : 'BACKFLIP'}! +${ev.pts}` : ev.perfect ? `Perfect landing! +${ev.pts}` : `Big air! +${ev.pts}`, 'gold'); ctx.sfx(ev.flips ? 'coins' : 'good'); } else tunes.fx('knock', 0.8); burst(mine.x, mine.y, 6); }
    else if (ev.e === 'crash') { say(SAY[ev.why] || 'Crash!', 'bad'); ctx.sfx('out'); navigator.vibrate?.(80); burst(mine.x, mine.y, 14); }
    else if (ev.e === 'wheelie') pop(`Wheelie! +${ev.pts}`, 'good');
    else if (ev.e === 'jump') tunes.fx('boing', 1.3);
    else if (ev.e === 'finish') { say('FINISH!', 'gold'); ctx.sfx('win'); }
  }
  function reconcile(p) {
    if (!p?.b || p.k == null) return;
    const h = hist.get(p.k);
    if (p.k > k) { mine = copy(p.b); k = p.k; hist.clear(); return; }
    if (!h) return;
    const a = h.b, b = p.b;
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.ang - b.ang) < 1e-6 && a.air === b.air && a.crash === b.crash) return;
    mine = copy(b);                                       // the server is right: replay our presses since then
    for (let j = p.k; j < k; j++) { const H2 = hist.get(j); if (!H2) continue; H2.b = copy(mine); stepBike(mine, H2.inp, H, L); }
  }
  // ---- drawing
  let W = 0, Hh = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; Hh = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const C = HW ? { sky: ['#1d1438', '#4a2a6a'], far: '#2a1d4a', dirt: '#5a3a5a', dirt2: '#3a2440', top: '#7a4a8a', ramp: '#8a5a3a', line: '#120a1c' }
    : { sky: ['#8fd0f5', '#fff1c8'], far: '#9be07a', dirt: '#b97a45', dirt2: '#8a5a30', top: '#6fbf5a', ramp: '#d9a066', line: '#2a1a10' };
  const ramps = init.features.filter(f => f.k === 'kicker' || f.k === 'big');
  function lane(y0, h, cx, focus, t) {
    const span = W < h ? 15 : Math.max(22, Math.min(40, W / 13)), k2 = W / span, x0 = cx - span * 0.3, gy = y0 + h * (W < h ? 0.66 : 0.78);   // an upright phone: closer in, so the bike is big
    const X = x => (x - x0) * k2, Y = y => gy - y * k2;
    g.save(); g.beginPath(); g.rect(0, y0, W, h); g.clip();
    const bg = g.createLinearGradient(0, y0, 0, y0 + h); bg.addColorStop(0, C.sky[0]); bg.addColorStop(1, C.sky[1]); g.fillStyle = bg; g.fillRect(0, y0, W, h);
    if (HW) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(W * 0.8, y0 + h * 0.2, Math.min(20, h * 0.1), 0, Math.PI * 2); g.fill(); }
    // far hills and a big wheel (parallax)
    g.fillStyle = C.far; g.beginPath(); g.moveTo(0, gy); for (let sx = 0; sx <= W; sx += 16) { const wx = x0 * 0.3 + sx / k2; g.lineTo(sx, gy - k2 * (3 + 1.6 * Math.sin(wx / 9) + Math.sin(wx / 4.3))); } g.lineTo(W, gy); g.fill();
    const wx = ((-(x0 * 0.2 * k2)) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3, wr = Math.min(h * 0.32, 70);
    g.strokeStyle = HW ? 'rgba(255,138,26,.5)' : 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.beginPath(); g.arc(wx, gy - wr - 10, wr, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.3; g.beginPath(); g.moveTo(wx, gy - wr - 10); g.lineTo(wx + Math.cos(a) * wr, gy - wr - 10 + Math.sin(a) * wr); g.stroke(); }
    // the dirt
    g.fillStyle = C.dirt; g.beginPath(); g.moveTo(0, y0 + h);
    for (let sx = 0; sx <= W + 4; sx += 4) g.lineTo(sx, Y(groundAt(H, x0 + sx / k2))); g.lineTo(W, y0 + h); g.closePath(); g.fill();
    g.strokeStyle = C.top; g.lineWidth = 4; g.beginPath(); for (let sx = 0; sx <= W + 4; sx += 4) { const y = Y(groundAt(H, x0 + sx / k2)); sx ? g.lineTo(sx, y) : g.moveTo(sx, y); } g.stroke();
    for (const f of ramps) { if (f.x + f.len < x0 || f.x > x0 + span) continue; g.strokeStyle = C.ramp; g.lineWidth = 5; g.beginPath(); for (let u = 0; u <= f.len; u += 0.5) { const y = Y(groundAt(H, f.x + u)); u ? g.lineTo(X(f.x + u), y) : g.moveTo(X(f.x + u), y); } g.stroke(); g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(X(f.x + f.len), Y(groundAt(H, f.x + f.len))); g.lineTo(X(f.x + f.len), gy + 6); g.stroke(); }
    for (let m = Math.ceil(x0 / 50) * 50; m < x0 + span; m += 50) { if (m <= 0 || m >= TRACK) continue; const y = Y(groundAt(H, m)); g.fillStyle = '#fff'; g.fillRect(X(m) - 1, y - 26, 3, 26); g.font = '900 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`${m} m`, X(m), y - 30); if (HW && m % 100 === 0) { g.fillStyle = '#ff8a1a'; g.beginPath(); g.ellipse(X(m) + 14, y - 6, 8, 6.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3a1a00'; g.fillRect(X(m) + 10, y - 8, 2.5, 2.5); g.fillRect(X(m) + 15, y - 8, 2.5, 2.5); } }
    if (TRACK > x0 && TRACK < x0 + span) { const fx2 = X(TRACK), y = Y(0); for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? '#fff' : '#111'; g.fillRect(fx2 + c * 6, y - 60 + r * 6, 6, 6); } g.fillStyle = C.line; g.fillRect(fx2 - 2, y - 62, 3, 62); }
    for (const P of players) { if (P.pid === focus) continue; const b = shown.get(P.pid); if (b) bike(X(b.x), Y(b.y), b.ang, k2, P, 0.35, b.flags); }
    const fb = focus === me ? { x: mine.x, y: mine.y, ang: mine.ang, flags: (mine.air ? 1 : 0) | (mine.crash > 0 ? 2 : 0) } : shown.get(focus);
    if (fb) bike(X(fb.x), Y(fb.y), fb.ang, k2, byPid.get(focus), 1, fb.flags);
    for (const f of fx) { const u = (nowS() - f.at) / 0.6; if (u >= 1) continue; g.fillStyle = `rgba(200,160,110,${0.7 * (1 - u)})`; for (let i = 0; i < f.n; i++) { const a = i * 2.4; g.beginPath(); g.arc(X(f.x) + Math.cos(a) * u * 26, Y(f.y) - Math.abs(Math.sin(a)) * u * 20, 4 * (1 - u) + 2, 0, Math.PI * 2); g.fill(); } }
    g.restore();
  }
  function bike(x, y, ang, k2, P, alpha, flags) {
    const s = k2 * 0.62; g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(-ang);
    if (flags & 2) g.rotate(0.9);
    const col = P?.color || '#fff';
    g.strokeStyle = C.line; g.lineWidth = 2;
    for (const wx of [-1, 1]) { g.fillStyle = '#222'; g.beginPath(); g.arc(wx * s * 1.05, -s * 0.6, s * 0.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#aaa'; g.beginPath(); g.arc(wx * s * 1.05, -s * 0.6, s * 0.22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = col; g.beginPath(); g.moveTo(-s * 1.05, -s * 0.6); g.lineTo(-s * 0.2, -s * 1.35); g.lineTo(s * 0.8, -s * 1.4); g.lineTo(s * 1.05, -s * 0.6); g.lineTo(s * 0.3, -s * 0.9); g.closePath(); g.fill(); g.stroke();
    if (HW) { g.fillStyle = 'rgba(255,240,150,.35)'; g.beginPath(); g.moveTo(s * 1.0, -s * 1.3); g.lineTo(s * 4, -s * 2.1); g.lineTo(s * 4, -s * 0.6); g.closePath(); g.fill(); }
    // the rider: body in seat colour, face from the avatar
    g.fillStyle = col; g.beginPath(); g.moveTo(-s * 0.35, -s * 1.4); g.lineTo(s * 0.05, -s * 2.3); g.lineTo(s * 0.55, -s * 2.15); g.lineTo(s * 0.4, -s * 1.4); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.moveTo(s * 0.4, -s * 2.05); g.lineTo(s * 0.85, -s * 1.55); g.stroke();
    const im = faces.get(P?.pid), hr = s * 0.5, hx = s * 0.3, hy = -s * 2.75;
    g.fillStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, hr + 2.5, 0, Math.PI * 2); g.fill(); g.stroke();
    if (im?.complete && im.naturalWidth) { g.save(); g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.clip(); g.drawImage(im, hx - hr, hy - hr, hr * 2, hr * 2); g.restore(); }
    g.restore();
  }
  function strip(t) {
    const y = 16, x0 = 14, x1 = W - 30; g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.lineCap = 'butt';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? '#fff' : '#111'; g.fillRect(x1 + 4 + c * 5, y - 5 + r * 5, 5, 5); }
    for (const P of players) { const b = P.pid === me ? mine : shown.get(P.pid); if (!b) continue; const x = x0 + (x1 - x0) * Math.min(1, b.x / TRACK); g.fillStyle = P.color; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, P.pid === me ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    if (!watching) { lane(0, Hh, mine.x, me, t); strip(t); }
    else { const list = players.map(p => p.pid), lh = Hh / list.length; list.forEach((pid, i) => { const b = shown.get(pid) || { x: 2 }; lane(i * lh, lh, b.x, pid, t); g.fillStyle = byPid.get(pid)?.color; g.font = '900 14px system-ui, sans-serif'; g.textAlign = 'left'; g.strokeStyle = C.line; g.lineWidth = 3; g.strokeText(byPid.get(pid)?.name || '', 8, i * lh + 18); g.fillText(byPid.get(pid)?.name || '', 8, i * lh + 18); }); }
    for (let i = pops.length - 1; i >= 0; i--) { const P = pops[i], u = (nowS() - P.at) / 1.3; if (u >= 1) { pops.splice(i, 1); continue; } g.globalAlpha = 1 - u * u; g.font = '900 22px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = C.line; g.fillStyle = P.cls === 'gold' ? '#ffd23f' : '#fff'; const y = Hh * 0.3 - u * 30 + i * 26; g.strokeText(P.text, W / 2, y); g.fillText(P.text, W / 2, y); g.globalAlpha = 1; }
    fx = fx.filter(f => nowS() - f.at < 0.6);
  }
  const pop = (text, cls) => pops.push({ text, cls, at: nowS() });
  const burst = (x, y, n) => fx.push({ x, y, n, at: nowS() });
  function say(text, cls) { const s = $('.dd-say'); s.textContent = text; s.className = 'dd-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Riders ready!' : 'GAS to go — tap LEAN when the front lifts!';
    if (gs.phase === 'end') return 'Race over!';
    return watching ? '' : 'In the air: GAS = backflip · LEAN = front flip · land level!';
  }
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'boogie'); }
        if (gs.phase === 'end') { tunes.stop(); }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase; bikes = gs.bk || bikes;
      for (const [pid, row] of Object.entries(bikes)) { const p = +pid, cur = shown.get(p); const to = { x: row[0], y: row[1], ang: row[2], flags: row[3] }; if (!cur || Math.abs(cur.x - to.x) > 6) shown.set(p, { ...to, to }); else cur.to = to; }
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.dd-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.dd-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); }
      $('.dd-note').textContent = note(gs);
    },
    priv(d) { reconcile(d); },
    event(ev) {
      if (ev.pid === me) return;                         // my own bike's happenings come from my own simulation
      if (watching && ev.e === 'land' && ev.flips) ctx.sfx('good');
      if (ev.e === 'finish' && watching) ctx.sfx('win');
    },
    frame(dt) {
      const t = clock.t();
      if (!watching && phase === 'play') tickMine();
      const a = 1 - Math.exp(-dt * 14);
      for (const b of shown.values()) { if (!b.to) continue; b.x += (b.to.x - b.x) * a; b.y += (b.to.y - b.y) * a; b.ang += (b.to.ang - b.ang) * a; b.flags = b.to.flags; }
      for (const b of ui.querySelectorAll('.dd-pad')) b.classList.toggle('on', !!input()[b.dataset.k]);
      if (sayT && nowS() - sayT > 1.4) { $('.dd-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); ro?.disconnect(); tunes.dispose(); },
  };
}
