// The Outfitter panel (owner round 2, R2.2): the item shop. Your hero must stand next to the
// Outfitter to buy or sell; anywhere else the panel still opens (to browse and plan) and says
// "Walk to the Outfitter to buy", with a button that walks you there.
//
// Tabs (Weapons, Armour, Trinkets, Charms, Consumables) of item cards in the old hero-arena grid;
// a detail pane for the focused item (stats, description, "Unique: only one" mark, how many you
// carry) with Buy; and your six inventory slots along the bottom with Sell. Items stack: two copies
// take two slots and both count; a few `uniqueEquipped` items refuse a second copy.
//
//   mouse    click a tab / item, click Buy (or double-click an item) · click an inventory slot, Sell
//   keyboard arrows + Enter (Enter on an item buys it) · O / Esc closes
//   pad      d-pad moves, A buys the focused item / sells the focused slot, LB / RB switch tabs, B closes

import { h, setText, toggle } from './dom.js';
import { icon } from './icons.js';
import { createTownPanel } from './townpanel.js';

export const REASONS = {
  notAtShop: 'Walk to the Outfitter to buy', gold: 'Not enough gold', full: 'Your six slots are full — sell something first',
  uniqueEquipped: 'Unique: you can carry only one', dead: 'Your hero is down', over: 'The match is over', bad: 'Cannot do that',
  cooldown: 'Not ready yet', notUsable: 'This item is not used — it works while carried',
};

