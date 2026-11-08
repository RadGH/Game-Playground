// COCOA POUR on a screen: a big mug (SVG) with a dotted fill line, the pot tilting over it, and one huge HOLD TO POUR
// button under it. While you hold, the cocoa rises on YOUR phone from the same curve the server uses (levelAt), and the
// steam fogs the top of the mug so the last stretch is a judgement. Let go = the hold time is sent once. The reveal
// shows every mug side by side with its level and points (spills drip over the side). Space works as the button too.
import { esc, chip } from '../../client/gamehud.js';
import { levelAt, ROUNDS, POTS, SPILL, PERFECT } from './sim.js';

const TOP = 34, BOT = 222, H = BOT - TOP;                 // the mug's inside, in SVG units: level 0 at BOT, 100 at TOP
const yOf = lv => BOT - Math.min(118, Math.max(0, lv)) / 100 * H;

function mugSvg({ level = 0, line = 60, fog = 0, spill = false, small = false, seat = '#e8322a' }) {
  const y = yOf(level), ly = yOf(line), f = fog ? yOf(line * 0.7) : 0;
  return `<svg viewBox="0 0 230 250" class="cp-mug${small ? ' small' : ''}" aria-hidden="true">
    <defs><clipPath id="cpIn${small ? 's' : ''}"><path d="M30 ${TOP} L170 ${TOP} L162 ${BOT} Q160 232 150 232 L50 232 Q40 232 38 ${BOT} Z"/></clipPath>
      <linearGradient id="cpSteam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff" stop-opacity=".97"/><stop offset="1" stop-color="#fff" stop-opacity=".97"/></linearGradient></defs>
    <path d="M168 70 C214 70 214 168 164 168" fill="none" stroke="${seat}" stroke-width="16" stroke-linecap="round"/>
    <path d="M26 ${TOP - 6} L174 ${TOP - 6} L165 ${BOT} Q162 240 150 240 L50 240 Q38 240 35 ${BOT} Z" fill="${seat}" stroke="#24303a" stroke-width="5"/>
    <path d="M30 ${TOP} L170 ${TOP} L162 ${BOT} Q160 232 150 232 L50 232 Q40 232 38 ${BOT} Z" fill="#fff6ec"/>
    <g clip-path="url(#cpIn${small ? 's' : ''})"><rect x="20" y="${y}" width="170" height="${BOT + 20 - y}" fill="#7a4326"/><rect x="20" y="${y}" width="170" height="7" fill="#a0603a"/>
      ${level >= 4 ? `<circle cx="80" cy="${y + 1}" r="9" fill="#fff" stroke="#e8d8c8" stroke-width="2"/><circle cx="118" cy="${y + 3}" r="8" fill="#fff" stroke="#e8d8c8" stroke-width="2"/>` : ''}</g>
    <path d="M30 ${ly} L170 ${ly}" stroke="#24303a" stroke-width="4" stroke-dasharray="10 8"/>
    <text x="176" y="${ly + 5}" font-size="16" font-weight="900" fill="#24303a">◀</text>
    ${fog ? `<rect x="24" y="${TOP - 30}" width="152" height="${f - TOP + 30}" fill="url(#cpSteam)"/><text x="100" y="${(TOP + f) / 2}" font-size="18" text-anchor="middle" fill="#9fb4c8" font-weight="800">~ steam ~</text>` : ''}
    ${spill ? '<path d="M26 28 q-6 30 -2 60 q4 10 8 0 q4 -30 0 -60z M174 28 q6 40 2 80 q-4 10 -8 0 q-4 -40 0 -80z" fill="#7a4326"/>' : ''}
  </svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const seatOf = pid => players.find(p => p.pid === pid)?.color || '#8a6a4a';
  const nameOf = pid => pid === init.cpu?.pid ? init.cpu.name : players.find(p => p.pid === pid)?.name || '?';
  ui.innerHTML = `
    <div class="cp-top"><span class="cp-title">Cocoa Pour</span><span class="cp-round"></span><span class="clock"><b>--</b></span></div>
    <div class="cp-main"><p class="cp-pot"></p><div class="cp-stage"></div><div class="cp-all"></div></div>
    <button class="cp-btn" type="button" ${watching ? 'hidden' : ''}><b>HOLD TO POUR</b><small>let go on the line</small></button>
    <div class="cp-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="cp-st"></strong>')).join('')}${init.cpu ? `<span class="chip cpu" data-pid="${init.cpu.pid}"><b>🐱 ${esc(init.cpu.name)}</b><em class="sc">0</em><strong class="cp-st"></strong></span>` : ''}</div>`;
  const $ = s => ui.querySelector(s), btn = $('.cp-btn'), stage = $('.cp-stage');
  if (me != null) ui.querySelector(`.cp-players [data-pid="${me}"]`)?.classList.add('me');
  let G = null, held = null, sent = null, round = -1, phase = '', raf = 0;

  const pot = () => G?.pot ? { kind: G.pot[0], rate: G.pot[1], line: G.pot[2] } : null;
  function drawMine() {
    const P = pot(); if (!P) { stage.innerHTML = ''; return; }
    const ms = held != null ? performance.now() - held : sent;
    const lv = ms == null ? 0 : levelAt(P, ms);
    stage.innerHTML = mugSvg({ level: lv, line: P.line, fog: G.phase === 'pour' || G.phase === 'show', spill: lv >= SPILL, seat: me != null ? seatOf(me) : '#e8322a' });
  }
  function loop() { drawMine(); if (held != null) { if (performance.now() - held > (init.maxMs || 12000)) release(); else raf = requestAnimationFrame(loop); } }
  function press(e) {
    e?.preventDefault?.();
    if (watching || G?.phase !== 'pour' || sent != null || held != null) return;
    held = performance.now(); btn.classList.add('on'); ctx.sfx('tap'); raf = requestAnimationFrame(loop);
  }
  function release() {
    if (held == null) return;
    const ms = Math.round(performance.now() - held); held = null; cancelAnimationFrame(raf); btn.classList.remove('on');
    sent = ms; ctx.send('pour', ms); ctx.sfx('pick'); btn.disabled = true; drawMine();
  }
  btn.addEventListener('pointerdown', press); btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release); btn.addEventListener('pointerleave', release);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  const kd = e => { if (e.code === 'Space' && !e.repeat) press(e); }, ku = e => { if (e.code === 'Space') release(); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  function setScores(sc) { for (const [pid, v] of Object.entries(sc || {})) { const el = ui.querySelector(`.cp-players [data-pid="${pid}"] .sc`); if (el) el.textContent = v; } }
  function drawReveal(r) {
    const P = pot(), pids = Object.keys(r.lv).map(Number);
    $('.cp-all').innerHTML = pids.map(pid => { const lv = r.lv[pid], gain = r.gain[pid];
      return `<div class="cp-one${pid === me ? ' me' : ''}">${mugSvg({ level: lv ?? 0, line: P.line, spill: lv >= SPILL, small: true, seat: seatOf(pid) })}<b>${esc(nameOf(pid))}</b><span>${lv == null ? 'no pour' : lv >= SPILL ? 'SPILLED!' : `${Math.round(lv)}% · +${gain}`}${lv != null && lv < SPILL && Math.abs(lv - P.line) <= PERFECT ? ' 🍡' : ''}</span></div>`; }).join('');
  }
  return {
    state(g) {
      G = g; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; setScores(g.scores);
      if (g.round !== round) { round = g.round; sent = null; held = null; btn.disabled = false; $('.cp-all').innerHTML = ''; }
      $('.cp-round').textContent = g.round >= 0 && g.phase !== 'end' ? `Mug ${g.round + 1} of ${init.rounds || ROUNDS}` : '';
      const P = pot();
      $('.cp-pot').innerHTML = g.phase === 'ready' ? 'Get ready to pour…' : g.phase === 'end' ? 'All done! Warm hands all round.' : P ? `This pot: <b>${esc(POTS[P.kind])}</b> · fill to the line` : '';
      for (const el of ui.querySelectorAll('.cp-st')) el.textContent = '';
      if (g.phase === 'pour') for (const pid of g.in || []) { const el = ui.querySelector(`.cp-players [data-pid="${pid}"] .cp-st`); if (el) el.textContent = '✓'; }
      btn.classList.toggle('ready', g.phase === 'pour' && sent == null);
      if (g.phase === 'reveal' && g.reveal && g.phase !== phase) { drawReveal(g.reveal); const mine = me != null ? g.reveal.gain[me] : null; if (mine != null) ctx.sfx(mine >= 10 ? 'win' : mine > 0 ? 'good' : 'bad'); }
      if (g.phase === 'pour' && phase !== 'pour') ctx.sfx('tap');
      phase = g.phase;
      if (held == null) drawMine();
    },
    priv(d) { if (d?.ms != null && sent == null && held == null) { sent = d.ms; btn.disabled = true; drawMine(); } },   // a phone that came back mid-round
    dispose() { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); },
  };
}
