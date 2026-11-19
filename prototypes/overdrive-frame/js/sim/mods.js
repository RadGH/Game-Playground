// Part mods (round 7 — owner: "all the parts are just very minor number differences … I would like to see modifiers
// that change them functionally: bigger blast radius, multiple projectiles, a different element"). A mod is a named
// line on a rolled item that changes HOW the part works, not just a number: a rifle that fires three shots, a mortar
// whose shells leave a gravity well, a core that shocks what touches it.
//
// Weapon mods change the weapon spec (loadout.js weaponSpec calls applyWeaponMods after the part's own numbers and
// after weapon-kinds.js); the spec fields they set are the round 7 contract in docs/R7.md, made real by weapons.js /
// mission.js. Frame mods add a rule to the mech's stats (st.rules) that perks.js runs in the mission.
// Pure data + functions: the co-op server reads the same table, so a mod id is all that travels.

/** Which weapon kinds a mod fits (spec.kind after weaponSpec). */
const SHOOTS = new Set(['bullet', 'pellets']);
const THROWS = new Set(['bullet', 'pellets', 'plasma', 'lob', 'missile']);
const HURTS = s => s.dmg > 0 && !['repair', 'shield', 'deploy'].includes(s.kind);
const BLASTS = s => (s.splash || 0) > 0 && HURTS(s);

/**
 * Weapon mods. text = what the item card prints (numbers and units — lessons rule 3). fits(spec) = which weapons can
 * roll it; apply(spec) = the change (spec is a fresh object per weapon).
 */
