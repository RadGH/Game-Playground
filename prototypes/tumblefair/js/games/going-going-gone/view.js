// GOING, GOING, GONE! on a screen. A velvet auction room: the five lots in a row along the top (the one up for sale
// raised, sold ones stamped with the winner's face), the lot itself big in the middle, and a bidding paddle on a phone
// that plays (- 5 / - 1 / + 1 / + 5, LOCK BID) with the RUMMAGE button underneath. Everyone's chip shows their energy,
// points and a rattle meter while they rummage; the reveal puts every bid on its chip and stamps SOLD / UNSOLD / CURSED.
import { esc, chip } from '../../client/gamehud.js';

const BOLT = '<svg class="gg-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>';
const LOT_ART = {
  normal: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 26h44v30H10z" fill="#ffd23f" stroke="#0d2228" stroke-width="3"/><path d="M6 18h52v10H6z" fill="#ff5f5f" stroke="#0d2228" stroke-width="3"/><path d="M28 18h8v38h-8z" fill="#fff" stroke="#0d2228" stroke-width="3"/><path d="M32 18c-8-12-20-8-14 0M32 18c8-12 20-8 14 0" fill="none" stroke="#0d2228" stroke-width="3"/></svg>',
  mystery: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 20h48v38H8z" fill="#7a3db0" stroke="#0d2228" stroke-width="3"/><path d="M4 12h56v10H4z" fill="#a060e0" stroke="#0d2228" stroke-width="3"/><text x="32" y="51" text-anchor="middle" font-size="30" font-weight="900" fill="#ffd23f" stroke="#0d2228" stroke-width="1.5">?</text></svg>',
  cursed: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 30c0-12 8-18 18-18s18 6 18 18v24H14z" fill="#5a6a5a" stroke="#0d2228" stroke-width="3"/><path d="M50 32c8 0 10 10 2 12" fill="none" stroke="#0d2228" stroke-width="3"/><circle cx="25" cy="34" r="4" fill="#7ae040"/><circle cx="39" cy="34" r="4" fill="#7ae040"/><path d="M24 46q8-6 16 0" fill="none" stroke="#0d2228" stroke-width="3"/><path d="M28 6c4 2 0 5 4 7M38 4c4 2 0 5 4 7" fill="none" stroke="#7ae040" stroke-width="2.5"/></svg>',
};
const worth = l => l.kind === 'cursed' ? `${l.v} points` : l.v == null ? '? points' : `+${l.v} points`;
const RULE = {
  normal: 'Highest bid wins it and pays. A tie splits the points.',
  mystery: 'Worth 0 to 10 points: nobody knows until it sells!',
  cursed: 'CURSED! The LOWEST bid takes it home, and everyone pays their bid.',
};

