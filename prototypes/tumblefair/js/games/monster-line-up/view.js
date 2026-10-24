// MONSTER LINE-UP on a screen: a moonlit stage with a row of picture cards, each a cartoon monster drawn from the
// state by monster-svg.js. The question sits in a big banner with the thing to count highlighted; a time bar drains;
// tap a monster. The reveal turns the right card green, writes the count under every card ("5 eyes") and puts the
// faces of who picked what on their pick.
import { esc, chip } from '../../client/gamehud.js';
import { monsterSvg } from '../monster-svg.js';
import { QUESTIONS, RIGHT, QUICK } from './sim.js';
const HAT_COL = { witch: '#3a2160', top: '#1d1f24', bow: '#ff5f8f', crown: '#ffd23f', pumpkin: '#ff7a14', cap: '#3d8bff' };
const NAMES = ['Gloop', 'Fuzzle', 'Bonkle', 'Mopsy', 'Wibble', 'Snorp', 'Tibbet', 'Grumble', 'Pip', 'Squidge', 'Noggin', 'Blinky', 'Doodle', 'Puddle'];
const RIGHT_MAX = RIGHT + QUICK;
export const descOf = (m, hats) => ({ body: m[0], fur: m[1], eyes: m[2], legs: m[3], spots: m[4], horns: m[5], size: m[6], hat: m[7] >= 0 ? hats[m[7]] : null, hatCol: m[7] >= 0 ? HAT_COL[hats[m[7]]] : null, mouth: ['smile', 'oh', 'grin', 'tongue'][(m[0] + m[1]) % 4] });

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="ml-top"><span class="ml-title">Monster Line-Up</span><span class="ml-round"></span><span class="clock"><b>--</b></span></div>
    <div class="ml-q"></div>
    <div class="ml-bar"><i></i></div>
    <div class="ml-cards"></div>
    <p class="ml-say"></p>
    <div class="ml-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="ml-st"></strong>')).join('')}</div>
    <p class="ml-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.ml-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, shownAt = 0, mine = null, ms = [], q = null, streak = 0, lastLeft = null;
  const pop = (el, text, cls = '') => { if (!el) return; const f = document.createElement('span'); f.className = 'ml-pop ' + cls; f.textContent = text; el.appendChild(f); setTimeout(() => f.remove(), 1300); };

  function choose(i) {
    if (watching || phase !== 'q' || mine != null || i == null || i >= ms.length) return;
    mine = i; ctx.send('pick', { i, ms: Math.round(performance.now() - shownAt) }); ctx.sfx('pick'); paintPick();
  }
  ui.addEventListener('click', e => { const b = e.target.closest('.ml-card'); if (b) choose(+b.dataset.i); });
  const onKey = e => { const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, ArrowLeft: 0, ArrowRight: ms.length - 1 }[e.code]; if (k != null && !e.repeat) { e.preventDefault(); choose(k); } };
  addEventListener('keydown', onKey);
  function paintPick() {
    ui.querySelectorAll('.ml-card').forEach((c, i) => { c.classList.toggle('mine', i === mine); c.classList.toggle('dim', mine != null && i !== mine && phase === 'q'); c.disabled = watching || mine != null || phase !== 'q'; });
  }
  function drawQuestion(g) {
    ms = g.ms; q = g.q;
    const Q = QUESTIONS[q];
    $('.ml-q').innerHTML = esc(Q.text).replace(Q.key + '?', `<span class="ml-nw"><b class="ml-key ml-${Q.word}">${Q.key}</b>?</span>`);
    $('.ml-cards').innerHTML = ms.map((m, i) => `<button class="ml-card" data-i="${i}" aria-label="Monster ${i + 1}"><span class="ml-pic">${monsterSvg(descOf(m, init.hats))}</span><b class="ml-nm">${NAMES[(m[0] * 7 + m[1] * 3 + m[2] + round + i) % NAMES.length]}</b><span class="ml-val"></span><span class="ml-who"></span><span class="ml-mark"></span><i class="ml-num">${i + 1}</i></button>`).join('');
    $('.ml-cards').dataset.n = ms.length;
    mine = null; paintPick();
  }
  function paintReveal(g) {
    const r = g.reveal, Q = QUESTIONS[q];
    const v = ms.map(m => m[Q.f]), lo = Math.min(...v), hi = Math.max(...v);
    ui.querySelectorAll('.ml-card').forEach((c, i) => {
      c.classList.toggle('right', i === r.answer); c.classList.toggle('wrong', i !== r.answer && (i === mine || (watching && Object.values(r.picks).includes(i))));
      c.querySelector('.ml-val').textContent = Q.f === 6 ? (v[i] === hi ? 'the biggest' : v[i] === lo ? 'the smallest' : 'middle-sized') : `${v[i]} ${v[i] === 1 ? Q.word.replace(/s$/, '') : Q.word}`;
      c.querySelector('.ml-mark').textContent = i === r.answer ? 'YES!' : '';
      c.querySelector('.ml-who').innerHTML = players.filter(p => r.picks[p.pid] === i).map(p => `<i class="ml-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : esc(p.name[0] || '?')}</i>`).join('');
      c.disabled = true;
    });
    if (me != null && r.picks[me] != null) {
      const card = ui.querySelectorAll('.ml-card')[r.picks[me]], ok = r.picks[me] === r.answer;
      streak = ok ? streak + 1 : 0;
      if (ok) { pop(card, `+${r.gain[me]}`, r.gain[me] >= RIGHT_MAX ? 'quick' : ''); } else pop(card, '✗', 'bad');
      ctx.sfx(ok ? 'good' : 'bad');
    } else if (me != null) streak = 0;
    const a = ms[r.answer], nm = ui.querySelectorAll('.ml-card')[r.answer]?.querySelector('.ml-nm')?.textContent || 'That one';
    $('.ml-say').textContent = Q.f === 6 ? `${nm} is the ${Q.most ? 'biggest' : 'smallest'}!` : `${nm} has ${a[Q.f]} ${a[Q.f] === 1 ? Q.word.replace(/s$/, '') : Q.word}!`;
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.ml-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.ml-st'); let t = '', cls = '';
      if (g.phase === 'q' && g.in.includes(p.pid)) { t = 'tapped'; cls = 'in'; }
      if (g.phase === 'reveal') { const r = g.reveal; t = r.picks[p.pid] == null ? 'no answer' : r.picks[p.pid] === r.answer ? `+${r.gain[p.pid]}` : 'wrong'; cls = r.picks[p.pid] === r.answer ? 'in' : 'bad'; }
      if (g.phase === 'end') t = `${g.right[p.pid]} of ${init.rounds} right`;
      st.textContent = t; st.className = 'ml-st ' + cls;
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Count fast! Quick right answers score more.';
    if (g.phase === 'q') return watching ? `${g.in.length} of ${players.length} tapped` : mine != null ? 'Locked in!' : 'COUNT — then TAP your monster!';
    if (g.phase === 'end') {
      if (init.solo && me != null) { const s = g.scores[me], m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      const best = Math.max(...players.map(p => g.scores[p.pid])), tops = players.filter(p => g.scores[p.pid] === best && best > 0);
      return tops.length === 1 && players.length > 1 ? `Line-up over! Sharpest eyes: ${tops[0].name}!` : 'Line-up over!';
    }
    if (g.phase === 'reveal' && me != null && streak >= 2 && g.reveal.picks[me] === g.reveal.answer) return `${streak} in a row!`;
    return '';
  }
  return {
    priv(d) { if (phase === 'q' && d.pick != null && mine == null) { mine = d.pick; paintPick(); } },
    state(g) {
      if (g.phase !== phase || g.round !== round) {
        if (g.phase === 'q') {
          round = g.round; drawQuestion(g); shownAt = performance.now(); ctx.sfx('open');
          const bar = $('.ml-bar i'); bar.style.transition = 'none'; bar.style.width = '100%';
          requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${init.q}s linear`; bar.style.width = '0%'; }));
        }
        if (g.phase === 'reveal') { if (round !== g.round) { round = g.round; drawQuestion(g); } paintReveal(g); }
        if (g.phase === 'end') ctx.sfx('win');
        if (g.phase !== 'reveal') $('.ml-say').textContent = '';
      }
      phase = g.phase; round = g.round; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'q' && g.left <= 2);
      if (g.phase === 'q' && g.left !== lastLeft && g.left <= 2 && g.left > 0 && me != null && mine == null) ctx.sfx('tap');
      lastLeft = g.left;
      $('.ml-round').textContent = g.phase === 'end' ? 'Final scores' : `Question ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.phase === 'ready') $('.ml-q').textContent = 'Eyes? Legs? Spots? Count them!';
      paintPick(); paintChips(g);
      $('.ml-note').textContent = note(g);
    },
    dispose() { removeEventListener('keydown', onKey); },
  };
}
