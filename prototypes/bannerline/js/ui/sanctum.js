// The Sanctum panel (owner round 2, R2.3): one-shot powers. Pick a power, then choose where it
// lands — the panel closes and js/main.js runs the targeting cursor (valid fields lit up, a ring of
// the power's radius, green where it may land, red where it may not). Defensive powers land in your
// own field, offensive ones in an enemy field, neutral ones anywhere. Powers add no income.

import { setText, toggle, shortSecs } from './dom.js';
import { icon } from './icons.js';
import { createTownPanel } from './townpanel.js';

const KIND_TEXT = {
  defensive: 'Cast in your own field — get out of a pinch.',
  offensive: 'Cast in an enemy field — cause mayhem while they defend.',
  neutral: 'Cast in any field.',
};

export function createSanctum({ root, sim, Q, player, isPad = false, iconUrl = () => null, onPick }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const base = createTownPanel({
    root, kind: 'sanctum', sim, player, isPad, navSelector: '.sc-pow',
    subtitle: 'Buy a power, then choose where it lands. Powers add no income.',
    footKbm: 'Click a power, then click where it lands (right-click or <kbd>Esc</kbd> cancels) · <kbd>P</kbd>/<kbd>Esc</kbd> close',
    footPad: '<kbd class="pad">A</kbd> pick a power, aim with the left stick, <kbd class="pad">A</kbd> cast, <kbd class="pad">B</kbd> cancel',
  });
  base.body.innerHTML = '<div class="sc-cols"></div>';
  const cols = base.body.querySelector('.sc-cols');
  let key = '';

  function build(info) {
    const kinds = ['defensive', 'offensive', 'neutral'];
    cols.innerHTML = kinds.map((k) => `<section class="sc-col k-${k}">
      <h4>${info.kinds?.[k]?.name || k}<small>${KIND_TEXT[k]}</small></h4>
      ${info.rows.filter((r) => r.kind === k).map((r) => {
        const url = r.icon ? iconUrl(r.icon) : null;
        return `<button class="sc-pow" data-pow="${r.id}" data-tip-render="bl-power" data-tip-pow="${r.id}" data-tip-player="${player}">
          <span class="sc-ic">${url ? `<img src="${url}" alt="">` : icon('bolt')}</span>
          <span class="sc-txt"><b>${r.name}</b><small>${r.stats[0] || ''}</small></span>
          <span class="sc-cost">${icon('coin')}<b>${r.cost}</b></span>
          <span class="sc-cd"></span>
        </button>`;
      }).join('')}
    </section>`).join('');
  }
  cols.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pow]'); if (!b) return;
    const row = Q.powersInfo(sim.state, data, player).rows.find((r) => r.id === b.dataset.pow);
    if (!row) return;
    if (!row.canBuy) { b.classList.remove('refused'); void b.offsetWidth; b.classList.add('refused'); return; }
    base.setOpen(false);
    onPick(row);
  });
  base.onOpenChange = (v) => { if (v) { key = ''; update(); const f = cols.querySelector('.sc-pow'); if (f) base.nav.focus(f); } };

  function update() {
    if (!base.open) return;
    base.purse();
    const info = Q.powersInfo(sim.state, data, player);
    const k = info.rows.map((r) => r.id).join();
    if (k !== key) { key = k; build(info); }
    for (const r of info.rows) {
      const el = cols.querySelector(`[data-pow="${r.id}"]`); if (!el) continue;
      toggle(el, 'can', r.canBuy);
      toggle(el, 'poor', r.reason === 'gold');
      toggle(el, 'cooling', r.readyIn > 0);
      setText(el.querySelector('.sc-cd'), r.readyIn > 0 ? shortSecs(r.readyIn / tickHz) + 's' : '');
    }
  }
  return Object.assign(base, { update, frame(f) { if (!base.open || !f) return false; base.nav.handle(f); return true; } });
}
