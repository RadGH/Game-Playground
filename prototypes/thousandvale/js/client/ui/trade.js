// Play-test 2 Q14 — trading with another player (protocol §13, unchanged server side):
//   trade {op:'ask', id}  -> they get tradeAsk {trade, from, name}: an Accept / Decline pop-up at the top centre
//   trade {op:'accept'|'offer'|'lock'|'confirm'|'cancel'} -> tradeState {trade:{id, state, you, them} | null, done?, why?}
//
// The window: your offer on the left (click an item in your bag list below to add it, click it again to take it back;
// gold box), theirs on the right; any change unlocks both; "Lock offer" -> both locked -> "Accept trade" -> done.
// Q15: with "Only allow trade requests from friends" on, a stranger's request is declined here too (the server refuses
// it first once it knows the setting).

import { h, createPanel } from '../ui-panel.js';
import { itemCell, goldText } from './item-cell.js';
import { onIcon, iconsActive } from './item-icons.js';
import { tradeView, TRADE_WHY } from './pt2-core.js';
import { hideTip } from './tips.js';

const MAX_ITEMS = 12;

export function createTrade({ net, hud, bag, settings, isFriend, askPop }) {
  const S = { t: null, offer: { items: [], gold: 0 }, asked: null };
  const panel = createPanel({ id: 'trade', title: 'Trade', width: 620, cls: 'trade-panel', onClose: () => { if (S.t) net()?.tradeOp('cancel'); iconsActive(false, 'trade'); hideTip(); } });

  /** Ask someone (an entity id near you). */
  function ask(id, name) {
    if (S.t) { hud.toast('Finish the trade you have open first.', 'warn'); return; }
    net()?.tradeOp('ask', { id });
    S.asked = name || 'them';
    hud.chat(`You ask ${name || 'them'} to trade.`, 'system');
  }
  function onAsk(m) {
    if (settings.get('tradeFriends') && !isFriend(m.name)) {
      net()?.tradeOp('cancel');
      hud.chat(`${m.name} asked to trade — declined (you only trade with friends; change it in Settings).`, 'system');
      return;
    }
    hud.chat(`${m.name} wants to trade with you.`, 'system');
    askPop.show({ key: 'trade:' + m.trade, text: `${m.name} wants to trade.`, yes: 'Trade', no: 'Decline', ms: 30000,
      onYes: () => net()?.tradeOp('accept', { id: m.trade }), onNo: () => net()?.tradeOp('cancel') });
  }

  function send() { if (!S.t) return; net()?.tradeOp('offer', { id: S.t.id, items: S.offer.items.slice(), gold: S.offer.gold }); }
  function toggleItem(uid) {
    if (!S.t || S.t.you.locked) return;
    const i = S.offer.items.indexOf(uid);
    if (i >= 0) S.offer.items.splice(i, 1);
    else { if (S.offer.items.length >= MAX_ITEMS) { hud.toast(`At most ${MAX_ITEMS} items in one trade.`, 'warn'); return; } S.offer.items.push(uid); }
    hideTip(); send(); draw();
  }

  function draw() {
    const t = S.t; if (!t || !panel.isOpen) return;
    const v = tradeView(t);
    panel.setTitle(`Trade with ${t.them.name}`, t.state === 'asked' ? 'Waiting for them to accept…' : '');
    const half = (who, side, mine) => h('section.tr-half' + (side.locked ? '.locked' : '') + (side.confirmed ? '.ok' : ''), {},
      h('h4', {}, who, h('span.tr-say', {}, mine ? v.youSay : v.themSay)),
      h('div.tr-grid', {}, ...Array.from({ length: MAX_ITEMS }, (_, i) => {
        const it = side.items[i];
        return it ? itemCell(it, { small: true, onclick: mine && v.canEdit ? () => toggleItem(it.uid) : null }) : h('div.islot.small.empty');
      })),
      h('div.tr-gold', {}, mine && v.canEdit
        ? h('label', {}, 'Gold ', h('input', { type: 'number', min: 0, max: bag.state.gold, step: 1, value: String(S.offer.gold), 'aria-label': 'Gold to offer', onchange: e => { S.offer.gold = Math.max(0, Math.min(bag.state.gold, Math.floor(+e.target.value || 0))); send(); } }))
        : h('b', {}, goldText(side.gold))));
    const mine = new Set(S.offer.items);
    const tradable = bag.state.bag.filter(it => it && !it.bound);
    const pick = v.canEdit ? h('div.tr-bag', {}, h('h4', {}, 'Your bag — click to offer'), tradable.length ? null : h('p.dim', {}, 'Your bag is empty.'), h('div.tr-baggrid', {}, ...tradable.map(it => {
      const c = itemCell(it, { small: true, onclick: () => toggleItem(it.uid) });
      if (mine.has(it.uid)) c.classList.add('offered');
      return c;
    }))) : null;
    const btn = h('button.primary.small', { type: 'button', disabled: !v.button.op, dataset: { act: v.button.op || 'wait' }, onclick: () => { if (v.button.op) net()?.tradeOp(v.button.op, { id: t.id }); } }, v.button.label);
    panel.fill(h('div.tr-halves', {}, half('Your offer', t.you, true), half(t.them.name, t.them, false)), pick,
      h('div.row.end', {}, h('button.ghost.small', { type: 'button', onclick: () => { net()?.tradeOp('cancel'); } }, 'Cancel'), btn));
  }
  onIcon(() => { if (panel.isOpen) { clearTimeout(draw.t); draw.t = setTimeout(draw, 80); } });

  function onState(m) {
    const t = m.trade;
    if (!t) {
      const was = S.t; S.t = null; S.offer = { items: [], gold: 0 };
      askPop.drop('trade:');
      if (panel.isOpen) { panel.close(); }
      if (m.done) { hud.toast('Trade complete.', 'good'); hud.chat(`Trade with ${was?.them?.name || 'them'} complete.`, 'loot'); }
      else if (m.why || was || S.asked) { const w = TRADE_WHY[m.why] || m.msg || 'The trade was cancelled.'; hud.chat(w, 'system'); if (m.why && m.why !== 'cancelled') hud.toast(w, 'warn'); }
      S.asked = null;
      return;
    }
    const first = !S.t;
    S.t = t; S.asked = null;
    // keep our editable copy in step with what the server holds (it is the truth)
    S.offer = { items: (t.you.items || []).map(i => i.uid), gold: t.you.gold || 0 };
    if (t.state === 'open' || first) { if (!panel.isOpen) { iconsActive(true, 'trade'); panel.open(); } }
    draw();
  }

  function wire(n) {
    n.on('tradeAsk', onAsk);
    n.on('trade', onState);
    n.on('bag', () => { if (panel.isOpen) draw(); });
    n.on('err', e => { if (e.code === 'trade' || e.code === 'tradeBusy') { hud.toast(e.msg || (e.code === 'tradeBusy' ? 'They are already trading.' : 'You cannot trade now.'), 'warn'); S.asked = null; } });
  }
  return { wire, ask, panel, toggleItem, get state() { return { open: panel.isOpen, t: S.t ? { id: S.t.id, state: S.t.state, you: { items: S.t.you.items.length, gold: S.t.you.gold, locked: S.t.you.locked, confirmed: S.t.you.confirmed }, them: { name: S.t.them.name, items: S.t.them.items.length, gold: S.t.them.gold, locked: S.t.them.locked, confirmed: S.t.them.confirmed } } : null, offer: { ...S.offer } }; } };
}
