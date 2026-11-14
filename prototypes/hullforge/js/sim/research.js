// The research lab: spend credits + ore on nodes that give PERMANENT bonuses. Pure data + pure functions, no DOM.
//
// Where each bonus is read (one place each — lessons rule 33):
//   thrust, turn, shield, regen, power, cargo, turretTurn → sim/stats.js computeStats (via grid.bonus, set by
//                                                          state.js designGrid / liveGrid from researchBonus(G))
//   turretTurn                                           → sim/body.js refresh (multiplies each turret's turn rate)
//   repair                                               → sim/state.js repairCost (repairs AND the death rebuild bill)
//   shopTier                                             → sim/state.js shopStock (Outfitter stock one Mk higher)
//   mining                                               → ui/economy-ext.js (extra ore on each ore pickup)
//   trade                                                → sim/economy.js prices (better buy and sell prices)
//   craftLuck                                            → sim/craft.js craftOdds (better rarity odds)
//   unlock 'blocks2x2'                                   → researchUnlocked(G, 'blocks2x2') for the Shipyard's big blocks
//
// G.research = { done: [node ids] }.

import { ORES } from '../data/blocks.js';
import { fmt } from '../../../../shared/format.js';

/** Branches are the rows of the tree screen, tiers its columns. */
export const BRANCHES = [
  { id: 'drive', name: 'Drive', color: '#69c8ff' },
  { id: 'defence', name: 'Defence', color: '#7ad8ff' },
  { id: 'industry', name: 'Industry', color: '#ffc45a' },
  { id: 'yard', name: 'Shipyard', color: '#62f0a8' },
  { id: 'trade', name: 'Trade', color: '#b48cff' },
];

/** What each Mk of research costs: credits plus ore from your hold. */
export const TIER_COST = [
  { cr: 500, ore: { iron: 12 } },
  { cr: 1400, ore: { iron: 10, copper: 12 } },
  { cr: 3600, ore: { copper: 10, cobalt: 12 } },
  { cr: 8000, ore: { cobalt: 10, iridium: 10 } },
];

/**
 * Every node. `bonus` keys: thrust/turn/shield/regen/power/cargo/turretTurn/mining are added shares (0.08 = +8%),
 * repair is a share taken off (0.15 = 15% cheaper), trade a share better on both sides, craftLuck a rarity shift,
 * shopTier whole Mk steps. `need` = nodes that must be done first.
 */
export const NODES = [
  { id: 'thrust1', branch: 'drive', tier: 1, name: 'Cleaner burn', bonus: { thrust: 0.08 } },
  { id: 'turn1', branch: 'drive', tier: 2, need: ['thrust1'], name: 'Vector vanes', bonus: { turn: 0.15 } },
  { id: 'thrust2', branch: 'drive', tier: 3, need: ['turn1'], name: 'Hot nozzles', bonus: { thrust: 0.12 } },
  { id: 'drive4', branch: 'drive', tier: 4, need: ['thrust2'], name: 'Inertia damping', bonus: { thrust: 0.1, turn: 0.1 } },

  { id: 'shield1', branch: 'defence', tier: 1, name: 'Tuned emitters', bonus: { shield: 0.1 } },
  { id: 'regen1', branch: 'defence', tier: 2, need: ['shield1'], name: 'Fast refill', bonus: { regen: 0.3 } },
  { id: 'turret1', branch: 'defence', tier: 3, need: ['regen1'], name: 'Greased yaw rings', bonus: { turretTurn: 0.25 } },
  { id: 'shield2', branch: 'defence', tier: 4, need: ['turret1'], name: 'Layered bubble', bonus: { shield: 0.15, regen: 0.2 } },

  { id: 'cargo1', branch: 'industry', tier: 1, name: 'Packed holds', bonus: { cargo: 0.15 } },
  { id: 'mine1', branch: 'industry', tier: 2, need: ['cargo1'], name: 'Finer cutting', bonus: { mining: 0.2 } },
  { id: 'power1', branch: 'industry', tier: 3, need: ['mine1'], name: 'Hot reactors', bonus: { power: 0.12 } },
  { id: 'cargo2', branch: 'industry', tier: 4, need: ['power1'], name: 'Folded holds', bonus: { cargo: 0.25 } },

  { id: 'repair1', branch: 'yard', tier: 1, name: 'Patch crews', bonus: { repair: 0.15 } },
  { id: 'craft1', branch: 'yard', tier: 2, need: ['repair1'], name: 'Steady hands', bonus: { craftLuck: 0.3 } },
  { id: 'shop1', branch: 'yard', tier: 3, need: ['craft1'], name: 'Supplier contacts', bonus: { shopTier: 1 } },
  { id: 'big1', branch: 'yard', tier: 4, need: ['shop1'], name: 'Heavy frames', unlock: 'blocks2x2' },

  { id: 'trade1', branch: 'trade', tier: 2, need: ['cargo1'], name: 'Market models', bonus: { trade: 0.03 } },
  { id: 'trade2', branch: 'trade', tier: 3, need: ['trade1'], name: 'Broker licence', bonus: { trade: 0.03 } },
  { id: 'repair2', branch: 'trade', tier: 4, need: ['trade2'], name: 'Salvage contracts', bonus: { repair: 0.2 } },
];
export const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));

