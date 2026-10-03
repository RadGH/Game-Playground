// Armory panel, M1 cut: the abstract gear steps (docs/interfaces.md `upgrade`, `gearInfo`).
// 8 slots, each upgraded through 7 steps (Plain ... Legendary roll). B toggles it; G buys the
// cheapest open step from anywhere. M4 replaces this with the real shop + inventory, keeping the
// "any upgrade within two presses" rule: B then click (or B then G); on a pad, View then A
// (the panel opens with "Buy the cheapest upgrade" focused). The panel also carries Muster, a
// potion, and the deck (A on a deck slot cycles it through the roster), so a pad player never
// needs a mouse.

import { h, setText, toggle, clockText } from './dom.js';
import { icon } from './icons.js';
import { createMenuNav } from './menunav.js';

export function createShop({ root, sim, Q, player, seat, isPad = false }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const panel = h('div', 'shop-panel', null, { 'data-ui': true, hidden: true });
  panel.innerHTML = `
    <div class="sp-head"><b>Armory</b><span class="sp-spent"></span><button class="sp-close" data-act="close" aria-label="Close">×</button></div>
    <button class="sp-best" data-act="best"><span>${icon('hammer')} Buy the cheapest upgrade</span><b class="sp-best-c"></b>${isPad ? '<kbd class="pad">A</kbd>' : '<kbd>G</kbd>'}</button>
    <div class="sp-grid"></div>
    <div class="sp-row">
      <button class="sp-misc" data-act="muster"><span>${icon('crown')} Muster</span><b class="sp-muster-c"></b></button>
      <button class="sp-misc" data-act="potion"><span>${icon('potion')} Potion</span><b>25</b></button>
    </div>
    <div class="sp-deck-h">Weapon oil <small class="sp-oil-note"></small></div>
    <div class="sp-oil">${['blade', 'pierce', 'fire', 'nature'].map((t) => `<button class="sp-oilb" data-oil="${t}" data-type="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div class="sp-deck-h">Deck <small>${isPad ? 'A on a send swaps it for the next unit' : 'click a send to swap it for the next unit'}</small></div>
    <div class="sp-deck"></div>
    <div class="sp-foot">Each step replaces the last: more damage, health and armour. Steps open over the match.</div>`;
  root.append(panel);
  const grid = panel.querySelector('.sp-grid');
  const cells = [];
  for (let i = 0; i < 8; i++) {
    const c = h('button', 'sp-slot', null, { type: 'button', 'data-slot': String(i) });
    c.innerHTML = '<span class="sp-name"></span><span class="sp-step"></span><span class="sp-pips"></span><span class="sp-next"></span>';
    grid.append(c); cells.push(c);
  }
  panel.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') setOpen(false);
    if (act === 'best') seat.issue({ type: 'upgrade' });
    if (act === 'muster') seat.issue({ type: 'muster' });
    if (act === 'potion') seat.issue({ type: 'potion' });
    const oil = e.target.closest('[data-oil]')?.dataset.oil;
    if (oil) seat.issue({ type: 'oil', dmgType: oil });
    const di = e.target.closest('[data-deck]')?.dataset.deck;
    if (di != null) cycleDeck(Number(di));
    const slot = e.target.closest('[data-slot]')?.dataset.slot;
    if (slot != null) seat.issue({ type: 'upgrade', slot: Number(slot) });
  });
  let open = false;
  const nav = createMenuNav(panel, { initial: '.sp-best', onBack: () => setOpen(false) });
  function setOpen(v) { open = v; panel.hidden = !v; if (v) { update(); nav.focus('.sp-best'); } }
  const deckEl = panel.querySelector('.sp-deck');
  const deckBtns = [0, 1, 2, 3].map((i) => { const b = h('button', 'sp-send', null, { type: 'button', 'data-deck': String(i) }); deckEl.append(b); return b; });
  function cycleDeck(i) {
    const me = sim.state.players[player];
    const roster = data.races.races[me.race].units;
    const deck = me.deck.slice();
    let j = roster.indexOf(deck[i]);
    for (let k = 0; k < roster.length; k++) {
      j = (j + 1) % roster.length;
      if (!deck.includes(roster[j])) break;
    }
    deck[i] = roster[j];
    seat.issue({ type: 'deck', units: deck });
  }

  function update() {
    if (!open) return;
    const gi = Q.gearInfo(sim.state, data, player);
    setText(panel.querySelector('.sp-spent'), `${Math.round(gi.spent || 0)} gold spent`);
    setText(panel.querySelector('.sp-best-c'), gi.cheapest ? `${gi.cheapest.cost}` : '—');
    toggle(panel.querySelector('.sp-best'), 'off', !gi.cheapest || sim.state.players[player].gold < gi.cheapest.cost);
    const me = sim.state.players[player];
    const mi = Q.musterInfo(sim.state, data, player);
    setText(panel.querySelector('.sp-muster-c'), mi.next ? String(mi.next.cost) : 'max');
    const oilCost = data.econ?.items?.oil?.cost ?? 80;
    setText(panel.querySelector('.sp-oil-note'), `${oilCost} gold · half your damage becomes that type${me.oil ? ` · now: ${me.oil}` : ''}`);
    for (const b of panel.querySelectorAll('.sp-oilb')) toggle(b, 'on', me.oil === b.dataset.oil);
    me.deck.forEach((u, i) => setText(deckBtns[i], `${'ZXCV'[i]} · ${data.units.units[u]?.name || u}`));
    gi.slots.forEach((s, i) => {
      const c = cells[i];
      setText(c.querySelector('.sp-name'), s.name);
      setText(c.querySelector('.sp-step'), s.stepName || 'Empty');
      const pk = String(s.step);
      const pips = c.querySelector('.sp-pips');
      if (pips._k !== pk) { pips._k = pk; pips.innerHTML = Array.from({ length: 7 }, (_, j) => `<i class="${j <= s.step ? 'on' : ''}${j >= 5 ? ' r' : ''}"></i>`).join(''); }
      const n = s.next;
      setText(c.querySelector('.sp-next'), !n ? 'Complete' : !n.unlocked ? `${n.stepName} · opens in ${clockText(n.unlockIn / tickHz)}` : `${n.stepName} · ${n.cost} gold`);
      toggle(c, 'can', !!n?.canBuy);
      toggle(c, 'locked', !!n && !n.unlocked);
      toggle(c, 'done', !n);
    });
  }

  return {
    update, setOpen,
    toggle() { setOpen(!open); },
    /** Open with the Oil row focused (O key, the control bar's Oil button). */
    openOil() { setOpen(true); nav.focus('.sp-oilb'); },
    /** Pad input while open: d-pad moves, A buys, B closes. */
    frame(f) { if (open) nav.handle(f); },
    get open() { return open; },
    destroy() { nav.destroy(); panel.remove(); },
  };
}
