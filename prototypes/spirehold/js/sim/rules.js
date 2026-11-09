// Spirehold — the formulas. Every curve in the game is here so balance lives in one file.
// Pure: reads the save (G), never writes it.

import { TOWERS, LANDMARKS, RESEARCH, RELICS, LEGACY, REALMS, RING_AT, ringSlots, ringRadius, CLASSES, RACES, TRAITS, SCHOOLS, SPELLS } from './data.js';

export const TUNE = {
  // enemies
  hpBase: 1.12, hpLin: 0.03,            // enemy hp × hpBase^(n-1) × (1 + hpLin·(n-1))
  wallDmgBase: 1.05,                     // enemy wall damage × wallDmgBase^(n-1)
  goldBase: 1.055, goldLin: 0.03, loreBase: 1.035,        // kill gold grows a little slower than hp
  crowd: 2,                              // waves bring this many times more foes, each this much weaker (a bigger siege, same total)
  // towers
  towerDmgGrow: 1.045, towerCostGrow: 1.15,
  milestone: [25, 50, 75, 100, 150, 200, 250, 300, 400, 500], // every milestone doubles a tower's damage
  // walls
  wallHpBase: 260, wallHpGrow: 1.13, wallCostBase: 30, wallCostGrow: 1.19, wallRegen: 0.006,
  // city
  popBase: 40, popPow: 1.55, taxPerHead: 0.03, cityXpBase: 40, cityXpGrow: 1.34,
  // spells and mages
  spellBase: 9, spellGrowCity: 1.085, manaMax: 100, manaRegen: 2.2,
  mageBase: 6, mageDmgGrow: 1.06, mageHire: 250, mageHireGrow: 5, mageLvlCost: 60, mageLvlGrow: 1.16,
  // adventurers
  advPowerBase: 10, advPowerPerLvl: 5, rankDiff: 1.6, rankBase: 24,
  // idle
  offlineEff: 0.5, offlineCapHours: 12,
};