export const WEAPON_MODS = [
  { id: 'split', name: 'Split Barrel', text: 'Fires 3 projectiles side by side (2 more missiles per salvo) at 45% damage each',
    fits: s => THROWS.has(s.kind), apply: s => { if (s.kind === 'missile') { s.count += 2; s.dmg *= 0.75; } else { s.count = (s.count || 1) * 3; s.dmg *= 0.45; s.spread = Math.max(s.spread, 0.16); } } },
  { id: 'wide', name: 'Wide Blast', text: '+60% blast radius',
    fits: BLASTS, apply: s => { s.splash *= 1.6; } },
  { id: 'burst', name: 'Burst Rounds', text: 'Every shot bursts where it lands (7 m blast)',
    fits: s => (SHOOTS.has(s.kind) || s.kind === 'rail') && !(s.splash > 0), apply: s => { s.splash = 0.45; } },
  { id: 'incendiary', name: 'Incendiary', text: 'Deals fire damage; 40% chance to set the target burning',
    fits: s => HURTS(s) && s.dtype !== 'fire', apply: s => { s.dtype = 'fire'; s.status = Math.max(s.status || 0, 0.4); } },
  { id: 'arc', name: 'Arc Charge', text: 'Deals electric damage; 30% chance to shock the target still',
    fits: s => HURTS(s) && s.dtype !== 'electric', apply: s => { s.dtype = 'electric'; s.status = Math.max(s.status || 0, 0.3); } },
  { id: 'cryo', name: 'Cryo Core', text: 'Deals cryo damage; 45% chance to chill (3 chills freeze the target solid)',
    fits: s => HURTS(s) && s.dtype !== 'cryo', apply: s => { s.dtype = 'cryo'; s.status = Math.max(s.status || 0, 0.45); } },
  { id: 'void', name: 'Void Lens', text: 'Deals void damage: ignores armour and resistances, tugs targets toward the hit (−10% damage)',
    fits: s => HURTS(s) && s.dtype !== 'void', apply: s => { s.dtype = 'void'; s.dmg *= 0.9; s.status = Math.max(s.status || 0, 0.35); } },
  { id: 'ricochet', name: 'Ricochet', text: 'Shots that hit bounce on to 2 more enemies',
    fits: s => SHOOTS.has(s.kind), apply: s => { s.ricochet = (s.ricochet || 0) + 2; } },
  { id: 'coupler', name: 'Arc Coupler', text: '25% of hits spark lightning to 2 enemies nearby',
    fits: s => HURTS(s) && s.kind !== 'chain', apply: s => { s.chainOnHit = { jumps: 2, chance: 0.25 }; } },
  { id: 'pierce', name: 'Penetrator', text: 'Shots go through 3 enemies',
    fits: s => SHOOTS.has(s.kind) && !(s.pierce >= 3), apply: s => { s.pierce = (s.pierce || 0) + 3; } },
  { id: 'seek', name: 'Seeker Rounds', text: 'Shots curve toward the nearest enemy in front',
    fits: s => SHOOTS.has(s.kind), apply: s => { s.seek = 2.5; } },
  { id: 'echo', name: 'Echo Chamber', text: 'Every shot fires again 0.3 s later at 50% damage',
    fits: s => HURTS(s) && s.kind !== 'blade' && !s.charge, apply: s => { s.echo = 0.5; } },
  { id: 'vortex', name: 'Gravity Core', text: 'Blasts leave a gravity well for 1.5 s that drags enemies in',
    fits: BLASTS, apply: s => { s.vortex = { r: Math.max(1.2, s.splash * 1.6), t: 1.5, pull: 3 }; } },
  { id: 'cluster', name: 'Cluster Payload', text: 'Blasts throw 4 bomblets (35% damage each)',
    fits: BLASTS, apply: s => { s.cluster = 4; } },
  { id: 'napalm', name: 'Napalm Fill', text: 'Blasts leave burning ground for 4 s',
    fits: BLASTS, apply: s => { s.napalm = 4; } },
  { id: 'leech', name: 'Siphon', text: '3% of damage dealt repairs your armour',
    fits: HURTS, apply: s => { s.leech = 0.03; } },
  { id: 'overkill', name: 'Overkill Charge', text: 'Kills burst for 40% of the killing hit (13 m blast)',
    fits: HURTS, apply: s => { s.overkill = 0.4; } },
  { id: 'rapid', name: 'Rapid Cycle', text: 'Fires 40% faster, each hit 20% weaker',
    fits: s => HURTS(s) && s.rate > 0 && !s.charge && s.kind !== 'deploy', apply: s => { s.rate *= 1.4; s.dmg *= 0.8; } },
  { id: 'slug', name: 'Heavy Slug', text: '2.2× damage per shot, fires at 55% the rate, knocks targets back',
    fits: s => SHOOTS.has(s.kind) && !s.charge, apply: s => { s.dmg *= 2.2; s.rate *= 0.55; s.knock = Math.max(s.knock || 0, 3); } },
];

/**
 * Frame mods: a rule for perks.js (st.rules[rule] = the value). slots = which parts can roll it. text states numbers.
 * Values are the ones perks.js reads (one place each — lessons rule 33).
 */
