// The shop screens in the towns (Expansion 1 M4): walk up to a shop door, press E. Prices come from data/shop.json and
// every buy goes through the room (`{ t:'buy', item }`), which prices it again, takes the gold and keeps the thing for
// good (rule 2: nothing is ever sold back or used up). An expensive buy asks twice ("Buy? 800") so a stray A press or
// tap never spends a fortune.
//   Dealer     vehicles — picture, price, Owned ✓; locked / too expensive ones still listed with their price
//   Outfitter  clothes — your own face wearing the piece (hats, tops, glasses, scarves) or a swatch, by slot
//   Supply     items + kits — the survey kits (M10); items later
//
//   openShop({ layers, nav, ctx, shop: { kind: 'dealer'|'outfitter'|'supply'|'market', name, city } }) -> { close }
//   ctx = the phone's ctx (js/client/ui/phone.js) + tryOn(look, clothId) -> look, cityName(id)
import { el, esc } from './dom.js';
import { vehiclePic } from './phone.js';
import { owns, CLOTHING_SLOTS } from '../../game/profile.js';

const TITLE = { dealer: 'Dealer', outfitter: 'Outfitter', supply: 'Supply Store', market: 'Produce Market' };
const BLURB = { dealer: 'Every vehicle here is yours for good once you buy it. Summon it from your phone any time.',
  outfitter: 'Clothes you buy are yours for good. Put them on from the Wardrobe on your phone.',
  supply: 'Equipment for the jobs. Bought once, kept forever.', market: 'Farmers sell their harvest here: drive a loaded produce trailer (or a harvester) into the yard and tip it out. The further it came, the more it pays.' };
