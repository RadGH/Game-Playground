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

/** Raw materials: mined, salvaged, looted, traded. `tier` = where it starts showing up. */
export const MATERIALS = {
  ferrite:   { name: 'Ferrite',        tier: 1, price: 6,    color: '#b07a5a', blurb: 'Iron-rich rock. Frames and plates.' },
  silicate:  { name: 'Silicate',       tier: 1, price: 5,    color: '#c8c0a8', blurb: 'Glassy sand. Ceramics and circuits.' },
  carbon:    { name: 'Carbon',         tier: 1, price: 7,    color: '#4a4a52', blurb: 'Soot and graphite. Composites.' },
  ice:       { name: 'Volatile ice',   tier: 1, price: 9,    color: '#a8e4ff', blurb: 'Frozen gas. Fuel and coolant.' },
  cuprite:   { name: 'Cuprite',        tier: 2, price: 16,   color: '#e0864a', blurb: 'Copper ore. Wiring and insulation.' },
  titanium:  { name: 'Titanium',       tier: 2, price: 28,   color: '#bfe3ff', blurb: 'Light and strong.' },
  cobalt:    { name: 'Cobalt',         tier: 3, price: 45,   color: '#4f7dff', blurb: 'Magnets, reactors, engines.' },
  quartz:    { name: 'Prism quartz',   tier: 3, price: 60,   color: '#ff9ef0', blurb: 'Laser lenses and shield emitters.' },
  iridium:   { name: 'Iridium',        tier: 4, price: 110,  color: '#8fa6c9', blurb: 'Heavy armour and capital frames.' },
  helium3:   { name: 'Helium-3',       tier: 4, price: 95,   color: '#ffe680', blurb: 'Gas-giant fuel for big reactors.' },
  exotic:    { name: 'Exotic matter',  tier: 5, price: 260,  color: '#ff5fd2', blurb: 'Strange stuff. Jump drives and relics.' },
  neutronium:{ name: 'Neutronium',     tier: 6, price: 520,  color: '#ffe7a8', blurb: 'Collapsed-star matter. The heaviest armour.' },
  // alien-only drops (no crew comes from aliens; these instead)
  chitin:    { name: 'Chitin shell',   tier: 2, price: 40,   color: '#9bd36a', blurb: 'From the Vesh hive. Living armour.', alien: true },
  nanite:    { name: 'Nanite paste',   tier: 2, price: 55,   color: '#7fe6ff', blurb: 'From Lattice drones. Self-repair parts.', alien: true },
  lumen:     { name: 'Lumen shard',    tier: 3, price: 80,   color: '#ffb8f4', blurb: 'Ossari crystal. Focuses light.', alien: true },
  basaltcore:{ name: 'Forge basalt',   tier: 3, price: 70,   color: '#c07a50', blurb: 'Kharr heat-stone. Plasma weapons.', alien: true },
  relic:     { name: 'Relic core',     tier: 5, price: 600,  color: '#ffd84a', blurb: 'An ancient machine heart. Research.', alien: true },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

/** Rarity ladder: drop colours, light beams, stat bonuses. */
export const RARITY = [
  { id: 'common',    name: 'Common',    color: '#c9ccd4', beam: 0,   bonus: 0,    weight: 60 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#4dff7a', beam: 0.4, bonus: 0.08, weight: 26 },
  { id: 'rare',      name: 'Rare',      color: '#4da6ff', beam: 0.7, bonus: 0.16, weight: 10 },
  { id: 'epic',      name: 'Epic',      color: '#c45cff', beam: 1.0, bonus: 0.26, weight: 3.2 },
  { id: 'legendary', name: 'Legendary', color: '#ff9a1f', beam: 1.4, bonus: 0.40, weight: 0.7 },
  { id: 'relic',     name: 'Relic',     color: '#ff3b5c', beam: 1.8, bonus: 0.60, weight: 0.12 },
];
export const RARITY_BY_ID = Object.fromEntries(RARITY.map((r, i) => [r.id, { ...r, index: i }]));
