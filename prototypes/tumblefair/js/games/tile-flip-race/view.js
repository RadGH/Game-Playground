// TILE FLIP RACE on a screen: the 7x7 board as big square buttons. Each tile shows its worth (a dot = 1, a star = 2,
// a gem = 3) and, once owned, the owner's colour AND shape (circle / square / triangle / diamond; the CPU is a brown
// hexagon), so colour is never the only cue. On a phone that plays, the tiles you may pick glow; tap one and it is
// marked with a dashed ring in your colour until the flip. A bar under the board runs down to each flip (it is timed
// here from the moment a flip arrives — the server does not send a countdown 20 times a second). Flipped tiles turn
// over; bounced ones shake with "BOUNCE!".
import { SEATS } from '../../shared/protocol.js';
import { chip, esc } from '../../client/gamehud.js';
import { neighbours } from './sim.js';

const GLYPH = { 1: '<i class="tf-dot"></i>', 2: '<b class="tf-star">★</b>', 3: '<b class="tf-gem">◆</b>' };
const SHAPE_SVG = {
  circle: '<circle cx="8" cy="8" r="6"/>', square: '<rect x="2" y="2" width="12" height="12" rx="2"/>', triangle: '<path d="M8 1.5 L15 14 H1 Z"/>',
  diamond: '<path d="M8 1 L15 8 L8 15 L1 8 Z"/>', hex: '<path d="M4 1.5 H12 L15.5 8 L12 14.5 H4 L0.5 8 Z"/>',
};

