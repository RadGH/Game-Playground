// R&D (owner 2026-11-17): spend credits + materials and wait a few game days to research a tech from the tree in
// research-data.js. One tech at a time; cancelling gives everything back. Passing merchants sell the same techs
// cheaper and at once (ships.js GOODS — same ids), so the two routes are one system: has() is THE check, and it is
// true whichever way a tech was got (r.research.done or r.ships.goods).
//
// State on the region (saved with it; old saves get it from ensureResearch):
//   r.research = { done: { id: day }, active: null | { id, start, days, paid: { credits, metal… } }, policies: { id: true } }
// Effects: effect(r, key) multiplies every owned tech's effect[key] and every switched-on policy's. Keys:
//   water (pump output), power (fusion output), mine (outposts), refine (refineries), upkeep (building upkeep),
//   parks (park land value), appeal (newcomers), demandC (shops wanted).
// Pure: no DOM.
import { T } from './tuning.js';
import { TECHS, TECH_BY_ID, BRANCHES, MATS, MAT_NAMES } from './research-data.js';
import { techDone, item } from './catalog.js';
import { refreshArms } from './arms.js';
import { ownedGoods, GOODS } from './ships.js';
import { fmt } from '../../../../shared/format.js';

export { TECHS, TECH_BY_ID, BRANCHES };
/** Owned either way (R&D or a merchant). */
export const has = (r, id) => techDone(r, id);

/** Fill in the research fields (safe to call often; old saves start with nothing researched, but any merchant part
 *  they bought counts as researched — has() reads both). */
export function ensureResearch(r) {
  const s = r.research || (r.research = {});
  s.done ??= {}; s.active ??= null; s.policies ??= {};
  if (s.active && !TECH_BY_ID[s.active.id]) s.active = null;
  return s;
}

/** Research time for a tech in game days (the tuning panel's R&D speed scales every one). */
export const daysFor = t => Math.max(1, Math.round(t.days * (T.rdTimeMul ?? 1)));
/** Its research price: { credits, metal, … } (the tuning panel's R&D price scales every one). */
export function costOf(t) { const k = T.rdCostMul ?? 1, c = {}; for (const [m, v] of Object.entries(t.cost)) c[m] = Math.round(v * k); return c; }
/** "¢7,000 + 80 Metal + 20 Steel" */
export function costText(c) { return [c.credits ? `¢${fmt(c.credits)}` : null, ...MATS.filter(m => c[m]).map(m => `${fmt(c[m])} ${MAT_NAMES[m]}`)].filter(Boolean).join(' + '); }
/** The merchant good for this tech (same id), or null. */
export const merchantGood = id => GOODS.find(g => g.id === id) || null;

/**
 * Why tech `id` can't be researched right now, or null. Order: owned, researching, prerequisites, milestone, busy,
 * money/materials (the button says the first one that applies).
 */
export function researchProblem(r, id) {
  const t = TECH_BY_ID[id]; if (!t) return 'Unknown tech';
  const s = ensureResearch(r);
  if (has(r, id)) return 'Already researched';
  if (s.active?.id === id) return 'Researching now';
  const miss = t.needs.filter(n => !has(r, n));
  if (miss.length) return `Needs ${miss.map(n => TECH_BY_ID[n]?.name || n).join(' and ')} first`;
  if ((t.from ?? 0) > (r.milestone ?? 0)) return `Opens at milestone ${t.from}`;
  if (s.active) return `Finish or cancel ${TECH_BY_ID[s.active.id].name} first`;
  const c = costOf(t), short = [];
  if ((r.money ?? 0) < (c.credits || 0)) short.push(`¢${fmt(c.credits - Math.floor(r.money))} more`);
  for (const m of MATS) if (c[m] && (r.stock?.[m] || 0) < c[m]) short.push(`${fmt(Math.ceil(c[m] - (r.stock?.[m] || 0)))} more ${MAT_NAMES[m]}`);
  if (short.length) return `Needs ${short.join(', ')}`;
  return null;
}
/** Start researching: pays the whole price now. → { ok, why?, text } */
export function startResearch(r, id) {
  const bad = researchProblem(r, id); if (bad) return { ok: false, why: bad };
  const t = TECH_BY_ID[id], c = costOf(t), s = ensureResearch(r);
  r.money -= c.credits || 0; for (const m of MATS) if (c[m]) r.stock[m] -= c[m];
  s.active = { id, start: r.day, days: daysFor(t), paid: c };
  return { ok: true, text: `Researching ${t.name}: ${fmt(daysFor(t))} days (${fmt(Math.round(daysFor(t) * (T.dayLengthSec ?? 6)))} s at 1×).` };
}
/** Cancel the active research: everything paid comes back. → { ok, why?, text } */
export function cancelResearch(r) {
  const s = ensureResearch(r), a = s.active; if (!a) return { ok: false, why: 'Nothing is being researched' };
  refund(r, a.paid); s.active = null;
  return { ok: true, text: `Stopped researching ${TECH_BY_ID[a.id].name}. Everything paid came back.` };
}
function refund(r, c) { r.money += c.credits || 0; for (const m of MATS) if (c[m]) r.stock[m] = (r.stock[m] || 0) + c[m]; }
/** 0..1 through the active research. */
export function progress(r) { const a = ensureResearch(r).active; return a ? Math.max(0, Math.min(1, (r.day - a.start) / a.days)) : 0; }

/**
 * Mark a tech owned and make it take effect (turret refits, tougher walls, power/water re-solved). how: 'research' |
 * 'merchant' | 'drop'. If it was being researched (a merchant sold it first) the research is refunded. → refit info
 */
