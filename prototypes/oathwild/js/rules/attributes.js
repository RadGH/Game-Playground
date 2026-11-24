// Oathwild — the six attributes: point buy, level points, and what each point is worth. Pure.
//
//   pointBuyCost(attrs)                    points a starting spread costs (D&D 5e table)
//   pointBuyRefusal(rules, attrs)          null, or why a starting spread is not allowed (player words)
//   attrPointsEarned(level)                attribute points a character of `level` has earned from levels
//   spendAttrPoint(rules, char, key)       { ok, why } — spends one earned point
//   attrBreakdown(rules, char, extra)      { str: { base, level, class, gear, bonus, total }, … }
//   perPointShare(rules, key, field, v)    what `v` in attribute `key` adds to `field` (0 at 10)
//
// The character sheet that uses all this is js/rules/sheet.js.

export const ATTRS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const A = rules => rules.data.attributes;

/** Points a starting spread costs, or Infinity if any value is off the table. */
export function pointBuyCost(rules, attrs = {}) {
  const pb = A(rules).pointBuy;
  let total = 0;
  for (const k of ATTRS) {
    const v = attrs[k] ?? pb.start;
    const c = pb.cost[String(v)];
    if (c == null) return Infinity;
    total += c;
  }
  return total;
}

/** null when `attrs` is a legal starting spread, else the reason in player words. */
export function pointBuyRefusal(rules, attrs = {}) {
  const pb = A(rules).pointBuy;
  const names = A(rules).names;
  for (const k of ATTRS) {
    const v = attrs[k] ?? pb.start;
    if (!Number.isInteger(v)) return `${names[k]} must be a whole number.`;
    if (v < pb.min) return `${names[k]} cannot start below ${pb.min}.`;
    if (v > pb.max) return `${names[k]} cannot start above ${pb.max} (classes and levels raise it later).`;
  }
  const cost = pointBuyCost(rules, attrs);
  if (cost > pb.points) return `That spread costs ${cost} points; you have ${pb.points}.`;
  return null;
}

/** A legal default spread for quick starts and bots, weighted toward `primary` attributes. */
export function suggestedSpread(rules, primary = []) {
  const pb = A(rules).pointBuy;
  const attrs = Object.fromEntries(ATTRS.map(k => [k, pb.start]));
  const order = [...primary, ...ATTRS.filter(k => !primary.includes(k))];
  // raise the primaries to 15, then the rest a step at a time while points last
  const tryRaise = (k, to) => {
    while (attrs[k] < to) {
      attrs[k]++;
      if (pointBuyCost(rules, attrs) > pb.points) { attrs[k]--; return false; }
    }
    return true;
  };
  for (const k of primary) tryRaise(k, pb.max);
  for (let target = 10; target <= pb.max; target++) for (const k of order) tryRaise(k, target);
  return attrs;
}

/** Attribute points earned from character levels alone. */
export function attrPointsEarned(rules, level = 1) {
  const lp = A(rules).levelPoints;
  return Math.floor(Math.max(0, level) / lp.every) * lp.amount;
}

/** Points earned but not yet spent. `char.attrSpent` is { str: n, … } (what level points bought). */
export function attrPointsLeft(rules, char) {
  const spent = Object.values(char.attrSpent || {}).reduce((s, v) => s + v, 0);
  return attrPointsEarned(rules, char.level) - spent;
}

/** Spend one earned point on `key`. */
export function spendAttrPoint(rules, char, key) {
  const names = A(rules).names;
  if (!ATTRS.includes(key)) return { ok: false, why: 'There is no such attribute.' };
  if (attrPointsLeft(rules, char) <= 0) return { ok: false, why: 'No attribute points left — you earn one at every even level.' };
  const now = attrBreakdown(rules, char)[key].total;
  if (now >= A(rules).max) return { ok: false, why: `${names[key]} is already at the most it can be (${A(rules).max}).` };
  char.attrSpent = char.attrSpent || {};
  char.attrSpent[key] = (char.attrSpent[key] || 0) + 1;
  return { ok: true, why: null };
}

/**
 * Every attribute with where it came from, for the sheet and the "Strength 13 (+5 −2)" colouring.
 * `extra` = { class: {k:n}, gear: {k:n}, bonus: {k:n} } worked out by js/rules/sheet.js.
 */
export function attrBreakdown(rules, char, extra = {}) {
  const out = {};
  for (const k of ATTRS) {
    const base = char.attributes?.[k] ?? A(rules).pointBuy.start;
    const level = char.attrSpent?.[k] || 0;
    const cls = extra.class?.[k] || 0;
    const gear = extra.gear?.[k] || 0;
    const bonus = extra.bonus?.[k] || 0;
    const total = base + level + cls + gear + bonus;   // gear and auras may push past the spending cap
    out[k] = { base, level, class: cls, gear, bonus, total };
  }
  return out;
}

/** `v` points of attribute `key` (relative to the average of 10) times the per-point number `field`. */
export function perPointShare(rules, key, field, v) {
  const per = A(rules).perPoint[key]?.[field] || 0;
  return (v - A(rules).average) * per;
}

/** The attribute that powers a spell of `element` (`weapon` spells return null). */
export function schoolAttr(rules, element) {
  return A(rules).schoolAttr[element] || 'int';
}
