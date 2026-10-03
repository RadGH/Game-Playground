// Read-only helpers for the UI (interfaces.md §7). Pure: (state, data, ...) -> plain values. Safe to
// call every frame; nothing here changes state.

import { TICK_HZ, secToTicks } from './state.js';
import { stockOf, sendRefusal, rally, musterCost, payTicks } from './economy.js';
import { SLOTS, nextStepFor, cheapestNext, itemScore, gearStats, setBonuses, armourClassFor, slotUsable, maxStep, buyRefusal, kindFor, STAT_IDS } from './items.js';
import { affixTier } from './adapters/affixes.js';
import { heroStats, xpForLevel, maxLevel } from './heroes.js';
import { planFor } from './talents.js';
import { learnRefusal } from './skills.js';
import { risingStep } from './tides.js';

const entOf = (state, id) => state.ents.find(e => e.id === id) || null;

export function clock(state, data) {
  const C = data.econ.clock, t = state.tick;
  const pay = payTicks(data), tide = secToTicks(C.tide);
  const rStart = secToTicks(C.risingTide), rEvery = secToTicks(C.risingEvery);
  let risingIn = t < rStart ? rStart - t : rEvery - ((t - rStart) % rEvery);
  let nextUnlock = null;
  for (const u of data.derived.tiers) if (u.tier > state.unlocked) { nextUnlock = { tier: u.tier, inTicks: Math.max(0, secToTicks(u.unlock) - t) }; break; }
  return {
    seconds: t / TICK_HZ,
    payIn: pay - (t % pay), payEvery: pay, payProgress: (t % pay) / pay,
    tideIn: tide - (t % tide), tideLevel: state.tideLevel,
    rising: state.rising, risingIn, risingNext: risingStep(data, t) + 1,
    capIn: Math.max(0, secToTicks(C.hardCap) - t),
    unlocked: state.unlocked, nextUnlock,
  };
}

export function sendInfo(state, data, pid, uid) {
  const p = state.players[pid], u = data.derived.units[uid], s = stockOf(p, uid);
  const unlockT = secToTicks(u.unlock);
  return {
    unit: uid, name: u.name, tier: u.tier, cost: u.cost, income: u.income, bodies: u.bodies, armour: u.armour, dmg: u.dmg,
    hp: u.hp, dps: u.dps, leak: u.leak, traits: u.traits,
    stock: s ? s.n : 0, max: s ? s.max : 0,
    restockIn: s && s.n < s.max ? Math.ceil(s.every - s.t) : 0, restockEvery: s ? s.every : 0,
    unlocked: u.tier <= state.unlocked, unlockIn: Math.max(0, unlockT - state.tick),
    reason: sendRefusal(state, data, p, uid), get canBuy() { return this.reason === null; },
  };
}

export function deckInfo(state, data, pid) {
  const p = state.players[pid];
  return p.deck.map((uid, i) => Object.assign(sendInfo(state, data, pid, uid), { auto: p.auto[i], index: i }));
}

export function roster(state, data, pid) {
  return data.races.races[state.players[pid].race].units.map(uid => sendInfo(state, data, pid, uid));
}

export function heroInfo(state, data, pid) {
  const p = state.players[pid], ent = entOf(state, p.heroEnt), def = data.heroes.heroes[p.hero];
  const hs = heroStats(data, p);
  const R = data.heroes.ranks;
  const skills = p.skills.map(sk => {
    const plan = planFor(data, p, sk.id);
    const why = learnRefusal(data, p, sk.slot);
    return {
      slot: sk.slot, id: sk.id, name: plan.name, desc: plan.desc, rank: sk.rank, maxRank: R.max,
      readyIn: Math.max(0, sk.readyAt - state.tick), cooldown: secToTicks(plan.cooldown), mp: plan.mp,
      canCast: !!ent && ent.alive && sk.rank > 0 && state.tick >= sk.readyAt && ent.mp >= plan.mp,
      canLearn: why === null, learnReason: why,
    };
  });
  const t = def.talent;
  return {
    ent, name: def.name, level: p.level, xp: p.xp,
    xpPrev: xpForLevel(data, p.level), xpNext: p.level >= maxLevel(data) ? null : xpForLevel(data, p.level + 1),
    skillPts: p.skillPts, dps: hs.dps, armor: hs.armor, armourClass: armourClassFor(data, p), dmgType: def.dmgType, oil: p.oil,
    respawnIn: ent && !ent.alive ? Math.max(0, ent.respawnAt - state.tick) : 0,
    belt: p.belt, skills,
    talent: { open: p.talent < 0 && p.level >= R.talentLevel, level: R.talentLevel, skill: t.skill, choices: t.choices.map(c => ({ id: c.id, name: c.name, desc: c.desc })), picked: p.talent },
  };
}

