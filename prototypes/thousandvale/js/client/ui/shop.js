// Play-test 2 Q11 — shop windows for merchants, smiths, traders and the stablehand (protocol v6):
//
//   shop {op:'open', npc}                 -> shopView {npc, name, role, title, stock:[{id, item, price, mount?}], buyback:[{uid, item, price}], sellRate}
//   shop {op:'buy', npc, id} · {op:'sell', npc, uid} · {op:'back', npc, uid}  -> bag + a fresh shopView, or shopR {ok:false, why, msg}
//
// Three tabs: Buy (the stock, greyed when you cannot afford it), Sell (your bag with what each fetches; rare and better
// ask first), Buy back (what you sold here this visit). Hover any item for its card. Walking away closes it.

import { h, createPanel, confirmBox } from '../ui-panel.js';
import { send2 } from './net2.js';
import { itemCell, itemName, goldText } from './item-cell.js';
import { onIcon, iconsActive } from './item-icons.js';
import { sellPrice, buyRefusal, SHOP_WHY, saleRows } from './pt2-core.js';
import { hideTip } from './tips.js';
import { itemCardHtml, rememberItems } from './item-card.js';
import { RARITY_RANK, rarityOf, slotOf, levelCheck } from './inv-core.js';
import { tabOf, freeIn } from '../../sim/bag-tabs.js';
import { mountTip } from './pt11-core.js';      // owner 2026-10-16: a mount row's card on the shop's Buy tab      // round 11 (#11 / #42): bag tabs; Sell filters by Equipment / Items

const SHOP_RANGE = 7;
const BAG_MAX = 120;
/** Roles whose NPC dialog offers "Browse wares" (the server decides for real: an npc without a shop answers shopR). */
export const SHOP_ROLES = new Set(['merchant', 'smith', 'trader', 'stablehand', 'stable', 'stablemaster', 'stable_master', 'fletcher', 'armourer', 'armorer', 'jeweller', 'jeweler', 'alchemist', 'grocer', 'tailor', 'weaponsmith', 'provisioner', 'pedlar', 'peddler', 'quartermaster', 'outfitter', 'tanner', 'bowyer', 'herbalist', 'fishmonger', 'general']);

