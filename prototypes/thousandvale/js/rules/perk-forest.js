// Thousandvale — the PERK FOREST (play-test 1, P6): one tree for every class, grown from the middle.
//
//   "add TALENTS ... and a PERK FOREST with several branches, much more expansive than Farhold."
//
// Farhold's forest (prototypes/farhold/js/perks.js) is 8 arms and 169 nodes; two of its arms branch.
// This one is TWELVE arms out of a central hub, six rings each, and EVERY arm then splits into 2-4
// paths that end in a keystone (~380 nodes, 45 keystones, ~70 named nodes), plus an oddball on every
// seam and a bridge between neighbouring arms at ring 4, so a build can wander sideways rather than
// only outward. The data is data/rules/perks.json; this file only lays it out and writes the cards.
//
// It is built in Farhold's SHAPE — `{ nodes, links, byId, neighbours, start }` — on purpose: Farhold's
// own `perkBonuses`, `canTake`, `allocate`, `refundOne`, `pointsFor` and `rpg.derive` all take a forest
// as an argument, so the engine hands Farhold this one (`engine.rpg.forest`) and every number a node
// grants lands in the sheet through Farhold's code, with no second copy of the arithmetic.
//
// Pure. tests/C/perks.test.mjs checks the layout (no two nodes on top of each other, everything
// reachable from the hub), the cards (written from the numbers) and that every key, flag and power
// has a reader.

import { TV_FLAG_READERS, TV_STAT_READERS } from './perk-rules.js';

