// Town services (M13): vendors with stock rolled for each hero once a session, buying, selling, repairs, potions, the
// gambler (unidentified items for gold), and the device stash (ruling 11: the stash lives in the browser — items going
// in leave the bag here; items coming out are checked like any other item, ruling 8). Pure. You must stand near the
// NPC's marker (kind npc, id vendor|potions|gambler|stash|crafter|...).
import { makeItem, canEquip } from '../rules/items.js';
import { buyPrice, sellPrice, itemValue, gamble } from '../rules/loot.js';
import { makePotion, isPotion } from '../rules/potions.js';
import { findSpot } from '../rules/bag.js';
import { checkAny } from './content.js';
import { refreshHero } from './actors.js';
import { makeRng, hashStr } from './rng.js';

export const NPC_REACH = 5;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const npcNear = (w, p, id) => (w.area.markers || []).find(m => m.kind === 'npc' && m.id === id && dist(p, m) < NPC_REACH) || (w.area.markers || []).find(m => m.kind === id && dist(p, m) < NPC_REACH);
const GAMBLE_KINDS = ['weapon', 'armour', 'offhand', 'jewellery', 'belt'];

/** What the vendor sells this hero this session: 10 pieces near their level, mostly normal, some magic. */
function stockFor(w, p) {
  w.shops ||= new Map();
  const key = p.id + ':' + p.char.level;
  if (w.shops.has(key)) return w.shops.get(key);
  const D = w.content.items, rng = makeRng((w.seed ^ hashStr(key)) >>> 0), L = p.char.level, items = [];
  for (let i = 0; i < 10; i++) { const it = makeItem(D, rng, Math.max(1, L - 1 + Math.floor(rng() * 3)), { rarity: rng() < 0.3 ? 'magic' : 'normal', ch: p.char }); if (it) items.push(it); }
  for (const it of items) it.ided = true;
  const shop = { items }; w.shops.set(key, shop);
  return shop;
}
const potionStock = (P, L) => Object.entries(P.sizes).filter(([, z]) => z.level <= Math.max(1, L)).slice(-2).flatMap(([size, z]) => ['health', 'mana'].map(kind => ({ kind, size, price: z.price })));

