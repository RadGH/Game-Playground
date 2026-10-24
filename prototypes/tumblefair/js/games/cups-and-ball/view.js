// SHELL SHUFFLE on a screen. A green-felt table under a striped awning, the showman (a round fellow with a curly
// moustache and a straw boater) leaning over it, and the cups drawn on one 2D canvas in the table's own units, so a
// tap means the same cup on every screen. The shuffle is drawn with the sim's own cupsAt() from the moment this phone
// saw the phase start. Tap a cup (or press 1-5 / arrows + Space) to pick it; your pick wears your colour ring, other
// players only show "picked ✓" on their chip until the reveal, when everyone's face pops up over the cup they chose.
// Halloween: a purple table, cute round skull cups and an eyeball for the ball, and the showman in a witch's hat.
import { chip, esc } from '../../client/gamehud.js';
import { cupsAt, SHOW_S } from './sim.js';

const TW = 100, TH = 74;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="cb-top"><span class="cb-title">Shell Shuffle</span><span class="cb-round"></span><span class="clock"><b>--</b></span></div>
    <div class="cb-do"></div>
    <div class="cb-booth"><div class="cb-awning"></div><div class="cb-wrap"><canvas class="cb-table"></canvas><div class="cb-fx"></div></div></div>
    <div class="cb-players">${players.map(p => chip(p, '<em class="sc">0</em><i class="pk"></i>')).join('')}</div>
    <p class="cb-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.cb-players [data-pid="${me}"]`)?.classList.add('me');
  const cv = $('.cb-table'), c2 = cv.getContext('2d'), fx = $('.cb-fx'), doEl = $('.cb-do');
  const imgs = new Map();
  for (const p of players) if (p.portrait) { const im = new Image(); im.src = p.portrait; imgs.set(p.pid, im); }

  let g = null, ph = null, round = -1, t0 = performance.now() / 1000, myPick = null, sel = null, reveal = null;
  const now = () => performance.now() / 1000;
  function fit() { const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), w = Math.max(60, Math.round(r.width * k)), h = Math.round(w * TH / TW); if (cv.width !== w) { cv.width = w; cv.height = h; } }
  const ro = new ResizeObserver(fit); ro.observe(cv);
  const slotX = (n, s) => TW / n * (s + 0.5);
  const cupW = n => Math.min(TW / n * 0.76, 25);

  // ---- picking
  function pick(i) {
    if (watching || !g || g.ph !== 'guess' || myPick != null || i < 0 || i >= g.n) return;
    myPick = i; ctx.send('pick', { i, r: g.r }); ctx.sfx('pick');
  }
  cv.addEventListener('pointerdown', e => {
    if (!g) return; e.preventDefault();
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * TW, s = Math.max(0, Math.min(g.n - 1, Math.floor(x / (TW / g.n))));
    pick(s);
  });
  const onKey = e => {
    if (watching || !g || e.type !== 'keydown') return;
    const d = /^Digit([1-5])$/.exec(e.code); if (d) { e.preventDefault(); pick(+d[1] - 1); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { sel = Math.max(0, (sel ?? 1) - 1); e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { sel = Math.min(g.n - 1, (sel ?? -1) + 1); e.preventDefault(); }
    if (!e.repeat && ['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); if (sel == null) sel = Math.floor(g.n / 2); else pick(sel); }
  };
  addEventListener('keydown', onKey);

  function burst(x, y, text, cls) {
    const el = document.createElement('i'); el.className = 'cb-pop ' + cls; el.style.left = (x / TW * 100) + '%'; el.style.top = (y / TH * 100) + '%'; el.textContent = text;
    fx.append(el); setTimeout(() => el.remove(), 1300);
  }

  // ---- drawing
  function drawTable(c, w, h, k) {
    c.fillStyle = HW ? '#2a1640' : '#7fd3ff'; c.fillRect(0, 0, w, h);
    // the showman, behind the table
    const sx = w / 2, sy = 20 * k, bob = Math.sin(now() * (ph === 'shuffle' ? 9 : 2)) * k * 0.6;
    c.fillStyle = HW ? '#3a2a5a' : '#e8394a'; c.beginPath(); c.ellipse(sx, sy + 16 * k, 17 * k, 9 * k, 0, Math.PI, 0); c.fill();     // shoulders (striped vest)
    c.fillStyle = HW ? '#ff8a1a' : '#fff'; for (let i = -2; i <= 2; i++) { c.fillRect(sx + i * 6 * k - 1.2 * k, sy + 8 * k, 2.4 * k, 8 * k); }
    c.fillStyle = '#ffd2a8'; c.beginPath(); c.arc(sx, sy + bob, 9 * k, 0, 7); c.fill(); c.strokeStyle = '#0d2228'; c.lineWidth = 0.6 * k; c.stroke();
    c.fillStyle = '#0d2228'; c.beginPath(); c.arc(sx - 3.2 * k, sy - 1.5 * k + bob, 1 * k, 0, 7); c.arc(sx + 3.2 * k, sy - 1.5 * k + bob, 1 * k, 0, 7); c.fill();
    c.strokeStyle = '#4a2a10'; c.lineWidth = 1.4 * k; c.beginPath();                                                     // the curly moustache
    c.moveTo(sx, sy + 2.5 * k + bob); c.quadraticCurveTo(sx - 4 * k, sy + 5 * k + bob, sx - 6.5 * k, sy + 1.5 * k + bob); c.moveTo(sx, sy + 2.5 * k + bob); c.quadraticCurveTo(sx + 4 * k, sy + 5 * k + bob, sx + 6.5 * k, sy + 1.5 * k + bob); c.stroke();
    if (HW) { c.fillStyle = '#2a1238'; c.beginPath(); c.moveTo(sx - 12 * k, sy - 6 * k + bob); c.lineTo(sx + 12 * k, sy - 6 * k + bob); c.lineTo(sx + 2 * k, sy - 22 * k + bob); c.closePath(); c.fill(); c.fillStyle = '#ff8a1a'; c.fillRect(sx - 7 * k, sy - 8.5 * k + bob, 14 * k, 2.4 * k); }
    else { c.fillStyle = '#f4d27a'; c.fillRect(sx - 12 * k, sy - 7 * k + bob, 24 * k, 1.8 * k); c.fillRect(sx - 7 * k, sy - 13 * k + bob, 14 * k, 6.5 * k); c.fillStyle = '#3d8bff'; c.fillRect(sx - 7 * k, sy - 9 * k + bob, 14 * k, 1.6 * k); }
    // the table top
    c.fillStyle = HW ? '#5a2a7a' : '#2f9a5a'; c.beginPath(); c.roundRect(2 * k, 30 * k, w - 4 * k, h - 32 * k, 4 * k); c.fill();
    c.strokeStyle = HW ? '#ff8a1a' : '#8a5225'; c.lineWidth = 2.4 * k; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.ellipse(w / 2, 54 * k, w * 0.42, 11 * k, 0, 0, 7); c.fill();
  }
  function drawBall(c, x, y, k) {
    const r = 3.6 * k;
    if (HW) {
      c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(x, y - r, r, 0, 7); c.fill(); c.strokeStyle = '#0d2228'; c.lineWidth = 0.4 * k; c.stroke();
      c.fillStyle = '#4fdc6a'; c.beginPath(); c.arc(x + r * 0.15, y - r * 1.05, r * 0.5, 0, 7); c.fill(); c.fillStyle = '#0d2228'; c.beginPath(); c.arc(x + r * 0.2, y - r * 1.05, r * 0.24, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + r * 0.35, y - r * 1.2, r * 0.09, 0, 7); c.fill();
    } else {
      const grd = c.createRadialGradient(x - r * 0.4, y - r * 1.4, r * 0.1, x, y - r, r * 1.1); grd.addColorStop(0, '#fff'); grd.addColorStop(0.3, '#ff4f5e'); grd.addColorStop(1, '#a8122a');
      c.fillStyle = grd; c.beginPath(); c.arc(x, y - r, r, 0, 7); c.fill(); c.strokeStyle = '#0d2228'; c.lineWidth = 0.4 * k; c.stroke();
    }
  }
  function drawCup(c, x, y, cw, k, lift, glow) {
    const ch = cw * 1.05, top = y - ch - lift * k * 20;
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x, y + 1 * k, cw * 0.55, 2.2 * k, 0, 0, 7); c.fill();
    if (glow) { c.strokeStyle = glow; c.lineWidth = 2.6 * k; c.beginPath(); c.ellipse(x, y + 1 * k, cw * 0.62, 3.2 * k, 0, 0, 7); c.stroke(); }
    c.save(); c.translate(0, -lift * k * 20);
    if (HW) {
      c.fillStyle = '#f4ecd8'; c.beginPath(); c.moveTo(x - cw * 0.5, y); c.lineTo(x - cw * 0.46, y - ch * 0.5); c.arc(x, y - ch * 0.55, cw * 0.46, Math.PI, 0); c.lineTo(x + cw * 0.5, y); c.closePath(); c.fill();
      c.strokeStyle = '#0d2228'; c.lineWidth = 0.6 * k; c.stroke();
      c.fillStyle = '#2a1238'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * cw * 0.18, y - ch * 0.62, cw * 0.11, cw * 0.13, 0, 0, 7); c.fill(); }
      c.beginPath(); c.moveTo(x - cw * 0.04, y - ch * 0.44); c.lineTo(x + cw * 0.04, y - ch * 0.44); c.lineTo(x, y - ch * 0.5); c.fill();
      c.strokeStyle = '#2a1238'; c.lineWidth = 0.7 * k; c.beginPath(); c.arc(x, y - ch * 0.42, cw * 0.18, 0.3, Math.PI - 0.3); c.stroke();
      c.fillStyle = '#ffb3d0'; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * cw * 0.3, y - ch * 0.42, cw * 0.06, 0, 7); c.fill(); }
    } else {
      const grd = c.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0); grd.addColorStop(0, '#c48a00'); grd.addColorStop(0.35, '#ffe08a'); grd.addColorStop(0.6, '#ffd23f'); grd.addColorStop(1, '#a86a00');
      c.fillStyle = grd; c.beginPath(); c.moveTo(x - cw * 0.5, y); c.lineTo(x - cw * 0.3, y - ch); c.lineTo(x + cw * 0.3, y - ch); c.lineTo(x + cw * 0.5, y); c.closePath(); c.fill();
      c.strokeStyle = '#0d2228'; c.lineWidth = 0.6 * k; c.stroke();
      c.fillStyle = '#e8394a'; c.beginPath(); c.moveTo(x - cw * 0.44, y - ch * 0.3); c.lineTo(x - cw * 0.39, y - ch * 0.48); c.lineTo(x + cw * 0.39, y - ch * 0.48); c.lineTo(x + cw * 0.44, y - ch * 0.3); c.closePath(); c.fill();
      c.fillStyle = '#ffe9a8'; c.beginPath(); c.ellipse(x, y - ch, cw * 0.3, 1.4 * k, 0, 0, 7); c.fill(); c.stroke();
    }
    c.restore();
  }
  function draw() {
    fit(); const w = cv.width, h = cv.height, k = w / TW, c = c2;
    drawTable(c, w, h, k);
    if (!g) return;
    const n = g.n, cw = cupW(n) * k, base = 62 * k, t = now() - t0, R = { n, start: g.st, mv: g.mv };
    let cups;
    if (ph === 'shuffle') cups = cupsAt(R, t);
    else if (ph === 'show') { cups = cupsAt(R, 0); const u = Math.max(0, Math.min(1, (t - 0.15) / (SHOW_S - 0.5))); cups[g.st].lift = Math.sin(u * Math.PI) * 1.0; }
    else { cups = cupsAt(R, 1e9); if (ph === 'reveal' && reveal) { const u = Math.min(1, t / 0.35); const cup = cups.findIndex(cc => Math.round(cc.slot) === reveal.ball); if (cup >= 0) cups[cup].lift = u; } }
    // the ball sits under the cup it started under (cup id = start slot), drawn first so the cup covers it
    const ballCup = cups[g.st];
    if (ph === 'show' || (ph === 'reveal' && reveal)) drawBall(c, slotX(n, ballCup.slot) * k, base - ballCup.z * 6 * k, k);
    const order = cups.map((cc, i) => [cc, i]).sort((a, b) => a[0].z - b[0].z);
    const meCol = byPid.get(me)?.color;
    for (const [cc] of order) {
      const s = Math.round(cc.slot), x = slotX(n, cc.slot) * k, y = base - cc.z * 6 * k;
      const glow = ph === 'guess' && !watching ? (myPick === s ? meCol : myPick == null && sel === s ? 'rgba(255,255,255,.7)' : null) : (ph === 'reveal' && reveal?.picks?.[me] === s ? meCol : null);
      drawCup(c, x, y, cw * (1 + cc.z * 0.06), k, cc.lift, glow);
    }
    if (ph === 'guess' || ph === 'reveal') {
      c.fillStyle = HW ? '#ffd23f' : '#fff'; c.font = `900 ${Math.round(4.2 * k)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let s = 0; s < n; s++) c.fillText(String(s + 1), slotX(n, s) * k, 68.5 * k);
    }
    // at the reveal: everyone's face over the cup they picked
    if (ph === 'reveal' && reveal) {
      const at = {}; for (const p of players) { const s = reveal.picks[p.pid]; if (s == null) continue; (at[s] = at[s] || []).push(p); }
      for (const [s, list] of Object.entries(at)) list.forEach((p, i) => {
        const x = slotX(n, +s) * k + (i - (list.length - 1) / 2) * 7 * k, y = 30 * k, r = 3.4 * k;
        c.fillStyle = p.color; c.beginPath(); c.arc(x, y, r + 0.7 * k, 0, 7); c.fill();
        const im = imgs.get(p.pid); if (im?.complete && im.naturalWidth) { c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip(); c.drawImage(im, x - r, y - r, r * 2, r * 2); c.restore(); }
        c.fillStyle = reveal.got[p.pid] > 0 ? '#4fdc6a' : '#ff5f5f'; c.font = `900 ${Math.round(3.6 * k)}px sans-serif`; c.textAlign = 'center'; c.fillText(reveal.got[p.pid] > 0 ? '✓' : '✗', x + r, y - r);
      });
    }
  }
  function prompt() {
    if (!g) return '';
    if (ph === 'show') return 'Watch the ball!';
    if (ph === 'shuffle') return 'Follow that cup…';
    if (ph === 'guess') return watching ? 'Where is the ball?' : myPick == null ? 'TAP the cup with the ball!' : 'Locked in!';
    if (ph === 'reveal') { const got = reveal?.got?.[me]; return me == null || got == null ? 'There it is!' : got > 0 ? `Got it! +${got}` : reveal.picks?.[me] == null ? 'Too slow! It was here' : 'Missed it!'; }
    return 'All done!';
  }
  function note() {
    if (!g) return '';
    if (ph === 'end') { if (!init.solo) return 'Most points wins.'; const s = g.sc[me ?? players[0].pid] ?? 0, m = [20, 30, 38].filter(v => s >= v).length; return `${s} points — ${['no medal yet', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at 20 / 30 / 38)`; }
    if (ph === 'guess') return 'Quick taps (in a second) score +1. Two right in a row +1, three +2.';
    const sk = me != null ? g.sk[me] : 0;
    return sk >= 2 ? `🔥 ${sk} in a row!` : 'Fake-outs: a cup that only wiggles has NOT moved.';
  }
  return {
    state(s) {
      const changed = s.ph !== ph || s.r !== round;
      if (changed) {
        t0 = now();
        if (s.ph === 'show') { myPick = null; reveal = null; if (sel != null) sel = Math.floor(s.n / 2); ctx.sfx('tap'); }
        if (s.ph === 'guess') { ctx.sfx('good'); myPick = null; }
        if (s.ph === 'end') ctx.sfx('win');
      }
      ph = s.ph; round = s.r; g = s;
      if (s.ph === 'reveal' && s.ball != null) reveal = { ball: s.ball, picks: s.picks, got: s.got };
      $('.clock b').textContent = s.ph === 'guess' ? s.left : '–'; $('.clock').classList.toggle('hurry', s.ph === 'guess' && s.left <= 2);
      $('.cb-round').textContent = `Round ${s.r + 1}/${init.rounds} · ${s.n} cups`;
      ui.dataset.phase = s.ph;
      let lead = -Infinity; for (const p of players) lead = Math.max(lead, s.sc[p.pid]);
      for (const p of players) {
        const el = ui.querySelector(`.cb-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = s.sc[p.pid];
        el.classList.toggle('lead', players.length > 1 && s.sc[p.pid] === lead && lead > 0);
        el.querySelector('.pk').textContent = s.ph === 'guess' && s.pk?.includes(p.pid) ? '✓' : s.sk[p.pid] >= 2 ? `🔥${s.sk[p.pid]}` : '';
      }
      doEl.textContent = prompt(); doEl.className = 'cb-do ' + s.ph + (s.ph === 'reveal' && reveal?.got?.[me] > 0 ? ' good' : s.ph === 'reveal' && me != null ? ' bad' : '');
      $('.cb-note').textContent = note();
    },
    priv(d) { if (d && d.r === round && d.pick != null) myPick = d.pick; },
    event(ev) {
      if (ev.e === 'picked' && ev.pid !== me) ctx.sfx('tap');
      if (ev.e === 'reveal') {
        const got = ev.got?.[me];
        if (me != null) ctx.sfx(got > 0 ? (got > 4 ? 'coins' : 'good') : 'bad');
        if (got > 0) burst(slotX(g?.n || 3, ev.ball), 40, `+${got}`, 'good');
      }
    },
    frame() { draw(); },
    dispose() { ro.disconnect(); removeEventListener('keydown', onKey); },
  };
}
