// Thousandvale — what a STATUS does, in one plain sentence (wrap-up, report #60: "When an item says something like
// 'Hits leave cursed', add a tooltip that explains how curse works to the bottom."). Pure.
//
// A card line names a status ("Hits leave Cursed.", "+15% fire damage to anything poisoned"); `statusesNamed` finds
// which, and `statusExplain` writes what that status does. EVERY number is read off the status row itself
// (Farhold's data/skills.json `statuses`: seconds, takeMore, dealLess, slow) and off Farhold's own tick length —
// nothing is typed in here, so a change to the data reaches the card by itself.
//
// Only statuses that HARM a target are explained (kinds below): a class tag ("Lit", "Quarry") or a buff is a skill's
// business, and their names are ordinary words that would match prose by accident.

import { TICK_EVERY } from './farhold.js';

/** The status kinds a card explains. */
export const EXPLAINED_KINDS = Object.freeze(['damage', 'slow', 'debuff']);

const pct = v => `${+(v * 100).toFixed(1)}%`;
const secs = v => `${+(+v).toFixed(1)}s`;
const list = bits => (bits.length <= 1 ? bits[0] || '' : `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`);
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What one status does. `spec` = its row; '' when the row has nothing a sentence can state. */
export function statusExplain(spec) {
  if (!spec || !spec.name || !EXPLAINED_KINDS.includes(spec.kind)) return '';
  const dur = secs(spec.seconds || 0);
  const bits = [];
  if (spec.perSecond) bits.push(`takes ${spec.element && spec.element !== 'physical' ? spec.element + ' ' : ''}damage every ${TICK_EVERY === 1 ? 'second' : secs(TICK_EVERY)}`);
  if (spec.takeMore) bits.push(`takes ${pct(spec.takeMore)} more damage`);
  if (spec.dealLess) bits.push(`deals ${pct(spec.dealLess)} less damage`);
  if (spec.slow) bits.push(`moves ${pct(spec.slow)} slower`);
  if (!bits.length) return '';
  let s = `${spec.name}: the target ${list(bits)} for ${dur}.`;
  if (spec.perSecond) s += ' A harder hit leaves a stronger one.';
  return spec.stackMax ? s : s + ` Applying it again restarts the ${dur}; it does not stack.`;
}

/**
 * Which explained statuses a set of card lines names, in the order they are first named.
 * A status is "named" by its own display name as a whole word, any letter case ("Cursed", "anything cursed").
 * @returns {string[]} status ids
 */
export function statusesNamed(lines, statuses = {}) {
  const text = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
  if (!text) return [];
  const found = [];
  for (const [id, spec] of Object.entries(statuses)) {
    if (!spec?.name || !EXPLAINED_KINDS.includes(spec.kind)) continue;
    const m = new RegExp(`\\b${reEsc(spec.name)}\\b`, 'i').exec(text);
    if (m) found.push([m.index, id]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(f => f[1]);
}

/** The explainer lines for a card: one per status its property lines name (none that has nothing to say). */
export function statusNotes(lines, statuses = {}) {
  return statusesNamed(lines, statuses).map(id => statusExplain(statuses[id])).filter(Boolean);
}
