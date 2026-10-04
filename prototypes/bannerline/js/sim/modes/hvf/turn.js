// The Turn (docs/hvf-PLAN.md §8.2): -1 (the hunters' night) .. +1 (the farmers' full moon), every
// second. Farmers' army + tower value against the hunters' combat value, both in gold; weights in
// data/hvf/rules.json `turn`. The HUD draws it as a moon; the AI reads the same number for the flip.

import { gear } from './hunter.js';
import { FARMERS, HUNTERS } from './state.js';

export function turnValues(ctx) {
  const { state, data } = ctx;
  const W = data.hvf.rules.turn, B = data.hvf.buildings.kinds, HI = data.hvf['hunter-items'].items;
  let farm = 0, hunt = 0;
  for (const e of state.ents) {
    if (!e.alive || e._gone) continue;
    if (e.kind === 'army') farm += (e.paid || 0) * W.armyWeight * (e.hp / e.hpMax);
    else if (e.kind === 'building' && e.type === 'tower') farm += B.tower.cost * W.towerWeight;
  }
  for (const p of state.players) {
    if (p.role !== 'hunter' || p.out) continue;
    let items = 0;
    for (const it of p.inv) if (it) items += HI[it.id].price;
    hunt += W.hunterBase * state.hvf.hunterMult + W.hunterPerLevel * (p.level - 1) + items * W.itemWeight;
  }
  return { farm, hunt };
}

export function turnTick(ctx) {
  const { state } = ctx;
  if (state.tick % 20 !== 0) return;
  const { farm, hunt } = turnValues(ctx);
  const t = farm + hunt > 0 ? (farm - hunt) / (farm + hunt) : -1;
  const v = Math.round(t * 1000) / 1000;
  const was = state.hvf.turn;
  state.hvf.turn = v;
  const ratio = hunt > 0 ? farm / hunt : 99;
  state.hvf.turnWhy = farm <= 0 ? 'The farmers have no army yet' : ratio >= 1 ? `The farmers' army outweighs the hunters ${ratio >= 10 ? '10+' : ratio.toFixed(1)}:1` : `The hunters still outweigh the farmers' army ${(1 / ratio).toFixed(1)}:1`;
  if ((was < 0) !== (v < 0)) ctx.emit('turn', { value: v, reason: state.hvf.turnWhy });
}

export { FARMERS, HUNTERS };
