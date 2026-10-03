// Stream E — the Drill Yard (unit upgrades) and the Sanctum (one-shot powers), from anywhere.
//
// Drill Yard
//   'none'     (Recruit)   never
//   'cheapest' (Veteran)   the cheapest next level while the fund covers it with room to spare
//   'planned'  (Commander) the level worth most for the army it actually fields: value = gold of my
//                          units on the field and in the last minute of sends x what the stat does for
//                          that army (tanky sends want health/armour, hard hitters damage/speed, a
//                          leaking army wants Banner Breakers, an army that dies in the field wants
//                          Field Medics / Blood Oath), divided by the price
// Sanctum
//   'none'      (Recruit)  never
//   'basic'     (Veteran)  Frost Field on a swarm at the Keep, Skyfall on a hurt rival hero
//   'full'      (Commander)
//      defensive when banners are about to go: Binding Roots / Frost Field on the cluster nearest the
//                Keep; Stone Ward / Mending Light on my hero when it is losing a fight it must win
//      offensive while the enemy hero is busy or dead: Loose the Pack / War Banner into my army in their
//                field when the defence is down; Withering Hex / Skyfall on a defender buried in my units
//      neutral sensibly: Far Sight only when stealthed units are in my field near my hero; Thunderstorm on
//                a dense clump; Earthshaker on a clump at the Keep; Blessing of Valour when my hero takes a
//                big wave
//   Every point is checked with powerRefusal first, so the command is never refused.

import { upgradeCost } from '../upgrades.js';
import { powerRefusal } from '../powers.js';
import { live, bestCluster } from './read.js';
import { dist2 } from '../mathx.js';

// how much each Drill Yard stat is worth to an army, per role (rough, data-free knowledge)
const STAT_FIT = {
  tank:     { damage: 0.6, attackSpeed: 0.5, health: 1.2, armour: 1.2, lifeSteal: 0.6, moveSpeed: 0.4, regen: 0.8, siege: 0.8 },
  melee:    { damage: 1.0, attackSpeed: 0.9, health: 1.0, armour: 0.9, lifeSteal: 0.9, moveSpeed: 0.5, regen: 0.6, siege: 0.8 },
  ranged:   { damage: 1.1, attackSpeed: 1.1, health: 0.8, armour: 0.7, lifeSteal: 0.6, moveSpeed: 0.4, regen: 0.5, siege: 0.7 },
  caster:   { damage: 1.1, attackSpeed: 1.0, health: 0.8, armour: 0.8, lifeSteal: 0.4, moveSpeed: 0.4, regen: 0.6, siege: 0.7 },
  runner:   { damage: 0.4, attackSpeed: 0.4, health: 1.0, armour: 0.8, lifeSteal: 0.3, moveSpeed: 1.2, regen: 0.4, siege: 1.1 },
  flyer:    { damage: 0.6, attackSpeed: 0.6, health: 1.0, armour: 0.8, lifeSteal: 0.4, moveSpeed: 0.9, regen: 0.5, siege: 1.0 },
  champion: { damage: 0.8, attackSpeed: 0.7, health: 1.1, armour: 1.1, lifeSteal: 0.8, moveSpeed: 0.6, regen: 0.9, siege: 1.2 },
  siege:    { damage: 1.0, attackSpeed: 1.0, health: 0.9, armour: 0.9, lifeSteal: 0.5, moveSpeed: 0.4, regen: 0.6, siege: 0.9 },
};