/** Every stat a node may grant, as the card says it. The key IS a `derived` field (rpg.derive). */
const sgn = v => (v < 0 ? '−' : '+');
const n = v => {
  const a = Math.abs(v);
  return Number.isInteger(a) ? String(a) : String(Math.round(a * 100) / 100);
};
const pc = v => `${n(Math.round(v * 1000) / 10)}%`;                // a fraction as a percent
export const STAT_TEXT = {
  str: v => `${sgn(v)}${n(v)} Strength (heavy weapon damage)`,
  dex: v => `${sgn(v)}${n(v)} Dexterity (ranged and light weapon damage)`,
  int: v => `${sgn(v)}${n(v)} Intellect (+${n(v * 2)} mana, wand and staff damage)`,
  con: v => `${sgn(v)}${n(v)} Constitution (+${n(v * 4)} maximum health)`,
  maxHp: v => `${sgn(v)}${n(v)} maximum health`,
  maxMp: v => `${sgn(v)}${n(v)} maximum mana`,
  armor: v => `${sgn(v)}${n(v)} armour`,
  armorPct: v => `${sgn(v)}${n(v)}% armour`,
  magicResist: v => `${sgn(v)}${n(v)} magic resistance`,
  damageFlat: v => `${sgn(v)}${n(v)} damage on every hit`,
  damagePct: v => `${sgn(v)}${n(v)}% damage`,
  critChance: v => `${sgn(v)}${n(v)}% critical chance`,
  critDamage: v => `${sgn(v)}${n(v)}% critical damage`,
  dodge: v => `${sgn(v)}${n(v)}% dodge chance`,
  haste: v => `${sgn(v)}${n(v)}% attack speed`,
  spellPower: v => `${sgn(v)}${pc(v)} spell damage`,
  cooldownReduction: v => (v >= 0 ? `−${n(v)}% skill cooldowns` : `+${n(v)}% skill cooldowns`),
  skillCostPct: v => (v >= 0 ? `Skills cost ${pc(v)} less mana` : `Skills cost ${pc(v)} more mana`),
  mpRegen: v => `${sgn(v)}${n(v)} mana a second`,
  hpRegen: v => `${sgn(v)}${n(v)} health a second`,
  lifeSteal: v => `${n(v)}% life steal (weapon hits)`,
  manaSteal: v => `${n(v)}% mana steal`,
  blockChance: v => `${sgn(v)}${n(v)}% chance to block`,
  blockPower: v => `A block stops ${n(v)} more damage`,
  resistAll: v => `${sgn(v)}${n(v)}% resistance to all damage`,
  thorns: v => `${pc(v)} thorns — an attacker takes back ${pc(v)} of the damage it dealt`,
  areaPct: v => `${sgn(v)}${n(v)}% attack area`,
  petDamagePct: v => `${sgn(v)}${n(v)}% companion damage`,
  followerSlots: v => `${sgn(v)}${n(v)} follower slot${Math.abs(v) === 1 ? '' : 's'}, and ${sgn(v)}${n(v)} of each thing you summon`,
  arrowsPerShot: v => `${sgn(v)}${n(v)} arrow${Math.abs(v) === 1 ? '' : 's'} on every shot`,
  hpOnKill: v => `${sgn(v)}${n(v)} health on every kill`,
  manaOnKill: v => `${sgn(v)}${n(v)} mana on every kill`,
  echoChance: v => `${pc(v)} chance a skill fires a second time, free`,
  magicFind: v => `${sgn(v)}${n(v)}% magic find (better loot)`,
  goldFind: v => `${sgn(v)}${n(v)}% gold found`,
  xpFind: v => `${sgn(v)}${n(v)}% experience`,
  stealth: v => `−${pc(v)} enemy notice range`,
  healPower: v => `${sgn(v)}${n(v)}% healing you do`,
  dotPct: v => `${sgn(v)}${n(v)}% damage from your burns, poisons, bleeds and curses`,
  threatPct: v => (v >= 0 ? `+${n(v)}% threat from your damage` : `−${n(v)}% threat from your damage`),
};
/** Farhold `derived` keys that Thousandvale reads, and where (the forest may grant only these + TV_STAT_READERS). */
export const FARHOLD_STAT_READERS = Object.freeze({
  str: 'rpg.derive', dex: 'rpg.derive', int: 'rpg.derive', con: 'rpg.derive', maxHp: 'rpg.derive', maxMp: 'rpg.derive',
  armor: 'rpg.strike', armorPct: 'rpg.derive', magicResist: 'rpg.strike', damageFlat: 'rpg.derive', damagePct: 'rpg.derive',
  critChance: 'rpg.strike', critDamage: 'rpg.strike', dodge: 'rpg.strike', haste: 'rpg.derive (swing clock)',
  spellPower: 'rpg.strike', cooldownReduction: 'skills.js cooldownFor', skillCostPct: 'skills.js costFor',
  mpRegen: 'index.js step', hpRegen: 'index.js step', lifeSteal: 'rpg.strike', manaSteal: 'rpg.strike',
  blockChance: 'rpg.strike', blockPower: 'rpg.strike', resistAll: 'rpg.strike', thorns: 'rpg.strike',
  areaPct: 'weapons.js withArea', petDamagePct: 'effects.js petPower', followerSlots: 'followers.js slotsForLevel',
  arrowsPerShot: 'cast.js resolveArrow', hpOnKill: 'rpg.onKillRestore', manaOnKill: 'rpg.onKillRestore',
  echoChance: 'effects.js sum(echo)', magicFind: 'cast.js rollDrops', goldFind: 'cast.js foundGold',
  stealth: 'monster-ai.js notice',
});
export const statText = (key, value) => (STAT_TEXT[key] ? STAT_TEXT[key](value) : `${key} ${value}`);
const grantsText = g => Object.entries(g || {}).map(([k, v]) => statText(k, v)).join(', ');

const TANGENT_GAP = 0.85;

