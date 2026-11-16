// A region you're not playing keeps earning (PLAN §0 'Away from a region'): at its last rates (r.rates, the city
// tick's smoothed per-day numbers) into ITS OWN money and stockpile. Nothing grows, nothing attacks, no ships — the
// wildlife, nest timers and ship timers are frozen (moved forward by the same days), so coming back is never a
// surprise you couldn't see (lessons rule 39). The Orbital Lance keeps recharging.
// "While you were away" adds up in r.away until the player has seen it.
import { T } from './tuning.js';
import { RAW, REFINED } from './region.js';
import { fmt, mat } from '../../../../shared/format.js';

const GOOD_NAMES = { metal: 'Metal', stone: 'Stone', crystal: 'Crystal', steel: 'Steel', concrete: 'Concrete', cells: 'Power cells' };

/**
 * Earn `days` game days at the last rates. Money: a positive rate × T.awayShare; a losing city still pays its bills
 * at the full rate but never sinks below the shutdown line (T.debtShutdown) while you're away. Materials: full rate.
 * → { days, credits, goods: { metal: n, … } } for this call (also added to r.away).
 */
export function awayTick(r, days) {
  const out = { days: 0, credits: 0, goods: {} };
  if (!r.founded || !(days > 0)) return out;
  const rate = r.rates?.money || 0;
  let gain = rate > 0 ? rate * days * (T.awayShare ?? 0.8) : rate * days;
  if (gain < 0) { const floor = T.debtShutdown ?? -5000; gain = r.money <= floor ? 0 : Math.max(gain, floor - r.money); }
  r.money += gain; out.credits = gain;
  for (const k of [...RAW, ...REFINED]) { const v = Math.max(0, r.rates?.[k] || 0) * days; if (v > 0) { r.stock[k] = (r.stock[k] || 0) + v; out.goods[k] = v; } }
  r.day += days; out.days = days;
  freeze(r, days);
  const a = r.away || (r.away = { days: 0, credits: 0, goods: {} });
  a.days += days; a.credits += out.credits; for (const [k, v] of Object.entries(out.goods)) a.goods[k] = (a.goods[k] || 0) + v;
  return out;
}
/** Everything that would have "happened" while away waits instead: ship and nest timers slide by the same days. */
function freeze(r, days) {
  const s = r.ships; if (s) { if (s.nextDay != null) s.nextDay += days; if (s.nextDrop != null) s.nextDrop += days; s.passing = []; }
  const t = r.threat; if (t) {
    for (const k of ['nextSpread', 'nextSwarm', 'nextMigration', 'calmUntil', 'angerDay']) if (t[k] != null && t[k] >= 0) t[k] += days;
    if (t.swarm) t.swarm.at += days;
    if (t.lastBreach != null) t.lastBreach += days;
  }
}
/** Catch up for real time spent elsewhere (another region, or the game closed): seconds → days at 1×, capped at
 *  T.awayMaxDays. */
export function awayCatchUp(r, realSeconds) {
  const days = Math.min(T.awayMaxDays ?? 360, Math.max(0, realSeconds) / Math.max(0.1, T.dayLengthSec ?? 6));
  return awayTick(r, days);
}
/** "While you were away": null if nothing to show, else { days, credits, goods, lines: [plain-language text] }. */
export function awaySummary(r) {
  const a = r.away; if (!a || a.days < 1) return null;
  const lines = [];
  const months = a.days / 30;
  lines.push(months >= 1 ? `${fmt(months, { decimals: 1 })} months passed in ${r.name}.` : `${fmt(Math.round(a.days))} days passed in ${r.name}.`);
  lines.push(a.credits >= 0 ? `The city earned ${fmt(Math.round(a.credits))} credits.` : `The city spent ${fmt(Math.round(-a.credits))} credits more than it earned.`);
  const g = Object.entries(a.goods).filter(([, v]) => v >= 1);
  if (g.length) lines.push(`Stockpile: ${g.map(([k, v]) => `+${mat(v)} ${GOOD_NAMES[k]}`).join(', ')}.`);
  lines.push('Nothing grew and no creatures attacked while you were away.');
  return { days: a.days, credits: a.credits, goods: { ...a.goods }, lines };
}
export function clearAway(r) { delete r.away; }