export function createView(ctx) {
  const { ui, players, me, init } = ctx;
  const watching = me == null, byPid = new Map(players.map(p => [p.pid, p]));
  const cpu = init.cpu ? { pid: 'cpu', name: init.cpu, color: '#9fb6c2', dark: '#5a7080', shape: 'diamond', portrait: '' } : null;
  const everyone = cpu ? [...players, cpu] : players;
  ui.innerHTML = `
    <div class="gg-top"><span class="gg-title">Going, Going, Gone!</span><span class="clock"><b>--</b></span></div>
    <div class="gg-lots"></div>
    <section class="gg-lot"><div class="gg-art"></div><div class="gg-txt"><small class="gg-no"></small><b class="gg-name"></b><strong class="gg-worth"></strong><span class="gg-rule"></span></div><p class="gg-stamp"></p></section>
    <section class="gg-paddle">
      <div class="gg-bidrow"><button class="gg-pm" data-d="-5" aria-label="Bid 5 less">−5</button><button class="gg-pm" data-d="-1" aria-label="Bid 1 less">−1</button>
        <span class="gg-bid"><small>Your bid</small><b>0</b><em></em></span>
        <button class="gg-pm" data-d="1" aria-label="Bid 1 more">+1</button><button class="gg-pm" data-d="5" aria-label="Bid 5 more">+5</button></div>
      <button class="gg-lock big-btn">Lock bid</button>
      <button class="gg-mash"><b>RUMMAGE!</b><span>Mash: every ${init.tapsPer} taps finds 1 ${BOLT} (up to ${init.cap} a round). Everyone hears it!</span><i class="gg-mbar"><u></u></i></button>
    </section>
    <div class="gg-players">${everyone.map(p => p.pid === 'cpu' ? `<span class="chip gg-cpu" data-pid="cpu" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">AG</i><b class="nm">${esc(p.name)}</b><em class="gg-e"></em><em class="gg-p"></em><i class="gg-rattle"></i><strong class="gg-b"></strong></span>` : chip(p, `<em class="gg-e"></em><em class="gg-p"></em><i class="gg-rattle"></i><strong class="gg-b"></strong>`)).join('')}</div>
    <p class="gg-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'show';
  if (me != null) ui.querySelector(`.gg-players [data-pid="${me}"]`)?.classList.add('me');
  const chipOf = new Map(everyone.map(p => [String(p.pid), ui.querySelector(`.gg-players [data-pid="${p.pid}"]`)]));
  let phase = 'show', round = -2, bid = 0, locked = false, found = 0, taps = 0, myEnergy = init.energy, last = null;

  function paintPaddle() {
    if (watching) return;
    $('.gg-bid b').textContent = bid;
    $('.gg-bid em').innerHTML = `of ${myEnergy} ${BOLT}`;
    ui.querySelectorAll('.gg-pm').forEach(b => { const d = +b.dataset.d; b.disabled = locked || (d < 0 ? bid === 0 : bid >= myEnergy); });
    const l = $('.gg-lock'); l.textContent = locked ? 'Locked! (tap to change)' : 'Lock bid'; l.classList.toggle('on', locked);
    const m = $('.gg-mash'); m.disabled = locked || found >= init.cap;
    m.querySelector('u').style.width = `${Math.min(1, taps / (init.tapsPer * init.cap)) * 100}%`;
    m.querySelector('b').textContent = found >= init.cap ? `Found ${init.cap}! Pockets empty` : found ? `RUMMAGE! (+${found} found)` : 'RUMMAGE!';
    ui.classList.toggle('is-locked', locked);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching || phase !== 'bid') return;
    if (t.classList.contains('gg-pm')) { const nb = Math.max(0, Math.min(myEnergy, bid + +t.dataset.d)); if (nb === bid) return; bid = nb; locked = false; ctx.send('bid', bid); ctx.sfx('coins'); paintPaddle(); }
    else if (t.classList.contains('gg-lock')) { locked = !locked; if (locked) ctx.send('bid', bid); ctx.send('lock', locked); ctx.sfx(locked ? 'good' : 'tap'); paintPaddle(); }
  });
  // mashing: count on pointerdown so fast taps are not lost to the click delay
  $('.gg-mash').addEventListener('pointerdown', e => {
    e.preventDefault(); if (watching || phase !== 'bid' || locked || found >= init.cap) return;
    ctx.send('mash'); taps++; if (taps % init.tapsPer === 0 && found < init.cap) { found++; myEnergy++; ctx.sfx('coins'); } else ctx.sfx('tap');
    const m = $('.gg-mash'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); paintPaddle();
  });

  function paintLots(g) {
    $('.gg-lots').innerHTML = g.lots.map((l, i) => {
      const w = l.win, now = i === g.round && g.phase !== 'end';
      const winners = w ? (w.length ? w.map(k => { const p = everyone.find(q => String(q.pid) === k); return p ? `<i class="gg-face" style="--seat:${p.color}">${p.portrait ? `<img src="${p.portrait}" alt="">` : 'AG'}</i>` : ''; }).join('') : '<em>unsold</em>') : '';
      return `<span class="gg-mini ${l.kind}${now ? ' now' : ''}${w ? ' done' : ''}"><span class="gg-mart">${LOT_ART[l.kind]}</span><b>${l.kind === 'cursed' ? l.v : l.v == null ? '?' : '+' + l.v}</b><span class="gg-who">${winners}</span></span>`;
    }).join('');
  }
  function paintLot(g) {
    const i = g.phase === 'show' ? 0 : Math.max(0, g.round), l = g.lots[i];
    const box = $('.gg-lot'); box.className = `gg-lot ${l.kind}`;
    $('.gg-art').innerHTML = LOT_ART[l.kind];
    $('.gg-no').textContent = g.phase === 'show' ? 'First up' : `Lot ${i + 1} of ${init.rounds}`;
    $('.gg-name').textContent = l.name; $('.gg-worth').textContent = worth(l); $('.gg-rule').textContent = RULE[l.kind];
    const st = $('.gg-stamp');
    if (g.phase === 'reveal') {
      const r = g.reveal, names = r.win.map(k => everyone.find(p => String(p.pid) === k)?.name || '?');
      st.textContent = l.kind === 'cursed' ? `Cursed! Stuck with it: ${names.join(' & ')} (${r.v})`
        : !r.win.length ? 'Unsold! Nobody bid.' : r.win.length > 1 ? `Tie at ${r.bids[r.win[0]]}! Split: ${names.join(' & ')} +${r.gain[r.win[0]]} each` : `SOLD to ${names[0]} for ${r.bids[r.win[0]]}! (+${r.gain[r.win[0]]})`;
      st.className = 'gg-stamp ' + (l.kind === 'cursed' ? 'bad' : r.win.length ? 'good' : '');
    } else { st.textContent = ''; st.className = 'gg-stamp'; }
  }
  function note(g) {
    if (g.phase === 'show') return init.solo ? `You against ${init.cpu}. Plan your ${init.energy} energy across all five lots!` : `Plan your ${init.energy} energy across all five lots!`;
    if (g.phase === 'end') return 'Going, going… GONE! Most points wins (a tie goes to whoever has more energy left).';
    if (g.phase === 'reveal') return '';
    if (watching) return `${g.locked.length} of ${players.length} bids locked in`;
    return locked ? 'Bid locked. Waiting for the others…' : 'Set your bid and lock it in. Energy spent is gone for good!';
  }

  return {
    priv(d) {
      if (phase !== 'bid') return;
      if (d.locked !== locked) locked = d.locked;
      if (d.found > found) found = d.found;
      if (taps < d.taps) taps = d.taps;
      paintPaddle();
    },
    state(g) {
      if (g.round !== round && g.phase === 'bid') { round = g.round; bid = 0; locked = false; found = 0; taps = 0; }
      if (g.phase !== phase) {
        if (g.phase === 'reveal') ctx.sfx(g.lots[g.round].kind === 'cursed' ? 'trap' : g.reveal.win.length ? 'coins' : 'bad');
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase; last = g;
      if (me != null) { myEnergy = g.energy[me]; if (bid > myEnergy) bid = myEnergy; }
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'bid' && g.left <= 3);
      $('.gg-title').textContent = g.phase === 'end' ? 'Final tally' : g.phase === 'reveal' ? 'Going, going…' : 'Going, Going, Gone!';
      paintLots(g); paintLot(g);
      const best = Math.max(...everyone.map(p => g.pts[p.pid] ?? 0));
      for (const p of everyone) {
        const k = String(p.pid), c = chipOf.get(k); if (!c) continue;
        c.querySelector('.gg-e').innerHTML = `${g.energy[k]}${BOLT}`;
        c.querySelector('.gg-p').textContent = `${g.pts[k]} pts`;
        const rat = g.phase === 'bid' ? (g.rattle?.[k] || 0) : 0;
        const r = c.querySelector('.gg-rattle'); r.textContent = rat ? `rummaging${'!'.repeat(Math.min(3, Math.ceil(rat / 4)))}` : ''; c.classList.toggle('rattling', rat > 0);
        c.classList.toggle('in', g.phase === 'bid' && (g.locked.includes(p.pid) || p.pid === 'cpu'));
        c.classList.toggle('lead', g.pts[k] === best && best > 0);
        const b = c.querySelector('.gg-b');
        if (g.phase === 'reveal') { b.textContent = `bid ${g.reveal.bids[k]}`; c.classList.toggle('won', g.reveal.win.includes(k)); }
        else { b.textContent = g.phase === 'bid' ? (g.locked.includes(p.pid) || p.pid === 'cpu' ? 'locked' : 'thinking…') : ''; c.classList.remove('won'); }
      }
      $('.gg-note').textContent = note(g);
      paintPaddle();
    },
    dispose() {},
  };
}
