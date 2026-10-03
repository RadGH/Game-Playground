// Read-only helpers for the UI (interfaces.md §7). Pure: (state, data, ...) -> plain values. Safe to
// call every frame; nothing here changes state.

import { TICK_HZ, secToTicks } from './state.js';
import { stockOf, sendRefusal, rally, musterCost, payTicks, gearNext, cheapestGear } from './economy.js';
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
    skillPts: p.skillPts, dps: hs.dps, armor: hs.armor, armourClass: def.armourClass, dmgType: def.dmgType,
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
  return { player: r.id, name: r.name, hero: r.hero, heroName: def.name, level: r.level, hpPct: h ? h.hp / h.hpMax : 0, alive: !!h && h.alive, dmgType: def.dmgType, armourClass: def.armourClass, target: h ? h.target : -1, deck: deckInfo(state, data, r.id) };
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

export function gearInfo(state, data, pid) {
  const p = state.players[pid];
  const slots = p.gear.map((step, slot) => {
    const n = gearNext(state, data, p, slot);
    return { slot, name: GEAR_SLOTS[slot], step, stepName: step >= 0 ? GEAR_STEPS[step] : null,
      next: n ? { step: n.step, stepName: GEAR_STEPS[n.step], cost: n.cost, unlocked: n.unlocked, unlockIn: Math.max(0, n.unlockTick - state.tick), canBuy: n.unlocked && p.gold >= n.cost } : null };
  });
  const c = cheapestGear(state, data, p);
  return { slots, cheapest: c ? { slot: c.slot, cost: c.cost, canBuy: p.gold >= c.cost } : null, spent: p.stats.itemGold };
}
