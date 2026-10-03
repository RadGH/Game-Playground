// Armory panel, M1 cut: the abstract gear steps (docs/interfaces.md `upgrade`, `gearInfo`).
// 8 slots, each upgraded through 7 steps (Plain ... Legendary roll). B toggles it; G buys the
// cheapest open step from anywhere. M4 replaces this with the real shop + inventory, keeping the
// "any upgrade within two presses" rule: B then click (or B then G).

import { h, setText, toggle, clockText } from './dom.js';
import { icon } from './icons.js';

export function createShop({ root, sim, Q, player, seat }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const panel = h('div', 'shop-panel', null, { 'data-ui': true, hidden: true });
  panel.innerHTML = `
    <div class="sp-head"><b>Armory</b><span class="sp-spent"></span><button class="sp-close" data-act="close" aria-label="Close">×</button></div>
    <button class="sp-best" data-act="best"><span>${icon('hammer')} Buy the cheapest upgrade</span><b class="sp-best-c"></b><kbd>G</kbd></button>
    <div class="sp-grid"></div>
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
    const slot = e.target.closest('[data-slot]')?.dataset.slot;
    if (slot != null) seat.issue({ type: 'upgrade', slot: Number(slot) });
  });
  let open = false;
  function setOpen(v) { open = v; panel.hidden = !v; }

  function update() {
    if (!open) return;
    const gi = Q.gearInfo(sim.state, data, player);
    setText(panel.querySelector('.sp-spent'), `${Math.round(gi.spent || 0)} gold spent`);
    setText(panel.querySelector('.sp-best-c'), gi.cheapest ? `${gi.cheapest.cost}` : '—');
    toggle(panel.querySelector('.sp-best'), 'off', !gi.cheapest || sim.state.players[player].gold < gi.cheapest.cost);
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
    get open() { return open; },
    destroy() { panel.remove(); },
  };
}