export function teamInfo(state, data, teamId) {
  const t = state.teams[teamId];
  return { banners: t.banners, bannersMax: t.bannersMax, shown: Math.max(0, Math.ceil(t.banners)), rally: rally(state, data, teamId), dealt: t.dealt };
}

export function rivalInfo(state, data, pid) {
  const r = state.players[state.players[pid].rival];
  const h = entOf(state, r.heroEnt), def = data.heroes.heroes[r.hero];
  return { player: r.id, name: r.name, hero: r.hero, heroName: def.name, level: r.level, hpPct: h ? h.hp / h.hpMax : 0, alive: !!h && h.alive, dmgType: def.dmgType, oil: r.oil, armourClass: armourClassFor(data, r), target: h ? h.target : -1, deck: deckInfo(state, data, r.id) };
}

export function gatePreview(state, data, fieldId) {
  const out = [];
  const team = state.fields[fieldId].team;
  for (const p of state.players) {
    if (p.team === team || !p.queued.length) continue;
    const counts = [];
    for (const uid of p.queued) { const c = counts.find(x => x.unit === uid); if (c) c.count++; else counts.push({ player: p.id, unit: uid, count: 1 }); }
    out.push(...counts);
  }
  return out;
}

export function musterInfo(state, data, pid) {
  const p = state.players[pid], cost = musterCost(data, p);
  return { rank: p.muster, max: data.econ.muster.ranks.length, next: cost == null ? null : { cost, canBuy: p.gold >= cost, reason: p.gold >= cost ? null : 'gold' } };
}

export function entName(state, data, ent) {
  if (!ent) return '';
  if (ent.kind === 'hero') return `${state.players[ent.owner].name} (${data.heroes.heroes[ent.type].name})`;
  if (ent.kind === 'tide') return `Tide ${ent.level}`;
  return data.units.units[ent.type].name;
}

