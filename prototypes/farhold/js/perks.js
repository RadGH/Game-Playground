// Farhold — the perk forest: one tree, every class, starting at the middle.
//
//   "Let's change the attribute point-buy system to a Path of Exile type of 'skill forest', and also
//    move passives and talents into that screen called 'Perks'. It should be the same for every
//    class starting from the center. There should be a clear region for melee perks, ranged perks,
//    companion perks, utility perks, etc; with some oddballs mixed around too. There should be minor
//    nodes that give basic stats, major nodes that give more powerful stats or more of them, talent
//    nodes that give more complex features, and keystones that do something significant to gameplay.
//    Do not add any space/rocket skills however, keep the characters action rpg style."
//
// Three systems became one. Attribute point-buy, the passive ladder and the talent picks were three
// screens that each spent a different currency at a different moment, and none of them was a
// *decision* — you spent attributes on whatever your class wanted and the passives came in order.
// A forest is a decision because the shape of the tree is the cost: a keystone out on the melee
// fringe is a dozen points of walking, and those points are melee stats you may not want.
//
// **The tree is generated, not hand-placed.** Arms out of a central hub, each with seven rings of
// nodes, plus a scatter of oddballs between the arms and a keystone at the end of every arm. That
// gives a consistent shape at any size and means the layout, the reachability rules and the
// allocation maths can all be tested without a browser.
//
// Round 16 took it from four arms to EIGHT, on the user's ask:
//
//   "Also add 4 more corner-facing quadrants to the Perks tree and have one specialize further in
//    bonus loot, one that specializes in defense, and two others your pick for whatever is lacking
//    (avoiding building mechanics, perks are RPG mode features)."
//
// Nothing below is written per-arm any more. The sector an arm gets, the oddballs' angles and the
// ring spacing are all worked out FROM `ARMS.length`, so the next four arms cost one array entry
// each and nothing has to be re-derived by hand — which is exactly the drift that put four oddballs
// on top of four arm nodes the last time (see the note over the oddball loop).
//
//   import { buildForest, allocate, refund, perkBonuses } from './perks.js';
//   const forest = buildForest();                   // { nodes, links, start }
//   allocate(player, forest, nodeId);               // spends one point, if it is reachable
//   perkBonuses(player, forest);                    // { stats, flags, talents }
//
// Pure: no DOM, no Three.js.

// ---------------------------------------------------------------------------- what a node can be

/** The four kinds, in the order a player meets them walking outward. */
export const NODE_KINDS = {
  minor: { key: 'minor', name: 'Minor', size: 1, cost: 1 },
  major: { key: 'major', name: 'Major', size: 1.7, cost: 1 },
  talent: { key: 'talent', name: 'Talent', size: 2.2, cost: 1 },
  keystone: { key: 'keystone', name: 'Keystone', size: 3, cost: 1 },
};

/**
 * The eight arms, and the oddballs on the seams between them.
 *
 * Each arm has its own stat vocabulary, so walking down one is a build rather than a shopping list.
 * "Some oddballs mixed around too" is the `wild` pool: nodes that belong to nobody, sitting between
 * the arms, which is how a melee character ends up with a companion perk they had to reach for.
 *
 * ORDER MATTERS FOR THE LAYOUT, NOT FOR THE SAVE. A node's id is `<arm key>:<ring>:<i>`, so an arm
 * keeps its ids wherever it sits in this array — but `ARM_SECTOR` is `2π / ARMS.length`, so adding
 * one narrows everybody's slice. Adding a NINTH arm would want the four new corner angles below
 * re-spaced; adding the fifth through eighth did not, because they went in the four gaps the
 * original four left.
 *
 * EVERY VALUE HERE IS IN THE UNIT `js/rpg.js` READS, because the stat key IS a `derived` field name
 * and `rpg.derive` adds it straight in with no translation. That is the whole reason this file can
 * be a data table, and it is also the one way to write a node that does nothing:
 *
 *   * percent (the number IS the percent): magicFind, goldFind, xpFind, critChance, critDamage,
 *     dodge, hit, haste, lifeSteal, manaSteal, resistAll, blockChance, damagePct, armorPct,
 *     movePct, areaPct, petDamagePct, cooldownReduction
 *   * flat: armor, magicResist, maxHp, maxMp, damageFlat, blockPower, barrier, hpOnKill,
 *     manaOnKill, hpRegen (a second), mpRegen (a second), lightRange (metres), str/dex/int/con
 *   * a FRACTION, where 0.1 means a tenth: stealth, revealRange, scavengeChance, echoChance, thorns
 */
