// Spirehold — every number and name the game is built from. Pure data, no DOM, no clocks.
// Player-facing names are original (playground rule 9). "Horde" is a banned word: waves are "sieges".

export const DMG = ['physical', 'fire', 'frost', 'lightning', 'arcane', 'holy'];
export const DMG_INFO = {
  physical: { name: 'Physical', color: '#d8c8a8' },
  fire: { name: 'Fire', color: '#ff7a2a' },
  frost: { name: 'Frost', color: '#8fd8ff' },
  lightning: { name: 'Lightning', color: '#d9b8ff' },
  arcane: { name: 'Arcane', color: '#c070ff' },
  holy: { name: 'Holy', color: '#ffe38a' },
};

// ---------------------------------------------------------------- enemies
// hp/dmg are at wave 1 and scale with the wave. res: fraction of that damage type ignored (negative = weak to it).
// wall: damage per second to the wall once they reach it. size: radius in world units.
export const ENEMIES = {
  gnasher:    { name: 'Gnasher',      hp: 18,  speed: 34, wall: 2,   size: 5,  gold: 1,  look: 'imp',      color: '#c0783a', desc: 'Small, quick, endless.' },
  swarmling:  { name: 'Swarmling',    hp: 7,   speed: 46, wall: 0.8, size: 3.5, gold: 0.4, look: 'bug',     color: '#a8b040', desc: 'Comes in clouds of ten.', group: 8 },
  ravager:    { name: 'Ravager',      hp: 26,  speed: 64, wall: 2.5, size: 6,  gold: 1.4, look: 'wolf',     color: '#8a7a6a', desc: 'Runs fast. Hit it before it arrives.' },
  brute:      { name: 'Brute',        hp: 75,  speed: 24, wall: 7,   size: 8,  gold: 3,  look: 'brute',    color: '#8a5a3a', desc: 'Big and tough.' },
  bonewalker: { name: 'Bonewalker',   hp: 40,  speed: 28, wall: 3,   size: 6,  gold: 2,  look: 'skeleton', color: '#e0dccb', res: { physical: 0.5, holy: -1, frost: 0.3 }, undead: true, desc: 'Arrows pass through bone. Holy light burns it.' },
  shieldbearer:{ name: 'Shieldbearer', hp: 90, speed: 22, wall: 4,   size: 8,  gold: 3.5, look: 'shield',  color: '#7a8a9a', res: { physical: 0.6, fire: 0.2 }, desc: 'A wall of iron. Magic goes round the shield.' },
  hexcaller:  { name: 'Hexcaller',    hp: 45,  speed: 26, wall: 2,   size: 6,  gold: 4,  look: 'shaman',   color: '#b06ad0', res: { arcane: 0.4 }, healer: true, desc: 'Mends the wounds of everything near it.' },
  troll:      { name: 'Moss Troll',   hp: 220, speed: 20, wall: 10,  size: 11, gold: 8,  look: 'troll',    color: '#4a7a5a', res: { frost: 0.3 }, regen: 0.03, desc: 'Heals itself. Fire stops that.' },
  ram:        { name: 'Siege Ram',    hp: 420, speed: 13, wall: 40,  size: 13, gold: 14, look: 'ram',      color: '#8a5a3a', res: { physical: 0.25, lightning: -0.3 }, desc: 'Barely moves. Breaks walls if it arrives.' },
  wyvern:     { name: 'Wyvern',       hp: 60,  speed: 44, wall: 6,   size: 8,  gold: 5,  look: 'wyvern',   color: '#b04a3a', flying: true, res: { fire: 0.5, lightning: -0.4 }, desc: 'Flies over the ditch. Bombards and braziers cannot reach it.' },
  ghast:      { name: 'Ghast',        hp: 55,  speed: 30, wall: 4,   size: 7,  gold: 4,  look: 'ghost',    color: '#9ab8d0', res: { physical: 0.75, holy: -0.8, arcane: -0.3 }, undead: true, desc: 'Barely there. Steel passes through it.' },
  cinderling: { name: 'Cinderling',   hp: 35,  speed: 36, wall: 3,   size: 6,  gold: 2.5, look: 'flame',   color: '#ff6a2a', res: { fire: 0.9, frost: -0.6 }, desc: 'Living flame. Frost puts it out.' },
  rimehulk:   { name: 'Rimehulk',     hp: 160, speed: 19, wall: 9,   size: 11, gold: 7,  look: 'golem',    color: '#a8d8f0', res: { frost: 0.9, fire: -0.5, physical: 0.2 }, desc: 'Ice that walks. Fire melts it.' },
};

// Bosses lead every 10th wave (a siege). Name, look and power vary; the warlord name is generated.
export const BOSSES = {
  warlord:    { name: 'Warlord',      hp: 2400, speed: 16, wall: 60, size: 18, gold: 120, look: 'brute', color: '#c04a2a', res: { physical: 0.2 }, rally: true, desc: 'Drives the siege forward. Everything near it walks faster.' },
  gravecaller:{ name: 'Gravecaller',  hp: 2000, speed: 15, wall: 40, size: 16, gold: 140, look: 'shaman', color: '#6ad0a0', res: { physical: 0.4, holy: -0.6 }, undead: true, summons: 'bonewalker', desc: 'Raises the dead as it walks.' },
  stonewyrm:  { name: 'Stonewyrm',    hp: 3600, speed: 11, wall: 120, size: 22, gold: 180, look: 'golem', color: '#9a8a7a', res: { physical: 0.35, fire: 0.3 }, desc: 'A mountain with a grudge.' },
  skytyrant:  { name: 'Sky Tyrant',   hp: 2600, speed: 22, wall: 70, size: 20, gold: 170, look: 'wyvern', color: '#d0402a', flying: true, res: { fire: 0.5 }, desc: 'A great winged beast that ignores ditches and walls alike.' },
  hexmother:  { name: 'Hex Mother',   hp: 2200, speed: 14, wall: 50, size: 17, gold: 160, look: 'shaman', color: '#e070ff', res: { arcane: 0.6 }, healer: true, shield: true, desc: 'Wraps her army in wards.' },
};

