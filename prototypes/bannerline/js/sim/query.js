// Read-only helpers for the UI (interfaces.md §7). Pure: (state, data, ...) -> plain values. Safe to
// call every frame; nothing here changes state.

import { TICK_HZ, secToTicks } from './state.js';
import { sendRefusal, rally, payTicks, GROUP_TICKS } from './economy.js';
import { gearStats, armourClassFor, itemDef, buyRefusal, sellRefusal, useRefusal, sellValue, atShop, STAT_IDS } from './items.js';
import { upgradeCost, upgradeRefusal, unitBonus } from './upgrades.js';
import { powerRefusal } from './powers.js';
import { buildingsFor, mapFor } from './buildings.js';
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
  return {
    seconds: t / TICK_HZ,
    payIn: pay - (t % pay), payEvery: pay, payProgress: (t % pay) / pay,
    tideIn: tide - (t % tide), tideLevel: state.tideLevel,
    rising: state.rising, risingIn, risingNext: risingStep(data, t) + 1,
    capIn: Math.max(0, secToTicks(C.hardCap) - t),
  };
}

const DMG_WORD = { blade: 'blade', pierce: 'pierce', fire: 'fire', nature: 'nature' };
const ARMOUR_WORD = { light: 'light', heavy: 'heavy', spectral: 'warded', hide: 'hide', fortified: 'fortified' };

/** Counter words for one unit: which hero armour its damage beats, which hero damage beats it. */
export function counters(data, u) {
  const strongVs = [], weakVs = [], resists = [];
  for (const a of data.damage.armours) if (data.damage.pct[u.dmg][a] > 100) strongVs.push(a);
  for (const d of data.damage.types) {
    const v = data.damage.pct[d][u.armour];
    if (v > 100) weakVs.push(d); else if (v < 100) resists.push(d);
  }
  const lines = [];
  if (strongVs.length) lines.push(`Hits ${strongVs.map(a => ARMOUR_WORD[a]).join('/')} armour hard`);
  if (weakVs.length) lines.push(`Weak to ${weakVs.map(d => DMG_WORD[d]).join('/')}`);
  if (resists.length) lines.push(`Resists ${resists.map(d => DMG_WORD[d]).join('/')}`);
  return { strongVs, weakVs, resists, lines };
}

/** One send for the hiring hall (Barracks). All numbers already include race traits. */
export function sendInfo(state, data, pid, uid) {
  const p = state.players[pid], u = data.derived.units[uid];
  const rival = state.players[p.rival];
  const rivalEnt = rival ? state.ents.find(e => e.id === rival.heroEnt) : null;
  const rivalArmour = rivalEnt ? rivalEnt.armour : null, rivalDmg = rival ? data.heroes.heroes[rival.hero].dmgType : null;
  const pays = u.income > 0 ? u.cost / u.income : null;
  return {
    unit: uid, name: u.name, tier: u.tier, role: u.role, roleText: data.units.roles[u.role] || '', cost: u.cost, income: u.income,
    paybackSeconds: pays == null ? null : Math.round(pays * data.econ.clock.pay),
    bodies: u.bodies, armour: u.armour, dmg: u.dmg, hp: u.hp, dps: u.dps, speed: u.speed, range: u.range, leak: u.leak, bounty: Math.round(u.cost * u.bounty),
    traits: u.traits, traitsText: u.traits.map(t => data.units.traits[t].desc),
    counters: counters(data, u),
    // the green / amber / red pip against the rival hero right now (PLAN §5.2)
    vsRival: rival ? { dealt: rivalArmour ? data.damage.pct[u.dmg][rivalArmour] : 100, taken: rivalDmg ? data.damage.pct[rivalDmg][u.armour] : 100 } : null,
    reason: sendRefusal(state, data, p, uid), get canBuy() { return this.reason === null; },
  };
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
    skillPts: p.skillPts, dps: hs.dps, armor: hs.armor, armourClass: armourClassFor(data, p), dmgType: def.dmgType,
    respawnIn: ent && !ent.alive ? Math.max(0, ent.respawnAt - state.tick) : 0,
    skills,
    form: p.form, passive: def.passive ? { name: def.passive.name, desc: def.passive.desc } : null,
    pets: state.ents.filter(e => e.kind === 'pet' && e.owner === pid && e.alive && !e._gone).map(e => ({ id: e.id, type: e.type, name: data.heroes.pets[e.type].name, hpPct: e.hp / e.hpMax })),
    turrets: state.ents.filter(e => e.kind === 'turret' && e.owner === pid && e.alive && !e._gone).map(e => ({ id: e.id, hpPct: e.hp / e.hpMax, expiresIn: Math.max(0, e._until - state.tick) })),
    talent: { open: p.talent < 0 && p.level >= R.talentLevel, level: R.talentLevel, skill: t.skill, choices: t.choices.map(c => ({ id: c.id, name: c.name, desc: c.desc })), picked: p.talent },
  };
}

