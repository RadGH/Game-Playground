// One item square for the play-test-2 windows (loot, rolls, shop, trade): the 3D icon (ui/item-icons.js, rendered
// only while a window that shows icons is open), the rarity frame, and the shared item card on hover (ui/item-card.js).
// A redraw when an icon arrives goes through onIcon in the window that uses it.

import { h } from '../ui-panel.js';
import { iconFor } from './item-icons.js';
import { rememberItems, nameOf } from './item-card.js';
import { rarityOf } from './inv-core.js';

/** key: a stable id for items with no uid (shop stock rows). */
export function itemCell(item, { key = null, onclick = null, small = false, badge = null } = {}) {
  const it = key != null && item && item.uid == null ? { ...item, uid: key } : item;
  if (it) rememberItems([it]);
  const d = h('div.islot' + (small ? '.small' : '') + (it ? '.r-' + rarityOf(it) : '.empty'));
  if (it) {
    d.dataset.tipRender = 'item'; d.dataset.tipItem = String(it.uid);
    const url = iconFor(it);
    if (url) d.appendChild(h('img', { src: url, alt: '', draggable: false }));
    else { d.appendChild(h('span.glyph', {}, (nameOf(it)[0] || '?').toUpperCase())); d.classList.add('pending'); }
    if (badge) d.appendChild(h('span.up', {}, badge));
  }
  if (onclick) d.addEventListener('click', onclick);
  return d;
}
/** "Fine Iron Ring" coloured by rarity. */
export const itemName = it => h('b.iname.r-' + rarityOf(it), {}, nameOf(it));
export const goldText = n => `${Math.max(0, Math.round(n || 0)).toLocaleString()} gold`;
