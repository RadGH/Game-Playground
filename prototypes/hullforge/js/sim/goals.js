// Goals: one at a time, each pointing at the next thing worth trying, with a credit reward. They are a guide,
// never a gate — everything is open from the start.

import { designGrid } from './state.js';
import { computeStats } from './stats.js';

export const GOALS = [
  { id: 'mine', title: 'First haul', text: 'Mine 15 ore from asteroids', reward: 250, need: 15, have: G => G.stats.mined },
  { id: 'sell', title: 'Market day', text: 'Sell ore at the station', reward: 200, need: 1, have: G => G.stats.sold },
  { id: 'fit', title: 'New teeth', text: 'Fit your spare turret in the Shipyard', reward: 300, need: 1, have: G => (G.flags?.fitted ? 1 : 0) },
  { id: 'kill3', title: 'Pirate trouble', text: 'Destroy 3 hostile ships', reward: 600, need: 3, have: G => G.stats.kills },
  { id: 'grow', title: 'Room to grow', text: 'Build a ship of 80 blocks or more', reward: 500, need: 80, have: G => G.design.length },
  { id: 'jump', title: 'Further out', text: 'Jump to a system of danger 2 or more', reward: 800, need: 2, have: G => G.stats.maxDanger },
  { id: 'kill10', title: 'Hunter', text: 'Destroy 10 hostile ships', reward: 1500, need: 10, have: G => G.stats.kills },
  { id: 'rare', title: 'Heavy metal', text: 'Fit a rare or better part', reward: 1200, need: 1, have: G => (designGrid(G) && [...designGrid(G).cells.values()].some(b => b.item && b.item.rarity >= 2) ? 1 : 0) },
  { id: 'bridge2', title: 'Bigger bridge', text: 'Fit a Mk II bridge or better', reward: 2000, need: 2, have: G => { const b = [...designGrid(G).cells.values()].find(x => x.t === 'bridge'); return b?.item?.tier || 1; } },
  { id: 'rating', title: 'Warship', text: 'Reach a ship rating of 450', reward: 3000, need: 450, have: G => computeStats(designGrid(G)).rating },
  { id: 'deep', title: 'Deep space', text: 'Reach a system of danger 4', reward: 3500, need: 4, have: G => G.stats.maxDanger },
  { id: 'boss', title: 'Capital kill', text: 'Destroy a capital ship (danger 4 and up)', reward: 8000, need: 1, have: G => G.stats.bosses },
  { id: 'edge', title: 'The edge', text: 'Reach a system of danger 6', reward: 12000, need: 6, have: G => G.stats.maxDanger },
];

export function currentGoal(G) { return GOALS.find(g => !G.goals.done.includes(g.id)) || null; }
export function goalProgress(G, g) { const h = Math.min(g.need, g.have(G) || 0); return { have: h, need: g.need, done: h >= g.need }; }
/** Check the current goal; returns the finished goal (reward paid) or null. */
export function checkGoals(G) {
  const g = currentGoal(G); if (!g) return null;
  if (!goalProgress(G, g).done) return null;
  G.goals.done.push(g.id); G.credits += g.reward;
  return g;
}
