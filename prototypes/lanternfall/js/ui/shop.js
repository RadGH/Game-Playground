// Shop frame (docs/02 §24, 08 §16): stock from js/rpg/shops.js (stockFor / priceOf / buy / sell / sellJunk),
// a Buy and a Sell tab, the keeper's line, the purse. Quirk extras (Odile names a wick, Brisket's menu) show as
// notes the shops module returns on each entry.
import { el, btn, toast, hp, cap } from './menukit.js';
import * as Shops from '../rpg/shops.js';
import { displayName } from '../rpg/items.js';
const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
let SH = null;
export const shop = {
  id: 'shop', title: 'Shop',
  render(root, ctx, args, router) { SH = { ctx, root, args, router, tab: SH?.tab || 'buy' }; draw(); },
  destroy() { SH = null; },
};
function draw() {
  const { ctx, root, args } = SH, H = heroOf(ctx), D = ctx.data, id = args.shopId;
  const def = D.shops?.byId?.[id]; const sctx = { data: D, hero: H, act: +String(ctx.game?.act || 'act1').replace('act', '') || 1, runSeed: ctx.game?.seed ?? 1, rng: ctx.game?.rng?.loot, opinion: ctx.game?.npcState?.[def?.keeper]?.opinion ?? 0, lampsLit: ctx.game?.flags };
  root.replaceChildren();
  if (!def) { root.append(el('div', { class: 'lf-frame small' }, el('p', { text: 'The shutters are down.' }), btn('Leave', () => SH.router.back()))); return; }
  try { Shops.openShop(H, D, id); } catch {}
  let rows = [];
  try {
    if (SH.tab === 'buy') rows = (Shops.stockFor(id, sctx) || []).map(entry => { const it = entry.item || D.items?.byId?.[entry.id] || entry; const price = entry.price ?? Shops.priceOf(it, id, sctx);
      return el('div', { class: 'row between lf-shoprow' }, el('span', { text: entry.label || it.name || displayName(it) || it.id }), el('span', { class: 'dim small', text: entry.note || '' }), el('b', { text: `${hp(price)} ${entry.currency || def.currency || 'pennies'}` }),
        btn('Buy', () => { const r = Shops.buy(H, id, entry, sctx); if (r?.ok === false || typeof r === 'string') toast(r.reason || r, 'bad'); else { toast(`Bought ${entry.label || it.name || displayName(it)}.`); ctx.actions.restat?.(); draw(); } }, { cls: 'small' })); });
    else rows = (H.satchel || []).filter(it => Shops.shopBuys(D, id, it)).map(it => el('div', { class: 'row between lf-shoprow' }, el('span', { text: displayName(it) }), el('b', { text: hp(Shops.sellPriceOf(it, id, sctx)) }),
        btn('Sell', () => { const r = Shops.sell(H, it, id, sctx); if (r?.ok === false) toast(r.reason, 'bad'); draw(); }, { cls: 'small' })));
  } catch (e) { console.warn(e); rows = [el('p', { class: 'dim', text: 'The keeper is busy.' })]; }
  root.append(el('div', { class: 'lf-frame' },
    el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: def.name }), el('span', { class: 'grow' }), el('span', { class: 'gold', text: `● ${hp(H.currency?.pennies || 0)}  ◆ ${hp(H.currency?.pearls || 0)}` }), el('button', { class: 'lf-close', type: 'button', text: '✕', onclick: () => SH.router.back() })),
    el('p', { class: 'dim', text: args.line || def.greeting || '' }),
    el('div', { class: 'row' }, btn('Buy', () => { SH.tab = 'buy'; draw(); }, { cls: SH.tab === 'buy' ? 'small primary' : 'small' }), btn('Sell', () => { SH.tab = 'sell'; draw(); }, { cls: SH.tab === 'sell' ? 'small primary' : 'small' }), SH.tab === 'sell' ? btn('Sell junk', () => { try { Shops.sellJunk(H, id, { data: D, hero: H }); } catch {} draw(); }, { cls: 'small' }) : null),
    el('div', { class: 'lf-frame-body col' }, ...(rows.length ? rows : [el('p', { class: 'dim', text: SH.tab === 'buy' ? 'Nothing on the shelf.' : 'Nothing they want.' })]))));
}
export const screens = [shop];
