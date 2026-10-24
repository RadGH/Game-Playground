// CASTLE ARCHERS on a screen: one 2D canvas, a side view — a stone wall with battlements and a wooden gate on the
// left, a grassy field to the right, hills and clouds behind. Each player is a little archer on the wall (their face
// from the avatar system, a hood in their seat colour). Goblins (round, green, smiling, in tin helmets) walk in from
// the right; Shield goblins carry a round wooden shield, Kite goblins dangle under a kite, Bruisers are big and show
// pips for the hits they have left. Drag BACK anywhere on the canvas to aim: a dotted arc shows the first part of the
// flight (with the wind), let go to shoot. Arrows are flown here with the sim's own stepArrow from the 'shot' events
// and removed on the hit / down / miss event. The flag on the tower shows the wind. Halloween: a night sky with a
// moon, pumpkin helmets, bat-wing gliders for the kites, jack-o'-lanterns on the battlements.
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { launch, stepArrow, goblinAt } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level, K = init.kinds;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="ca-top"><span class="ca-title">${HW ? 'Pumpkin Patrol' : 'Castle Archers'}</span><span class="clock"><b>--</b></span></div>
    <div class="ca-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="ca-bar"><span class="ca-wave">Get ready</span><span class="ca-gate"><b>Gate</b><i><u></u></i></span><span class="ca-wind">No wind</span></div>
    <div class="ca-field"><canvas></canvas><div class="ca-count"></div><div class="ca-say"></div></div>
    <p class="ca-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.ca-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.18 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, 200);
  const faces = new Map(players.map(p => { const im = new Image(); if (p.portrait) im.src = p.portrait; return [p.pid, im]; }));

  let phase = 'count', live = [], wind = 0, wave = 0, arrows = new Map(), stuck = [], pops = [], sayT = 0, lastShot = -9;
  let drag = null, keyAim = null;                           // drag: { sx, sy, x, y } in canvas px; keyAim: { a, p }
  // ---- view transform (world metres -> canvas px)
  let W = 0, H = 0, dpr = 1, k = 8, ox = 0, gy = 0, span = 42;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); span = W < H * 1.25 ? 27 : init.field + 2; k = Math.min(W / span, (H - 26) / 12.5); ox = k; gy = H - 22; }   // an upright phone shows the near 27 m (the goblins further out wait at the edge)
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const X = x => ox + x * k, Y = y => gy - y * k;

  // ---- aiming
  const aimFromDrag = d => { const dx = d.sx - d.x, dy = d.y - d.sy, len = Math.hypot(dx, dy); return { a: Math.max(-0.5, Math.min(1.45, Math.atan2(dy, Math.max(0.01, dx)))), p: Math.min(1, len / Math.max(110, Math.min(W, H) * 0.45)), len }; };
  const canShoot = () => !watching && phase === 'play' && clock.t() - lastShot >= init.cool;
  function shoot(a, p) {
    if (!canShoot()) return;
    lastShot = clock.t(); ctx.send('shoot', { a: Math.round(a * 1000) / 1000, p: Math.round(p * 1000) / 1000 }); ctx.sfx('throw'); tunes.fx('whistle', 1.6);
  }
  // the whole screen is the aiming pad (not just the field), so a drag that starts under the field works too
  ui.addEventListener('pointerdown', e => { if (watching || e.target.closest('button, .chip')) return; e.preventDefault(); try { ui.setPointerCapture(e.pointerId); } catch {} const r = canvas.getBoundingClientRect(); drag = { sx: e.clientX - r.left, sy: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top }; keyAim = null; });
  ui.addEventListener('pointermove', e => { if (!drag) return; const r = canvas.getBoundingClientRect(); drag.x = e.clientX - r.left; drag.y = e.clientY - r.top; });
  const up = () => { if (!drag) return; const A = aimFromDrag(drag); drag = null; if (A.len > 18) shoot(A.a, A.p); };
  ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', () => { drag = null; });
  const onKey = e => {
    if (watching || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    const A = keyAim || (keyAim = { a: 0.45, p: 0.6 });
    if (e.code === 'ArrowUp' || e.code === 'KeyW') A.a = Math.min(1.45, A.a + 0.04); else if (e.code === 'ArrowDown' || e.code === 'KeyS') A.a = Math.max(-0.5, A.a - 0.04);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') A.p = Math.min(1, A.p + 0.025); else if (e.code === 'ArrowLeft' || e.code === 'KeyA') A.p = Math.max(0, A.p - 0.025);
    else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) shoot(A.a, A.p); else return;
    e.preventDefault();
  };
  addEventListener('keydown', onKey);

  // ---- drawing
  const C = HW ? { sky: ['#1d1438', '#3a2466'], hill: '#24183f', hill2: '#2e1f50', grass: '#3c5a34', dirt: '#4a3a2a', stone: '#8c84a8', stone2: '#6e6690', gate: '#4a2a1a', line: '#120a1c', gob: '#7dcf5a', gob2: '#4f9a3a', helm: '#ff8a1a' }
    : { sky: ['#8fd0f5', '#e6f6ff'], hill: '#9be07a', hill2: '#7cc95a', grass: '#6fbf5a', dirt: '#c9a06a', stone: '#d8d2c4', stone2: '#b9b1a0', gate: '#8a5225', line: '#2a2a33', gob: '#7dcf5a', gob2: '#4f9a3a', helm: '#b9c2cc' };
  function scenery(t) {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C.sky[0]); bg.addColorStop(1, C.sky[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (HW) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(W * 0.78, H * 0.18, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1d1438'; g.beginPath(); g.arc(W * 0.78 + 9, H * 0.18 - 5, 19, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect((i * 97) % W, (i * 53) % (H * 0.5), 2, 2); } }
    else { g.fillStyle = 'rgba(255,255,255,.9)'; for (const [cx, cy, s] of [[0.3, 0.16, 1], [0.7, 0.1, 0.8], [0.9, 0.25, 0.7]]) { const x = ((cx * W + t * 6 * s) % (W + 80)) - 40; g.beginPath(); g.arc(x, cy * H, 16 * s, 0, Math.PI * 2); g.arc(x + 18 * s, cy * H - 6, 20 * s, 0, Math.PI * 2); g.arc(x + 38 * s, cy * H, 14 * s, 0, Math.PI * 2); g.fill(); } }
    g.fillStyle = C.hill; g.beginPath(); g.moveTo(0, gy); for (let x = 0; x <= W; x += 20) g.lineTo(x, gy - 40 - 22 * Math.sin(x / 70) - 12 * Math.sin(x / 31)); g.lineTo(W, gy); g.fill();
    g.fillStyle = C.hill2; g.beginPath(); g.moveTo(0, gy); for (let x = 0; x <= W; x += 20) g.lineTo(x, gy - 18 - 10 * Math.sin(x / 45 + 1)); g.lineTo(W, gy); g.fill();
    g.fillStyle = C.grass; g.fillRect(0, gy, W, H - gy); g.fillStyle = C.dirt; g.fillRect(X(init.gateX), gy + 4, W, 7);
    // the castle wall, battlements, gate, a tower with the wind flag
    const wx0 = X(-1), wx1 = X(init.gateX), wy = Y(init.wallY);
    g.fillStyle = C.stone; g.fillRect(wx0, wy, wx1 - wx0, gy - wy); g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(wx0, wy, wx1 - wx0, gy - wy);
    g.strokeStyle = C.stone2; g.lineWidth = 1; for (let r = 0; r < 7; r++) { const y = wy + r * (gy - wy) / 7; g.beginPath(); g.moveTo(wx0, y); g.lineTo(wx1, y); g.stroke(); for (let c = 0; c < 4; c++) { const x = wx0 + (c + (r % 2) * 0.5) * (wx1 - wx0) / 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (gy - wy) / 7); g.stroke(); } }
    for (let i = 0; i < 4; i++) { const x = wx0 + i * (wx1 - wx0) / 3.5; g.fillStyle = C.stone; g.fillRect(x, wy - k * 0.9, k * 0.9, k * 0.9); g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(x, wy - k * 0.9, k * 0.9, k * 0.9); if (HW && i % 2) { g.fillStyle = '#ff8a1a'; g.beginPath(); g.ellipse(x + k * 0.45, wy - k * 1.25, k * 0.45, k * 0.38, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3a1a00'; g.fillRect(x + k * 0.25, wy - k * 1.35, k * 0.12, k * 0.12); g.fillRect(x + k * 0.55, wy - k * 1.35, k * 0.12, k * 0.12); } }
    const gh = k * 3.2, gw = k * 1.6; g.fillStyle = C.gate; g.beginPath(); g.moveTo(wx1 - gw, gy); g.lineTo(wx1 - gw, gy - gh + gw / 2); g.arc(wx1 - gw / 2, gy - gh + gw / 2, gw / 2, Math.PI, 0); g.lineTo(wx1, gy); g.closePath(); g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(wx1 - gw + i * gw / 4, gy); g.lineTo(wx1 - gw + i * gw / 4, gy - gh + gw * 0.4); g.stroke(); }
    const tx = X(-0.4), ty = wy - k * 3.4; g.fillStyle = C.stone2; g.fillRect(tx - k * 0.7, ty, k * 1.4, wy - ty); g.strokeStyle = C.line; g.strokeRect(tx - k * 0.7, ty, k * 1.4, wy - ty);
    g.fillStyle = HW ? '#6a32b8' : '#3d6fd8'; g.beginPath(); g.moveTo(tx - k, ty); g.lineTo(tx, ty - k * 1.6); g.lineTo(tx + k, ty); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(tx, ty - k * 1.6); g.lineTo(tx, ty - k * 3); g.stroke();
    const fl = Math.max(-1, Math.min(1, wind / 3)), flap = Math.sin(t * 9) * 0.15 * k;
    g.fillStyle = HW ? '#ff8a1a' : '#e8394a'; g.beginPath(); g.moveTo(tx, ty - k * 3); g.lineTo(tx + (fl || 0.2) * k * 2.2, ty - k * 2.7 + flap); g.lineTo(tx, ty - k * 2.4); g.closePath(); g.fill(); g.stroke();
  }
  function archer(pid, t) {
    const at = init.archers[pid]; if (!at) return; const p = byPid.get(pid), x = X(at.x), y = Y(at.y - 0.9), s = k * 0.95;
    g.fillStyle = p?.color || '#fff'; g.strokeStyle = C.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - s * 0.55, y); g.lineTo(x - s * 0.4, y - s * 1.2); g.lineTo(x + s * 0.4, y - s * 1.2); g.lineTo(x + s * 0.55, y); g.closePath(); g.fill(); g.stroke();
    const im = faces.get(pid), hr = s * 0.62, hy = y - s * 1.75;
    g.beginPath(); g.arc(x, hy, hr + 2, 0, Math.PI * 2); g.fill(); g.stroke();
    if (im?.complete && im.naturalWidth) { g.save(); g.beginPath(); g.arc(x, hy, hr, 0, Math.PI * 2); g.clip(); g.drawImage(im, x - hr, hy - hr, hr * 2, hr * 2); g.restore(); }
    else { g.fillStyle = '#ffe0c0'; g.beginPath(); g.arc(x, hy, hr, 0, Math.PI * 2); g.fill(); }
    const aim = pid === me ? (drag ? aimFromDrag(drag) : keyAim) : null, a = aim ? aim.a : 0.35, bx = x + s * 0.55, by = y - s * 0.9;
    g.strokeStyle = '#8a5225'; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, s * 0.7, a - 1.2, a + 1.2); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1; const pull = aim ? aim.p * s * 0.5 : 0; g.beginPath(); g.moveTo(bx + Math.cos(a - 1.2) * s * 0.7, by - Math.sin(a - 1.2) * s * 0.7); g.lineTo(bx - Math.cos(a) * pull, by + Math.sin(a) * pull); g.lineTo(bx + Math.cos(a + 1.2) * s * 0.7, by - Math.sin(a + 1.2) * s * 0.7); g.stroke();
    if (pid === me && !watching) { g.font = '900 11px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = C.line; g.fillStyle = clock.t() - lastShot >= init.cool ? '#fff' : '#ffd9a0'; g.strokeText('YOU', x, hy - hr - 6); g.fillText('YOU', x, hy - hr - 6); }
  }
  function goblin(id, hp, shield, t) {
    const gb = init.goblins[id], kk = K[gb.k], at = goblinAt(gb, t, L), x = X(at.x), y = Y(at.y), w = kk.w * k, h = kk.h * k;
    const bob = at.y ? 0 : Math.abs(Math.sin(t * 8 + id)) * k * 0.12;
    if (kk.fly) { // a kite (or, at Halloween, bat wings) over the rider
      g.fillStyle = HW ? '#2a1238' : ['#ff5f7a', '#ffd23f', '#4fa8ff'][id % 3]; g.strokeStyle = C.line; g.lineWidth = 2;
      if (HW) { const f = Math.sin(t * 12) * 0.4; g.beginPath(); g.moveTo(x, y - h * 1.05); g.quadraticCurveTo(x - w * 0.8, y - h * (1.7 + f * 0.3), x - w * 1.4, y - h * 1.1); g.quadraticCurveTo(x - w * 0.7, y - h * 1.2, x, y - h * 0.95); g.quadraticCurveTo(x + w * 0.7, y - h * 1.2, x + w * 1.4, y - h * 1.1); g.quadraticCurveTo(x + w * 0.8, y - h * (1.7 + f * 0.3), x, y - h * 1.05); g.fill(); g.stroke(); }
      else { g.beginPath(); g.moveTo(x, y - h * 2.1); g.lineTo(x + w * 0.8, y - h * 1.45); g.lineTo(x, y - h * 1.0); g.lineTo(x - w * 0.8, y - h * 1.45); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(x, y - h); g.lineTo(x, y - h * 0.8); g.stroke(); }
    }
    g.fillStyle = gb.k === 'bruiser' ? C.gob2 : C.gob; g.strokeStyle = C.line; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y - h * 0.45 - bob, w * 0.5, h * 0.45, 0, 0, Math.PI * 2); g.fill(); g.stroke();                    // body
    g.beginPath(); g.ellipse(x - w * 0.55, y - h * 0.62 - bob, w * 0.18, h * 0.08, -0.4, 0, Math.PI * 2); g.fill(); g.stroke();   // ear
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - w * 0.18, y - h * 0.58 - bob, w * 0.12, 0, Math.PI * 2); g.arc(x + w * 0.05, y - h * 0.58 - bob, w * 0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.line; g.beginPath(); g.arc(x - w * 0.21, y - h * 0.58 - bob, w * 0.055, 0, Math.PI * 2); g.arc(x + w * 0.02, y - h * 0.58 - bob, w * 0.055, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.5; g.beginPath(); g.arc(x - w * 0.08, y - h * 0.42 - bob, w * 0.14, 0.2, Math.PI - 0.2); g.stroke();             // a smile
    g.fillStyle = C.helm; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y - h * 0.82 - bob, w * 0.42, h * 0.16, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();   // helmet
    if (HW) { g.fillStyle = '#3f7a2a'; g.fillRect(x - 1.5, y - h * 0.98 - bob, 3, h * 0.08); }
    if (gb.k === 'runner') { g.fillStyle = '#e8394a'; g.fillRect(x - w * 0.45, y - h * 0.74 - bob, w * 0.9, h * 0.06); }
    if (shield) { g.fillStyle = '#b9824a'; g.beginPath(); g.ellipse(x - w * 0.5, y - h * 0.4 - bob, w * 0.22, h * 0.32, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#d8d2c4'; g.beginPath(); g.arc(x - w * 0.5, y - h * 0.4 - bob, w * 0.07, 0, Math.PI * 2); g.fill(); }
    if (kk.hp > 1 && !shield) for (let i = 0; i < hp; i++) { g.fillStyle = '#ff5f5f'; g.beginPath(); g.arc(x - (hp - 1) * 4 + i * 8, y - h - 6 - bob, 3.2, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }
  function arrowAt(A, col) { const ang = Math.atan2(-A.vy, A.vx); g.save(); g.translate(X(A.x), Y(A.y)); g.rotate(ang); g.strokeStyle = '#6a4220'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-k * 0.9, 0); g.lineTo(k * 0.35, 0); g.stroke(); g.fillStyle = '#d8d2c4'; g.beginPath(); g.moveTo(k * 0.55, 0); g.lineTo(k * 0.25, -k * 0.16); g.lineTo(k * 0.25, k * 0.16); g.fill(); g.fillStyle = HW ? '#ff8a1a' : col; g.fillRect(-k * 0.9, -k * 0.14, k * 0.32, k * 0.28); g.restore(); }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    scenery(t);
    for (const s of stuck) { g.globalAlpha = Math.max(0, 1 - (nowS() - s.at) / 1.8); arrowAt({ x: s.x, y: 0.15, vx: 1, vy: -0.8 }, s.col); } g.globalAlpha = 1;
    stuck = stuck.filter(s => nowS() - s.at < 1.8);
    let waiting = 0;
    for (const [id, hp, shield] of live) { const gb = init.goblins[id], at = goblinAt(gb, t, L); if (X(at.x) > W + 6) { waiting++; continue; } goblin(id, hp, shield, t); }
    if (waiting) { const y = Y(1.6); g.fillStyle = C.gob; g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(W - 4, y); g.lineTo(W - 18, y - 12); g.lineTo(W - 18, y + 12); g.closePath(); g.fill(); g.stroke(); g.font = '900 13px system-ui, sans-serif'; g.textAlign = 'right'; g.lineWidth = 3; g.strokeText(`${waiting} coming`, W - 22, y + 4); g.fillStyle = '#fff'; g.fillText(`${waiting} coming`, W - 22, y + 4); }
    for (const p of players) archer(p.pid, t);
    // fly the arrows here (fixed 60 Hz steps from when we saw the shot)
    for (const A of arrows.values()) { while (A.sim < nowS() - 1 / 60) { stepArrow(A, wind, 1 / 60); A.sim += 1 / 60; } if (A.y < -1 || A.t > 4) arrows.delete(A.id); else arrowAt(A, A.col); }
    // my aim arc
    const aim = drag ? aimFromDrag(drag) : keyAim;
    if (aim && !watching && phase === 'play' && (!drag || aim.len > 10)) {
      const A = launch(aim.a, aim.p, init.archers[me]); g.fillStyle = '#fff'; g.strokeStyle = C.line; g.lineWidth = 1;
      for (let i = 0; i < 30; i++) { stepArrow(A, wind, 1 / 60); stepArrow(A, wind, 1 / 60); if (i % 2 === 0) { g.beginPath(); g.arc(X(A.x), Y(A.y), 2.6, 0, Math.PI * 2); g.fill(); g.stroke(); } }
      if (drag) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(drag.sx, drag.sy); g.lineTo(drag.x, drag.y); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(drag.sx, drag.sy, 6, 0, Math.PI * 2); g.fill(); }
      g.font = '900 12px system-ui, sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = C.line; g.fillStyle = '#ffd23f'; const tx = X(init.archers[me].x) + 14, ty = Y(init.archers[me].y) - 34, txt = `${Math.round(aim.a * 57.3)}° · ${Math.round(aim.p * 100)}%`; g.strokeText(txt, tx, ty); g.fillText(txt, tx, ty);
    }
    for (let i = pops.length - 1; i >= 0; i--) { const P = pops[i], u = (nowS() - P.at) / 1.1; if (u >= 1) { pops.splice(i, 1); continue; } g.globalAlpha = 1 - u * u; g.font = `900 ${P.big ? 20 : 15}px system-ui, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = C.line; g.fillStyle = P.col; const y = Y(P.y) - 10 - u * 30; g.strokeText(P.text, X(P.x), y); g.fillText(P.text, X(P.x), y); g.globalAlpha = 1; }
  }
  function say(text, cls) { const s = $('.ca-say'); s.textContent = text; s.className = 'ca-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  const name = pid => (pid === me ? 'You' : byPid.get(pid)?.name || '?');
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'Defend the castle!' : 'Drag BACK on the field and let go to shoot!';
    if (gs.phase === 'end') return gs.gate > 0 ? 'The gate held! Well shot, archers!' : 'The goblins broke the gate!';
    return watching ? '' : 'Further back = more power · the flag shows the wind';
  }
  return {
    state(gs) {
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'jig'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx(gs.gate > 0 ? 'win' : 'bad'); say(gs.gate > 0 ? 'THE GATE HOLDS!' : 'THE GATE IS DOWN!', gs.gate > 0 ? 'gold' : 'bad'); }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase; live = gs.gb;
      wave = gs.w; wind = init.winds[wave] || 0;
      $('.ca-wave').textContent = gs.phase === 'count' ? 'Get ready' : `Wave ${wave + 1}/${init.waves}`;
      $('.ca-gate u').style.width = `${Math.max(0, gs.gate)}%`; $('.ca-gate').classList.toggle('low', gs.gate <= 35);
      const we = $('.ca-wind'); we.textContent = !wind ? 'No wind' : `Wind ${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(1)}`; we.classList.toggle('on', !!wind);
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.ca-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.ca-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); }
      $('.ca-note').textContent = note(gs);
    },
    event(ev) {
      if (ev.e === 'shot') { const A = launch(ev.a, ev.p, init.archers[ev.pid]); A.id = ev.id; A.sim = nowS(); A.col = byPid.get(ev.pid)?.color || '#fff'; arrows.set(ev.id, A); if (ev.pid !== me) tunes.fx('whistle', 1.8); }
      else if (ev.e === 'hit' || ev.e === 'down' || ev.e === 'miss') {
        const A = arrows.get(ev.aid); arrows.delete(ev.aid);
        if (ev.e === 'miss') { stuck.push({ x: A ? A.x : ev.x, at: nowS(), col: A?.col || '#fff' }); return; }
        tunes.fx(ev.shield ? 'knock' : 'pop', ev.e === 'down' ? 1.2 : 0.9);
        if (ev.e === 'down') { pops.push({ x: ev.x, y: ev.y + 1, text: ev.by === me ? `+${ev.pts}` : `${name(ev.by)} +${ev.pts}`, col: ev.by === me ? '#ffd23f' : '#fff', at: nowS(), big: ev.by === me }); if (ev.by === me) ctx.sfx('good'); }
        else pops.push({ x: ev.x, y: ev.y, text: ev.shield ? 'Clonk!' : 'Ouch!', col: '#fff', at: nowS() });
      } else if (ev.e === 'wave') { say(ev.w === 0 ? 'Here they come!' : `Wave ${ev.w + 1}!`, 'gold'); ctx.sfx('pick'); }
      else if (ev.e === 'bash') { ctx.sfx('hit'); navigator.vibrate?.(30); }
    },
    frame() {
      const t = phase === 'count' ? 0 : clock.t();
      if (sayT && nowS() - sayT > 1.6) { $('.ca-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
