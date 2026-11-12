// Factions. Three human powers + four alien races (all names original).
//
// style: how the ship generator shapes their hulls.
//   armor   — the armour material their hulls use (decides what YOU should bring against them)
//   weapons — their weapon pool by size
//   colors  — hull tint, trim, light colour
// crew: true = their ships eject escape pods with people in them; aliens never do.
// drops: material ROLES their wrecks give (the material is that role at the system's tier — types.js matOf).
// rivals: hurting this faction pleases these (reputation, PLAN §0 #15).

export const FACTIONS = {
  guild: {
    name: 'Free Traders Guild', short: 'Guild', human: true, crew: true, hostile: false,
    blurb: 'Merchants and miners. They run most stations and pay for escorts.',
    rivals: ['redfang'], color: '#5fd0ff',
    style: { armor: ['steel', 'ceramic'], hull: '#4a6680', trim: '#9fd8ff', light: '#5fd0ff', shape: 'boxy',
      weapons: { s: ['pulse_laser', 'gatling', 'flak'], m: ['heavy_laser', 'flak_battery'], l: ['siege_cannon'] }, roles: ['trader', 'miner', 'escort'] },
    drops: ['structural', 'structural', 'energy'],
  },
  navy: {
    name: 'Concord Navy', short: 'Navy', human: true, crew: true, hostile: false,
    blurb: 'The law in the core systems. Heavy armour, big guns, long memories.',
    rivals: ['redfang', 'vesh'], color: '#7f9bff',
    style: { armor: ['steel', 'titanium', 'reactive'], hull: '#3c4a78', trim: '#c8d4ff', light: '#7f9bff', shape: 'wedge',
      weapons: { s: ['autocannon', 'pulse_laser', 'missile_rack', 'mass_driver'], m: ['heavy_laser', 'howitzer', 'swarm_pod'], l: ['siege_cannon', 'torpedo_tube', 'lance_battery'] }, roles: ['patrol', 'gunship', 'capital'] },
    drops: ['structural', 'energy', 'energy', 'exotic'],
  },
  redfang: {
    name: 'Redfang Corsairs', short: 'Corsairs', human: true, crew: true, hostile: true,
    blurb: 'Pirates. Fast, scrappy ships held together with rockets and grudges.',
    rivals: ['guild', 'navy'], color: '#ff5a4a',
    style: { armor: ['steel', 'frame', 'reactive'], hull: '#5a2a2a', trim: '#ff8a6a', light: '#ff5a4a', shape: 'jagged',
      weapons: { s: ['gatling', 'rocket_pod', 'scatter', 'autocannon', 'mass_driver'], m: ['howitzer', 'swarm_pod'], l: ['siege_cannon', 'torpedo_tube'] }, roles: ['swarm', 'gunship', 'brawler'] },
    drops: ['structural', 'energy', 'energy'],
  },
  vesh: {
    name: 'Vesh Hive', short: 'Vesh', human: false, crew: false, hostile: true,
    blurb: 'A living swarm. Their ships are grown, not built, and heal as they fight.',
    rivals: ['navy', 'ossari'], color: '#a6ff4a',
    style: { armor: ['chitin'], hull: '#3a5a22', trim: '#c8ff6a', light: '#a6ff4a', shape: 'organic',
      weapons: { s: ['acid_spitter'], m: ['spore_launcher', 'brood_lance'], l: ['acid_geyser'] }, roles: ['swarm', 'swarm', 'brawler'] },
    drops: ['structural', 'energy', 'exotic'], specimen: 'Vesh larva',
  },
  lattice: {
    name: 'The Lattice', short: 'Lattice', human: false, crew: false, hostile: true,
    blurb: 'Self-building machines with no makers left. Lightning, nanites and endless drones.',
    rivals: ['guild', 'kharr'], color: '#7fe6ff',
    style: { armor: ['lattice'], hull: '#20404a', trim: '#7fe6ff', light: '#7fe6ff', shape: 'grid',
      weapons: { s: ['lattice_arc', 'pd_laser'], m: ['disassembler', 'lattice_web'], l: ['storm_spire'] }, roles: ['swarm', 'gunship', 'carrier'] },
    drops: ['energy', 'energy', 'exotic'], specimen: 'Lattice logic shard',
  },
  ossari: {
    name: 'Ossari Choir', short: 'Ossari', human: false, crew: false, hostile: true,
    blurb: 'Crystal beings who sing in light. Their prism ships turn lasers aside.',
    rivals: ['vesh', 'redfang'], color: '#ff9ef0',
    style: { armor: ['prism'], hull: '#5a3a6a', trim: '#ffc8ff', light: '#ff9ef0', shape: 'crystal',
      weapons: { s: ['prism_lance', 'pulse_laser'], m: ['refractor', 'prism_array'], l: ['lance_battery'] }, roles: ['gunship', 'gunship', 'capital'] },
    drops: ['exotic', 'exotic', 'energy'], specimen: 'Singing crystal',
  },
  kharr: {
    name: 'Kharr Forgeclans', short: 'Kharr', human: false, crew: false, hostile: true,
    blurb: 'Slow, huge, volcanic. They fire molten rock and wear mountains for armour.',
    rivals: ['lattice', 'guild'], color: '#ff7a2a',
    style: { armor: ['basalt'], hull: '#4a2a1a', trim: '#ffb070', light: '#ff7a2a', shape: 'slab',
      weapons: { s: ['autocannon', 'magma_mortar'], m: ['forge_hammer', 'howitzer'], l: ['siege_cannon', 'forge_battery'] }, roles: ['brawler', 'capital', 'capital'] },
    drops: ['structural', 'structural', 'exotic'], specimen: 'Forge ember-stone',
  },
};
export const FACTION_IDS = Object.keys(FACTIONS);

/** Which factions show up at a danger tier (1 near the start, 10 at the far rim). */
export function factionsForTier(tier) {
  const out = ['redfang'];
  if (tier >= 2) out.push('vesh');
  if (tier >= 3) out.push('lattice');
  if (tier >= 4) out.push('ossari');
  if (tier >= 5) out.push('kharr');
  return out;
}