export function createShop({ net, hud, actors, me, bag }) {
  // play-test 12 (#85): sureRare = "Remember for this transaction" was ticked on the rare-sale question — no more asking
  // until this counter is left (the window closes: walking away, Escape, another shop)
  const S = { npc: null, view: null, tab: 'buy', cat: 'all', pending: false, sel: null, touch: false, sellTab: 'gear', sureRare: false };
  const panel = createPanel({ id: 'shop', title: 'Shop', width: 420, cls: 'shop-panel', onClose: () => { S.npc = null; S.view = null; S.sureRare = false; iconsActive(false, 'shop'); hideTip(); } });

  function open(npcId, name = null) {
    if (S.npc !== npcId) S.sureRare = false;
    S.npc = npcId; S.view = null; S.tab = 'buy'; S.cat = 'all';
    send2.shop(net(), 'open', { npc: npcId });
    panel.setTitle(name || 'Shop', 'Opening the shutters…');
    panel.fill(h('p.dim', {}, 'Opening the shutters…'));
    iconsActive(true, 'shop');
    panel.open();
  }
  const gold = () => bag?.state?.gold ?? 0;
  function draw() {
    const v = S.view; if (!v || !panel.isOpen) return;
    panel.setTitle(v.name || 'Shop', `${v.title || roleName(v.role)} · you have ${goldText(gold())}`);
    const tabs = h('div.chips.shop-tabs', { role: 'tablist' }, ...[['buy', 'Buy'], ['sell', 'Sell'], ['back', `Buy back${(v.buyback || []).length ? ` (${v.buyback.length})` : ''}`]].map(([id, label]) =>
      h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(S.tab === id), dataset: { tab: id }, onclick: () => { S.tab = id; draw(); } }, label)));
    let body;
    if (S.tab === 'buy') body = h('div.shop-buy', {}, buyList(v), buyCard(v));
    else if (S.tab === 'sell') body = sellList(v);
    else body = backList(v);
    const says = v.says ? h('p.shop-says', {}, `“${Array.isArray(v.says) ? v.says[0] : v.says}”`) : null;
    panel.fill(says, tabs, body, h('p.tiny-left.shop-hint', {}, S.tab === 'sell' ? 'Click an item to sell it. Rare and better ask first. (Quest things and your recall charm are not for sale.)' : S.tab === 'back' ? 'Things you sold here — buy them back at the price you got.' : 'Point at a thing (or tap it) to see it against what you wear; click it — or press Buy — to buy it.'));
  }
  const roleName = r => String(r || 'Trader').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  function buyList(v) {
    // S3: only real things are for sale — a row whose "item" is just its category label (the old 'Wands & rods' for 15 g) is dropped;
    // categories are the filter chips above the list, never rows
    const all = saleRows(v.stock);
    if (!all.length) return h('p.dim', {}, 'Nothing for sale today.');
    // E's categories (protocol §18.2 `categories {cat: label}`, each row's `cat`): a chip per category the stock has
    const cats = [...new Set(all.map(r => r.cat).filter(Boolean))];
    if (S.cat !== 'all' && !cats.includes(S.cat)) S.cat = 'all';
    const stock = S.cat === 'all' ? all : all.filter(r => r.cat === S.cat);
    const catBar = cats.length > 1 ? h('div.chips.shop-cats', {}, ...[['all', 'Everything'], ...cats.map(c => [c, v.categories?.[c] || c.replace(/_/g, ' ')])].map(([id, label]) =>
      h('button.chip', { type: 'button', 'aria-checked': String(S.cat === id), dataset: { cat: id }, onclick: () => { S.cat = id; draw(); } }, label))) : null;
    const lv = me()?.level || 1;
    return h('div', {}, catBar, h('div.shop-list', {}, ...stock.map(row => {
      const it = row.item || {};
      const why = buyRefusal(row, gold(), freeFor(it));
      const req = slotOf(it) ? levelCheck(it, lv, bag?.state?.equipment) : { ok: true };
      // play-test 7 V13: pointing at a row (or the first tap on it) shows it in the compare card under the list; a click / the Buy button buys
      return h('div.shop-row' + (why ? '.cant' : '') + (S.sel === row.id ? '.sel' : ''), { dataset: { id: String(row.id), padAlt: '1' }, title: why || null, tabIndex: 0,
        onpointerenter: e => { if (e.pointerType !== 'touch') select(row.id); }, onfocus: () => select(row.id),
        onpointerdown: e => { S.touch = e.pointerType === 'touch'; },
        onclick: () => { if (S.touch && S.sel !== row.id) { select(row.id); return; } if (S.touch) return; buy(row, why); } },
        itemCell(it, { key: 'shop:' + S.npc + ':' + row.id, small: true }),
        h('div.sr-name', {}, it.name ? itemName(it) : h('b.iname', {}, row.mount?.name || 'Mount'), it.desc ? h('small.desc', {}, ` — ${it.desc}`) : null, row.level > lv ? h('small.bad', {}, ` level ${row.level}`) : null, row.mount ? h('small.mount', {}, ` Mount${it.speed ? ` · ${Math.round((it.speed - 1) * 100)}% faster` : ''}`) : null, !req.ok ? h('small.bad', {}, ` needs level ${req.level}`) : null),
        h('span.price' + (row.price > gold() ? '.no' : ''), {}, goldText(row.price)));
    })));
  }
  /** The thing on the shelf against what you wear in its slot — the bag's own item card, with the price and a Buy button. */
  function buyCard(v) {
    const box = h('div.shop-card', { dataset: { k: 'shopcard' } });
    paintCard(box, v);
    return box;
  }
  function paintCard(box, v) {
    const row = saleRows(v.stock).find(r => r.id === S.sel) || null;
    // owner 2026-10-16 (mobile): a MOUNT row has no item, so the card used to say "point at something" and offered no
    // Buy button — on a phone (first tap selects, the card's button buys) a mount could never be bought
    if (row && !row.item && row.mount) {
      const why = buyRefusal(row, gold(), 99);
      const card = h('div.shop-cardbody'); card.innerHTML = mountTip(row.mount);
      box.replaceChildren(card, h('div.row.shop-cardfoot', {}, why ? h('span.bad', {}, why) : h('span.price', {}, goldText(row.price)), h('span.grow'),
        h('button.primary.small', { type: 'button', disabled: !!why, dataset: { act: 'buy' }, onclick: () => buy(row, why) }, `Buy — ${goldText(row.price)}`)));
      return;
    }
    if (!row || !row.item) { box.replaceChildren(h('p.dim', {}, 'Point at something on the shelf to see it against what you are wearing.')); return; }
    const it = row.item.uid == null ? { ...row.item, uid: 'shop:' + S.npc + ':' + row.id } : row.item;
    rememberItems([it]);
    const why = buyRefusal(row, gold(), freeFor(it));
    const card = h('div.shop-cardbody'); card.innerHTML = itemCardHtml(it, { equipment: bag?.state?.equipment || {}, level: me()?.level || 1 });
    box.replaceChildren(card, h('div.row.shop-cardfoot', {}, why ? h('span.bad', {}, why) : h('span.price', {}, goldText(row.price)), h('span.grow'),
      h('button.primary.small', { type: 'button', disabled: !!why, dataset: { act: 'buy' }, onclick: () => buy(row, why) }, `Buy — ${goldText(row.price)}`)));
  }
  function select(id) {
    if (S.sel === id) return;
    S.sel = id;
    for (const r of panel.body.querySelectorAll('.shop-row')) r.classList.toggle('sel', r.dataset.id === String(id));
    const box = panel.body.querySelector('[data-k="shopcard"]'); if (box && S.view) paintCard(box, S.view);
  }
  /** Free squares in the tab this item would go in (Other: no limit). */
  const freeFor = it => (it && !it.name && !it.kind && !it.type ? 99 : Math.min(999, freeIn(bag?.state?.bag || [], bag?.max || BAG_MAX, tabOf(it))));
  function sellList(v) {
    // round 11 (owner #42): Equipment / Items filters; what lives in Other (the recall charm, quest things, reward boxes) is not for sale
    const sellable = (bag?.state?.bag || []).filter(it => tabOf(it) !== 'other');
    const n = { gear: sellable.filter(it => tabOf(it) === 'gear').length, items: sellable.filter(it => tabOf(it) === 'items').length };
    if (!n[S.sellTab] && n[S.sellTab === 'gear' ? 'items' : 'gear']) S.sellTab = S.sellTab === 'gear' ? 'items' : 'gear';
    const bar = h('div.chips.shop-cats.sell-tabs', {}, ...[['gear', 'Equipment'], ['items', 'Items']].map(([id, label]) =>
      h('button.chip', { type: 'button', 'aria-checked': String(S.sellTab === id), dataset: { sell: id }, onclick: () => { S.sellTab = id; draw(); } }, `${label} (${n[id]})`)));
    return h('div', {}, bar, sellRows(v, sellable.filter(it => tabOf(it) === S.sellTab)));
  }
  function sellRows(v, list) {
    const items = list.slice().sort((a, b) => (RARITY_RANK[rarityOf(a)] ?? 0) - (RARITY_RANK[rarityOf(b)] ?? 0));
    if (!items.length) return h('p.dim', {}, 'Your bag is empty.');
    const sellMap = new Map((v.sell || []).map(r => [r.uid, r.price]));
    const eachMap = new Map((v.sell || []).map(r => [r.uid, r.each]));
    return h('div.shop-list', {}, ...items.map(it => {
      const p = sellMap.get(it.uid) ?? sellPrice(it, v.sellRate ?? 0.25);
      return h('div.shop-row', { dataset: { uid: String(it.uid) }, onclick: () => sell(it, p) }, itemCell(it, { small: true }), h('div.sr-name', {}, itemName(it), it.count > 1 ? h('small.sr-stack', {}, ` × ${it.count}${eachMap.get(it.uid) ? ` — ${goldText(eachMap.get(it.uid))} each, sold together` : ' — the whole stack'}`) : null), h('span.price.sell', {}, p ? goldText(p) : 'worthless'));
    }));
  }
  function backList(v) {
    const list = v.buyback || [];
    if (!list.length) return h('p.dim', {}, 'You have not sold anything here.');
    return h('div.shop-list', {}, ...list.map(row => h('div.shop-row' + (row.price > gold() ? '.cant' : ''), { dataset: { uid: String(row.uid) }, onclick: () => back(row) },
      itemCell(row.item, { key: 'back:' + row.uid, small: true }), h('div.sr-name', {}, itemName(row.item || {})), h('span.price' + (row.price > gold() ? '.no' : ''), {}, goldText(row.price)))));
  }
  function buy(row, why) { if (why) { hud.toast(why, 'warn'); return; } hideTip(); send2.shop(net(), 'buy', { npc: S.npc, id: row.id }); }
  async function sell(it, price) {
    hideTip();
    const npc = S.npc;
    if ((RARITY_RANK[rarityOf(it)] ?? 0) >= RARITY_RANK.rare && !S.sureRare
      && !(await confirmBox(`Sell ${it.name} for ${goldText(price)}?`, { yes: 'Sell', check: { label: 'Remember for this transaction', onYes: on => { if (on && S.npc === npc) S.sureRare = true; } } }))) return;
    if (S.npc !== npc) return;                                       // the counter was left while the question was up
    send2.shop(net(), 'sell', { npc: S.npc, uid: it.uid });
  }
  function back(row) { if (row.price > gold()) { hud.toast(`You need ${row.price - gold()} more gold.`, 'warn'); return; } hideTip(); send2.shop(net(), 'back', { npc: S.npc, uid: row.uid }); }

  // walking away closes it
  function tick() {
    if (!panel.isOpen || S.npc == null) return;
    const a = actors.get(S.npc), m = me();
    if (!a || (m && Math.hypot(a.pos.x - m.x, a.pos.z - m.z) > SHOP_RANGE + 3)) { panel.close(); hud.toast('You walk away from the counter.', 'info'); }
  }
  onIcon(() => { if (panel.isOpen && S.view) { clearTimeout(draw.t); draw.t = setTimeout(draw, 80); } });

  // round 11 (owner #43): the compare card under the Buy list is drawn once — Shift (or a controller's Y on a row) must redraw it
  const repaintCard = () => { if (!panel.isOpen || S.tab !== 'buy' || !S.view) return; const box = panel.body.querySelector('[data-k="shopcard"]'); if (box) paintCard(box, S.view); };
  const onShift = e => { if (e.key === 'Shift') setTimeout(repaintCard, 0); };
  addEventListener('keydown', onShift, true); addEventListener('keyup', onShift, true);
  addEventListener('tv:pad-alt', () => setTimeout(repaintCard, 0));
  function wire(n) {
    n.on('shopView', v => { if (S.npc == null || v.npc !== S.npc) return; S.view = v; draw(); });
    n.on('shopR', r => {
      if (r.ok === false) { hud.toast(r.msg || SHOP_WHY[r.why] || 'They will not deal.', 'warn'); if (!S.view && panel.isOpen) panel.close(); return; }
      if (r.op === 'buy' && r.item) hud.chat(`You buy ${r.item.name}${r.price ? ` for ${goldText(r.price)}` : ''}.`, 'loot');
      if (r.op === 'sell' && r.item) hud.chat(`You sell ${r.item.name}${r.price ? ` for ${goldText(r.price)}` : ''}.`, 'loot');
    });
    // the bag/gold moved: the Sell list and the "can I afford it" marks follow
    n.on('bag', () => { if (panel.isOpen) draw(); });
    n.on('you', p => { if (p.gold != null && panel.isOpen) draw(); });
    n.on('joined', () => { if (panel.isOpen) panel.close(); });
  }
  return { wire, open, tick, panel, get state() { return { npc: S.npc, tab: S.tab, sellTab: S.sellTab, sureRare: S.sureRare, view: S.view ? { name: S.view.name, stock: (S.view.stock || []).length, buyback: (S.view.buyback || []).length } : null }; }, setTab(t) { S.tab = t; draw(); } };
}
