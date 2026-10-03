// Rich tooltips for Bannerline (owner R2.2: "nothing on screen should be unexplained"), on top of
// shared/tooltip.js. Elements opt in with data-tip-render="bl-…" plus data-tip-* attributes; the
// renderer reads the live sim, so numbers are always current.
//
//   bl-unit     data-tip-unit, data-tip-player      a Barracks unit
//   bl-item     data-tip-item [, data-tip-player]   an Outfitter item by id
//   bl-slot     data-tip-slot, data-tip-player      one of a hero's six inventory slots
//   bl-upgrade  data-tip-up, data-tip-player        a Drill Yard upgrade
//   bl-power    data-tip-pow, data-tip-player       a Sanctum power
//   bl-skill    data-tip-skill (slot), data-tip-player

import { registerTip } from '../../../../shared/tooltip.js';
import { fmt, hp as fmtHp } from '../../../../shared/format.js';

const ARM = { light: 'Light', heavy: 'Heavy', spectral: 'Spectral', hide: 'Hide', fortified: 'Fortified' };
const DMG = { blade: 'Blade', pierce: 'Pierce', fire: 'Fire', nature: 'Nature' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function installGameTips(getCtx) {
  const ctx = () => { const c = getCtx(); return c && c.sim ? c : null; };
  const pid = (el) => Number(el.dataset.tipPlayer || 0);

  registerTip('bl-unit', (el) => {
    const c = ctx(); if (!c) return null;
    const r = c.Q.sendInfo(c.sim.state, c.sim.data, pid(el), el.dataset.tipUnit);
    if (!r) return null;
    return `<div class="tt"><b class="tt-h">${esc(r.name)}</b> <span class="tt-sub">tier ${r.tier}${r.roleText ? ' · ' + esc(r.roleText) : ''}</span>
      <div>${r.cost} gold · ${r.income > 0 ? `<span class="tt-good">+${fmt(r.income, { decimals: 1 })} income</span>` : 'adds no income'}${r.paybackSeconds != null ? ` · pays back in ${r.paybackSeconds} s` : ''}</div>
      <div>${fmtHp(r.hp)} health${r.bodies > 1 ? ` ×${r.bodies}` : ''} · ${ARM[r.armour]} armour · ${fmt(r.dps, { decimals: 0 })} ${DMG[r.dmg]} dps</div>
      ${(r.counters?.lines || []).length ? `<div class="tt-dim">${r.counters.lines.map(esc).join(' · ')}</div>` : ''}
      ${(r.traitsText || []).length ? `<div class="tt-dim"><i>${r.traitsText.map(esc).join(' ')}</i></div>` : ''}
      <div class="tt-key">Click to hire · hold to keep hiring</div></div>`;
  });

  const itemHtml = (card, extra = '') => `<div class="tt"><b class="tt-h">${esc(card.name)}</b> <span class="tt-sub">${card.price} gold${card.uniqueEquipped ? ' · <span class="tt-gold">★ Unique</span>' : ''}</span>
    ${(card.stats || []).map((l) => `<div class="tt-good">${esc(l)}</div>`).join('')}
    ${card.desc ? `<div class="tt-dim"><i>${esc(card.desc)}</i></div>` : ''}${extra}</div>`;

  registerTip('bl-item', (el) => {
    const c = ctx(); if (!c) return null;
    const card = c.Q.itemCard(c.sim.data, el.dataset.tipItem);
    if (!card) return null;
    return itemHtml(card, `<div class="tt-key">${card.uniqueEquipped ? 'You can carry only one. ' : 'Copies stack: each one counts. '}Buy at the Outfitter.</div>`);
  });

  registerTip('bl-slot', (el) => {
    const c = ctx(); if (!c) return null;
    const v = c.Q.itemView(c.sim.state, c.sim.data, pid(el), Number(el.dataset.tipSlot));
    if (!v) return `<div class="tt"><b class="tt-h">Empty slot ${Number(el.dataset.tipSlot) + 1}</b><div class="tt-dim">Six slots, no slot types: buy anything at the Outfitter.</div></div>`;
    const how = v.consumable ? `Press ${Number(el.dataset.tipSlot) + 1} (or click) to use · ${v.chargesLeft} left` : 'Works while carried';
    return itemHtml(v, `<div class="tt-key">${how} · sells for ${v.sellNow} at the Outfitter</div>`);
  });

  registerTip('bl-upgrade', (el) => {
    const c = ctx(); if (!c) return null;
    const r = c.Q.upgradesInfo(c.sim.state, c.sim.data, pid(el)).rows.find((x) => x.id === el.dataset.tipUp);
    if (!r) return null;
    return `<div class="tt"><b class="tt-h">${esc(r.name)}</b> <span class="tt-sub">level ${r.level} / ${r.max}</span>
      <div>${esc(r.desc)}</div>${r.stats.map((l) => `<div class="tt-good">${esc(l)}</div>`).join('')}
      <div class="tt-key">${r.cost == null ? 'Fully trained' : `Next level: ${r.cost} gold`}</div></div>`;
  });

  registerTip('bl-power', (el) => {
    const c = ctx(); if (!c) return null;
    const r = c.Q.powersInfo(c.sim.state, c.sim.data, pid(el)).rows.find((x) => x.id === el.dataset.tipPow);
    if (!r) return null;
    const where = { defensive: 'Lands in your own field', offensive: 'Lands in an enemy field', neutral: 'Lands in any field' }[r.kind];
    return `<div class="tt"><b class="tt-h">${esc(r.name)}</b> <span class="tt-sub">${esc(r.kindName)} · ${r.cost} gold</span>
      <div>${esc(r.desc)}</div>${r.stats.map((l) => `<div class="tt-good">${esc(l)}</div>`).join('')}
      <div class="tt-key">${where}. Click, then click where it lands.</div></div>`;
  });

  registerTip('bl-skill', (el) => {
    const c = ctx(); if (!c) return null;
    const hi = c.Q.heroInfo(c.sim.state, c.sim.data, pid(el));
    const sk = hi?.skills?.find((s) => s.slot === el.dataset.tipSkill);
    if (!sk) return null;
    const tick = c.sim.data.econ?.clock?.tickHz || 20;
    return `<div class="tt"><b class="tt-h">${esc(sk.name)}</b> <span class="tt-sub">rank ${sk.rank} / ${sk.maxRank}${sk.mp ? ` · ${sk.mp} mana` : ''}${sk.cooldown ? ` · ${fmt(sk.cooldown / tick, { decimals: 1 })} s cooldown` : ''}</span>
      <div>${esc(sk.desc || '')}</div>
      <div class="tt-key">${sk.rank > 0 ? 'Press its key to cast at the cursor' : 'Not learned yet'}${sk.canLearn ? ' · Ctrl + key (pad: LT + button) learns a rank' : ''}</div></div>`;
  });
}