export const ARMS = [
  {
    key: 'melee', name: 'The Close Ground', angle: -Math.PI / 2, color: '#e07a4a',
    blurb: 'Reach, weight and the willingness to be hit.',
    minor: [
      ['str', 4, '+4 strength'], ['damageFlat', 3, '+3 damage'], ['armor', 6, '+6 armour'],
      ['maxHp', 22, '+22 health'], ['critChance', 3, '+3% critical chance'], ['hit', 4, '+4% accuracy'],
    ],
    major: [
      ['damagePct', 8, '+8% weapon damage'], ['str', 9, '+9 strength'],
      ['armorPct', 12, '+12% armour'], ['critDamage', 18, '+18% critical damage'],
      ['areaPct', 10, '+10% attack area'],
    ],
  },
  {
    key: 'ranged', name: 'The Long Shot', angle: 0, color: '#6ab0ff',
    blurb: 'Distance, precision and the shot you only get once.',
    minor: [
      ['dex', 4, '+4 dexterity'], ['critChance', 4, '+4% critical chance'], ['hit', 5, '+5% accuracy'],
      ['haste', 5, '+5% attack speed'], ['dodge', 3, '+3% dodge'], ['damageFlat', 3, '+3 damage'],
    ],
    major: [
      ['critDamage', 22, '+22% critical damage'], ['dex', 9, '+9 dexterity'],
      ['haste', 10, '+10% attack speed'], ['arrowDamage', 4, '+4 damage on every arrow'],
      ['areaPct', 10, '+10% attack area'],
    ],
  },
  {
    key: 'arcane', name: 'The Deep Study', angle: Math.PI / 2, color: '#b090ff',
    blurb: 'Power that comes out of a book and goes back into one.',
    minor: [
      ['int', 4, '+4 intellect'], ['maxMp', 18, '+18 mana'], ['spellPower', 4, '+4 spell power'],
      ['mpRegen', 0.6, '+0.6 mana a second'], ['magicResist', 6, '+6 magic resistance'],
      ['cooldownReduction', 3, 'skills come back 3% sooner'],
    ],
    major: [
      ['spellPower', 10, '+10 spell power'], ['int', 9, '+9 intellect'],
      ['cooldownReduction', 7, 'skills come back 7% sooner'], ['maxMp', 45, '+45 mana'],
      ['areaPct', 12, '+12% spell area'],
    ],
  },
  {
    key: 'wild', name: 'The Kept Company', angle: Math.PI, color: '#7ae06a',
    blurb: 'What follows you, what keeps you standing, and what you find on the way.',
    minor: [
      ['con', 4, '+4 constitution'], ['hpRegen', 1.2, '+1.2 health a second'],
      ['petDamagePct', 8, 'companions deal 8% more damage'], ['magicFind', 8, '+8% better loot'],
      ['movePct', 3, '+3% move speed'], ['goldFind', 12, '+12% gold'],
    ],
    major: [
      ['petDamagePct', 18, 'companions deal 18% more damage'], ['con', 9, '+9 constitution'],
      ['lifeSteal', 4, '4% of damage comes back as health'], ['magicFind', 20, '+20% better loot'],
      /**
       * R17 — THIS NODE MOVES YOUR FOLLOWER LIMIT NOW, NOT YOUR SUMMON COUNT.
       *
       *   "We can update 'The Kept Company' branch of the Perks menu instead of making your
       *    summoning skill summon more, to instead increase your companion limit."
       *
       * Round 16 had it granting `petSlots`, which js/skills.js added to `petCount` — how many
       * bodies one CAST put down. So casting Raise Thrall three times gave you nine thralls and
       * nothing counted what was already standing there. `followerSlots` is the one number the
       * follower book reads (js/followers.js), and it does two things with it: it raises the total
       * number of things that may walk with you, and it raises the per-type cap on a summon. A
       * mercenary, a class companion and a summoned wolf all take one of the same slots.
       */
      ['followerSlots', 1, 'one more follower may walk with you — and one more of each thing you summon'],
    ],
  },

  // ------------------------------------------------------------------ round 16: the four corners
  //
  // The four originals point at the compass points, so the corners were empty and the tree was a
  // cross rather than a wheel. Two of these were asked for by name — loot and defence — and the
  // other two were picked by reading `rpg.derive` and asking which live stats the first four arms
  // never once hand out. That turned out to be a long list, and it fell into two clean piles:
  //
  //   * coming BACK from a fight: hpOnKill, manaOnKill, barrier, manaSteal — all read by the game
  //     (`rpg.onKillRestore`, js/main.js's out-of-fight tick, `rpg.strike`) and none of them
  //     reachable anywhere in the forest. `The Slow Mend` is that pile.
  //   * not being where the hit lands, and seeing trouble first: stealth, revealRange, movePct,
  //     dodge — `stealth` and `revealRange` in particular were computed every frame and granted by
  //     no perk at all. `The Light Step` is that pile.
  //
  // No building, holding or industry stats anywhere in here: "perks are RPG mode features".

  {
    key: 'guard', name: 'The Held Line', angle: -Math.PI * 3 / 4, color: '#c8d2dc',
    blurb: 'Armour, a shield, and the patience to be the one who does not move.',
    minor: [
      ['armor', 8, '+8 armour'], ['maxHp', 26, '+26 health'],
      ['magicResist', 7, '+7 magic resistance'], ['blockChance', 4, '+4% chance to block'],
      ['blockPower', 6, 'a block stops 6 more damage'], ['con', 4, '+4 constitution'],
    ],
    major: [
      ['armorPct', 14, '+14% armour'],
      ['resistAll', 4, 'everything that hits you lands 4% softer'],
      ['blockPower', 14, 'a block stops 14 more damage'],
      // A barrier is a second health bar that refills itself out of a fight (js/main.js tops it up
      // by 8% of its size a second once nothing is swinging at you), so it is the one defensive
      // number that does not need a healer to be worth anything.
      ['barrier', 40, '+40 barrier, which fills itself back up between fights'],
      ['maxHp', 60, '+60 health'],
    ],
  },
  /**
   * THE LOOT ARM, AND THE ONE STAT THAT IS NOT IN IT.
   *
   * `goldFind` is the obvious first pick and it is NOT here, because it does nothing. It is
   * declared in `rpg.derive`, granted by an affix, rounded, and printed on the character sheet as
   * "Gold find +35%" — and not one of the eleven places in js/main.js and js/town.js that does
   * `player.gold += …` multiplies by it. Putting it on six perk nodes would have been six lies on
   * the one screen a player reads carefully, which is the mistake `petSlots` and Volley were both
   * already caught making in this file. It is written up in the round-16 report instead, because
   * turning it on is a change to js/main.js and this round only owns js/perks.js.
   *
   * What is left is everything that genuinely fires: `magicFind` (rpg.rarityFor, so it lifts the
   * rarity of every drop, chest and craft), `xpFind` (rpg.gainXp), `scavengeChance` (js/main.js
   * asks fx.sum('scavenge') on every kill), `revealRange` (the minimap's span) and `lightRange`
   * (the reach of a lamp you are carrying — no lamp, no effect, so the line says "lamp").
   */
  {
    key: 'fortune', name: 'The Long Odds', angle: Math.PI * 3 / 4, color: '#f2c94c',
    blurb: 'What the dead leave behind, and how much of it you notice.',
    minor: [
      ['magicFind', 10, '+10% better loot'], ['xpFind', 6, '+6% experience'],
      ['scavengeChance', 0.05, 'one kill in twenty leaves crafting material behind'],
      ['lightRange', 8, 'your lamp reaches 8 m further'],
      ['magicFind', 14, '+14% better loot'], ['xpFind', 10, '+10% experience'],
    ],
    major: [
      ['magicFind', 24, '+24% better loot'], ['xpFind', 16, '+16% experience'],
      ['scavengeChance', 0.1, 'one kill in ten leaves crafting material behind'],
      ['magicFind', 30, '+30% better loot'],
      ['revealRange', 0.2, 'the minimap shows 20% more ground'],
    ],
  },
  {
    key: 'mend', name: 'The Slow Mend', angle: -Math.PI / 4, color: '#ef6b8d',
    blurb: 'Nothing here makes a hit hurt less. It makes what the hit cost you come back.',
    minor: [
      ['hpRegen', 1.4, '+1.4 health a second'],
      ['lifeSteal', 3, '3% of the damage you deal comes back as health'],
      ['manaSteal', 3, '3% of the damage you deal comes back as mana'],
      ['mpRegen', 0.8, '+0.8 mana a second'],
      ['hpOnKill', 6, 'every kill puts 6 health back'], ['con', 4, '+4 constitution'],
    ],
    major: [
      ['lifeSteal', 7, '7% of the damage you deal comes back as health'],
      ['hpRegen', 3, '+3 health a second'],
      ['hpOnKill', 18, 'every kill puts 18 health back'],
      ['manaOnKill', 12, 'every kill puts 12 mana back'],
      ['manaSteal', 8, '8% of the damage you deal comes back as mana'],
    ],
  },
  {
    key: 'rove', name: 'The Light Step', angle: Math.PI / 4, color: '#3fd0c0',
    blurb: 'Ground covered, ground seen, and the hits that never land.',
    minor: [
      ['movePct', 5, '+5% move speed'], ['dodge', 4, '+4% dodge'],
      // `stealth` is a fraction: js/actors.js narrows an enemy's notice range to `1 - stealth` of
      // what it was, and will not take it below a quarter however much you stack.
      ['stealth', 0.05, 'enemies notice you 5% later'],
      ['revealRange', 0.1, 'the minimap shows 10% more ground'],
      ['movePct', 8, '+8% move speed'], ['dex', 4, '+4 dexterity'],
    ],
    major: [
      ['movePct', 12, '+12% move speed'], ['dodge', 9, '+9% dodge'],
      ['stealth', 0.15, 'enemies notice you 15% later'],
      ['revealRange', 0.25, 'the minimap shows 25% more ground'],
      ['dex', 9, '+9 dexterity'],
    ],
  },
];

