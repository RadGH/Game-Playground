// TWO TRUTHS, ONE GOBLIN on a screen (Expansion 1 M4): a fortune-teller's tent. While the stall is shown, a wooden
// prize stall with three shelves fills the middle; the Teller's phone also offers the two lies to plant (one tap).
// Then the stall is covered and three big claim cards (A, B, C) go up: tap the lie. The reveal brings the stall back,
// stamps the lie GOBLIN and floats each player's points on their chip. Alone, Fib the Goblin is the Teller.
import { chip, esc } from '../../client/gamehud.js';
import { PRIZES, SHELVES } from './cards.js';

const GOBLIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 26 l14 4 l-2 10 z M60 26 l-14 4 l2 10 z" fill="#5fbf4a" stroke="#0d2228" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="32" cy="36" rx="18" ry="20" fill="#7cdb6a" stroke="#0d2228" stroke-width="2.5"/>
  <ellipse cx="25" cy="31" rx="5" ry="6" fill="#fff" stroke="#0d2228" stroke-width="2"/><ellipse cx="39" cy="31" rx="5" ry="6" fill="#fff" stroke="#0d2228" stroke-width="2"/>
  <circle cx="26" cy="32" r="2.4" fill="#0d2228"/><circle cx="40" cy="32" r="2.4" fill="#0d2228"/><path d="M30 37 q2 6 4 0" fill="#5fbf4a" stroke="#0d2228" stroke-width="2"/>
  <path d="M22 45 q10 8 20 0" fill="#3b1a1a" stroke="#0d2228" stroke-width="2.5"/><path d="M26 46 l2 3 l2 -3 M34 46 l2 3 l2 -3" fill="#fff"/>
  <path d="M20 22 q12 -12 24 0" fill="none" stroke="#0d2228" stroke-width="2.5"/></svg>`;
const FIB_FACE = `<svg viewBox="8 8 48 48" aria-hidden="true">${GOBLIN.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
const L = 'ABC';
const EMO = Object.fromEntries(PRIZES.map(p => [p.id, p.e]));

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const who = [...players, ...(init.fib ? [{ pid: init.fib.pid, name: init.fib.name, color: '#5fbf4a', dark: '#2d6a22', shape: 'circle', portrait: '', cpu: true }] : [])];
  const byId = new Map(who.map(p => [String(p.pid), p]));
  const face = p => p?.cpu ? `<i class="tg-face">${FIB_FACE}</i>` : `<i class="tg-face" style="--seat:${p?.color || '#999'}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.innerHTML = `
    <div class="tg-top"><span class="tg-title">Two Truths, One Goblin</span><span class="clock"><b>--</b></span></div>
    <div class="tg-chips">${who.map(p => p.cpu ? `<span class="chip tg-cpu" data-pid="${p.pid}" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">${FIB_FACE}</i><b class="nm">${esc(p.name)}</b><em class="sc">0</em><strong class="delta"></strong></span>` : chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="tg-do"></p>
    <section class="tg-stall" aria-label="The prize stall"></section>
    <section class="tg-plant"></section>
    <section class="tg-cards"></section>
    <p class="tg-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.tg-chips [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, teller = null, guess = null, cardsKey = '', stallKey = '', shown = -1, lies = null, planted = 0;

  function paintStall(slots) {
    const key = JSON.stringify(slots); if (key === stallKey) return; stallKey = key;
    $('.tg-stall').innerHTML = `<div class="tg-roof"></div>` + slots.map((row, s) => `<div class="tg-shelf" data-shelf="${SHELVES[s]}"><span class="tg-sl">${SHELVES[s]}</span>${row.map(id => `<span class="tg-slot">${id ? EMO[id] : ''}</span>`).join('')}</div>`).join('');
  }
  function paintPlant() {
    const mine = phase === 'show' && teller === me && lies;
    $('.tg-plant').innerHTML = !mine ? '' : `<p>You are the Goblin! Pick the lie to plant — the sneakiest one fools the most:</p>${lies.map((t, i) => `<button class="tg-lie${planted === i ? ' on' : ''}" data-i="${i}"><b>${planted === i ? '✔ Planted' : 'Plant this'}</b><q>${esc(t)}</q></button>`).join('')}`;
  }
  function paintCards(list, rv) {
    const key = list.join('|');
    if (key !== cardsKey) {
      cardsKey = key;
      $('.tg-cards').innerHTML = list.map((t, i) => `<button class="tg-card" data-i="${i}"><b class="tg-l">${L[i]}</b><q>${esc(t)}</q><span class="tg-stamp"></span><span class="tg-who"></span></button>`).join('');
    }
    ui.querySelectorAll('.tg-card').forEach((el, i) => {
      el.classList.toggle('picked', guess === i && !rv);
      el.classList.toggle('gob', !!rv && rv.gob === i); el.classList.toggle('truth', !!rv && rv.gob !== i);
      el.querySelector('.tg-stamp').innerHTML = !rv ? '' : rv.gob === i ? `${GOBLIN}GOBLIN!` : 'TRUE';
      const voters = rv ? Object.entries(rv.guesses).filter(([, v]) => v === i).map(([p]) => byId.get(p)) : [];
      el.querySelector('.tg-who').innerHTML = voters.map(face).join('');
    });
  }
  ui.addEventListener('click', e => {
    if (watching) return;
    const b = e.target.closest('button'); if (!b) return;
    if (phase === 'show' && teller === me && b.classList.contains('tg-lie')) { planted = +b.dataset.i; ctx.send('plant', planted); ctx.sfx('pick'); paintPlant(); return; }
    if (phase === 'guess' && teller !== me && b.classList.contains('tg-card')) { guess = +b.dataset.i; ctx.send('guess', guess); ctx.sfx('pick'); paintCards(cardsKey.split('|'), null); }
  });
  // the one line at the top that says what YOU do right now
  function doLine(g) {
    const p = byId.get(String(g.teller)), nm = p ? esc(p.name) : '';
    if (g.phase === 'ready' || g.round < 0) return 'Get ready to <b>look hard</b> at the prize stall!';
    if (g.phase === 'show') return g.teller === me ? 'Remember the stall too — and <b>pick a lie</b> to plant below.' : `<b>Remember the stall!</b> What is on each shelf? How many of each?`;
    if (g.phase === 'guess') {
      if (g.teller === me) return 'Keep a straight face while they guess!';
      if (watching) return `${nm} made three claims. Which one is the lie?`;
      return guess == null ? `Two are true, one is a <b>lie</b>. Tap the lie!` : `You picked <b>${L[guess]}</b>. Tap another card to change your mind.`;
    }
    if (g.phase === 'reveal') return `The lie was <b>${L[g.reveal.gob]}</b>. Here is the stall again.`;
    return '';
  }
  function note(g) {
    if (g.phase === 'ready') return init.solo ? (init.fib ? 'Fib the Goblin will try to fool you. Catch its lie for +2!' : 'The Goblin will try to fool you. Catch its lie for +2!') : 'Each round one of you is the Goblin and picks the lie.';
    if (g.phase === 'show') return `The stall hides in ${g.left} s.`;
    if (g.phase === 'guess') {
      if (g.teller === me) return `You get +${init.fool} for everyone who picks a truth.`;
      return `Catch the lie for +${init.catch}${guessersCount() > 1 ? `, fastest catch +${init.sharp}` : ''}.`;
    }
    if (g.phase === 'reveal') { const sh = g.reveal.sharp != null ? byId.get(String(g.reveal.sharp)) : null; return sh ? `Sharp Eye: ${sh.name} (+${init.sharp}).` : ''; }
    return '';
  }
  const guessersCount = () => init.solo ? 1 : players.length - 1;
  return {
    priv(d) {
      lies = d.teller ? d.lies : null; if (d.teller) planted = d.planted;
      if ('guess' in d) guess = d.guess;
      paintPlant();
    },
    state(g) {
      if (g.round !== round) { round = g.round; guess = null; cardsKey = ''; }
      if (g.phase !== phase) {
        if (g.phase === 'guess' || g.phase === 'show') ctx.sfx('pick');
        if (g.phase === 'reveal' && shown !== g.round) { shown = g.round; const my = me != null ? g.reveal.gain[me] : null; ctx.sfx(my == null ? 'pick' : my > 0 ? 'good' : 'bad'); }
        if (g.phase !== 'show') lies = null;
      }
      phase = g.phase; teller = g.teller; ui.dataset.phase = g.phase;
      ui.dataset.role = g.teller === me ? 'teller' : 'guesser';
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', (g.phase === 'guess' || g.phase === 'show') && g.left <= 3);
      $('.tg-title').textContent = g.round < 0 ? 'Two Truths, One Goblin' : `Round ${g.round + 1} of ${init.rounds}`;
      if (g.stall) paintStall(g.stall);
      paintPlant();
      if (g.phase === 'guess') paintCards(g.cards, null);
      if (g.phase === 'reveal') paintCards(g.reveal.cards, g.reveal);
      for (const p of who) {
        const el = ui.querySelector(`.tg-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[p.pid];
        el.classList.toggle('tell', p.pid === g.teller);
        el.classList.toggle('in', g.phase === 'guess' && (g.guessed || []).includes(p.pid));
        const dl = el.querySelector('.delta'), gain = g.reveal?.gain[p.pid];
        dl.textContent = g.phase === 'reveal' ? (gain ? `+${gain}` : '') : p.pid === g.teller ? 'Goblin' : g.phase === 'guess' ? ((g.guessed || []).includes(p.pid) ? 'guessed' : '…') : '';
        dl.className = 'delta' + (gain > 0 ? ' good' : '');
      }
      $('.tg-note').textContent = note(g);
      { const d = doLine(g), el = $('.tg-do'); if (el.innerHTML !== d) el.innerHTML = d; }
    },
    dispose() {},
  };
}
