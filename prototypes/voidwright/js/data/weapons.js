// Every weapon and tool. A weapon block points at one of these by id.
//
// mode:
//   auto   — a turret: picks the nearest enemy inside its arc and range, fires on its own
//   pd     — point defence: shoots incoming missiles/drones first, then ships
//   manual — fires at the mouse / right stick while you hold Fire (arc limited)
//   fixed  — fires straight along the block's facing while you hold Fire
//   lock   — missiles: fire with the Missile button at the target nearest your aim
//   beam   — continuous manual beam while Fire is held
//   tool   — mining laser, harpoon, tractor (handled by their own code)
//
// proj (what the shot is, which decides how it moves and how it is drawn):
//   bolt, bullet, slug, shell, rail, missile, rocket, torpedo, plasma, arc, beam, flak, mine, pulse, lance
//
// size = hit size (s/m/l) for armour flat reduction. arc = default turret arc in degrees.
// recoil = how far (in cells) the barrel kicks back when it fires (cosmetic).

export const WEAPONS = {
  // ---------------- light (1x1) ----------------
  pulse_laser: { name: 'Pulse Laser', dmg: 9, type: 'laser', size: 's', mode: 'auto', proj: 'bolt', range: 520, rate: 3.2, speed: 1400, spread: 0.02, arc: 220, turn: 6, color: '#ff4f7a', recoil: 0.15, sound: 'laser_pulse', tier: 1, blurb: 'Rapid red bolts. The workhorse turret.' },
  gatling:     { name: 'Gatling Gun', dmg: 4, type: 'kinetic', size: 's', mode: 'auto', proj: 'bullet', range: 460, rate: 11, speed: 1100, spread: 0.07, arc: 200, turn: 7, color: '#ffd27a', recoil: 0.08, sound: 'gatling', tier: 1, shells: true, blurb: 'A hail of small rounds. Shreds light hulls, bounces off plate.' },
  autocannon:  { name: 'Autocannon', dmg: 15, type: 'kinetic', size: 'm', mode: 'auto', proj: 'shell', range: 600, rate: 1.6, speed: 950, spread: 0.03, arc: 200, turn: 4, color: '#ffbf5a', recoil: 0.35, sound: 'cannon_light', tier: 1, shells: true, blurb: 'Heavy rounds that punch through plate.' },
  scatter:     { name: 'Scatter Blaster', dmg: 4, type: 'plasma', size: 's', mode: 'manual', proj: 'plasma', range: 300, rate: 1.4, speed: 800, spread: 0.32, count: 7, arc: 120, turn: 9, color: '#5ff3ff', recoil: 0.4, sound: 'scatter', tier: 1, blurb: 'A close-range cone of plasma pellets.' },
  mass_driver: { name: 'Mass Driver', dmg: 34, type: 'kinetic', size: 'l', mode: 'fixed', proj: 'slug', range: 820, rate: 0.6, speed: 1600, spread: 0.005, arc: 12, turn: 3, color: '#fff2c4', recoil: 0.7, sound: 'mass_driver', tier: 1, pierce: 2, blurb: 'Forward-fixed slug thrower. Aim with your ship.' },
  rocket_pod:  { name: 'Rocket Pod', dmg: 14, type: 'explosive', size: 'm', mode: 'manual', proj: 'rocket', range: 640, rate: 0.7, speed: 620, spread: 0.12, count: 4, burst: 0.07, arc: 100, turn: 5, color: '#ff8a2a', recoil: 0.3, splash: 34, sound: 'rocket', tier: 1, blurb: 'Dumb-fire rocket salvo toward your aim.' },
  missile_rack:{ name: 'Homing Missiles', dmg: 22, type: 'explosive', size: 'm', mode: 'lock', proj: 'missile', range: 1000, rate: 0.45, speed: 520, spread: 0.6, count: 2, burst: 0.18, arc: 360, turn: 2, homing: 3.2, color: '#ff6a3a', recoil: 0.2, splash: 40, sound: 'missile', tier: 1, blurb: 'Locks onto the target nearest your aim and chases it.' },
  beam_laser:  { name: 'Focus Beam', dmg: 34, type: 'laser', size: 'm', mode: 'beam', proj: 'beam', range: 560, rate: 0, arc: 160, turn: 2.6, color: '#ff3366', heat: 1.0, sound: 'beam', tier: 2, blurb: 'Hold Fire for a continuous beam that sweeps where you aim. Damage per second.' },
  arc_caster:  { name: 'Arc Caster', dmg: 9, type: 'lightning', size: 's', mode: 'auto', proj: 'arc', range: 330, rate: 1.4, chain: 3, chainRange: 170, arc: 260, turn: 8, color: '#b48cff', shieldMult: 2.2, recoil: 0.1, sound: 'arc', tier: 2, blurb: 'Lightning that leaps to up to 3 more targets. Tears shields apart.' },
  flak:        { name: 'Flak Burster', dmg: 5, type: 'explosive', size: 's', mode: 'pd', proj: 'flak', range: 420, rate: 2.2, speed: 900, spread: 0.05, arc: 240, turn: 7, color: '#ffc36b', splash: 46, recoil: 0.25, sound: 'flak', tier: 2, blurb: 'Air-burst shells. Shoots down missiles and drones first.' },
  pd_laser:    { name: 'Point-Defence Laser', dmg: 3, type: 'laser', size: 's', mode: 'pd', proj: 'pulse', range: 300, rate: 6, speed: 2400, arc: 300, turn: 14, color: '#ff9db8', recoil: 0.04, sound: 'pd', tier: 2, blurb: 'Tiny fast laser that picks missiles out of the sky.' },
  plasma_cannon:{ name: 'Plasma Cannon', dmg: 30, type: 'plasma', size: 'm', mode: 'manual', proj: 'plasma', range: 560, rate: 0.8, speed: 620, spread: 0.02, arc: 140, turn: 3.2, color: '#38e8ff', splash: 26, burn: 6, recoil: 0.5, sound: 'plasma', tier: 2, blurb: 'Slow globs of plasma that splash and keep burning.' },
  railgun:     { name: 'Railgun', dmg: 70, type: 'kinetic', size: 'l', mode: 'manual', proj: 'rail', range: 1300, rate: 0.35, arc: 70, turn: 1.6, color: '#9fd8ff', pierce: 6, recoil: 0.8, sound: 'rail', tier: 3, blurb: 'Instant line through everything in its path. Slow to reload.' },
  mine_layer:  { name: 'Mine Layer', dmg: 50, type: 'explosive', size: 'l', mode: 'fixed', proj: 'mine', range: 200, rate: 0.5, speed: 60, arc: 360, turn: 0, color: '#ff5050', splash: 70, sound: 'mine', tier: 2, rear: true, blurb: 'Drops proximity mines behind you while you hold Fire.' },
  ion_pulse:   { name: 'Ion Pulse', dmg: 8, type: 'lightning', size: 'm', mode: 'manual', proj: 'pulse', range: 480, rate: 0.9, speed: 1100, arc: 140, turn: 4, color: '#8fb4ff', emp: 1.6, shieldMult: 3, recoil: 0.2, sound: 'ion', tier: 3, blurb: 'Knocks out the target\'s weapons and engines for a moment.' },
  tesla_coil:  { name: 'Tesla Coil', dmg: 14, type: 'lightning', size: 'm', mode: 'auto', proj: 'arc', range: 240, rate: 1.0, chain: 5, chainRange: 140, arc: 360, turn: 99, color: '#d7b4ff', shieldMult: 2, recoil: 0, sound: 'tesla', tier: 3, blurb: 'Zaps everything around your ship in a web of lightning.' },
  // ---------------- medium (2x2, frigate class and up) ----------------
  heavy_laser: { name: 'Heavy Laser Turret', dmg: 46, type: 'laser', size: 'm', mode: 'auto', proj: 'bolt', range: 760, rate: 1.6, speed: 1700, spread: 0.01, arc: 220, turn: 3, color: '#ff3a6a', recoil: 0.3, sound: 'laser_heavy', count: 2, burst: 0.12, tier: 3, bsize: 2, blurb: 'Twin long-range laser bolts.' },
  flak_battery:{ name: 'Flak Battery', dmg: 14, type: 'explosive', size: 's', mode: 'pd', proj: 'flak', range: 560, rate: 4, speed: 1000, spread: 0.06, arc: 260, turn: 6, color: '#ffc36b', splash: 60, recoil: 0.2, sound: 'flak', tier: 3, bsize: 2, blurb: 'Fills the sky with bursts. Missiles and fighters beware.' },
  howitzer:    { name: 'Howitzer', dmg: 160, type: 'kinetic', size: 'l', mode: 'auto', proj: 'shell', range: 900, rate: 0.9, speed: 800, spread: 0.02, arc: 200, turn: 1.6, color: '#ffcf80', splash: 40, recoil: 0.7, sound: 'cannon_heavy', tier: 3, bsize: 2, shells: true, blurb: 'Big explosive shells for big targets.' },
  plasma_lance:{ name: 'Plasma Lance', dmg: 180, type: 'plasma', size: 'l', mode: 'beam', proj: 'beam', range: 700, rate: 0, arc: 120, turn: 1.4, color: '#40f0ff', burn: 10, sound: 'beam_heavy', tier: 4, bsize: 2, blurb: 'A hosed stream of plasma. Damage per second.' },
  swarm_pod:   { name: 'Swarm Missile Pod', dmg: 22, type: 'explosive', size: 's', mode: 'lock', proj: 'missile', range: 1100, rate: 0.7, speed: 600, spread: 1.2, count: 8, burst: 0.06, arc: 360, turn: 2, homing: 4.5, color: '#ff8a5a', splash: 28, recoil: 0.15, sound: 'missile', tier: 3, bsize: 2, blurb: 'Eight little missiles that weave in.' },
  // ---------------- capital (4x4, cruiser and up) ----------------
  siege_cannon:{ name: 'Siege Cannon', dmg: 900, type: 'kinetic', size: 'l', mode: 'auto', proj: 'shell', range: 1400, rate: 0.7, speed: 1100, spread: 0.01, arc: 180, turn: 0.7, color: '#ffe0a0', splash: 90, recoil: 1.2, sound: 'siege', tier: 5, bsize: 4, shells: true, blurb: 'A capital gun. One shell erases a fighter.' },
  lance_battery:{ name: 'Annihilator Lance', dmg: 2400, type: 'laser', size: 'l', mode: 'manual', proj: 'lance', range: 1800, rate: 0.25, arc: 90, turn: 0.6, color: '#ff2050', pierce: 99, recoil: 1.0, sound: 'lance', tier: 5, bsize: 4, blurb: 'Charges, then fires a laser across the whole screen.' },
  torpedo_tube:{ name: 'Torpedo Tube', dmg: 3000, type: 'explosive', size: 'l', mode: 'lock', proj: 'torpedo', range: 1800, rate: 0.2, speed: 340, spread: 0.2, arc: 360, turn: 1, homing: 1.1, color: '#ff4020', splash: 160, recoil: 0.5, sound: 'torpedo', tier: 5, bsize: 4, blurb: 'Slow, huge, can be shot down. Ends battleships.' },
  storm_spire: { name: 'Storm Spire', dmg: 170, type: 'lightning', size: 'l', mode: 'auto', proj: 'arc', range: 600, rate: 1.2, chain: 8, chainRange: 260, arc: 360, turn: 99, color: '#c8a0ff', shieldMult: 2.4, sound: 'tesla', tier: 5, bsize: 4, blurb: 'A capital lightning tower that chains through whole squadrons.' },
  // ---------------- tools ----------------
  mining_laser:{ name: 'Mining Laser', dmg: 14, type: 'laser', size: 's', mode: 'tool', tool: 'mine', proj: 'beam', range: 300, arc: 200, turn: 5, color: '#7dff9a', sound: 'mining', tier: 1, mineMult: 7, blurb: 'Hold Fire on asteroids or a planet surface to cut ore. Weak against ships.' },
  big_mining_laser:{ name: 'Strip Miner', dmg: 70, type: 'laser', size: 'm', mode: 'tool', tool: 'mine', proj: 'beam', range: 480, arc: 200, turn: 3, color: '#9dffb0', sound: 'mining', tier: 3, bsize: 2, mineMult: 6, blurb: 'Industrial cutter for big rocks.' },
  harpoon:     { name: 'Harpoon', dmg: 10, type: 'kinetic', size: 'm', mode: 'tool', tool: 'harpoon', proj: 'harpoon', range: 520, speed: 900, arc: 220, turn: 6, color: '#d0d8e0', sound: 'harpoon', tier: 1, pull: 1.0, blurb: 'Press Harpoon to spear something, again to let go. Drag rocks and ships around.' },
  tractor:     { name: 'Tractor Beam', dmg: 0, type: 'lightning', size: 's', mode: 'tool', tool: 'tractor', proj: 'beam', range: 380, arc: 360, turn: 99, color: '#7fd0ff', sound: 'tractor', tier: 2, blurb: 'Pulls loot and ore to you from further away.' },
};