/** Nodes that belong to nobody, scattered between the arms. */
export const ODDBALLS = [
  /**
   * R16 — THIS WAS A 600% REFLECT.
   *
   * `thorns` is a SHARE of the damage that got through (js/rpg.js:1323 does `amount * share`; every
   * enemy in data/enemies.json that carries it carries 0.28), and this oddball shipped `6`. So one
   * wildcard node reflected six times everything that hit you, which is not a perk, it is a win
   * button. The id has not changed, so nobody loses the point they spent on it.
   */
  { stat: 'thorns', value: 0.06, desc: 'attackers take back 6% of what they dealt' },
  { stat: 'manaSteal', value: 4, desc: '4% of damage comes back as mana' },
  { stat: 'dodge', value: 4, desc: '+4% dodge' },
  { stat: 'xpFind', value: 8, desc: '+8% experience' },
  { stat: 'movePct', value: 5, desc: '+5% move speed' },
  { stat: 'resistAll', value: 5, desc: '+5% resistance to everything' },
  { stat: 'lightRange', value: 12, desc: 'your light reaches 12 m further' },
  { stat: 'areaPct', value: 6, desc: '+6% attack area' },
];

/**
 * Talent nodes: the ones that change a rule rather than a number.
 *
 * Deliberately NOT stats. Each one is a flag the rest of the game reads, so adding one means
 * teaching exactly one system something new, and the tree stays a list of decisions rather than a
 * second stat sheet.
 */
