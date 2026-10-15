// T9 / T20 (play-test 5): opening a crate or a gift. The lid rattles while the server rolls, then it bursts open on
// what was inside — the item's picture ringed in its rarity colour, its name, what it is, and the full item card on
// hover. The item is already in your bag when you see it (the server put it there); this is only the moment.
//
//   const reveal = createReveal({ net, hud, bag });
//   reveal.open(item)              a crate / gift from the bag: sends item {op:'use', uid} and waits for the answer
//   reveal.show(item, { from })    just the reveal (a server answer, a test)
// Answers read: crateR {ok, uid, item, from, msg} · itemR {op:'use', ok, opened:{item, from}} · or, from a server that
// only says `bag {remove:[crate], add:[item]}`, the first thing added right after the crate went.
// All motion is CSS (css/pt5.css); `prefers-reduced-motion` gets the result with no shaking.

import { h } from '../ui-panel.js';
import { iconFor, onIcon, iconsActive } from './item-icons.js';
import { rememberItems, nameOf } from './item-card.js';
import { rarityOf, slotOf, SLOT_NAME, RARITY_NAME } from './inv-core.js';
import { isCrate, isGift, crateLines, itemFacts, rarityClass } from './pt5-core.js';
import { freeIn } from '../../sim/bag-tabs.js';      // round 11 (Market stream, owner #25): room is checked BEFORE a box opens