export function completeTech(r, id, how = 'research') {
  const s = ensureResearch(r), t = TECH_BY_ID[id];
  if (s.active?.id === id) { if (how !== 'research') refund(r, s.active.paid); s.active = null; }
  if (s.done[id] == null) s.done[id] = Math.round(r.day ?? 0);
  if (how === 'research' && t) r.log?.push({ day: Math.round(r.day), text: `Research done: ${t.name}. ${t.what}`, kind: 'research' });
  r.dirty = true;
  const changed = refreshArms(r, ownedGoods(r));
  (r.researchNews ||= []).push({ id, how });
  return changed;
}
/** Advance research to r.day. → ids finished this call. */
export function researchTick(r) {
  const s = ensureResearch(r), a = s.active; if (!a) return [];
  if (r.day >= a.start + a.days) { completeTech(r, a.id, 'research'); return [a.id]; }
  return [];
}

// ---------------------------------------------------------------- policies
export const isPolicyOn = (r, id) => !!r.research?.policies?.[id] && has(r, id);
/** Switch a researched policy on or off. → { ok, why?, on } */
export function setPolicy(r, id, on) {
  const t = TECH_BY_ID[id]; if (!t?.policy) return { ok: false, why: 'Not a policy' };
  if (!has(r, id)) return { ok: false, why: `Research ${t.name} first` };
  ensureResearch(r).policies[id] = !!on; r.dirty = true;
  return { ok: true, on: !!on };
}
/** Credits a month the switched-on policies cost (the budget's Policies line). */
export function policyUpkeep(r) { let s = 0; for (const t of TECHS) if (t.policy && isPolicyOn(r, t.id)) s += t.policy.upkeep || 0; return s; }

// ---------------------------------------------------------------- effects
/** The combined multiplier for `key` from owned techs and switched-on policies (1 when nothing applies). */
export function effect(r, key) {
  let m = 1;
  if (!r) return m;
  for (const t of TECHS) {
    if (t.effect?.[key] && has(r, t.id)) m *= t.effect[key];
    if (t.policy?.effect?.[key] && isPolicyOn(r, t.id)) m *= t.policy.effect[key];
  }
  return m;
}

// ---------------------------------------------------------------- what the R&D screen shows
/**
 * One card: { id, branch, tier, name, what, state: 'done'|'active'|'ready'|'blocked'|'locked', why, cost, costText,
 * days, sec, needs: [{ id, name, ok }], from, progress, merchant: { price, overhead } | null, unlocks: [names],
 * early: [{ name, at }], policy: { upkeep, on } | null, short: [mat keys you lack] }
 *   ready   = can start now; blocked = could start but short of money/materials, or another is running;
 *   locked  = a prerequisite or milestone is missing.
 */
export function techView(r, id) {
  const t = TECH_BY_ID[id], s = ensureResearch(r), c = costOf(t), why = researchProblem(r, id);
  const needs = t.needs.map(n => ({ id: n, name: TECH_BY_ID[n]?.name || n, ok: has(r, n) }));
  const state = has(r, id) ? 'done' : s.active?.id === id ? 'active' : !why ? 'ready'
    : needs.some(n => !n.ok) || (t.from ?? 0) > (r.milestone ?? 0) ? 'locked' : 'blocked';
  const g = t.merchant !== false ? merchantGood(id) : null;
  const overhead = g ? (r.ships?.passing || []).some(sh => sh.kind === 'merchant' && sh.offer?.goods?.includes(id)) : false;
  const short = MATS.filter(m => c[m] && (r.stock?.[m] || 0) < c[m]).concat((r.money ?? 0) < (c.credits || 0) ? ['credits'] : []);
  return {
    id, branch: t.branch, tier: t.tier, name: t.name, what: t.what, state, why: state === 'done' ? null : why,
    cost: c, costText: costText(c), days: daysFor(t), sec: Math.round(daysFor(t) * (T.dayLengthSec ?? 6)), needs, from: t.from ?? 0,
    progress: s.active?.id === id ? progress(r) : state === 'done' ? 1 : 0,
    merchant: g ? { price: costText({ credits: g.credits, crystal: g.crystal }), overhead, rare: !!g.rare } : null,
    unlocks: (t.unlocks || []).map(u => item(u)?.name || u),
    early: Object.entries(t.early || {}).map(([u, at]) => ({ name: item(u)?.name || u, at, from: item(u)?.unlock ?? 0 })),
    policy: t.policy ? { upkeep: t.policy.upkeep || 0, on: isPolicyOn(r, id) } : null, short,
    how: r.ships?.goods?.[id] != null ? 'merchant' : s.done[id] != null ? 'research' : null,   // merchant = bought, or a sponsor crate's rare part
  };
}
/** The whole screen: branches with their cards by tier, the active research, counts. */
export function researchView(r) {
  const s = ensureResearch(r);
  const branches = BRANCHES.map(b => ({ ...b, techs: TECHS.filter(t => t.branch === b.id).map(t => techView(r, t.id)) }));
  for (const b of branches) b.done = b.techs.filter(t => t.state === 'done').length;
  const a = s.active ? { ...techView(r, s.active.id), daysLeft: Math.max(0, s.active.start + s.active.days - r.day) } : null;
  if (a) a.secLeft = Math.ceil(a.daysLeft * (T.dayLengthSec ?? 6));
  return { branches, active: a, done: TECHS.filter(t => has(r, t.id)).length, total: TECHS.length };
}