export const TALENT_NODES = [
  { id: 'riposte', arm: 'melee', name: 'Riposte', desc: 'Blocking or dodging a hit makes your next swing a guaranteed critical.', flag: 'riposte' },
  { id: 'sunder', arm: 'melee', name: 'Sunder', desc: 'The last swing of every weapon pattern strips 8 armour, and the armour does not come back.', flag: 'sunder' },
  /**
   * VOLLEY was `flag: 'volley'` — "every fourth shot is two arrows" — and the flag was read by
   * nothing, because nothing counts your shots. `arrowsPerShot` is a real number that js/main.js
   * already reads when it looses an arrow, so the node grants that instead and the line says so.
   */
  // (`flag` is kept on every node because tests/weapons.test.js asserts one; for Volley, Echo and
  // Scavenger the GRANT is what does the work and the flag is just the node's name.)
  { id: 'volley', arm: 'ranged', name: 'Volley', desc: 'Every shot looses one more arrow.', flag: 'volley', grants: { arrowsPerShot: 1 } },
  { id: 'mark', arm: 'ranged', name: 'Quarry', desc: 'The first hit on a target marks it for 8 seconds: it takes 15% more damage from everything.', flag: 'mark' },
  { id: 'cauterise', arm: 'arcane', name: 'Cauterise', desc: 'A critical hit also burns, for a quarter of its damage over four seconds.', flag: 'cauterise' },
  { id: 'echo', arm: 'arcane', name: 'Echo', desc: 'One skill cast in six fires a second time, free.', flag: 'echo', grants: { echoChance: 1 / 6 } },
  { id: 'pack', arm: 'wild', name: 'Pack Sense', desc: 'Your companions heal you for a tenth of the damage they deal.', flag: 'pack' },
  { id: 'scavenge', arm: 'wild', name: 'Scavenger', desc: 'One kill in five leaves crafting material behind.', flag: 'scavenge', grants: { scavengeChance: 0.2 } },

  /**
   * ROUND 16'S EIGHT, AND WHY THEY ARE ALL NUMBERS.
   *
   * The four original arms have talents that change a RULE — Riposte arms a guaranteed critical,
   * Sunder strips armour that never comes back — and each of those is a `flag` with a reader
   * somewhere else: `rpg.strike` for Riposte and Quarry, js/main.js for Sunder, js/skills.js for
   * Blood Price. A flag with no reader is the exact failure this file has been bitten by twice
   * (see Volley and `petSlots` above): the node says something and does nothing.
   *
   * These eight were written without touching any other file, so every one of them does its work
   * through `grants` — real `derived` keys with real readers — and every line says only what the
   * grant actually does. Six flags that WOULD make better talents are written up in the round-16
   * report rather than shipped as promises: a block that staggers, a killing blow that refills a
   * barrier, a chest that opens one rarity higher, a first hit out of stealth that always crits.
   */
  { id: 'bulwark', arm: 'guard', name: 'Bulwark', desc: 'You get your shield in the way far more often: +12% chance to block, and a block stops 22 more damage.', flag: 'bulwark', grants: { blockChance: 12, blockPower: 22 } },
  // `thorns` is a SHARE of the damage that got through, not a flat number — js/rpg.js does
  // `reflected = amount * share`, and the enemies that carry it in data/enemies.json carry 0.28.
  { id: 'spite', arm: 'guard', name: 'Spite', desc: 'Anything that hits you takes back 12% of what it dealt.', flag: 'spite', grants: { thorns: 0.12 } },

  { id: 'pickings', arm: 'fortune', name: 'Rich Pickings', desc: 'Everything that drops rolls better, and you learn more from everything you put down: +30% better loot and +15% experience.', flag: 'pickings', grants: { magicFind: 30, xpFind: 15 } },
  { id: 'gleaner', arm: 'fortune', name: 'Gleaner', desc: 'One kill in four leaves crafting material behind, and +15% better loot on top.', flag: 'gleaner', grants: { scavengeChance: 0.25, magicFind: 15 } },

  { id: 'long_breath', arm: 'mend', name: 'Long Breath', desc: 'You mend as you walk: +4 health and +2 mana a second, in a fight or out of one.', flag: 'longBreath', grants: { hpRegen: 4, mpRegen: 2 } },
  { id: 'red_harvest', arm: 'mend', name: 'Red Harvest', desc: 'Every kill puts 25 health and 15 mana back.', flag: 'redHarvest', grants: { hpOnKill: 25, manaOnKill: 15 } },

  { id: 'unseen', arm: 'rove', name: 'Unseen', desc: 'Enemies notice you 30% later, and you see 20% more of the map before they do.', flag: 'unseen', grants: { stealth: 0.3, revealRange: 0.2 } },
  { id: 'long_stride', arm: 'rove', name: 'Long Stride', desc: 'You move 18% faster and slip 6% more of what is swung at you.', flag: 'longStride', grants: { movePct: 18, dodge: 6 } },
];

