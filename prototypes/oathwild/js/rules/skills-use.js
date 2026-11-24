// Oathwild — use-skills (non-combat only, owner 2026-11-23): rise 0–100 by doing them. Pure.
// The ONE reader of data/skills-use.json.
//
//   char.skills = { sneak: { v, xp }, … }
//   skillValue(char, id)                         0–100 (whole number shown, fractional progress kept in xp)
//   xpToNext(rules, v)                           XP from v to v+1
//   gainSkill(rules, char, id, use, n=1)         → { gained, from, to, milestones: [25…] } (events for the client)
//   milestonesReached(rules, char)               how many milestones across all skills (talent points)
//   skillPerks(rules, char)                      [{ skill, at, id, name, value }]
//   hasPerk(rules, char, perkId)
//   noticeRange(rules, char, base, { sneaking })  how close an enemy must be to notice you
//   lockpickChance(rules, char, lock)            0..1
//   pickpocketChance(rules, char, difficulty)    0..1
//   priceMult(rules, char, { selling })          what shops charge / pay you, as a multiplier
//   enchantPower(rules, char)                    share of a fresh roll an enchantment you apply gets

const S = rules => rules.data.skillsUse;
export const skillIds = rules => Object.keys(S(rules).skills);
export const roundOneSkills = rules => skillIds(rules).filter(k => S(rules).skills[k].round === 1);

export const skillValue = (char, id) => Math.floor(char.skills?.[id]?.v || 0);

export function xpToNext(rules, v) {
  const c = S(rules).curve;
  return c.base + v * c.perPoint;
}

/** Make sure every skill has a row (new characters, old saves). */
export function ensureSkills(rules, char) {
  char.skills = char.skills || {};
  for (const id of skillIds(rules)) if (!char.skills[id]) char.skills[id] = { v: S(rules).start, xp: 0 };
  return char.skills;
}

/** Raise a skill by its value directly (a class's or background's head start). */
export function boostSkill(rules, char, id, by) {
  ensureSkills(rules, char);
  const s = char.skills[id];
  if (!s) return;
  s.v = Math.min(S(rules).max, s.v + by);
}

/**
 * Do the thing: `use` names an entry in the skill's `gain` table (e.g. lockpicking 'pickAdept').
 * A later-round skill gains nothing. Returns what changed for the event log.
 */
export function gainSkill(rules, char, id, use, n = 1) {
  const def = S(rules).skills[id];
  if (!def || def.round > 1) return { gained: 0, from: 0, to: 0, milestones: [] };
  const per = def.gain?.[use];
  if (!(per > 0)) return { gained: 0, from: skillValue(char, id), to: skillValue(char, id), milestones: [] };
  ensureSkills(rules, char);
  const s = char.skills[id];
  const from = Math.floor(s.v);
  s.xp += per * n;
  while (s.v < S(rules).max && s.xp >= xpToNext(rules, Math.floor(s.v))) {
    s.xp -= xpToNext(rules, Math.floor(s.v));
    s.v = Math.floor(s.v) + 1;
  }
  if (s.v >= S(rules).max) s.xp = 0;
  const to = Math.floor(s.v);
  const milestones = S(rules).milestones.filter(m => from < m && to >= m);
  return { gained: per * n, from, to, milestones };
}

export function milestonesReached(rules, char) {
  let n = 0;
  for (const id of skillIds(rules)) for (const m of S(rules).milestones) if (skillValue(char, id) >= m) n++;
  return n;
}

export function skillPerks(rules, char) {
  const out = [];
  for (const [id, def] of Object.entries(S(rules).skills)) {
    for (const [at, perk] of Object.entries(def.perks || {})) {
      if (skillValue(char, id) >= +at) out.push({ skill: id, at: +at, ...perk });
    }
  }
  return out;
}
export const hasPerk = (rules, char, perkId) => skillPerks(rules, char).some(p => p.id === perkId);
const perkValue = (rules, char, perkId, fallback = 0) => skillPerks(rules, char).find(p => p.id === perkId)?.value ?? fallback;

/** Metres at which an enemy notices you. Sneaking (and Sneak) pull it in. */
export function noticeRange(rules, char, base, { sneaking = false } = {}) {
  if (!sneaking) return base;
  const cut = Math.min(0.6, skillValue(char, 'sneak') * S(rules).skills.sneak.perPoint.noticeCut);
  let r = base * S(rules).skills.sneak.sneaking * (1 - cut);
  if (hasPerk(rules, char, 'shadowed')) r *= 1 - perkValue(rules, char, 'shadowed');
  return Math.max(1.5, r);
}

/** Odds of opening a lock of `lock` level ('novice' … 'master'). */
export function lockpickChance(rules, char, lock) {
  const L = rules.data.regions.locks;
  if (!lock) return 1;
  let level = lock;
  if (lock === 'expert' && hasPerk(rules, char, 'master_hands')) level = 'adept';
  if (lock === 'master' && hasPerk(rules, char, 'unlocked')) return 1;
  const base = L[level]?.base ?? 0;
  return Math.max(0, Math.min(1, base + skillValue(char, 'lockpicking') * S(rules).skills.lockpicking.perPoint.chance));
}

/** Odds of lifting a purse; `difficulty` 0..1 (a guard captain is hard). */
export function pickpocketChance(rules, char, difficulty = 0.5) {
  let c = 0.6 - difficulty * 0.5 + skillValue(char, 'pickpocket') * S(rules).skills.pickpocket.perPoint.chance;
  if (hasPerk(rules, char, 'nimble')) c += perkValue(rules, char, 'nimble');
  return Math.max(0.02, Math.min(0.98, c));
}

/** Price multiplier: < 1 when buying (you pay less), > 1 when selling. `extraCut` = Charisma/talent price cut (0..1). */
export function priceMult(rules, char, { selling = false, extraCut = 0 } = {}) {
  const cut = Math.min(0.4, skillValue(char, 'speech') * S(rules).skills.speech.perPoint.priceCut + extraCut);
  if (selling) return 1 + cut + (hasPerk(rules, char, 'haggler') ? perkValue(rules, char, 'haggler') : 0);
  return 1 - cut;
}

/** Share of a fresh roll an enchantment you put on an item is worth. */
export function enchantPower(rules, char) {
  const base = rules.data.inventory.enchanting.base;
  let p = base + skillValue(char, 'enchanting') * S(rules).skills.enchanting.perPoint.power;
  if (hasPerk(rules, char, 'deep_runes')) p *= 1 + perkValue(rules, char, 'deep_runes');
  return p;
}

/** How many of your enchantments one item takes. `extra` = talents (sheet enchantSlots). */
export function enchantSlots(rules, char, extra = 0) {
  let n = rules.data.inventory.enchanting.slots;
  for (const id of ['second_rune', 'third_rune']) if (hasPerk(rules, char, id)) n = Math.max(n, perkValue(rules, char, id));
  return n + extra;
}
