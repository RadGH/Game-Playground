// Damage types, hit sizes, armour materials, raw resources and rarities.
// Plain data: games and tests read these; nothing here draws or plays sound.

/** Five damage types (PLAN §0 #11). */
export const DAMAGE = {
  kinetic:   { name: 'Kinetic',   color: '#ffd27a', short: 'KIN', blurb: 'Bullets, slugs and shells.' },
  laser:     { name: 'Laser',     color: '#ff4f7a', short: 'LAS', blurb: 'Focused light. Instant, precise.' },
  plasma:    { name: 'Plasma',    color: '#5ff3ff', short: 'PLA', blurb: 'Superheated gas. Melts armour, burns.' },
  explosive: { name: 'Explosive', color: '#ff8a2a', short: 'EXP', blurb: 'Missiles, rockets, mines. Hits an area.' },
  lightning: { name: 'Lightning', color: '#b48cff', short: 'ARC', blurb: 'Arcs between targets. Drains shields.' },
};
export const DAMAGE_IDS = Object.keys(DAMAGE);

/**
 * Three hit sizes. Armour's flat reduction is multiplied by `flat`: thick plate stops machine-gun rounds
 * cold but barely slows a capital shell. Small ships fire small hits, big ships fire big ones, so a
 * balanced ship needs both kinds of armour.
 */
export const HIT_SIZE = {
  s: { name: 'Light',  flat: 1.0 },
  m: { name: 'Medium', flat: 0.45 },
  l: { name: 'Heavy',  flat: 0.12 },
};

/**
 * Armour materials. `resist` is a fraction taken off the damage of that type (negative = weak to it).
 * `flat` is taken off every hit after that (times the hit size factor). A hit always does at least 10%.
 */
export const ARMOR = {
  frame:     { name: 'Frame',            color: '#7d8798', flat: 0.5, resist: { kinetic: 0,    laser: 0,    plasma: 0,     explosive: 0,    lightning: 0 } },
  steel:     { name: 'Steel plate',      color: '#9aa3ad', flat: 2.5,   resist: { kinetic: 0.35, laser: 0.10, plasma: -0.20, explosive: 0.15, lightning: -0.10 } },
  ceramic:   { name: 'Ceramic tile',     color: '#e8dcc4', flat: 1.5, resist: { kinetic: -0.10, laser: 0.45, plasma: 0.35, explosive: 0,    lightning: 0.20 } },
  reactive:  { name: 'Reactive plate',   color: '#c9874f', flat: 2,   resist: { kinetic: 0.15, laser: 0,    plasma: 0,     explosive: 0.50, lightning: -0.10 } },
  ablative:  { name: 'Ablative mesh',    color: '#d9a6ff', flat: 0.5, resist: { kinetic: 0,    laser: 0.55, plasma: 0.15,  explosive: -0.10, lightning: 0 } },
  insulated: { name: 'Insulated skin',   color: '#6fd4a0', flat: 1,   resist: { kinetic: 0.05, laser: 0,    plasma: 0.10,  explosive: 0,    lightning: 0.70 } },
  titanium:  { name: 'Titanium weave',   color: '#bfe3ff', flat: 4,   resist: { kinetic: 0.25, laser: 0.25, plasma: 0.20,  explosive: 0.25, lightning: 0.15 } },
  iridium:   { name: 'Iridium bulwark',  color: '#8fa6c9', flat: 9,   resist: { kinetic: 0.50, laser: 0.25, plasma: 0.10,  explosive: 0.40, lightning: 0 } },
  neutronium:{ name: 'Neutronium slab',  color: '#ffe7a8', flat: 16,  resist: { kinetic: 0.50, laser: 0.45, plasma: 0.45,  explosive: 0.50, lightning: 0.40 } },
  // alien
  chitin:    { name: 'Vesh chitin',      color: '#9bd36a', flat: 2.5, resist: { kinetic: 0.20, laser: -0.15, plasma: 0.55, explosive: 0.10, lightning: 0.10 } },
  lattice:   { name: 'Lattice alloy',    color: '#7fe6ff', flat: 2,   resist: { kinetic: 0.10, laser: 0.10, plasma: 0,     explosive: 0,    lightning: 0.80 } },
  prism:     { name: 'Ossari prism',     color: '#ffb8f4', flat: 1,   resist: { kinetic: -0.20, laser: 0.75, plasma: 0.25, explosive: -0.10, lightning: 0.30 } },
  basalt:    { name: 'Kharr basalt',     color: '#a07060', flat: 7,   resist: { kinetic: 0.40, laser: 0.15, plasma: 0.25,  explosive: 0.35, lightning: 0.05 } },
  rock:      { name: 'Rock',             color: '#6d625a', flat: 0.3,   resist: { kinetic: 0.1,  laser: 0,    plasma: 0,     explosive: 0,    lightning: 0.5 } },
};

/** Damage a hit does to a block after armour. */
export function armorDamage(dmg, type, size, armorId) {
  const a = ARMOR[armorId] || ARMOR.frame;
  const after = dmg * (1 - (a.resist[type] || 0)) - a.flat * (HIT_SIZE[size]?.flat ?? 1);
  return Math.max(dmg * 0.1, after);
}

/**
 * Raw materials (play-test #32, 2026-11-12: "too many materials… just 4 types per tier"). Every tier of
 * play has the same four roles, so mining and crafting have clear priorities:
 *   rock       — worthless filler; the only thing hull frames and cargo bays need besides structure
 *   structural — frames, armour, hulls
 *   energy     — reactors, engines, shields, weapons
 *   exotic     — rare: CPU, computers, high-end parts, better crafting odds
 * Tier = the warp-core class that reaches it (danger 1-2 → I, 3-4 → II, … 9-10 → V). `matTier(danger)`.
 */