/**
 * Keystones: one at the end of each arm, and they change how the game is played.
 *
 * "Keystones that do something significant to gameplay." Each one has a cost as well as a gift,
 * because a keystone you would always take is a stat node with a bigger circle.
 */
export const KEYSTONES = [
  {
    /**
     * The keystone that lets you carry two two-handers.
     *
     * Renamed from the name it shipped with, which was lifted straight out of another game's talent
     * tree — the playground's one hard content rule is that nothing player-facing borrows a name
     * from somebody else's game. `RENAMED_PERKS` below keeps a save made under the old id working.
     */
    id: 'doubled_grasp', arm: 'melee', name: 'Doubled Grasp', flag: 'doubleGrip',
    desc: 'You can hold a two-handed weapon in each hand, and every swing covers 18% more ground.',
    cost: '−20% attack speed.',
    grants: { haste: -20, areaPct: 18 },
  },
  {
    id: 'far_shot', arm: 'ranged', name: 'Far Shot', flag: 'farShot',
    desc: 'Arrows and bolts deal up to 50% more damage the further they have flown, and +5% critical chance.',
    cost: 'Anything within four metres of you takes 25% less.',
    grants: { critChance: 5 },
  },
  {
    id: 'blood_magic', arm: 'arcane', name: 'Blood Price', flag: 'bloodMagic',
    desc: 'Skills are paid for in health instead of mana, and never fail for want of it. +14 spell power.',
    cost: 'Your mana pool stops mattering, and a skill can leave you on 1 health.',
    grants: { spellPower: 14 },
  },
  {
    // The old line also promised the pack "take a third of everything aimed at you", which nothing
    // in the game did — an enemy picks its own target in js/actors.js. Cut rather than left lying.
    // R17 — and the keystone at the end of the same arm moved with it. "Calls up two more
    // companions" was the same promise as the node above and had the same problem: it added to a
    // cast rather than to a limit. Two more FOLLOWER SLOTS is a much bigger thing — five at level
    // one instead of three — and it raises the per-type cap on every summon by two on top.
    id: 'the_pack', arm: 'wild', name: 'The Pack', flag: 'thePack',
    desc: 'Two more followers may walk with you, two more of each thing you summon, and all of them deal 20% more damage.',
    cost: 'You deal 15% less damage yourself.',
    grants: { followerSlots: 2, petDamagePct: 20, damagePct: -15 },
  },

  /**
   * ROUND 16'S FOUR. Same rule as the talents above: no new flag, because a flag nobody reads is a
   * keystone that does nothing. Each one's COST is a negative grant on a stat the game already
   * reads, which is honest in a way "and you take more damage" written in prose is not — the
   * penalty is in the same arithmetic as the gift and shows up on the sheet next to it.
   */
  {
    id: 'held_ground', arm: 'guard', name: 'Held Ground', flag: 'heldGround',
    desc: 'You are a wall: +40% armour, everything lands 10% softer, and a block stops 25 more damage.',
    cost: 'You move a quarter slower — there is no walking away from a fight you have started.',
    grants: { armorPct: 40, resistAll: 10, blockPower: 25, movePct: -25 },
  },
  {
    id: 'fortunes_tithe', arm: 'fortune', name: "Fortune's Tithe", flag: 'fortunesTithe',
    desc: 'Everything you kill pays out: +70% better loot, and one kill in five leaves crafting material behind.',
    cost: 'You deal 12% less damage — your eye is on the ground rather than on the fight.',
    grants: { magicFind: 70, scavengeChance: 0.2, damagePct: -12 },
  },
  {
    id: 'slow_blood', arm: 'mend', name: 'Slow Blood', flag: 'slowBlood',
    desc: '14% of the damage you deal comes back as health, and you mend 5 a second on top of it.',
    cost: 'Your health pool is 70 smaller. You live on what comes back, not on what you had.',
    grants: { lifeSteal: 14, hpRegen: 5, maxHp: -70 },
  },
  {
    id: 'wind_walk', arm: 'rove', name: 'Wind Walk', flag: 'windWalk',
    desc: '+30% move speed, +15% dodge, and enemies notice you 25% later.',
    cost: 'Your armour counts for a third less — nothing that does land is softened.',
    grants: { movePct: 30, dodge: 15, stealth: 0.25, armorPct: -35 },
  },
];

// ---------------------------------------------------------------------------- building the tree

