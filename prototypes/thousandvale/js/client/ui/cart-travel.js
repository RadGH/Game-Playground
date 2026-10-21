// Play-test 8 (W5): the ox-cart window. Talk to a carter by a town gate (or flag down a cart on the road) and pick where to
// ride: every stop on the road network with its fare, the road distance and how long the ride takes — and, when you may
// not go, the reason in words. A second press confirms ("Ride to Orrinsford for 14 gold?"), then the cart rolls off.
//
// Unlike a waystone you may ride to a town you have never seen: this is the cheap, slow way to get somewhere new.
//
// Server (A, protocol v8): `use` on the carter / the parked cart -> `cartList {id, from, name, stops:[{id, name, fare, m, s,
// level?, locked?, why?, msg?}], gold, tokens}`; we send `cart {op:'go', id, to}` -> `cartR {ok, to, name, fare, token?, why?,
// msg?}`; the ride itself (`cartRide`) is D-world's. A `cart_token` pays one fare of any size. Rows: pt8-core.js cartRows.

import { createPanel, h } from '../ui-panel.js';
import { cartRows, cartRefusal, rideText } from './pt8-core.js';
import { distText } from './map-data.js';

// feedback #101 / #105 (2026-10-21): "update the caravan NPC to show town sizes and maybe even NPC availability" — each stop
// says how big the place is and who works there (data/world/town-info.json, made by tools/content-town-info.mjs)
let infoP = null;
const townInfo = () => (infoP ||= fetch(new URL('../../../data/world/town-info.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null));
const SIZE = { hamlet: 'Hamlet', village: 'Village', town: 'Town', city: 'City', capital: 'Capital' };
const WHO = { smith: 'Smith', weaponsmith: 'Weapons', armourer: 'Armour', merchant: 'Merchant', general: null, innkeeper: 'Inn', inn: null, healer: 'Healer', stablehand: 'Stable', stable: null,
  market: 'Market', trader: null, jeweller: 'Jeweller', trainer: 'Class trainer', bowyer: 'Bowyer', apothecary: 'Apothecary', tailor: 'Tailor', provisioner: 'Provisioner', barber: 'Barber',
  broker: 'Broker', unbinder: 'Unbinder', elder: 'Elder', angler: 'Angler', prospector: 'Mining', logger: 'Logging', forager: 'Foraging', skinner: 'Skinning', scholar: 'Scholar', reeve: 'Reeve', hermit: 'Hermit' };
const KEY_FIRST = ['Inn', 'Merchant', 'Smith', 'Healer', 'Stable', 'Market', 'Class trainer', 'Jeweller'];
/** Who works in a town, in words: the ones a traveller looks for first. -> { short, all } */
export function whoWorks(services = []) {
  const names = [...new Set(services.map(r => WHO[r] === undefined ? r[0].toUpperCase() + r.slice(1) : WHO[r]).filter(Boolean))];
  const key = KEY_FIRST.filter(n => names.includes(n)), rest = names.filter(n => !KEY_FIRST.includes(n));
  const shown = key.slice(0, 5), more = names.length - shown.length;
  return { short: names.length ? shown.join(' · ') + (more > 0 ? ` · +${more} more` : '') : 'Nobody to trade with — a carter and a few houses', all: [...key, ...rest].join(', ') };
}

export function createCartTravel({ net, hud, onOpen = null }) {
  const S = { m: null, pick: null, going: false, timer: 0, info: null };
  townInfo().then(d => { S.info = d; draw(); });
  const panel = createPanel({ id: 'cart', title: 'Ox cart', width: 380, cls: 'cart-panel', onClose: () => { S.pick = null; S.going = false; clearTimeout(S.timer); } });

  const send = (id, to) => { const n = net(); if (!n) return false; if (typeof n.cart === 'function') { n.cart('go', id, to); return true; } if (!n._raw) return false; n._raw('game', JSON.stringify({ t: 'cart', op: 'go', id, to })); return true; };
  const gold = () => (Number.isFinite(S.m?.gold) ? S.m.gold : net()?.joined?.you?.gold ?? null);

  function draw() {
    const m = S.m; if (!m || !panel.isOpen) return;
    const rows = cartRows({ ...m, gold: gold() });
    const tokens = Math.max(0, m.tokens | 0);
    panel.setTitle(m.name || 'Ox cart', m.from ? `From ${m.from}` : 'Where to?');
    const note = h('p.note');
    const row = r => {
      const picked = S.pick === r.id;
      const cost = r.free ? 'Free' : r.token ? 'One cart token' : `${r.fare.toLocaleString()} gold`;
      const facts = [r.metres != null ? `${distText(r.metres)} by road` : '', r.secs != null ? rideText(r.secs) : '', r.level ? `level ${r.level} country` : ''].filter(Boolean).join(' · ');
      const T = S.info?.towns?.[r.name] || S.info?.towns?.[String(r.name).replace(/ (gate|cart|stop)$/i, '')] || null, who = T ? whoWorks(T.services) : null;
      return h('li.cart-row' + (r.locked ? '.locked' : '') + (picked ? '.picked' : ''), { dataset: { stop: String(r.id) } },
        h('div.cart-where', {}, h('b', {}, r.name, T ? h('span.cart-size.size-' + T.size, {}, SIZE[T.size] || T.size) : null), h('small', {}, facts),
          who ? h('small.cart-who', { dataset: { tip: who.all ? `Who works in ${r.name}: ${who.all}.` : `${r.name} has no traders.` } }, who.short) : null,
          r.locked ? h('small.bad', {}, r.why) : null),
        h('span.cart-fare' + (r.free || r.token ? '.free' : ''), {}, cost),
        picked
          ? h('span.cart-confirm', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'no' }, onclick: () => { S.pick = null; draw(); } }, 'Not now'),
              h('button.primary.small', { type: 'button', disabled: S.going, dataset: { act: 'go' }, onclick: () => go(r) }, S.going ? 'Boarding…' : r.free ? 'Ride' : r.token ? 'Ride (token)' : `Pay ${r.fare.toLocaleString()} and ride`))
          : h('button.ghost.small', { type: 'button', disabled: r.locked, dataset: { act: 'pick' }, onclick: () => { S.pick = r.id; draw(); panel.body.querySelector('.cart-row.picked [data-act="go"]')?.focus({ preventScroll: true }); } }, 'Ride'));
    };
    panel.fill(
      h('p.cart-lead', {}, 'The cart follows the road from town to town. You can ride to a town you have never seen.'),
      rows.length ? h('ul.cart-list', {}, ...rows.map(row)) : h('p.empty', {}, 'No cart goes anywhere from here today.'),
      note,
      h('div.row.end', {}, h('span.cart-purse', {}, gold() != null ? `You carry ${gold().toLocaleString()} gold` : '', tokens ? ` · ${tokens} cart token${tokens === 1 ? '' : 's'} (each pays one ride)` : ''), h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Stay here')));
  }
  function go(r) {
    if (S.going) return;
    if (!send(S.m.id, r.id)) { const n = panel.body.querySelector('.note'); if (n) n.textContent = 'You are not connected.'; return; }
    S.going = true; draw();
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (S.going) { S.going = false; draw(); const n = panel.body.querySelector('.note'); if (n) n.textContent = 'The carter did not answer. Try again.'; } }, 8000);
  }
  /** `cartList`, or the same fields inside `used {kind:'cart'}`. */
  function open(m) {
    if (!m || !Array.isArray(m.stops)) return false;
    S.m = { ...m, name: m.name || 'Ox cart' }; S.pick = null; S.going = false;
    onOpen?.(); panel.open(); draw();
    return true;
  }
  function wire(n) {
    n.on('cartList', open);
    n.on('used', u => { if (u && u.ok && u.kind === 'cart' && Array.isArray(u.stops)) open(u); });
    n.on('cartR', r => {
      if (r.op === 'arrive') { if (r.ok === false) hud.toast(cartRefusal(r), 'warn'); return; }      // the end of the ride: the arrival banner says the rest
      S.going = false; clearTimeout(S.timer);
      if (r.ok === false) { const text = cartRefusal(r); if (panel.isOpen) { draw(); const el = panel.body.querySelector('.note'); if (el) el.textContent = text; } else hud.toast(text, 'warn'); return; }
      hud.chat?.(`You climb onto the cart for ${r.name || 'the next town'}${r.token ? ' (a cart token paid the fare)' : r.fare ? ` — ${r.fare} gold` : ''}.`, 'system');
      panel.close();
    });
    n.on('cartRide', () => { if (panel.isOpen) panel.close(); });
    n.on('you', p => { if (p.gold != null && S.m && panel.isOpen) { S.m.gold = p.gold; draw(); } });
    n.on('joined', () => { if (panel.isOpen) panel.close(); });
  }
  return { panel, wire, open, draw, get state() { return { open: panel.isOpen, from: S.m?.from || '', pick: S.pick, going: S.going, rows: S.m ? cartRows({ ...S.m, gold: gold() }) : [] }; } };
}