export function townAct(w, p, a) {
  const ch = p.char, D = w.content.items, P = w.content.potions;
  const pay = n => { if ((ch.gold || 0) < n) return false; p.char = { ...p.char, gold: ch.gold - n }; return true; };
  const stow = (it, gold = 0) => { const pos = findSpot(D, p.char.bag || [], it); if (!pos) return null; p.char = { ...p.char, gold: (p.char.gold || 0) + gold, bag: [...(p.char.bag || []), { ...it, pos }] }; return pos; };
  const done = (extra = {}) => { w.charDirty.add(p.id); refreshHero(w, p); return { ok: true, ...extra }; };
  switch (a.do) {
    case 'shop': {
      const npc = String(a.npc || ''); if (!npcNear(w, p, npc)) return { err: 'Walk up to them first.' };
      const out = { k: 'shop', to: p.id, npc };
      if (npc === 'vendor') out.items = stockFor(w, p).items.map(it => ({ ...it, price: buyPrice(D, it) }));
      if (npc === 'potions') out.potions = potionStock(P, ch.level);
      if (npc === 'gambler') out.gamble = GAMBLE_KINDS.map(g => ({ kind: g, price: gamblePrice(D, ch.level) }));
      if (npc === 'vendor' || npc === 'potions') out.repair = repairCost(D, ch);
      w.events.push(out); return { ok: true };
    }
    case 'buy': {
      if (!npcNear(w, p, 'vendor')) return { err: 'Walk up to the trader first.' };
      const shop = stockFor(w, p), it = shop.items.find(i => i.uid === a.uid); if (!it) return { err: 'Sold out.' };
      const price = buyPrice(D, it); if ((ch.gold || 0) < price) return { err: 'Not enough gold.' };
      if (!findSpot(D, ch.bag || [], it)) return { err: 'No room in your bag.' };
      pay(price); stow(it); shop.items = shop.items.filter(i => i !== it);
      return done();
    }
    case 'buyPotion': {
      if (!npcNear(w, p, 'potions') && !npcNear(w, p, 'vendor')) return { err: 'Walk up to the trader first.' };
      const row = potionStock(P, ch.level).find(r => r.kind === a.kind && r.size === a.size); if (!row) return { err: 'Not sold here.' };
      if ((ch.gold || 0) < row.price) return { err: 'Not enough gold.' };
      const pot = makePotion(w.rng, row.kind, row.size, 1);
      if (!stow(pot)) return { err: 'No room in your bag.' };
      p.char = { ...p.char, gold: p.char.gold - row.price };
      return done();
    }
    case 'sell': {
      if (!npcNear(w, p, 'vendor') && !npcNear(w, p, 'potions') && !npcNear(w, p, 'gambler')) return { err: 'Walk up to a trader first.' };
      const it = (ch.bag || []).find(i => i.uid === a.uid); if (!it) return { err: 'That is not in your bag.' };
      const gold = isPotion(it) ? Math.max(1, Math.round((P.sizes[it.size]?.price || 4) * 0.25)) * it.n : sellPrice(D, it);
      p.char = { ...ch, gold: (ch.gold || 0) + gold, bag: ch.bag.filter(i => i.uid !== it.uid) };
      w.events.push({ k: 'sold', to: p.id, gold });
      return done();
    }
    case 'repair': {
      if (!npcNear(w, p, 'vendor') && !npcNear(w, p, 'potions')) return { err: 'Walk up to the trader first.' };
      const cost = repairCost(D, ch); if (!cost) return { err: 'Nothing needs mending.' };
      if (!pay(cost)) return { err: `Mending costs ${cost} gold.` };
      const equip = {}; for (const [s, it] of Object.entries(p.char.equip || {})) equip[s] = it?.dur ? { ...it, dur: [it.dur[1], it.dur[1]] } : it;
      p.char = { ...p.char, equip };
      return done();
    }
    case 'gamble': {
      if (!npcNear(w, p, 'gambler')) return { err: 'Walk up to the gambler first.' };
      const kind = GAMBLE_KINDS.includes(a.kind) ? a.kind : 'weapon', price = gamblePrice(D, ch.level);
      if ((ch.gold || 0) < price) return { err: 'Not enough gold.' };
      const base = pickGambleBase(D, w.rng, ch.level, kind, ch); if (!base) return { err: 'Nothing like that on the table today.' };
      const it = gamble(D, w.rng, ch.level, base.id, ch); if (!it) return { err: 'Nothing like that on the table today.' };
      if (!findSpot(D, ch.bag || [], it)) return { err: 'No room in your bag.' };
      pay(price); stow(it);
      return done();
    }
    case 'stash': {                                         // bag -> this device's stash (the browser keeps it)
      if (!npcNear(w, p, 'stash')) return { err: 'Walk up to your stash first.' };
      const it = (ch.bag || []).find(i => i.uid === a.uid); if (!it) return { err: 'That is not in your bag.' };
      p.char = { ...ch, bag: ch.bag.filter(i => i.uid !== it.uid) };
      const { pos: _, ...clean } = it;
      w.events.push({ k: 'stashed', to: p.id, item: clean });
      return done();
    }
    case 'unstash': {                                       // the device stash -> bag, checked like anything else
      if (!npcNear(w, p, 'stash')) return { err: 'Walk up to your stash first.' };
      const it = a.item; const c = checkAny(w.content, it || {}); if (!c.ok) return { err: `That item cannot come in (${c.why}).` };
      if ([...(ch.bag || []), ...Object.values(ch.equip || {})].some(i => i?.uid === it.uid)) return { err: 'You already carry that.' };
      const { pos: _, price: __, ...clean } = it;
      if (!stow(clean)) return { err: 'No room in your bag.' };
      w.events.push({ k: 'unstashed', to: p.id, uid: it.uid });
      return done();
    }
  }
  return { err: 'unknown action' };
}
export function repairCost(D, ch) {
  let n = 0; for (const it of Object.values(ch.equip || {})) if (it?.dur && it.dur[0] < it.dur[1]) n += (it.dur[1] - it.dur[0]) / it.dur[1] * itemValue(D, it) * 0.15;
  return Math.ceil(n);
}
export const gamblePrice = (D, L) => Math.round(itemValue(D, { base: 'footman_sword', ilvl: L, rarity: 'normal' }) * 3);
function pickGambleBase(D, rng, L, kind, ch) {
  const group = b => b.slot === 'weapon' ? 'weapon' : b.slot === 'offhand' ? 'offhand' : (b.slot === 'ring' || b.slot === 'neck') ? 'jewellery' : b.slot === 'belt' ? 'belt' : 'armour';
  const pool = Object.values(D.bases).filter(b => group(b) === kind && (b.dropLevel || 1) <= L && (b.dropLevel || 1) >= L - 12);
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}
void canEquip;
