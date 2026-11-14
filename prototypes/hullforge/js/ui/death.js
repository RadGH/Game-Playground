// Ship lost: what it costs, then back at the last station. Parts are never lost (the salvage crew brings the
// wreck in); the ore and goods in the hold are gone unless full insurance covers them, and the rebuild bill comes out
// of your credits (as much as you have). economy: the bill and the cover come from sim/insurance.js deathBill.

import { el, btn, modal, credits as cr, num } from './dom.js';
import { save, cargoUsed } from '../sim/state.js';
import { deathBill, settleDeath } from '../sim/insurance.js';

export function openDeath(app) {
  const G = app.G;
  const d = deathBill(G);
  const cargo = cargoUsed(G);
  modal('Ship lost', (m, close) => {
    m.classList.add('death');
    m.append(
      el('p', {}, `${G.shipName} broke apart. The station's salvage crew towed the pieces home and rebuilt it.`),
      el('div', { class: 'kv', style: 'max-width:360px;margin:0 auto' },
        el('span', {}, 'Rebuild bill'), el('b', { class: d.plan ? 'dim' : 'amber' }, cr(d.before)),
        ...(d.plan ? [el('span', {}, `${d.plan.name} (${num(d.cut * 100)}% off)`), el('b', { class: 'good' }, `−${cr(d.before - d.bill)}`)] : []),
        el('span', {}, 'You pay'), el('b', { class: 'amber' }, cr(d.pay)),
        el('span', {}, 'Ore and goods'), el('b', { class: d.keepCargo ? 'good' : cargo ? 'bad' : '' }, d.keepCargo ? `Kept (${num(cargo)})` : `${num(cargo)} lost`),
        el('span', {}, 'Parts lost'), el('b', { class: 'good' }, 'None')),
      d.plan ? el('p', { class: 'hint' }, 'Your insurance is used up. Buy new cover at any station.') : el('p', { class: 'hint' }, 'Insurance at a station cuts this bill next time.'),
      btn('Back to the station', () => {
        settleDeath(G);
        app.deathShown = false; close(); save(G);
        app.enterSystem(G.system, { docked: true });
      }, 'primary'));
  }, { sticky: true });
}