// ---------------------------------------------------------------- towers
// dmg is per shot at level 1. rate = shots per second. range in world units.
// kind: how it attacks. branches[0] chosen at level 10, branches[1] at level 30.
export const TOWERS = {
  archer: {
    name: 'Archer Tower', dmgType: 'physical', dmg: 9, rate: 1.6, range: 210, kind: 'arrow', air: true, cost: 40, unlock: { city: 1 },
    color: '#c8a070', desc: 'Quick arrows at one target. Shoots flyers.',
    branches: [
      [{ id: 'volley', name: 'Volley', desc: 'Looses three arrows at three targets.', fx: { multishot: 3, dmgMul: 0.75 } },
       { id: 'sharpshot', name: 'Sharpshooter', desc: 'Longer range; one in four arrows hits for triple.', fx: { range: 1.35, crit: 0.25, critMul: 3 } }],
      [{ id: 'rain', name: 'Arrow Storm', desc: 'Every 6 seconds, a rain of arrows on the thickest crowd.', fx: { storm: 6 } },
       { id: 'giantbane', name: 'Giantbane', desc: 'Arrows hit big foes and bosses for double.', fx: { bigMul: 2 } }],
    ],
  },
  ballista: {
    name: 'Ballista', dmgType: 'physical', dmg: 34, rate: 0.45, range: 260, kind: 'bolt', air: true, cost: 90, unlock: { city: 2 },
    color: '#a07850', desc: 'A heavy bolt that runs through a whole line of foes.',
    branches: [
      [{ id: 'skewer', name: 'Skewer', desc: 'Bolts pass through twice as many.', fx: { pierce: 2 } },
       { id: 'breaker', name: 'Siegebreaker', desc: 'Triple damage to rams, trolls and bosses.', fx: { bigMul: 3 } }],
      [{ id: 'twin', name: 'Twin Arms', desc: 'Fires two bolts at once.', fx: { multishot: 2 } },
       { id: 'pin', name: 'Pinning Bolts', desc: 'Bolts pin foes in place for a moment.', fx: { stun: 0.8 } }],
    ],
  },
  bombard: {
    name: 'Bombard', dmgType: 'physical', dmg: 30, rate: 0.5, range: 240, kind: 'shell', air: false, splash: 42, cost: 150, unlock: { city: 3 },
    color: '#6a6a6a', desc: 'Lobs exploding shells into crowds. Cannot hit flyers.',
    branches: [
      [{ id: 'cluster', name: 'Cluster Shells', desc: 'Each shell bursts into four smaller blasts.', fx: { cluster: 4 } },
       { id: 'great', name: 'Great Bombard', desc: 'Huge, slow blasts that shake the ground.', fx: { dmgMul: 2.4, rateMul: 0.6, splash: 1.8 } }],
      [{ id: 'fireshell', name: 'Fire Shells', desc: 'Shells leave burning ground.', fx: { burnGround: 1 } },
       { id: 'concuss', name: 'Concussion', desc: 'Blasts knock foes back.', fx: { knock: 26 } }],
    ],
  },
  brazier: {
    name: 'Flame Brazier', dmgType: 'fire', dmg: 7, rate: 4, range: 150, kind: 'flame', air: false, cost: 120, unlock: { city: 4 },
    color: '#ff7a2a', desc: 'Sprays fire at close range; burning foes keep burning. Stops trolls healing.',
    branches: [
      [{ id: 'inferno', name: 'Inferno', desc: 'Burns spread to neighbours.', fx: { spreadBurn: 1 } },
       { id: 'dragonbreath', name: 'Dragonbreath', desc: 'A longer, wider jet of fire.', fx: { range: 1.5, cone: 1.6 } }],
      [{ id: 'whitefire', name: 'White Fire', desc: 'Burns twice as hot.', fx: { burnMul: 2 } },
       { id: 'pyre', name: 'Pyre Ring', desc: 'Now and then the ground around the tower erupts.', fx: { nova: 5 } }],
    ],
  },
  frost: {
    name: 'Frost Spire', dmgType: 'frost', dmg: 12, rate: 0.9, range: 200, kind: 'frost', air: true, splash: 30, cost: 160, unlock: { city: 5 },
    color: '#8fd8ff', desc: 'Chills a small area, slowing everything in it.',
    branches: [
      [{ id: 'deepfreeze', name: 'Deep Freeze', desc: 'Chilled foes may freeze solid for a moment.', fx: { stun: 0.6, stunChance: 0.25 } },
       { id: 'blizzard', name: 'Blizzard', desc: 'A much wider cold.', fx: { splash: 2 } }],
      [{ id: 'shatter', name: 'Shatter', desc: 'Frozen foes take double from everything.', fx: { shatter: 1 } },
       { id: 'rimewall', name: 'Rime Wall', desc: 'Foes at the wall are slowed to a crawl.', fx: { wallSlow: 1 } }],
    ],
  },
  storm: {
    name: 'Storm Spire', dmgType: 'lightning', dmg: 22, rate: 0.7, range: 220, kind: 'chain', air: true, chains: 3, cost: 220, unlock: { city: 7 },
    color: '#d9b8ff', desc: 'Lightning that leaps from foe to foe.',
    branches: [
      [{ id: 'arcweb', name: 'Arc Web', desc: 'Leaps to three more foes.', fx: { chains: 3 } },
       { id: 'thunder', name: 'Thundercall', desc: 'A single huge strike instead of a chain.', fx: { dmgMul: 3.5, chains: -99, splash: 1 } }],
      [{ id: 'overcharge', name: 'Overcharge', desc: 'Every fifth strike stuns.', fx: { stun: 0.7, stunEvery: 5 } },
       { id: 'skyward', name: 'Skyward', desc: 'Double damage to flyers.', fx: { airMul: 2 } }],
    ],
  },
  arcane: {
    name: 'Arcane Spire', dmgType: 'arcane', dmg: 16, rate: 1.1, range: 240, kind: 'missile', air: true, cost: 260, unlock: { city: 9 },
    color: '#c070ff', desc: 'Seeking missiles that never miss. Good against armour.',
    branches: [
      [{ id: 'seekers', name: 'Seekers', desc: 'Fires a fan of three missiles.', fx: { multishot: 3, dmgMul: 0.7 } },
       { id: 'rift', name: 'Rift', desc: 'Missiles tear small rifts that drag foes back.', fx: { knock: 18 } }],
      [{ id: 'unmake', name: 'Unmaking', desc: 'Hits strip a foe\'s resistances for a while.', fx: { strip: 1 } },
       { id: 'overflow', name: 'Overflow', desc: 'Kills restore your mana.', fx: { manaOnKill: 1 } }],
    ],
  },
  shrine: {
    name: 'Sun Shrine', dmgType: 'holy', dmg: 20, rate: 0.8, range: 200, kind: 'beam', air: true, cost: 300, unlock: { city: 11 },
    color: '#ffe38a', desc: 'A beam of light; burns the dead and slowly mends the wall.', wallHeal: 0.002,
    branches: [
      [{ id: 'radiance', name: 'Radiance', desc: 'The beam scorches everything around its target.', fx: { splash: 1 } },
       { id: 'bulwark', name: 'Bulwark', desc: 'Mends the wall three times as fast.', fx: { wallHeal: 3 } }],
      [{ id: 'judgement', name: 'Sentence', desc: 'Triple damage to the dead.', fx: { undeadMul: 3 } },
       { id: 'dawn', name: 'Dawnlight', desc: 'Every 8 seconds a pillar of light falls on a crowd.', fx: { storm: 8 } }],
    ],
  },
  observatory: {
    name: 'Star Observatory', dmgType: 'fire', dmg: 260, rate: 0.12, range: 520, kind: 'meteor', air: false, splash: 70, cost: 2000, unlock: { city: 15 },
    color: '#ffb070', desc: 'Pulls stones down from the sky on the biggest crowds.',
    branches: [
      [{ id: 'shower', name: 'Star Shower', desc: 'Calls five smaller stones instead of one.', fx: { cluster: 5, dmgMul: 0.45 } },
       { id: 'worldbreaker', name: 'Worldbreaker', desc: 'One enormous stone. Stuns everything it doesn\'t kill.', fx: { dmgMul: 2.5, splash: 1.6, stun: 1.5 } }],
      [{ id: 'quickstar', name: 'Quick Stars', desc: 'Stones fall twice as often.', fx: { rateMul: 2 } },
       { id: 'craters', name: 'Burning Craters', desc: 'Leaves burning ground.', fx: { burnGround: 1 } }],
    ],
  },
};

