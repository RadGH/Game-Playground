// MEMORY HEIST on a screen: the open vault (a grid of treasures drawn as small SVG pictures), then each question with
// big answer buttons; after each one the right answer lights up with the faces of everyone who picked each answer.
// A watch-only screen shows the same thing without being tappable.
import { esc, chip } from '../../client/gamehud.js';

const O = 'stroke="#0d2228" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
/** One treasure as an inline SVG in colour `c` (64 x 64 box). */
export function treasureSvg(id, c) {
  const body = {
    crown: `<path d="M10 46 L8 20 L22 32 L32 14 L42 32 L56 20 L54 46 Z" fill="${c}" ${O}/><rect x="10" y="46" width="44" height="8" rx="2" fill="${c}" ${O}/><circle cx="8" cy="18" r="4" fill="#fff" ${O}/><circle cx="32" cy="12" r="4" fill="#fff" ${O}/><circle cx="56" cy="18" r="4" fill="#fff" ${O}/>`,
    ring: `<circle cx="32" cy="38" r="17" fill="none" stroke="#0d2228" stroke-width="12"/><circle cx="32" cy="38" r="17" fill="none" stroke="${c}" stroke-width="6"/><path d="M24 14 L32 6 L40 14 L32 24 Z" fill="#fff" ${O}/>`,
    vase: `<path d="M24 8 H40 V14 C40 18 50 24 50 38 C50 50 42 58 32 58 C22 58 14 50 14 38 C14 24 24 18 24 14 Z" fill="${c}" ${O}/><path d="M18 36 H46" stroke="#fff" stroke-width="4" opacity=".7"/>`,
    goblet: `<path d="M14 8 H50 C50 26 42 34 32 34 C22 34 14 26 14 8 Z" fill="${c}" ${O}/><path d="M29 34 H35 V48 H29 Z" fill="${c}" ${O}/><path d="M18 56 C18 50 46 50 46 56 Z" fill="${c}" ${O}/>`,
    key: `<circle cx="18" cy="32" r="11" fill="${c}" ${O}/><circle cx="18" cy="32" r="4" fill="#173a5c" ${O}/><path d="M29 28 H58 V36 H52 V44 H46 V36 H29 Z" fill="${c}" ${O}/>`,
    gem: `<path d="M18 10 H46 L58 26 L32 58 L6 26 Z" fill="${c}" ${O}/><path d="M6 26 H58 M18 10 L26 26 L32 58 L38 26 L46 10" fill="none" ${O} stroke-width="2"/>`,
    coin: `<ellipse cx="32" cy="44" rx="22" ry="9" fill="${c}" ${O}/><ellipse cx="32" cy="36" rx="22" ry="9" fill="${c}" ${O}/><circle cx="32" cy="24" r="17" fill="${c}" ${O}/><path d="M32 13 L35 21 L43 21 L37 26 L39 34 L32 29 L25 34 L27 26 L21 21 L29 21 Z" fill="#fff" opacity=".85"/>`,
    lamp: `<path d="M27 16 C27 8 37 8 37 16 C37 20 32 24 32 24 C32 24 27 20 27 16 Z" fill="#ff9a1f" ${O} stroke-width="2"/><path d="M8 40 C8 30 20 26 32 26 C44 26 50 30 52 34 L60 28 L56 42 C52 48 44 50 32 50 C18 50 8 48 8 40 Z" fill="${c}" ${O}/><rect x="22" y="50" width="20" height="6" rx="2" fill="${c}" ${O}/>`,
    scroll: `<rect x="14" y="14" width="36" height="36" fill="#fff3d6" ${O}/><rect x="10" y="8" width="44" height="10" rx="5" fill="${c}" ${O}/><rect x="10" y="46" width="44" height="10" rx="5" fill="${c}" ${O}/><path d="M20 26 H44 M20 32 H40 M20 38 H44" stroke="#8a7a5a" stroke-width="2.5"/>`,
    mask: `<path d="M4 24 C14 18 24 20 32 26 C40 20 50 18 60 24 C60 40 50 46 42 46 C36 46 34 40 32 38 C30 40 28 46 22 46 C14 46 4 40 4 24 Z" fill="${c}" ${O}/><ellipse cx="20" cy="31" rx="7" ry="4.5" fill="#173a5c" ${O} stroke-width="2"/><ellipse cx="44" cy="31" rx="7" ry="4.5" fill="#173a5c" ${O} stroke-width="2"/>`,
    bell: `<path d="M32 6 C30 6 29 8 29 10 C18 12 14 22 14 34 C14 42 10 46 8 48 H56 C54 46 50 42 50 34 C50 22 46 12 35 10 C35 8 34 6 32 6 Z" fill="${c}" ${O}/><circle cx="32" cy="54" r="5" fill="#fff" ${O}/>`,
    medal: `<path d="M18 4 H30 L34 26 H22 Z" fill="#2f7ff0" ${O} stroke-width="2"/><path d="M46 4 H34 L30 26 H42 Z" fill="#e8383d" ${O} stroke-width="2"/><circle cx="32" cy="42" r="17" fill="${c}" ${O}/><path d="M32 30 L35.5 38 L44 38.5 L37.5 44 L39.5 52 L32 47.5 L24.5 52 L26.5 44 L20 38.5 L28.5 38 Z" fill="#fff" ${O} stroke-width="2"/>`,
  }[id] || '';
  return `<svg viewBox="0 0 64 64" class="mh-ic" aria-hidden="true">${body}</svg>`;
}
const NEUTRAL = '#efe6cf';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, T = init.treasures, C = init.colours;
  const byPid = new Map(players.map(p => [p.pid, p])), watching = me == null;
  ui.innerHTML = `
    <div class="mh-top"><span class="mh-title">Memory Heist</span><span class="clock"><b>--</b></span></div>
    <div class="mh-stage">
      <div class="mh-vault" style="--ar:${(init.w / init.h).toFixed(3)}"><div class="mh-door"><i></i><b>VAULT</b></div><div class="mh-grid" style="--w:${init.w};--h:${init.h}"></div></div>
      <div class="mh-quiz"><p class="mh-qn"></p><p class="mh-q"></p><div class="mh-opts"></div></div>
    </div>
    <div class="mh-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="mh-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'study';
  if (me != null) ui.querySelector(`.mh-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', qi = -1, mine = null, gridFor = null;
  const face = p => `<i class="vface" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function drawVault(v) {
    const key = JSON.stringify(v); if (gridFor === key) return; gridFor = key;
    $('.mh-grid').innerHTML = v.map(([k, c], i) => `<div class="mh-cell" data-i="${i}" style="--d:${i * 40}ms" title="${esc(C[c].name + ' ' + T[k].name)}">${treasureSvg(T[k].id, C[c].hex)}<span>${esc(T[k].name)}</span></div>`).join('');
  }
  function drawQuestion(q) {
    $('.mh-qn').textContent = `Question ${qi + 1} of ${init.questions}`;
    $('.mh-q').textContent = q.text;
    $('.mh-opts').innerHTML = q.opts.map((o, i) => `<button class="mh-opt" data-i="${i}">${o.k != null ? treasureSvg(T[o.k].id, NEUTRAL) : o.c != null ? `<i class="sw" style="background:${C[o.c].hex}"></i>` : `<i class="num">${esc(o.t)}</i>`}<b>${o.n != null ? '' : esc(o.t)}</b><u class="who"></u></button>`).join('');
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('.mh-opt'); if (!b || watching || phase !== 'q' || mine != null) return;
    mine = +b.dataset.i; ctx.send('ans', mine); ctx.sfx('tap'); paintMine();
  });
  const paintMine = () => ui.querySelectorAll('.mh-opt').forEach((b, i) => b.classList.toggle('mine', i === mine));

  return {
    priv(d) { if (d.pick != null || phase !== 'q') { mine = d.pick; paintMine(); } },
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'ans' && me != null) ctx.sfx(g.gain[me] ? 'good' : 'bad');
        if (g.phase === 'q' && phase === 'study') ctx.sfx('trap');
        if (g.phase === 'end') ctx.sfx('win');
      }
      if (g.qi != null && g.qi !== qi) { qi = g.qi; mine = null; drawQuestion(g.q); }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.vault) drawVault(g.vault);
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'q' && g.left <= 3);
      $('.mh-title').textContent = g.phase === 'study' ? 'Remember everything!' : g.phase === 'end' ? 'What was in the vault' : 'Memory Heist';
      for (const p of players) {
        const r = ui.querySelector(`.mh-players [data-pid="${p.pid}"]`); r.querySelector('.sc').textContent = g.scores[p.pid];
        r.classList.toggle('in', g.phase === 'q' && g.in.includes(p.pid));
        const d = r.querySelector('.delta');
        d.textContent = g.phase === 'ans' ? (g.gain[p.pid] ? `+${g.gain[p.pid]}` : g.picks[p.pid] == null ? 'no answer' : 'miss') : g.phase === 'end' ? `${g.tally[p.pid]}/${init.questions} right` : '';
        d.className = 'delta ' + (g.phase === 'ans' ? (g.gain[p.pid] ? 'good' : 'bad') : '');
      }
      ui.querySelectorAll('.mh-opt').forEach((b, i) => {
        b.classList.toggle('right', g.phase === 'ans' && g.a === i);
        b.classList.toggle('wrong', g.phase === 'ans' && g.a !== i && mine === i);
        b.querySelector('.who').innerHTML = g.phase === 'ans' ? players.filter(p => g.picks[p.pid] === i).map(face).join('') : '';
      });
      $('.mh-note').textContent = g.phase === 'study' ? 'The door shuts in a moment. Look closely!' : g.phase === 'q' ? (watching ? `${g.in.length} of ${players.length} answered` : mine == null ? 'Tap your answer. Faster = more points!' : 'Locked in!') : g.phase === 'ans' ? `Answer: ${g.q.opts[g.a].t}` : 'Thanks for the heist!';
    },
    dispose() {},
  };
}
