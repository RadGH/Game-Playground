// CIRCUIT SCRAMBLE on a screen: the shared board of wire tiles. Your tiles carry your seat colour and shape and turn
// when tapped; the others' are tinted with theirs. Wires that carry power glow yellow; a bulb lights when reached.
import { esc, chip } from '../../client/gamehud.js';

const ARM = { 1: 'M50 50 V-2', 2: 'M50 50 H102', 4: 'M50 50 V102', 8: 'M50 50 H-2' };
const SHAPE = { circle: '<circle cx="0" cy="0" r="7"/>', square: '<rect x="-6.5" y="-6.5" width="13" height="13" rx="2"/>', diamond: '<path d="M0 -8 L8 0 L0 8 L-8 0 Z"/>', triangle: '<path d="M0 -8 L8 6 H-8 Z"/>' };
const wires = m => [1, 2, 4, 8].filter(b => m & b).map(b => ARM[b]).join(' ');

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const bySeat = new Map(players.map(p => [p.seat, p])), mySeat = players.find(p => p.pid === me)?.seat ?? null;
  ui.innerHTML = `
    <div class="cs-top"><span class="cs-title">Circuit Scramble</span><span class="clock"><b>--</b></span></div>
    <div class="cs-goal"><b class="cs-stage"></b><span class="cs-pips"></span></div>
    <div class="cs-boardwrap"><div class="cs-board"></div><div class="cs-banner">Powered up!</div></div>
    <div class="cs-players">${players.map(p => chip(p, `<i class="cs-mark" style="--seat:${p.color}"><svg viewBox="-10 -10 20 20">${SHAPE[p.shape] || SHAPE.circle}</svg></i>`)).join('')}</div>
    <p class="cs-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.cs-players [data-pid="${me}"]`)?.classList.add('me');
  let stage = -1, cells = [], spin = [], srv = [], pend = [], phase = '';
  function build(g) {
    stage = g.stage; spin = [...g.r].map(Number); srv = spin.slice(); pend = spin.map(() => 0);
    const b = $('.cs-board'); b.style.setProperty('--w', g.w); b.style.setProperty('--h', g.h);
    b.innerHTML = [...g.t].map((hx, i) => {
      const m = parseInt(hx, 16), o = g.o[i], fixed = o === '-', p = fixed ? null : bySeat.get(+o);
      const kind = i === g.src ? 'src' : g.bulbs.includes(i) ? 'bulb' : 'wire';
      const icon = kind === 'src' ? '<g class="bat"><rect x="30" y="28" width="40" height="46" rx="6"/><rect x="42" y="20" width="16" height="9" rx="2"/><path d="M53 34 L41 52 H50 L46 68 L60 47 H51 Z" class="bolt"/></g>'
        : kind === 'bulb' ? '<g class="bulb"><circle cx="50" cy="44" r="20"/><rect x="40" y="62" width="20" height="14" rx="3"/><path d="M43 46 Q50 34 57 46" class="fil"/></g>' : '<circle cx="50" cy="50" r="9" class="knob"/>';
      return `<button class="cs-t ${kind}${p && p.seat === mySeat ? ' mine' : ''}${fixed ? ' fixed' : ''}" data-i="${i}" ${p ? `style="--seat:${p.color};--seat-dark:${p.dark}"` : ''} aria-label="${kind === 'src' ? 'battery' : kind === 'bulb' ? 'bulb' : p ? esc(p.name) + "'s tile" : 'tile'}">
        <svg viewBox="0 0 100 100"><g class="w" style="transform:rotate(${spin[i] * 90}deg)"><path d="${wires(m)}" class="under"/><path d="${wires(m)}" class="over"/></g>${icon}
        ${p ? `<g class="own" transform="translate(86 14)">${SHAPE[p.shape] || SHAPE.circle}</g>` : ''}</svg></button>`;
    }).join('');
    cells = [...b.querySelectorAll('.cs-t')];
    $('.cs-pips').innerHTML = Array.from({ length: init.stages }, (_, i) => `<i class="${i < g.cleared ? 'done' : ''}${i === init.target - 1 ? ' goal' : ''}"></i>`).join('');
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('.cs-t'); if (!t || watching || phase !== 'play' || !t.classList.contains('mine')) return;
    const i = +t.dataset.i; ctx.send('rot', i); ctx.sfx('tap');
    spin[i]++; pend[i]++; t.querySelector('.w').style.transform = `rotate(${spin[i] * 90}deg)`;   // turn at once; the server agrees a moment later
  });
  return {
    state(g) {
      if (g.stage !== stage) build(g);
      if (g.phase !== phase && g.phase === 'clear') ctx.sfx('win');
      phase = g.phase; ui.dataset.phase = g.phase;
      for (let i = 0; i < cells.length; i++) {
        const r = +g.r[i], acked = (r - srv[i] + 4) & 3; srv[i] = r; pend[i] = Math.max(0, pend[i] - acked);
        const want = (r + pend[i]) & 3;                                     // the server's turn plus taps it has not seen yet
        if ((spin[i] & 3) !== want) { spin[i] += (want - (spin[i] & 3) + 4) & 3; cells[i].querySelector('.w').style.transform = `rotate(${spin[i] * 90}deg)`; }
        cells[i].classList.toggle('on', g.p[i] === '1');
      }
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      $('.cs-stage').textContent = `Board ${g.stage + 1}  ·  cleared ${g.cleared} (goal ${g.target})`;
      ui.querySelectorAll('.cs-pips i').forEach((p, i) => p.classList.toggle('done', i < g.cleared));
      const mineCount = cells.filter(c => c.classList.contains('mine')).length;
      $('.cs-note').textContent = g.phase === 'clear' ? (g.cleared >= g.target ? 'Goal reached! Keep going for more.' : `Nice! ${g.target - g.cleared} more to reach the goal.`)
        : watching ? 'Tap tiles on your phones to join the wires from the battery to every bulb.'
        : mineCount ? `Tap your tiles (marked with your colour and shape) to turn them.` : 'None of this board is yours: shout tips to your team!';
    },
    dispose() {},
  };
}
