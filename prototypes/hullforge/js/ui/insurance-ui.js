// Insurance: two plans side by side, each with what it saves on THIS ship right now. A policy covers your next loss.
// The numbers live in sim/insurance.js (deathBill is also what the death screen reads).

import { el, btn, panel, toast, num, credits as cr } from './dom.js';
import { PLANS, premium, planBlock, buyPlan, rebuildBill } from '../sim/insurance.js';
import { save, cargoUsed } from '../sim/state.js';
import { play } from '../core/audio.js';

export function openInsurance(app, redraw) {
  const G = app.G;
  const P = panel('Insurance', redraw, { cls: 'ins-panel', sub: 'A policy covers your next lost ship' });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const draw = () => {
    credLine.textContent = cr(G.credits);
    const bill = rebuildBill(G); const cur = G.insurance ? PLANS[G.insurance.plan] : null;
    const status = el('div', { class: 'section ins-status ' + (cur ? 'on' : 'off') },
      el('div', {}, el('span', { class: 'hint' }, 'Your cover'), el('h3', {}, cur ? cur.name : 'Not insured'),
        el('span', { class: 'dim' }, cur ? `Paid ${cr(G.insurance.paid)}. Used up by your next loss.` : 'Lose the ship and you pay the full rebuild bill, and lose your cargo.')),
      el('div', { class: 'ins-bill' }, el('span', { class: 'hint' }, 'Rebuild bill for this ship'), el('b', { class: 'big-stat amber' }, cr(bill)), el('span', { class: 'dim' }, `Cargo now: ${num(cargoUsed(G))} units`)));
    const cards = el('div', { class: 'ins-cards' });
    for (const p of Object.values(PLANS)) {
      const price = premium(G, p.id); const why = planBlock(G, p.id); const mine = cur?.id === p.id;
      const upgrade = cur && cur.id !== p.id && cur.rate < p.rate;
      cards.append(el('div', { class: 'section ins-card' + (mine ? ' mine' : '') + (p.keepCargo ? ' full' : '') },
        el('div', { class: 'row between' }, el('h3', {}, p.name), mine ? el('span', { class: 'ins-badge' }, 'Your cover') : ''),
        el('div', { class: 'ins-cut' }, el('b', {}, `${num(p.cut * 100)}%`), el('span', {}, 'off the rebuild bill')),
        el('div', { class: 'kv' },
          el('span', {}, 'You would pay'), el('b', {}, `${cr(Math.round(bill * (1 - p.cut)))} instead of ${cr(bill)}`),
          el('span', {}, 'Ore and goods'), el('b', { class: p.keepCargo ? 'good' : 'bad' }, p.keepCargo ? 'Kept' : 'Lost'),
          el('span', {}, 'Parts'), el('b', { class: 'good' }, 'Never lost'),
          el('span', {}, 'Covers'), el('b', {}, 'One loss')),
        el('div', { class: 'row between ins-buy' }, el('span', { class: 'price' }, upgrade ? `Upgrade ${cr(price)}` : cr(price)),
          btn(mine ? 'Covered' : upgrade ? 'Upgrade' : 'Buy cover', () => {
            if (!buyPlan(G, p.id)) return;
            play('coin'); toast(`${p.name} bought. Your next loss is covered.`, 'good'); save(G); app.redrawStation?.(); draw();
          }, why ? '' : 'primary', { disabled: !!why, 'data-plan': p.id })),
        why && !mine ? el('span', { class: 'why' }, why) : ''));
    }
    P.body.replaceChildren(el('div', { class: 'ins-wrap' }, status, cards,
      el('p', { class: 'hint' }, 'The price follows the size of your ship: a bigger ship costs more to rebuild and more to cover.')));
  };
  draw();
}
