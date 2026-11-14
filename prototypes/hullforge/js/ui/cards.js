// One item card for every screen (outfitter, hold, Shipyard palette). Lines come from items.js itemLines (the real
// numbers); a compare line shows the change against the best part of the same kind already on your ship.

import { el } from './dom.js';
import { itemLines, itemName, rarityOf, partStats, turretDps, itemDef, bonusText } from '../sim/items.js';
import { fmt } from '../../../../shared/format.js';

/** The main number of a part, for compare. */
export function mainValue(it) {
  const s = partStats(it); const d = itemDef(it);
  if (d.cat === 'turret') return { label: 'damage per second', v: turretDps(it) };
  return ({ bridge: { label: 'block limit', v: s.maxBlocks }, reactor: { label: 'power', v: s.power }, thruster: { label: 'thrust', v: s.thrust }, gyro: { label: 'turning force', v: s.torque }, shield: { label: 'shield', v: s.shield }, cargo: { label: 'ore room', v: s.cargo }, targeting: { label: 'auto-aim turrets', v: s.auto }, dronebay: { label: 'drones', v: s.bays }, scanner: { label: 'm scan reach', v: s.scan } })[it.kind]   /* world: + drone bay, scanner */ || { label: 'value', v: 0 };
}

/**
 * @param {object} it item
 * @param {{ fitted?: object[], price?: string, actions?: HTMLElement[], why?: string, sel?: boolean, note?: string }} o
 */
export function itemCard(it, o = {}) {
  const r = rarityOf(it); const def = itemDef(it);
  const card = el('div', { class: 'card' + (o.sel ? ' sel' : ''), style: `border-top:3px solid ${r.color}` });
  card.append(el('div', { class: 'row between' }, el('h4', { style: `color:${r.color}` }, itemName(it)), o.price ? el('span', { class: 'price' }, o.price) : ''));
  card.append(el('span', { class: 'rar', style: `color:${r.color}` }, `${r.name} ${def.cat === 'turret' ? 'turret' : 'part'}`));
  card.append(el('span', { class: 'dim' }, def.desc));
  const rows = el('div', { class: 'rows' });
  for (const [a, b] of itemLines(it)) rows.append(el('span', {}, a), el('b', {}, b));
  card.append(rows);
  if (it.bonus) card.append(el('span', { class: 'bonus' }, `Workshop bonus: ${bonusText(it)}`));   // economy: rolled bonus (already in the numbers above)
  const same = (o.fitted || []).filter(f => f.kind === it.kind && f.uid !== it.uid);
  if (same.length) {
    const best = same.reduce((a, b) => (mainValue(b).v > mainValue(a).v ? b : a));
    const mv = mainValue(it), bv = mainValue(best); const d = mv.v - bv.v;
    card.append(el('span', { class: 'cmp ' + (d > 0.001 ? 'good' : d < -0.001 ? 'bad' : 'dim') }, `${d >= 0 ? '+' : ''}${fmt(d, { decimals: 1 })} ${mv.label} vs your best fitted (${itemName(best)})`));
  } else if (o.fitted) card.append(el('span', { class: 'cmp dim' }, 'You have none of these fitted.'));
  if (o.note) card.append(el('span', { class: 'dim' }, o.note));
  if (o.why) card.append(el('span', { class: 'why' }, o.why));
  if (o.actions?.length) card.append(el('div', { class: 'row wrap' }, ...o.actions));
  return card;
}
