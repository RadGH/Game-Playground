// The bag: what you wear (all ten gear slots, the paper doll) beside what you carry (one grid), the carry weight, gold
// and worn-out gear. Choosing an item opens its panel (beside the grid on a desktop, under it on a phone): Equip (or the
// reason you can't, written on the button row), Unequip, Compare with the second ring / the off hand, Sell when a shop
// is open, Throw away (asked first, in-game). Every item shows the one tooltip card (tip.js) with compare.
//
//   app.openWindow('bag', { shop })   → .win-bag  (cells: .bag-cell[data-ref], slots: .bag-slot[data-slot])
import { openWin, esc, ask } from './kit.js';
import { tipAttrs, setCompareAlt, compareSlotAlt, hideTip } from './tip.js';
import { glyph, uiIcon } from './icons.js';
import { SLOTS, SLOT_NAME, slotFor, equipRefusal } from '../../game/gear.js';
import { itemWeight, durabilityOf, isBroken } from '../../rules/inventory.js';
import { fmt, mat } from '../../../../../shared/format.js';

const SUB = { sword2h: 'Greatsword', axe2h: 'Greataxe', polearm: 'Polearm', sword: 'Sword', axe: 'Axe', mace: 'Mace', hammer: 'Hammer', dagger: 'Dagger', spear: 'Spear', staff: 'Staff', bow: 'Bow', crossbow: 'Crossbow', wand: 'Wand', scepter: 'Sceptre', orb: 'Orb', tome: 'Tome', javelin: 'Javelin' };
/** The short "what is it" label under a name ("Greatsword · two hands", "Chest", "Ring"). */
export function kindLabel(item) {
  if (!item) return '';
  if (item.quest || item.type === 'quest') return 'Quest item';
  if (item.type === 'weapon') return `${SUB[item.subtype] || 'Weapon'}${item.twoHanded ? ' · two hands' : ''}`;
  if (item.isShield) return item.baseKey === 'buckler' ? 'Buckler' : 'Shield';
  if (item.baseKey === 'quiver') return 'Quiver';
  if (item.isMagicShield) return 'Focus';
  if (item.type === 'accessory') return item.slot === 'necklace' ? 'Necklace' : 'Ring';
  return SLOT_NAME[item.slot] || 'Gear';
}
/** One glyph per kind of thing (one icon style — lessons rule 17). */
export function itemGlyph(item, size = 26) {
  if (!item) return '';
  if (item.quest || item.type === 'quest') return glyph('scroll', size);
  if (item.type === 'weapon') return item.weaponCategory === 'magic' ? glyph('enchant', size) : glyph('sword', size);
  if (item.isShield || item.slot === 'offhand') return glyph('shield', size);
  if (item.type === 'accessory') return glyph('star', size);
  const S = { head: 'up', chest: 'shield', legs: 'down', hands: 'hammer', feet: 'down' };
  return glyph(S[item.slot] || 'shield', size);
}
export const rarityOf = item => (item?.quest || item?.type === 'quest' ? 'quest' : item?.setId ? 'set' : item?.isUnique ? 'unique' : item?.rarity || 'normal');

/** One item cell (bag grid, loot list, shop). `ref` is what tip.js / app.itemRef look it up by. */
export function itemCell(item, ref, { cls = 'bag-cell', extra = '', selected = false, price = null, sell = false } = {}) {
  const r = rarityOf(item);
  return `<button type="button" class="${cls} rbox-${r}${selected ? ' is-sel' : ''}" data-ref="${esc(ref)}" ${tipAttrs('item', { ref, price, sell: sell ? 1 : null })}>
    <span class="bag-ico">${itemGlyph(item)}</span>
    <span class="bag-txt"><b class="rar-${r}">${esc(item.name)}</b><small>${esc(kindLabel(item))}${item.levelReq > 1 ? ` · level ${fmt(item.levelReq)}` : ''}</small></span>${extra}</button>`;
}

export function open(app, opts = {}) {
  let off = () => {};
  const w = openWin({
    id: 'bag', title: 'Bag', size: 'wide', cls: 'win-bag',
    render: (body, tab, w) => render(app, body, w),
    foot: (el, w) => foot(app, el, w),
    onClose: w => { off(); w._on = false; setCompareAlt(false); hideTip(); },
  });
  if (opts.shop) w.data.shop = opts.shop;
  if (!w._on) { w._on = true; off = w.follow(app, 'me', () => JSON.stringify(app.me)); }   // only when my character changed
  return w;
}

