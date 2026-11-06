// The goals screen: the open quest line, what is done, what each one unlocked, stats so far.

import { panel, el, fmt } from './dom.js';
import { CHAPTERS, UNLOCK_NAMES } from '../sim/quests.js';

export function openQuests(app) {
  const G = app.G;
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const p = panel('Goals', () => { if (app.mode === 'paused') app.mode = wasMode === 'paused' ? 'fly' : wasMode; });
  p.body.append(el('p', { class: 'hint' }, 'Each goal can be done anywhere, in any way. Finishing one opens up a new part of the game.'));
  CHAPTERS.forEach((ch, i) => {
    const done = i < G.quest.chapter, cur = i === G.quest.chapter;
    if (i > G.quest.chapter + 1) return;
    const have = Math.min(ch.need, ch.goal(G));
    const c = el('div', { class: 'card', style: cur ? 'border-color:var(--amber)' : done ? 'opacity:0.7' : 'opacity:0.45' },
      el('b', { class: done ? 'good' : cur ? 'amber' : '' }, `${done ? '✓ ' : ''}${ch.title}`),
      cur || done ? el('div', {}, ch.text) : el('div', { class: 'hint' }, 'Next…'),
      cur ? el('div', { class: 'hint' }, `${fmt(have)} / ${fmt(ch.need)} ${ch.unit}`) : '',
      (done || cur) && ch.unlock.length ? el('div', { class: 'hint' }, `${done ? 'Unlocked' : 'Unlocks'}: ${ch.unlock.map(u => UNLOCK_NAMES[u]).filter(Boolean).join(', ')}`) : '',
      (done || cur) && ch.reward?.cr ? el('div', { class: 'amber' }, `Reward: ${fmt(ch.reward.cr)} cr`) : '');
    p.body.append(c);
  });
  const s = G.stats;
  p.body.append(el('h3', { style: 'margin-top:12px' }, 'Your record'), el('div', { class: 'kv', html: [
    ['Ships destroyed', s.kills], ['Ore mined', s.mined], ['Units sold', s.sold], ['Trade profit', fmt(s.tradeProfit) + ' cr'], ['Jumps', s.jumps], ['Furthest danger', s.maxTier],
    ['People rescued', s.rescued], ['Giants slain', s.bossKills], ['Strongholds razed', s.strongholds], ['Times destroyed', s.deaths], ['Time played', Math.floor(G.playTime / 60) + ' min'],
  ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('') }));
}