export function createView(ctx) {
  const { ui, players, me, init } = ctx, N = init.w * init.h, watching = me == null;
  // every owner on the board: the players plus, alone, the CPU
  const who = init.who.map(w => {
    if (w.cpu) return { pid: w.pid, name: w.name, color: '#b07a3a', dark: '#6b4518', shape: 'hex', portrait: '', cpu: true, home: w.home };
    const p = players.find(q => q.pid === w.pid) || { pid: w.pid, name: '?', color: SEATS[w.seat].color, dark: SEATS[w.seat].dark, shape: SEATS[w.seat].shape };
    return { ...p, home: w.home };
  });
  const mineK = who.findIndex(w => w.pid === me);
  ui.innerHTML = `
    <div class="tf-top"><span class="tf-title">Tile Flip Race</span><span class="clock"><b>--</b></span></div>
    <div class="tf-chips">${who.map(w => w.cpu ? `<span class="chip tf-cpu" data-pid="cpu" data-shape="hex" style="--seat:${w.color};--seat-dark:${w.dark}"><i class="face">CPU</i><b class="nm">${esc(w.name)}</b><em class="sc">1</em><small class="bn"></small></span>` : chip(w, '<em class="sc">1</em><small class="bn"></small>')).join('')}</div>
    <div class="tf-board" style="--w:${init.w}">${init.values.map((v, i) => `<button class="tf-tile${v < 0 ? ' rock' : ''}" data-i="${i}" ${v < 0 ? 'disabled aria-label="rock"' : `aria-label="tile worth ${v}"`}>${v < 0 ? '<span class="tf-rock"></span>' : GLYPH[v]}<svg class="tf-own" viewBox="0 0 16 16"></svg><u class="tf-bump"></u></button>`).join('')}</div>
    <div class="tf-timer"><i></i><span>next flip</span></div>
    <div class="tf-legend"><span><i class="tf-dot"></i> 1</span><span><b class="tf-star">★</b> 2</span><span><b class="tf-gem">◆</b> 3</span><span><i class="tf-home"></i> home, safe</span><span>+ biggest patch</span></div>
    <p class="tf-note"></p>`;
  const $ = s => ui.querySelector(s);
  const tiles = [...ui.querySelectorAll('.tf-tile')];
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.tf-chips [data-pid="${me}"]`)?.classList.add('me');
  for (const w of who) { const t = tiles[w.home]; t.classList.add('home'); }

  let owner = new Array(N).fill(-1), phase = '', pick = null, flipAt = performance.now(), flipN = -1, lastShown = -1;
  function paintOwners() {
    tiles.forEach((t, i) => {
      const k = owner[i], w = who[k];
      t.classList.toggle('owned', k >= 0); t.classList.toggle('mine', k >= 0 && k === mineK);
      if (w) { t.style.setProperty('--c', w.color); t.style.setProperty('--d', w.dark); t.querySelector('.tf-own').innerHTML = SHAPE_SVG[w.shape] || SHAPE_SVG.circle; t.dataset.who = w.cpu ? 'CPU' : w.name; }
      else { t.style.removeProperty('--c'); t.querySelector('.tf-own').innerHTML = ''; delete t.dataset.who; }
    });
    paintCan();
  }
  /** The tiles you may pick now: next to your land, not yours, not a home corner, not a rock. */
  function paintCan() {
    const homes = who.map(w => w.home);
    tiles.forEach((t, i) => {
      const can = !watching && phase === 'play' && mineK >= 0 && init.values[i] > 0 && owner[i] !== mineK && !homes.includes(i) && neighbours(i).some(j => owner[j] === mineK);
      t.classList.toggle('can', can); t.classList.toggle('picked', pick === i);
    });
    if (me != null) { const w = who[mineK]; ui.style.setProperty('--me', w?.color || '#fff'); }
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('.tf-tile'); if (!t || watching || phase !== 'play') return;
    const i = +t.dataset.i;
    if (pick === i) { pick = null; ctx.send('pick', -1); ctx.sfx('tap'); paintCan(); return; }
    if (!t.classList.contains('can')) { ctx.sfx('bad'); t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); return; }
    pick = i; ctx.send('pick', i); ctx.sfx('pick'); paintCan();
  });
  function showFlip(L) {
    for (const [i, k, from] of L.flips) { const t = tiles[i]; t.classList.remove('flip', 'stolen'); void t.offsetWidth; t.classList.add('flip'); if (from >= 0) t.classList.add('stolen'); }
    for (const i of L.bounced) { const t = tiles[i], b = t.querySelector('.tf-bump'); b.textContent = 'BOUNCE!'; t.classList.remove('bounce'); void t.offsetWidth; t.classList.add('bounce'); }
    const mine = L.flips.find(f => f[1] === mineK), lost = L.flips.filter(f => f[2] === mineK && mineK >= 0).length;
    if (L.bounced.includes(pick)) ctx.sfx('bad'); else if (mine) ctx.sfx(init.values[mine[0]] > 1 ? 'coins' : 'good'); else if (lost) ctx.sfx('trap'); else ctx.sfx('tap');
  }
  function note(g) {
    if (g.phase === 'ready') return watching ? 'Every 2 seconds, everyone grabs a tile at once…' : 'Get ready: tap a glowing tile next to your corner!';
    if (g.phase === 'end') {
      if (init.solo && me != null) { const a = g.scores[me], b = g.scores.cpu; return a > b ? `You beat ${who[who.length - 1].name}, ${a} to ${b}!` : a === b ? `A draw with ${who[who.length - 1].name}!` : `${who[who.length - 1].name} wins, ${b} to ${a}.`; }
      return 'Board locked! Biggest land wins.';
    }
    if (watching) return `${g.in.length} of ${players.length} have picked`;
    return pick == null ? 'Tap a glowing tile. Same tile as a rival = you both bounce!' : 'Picked! Tap it again to cancel, or tap another.';
  }
  return {
    priv(d) { if (phase === 'play') { pick = d.pick; paintCan(); } },
    state(g) {
      if (g.phase !== phase) { if (g.phase === 'end') ctx.sfx('win'); }
      phase = g.phase; ui.dataset.phase = g.phase;
      owner = [...g.o].map(c => c === '.' ? -1 : +c);
      if (g.flip !== flipN) { flipN = g.flip; flipAt = performance.now(); pick = null; }
      paintOwners();
      if (g.last && g.last.n !== lastShown) { lastShown = g.last.n; showFlip(g.last); }
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 6);
      $('.tf-title').textContent = g.phase === 'end' ? 'Final land' : `Flip ${Math.min(init.flips, g.flip + 1)} of ${init.flips}`;
      const best = Math.max(...Object.values(g.scores));
      for (const w of who) {
        const el = ui.querySelector(`.tf-chips [data-pid="${w.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[w.pid];
        el.querySelector('.bn').textContent = `patch ${g.bonus[w.pid]}`;
        el.classList.toggle('lead', g.scores[w.pid] === best && best > 1);
        el.classList.toggle('in', g.phase === 'play' && (g.in || []).includes(w.pid));
      }
      $('.tf-note').textContent = note(g);
    },
    frame() {
      const k = phase === 'play' ? Math.max(0, 1 - (performance.now() - flipAt) / (init.tick * 1000)) : 0;
      $('.tf-timer i').style.transform = `scaleX(${k.toFixed(3)})`;
    },
    dispose() {},
  };
}
