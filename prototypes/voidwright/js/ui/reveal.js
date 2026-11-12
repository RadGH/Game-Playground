// The rare-loot reveal (owner ruling E4, 2026-11-12: "I want to be more impressed by finding rare loot").
// Epic, legendary and relic pickups — and every named unique — slide in a big card at the side of the
// screen: rarity banner, the full item card, and how it compares with what you have fitted. It never
// blocks flying (only the card takes taps) and slides away by itself; a tap opens the parts hold.

import { el, btn } from './dom.js';
import { itemCard } from './items.js';
import { RARITY_BY_ID } from '../data/types.js';
import { UNIQUE_BY_ID } from '../data/uniques.js';

const queue = [];
let showing = null;

/** Show the reveal for an item (queued if one is already up). */
export function reveal(app, item, opts = {}) {
  queue.push({ item, opts });
  if (!showing) next(app);
}

function next(app) {
  const job = queue.shift(); if (!job) { showing = null; return; }
  const { item, opts } = job;
  const R = RARITY_BY_ID[item.rarity] || RARITY_BY_ID.common;
  const U = item.unique ? UNIQUE_BY_ID[item.unique] : null;
  const card = itemCard(item, { compact: true, compare: app.P });
  const box = el('div', { class: `reveal rar-${R.id}${U ? ' unique' : ''}`, style: `--rc:${R.color}`, role: 'status' },
    el('div', { class: 'rv-rays' }),
    el('div', { class: 'rv-head' }, el('span', { class: 'rv-tag' }, U ? 'Named unique' : `${R.name} find`), opts.from ? el('span', { class: 'rv-from' }, opts.from) : ''),
    U ? el('div', { class: 'rv-uq' }, U.power) : '',
    card,
    el('div', { class: 'row end' }, btn('Parts hold', () => { close(); app.openHold?.('parts'); }, 'small'), btn('Nice', () => close(), 'small primary')));
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add('in'));
  showing = box;
  const t = setTimeout(close, U || R.index >= 4 ? 9000 : 6500);
  function close() {
    clearTimeout(t); if (!box.isConnected) return;
    box.classList.remove('in'); box.classList.add('out');
    setTimeout(() => { box.remove(); next(app); }, 380);
  }
}

/** Should this find get the big reveal? */
export const worthRevealing = item => !!item && (item.unique || (RARITY_BY_ID[item.rarity]?.index || 0) >= 3);