export const FRAME_MODS = [
  { id: 'afterburner', name: 'Afterburner', slots: ['booster'], rule: 'afterburner', value: 1, text: 'Quick boosts leave a trail of fire that burns enemies for 3 s' },
  { id: 'phase', name: 'Phase Dash', slots: ['booster'], rule: 'phase', value: 0.35, text: 'Nothing can hurt you for 0.35 s at the start of each quick boost' },
  { id: 'shockland', name: 'Shock Landing', slots: ['legs'], rule: 'shockland', value: 1, text: 'Landing from a jump shocks enemies within 32 m and knocks them back' },
  { id: 'anchor', name: 'Anchor Struts', slots: ['legs'], rule: 'anchor', value: 0.25, text: 'Standing still for 1 s: +25% damage until you move' },
  { id: 'reactive', name: 'Reactive Plate', slots: ['core', 'arms'], rule: 'reactive', value: 8, text: 'Blocks one hit completely every 8 s' },
  { id: 'static', name: 'Static Shell', slots: ['core'], rule: 'static', value: 1, text: 'Enemies touching your frame take 120 electric damage a second' },
  { id: 'nanite', name: 'Nanite Weave', slots: ['core', 'head'], rule: 'nanite', value: 0.012, text: 'Repairs 1.2% armour a second after 4 s without being hit' },
  { id: 'dynamo', name: 'Kinetic Dynamo', slots: ['generator'], rule: 'dynamo', value: 3, text: 'Every 100 damage you take refills 3 energy' },
  { id: 'capacitor', name: 'Spill Capacitor', slots: ['generator'], rule: 'capacitor', value: 0.5, text: 'With a full energy bar, shots deal +50% damage' },
  { id: 'vent', name: 'Thermal Vent', slots: ['cooling'], rule: 'vent', value: 1, text: 'Overheating blasts fire around you (48 m) and dumps 40% of the heat' },
  { id: 'painter', name: 'Target Painter', slots: ['cpu', 'head'], rule: 'painter', value: 0.2, text: 'Enemies you lock on to or ping take 20% more damage from everyone' },
  { id: 'twinlock', name: 'Twin Lock', slots: ['cpu'], rule: 'twinlock', value: 1, text: 'Homing weapons lock two targets at once' },
  { id: 'fieldkit', name: 'Field Kit', slots: ['head', 'core', 'arms', 'legs'], rule: 'kitCharges', value: 1, text: '+1 repair kit charge' },
  { id: 'brawler', name: 'Brawler Servos', slots: ['arms'], rule: 'brawler', value: 1, text: 'Melee hits knock enemies flying and shock them' },
];

export const MODS = [...WEAPON_MODS, ...FRAME_MODS];
export const MOD_BY_ID = Object.fromEntries(MODS.map(m => [m.id, m]));
const FRAME_BY_ID = Object.fromEntries(FRAME_MODS.map(m => [m.id, m]));

/** How many mods an item of a rarity carries: [chance of the first, chance of the second]. Refined sometimes, Rare and
 *  up always one, Experimental two. */
export const MOD_COUNT = { common: [0, 0], refined: [0.35, 0], rare: [1, 0], prototype: [1, 0.35], experimental: [1, 1] };

/** The mods this part could roll. specOf(part) gives a weapon's plain spec (loadout.weaponSpec without mods). */
export function modPool(part, specOf) {
  if (part.slot === 'weapon') { const s = specOf(part); return WEAPON_MODS.filter(m => m.fits(s)); }
  return FRAME_MODS.filter(m => m.slots.includes(part.slot));
}

/** Roll an item's mods (R = makeRng stream). Returns ids. */
export function rollMods(R, part, rarity, specOf) {
  const [a, b] = MOD_COUNT[rarity] || [0, 0];
  const pool = modPool(part, specOf).slice(), out = [];
  for (const chance of [a, b]) {
    if (!pool.length || R.next() >= chance) break;
    out.push(pool.splice(Math.floor(R.next() * pool.length), 1)[0].id);
  }
  return out;
}

/** A weapon item's (and the frame's global) mods applied to a spec. Unknown ids (old saves, a newer client) are skipped. */
export function applyWeaponMods(spec, ids) {
  for (const id of ids || []) {
    const m = MOD_BY_ID[id]; if (!m?.apply) continue;
    if (!m.fits(spec) || spec.mods?.includes(id)) continue;   // a global mod (tuning, a set bonus) only touches weapons it fits, once
    m.apply(spec); (spec.mods ||= []).push(id);
  }
  return spec;
}

/** Frame items' mods → rules on the stats (values add up: two Field Kits = +2 charges). */
export function frameRules(items) {
  const rules = {};
  for (const it of items) for (const id of it?.mods || []) { const m = FRAME_BY_ID[id]; if (m) rules[m.rule] = (rules[m.rule] || 0) + m.value; }
  return rules;
}

export const modText = id => MOD_BY_ID[id] ? { name: MOD_BY_ID[id].name, text: MOD_BY_ID[id].text } : null;