export const MAT_ROLES = { rock: 'Filler', structural: 'Structural', energy: 'Energy', exotic: 'Exotic' };
export const MATERIALS = {
  rock:      { name: 'Rock',          tier: 0, role: 'rock',       price: 1,    color: '#8a7f74', blurb: 'Crushed asteroid. Worth almost nothing, but hull frames and cargo bays are mostly rock.' },
  ferrite:   { name: 'Ferrite',       tier: 1, role: 'structural', price: 6,    color: '#c0805a', blurb: 'Iron-rich ore. Frames, plates and the first armour.' },
  carbon:    { name: 'Carbon',        tier: 1, role: 'energy',     price: 8,    color: '#5a6070', blurb: 'Graphite and soot. Fuel cells, wiring, small engines.' },
  quartz:    { name: 'Quartz',        tier: 1, role: 'exotic',     price: 24,   color: '#ff9ef0', blurb: 'Clear crystal. CPU chips and laser lenses.' },
  titanium:  { name: 'Titanium',      tier: 2, role: 'structural', price: 22,   color: '#bfe3ff', blurb: 'Light and strong. Corvette and frigate hulls.' },
  cobalt:    { name: 'Cobalt',        tier: 2, role: 'energy',     price: 30,   color: '#4f7dff', blurb: 'Magnets, reactors, ion drives.' },
  diamond:   { name: 'Diamond',       tier: 2, role: 'exotic',     price: 90,   color: '#e8fbff', blurb: 'Pressed carbon. Precision optics and shield emitters.' },
  iridium:   { name: 'Iridium',       tier: 3, role: 'structural', price: 70,   color: '#8fa6c9', blurb: 'Heavy plate for destroyers and cruisers.' },
  helium3:   { name: 'Helium-3',      tier: 3, role: 'energy',     price: 85,   color: '#ffe680', blurb: 'Fusion fuel. Big reactors and plasma.' },
  starglass: { name: 'Starglass',     tier: 3, role: 'exotic',     price: 260,  color: '#7af7ff', blurb: 'Glass fused in a star\'s corona. Mind cores and lances.' },
  osmium:    { name: 'Osmium',        tier: 4, role: 'structural', price: 180,  color: '#9a8cb8', blurb: 'The densest ore that can still be worked. Capital frames.' },
  antimatter:{ name: 'Antimatter',    tier: 4, role: 'energy',     price: 240,  color: '#ff6ad0', blurb: 'Bottled in magnetic traps. Capital reactors and torpedoes.' },
  exotic:    { name: 'Exotic matter', tier: 4, role: 'exotic',     price: 700,  color: '#ff5fd2', blurb: 'Strange stuff. Warp cores and relic-grade parts.' },
  neutronium:{ name: 'Neutronium',    tier: 5, role: 'structural', price: 480,  color: '#ffe7a8', blurb: 'Collapsed-star matter. The heaviest armour.' },
  voidplasma:{ name: 'Void plasma',   tier: 5, role: 'energy',     price: 620,  color: '#b46aff', blurb: 'Plasma from between the stars. Dreadnought engines.' },
  relic:     { name: 'Relic shard',   tier: 5, role: 'exotic',     price: 1800, color: '#ffd84a', blurb: 'A piece of an ancient machine. The best parts in the galaxy need it.' },
};
/** Material tier for a danger level (1-10). */
export const matTier = danger => Math.max(1, Math.min(5, Math.ceil((danger || 1) / 2)));
/** The material of a role at a tier. */
export const matOf = (role, tier) => role === 'rock' ? 'rock' : Object.keys(MATERIALS).find(k => MATERIALS[k].role === role && MATERIALS[k].tier === Math.max(1, Math.min(5, tier)));
/** Old saves: materials that were folded into the new set. */
export const OLD_MATERIALS = { silicate: 'rock', ice: 'carbon', cuprite: 'cobalt', chitin: 'titanium', nanite: 'cobalt', lumen: 'diamond', basaltcore: 'titanium' };
export const MATERIAL_IDS = Object.keys(MATERIALS);

/**
 * Rarity ladder: drop colours, light beams, and `bonus` = how much a part's base stats are lifted
 * (sim/partstats.js). Play-test #38: legendary must clearly beat rare at the same tier.
 * `affixes` = how many rolled bonuses it carries; legendary and relic also roll a named power.
 */
export const RARITY = [
  { id: 'common',    name: 'Common',    color: '#c9ccd4', beam: 0,   bonus: 0,    affixes: 0, weight: 60 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#4dff7a', beam: 0.4, bonus: 0.12, affixes: 1, weight: 26 },
  { id: 'rare',      name: 'Rare',      color: '#4da6ff', beam: 0.7, bonus: 0.28, affixes: 2, weight: 10 },
  { id: 'epic',      name: 'Epic',      color: '#c45cff', beam: 1.0, bonus: 0.5,  affixes: 3, weight: 3.2 },
  { id: 'legendary', name: 'Legendary', color: '#ff9a1f', beam: 1.4, bonus: 0.85, affixes: 3, weight: 0.7 },
  { id: 'relic',     name: 'Relic',     color: '#ff3b5c', beam: 1.8, bonus: 1.25, affixes: 4, weight: 0.12 },
];
export const RARITY_BY_ID = Object.fromEntries(RARITY.map((r, i) => [r.id, { ...r, index: i }]));
