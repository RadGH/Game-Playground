// Named uniques (owner ruling E4, 2026-11-12): hand-made legendary parts with fixed names and stacked powers.
// Each is found only in certain places (`from`); the parts hold keeps a collection log (ui/hold.js).
// Powers are the same keys loot.js POWERS uses (the sim already reads them), several at once — no unique
// needs its own code path. `mods` are fixed, not rolled.
//
// from: boss | stronghold | treasure | vault | wanted | nest | derelict | cache | deep (danger 7+ anywhere)

export const UNIQUES = [
  { id: 'widowmaker', name: 'Widowmaker', block: 'gatling', from: 'boss', where: 'a roaming giant', mods: { dmg: 0.45, rate: 0.35, chain: 1, burn: 1 }, power: 'Every bullet arcs to another target and sets it burning.' },
  { id: 'dawnbreaker', name: 'Dawnbreaker', block: 'pulse_laser', from: 'wanted', where: 'a wanted captain', mods: { dmg: 0.5, range: 0.3, pierce: 1, twin: 1 }, power: 'Twin bolts that punch through two extra blocks.' },
  { id: 'gravedigger', name: 'Gravedigger', block: 'mining_laser_2', from: 'treasure', where: 'a treasure system', mods: { dmg: 0.8, range: 0.3, motherlode: 1 }, power: 'Cuts rock at double speed and every ore cell drops double.' },
  { id: 'hearthstone', name: 'Hearthstone Core', block: 'reactor', from: 'cache', where: 'a sealed cache', mods: { output: 0.5, hp: 0.6, sun: 1 }, power: '+40% power on top of its bonus, and it never explodes.' },
  { id: 'nine_lives', name: 'Nine Lives', block: 'shield_bubble', from: 'stronghold', where: 'a pirate stronghold', mods: { shield: 0.6, regen: 0.6, bulwark: 1 }, power: 'A bubble that refills four times as fast as a plain one.' },
  { id: 'old_faithful', name: 'Old Faithful', block: 'autocannon', from: 'derelict', where: 'a derelict station', mods: { dmg: 0.4, rate: 0.25, hp: 0.8, splash: 1 }, power: 'Shells burst over a much wider area.' },
  { id: 'quiet_mind', name: 'The Quiet Mind', block: 'cpu', from: 'cache', where: 'a sealed cache', mods: { cpu: 4, power: 0.5, hive: 1 }, power: 'A CPU node worth three.' },
  { id: 'long_haul', name: 'Long Haul', block: 'cargo_pod', from: 'vault', where: 'a pirate vault', mods: { cargo: 0.6, hp: 0.5, plenty: 1 }, power: 'A pod that holds more than twice its size.' },
  { id: 'cuttlefish', name: 'Cuttlefish', block: 'afterburner', from: 'wanted', where: 'a wanted captain', mods: { thrust: 0.5, turn: 0.4, overdrive: 1 }, power: 'Boost lasts longer and goes faster.' },
  { id: 'hornets_nest', name: "Hornet's Nest", block: 'rocket_pod', from: 'nest', where: 'an alien nest', mods: { dmg: 0.4, rate: 0.3, twin: 1, splash: 1 }, power: 'An extra rocket each volley, with bigger blasts.' },
  { id: 'sky_anchor', name: 'Sky Anchor', block: 'harpoon', from: 'derelict', where: 'a derelict station', mods: { range: 0.6, hp: 0.8 }, power: 'Reaches much further and almost never breaks.' },
  { id: 'saint_elmo', name: "Corposant", block: 'arc_caster', from: 'treasure', where: 'a treasure system', mods: { dmg: 0.5, range: 0.3, chain: 1, leech: 1 }, power: 'Lightning that jumps further and patches your hull.' },
  { id: 'watchtower', name: 'Watchtower', block: 'targeting', from: 'cache', where: 'a sealed cache', mods: { slots: 3, cpu: 2 }, power: 'Five automatic weapons from one small box.' },
  { id: 'iron_choir', name: 'Iron Choir', block: 'hab', from: 'vault', where: 'a pirate vault', mods: { crew: 4, hp: 0.6, commons: 1 }, power: 'Room for almost twice the crew.' },
  { id: 'red_harvest', name: 'Red Harvest', block: 'plasma_cannon', from: 'boss', where: 'a roaming giant', mods: { dmg: 0.6, rate: 0.3, burn: 1, leech: 1 }, power: 'Burning plasma that heals your hull as it hits.' },
  { id: 'patience', name: 'Patience', block: 'railgun', from: 'deep', where: 'a deep system (danger 7 or more)', mods: { dmg: 0.6, range: 0.3, pierce: 1 }, power: 'One slug through everything in a line.' },
  { id: 'lantern', name: 'Lantern', block: 'scanner_2', from: 'treasure', where: 'a treasure system', mods: { scan: 0.8, cpu: 2 }, power: 'Scans reach most of a system.' },
  { id: 'storm_crow', name: 'Storm Crow', block: 'tesla_coil', from: 'nest', where: 'an alien nest', mods: { dmg: 0.5, chain: 1, burn: 1 }, power: 'A coil whose arcs set everything they touch on fire.' },
  { id: 'kingfisher', name: 'Kingfisher', block: 'missile_rack', from: 'stronghold', where: 'a pirate stronghold', mods: { dmg: 0.5, rate: 0.4, twin: 1 }, power: 'Three missiles a volley instead of two.' },
  { id: 'cinder_wall', name: 'Bulwark of Ash', block: 'shield_arc', from: 'deep', where: 'a deep system (danger 7 or more)', mods: { shield: 0.9, regen: 0.4, bulwark: 1 }, power: 'A wall of light that barely notices hits.' },
];
export const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map(u => [u.id, u]));