// ---------------------------------------------------------------- the player's own spells (mana)
// dmg is a multiple of your "spell power" (which grows with research, the Observatory landmark and relics).
export const SPELLS = {
  fireball:  { name: 'Fireball',        key: '1', mana: 20, cd: 2,  dmgType: 'fire',      power: 6,  radius: 55, burn: 1,  unlock: null, desc: 'A ball of fire that bursts where you aim.' },
  chain:     { name: 'Chain Lightning', key: '2', mana: 30, cd: 4,  dmgType: 'lightning', power: 9,  chains: 12, unlock: 'sp_chain', desc: 'Lightning that jumps through a dozen foes.' },
  frostnova: { name: 'Frost Bloom',     key: '3', mana: 35, cd: 10, dmgType: 'frost',     power: 4,  radius: 110, slow: 0.25, slowT: 5, unlock: 'sp_frost', desc: 'A burst of cold that slows a big area for five seconds.' },
  meteor:    { name: 'Meteor',          key: '4', mana: 60, cd: 14, dmgType: 'fire',      power: 40, radius: 95, delay: 1.1, stun: 1, burnGround: 1, unlock: 'sp_meteor', desc: 'A falling star. Huge blast, burning crater.' },
  quake:     { name: 'Earthshake',      key: '5', mana: 70, cd: 22, dmgType: 'physical',  power: 10, ring: true, stun: 2.5, unlock: 'sp_quake', desc: 'Every ground foe within the walls\' reach is shaken and stunned.' },
  ward:      { name: 'Aegis Ward',      key: '6', mana: 50, cd: 40, ward: 6, heal: 0.25, unlock: 'sp_ward', desc: 'The wall takes no harm for six seconds and mends a quarter.' },
  barrage:   { name: 'Arcane Barrage',  key: '7', mana: 45, cd: 8,  dmgType: 'arcane',    power: 3,  missiles: 24, unlock: 'sp_barrage', desc: 'Two dozen seeking missiles at the closest foes.' },
  starfury:  { name: 'Skyfall',         key: '8', mana: 140, cd: 60, dmgType: 'fire',     power: 30, meteors: 9, radius: 80, delay: 1.4, unlock: 'sp_skyfall', desc: 'Nine meteors across the whole field.' },
};
export const SPELL_ORDER = ['fireball', 'chain', 'frostnova', 'meteor', 'quake', 'ward', 'barrage', 'starfury'];

// ---------------------------------------------------------------- court mages (hired, cast on their own)
export const SCHOOLS = {
  pyromancer:  { name: 'Pyromancer',  dmgType: 'fire',      cd: 3.5, power: 3,   radius: 40, color: '#ff7a2a', spell: 'firebolt', desc: 'Hurls fire into crowds.' },
  cryomancer:  { name: 'Cryomancer',  dmgType: 'frost',     cd: 4,   power: 2,   radius: 60, slow: 0.45, color: '#8fd8ff', spell: 'frostburst', desc: 'Slows whole groups.' },
  stormcaller: { name: 'Stormcaller', dmgType: 'lightning', cd: 3,   power: 3,   chains: 5, color: '#d9b8ff', spell: 'chain', desc: 'Chains lightning through foes.' },
  arcanist:    { name: 'Arcanist',    dmgType: 'arcane',    cd: 1.4, power: 1.4, color: '#c070ff', spell: 'missile', desc: 'A steady stream of seeking missiles.' },
  lightbringer:{ name: 'Lightbringer',dmgType: 'holy',      cd: 3,   power: 2.4, radius: 35, wallHeal: 0.004, color: '#ffe38a', spell: 'smite', desc: 'Smites the dead and mends the wall.' },
  geomancer:   { name: 'Geomancer',   dmgType: 'physical',  cd: 6,   power: 5,   radius: 50, stun: 1, color: '#c0a070', spell: 'boulder', desc: 'Drops boulders that stun.' },
  astromancer: { name: 'Astromancer', dmgType: 'fire',      cd: 9,   power: 12,  radius: 70, color: '#ffb070', spell: 'meteor', desc: 'Calls down meteors of her own.', unlock: 'mg_astro' },
};