/**
 * Rings of the forest, outward from the hub — evenly spaced, one unit apart.
 *
 * THE LADDER STARTS AT 2, NOT 1, AND THAT IS ROUND 16'S DOING. Eight arms of three nodes each put
 * 24 nodes on the innermost ring, and on a circle of radius 1 that is one node every 0.26 units —
 * closer together than a node is wide on screen, so the first ring would have been a solid bracelet
 * of touching dots with overlapping click targets. Pushing the whole ladder out one unit gives the
 * inner ring the same 0.52-unit gap it had with four arms, and costs nothing anywhere else: the
 * screen fits the tree to the widest node it can find (`hud.perkView`), the guide circles are
 * `RINGS.map(r => r.radius)`, and a node's id is `<arm>:<ring>:<i>` — so no save moves and no
 * player loses a point over it.
 */
export const RINGS = [
  { at: 1, radius: 2, kind: 'minor', per: 3 },
  { at: 2, radius: 3, kind: 'minor', per: 4 },
  { at: 3, radius: 4, kind: 'major', per: 3 },
  { at: 4, radius: 5, kind: 'minor', per: 4 },
  { at: 5, radius: 6, kind: 'talent', per: 2 },
  { at: 6, radius: 7, kind: 'major', per: 3 },
  { at: 7, radius: 8, kind: 'keystone', per: 1 },
];

/**
 * THE SHAPE OF THE FOREST IS A LATTICE, NOT A SCATTER.
 *
 * It used to place every node at `ring.radius + wobble * 0.22` and `arm.angle + wobble * 0.18`, which
 * read as "randomly scattered" on screen and made two nodes on neighbouring rings sit almost on top
 * of one another. There is no jitter now at all: rings are whole units out from the hub, and a ring's
 * nodes sit on exactly even angular steps, centred on their arm.
 *
 * The step is the smaller of two rules, so it is tidy at both ends of the tree:
 *
 *   * `TANGENT_GAP / radius` keeps the GAP BETWEEN NEIGHBOURS the same however far out you are, so
 *     ring 6 does not fan out into a wall of dots;
 *   * `ARM_SECTOR / per` keeps an arm inside its own SLICE of the circle, so ring 1 — where the
 *     first rule wants 49° between three nodes — cannot spill into the arm next door.
 */
const TANGENT_GAP = 0.85;          // world units between neighbours on a ring

/**
 * HOW WIDE ONE ARM'S SLICE IS — AND IT IS COUNTED, NEVER TYPED.
 *
 * This was the hard-coded `Math.PI / 2` ("a quarter each, four arms") right up until round 16 put
 * four more arms in the corners, at which point every arm was still laying its nodes out across a
 * quarter of the circle while only owning an eighth of it — so every ring would have had its
 * neighbours' nodes sitting inside it. Dividing the whole circle by the number of arms there
 * actually are means the next arm anybody adds narrows everyone's slice on its own, and the two
 * numbers can never disagree again.
 */
const ARM_SECTOR = Math.PI * 2 / ARMS.length;

/** The exact angular step between two neighbours on one ring of one arm. */
export function ringStep(radius, per) {
  if (per <= 1) return 0;
  return Math.min(TANGENT_GAP / Math.max(0.5, radius), ARM_SECTOR / per);
}

/**
 * Grow the forest.
 *
 * Every class gets the same one — "it should be the same for every class starting from the center" —
 * so what separates two characters is where they walked, not what they were handed.
 */