export function teamInfo(state, data, teamId) {
  const t = state.teams[teamId];
  return { banners: t.banners, bannersMax: t.bannersMax, shown: Math.max(0, Math.ceil(t.banners)), rally: rally(state, data, teamId), dealt: t.dealt, waiting: state.fields[t.field].waiting.length, bodies: state.fields[t.field].bodies, cap: data.econ.field.cap, toll: { charges: t.toll.charges, readyIn: Math.max(0, t.toll.readyAt - state.tick) } };
}

export function rivalInfo(state, data, pid) {
  const r = state.players[state.players[pid].rival];
  const h = entOf(state, r.heroEnt), def = data.heroes.heroes[r.hero];
  return { player: r.id, name: r.name, hero: r.hero, heroName: def.name, level: r.level, hpPct: h ? h.hp / h.hpMax : 0, alive: !!h && h.alive, dmgType: def.dmgType, armourClass: armourClassFor(data, r), target: h ? h.target : -1 };
}

/** Bodies held at a field's gate because the field is at its body cap ("+N waiting"). */
export function gateQueue(state, fieldId) { return state.fields[fieldId].waiting.length; }

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


export function entName(state, data, ent) {
  if (!ent) return '';
  if (ent.kind === 'hero') return `${state.players[ent.owner].name} (${data.heroes.heroes[ent.type].name})`;
  if (ent.kind === 'tide') return `Tide ${ent.level}`;
  if (ent.kind === 'pet') return data.heroes.pets[ent.type].name;
  return data.units.units[ent.type].name;
}

// ── items, Outfitter, Drill Yard, Sanctum, buildings (stream I) ───────────────────────────────────

const qctx = (state, data) => ({ state, data, map: mapFor(data, state), emit: () => {} });
const PCT = new Set(['attackSpeed', 'critChance', 'critDamage', 'lifeSteal', 'spellPower', 'magicResist', 'moveSpeed', 'cdr', 'bountyPct']);

/** "+20 damage" / "+12% attack speed" / "+2 health regen per second" for a stat total. */
export function statLine(data, stat, value) {
  const d = data['items-bl'].statDefs[stat];
  const v = Math.round(value * 10) / 10;
  if (!d) return `+${v} ${stat}`;
  if (d.unit === 'pct') return `+${v}% ${d.label}`;
  if (d.unit === 'perSec') return `+${v} ${d.label} per second`;
  return `+${v} ${d.label}`;
}

/** A catalogue entry for tooltips / shop cells: { id, name, desc, stats: [lines], price, tier,
 *  category, icon, uniqueEquipped, consumable, charges, sell (full-charge sale price) } */
export function itemCard(data, id) {
  const d = itemDef(data, id);
  if (!d) return null;
  return { id, name: d.name, desc: d.desc, stats: d.statLines.slice(), price: d.price, tier: d.tier, category: d.category, icon: d.icon,
    uniqueEquipped: !!d.uniqueEquipped, consumable: !!d.consumable, charges: d.charges || 0, sell: Math.round(d.price * data['items-bl'].rules.sellFactor) };
}

/** One carried item (slot view) or null. Adds uid, slot, charges left, sell value now, use refusal. */
export function itemView(state, data, pid, slot) {
  const p = state.players[pid], it = p.inv[slot];
  if (!it) return null;
  const c = itemCard(data, it.id);
  const ctx = qctx(state, data);
  return Object.assign(c, { uid: it.uid, slot, chargesLeft: it.charges, sellNow: sellValue(data, it),
    canSell: sellRefusal(ctx, p, slot) === null, sellReason: sellRefusal(ctx, p, slot),
    canUse: c.consumable && useRefusal(ctx, p, slot) === null, useReason: c.consumable ? useRefusal(ctx, p, slot) : 'notUsable' });
}

