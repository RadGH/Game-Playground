// MERRY-GO-GUESS on a screen: a merry-go-round seen from above (a striped canopy, a ring of bulbs, eight painted
// horses on their poles riding round, one of them GOLD with a star) and a big brass bell at the top with a pointer.
// The ride turns by the round's own numbers from the moment the show starts. When the lights go out the ride is
// covered in darkness (only the bell glows) and a huge RING THE BELL button waits. The reveal turns the lights back
// on, puts the golden horse at the bell, and drops each player's face on the ring where the golden horse really was
// when they rang, with "0.3 s early" / "spot on!" beside it.
import { esc, chip } from '../../client/gamehud.js';
import { phaseAt, TAU } from './sim.js';

const R = 66;           // the horses' ring radius in svg units
const KIND = { steady: 'Steady', fast: 'Fast — count 2 laps!', slower: 'It is slowing down…', faster: 'It is speeding up — 2 laps!', slow: 'Nice and slow' };
const COLORS = ['#ffc93c', '#ff8fb1', '#8fd3ff', '#b6f08a', '#d7b4ff', '#ffb37a', '#9ff0e0', '#ffd6f0'];
function horse(i) {
  const c = COLORS[i], gold = i === 0, o = gold ? '#7a5a00' : '#3c3550';
  return `<g class="mg-h${gold ? ' gold' : ''}" data-i="${i}">
    <line x1="0" y1="-17" x2="0" y2="13" stroke="#c9a227" stroke-width="2.4"/>
    <path d="M-11 -2 q-7 2 -6 9" stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M-7 3 l-2 8 M-3 4 l1 8 M4 4 l-1 8 M8 3 l3 7" stroke="${o}" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="0" cy="0" rx="11.5" ry="6.5" fill="${c}" stroke="${o}" stroke-width="1.6"/>
    <path d="M7 -3 L12 -13 L19 -11 L16 -5 Z" fill="${c}" stroke="${o}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="15" cy="-10" r="1.2" fill="${o}"/>
    ${gold ? '<path d="M0 -29 l2.6 5.4 5.9 .8 -4.3 4.1 1 5.9 -5.2 -2.8 -5.2 2.8 1 -5.9 -4.3 -4.1 5.9 -.8z" fill="#fff4b0" stroke="#7a5a00" stroke-width="1.3"/>' : ''}
  </g>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const bulbs = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * TAU; return `<circle class="mg-bulb" cx="${(Math.sin(a) * 90).toFixed(1)}" cy="${(-Math.cos(a) * 90).toFixed(1)}" r="3.4"/>`; }).join('');
  const stripes = Array.from({ length: 16 }, (_, i) => { const a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU; return `<path d="M0 0 L${(Math.sin(a0) * 86).toFixed(1)} ${(-Math.cos(a0) * 86).toFixed(1)} A86 86 0 0 1 ${(Math.sin(a1) * 86).toFixed(1)} ${(-Math.cos(a1) * 86).toFixed(1)} Z" fill="${i % 2 ? '#fff4e6' : '#ff6f8f'}"/>`; }).join('');
  ui.innerHTML = `
    <div class="mg-top"><span class="mg-title">Merry-Go-Guess</span><span class="mg-round"></span><span class="clock"><b>--</b></span></div>
    <div class="mg-stage">
      <svg class="mg-svg" viewBox="-104 -122 208 226" aria-label="the merry-go-round">
        <circle r="98" fill="#8a5a32"/><circle r="94" fill="#c98f52"/>
        <g class="mg-canopy" opacity=".35">${stripes}</g>
        <g class="mg-bulbs">${bulbs}</g>
        <circle r="15" fill="#ffd23f" stroke="#7a5a00" stroke-width="2"/>
        <g class="mg-ride">${COLORS.map((_, i) => horse(i)).join('')}</g>
        <circle class="mg-darkness" r="99" fill="#0d1022"/>
        <text class="mg-qm" y="12" text-anchor="middle">?</text>
        <g class="mg-marks"></g>
        <path class="mg-pointer" d="M0 -80 L-7 -94 L7 -94 Z" fill="#ffd23f" stroke="#1d1f24" stroke-width="2"/>
        <g class="mg-bell" transform="translate(0 -108)">
          <path d="M-12 8 C-12 -6 -8 -12 0 -12 C8 -12 12 -6 12 8 L15 11 L-15 11 Z" fill="#ffc93c" stroke="#1d1f24" stroke-width="2.4" stroke-linejoin="round"/>
          <circle cy="13" r="3.2" fill="#1d1f24"/><rect x="-3" y="-16" width="6" height="5" rx="2" fill="#1d1f24"/>
        </g>
      </svg>
      <div class="mg-say"></div>
    </div>
    <button class="mg-ring" type="button"><svg viewBox="-16 -16 32 32" aria-hidden="true"><path d="M-10 6 C-10 -5 -7 -10 0 -10 C7 -10 10 -5 10 6 L12 9 L-12 9 Z" fill="currentColor"/><circle cy="11" r="2.6" fill="currentColor"/></svg><span>RING!</span></button>
    <div class="mg-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="mg-st"></strong>')).join('')}</div>
    <p class="mg-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.mg-players [data-pid="${me}"]`)?.classList.add('me');
  const horses = [...ui.querySelectorAll('.mg-h')], btn = $('.mg-ring');
  let g = null, phase = '', round = -1, showAt = 0, darkAt = 0, rung = null, revealAt = 0, shown = 0;

  function place(p) { horses.forEach((el, i) => { const a = p + i / horses.length * TAU; el.setAttribute('transform', `translate(${(Math.sin(a) * R).toFixed(2)} ${(-Math.cos(a) * R).toFixed(2)})`); }); }
  place(0);
  btn.addEventListener('click', () => {
    if (watching || phase !== 'dark' || rung != null) return;
    rung = Math.round(performance.now() - darkAt); ctx.send('ring', { r: round, ms: rung }); ctx.sfx('good');
    $('.mg-bell').classList.add('ding'); paint();
  });
  const fmtOff = ms => { const s = Math.abs(ms) / 1000; return s < 0.05 ? 'spot on!' : `${s.toFixed(1)} s ${ms < 0 ? 'early' : 'late'}`; };
  function marks() {
    const r = g.reveal, M = { ps: g.ps, w: g.w, a: g.a };
    $('.mg-marks').innerHTML = players.filter(p => r.rings[p.pid] != null).map((p, k) => {
      const ph = phaseAt(M, init.show + r.rings[p.pid] / 1000), rr = 46 - (k % 2) * 13;
      const x = Math.sin(ph) * rr, y = -Math.cos(ph) * rr;
      return `<g class="mg-mark" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="10" fill="${p.color}" stroke="#1d1f24" stroke-width="2"/>${p.portrait ? `<image href="${esc(p.portrait)}" x="-8" y="-8" width="16" height="16" clip-path="circle(8px)"/>` : ''}</g>`;
    }).join('');
  }
  function paint() {
    if (!g) return;
    for (const p of players) {
      const el = ui.querySelector(`.mg-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.mg-st'); let t = '', cls = '';
      if (phase === 'dark') { if (g.rung?.includes(p.pid)) { t = 'rang!'; cls = 'in'; } else t = 'counting…'; }
      if (phase === 'reveal' && g.reveal) { const r = g.reveal, ms = r.rings[p.pid]; t = ms == null ? 'no ring' : `${fmtOff(ms - r.ans)} (+${r.gain[p.pid]})`; cls = r.closest.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'mg-st ' + cls;
    }
    btn.disabled = watching || phase !== 'dark' || rung != null;
    btn.querySelector('span').textContent = rung != null ? 'Rung!' : 'RING!';
    $('.mg-note').textContent = note();
  }
  function note() {
    if (!g || phase === 'ready') return 'Watch the golden horse…';
    if (phase === 'end') return 'All done! Most points wins.';
    if (phase === 'show') return `Watch the golden ★ horse pass the bell. ${g.laps > 1 ? `Count ${g.laps} laps!` : 'Count one lap.'}`;
    if (phase === 'dark') return watching ? `${g.rung?.length || 0} of ${players.length} rang` : rung != null ? 'Rung! Let\'s see…' : `Ring when it passes the bell${g.laps > 1 ? ` — ${g.laps} laps` : ''}!`;
    const r = g.reveal, nm = pid => players.find(p => p.pid === pid)?.name || '?';
    if (!r) return '';
    if (r.closest.length) return `${r.closest.map(nm).join(' and ')} rang closest!`;
    return players.length === 1 ? (r.rings[players[0].pid] != null ? `You were ${fmtOff(r.rings[players[0].pid] - r.ans)}` : 'No ring!') : 'Nobody was close!';
  }

  return {
    priv(d) { if (phase === 'dark' && d.rung != null && rung == null) { rung = d.rung; paint(); } },
    state(s) {
      g = s;
      if (s.phase !== phase || s.round !== round) {
        if (s.phase === 'show') { showAt = performance.now(); rung = null; $('.mg-marks').innerHTML = ''; $('.mg-bell').classList.remove('ding'); ctx.sfx('open'); }
        if (s.phase === 'dark') { darkAt = performance.now(); rung = null; ctx.sfx('trap'); }
        if (s.phase === 'reveal') { revealAt = performance.now(); marks(); ctx.sfx(s.reveal.closest.includes(me) || (players.length === 1 && s.reveal.gain[me] >= 7) ? 'win' : 'coins'); }
        if (s.phase === 'end') ctx.sfx('win');
        round = s.round;
      }
      phase = s.phase; ui.dataset.phase = s.phase;
      if (s.left != null) $('.clock b').textContent = s.left;
      $('.clock').classList.toggle('hidden', s.left == null);
      $('.mg-round').textContent = s.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, s.round) + 1} of ${init.rounds}`;
      $('.mg-say').textContent = s.kind && s.phase !== 'end' ? `${KIND[s.kind] || ''}` : '';
      paint();
    },
    frame() {
      if (!g || g.ps == null) return;
      const M = { ps: g.ps, w: g.w, a: g.a };
      if (phase === 'show') place(phaseAt(M, (performance.now() - showAt) / 1000));
      else if (phase === 'reveal') {
        // spin from where it was when the lights went out on to the bell, then hold there
        const k = Math.min(1, (performance.now() - revealAt) / 1100), e = 1 - Math.pow(1 - k, 3);
        const from = phaseAt(M, init.show), to = Math.ceil(from / TAU + 1e-6) * TAU + (g.laps - 1) * TAU;
        place(from + (to - from) * e);
        if (k >= 1 && shown !== round) { shown = round; ui.classList.add('marked'); }
      }
      if (phase !== 'reveal') ui.classList.remove('marked');
    },
    dispose() {},
  };
}