function shopOpen(app, w) {
  const s = w.data.shop || app.lastShop;
  return s && document.querySelector('.win-shop') ? s : null;
}

function render(app, body, w) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  const rules = app.rules;
  const sel = w.data.sel && app.itemRef(w.data.sel) ? w.data.sel : null;
  w.data.sel = sel;
  const sh = app.me.sheet || {};
  const carried = sh.carried ?? 0, carry = sh.carry || 1, over = carried > carry;
  const worn = SLOTS.map(s => {
    const it = c.gear?.[s];
    const du = it ? durabilityOf(rules, it) : null;
    const low = du != null && du <= 25;
    if (!it) return `<div class="bag-slot is-empty" data-slot="${s}"><span class="bag-slot-name">${esc(SLOT_NAME[s])}</span><span class="ow-dim">Nothing</span></div>`;
    const ref = `gear:${s}`;
    return `<button type="button" class="bag-slot rbox-${rarityOf(it)}${sel === ref ? ' is-sel' : ''}" data-slot="${s}" data-ref="${ref}" ${tipAttrs('item', { ref })}>
      <span class="bag-slot-name">${esc(SLOT_NAME[s])}</span><span class="bag-ico">${itemGlyph(it, 22)}</span>
      <b class="rar-${rarityOf(it)}">${esc(it.name)}</b>${low ? `<em class="bag-wear ${isBroken(rules, it) ? 'is-broken' : ''}">${isBroken(rules, it) ? 'Broken' : `Worn ${fmt(du)}%`}</em>` : ''}</button>`;
  }).join('');
  const bag = c.bag || [];
  const shop = shopOpen(app, w);
  const sellOf = id => shop?.sell?.find(s => s.id === id)?.price ?? null;
  const cells = bag.length ? bag.map(it => itemCell(it, `bag:${it.id}`, { selected: sel === `bag:${it.id}`, price: shop ? sellOf(it.id) : null, sell: !!shop })).join('') : '<p class="ow-empty bag-none">Your bag is empty. Loot from corpses and chests lands here.</p>';
  const broken = Object.values(c.gear || {}).filter(it => it && isBroken(rules, it));
  const pct = Math.min(100, carried / carry * 100);
  return `<div class="bag-wrap">
    <section class="bag-doll" aria-label="Worn gear"><h3>Worn</h3><div class="bag-slots">${worn}</div></section>
    <section class="bag-main" aria-label="Carried">
      <div class="bag-stats">
        <span class="bag-gold">${glyph('coin', 20)}<b>${fmt(c.gold || 0)}</b> gold</span>
        <span class="bag-weight ${over ? 'is-over' : ''}" ${tipAttrs('text', { title: 'Carry weight', text: `You carry ${mat(carried)} of ${fmt(carry)} kg. Strength and Constitution raise the limit.` })}>${glyph('weight', 20)}<span>${mat(carried)} / ${fmt(carry)} kg</span><i class="bag-meter"><i style="width:${Math.round(pct)}%"></i></i></span>
      </div>
      ${over ? '<p class="bag-warn">Over your carry weight: you walk slowly and cannot sprint.</p>' : ''}
      ${broken.length ? `<p class="bag-warn">${esc(broken.map(b => b.name).join(', '))} ${broken.length > 1 ? 'are' : 'is'} broken and give${broken.length > 1 ? '' : 's'} nothing until repaired by a smith.</p>` : ''}
      <h3>Carried <span class="ow-dim">(${fmt(bag.length)})</span></h3>
      <div class="bag-grid">${cells}</div>
      ${sel ? panel(app, w, sel, shop) : ''}
    </section></div>`;
}

