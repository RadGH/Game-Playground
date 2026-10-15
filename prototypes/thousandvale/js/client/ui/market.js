// THE MARKET tab of the party window (round 11, owner report #25): players sell equipment and materials to each other at
// their own price. Three views:
//   Browse   search, Equipment / Items, a slot (or kind), a sort; each row is the item (card on hover / controller focus),
//            who sells it, how long it has left, the price (and the price each for a stack) and Buy
//   Sell     your bag's sellable things (the server's fee quote for each); pick one, ask a price, see the fee, list it
//   Mine     your listings (n of 20) with what is left of their 30 days and Take off (the item comes back by mail)
// The server is the judge of everything (js/sim/market.js): this window shows its numbers — the fee is the server's quote,
// never worked out here. Everything bought, sold, taken off or unsold arrives by MAIL. DOM only.
//
//   const market = createMarket({ net, hud, bag, me })   ->   { panel, wire, state }   (panel is docked in the party window)

import { createPanel, h, confirmBox } from '../ui-panel.js';
import { itemCell, itemName, goldText } from './item-cell.js';
import { onIcon, iconsActive } from './item-icons.js';
import { hideTip } from './tips.js';
import { MARKET, GEAR_SUBS, ITEM_SUBS, SORTS } from '../../sim/market-rules.js';