/** Lay the forest out from data/rules/perks.json. */
export function buildTvForest(data) {
  const D = data || {};
  const arms = D.arms || [];
  const rules = D.rules || {};
  const rings = D.rings || [];
  const sector = (Math.PI * 2) / Math.max(1, arms.length);
  const nodes = [], links = [], byId = new Map();
  const add = node => { if (byId.has(node.id)) throw new Error(`perk forest: duplicate id ${node.id}`); nodes.push(node); byId.set(node.id, node); return node; };
  const link = (a, b) => { if (a && b && a !== b) links.push([a.id, b.id]); };
  const nearest = (list, node) => { let best = null, bd = Infinity; for (const o of list) { const d = Math.hypot(o.x - node.x, o.y - node.y); if (d < bd) { bd = d; best = o; } } return best; };
  const ruleNode = (id, extra) => {
    const r = rules[id];
    if (!r) throw new Error(`perk forest: unknown rule ${id}`);
    const desc = r.desc || grantsText(r.grants);
    return {
      ...extra, kind: r.kind === 'keystone' ? 'keystone' : 'talent', name: r.name, desc, cost: r.cost || null,
      grants: { ...(r.grants || {}) }, flag: r.flag || null, power: r.power || null, when: r.when || null,
      whenGrants: r.whenGrants || null, ruleId: id,
      ...(r.kind === 'keystone' ? { keystoneId: id } : { talentId: id }),
    };
  };
  const statNode = ([key, value], extra) => ({ ...extra, name: statText(key, value), desc: statText(key, value), grants: { [key]: value } });

  const start = add({ id: 'start', kind: 'hub', name: 'Where you began', x: 0, y: 0, arm: null, ring: 0, grants: {},
    desc: 'The middle of the forest. This node costs 0 points and grants nothing — every arm starts here, and 1 point moves you one node along whichever arm you pick.' });

  const ring4 = [];        // each arm's ring-4 nodes, for the bridges between neighbours
  arms.forEach((arm, ai) => {
    const angle = -Math.PI / 2 + ai * sector;
    arm.angle = angle;
    let prev = [start];
    for (const ring of rings) {
      const step = ring.per <= 1 ? 0 : Math.min(TANGENT_GAP / Math.max(0.5, ring.radius), sector / ring.per);
      const made = [];
      for (let i = 0; i < ring.per; i++) {
        const a = angle + (i - (ring.per - 1) / 2) * step;
        const base = { id: `${arm.key}:${ring.at}:${i}`, arm: arm.key, ring: ring.at, kind: ring.kind, x: Math.cos(a) * ring.radius, y: Math.sin(a) * ring.radius };
        let node;
        if (ring.kind === 'minor') node = statNode(arm.minor[(i + ring.at) % arm.minor.length], base);
        else if (ring.kind === 'major') node = { ...statNode(arm.major[(i + ring.at) % arm.major.length], base), major: true };
        else node = ruleNode(arm.talents[i % arm.talents.length], base);
        made.push(add(node));
      }
      for (const node of made) link(nearest(prev, node), node);
      for (let i = 1; i < made.length; i++) link(made[i - 1], made[i]);
      if (ring.at === 4) ring4.push(made);
      prev = made;
    }
    // the paths past ring 6, each ending in its keystone(s) (a fork when a path carries two)
    const paths = arm.branches || [];
    const spread = Math.min(sector * 0.42, (D.branchSpread ?? 0.2) * Math.max(1, paths.length - 1) / 2 + 0.06);
    paths.forEach((path, p) => {
      const pa = angle + (paths.length > 1 ? -spread + (2 * spread) * p / (paths.length - 1) : 0);
      let last = null;
      path.nodes.forEach((entry, s) => {
        const radius = (D.branchStart ?? 9.2) + s;
        const base = { id: `${arm.key}:path:${path.key}:${s}`, arm: arm.key, ring: 7 + s, branch: path.key, x: Math.cos(pa) * radius, y: Math.sin(pa) * radius };
        const node = typeof entry === 'string' ? ruleNode(entry, base) : { ...statNode(entry, base), kind: s === 0 ? 'minor' : 'major', major: s > 0 || undefined };
        add(node);
        link(last || nearest(prev, node), node);
        last = node;
      });
      const keys = path.keys || [];
      const radius = (D.branchStart ?? 9.2) + path.nodes.length + 0.3;
      keys.forEach((k, i) => {
        const a = pa + (keys.length > 1 ? (i - (keys.length - 1) / 2) * 0.11 : 0);
        const node = add(ruleNode(k, { id: `${arm.key}:key:${k}`, arm: arm.key, ring: 7 + path.nodes.length, branch: path.key, x: Math.cos(a) * radius, y: Math.sin(a) * radius }));
        link(last, node);
      });
    });
  });

  // bridges: the outermost ring-4 node of each arm to the nearest one of the next arm round the wheel
  for (let i = 0; i < ring4.length && ring4.length > 1; i++) {
    const a = ring4[i][ring4[i].length - 1], b = ring4[(i + 1) % ring4.length][0];
    link(a, b);
  }

  // oddballs: one on every seam, between two rings, joined to the nearest node on either side
  const odd = D.oddballs || [];
  const radiusOf = at => rings.find(r => r.at === at)?.radius ?? at;
  const spots = [(radiusOf(2) + radiusOf(3)) / 2, (radiusOf(5) + radiusOf(6)) / 2];
  odd.forEach((entry, i) => {
    const a = -Math.PI / 2 + (i % arms.length) * sector + sector / 2;
    const r = spots[i % spots.length];
    const node = add({ ...statNode(entry, { id: `wildcard:${i}`, arm: null, ring: i % 2 ? 5 : 2, kind: 'minor', oddball: true, x: Math.cos(a) * r, y: Math.sin(a) * r }) });
    const near = nodes.filter(o => o !== node && !o.oddball && !o.branch && o.id !== 'start')
      .map(o => ({ o, d: Math.hypot(o.x - node.x, o.y - node.y) })).sort((p, q) => p.d - q.d).slice(0, 2);
    for (const { o } of near) link(o, node);
  });

  const neighbours = new Map();
  for (const [a, b] of links) {
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a).push(b);
    neighbours.get(b).push(a);
  }
  return { nodes, links, byId, neighbours, start, arms: arms.map(a => ({ key: a.key, name: a.name, color: a.color, blurb: a.blurb, angle: a.angle })) };
}

