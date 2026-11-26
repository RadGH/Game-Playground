// Oathwild class trees — the helpers every tools/trees/<class>.mjs uses. `node tools/build-trees.mjs` turns the tree
// files into data/classes.json nodes + data/spells.json rows (Oathwild's own spells, no borrowed rows).
//
// THE TREE RULES (owner 2026-11-26 — tests/rules/trees.test.mjs checks every one):
//  1. No paths / subclasses. One tree per class, several choices at every class level ("more choices every tier").
//  2. Every node is ONE rank, one icon. A spell's rank II / III is its own node deeper in the tree that needs the
//     rank before it (`rank(...)` below does that).
//  3. Each weapon kind and each armour kind is its own training node (`prof('sword')`), never grouped. A class's
//     starting kit comes as FREE training nodes at level 1. Weapon masteries (`mastery('sword')`: +25% damage with
//     swords) need that training.
//  4. Passives are BIG: no small percentages. Every percent number is 20 or more, except critical chance (a few %).
//     "I want 25% increased damage on talents, not 2%."
//  5. Few defensive abilities and few heals; the tree is about fighting. Every active ability is an area: nova
//     (around you), cone, line, ground circle, leap or charge. NO plain projectiles ("no simple projectiles like
//     frost bolt in this game except for basic wands") — a fireball is a lobbed ball that EXPLODES where it lands
//     (shape 'ground' with a `delay` for its flight).
//  6. Names are plain, common words a player knows: Cleave, Shield Bash, Fireball, Frost Nova, Ground Slam.
//     No made-up, flashy, archaic or poetic names. Banned outright: "rim", "gyre", "shove" (and the playground's
//     banned list). Bad examples on record: Rim Strike, Iron Gyre, Breaching Shove.
//  7. Big abilities throw enemies about: `knock: { push: metres, down: seconds }` knocks them back through the air and
//     onto the ground (bosses resist most of it). Use it on slams, explosions and charges.
//
// Spell row fields (js/rules/spells.js SUPPORTED): name, shape ('melee' cone | 'around' nova | 'ground' circle at a
// spot | 'beam' line | 'dash' charge | 'leap' jump-and-slam | 'self' buff | 'summon' | 'bolt' — bolt is for wand
// basics only), element, mult (× weapon damage for physical, × spell power for magic), reach + arc (cone), radius,
// range, width (line), delay (seconds before a ground spell lands — the fireball's flight), repeats + repeatEvery,
// cooldown, mp, knock { push, down, stagger }, statuses [{ id, seconds, … }] (bleed burn poison chill root stagger
// weaken shock marked might haste …), selfBuff { name, seconds, damage, haste, move, … } (shares: 0.25 = 25%),
// buffs + allies, place { kind:'zone', seconds, radius, every, strike:{ mult }, debuff }, pullIn { metres },
// execute { below, mult }, leech, critBonus, pen, summon/pet, form.
// Ranks: `ranks: [{}, { power: 1.4, mp: 1.1, add: { radius: 1 } }, { power: 1.8, mp: 1.2, add: { knock: { down: 1 } } }]`
// (power = total vs rank 1). Every rank must make the spell clearly stronger.

/** A spell node (rank 1). `free: true` = comes with the class level. */
export const spell = (id, level, o = {}) => ({ id, kind: 'spell', spell: id, level, ...o });
/** Rank r (2 or 3) of a spell: its own node, needs the rank before. */
export const rank = (spellId, r, level, o = {}) => ({ id: `${spellId}_${r}`, kind: 'spell', spell: spellId, rank: r, level, needs: [r === 2 ? spellId : `${spellId}_${r - 1}`], ...o });
/** One training (weapon kind, armour kind, shield, dualWield). Name comes from data/proficiency.json names. */
export const prof = (kind, level, o = {}) => ({ id: `prof_${kind}`, kind: 'prof', grants: [kind], level, ...o });
const KIND_NAME = { dagger: 'Dagger', sword: 'Sword', axe: 'Axe', mace: 'Mace', spear: 'Spear', staff: 'Staff', twohand: 'Two-Handed', bow: 'Bow', crossbow: 'Crossbow', wand: 'Wand', scepter: 'Sceptre' };
/** "+25% damage with swords" — needs the sword training node. */
export const mastery = (kind, level, pct = 25, o = {}) => ({ id: `mastery_${kind}`, kind: 'passive', name: `${KIND_NAME[kind]} Mastery`, level, mods: { [`${kind}Pct`]: pct }, needs: [`prof_${kind}`], ...o });
/** A passive with big numbers (sheet mods vocabulary: js/rules/sheet.js STAT_KEYS). */
export const passive = (id, name, level, mods, o = {}) => ({ id, kind: 'passive', name, level, mods, ...o });
/** A modifier: changes how one of the class's spells works (`on` = that spell's node id). */
export const mod = (id, name, on, level, change, o = {}) => ({ id, kind: 'mod', name, on, level, change, ...o });
/** Two or more capstones at the last level — pick one. */
export const capstone = (node) => ({ ...node, choice: 'capstone' });

/** Standard ranks: II = +25% power (+ what `two` adds), III = +50% (+ what `three` adds). 2026-11-26 balance pass:
 *  +40/+80 stacked with class depth and repeats let a level-3 opener kill a same-level monster in about a second. */
export const ranks = (two = {}, three = {}) => [{}, { power: 1.25, mp: 1.1, ...(Object.keys(two).length ? { add: two } : {}) }, { power: 1.5, mp: 1.2, ...(Object.keys(three).length ? { add: three } : {}) }];
