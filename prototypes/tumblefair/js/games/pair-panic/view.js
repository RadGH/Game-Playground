// PAIR PANIC on a screen: one table of chunky cards (star backs) under a big "do this now" line, the players' chips on
// top. During the PEEK every card is face up; then they turn over and you tap. A card someone flips turns over on every
// phone with that player's colour round it and their initial in the corner (so colour is never the only clue). A
// pair pops off the table into its taker's colour, a miss shakes and turns back, a snatch shouts "SNATCHED!".
// Halloween: purple card backs with a moon and bats, and the Halloween prize pictures (looks only).
import { chip } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { prizeSvg, prizeName } from '../memory-icons.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', n = init.cols * init.rows;
  const P = new Map(players.map(p => [p.pid, p]));
  ui.style.setProperty('--cols', init.cols); ui.style.setProperty('--rows', init.rows);
  ui.innerHTML = `
    <div class="pp-top"><span class="pp-title">${HW ? 'Spooky Pairs' : 'Pair Panic'}</span><span class="clock"><b>--</b></span></div>
    <div class="pp-board">${players.map(p => chip(p, '<em class="sc">0</em><strong class="st"></strong>')).join('')}</div>
    <div class="pp-now"></div>
    <div class="pp-table">${Array.from({ length: n }, (_, i) => `<button class="pp-card" data-i="${i}" aria-label="card ${i + 1}"><span class="pp-in"><span class="pp-back"></span><span class="pp-front"></span></span><i class="pp-tag"></i></button>`).join('')}</div>
    <p class="pp-note"></p>`;
  const $ = s => ui.querySelector(s), cards = [...ui.querySelectorAll('.pp-card')], juice = createJuice(ctx);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.pp-board [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', b = -1, shown = new Array(n).fill(-2), gs = null;   // shown[i]: the picture drawn on card i (-1 = face down, -2 = nothing yet)
  const initial = pid => (pid === me ? 'You' : (P.get(pid)?.name || '?').slice(0, 1).toUpperCase());
  function face(i, pic) { if (shown[i] === pic) return; shown[i] = pic; cards[i].querySelector('.pp-front').innerHTML = pic >= 0 ? prizeSvg(pic, HW) : ''; if (pic >= 0) cards[i].setAttribute('aria-label', prizeName(pic, HW)); }
  function setCard(i, { up = false, gone = false, who = 0 } = {}) {
    const c = cards[i]; c.classList.toggle('up', up || gone); c.classList.toggle('gone', gone); c.classList.toggle('mine', who === me && !!who);
    const p = P.get(who); c.style.setProperty('--who', p ? p.color : 'transparent');
    c.querySelector('.pp-tag').textContent = who ? initial(who) : '';
  }
  function now(text, cls = '') { const e = $('.pp-now'); if (e.textContent !== text) e.textContent = text; e.className = 'pp-now ' + cls; }
  ui.addEventListener('pointerdown', e => {
    const c = e.target.closest('.pp-card'); if (!c || watching || phase !== 'play' || !gs) return;
    e.preventDefault(); const i = +c.dataset.i;
    if (gs.lock.includes(me) || c.classList.contains('gone')) return;
    ctx.send('flip', i); c.classList.add('press'); setTimeout(() => c.classList.remove('press'), 160);
  });
  const nameOf = pid => (pid === me ? 'You' : P.get(pid)?.name || '?');
  function paint(g) {
    for (const p of players) {
      const c = ui.querySelector(`.pp-board [data-pid="${p.pid}"]`); if (!c) continue;
      c.querySelector('.sc').textContent = g.sc[p.pid];
      const s = g.streak[p.pid] || 0; c.querySelector('.st').textContent = g.phase === 'end' ? `${g.pairs[p.pid]} pairs` : s >= 2 ? `🔥${s}` : '';
      c.classList.toggle('locked', !!g.lock?.includes(p.pid));
    }
    const best = Math.max(0, ...Object.values(g.sc)); for (const p of players) ui.querySelector(`.pp-board [data-pid="${p.pid}"]`)?.classList.toggle('lead', g.sc[p.pid] === best && best > 0);
  }
  function endNote(g) {
    if (init.solo && me != null) { const s = g.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
    return 'Points: 2 a pair, +1 / +2 for a streak, +1 for a table\'s last pair.';
  }
  return {
    state(g) {
      gs = g;
      if (g.b !== b) { b = g.b; shown.fill(-2); for (let i = 0; i < n; i++) { setCard(i); cards[i].classList.remove('gone', 'pop'); } }
      if (g.phase !== phase) {
        if (g.phase === 'play') { now(watching ? 'Find the pairs!' : 'FIND PAIRS! Tap two cards', 'go'); ctx.sfx('pick'); }
        if (g.phase === 'deal' && phase === 'play') juice.say(HW ? 'Table cleared! Boo-tiful!' : 'Table cleared!', 1200);
        if (g.phase === 'end') { ctx.sfx('win'); }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.phase === 'peek') { for (let i = 0; i < n; i++) { face(i, g.peek[i]); setCard(i, { up: true }); } now(`PEEK! Remember the cards… ${g.left}`, 'peek'); }
      else if (g.phase === 'play' || g.phase === 'deal') {
        const up = new Map(g.up.map(u => [u[0], u])), gone = new Set(g.gone);
        for (let i = 0; i < n; i++) {
          if (up.has(i)) { const [, pic, who] = up.get(i); face(i, pic); setCard(i, { up: true, who }); }
          else if (gone.has(i)) setCard(i, { gone: true });
          else setCard(i);
        }
        if (g.phase === 'play' && !watching) {
          const mine = g.up.filter(u => u[2] === me);
          if (g.lock.includes(me)) now('Not a pair! Wait…', 'bad');
          else if (mine.length === 1) now(`Now find the other ${prizeName(mine[0][1], HW).toUpperCase()}!`, 'go');
          else now('FIND PAIRS! Tap two cards', 'go');
        }
      } else if (g.phase === 'ready') now(watching ? 'Get ready to peek…' : 'Get ready to PEEK!', 'peek');
      else if (g.phase === 'end') now('Time!', 'go');
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      ui.classList.toggle('can-tap', g.phase === 'play' && !watching && !g.lock?.includes(me));
      paint(g); $('.pp-note').textContent = g.phase === 'end' ? endNote(g) : g.phase === 'play' ? 'Tip: tap a card a friend is holding up to SNATCH it!' : '';
    },
    event(ev) {
      if (ev.e === 'flip') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'pair') {
        for (const i of [ev.i, ev.j]) { const c = cards[i]; face(i, ev.pic); c.style.setProperty('--who', P.get(ev.pid)?.color || '#fff'); c.classList.add('up', 'pop'); setTimeout(() => c.classList.remove('pop'), 600); }
        if (ev.pid === me) { ctx.sfx(ev.last ? 'coins' : 'good'); juice.flash('#7dff8a', 220); juice.say(`+${ev.pts}${ev.streak >= 2 ? `  🔥${ev.streak} in a row!` : ''}${ev.last ? '  Last pair!' : ''}`, 900, 'pp-pts'); }
        else if (watching) ctx.sfx('good');
      } else if (ev.e === 'miss') {
        if (ev.pid === me) { ctx.sfx('bad'); for (const i of [ev.i, ev.j]) { cards[i].classList.remove('shake'); void cards[i].offsetWidth; cards[i].classList.add('shake'); } }
      } else if (ev.e === 'snatch') {
        if (ev.pid === me) juice.say('SNATCHED!', 900, 'pp-pts');
        else if (ev.from === me) { ctx.sfx('trap'); juice.flash('#ff5f5f', 260); juice.say(`${nameOf(ev.pid)} snatched your card!`, 1100); }
      } else if (ev.e === 'drop') { if (ev.pid === me) ctx.sfx('tap'); }
    },
    frame(dt, t) { juice.frame(dt, t); },
    dispose() { juice.dispose(); },
  };
}
