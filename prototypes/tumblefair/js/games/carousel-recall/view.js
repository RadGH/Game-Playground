// CAROUSEL RECALL on a screen: a merry-go-round drawn in the page (a striped canopy, a gold pole for every animal,
// the animals bobbing up and down on their poles in a half circle) over a row of everyone's faces with how far they
// have got. While the tune plays, the lit animal glows, jumps and rings its own note — and its big button on the phone
// glows too. Then the buttons wake up: tap the animals back in order. A wrong one buzzes and greys you out for the
// round. Between rounds the whole tune is shown as a strip of little animals with ✓ / ✗ for each player.
// Halloween: a bat, a black cat, a ghost, an owl… on a purple, lantern-lit carousel (looks only).
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';

const O = 'stroke="#0d2228" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const PLAIN = [
  { id: 'horse', name: 'Horse', c: '#ff6b6b' }, { id: 'swan', name: 'Swan', c: '#4da3ff' }, { id: 'lion', name: 'Lion', c: '#ffb52e' },
  { id: 'frog', name: 'Frog', c: '#4fc35a' }, { id: 'pig', name: 'Pig', c: '#ff8fc8' }, { id: 'rooster', name: 'Rooster', c: '#b57bff' },
  { id: 'elephant', name: 'Elephant', c: '#2fc4c4' }, { id: 'rabbit', name: 'Rabbit', c: '#e8d23a' },
];
const SPOOKY = [
  { id: 'bat', name: 'Bat', c: '#ff6b6b' }, { id: 'cat', name: 'Black Cat', c: '#4da3ff' }, { id: 'pumpkin', name: 'Pumpkin', c: '#ffb52e' },
  { id: 'frankie', name: 'Frankie', c: '#4fc35a' }, { id: 'ghost', name: 'Ghost', c: '#ff8fc8' }, { id: 'owl', name: 'Owl', c: '#b57bff' },
  { id: 'spider', name: 'Spider', c: '#2fc4c4' }, { id: 'mummy', name: 'Mummy', c: '#e8d23a' },
];
const NOTE = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5];
/** One ride animal as an inline SVG (64 x 64). Bodies are pale so the button's colour shows round them. */
export function animalSvg(id) {
  const eye = (x, y) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#0d2228"/>`;
  const b = {
    horse: `<path d="M10 40 C10 30 18 26 30 26 L40 26 L46 12 L52 14 L56 24 C58 30 54 32 50 30 L48 40 C48 46 42 48 36 48 L22 48 C14 48 10 46 10 40 Z" fill="#fff" ${O}/><path d="M42 14 C38 18 36 24 38 28" fill="none" stroke="#ffd23f" stroke-width="5"/><path d="M16 48 V58 M40 48 V58" ${O} stroke-width="4"/>${eye(50, 20)}`,
    swan: `<path d="M8 40 C8 52 22 56 36 54 C50 52 58 44 56 34 C52 40 46 42 40 40 C36 38 38 30 40 24 C42 16 38 8 30 10 C24 12 24 20 28 24 C32 28 30 34 24 34 C16 34 8 34 8 40 Z" fill="#fff" ${O}/><path d="M24 12 L16 14 L24 18" fill="#ff8a1a" ${O} stroke-width="2"/>${eye(29, 15)}`,
    lion: `<circle cx="32" cy="30" r="22" fill="#ff9a2e" ${O}/><circle cx="32" cy="32" r="14" fill="#ffe08a" ${O}/>${eye(26, 29)}${eye(38, 29)}<path d="M29 36 L35 36 L32 39 Z" fill="#0d2228"/><path d="M28 42 Q32 45 36 42" fill="none" ${O} stroke-width="2"/>`,
    frog: `<ellipse cx="32" cy="38" rx="24" ry="16" fill="#9be07a" ${O}/><circle cx="20" cy="22" r="8" fill="#9be07a" ${O}/><circle cx="44" cy="22" r="8" fill="#9be07a" ${O}/><circle cx="20" cy="22" r="4" fill="#fff"/><circle cx="44" cy="22" r="4" fill="#fff"/>${eye(21, 22)}${eye(45, 22)}<path d="M20 40 Q32 50 44 40" fill="none" ${O}/>`,
    pig: `<circle cx="32" cy="34" r="20" fill="#ffc6df" ${O}/><path d="M16 18 L14 6 L26 14 Z M48 18 L50 6 L38 14 Z" fill="#ffc6df" ${O}/><ellipse cx="32" cy="40" rx="9" ry="6.5" fill="#ff9ac2" ${O}/><circle cx="29" cy="40" r="1.8" fill="#0d2228"/><circle cx="35" cy="40" r="1.8" fill="#0d2228"/>${eye(25, 29)}${eye(39, 29)}`,
    rooster: `<path d="M18 52 C10 44 12 30 22 26 L24 16 C26 10 34 10 36 16 L36 26 C46 26 54 34 52 44 C50 52 42 56 32 56 C26 56 22 55 18 52 Z" fill="#fff" ${O}/><path d="M24 14 C24 8 28 4 30 8 C32 2 36 4 36 10" fill="#e8394a" ${O} stroke-width="2"/><path d="M36 20 L44 22 L36 25 Z" fill="#ffb52e" ${O} stroke-width="2"/><path d="M50 30 C58 24 60 34 56 40" fill="none" stroke="#4da3ff" stroke-width="5" stroke-linecap="round"/>${eye(31, 19)}`,
    elephant: `<path d="M12 38 C12 24 22 16 34 16 C46 16 54 24 54 36 L54 50 L46 50 L46 44 L28 44 L28 50 L20 50 L20 46 C14 46 12 42 12 38 Z" fill="#cfd8e3" ${O}/><path d="M16 30 C8 34 6 44 10 52" fill="none" ${O} stroke-width="6"/><path d="M16 30 C8 34 6 44 10 52" fill="none" stroke="#cfd8e3" stroke-width="3"/><path d="M28 22 C22 22 20 30 26 34 C32 36 34 28 28 22 Z" fill="#b8c4d0" ${O} stroke-width="2"/>${eye(22, 27)}`,
    rabbit: `<ellipse cx="24" cy="14" rx="5" ry="12" fill="#fff" ${O}/><ellipse cx="38" cy="13" rx="5" ry="12" fill="#fff" ${O}/><circle cx="31" cy="36" r="17" fill="#fff" ${O}/><circle cx="26" cy="33" r="2.6" fill="#0d2228"/><circle cx="36" cy="33" r="2.6" fill="#0d2228"/><path d="M29 39 L33 39 L31 41 Z" fill="#ff8fc8"/><path d="M27 44 Q31 47 35 44" fill="none" ${O} stroke-width="2"/>`,
    // Halloween (looks only)
    bat: `<path d="M32 26 C24 14 10 14 2 22 C8 24 10 30 8 36 C14 32 20 34 22 40 C26 36 30 38 32 42 C34 38 38 36 42 40 C44 34 50 32 56 36 C54 30 56 24 62 22 C54 14 40 14 32 26 Z" fill="#5a4a7a" ${O}/><circle cx="28" cy="28" r="2.6" fill="#ffd23f"/><circle cx="36" cy="28" r="2.6" fill="#ffd23f"/>`,
    cat: `<path d="M14 58 C10 44 14 30 22 26 L18 8 L30 20 H34 L46 8 L42 26 C50 30 54 44 50 58 Z" fill="#2a2440" ${O}/><ellipse cx="26" cy="36" rx="3.5" ry="4.5" fill="#ffd23f"/><ellipse cx="38" cy="36" rx="3.5" ry="4.5" fill="#ffd23f"/><path d="M30 44 L32 46 L34 44" fill="none" stroke="#fff" stroke-width="2"/>`,
    pumpkin: `<path d="M32 16 C14 14 6 26 8 40 C10 54 22 58 32 56 C42 58 54 54 56 40 C58 26 50 14 32 16 Z" fill="#ff8a1a" ${O}/><path d="M24 18 C18 30 18 46 24 56 M40 18 C46 30 46 46 40 56" fill="none" ${O} stroke-width="2"/><path d="M32 16 C31 10 34 6 38 5" fill="none" stroke="#3f7a2a" stroke-width="5" stroke-linecap="round"/><path d="M22 34 L28 30 L28 36 Z M42 34 L36 30 L36 36 Z" fill="#ffe14a"/><path d="M22 42 Q32 50 42 42" fill="none" ${O}/>`,
    frankie: `<rect x="14" y="10" width="36" height="44" rx="6" fill="#9be07a" ${O}/><rect x="14" y="10" width="36" height="12" fill="#2a2440" ${O}/><circle cx="10" cy="40" r="4" fill="#b8c4cc" ${O} stroke-width="2"/><circle cx="54" cy="40" r="4" fill="#b8c4cc" ${O} stroke-width="2"/>${eye(25, 32)}${eye(39, 32)}<path d="M24 44 H40" ${O}/>`,
    ghost: `<path d="M14 58 V28 C14 10 50 10 50 28 V58 L44 52 L38 58 L32 52 L26 58 L20 52 Z" fill="#f4f6ff" ${O}/><ellipse cx="25" cy="30" rx="3.5" ry="5" fill="#0d2228"/><ellipse cx="39" cy="30" rx="3.5" ry="5" fill="#0d2228"/><path d="M28 40 Q32 44 36 40" fill="none" ${O} stroke-width="2.5"/>`,
    owl: `<ellipse cx="32" cy="36" rx="20" ry="22" fill="#a0703a" ${O}/><path d="M14 18 L20 24 M50 18 L44 24" ${O} stroke-width="4"/><circle cx="24" cy="30" r="8" fill="#ffd23f" ${O}/><circle cx="40" cy="30" r="8" fill="#ffd23f" ${O}/>${eye(24, 30)}${eye(40, 30)}<path d="M29 38 L35 38 L32 44 Z" fill="#ff8a1a" ${O} stroke-width="2"/>`,
    spider: `<path d="M20 30 L6 20 M20 36 L4 36 M22 42 L8 52 M44 30 L58 20 M44 36 L60 36 M42 42 L56 52" ${O}/><circle cx="32" cy="36" r="14" fill="#3a2e55" ${O}/><circle cx="27" cy="33" r="3" fill="#fff"/><circle cx="37" cy="33" r="3" fill="#fff"/>${eye(27, 33)}${eye(37, 33)}<path d="M28 41 Q32 44 36 41" fill="none" stroke="#fff" stroke-width="2"/>`,
    mummy: `<rect x="16" y="10" width="32" height="46" rx="14" fill="#efe6cf" ${O}/><path d="M16 22 L48 26 M16 34 L48 30 M16 44 L48 46" stroke="#b8a888" stroke-width="3"/><rect x="20" y="26" width="24" height="8" rx="3" fill="#2a2440"/><circle cx="27" cy="30" r="2.4" fill="#ffd23f"/><circle cx="37" cy="30" r="2.4" fill="#ffd23f"/>`,
  }[id] || '';
  return `<svg viewBox="0 0 64 64" class="cr-ic" aria-hidden="true">${b}</svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const A = (HW ? SPOOKY : PLAIN).slice(0, init.animals), n = A.length;
  // the ride: animals spread over a half circle (front row lower, so it reads as a round platform)
  const spot = i => { const a = Math.PI * (0.1 + 0.8 * (i / Math.max(1, n - 1))); return { x: 50 - Math.cos(a) * 42, y: 28 + Math.sin(a) * 22 }; };
  ui.innerHTML = `
    <div class="cr-top"><span class="cr-title">${HW ? 'Creepy Carousel' : 'Carousel Recall'}</span><span class="clock"><b>--</b></span></div>
    <div class="cr-ride">
      <div class="cr-canopy"></div>
      <div class="cr-deck"></div>
      ${A.map((a, i) => { const p = spot(i); return `<div class="cr-horse" data-i="${i}" style="left:${p.x}%;top:${p.y}%;--c:${a.c};--d:${(i * 0.37).toFixed(2)}s"><i class="cr-pole"></i>${animalSvg(a.id)}</div>`; }).join('')}
      <div class="cr-call"></div>
    </div>
    <div class="cr-board">${players.map(p => chip(p, '<em class="sc">0</em><strong class="st"></strong>')).join('')}</div>
    <div class="cr-strip"></div>
    <div class="cr-pad cols-${n === 8 ? 4 : 3}">${A.map((a, i) => `<button class="cr-btn" data-i="${i}" style="--c:${a.c}">${animalSvg(a.id)}<b>${esc(a.name)}</b></button>`).join('')}</div>
    <p class="cr-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.cr-board [data-pid="${me}"]`)?.classList.add('me');
  const tunes = createTunes({ volume: 0.22 });
  const horses = [...ui.querySelectorAll('.cr-horse')], btns = [...ui.querySelectorAll('.cr-btn')];
  let gs = null, phase = '', round = -1, litK = -2, myProg = 0, myOut = false, myDone = false, sayT = 0;
  const ring = i => tunes.fx('ding', NOTE[i] || 1);
  const flash = (el, cls = 'lit', ms = 380) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove(cls), ms); };
  function call(text, cls = '') { const c = $('.cr-call'); c.textContent = text; c.className = 'cr-call show ' + cls; sayT = performance.now(); }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.cr-btn'); if (!b || watching || phase !== 'go' || myOut || myDone) return;
    e.preventDefault();
    const i = +b.dataset.i; ctx.send('tap', { r: round, i }); ring(i); flash(b, 'tap', 220); flash(horses[i], 'lit', 300);
  });
  const onKey = e => { if (watching || e.repeat) return; const k = +e.key; if (k >= 1 && k <= n) btns[k - 1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); };
  addEventListener('keydown', onKey);
  const nameOf = pid => pid === me ? 'You' : players.find(p => p.pid === pid)?.name || '?';
  function strip(g) {
    const s = $('.cr-strip');
    if (!g.tune) { s.innerHTML = g.phase === 'go' && !watching ? `<span class="cr-progress">${myDone ? 'Got it!' : myOut ? 'Out this round' : `Tap ${myProg + 1} of ${g.len}`}</span>` : g.phase === 'show' ? `<span class="cr-progress">Watch… ${Math.max(0, g.k + 1)} of ${g.len}</span>` : ''; return; }
    s.innerHTML = `<div class="cr-tune">${g.tune.map(i => `<i style="--c:${A[i].c}">${animalSvg(A[i].id)}</i>`).join('')}</div>`;
  }
  function paint(g) {
    for (const p of players) {
      const c = ui.querySelector(`.cr-board [data-pid="${p.pid}"]`); if (!c) continue;
      c.querySelector('.sc').textContent = g.sc[p.pid];
      const st = c.querySelector('.st'), out = g.out.includes(p.pid), done = g.done.includes(p.pid);
      st.textContent = g.phase === 'end' ? `best ${g.best[p.pid]}` : done ? '✓' : out ? '✗' : g.phase === 'go' ? `${g.prog[p.pid]}/${g.len}` : '';
      c.classList.toggle('out', out && g.phase !== 'end'); c.classList.toggle('done', done && g.phase !== 'end');
    }
    const bestSc = Math.max(0, ...Object.values(g.sc)); for (const p of players) ui.querySelector(`.cr-board [data-pid="${p.pid}"]`)?.classList.toggle('lead', g.sc[p.pid] === bestSc && bestSc > 0);
  }
  function note(g) {
    if (g.phase === 'ready') return watching ? 'Roll up for the carousel!' : 'Watch the animals light up, then tap them back in order.';
    if (g.phase === 'show') return `Round ${g.round + 1}: ${g.len} animals. Watch closely!`;
    if (g.phase === 'go') return watching ? 'Everyone taps the tune back…' : myOut ? 'Oops! You sit out this round.' : myDone ? 'You got it! Wait for the others.' : 'Your turn: tap them in the same order!';
    if (g.phase === 'tally') return 'That was the tune. One more animal next round!';
    if (g.phase === 'end') {
      if (init.solo && me != null) { const s = g.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      return 'The ride is over!';
    }
    return '';
  }
  return {
    state(g) {
      const changed = g.phase !== phase || g.round !== round;
      if (changed) {
        if (g.phase === 'show' && g.round !== round) { myProg = 0; myOut = false; myDone = false; litK = -2; if (round < 0) tunes.start(HW ? 'spooky' : 'boogie'); tunes.mute(true); }
        if (g.phase === 'go') { call(watching ? 'Tap it back!' : 'Your turn!', 'go'); ctx.sfx('pick'); }
        if (g.phase === 'tally') tunes.mute(false);
        if (g.phase === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      phase = g.phase; round = g.round; ui.dataset.phase = g.phase; gs = g;
      if (me != null) { myProg = g.prog[me] ?? myProg; myOut = g.out.includes(me); myDone = g.done.includes(me); }
      if (g.phase === 'show' && g.lit >= 0 && g.k !== litK) { litK = g.k; flash(horses[g.lit], 'lit', Math.round(init.on * 1000) - 40); flash(btns[g.lit], 'lit', Math.round(init.on * 1000) - 40); ring(g.lit); }
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'go' && g.left <= 3);
      ui.classList.toggle('can-tap', g.phase === 'go' && !watching && !myOut && !myDone);
      paint(g); strip(g); $('.cr-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e === 'slip') { if (ev.pid === me) { call('Oops!', 'bad'); ctx.sfx('bad'); flash(btns[ev.want], 'want', 900); ui.classList.add('shake'); setTimeout(() => ui.classList.remove('shake'), 400); } }
      else if (ev.e === 'done') { if (ev.pid === me) { call(ev.first ? 'First! +3' : 'Got it! +2', 'good'); ctx.sfx('good'); } else if (watching) ctx.sfx('good'); }
      else if (ev.e === 'tally') { if (watching || me == null) return; }
    },
    frame() { if (sayT && performance.now() - sayT > 1100) { $('.cr-call').classList.remove('show'); sayT = 0; } void gs; },
    dispose() { removeEventListener('keydown', onKey); tunes.dispose(); },
  };
}
