// Inventory actions, run by the sim so the server stays the referee (personal loot, trading, ruling 8). Pure.
// The hero's character document (p.char) is changed and marked dirty; the owner's browser gets it back and saves it.
//   equip { uid, slot }   unequip { slot }   move { uid, x, y }   identify { uid }   spend { attr, n }   swap (weapon sets)
import { canEquip, identify as ided, WORN } from '../rules/items.js';
import { gripOf, handsBumped, compareSlots, firstCompareSlot } from '../rules/hands.js';
import { fits, findSpot, itemAt, BAG_W, BAG_H } from '../rules/bag.js';
import { spendAttr } from '../rules/character.js';
import { refreshHero } from './actors.js';
import { sheet } from '../rules/sheet.js';
import { isPotion, toBelt, takeFromBelt, beltSlots } from '../rules/potions.js';
import { addFx } from './status.js';
import { potionRefund } from './legendary.js';

const data = w => w.content.items;
const done = (w, p) => { w.charDirty.add(p.id); refreshHero(w, p); return { ok: true }; };
const fromBag = (ch, uid) => (ch.bag || []).find(i => i.uid === uid);

export function inventoryAct(w, p, a) {
  const ch = p.char, D = data(w);
  if (!D?.bases) return { err: 'Items are not loaded.' };
  switch (a.do) {
    case 'equip': {
      const it = fromBag(ch, a.uid); if (!it) return { err: 'That is not in your bag.' };
      if (p.cast) return { err: 'Not while casting.' };
      const b = D.bases[it.base], grip0 = gripOf(D, ch, w.content.skills); const slot = WORN.includes(a.slot) || a.slot === 'weapon2' || a.slot === 'offhand2' ? a.slot : defaultSlot(ch, b, D, grip0);
      const st = sheet(ch, D, w.content.skills), grip = gripOf(D, ch, w.content.skills);
      const r = canEquip(D, ch, it, slot, st.attrs, { equip: ch.equip || {}, grip }); if (!r.ok) return { err: r.why };
      if (it.ided === false) return { err: 'Identify it first (right-click).' };
      // whatever was there goes into the item's old bag spot (or anywhere it fits)
      const old = (ch.equip || {})[slot];
      const bag = ch.bag.filter(i => i.uid !== it.uid);
      const extra = [];
      if (old) extra.push(old);
      // the hands must agree (js/rules/hands.js): a two-hander frees the off hand unless a quiver pairs with it (or
      // Doubled Grasp holds a second one); a shield next to a two-hander frees the main hand; a quiver leaves with its bow
      for (const k of handsBumped(D, it, slot, ch.equip || {}, grip)) if (ch.equip?.[k]) extra.push(ch.equip[k]);
      let nb = bag;
      for (const o of extra) { const { pos: _, ...clean } = o; const spot = o === old && fits(D, nb, clean, it.pos?.x ?? -1, it.pos?.y ?? -1) ? it.pos : findSpot(D, nb, clean); if (!spot) return { err: 'No room in your bag.' }; nb = [...nb, { ...clean, pos: spot }]; }
      const equip = { ...(ch.equip || {}) }; const { pos: _p, ...wear } = it; equip[slot] = wear;
      for (const o of extra) for (const k of Object.keys(equip)) if (equip[k] === o && k !== slot) delete equip[k];
      p.char = { ...ch, equip, bag: nb };
      return done(w, p);
    }
    case 'unequip': {
      const it = ch.equip?.[a.slot]; if (!it) return { err: 'Nothing there.' };
      const pos = a.x != null && fits(D, ch.bag, it, a.x, a.y) ? { x: a.x, y: a.y } : findSpot(D, ch.bag, it); if (!pos) return { err: 'No room in your bag.' };
      const equip = { ...ch.equip }; delete equip[a.slot];
      p.char = { ...ch, equip, bag: [...ch.bag, { ...it, pos }] };
      return done(w, p);
    }
    case 'move': {
      const it = fromBag(ch, a.uid); if (!it) return { err: 'That is not in your bag.' };
      const x = a.x | 0, y = a.y | 0;
      if (!(x >= 0 && y >= 0 && x < BAG_W && y < BAG_H)) return { err: 'That is outside the bag.' };
      const other = itemAt(ch.bag, x, y);                                   // one item a square: moving onto another swaps them
      p.char = { ...ch, bag: ch.bag.map(i => i.uid === it.uid ? { ...i, pos: { x, y } } : other && i.uid === other.uid ? { ...i, pos: it.pos } : i) };
      w.charDirty.add(p.id); return { ok: true };
    }
    case 'identify': {
      const it = fromBag(ch, a.uid) || Object.values(ch.equip || {}).find(i => i?.uid === a.uid); if (!it) return { err: 'Nothing to identify.' };
      if (it.ided !== false) return { ok: true };
      p.char = { ...ch, bag: ch.bag.map(i => i.uid === a.uid ? ided(i) : i) };
      w.events.push({ k: 'identified', t: p.id, uid: a.uid });
      return done(w, p);
    }
    case 'spend': {
      const r = spendAttr(ch, a.attr, Math.max(1, Math.min(50, a.n | 0 || 1))); if (r.err) return r;
      p.char = r; return done(w, p);
    }
    case 'drink': {
      if (p.dead) return { err: 'You are dead.' };
      const kind = a.kind === 'mana' ? 'mana' : 'health';
      let got = takeFromBelt(ch.belt || [], kind), bag = ch.bag;
      if (!got) { const it = (ch.bag || []).find(i => isPotion(i) && i.kind === kind); if (!it) return { err: kind === 'mana' ? 'No mana potions.' : 'No healing potions.' }; bag = ch.bag.map(i => i.uid === it.uid ? { ...i, n: i.n - 1 } : i).filter(i => !isPotion(i) || i.n > 0); got = { belt: ch.belt, potion: it }; }
      const P = w.content.potions, size = P.sizes[got.potion.size] || { health: 40, mana: 25, secs: 6 };
      const power = 1 + (p.st.potionPower || 0) / 100;
      // D2 style: each potion is its own refill, so drinking two stacks two (stack: true)
      addFx(w, p, { id: 'potion:' + kind, kind: kind === 'mana' ? 'mot' : 'hot', per: size[kind] * power / size.secs, secs: size.secs, src: p.id, stack: true });
      // legendary (Packrat's Sash): sometimes the potion is not used up
      if (potionRefund(w, p) && w.rng() * 100 < potionRefund(w, p)) { w.events.push({ k: 'drink', t: p.id, kind, free: true }); return { ok: true }; }
      p.char = { ...ch, belt: got.belt, bag }; w.charDirty.add(p.id);
      w.events.push({ k: 'drink', t: p.id, kind });
      return { ok: true };
    }
    case 'belt': {                       // move a potion stack from the bag into the belt
      const it = fromBag(ch, a.uid); if (!isPotion(it)) return { err: 'Only potions go in the belt.' };
      const slots = beltSlots(sheet(ch, D)); if (!slots) return { err: 'Wear a belt to carry potions in it.' };
      const { pos: _, ...clean } = it; const r = toBelt(w.content.potions, ch.belt || [], slots, clean);
      const bag = ch.bag.filter(i => i.uid !== it.uid); if (r.rest) bag.push({ ...r.rest, pos: it.pos });
      p.char = { ...ch, belt: r.belt, bag }; w.charDirty.add(p.id); return { ok: true };
    }
    case 'unbelt': {
      const i = a.i | 0, s = (ch.belt || [])[i]; if (!s) return { err: 'Empty.' };
      const pos = findSpot(D, ch.bag, s); if (!pos) return { err: 'No room in your bag.' };
      const belt = ch.belt.slice(); belt[i] = null;
      p.char = { ...ch, belt, bag: [...ch.bag, { ...s, pos }] }; w.charDirty.add(p.id); return { ok: true };
    }
    case 'swap': {
      if (p.cast) return { err: 'Not while casting.' };
      const e = { ...(ch.equip || {}) }; [e.weapon, e.weapon2] = [e.weapon2, e.weapon]; [e.offhand, e.offhand2] = [e.offhand2, e.offhand];
      for (const k of ['weapon', 'offhand', 'weapon2', 'offhand2']) if (!e[k]) delete e[k];
      p.char = { ...ch, equip: e }; p.gcdUntil = Math.max(p.gcdUntil, w.time + 0.5);
      return done(w, p);
    }
  }
  return { err: 'unknown action' };
}
/** No slot asked for: the first free one this item could take (a free ring finger), else its own slot. */
function defaultSlot(ch, b, D, grip) {
  const slots = compareSlots(D, b, grip);
  if (b.slot === 'ring' || b.slot === 'offhand') return firstCompareSlot(slots, ch.equip);
  return b.slot;
}
export { WORN };
