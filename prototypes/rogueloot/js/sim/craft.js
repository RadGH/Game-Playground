// Crafting actions in the sim (M17): apply a shard to an item (anywhere, from the bag), salvage an item into dust and
// shards, convert shards up a grade (5:1 + gold, at the crafter) and dust into Glimmer (20:1). Pure.
import { applyShard, salvageYield, stackInto, makeShard, makeDust, isCurrency, isShard, isDust } from '../rules/crafting.js';
import { findSpot } from '../rules/bag.js';
import { refreshHero } from './actors.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearCrafter = (w, p) => (w.area.markers || []).some(m => m.kind === 'npc' && m.id === 'crafter' && dist(p, m) < 5);
/** Put currency into the bag: stack first, then a free cell. Returns the new bag or null when full. */
export function addCurrency(w, bag, it) {
  const r = stackInto(w.content.currency, bag, it); if (!r.rest) return r.list;
  const pos = findSpot(w.content.items, r.list, r.rest); return pos ? [...r.list, { ...r.rest, pos }] : null;
}
const takeOne = (bag, uid) => bag.map(x => x.uid === uid ? { ...x, n: x.n - 1 } : x).filter(x => !isCurrency(x) || x.n > 0);

export function craftAct(w, p, a) {
  const ch = p.char, D = w.content.items, C = w.content.currency;
  if (!C?.shards) return { err: 'Crafting is not loaded.' };
  const done = () => { w.charDirty.add(p.id); refreshHero(w, p); return { ok: true }; };
  switch (a.do) {
    case 'craft': {
      const sh = (ch.bag || []).find(x => x.uid === a.shard && isShard(x)); if (!sh) return { err: 'That shard is not in your bag.' };
      const inBag = (ch.bag || []).find(x => x.uid === a.item), slot = Object.entries(ch.equip || {}).find(([, x]) => x?.uid === a.item)?.[0];
      const it = inBag || (slot && ch.equip[slot]); if (!it || isCurrency(it) || it.base === 'potion') return { err: 'Pick an item to shape.' };
      const before = JSON.stringify(it);
      const r = applyShard(D, C, w.rng, it, sh); if (r.err) return r;
      let bag = takeOne(ch.bag, sh.uid);
      if (inBag) bag = bag.map(x => x.uid === it.uid ? { ...r.item, pos: x.pos } : x);
      const equip = slot ? { ...ch.equip, [slot]: r.item } : ch.equip;
      p.char = { ...ch, bag, equip };
      w.events.push({ k: 'crafted', to: p.id, uid: it.uid, shard: sh.shard, before, after: JSON.stringify(r.item) });   // logged for bug reports
      return done();
    }
    case 'salvage': {
      const it = (ch.bag || []).find(x => x.uid === a.uid); if (!it || isCurrency(it) || it.base === 'potion') return { err: 'Pick an item to break.' };
      const y = salvageYield(C, w.rng, it);
      let bag = ch.bag.filter(x => x.uid !== it.uid);
      if (y.dust) bag = addCurrency(w, bag, makeDust(w.rng, y.dust)) || bag;
      for (const s of y.shards) bag = addCurrency(w, bag, makeShard(w.rng, s.shard, s.grade, s.n)) || bag;
      p.char = { ...ch, bag };
      w.events.push({ k: 'salvaged', to: p.id, dust: y.dust, shards: y.shards });
      return done();
    }
    case 'convert': {
      if (!nearCrafter(w, p)) return { err: 'The crafter does that, in town.' };
      const it = (ch.bag || []).find(x => x.uid === a.uid && isCurrency(x)); if (!it) return { err: 'Pick shards or dust.' };
      if (isDust(it)) {
        const need = C.convert?.dustToGlimmer || 20; if (it.n < need) return { err: `It takes ${need} dust.` };
        let bag = ch.bag.map(x => x.uid === it.uid ? { ...x, n: x.n - need } : x).filter(x => !isCurrency(x) || x.n > 0);
        bag = addCurrency(w, bag, makeShard(w.rng, 'glimmer', 1, 1)); if (!bag) return { err: 'No room in your bag.' };
        p.char = { ...ch, bag }; return done();
      }
      const ratio = C.convert?.up?.ratio || 5, fee = C.convert?.up?.convertGoldPerGrade?.[it.grade - 1];
      if (it.grade >= C.grades.length || fee == null) return { err: 'That is already the finest grade.' };
      if (it.n < ratio) return { err: `It takes ${ratio} of them.` };
      if ((ch.gold || 0) < fee) return { err: `It costs ${fee} gold.` };
      let bag = ch.bag.map(x => x.uid === it.uid ? { ...x, n: x.n - ratio } : x).filter(x => !isCurrency(x) || x.n > 0);
      bag = addCurrency(w, bag, makeShard(w.rng, it.shard, it.grade + 1, 1)); if (!bag) return { err: 'No room in your bag.' };
      p.char = { ...ch, gold: ch.gold - fee, bag }; return done();
    }
  }
  return { err: 'unknown action' };
}
