// Thousandvale — what an item PROPERTY says on a card (owner feedback 6, U6). Pure.
//
// Farhold's `describeAffix` writes every property line; Thousandvale prints it through here instead, for two reasons:
//   * WHO — "your companions" is "your followers" here (js/rules/wording.js);
//   * UNITS — a few lines print a fraction as if it were a whole number ("+0.2 spell power" for +18%, "+0 damage per
//     10 kills" for +0.01). The value on the item is right and so is what it does; only the sentence loses it. Each
//     override below prints the same value the effect uses, in the unit a player reads.
// tests/C/playtest6.test.mjs sweeps every rollable property and every base's built-in property: the number on the
// card must be the number the sheet gains.

import { describeAffix } from './farhold.js';
import { whoText } from './wording.js';

const pct = v => `${+(v * 100).toFixed(1).replace(/\.0$/, '')}%`;
const n2 = v => `${+(+v).toFixed(2)}`;

/** stat -> sentence, where Farhold's own loses the unit. */
export const TEXT_FIXES = Object.freeze({
  spellPower: v => `+${pct(v)} spell power (added to every fire, ice, lightning, poison, shadow, holy and arcane hit)`,
  cond_killGrowth: v => `+${n2(v)} damage for every 10 kills you have made`,
  cond_killMemory: v => `+${n2(v)} maximum health for every 10 kills you have made`,
  cond_forageRation: v => `+${n2(v)} health a second while you are out of a fight`,
  cond_easeExhaustion: v => `+${n2(v)} health a second`,
  cond_sunderOnHit: v => `Every hit strips ${n2(v)} armour off the target for good`,
});

/** One property line for an item card. `a` = an affix object off an item (`{ stat, value, … }`). */
export function affixText(a) {
  if (!a || !a.stat) return '';
  const fix = TEXT_FIXES[a.stat];
  let text = '';
  try { text = fix ? fix(a.value) : describeAffix(a); } catch { text = ''; }
  return whoText(text || a.name || a.stat);
}

/** Every property line of an item, in order (plus the caster / focus / conversion sentences the rules wrote on it). */
export function itemLines(item) {
  const out = [];
  for (const a of item?.affixes || []) { const t = affixText(a); if (t) out.push(t); }
  for (const k of ['attackText', 'focusText']) if (item?.[k]) out.push(item[k]);
  return out;
}
