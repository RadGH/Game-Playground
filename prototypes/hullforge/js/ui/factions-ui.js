// The Standing screen (L, the ☰ menu, or a station's Standing tile): one row per faction with a bar from −100 to
// 100 that marks every level, where you are now, how far to the next level, and what each level gives — all read
// from sim/factions.js REP_LEVELS.

import { el, panel, num, $ } from './dom.js';
import { FACTIONS, FACTION_IDS, REP_LEVELS, repOf, repLevel, nextLevel, levelPerks, stationOwner } from '../sim/factions.js';
import { fmt } from '../../../../shared/format.js';

const HOW = {
  traders: 'Up: jobs at their stations, saving convoys, patching freighters, killing pirates. Down: robbing convoys, shooting traders.',
  navy: 'Up: jobs at patrol stations, bounties on wanted captains, killing pirates and the Hive. Down: shooting patrol ships.',
  pirate: 'Up: joining convoy raids, shooting traders or the patrol. Down: every pirate you destroy.',
  swarm: 'Every Hive ship you destroy sinks it further. It never rises.',
};

export function openStanding(app, redraw) {
  if ($('#panels .w-standing')) { $('#panels .w-standing').closePanel(); return; }
  const G = app.G; const here = app.gal.systems[G.system]; const owner = stationOwner(here);
  const P = panel('Standing', redraw, { cls: 'w-standing', sub: `${here.name} Station is run by ${FACTIONS[owner].name}` });
  const pos = v => `${(v + 100) / 2}%`;
  for (const f of FACTION_IDS) {
    const F = FACTIONS[f]; const v = repOf(G, f); const L = repLevel(G, f); const nx = nextLevel(G, f);
    const bar = el('div', { class: 'w-rep' });
    for (const lv of REP_LEVELS.slice(1)) bar.append(el('b', { style: `left:${pos(lv.min)}` }), el('span', { style: `left:${pos(lv.min)}` }, lv.name));
    bar.append(el('i', { style: `left:${pos(v)}` }));
    const left = el('div', {},
      el('h3', {}, F.name), el('p', { class: 'blurb' }, F.blurb), bar,
      el('div', { class: 'w-rep-now' }, el('b', { style: `color:${L.color}` }, `${L.name} · ${fmt(v, { decimals: 1 })}`),
        el('span', { class: 'dim' }, F.fixed ? 'Never rises' : nx ? `${fmt(nx.min - v, { decimals: 1 })} more to ${nx.name}` : 'The top level')),
      el('p', { class: 'w-how' }, HOW[f]));
    const table = el('div', { class: 'w-levels' });
    for (const lv of REP_LEVELS) {
      const on = lv === L ? ' on' : '';
      table.append(el('div', { class: on.trim() }, el('b', { style: `color:${lv.color}` }, lv.name), el('div', { class: 'dim' }, lv.min > -100 ? `from ${num(lv.min)}` : 'below −50')),
        el('div', { class: on.trim() }, el('ul', {}, ...levelPerks(f, lv).map(t => el('li', {}, t)))));
    }
    P.body.append(el('div', { class: 'section w-fac', style: `--fc:${F.color};max-width:1100px` }, left, table));
  }
  return P;
}
