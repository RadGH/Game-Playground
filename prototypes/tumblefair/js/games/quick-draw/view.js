// QUICK DRAW on a screen. The whole screen is the button on a phone that plays. A fairground bell hangs over a
// little stage; while waiting it is dim and still. Fake-outs pop up in the middle (hen, popped balloon, cow, the words
// BALL / BELT) with their own sound. When the server rings the bell: the sky flashes gold, the bell swings, "TAP!".
// The phone times its own reaction from the frame the bell went on screen (see sim.js for how the server checks it)
// and shows your time at once; the reveal lists everyone fastest first.
import { esc, chip } from '../../client/gamehud.js';

const INK = '#0d2228';
const O = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const BELL = `<svg class="qd-bell" viewBox="0 0 160 170" aria-hidden="true">
  <rect x="10" y="6" width="140" height="18" rx="6" fill="#a8633a" ${O}/><path d="M80 24 v14" ${O}/>
  <g class="qd-swing"><path d="M80 38 C52 38 44 62 42 92 C40 118 30 128 22 136 H138 C130 128 120 118 118 92 C116 62 108 38 80 38 Z" fill="#ffd23f" ${O}/>
  <path d="M58 60 C54 76 54 96 52 112" fill="none" stroke="#fff6c4" stroke-width="7" stroke-linecap="round"/>
  <rect x="18" y="132" width="124" height="14" rx="7" fill="#f2b705" ${O}/><circle class="qd-clapper" cx="80" cy="154" r="11" fill="#a8633a" ${O}/></g></svg>`;
