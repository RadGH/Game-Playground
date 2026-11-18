// A part's card, used by every bay: name in its rarity colour, maker + slot, its real numbers (after rarity and bonus
// lines — loadout.partNum, the same numbers the mission uses), bonus lines, and, when something is fitted there, the
// change to that number (green better, red worse). Lessons: stats with numbers, rounded, no code names.
import { fmt } from '../../../../shared/format.js';
import { partNum, RARITY_BY_ID, mechStats } from '../sim/loadout.js';
import { lineText } from '../sim/loot.js';

export const SLOT_LABEL = { head: 'Head', core: 'Core', arms: 'Arms', legs: 'Legs', booster: 'Booster', generator: 'Generator', cooling: 'Cooling', cpu: 'CPU', weapon: 'Weapon' };
export const PLACE_LABEL = { w0: 'Left arm', w1: 'Right arm', w2: 'Left shoulder', w3: 'Right shoulder' };
const TYPE = { kinetic: 'Kinetic', energy: 'Energy', explosive: 'Explosive', fire: 'Fire', electric: 'Electric' };
const LEGS = { biped: 'Two legs', reverse: 'Reverse joint', quad: 'Four legs', treads: 'Treads', hover: 'Hover' };

/** The numbers a card shows per slot: [key, label, unit, decimals, lowerIsBetter]. */
const NUMS = {
  weapon: [['block', 'Blocks', '%', 0], ['heal', 'Repairs', ' / s', 0], ['damage', 'Damage', '', 0], ['rate', 'Shots / s', '', 1], ['range', 'Range', ' m', 0], ['heatPerShot', 'Heat / shot', '', 0, 1], ['shotEnergy', 'Energy / shot', '', 0, 1], ['reload', 'Reload', ' s', 1, 1], ['weight', 'Weight', ' t', 1, 1]],
  head: [['ap', 'Armour', '', 0], ['scan', 'Scan', ' m', 0], ['energy', 'Energy draw', '', 0, 1], ['weight', 'Weight', ' t', 1, 1]],
  core: [['ap', 'Armour', '', 0], ['boostEff', 'Booster supply', '%', 0], ['energy', 'Energy draw', '', 0, 1], ['weight', 'Weight', ' t', 1, 1]],
  arms: [['ap', 'Armour', '', 0], ['aim', 'Aim', '%', 0], ['melee', 'Melee', '%', 0], ['weight', 'Weight', ' t', 1, 1]],
  legs: [['ap', 'Armour', '', 0], ['speed', 'Speed', ' km/h', 0], ['jump', 'Jump', ' m', 0], ['carry', 'Carries', ' t', 0], ['weight', 'Weight', ' t', 1, 1]],
  booster: [['thrust', 'Thrust', '', 0], ['qbThrust', 'Quick boost', '', 0], ['qbCost', 'Quick boost cost', '', 0, 1], ['boostCost', 'Boost cost', '', 0, 1], ['weight', 'Weight', ' t', 1, 1]],
  generator: [['capacity', 'Capacity', '', 0], ['recharge', 'Recharge', '', 0], ['output', 'Output', '', 0], ['weight', 'Weight', ' t', 1, 1]],
  cooling: [['sink', 'Heat capacity', '', 0], ['rate', 'Cooling', '', 0], ['energy', 'Energy draw', '', 0, 1], ['weight', 'Weight', ' t', 1, 1]],
  cpu: [['firmware', 'Firmware', '', 0], ['lockCount', 'Lock targets', '', 0], ['lockSpeed', 'Lock time', ' s', 2, 1], ['lockRange', 'Lock range', ' m', 0], ['weight', 'Weight', ' t', 1, 1]],
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function itemName(P, it) { return P[it.id]?.name || 'Unknown part'; }

/** One card's HTML. vs = the item fitted in that place now (for the change column), extra = HTML at the bottom. */
export function itemCard(g, it, { vs = null, extra = '', compact = false, tag = '' } = {}) {
  const p = g.P[it.id]; if (!p) return '';
  const r = RARITY_BY_ID[it.rarity] || RARITY_BY_ID.common, mk = g.MAKERS.find(m => m.id === p.maker);
  const pv = vs && g.P[vs.id];
  const rows = (NUMS[p.slot] || []).filter(([k]) => typeof partNum(p, it, k) === 'number' && (partNum(p, it, k) !== 0 || (k === 'damage' && !p.block && !p.heal))).map(([k, label, unit, dec, low]) => {
    const v = partNum(p, it, k);
    let d = '';
    if (pv && pv.slot === p.slot && vs !== it) {
      const o = partNum(pv, vs, k);
      if (typeof o === 'number') { const diff = v - o; if (Math.abs(diff) >= Math.pow(10, -dec) / 2) { const good = low ? diff < 0 : diff > 0; d = `<em class="${good ? 'of-up' : 'of-down'}">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), { decimals: dec })}</em>`; } }
    }
    return `<div><dt>${label}</dt><dd>${fmt(v, { decimals: dec })}${unit}${d}</dd></div>`;
  }).join('');
  const kind = p.slot === 'weapon' ? `${TYPE[p.type] || ''} · ${p.hand === 'two' ? 'two-handed' : p.mount === 'shoulder' ? 'shoulder' : 'arm'}` : p.slot === 'legs' ? LEGS[p.type] || '' : '';
  return `<article class="of-item${compact ? ' of-item-sm' : ''}" style="--rc:${r.colour}">
    <header><b>${esc(p.name)}</b>${tag}<small>${r.label} · ${mk?.short || ''} ${SLOT_LABEL[p.slot]}${kind ? ' · ' + kind : ''}${p.crafted ? ' · crafted' : ''}</small></header>
    <dl class="of-item-nums">${rows}</dl>
    ${it.rolls?.length ? `<ul class="of-item-rolls">${it.rolls.map(x => `<li>${lineText(x)}</li>`).join('')}</ul>` : ''}
    ${!compact && p.blurb ? `<p class="of-item-blurb">${esc(p.blurb)}</p>` : ''}
    ${extra}
  </article>`;
}

/** The whole frame's numbers, and (with `next`) how a change would move them. */
export function frameStats(g, build, next = null) {
  const a = mechStats(build, g.P, g.C), b = next ? mechStats(next, g.P, g.C) : null;
  const rows = [
    ['Armour', s => s.hp, 0, ''], ['Speed', s => s.speedMul * 100, 0, '%'], ['Boost', s => s.boostMul * 100, 0, '%'],
    ['Quick boost', s => s.qbMul * 100, 0, '%'], ['Energy', s => g.T.energyMax + s.energyMax, 0, ''], ['Recharge', s => s.regenMul * 100, 0, '%'],
    ['Heat capacity', s => g.T.heatMax + s.heatMax, 0, ''], ['Cooling', s => s.coolMul * 100, 0, '%'], ['Lock targets', s => s.lockCount, 0, ''],
    ['Crit chance', s => (s.critChance + g.T.critBase) * 100, 0, '%'], ['Load', s => s.load, 1, ' t', true], ['Firmware', s => s.firmware, 0, ''],
  ];
  return `<dl class="of-stats of-stats-wide">${rows.map(([label, f, dec, unit, low]) => {
    const v = f(a); let d = '';
    if (b) { const diff = f(b) - v; if (Math.abs(diff) >= Math.pow(10, -dec) / 2) { const good = low ? diff < 0 : diff > 0; d = `<em class="${good ? 'of-up' : 'of-down'}">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), { decimals: dec })}</em>`; } }
    const extra = label === 'Load' ? ` / ${fmt(a.carry, { decimals: 0 })} t` : '';
    return `<div class="${label === 'Load' && a.overweight > 0 ? 'of-bad' : ''}"><dt>${label}</dt><dd>${fmt(v, { decimals: dec })}${unit}${extra}${d}</dd></div>`;
  }).join('')}</dl>`;
}

export { esc };