/** Every stat key the forest may grant, with its reader (the perk audit). */
export const STAT_READERS = Object.freeze({ ...FARHOLD_STAT_READERS, ...TV_STAT_READERS });
/** Every flag a forest node may carry, with its reader: Farhold's own, and Thousandvale's. */
export const FLAG_READERS = Object.freeze({
  riposte: 'farhold rpg.strike', sunder: 'js/rules/cast.js resolveSwing', mark: 'farhold rpg.strike', cauterise: 'farhold rpg.strike',
  pack: 'farhold rpg.strike', bloodMagic: 'farhold skills.js bloodPrice', doubleGrip: 'farhold rpg.equip + weapons.js', farShot: 'farhold rpg.strike',
  ...TV_FLAG_READERS,
});

/**
 * What the client calls each kind of node. "Keystone" is on the playground's banned list for
 * player-facing text (another game's item name), so the biggest nodes are shown as Cornerstones.
 */
export const KIND_LABELS = Object.freeze({ hub: 'Where you began', minor: 'Minor', major: 'Major', talent: 'Notable', keystone: 'Cornerstone' });

/** The forest as the client draws it (D): plain JSON, no Maps. */
export function forestView(forest) {
  return {
    arms: forest.arms,
    nodes: forest.nodes.map(nd => ({
      id: nd.id, kind: nd.kind, label: KIND_LABELS[nd.kind] || nd.kind, arm: nd.arm, ring: nd.ring, branch: nd.branch || null, x: Math.round(nd.x * 1000) / 1000, y: Math.round(nd.y * 1000) / 1000,
      name: nd.name, desc: nd.desc, cost: nd.cost || null, when: nd.when || null, oddball: !!nd.oddball, rule: nd.ruleId || null,
    })),
    links: forest.links,
    start: 'start',
  };
}
