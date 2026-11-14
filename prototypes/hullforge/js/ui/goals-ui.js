// Goals: the current one with its progress, the ones done, and the ones still ahead (names only).

import { el, panel, num, credits as cr, $ } from './dom.js';
import { GOALS, currentGoal, goalProgress } from '../sim/goals.js';

export function openGoals(app) {
  if ($('#panels .goals-panel')) { $('#panels .goals-panel').closePanel(); return; }
  const G = app.G; const cur = currentGoal(G);
  const P = panel('Goals', null, { cls: 'goals-panel', sub: 'One at a time. Each pays when done.' });
  const list = el('div', { class: 'col', style: 'max-width:640px' }); P.body.append(list);
  for (const g of GOALS) {
    const done = G.goals.done.includes(g.id); const isCur = cur && g.id === cur.id;
    const p = goalProgress(G, g);
    const card = el('div', { class: 'card' + (isCur ? ' sel' : ''), style: done ? 'opacity:0.65' : '' },
      el('div', { class: 'row between' }, el('h4', { class: done ? 'good' : isCur ? 'amber' : 'dim' }, `${done ? '✓ ' : ''}${g.title}`), el('span', { class: 'price' }, cr(g.reward))),
      el('span', {}, done || isCur ? g.text : 'Later'));
    if (isCur) card.append(el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(p.have / p.need * 100)}%` })), el('small', { class: 'dim' }, `${num(p.have)} / ${num(p.need)}`));
    list.append(card);
  }
}