export const GEAR_SLOTS = ['Weapon', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Neck', 'Ring'];
export const GEAR_STEPS = ['Plain', 'Fine', 'Superior', 'Masterwork', 'Exquisite', 'Rare roll', 'Legendary roll'];
export { SLOTS };

/** Armory summary per slot (index order = SLOTS). Kept from M1: `upgrade {slot}` buys row.next. */
export function gearInfo(state, data, pid) {
  const p = state.players[pid];
  const slots = SLOTS.map((key, slot) => {
    const it = p.equip[key];
    const n = nextStepFor(state, data, p, key);
    return { slot, key, name: GEAR_SLOTS[slot], usable: slotUsable(data, p, key), step: it ? it.step : -1, stepName: it ? GEAR_STEPS[it.step] : null, item: it ? itemView(state, data, pid, it) : null,
      next: n ? { step: n.step, stepName: GEAR_STEPS[n.step], cost: n.cost, unlocked: n.unlocked, unlockIn: Math.max(0, n.unlockTick - state.tick), canBuy: n.unlocked && p.gold >= n.cost } : null };
  });
  const c = cheapestNext(state, data, p);
  return { slots, cheapest: c ? { slot: SLOTS.indexOf(c.slot), key: c.slot, cost: c.cost, canBuy: p.gold >= c.cost } : null, spent: p.stats.itemGold };
}

const pctStats = new Set(['dmgPct', 'attackSpeed', 'critChance', 'critDamage', 'lifeSteal', 'areaPct', 'vsChampion', 'cdr', 'moveSpeed', 'bountyPct', 'resistAll']);

/** One affix as a line of text ("+4.5% critical chance"). */
export function affixLine(data, a) {
  const def = data['items-bl'].affixes.find(d => d.id === a.id);
  const v = Math.round(a.value * 10) / 10;
  return `+${v}${pctStats.has(a.stat) ? '%' : ''} ${def ? def.label : a.stat}`;
}

/** Everything a card / tooltip needs about one item, plus how it compares to what is worn. */
export function itemView(state, data, pid, it) {
  if (!it) return null;
  const p = state.players[pid];
  const T = data.econ.items.tiers, ib = data['items-bl'];
  let dps = 0, hp = 0, armor = 0;
  for (let i = 0; i <= it.step; i++) { dps += T[i].dps; hp += T[i].hp; armor += T[i].armor; }
  const lines = [`+${Math.round(dps * 100)}% weapon power`, `+${hp} health`, `+${armor} armour`];
  for (const a of it.affixes) lines.push(affixLine(data, a));
  let power = null, set = null;
  if (it.unique) power = ib.uniques[it.unique].powerText;
  if (it.set) set = { name: ib.set.name, pieces: gearStats(data, p).setPieces, bonuses: ib.set.bonuses.map(b => ({ pieces: b.pieces, text: b.text })) };
  const worn = p.equip[it.slot];
  const score = itemScore(data, it);
  return {
    uid: it.uid, name: it.name, slot: it.slot, slotName: GEAR_SLOTS[SLOTS.indexOf(it.slot)], rarity: it.rarity, step: it.step, stepName: GEAR_STEPS[it.step],
    ilvl: it.ilvl, tier: affixTier(it.ilvl).name, kind: it.kind, armourClass: it.slot === 'chest' ? data.damage.chestArmour[it.kind] || null : null,
    twoHanded: it.twoHanded, lines, power, set, lore: it.unique ? ib.uniques[it.unique].lore : null,
    score, better: worn && worn.uid === it.uid ? 0 : Math.round((score - itemScore(data, worn)) * 10) / 10, worn: !!worn && worn.uid === it.uid,
    sell: Math.round(it.price * ib.shop.sellFactor), forHero: it.unique ? ib.uniques[it.unique].hero : null,
  };
}

/** The character panel: worn items, bag, totals, champion picks waiting, requisitions in flight. */
export function inventoryInfo(state, data, pid) {
  const p = state.players[pid];
  const g = gearStats(data, p);
  const equip = {};
  for (const s of SLOTS) equip[s] = itemView(state, data, pid, p.equip[s]);
  const totals = {};
  for (const k of STAT_IDS) if (g[k]) totals[k] = Math.round(g[k] * 10) / 10;
  return {
    equip, bag: p.bag.map(it => itemView(state, data, pid, it)), belt: p.belt, beltMax: data.econ.items.potion.belt,
    armourClass: armourClassFor(data, p), oil: p.oil, totals, totalLines: Object.keys(totals).map(k => affixLine(data, { id: (data['items-bl'].affixes.find(a => a.stat === k) || {}).id, stat: k, value: totals[k] })),
    set: { pieces: g.setPieces, active: setBonuses(data, p).map(b => b.text) },
    picks: p.picks.map(cards => cards.map(c => itemView(state, data, pid, c))),
    requisitions: p.requisitions.map(r => ({ uid: r.item.uid, name: r.item.name, inTicks: Math.max(0, r.atTick - state.tick) })),
  };
}

/** The shop: per slot the next step (with chest kinds), Buy recommended, Armory / Requisition. */
export function shopInfo(state, data, pid) {
  const p = state.players[pid], ib = data['items-bl'], T = data.econ.items.tiers;
  const top = maxStep(state, data);
  const slots = SLOTS.filter(s => slotUsable(data, p, s)).map(s => {
    const n = nextStepFor(state, data, p, s);
    const kinds = s === 'chest' ? ['cloth', 'light', 'medium', 'heavy'].map(k => ({ kind: k, armourClass: data.damage.chestArmour[k], name: ib.bases.chest[k].name })) : null;
    return { slot: s, slotName: GEAR_SLOTS[SLOTS.indexOf(s)], kind: kindFor(data, p, s), kinds,
      next: n ? { step: n.step, stepName: GEAR_STEPS[n.step], cost: n.cost, unlocked: n.unlocked, unlockIn: Math.max(0, n.unlockTick - state.tick), reason: buyRefusal({ state, data }, p, s, n.step) } : null };
  });
  const c = cheapestNext(state, data, p);
  return {
    atArmory: p.atArmory,
    requisitionSeconds: ib.shop.requisition, topStep: top, topStepName: top >= 0 ? GEAR_STEPS[top] : null,
    recommended: c ? { slot: c.slot, cost: c.cost, canBuy: p.gold >= c.cost } : null, slots,
    potion: { cost: data.econ.items.potion.cost, belt: p.belt, max: data.econ.items.potion.belt },
    oil: { cost: data.econ.items.oil.cost, current: p.oil, types: data.damage.types },
  };
}
