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
 *     dodge, haste, lifeSteal, manaSteal, resistAll, blockChance, damagePct, armorPct,
 *     movePct, areaPct, petDamagePct, cooldownReduction
 *   * flat: armor, magicResist, maxHp, maxMp, damageFlat, blockPower, barrier, hpOnKill,
 *     manaOnKill, hpRegen (a second), mpRegen (a second), lightRange (metres), str/dex/int/con
 *   * a FRACTION, where 0.1 means a tenth: stealth, revealRange, scavengeChance, echoChance,
 *     thorns, spellPower
 *
 * AND THE THIRD ENTRY IN EACH ROW IS WHAT THE PLAYER READS — it is the node's name AND its
 * description, so it is written as a stat line: the number, the unit, and the word the genre
 * already uses for the thing. See WORDING.md. A row whose text does not match its value is a lie
 * on the one screen a player reads carefully, so the two are checked against each other by hand
 * every time this table is touched.
 */
export const ARMS = [
  {
    key: 'melee', name: 'The Close Ground', angle: -Math.PI / 2, color: '#e07a4a',
    blurb: 'Reach, weight and the willingness to be hit.',
    minor: [
      // `str` is read in exactly one place (js/rpg.js `derive`): a HEAVY weapon's damage scales
      // 3% a point off it. It is not carry weight — Farhold has no encumbrance — so the line
      // does not promise any.
      ['str', 4, '+4 Strength (heavy weapon damage)'], ['damageFlat', 3, '+3 damage on every hit'],
      ['armor', 6, '+6 armour'],
      ['maxHp', 22, '+22 maximum health'], ['critChance', 3, '+3% critical chance'],
      ['damageFlat', 3, '+3 damage on every hit'],
    ],
    major: [
      // `damagePct` multiplies the whole damage roll, weapon dice and flat bonus together, so the
      // line says "damage" and not "weapon damage".
      ['damagePct', 8, '+8% damage'], ['str', 9, '+9 Strength (heavy weapon damage)'],
      ['armorPct', 12, '+12% armour'], ['critDamage', 18, '+18% critical damage'],
      ['areaPct', 10, '+10% attack area'],
    ],
  },
  {
    key: 'ranged', name: 'The Long Shot', angle: 0, color: '#6ab0ff',
    blurb: 'Distance, precision and the shot you only get once.',
    minor: [
      // `dex` does three things, all of them in js/rpg.js `derive`: a LIGHT or RANGED weapon's
      // damage scales 3% a point off it, and it adds 0.2% critical chance and 0.3% dodge a point.
      ['dex', 4, '+4 Dexterity (ranged and light weapon damage)'],
      ['critChance', 4, '+4% critical chance'], ['critDamage', 8, '+8% critical damage'],
      ['haste', 5, '+5% attack speed'], ['dodge', 3, '+3% dodge chance'],
      ['damageFlat', 3, '+3 damage on every hit'],
    ],
    major: [
      ['critDamage', 22, '+22% critical damage'], ['dex', 9, '+9 Dexterity (ranged and light weapon damage)'],
      ['haste', 10, '+10% attack speed'], ['arrowDamage', 4, '+4 damage on every arrow'],
      ['areaPct', 10, '+10% attack area'],
    ],
  },
  {
    key: 'arcane', name: 'The Deep Study', angle: Math.PI / 2, color: '#b090ff',
    blurb: 'Power that comes out of a book and goes back into one.',
    minor: [
      // `int` adds 2 maximum mana a point and scales a MAGIC weapon's damage 3% a point. It does
      // NOT touch `spellPower` — that is its own stat, granted on the two nodes below.
      ['int', 4, '+4 Intellect (+8 mana, wand and staff damage)'],
      ['maxMp', 18, '+18 maximum mana'],
      // `spellPower` is a fraction: js/rpg.js multiplies non-physical damage by `1 + spellPower`.
      ['spellPower', 0.04, '+4% spell damage'],
      ['mpRegen', 0.6, '+0.6 mana a second'], ['magicResist', 6, '+6 magic resistance'],
      // capped at 60% by js/skills.js, however many of these you stack
      ['cooldownReduction', 3, '−3% skill cooldowns'],
    ],
    major: [
      ['spellPower', 0.10, '+10% spell damage'], ['int', 9, '+9 Intellect (+18 mana, wand and staff damage)'],
      ['cooldownReduction', 7, '−7% skill cooldowns'], ['maxMp', 45, '+45 maximum mana'],
      ['areaPct', 12, '+12% spell area'],
    ],
  },
  {
    key: 'wild', name: 'The Kept Company', angle: Math.PI, color: '#7ae06a',
    blurb: 'What follows you, what keeps you standing, and what you find on the way.',
    minor: [
      // `con` is read in one place: 4 maximum health a point.
      ['con', 4, '+4 Constitution (+16 maximum health)'], ['hpRegen', 1.2, '+1.2 health a second'],
      ['petDamagePct', 8, '+8% companion damage'], ['magicFind', 8, '+8% magic find (better loot)'],
      ['movePct', 3, '+3% move speed'], ['goldFind', 12, '+12% gold found'],
    ],
    major: [
      ['petDamagePct', 18, '+18% companion damage'], ['con', 9, '+9 Constitution (+36 maximum health)'],
      ['lifeSteal', 4, '4% life steal'], ['magicFind', 20, '+20% magic find (better loot)'],
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
      ['followerSlots', 1, '+1 follower slot, and +1 of each thing you summon'],
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
      ['armor', 8, '+8 armour'], ['maxHp', 26, '+26 maximum health'],
      ['magicResist', 7, '+7 magic resistance'], ['blockChance', 4, '+4% chance to block'],
      ['blockPower', 6, 'A block stops 6 more damage'], ['con', 4, '+4 Constitution (+16 maximum health)'],
    ],
    major: [
      ['armorPct', 14, '+14% armour'],
      ['resistAll', 4, '+4% resistance to all damage'],
      ['blockPower', 14, 'A block stops 14 more damage'],
      // A barrier is a second health bar that refills itself out of a fight (js/main.js tops it up
      // by 8% of its size a second once nothing is swinging at you), so it is the one defensive
      // number that does not need a healer to be worth anything.
      ['barrier', 40, '+40 barrier, refilling 8% a second between fights'],
      ['maxHp', 60, '+60 maximum health'],
    ],
  },
  /**
   * THE LOOT ARM, AND THE ONE STAT THAT IS NOT IN IT.
   *
   * `goldFind` is the obvious first pick and it is NOT here, because when this arm was written the
   * stat did nothing: it was declared in `rpg.derive`, granted by an affix, rounded, printed on the
   * character sheet as "Gold find +35%" — and not one of the eleven places in js/main.js and
   * js/town.js that does `player.gold += …` multiplied by it. Putting it on six perk nodes would
   * have been six lies on the one screen a player reads carefully.
   *
   * R21 — IT IS LIVE NOW. js/main.js `foundGold` does `1 + (player.derived.goldFind || 0) / 100` on
   * every haul, so the stat pays out and The Kept Company's `+12% gold found` node is honest (found
   * gold only — a sale price is earnings and is deliberately left alone). This arm was
   * never given one back, which is a balance decision rather than a bug, so it is left alone here
   * and flagged in the round-21 report.
   *
   * The rest of the arm is everything that genuinely fires: `magicFind` (rpg.rarityFor, so it lifts
   * the rarity of every drop, chest and craft by `1 + magicFind / 100`), `xpFind` (rpg.gainXp),
   * `scavengeChance` (js/main.js asks fx.sum('scavenge') on every kill), `revealRange` (the
   * minimap's span) and `lightRange` (the reach of a lamp you are carrying — no lamp, no effect,
   * so the line says "lamp").
   */
  {
    key: 'fortune', name: 'The Long Odds', angle: Math.PI * 3 / 4, color: '#f2c94c',
    blurb: 'What the dead leave behind, and how much of it you notice.',
    minor: [
      ['magicFind', 10, '+10% magic find (better loot)'], ['xpFind', 6, '+6% experience'],
      ['scavengeChance', 0.05, '5% chance a kill leaves crafting material'],
      ['lightRange', 8, '+8 m lamp range'],
      ['magicFind', 14, '+14% magic find (better loot)'], ['xpFind', 10, '+10% experience'],
    ],
    major: [
      ['magicFind', 24, '+24% magic find (better loot)'], ['xpFind', 16, '+16% experience'],
      ['scavengeChance', 0.1, '10% chance a kill leaves crafting material'],
      ['magicFind', 30, '+30% magic find (better loot)'],
      ['revealRange', 0.2, '+20% minimap range'],
    ],
  },
  {
    key: 'mend', name: 'The Slow Mend', angle: -Math.PI / 4, color: '#ef6b8d',
    blurb: 'Nothing on this arm makes a hit hurt less. It gives back what the hit cost you.',
    minor: [
      ['hpRegen', 1.4, '+1.4 health a second'],
      // Life steal is physical weapon damage only — a swing or a fired shot. Not spells, not wands
      // and not staves. See WORDING.md.
      ['lifeSteal', 3, '3% life steal'],
      ['manaSteal', 3, '3% mana steal'],
      ['mpRegen', 0.8, '+0.8 mana a second'],
      ['hpOnKill', 6, '+6 health on every kill'], ['con', 4, '+4 Constitution (+16 maximum health)'],
    ],
    major: [
      ['lifeSteal', 7, '7% life steal'],
      ['hpRegen', 3, '+3 health a second'],
      ['hpOnKill', 18, '+18 health on every kill'],
      ['manaOnKill', 12, '+12 mana on every kill'],
      ['manaSteal', 8, '8% mana steal'],
    ],
  },
  {
    key: 'rove', name: 'The Light Step', angle: Math.PI / 4, color: '#3fd0c0',
    blurb: 'Ground covered, ground seen, and the hits that never land.',
    minor: [
      ['movePct', 5, '+5% move speed'], ['dodge', 4, '+4% dodge chance'],
      // `stealth` is a fraction: js/actors.js narrows an enemy's notice range to `1 - stealth` of
      // what it was, and will not take it below a quarter however much you stack. So the line is a
      // RANGE, not a delay — "notice you later" reads as seconds and it is metres.
      ['stealth', 0.05, '−5% enemy notice range'],
      ['revealRange', 0.1, '+10% minimap range'],
      ['movePct', 8, '+8% move speed'], ['dex', 4, '+4 Dexterity (ranged and light weapon damage)'],
    ],
    major: [
      ['movePct', 12, '+12% move speed'], ['dodge', 9, '+9% dodge chance'],
      ['stealth', 0.15, '−15% enemy notice range'],
      ['revealRange', 0.25, '+25% minimap range'],
      ['dex', 9, '+9 Dexterity (ranged and light weapon damage)'],
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
  { stat: 'thorns', value: 0.06, desc: '6% thorns — an attacker takes back 6% of the damage it dealt' },
  { stat: 'manaSteal', value: 4, desc: '4% mana steal' },
  { stat: 'dodge', value: 4, desc: '+4% dodge chance' },
  { stat: 'xpFind', value: 8, desc: '+8% experience' },
  { stat: 'movePct', value: 5, desc: '+5% move speed' },
  { stat: 'resistAll', value: 5, desc: '+5% resistance to all damage' },
  { stat: 'lightRange', value: 12, desc: '+12 m lamp range' },
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
  { id: 'riposte', arm: 'melee', name: 'Riposte', desc: 'Block or dodge a hit and your next swing is a guaranteed critical — 100% critical chance on that one swing.', flag: 'riposte' },
  { id: 'sunder', arm: 'melee', name: 'Sunder', desc: 'The last swing of every weapon pattern strips 8 armour off the target, permanently — that armour never comes back.', flag: 'sunder' },
  /**
   * VOLLEY was `flag: 'volley'` — "every fourth shot is two arrows" — and the flag was read by
   * nothing, because nothing counts your shots. `arrowsPerShot` is a real number that js/main.js
   * already reads when it looses an arrow, so the node grants that instead and the line says so.
   */
  // (`flag` is kept on every node because tests/weapons.test.js asserts one; for Volley, Echo and
  // Scavenger the GRANT is what does the work and the flag is just the node's name.)
  { id: 'volley', arm: 'ranged', name: 'Volley', desc: '+1 arrow on every shot.', flag: 'volley', grants: { arrowsPerShot: 1 } },
  { id: 'mark', arm: 'ranged', name: 'Quarry', desc: 'Your first hit on a target marks that target for 8s, and a marked target takes 15% more damage from every source.', flag: 'mark' },
  { id: 'cauterise', arm: 'arcane', name: 'Cauterise', desc: 'A critical hit also sets the target burning: 25% of that hit’s damage again, as Burning damage over 4s.', flag: 'cauterise' },
  { id: 'echo', arm: 'arcane', name: 'Echo', desc: '17% chance (1 cast in 6) that a skill fires a second time and costs no mana.', flag: 'echo', grants: { echoChance: 1 / 6 } },
  { id: 'pack', arm: 'wild', name: 'Pack Sense', desc: 'Your companions heal you for 10% of the damage they deal.', flag: 'pack' },
  { id: 'scavenge', arm: 'wild', name: 'Scavenger', desc: '20% chance a kill leaves crafting material behind.', flag: 'scavenge', grants: { scavengeChance: 0.2 } },

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
  { id: 'bulwark', arm: 'guard', name: 'Bulwark', desc: '+12% chance to block, and a block stops 22 more damage.', flag: 'bulwark', grants: { blockChance: 12, blockPower: 22 } },
  // `thorns` is a SHARE of the damage that got through, not a flat number — js/rpg.js does
  // `reflected = amount * share`, and the enemies that carry it in data/enemies.json carry 0.28.
  { id: 'spite', arm: 'guard', name: 'Spite', desc: '12% thorns — anything that hits you takes back 12% of the damage it dealt.', flag: 'spite', grants: { thorns: 0.12 } },

  { id: 'pickings', arm: 'fortune', name: 'Rich Pickings', desc: '+30% magic find and +15% experience.', flag: 'pickings', grants: { magicFind: 30, xpFind: 15 } },
  { id: 'gleaner', arm: 'fortune', name: 'Gleaner', desc: '25% chance a kill leaves crafting material behind, and +15% magic find.', flag: 'gleaner', grants: { scavengeChance: 0.25, magicFind: 15 } },

  { id: 'long_breath', arm: 'mend', name: 'Long Breath', desc: '+4 health and +2 mana a second, in a fight or out of one.', flag: 'longBreath', grants: { hpRegen: 4, mpRegen: 2 } },
  { id: 'red_harvest', arm: 'mend', name: 'Red Harvest', desc: '+25 health and +15 mana on every kill.', flag: 'redHarvest', grants: { hpOnKill: 25, manaOnKill: 15 } },

  { id: 'unseen', arm: 'rove', name: 'Unseen', desc: '−30% enemy notice range and +20% minimap range.', flag: 'unseen', grants: { stealth: 0.3, revealRange: 0.2 } },
  { id: 'long_stride', arm: 'rove', name: 'Long Stride', desc: '+18% move speed and +6% dodge chance.', flag: 'longStride', grants: { movePct: 18, dodge: 6 } },
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
    id: 'doubled_grasp', arm: 'melee', branch: 'two_weights', name: 'Doubled Grasp', flag: 'doubleGrip',
    desc: 'Hold a two-handed weapon in each hand. +18% attack area.',
    cost: '−20% attack speed.',
    grants: { haste: -20, areaPct: 18 },
  },
  /**
   * R25 — THE CLOSE GROUND'S OTHER THREE BUILDS. Each keystone is for ONE pair of hands, and both
   * halves of it — the stat grant (`when` + `whenGrants`, gated in `perkBonuses`) and the power
   * (js/effects.js `perk:*`, gated by `handsOf`) — do nothing in any other pair. So the card says
   * which hands, and the sheet's numbers move when you change weapons.
   */
  {
    id: 'full_swing', arm: 'melee', branch: 'one_weight', name: 'Full Swing', flag: 'fullSwing', power: 'perk:full_swing',
    when: 'twoOne',
    desc: 'With a two-handed weapon and nothing in the other hand: +30% damage, and every 3rd swing lands as a slam that hits everything within 3.5 metres for 60% and throws it back.',
    cost: '−12% attack speed with those hands.',
    whenGrants: { damagePct: 30, haste: -12 },
  },
  {
    id: 'flurry', arm: 'melee', branch: 'twin_edges', name: 'Flurry', flag: 'flurry', power: 'perk:flurry',
    when: 'dualOne',
    desc: 'With a one-handed weapon in each hand: +20% attack speed, and every hit has a 25% chance to land again for 50%.',
    cost: '−25% armour with those hands.',
    whenGrants: { haste: 20, armorPct: -25 },
  },
  {
    id: 'shield_wall', arm: 'melee', branch: 'sword_board', name: 'Shield Wall', flag: 'shieldWall', power: 'perk:shield_wall',
    when: 'swordBoard',
    desc: 'With a one-handed weapon and a shield: +15% chance to block, a block stops 30 more damage, and every block answers with a shockwave that hits everything within 3.2 metres for 70%.',
    cost: '−10% damage with those hands.',
    whenGrants: { blockChance: 15, blockPower: 30, damagePct: -10 },
  },
  /**
   * R25 — ONE KEYSTONE PER ELEMENT, and each one CHANGES WHAT A FIGHT LOOKS LIKE rather than adding
   * a percentage: a crowd that burns down in a chain, a death that throws shards, a spark that
   * fights for you, a poison or a curse that walks from body to body, a ring of light, a skill that
   * goes off twice. The shared cost — 20% less damage of every other kind — is what makes it a
   * choice of element rather than a free power. All the work is in js/effects.js `perk:*`.
   */
  {
    id: 'pyre_heart', arm: 'arcane', branch: 'flame_frost', name: 'Pyre Heart', flag: 'pyreHeart', power: 'perk:pyre_heart',
    desc: 'A Burning enemy that dies bursts, hitting everything within 4 metres for 80% as fire and setting it Burning — a crowd burns down in a chain. Your Burning lasts 3s longer.',
    cost: '−20% damage of every kind but fire.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'shatter', arm: 'arcane', branch: 'flame_frost', name: 'Shatter', flag: 'shatter', power: 'perk:shatter',
    desc: 'A Chilled enemy takes 30% more from you, and one that dies Chilled throws 3 shards at the nearest enemies within 7 metres for 70% each.',
    cost: '−20% damage of every kind but ice.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'storm_within', arm: 'arcane', branch: 'storm_venom', name: 'Storm Within', flag: 'stormWithin', power: 'perk:storm_within',
    desc: 'In a fight, lightning leaves you on its own every 1.5s and strikes the nearest enemy within 10 metres for 50%, Shocking it.',
    cost: '−20% damage of every kind but lightning.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'plague_bearer', arm: 'arcane', branch: 'storm_venom', name: 'Plague Bearer', flag: 'plagueBearer', power: 'perk:plague_bearer',
    desc: 'A Poisoned enemy that dies passes its poison to every enemy within 5 metres, 25% stronger each time it moves on.',
    cost: '−20% damage of every kind but poison.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'hollow_pact', arm: 'arcane', branch: 'dusk_dawn', name: 'Hollow Pact', flag: 'hollowPact', power: 'perk:hollow_pact',
    desc: 'A Cursed enemy that dies passes its curse to every enemy within 5 metres, and every hit of shadow damage you land heals you for 8% of it.',
    cost: '−20% damage of every kind but shadow.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'halo', arm: 'arcane', branch: 'dusk_dawn', name: 'Halo', flag: 'halo', power: 'perk:halo',
    desc: 'Every 2.5s in a fight a ring of light burns every enemy within 5 metres for 50% as holy and Weakens it, and every hit of holy damage you land heals you for 5% of it.',
    cost: '−20% damage of every kind but holy.',
    grants: { spellPower: 0.06 },
  },
  {
    id: 'overflow', arm: 'arcane', branch: 'inner_study', name: 'Overflow', flag: 'overflow', power: 'perk:overflow',
    desc: 'Every 3rd skill you cast goes off a second time for 60%, free. +10% spell damage.',
    cost: 'Skills cost 25% more mana.',
    grants: { spellPower: 0.10 },
  },
  {
    id: 'far_shot', arm: 'ranged', name: 'Far Shot', flag: 'farShot',
    // js/rpg.js: `away < 4 ? 0.75 : 1 + min(0.5, (away - 4) / 42 * 0.5)` — so the bonus starts at
    // 4 m and reaches its full +50% at 46 m, and both numbers are on the card.
    desc: 'An arrow or a bolt deals more damage the further it has flown: nothing extra at 4 m, up to +50% at 46 m. +5% critical chance.',
    cost: 'Anything within 4 m of you takes 25% less damage.',
    grants: { critChance: 5 },
  },
  {
    id: 'blood_magic', arm: 'arcane', branch: 'inner_study', name: 'Blood Price', flag: 'bloodMagic',
    desc: 'Skills are paid for in health instead of mana, and never fail for want of mana. +14% spell damage.',
    cost: 'Your mana pool stops mattering, and a skill can leave you on 1 health.',
    grants: { spellPower: 0.14 },      // R18 — a share, not 1400%
  },
  {
    // The old line also promised the pack "take a third of everything aimed at you", which nothing
    // in the game did — an enemy picks its own target in js/actors.js. Cut rather than left lying.
    // R17 — and the keystone at the end of the same arm moved with it. "Calls up two more
    // companions" was the same promise as the node above and had the same problem: it added to a
    // cast rather than to a limit. Two more FOLLOWER SLOTS is a much bigger thing — five at level
    // one instead of three — and it raises the per-type cap on every summon by two on top.
    id: 'the_pack', arm: 'wild', name: 'The Pack', flag: 'thePack',
    desc: '+2 follower slots, +2 of each thing you summon, and +20% companion damage.',
    cost: '−15% damage of your own.',
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
    desc: '+40% armour, +10% resistance to all damage, and a block stops 25 more damage.',
    cost: '−25% move speed — there is no walking away from a fight you have started.',
    grants: { armorPct: 40, resistAll: 10, blockPower: 25, movePct: -25 },
  },
  {
    id: 'fortunes_tithe', arm: 'fortune', name: "Fortune's Tithe", flag: 'fortunesTithe',
    desc: '+70% magic find, and 20% chance a kill leaves crafting material behind.',
    cost: '−12% damage — your eye is on the ground rather than on the fight.',
    grants: { magicFind: 70, scavengeChance: 0.2, damagePct: -12 },
  },
  {
    id: 'slow_blood', arm: 'mend', name: 'Slow Blood', flag: 'slowBlood',
    desc: '14% life steal, and +5 health a second on top.',
    cost: '−70 maximum health. You live on what comes back, not on what you had.',
    grants: { lifeSteal: 14, hpRegen: 5, maxHp: -70 },
  },
  {
    id: 'wind_walk', arm: 'rove', name: 'Wind Walk', flag: 'windWalk',
    desc: '+30% move speed, +15% dodge chance, and −25% enemy notice range.',
    // The grant is −35%, and the old line said "a third less". Say the number the grant says.
    cost: '−35% armour — nothing that does land is softened.',
    grants: { movePct: 30, dodge: 15, stealth: 0.25, armorPct: -35 },
  },
];

// ---------------------------------------------------------------------------- building the tree

/**
 * R25 — TWO ARMS BRANCH. "Change 'The Close Ground' and 'The Deep Study' to each branch into 3-5
 * separate paths, with another 3-5 nodes total."
 *
 * Past ring 6 those two arms stop being one road. Each fans out into four PATHS of three stat nodes
 * that end in the path's keystone(s): four melee builds with one keystone each, and four arcane
 * paths that end in a FORK of two keystones — seven elements and Blood Price are eight keystones,
 * and eight separate roads of four nodes would not fit in a quarter of the screen.
 *
 * The paths sit OUTSIDE ring 7, where no other arm has anything, so they can fan wider than the
 * arm's own slice without landing on a neighbour (`BRANCH_SPREAD`, checked in the round-25 test).
 *
 * THE TWO OLD KEYSTONES KEEP THEIR IDS. A save holds `melee:7:0` for Doubled Grasp and `arcane:7:0`
 * for Blood Price, so the keystone at the end of those two paths is given exactly that id; a save
 * that owned one keeps it (it sits at the end of its path now rather than straight after ring 6,
 * and every grant, flag and power still applies whether or not the path to it is walked).
 */
export const BRANCHES = {
  melee: [
    { key: 'two_weights', name: 'Two Great Weights', nodes: [['str', 5, '+5 Strength (heavy weapon damage)'], ['areaPct', 10, '+10% attack area'], ['damagePct', 8, '+8% damage']] },
    { key: 'one_weight', name: 'The Single Weight', nodes: [['critDamage', 12, '+12% critical damage'], ['str', 8, '+8 Strength (heavy weapon damage)'], ['damagePct', 8, '+8% damage']] },
    { key: 'twin_edges', name: 'Twin Edges', nodes: [['haste', 5, '+5% attack speed'], ['critChance', 4, '+4% critical chance'], ['dex', 8, '+8 Dexterity (ranged and light weapon damage)']] },
    { key: 'sword_board', name: 'Sword and Board', nodes: [['blockChance', 5, '+5% chance to block'], ['armorPct', 12, '+12% armour'], ['maxHp', 40, '+40 maximum health']] },
  ],
  arcane: [
    { key: 'flame_frost', name: 'Flame and Frost', nodes: [['spellPower', 0.05, '+5% spell damage'], ['int', 6, '+6 Intellect (+12 mana, wand and staff damage)'], ['critChance', 4, '+4% critical chance']] },
    { key: 'storm_venom', name: 'Storm and Venom', nodes: [['haste', 5, '+5% attack speed'], ['spellPower', 0.05, '+5% spell damage'], ['cooldownReduction', 4, '−4% skill cooldowns']] },
    { key: 'dusk_dawn', name: 'Dusk and Dawn', nodes: [['magicResist', 10, '+10 magic resistance'], ['spellPower', 0.05, '+5% spell damage'], ['hpRegen', 1.5, '+1.5 health a second']] },
    { key: 'inner_study', name: 'The Inner Study', nodes: [['maxMp', 30, '+30 maximum mana'], ['mpRegen', 0.8, '+0.8 mana a second'], ['spellPower', 0.06, '+6% spell damage']] },
  ],
};
/** Radians either side of the arm's centreline that the outermost path sits at. The arcane fan is
 *  wider because its paths end in PAIRS of keystones, which need the room side by side. */
export const BRANCH_SPREAD = { melee: 0.47, arcane: 0.6 };
/** The radius the first path node sits at; each step is one unit further, the keystones one more. */
const BRANCH_START = 8;
/** Angular half-gap between the two keystones at the end of an arcane path's fork. */
const FORK_HALF = 0.1;
/** The ids a save made before round 25 already holds for these two keystones. */
const LEGACY_KEYSTONE_IDS = { doubled_grasp: 'melee:7:0', blood_magic: 'arcane:7:0' };

/**
 * Which hands a melee keystone's `when` names, asked of the character's own equipment — the same
 * four shapes js/effects.js `handsOf` answers.
 */
export function handsFit(player, when) {
  if (!when) return true;
  const main = player?.equipment?.weapon, off = player?.equipment?.offhand;
  if (!main) return false;
  const offWeapon = off?.type === 'weapon';
  if (when === 'twoOne') return !!main.twoHanded && !off;
  if (when === 'dualOne') return !main.twoHanded && offWeapon && !off.twoHanded;
  if (when === 'swordBoard') return !main.twoHanded && !!off?.isShield;
  return false;
}

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
 * R25 — grow one arm's paths past ring 6: `per` paths spread evenly across ±BRANCH_SPREAD, three
 * stat nodes each (minor, major, major), then the path's keystone — or, where a path carries two,
 * a fork of two keystones side by side. The first node joins the nearest ring-6 node.
 */
function growBranches(arm, lastRing, add, link) {
  const paths = BRANCHES[arm.key];
  paths.forEach((path, p) => {
    const spread = BRANCH_SPREAD[arm.key] ?? 0.47;
    const angle = arm.angle + (paths.length > 1 ? -spread + (2 * spread) * p / (paths.length - 1) : 0);
    let prev = null;
    path.nodes.forEach(([stat, value, desc], step) => {
      const radius = BRANCH_START + step;
      const node = add({
        id: `${arm.key}:path:${path.key}:${step}`, arm: arm.key, ring: 7 + step, kind: step === 0 ? 'minor' : 'major',
        branch: path.key, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
        name: desc, desc, grants: { [stat]: value }, major: step > 0 || undefined,
      });
      if (!prev) {
        let best = null, bd = Infinity;
        for (const n of lastRing) { const d = Math.hypot(n.x - node.x, n.y - node.y); if (d < bd) { bd = d; best = n; } }
        link(best, node);
      } else link(prev, node);
      prev = node;
    });
    const stones = KEYSTONES.filter(k => k.arm === arm.key && k.branch === path.key);
    const radius = BRANCH_START + path.nodes.length;
    stones.forEach((k, i) => {
      const a = angle + (stones.length > 1 ? (i - (stones.length - 1) / 2) * 2 * FORK_HALF : 0);
      const node = add({
        id: LEGACY_KEYSTONE_IDS[k.id] || `${arm.key}:key:${k.id}`, arm: arm.key, ring: 7 + path.nodes.length, kind: 'keystone',
        branch: path.key, x: Math.cos(a) * radius, y: Math.sin(a) * radius,
        name: k.name, desc: k.desc, cost: k.cost, grants: k.grants || {}, flag: k.flag, keystoneId: k.id,
        power: k.power || null, when: k.when || null, whenGrants: k.whenGrants || null,
      });
      link(prev, node);
    });
  });
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
    desc: 'The middle of the forest. This node costs 0 points and grants nothing — every arm starts here, and 1 point moves you one node along whichever arm you pick.',
    grants: {}, arm: null, ring: 0,
  });

  for (const arm of ARMS) {
    let previousRing = [start];
    for (const ring of RINGS) {
      // R25 — a branching arm's keystones are at the ends of its paths, not on ring 7
      if (ring.kind === 'keystone' && BRANCHES[arm.key]) continue;
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
    if (BRANCHES[arm.key]) growBranches(arm, previousRing, add, link);
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
      .filter(n => n !== node && !n.oddball && !n.branch && n.id !== 'start')
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
  /**
   * R18 — `bonusPerks` IS WRITTEN FIVE TIMES AND WAS READ NOWHERE.
   *
   * A world boss (`data/worldbosses.json` `perkPoint`), a first-time landmark, a stronghold and a
   * job frame's `perk` extra all pay a perk point, and all five call sites do
   * `player.bonusPerks = (player.bonusPerks || 0) + n` and log "A perk point, for the trouble."
   * Nothing added it to the budget, so the Perks screen's badge never moved: every perk-point
   * reward in the game paid nothing while saying it had paid. `grep -rn bonusPerks js/ tests/`
   * returned only those five self-referential assignments.
   *
   * It is also now saved, because a point you earned and cannot keep is the same bug one reload
   * later — see the `perks`/`bonusPerks` pair in js/save.js.
   */
  return pointsFor(player?.level ?? 1) + (player?.bonusPerks || 0) - spentBy(player);
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
  // R21, WORDING.md rule 4: name the perk rather than saying "it". The regex in
  // tests/round11-ui.test.js moved with this string.
  if (!near.some(n => taken.has(n))) {
    return { ok: false, why: `Nothing you have taken connects to ${node.name} yet.` };
  }
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
  const powers = [];
  for (const id of takenOf(player)) {
    const node = forest.byId.get(id);
    if (!node) continue;
    for (const [stat, value] of Object.entries(node.grants || {})) {
      stats[stat] = (stats[stat] || 0) + value;
    }
    // R25 — a melee keystone's numbers only count in the hands it was written for
    if (node.whenGrants && handsFit(player, node.when)) {
      for (const [stat, value] of Object.entries(node.whenGrants)) stats[stat] = (stats[stat] || 0) + value;
    }
    if (node.flag) flags[node.flag] = true;
    if (node.talentId) talents.push(node.talentId);
    if (node.keystoneId) keystones.push(node.keystoneId);
    if (node.power) powers.push(node.power);
  }
  return { stats, flags, talents, keystones, powers };
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