/** Alien weapons — only on alien ships, and as rare drops from them. */
export const ALIEN_WEAPONS = {
  acid_spitter: { name: 'Acid Spitter', dmg: 9, type: 'plasma', size: 's', mode: 'auto', proj: 'plasma', range: 380, rate: 1.8, speed: 560, spread: 0.08, arc: 240, turn: 6, color: '#a6ff4a', burn: 4, recoil: 0.2, sound: 'acid', tier: 2, race: 'vesh', blurb: 'Vesh bio-weapon: globs of burning acid.' },
  spore_launcher:{ name: 'Spore Launcher', dmg: 16, type: 'explosive', size: 'm', mode: 'lock', proj: 'missile', range: 800, rate: 0.5, speed: 380, spread: 1.0, count: 3, burst: 0.2, arc: 360, turn: 2, homing: 2.4, color: '#c8ff6a', splash: 50, burn: 3, recoil: 0.1, sound: 'spore', tier: 2, race: 'vesh', blurb: 'Living seekers that burst into acid.' },
  lattice_arc:  { name: 'Lattice Arc Node', dmg: 7, type: 'lightning', size: 's', mode: 'auto', proj: 'arc', range: 300, rate: 2.0, chain: 4, chainRange: 150, arc: 360, turn: 99, color: '#7fe6ff', shieldMult: 2.4, sound: 'arc', tier: 2, race: 'lattice', blurb: 'Machine lightning. Hits everything in reach.' },
  disassembler: { name: 'Disassembler Ray', dmg: 26, type: 'lightning', size: 'm', mode: 'beam', proj: 'beam', range: 420, arc: 160, turn: 2.4, color: '#5fe0ff', emp: 0.5, sound: 'beam', tier: 3, race: 'lattice', blurb: 'A cyan ray that unpicks ships block by block.' },
  prism_lance:  { name: 'Prism Lance', dmg: 22, type: 'laser', size: 'm', mode: 'auto', proj: 'bolt', range: 700, rate: 1.2, speed: 2000, spread: 0.0, arc: 220, turn: 4, color: '#ff9ef0', pierce: 2, recoil: 0.2, sound: 'prism', tier: 3, race: 'ossari', blurb: 'Ossari crystal lance. Splits light through targets.' },
  refractor:    { name: 'Refractor Beam', dmg: 44, type: 'laser', size: 'l', mode: 'beam', proj: 'beam', range: 620, arc: 140, turn: 2, color: '#ffc8ff', sound: 'beam_heavy', tier: 4, race: 'ossari', blurb: 'A rainbow beam that burns hotter the longer it holds.' },
  magma_mortar: { name: 'Magma Mortar', dmg: 40, type: 'plasma', size: 'l', mode: 'auto', proj: 'plasma', range: 700, rate: 0.6, speed: 520, spread: 0.05, arc: 220, turn: 2.2, color: '#ff7a2a', splash: 60, burn: 8, recoil: 0.6, sound: 'plasma', tier: 3, race: 'kharr', blurb: 'Kharr lobs of molten rock.' },
  acid_geyser:  { name: 'Acid Geyser', dmg: 110, type: 'plasma', size: 'l', mode: 'auto', proj: 'plasma', range: 800, rate: 0.8, speed: 600, spread: 0.35, count: 6, arc: 240, turn: 1.2, color: '#b6ff3a', splash: 50, burn: 12, recoil: 0.6, sound: 'acid', tier: 5, bsize: 4, race: 'vesh', blurb: 'A Vesh capital organ that sprays burning acid in a fan.' },
  brood_lance:  { name: 'Brood Lance', dmg: 70, type: 'plasma', size: 'm', mode: 'auto', proj: 'plasma', range: 600, rate: 1.0, speed: 700, spread: 0.08, count: 2, arc: 220, turn: 2, color: '#c8ff6a', splash: 24, burn: 6, recoil: 0.4, sound: 'acid', tier: 3, bsize: 2, race: 'vesh', blurb: 'Twin bio-cannons grown into a hull.' },
  prism_array:  { name: 'Prism Array', dmg: 60, type: 'laser', size: 'm', mode: 'auto', proj: 'bolt', range: 760, rate: 1.4, speed: 2000, spread: 0.03, count: 2, arc: 220, turn: 3, color: '#ffb0f8', pierce: 2, recoil: 0.3, sound: 'prism', tier: 3, bsize: 2, race: 'ossari', blurb: 'Paired crystal lances that pierce.' },
  forge_battery:{ name: 'Forge Battery', dmg: 420, type: 'kinetic', size: 'l', mode: 'auto', proj: 'slug', range: 1100, rate: 0.6, speed: 1300, spread: 0.01, count: 2, burst: 0.2, arc: 160, turn: 0.8, color: '#ffb070', pierce: 3, recoil: 1.0, sound: 'mass_driver', tier: 5, bsize: 4, race: 'kharr', blurb: 'Two red-hot basalt rails on a capital mount.' },
  lattice_web:  { name: 'Lattice Web', dmg: 40, type: 'lightning', size: 'm', mode: 'auto', proj: 'arc', range: 420, rate: 1.4, chain: 5, chainRange: 200, arc: 360, turn: 99, color: '#7fe6ff', shieldMult: 2.4, sound: 'tesla', tier: 3, bsize: 2, race: 'lattice', blurb: 'A node that nets nearby ships in lightning.' },
  forge_hammer: { name: 'Forge Hammer', dmg: 120, type: 'kinetic', size: 'l', mode: 'fixed', proj: 'slug', range: 900, rate: 0.35, speed: 1300, spread: 0, arc: 14, turn: 2, color: '#ffb070', pierce: 3, recoil: 1.0, sound: 'mass_driver', tier: 4, race: 'kharr', blurb: 'A rail of red-hot basalt fired dead ahead.' },
};

export const ALL_WEAPONS = { ...WEAPONS, ...ALIEN_WEAPONS };
for (const [id, w] of Object.entries(ALL_WEAPONS)) { w.id = id; w.bsize ??= 1; w.count ??= 1; w.spread ??= 0; w.pierce ??= 0; }

/** Damage per second, for cards and balance tests. */
export function dps(w) {
  if (w.mode === 'beam' || w.proj === 'beam') return w.dmg;
  return w.dmg * (w.count || 1) * (w.rate || 0) * (w.chain ? 1 + w.chain * 0.6 : 1);
}
