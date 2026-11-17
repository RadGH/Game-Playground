// The R&D tree (owner 2026-11-17: "Let's add an R&D tab … where you can spend materials to upgrade or purchase new
// tech, and make the comms center upgrades an alternate, cheaper way to unlock recipes"). Plain data: research.js runs
// the rules, ships.js turns every `merchant` tech into a good passing merchants sell (cheaper, no wait, but only when
// one passes overhead). The Mk turret parts and blueprints merchants sold before 2026-11-17 are the SAME ids here, so
// owning one either way is owning the tech.
//
// Fields: id, branch (city | defence | build | policy), tier (1–3, the column), name, what (one line with numbers),
// cost { credits, metal, stone, crystal, steel, concrete, cells }, days (game days at 1× — a day is 6 s), needs [ids],
// from (lowest milestone), effect { key: multiplier } (research.js effect()), unlocks [catalog ids] (buildings this
// tech opens), early { id: milestone } (buildings this tech opens before their milestone), merchant (merchants may
// sell it), policy { upkeep: credits a month, effect } (researched, then switched on/off in R&D).

export const BRANCHES = [
  { id: 'city', name: 'City', blurb: 'Better pumps, plants, drills and refineries; cheaper upkeep.' },
  { id: 'defence', name: 'Defence', blurb: 'Turret Mk II / Mk III refits, tougher walls, longer reach.' },
  { id: 'build', name: 'Buildings', blurb: 'New parks and plazas, and building plans ahead of their milestone.' },
  { id: 'policy', name: 'Policies', blurb: 'City rules you switch on and off; each costs credits a month while on.' },
];

const T = (id, branch, tier, name, what, cost, days, more = {}) => ({ id, branch, tier, name, what, cost, days, needs: [], from: 0, merchant: true, ...more });