export function buildForest() {
  const nodes = [];
  const links = [];
  const byId = new Map();

  const add = node => { nodes.push(node); byId.set(node.id, node); return node; };
  const link = (a, b) => { if (a && b && a !== b) links.push([a.id, b.id]); };

  // the hub. Free, always taken, and the only thing everything else grows out of.
  const start = add({
    id: 'start', kind: 'hub', name: 'Where you began', x: 0, y: 0,
    desc: 'Every road out of here costs the same. What it costs is the walking.',
    grants: {}, arm: null, ring: 0,
  });

  for (const arm of ARMS) {
    let previousRing = [start];
    for (const ring of RINGS) {
      const made = [];
      const step = ringStep(ring.radius, ring.per);
      for (let i = 0; i < ring.per; i++) {
        // centred on the arm: three nodes sit at -step, 0, +step, four at -1.5, -0.5, +0.5, +1.5
        const angle = arm.angle + (i - (ring.per - 1) / 2) * step;
        const radius = ring.radius;
        const id = `${arm.key}:${ring.at}:${i}`;
        const node = { id, arm: arm.key, ring: ring.at, kind: ring.kind, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };

        if (ring.kind === 'minor') {
          const [stat, value, desc] = arm.minor[(i + ring.at) % arm.minor.length];
          Object.assign(node, { name: desc, desc, grants: { [stat]: value } });
        } else if (ring.kind === 'major') {
          const [stat, value, desc] = arm.major[(i + ring.at) % arm.major.length];
          Object.assign(node, { name: desc, desc, grants: { [stat]: value }, major: true });
        } else if (ring.kind === 'talent') {
          const pool = TALENT_NODES.filter(t => t.arm === arm.key);
          const t = pool[i % pool.length];
          // `grants` as well as `flag`: Volley and Scavenger turned out to be better as a number the
          // game already reads than as a flag nothing looked at. See TALENT_NODES.
          Object.assign(node, { name: t.name, desc: t.desc, grants: { ...(t.grants || {}) }, flag: t.flag || null, talentId: t.id });
        } else {
          const k = KEYSTONES.find(x => x.arm === arm.key);
          Object.assign(node, {
            name: k.name, desc: k.desc, cost: k.cost, grants: k.grants || {},
            flag: k.flag, keystoneId: k.id,
          });
        }
        add(node);
        made.push(node);
      }
      // join each new node to the nearest one behind it, so every node has a way in
      for (const node of made) {
        let best = null, bd = Infinity;
        for (const prev of previousRing) {
          const d = Math.hypot(prev.x - node.x, prev.y - node.y);
          if (d < bd) { bd = d; best = prev; }
        }
        link(best, node);
      }
      // …and to its neighbour in the same ring, so an arm is a web rather than a comb
      for (let i = 1; i < made.length; i++) link(made[i - 1], made[i]);
      previousRing = made;
    }
  }

  /**
   * The oddballs, sitting BETWEEN the arms, joined to whatever is nearest on either side. They are
   * the reason a pure melee walk still passes something strange.
   *
   * THEY HAVE NOW BEEN MOVED TWICE FOR THE SAME REASON, SO STOP WRITING THE ANGLE DOWN.
   *
   * The first layout was `i / 8 * 2π + π/4`, which put four of the eight EXACTLY ON the four arm
   * centrelines at radius 3.5 — on top of ring-3 and ring-4 arm nodes, the opposite of "between the
   * arms". The fix sent them down the four diagonals instead, π/4 off every arm. Round 16 then put
   * four new arms AT those diagonals, and the fix was the bug again: eight oddballs sitting
   * precisely on four new arm centrelines, which is the thing the last comment was written about.
   *
   * A hard-coded angle in a file whose whole shape is generated was always going to come back. So
   * an oddball goes on a SEAM now: half way between one arm and the next, wherever those happen to
   * be. Eight arms make eight seams, which is one oddball each, and they alternate between two
   * radii taken from the GAPS BETWEEN RINGS so an oddball is never on a ring either. Move an arm,
   * add an arm, move a ring — the oddballs get out of the way on their own.
   */
  const seam = Math.PI * 2 / ARMS.length;
  const radiusOf = at => RINGS.find(r => r.at === at)?.radius ?? at;
  const between = (a, b) => (radiusOf(a) + radiusOf(b)) / 2;
  // the same two depths as before, expressed as "just past ring 3" and "just past ring 5"
  const ODD_SPOTS = [{ ring: 3, radius: between(3, 4) }, { ring: 5, radius: between(5, 6) }];
  for (let i = 0; i < ODDBALLS.length; i++) {
    const o = ODDBALLS[i];
    const angle = ARMS[i % ARMS.length].angle + seam / 2;
    const spot = ODD_SPOTS[i % ODD_SPOTS.length];
    const radius = spot.radius;
    const node = add({
      id: `wildcard:${i}`, arm: null, ring: spot.ring, kind: 'minor', oddball: true,
      x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      name: o.desc, desc: o.desc, grants: { [o.stat]: o.value },
    });
    // the two nearest non-oddball nodes, which will be on different arms
    const near = nodes
      .filter(n => n !== node && !n.oddball && n.id !== 'start')
      .map(n => ({ n, d: Math.hypot(n.x - node.x, n.y - node.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { n } of near) link(n, node);
  }

  const neighbours = new Map();
  for (const [a, b] of links) {
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a).push(b);
    neighbours.get(b).push(a);
  }

  return { nodes, links, byId, neighbours, start };
}

// ---------------------------------------------------------------------------- spending points

/** How many points a character has to spend at this level, total. */
export function pointsFor(level = 1) {
  // one a level, plus one more every fifth — so the late tree opens faster than the early one
  return Math.max(0, (level - 1) + Math.floor((level - 1) / 5));
}

/** Which nodes are taken. The hub is always taken and costs nothing. */
/**
 * A note on renaming a keystone, since this round did one.
 *
 * What a player's save holds is the NODE id — `melee:7:0`, which is where the node sits in the
 * forest, not what it is called — and `keystoneId`/`name` hang off that. So renaming a keystone
 * costs nobody their point. Moving one to a different ring or a different arm WOULD, and that is
 * the change to be careful with.
 */
export function takenOf(player) {
  const taken = new Set(player?.perks || []);
  taken.add('start');
  return taken;
}

export function spentBy(player) {
  return (player?.perks || []).filter(id => id !== 'start').length;
}

/** Points left. */
export function pointsLeft(player) {
  return pointsFor(player?.level ?? 1) - spentBy(player);
}

/**
 * EVERY EDGE OF ONE NODE — and the only place anything is allowed to ask.
 *
 *   "I took the perk from the '8% Experience' which is connected to 'Companions deal 18% more
 *    damage' and '18% critical damage', but it appears the node is not actually connected to these
 *    when it comes to unlocking the next node. However there is a line connecting them, what's the
 *    deal?"
 *
 * The line the player was reading was not an edge at all — it was one of the faint guide circles the
 * canvas drew at each ring radius, in the same weight and almost the same colour as a real link. All
 * three of those nodes sit at radius 3, so the ring-3 circle threads through the lot of them and
 * reads as a connection. The forest itself was right the whole time.
 *
 * The screen now asks THIS function what a node touches, and draws exactly that and nothing else, so
 * a line on the canvas and an unlock can no longer mean different things. Names come back with the
 * ids because both callers want to write them out.
 */
export function linksOf(forest, id) {
  return (forest?.neighbours?.get(id) || []).map(other => forest.byId.get(other)).filter(Boolean);
}

/**
 * Can this node be taken right now?
 *
 * A node is reachable when one of its neighbours is already taken — which is the whole rule, and
 * the whole reason the tree's SHAPE is the cost.
 */
export function canTake(player, forest, id) {
  const node = forest.byId.get(id);
  if (!node) return { ok: false, why: 'No such perk.' };
  const taken = takenOf(player);
  if (taken.has(id)) return { ok: false, why: 'You already have that one.' };
  if (pointsLeft(player) <= 0) return { ok: false, why: 'No points left. Come back a level from now.' };
  const near = forest.neighbours.get(id) || [];
  if (!near.some(n => taken.has(n))) return { ok: false, why: 'Nothing you have taken connects to it yet.' };
  return { ok: true, node };
}

/** Spend a point. Returns `{ ok }` or `{ ok: false, why }`. */
export function allocate(player, forest, id) {
  const check = canTake(player, forest, id);
  if (!check.ok) return check;
  player.perks = player.perks || [];
  player.perks.push(id);
  return { ok: true, node: check.node };
}

/**
 * Give every point back.
 *
 * Still here, and still the way out of a walk you regret wholesale — see `canRefund` for the one
 * node at a time version.
 */
export function refundAll(player) {
  const spent = spentBy(player);
  player.perks = [];
  return spent;
}

/**
 * Which of your taken nodes would be cut off from the hub if this one went back?
 *
 * The old code refused single refunds altogether, because "taking a single node out of the middle of
 * a walk can orphan everything past it". That is true of a node in the middle of a walk and false of
 * the node on the end of one, and the player is asking for the end of one: "can you allow resetting
 * a single perk, as long as nothing requires it". So work out which it is rather than guessing —
 * walk the taken nodes out from the hub with this one removed, and anything the walk never reaches
 * is what requires it.
 */
export function orphanedBy(player, forest, id) {
  const taken = takenOf(player);
  if (!taken.has(id) || id === 'start') return [];
  const left = new Set(taken);
  left.delete(id);
  const seen = new Set(['start']);
  const queue = ['start'];
  while (queue.length) {
    const at = queue.pop();
    for (const next of forest.neighbours.get(at) || []) {
      if (!left.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...left].filter(other => other !== 'start' && !seen.has(other))
    .map(other => forest.byId.get(other)).filter(Boolean);
}

/** Can this one node go back? `why` is what the screen prints when it cannot. */
export function canRefund(player, forest, id) {
  const node = forest.byId.get(id);
  if (!node) return { ok: false, why: 'No such perk.' };
  if (id === 'start') return { ok: false, why: 'Where you began costs nothing and cannot be given back.' };
  if (!takenOf(player).has(id)) return { ok: false, why: 'You have not taken that one.' };
  const cut = orphanedBy(player, forest, id);
  if (cut.length) {
    const names = cut.slice(0, 3).map(n => n.name || n.id).join(', ');
    return {
      ok: false, node, orphans: cut,
      why: cut.length === 1
        ? `${names} only reaches the middle through this one. Give that one back first.`
        : `${cut.length} perks reach the middle through this one — ${names}${cut.length > 3 ? ' and others' : ''}. Give those back first.`,
    };
  }
  return { ok: true, node, orphans: [] };
}

/** Hand one point back. Returns `{ ok }` or `{ ok: false, why }`. */
export function refundOne(player, forest, id) {
  const check = canRefund(player, forest, id);
  if (!check.ok) return check;
  player.perks = (player.perks || []).filter(taken => taken !== id);
  return { ok: true, node: check.node };
}

// ---------------------------------------------------------------------------- what it all adds up to

/**
 * Everything the taken nodes grant: the stat bag, the talent flags and the keystones.
 *
 * `stats` keys are `derived` field names, so `rpg.refresh` can fold them in without a translation
 * table. `flags` is what the combat code asks — `flags.riposte`, `flags.doubleGrip`.
 */
export function perkBonuses(player, forest) {
  const stats = {};
  const flags = {};
  const talents = [];
  const keystones = [];
  for (const id of takenOf(player)) {
    const node = forest.byId.get(id);
    if (!node) continue;
    for (const [stat, value] of Object.entries(node.grants || {})) {
      stats[stat] = (stats[stat] || 0) + value;
    }
    if (node.flag) flags[node.flag] = true;
    if (node.talentId) talents.push(node.talentId);
    if (node.keystoneId) keystones.push(node.keystoneId);
  }
  return { stats, flags, talents, keystones };
}

/** A short line for the sheet: how far down each arm you have walked. */
export function armProgress(player, forest) {
  const taken = takenOf(player);
  const out = {};
  for (const arm of ARMS) out[arm.key] = 0;
  for (const id of taken) {
    const node = forest.byId.get(id);
    if (node?.arm) out[node.arm]++;
  }
  return out;
}
