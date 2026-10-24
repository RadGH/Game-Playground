// SIZE UP on a screen. The question in a big banner, then two (or three) big picture cards to tap, a draining time
// bar, everyone's "answered" ticks. The reveal turns the right card green with its real value under every card, the
// faces of who picked what, and a line like "The Blue whale is about 3x heavier!".
import { esc, chip } from '../../client/gamehud.js';
import { hashStr } from '../../shared/rng.js';
import { ITEMS, PALETTE } from './items.js';
import { ICONS } from './icons.js';
import { QUESTIONS, Q_S, RIGHT, QUICK } from './sim.js';
const RIGHT_MAX = RIGHT + QUICK;

const byId = new Map(ITEMS.map(t => [t.id, t]));
const WORD = { m: ['bigger', 'smaller'], kg: ['heavier', 'lighter'], kmh: ['faster', 'slower'] };
const KEY = { bigger: 'BIGGER', smaller: 'SMALLER', heavier: 'HEAVIER', lighter: 'LIGHTER', faster: 'FASTER', slower: 'SLOWER', biggest: 'BIGGEST', heaviest: 'HEAVIEST', fastest: 'FASTEST', smallest: 'SMALLEST' };
const BIG = [[1e27, 'octillion'], [1e24, 'septillion'], [1e21, 'sextillion'], [1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
const n2 = v => v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
function words(v) { for (const [k, w] of BIG) if (v >= k) return `${n2(v / k)} ${w}`; return n2(v); }
export function fmt(stat, v) {
  if (v == null) return '?';
  if (stat === 'm') return v >= 1e6 ? `${words(v / 1000)} km` : v >= 1000 ? `${n2(v / 1000)} km` : v >= 1 ? `${n2(v)} m` : v >= 0.01 ? `${n2(v * 100)} cm` : `${n2(v * 1000)} mm`;
  if (stat === 'kg') return v >= 1000 ? `${words(v / 1000)} tonne${v === 1000 ? '' : 's'}` : v >= 1 ? `${n2(v)} kg` : v >= 0.001 ? `${n2(v * 1000)} g` : `${n2(v * 1e6)} mg`;
  return `${v >= 1 ? n2(v) : v} km/h`;
}
function times(r) { return r >= 1e6 ? 'more than a million times' : r >= 1000 ? `about ${words(Math.round(r / 100) * 100)} times` : r >= 20 ? `about ${Math.round(r / 5) * 5}x` : `about ${Math.round(r)}x`; }
function icon(t) {
  const I = ICONS[t.icon], [c1, c2] = PALETTE[hashStr(t.id) % PALETTE.length];
  return I ? `<svg viewBox="0 0 ${I[0]} ${I[1]}" aria-hidden="true"><path d="${I[2]}" fill="${c2}"/><path d="${I[3]}" fill="${c1}"/></svg>` : '';
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="su-top"><span class="su-title">Size Up</span><span class="su-round"></span><span class="clock"><b>--</b></span></div>
    <div class="su-q"></div>
    <div class="su-bar"><i></i></div>
    <div class="su-cards"></div>
    <p class="su-say"></p>
    <div class="su-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="su-st"></strong>')).join('')}</div>
    <p class="su-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.su-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, shownAt = 0, mine = null, ids = [], q = null, streak = 0, lastLeft = null;
  /** Round 12: a number that floats up off a card and fades. */
  const pop = (el, text, cls = '') => { if (!el) return; const f = document.createElement('span'); f.className = 'su-pop ' + cls; f.textContent = text; el.appendChild(f); setTimeout(() => f.remove(), 1300); };

  ui.addEventListener('click', e => {
    const b = e.target.closest('.su-card'); if (!b || watching || phase !== 'q' || mine != null) return;
    mine = +b.dataset.i; ctx.send('pick', { i: mine, ms: Math.round(performance.now() - shownAt) }); ctx.sfx('pick');
    paintPick();
  });
  function paintPick() {
    ui.querySelectorAll('.su-card').forEach((c, i) => { c.classList.toggle('mine', i === mine); c.classList.toggle('dim', mine != null && i !== mine); c.disabled = watching || mine != null || phase !== 'q'; });
    ui.classList.toggle('picked', mine != null);
  }
  function drawQuestion(g) {
    ids = g.ids; q = g.q;
    const text = QUESTIONS[q].text, key = KEY[q];
    $('.su-q').innerHTML = esc(text).replace(`${key}?`, `<span class="su-nw"><b class="su-key su-${QUESTIONS[q].stat}">${key}</b>?</span>`);
    $('.su-cards').innerHTML = ids.map((id, i) => { const t = byId.get(id); return `<button class="su-card" data-i="${i}"><span class="su-ic">${icon(t)}</span><b class="su-nm">${esc(t.name)}</b><span class="su-val"></span><span class="su-meter"><i></i></span><span class="su-who"></span><span class="su-mark"></span></button>`; }).join('');
    $('.su-cards').dataset.n = ids.length;
    mine = null; paintPick();
  }
  function paintReveal(g) {
    const r = g.reveal, stat = QUESTIONS[q].stat;
    ui.querySelectorAll('.su-card').forEach((c, i) => {
      const t = byId.get(ids[i]);
      c.classList.toggle('right', i === r.answer); c.classList.toggle('wrong', i !== r.answer && (i === mine || (watching && Object.values(r.picks).includes(i))));
      c.querySelector('.su-val').textContent = fmt(stat, t[stat]) + (stat === 'kmh' ? ` (${Math.max(0.01, Math.round(t.kmh * 0.621 * 10) / 10)} mph)` : '');
      c.querySelector('.su-mark').textContent = i === r.answer ? 'YES!' : '';
      c.querySelector('.su-who').innerHTML = players.filter(p => r.picks[p.pid] === i).map(p => `<i class="su-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : esc(p.name[0] || '?')}</i>`).join('');
      c.disabled = true;
      // round 12: a bar on a log scale under each value, so "about 40x" reads at a glance
      const vs = ids.map(id => Math.log10(byId.get(id)[stat])), lo = Math.min(...vs), hi = Math.max(...vs);
      c.querySelector('.su-meter i').style.width = `${Math.round(18 + 82 * (hi > lo ? (vs[i] - lo) / (hi - lo) : 1))}%`;
      c.style.setProperty('--d', `${i * 120}ms`);
    });
    if (me != null && r.picks[me] != null) {
      const card = ui.querySelectorAll('.su-card')[r.picks[me]], ok = r.picks[me] === r.answer;
      streak = ok ? streak + 1 : 0;
      if (ok) { pop(card, `+${r.gain[me]}`, r.gain[me] >= RIGHT_MAX ? 'quick' : ''); if (r.gain[me] >= RIGHT_MAX) pop(card, 'QUICK!', 'tag'); }
      else pop(card, '✗', 'bad');
    } else if (me != null) streak = 0;
    const a = byId.get(ids[r.answer]), vals = ids.map(id => byId.get(id)[stat]).filter((v, i) => i !== r.answer);
    const most = QUESTIONS[q].most, other = most ? Math.max(...vals) : Math.min(...vals), ratio = most ? a[stat] / other : other / a[stat];
    const otherT = byId.get(ids.find(id => byId.get(id)[stat] === other));
    const the = n => /^The /.test(n) ? n : 'The ' + n;
    $('.su-say').textContent = `${the(a.name)} is ${times(ratio)} ${WORD[stat][most ? 0 : 1]} than ${ids.length > 2 ? 'the next one' : the(otherT.name).replace(/^The /, 'the ')}!`;
    if (me != null) ctx.sfx(r.picks[me] === r.answer ? 'good' : 'bad');
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.su-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.su-st'); let t = '', cls = '';
      if (g.phase === 'q' && g.in.includes(p.pid)) { t = 'answered'; cls = 'in'; }
      if (g.phase === 'reveal') { const r = g.reveal; t = r.picks[p.pid] == null ? 'no answer' : r.picks[p.pid] === r.answer ? `right! +${r.gain[p.pid]}` : 'wrong'; cls = r.picks[p.pid] === r.answer ? 'in' : 'bad'; }
      if (g.phase === 'end') { t = `${g.right[p.pid]} of ${init.rounds} right`; }
      st.textContent = t; st.className = 'su-st ' + cls; el.classList.toggle('in', g.phase === 'q' && cls === 'in');
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Get ready! Quick answers score more.';
    if (g.phase === 'q') return watching ? `${g.in.length} of ${players.length} answered` : mine != null ? 'Locked in!' : 'Tap your answer!';
    if (g.phase === 'end') { const best = Math.max(...players.map(p => g.scores[p.pid])), tops = players.filter(p => g.scores[p.pid] === best && best > 0);
      return players.length > 1 && tops.length === 1 ? `Quiz over! Top sizer: ${tops[0].name}!` : 'Quiz over! Most points wins.'; }
    if (g.phase === 'reveal' && me != null && streak >= 2 && g.reveal.picks[me] === g.reveal.answer) return `${streak} in a row!`;
    return '';
  }

  return {
    priv(d) { if (phase === 'q' && d.pick != null && mine == null) { mine = d.pick; paintPick(); } },
    state(g) {
      if (g.phase !== phase || g.round !== round) {
        if (g.phase === 'q') { drawQuestion(g); shownAt = performance.now(); ctx.sfx('open'); const bar = $('.su-bar i'); bar.style.transition = 'none'; bar.style.width = '100%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${Q_S}s linear`; bar.style.width = '0%'; })); }
        if (g.phase === 'reveal') { if (round !== g.round) drawQuestion(g); paintReveal(g); }
        if (g.phase === 'end') ctx.sfx('win');
        if (g.phase !== 'reveal') $('.su-say').textContent = '';
      }
      phase = g.phase; round = g.round; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'q' && g.left <= 2);
      if (g.phase === 'q' && g.left !== lastLeft && g.left <= 2 && g.left > 0 && me != null && mine == null) ctx.sfx('tap');
      lastLeft = g.left;
      ui.classList.toggle('streak', g.phase === 'reveal' && me != null && streak >= 2 && g.reveal?.picks[me] === g.reveal?.answer);
      $('.su-round').textContent = g.phase === 'end' ? 'Final scores' : `Question ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.phase === 'ready') $('.su-q').textContent = 'Bigger? Heavier? Faster?';
      paintPick();
      paintChips(g);
      $('.su-note').textContent = note(g);
    },
    dispose() {},
  };
}