export function drillYard(ctx, p, K, S, fund, cmd) {
  const { state, data } = ctx;
  const style = K.town.upgrades;
  if (style === 'none') return 0;
  let spent = 0, gold = p.gold;
  let upg = Object.assign({}, p.upg);
  const pp = () => Object.assign({}, p, { upg });
  if (style === 'cheapest') {
    for (let guard = 0; guard < 4; guard++) {
      let best = null;
      for (const id of data.upgrades.order) { const c = upgradeCost(data, pp(), id); if (c != null && (!best || c < best.c)) best = { id, c }; }
      if (!best || best.c + 80 > fund || best.c > gold) break;
      cmd('upgradeUnit', { id: best.id }); gold -= best.c; fund -= best.c; spent += best.c; upg[best.id] = (upg[best.id] || 0) + 1;
    }
    return spent;
  }
  // planned: what is my army made of, and how much more will I send before the end?
  const roles = {};
  let armyGold = 0;
  for (const e of state.ents) if (live(e) && e.kind === 'unit' && e.owner === p.id) { const u = data.derived.units[e.type]; roles[u.role] = (roles[u.role] || 0) + e._cost; armyGold += e._cost; }
  const recent = p.ai.recentRoles || {};
  let recentGold = 0;
  for (const r of Object.keys(recent)) { roles[r] = (roles[r] || 0) + recent[r]; recentGold += recent[r]; }
  const roleTot = armyGold + recentGold;
  if (roleTot < 150) return 0;   // nothing to upgrade yet
  // gold my upgrades will touch: the army on the field + what I keep sending over the horizon
  const future = armyGold + (p.ai.sendRate || 0) * Math.min(S.horizon || 300, 360);
  const leakRate = p.ai.leakRate || 0;   // banners my units tore lately (bookkept in index.js)
  const die = p.ai.deathRate || 0;
  for (let guard = 0; guard < 3; guard++) {
    let best = null;
    for (const id of data.upgrades.order) {
      const def = data.upgrades.upgrades[id];
      const c = upgradeCost(data, pp(), id);
      if (c == null) continue;
      let fit = 0;
      for (const r of Object.keys(roles)) fit += (STAT_FIT[r] || STAT_FIT.melee)[def.stat] * roles[r] / roleTot;
      if (def.stat === 'siege') fit *= 0.6 + Math.min(1.2, leakRate);
      if (def.stat === 'regen' || def.stat === 'lifeSteal') fit *= 0.7 + Math.min(0.8, die);
      // a level is worth its share of the army it improves; it has to beat spending that gold on units
      const v = fit * def.perLevel * future / c;
      if (!best || v > best.v) best = { id, c, v };
    }
    if (!best || best.v < (K.town.upgradeMin ?? 1) || best.c > fund || best.c > gold) break;
    cmd('upgradeUnit', { id: best.id }); gold -= best.c; fund -= best.c; spent += best.c; upg[best.id] = (upg[best.id] || 0) + 1;
  }
  return spent;
}

function tryPower(ctx, p, id, x, z, gold, cmd) {
  const def = ctx.data.powers.powers[id];
  if (!def || def.cost > gold) return 0;
  if (powerRefusal(ctx, { ...p, gold }, id, x, z) !== null) return 0;
  cmd('power', { id, x, z });
  return def.cost;
}