function panel(app, w, ref, shop) {
  const c = app.me.char, rules = app.rules;
  const it = app.itemRef(ref);
  if (!it) return '';
  const fromGear = ref.startsWith('gear:');
  const rows = [];
  if (fromGear) rows.push(`<button type="button" class="ow-btn" data-act="unequip" data-slot="${esc(ref.slice(5))}">${glyph('down', 18)}Take off</button>`);
  else {
    const slot = slotFor(it, c, null);
    const alt = (it.slot === 'ring' && compareSlotAlt()) ? 'ring2' : (it.type === 'weapon' && compareSlotAlt()) ? 'offhand' : slot;
    const why = equipRefusal(rules, c, it, alt);
    rows.push(why ? `<p class="bag-why">${esc(why)}</p>` : `<button type="button" class="ow-btn ow-primary" data-primary data-act="equip" data-slot="${esc(alt)}">${glyph('check', 18)}Wear${alt !== slot || it.slot === 'ring' ? ` (${esc(alt === 'ring2' ? 'second ring' : SLOT_NAME[alt].toLowerCase())})` : ''}</button>`);
    if (it.slot === 'ring' || (it.type === 'weapon' && !it.twoHanded)) {
      const label = it.slot === 'ring' ? (compareSlotAlt() ? 'Compare: Ring 1' : 'Compare: Ring 2') : (compareSlotAlt() ? 'Compare: main hand' : 'Compare: off hand');
      rows.push(`<button type="button" class="ow-btn ow-ghost" data-act="cmp">${glyph('refresh', 18)}${label}</button>`);
    }
    if (shop) { const p = shop.sell?.find(s => s.id === it.id)?.price; if (p != null) rows.push(`<button type="button" class="ow-btn" data-act="sell">${glyph('coin', 18)}Sell for ${fmt(p)} gold</button>`); }
    rows.push(`<button type="button" class="ow-btn ow-danger ow-small" data-act="destroy">${glyph('trash', 18)}Throw away</button>`);
  }
  return `<div class="bag-panel" aria-label="${esc(it.name)}">
    <div class="bag-panel-head"><span class="bag-ico">${itemGlyph(it, 30)}</span><div><b class="rar-${rarityOf(it)}">${esc(it.name)}</b><small>${esc(kindLabel(it))} · ${mat(itemWeight(rules, it))} kg</small></div>
    <button type="button" class="ow-btn ow-ghost ow-small" data-act="info" ${tipAttrs('item', { ref })}>${glyph('info', 18)}Details</button></div>
    <div class="bag-panel-acts">${rows.join('')}</div></div>`;
}

function foot(app, el, w) {
  const sel = w.data.sel;
  el.innerHTML = `<span class="ow-dim bag-foot-hint">${sel ? 'Choose another item, or press it again to close its panel.' : 'Choose an item to wear, compare or throw it away.'}</span>
    <button type="button" class="ow-btn" data-act="sheet">${uiIcon('sheet', 20)}Character</button>`;
  el.querySelector('[data-act="sheet"]').onclick = () => { w.close(); app.openWindow('sheet'); };
  wire(app, w);
}

function wire(app, w) {
  const body = w.body;
  body.querySelectorAll('[data-ref]').forEach(b => {
    if (b.dataset.act) return;
    b.onclick = () => { w.data.sel = w.data.sel === b.dataset.ref ? null : b.dataset.ref; hideTip(); w.render(); };
  });
  const it = () => app.itemRef(w.data.sel);
  const on = (act, fn) => body.querySelectorAll(`[data-act="${act}"]`).forEach(b => { b.onclick = fn; });
  on('equip', e => { const x = it(); if (!x) return; app.act('equip', { item: x.id, slot: e.currentTarget.dataset.slot }); app.sfx('equip'); w.data.sel = null; setCompareAlt(false); });
  on('unequip', e => { app.act('unequip', { slot: e.currentTarget.dataset.slot }); w.data.sel = null; });
  on('cmp', () => { setCompareAlt(!compareSlotAlt()); w.render(); });
  on('sell', () => { const x = it(); if (!x) return; app.act('sell', { npc: (w.data.shop || app.lastShop).npc, item: x.id }); w.data.sel = null; });
  on('destroy', async () => {
    const x = it(); if (!x) return;
    const yes = await ask({ title: 'Throw it away?', text: `${x.name} will be gone for good.`, ok: 'Throw away', cancel: 'Keep it', danger: true });
    if (yes) { app.act('destroy', { item: x.id }); w.data.sel = null; }
  });
}