// ---------------------------------------------------------------- the city (no micromanagement: these are the few big upgrades)
// Each landmark appears at a city level, levels up for gold, and gives a % bonus per level.
export const LANDMARKS = {
  market:      { name: 'Grand Market',   city: 1,  cost: 60,   grow: 1.32, per: 0.08, stat: 'gold',     desc: 'More gold from taxes and kills.' },
  granary:     { name: 'Granary',        city: 2,  cost: 80,   grow: 1.35, per: 0.12, stat: 'pop',      desc: 'Room for more people (more taxes).' },
  forge:       { name: 'Forge',          city: 4,  cost: 120,  grow: 1.33, per: 0.06, stat: 'tower',    desc: 'All towers hit harder.' },
  temple:      { name: 'Temple of Dawn', city: 5,  cost: 150,  grow: 1.33, per: 0.10, stat: 'wall',     desc: 'Stronger walls that mend faster.' },
  tavern:      { name: 'Wayfarer\'s Rest', city: 2, cost: 200, grow: 1.40, per: 0.08, stat: 'tavern',   desc: 'Adventurers arrive more often, and better ones.' },
  academy:     { name: 'Mage Academy',   city: 3,  cost: 300,  grow: 1.36, per: 0.07, stat: 'mage',     desc: 'Court mages hit harder.' },
  library:     { name: 'Old Library',    city: 8,  cost: 400,  grow: 1.36, per: 0.08, stat: 'lore',     desc: 'More lore for research.' },
  observatory: { name: 'Sky Observatory',city: 10, cost: 800,  grow: 1.38, per: 0.07, stat: 'spell',    desc: 'Your own spells hit harder and mana flows faster.' },
  guildhall:   { name: 'Guild Hall',     city: 12, cost: 1200, grow: 1.42, per: 0.05, stat: 'quest',    desc: 'Better odds and better rewards on quests.' },
};

// City level -> wall ring. At each listed city level the walls are rebuilt wider with more tower spots.
export const RING_AT = [1, 4, 8, 13, 19, 26, 34, 43, 53, 64, 76, 90];
export const ringSlots = ring => 6 + ring * 3;          // ring 0 = 6 spots ... ring 11 = 39
export const ringRadius = ring => 110 + ring * 26;
export const CITY_TITLES = ['Hamlet', 'Village', 'Town', 'Market Town', 'City', 'Walled City', 'Great City', 'Citadel', 'Capital', 'High Capital', 'Crown City', 'Wonder of the Realm'];

// ---------------------------------------------------------------- adventurers
export const RACES = {
  human:    { name: 'Human',    bonus: { gold: 0.05 } },
  elf:      { name: 'Elf',      bonus: { wilds: 0.1, wards: 0.05 } },
  dwarf:    { name: 'Dwarf',    bonus: { tough: 0.1, traps: 0.05 } },
  halfling: { name: 'Halfling', bonus: { luck: 0.08 } },
  gnome:    { name: 'Gnome',    bonus: { wards: 0.1 } },
  halforc:  { name: 'Half-orc', bonus: { tough: 0.08, beasts: 0.05 } },
};
// role: tank | heal | dmg | skill. tags: what this class is good at on a quest.
export const CLASSES = {
  fighter:   { name: 'Fighter',   role: 'tank', power: 1.0, tags: ['beasts'],          wall: 1.0, color: '#c0c0c8' },
  paladin:   { name: 'Paladin',   role: 'tank', power: 1.0, tags: ['undead', 'talk'],  wall: 0.9, color: '#ffe38a' },
  barbarian: { name: 'Barbarian', role: 'tank', power: 1.1, tags: ['beasts'],          wall: 1.2, color: '#c06a3a' },
  rogue:     { name: 'Rogue',     role: 'skill',power: 0.9, tags: ['traps', 'locks'],  wall: 0.8, color: '#8a8aa0' },
  ranger:    { name: 'Ranger',    role: 'dmg',  power: 1.0, tags: ['wilds', 'beasts'], wall: 1.2, color: '#6aa04a' },
  wizard:    { name: 'Wizard',    role: 'dmg',  power: 1.15,tags: ['wards', 'lore'],   wall: 1.1, color: '#7a8aff' },
  warlock:   { name: 'Hexblade',  role: 'dmg',  power: 1.1, tags: ['wards', 'undead'], wall: 1.0, color: '#a04ad0' },
  cleric:    { name: 'Cleric',    role: 'heal', power: 0.85,tags: ['undead'],          wall: 0.7, color: '#f0f0e0' },
  druid:     { name: 'Druid',     role: 'heal', power: 0.9, tags: ['wilds'],           wall: 0.8, color: '#4ab070' },
  bard:      { name: 'Bard',      role: 'heal', power: 0.8, tags: ['talk', 'lore'],    wall: 0.7, color: '#e08ac0' },
  monk:      { name: 'Monk',      role: 'dmg',  power: 1.0, tags: ['traps'],           wall: 0.9, color: '#e0b060' },
};
export const TRAITS = {
  brave:    { name: 'Brave',    desc: 'Better odds on hard quests.', odds: 0.04 },
  cautious: { name: 'Cautious', desc: 'Rarely gets badly hurt.', safe: 0.5 },
  greedy:   { name: 'Greedy',   desc: 'Brings home more gold.', gold: 0.15 },
  lucky:    { name: 'Lucky',    desc: 'Finds relics more often.', relic: 0.3 },
  scholar:  { name: 'Scholar',  desc: 'Brings home more lore.', lore: 0.2 },
  swift:    { name: 'Swift',    desc: 'Quests finish sooner.', speed: 0.1 },
  stalwart: { name: 'Stalwart', desc: 'Strong on the walls between quests.', wall: 0.5 },
  reckless: { name: 'Reckless', desc: 'Hits hard, gets hurt often.', power: 0.12, hurt: 0.5 },
};