export function createReveal({ net, hud, bag }) {
  const root = h('div.tv-reveal', { hidden: true, role: 'dialog', 'aria-label': 'Opening' });
  (document.getElementById('hud') || document.body).appendChild(root);
  const S = { waiting: null, shown: null, timer: 0, queue: [] };

  function close() {
    root.hidden = true; root.className = 'tv-reveal'; S.shown = null; S.waiting = null; clearTimeout(S.timer);
    iconsActive(false, 'reveal');
    const next = S.queue.shift(); if (next) show(next.item, next);
  }
  root.addEventListener('click', e => { if (S.shown && (e.target === root || e.target.closest('[data-act="ok"]'))) close(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { close(); e.preventDefault(); } e.stopPropagation(); });

  /** The rattling box, while the server decides. */
  function rattle(item) {
    const gift = isGift(item), c = crateLines(item);
    S.waiting = { uid: item.uid, gift, at: performance.now() }; S.shown = null;
    root.className = 'tv-reveal waiting' + (gift ? ' gift' : '');
    root.replaceChildren(h('div.rv-card', {},
      h('div.rv-box', { 'aria-hidden': 'true' }, h('i.rv-lid'), h('i.rv-body'), gift ? h('i.rv-bow') : h('i.rv-band')),
      h('strong.rv-title', {}, gift ? 'Unwrapping…' : 'Opening…'),
      h('span.rv-sub', {}, nameOf(item)), h('span.rv-sub.dim', {}, c.rarity)));
    root.hidden = false;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (S.waiting) { close(); hud.toast('Nothing happened. Try again in a moment.', 'warn'); } }, 6000);
  }
  /** The burst and what was inside. */
  function show(item, { from = 'crate', note = '' } = {}) {
    if (!item) return close();
    // the answer and the bag message both name the same item: one reveal
    if (S.shown && item.uid != null && String(S.shown.uid) === String(item.uid)) return;
    if (S.shown) { if (!S.queue.some(q => String(q.item.uid) === String(item.uid))) S.queue.push({ item, from, note }); return; }
    clearTimeout(S.timer);
    if (item.uid == null) item.uid = 'reveal:' + Date.now();
    rememberItems([item]);
    iconsActive(true, 'reveal');
    const r = rarityClass(rarityOf(item)), slot = slotOf(item);
    S.waiting = null; S.shown = item;
    const pic = h('div.rv-item.islot.r-' + r, { dataset: { tipRender: 'item', tipItem: String(item.uid) } });
    const paint = () => { const url = iconFor(item); pic.replaceChildren(url ? h('img', { src: url, alt: '' }) : h('span.glyph', {}, (nameOf(item)[0] || '?').toUpperCase())); };
    paint();
    const off = onIcon(() => { if (S.shown === item) paint(); else off(); });
    const ok = h('button.primary.small', { type: 'button', dataset: { act: 'ok' } }, 'Into the bag');
    root.className = `tv-reveal open r-${r}` + (from === 'gift' ? ' gift' : '');
    root.replaceChildren(h('div.rv-card', {},
      h('div.rv-burst', { 'aria-hidden': 'true' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: `--a:${i * 30}deg` }))),
      h('span.rv-from', {}, from === 'gift' ? 'A gift for you' : from === 'fish' ? 'Hauled up from the water' : 'Inside the crate'),
      pic,
      h('strong.rv-name.r-' + r, {}, nameOf(item)),
      h('span.rv-kind', {}, `${RARITY_NAME[rarityOf(item)] || 'Common'} ${slot ? (SLOT_NAME[slot] || slot).toLowerCase() : 'item'}`),
      itemFacts(item) ? h('span.rv-facts', {}, itemFacts(item)) : null,
      note ? h('span.rv-sub.dim', {}, note) : null,
      h('span.rv-sub.dim', {}, 'It is in your bag. Hover the picture for every detail.'),
      ok));
    root.hidden = false;
    ok.focus({ preventScroll: true });
    hud.chat?.(`${from === 'gift' ? 'You unwrap the gift' : 'You open the crate'}: ${nameOf(item)}.`, 'loot rarity-' + r);
    S.timer = setTimeout(() => { if (S.shown === item) close(); }, 30000);      // it waits for you; it only tidies itself away after half a minute
  }
  function refuse(r) {
    if (!S.waiting) return;
    close();
    hud.toast(r?.msg || (r?.why === 'bagFull' ? 'Your bag is full — make room, then open it.' : r?.why === 'level' ? 'You cannot open that yet.' : 'It will not open right now.'), 'warn');
  }

  /** A bag click on a crate / gift: true = handled. */
  function open(item) {
    if (!isCrate(item)) return false;
    if (S.waiting || S.shown) return true;
    // round 11 (owner #25): a crate / gift box holds a piece of equipment — with no free square in Equipment it stays shut
    // (the server says the same; this answers at once, before the box even rattles)
    const have = bag?.state?.bag, max = bag?.max;
    if (Array.isArray(have) && max > 0 && freeIn(have, max, 'gear') < 1) { hud.toast(`No room in your Equipment tab. Make room for 1 more thing, then open the ${isGift(item) ? 'gift' : 'crate'} — it waits in your bag.`, 'warn'); return true; }
    rattle(item);
    const n = net();
    if (typeof n?.useItem === 'function') n.useItem(item.uid); else n?.item?.('use', item.uid);
    return true;
  }

  function wire(n) {
    n.on('crateR', r => { if (r.ok === false) return refuse(r); if (r.item) setTimeout(() => show(r.item, { from: r.from || (S.waiting?.gift ? 'gift' : 'crate'), note: r.msg || '' }), wait()); });
    n.on('giftR', r => { if (r.ok === false) return refuse(r); if (r.item) setTimeout(() => show(r.item, { from: 'gift', note: r.msg || '' }), wait()); });
    n.on('itemR', r => {
      if (r.op !== 'use') return;
      const o = r.opened || (r.crate && r.item ? { item: r.item } : null);
      if (r.ok && o?.item) setTimeout(() => show(o.item, { from: o.from || (S.waiting?.gift ? 'gift' : 'crate') }), wait());
      else if (!r.ok && S.waiting) { refuse(r); r.handled = true; }      // (the hotbar's own "cannot use that" stays quiet)
    });
    // a server that only moves the bag: the crate left and something arrived in the same message
    n.on('bag', m => {
      const w = S.waiting; if (!w) return;
      if ((m.remove || []).some(u => String(u) === String(w.uid)) && (m.add || []).length) { const it = m.add.find(i => !isCrate(i)) || m.add[0]; setTimeout(() => { if (S.waiting === w) show(it, { from: w.gift ? 'gift' : 'crate' }); }, wait()); }
    });
    n.on('err', e => { if (S.waiting && (e.code === 'item' || e.code === 'bagFull')) close(); });   // bag.js says the server's words
  }
  // the rattle is seen for at least 0.9 s, however fast the server is
  const wait = () => (S.waiting ? Math.max(0, 900 - (performance.now() - S.waiting.at)) : 0);

  return { wire, open, show, close, get state() { return { waiting: !!S.waiting, shown: S.shown ? { name: nameOf(S.shown), rarity: rarityOf(S.shown) } : null, queued: S.queue.length }; } };
}
