// COINSTORM on a screen. Three spots (Piggy Bank, Windmill, Storm Cloud) with the round's forecast. A phone that plays
// moves coins out of the bank with - / + on the windmill and the cloud, then locks in; a watch-only screen shows the
// spots big with who has locked in. The reveal puts every player's face and pile on each spot, blows the biggest
// windmill pile away, and shows sunshine or a storm on the cloud, with each player's coins won and running total.
import { esc, chip } from '../../client/gamehud.js';

const INK = '#0d2228';
const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const ART = {
  bank: `<svg viewBox="0 0 80 64" aria-hidden="true"><path d="M18 50 v8 h8 v-6 M50 52 v6 h8 v-8" fill="#f59ab4" ${O}/><ellipse cx="40" cy="36" rx="28" ry="20" fill="#ffb3c8" ${O}/><path d="M22 22 l2 -10 l10 7" fill="#ffb3c8" ${O}/>
    <ellipse cx="68" cy="38" rx="6" ry="7" fill="#f59ab4" ${O}/><circle cx="66" cy="36" r="1.5" fill="${INK}"/><circle cx="70" cy="40" r="1.5" fill="${INK}"/><circle cx="54" cy="30" r="2.6" fill="${INK}"/><path d="M32 18 h14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M12 36 q-8 -2 -6 -8" fill="none" ${O}/></svg>`,
  mill: `<svg viewBox="0 0 80 64" aria-hidden="true"><path d="M30 62 L34 28 H46 L50 62 Z" fill="#e9d2a8" ${O}/><rect x="36" y="46" width="8" height="16" fill="#8a5225" ${O}/>
    <g class="cn-blades" style="transform-origin:40px 26px"><path d="M40 26 L40 2 L48 4 Z M40 26 L64 26 L62 34 Z M40 26 L40 50 L32 48 Z M40 26 L16 26 L18 18 Z" fill="#fff" ${O}/></g><circle cx="40" cy="26" r="4" fill="#ff9a1f" ${O}/></svg>`,
  cloud: `<svg viewBox="0 0 80 64" aria-hidden="true"><g class="cn-sun"><circle cx="58" cy="18" r="11" fill="#ffd23f" ${O}/><path d="M58 0 v4 M76 18 h-4 M71 5 l-3 3 M45 5 l3 3" ${O}/></g>
    <path d="M14 46 Q4 46 6 36 Q8 26 20 28 Q22 14 36 16 Q48 12 52 26 Q66 24 66 36 Q66 46 56 46 Z" fill="#c9d3de" ${O}/><path class="cn-bolt" d="M34 44 L26 58 H34 L30 64 L44 50 H36 L40 44 Z" fill="#ffd23f" ${O}/></svg>`,
};
const NAME = { bank: 'Piggy Bank', mill: 'Windmill', cloud: 'Storm Cloud' };
const SHORT = { bank: 'Keeps them', mill: 'x2, unless biggest pile', cloud: 'x3 in sun, 0 in storm' };
const RULE = { bank: 'Keeps your coins safe.', mill: 'Doubles them, unless yours is the biggest pile here!', cloud: 'Sunshine triples them. A storm loses them all.' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, N = init.coins;
  const watching = me == null, byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="cn-top"><span class="cn-title">Coinstorm</span><span class="clock"><b>--</b></span></div>
    <div class="cn-head"><span class="cn-round"></span><span class="cn-fc"><b class="cn-fcsun"></b><i class="cn-bar"><u></u></i><b class="cn-fcstorm"></b></span><span class="cn-past"></span></div>
    <div class="cn-spots">${['bank', 'mill', 'cloud'].map((k, i) => `
      <section class="cn-spot cn-${k}" data-k="${i}">
        <div class="cn-art">${ART[k]}</div>
        <div class="cn-txt"><b>${NAME[k]}</b><span class="cn-rule">${RULE[k]}</span><span class="cn-short">${SHORT[k]}</span></div>
        <div class="cn-ctl">${i ? `<button class="cn-pm" data-k="${i}" data-d="-1" aria-label="One fewer on the ${NAME[k]}">−</button>` : ''}<strong class="cn-n">0</strong>${i ? `<button class="cn-pm" data-k="${i}" data-d="1" aria-label="One more on the ${NAME[k]}">+</button>` : ''}</div>
        <div class="cn-coins"></div>
        <div class="cn-piles"></div>
        <p class="cn-out"></p>
      </section>`).join('')}</div>
    <div class="cn-actions"><button class="cn-quick" data-q="safe">All in the bank</button><button class="cn-quick" data-q="split">Spread them out</button><button class="cn-lock big-btn">Lock in</button></div>
    <div class="cn-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="cn-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.cn-players [data-pid="${me}"]`)?.classList.add('me');
  const spots = [...ui.querySelectorAll('.cn-spot')];
  let phase = '', round = -1, split = null, locked = false, last = null;
  const coinsHtml = n => Array.from({ length: n }, () => '<i></i>').join('');

  function paintSplit() {
    const s = split || [N, 0, 0];
    spots.forEach((el, k) => {
      el.querySelector('.cn-n').textContent = s[k];
      el.querySelector('.cn-coins').innerHTML = coinsHtml(s[k]);
      el.querySelectorAll('.cn-pm').forEach(b => { b.disabled = locked || (+b.dataset.d < 0 ? s[k] === 0 : s[0] === 0); });
    });
    const l = $('.cn-lock'); l.textContent = locked ? 'Locked! (tap to change)' : 'Lock in'; l.classList.toggle('on', locked);
    ui.classList.toggle('is-locked', locked);
  }
  function setSplit(s) { split = s; if (locked) { locked = false; } ctx.send('set', s); ctx.sfx('coins'); paintSplit(); }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching || phase !== 'pick') return;
    if (t.classList.contains('cn-pm')) {
      const k = +t.dataset.k, d = +t.dataset.d, s = (split || [N, 0, 0]).slice();
      if (d > 0 && s[0] > 0) { s[0]--; s[k]++; } else if (d < 0 && s[k] > 0) { s[k]--; s[0]++; } else return;
      setSplit(s);
    } else if (t.dataset.q) {
      setSplit(t.dataset.q === 'safe' ? [N, 0, 0] : [N - 2 * Math.floor(N / 3), Math.floor(N / 3), Math.floor(N / 3)]);
    } else if (t.classList.contains('cn-lock')) {
      locked = !locked; ctx.send('lock', locked); ctx.sfx(locked ? 'good' : 'tap'); paintSplit();
    }
  });
  const face = p => `<i class="cn-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(r) {
    spots.forEach((el, k) => {
      el.querySelector('.cn-piles').innerHTML = players.map(p => {
        const n = r.alloc[p.pid]?.[k] ?? 0; if (!n) return '';
        const lost = (k === 1 && r.blown.includes(p.pid)) || (k === 2 && !r.sun);
        const won = k === 0 ? n : k === 1 ? (lost ? 0 : n * 2) : (lost ? 0 : n * 3);
        return `<span class="cn-pile${lost ? ' lost' : ''}">${face(p)}<b>${n}</b><em>${lost ? 'lost' : k ? `→ ${won}` : 'kept'}</em></span>`;
      }).join('') + (k === 1 && r.gust != null ? `<span class="cn-pile gust${r.gust === r.top ? ' lost' : ''}"><i class="cn-face cn-gust">G</i><b>${r.gust}</b><em>the Gust</em></span>` : '') || '<em class="cn-empty">no coins</em>';
      const out = el.querySelector('.cn-out');
      out.textContent = k === 0 ? 'Safe!' : k === 1 ? (r.top ? (r.blown.length ? `The biggest pile (${r.top}) blew away!` : 'Doubled! The Gust had the biggest pile.') : 'Nobody tried it.') : r.sun ? 'Sunshine! Tripled!' : 'Storm! All lost!';
      out.className = 'cn-out ' + (k === 2 ? (r.sun ? 'good' : 'bad') : k === 1 && r.top ? 'mixed' : 'good');
    });
    ui.classList.toggle('sun', r.sun); ui.classList.toggle('storm', !r.sun);
  }
  function note(g) {
    if (g.phase === 'ready') return 'Get ready to hide your coins…';
    if (g.phase === 'end') return 'The storm has passed. Most coins wins!';
    if (g.phase === 'reveal') return '';
    if (watching) return `${g.locked.length} of ${players.length} locked in`;
    return locked ? 'Locked in. Waiting for the others…' : 'Move coins with − and +. Whatever is left stays in the Piggy Bank.';
  }

  return {
    priv(d) {
      if (phase === 'pick' && d.split && split == null) { split = d.split; }
      if (phase === 'pick') { locked = d.locked; paintSplit(); }
    },
    state(g) {
      last = g;
      if (g.round !== round && g.phase === 'pick') { round = g.round; split = null; locked = false; ui.classList.remove('sun', 'storm'); spots.forEach(el => { el.querySelector('.cn-piles').innerHTML = ''; el.querySelector('.cn-out').textContent = ''; }); paintSplit(); }
      if (g.phase !== phase) {
        if (g.phase === 'reveal') ctx.sfx(g.reveal.sun ? 'coins' : 'trap');
        if (g.phase === 'end') ctx.sfx('win');
        if (g.phase === 'reveal') paintReveal(g.reveal);
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'pick' && g.left <= 4);
      $('.cn-title').textContent = g.phase === 'end' ? 'Final count' : g.phase === 'reveal' ? 'Reveal!' : 'Coinstorm';
      $('.cn-round').textContent = g.phase === 'end' ? '' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.f != null) { $('.cn-fcsun').textContent = `${g.f}% sun`; $('.cn-fcstorm').textContent = `${100 - g.f}% storm`; $('.cn-bar u').style.width = g.f + '%'; }
      $('.cn-past').innerHTML = [...g.past].map(c => `<i class="${c === '1' ? 'sunny' : 'stormy'}" title="${c === '1' ? 'sunshine' : 'storm'}">${c === '1' ? 'Sun' : 'Storm'}</i>`).join('');
      for (const p of players) {
        const r = ui.querySelector(`.cn-players [data-pid="${p.pid}"]`); r.querySelector('.sc').textContent = g.scores[p.pid];
        r.classList.toggle('in', g.phase === 'pick' && g.locked.includes(p.pid));
        const d = r.querySelector('.delta');
        d.textContent = g.phase === 'reveal' ? `+${g.reveal.gain[p.pid]}` : g.phase === 'pick' ? (g.locked.includes(p.pid) ? 'locked' : 'hiding…') : '';
        d.className = 'delta ' + (g.phase === 'reveal' ? (g.reveal.gain[p.pid] > init.coins ? 'good' : g.reveal.gain[p.pid] < init.coins ? 'bad' : '') : '');
      }
      $('.cn-note').textContent = note(g);
    },
    dispose() {},
  };
}