export const TECHS = [
  // ------------------------------------------------ city upgrades
  T('rd-pumps', 'city', 1, 'Pressure Pumps', 'Water Pumps pump 25% more (80 → 100 each).', { credits: 2500, metal: 60 }, 8, { effect: { water: 1.25 } }),
  T('rd-drills', 'city', 1, 'Deep-core Drills', 'Outposts mine 30% more a day.', { credits: 3000, metal: 50, stone: 40 }, 8, { effect: { mine: 1.3 } }),
  T('rd-grid', 'city', 2, 'Superconducting Grid', 'Fusion Plants make 20% more power (120 → 144).', { credits: 6000, steel: 40, crystal: 15 }, 14, { needs: ['rd-pumps'], from: 1, effect: { power: 1.2 } }),
  T('rd-catalyst', 'city', 2, 'Refinery Catalysts', 'Refineries turn out 25% more Steel, Concrete and Power cells.', { credits: 5000, steel: 30, crystal: 20 }, 14, { needs: ['rd-drills'], from: 1, effect: { refine: 1.25 } }),
  T('rd-upkeep', 'city', 3, 'Smart Maintenance', 'Every building\'s upkeep falls 10%.', { credits: 9000, steel: 30, concrete: 50 }, 20, { needs: ['rd-grid'], from: 2, effect: { upkeep: 0.9 } }),
  T('rd-cells', 'city', 3, 'Cell Storage Grid', 'Fusion Plants make another 15% more power.', { credits: 14000, steel: 60, cells: 40 }, 30, { needs: ['rd-grid'], from: 3, effect: { power: 1.15 } }),

  // ------------------------------------------------ defence (merchant Mk parts + blueprints, same ids)
  T('mk2-pulse', 'defence', 1, 'Pulse Gun Mk II', 'Every Pulse Gun, standing and new: 40% more damage.', { credits: 7000, metal: 80, steel: 20 }, 12, {}),
  T('bp-walls', 'defence', 1, 'Woven Walls', 'Every wall and gate, standing and new, is 25% tougher.', { credits: 8000, stone: 60, steel: 40 }, 14, { from: 1 }),
  T('bp-strike', 'defence', 1, 'Shell-spread', 'Orbital strikes hit a 20% wider circle.', { credits: 7000, crystal: 60 }, 12, { from: 1 }),
  T('mk2-mortar', 'defence', 2, 'Mortar Mk II', 'Every Mortar: 40% more damage.', { credits: 9000, metal: 60, steel: 30 }, 14, { from: 1 }),
  T('mk2-arc', 'defence', 2, 'Arc Coil Mk II', 'Every Arc Coil: 40% more damage.', { credits: 11000, steel: 40, crystal: 40 }, 16, { from: 2 }),
  T('bp-range', 'defence', 2, 'Range-finders', 'Every turret reaches 10% farther.', { credits: 10000, steel: 40, crystal: 60 }, 16, { needs: ['mk2-pulse'], from: 2 }),
  T('mk2-rail', 'defence', 2, 'Rail Lance Mk II', 'Every Rail Lance: 40% more damage.', { credits: 15000, steel: 60, crystal: 40 }, 18, { from: 3 }),
  T('mk3-pulse', 'defence', 3, 'Pulse Gun Mk III', 'Every Pulse Gun: twice Mk I damage and 15% more reach.', { credits: 16000, steel: 80, crystal: 100, cells: 10 }, 25, { needs: ['mk2-pulse'], from: 2 }),
  T('mk3-mortar', 'defence', 3, 'Mortar Mk III', 'Every Mortar: twice Mk I damage and 15% more reach.', { credits: 22000, steel: 80, crystal: 100, cells: 10 }, 28, { needs: ['mk2-mortar'], from: 3 }),
  T('mk3-arc', 'defence', 3, 'Arc Coil Mk III', 'Every Arc Coil: twice Mk I damage and 15% more reach.', { credits: 28000, steel: 100, crystal: 120, cells: 20 }, 30, { needs: ['mk2-arc'], from: 3 }),
  T('mk3-rail', 'defence', 3, 'Rail Lance Mk III', 'Every Rail Lance: twice Mk I damage and 15% more reach.', { credits: 36000, steel: 140, crystal: 150, cells: 30 }, 34, { needs: ['mk2-rail'], from: 4 }),

  // ------------------------------------------------ new buildings + plans ahead of their milestone
  T('rd-gardens', 'build', 1, 'Hydroponic Landscaping', 'Unlocks the Hydro Garden and Sky Terrace Gardens (Parks).', { credits: 3000, metal: 20, stone: 40 }, 8, { unlocks: ['pk-garden', 'pk-terrace'] }),
  T('rd-mortar', 'build', 1, 'Mortar Plans', 'Build Mortars from the start (normally milestone 1).', { credits: 2500, metal: 60 }, 8, { early: { 'tur-mortar': 0 } }),
  T('rd-neon', 'build', 2, 'Neon Light Art', 'Unlocks the Neon Night Plaza (Parks).', { credits: 5000, steel: 30, crystal: 15 }, 12, { from: 1, unlocks: ['pk-neon'] }),
  T('rd-plated', 'build', 2, 'Plate Forging', 'Build Plated Walls from milestone 1 (normally 2).', { credits: 4000, metal: 40, steel: 30 }, 10, { from: 1, early: { 'wall-2': 1 } }),
  T('rd-arc', 'build', 2, 'Arc Coil Plans', 'Build Arc Coils from milestone 1 (normally 2).', { credits: 6000, steel: 30, crystal: 30 }, 12, { needs: ['rd-mortar'], from: 1, early: { 'tur-arc': 1 } }),
  T('rd-fusion', 'build', 2, 'Large Fusion Plans', 'Build the large Fusion Plant from milestone 1 (normally 2).', { credits: 8000, steel: 40, crystal: 20 }, 14, { from: 1, early: { 'svc-power2': 1 } }),
  T('rd-biodome', 'build', 3, 'Sealed Biomes', 'Unlocks the Grand Biodome (Parks).', { credits: 15000, steel: 80, concrete: 60, cells: 20 }, 28, { needs: ['rd-gardens'], from: 3, unlocks: ['pk-biodome'] }),

  // ------------------------------------------------ policies (research once, then switch on or off)
  T('pol-green', 'policy', 1, 'Green City Charter', 'While on: parks and plazas lift land value 20% more.', { credits: 4000, stone: 40 }, 8,
    { merchant: false, policy: { upkeep: 60, effect: { parks: 1.2 } } }),
  T('pol-lean', 'policy', 1, 'Lean Budget', 'While on: all upkeep −8%, but 10% fewer newcomers.', { credits: 3000 }, 6,
    { merchant: false, policy: { upkeep: 0, effect: { upkeep: 0.92, appeal: 0.9 } } }),
  T('pol-open', 'policy', 2, 'Open Arrivals Campaign', 'While on: 15% more newcomers move in.', { credits: 6000, crystal: 20 }, 10,
    { merchant: false, from: 1, policy: { upkeep: 150, effect: { appeal: 1.15 } } }),
  T('pol-market', 'policy', 2, 'Night Market Licences', 'While on: the city wants 15% more shops and offices.', { credits: 5000, steel: 30 }, 10,
    { merchant: false, from: 1, needs: ['rd-neon'], policy: { upkeep: 120, effect: { demandC: 1.15 } } }),
];
export const TECH_BY_ID = Object.fromEntries(TECHS.map(t => [t.id, t]));
/** Material keys in display order, and their names. */
export const MATS = ['metal', 'stone', 'crystal', 'steel', 'concrete', 'cells'];
export const MAT_NAMES = { metal: 'Metal', stone: 'Stone', crystal: 'Crystal', steel: 'Steel', concrete: 'Concrete', cells: 'Power cells' };
