// AUCTION OF CHAOS on a screen: a midnight curio auction. A strip of the six lots (sold ones carry the winner's
// face), the lot on the block (big picture, value on paper, tags, the auctioneer's clue), and on a phone that plays a
// bid box (- / + / all in / pass) with a lock button. "SOLD!" shows every bid at once. The finale opens each haul item
// by item — the twist line, the value going up or down, items eaten or given away struck through — then the totals.
import { chip, esc } from '../../client/gamehud.js';

const TAG_NAME = { food: 'food', hot: 'hot', cold: 'cold', shiny: 'shiny', animal: 'animal', toy: 'toy', music: 'music', spooky: 'spooky', paper: 'paper', plant: 'plant', magic: 'magic' };
const BARON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c9a46a"/><rect x="9" y="2" width="14" height="9" rx="1" fill="#1d1410"/><rect x="6" y="10" width="20" height="3" rx="1" fill="#1d1410"/><circle cx="12" cy="18" r="2" fill="#1d1410"/><circle cx="21" cy="18" r="3.4" fill="none" stroke="#ffd23f" stroke-width="1.6"/><circle cx="21" cy="18" r="1.5" fill="#1d1410"/><path d="M9 25 q7 -5 14 0" fill="none" stroke="#1d1410" stroke-width="2.2" stroke-linecap="round"/></svg>';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, lots = init.lots;
  const who = [...players, ...(init.cpu ? [{ pid: init.cpu.pid, name: init.cpu.name, color: '#c9a46a', dark: '#6b4518', shape: 'circle', portrait: '', cpu: true }] : [])];
  const byId = new Map(who.map(p => [String(p.pid), p]));
  const face = p => p?.cpu ? `<i class="ac-face">${BARON}</i>` : `<i class="ac-face" style="--seat:${p?.color || '#999'}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.innerHTML = `
    <div class="ac-top"><span class="ac-title">Auction of Chaos</span><span class="clock"><b>--</b></span></div>
    <div class="ac-strip">${lots.map((l, i) => `<span class="ac-mini" data-i="${i}"><b>${l.icon}</b><i class="ac-mini-who"></i></span>`).join('')}</div>
    <section class="ac-lot">
      <div class="ac-pic"></div>
      <div class="ac-info"><small class="ac-no"></small><b class="ac-name"></b><span class="ac-v"></span><span class="ac-tags"></span></div>
      <p class="ac-clue"></p>
      <div class="ac-sold"></div>
    </section>
    <section class="ac-bid">
      <button class="ac-pm" data-d="-1" aria-label="bid one less">−1</button>
      <div class="ac-mine"><small>your secret bid</small><b class="ac-n">0</b><span class="ac-of"></span></div>
      <button class="ac-pm" data-d="1" aria-label="bid one more">+1</button>
      <button class="ac-pm ac-q" data-d="3" aria-label="bid three more">+3</button>
      <div class="ac-quick"><button class="ac-q2" data-set="0">Pass (0)</button><button class="ac-q2" data-set="all">All in!</button></div>
      <button class="ac-lock big-btn">Lock bid</button>
    </section>
    <section class="ac-finale"></section>
    <div class="ac-chips">${who.map(p => p.cpu ? `<span class="chip ac-cpu" data-pid="${p.pid}" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">${BARON}</i><b class="nm">${esc(p.name)}</b><em class="ac-ch"></em><em class="ac-pp"></em><strong class="ac-st"></strong></span>` : chip(p, '<em class="ac-ch"></em><em class="ac-pp"></em><strong class="ac-st"></strong>')).join('')}</div>
    <p class="ac-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.ac-chips [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', lotI = -2, bid = 0, locked = false, myChips = init.chips, finaleShown = false, last = null;

  function paintLot(i) {
    const l = lots[Math.max(0, i)];
    $('.ac-pic').textContent = l.icon;
    $('.ac-no').textContent = i < 0 ? 'First lot' : `Lot ${i + 1} of ${lots.length}`;
    $('.ac-name').textContent = l.name;
    $('.ac-v').textContent = `Worth ${l.v} on paper`;
    $('.ac-tags').innerHTML = l.tags.length ? l.tags.map(t => `<i class="ac-tag ac-t-${t}">${TAG_NAME[t] || t}</i>`).join('') : '<i class="ac-tag">no tags</i>';
    $('.ac-clue').innerHTML = `<small>The auctioneer whispers:</small> “${esc(l.clue)}”`;
    $('.ac-lot').classList.remove('in'); void $('.ac-lot').offsetWidth; $('.ac-lot').classList.add('in');
  }
  function paintBid() {
    $('.ac-n').textContent = bid; $('.ac-of').textContent = `of ${myChips} chips`;
    ui.querySelectorAll('.ac-pm').forEach(b => { const d = +b.dataset.d; b.disabled = locked || (d < 0 ? bid <= 0 : bid >= myChips); });
    const l = $('.ac-lock'); l.textContent = locked ? `Locked at ${bid}! (tap to change)` : bid ? `Lock bid: ${bid}` : 'Lock: pass'; l.classList.toggle('on', locked);
  }
  function setBid(n) { bid = Math.max(0, Math.min(myChips, n)); locked = false; ctx.send('bid', bid); ctx.sfx('coins'); paintBid(); }
  ui.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || watching || phase !== 'bid') return;
    if (b.classList.contains('ac-pm')) setBid(bid + +b.dataset.d);
    else if (b.dataset.set) setBid(b.dataset.set === 'all' ? myChips : 0);
    else if (b.classList.contains('ac-lock')) { locked = !locked; ctx.send('lock', locked); ctx.sfx(locked ? 'good' : 'tap'); paintBid(); }
  });
  function paintStrip(g) {
    ui.querySelectorAll('.ac-mini').forEach((el, i) => {
      el.classList.toggle('now', i === g.lot && g.phase !== 'finale' && g.phase !== 'end');
      el.classList.toggle('done', i < g.won.length);
      const w = g.won[i];
      el.querySelector('.ac-mini-who').innerHTML = i < g.won.length ? (w == null ? '<u>unsold</u>' : face(byId.get(String(w)))) : '';
    });
  }
  function paintSold(s) {
    const l = lots[lotI], w = s.win != null ? byId.get(String(s.win)) : null;
    $('.ac-sold').innerHTML = `<div class="ac-hammer">${w ? `SOLD to ${esc(w.cpu ? w.name : w.pid === me ? 'you' : w.name)} for ${s.pay}!` : 'No sale!'}</div>
      <div class="ac-bids">${who.map(p => `<span class="ac-b${String(p.pid) === String(s.win) ? ' win' : ''}">${face(p)}<b>${s.bids[p.pid] ?? 0}</b></span>`).join('')}</div>`;
    ctx.sfx(w ? (String(s.win) === String(me) ? 'win' : 'coins') : 'tap');
    void l;
  }
  function paintFinale(g) {
    const f = g.final, order = [...who].sort((a, b) => f.total[b.pid] - f.total[a.pid]);
    $('.ac-finale').innerHTML = order.map((p, k) => {
      const rows = f.rows[p.pid] || [], curse = f.curse[p.pid] || 0;
      const gifted = f.moved.filter(m => String(m[1]) === String(p.pid));
      return `<div class="ac-haul" style="--d:${k * 0.15}s"><div class="ac-haul-h">${face(p)}<b>${esc(p.pid === me ? 'You' : p.name)}</b><strong class="ac-total">${f.total[p.pid]}</strong></div>
        ${rows.length ? rows.map((r, j) => { const it = lots.find(l => l.id === r.id), up = r.value > r.base, down = r.value < r.base;
          return `<div class="ac-row${r.dead ? ' dead' : ''}${up ? ' up' : ''}${down ? ' down' : ''}" style="--d:${0.4 + k * 0.15 + j * 0.45}s"><span class="ac-ic">${it.icon}</span><span class="ac-rn"><b>${esc(it.name)}</b><small${!r.dead && !r.hit ? ' class="ac-miss"' : ''}>${esc(r.dead ? r.note : r.hit ? (g.twists[r.id] || '') : `No twist this time (“${it.clue}”)`)}</small></span><span class="ac-val"><s>${r.base}</s>${r.value}</span></div>`; }).join('') : '<p class="ac-none">Won nothing.</p>'}
        ${curse ? `<div class="ac-row down" style="--d:${1 + k * 0.15}s"><span class="ac-ic">💀</span><span class="ac-rn"><b>Rivals' curses</b></span><span class="ac-val">${curse}</span></div>` : ''}
        ${gifted.map(m => `<div class="ac-row up" style="--d:${1.2 + k * 0.15}s"><span class="ac-ic">${lots.find(l => l.id === m[3]).icon}</span><span class="ac-rn"><b>A gift!</b><small>from ${esc(byId.get(String(m[0]))?.name || '?')}</small></span><span class="ac-val">+${m[2]}</span></div>`).join('')}
      </div>`;
    }).join('');
  }
  function note(g) {
    if (g.phase === 'ready') return watching ? 'Six curios. Every one hides a twist…' : 'Six curios, 15 chips. Chips are worth nothing at the end, so spend them!';
    if (g.phase === 'finale' || g.phase === 'end') {
      if (init.solo && me != null) { const a = g.scores[me], b = g.scores[init.cpu.pid]; return a > b ? `You out-bid ${init.cpu.name}, ${a} to ${b}!` : a === b ? `A draw with ${init.cpu.name}!` : `${init.cpu.name} wins, ${b} to ${a}.`; }
      return 'Twists revealed! Biggest haul wins.';
    }
    if (g.phase === 'sold') return '';
    if (watching) return `${g.in.length} of ${players.length} bids locked`;
    return locked ? 'Locked in. Waiting for the others…' : 'Set a secret bid and lock it in. A tie goes to whoever has fewer prizes.';
  }
  return {
    priv(d) { if (phase === 'bid' && d.bid != null) { bid = d.bid; locked = d.locked; paintBid(); } },
    state(g) {
      last = g;
      if (me != null && g.chips[me] != null) myChips = g.chips[me];
      if (g.lot !== lotI) { lotI = g.lot; bid = 0; locked = false; $('.ac-sold').innerHTML = ''; paintLot(g.lot); paintBid(); }
      if (g.phase !== phase) {
        if (g.phase === 'bid') { $('.ac-sold').innerHTML = ''; paintBid(); ctx.sfx('tap'); }
        if (g.phase === 'sold' && g.sold) paintSold(g.sold);
        if ((g.phase === 'finale' || g.phase === 'end') && !finaleShown && g.final) { finaleShown = true; paintFinale(g); ctx.sfx('win'); }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'bid' && g.left <= 2);
      $('.ac-title').textContent = g.phase === 'finale' || g.phase === 'end' ? 'The twists!' : 'Auction of Chaos';
      paintStrip(g);
      const best = Math.max(...Object.values(g.scores));
      for (const p of who) {
        const el = ui.querySelector(`.ac-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.ac-ch').textContent = g.chips[p.pid];
        el.querySelector('.ac-pp').textContent = g.final ? g.scores[p.pid] : `${g.scores[p.pid]}`;
        el.classList.toggle('final', !!g.final);
        el.classList.toggle('lead', !!g.final && g.scores[p.pid] === best && best > 0);
        el.classList.toggle('in', g.phase === 'bid' && (g.in || []).includes(p.pid));
        el.querySelector('.ac-st').textContent = g.phase === 'bid' && !p.cpu ? ((g.in || []).includes(p.pid) ? 'locked' : 'thinking…') : '';
      }
      $('.ac-note').textContent = note(g);
    },
    dispose() {},
  };
}
