// CLAW MACHINE on a screen. Your own machine, seen from above through the glass: a 2D canvas in the sim's units
// (100 x 80), the claw's rail across it, the claw head hanging on its cable (it swings: drawn with its shadow), the
// heap of plush prizes and the chute in the corner. Drag ANYWHERE on the machine to move the claw (like a trackpad, so
// your finger never covers it; a faint ring shows where it is heading), tap DROP. The claw is simulated here with the
// sim's own stepClaw so it answers at once; a grab is played out from the server's state on this phone's clock. Other
// players' machines are small windows under yours (a watching screen shows every machine). Keys: arrows / WASD move,
// Space / Enter drop; a controller's stick + A. Halloween: a purple and orange machine, candy, bats, ghosts, pumpkins,
// witch hats and a golden pumpkin.
import { chip, esc } from '../../client/gamehud.js';
import { createPhoneClock } from '../toss-kit.js';
import { stepClaw, newClaw, headOf, swingOf, KINDS, T, GRAB_S } from './sim.js';

const NAMES = { ball: 'ball', duck: 'duck', heart: 'heart', bear: 'bear', star: 'star', egg: 'GOLDEN EGG' };
const NAMES_HW = { ball: 'candy', duck: 'bat', heart: 'ghost', bear: 'pumpkin', star: 'witch hat', egg: 'GOLDEN PUMPKIN' };
const ICON = { ball: '⚽', duck: '🐤', heart: '💗', bear: '🧸', star: '⭐', egg: '🥚' };
const ICON_HW = { ball: '🍬', duck: '🦇', heart: '👻', bear: '🎃', star: '🧙', egg: '🌟' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const PW = init.pw, PH = init.ph, byPid = new Map(players.map(p => [p.pid, p]));
  const nm = k => (HW ? NAMES_HW : NAMES)[KINDS[k].id], ic = k => (HW ? ICON_HW : ICON)[KINDS[k].id];
  const others = players.filter(p => p.pid !== me);
  ui.innerHTML = `
    <div class="cc-top"><span class="cc-title">${HW ? 'Spooky Claw' : 'Claw Machine'}</span><span class="cc-grabs"></span><span class="clock"><b>--</b></span></div>
    <div class="cc-chips">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    ${watching ? `<div class="cc-all">${players.map(p => `<figure data-pid="${p.pid}"><canvas></canvas><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>` : `
    <div class="cc-machine"><div class="cc-sign">${KINDS.map((k, i) => `<i>${ic(i)}<b>${k.pts}</b></i>`).join('')}</div><div class="cc-glass"><canvas class="cc-pit"></canvas><div class="cc-fx"></div><div class="cc-msg"></div></div></div>
    <button class="cc-drop big-btn">DROP</button>
    ${others.length ? `<div class="cc-minis">${others.map(p => `<figure data-pid="${p.pid}"><canvas></canvas><figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>` : ''}`}
    <p class="cc-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.cc-chips [data-pid="${me}"]`)?.classList.add('me');
  const clock = createPhoneClock(() => performance.now() / 1000, init.play + 8);
  const mainCv = $('.cc-pit'), fx = $('.cc-fx');
  const minis = new Map([...ui.querySelectorAll('.cc-minis figure, .cc-all figure')].map(f => [+f.dataset.pid, f.querySelector('canvas')]));

  // ---- my claw
  let claw = newClaw(), target = { x: init.home.x, y: init.home.y }, phase = 'count', last = null, lastT = 0;
  const myGrab = () => (me != null ? last?.gr?.[me] : null);
  const canDrop = () => !watching && phase === 'play' && !myGrab() && (last?.gl?.[me] ?? 0) > 0;
  function drop() {
    if (!canDrop()) return;
    const h = headOf(claw); ctx.send('drop', { x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10 }); ctx.sfx('tap');
    $('.cc-drop')?.classList.add('busy');
  }
  if (!watching) {
    const glass = $('.cc-glass'); let drag = null;
    glass.addEventListener('pointerdown', e => { e.preventDefault(); try { glass.setPointerCapture(e.pointerId); } catch {} drag = { x: e.clientX, y: e.clientY }; });
    glass.addEventListener('pointermove', e => {
      if (!drag) return; const r = mainCv.getBoundingClientRect(), k = PW / r.width * 1.25;
      target.x = Math.max(4, Math.min(PW - 4, target.x + (e.clientX - drag.x) * k)); target.y = Math.max(4, Math.min(PH - 4, target.y + (e.clientY - drag.y) * k));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { drag = null; }; glass.addEventListener('pointerup', up); glass.addEventListener('pointercancel', up);
    $('.cc-drop').addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
  }
  const keys = new Set();
  const onKey = e => {
    if (watching || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); }
    if (e.type === 'keydown' && !e.repeat && ['Space', 'Enter'].includes(e.code)) { e.preventDefault(); drop(); }
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  let padA = false;
  function padMove(dt) {
    let mx = 0, my = 0, a = false;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1; if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1; if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
    for (const p of navigator.getGamepads?.() || []) { if (!p) continue; if (Math.abs(p.axes[0]) > 0.2) mx += p.axes[0]; if (Math.abs(p.axes[1]) > 0.2) my += p.axes[1]; if (p.buttons[0]?.pressed) a = true; }
    if (mx || my) { target.x = Math.max(4, Math.min(PW - 4, target.x + mx * 70 * dt)); target.y = Math.max(4, Math.min(PH - 4, target.y + my * 70 * dt)); }
    if (a && !padA) drop(); padA = a;
  }

  // ---- drawing
  const fit = cv => { const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), w = Math.max(40, Math.round(r.width * k)), h = Math.round(w * PH / PW); if (cv.width !== w) { cv.width = w; cv.height = h; } return w / PW; };
  function drawPrize(g, k, x, y, s, lift = 0) {
    const K = KINDS[k], r = K.r * s * (1 + lift * 0.25), id = K.id;
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(r * 0.15 + lift * r * 0.5, r * 0.25 + lift * r * 0.6, r, r * 0.8, 0, 0, 7); g.fill();
    g.lineWidth = Math.max(1, s * 0.5); g.strokeStyle = '#1b1b2a';
    const disc = (c, rr = r) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.fill(); g.stroke(); };
    const eyes = (c = '#1b1b2a', y0 = -0.15, gap = 0.32) => { g.fillStyle = c; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * gap, r * y0, r * 0.11, 0, 7); g.fill(); } };
    if (HW) {
      if (id === 'ball') { g.fillStyle = '#ff5fa8'; g.beginPath(); g.ellipse(0, 0, r * 0.75, r * 0.55, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * r * 0.7, 0); g.lineTo(sx * r * 1.15, -r * 0.4); g.lineTo(sx * r * 1.15, r * 0.4); g.closePath(); g.fill(); g.stroke(); } }
      else if (id === 'duck') { g.fillStyle = '#3a2a4a'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(sx * r * 0.9, -r * 0.9, sx * r * 1.15, -r * 0.1); g.quadraticCurveTo(sx * r * 0.8, r * 0.1, 0, r * 0.3); g.fill(); g.stroke(); } disc('#4a3a5a', r * 0.55); eyes('#ffd23f', -0.1, 0.2); }
      else if (id === 'heart') { g.fillStyle = '#f4f4ff'; g.beginPath(); g.arc(0, -r * 0.15, r * 0.8, Math.PI, 0); g.lineTo(r * 0.8, r * 0.8); for (let i = 0; i < 4; i++) g.lineTo(r * (0.8 - (i + 0.5) * 0.4), r * (i % 2 ? 0.8 : 0.55)); g.lineTo(-r * 0.8, r * 0.8); g.closePath(); g.fill(); g.stroke(); eyes(); }
      else if (id === 'bear') { disc('#ff7a14'); g.strokeStyle = 'rgba(120,40,0,.5)'; for (const sx of [-0.4, 0.4]) { g.beginPath(); g.ellipse(sx * r, 0, r * 0.25, r * 0.95, 0, 0, 7); g.stroke(); } g.fillStyle = '#3a8a3a'; g.fillRect(-r * 0.12, -r * 1.15, r * 0.24, r * 0.35); eyes('#2a1238', -0.1, 0.35); }
      else if (id === 'star') { g.fillStyle = '#5a2a8a'; g.beginPath(); g.moveTo(0, -r * 1.1); g.lineTo(r * 0.55, r * 0.5); g.lineTo(-r * 0.55, r * 0.5); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.ellipse(0, r * 0.55, r * 1.05, r * 0.32, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; g.fillRect(-r * 0.45, r * 0.2, r * 0.9, r * 0.18); }
      else { const grd = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1); grd.addColorStop(0, '#fff6b0'); grd.addColorStop(0.5, '#ffc21f'); grd.addColorStop(1, '#c47a00'); disc(grd); g.fillStyle = '#3a8a3a'; g.fillRect(-r * 0.12, -r * 1.15, r * 0.24, r * 0.35); }
    } else {
      if (id === 'ball') { disc('#ff4f5e'); g.strokeStyle = '#fff'; g.lineWidth = r * 0.25; g.beginPath(); g.arc(0, 0, r * 0.62, -0.6, 0.9); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.62, 2.5, 4); g.stroke(); g.lineWidth = Math.max(1, s * 0.5); g.strokeStyle = '#1b1b2a'; }
      else if (id === 'duck') { disc('#ffd84a'); g.fillStyle = '#ff8a1a'; g.beginPath(); g.ellipse(0, r * 0.35, r * 0.4, r * 0.2, 0, 0, 7); g.fill(); g.stroke(); eyes(); }
      else if (id === 'heart') { g.fillStyle = '#ff6fb5'; g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.2, 0, -r * 0.45); g.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); g.fill(); g.stroke(); }
      else if (id === 'bear') { g.fillStyle = '#b07a48'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.68, -r * 0.68, r * 0.33, 0, 7); g.fill(); g.stroke(); } disc('#c48a55'); g.fillStyle = '#f0d0a0'; g.beginPath(); g.ellipse(0, r * 0.28, r * 0.38, r * 0.28, 0, 0, 7); g.fill(); eyes(); g.fillStyle = '#1b1b2a'; g.beginPath(); g.arc(0, r * 0.2, r * 0.1, 0, 7); g.fill(); }
      else if (id === 'star') { g.fillStyle = '#ffcf3f'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r * 1.12; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); eyes('#1b1b2a', 0, 0.22); }
      else { const grd = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.2); grd.addColorStop(0, '#fffbe0'); grd.addColorStop(0.45, '#ffd23f'); grd.addColorStop(1, '#c48a00'); g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, r * 0.82, r * 1.05, 0, 0, 7); g.fill(); g.stroke(); }
    }
    if (id === 'egg') { const t = performance.now() / 300; g.fillStyle = 'rgba(255,255,255,.95)'; for (let i = 0; i < 3; i++) { const a = t + i * 2.1; g.beginPath(); g.arc(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35, s * 0.9, 0, 7); g.fill(); } }
    g.restore();
  }
  function drawPit(g, w, h, s) {
    g.fillStyle = HW ? '#2a1a3e' : '#cfe9ff'; g.fillRect(0, 0, w, h);
    g.fillStyle = HW ? 'rgba(255,138,26,.1)' : 'rgba(255,255,255,.35)';
    for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(((i * 37) % 100) * s, ((i * 53) % 80) * s, s * 2.2, 0, 7); g.fill(); }
    const C = init.chute;
    g.fillStyle = HW ? '#0e0818' : '#1b2a3a'; g.fillRect(C.x * s, C.y * s, C.w * s, C.h * s);
    g.strokeStyle = HW ? '#ff8a1a' : '#ffd23f'; g.lineWidth = s * 1.2; g.setLineDash([s * 2, s * 1.5]); g.strokeRect(C.x * s + s, C.y * s + s, C.w * s - 2 * s, C.h * s - 2 * s); g.setLineDash([]);
    g.fillStyle = HW ? '#ff8a1a' : '#ffd23f'; g.font = `900 ${Math.round(s * 4)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PRIZE', (C.x + C.w / 2) * s, (C.y + C.h / 2) * s);
  }
  /** A claw head seen from above: three prongs round a hub. `open` 0..1, `z` 0 (up) .. 1 (down at the heap). */
  function drawClaw(g, x, y, s, open, z, railY, color) {
    const sc = s * (1.25 - z * 0.45) * 1.4;
    g.strokeStyle = 'rgba(40,40,60,.65)'; g.lineWidth = s * 0.6; g.beginPath(); g.moveTo(x, railY); g.lineTo(x, y); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x + sc * 2 * (1 - z), y + sc * 3 * (1 - z), sc * 5, 0, 7); g.fill();
    g.strokeStyle = '#3a3a4a'; g.lineWidth = sc * 1.4; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094, r0 = sc * 2, r1 = sc * (3.5 + open * 3.2); g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a + 0.25) * r1, y + Math.sin(a + 0.25) * r1); g.stroke(); }
    g.lineCap = 'butt';
    g.fillStyle = color || '#c9ced8'; g.strokeStyle = '#1b1b2a'; g.lineWidth = sc * 0.5; g.beginPath(); g.arc(x, y, sc * 2.4, 0, 7); g.fill(); g.stroke();
  }
  /** Where a grab has the claw at grab time u (seconds since it dropped): head x, y, height z, prongs open. */
  function grabPose(gr, u) {
    const [, x, y, , , , , ] = gr, H = init.home;
    if (u < T.down) return { x, y, z: u / T.down, open: 1 };
    if (u < T.down + T.close) return { x, y, z: 1, open: 1 - (u - T.down) / T.close };
    if (u < T.down + T.close + T.up) return { x, y, z: 1 - (u - T.down - T.close) / T.up, open: 0 };
    const v = Math.min(1, (u - T.down - T.close - T.up) / T.carry);
    return { x: x + (H.x - x) * v, y: y + (H.y - y) * v, z: 0, open: u > GRAB_S - T.drop ? 1 : 0 };
  }
  function drawMachine(cv, pid, mine) {
    if (!cv || !last) return;
    const s = fit(cv), g = cv.getContext('2d'), w = cv.width, h = cv.height, t = clock.t();
    drawPit(g, w, h, s);
    const heap = last.hp?.[pid] || [], gr = last.gr?.[pid];
    const u = gr ? Math.max(0, t - gr[0]) : 0, pose = gr ? grabPose(gr, u) : null;
    for (const [, k, x, y] of heap) drawPrize(g, k, x * s, y * s, s);   // (a held prize is out of the heap until it slips or wins)
    let head, z = 0, open = 0.35;
    if (pose) { head = pose; z = pose.z; open = pose.open; }
    else if (mine) { head = headOf(claw); }
    else head = { x: init.home.x, y: init.home.y };
    // the held prize hangs under the claw
    if (pose && gr[7] && (gr[3] === 'w' || gr[3] === 's')) drawPrize(g, gr[4], pose.x * s, pose.y * s, s * (1.1 - z * 0.3), 1 - z);
    const railY = (mine && !pose ? claw.y : head.y) * s;
    g.fillStyle = HW ? 'rgba(255,138,26,.35)' : 'rgba(60,70,90,.3)'; g.fillRect(0, railY - s * 1.2, w, s * 2.4);
    if (mine && !pose && phase === 'play') { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = s * 0.5; g.setLineDash([s, s]); g.beginPath(); g.arc(target.x * s, target.y * s, s * 3, 0, 7); g.stroke(); g.setLineDash([]); }
    drawClaw(g, head.x * s, head.y * s, s, open, z, railY, mine ? (byPid.get(pid)?.color || '#c9ced8') : byPid.get(pid)?.color);
  }

  // ---- messages
  function pop(text, cls) { if (!fx) return; const el = document.createElement('i'); el.className = 'cc-pop ' + cls; el.textContent = text; fx.append(el); setTimeout(() => el.remove(), 1400); }
  const nameOf = pid => (pid === me ? 'You' : byPid.get(pid)?.name || '?');
  function note() {
    if (!last) return '';
    if (phase === 'count') return 'Drag to move the claw. Let it stop swinging, then DROP!';
    if (phase === 'end') { if (!init.solo) return 'Time! Most points wins.'; const sc = last.sc[me ?? players[0].pid] ?? 0, m = init.medals.filter(v => sc >= v).length; return `${sc} points — ${['no medal yet', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at ${init.medals.join(' / ')})`; }
    if (watching) return 'Centre the claw on a prize for a strong grip!';
    if (myGrab()) return 'Grabbing…';
    if ((last.gl[me] ?? 0) <= 0) return 'Out of grabs! Watch the others.';
    const sw = swingOf(claw);
    return sw > 3 ? 'It is swinging… wait for it to settle!' : 'Over the MIDDLE of a prize? DROP!';
  }

  return {
    state(g) {
      if (g.phase !== phase) { if (g.phase === 'play') { ctx.sfx('good'); clock.reset(); } if (g.phase === 'end') ctx.sfx('win'); phase = g.phase; }
      if (g.phase !== 'count') clock.sync(g.el);
      const had = myGrab(); last = g;
      if (had && !myGrab()) { claw = newClaw(); target = { x: init.home.x, y: init.home.y }; $('.cc-drop')?.classList.remove('busy'); }
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      ui.dataset.phase = g.phase;
      let lead = -Infinity; for (const p of players) lead = Math.max(lead, g.sc[p.pid]);
      for (const p of players) {
        const el = ui.querySelector(`.cc-chips [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.sc[p.pid];
        el.classList.toggle('lead', players.length > 1 && g.sc[p.pid] === lead && lead > 0);
      }
      if (me != null) { const n = g.gl[me] ?? 0; $('.cc-grabs').textContent = `${n} grab${n === 1 ? '' : 's'} left`; }
      const drop = $('.cc-drop'); if (drop) { drop.disabled = !canDrop(); drop.textContent = myGrab() ? '…' : (g.gl[me] ?? 0) > 0 ? 'DROP' : 'No grabs left'; }
      const msg = $('.cc-msg'); if (msg) msg.textContent = g.phase === 'count' ? (g.left || 'Go!') : g.phase === 'end' ? 'Time!' : '';
    },
    event(ev) {
      const mine = ev.pid === me;
      if (ev.e === 'close' && mine) { if (ev.res === 'm' || ev.res === 'e') { pop(ev.res === 'e' ? 'Nothing there!' : 'Missed it!', 'bad'); ctx.sfx('bad'); } else ctx.sfx('pick'); }
      if (ev.e === 'slip') { if (mine) { pop(`It slipped! ${nm(ev.k)}`, 'bad'); ctx.sfx('bad'); navigator.vibrate?.(60); } }
      if (ev.e === 'win') {
        if (mine) { pop(`${ic(ev.k)} ${nm(ev.k).toUpperCase()}! +${ev.pts}`, ev.pts >= 8 ? 'gold' : 'good'); ctx.sfx(ev.pts >= 8 ? 'coins' : 'good'); }
        else { ctx.sfx('pick'); if (ev.pts >= 8) pop(`${nameOf(ev.pid)} won the ${nm(ev.k)}!`, 'gold'); }
      }
    },
    frame(dt) {
      lastT += dt;
      if (!watching && phase === 'play' && !myGrab()) { padMove(dt); const sub = Math.max(1, Math.ceil(dt / 0.02)); for (let i = 0; i < sub; i++) stepClaw(claw, target, Math.min(0.05, dt) / sub, L); }
      if (mainCv) drawMachine(mainCv, me, true);
      for (const [pid, cv] of minis) drawMachine(cv, pid, false);
      if (lastT > 0.15) { lastT = 0; const n = $('.cc-note'), s = note(); if (n.textContent !== s) n.textContent = s; }
    },
    dispose() { removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); },
  };
}
