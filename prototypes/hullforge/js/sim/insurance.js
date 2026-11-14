// Insurance: buy a policy at a station; the next time your ship is lost, the rebuild bill is cut and (on the full
// plan) the cargo in your hold is saved. A policy covers ONE loss, then it is used up.
//   G.insurance = { plan: 'basic' | 'full', paid, at (play seconds) } or null
// The death screen (ui/death.js) reads deathBill(G) — the one place the rebuild bill is worked out. Pure: no DOM.

import { repairCost, designGrid } from './state.js';
import { fmt } from '../../../../shared/format.js';

/** Without cover the station charges this share of a full repair to rebuild a lost ship (PLAN §1). */
export const REBUILD_SHARE = 0.6;

export const PLANS = {
  basic: { id: 'basic', name: 'Basic cover', cut: 0.5, keepCargo: false, rate: 0.18, min: 40 },
  full: { id: 'full', name: 'Full cover', cut: 0.9, keepCargo: true, rate: 0.4, min: 90 },
};

/** The rebuild bill if the ship were lost now, before cover. */
export function rebuildBill(G) {
  const keep = G.hp; const all = {};
  for (const k of designGrid(G).cells.keys()) all[k] = 0;
  G.hp = all; const full = repairCost(G); G.hp = keep;
  return Math.round(full * REBUILD_SHARE);
}

/** Price of a plan for this ship now. Upgrading from basic to full costs the difference. */
export function premium(G, planId) {
  const P = PLANS[planId]; const bill = rebuildBill(G);
  const price = Math.max(P.min, Math.round(bill * P.rate / 5) * 5);
  const cur = G.insurance?.plan ? PLANS[G.insurance.plan] : null;
  if (cur && cur.id !== planId && cur.rate < P.rate) return Math.max(5, price - (G.insurance.paid || 0));
  return price;
}

/** Can this plan be bought now ('' = yes)? */
export function planBlock(G, planId) {
  const cur = G.insurance?.plan;
  if (cur === planId) return 'You already have this cover.';
  if (cur === 'full' && planId === 'basic') return 'Your full cover already includes this.';
  const p = premium(G, planId);
  if (G.credits < p) return `You need ${fmt(p - G.credits, { decimals: 0 })} cr more.`;
  return '';
}

export function buyPlan(G, planId) {
  if (planBlock(G, planId)) return false;
  const p = premium(G, planId);
  G.credits -= p;
  G.insurance = { plan: planId, paid: (G.insurance?.paid || 0) + p, at: G.playTime || 0 };
  return true;
}

/**
 * What a loss costs right now: { before, cut, bill, pay, keepCargo, plan }. `before` = the bill without cover;
 * `bill` = after cover; `pay` = what you can actually pay (never more than your credits).
 */
export function deathBill(G) {
  const before = rebuildBill(G);
  const plan = G.insurance?.plan ? PLANS[G.insurance.plan] : null;
  const cut = plan ? plan.cut : 0;
  const bill = Math.round(before * (1 - cut));
  return { before, cut, bill, pay: Math.min(Math.max(0, G.credits), bill), keepCargo: !!plan?.keepCargo, plan };
}

/** Settle a loss: pay the bill, lose (or keep) the cargo, use up the policy. Returns the deathBill used. */
export function settleDeath(G) {
  const d = deathBill(G);
  G.credits -= d.pay;
  if (!d.keepCargo) { G.cargo = {}; G.goods = {}; G.goodsPaid = {}; }
  if (d.plan) { G.insurance = null; G.stats.claims = (G.stats.claims || 0) + 1; }
  G.hp = {};
  return d;
}
