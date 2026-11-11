// Levels, experience, attribute points (rulings 4, 27, 29, 37). Pure.
//   Act 1 = levels 1-20, ~30 minutes a level for a first solo Normal clear (8-12 h). The bot sim (M12) checks the pace;
//   these numbers are the knobs it moves.
export const LEVEL_CAP = 20;                 // Act 1 (later acts raise it)
export const ATTRS = ['str', 'agi', 'int', 'vit', 'spi'];
export const ATTR_NAMES = { str: 'Strength', agi: 'Agility', int: 'Intellect', vit: 'Vitality', spi: 'Spirit' };
export const ATTR_HELP = {
  str: 'Melee damage and the heavy weapons and armour that need it.',
  agi: 'Critical strikes, dodge, bows and daggers, and light armour.',
  int: 'Spell damage, mana, and the staves, wands and foci that need it.',
  vit: 'Health.',
  spi: 'Health and mana coming back, and healing done.',
};
export const START_ATTR = 12;                // every attribute starts here (docs/ITEMS.md: weapon reqs are 8 + 2.5 x level)
export const POINTS_PER_LEVEL = 5;
export const PATH_LEVEL = 3;                 // ruling 29
export const SPEC_LEVEL = 10;

/** Experience needed to go from level L to L+1. */
export function xpToNext(L) {
  if (L >= LEVEL_CAP) return Infinity;
  return Math.round(120 * Math.pow(L, 1.75) + 280 * L);
}
/** Total experience at the start of level L. */
export function xpAtLevel(L) { let t = 0; for (let i = 1; i < L; i++) t += xpToNext(i); return t; }
/** Level for a total experience. */
export function levelForXp(xp) { let L = 1; while (L < LEVEL_CAP && xp >= xpAtLevel(L + 1)) L++; return L; }

/** Experience from a kill: the monster's level against yours (vanilla-WoW style grey-out, rulings 12/37).
 *  `kind` multiplies: champion 3, rare 5, boss 12 — the bestiary carries its own per-monster xp multiplier too. */
export const KIND_XP = { normal: 1, champion: 3, rare: 5, boss: 12, actboss: 30 };
export function killXp(monsterLevel, playerLevel, kind = 'normal', mult = 1) {
  const base = 18 + 9 * monsterLevel + 0.6 * monsterLevel * monsterLevel;
  const gap = monsterLevel - playerLevel;
  let f;
  if (gap >= 0) f = 1 + Math.min(gap, 5) * 0.08;               // harder things pay a little more, to +40%
  else f = Math.max(0, 1 + gap * 0.18);                         // 6+ levels below you pays nothing
  return Math.round(base * f * (KIND_XP[kind] ?? 1) * mult);
}
/** Party split (ruling 12): each member's share is weighted by their level, so carrying a low character is not a
 *  shortcut, and everyone's share is then graded against the monster on its own. */
export function partyShares(monsterLevel, levels, kind = 'normal', mult = 1) {
  const n = levels.length, bonus = 1 + 0.12 * (n - 1);            // a small reward for playing together
  const total = levels.reduce((a, b) => a + b, 0) || 1;
  return levels.map(L => Math.round(killXp(monsterLevel, L, kind, mult) * bonus * (L / total) * (n > 1 ? 1 : 1)));
}

/** Points a character of level L has had to spend, ever. Quest points come on top (`bonusPoints`). */
export const attrPointsFor = (L, bonus = 0) => POINTS_PER_LEVEL * (L - 1) + bonus;
export const skillPointsFor = (L, questPoints = 0) => (L - 1) + questPoints;     // 1 a level + 1 per main-quest step
