// PATTERN IMPOSTOR on a screen: a grid of picture tiles (SVG shapes in a colour, a size, a pattern and a count).
// Phones tap the tile they think breaks the rule; a wrong tap shakes red and locks that phone out for the round. The
// reveal lights up the impostor, says the rule in words, and puts each player's face on the tile they tapped, with
// the order of the right taps. A watch-only screen shows the same grid at TV size, not tappable.
import { esc, chip } from '../../client/gamehud.js';

const HEX = ['#e8383d', '#ff9a1f', '#2fb84f', '#2f7ff0', '#9b4fe0'];
const INK = '#0d2228';
const poly = (x, y, n, r, rot = -90, inner = 0, dy = 0) => `<polygon points="${Array.from({ length: inner ? n * 2 : n }, (_, i) => {
  const a = (rot + i * 360 / (inner ? n * 2 : n)) * Math.PI / 180, rr = inner && i % 2 ? inner * r : r;
  return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + dy * r + Math.sin(a) * rr).toFixed(1)}`;
}).join(' ')}"/>`;
/** Each shape at (x, y) with radius r, in real coordinates (so the stripe and dot patterns keep one size everywhere). */
const SHAPES = [
  (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`,
  (x, y, r) => `<rect x="${(x - r * .86).toFixed(1)}" y="${(y - r * .86).toFixed(1)}" width="${(r * 1.72).toFixed(1)}" height="${(r * 1.72).toFixed(1)}" rx="${(r * .12).toFixed(1)}"/>`,
  (x, y, r) => poly(x, y, 3, r * 1.12, -90, 0, .18),
  (x, y, r) => poly(x, y, 5, r * 1.12, -90, .45, .06),
  (x, y, r) => poly(x, y, 6, r, 0),
  (x, y, r) => poly(x, y, 4, r * 1.12, -90),
];
const SPOTS = [[[50, 50]], [[28, 50], [72, 50]], [[50, 29], [28, 70], [72, 70]]];
const RADIUS = [34, 21, 19];

/** One tile's picture. `id` makes the pattern ids unique to this game. */
export function tileSvg(code, id = 'pi') {
  const [s, c, z, f, n] = [...code].map(Number);
  const r = RADIUS[n] * (z ? 1 : 0.56), fill = f === 0 ? HEX[c] : `url(#${id}-${f}-${c})`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="${fill}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round">${SPOTS[n].map(([x, y]) => SHAPES[s](x, y, r)).join('')}</g></svg>`;
}
/** The stripe and dot fills, once per page, for every colour. */
export function patternDefs(id = 'pi') {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${HEX.map((h, c) => `
    <pattern id="${id}-1-${c}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${h}"/><rect width="2.6" height="7" fill="#fff"/></pattern>
    <pattern id="${id}-2-${c}" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${h}"/><circle cx="3.5" cy="3.5" r="1.6" fill="#fff"/></pattern>`).join('')}</defs></svg>`;
}
const ORD = ['1st', '2nd', '3rd', '4th'];

export function createView(ctx) {
  const { ui, players, me, init } = ctx;
  const byPid = new Map(players.map(p => [p.pid, p])), watching = me == null;
  ui.innerHTML = `${patternDefs()}
    <div class="pi-top"><span class="pi-title">Pattern Impostor</span><span class="clock"><b>--</b></span></div>
    <p class="pi-round"></p>
    <div class="pi-grid"></div>
    <div class="pi-rule"><b></b> <span></span></div>
    <div class="pi-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="pi-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.pi-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, items = '', tiles = [], mine = null, ok = null, gain = null, last = { phase: 'ready', in: [] };
  const face = p => `<i class="pi-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;

  function build(list) {
    items = list; const codes = list.split(',');
    const g = $('.pi-grid'); g.dataset.n = codes.length;
    g.innerHTML = codes.map((c, i) => `<button class="pi-tile" data-i="${i}" style="--d:${i * 45}ms" aria-label="picture ${i + 1}">${tileSvg(c)}<span class="pi-who"></span><i class="pi-badge"></i></button>`).join('');
    tiles = [...g.querySelectorAll('.pi-tile')];
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('.pi-tile'); if (!b || watching || phase !== 'play' || mine != null) return;
    mine = +b.dataset.i; ctx.send('tap', mine); ctx.sfx('tap'); paintMine();
  });
  function paintMine() {
    tiles.forEach((t, i) => { t.classList.toggle('mine', i === mine); t.classList.toggle('bad', i === mine && ok === false); t.classList.toggle('good', i === mine && ok === true); });
    ui.classList.toggle('locked', mine != null);
  }
  function note(g) {
    if (g.phase === 'ready') return 'Get ready: one picture breaks the rule…';
    if (g.phase === 'end') return 'Thanks for playing!';
    if (g.phase === 'reveal') return '';
    if (watching) return `${g.in.length} of ${players.length} have tapped`;
    if (mine == null) return 'Tap the impostor. First right tap scores most!';
    return ok ? `Got it! +${gain}` : ok === false ? 'Wrong one: locked out until the next round.' : 'Tapped!';
  }

  return {
    priv(d) {
      if (phase === 'play' || phase === 'reveal') { mine = d.pick; ok = d.ok; gain = d.gain; paintMine(); }
      if (d.ok === true && phase === 'play') ctx.sfx('good');
      if (d.ok === false && phase === 'play') ctx.sfx('bad');
      $('.pi-note').textContent = note(last);
    },
    state(g) {
      if (g.round !== round) { round = g.round; mine = null; ok = null; gain = null; ui.classList.remove('locked'); }
      if (g.items && g.items !== items) build(g.items);
      if (g.phase !== phase) { if (g.phase === 'reveal') ctx.sfx('pick'); if (g.phase === 'end') ctx.sfx('win'); if (g.phase === 'play') ctx.sfx('tap'); }
      phase = g.phase; ui.dataset.phase = g.phase; last = g;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 3);
      $('.pi-title').textContent = g.phase === 'end' ? 'Final scores' : 'Pattern Impostor';
      $('.pi-round').textContent = g.round < 0 ? `${init.rounds} rounds` : g.phase === 'end' ? '' : `Round ${g.round + 1} of ${init.rounds}${g.round >= 4 ? ': two things go together' : g.round >= 2 ? ': look closer' : ''}`;
      const rv = g.phase === 'reveal';
      $('.pi-rule b').textContent = rv ? g.rule : ''; $('.pi-rule span').textContent = rv ? g.why : '';
      tiles.forEach((t, i) => {
        t.classList.toggle('odd', rv && g.odd === i);
        t.querySelector('.pi-who').innerHTML = rv ? players.filter(p => g.picks[p.pid] === i).map(face).join('') : '';
        t.querySelector('.pi-badge').textContent = rv && g.odd === i ? 'Impostor!' : '';
      });
      for (const p of players) {
        const r = ui.querySelector(`.pi-players [data-pid="${p.pid}"]`); r.querySelector('.sc').textContent = g.scores[p.pid];
        r.classList.toggle('in', g.phase === 'play' && g.in.includes(p.pid));
        const d = r.querySelector('.delta'), k = rv ? g.first.indexOf(p.pid) : -1;
        d.textContent = rv ? (k >= 0 ? `${ORD[k]} +${g.gain[p.pid]}` : g.picks[p.pid] == null ? 'no tap' : 'wrong') : g.phase === 'end' ? `${g.right[p.pid]}/${init.rounds} found` : '';
        d.className = 'delta ' + (rv ? (k >= 0 ? 'good' : 'bad') : '');
      }
      $('.pi-note').textContent = note(g);
    },
    dispose() {},
  };
}
