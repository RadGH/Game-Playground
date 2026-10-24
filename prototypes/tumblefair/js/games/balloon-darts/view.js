// BALLOON DARTS on a screen. A tall cork board under a striped awning, drawn on one 2D canvas in the sim's own units
// (100 x 140), so a drag means the same spot on every screen size. The balloons are drawn from init on this phone's
// own clock (synced to the state's `el`), popped ones are hidden from the state's pop list and the events. Your
// crosshair sits a little above your finger (on touch), and a dart flies up from the bottom to where you let go.
// Halloween: a night board, balloons with carved little pumpkin faces, the BOOM balloon wears a sheet like a ghost.
import { chip, esc } from '../../client/gamehud.js';
import { balloonAt, COLOURS } from './sim.js';

const HUE = { red: ['#ff4f5e', '#b81f33'], blue: ['#4fa8ff', '#1d5bb8'], green: ['#4fdc6a', '#1d8a37'], gold: ['#ffd84a', '#c48a00'], boom: ['#2b2b33', '#08080c'] };
const NAME = { red: 'Red', blue: 'Blue', green: 'Green', gold: 'Gold', boom: 'BOOM' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="bd-top"><span class="bd-title">Balloon Darts</span><span class="bd-chain"></span><span class="clock"><b>--</b></span></div>
    <div class="bd-booth"><div class="bd-awning"></div><div class="bd-wrap"><canvas class="bd-board"></canvas><div class="bd-fx"></div><div class="bd-msg"></div></div></div>
    <div class="bd-players">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <p class="bd-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.bd-players [data-pid="${me}"]`)?.classList.add('me');
  const cv = $('.bd-board'), c2 = cv.getContext('2d'), fx = $('.bd-fx');
  const BW = init.bw, BH = init.bh, byId = new Map(init.balloons.map(b => [b.id, b]));

  // ---- the clock: this phone's own, nudged to the server's el
  let phase = 'count', t0 = null, popped = new Set(), stuck = [], flying = [], aim = null, aiming = false, lastThrow = -9, keys = new Set();
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : Math.min(init.play + 1, nowS() - t0));
  function sync(el) { if (t0 == null || Math.abs(el - myT()) > 0.4) t0 = nowS() - el; }

  // ---- size the canvas to its box
  function fit() { const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), w = Math.max(60, Math.round(r.width * k)), h = Math.round(w * BH / BW); if (cv.width !== w) { cv.width = w; cv.height = h; } }
  const ro = new ResizeObserver(fit); ro.observe(cv);
  function toBoard(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * BW, (e.clientY - r.top) / r.height * BH]; }
  const clampAim = ([x, y]) => [Math.max(0, Math.min(BW, x)), Math.max(0, Math.min(BH, y))];

  // ---- throwing
  const canThrow = () => !watching && phase === 'play' && myT() - lastThrow >= init.cool;
  function shoot() {
    if (!aim || !canThrow()) return;
    const t = myT(); lastThrow = t;
    ctx.send('throw', { x: Math.round(aim[0] * 10) / 10, y: Math.round(aim[1] * 10) / 10, t: Math.round(t * 100) / 100 });
    flying.push({ pid: me, x: aim[0], y: aim[1], from: t, at: t + init.fly, mine: true });
    ctx.sfx('throw');
  }
  let offset = 0;
  cv.addEventListener('pointerdown', e => { if (watching) return; e.preventDefault(); cv.setPointerCapture?.(e.pointerId); offset = e.pointerType === 'mouse' ? 0 : 11; aiming = true; const [x, y] = toBoard(e); aim = clampAim([x, y - offset]); });
  cv.addEventListener('pointermove', e => { if (!aiming && e.pointerType !== 'mouse') return; const [x, y] = toBoard(e); if (watching) return; aim = clampAim([x, y - (aiming ? offset : 0)]); });
  const up = e => { if (!aiming) return; aiming = false; const [x, y] = toBoard(e); aim = clampAim([x, y - offset]); shoot(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { aiming = false; });
  const onKey = e => {
    if (watching) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); if (!aim) aim = [BW / 2, BH / 2]; }
    if (e.type === 'keydown' && !e.repeat && ['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); if (!aim) aim = [BW / 2, BH / 2]; shoot(); }
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);

  // ---- effects (DOM, over the canvas, in % of the board)
  function burst(x, y, text, cls) {
    const el = document.createElement('i'); el.className = 'bd-pop ' + cls; el.style.left = (x / BW * 100) + '%'; el.style.top = (y / BH * 100) + '%'; el.textContent = text;
    fx.append(el); setTimeout(() => el.remove(), 1100);
  }

  // ---- drawing
  function drawBoard(g, w, h) {
    g.fillStyle = HW ? '#3a2650' : '#d9a86a'; g.fillRect(0, 0, w, h);
    g.fillStyle = HW ? 'rgba(255,170,60,.12)' : 'rgba(120,70,30,.18)';
    for (let i = 0; i < 160; i++) { const x = (i * 37.7) % 100, y = (i * 61.3) % 140; g.beginPath(); g.arc(x / BW * w, y / BH * h, w * 0.006, 0, 7); g.fill(); }
  }
  function drawBalloon(g, b, x, y, k) {
    const C = COLOURS[b.c], r = C.r * k, [hi, lo] = HUE[b.c];
    g.strokeStyle = 'rgba(40,30,30,.55)'; g.lineWidth = Math.max(1, k * 0.35);
    g.beginPath(); g.moveTo(x, y + r * 1.15); g.quadraticCurveTo(x + r * 0.4, y + r * 1.8, x, y + r * 2.5); g.stroke();
    const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2); grd.addColorStop(0, '#fff'); grd.addColorStop(0.25, hi); grd.addColorStop(1, lo);
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r * 0.9, r * 1.08, 0, 0, 7); g.fill();
    g.lineWidth = Math.max(1, k * 0.45); g.strokeStyle = '#0d2228'; g.stroke();
    g.fillStyle = lo; g.beginPath(); g.moveTo(x - r * 0.18, y + r * 1.2); g.lineTo(x + r * 0.18, y + r * 1.2); g.lineTo(x, y + r * 1.02); g.fill();
    if (b.c === 'boom') {
      g.fillStyle = '#ffd23f'; g.font = `900 ${Math.round(r * 0.62)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BOOM', x, y + r * 0.05);
      g.strokeStyle = '#ff8a1a'; g.lineWidth = k * 0.5; g.beginPath(); g.moveTo(x, y - r * 1.05); g.quadraticCurveTo(x + r * 0.4, y - r * 1.5, x + r * 0.2, y - r * 1.8); g.stroke();
      g.fillStyle = '#ffec7a'; g.beginPath(); g.arc(x + r * 0.2, y - r * 1.85, r * 0.16, 0, 7); g.fill();
      if (HW) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x, y - r * 0.2, r * 0.95, r * 0.75, 0, Math.PI, 0); g.fill(); }
    } else if (HW) {
      g.fillStyle = '#2a1238';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * r * 0.42, y - r * 0.32); g.lineTo(x + s * r * 0.18, y - r * 0.05); g.lineTo(x + s * r * 0.62, y - r * 0.05); g.fill(); }
      g.beginPath(); g.moveTo(x - r * 0.5, y + r * 0.25); g.quadraticCurveTo(x, y + r * 0.75, x + r * 0.5, y + r * 0.25); g.quadraticCurveTo(x, y + r * 0.45, x - r * 0.5, y + r * 0.25); g.fill();
    } else if (b.c === 'gold') {
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x + r * 0.45, y - r * 0.6, r * 0.12, 0, 7); g.fill();
    }
  }
  function drawDart(g, x, y, k, color, tilt = 0) {
    g.save(); g.translate(x, y); g.rotate(tilt);
    g.strokeStyle = '#5a3a1a'; g.lineWidth = k * 0.7; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, k * 5.5); g.stroke();
    g.fillStyle = color; g.beginPath(); g.moveTo(0, k * 3.8); g.lineTo(-k * 1.6, k * 6.4); g.lineTo(k * 1.6, k * 6.4); g.closePath(); g.fill();
    g.fillStyle = '#ccc'; g.beginPath(); g.moveTo(-k * 0.4, 0); g.lineTo(k * 0.4, 0); g.lineTo(0, -k * 1.4); g.fill();
    g.restore();
  }
  function draw() {
    fit(); const w = cv.width, h = cv.height, k = w / BW, t = myT();
    drawBoard(c2, w, h);
    for (const s of stuck) drawDart(c2, s.x * k, s.y * k, k * 0.8, s.color, s.tilt);
    for (const b of init.balloons) {
      if (popped.has(b.id) || b.t0 > t + 0.01) continue;
      const p = balloonAt(b, t); if (p) drawBalloon(c2, b, p[0] * k, p[1] * k, k);
    }
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i], u = Math.max(0, Math.min(1, (t - f.from) / Math.max(0.05, f.at - f.from)));
      const p = byPid.get(f.pid), sx = BW / 2, sy = BH + 6;
      const x = sx + (f.x - sx) * u, y = sy + (f.y - sy) * u - Math.sin(u * Math.PI) * 6;
      drawDart(c2, x * k, y * k, k * (1.5 - u * 0.6), p?.color || '#fff');
      if (u >= 1) { flying.splice(i, 1); stuck.push({ x: f.x, y: f.y, color: p?.color || '#fff', tilt: ((f.x * 7) % 1 - 0.5) * 0.5 }); if (stuck.length > 24) stuck.shift(); }
    }
    if (aim && !watching && phase === 'play') {
      const [x, y] = [aim[0] * k, aim[1] * k], ready = t - lastThrow >= init.cool, me2 = byPid.get(me);
      c2.strokeStyle = ready ? (me2?.color || '#fff') : 'rgba(255,255,255,.5)'; c2.lineWidth = k * 0.9;
      c2.beginPath(); c2.arc(x, y, k * 4, 0, 7); c2.stroke();
      c2.beginPath(); c2.moveTo(x - k * 6.5, y); c2.lineTo(x - k * 2, y); c2.moveTo(x + k * 2, y); c2.lineTo(x + k * 6.5, y); c2.moveTo(x, y - k * 6.5); c2.lineTo(x, y - k * 2); c2.moveTo(x, y + k * 2); c2.lineTo(x, y + k * 6.5); c2.stroke();
      c2.strokeStyle = '#0d2228'; c2.lineWidth = k * 0.35; c2.beginPath(); c2.arc(x, y, k * 4.7, 0, 7); c2.stroke();
    }
  }
  function note() {
    if (phase === 'count') return 'Balloons coming up! Drag to aim, let go to throw.';
    if (phase === 'end') { if (!init.solo) return 'Time! Most points wins.'; const s = last?.sc?.[me ?? players[0].pid] ?? 0, m = init.medals.filter(v => s >= v).length; return `${s} points — ${['no medal yet', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at ${init.medals.join(' / ')})`; }
    return watching ? 'Pop the same colour in a row for a chain!' : 'Aim ahead: a dart takes a moment to land.';
  }
  let last = null;
  return {
    state(g) {
      last = g; if (g.phase !== phase) { if (g.phase === 'play') ctx.sfx('good'); if (g.phase === 'end') ctx.sfx('win'); phase = g.phase; }
      if (g.phase !== 'count') sync(g.el);
      for (const [id] of g.p) popped.add(id);
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      ui.dataset.phase = g.phase;
      let lead = -Infinity; for (const p of players) lead = Math.max(lead, g.sc[p.pid]);
      for (const p of players) {
        const el = ui.querySelector(`.bd-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.sc[p.pid];
        el.classList.toggle('lead', players.length > 1 && g.sc[p.pid] === lead && lead > 0);
      }
      const ch = me != null ? g.ch[me] : 0;
      $('.bd-chain').innerHTML = ch && ch[1] > 1 ? `<i style="--c:${HUE[ch[0]][0]}">${esc(NAME[ch[0]])} chain x${ch[1]}</i>` : '';
      $('.bd-msg').textContent = g.phase === 'count' ? (g.left || 'Go!') : g.phase === 'end' ? 'Time!' : '';
      $('.bd-note').textContent = note();
    },
    event(ev) {
      if (ev.e === 'throw' && ev.pid !== me) flying.push({ pid: ev.pid, x: ev.x, y: ev.y, from: ev.at - init.fly, at: ev.at });
      if (ev.e === 'pop') {
        popped.add(ev.id); const mine = ev.pid === me;
        burst(ev.x, ev.y, ev.c === 'boom' ? `BOOM ${ev.got}` : `+${ev.got}${ev.ch > 1 ? ` x${ev.ch}` : ''}`, (ev.c === 'boom' ? 'boom' : ev.c) + (mine ? ' mine' : ''));
        if (mine) ctx.sfx(ev.c === 'boom' ? 'bad' : ev.ch > 1 ? 'coins' : 'good'); else ctx.sfx('pick');
      }
      if (ev.e === 'miss' && ev.pid === me) ctx.sfx('tap');
    },
    frame() {
      if (keys.size && aim && !watching) { const s = 1.4; let [x, y] = aim; if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= s; if (keys.has('ArrowRight') || keys.has('KeyD')) x += s; if (keys.has('ArrowUp') || keys.has('KeyW')) y -= s; if (keys.has('ArrowDown') || keys.has('KeyS')) y += s; aim = clampAim([x, y]); }
      draw();
    },
    dispose() { ro.disconnect(); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); },
  };
}