// ---------------------------------------------------------------- bonuses from every source, added up
/** Sum of every bonus stat (research + relics + landmarks + legacy + realm). Cached per call site by G._bonusKey. */
export function bonuses(G) {
  const key = G._rev | 0;
  if (G._bon && G._bonKey === key) return G._bon;
  const b = {};
  const add = (fx, n) => { if (!fx || !n) return; for (const k in fx) b[k] = (b[k] || 0) + fx[k] * n; };
  for (const r of RESEARCH) add(r.fx, G.research[r.id] || 0);
  for (const id in G.relics) add(RELICS[id]?.fx, G.relics[id]);
  // Legacy multiplies: each rank of a ×1.25 perk is another ×1.25 (kept apart as L_<stat>, read through lm()).
  for (const l of LEGACY) { const n = G.legacy[l.id] || 0; if (!n) continue; for (const k in l.fx) { if (l.mul) b['L_' + k] = (b['L_' + k] || 1) * Math.pow(1 + l.fx[k], n); else b[k] = (b[k] || 0) + l.fx[k] * n; } }
  add(REALMS[G.realm]?.bonus, 1);
  for (const id in LANDMARKS) { const L = LANDMARKS[id]; const lv = G.city.landmarks[id] || 0; if (lv) b[L.stat] = (b[L.stat] || 0) + L.per * lv; }
  // Adventurers with the Stalwart trait or the training research fight harder from the walls.
  Object.defineProperty(G, '_bon', { value: b, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(G, '_bonKey', { value: key, writable: true, configurable: true, enumerable: false });
  return b;
}
/** Call after anything that changes bonuses (research, relic, landmark, legacy, realm). */
export const touch = G => { Object.defineProperty(G, '_rev', { value: (G._rev | 0) + 1, writable: true, configurable: true, enumerable: false }); };
export const bon = (G, k) => bonuses(G)[k] || 0;
/** A Legacy multiplier (1 when you have none). */
export const lm = (G, k) => bonuses(G)['L_' + k] || 1;

// ---------------------------------------------------------------- waves
export const hpMul = n => Math.pow(TUNE.hpBase, n - 1) * (1 + TUNE.hpLin * (n - 1));
export const wallDmgMul = n => Math.pow(TUNE.wallDmgBase, n - 1);
export const loreMul = n => Math.pow(TUNE.loreBase, n - 1);
export const goldMul = n => Math.pow(TUNE.goldBase, n - 1) * (1 + TUNE.goldLin * (n - 1));
export const isSiege = n => n % 10 === 0;
export const isGreatSiege = n => n % 25 === 0;

// ---------------------------------------------------------------- city
export const ringOf = cityLvl => { let r = 0; for (let i = 0; i < RING_AT.length; i++) if (cityLvl >= RING_AT[i]) r = i; return r; };
export const slotsOf = G => ringSlots(ringOf(G.city.level));
export const wallRadius = G => ringRadius(ringOf(G.city.level));
export const cityXpNeed = lvl => Math.round(TUNE.cityXpBase * Math.pow(TUNE.cityXpGrow, lvl - 1) * (1 + 0.15 * (lvl - 1)));
export const popCap = G => Math.round(TUNE.popBase * Math.pow(G.city.level, TUNE.popPow) * (1 + bon(G, 'pop')));
export const goldBonus = G => (1 + bon(G, 'gold')) * lm(G, 'gold');
/** Taxes per second. */
export const taxRate = G => G.city.pop * TUNE.taxPerHead * Math.pow(1.045, G.city.level - 1) * goldBonus(G);
export const landmarkCost = (id, lv) => Math.round(LANDMARKS[id].cost * Math.pow(LANDMARKS[id].grow, lv));

// ---------------------------------------------------------------- walls
export const wallMax = G => TUNE.wallHpBase * Math.pow(TUNE.wallHpGrow, G.wall.lvl - 1) * (1 + 0.12 * ringOf(G.city.level)) * (1 + bon(G, 'wall')) * lm(G, 'wall');
export const wallCost = lvl => Math.round(TUNE.wallCostBase * Math.pow(TUNE.wallCostGrow, lvl - 1));
export const wallRegen = G => wallMax(G) * TUNE.wallRegen * (1 + bon(G, 'wallRegen'));

// ---------------------------------------------------------------- towers
export const towerCost = (type, lvl, G) => Math.round(TOWERS[type].cost * Math.pow(TUNE.towerCostGrow, lvl - 1) * (1 - Math.min(0.45, bon(G, 'cheap'))));
/** Gold for `count` levels starting at `lvl` (the level you have; buys lvl+1 … lvl+count). */
export function towerCostN(type, lvl, count, G) { let s = 0; for (let i = 0; i < count; i++) s += towerCost(type, lvl + 1 + i, G); return s; }
export const milestones = lvl => TUNE.milestone.filter(m => lvl >= m).length;
export function towerUnlocked(G, type) {
  const u = TOWERS[type].unlock; return !u || G.city.level >= (u.city || 0);
}
/** A tower's live numbers after level, branches and every bonus. */
export function towerStats(G, t) {
  const T = TOWERS[t.type]; const fx = branchFx(t);
  const lvlMul = t.lvl * Math.pow(TUNE.towerDmgGrow, t.lvl - 1) * Math.pow(2, milestones(t.lvl));
  const dmgMul = (1 + bon(G, 'tower') + bon(G, 't_' + t.type) + bon(G, 'd_' + T.dmgType) + (T.kind === 'meteor' ? bon(G, 'meteor') : 0)) * (fx.dmgMul || 1);
  return {
    dmg: T.dmg * lvlMul * dmgMul * lm(G, 'tower'),
    rate: T.rate * (fx.rateMul || 1) * (1 + Math.min(1, t.lvl * 0.004)),
    range: T.range * (fx.range || 1) * (1 + bon(G, 'range')),
    splash: (T.splash || 0) * (fx.splash || 1) || (fx.splash ? 30 * fx.splash : 0),
    chains: Math.max(0, (T.chains || 0) + (fx.chains || 0)),
    crit: (fx.crit || 0) + bon(G, 'crit'), critMul: fx.critMul || 2,
    multishot: fx.multishot || 1, pierce: (T.kind === 'bolt' ? 4 : 0) * (fx.pierce || 1),
    fx, T,
  };
}
export function branchFx(t) {
  const out = {}; const T = TOWERS[t.type];
  (t.br || []).forEach((b, i) => { if (b == null) return; const B = T.branches[i]?.[b]; if (!B) return; for (const k in B.fx) out[k] = (k === 'chains' ? (out[k] || 0) + B.fx[k] : B.fx[k]); });
  return out;
}
/** The branch choice waiting on this tower, if any: 0 at level 10, 1 at level 30. */
export function branchDue(t) { if (t.lvl >= 10 && t.br[0] == null) return 0; if (t.lvl >= 30 && t.br[1] == null) return 1; return -1; }

// ---------------------------------------------------------------- spells and mana
export const spellPower = G => TUNE.spellBase * Math.pow(TUNE.spellGrowCity, G.city.level - 1) * (1 + bon(G, 'spell')) * lm(G, 'spell');
export const manaMax = G => TUNE.manaMax * (1 + bon(G, 'manaMax'));
export const manaRegen = G => TUNE.manaRegen * (1 + bon(G, 'mana') + bon(G, 'spell') * 0.3);
export const spellKnown = (G, id) => !SPELLS[id].unlock || (G.research[SPELLS[id].unlock] || 0) > 0;
export const autoPower = G => Math.min(1, 0.7 + bon(G, 'autopow'));

// ---------------------------------------------------------------- mages
export const mageSlots = G => (G.city.landmarks.academy ? 1 : 0) + (G.city.landmarks.academy ? bon(G, 'mageSlots') : 0);
export const mageHireCost = n => Math.round(TUNE.mageHire * Math.pow(TUNE.mageHireGrow, n));
export const mageLvlCost = lvl => Math.round(TUNE.mageLvlCost * Math.pow(TUNE.mageLvlGrow, lvl - 1));
export const mageDmg = (G, m) => TUNE.mageBase * m.lvl * Math.pow(TUNE.mageDmgGrow, m.lvl - 1) * Math.pow(2, milestones(m.lvl)) * SCHOOLS[m.school].power * (1 + bon(G, 'mage') + bon(G, 'd_' + SCHOOLS[m.school].dmgType) + (m.school === 'astromancer' ? bon(G, 'meteor') : 0)) * lm(G, 'mage');

// ---------------------------------------------------------------- research
export const researchCost = (r, rank) => Math.round(r.cost * Math.pow(r.grow, rank));
export const researchOpen = (G, r) => !r.req || r.req.every(id => (G.research[id] || 0) > 0);
export const legacyCost = (l, rank) => Math.round(l.cost * Math.pow(l.grow, rank));

// ---------------------------------------------------------------- adventurers and quests
export const advXpNeed = lvl => Math.round(100 * Math.pow(1.32, lvl - 1));
export function advPower(a) {
  const C = CLASSES[a.cls]; const tr = TRAITS[a.trait] || {};
  return (TUNE.advPowerBase + TUNE.advPowerPerLvl * (a.lvl - 1)) * Math.pow(1.04, a.lvl - 1) * C.power * (1 + (tr.power || 0));
}
export const rankDifficulty = rank => TUNE.rankBase * Math.pow(TUNE.rankDiff, rank);
/** Odds a party wins this quest, 0.03–0.97, plus the reasons in plain words. */
export function questOdds(G, quest, party) {
  const why = [];
  if (!party.length) return { odds: 0, why: ['Nobody is going.'] };
  let power = party.reduce((s, a) => s + advPower(a), 0);
  const roles = new Set(party.map(a => CLASSES[a.cls].role));
  const tags = new Set(); for (const a of party) { for (const t of CLASSES[a.cls].tags) tags.add(t); }
  const raceBonus = party.reduce((s, a) => { const rb = RACES[a.race]?.bonus || {}; return s + quest.needs.reduce((x, t) => x + (rb[t] || 0), 0) + (rb.tough || 0) * 0.5; }, 0);
  power *= 1 + raceBonus;
  for (const need of quest.needs) {
    if (tags.has(need)) { power *= 1.25; why.push(`+ someone good with ${TAG_WORDS[need]}`); }
    else { power *= 0.7; why.push(`− nobody good with ${TAG_WORDS[need]}`); }
  }
  if (quest.rank >= 2) {
    if (!roles.has('heal')) { power *= 0.75; why.push('− no healer'); }
    if (!roles.has('tank')) { power *= 0.8; why.push('− nobody to hold the front'); }
  }
  if (party.length < 3 && quest.rank >= 1) { power *= 0.85; why.push('− a small party'); }
  const brave = party.filter(a => a.trait === 'brave').length;
  const ratio = power / rankDifficulty(quest.rank);
  let odds = 1 / (1 + Math.exp(-(ratio - 1) * 3.2));
  odds += bon(G, 'odds') + brave * TRAITS.brave.odds * (quest.rank >= 4 ? 1 : 0.3) + (quest.lengthOdds || 0);
  odds = Math.max(0.03, Math.min(0.97, odds));
  return { odds, power, need: rankDifficulty(quest.rank), ratio, why };
}
export const TAG_WORDS = { undead: 'the dead', beasts: 'beasts', wilds: 'the wilds', wards: 'magic wards', lore: 'old lore', traps: 'traps', locks: 'locks', talk: 'talking' };
export const oddsWord = o => o >= 0.85 ? 'Very likely' : o >= 0.65 ? 'Good odds' : o >= 0.45 ? 'A coin toss' : o >= 0.25 ? 'Risky' : 'Deadly';
export function questReward(G, q, len) {
  const m = len.mult * (1 + bon(G, 'quest'));
  // gold keeps pace with what the city earns, so a quest is never worthless late on
  const econ = Math.max(taxRate(G), 1) * len.secs * 0.35;
  return {
    gold: Math.round((40 * Math.pow(2.05, q.rank) * m + econ * (0.5 + q.rank * 0.15))),
    lore: Math.round(6 * Math.pow(1.9, q.rank) * m),
    shards: q.rank >= 1 ? Math.max(1, Math.round((q.rank) * Math.sqrt(len.mult) * 0.8)) : 0,
    relic: Math.min(0.85, (0.05 + q.rank * 0.035) * Math.sqrt(len.mult)),
    xp: Math.round(40 * Math.pow(1.5, q.rank) * Math.sqrt(len.mult) * 2),
  };
}

// ---------------------------------------------------------------- prestige
/** Crowns for founding a new realm now. */
export const PRESTIGE_WAVE = 100;
export const crownsFor = G => G.wave.best < PRESTIGE_WAVE ? 0 : Math.floor(Math.pow((G.wave.best - 80) / 10, 1.6) + G.city.level / 10);