/** The words for each bonus key (screen text). Every number is shown with its unit. */
export const BONUS_WORDS = {
  thrust: ['thrust', '%'], turn: ['turning', '%'], shield: ['shield strength', '%'], regen: ['shield refill speed', '%'],
  turretTurn: ['turret turn speed', '%'], power: ['reactor power', '%'], cargo: ['cargo room', '%'], mining: ['ore from mining', '%'],
  repair: ['repair and rebuild bills', '% cheaper'], trade: ['trade prices', '% better'], craftLuck: ['craft rarity luck', ''], shopTier: ['Outfitter stock', ' Mk higher'],
};
export const UNLOCK_WORDS = { blocks2x2: 'Unlocks 2×2 structure blocks in the Shipyard' };

/** Research points (made by outpost R&D labs) pay part of a node's credit cost: each point pays RP_VALUE credits. */
export const RP_VALUE = 25;
/** A node's cost; with G, the research points you hold are spent first ({ cr, ore, rp: points used, crFull }). */
export function nodeCost(n, G = null) {
  const base = TIER_COST[n.tier - 1];
  const rp = G ? Math.min(Math.floor(G.researchPoints || 0), Math.ceil(base.cr / RP_VALUE)) : 0;
  return { ...base, cr: Math.max(0, base.cr - rp * RP_VALUE), rp, crFull: base.cr };
}
const doneList = G => G?.research?.done || [];
export const isDone = (G, id) => doneList(G).includes(id);
export const researchUnlocked = (G, unlock) => doneList(G).some(id => NODE_BY_ID[id]?.unlock === unlock);

/** Ore you are short of for a cost: [[ore id, short by]]. Credits come back as ['cr', n]. */
export function shortOf(G, cost) {
  const out = [];
  for (const [o, n] of Object.entries(cost.ore || {})) { const have = G.cargo?.[o] || 0; if (have < n) out.push([o, n - have]); }
  if ((G.credits || 0) < cost.cr) out.push(['cr', cost.cr - G.credits]);
  return out;
}

/** Why a node can't be researched now ('' when it can). */
export function nodeBlock(G, n) {
  if (isDone(G, n.id)) return 'Done';
  const miss = (n.need || []).filter(id => !isDone(G, id));
  if (miss.length) return `Needs ${miss.map(id => NODE_BY_ID[id].name).join(' and ')} first`;
  const short = shortOf(G, nodeCost(n, G));
  if (short.length) return 'Short of ' + short.map(([k, v]) => (k === 'cr' ? `${fmt(Math.ceil(v), { decimals: 0 })} cr` : `${fmt(v, { decimals: 0 })} ${ORES[k].name}`)).join(', ');
  return '';
}

/** Research a node: pays its cost. Returns true when done. */
export function doResearch(G, id) {
  const n = NODE_BY_ID[id]; if (!n || nodeBlock(G, n)) return false;
  const c = nodeCost(n, G);
  G.credits -= c.cr; G.researchPoints = Math.max(0, (G.researchPoints || 0) - c.rp);
  for (const [o, k] of Object.entries(c.ore)) { G.cargo[o] -= k; if (G.cargo[o] <= 0) delete G.cargo[o]; }
  (G.research ||= { done: [] }).done.push(id);
  G.stats.researched = (G.stats.researched || 0) + 1;
  return true;
}

/** Every finished bonus added up. Multipliers are 1 + share; repair is 1 − share; trade/craftLuck/shopTier are sums. */
export function researchBonus(G) {
  const b = { thrust: 1, turn: 1, shield: 1, regen: 1, power: 1, cargo: 1, turretTurn: 1, mining: 1, repair: 1, trade: 0, craftLuck: 0, shopTier: 0 };
  for (const id of doneList(G)) {
    const n = NODE_BY_ID[id]; if (!n?.bonus) continue;
    for (const [k, v] of Object.entries(n.bonus)) {
      if (k === 'repair') b.repair *= 1 - v;
      else if (k === 'trade' || k === 'craftLuck' || k === 'shopTier') b[k] += v;
      else b[k] += v;
    }
  }
  return b;
}

/** One line per bonus of a node, e.g. ["+8% thrust"]. `fmtN` formats a number (shared/format.js fmt). */
export function nodeLines(n, fmtN = String) {
  const out = [];
  for (const [k, v] of Object.entries(n.bonus || {})) {
    const [word, unit] = BONUS_WORDS[k];
    if (k === 'shopTier') out.push(`${word}: ${fmtN(v)}${unit}`);
    else if (k === 'craftLuck') out.push(`+${fmtN(v)} ${word} (better rarity odds in the Workshop)`);
    else if (k === 'repair' || k === 'trade') out.push(`${word}: ${fmtN(v * 100)}${unit}`);
    else out.push(`+${fmtN(v * 100)}${unit} ${word}`);
  }
  if (n.unlock) out.push(UNLOCK_WORDS[n.unlock]);
  return out;
}