/** The inventory panel: 6 slots + totals. */
export function inventoryInfo(state, data, pid) {
  const p = state.players[pid], g = gearStats(data, p);
  const totals = {};
  for (const k of STAT_IDS) if (g[k]) totals[k] = Math.round(g[k] * 10) / 10;
  return {
    slots: p.inv.map((_, i) => itemView(state, data, pid, i)), size: p.inv.length, free: p.inv.filter(x => !x).length,
    totals, totalLines: Object.keys(totals).map(k => statLine(data, k, totals[k])),
    armourClass: armourClassFor(data, p), atShop: atShop(qctx(state, data), p),
  };
}

/** The Outfitter: tabs of item cards, each with canBuy / reason ('notAtShop', 'gold', 'full', 'uniqueEquipped', 'dead'). */
export function shopInfo(state, data, pid) {
  const p = state.players[pid], ctx = qctx(state, data);
  const here = atShop(ctx, p);
  return {
    atShop: here, gold: p.gold, columns: data.shop.columns, sellFactor: data['items-bl'].rules.sellFactor,
    tabs: data.shop.tabs.map(t => ({ id: t.id, name: t.name, desc: t.desc, items: t.items.map(id => {
      const c = itemCard(data, id), why = buyRefusal(ctx, p, id);
      return Object.assign(c, { canBuy: why === null, reason: why });
    }) })),
  };
}

/** The Drill Yard: one row per upgrade with level, next cost, refusal and text. */
export function upgradesInfo(state, data, pid) {
  const p = state.players[pid], ctx = qctx(state, data), U = data.upgrades;
  const bonus = unitBonus(data, p);
  return {
    rows: U.order.map(id => {
      const d = U.upgrades[id], lvl = p.upg[id] || 0, cost = upgradeCost(data, p, id), why = upgradeRefusal(ctx, p, id);
      const per = Math.round(d.perLevel * 1000) / 10;
      return { id, name: d.name, desc: d.desc, icon: d.icon, stat: d.stat, level: lvl, max: d.max, cost, canBuy: why === null, reason: why,
        stats: [d.statText.replace('{v}', per), `Level ${lvl} / ${d.max}` + (lvl ? `: ${d.statText.replace('{v}', Math.round(per * lvl * 10) / 10).replace(' per level', '')}` : '')],
        total: Math.round((bonus[d.stat] || 0) * 1000) / 1000 };
    }),
    spent: p.stats.upgradeGold || 0,
  };
}

/** The Sanctum: one row per power. `at(x, z)` refusal is powerRefusal(...) — use powerTargetCheck. */
export function powersInfo(state, data, pid) {
  const p = state.players[pid], P = data.powers;
  return {
    kinds: P.kinds,
    rows: P.order.map(id => {
      const d = P.powers[id], readyIn = Math.max(0, (p.powerCd[id] || 0) - state.tick);
      const reason = state.result ? 'over' : readyIn > 0 ? 'cooldown' : p.gold < d.cost ? 'gold' : null;
      return { id, name: d.name, desc: d.desc, stats: d.statLines.slice(), kind: d.kind, kindName: P.kinds[d.kind].name, icon: d.icon,
        cost: d.cost, cooldown: secToTicks(d.cooldown), readyIn, canBuy: reason === null, reason,
        radius: Math.max(...d.effects.map(e => e.radius || 0)) || null };
    }),
  };
}

/** Would `power {id, x, z}` be accepted right now? null or the refusal ('ownFieldOnly', 'enemyFieldOnly', 'notInField', ...). */
export function powerTargetCheck(state, data, pid, id, x, z) { return powerRefusal(qctx(state, data), state.players[pid], id, x, z); }

/** Every town building (world coordinates), for the view and the minimap. */
export function buildingsInfo(state, data) {
  return buildingsFor(data, mapFor(data, state), state.mode).map(b => Object.assign({}, b, { size: b.size.slice() }));
}