export function sanctum(ctx, p, K, S, fund, cmd) {
  const { state, map } = ctx;
  const style = K.town.powers;
  if (style === 'none') return 0;
  // two purses: a power that saves banners in my own field may spend any gold (a banner is worth more
  // than the units the gold would buy); anything else comes out of the item fund
  let all = p.gold, spare = Math.max(0, Math.min(fund, p.gold));
  let spent = 0;
  // powers are a pinch tool: total power spending stays under a share of what goes into sends
  let cap = (K.town.powerShare ?? 0.12) * (p.stats.sendGold + p.stats.itemGold) + 150 - (p.stats.powerGold || 0);
  if (cap <= 0) return 0;
  const cast = {};   // one cast per power per think (the cooldown starts when the command lands)
  const use = (id, x, z, home = true) => {
    if (cast[id]) return false;
    const c = tryPower(ctx, p, id, x, z, Math.min(cap, home ? all : spare), cmd);
    if (c > 0) { cast[id] = true; all -= c; spare = Math.max(0, Math.min(spare - c, all)); cap -= c; spent += c; }
    return c > 0;
  };
  const f = map.fields[state.teams[p.team].field];
  const foesHere = [];
  for (const e of state.ents) if (live(e) && e.field === f.id && e.team !== p.team && e.kind !== 'hero') foesHere.push(e);
  const near = foesHere.filter(e => e.z > f.leakZ - 30);

  if (style === 'basic') {
    if (near.length >= 8) { const c = bestCluster(near, 7); use('frost_field', c.x, c.z); }
    const rival = state.players[p.rival], rh = rival && state.ents.find(e => e.id === rival.heroEnt);
    if (rh && live(rh) && rh.hp < rh.hpMax * 0.4) use('skyfall', rh.x, rh.z, false);
    return spent;
  }

  // ── full ──
  const hero = S.hero;
  // defensive: banners about to go
  const leakSoon = near.reduce((s, e) => s + (e.kind === 'tide' ? 1 : e._leak), 0);
  if (leakSoon >= Math.max(4, state.teams[p.team].banners * 0.1) && near.length >= 5) {
    const c = bestCluster(near, 5);
    const ccImmune = near.filter(e => e._traits.indexOf('unstoppable') >= 0).length;
    if (!(c.n >= 4 && ccImmune < c.n / 2 && use('binding_roots', c.x, c.z))) { const c7 = bestCluster(near, 7); use('frost_field', c7.x, c7.z); }
    if (c.n >= 6) use('earthshaker', c.x, c.z);
  }
  if (hero && live(hero)) {
    const on = foesHere.filter(e => e.target === hero.id).length;
    const hp = hero.hp / hero.hpMax;
    if (hp < 0.4 && on >= 3 && hero.z > f.leakZ - 45) { if (!use('stone_ward', hero.x, hero.z)) use('mending_light', hero.x, hero.z); }
    // Blessing when my hero takes on a big wave at full strength
    const around = foesHere.filter(e => dist2(e.x, e.z, hero.x, hero.z) <= 100).length;
    if (around >= 8 && hp > 0.6 && S.threat.ehp > 4000) use('blessing_of_valour', hero.x, hero.z, false);
    // Far Sight only when stealthed units are near my hero or the Keep
    const hidden = foesHere.filter(e => e._traits.indexOf('stealth') >= 0 && !e.statuses.some(s => s.id === 'revealed'));
    // ... and they carry enough banners to matter (a single stalker is the hero's job)
    const hiddenLeak = hidden.reduce((s2, e) => s2 + e._leak, 0);
    if (hidden.length >= 3 && hiddenLeak >= 3) { const c = bestCluster(hidden, 12); if (c.n >= 3 && (dist2(c.x, c.z, hero.x, hero.z) <= 400 || c.z > f.leakZ - 35)) use('far_sight', c.x, c.z); }
  }
  // neutral damage on a dense clump in my field
  if (foesHere.length >= 8) { const c = bestCluster(foesHere, 6); if (c.n >= 8) use('thunderstorm', c.x, c.z); }

  // offensive: while the enemy hero is busy or dead, into my army in their field
  const ef = map.fields[state.teams[1 - p.team].field];
  const mine = [];
  for (const e of state.ents) if (live(e) && e.kind === 'unit' && e.owner === p.id && e.field === ef.id) mine.push(e);
  const D = S.enemyDef;
  const down = D.heroes.every(h => !h.alive || h.atShop);
  if (mine.length >= 4) {
    const c = bestCluster(mine, 10);
    if (down && c.n >= 4) { use('war_banner', c.x, c.z, false); if (c.z > ef.z0 + 30) use('loose_the_pack', c.x, Math.max(ef.z0 + 5, c.z - 4), false); }
    for (const h of D.heroes) {
      if (!h.alive) continue;
      const buried = mine.filter(e => dist2(e.x, e.z, h.x, h.z) <= 64).length;
      if (h.busy >= 4 || buried >= 5) {
        if (h.hpPct < 0.55) use('skyfall', h.x, h.z, false);
        else if (buried >= 6) use('withering_hex', h.x, h.z, false);
        if (c.n >= 6 && dist2(c.x, c.z, h.x, h.z) <= 144) use('war_banner', c.x, c.z, false);
      }
    }
  }
  return spent;
}