/** "29 days" / "5 hours" / "under an hour" left until `t`. */
export function timeLeft(t, now = Date.now()) {
  const ms = (t || 0) - now;
  if (ms <= 0) return 'ending';
  const d = Math.floor(ms / 86400000), hr = Math.floor(ms / 3600000);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} left` : hr >= 1 ? `${hr} hour${hr === 1 ? '' : 's'} left` : 'under an hour left';
}
/** "12 gold" or "12 gold (2.4 each)". */
export function priceText(price, count = 1) {
  const each = count > 1 ? price / count : 0;
  return goldText(price) + (count > 1 ? ` (${each >= 10 ? Math.round(each) : Math.round(each * 10) / 10} each)` : '');
}

export function createMarket({ net: getNet, hud, bag, me }) {
  const net = () => getNet();
  const S = { view: 'browse', filter: { q: '', tab: '', slot: '', sort: 'cheap', page: 0 }, page: null, mine: null, pick: null, price: '', busy: false, note: '' };
  const panel = createPanel({ id: 'market', title: 'Market', width: 460, cls: 'market-panel',
    onOpen: () => { iconsActive(true, 'market'); net()?.market?.('mine'); if (S.view === 'browse') browse(); draw(); },
    onClose: () => { iconsActive(false, 'market'); hideTip(); } });
  const gold = () => bag?.state?.gold ?? 0;
  function browse(patch = {}) { Object.assign(S.filter, patch); net()?.market?.('browse', { ...S.filter }); }

  function draw() {
    if (!panel.isOpen) return;
    const n = S.mine ? S.mine.list.length : null;
    const tabs = h('div.mk-views', { role: 'tablist' },
      ...[['browse', 'Browse'], ['sell', 'Sell'], ['mine', n == null ? 'My listings' : `My listings (${n}/${S.mine.cap})`]].map(([id, label]) =>
        h('button.mk-view', { type: 'button', role: 'tab', 'aria-selected': String(S.view === id), dataset: { view: id }, onclick: () => { S.view = id; S.note = ''; if (id === 'browse') browse(); else net()?.market?.('mine'); draw(); } }, label)));
    const body = S.view === 'sell' ? drawSell() : S.view === 'mine' ? drawMine() : drawBrowse();
    panel.fill(tabs, ...body, S.note ? h('p.mk-note.warn-text', {}, S.note) : null);
  }

  // ---- browse ----
  function drawBrowse() {
    const f = S.filter;
    const q = h('input.mk-q', { type: 'search', maxLength: MARKET.qMax, placeholder: 'Search by name', value: f.q, 'aria-label': 'Search the Market',
      onkeydown: e => { if (e.key === 'Enter') { browse({ q: q.value.trim(), page: 0 }); e.preventDefault(); } } });
    const subs = f.tab === 'gear' ? GEAR_SUBS : f.tab === 'items' ? ITEM_SUBS : null;
    const chips = h('div.chips.mk-tabs', { role: 'radiogroup', 'aria-label': 'Show' },
      ...[['', 'All'], ['gear', 'Equipment'], ['items', 'Materials and items']].map(([id, label]) =>
        h('button.chip', { type: 'button', role: 'radio', 'aria-checked': String(f.tab === id), dataset: { tab: id || 'all' }, onclick: () => browse({ tab: id, slot: '', page: 0 }) }, label)));
    const sub = subs ? h('select.mk-sub', { 'aria-label': f.tab === 'gear' ? 'Slot' : 'Kind', onchange: e => browse({ slot: e.target.value, page: 0 }) },
      ...subs.map(s => h('option', { value: s.id, selected: s.id === f.slot }, s.label))) : null;
    const sort = h('select.mk-sort', { 'aria-label': 'Sort', onchange: e => browse({ sort: e.target.value, page: 0 }) }, ...SORTS.map(s => h('option', { value: s.id, selected: s.id === f.sort }, s.label)));
    const p = S.page;
    const pages = p ? Math.max(1, Math.ceil(p.total / (p.per || MARKET.per))) : 1;
    const rows = p ? p.list.map(row => {
      const it = row.item || { name: '(gone)' };
      const afford = gold() >= row.price;
      return h('li.mk-row' + (row.mine ? '.mine' : ''), { tabIndex: 0, dataset: { id: String(row.id), tipRender: 'item', tipItem: String(it.uid) } },
        itemCell(it, { small: true }),
        h('div.mk-what', {}, h('div', {}, itemName(it), row.count > 1 ? h('span.mk-count', {}, ` x${row.count}`) : null),
          h('small.dim', {}, row.mine ? `Yours · ${timeLeft(row.expiresAt)}` : `${row.seller} · ${timeLeft(row.expiresAt)}`)),
        h('div.mk-price', {}, h('b', {}, goldText(row.price)), row.count > 1 ? h('small.dim', {}, priceText(row.price, row.count).replace(/^.*\(/, '').replace(')', '')) : null),
        row.mine ? h('button.ghost.small', { type: 'button', disabled: true, title: 'Your own listing — take it off under My listings.' }, 'Yours')
          : h('button.primary.small', { type: 'button', dataset: { act: 'buy' }, disabled: S.busy || !afford, title: afford ? '' : `You have ${goldText(gold())}.`, onclick: e => { e.stopPropagation(); buy(row); } }, 'Buy'));
    }) : [];
    return [
      h('div.mk-bar', {}, q, h('button.ghost.small', { type: 'button', onclick: () => browse({ q: q.value.trim(), page: 0 }) }, 'Search')),
      chips,
      h('div.mk-bar', {}, sub, sort, h('span.grow'), h('small.dim', {}, `You have ${goldText(gold())}`)),
      !p ? h('p.empty', {}, 'Looking…') : rows.length ? h('ul.mk-list', {}, rows) : h('p.empty', {}, f.q || f.tab ? 'Nothing for sale matches that.' : 'Nothing is for sale yet. Be the first: open Sell.'),
      p && p.total > (p.per || MARKET.per) ? h('div.mk-pager', {},
        h('button.ghost.small', { type: 'button', disabled: f.page <= 0, onclick: () => browse({ page: f.page - 1 }) }, '‹ Back'),
        h('span.dim', {}, `Page ${f.page + 1} of ${pages} · ${p.total} for sale`),
        h('button.ghost.small', { type: 'button', disabled: f.page + 1 >= pages, onclick: () => browse({ page: f.page + 1 }) }, 'More ›')) : null,
    ];
  }
  async function buy(row) {
    const it = row.item || {};
    if (!await confirmBox(`Buy ${row.count > 1 ? row.count + ' x ' : ''}${it.name || 'this'} from ${row.seller} for ${goldText(row.price)}? It comes to you by mail.`, { yes: `Buy for ${goldText(row.price)}` })) return;
    S.busy = true; draw();
    net()?.market?.('buy', { id: row.id, price: row.price });
    setTimeout(() => { if (S.busy) { S.busy = false; draw(); } }, 6000);
  }

  // ---- sell ----
  function drawSell() {
    const m = S.mine;
    if (!m) return [h('p.empty', {}, 'Looking…')];
    if (m.canSell) return [h('p.mk-intro', {}, m.canSell)];
    const quotes = new Map((m.quotes || []).map(x => [x.uid, x]));
    const items = (bag?.state?.bag || []).filter(it => quotes.has(it.uid));
    if (S.pick && !items.some(it => it.uid === S.pick)) S.pick = null;
    const intro = h('p.mk-intro', {}, `Pick something to sell, then ask your price. The listing fee is ${m.feePct}% of what a shop would pay for it, paid now and not paid back. It stays up for ${Math.round((m.lastsMs || MARKET.lastsMs) / 86400000)} days; whatever happens, it reaches you by mail.`);
    const grid = h('div.mk-grid', {}, items.length ? items.map(it => {
      const c = itemCell(it, { onclick: () => { S.pick = it.uid; S.price = S.price || ''; S.note = ''; draw(); } });
      c.tabIndex = 0; c.classList.add('mk-pick'); if (S.pick === it.uid) c.classList.add('on');
      c.addEventListener('keydown', e => { if (e.key === 'Enter') { S.pick = it.uid; draw(); } });
      if ((it.count || 1) > 1) c.appendChild(h('span.n', {}, String(it.count)));
      return c;
    }) : h('p.empty', {}, 'Nothing in your bag can be sold here (kept things, quest items and boxes stay with you).'));
    if (m.list.length >= m.cap) return [intro, h('p.warn-text', {}, `You already have ${m.cap} things on the Market. Wait for a sale or take one off.`), grid];
    const it = items.find(i => i.uid === S.pick), qt = it && quotes.get(it.uid);
    if (!it) return [intro, grid];
    const price = h('input.mk-price-in', { type: 'number', min: MARKET.priceMin, max: m.priceMax || MARKET.priceMax, step: 1, value: S.price, placeholder: 'Your price', 'aria-label': 'Your price in gold',
      oninput: () => { S.price = price.value; check(); } });
    const go = h('button.primary', { type: 'button', dataset: { act: 'list' }, onclick: () => list(it, qt) }, 'Put it on the Market');
    const why = h('small.mk-why.warn-text');
    function check() {
      const v = Math.floor(+price.value || 0);
      const bad = !(v >= MARKET.priceMin && v <= (m.priceMax || MARKET.priceMax)) ? 'Ask a whole number of gold.' : qt.fee > gold() ? `The fee is ${goldText(qt.fee)}; you have ${goldText(gold())}.` : '';
      why.textContent = price.value === '' ? '' : bad;
      go.disabled = !!bad || S.busy;
      go.textContent = bad || price.value === '' ? 'Put it on the Market' : `Put it on the Market for ${goldText(v)}`;
    }
    const n = it.count || 1;
    const form = h('div.mk-form', {},
      h('div.mk-chosen', {}, itemCell(it), h('div', {}, itemName(it), n > 1 ? h('span.mk-count', {}, ` x${n} (sold together)`) : null)),
      h('dl.mk-facts', {},
        h('dt', {}, 'A shop pays'), h('dd', {}, goldText(qt.sell)),
        h('dt', {}, 'Listing fee'), h('dd', { dataset: { fee: String(qt.fee) } }, h('b', {}, goldText(qt.fee)), h('small.dim', {}, ` (${m.feePct}% of what a shop pays, paid now)`)),
        h('dt', {}, 'You carry'), h('dd', {}, goldText(gold()))),
      h('label.fl', {}, h('span', {}, n > 1 ? 'Price for all ' + n : 'Price'), price, h('small', {}, 'gold')), why,
      h('div.row.end', {}, h('button.ghost', { type: 'button', onclick: () => { S.pick = null; draw(); } }, 'Back'), h('span.grow'), go));
    check();
    setTimeout(() => { if (document.activeElement === document.body) price.focus({ preventScroll: true }); }, 0);
    return [intro, form, grid];
  }
  async function list(it, qt) {
    const price = Math.floor(+S.price || 0);
    if (!(price >= 1)) return;
    if (!await confirmBox(`Put ${it.count > 1 ? it.count + ' x ' : ''}${it.name} on the Market for ${goldText(price)}? The fee is ${goldText(qt.fee)}, paid now and not paid back if you take it off.`, { yes: `List it (fee ${goldText(qt.fee)})` })) return;
    S.busy = true; draw();
    net()?.market?.('sell', { uid: it.uid, price });
    setTimeout(() => { if (S.busy) { S.busy = false; draw(); } }, 6000);
  }

  // ---- mine ----
  function drawMine() {
    const m = S.mine;
    if (!m) return [h('p.empty', {}, 'Looking…')];
    const rows = m.list.map(row => {
      const it = row.item || { name: '(gone)' };
      return h('li.mk-row.mine', { tabIndex: 0, dataset: { id: String(row.id), tipRender: 'item', tipItem: String(it.uid) } },
        itemCell(it, { small: true }),
        h('div.mk-what', {}, h('div', {}, itemName(it), row.count > 1 ? h('span.mk-count', {}, ` x${row.count}`) : null), h('small.dim', {}, `${timeLeft(row.expiresAt)} · fee paid ${goldText(row.fee || 0)}`)),
        h('div.mk-price', {}, h('b', {}, goldText(row.price))),
        h('button.ghost.small', { type: 'button', dataset: { act: 'cancel' }, onclick: e => { e.stopPropagation(); cancel(row); } }, 'Take off'));
    });
    return [h('p.mk-intro', {}, `${m.list.length} of ${m.cap} on sale. Sold things pay you by mail; anything taken off or unsold after ${Math.round((m.lastsMs || MARKET.lastsMs) / 86400000)} days comes back by mail.`),
      rows.length ? h('ul.mk-list', {}, rows) : h('p.empty', {}, 'You have nothing on the Market.')];
  }
  async function cancel(row) {
    const it = row.item || {};
    if (!await confirmBox(`Take ${it.name || 'it'} off the Market? It comes back to you by mail. The fee is not paid back.`, { yes: 'Take it off' })) return;
    net()?.market?.('cancel', { id: row.id });
  }

  function wire(n) {
    n.on('marketList', m => { S.page = m; draw(); });
    n.on('marketMine', m => { S.mine = m; draw(); });
    n.on('marketR', r => {
      S.busy = false;
      if (!r.ok) { S.note = r.msg || 'That did not work.'; hud.toast(S.note, 'warn'); if (r.op === 'buy' && (r.why === 'gone' || r.why === 'changed')) browse(); draw(); return; }
      S.note = '';
      if (r.op === 'sell') { hud.toast(`On the Market: ${r.name || 'your item'}`, 'good'); hud.chat?.(`You put ${r.name || 'an item'} on the Market for ${goldText(r.price)} (fee ${goldText(r.fee)}).`, 'system'); S.pick = null; S.price = ''; S.view = 'mine'; }
      else if (r.op === 'buy') { hud.toast(`Bought ${r.name || 'it'} — it is in your mail`, 'good'); hud.chat?.(`You bought ${r.name || 'an item'} on the Market for ${goldText(r.price)}. It is waiting in your mail.`, 'system'); browse(); }
      else if (r.op === 'cancel') { hud.toast('Taken off the Market — it is in your mail', 'info'); }
      net()?.market?.('mine');
      draw();
    });
    n.on('bag', () => { if (panel.isOpen && S.view !== 'browse') net()?.market?.('mine'); else if (panel.isOpen) draw(); });
  }
  onIcon(() => { if (panel.isOpen) { clearTimeout(draw.t); draw.t = setTimeout(draw, 80); } });

  return { panel, wire, draw, get state() { return S; } };
}
