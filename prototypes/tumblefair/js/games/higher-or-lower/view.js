// HIGHER OR LOWER on a screen. The face-up prize card big in the middle with a 1-13 ladder under it showing where it
// sits; a phone that plays gets three big buttons (HIGHER with an up arrow, LOWER with a down arrow, BANK with a
// piggy bank) and its own pot / streak / banked line. On the reveal the next card flips in beside the old one and every
// player's chip says what happened (+3, BUST!, Banked 6, Brave call!). A watch-only screen (TV) shows the cards big
// and a row per player with their pot and streak, and on the reveal who called what.
import { esc, chip } from '../../client/gamehud.js';
import { ICONS } from './icons.js';
import { CARDS } from './sim.js';

const ICON_OF = ['ticket', 'candy', 'lollipop', 'popcorn', 'ice-cream', 'balloon', 'hotdog', 'teddy-bear', 'dice', 'gift', 'ferris-wheel', 'crown', 'trophy'];
const TINT = ['#e8485a', '#e0700f', '#d6408f', '#c48a00', '#2f7de1', '#e8485a', '#b0531a', '#8a5a2b', '#1f9d55', '#8a4fd8', '#0f8f98', '#c48a00', '#c48a00'];
function icon(v) {
  const [w, h, d, d2] = ICONS['duotone/' + ICON_OF[v - 1]];
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d2}" fill="${TINT[v - 1]}" opacity=".45"/><path d="${d}" fill="${TINT[v - 1]}"/></svg>`;
}
export function card(v, cls = '') {
  return `<div class="hl-card ${cls}" data-v="${v}"><b class="c1">${v}</b><div class="hl-art">${icon(v)}</div><span class="hl-name">${esc(CARDS[v - 1])}</span><b class="c2">${v}</b></div>`;
}
const ARROW = { hi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L22 15 H15 V21 H9 V15 H2 Z"/></svg>', lo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 L22 9 H15 V3 H9 V9 H2 Z"/></svg>',
  bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="13" rx="8" ry="6"/><path d="M6 11 l1-5 4 3 M8 18 v3 h2 v-2 M14 19 v2 h2 v-3"/><path d="M10 7 h4" stroke="#fff" stroke-width="2"/></svg>' };
const WORD = { hi: 'HIGHER', lo: 'LOWER', bank: 'BANK' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="hl-top"><span class="hl-title">Higher or Lower</span><span class="hl-flip"></span><span class="clock"><b>--</b></span></div>
    <div class="hl-table"><div class="hl-cards"></div><div class="hl-verdict"></div></div>
    <div class="hl-ladder">${Array.from({ length: 13 }, (_, i) => `<i data-v="${i + 1}">${i + 1}</i>`).join('')}</div>
    <div class="hl-mine"><span>Pot <b class="m-pot">0</b></span><span>Streak <b class="m-streak">0</b></span><span>Banked <b class="m-bank">0</b></span></div>
    <div class="hl-picks">${['hi', 'lo', 'bank'].map(k => `<button class="hl-pick hl-${k}" data-k="${k}">${ARROW[k]}<b>${WORD[k]}</b><small class="hl-odds"></small></button>`).join('')}</div>
    <div class="hl-rows">${players.map(p => `<div class="hl-row" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<span class="hl-pot"></span><strong class="hl-res"></strong></div>`).join('')}</div>
    <div class="hl-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="hl-st"></strong>')).join('')}</div>
    <p class="hl-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.hl-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', mine = null, flip = -1;

  function paintPick() { ui.querySelectorAll('.hl-pick').forEach(b => b.classList.toggle('on', b.dataset.k === mine)); ui.classList.toggle('picked', !!mine); }
  ui.addEventListener('click', e => {
    const b = e.target.closest('.hl-pick'); if (!b || watching || phase !== 'pick') return;
    mine = b.dataset.k; ctx.send('pick', mine); ctx.sfx(mine === 'bank' ? 'coins' : 'tap'); paintPick();
  });
  function resText(r) {
    if (!r) return '';
    if (r.res === 'win') return r.brave ? `Brave call! +${r.gain} +3` : `Right! +${r.gain}`;
    if (r.res === 'lose') return r.gain ? `BUST! lost ${-r.gain}` : 'Wrong!';
    if (r.res === 'bank') return `Banked ${r.gain}`;
    if (r.res === 'same') return 'Same card!';
    return 'sat out';
  }
  function note(g) {
    if (g.phase === 'ready') return 'Here comes the first card…';
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals; return s >= m[2] ? `GOLD! ${s} points.` : s >= m[1] ? `SILVER! ${s} points.` : s >= m[0] ? `BRONZE! ${s} points.` : `${s} points. Bronze at ${m[0]}!`; }
      return 'Pots banked! Most points wins.';
    }
    if (g.phase === 'reveal') { const r = g.reveal; return r.to > r.from ? `Higher! ${r.to} beats ${r.from}.` : r.to < r.from ? `Lower! ${r.to} is under ${r.from}.` : 'The same card! Nothing happens.'; }
    if (watching) return `${g.picked.length} of ${players.length} have picked`;
    return mine ? `You picked ${WORD[mine]}. You can still change it.` : 'Will the next card be higher or lower?';
  }
  return {
    priv(d) { if (phase === 'pick' && d.pick && !mine) { mine = d.pick; paintPick(); } },
    state(g) {
      if (g.phase !== phase || g.flip !== flip) {
        if (g.phase === 'pick') { mine = null; paintPick(); $('.hl-cards').innerHTML = card(g.card, 'now'); $('.hl-verdict').textContent = ''; ctx.sfx('open'); }
        if (g.phase === 'ready') $('.hl-cards').innerHTML = card(g.card, 'now');
        if (g.phase === 'reveal') {
          const r = g.reveal, dir = r.to > r.from ? 'hi' : r.to < r.from ? 'lo' : 'same';
          $('.hl-cards').innerHTML = card(r.from, 'old') + `<i class="hl-arrow ${dir}">${ARROW[dir] || '='}</i>` + card(r.to, 'new');
          $('.hl-verdict').textContent = dir === 'hi' ? 'HIGHER!' : dir === 'lo' ? 'LOWER!' : 'SAME!';
          $('.hl-verdict').className = 'hl-verdict ' + dir;
          const mr = me != null ? r.rows[me] : null;
          ctx.sfx(mr ? (mr.res === 'win' ? 'good' : mr.res === 'lose' ? 'bad' : mr.res === 'bank' ? 'coins' : 'tap') : 'pick');
        }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; flip = g.flip; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'pick' && g.left <= 2);
      $('.hl-flip').textContent = g.phase === 'end' ? 'Final scores' : `Flip ${Math.min(g.flip + 1, init.flips)} of ${init.flips}`;
      const cur = g.phase === 'reveal' ? g.reveal.to : g.card;
      ui.querySelectorAll('.hl-ladder i').forEach(i => i.classList.toggle('on', +i.dataset.v === cur));
      if (me != null) { $('.m-pot').textContent = g.pot[me]; $('.m-streak').textContent = g.streak[me]; $('.m-bank').textContent = g.score[me]; ui.classList.toggle('has-pot', g.pot[me] > 0); }
      ui.querySelectorAll('.hl-odds').forEach(o => { const k = o.parentElement.dataset.k; o.textContent = g.odds && k !== 'bank' ? `${g.odds[k === 'hi' ? 0 : 1]}% chance` : k === 'bank' && me != null ? `keep ${g.pot[me]}` : ''; });
      for (const p of players) {
        const c = ui.querySelector(`.hl-players [data-pid="${p.pid}"]`), row = ui.querySelector(`.hl-row[data-pid="${p.pid}"]`);
        c.querySelector('.sc').textContent = g.scores[p.pid];
        const r = g.phase === 'reveal' ? g.reveal.rows[p.pid] : null;
        const st = g.phase === 'pick' ? (g.picked.includes(p.pid) ? 'picked ✓' : 'thinking…') : r ? resText(r) : g.pot[p.pid] ? `pot ${g.pot[p.pid]}` : '';
        c.querySelector('.hl-st').textContent = st;
        c.classList.toggle('in', g.phase === 'pick' && g.picked.includes(p.pid));
        c.dataset.res = r?.res || '';
        row.querySelector('.hl-pot').innerHTML = `pot <b>${g.pot[p.pid]}</b> · streak <b>${g.streak[p.pid]}</b> · total <b>${g.scores[p.pid]}</b>`;
        row.querySelector('.hl-res').textContent = r ? `${r.pick ? WORD[r.pick] + ': ' : ''}${resText(r)}` : g.phase === 'pick' ? (g.picked.includes(p.pid) ? 'picked ✓' : '…') : '';
        row.dataset.res = r?.res || ''; row.classList.toggle('brave', !!r?.brave);
      }
      $('.hl-note').textContent = note(g);
    },
    dispose() {},
  };
}
