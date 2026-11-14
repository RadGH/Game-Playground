// Paying with ore (owner 2026-11-13: "ferrite is nowhere in a danger 3 zone"). Every cost names one material,
// but any ore of the SAME ROLE (structural / energy / exotic) and the same tier or HIGHER pays for it one for one:
// out at danger 3 the Titanium you mine pays for a frame's Ferrite, a Helium-3 cell for a Carbon one. Rock pays only
// for rock. The exact material is used first, then the cheapest ore that can stand in, so the hold keeps its best.
// Every place that charges materials (build mode, outposts, crafting, warp cores, grow hull, drones, repairs) goes
// through `planPay` / `payMats` — and every screen that shows a cost reads `haveFor` / `costLabel` from here.
import { MATERIALS } from '../data/types.js';

const tierOf = m => MATERIALS[m]?.tier ?? 0;
const priceOf = m => MATERIALS[m]?.price ?? 1;

/** Materials that may pay for `m`, the exact one first, then the cheapest stand-ins. */
export function subsFor(m) {
  const d = MATERIALS[m];
  if (!d || d.role === 'rock') return [m];
  const others = Object.keys(MATERIALS).filter(k => k !== m && MATERIALS[k].role === d.role && MATERIALS[k].tier >= d.tier);
  others.sort((a, b) => priceOf(a) - priceOf(b));
  return [m, ...others];
}

/**
 * What paying `mats` out of `cargo` would take. Negative entries are refunds (build mode: blocks taken off) and
 * go back first. Needs of a higher tier are paid first, since fewer ores can stand in for them.
 * Returns { take: {mat: n}, short: {mat: n}, ok }.
 */
export function planPay(cargo, mats) {
  const left = { ...cargo };
  const take = {}, short = {};
  for (const [m, n] of Object.entries(mats || {})) if (n < 0) left[m] = (left[m] || 0) - n;
  const needs = Object.entries(mats || {}).filter(([, n]) => n > 0).sort((a, b) => tierOf(b[0]) - tierOf(a[0]));
  for (const [m, n] of needs) {
    let rest = n;
    for (const s of subsFor(m)) {
      if (rest <= 0) break;
      const got = Math.min(rest, Math.max(0, left[s] || 0));
      if (got > 0) { left[s] -= got; take[s] = (take[s] || 0) + got; rest -= got; }
    }
    if (rest > 0) short[m] = (short[m] || 0) + rest;
  }
  return { take, short, ok: !Object.keys(short).length };
}
export const canPay = (cargo, mats) => planPay(cargo, mats).ok;

/** Pay `mats` from G.cargo (refunds included). Returns what was taken, or null (and takes nothing) when short. */
export function payMats(G, mats) {
  const p = planPay(G.cargo, mats);
  if (!p.ok) return null;
  for (const [m, n] of Object.entries(mats || {})) if (n < 0) G.cargo[m] = (G.cargo[m] || 0) - n;
  for (const [m, n] of Object.entries(p.take)) { G.cargo[m] -= n; if (G.cargo[m] <= 0) delete G.cargo[m]; }
  return p.take;
}

/** How much of `m` the cargo can pay on its own (the exact ore plus every stand-in). */
export const haveFor = (cargo, m) => subsFor(m).reduce((s, k) => s + Math.max(0, cargo[k] || 0), 0);

/** The one line screens show under a cost so players know stand-ins count. */
export const SUBS_HINT = 'Better ore of the same kind pays too: Titanium for Ferrite, Cobalt for Carbon, Diamond for Quartz.';
/** Short strings for what is missing ("12 more Ferrite or better structural ore"). */
export function shortText(cargo, mats) {
  return Object.entries(planPay(cargo, mats).short).map(([m, n]) => {
    const d = MATERIALS[m];
    const or = d && d.role !== 'rock' && subsFor(m).length > 1 ? ` (or better ${d.role} ore)` : '';
    return `${n} more ${d?.name || m}${or}`;
  });
}