const SLOT_NAMES = { hat: 'Hats', top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', cape: 'Scarves + packs', accessory: 'Glasses + more', decor: 'Extra gear' };
const SHOWS_ON_FACE = new Set(['hat', 'top', 'accessory', 'cape']);
const gold = n => `<span class="rl-coin" aria-hidden="true"></span>${Number(n || 0).toLocaleString()}`;

export function openShop({ layers, nav, ctx, shop }) {
  const kind = TITLE[shop.kind] ? shop.kind : 'supply';
  const node = el('div', 'rl-modal rl-shoplayer');
  const panel = el('div', 'rl-panel rl-shop'); node.append(panel);
  const rec = layers.push(node, { kind: 'shop', onBack: () => close() });
  node.addEventListener('click', e => { if (e.target === node) close(); });
  let closed = false, filter = kind === 'outfitter' ? 'all' : null;
  const off = ctx.onProfile(() => draw());
  function close() { if (closed) return; closed = true; off?.(); rec.close(); }

  const buyBtn = (id, price, have, soon, P) => {
    if (have) return '<span class="rl-ph-owned">Owned ✓</span>';
    if (soon) return '<span class="rl-ph-soon">Coming soon</span>';
    const short = (P?.gold || 0) < price;
    return `<button class="rl-btn small${short ? '' : ' primary'}" data-buy="${esc(id)}" data-price="${price}"${short ? ' aria-disabled="true"' : ''}>${price ? gold(price) : 'Free'}</button>`;
  };
  function dealer(P) {
    return `<div class="rl-ph-list">${(ctx.shop.vehicles || []).map(r => `<div class="rl-ph-row">${vehiclePic(r.id, r.name, r.soon ? null : ctx.thumb)}
      <span class="rl-ph-name"><b>${esc(r.name)}</b><i>${r.soon ? esc(r.note ? 'A big one — not for sale yet' : 'Not for sale yet') : owns(P, 'vehicles', r.id) ? 'In your Garage' : ''}</i></span>
      ${buyBtn(r.id, r.price, owns(P, 'vehicles', r.id), r.soon, P)}</div>`).join('')}</div>`;
  }
  function outfitter(P) {
    const worn = ctx.wornLook();
    const rows = (ctx.shop.clothes || []).filter(r => filter === 'all' || r.id.startsWith(filter + ':'));
    const slots = CLOTHING_SLOTS.filter(s => rows.some(r => r.id.startsWith(s + ':')));
    const pic = r => {
      const slot = r.id.split(':')[0];
      return SHOWS_ON_FACE.has(slot) ? `<img class="rl-face sm" alt="" loading="lazy" src="${ctx.portrait(ctx.tryOn(worn, r.id))}">` : `<span class="rl-swatch" data-slot="${slot}"></span>`;
    };
    return `<div class="rl-ph-tabs wrap"><button class="rl-pill small${filter === 'all' ? ' on' : ''}" data-filter="all">All</button>${CLOTHING_SLOTS.map(s => `<button class="rl-pill small${filter === s ? ' on' : ''}" data-filter="${s}">${esc(SLOT_NAMES[s])}</button>`).join('')}</div>
      ${slots.map(s => `<h3>${esc(SLOT_NAMES[s])}</h3><div class="rl-ph-list">${rows.filter(r => r.id.startsWith(s + ':')).map(r => `<div class="rl-ph-row">${pic(r)}<span class="rl-ph-name"><b>${esc(r.name)}</b><i>${owns(P, 'clothes', r.id) ? 'In your Wardrobe' : ''}</i></span>${buyBtn(r.id, r.price, owns(P, 'clothes', r.id), r.soon, P)}</div>`).join('')}</div>`).join('')}`;
  }
  function supply(P) {
    const rows = [...(ctx.shop.items || []).map(r => ({ ...r, k: 'items' })), ...(ctx.shop.kits || []).map(r => ({ ...r, k: 'kits' }))];
    // the survey kits (M10): bought once, kept forever; Spawn their crate from the phone's Items app
    return `${rows.some(r => r.k === 'kits') ? '<p class="rl-note">Survey kits: carry the crate to a spot that suits the kit, hold E to set it up, then report at the Highgate Survey Office.</p>' : ''}<div class="rl-ph-list">${rows.map(r => `<div class="rl-ph-row"><span class="rl-ph-name"><b>${esc(r.name)}</b><i>${esc(owns(P, r.k, r.id) ? 'Yours — Spawn it from your phone\'s Items app' : r.note || '')}</i></span>${buyBtn(r.id, r.price, owns(P, r.k, r.id), r.soon, P)}</div>`).join('')}</div>`;
  }
  function draw() {
    if (closed) return;
    const P = ctx.profile();
    const body = !P ? '<p class="rl-note">Shops open when you are in a game.</p>' : kind === 'dealer' ? dealer(P) : kind === 'outfitter' ? outfitter(P) : kind === 'supply' ? supply(P) : '<div class="rl-ph-empty"><b>The stalls are empty today</b></div>';
    panel.dataset.shop = kind;
    panel.innerHTML = `<div class="rl-shop-head"><button class="rl-btn small" data-back aria-label="Leave the shop">‹ Leave</button><div><h2>${esc(shop.name || TITLE[kind])}</h2><span class="rl-note">${esc([TITLE[kind], ctx.cityName?.(shop.city)].filter(Boolean).join(' · '))}</span></div><span class="rl-ph-gold">${P ? gold(P.gold) : ''}</span></div>
      <p class="rl-note">${esc(BLURB[kind] || '')}</p>${body}`;
    nav.attach(panel, { keep: true });
  }
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-back]')) return close();
    const f = t.closest('[data-filter]'); if (f) { filter = f.dataset.filter; return draw(); }
    const b = t.closest('[data-buy]');
    if (b) {
      const P = ctx.profile(), price = +b.dataset.price;
      if (!P) return;
      if ((P.gold || 0) < price) return ctx.toast(`You need ${price - (P.gold || 0)} more gold.`);
      // anything over 100 gold asks twice
      if (price > 100 && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.innerHTML = `Buy? ${gold(price)}`; setTimeout(() => { if (b.isConnected && b.dataset.sure === '1') { b.dataset.sure = ''; b.innerHTML = gold(price); } }, 3000); return; }
      ctx.send({ t: 'buy', item: b.dataset.buy });
    }
  });
  draw();
  return { close, el: node, get closed() { return closed; } };
}