// Quest lengths. mult = reward multiplier, odds = a small change to the odds (long quests are a little safer — more time to plan).
export const LENGTHS = [
  { id: 'short', name: 'Short',  secs: 5 * 60,      mult: 1,   label: '5 min' },
  { id: 'half',  name: 'Half hour', secs: 30 * 60,  mult: 5,   label: '30 min' },
  { id: 'long',  name: 'Long',   secs: 2 * 3600,    mult: 16,  label: '2 hours' },
  { id: 'epic',  name: 'Epic',   secs: 8 * 3600,    mult: 50,  label: '8 hours' },
];
// Quest kinds. needs: tags the party should cover. foe: flavour for the story.
export const QUEST_KINDS = [
  { id: 'crypt',   title: ['Cleanse the {place}', 'Silence the {place}'], places: ['Lantern Crypt', 'Hollow Barrow', 'Sunken Ossuary', 'Weeping Vault', 'Ashmoor Tomb'], needs: ['undead'], foe: 'the restless dead' },
  { id: 'lair',    title: ['Hunt the beast of {place}', 'Clear the den at {place}'], places: ['Thornback Gully', 'Redfern Hollow', 'the Gnawed Hills', 'Cragmaw Pass', 'Blackbriar'], needs: ['beasts', 'wilds'], foe: 'a great beast' },
  { id: 'tower',   title: ['Break the wards of {place}', 'Loot the sorcerer\'s {place}'], places: ['Glass Spire', 'Moonwell Tower', 'the Inkstone Keep', 'Starwhisper Folly'], needs: ['wards', 'lore'], foe: 'a mad sorcerer\'s guardians' },
  { id: 'vault',   title: ['Rob the {place}', 'Crack the {place}'], places: ['Gilded Vault', 'Old Mint', 'Smuggler\'s Cellar', 'Drowned Treasury'], needs: ['traps', 'locks'], foe: 'traps and locks' },
  { id: 'escort',  title: ['Escort the caravan to {place}', 'Parley with {place}'], places: ['Saltmere', 'the River Clans', 'Highford', 'the Hill Lords'], needs: ['talk'], foe: 'bandits on the road' },
  { id: 'warcamp', title: ['Raid the war camp at {place}', 'Burn the siege engines at {place}'], places: ['Ravenmoor', 'the Scar', 'Gallows Ridge', 'Ironbog'], needs: ['beasts', 'traps'], foe: 'a warband' },
  { id: 'ruin',    title: ['Map the ruins of {place}', 'Recover the relic of {place}'], places: ['Old Varrow', 'Lostwater', 'Cindervale', 'the Bell Ruins'], needs: ['lore', 'traps'], foe: 'old guardians' },
  { id: 'dragon',  title: ['Slay the wyrm of {place}', 'Steal from the hoard at {place}'], places: ['Mount Gorrak', 'the Smoking Peaks', 'Coldcrown'], needs: ['wards', 'beasts', 'undead'], foe: 'a dragon', minRank: 7 },
];
export const RANK_NAMES = ['Copper', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Mithral', 'Adamant', 'Starmetal', 'Legend'];

// ---------------------------------------------------------------- relics (from quests; permanent; duplicates level them up)
// fx: stat -> amount per level.
export const RELICS = {
  hornGate:    { name: 'Horn of the Last Gate', rar: 1, fx: { wall: 0.10 }, desc: 'Walls are tougher.' },
  oakbow:      { name: 'Heartoak Bow',        rar: 1, fx: { t_archer: 0.15 }, desc: 'Archer Towers hit harder.' },
  coinPurse:   { name: 'Bottomless Purse',    rar: 1, fx: { gold: 0.08 }, desc: 'More gold.' },
  inkwell:     { name: 'Sage\'s Inkwell',     rar: 1, fx: { lore: 0.10 }, desc: 'More lore.' },
  mapCase:     { name: 'Wayfinder\'s Map Case', rar: 1, fx: { questSpeed: 0.05 }, desc: 'Quests finish sooner.' },
  emberStone:  { name: 'Coalheart Stone',     rar: 1, fx: { d_fire: 0.10 }, desc: 'Fire damage up.' },
  rimeShard:   { name: 'Rime Shard',          rar: 1, fx: { d_frost: 0.10 }, desc: 'Frost damage up.' },
  stormJar:    { name: 'Storm in a Jar',      rar: 1, fx: { d_lightning: 0.10 }, desc: 'Lightning damage up.' },
  ironCrown:   { name: 'Iron Crown',          rar: 2, fx: { tower: 0.08 }, desc: 'All towers hit harder.' },
  sunDisc:     { name: 'Sun Disc',            rar: 2, fx: { d_holy: 0.15, wallRegen: 0.1 }, desc: 'Holy damage up; walls mend faster.' },
  staffAges:   { name: 'Staff of Ages',       rar: 2, fx: { spell: 0.12 }, desc: 'Your spells hit harder.' },
  manaLily:    { name: 'Mana Lily',           rar: 2, fx: { mana: 0.12 }, desc: 'Mana refills faster.' },
  luckyDie:    { name: 'Gambler\'s Bone Die', rar: 2, fx: { odds: 0.02 }, desc: 'Slightly better quest odds.' },
  banner:      { name: 'Banner of the Founders', rar: 2, fx: { pop: 0.10 }, desc: 'More people move in.' },
  ballistaPin: { name: 'Giant\'s Linchpin',   rar: 2, fx: { t_ballista: 0.2, t_bombard: 0.2 }, desc: 'Ballistae and Bombards hit harder.' },
  voidPearl:   { name: 'Void Pearl',          rar: 2, fx: { d_arcane: 0.15 }, desc: 'Arcane damage up.' },
  mageRing:    { name: 'Circle Ring',         rar: 2, fx: { mage: 0.12 }, desc: 'Court mages hit harder.' },
  starIron:    { name: 'Star-iron Ingot',     rar: 3, fx: { meteor: 0.25 }, desc: 'Meteors of every kind hit harder.' },
  hourglass:   { name: 'Sand of Still Hours', rar: 3, fx: { offline: 0.08 }, desc: 'Earn more while you are away.' },
  wyrmScale:   { name: 'Wyrmscale Shield',    rar: 3, fx: { wall: 0.2, wallRegen: 0.15 }, desc: 'Much tougher walls.' },
  crownKings:  { name: 'Crown of Nine Kings', rar: 3, fx: { gold: 0.15, pop: 0.1 }, desc: 'A richer, bigger city.' },
  everflame:   { name: 'Everflame Lantern',   rar: 3, fx: { burn: 0.3 }, desc: 'Burns last longer and hurt more.' },
  sigil:       { name: 'Sigil of the Archmage', rar: 3, fx: { spell: 0.2, mana: 0.1 }, desc: 'Stronger spells, more mana.' },
  fateThread:  { name: 'Thread of Fate',      rar: 3, fx: { odds: 0.04, safe: 0.2 }, desc: 'Better odds, fewer injuries.' },
  heartWorld:  { name: 'Heart of the World',  rar: 4, fx: { tower: 0.15, spell: 0.15, mage: 0.15 }, desc: 'Everything that fights hits harder.' },
  dawnblade:   { name: 'Dawnblade',           rar: 4, fx: { d_holy: 0.3, guildWall: 0.5 }, desc: 'Holy damage; adventurers fight harder on the walls.' },
  skyAnchor:   { name: 'Sky Anchor',          rar: 4, fx: { meteor: 0.5, d_fire: 0.15 }, desc: 'Meteors fall harder than ever.' },
  goldenGoose: { name: 'The Golden Goose',    rar: 4, fx: { gold: 0.3, offline: 0.1 }, desc: 'Gold, always gold.' },
};
export const RARITY = ['', 'Common', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLOR = ['', '#c8c8c8', '#5aa0ff', '#c070ff', '#ffb040'];

// ---------------------------------------------------------------- research (paid in lore)
// fx: stat -> per rank. req: ids that must have at least one rank. max ranks.
export const RESEARCH = [
  // Masonry
  { id: 'rs_wall',   branch: 'Masonry', name: 'Thicker Walls',     max: 50, cost: 10, grow: 1.22, fx: { wall: 0.15 }, desc: '+15% wall strength a rank.' },
  { id: 'rs_mend',   branch: 'Masonry', name: 'Masons on Call',    max: 25, cost: 20, grow: 1.25, fx: { wallRegen: 0.15 }, req: ['rs_wall'], desc: 'Walls mend 0.6% of their full strength every second; each rank adds +15% to that (+0.09% a second).' },
  { id: 'rs_ditch',  branch: 'Masonry', name: 'Spiked Ditch',      max: 20, cost: 40, grow: 1.3,  fx: { ditch: 0.25 }, req: ['rs_wall'], desc: 'Every foe at the wall takes 6.25 damage a second a rank. That grows 12% with each city level and with tower damage.' },
  { id: 'rs_towers', branch: 'Masonry', name: 'Tower Drill',       max: 60, cost: 15, grow: 1.2,  fx: { tower: 0.06 }, desc: '+6% tower damage a rank.' },
  { id: 'rs_range',  branch: 'Masonry', name: 'Taller Towers',     max: 10, cost: 60, grow: 1.5,  fx: { range: 0.04 }, req: ['rs_towers'], desc: '+4% tower range a rank.' },
  { id: 'rs_crit',   branch: 'Masonry', name: 'Weak Points',       max: 20, cost: 80, grow: 1.32, fx: { crit: 0.01 }, req: ['rs_towers'], desc: '+1% chance a rank that a tower shot hits for double damage.' },
  { id: 'rs_cheap',  branch: 'Masonry', name: 'Guild of Builders', max: 15, cost: 100, grow: 1.4, fx: { cheap: 0.03 }, req: ['rs_towers'], desc: 'Tower upgrades cost 3% less a rank (45% off at most).' },
  // Arcana
  { id: 'sp_chain',  branch: 'Arcana', name: 'Spell: Chain Lightning', max: 1, cost: 25, grow: 1, fx: {}, desc: 'Learn Chain Lightning.' },
  { id: 'sp_frost',  branch: 'Arcana', name: 'Spell: Frost Bloom', max: 1, cost: 60, grow: 1, fx: {}, req: ['sp_chain'], desc: 'Learn Frost Bloom.' },
  { id: 'sp_meteor', branch: 'Arcana', name: 'Spell: Meteor',      max: 1, cost: 150, grow: 1, fx: {}, req: ['sp_chain'], desc: 'Learn Meteor.' },
  { id: 'sp_quake',  branch: 'Arcana', name: 'Spell: Earthshake',  max: 1, cost: 600, grow: 1, fx: {}, req: ['sp_meteor'], desc: 'Learn Earthshake.' },
  { id: 'sp_ward',   branch: 'Arcana', name: 'Spell: Aegis Ward',  max: 1, cost: 400, grow: 1, fx: {}, req: ['sp_frost'], desc: 'Learn Aegis Ward.' },
  { id: 'sp_barrage',branch: 'Arcana', name: 'Spell: Arcane Barrage', max: 1, cost: 1500, grow: 1, fx: {}, req: ['sp_quake'], desc: 'Learn Arcane Barrage.' },
  { id: 'sp_skyfall',branch: 'Arcana', name: 'Spell: Skyfall',     max: 1, cost: 20000, grow: 1, fx: {}, req: ['sp_barrage'], desc: 'Learn Skyfall: nine meteors at once.' },
  { id: 'rs_spell',  branch: 'Arcana', name: 'Deeper Study',       max: 60, cost: 15, grow: 1.2, fx: { spell: 0.08 }, desc: '+8% spell damage a rank, and +2.4% mana a second.' },
  { id: 'rs_mana',   branch: 'Arcana', name: 'Mana Wells',         max: 30, cost: 20, grow: 1.24, fx: { mana: 0.08, manaMax: 0.06 }, desc: '+8% mana a second and +6% most mana a rank (start: 2.2 a second, 100 at most).' },
  { id: 'rs_auto',   branch: 'Arcana', name: 'Spellwardens',       max: 1, cost: 120, grow: 1, fx: { autocast: 1 }, req: ['sp_chain'], desc: 'Apprentices cast your spells for you when you are away. They aim worse: 70% power.' },
  { id: 'rs_autopow',branch: 'Arcana', name: 'Trained Apprentices',max: 10, cost: 400, grow: 1.4, fx: { autopow: 0.03 }, req: ['rs_auto'], desc: 'Auto-cast spells hit 3% harder a rank, from 70% up to full power.' },
  { id: 'rs_mages',  branch: 'Arcana', name: 'Court Patronage',    max: 8, cost: 50, grow: 2.2, fx: { mageSlots: 1 }, desc: 'Room for one more court mage a rank (needs the Mage Academy).' },
  { id: 'mg_astro',  branch: 'Arcana', name: 'Astromancy',         max: 1, cost: 3000, grow: 1, fx: {}, req: ['sp_meteor', 'rs_mages'], desc: 'Astromancers may join your court.' },
  { id: 'rs_magepow',branch: 'Arcana', name: 'Spell Circles',      max: 50, cost: 25, grow: 1.21, fx: { mage: 0.08 }, req: ['rs_mages'], desc: '+8% court mage damage a rank.' },
  // Civics
  { id: 'rs_tax',    branch: 'Civics', name: 'Fair Taxes',         max: 50, cost: 10, grow: 1.21, fx: { gold: 0.08 }, desc: '+8% gold a rank.' },
  { id: 'rs_homes',  branch: 'Civics', name: 'Stone Houses',       max: 40, cost: 15, grow: 1.23, fx: { pop: 0.08 }, desc: '+8% room for people a rank (more people, more taxes).' },
  { id: 'rs_scribes',branch: 'Civics', name: 'Scribes',            max: 40, cost: 20, grow: 1.23, fx: { lore: 0.08 }, desc: '+8% lore a rank.' },
  { id: 'rs_away',   branch: 'Civics', name: 'Stewards',           max: 20, cost: 50, grow: 1.3, fx: { offline: 0.03 }, req: ['rs_tax'], desc: 'Earn +3% more of your normal rate while away a rank (you start at 50%, 100% at most; up to 12 hours).' },
  { id: 'rs_speed',  branch: 'Civics', name: 'Drilled Garrison',   max: 1, cost: 300, grow: 1, fx: { speed3: 1 }, req: ['rs_tax'], desc: 'Unlocks 3x game speed.' },
  { id: 'rs_bounty', branch: 'Civics', name: 'Bounties',           max: 30, cost: 30, grow: 1.26, fx: { kill: 0.1 }, req: ['rs_tax'], desc: '+10% gold from kills a rank.' },
  // Fellowship
  { id: 'rs_roster', branch: 'Fellowship', name: 'Bigger Barracks', max: 6, cost: 40, grow: 2.4, fx: { roster: 2 }, desc: 'Room for two more adventurers a rank (6 to start).' },
  { id: 'rs_odds',   branch: 'Fellowship', name: 'Maps and Rumours',max: 20, cost: 30, grow: 1.3, fx: { odds: 0.01 }, desc: '+1% to every quest\'s chance of success a rank.' },
  { id: 'rs_loot',   branch: 'Fellowship', name: 'Fair Shares',     max: 30, cost: 30, grow: 1.25, fx: { quest: 0.1 }, desc: '+10% quest rewards a rank.' },
  { id: 'rs_heal',   branch: 'Fellowship', name: 'Healers\' House', max: 10, cost: 60, grow: 1.4, fx: { healFast: 0.08, safe: 0.04 }, desc: 'A rank: injuries last 8% less time (down to 30% at most) and adventurers are 4% less likely to get hurt or fall.' },
  { id: 'rs_train',  branch: 'Fellowship', name: 'Training Yard',   max: 30, cost: 40, grow: 1.27, fx: { advXp: 0.1, guildWall: 0.08 }, desc: 'A rank: +10% adventurer experience and +8% damage from adventurers on the walls.' },
  { id: 'rs_parties',branch: 'Fellowship', name: 'Second Quest Board', max: 3, cost: 200, grow: 3, fx: { boards: 1 }, req: ['rs_roster'], desc: 'One more quest on the board a rank (3 to start).' },
];

// ---------------------------------------------------------------- realms (prestige)
export const REALMS = {
  greenvale:  { name: 'Greenvale',      need: 0, ground: ['#3d5a2a', '#4a6a32', '#2f4a22'], mix: { gnasher: 3, swarmling: 1, ravager: 2, brute: 2, bonewalker: 1, shieldbearer: 1, hexcaller: 1, troll: 1, ram: 1, wyvern: 1, ghast: 0.5 }, bonus: {}, desc: 'Rolling green hills. A good place to start.' },
  ashreach:   { name: 'Ashen Reach',    need: 1, ground: ['#4a3a30', '#5a4232', '#3a2a24'], mix: { gnasher: 2, cinderling: 3, brute: 2, ram: 1.5, wyvern: 1.5, hexcaller: 1, troll: 0.5 }, bonus: { gold: 0.25 }, desc: 'Fire-blooded foes; frost is king. +25% gold.' },
  frostmarch: { name: 'Frostmarch',     need: 2, ground: ['#7a8a94', '#8a9aa4', '#5a6a74'], mix: { gnasher: 2, ravager: 3, rimehulk: 2, troll: 2, shieldbearer: 1.5, wyvern: 1 }, bonus: { lore: 0.3 }, desc: 'Ice that walks; bring fire. +30% lore.' },
  bonefields: { name: 'Bonefields',     need: 3, ground: ['#4a4a3a', '#5a5a44', '#3a3a2e'], mix: { bonewalker: 4, ghast: 3, hexcaller: 1.5, swarmling: 1, brute: 1 }, bonus: { quest: 0.3 }, desc: 'The dead do not rest; holy light shines. +30% quest rewards.' },
  stormcoast: { name: 'Stormcoast',     need: 4, ground: ['#3a5a5a', '#466a66', '#2a4a4a'], mix: { wyvern: 3, ghast: 2, swarmling: 2, ravager: 2, shieldbearer: 2, ram: 1 }, bonus: { spell: 0.3 }, desc: 'Flyers and phantoms off the sea. +30% spell damage.' },
  skyfang:    { name: 'Skyfang Heights',need: 6, ground: ['#6a5a4a', '#7a6a52', '#5a4a3c'], mix: { brute: 2, troll: 2, ram: 2, wyvern: 2, rimehulk: 1, cinderling: 1, shieldbearer: 1, hexcaller: 1 }, bonus: { tower: 0.3, gold: 0.2 }, desc: 'Everything at once, all of it big. +30% tower damage, +20% gold.' },
};

// Legacy (bought with Crowns, earned by founding a new realm). Kept forever.
export const LEGACY = [
  { id: 'lg_gold',   name: 'Royal Treasury',   max: 100, cost: 1, grow: 1.18, mul: true, fx: { gold: 0.3 }, desc: 'Gold ×1.3 a rank (each rank multiplies).' },
  { id: 'lg_dmg',    name: 'Ancestral Arms',   max: 100, cost: 1, grow: 1.18, mul: true, fx: { tower: 0.3, mage: 0.3 }, desc: 'Tower and mage damage ×1.3 a rank (each rank multiplies).' },
  { id: 'lg_spell',  name: 'Bloodline Magic',  max: 100, cost: 1, grow: 1.18, mul: true, fx: { spell: 0.35 }, desc: 'Spell damage ×1.35 a rank (each rank multiplies).' },
  { id: 'lg_lore',   name: 'Old Archives',     max: 100, cost: 1, grow: 1.18, fx: { lore: 0.3 }, desc: '+30% lore a rank.' },
  { id: 'lg_wall',   name: 'Founders\' Stones',max: 100, cost: 1, grow: 1.18, mul: true, fx: { wall: 0.3 }, desc: 'Wall strength ×1.3 a rank (each rank multiplies).' },
  { id: 'lg_start',  name: 'Head Start',       max: 20, cost: 2, grow: 1.35, fx: { startWave: 10 }, desc: 'Each new realm starts 10 waves further in (with gold to match).' },
  { id: 'lg_quest',  name: 'Famous Guild',     max: 30, cost: 2, grow: 1.25, fx: { quest: 0.25, odds: 0.01 }, desc: 'Better quests.' },
  { id: 'lg_away',   name: 'Loyal Stewards',   max: 20, cost: 2, grow: 1.3, fx: { offline: 0.05 }, desc: 'Earn more while you are away.' },
  { id: 'lg_mage',   name: 'Court of Legend',  max: 4, cost: 5, grow: 2.5, fx: { mageSlots: 1 }, desc: 'One more court mage a rank.' },
  { id: 'lg_keep',   name: 'Kept Notes',       max: 10, cost: 3, grow: 1.6, fx: { keepLore: 0.05 }, desc: 'Keep 5% of your research ranks into each new realm, a rank.' },
];

// ---------------------------------------------------------------- name parts (original, generated)
export const NAME_PARTS = {
  first: ['Bryn', 'Aldo', 'Mira', 'Tamsin', 'Oren', 'Kael', 'Ysolde', 'Dunstan', 'Pell', 'Rhosyn', 'Varo', 'Isk', 'Hollis', 'Wren', 'Maelis', 'Corvin', 'Talla', 'Garrick', 'Sefa', 'Odo', 'Linnet', 'Bram', 'Quill', 'Asha', 'Tobin', 'Eluned', 'Fenn', 'Grisel', 'Hadri', 'Juno', 'Kestrin', 'Lark', 'Morrow', 'Nell', 'Pip', 'Rook', 'Saffi', 'Thane', 'Ulla', 'Vesna', 'Yorick', 'Zara', 'Brannoc', 'Cressa', 'Doran', 'Fable', 'Gwil'],
  last: ['Oakshield', 'Thistledown', 'Coalbrook', 'Marrowfield', 'Stonehollow', 'Brightwater', 'Ashby', 'Greycloak', 'Underhill', 'Ravensworth', 'Tallowmere', 'Fairweather', 'Ironwood', 'Blackwell', 'Goldmantle', 'Highmoor', 'Saltmarsh', 'Copperkettle', 'Wolfbane', 'Starling'],
  partyA: ['Copper', 'Seventh', 'Lucky', 'Crimson', 'Silver', 'Wandering', 'Last', 'Broken', 'Golden', 'Midnight', 'Bold', 'Laughing', 'Iron', 'Moonlit', 'Rusty', 'Thrice-Blessed'],
  partyB: ['Lanterns', 'Company', 'Blades', 'Owls', 'Wayfarers', 'Shields', 'Hounds', 'Candles', 'Kettles', 'Spears', 'Crows', 'Oath', 'Boots', 'Foxes', 'Banners', 'Coins'],
  warlordA: ['Grash', 'Ullok', 'Mordra', 'Skarn', 'Vex', 'Thrall-Eye', 'Korrag', 'Ysmir', 'Brakka', 'Old Gnaw', 'Hesk'],
  warlordB: ['the Unbowed', 'Wallbreaker', 'of the Pale Banner', 'Bonegrinder', 'the Hungry', 'Ashmaw', 'the Many-Headed', 'Gatecrusher', 'the Patient'],
  city: ['Spirehold', 'Aldmere', 'Highwatch', 'Thornwall', 'Brightkeep', 'Stonecross', 'Carrowmere', 'Wardenmoor'],
};
