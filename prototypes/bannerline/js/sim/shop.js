// The Outfitter's catalogue (data/shop.json tabs over data/items-bl.json) and the AI's shopping,
// upgrading and power use. Everything the AI does goes out as ordinary commands (`buy`, `sell`,
// `use`, `upgradeUnit`, `power`), so it can never do what a human could not.

import { itemDef, atShop, carries, itemScore } from './items.js';
import { upgradeCost } from './upgrades.js';
import { powerRefusal } from './powers.js';
import { liveEnt } from './state.js';

/** Tabs in display order: [{ id, name, desc, items: [id] }]. */
export function shopTabs(data) { return data.shop.tabs; }

const CASTERS = { pyromancer: true, druid: true };
// how much each hero wants each category (AI only)
function affinity(data, p, def) {
  const caster = !!CASTERS[p.hero];
  if (def.category === 'trinkets') return caster ? 1.3 : 0.6;
  if (def.category === 'weapons') return caster ? 0.7 : 1.3;
  if (def.stats.spellPower) return caster ? 1.2 : 0.5;
  return 1;
}

const HEALS = ['healing_draught', 'greater_draught'];
export function aiHealSlot(p) { return p.inv.findIndex(it => it && HEALS.includes(it.id)); }

/**
 * The AI's item / upgrade / power decisions for one think. `fund` = gold set aside for these (the
 * rest goes to sends). Returns { cmds, spent }.
 */
export function aiShopping(ctx, p, K, fund) {
  const { state, data, map } = ctx;
  const cmds = [], cmd = (type, args = {}) => cmds.push(Object.assign({ p: p.id, type }, args));
  let gold = p.gold, spent = 0;
  const hero = liveEnt(state, p.heroEnt);
  const inv = p.inv.slice();
  const free = () => inv.indexOf(null);

  // the next item must be worth the slot: once four slots hold items, at least 1.5x the cheapest one
  const carried = inv.filter(it => it && !itemDef(data, it.id).consumable).map(it => itemDef(data, it.id).price);
  const floor = Math.max(80, carried.length >= 4 ? 1.5 * Math.min(...carried) : 0);
  if (hero && atShop(ctx, p)) {
    // two healing draughts (the old belt) and, once there is money to come back for, a Scroll of Return
    const have = id => inv.filter(it => it && it.id === id).length;
    for (const [id, n] of [['healing_draught', 3], ['scroll_of_return', 1]]) {
      const def = itemDef(data, id);
      while (have(id) < n && free() >= 0 && gold >= def.price * 2 && (id !== 'scroll_of_return' || gold >= 160)) {
        cmd('buy', { id }); inv[free()] = { id }; gold -= def.price; spent += def.price; fund -= def.price;
      }
    }
    // the best item the fund affords; sell the cheapest carried item to make room for a much better one
    const items = Object.values(data['items-bl'].items).filter(d => !d.consumable && d.price >= floor && d.price <= Math.min(fund, gold) && !(d.uniqueEquipped && carries(p, d.id)));
    if (items.length) {
      const val = d => d.price * affinity(data, p, d);
      let best = items[0];
      for (const d of items) if (val(d) > val(best) || (val(d) === val(best) && d.id < best.id)) best = d;
      if (free() < 0) {
        let worst = -1;
        inv.forEach((it, i) => { if (it && !itemDef(data, it.id).consumable && (worst < 0 || itemScore(data, it) < itemScore(data, inv[worst]))) worst = i; });
        if (worst >= 0 && itemScore(data, best.id) > 1.5 * itemScore(data, inv[worst])) { cmd('sell', { slot: worst }); inv[worst] = null; }
      }
      if (free() >= 0) { cmd('buy', { id: best.id }); inv[free()] = { id: best.id }; gold -= best.price; spent += best.price; fund -= best.price; }
    }
  } else if (hero && ((fund >= Math.max(300, floor * 1.5) && hero.hp > hero.hpMax * 0.6) || (aiHealSlot(p) < 0 && gold >= 160 && hero.hp < hero.hpMax * 0.5))) {
    // saved up and healthy, or out of draughts and hurt: read the Scroll of Return to go shopping
    const s = p.inv.findIndex(it => it && it.id === 'scroll_of_return');
    if (s >= 0) cmd('use', { slot: s });
  }

  // Drill Yard: the cheapest next level, while the fund covers it with room to spare
  for (let guard = 0; guard < 4; guard++) {
    let best = null;
    for (const id of data.upgrades.order) {
      const c = upgradeCost(data, p, id);
      if (c != null && (!best || c < best.c)) best = { id, c };
    }
    if (!best || best.c + floor > fund || best.c > gold) break;
    cmd('upgradeUnit', { id: best.id });
    gold -= best.c; spent += best.c; fund -= best.c;
    p = Object.assign({}, p, { upg: Object.assign({}, p.upg, { [best.id]: (p.upg[best.id] || 0) + 1 }) });
  }

  // Sanctum (micro >= 1): Frost Field on a swarm at the Keep, Skyfall on a hurt rival hero
  if (K.micro >= 1) {
    const f = map.fields[state.teams[p.team].field];
    let near = 0, sx = 0, sz = 0;
    for (const e of state.ents) if (e.alive && !e._gone && e.field === f.id && e.team !== p.team && e.z > f.leakZ - 30) { near++; sx += e.x; sz += e.z; }
    if (near >= 8 && fund >= data.powers.powers.frost_field.cost && powerRefusal(ctx, { ...p, gold }, 'frost_field', sx / near, sz / near) === null) {
      cmd('power', { id: 'frost_field', x: sx / near, z: sz / near }); gold -= data.powers.powers.frost_field.cost; spent += data.powers.powers.frost_field.cost; fund -= data.powers.powers.frost_field.cost;
    }
    const rival = state.players[p.rival], rh = rival && liveEnt(state, rival.heroEnt);
    if (rh && rh.hp < rh.hpMax * 0.4 && fund >= data.powers.powers.skyfall.cost && powerRefusal(ctx, { ...p, gold }, 'skyfall', rh.x, rh.z) === null) {
      cmd('power', { id: 'skyfall', x: rh.x, z: rh.z }); gold -= data.powers.powers.skyfall.cost; spent += data.powers.powers.skyfall.cost; fund -= data.powers.powers.skyfall.cost;
    }
  }
  return { cmds, spent };
}