const ART = {
  hen: `<svg viewBox="0 0 120 110" aria-hidden="true"><path d="M30 100 l6 -16 M54 100 l-4 -16" ${O} fill="none"/><path d="M14 52 Q8 92 50 90 Q92 92 96 58 Q104 36 86 30 Q76 28 72 40 Q60 54 34 46 Q22 42 14 52 Z" fill="#fff" ${O}/>
    <path d="M78 22 q4 -12 10 -4 q6 -10 10 2 q6 -2 2 8 Z" fill="#ff4d6d" ${O}/><path d="M98 40 l14 4 l-14 6 Z" fill="#ffb703" ${O}/><path d="M92 50 q4 8 -2 10" fill="#ff4d6d" ${O}/><circle cx="88" cy="38" r="3.5" fill="${INK}"/><path d="M34 58 q14 16 32 4" fill="none" ${O}/></svg>`,
  pop: `<svg viewBox="0 0 120 110" aria-hidden="true"><path d="M60 8 L70 34 L98 22 L84 48 L112 58 L82 66 L94 94 L66 78 L56 104 L48 78 L20 92 L34 64 L6 54 L36 44 L24 18 L50 32 Z" fill="#ff4d6d" ${O}/><circle cx="60" cy="56" r="16" fill="#ffd23f" ${O}/></svg>`,
  cow: `<svg viewBox="0 0 120 110" aria-hidden="true"><path d="M22 30 q-16 -4 -14 8 q4 8 18 6 M98 30 q16 -4 14 8 q-4 8 -18 6" fill="#fff" ${O}/><path d="M34 20 q-8 -12 2 -14 M86 20 q8 -12 -2 -14" fill="none" ${O}/>
    <path d="M26 30 Q26 14 60 14 Q94 14 94 30 L92 64 Q90 70 84 70 H36 Q30 70 28 64 Z" fill="#fff" ${O}/><path d="M66 16 q16 2 20 18 q-14 4 -20 -18 Z" fill="${INK}"/><ellipse cx="60" cy="80" rx="30" ry="22" fill="#ffb3c8" ${O}/>
    <circle cx="48" cy="82" r="4" fill="${INK}"/><circle cx="72" cy="82" r="4" fill="${INK}"/><circle cx="44" cy="42" r="5" fill="${INK}"/><circle cx="76" cy="42" r="5" fill="${INK}"/></svg>`,
  ball: `<svg viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="56" r="44" fill="#fff" ${O}/><path d="M60 12 Q34 56 60 100 M60 12 Q86 56 60 100" fill="none" ${O}/><path d="M60 12 Q20 30 18 62 Q40 40 60 12 Z" fill="#ff4d6d"/><path d="M60 12 Q100 30 102 62 Q80 40 60 12 Z" fill="#4d9cff"/><circle cx="60" cy="56" r="44" fill="none" ${O}/></svg>`,
  belt: `<svg viewBox="0 0 120 110" aria-hidden="true"><rect x="4" y="42" width="112" height="26" rx="6" fill="#a8633a" ${O}/><rect x="40" y="32" width="40" height="46" rx="8" fill="#ffd23f" ${O}/><rect x="50" y="42" width="20" height="26" rx="3" fill="#a8633a" ${O}/><path d="M60 46 v18" ${O}/><circle cx="96" cy="55" r="3" fill="${INK}"/><circle cx="106" cy="55" r="3" fill="${INK}"/></svg>`,
};
const WORD = { hen: 'BAWK!', pop: 'POP!', cow: 'MOO!', ball: 'BALL', belt: 'BELT' };
const SOUND = { hen: 'animal.hen.cluck', pop: 'trap.snap', cow: 'animal.cow.moo', ball: 'ui.tab', belt: 'ui.tab' };
const secs = ms => (ms / 1000).toFixed(3) + ' s';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="qd-top"><span class="qd-round"></span><span class="clock"><b>--</b></span></div>
    <div class="qd-chips">${players.map(p => chip(p, '<em class="sc">0</em><strong class="qd-st"></strong>')).join('')}</div>
    <div class="qd-scene">
      <div class="qd-rays"></div>
      ${BELL}
      <div class="qd-fake"><div class="qd-fake-art"></div><b class="qd-fake-word"></b></div>
      <div class="qd-big"></div>
      <div class="qd-mine"></div>
    </div>
    <div class="qd-list"></div>
    <p class="qd-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.qd-chips [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, shownAt = 0, tappedRound = -1, fakeKey = '', last = null, myRt = null, myEarly = false;

  function mine(text, cls) { const m = $('.qd-mine'); m.textContent = text; m.className = 'qd-mine ' + (cls || ''); }
  function tap(e) {
    if (watching || tappedRound === round || round < 0) return;
    if (phase !== 'wait' && phase !== 'bell') return;
    e.preventDefault();
    tappedRound = round;
    if (phase === 'bell') {
      myRt = Math.round(performance.now() - shownAt); myEarly = false;
      ctx.send('tap', { r: round, rt: myRt }); ctx.sfx('hit');
      mine(`Tapped! ${secs(myRt)}`, 'good');
    } else {
      myEarly = true; myRt = null;
      ctx.send('tap', { r: round, early: true }); ctx.sfx('bad'); navigator.vibrate?.(120);
      mine('TOO SOON! Out this round', 'bad');
    }
    ui.classList.add('tapped');
  }
  ui.addEventListener('pointerdown', tap);

  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.qd-chips [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.qd-st'); let t = '', cls = '';
      if (g.out.includes(p.pid)) { t = 'too soon!'; cls = 'bad'; }
      else if (g.done.includes(p.pid)) { t = 'tapped'; cls = 'good'; }
      st.textContent = t; st.className = 'qd-st ' + cls;
      el.classList.toggle('out', g.out.includes(p.pid));
    }
  }
  function paintReveal(r) {
    const rows = [];
    let n = 0;
    for (const pid of r.order) { const p = byPid.get(pid); n++; rows.push(`<div class="qd-row place-${r.place[pid]}" style="--seat:${p.color}"><span class="qd-pl">${r.place[pid] === 1 ? '1st' : r.place[pid] === 2 ? '2nd' : r.place[pid] === 3 ? '3rd' : '4th'}</span>${face(p)}<b>${esc(p.name)}</b><span class="qd-t">${secs(r.times[pid])}</span><em class="${r.gain[pid] > 0 ? 'good' : ''}">${r.gain[pid] > 0 ? '+' + r.gain[pid] : '0'}</em></div>`); }
    for (const pid of r.early) { const p = byPid.get(pid); rows.push(`<div class="qd-row early" style="--seat:${p.color}"><span class="qd-pl">X</span>${face(p)}<b>${esc(p.name)}</b><span class="qd-t">Too soon!</span><em class="bad">${r.gain[pid]}</em></div>`); }
    for (const p of players) if (!r.order.includes(p.pid) && !r.early.includes(p.pid)) rows.push(`<div class="qd-row slow" style="--seat:${p.color}"><span class="qd-pl">-</span>${face(p)}<b>${esc(p.name)}</b><span class="qd-t">No tap</span><em>0</em></div>`);
    $('.qd-list').innerHTML = `<h3>Round ${round + 1}</h3>` + rows.join('');
  }
  function paintEnd(g) {
    const order = players.slice().sort((a, b) => g.scores[b.pid] - g.scores[a.pid]);
    $('.qd-list').innerHTML = `<h3>Final scores</h3>` + order.map((p, i) => `<div class="qd-row${i === 0 || g.scores[p.pid] === g.scores[order[0].pid] ? ' place-1' : ''}" style="--seat:${p.color}"><span class="qd-pl">${['1st', '2nd', '3rd', '4th'][order.findIndex(o => g.scores[o.pid] === g.scores[p.pid])]}</span>${face(p)}<b>${esc(p.name)}</b><span class="qd-t">${g.best[p.pid] != null ? 'best ' + secs(g.best[p.pid]) : 'no taps'}</span><em class="good">${g.scores[p.pid]}</em></div>`).join('');
  }
  const face = p => `<i class="qd-face">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function note(g) {
    if (g.phase === 'ready') return init.solo ? 'Tap the moment the bell rings. Faster = more points!' : 'Tap the moment the bell rings. Only the BELL!';
    if (g.phase === 'wait') return watching ? 'Wait for it…' : 'Only tap on the BELL!';
    if (g.phase === 'bell') return '';
    if (g.phase === 'reveal') {
      const r = g.reveal, w = r.order.filter(p => r.place[p] === 1).map(p => byPid.get(p)?.name);
      if (init.solo) return r.early.length ? 'Too soon! Wait for the bell.' : r.order.length ? `${secs(r.times[r.order[0]])}: +${r.gain[r.order[0]]}` : 'Too slow!';
      return w.length ? `${w.join(' and ')} ${w.length > 1 ? 'tie' : 'wins'} the round!` : 'Nobody got it!';
    }
    return 'Quickest on the draw wins!';
  }

  return {
    state(g) {
      last = g;
      if (g.phase !== phase || g.round !== round) {
        if (g.phase === 'wait' && (phase !== 'wait' || g.round !== round)) { mine('', ''); ui.classList.remove('tapped'); myRt = null; myEarly = false; $('.qd-list').innerHTML = ''; ctx.sfx('open'); }
        if (g.phase === 'bell') { shownAt = performance.now(); ctx.sfx('hvf.bell'); navigator.vibrate?.(40); if (tappedRound !== g.round) mine('', ''); }
        if (g.phase === 'reveal') { paintReveal(g.reveal); const r = g.reveal; if (me != null) ctx.sfx(r.early.includes(me) ? 'bad' : r.place[me] === 1 ? 'win' : r.order.includes(me) ? 'good' : 'bad'); }
        if (g.phase === 'end') { paintEnd(g); mine('', ''); ctx.sfx('win'); }
      }
      round = g.round; phase = g.phase; ui.dataset.phase = g.phase;
      const fk = g.fake ? `${g.round}:${g.fake.i}` : '';
      if (fk !== fakeKey) {
        fakeKey = fk;
        if (g.fake) { $('.qd-fake-art').innerHTML = ART[g.fake.k] || ''; $('.qd-fake-word').textContent = WORD[g.fake.k]; $('.qd-fake').dataset.k = g.fake.k; ctx.sfx(SOUND[g.fake.k]); }
        ui.classList.toggle('faking', !!g.fake);
      }
      $('.clock b').textContent = g.left ?? '';
      $('.clock').classList.toggle('blank', g.left == null);
      $('.qd-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      $('.qd-big').textContent = g.phase === 'bell' ? 'TAP!' : g.phase === 'wait' ? 'Wait…' : g.phase === 'ready' ? 'Get ready!' : '';
      paintChips(g);
      $('.qd-note').textContent = note(g);
    },
    dispose() { ui.removeEventListener('pointerdown', tap); },
  };
}
