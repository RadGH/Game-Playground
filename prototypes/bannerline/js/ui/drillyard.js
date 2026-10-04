// The Drill Yard panel (owner round 2, R2.3): levelled upgrades for every unit you send — the ones
// already marching too. One row per upgrade: icon, name, what a level does, level pips, the next
// cost and a Train button. Works from anywhere. Mouse, keyboard (arrows + Enter) and pad (A).

import { h, setText, toggle } from './dom.js';
import { icon } from './icons.js';
import { createTownPanel } from './townpanel.js';

const REASONS = { gold: 'Not enough gold', max: 'Fully trained', maxLevel: 'Fully trained', over: 'The match is over', bad: 'Cannot do that' };

export function createDrillYard({ root, sim, Q, player, seat, isPad = false, iconUrl = () => null }) {
  const data = sim.data;
  const base = createTownPanel({
    root, kind: 'drillyard', sim, player, isPad, navSelector: '.dy-row',
    subtitle: 'Train your army. Every level applies to all the units you send — even the ones already marching.',
    footKbm: 'Click a row (or arrows + <kbd>Enter</kbd>) to train the next level · <kbd>U</kbd>/<kbd>Esc</kbd> close',
    footPad: '<kbd class="pad">A</kbd> train the next level · <kbd class="pad">B</kbd> close',
  });
  base.body.innerHTML = '<div class="dy-list"></div><div class="dy-side"><div class="dy-spent"></div><p class="dy-note">Upgrades never add income — they make every unit you send hit harder, last longer and tear more banners.</p></div>';
  const list = base.body.querySelector('.dy-list');
  let key = '';

  function build(info) {
    list.innerHTML = info.rows.map((r) => {
      const url = r.icon ? iconUrl(r.icon) : null;
      return `<button class="dy-row" data-up="${r.id}" data-tip-render="bl-upgrade" data-tip-up="${r.id}" data-tip-player="${player}">
        <span class="dy-ic">${url ? `<img src="${url}" alt="">` : icon('hammer')}</span>
        <span class="dy-txt"><b>${r.name}</b><small>${r.stats[0] || r.desc}</small></span>
        <span class="dy-pips"></span>
        <span class="dy-cost"></span>
      </button>`;
    }).join('');
  }
  list.addEventListener('click', (e) => {
    const r = e.target.closest('[data-up]'); if (!r) return;
    seat.issue({ type: 'upgradeUnit', id: r.dataset.up });
    r.classList.remove('bought'); void r.offsetWidth; r.classList.add('bought');
  });
  base.onOpenChange = (v) => { if (v) { key = ''; update(); const f = list.querySelector('.dy-row'); if (f) base.nav.focus(f); } };

  function update() {
    if (!base.open) return;
    base.purse();
    const info = Q.upgradesInfo(sim.state, data, player);
    const k = info.rows.map((r) => r.id).join();
    if (k !== key) { key = k; build(info); }
    for (const r of info.rows) {
      const el = list.querySelector(`[data-up="${r.id}"]`); if (!el) continue;
      const pk = `${r.level}/${r.max}`;
      const pips = el.querySelector('.dy-pips');
      if (pips._k !== pk) { pips._k = pk; pips.innerHTML = Array.from({ length: r.max }, (_, i) => `<i class="${i < r.level ? 'on' : ''}"></i>`).join(''); }
      setText(el.querySelector('.dy-cost'), r.cost == null ? 'Max' : `${r.cost}`);
      el.querySelector('.dy-cost').classList.toggle('coin', r.cost != null);
      toggle(el, 'can', r.canBuy);
      toggle(el, 'poor', r.reason === 'gold');
      toggle(el, 'maxed', r.cost == null);
    }
    setText(base.body.querySelector('.dy-spent'), `${Math.round(info.spent || 0)} gold spent on training`);
  }

  return Object.assign(base, { update, frame(f) { if (!base.open || !f) return false; base.nav.handle(f); return true; }, REASONS });
}
