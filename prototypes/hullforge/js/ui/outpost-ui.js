// The outpost screen (F at the orbit spot or at your outpost): found one, then build and upgrade its six modules,
// see what it has stored against its room, collect it all, and the raid clock with what its guns would save.
// "Your outposts" (a station tile) lists every outpost with its store and next raid — collecting is done on site.

import { el, btn, panel, toast, num, credits as cr, $ } from './dom.js';
import { play } from '../core/audio.js';
import { save, cargoUsed, designGrid } from '../sim/state.js';
import { computeStats } from '../sim/stats.js';
import { outpostIn, foundOutpost, foundCost, buildModule, moduleCost, collectAll, produce, capOf, storedOre, levelOf, MODULES, MODULE_IDS, MAX_LEVEL, shortOf, raidLoss, oreTotal, RAID_WARN, oresOf, rateText } from '../sim/outposts.js';
import { ORES } from '../data/blocks.js';
import { refreshOutpost } from '../sim/worldsys.js';
import { itemName } from '../sim/items.js';

const mins = s => (s > 90 ? `${num(s / 60)} min` : `${num(Math.max(0, s))} s`);
const pct = v => `${Math.round(v * 100)}%`;
function stat(label, have, cap, show) {
  return el('div', { class: 'w-stat' }, el('span', {}, label), el('b', {}, `${show(have)} / ${show(cap)}`), el('div', { class: 'prog' }, el('i', { style: `width:${Math.min(100, Math.round(have / Math.max(1, cap) * 100))}%` })));
}
/** The store as four stat boxes. */
function storeBoxes(o) {
  const cap = capOf(o, o.danger);
  return el('div', { class: 'w-store' },
    stat('Credits', o.store.cr, cap.cr, v => cr(v)), stat('Ore', storedOre(o), cap.ore, num),
    stat('Parts', o.store.parts.length, cap.parts, num), stat('Research points', o.store.rp, cap.rp, num));
}
function raidBox(app, o) {
  const left = o.raid.at - (app.G.playTime || 0); const guns = levelOf(o, 'turrets') * 2;
  const soon = o.raid.warned && left > 0 && left <= RAID_WARN + 2;
  return el('div', { class: 'section w-raid' + (soon ? '' : ' calm') },
    el('h3', {}, soon ? `Raiders arrive in ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `Next raid in about ${mins(Math.max(0, left))} of play`),
    el('div', { class: 'kv', style: 'max-width:520px;margin-top:6px' },
      el('span', {}, 'Defence guns'), el('b', {}, guns ? `${num(guns)} guns` : 'None'),
      el('span', {}, 'If you are away'), el('b', { class: raidLoss(o) > 0.2 ? 'bad' : '' }, `It loses ${pct(raidLoss(o))} of its store`),
      el('span', {}, 'If you are here'), el('b', {}, 'Raiders come to strip it: beat them for their loot')),
    o.log.length ? el('ul', { class: 'w-log' }, ...o.log.slice(0, 4).map(t => el('li', {}, t))) : '');
}

export function openOutpost(app) {
  if ($('#panels .w-outpost')) return;
  const G = app.G; const sys = app.gal.systems[G.system];
  const P = panel(outpostIn(G, sys.id)?.name || `${sys.name} orbit`, null, { cls: 'w-outpost', sub: `${sys.name} · danger ${sys.danger}` });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const room = () => computeStats(designGrid(G)).cargo - cargoUsed(G);
  function draw() {
    credLine.textContent = `${cr(G.credits)} · ${num(oreTotal(G.cargo))} ore aboard`;
    const st = P.body.scrollTop;
    const o = outpostIn(G, sys.id);
    if (!o) {
      const cost = foundCost(sys.danger); const why = shortOf(G, cost);
      P.body.replaceChildren(el('div', { class: 'section', style: 'max-width:760px' },
        el('h3', {}, 'Found an outpost'),
        el('p', { class: 'hint', style: 'margin:6px 0 12px' }, `A small station in your colours, in orbit over ${sys.name}'s planet. It works while you are away and grows a piece for every module.`),
        el('div', { class: 'kv', style: 'max-width:420px' },
          el('span', {}, 'Cost'), el('b', { class: 'amber' }, `${cr(cost.cr)} + ${num(cost.ore)} ore`),
          el('span', {}, 'You have'), el('b', { class: why.length ? 'bad' : 'good' }, `${cr(G.credits)} · ${num(oreTotal(G.cargo))} ore`),
          el('span', {}, 'Ore taken'), el('b', {}, 'Any kind, cheapest first'),
          el('span', {}, 'Modules'), el('b', {}, MODULE_IDS.map(k => MODULES[k].name).join(', '))),
        el('div', { class: 'row', style: 'margin-top:14px' }, btn(`Found it — ${cr(cost.cr)} + ${num(cost.ore)} ore`, () => {
          const r = foundOutpost(G, sys); if (r.why) { toast(r.why, 'bad'); return; }
          if (app.w) refreshOutpost(app.w, G);
          play('rebuilt'); toast(`${r.outpost.name} founded.`, 'good'); save(G); P.head.querySelector('h2').textContent = r.outpost.name; draw();
        }, why.length ? '' : 'primary', { disabled: !!why.length }), why.length ? el('span', { class: 'why bad' }, `Needs ${why.join(' and ')}`) : '')));
      P.body.scrollTop = st; return;
    }
    produce(o, G.playTime || 0);
    const r = room(); const ore = storedOre(o);
    const anything = o.store.cr || o.store.rp || o.store.parts.length || ore;
    const collect = btn(anything ? `Collect all${ore > 0 && ore > r ? ` (ore: ${num(Math.max(0, r))} fit in your hold)` : ''}` : 'Nothing to collect yet', () => {
      const got = collectAll(G, o, Math.max(0, r));
      const bits = []; if (got.cr) bits.push(cr(got.cr)); if (got.ore) bits.push(`${num(got.ore)} ore`); if (got.parts) bits.push(`${num(got.parts)} parts`); if (got.rp) bits.push(`${num(got.rp)} research points`);
      play('coin'); toast(bits.length ? `Collected ${bits.join(', ')}` : 'Nothing fit in your hold.', 'gold'); save(G); draw();
    }, anything ? 'gold' : '', { disabled: !anything });
    const mods = el('div', { class: 'w-mods' });
    for (const k of MODULE_IDS) {
      const M = MODULES[k]; const L = levelOf(o, k); const top = L >= MAX_LEVEL;
      const cost = top ? null : moduleCost(k, L + 1, o.danger); const why = cost ? shortOf(G, cost) : [];
      const now = L ? rateText(k, L, o.danger) : 'Not built';
      const next = top ? '' : rateText(k, L + 1, o.danger);
      mods.append(el('div', { class: 'w-card', style: `--jc:${L ? '#62f0a8' : '#34476b'}` },
        el('div', { class: 'row between' }, el('h4', {}, M.name), el('span', { class: 'w-pips' }, ...[1, 2, 3].map(i => el('i', { class: i <= L ? 'on' : '' })))),
        el('p', {}, k === 'ore' ? `Digs the planet's ${oresOf(o).map(id => ORES[id].name.replace(' ore', '')).join(' and ')} ore.` : M.blurb),
        el('div', { class: 'kv' }, el('span', {}, 'Now'), el('b', {}, now), ...(top ? [] : [el('span', {}, `Level ${L + 1}`), el('b', { class: 'good' }, next), el('span', {}, 'Cost'), el('b', { class: 'amber' }, `${cr(cost.cr)} + ${num(cost.ore)} ore`)])),
        el('div', { class: 'row wrap' }, top ? el('span', { class: 'dim' }, 'Top level') : btn(L ? `Upgrade to level ${L + 1}` : 'Build', () => {
          const err = buildModule(G, o, k); if (err) { toast(err, 'bad'); return; }
          if (app.w) refreshOutpost(app.w, G);
          play('rebuilt'); toast(`${M.name} level ${levelOf(o, k)}`, 'good'); save(G); draw();
        }, why.length ? '' : 'primary', { disabled: !!why.length })),
        why.length && !top ? el('span', { class: 'why' }, `Needs ${why.join(' and ')}`) : ''));
    }
    const parts = o.store.parts.length ? el('p', { class: 'hint', style: 'margin-top:8px' }, `Made here: ${o.store.parts.map(itemName).join(', ')}`) : '';
    P.body.replaceChildren(
      el('div', { class: 'section', style: 'max-width:1100px' }, el('div', { class: 'row between', style: 'margin-bottom:10px' }, el('h3', {}, 'Stored'), collect), storeBoxes(o), parts),
      el('div', { style: 'max-width:1100px' }, raidBox(app, o)),
      el('div', { class: 'section', style: 'max-width:1100px' }, el('h3', { style: 'margin-bottom:10px' }, 'Modules'), mods));
    P.body.scrollTop = st;
  }
  draw();
  return P;
}

/** Every outpost at a glance (a station tile). */
export function openOutpostList(app, redraw) {
  const G = app.G;
  const P = panel('Your outposts', redraw, { sub: 'Collect at each outpost (fly there and press F)' });
  for (const o of G.outposts) {
    produce(o, G.playTime || 0);
    const built = MODULE_IDS.filter(k => levelOf(o, k)).map(k => `${MODULES[k].name} ${levelOf(o, k)}`).join(' · ') || 'No modules yet';
    P.body.append(el('div', { class: 'section', style: 'max-width:1100px' },
      el('div', { class: 'row between' }, el('h3', {}, o.name), el('span', { class: 'dim' }, `${app.gal.systems[o.system].name} · danger ${o.danger}`)),
      el('p', { class: 'hint', style: 'margin:4px 0 10px' }, built), storeBoxes(o)), raidBox(app, o));
  }
  return P;
}
