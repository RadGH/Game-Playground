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
import { RARITY_RANK, rarityOf, slotOf, levelCheck } from './inv-core.js';

const SHOP_RANGE = 7;
const BAG_MAX = 120;
/** Roles whose NPC dialog offers "Browse wares" (the server decides for real: an npc without a shop answers shopR). */
export const SHOP_ROLES = new Set(['merchant', 'smith', 'trader', 'stablehand', 'stable', 'stablemaster', 'stable_master', 'fletcher', 'armourer', 'armorer', 'jeweller', 'jeweler', 'alchemist', 'grocer', 'tailor', 'weaponsmith', 'provisioner', 'pedlar', 'peddler', 'quartermaster', 'outfitter', 'tanner', 'bowyer', 'herbalist', 'fishmonger', 'general']);

export function createShop({ net, hud, actors, me, bag }) {
  const S = { npc: null, view: null, tab: 'buy', cat: 'all', pending: false };
  const panel = createPanel({ id: 'shop', title: 'Shop', width: 420, cls: 'shop-panel', onClose: () => { S.npc = null; S.view = null; iconsActive(false, 'shop'); hideTip(); } });

  function open(npcId, name = null) {
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
    if (S.tab === 'buy') body = buyList(v);
    else if (S.tab === 'sell') body = sellList(v);
    else body = backList(v);
    const says = v.says ? h('p.shop-says', {}, `“${Array.isArray(v.says) ? v.says[0] : v.says}”`) : null;
    panel.fill(says, tabs, body, h('p.tiny-left.shop-hint', {}, S.tab === 'sell' ? 'Click an item to sell it. Rare and better ask first.' : S.tab === 'back' ? 'Things you sold here — buy them back at the price you got.' : 'Click to buy. Hover for the item card.'));
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
    const lv = me()?.level || 1, free = BAG_MAX - (bag?.state?.bag?.length || 0);
    return h('div', {}, catBar, h('div.shop-list', {}, ...stock.map(row => {
      const it = row.item || {};
      const why = buyRefusal(row, gold(), free);
      const req = slotOf(it) ? levelCheck(it, lv, bag?.state?.equipment) : { ok: true };
      return h('div.shop-row' + (why ? '.cant' : ''), { dataset: { id: String(row.id) }, title: why || null, onclick: () => buy(row, why) },
        itemCell(it, { key: 'shop:' + S.npc + ':' + row.id, small: true }),
        h('div.sr-name', {}, it.name ? itemName(it) : h('b.iname', {}, row.mount?.name || 'Mount'), it.desc ? h('small.desc', {}, ` — ${it.desc}`) : null, row.level > lv ? h('small.bad', {}, ` level ${row.level}`) : null, row.mount ? h('small.mount', {}, ` Mount${it.speed ? ` · ${Math.round((it.speed - 1) * 100)}% faster` : ''}`) : null, !req.ok ? h('small.bad', {}, ` needs level ${req.level}`) : null),
        h('span.price' + (row.price > gold() ? '.no' : ''), {}, goldText(row.price)));
    })));
  }
  function sellList(v) {
    const items = (bag?.state?.bag || []).slice().sort((a, b) => (RARITY_RANK[rarityOf(a)] ?? 0) - (RARITY_RANK[rarityOf(b)] ?? 0));
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
    if ((RARITY_RANK[rarityOf(it)] ?? 0) >= RARITY_RANK.rare && !(await confirmBox(`Sell ${it.name} for ${goldText(price)}?`, { yes: 'Sell' }))) return;
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
  return { wire, open, tick, panel, get state() { return { npc: S.npc, tab: S.tab, view: S.view ? { name: S.view.name, stock: (S.view.stock || []).length, buyback: (S.view.buyback || []).length } : null }; }, setTab(t) { S.tab = t; draw(); } };
}