export function createOutfitter({ root, sim, Q, player, seat, isPad = false, iconUrl = () => null, onWalk = () => {} }) {
  const data = sim.data;
  const base = createTownPanel({
    root, kind: 'shop', sim, player, isPad, navSelector: '.ot-tab, .ot-item, .ot-inv, .ot-act:not([disabled])',
    subtitle: 'Weapons, armour, trinkets and draughts. Stand next to it to buy or sell.',
    footKbm: 'Click an item, then <b>Buy</b> (or double-click) · click a slot below to <b>Sell</b> · arrows + <kbd>Enter</kbd> · <kbd>O</kbd>/<kbd>Esc</kbd> close',
    footPad: '<kbd class="pad">A</kbd> buy / sell the focused item · <kbd class="pad">LB</kbd><kbd class="pad">RB</kbd> tabs · <kbd class="pad">B</kbd> close',
  });
  base.body.innerHTML = `
    <div class="ot-main">
      <div class="ot-away" hidden>${icon('boot')}<span>Walk to the Outfitter to buy.</span><button class="ot-act ot-walk" data-act="walk">Walk there</button></div>
      <div class="ot-tabs"></div>
      <div class="ot-grid"></div>
      <div class="ot-invrow"><span class="ot-invh">Your items</span><div class="ot-inv-grid"></div><div class="ot-totals"></div></div>
    </div>
    <div class="tw-detail"></div>`;
  const tabsEl = base.body.querySelector('.ot-tabs');
  const gridEl = base.body.querySelector('.ot-grid');
  const invEl = base.body.querySelector('.ot-inv-grid');
  const totalsEl = base.body.querySelector('.ot-totals');
  const away = base.body.querySelector('.ot-away');
  const detail = base.body.querySelector('.tw-detail');
  let tab = 0;
  let focus = null;                  // { kind: 'item', id } | { kind: 'slot', slot }
  let tabsKey = '', gridKey = '';
  const invBtns = Array.from({ length: data['items-bl']?.rules?.slots || 6 }, (_, i) => {
    const b = h('button', 'ot-inv', null, { type: 'button', 'data-slot': String(i), 'data-tip-render': 'bl-slot', 'data-tip-player': String(player), 'data-tip-slot': String(i) });
    invEl.append(b);
    return b;
  });

  function itemIcon(card) {
    const url = card?.icon ? iconUrl(card.icon) : null;
    return url ? `<img src="${url}" alt="" draggable="false">` : `<b>${(card?.name || '?').slice(0, 2)}</b>`;
  }

  function buildTabs(info) {
    tabsEl.innerHTML = info.tabs.map((t, i) => `<button class="ot-tab${i === tab ? ' on' : ''}" data-tab="${i}" data-tip="${t.desc}">${t.name}</button>`).join('');
  }
  function buildGrid(info) {
    const t = info.tabs[tab];
    gridEl.style.setProperty('--cols', info.columns || 4);
    gridEl.innerHTML = t.items.map((it) => `
      <button class="ot-item t${it.tier}${it.uniqueEquipped ? ' unique' : ''}" data-item="${it.id}" data-tip-render="bl-item" data-tip-item="${it.id}" data-tip-player="${player}">
        <span class="ot-ic">${itemIcon(it)}</span>
        <span class="ot-nm">${it.name}</span>
        <span class="ot-price">${icon('coin')}<b>${it.price}</b></span>
        <span class="ot-own"></span>
        ${it.uniqueEquipped ? '<span class="ot-uq" title="Unique: carry only one">★</span>' : ''}
        ${it.consumable ? '<span class="ot-use">use</span>' : ''}
      </button>`).join('');
  }

  function buy(id) { seat.issue({ type: 'buy', id }); pulse(gridEl.querySelector(`[data-item="${id}"]`)); }
  function sell(slot) { seat.issue({ type: 'sell', slot }); pulse(invBtns[slot]); }
  function pulse(el) { if (!el) return; el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought'); }

  base.body.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = Number(tb.dataset.tab); gridKey = ''; tabsKey = ''; update(0); return; }
    const it = e.target.closest('[data-item]');
    if (it) { focus = { kind: 'item', id: it.dataset.item }; if (e.detail === 0 || e.detail >= 2) buy(it.dataset.item); detail._k = ''; return; }
    const sl = e.target.closest('.ot-inv');
    if (sl) {
      const slot = Number(sl.dataset.slot);
      if (e.detail === 0 && focus?.kind === 'slot' && focus.slot === slot) sell(slot);   // pad / keyboard: second A sells
      focus = { kind: 'slot', slot }; detail._k = ''; return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'buy' && focus?.kind === 'item') buy(focus.id);
    if (act === 'sell' && focus?.kind === 'slot') sell(focus.slot);
    if (act === 'walk') onWalk();
  });
  base.body.addEventListener('mouseover', (e) => {
    const it = e.target.closest('[data-item]'); if (it) { focus = { kind: 'item', id: it.dataset.item }; return; }
    const sl = e.target.closest('.ot-inv'); if (sl) focus = { kind: 'slot', slot: Number(sl.dataset.slot) };
  });

  base.onOpenChange = (v) => {
    if (!v) return;
    tabsKey = ''; gridKey = '';
    update(0);
    const first = gridEl.querySelector('.ot-item.can') || gridEl.querySelector('.ot-item');
    if (first) { base.nav.focus(first); focus = { kind: 'item', id: first.dataset.item }; }
  };

  function update() {
    if (!base.open) return;
    base.purse();
    const info = Q.shopInfo(sim.state, data, player);
    const inv = Q.inventoryInfo(sim.state, data, player);
    tab = Math.min(tab, info.tabs.length - 1);
    const tk = info.tabs.map((t) => t.id).join() + '|' + tab;
    if (tk !== tabsKey) { tabsKey = tk; buildTabs(info); }
    const gk = info.tabs[tab].items.map((i) => i.id).join() + '|' + tab;
    if (gk !== gridKey) { gridKey = gk; buildGrid(info); }
    away.hidden = !!info.atShop;
    toggle(base.el, 'away', !info.atShop);
    const owned = {};
    for (const s of inv.slots) if (s) owned[s.id] = (owned[s.id] || 0) + 1;
    for (const it of info.tabs[tab].items) {
      const el = gridEl.querySelector(`[data-item="${it.id}"]`); if (!el) continue;
      toggle(el, 'can', it.canBuy);
      toggle(el, 'poor', it.reason === 'gold');
      toggle(el, 'blocked', !!it.reason && it.reason !== 'gold' && it.reason !== 'notAtShop');
      setText(el.querySelector('.ot-own'), owned[it.id] ? `×${owned[it.id]}` : '');
    }
    inv.slots.forEach((s, i) => {
      const b = invBtns[i]; if (!b) return;
      const k = s ? `${s.uid}|${s.chargesLeft}` : 'empty';
      if (b._k !== k) {
        b._k = k;
        b.innerHTML = s ? `<span class="ot-ic">${itemIcon(s)}</span>${s.consumable && s.chargesLeft > 1 ? `<i class="ot-ch">${s.chargesLeft}</i>` : ''}${s.uniqueEquipped ? '<span class="ot-uq">★</span>' : ''}<kbd>${i + 1}</kbd>` : `<kbd>${i + 1}</kbd>`;
      }
      toggle(b, 'empty', !s);
      toggle(b, 'sel', focus?.kind === 'slot' && focus.slot === i);
    });
    const tl = (inv.totalLines || []).join(' · ');
    setText(totalsEl, tl ? `Carried: ${tl}` : 'Six slots. Items stack — two swords both count.');
    // Detail pane follows the nav focus (pad / keyboard) or the mouse.
    const cur = base.nav.current;
    if (cur?.dataset.item) focus = { kind: 'item', id: cur.dataset.item };
    else if (cur?.classList.contains('ot-inv')) focus = { kind: 'slot', slot: Number(cur.dataset.slot) };
    drawDetail(info, inv, owned);
  }

  function drawDetail(info, inv, owned) {
    let html = '';
    if (focus?.kind === 'item') {
      const it = info.tabs.flatMap((t) => t.items).find((x) => x.id === focus.id);
      if (!it) return;
      const k = `i|${it.id}|${it.canBuy}|${it.reason}|${owned[it.id] || 0}`;
      if (detail._k === k) return; detail._k = k;
      html = `
        <div class="sd-top"><span class="sd-ic">${itemIcon(it)}</span><div><div class="sd-name">${it.name}</div><div class="sd-tier">${icon('coin')} ${it.price}${it.uniqueEquipped ? ' · <span class="uq">★ Unique</span>' : ''}${it.consumable ? ' · used up' : ''}</div></div></div>
        <ul class="sd-lines">${it.stats.map((l) => `<li>${l}</li>`).join('')}</ul>
        <p class="sd-traits">${it.desc || ''}</p>
        ${owned[it.id] ? `<p class="sd-note">You carry ${owned[it.id]}.${it.uniqueEquipped ? '' : ' Another copy adds its stats again.'}</p>` : ''}
        <div class="sd-actions one"><button class="ot-act sd-send" data-act="buy" ${it.canBuy ? '' : 'disabled'}>${icon('coin')} Buy for ${it.price}</button></div>
        ${it.reason ? `<p class="sd-why">${REASONS[it.reason] || it.reason}</p>` : ''}`;
    } else if (focus?.kind === 'slot') {
      const s = inv.slots[focus.slot];
      const k = `s|${focus.slot}|${s?.uid}|${s?.canSell}|${s?.chargesLeft}`;
      if (detail._k === k) return; detail._k = k;
      html = s ? `
        <div class="sd-top"><span class="sd-ic">${itemIcon(s)}</span><div><div class="sd-name">${s.name}</div><div class="sd-tier">Slot ${focus.slot + 1}${s.consumable ? ` · ${s.chargesLeft} left` : ''}</div></div></div>
        <ul class="sd-lines">${s.stats.map((l) => `<li>${l}</li>`).join('')}</ul>
        <div class="sd-actions one"><button class="ot-act sd-sell" data-act="sell" ${s.canSell ? '' : 'disabled'}>${icon('coin')} Sell for ${s.sellNow}</button></div>
        ${s.sellReason ? `<p class="sd-why">${s.sellReason === 'notAtShop' ? 'Walk to the Outfitter to sell' : REASONS[s.sellReason] || s.sellReason}</p>` : ''}
        ${s.consumable ? `<p class="sd-note">Press <kbd>${focus.slot + 1}</kbd> in the field to use it.</p>` : ''}`
        : '<p class="sd-note">An empty slot. Buy something to fill it.</p>';
    } else return;
    detail.innerHTML = html;
  }

  return Object.assign(base, {
    update,
    frame(f) {
      if (!base.open || !f) return false;
      const raw = f.rawPressed || [];
      if (raw.includes('LB') || raw.includes('RB')) {
        const n = Q.shopInfo(sim.state, data, player).tabs.length;
        tab = (tab + (raw.includes('RB') ? 1 : -1) + n) % n; gridKey = ''; tabsKey = ''; update(0);
        const first = gridEl.querySelector('.ot-item'); if (first) base.nav.focus(first);
      }
      base.nav.handle(f);
      return true;
    },
  });
}
