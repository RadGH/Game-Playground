// TWO TRUTHS, ONE GOBLIN on a screen: a fortune-teller's tent — purple cloth and three big claim cards (A, B, C).
// The Teller's phone, while arranging, shows their three cards marked TRUE or GOBLIN, with "Other wording", "Move up",
// a button to swap in the spare Goblin, and Ready. Everyone else sees the Teller's face and a "shuffling…" card. Then the
// claims go up: guessers tap the one they think is the Goblin; the Teller is told to keep a straight face. The reveal
// stamps the Goblin, shows who picked which card, and floats each player's points on their chip.
import { chip, esc } from '../../client/gamehud.js';

const GOBLIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 26 l14 4 l-2 10 z M60 26 l-14 4 l2 10 z" fill="#5fbf4a" stroke="#0d2228" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="32" cy="36" rx="18" ry="20" fill="#7cdb6a" stroke="#0d2228" stroke-width="2.5"/>
  <ellipse cx="25" cy="31" rx="5" ry="6" fill="#fff" stroke="#0d2228" stroke-width="2"/><ellipse cx="39" cy="31" rx="5" ry="6" fill="#fff" stroke="#0d2228" stroke-width="2"/>
  <circle cx="26" cy="32" r="2.4" fill="#0d2228"/><circle cx="40" cy="32" r="2.4" fill="#0d2228"/><path d="M30 37 q2 6 4 0" fill="#5fbf4a" stroke="#0d2228" stroke-width="2"/>
  <path d="M22 45 q10 8 20 0" fill="#3b1a1a" stroke="#0d2228" stroke-width="2.5"/><path d="M26 46 l2 3 l2 -3 M34 46 l2 3 l2 -3" fill="#fff"/>
  <path d="M20 22 q12 -12 24 0" fill="none" stroke="#0d2228" stroke-width="2.5"/></svg>`;
const HOUSE_FACE = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#9b4fe0"/><path d="M6 14 l10 -9 l10 9 v11 h-20 z" fill="#ffd23f" stroke="#0d2228" stroke-width="1.6"/><rect x="13" y="18" width="6" height="7" fill="#8a5225" stroke="#0d2228" stroke-width="1.4"/></svg>`;
const L = 'ABC';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const who = [...players, ...(init.house ? [{ pid: init.house.pid, name: init.house.name, color: '#9b4fe0', dark: '#5a2a8a', shape: 'circle', portrait: '', cpu: true }] : [])];
  const byId = new Map(who.map(p => [String(p.pid), p]));
  const face = p => p?.cpu ? `<i class="tg-face">${HOUSE_FACE}</i>` : `<i class="tg-face" style="--seat:${p?.color || '#999'}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.innerHTML = `
    <div class="tg-top"><span class="tg-title">Two Truths, One Goblin</span><span class="clock"><b>--</b></span></div>
    <div class="tg-chips">${who.map(p => p.cpu ? `<span class="chip tg-cpu" data-pid="${p.pid}" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">${HOUSE_FACE}</i><b class="nm">${esc(p.name)}</b><em class="sc">0</em><strong class="delta"></strong></span>` : chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <div class="tg-teller"></div>
    <section class="tg-prep">
      <div class="tg-hand"></div>
      <button class="tg-plant big-btn"></button>
      <button class="tg-ready big-btn">Ready! Show them</button>
    </section>
    <section class="tg-wait">${GOBLIN}<p>Shuffling the claims…</p></section>
    <section class="tg-cards"></section>
    <p class="tg-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.tg-chips [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, teller = null, guess = null, cardsKey = '', hand = null, alt = null, shown = -1;

  function paintHand() {
    if (!hand) return;
    $('.tg-hand').innerHTML = hand.map((c, i) => `
      <div class="tg-hc ${c.gob ? 'gob' : 'true'}"><b class="tg-l">${L[i]}</b>
        <span class="tg-badge">${c.gob ? `${GOBLIN}GOBLIN (the lie)` : '✔ TRUE'}</span>
        <q>${esc(c.t[c.w])}</q>
        <div class="tg-hb"><button class="tg-word" data-i="${i}">Other wording</button>${i ? `<button class="tg-up" data-i="${i}">▲ Move up</button>` : ''}</div>
      </div>`).join('');
    $('.tg-plant').innerHTML = `Use the other Goblin instead: <small>"${esc(alt[0])}"</small>`;
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
    if (phase === 'prep' && teller === me) {
      if (b.classList.contains('tg-word')) { const i = +b.dataset.i; hand[i].w = 1 - hand[i].w; ctx.send('word', i); ctx.sfx('tap'); paintHand(); }
      else if (b.classList.contains('tg-up')) { const i = +b.dataset.i; [hand[i - 1], hand[i]] = [hand[i], hand[i - 1]]; ctx.send('up', i); ctx.sfx('tap'); paintHand(); }
      else if (b.classList.contains('tg-plant')) { const gi = hand.findIndex(c => c.gob); const old = hand[gi].t; hand[gi] = { t: alt, w: 0, gob: true }; alt = old; ctx.send('plant', 1); ctx.sfx('pick'); paintHand(); }
      else if (b.classList.contains('tg-ready')) { ctx.send('ready'); ctx.sfx('good'); }
      return;
    }
    if (phase === 'guess' && teller !== me && b.classList.contains('tg-card')) { guess = +b.dataset.i; ctx.send('guess', guess); ctx.sfx('pick'); paintCards(cardsKey.split('|'), null); }
  });
  function tellerLine(g) {
    const p = byId.get(String(g.teller)); if (!p) return '';
    const you = g.teller === me;
    return `${face(p)}<span>${you ? '<b>You</b> are the Teller' : `<b>${esc(p.name)}</b> ${p.cpu ? 'is telling' : 'is the Teller'}`}</span>`;
  }
  function note(g) {
    const tie = 'Ties go to the quickest catches.';
    if (g.phase === 'ready') return init.solo ? 'The House tells. Its Goblin is usually its longest claim (3 times in 4)!' : 'Get ready to lie… or to catch a liar.';
    if (g.phase === 'prep') return g.teller === me ? 'Only you can see this. Swap wordings, reorder, or plant the other Goblin. Then Ready!' : 'Watch their face…';
    if (g.phase === 'guess') {
      if (g.teller === me) return `Keep a straight face! You get +${init.fool} for everyone who picks a truth.`;
      if (watching) return `${g.guessed.length} of ${players.length - (init.solo ? 0 : 1)} have guessed. ${tie}`;
      if (init.solo) return `${guess == null ? 'Tap the claim you think is the Goblin.' : `Picked ${L[guess]}.`} Tip: the House's Goblin is usually its longest claim.`;
      return guess == null ? 'Tap the claim you think is the Goblin.' : `Picked ${L[guess]}. You can still change your mind. Catch it for +${init.catch}${players.length > 2 ? `, fastest catch +${init.sharp}` : ''}.`;
    }
    if (g.phase === 'reveal') { const sh = g.reveal.sharp != null ? byId.get(String(g.reveal.sharp)) : null; return `The Goblin was ${L[g.reveal.gob]}!${sh ? ` Sharp Eye: ${sh.name} (+${init.sharp}).` : ''}`; }
    return '';
  }
  return {
    priv(d) {
      if (d.teller) { hand = d.hand.map(c => ({ ...c })); alt = d.alt; paintHand(); }
      if ('guess' in d) guess = d.guess;
    },
    state(g) {
      if (g.round !== round) { round = g.round; guess = null; cardsKey = ''; hand = null; }
      if (g.phase !== phase) {
        if (g.phase === 'guess') ctx.sfx('pick');
        if (g.phase === 'reveal' && shown !== g.round) { shown = g.round; const my = me != null ? g.reveal.gain[me] : null; ctx.sfx(my == null ? 'pick' : my > 0 ? 'good' : 'bad'); }
      }
      phase = g.phase; teller = g.teller; ui.dataset.phase = g.phase;
      ui.dataset.role = g.teller === me ? 'teller' : 'guesser';
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 3);
      $('.tg-title').textContent = g.round < 0 ? 'Two Truths, One Goblin' : `Round ${g.round + 1} of ${init.rounds}`;
      $('.tg-teller').innerHTML = g.round < 0 ? '' : tellerLine(g);
      if (g.phase === 'guess') paintCards(g.cards, null);
      if (g.phase === 'reveal') paintCards(g.reveal.cards, g.reveal);
      for (const p of who) {
        const el = ui.querySelector(`.tg-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[p.pid];
        el.classList.toggle('tell', p.pid === g.teller);
        el.classList.toggle('in', g.phase === 'guess' && (g.guessed || []).includes(p.pid));
        const dl = el.querySelector('.delta'), gain = g.reveal?.gain[p.pid];
        dl.textContent = g.phase === 'reveal' ? (gain ? `+${gain}` : '') : g.phase === 'guess' ? (p.pid === g.teller ? 'Teller' : (g.guessed || []).includes(p.pid) ? 'guessed' : '…') : p.pid === g.teller ? 'Teller' : '';
        dl.className = 'delta' + (gain > 0 ? ' good' : '');
      }
      $('.tg-note').textContent = note(g);
    },
    dispose() {},
  };
}
