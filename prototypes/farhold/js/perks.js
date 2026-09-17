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
// **The tree is generated, not hand-placed.** Four arms out of a central hub, each with three rings
// of nodes, plus a scatter of oddballs between the arms and a keystone at the end of every arm. That
// gives a consistent shape at any size and means the layout, the reachability rules and the
// allocation maths can all be tested without a browser.
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
 * The four arms, and the oddball ring between them.
 *
 * Each arm has its own stat vocabulary, so walking down one is a build rather than a shopping list.
 * "Some oddballs mixed around too" is the `wild` pool: nodes that belong to nobody, sitting between
 * the arms, which is how a melee character ends up with a companion perk they had to reach for.
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
      ['petDamagePct', 8, 'companions hit 8% harder'], ['magicFind', 8, '+8% better loot'],
      ['movePct', 3, '+3% move speed'], ['goldFind', 12, '+12% gold'],
    ],
    major: [
      ['petDamagePct', 18, 'companions hit 18% harder'], ['con', 9, '+9 constitution'],
      ['lifeSteal', 4, '4% of damage comes back as health'], ['magicFind', 20, '+20% better loot'],
      ['petSlots', 1, 'one more companion follows you'],
    ],
  },
];

/** Nodes that belong to nobody, scattered between the arms. */
export const ODDBALLS = [
  { stat: 'thorns', value: 6, desc: 'attackers take 6 damage' },
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
  { id: 'riposte', arm: 'melee', name: 'Riposte', desc: 'Blocking or dodging leaves your next swing a guaranteed critical.', flag: 'riposte' },
  { id: 'sunder', arm: 'melee', name: 'Sunder', desc: 'Every third swing in a pattern strips 8 armour, and it stays off.', flag: 'sunder' },
  { id: 'volley', arm: 'ranged', name: 'Volley', desc: 'Every fourth shot is two arrows.', flag: 'volley' },
  { id: 'mark', arm: 'ranged', name: 'Quarry', desc: 'The first arrow into a target marks it: everything takes 15% more while the mark holds.', flag: 'mark' },
  { id: 'cauterise', arm: 'arcane', name: 'Cauterise', desc: 'A critical hit burns for a quarter of its damage again over four seconds.', flag: 'cauterise' },
  { id: 'echo', arm: 'arcane', name: 'Echo', desc: 'A skill has a one-in-six chance to cast itself a second time for free.', flag: 'echo' },
  { id: 'pack', arm: 'wild', name: 'Pack Sense', desc: 'Your companions heal you for a tenth of what they deal.', flag: 'pack' },
  { id: 'scavenge', arm: 'wild', name: 'Scavenger', desc: 'Anything you kill has a one-in-five chance to leave crafting material.', flag: 'scavenge' },
];

/**
 * Keystones: one at the end of each arm, and they change how the game is played.
 *
 * "Keystones that do something significant to gameplay." Each one has a cost as well as a gift,
 * because a keystone you would always take is a stat node with a bigger circle.
 */
export const KEYSTONES = [
  {
    id: 'titan_grip', arm: 'melee', name: "Titan's Grip", flag: 'titanGrip',
    desc: 'You can hold a two-handed weapon in each hand. They swing slower, and they swing at everything.',
    cost: 'Attack speed −20%.',
    grants: { haste: -20, areaPct: 18 },
  },
  {
    id: 'far_shot', arm: 'ranged', name: 'Far Shot', flag: 'farShot',
    desc: 'Arrows and bolts hit harder the further they have flown, up to half again at full range.',
    cost: 'Everything within four metres of you takes a quarter less.',
    grants: { critChance: 5 },
  },
  {
    id: 'blood_magic', arm: 'arcane', name: 'Blood Price', flag: 'bloodMagic',
    desc: 'Skills cost health instead of mana, and never fail for want of it.',
    cost: 'Your mana pool is worth nothing to you.',
    grants: { spellPower: 14 },
  },
  {
    id: 'the_pack', arm: 'wild', name: 'The Pack', flag: 'thePack',
    desc: 'Two more companions follow you, and they take a third of everything aimed at you.',
    cost: 'You deal 15% less yourself.',
    grants: { petSlots: 2, petDamagePct: 20, damagePct: -15 },
  },
];

// ---------------------------------------------------------------------------- building the tree

/** Rings of the forest, outward from the hub. */
export const RINGS = [
  { at: 1, radius: 1, kind: 'minor', per: 3 },
  { at: 2, radius: 2, kind: 'minor', per: 4 },
  { at: 3, radius: 3, kind: 'major', per: 3 },
  { at: 4, radius: 4, kind: 'minor', per: 4 },
  { at: 5, radius: 5, kind: 'talent', per: 2 },
  { at: 6, radius: 6, kind: 'major', per: 3 },
  { at: 7, radius: 7.2, kind: 'keystone', per: 1 },
];

/** A little seeded noise, so the forest is not four perfectly straight spokes. */
function wobble(seed) {
  let h = 2166136261 ^ seed;
  h = Math.imul(h ^ (h >>> 13), 16777619);
  return (((h >>> 0) % 1000) / 1000 - 0.5);
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

  let seed = 1;
  for (const arm of ARMS) {
    let previousRing = [start];
    const spread = 0.62;                           // radians the arm fans across
    for (const ring of RINGS) {
      const made = [];
      for (let i = 0; i < ring.per; i++) {
        const t = ring.per === 1 ? 0.5 : i / (ring.per - 1);
        const angle = arm.angle + (t - 0.5) * spread + wobble(seed++) * 0.18;
        const radius = ring.radius + wobble(seed++) * 0.22;
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
          Object.assign(node, { name: t.name, desc: t.desc, grants: {}, flag: t.flag, talentId: t.id });
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
   * The oddballs, sitting BETWEEN the arms at ring 4, joined to whatever is nearest on either side.
   * They are the reason a pure melee walk still passes something strange.
   */
  for (let i = 0; i < ODDBALLS.length; i++) {
    const o = ODDBALLS[i];
    const angle = (i / ODDBALLS.length) * Math.PI * 2 + Math.PI / 4;
    const radius = 3.5 + wobble(seed++) * 0.4;
    const node = add({
      id: `wildcard:${i}`, arm: null, ring: 4, kind: 'minor', oddball: true,
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
 * A full refund rather than one node at a time, because taking a single node out of the middle of a
 * walk can orphan everything past it, and a tree that silently disconnects itself is worse than one
 * you have to replan.
 */
export function refundAll(player) {
  const spent = spentBy(player);
  player.perks = [];
  return spent;
}

// ---------------------------------------------------------------------------- what it all adds up to

/**
 * Everything the taken nodes grant: the stat bag, the talent flags and the keystones.
 *
 * `stats` keys are `derived` field names, so `rpg.refresh` can fold them in without a translation
 * table. `flags` is what the combat code asks — `flags.riposte`, `flags.titanGrip`.
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
