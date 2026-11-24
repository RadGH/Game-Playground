// Oathwild — classes as masteries: unlocks, class points, ranks, paths, modifiers. Pure.
// The ONE reader of data/classes.json. (Rules in its _doc; plain-language version in docs/RULES.md.)
//
// Character fields this module reads and writes (ARCH.md "Character record"):
//   classLevels { cls: n }    classOrder [cls…] (the order classes were first taken)
//   nodes { 'cls/node': rank }   paths { cls: pathId }   bar [spellId…]
//
//   classDef(rules, cls) / classIds(rules) / maxClassLevel(rules, cls)
//   classRefusal(rules, char, cls, { flags })   null or why this class cannot be levelled now (player words)
//   pointsLeft(rules, char, cls) / pointsEarned / pointsSpent
//   nodeRefusal(rules, char, cls, nodeId)       null or why the next rank of a node cannot be bought
//   buyNode(rules, char, cls, nodeId)           { ok, why }
//   choosePath(rules, char, cls, pathId)        { ok, why }
//   grantFree(rules, char, cls)                 gives every free node the class level has reached
//   rankCapAt(rules, cls, node, classLevel)     highest rank a class level allows
//   spellSources(rules, char)                   { spellId: { cls, node, rank } } (the best source wins)
//   castRow(rules, char, spellId)               the row a cast uses (rank + modifiers + class power)
//   passiveMods(rules, char)                    [{ source, mods }] for the sheet
//   classProfs(rules, char)                     { prof: [source names] }
//   refundPoints(rules, char)                   respec: every bought rank back, paths cleared

import { spellRow, maxRankOf } from './spells.js';

const C = rules => rules.data.classes;
export const classDef = (rules, cls) => C(rules).classes[cls] || null;
export const classIds = rules => Object.keys(C(rules).classes);
export const classRules = rules => C(rules).rules;
export const maxClassLevel = (rules, cls) => classDef(rules, cls)?.maxLevel || C(rules).rules.maxClassLevel;
export const nodeKey = (cls, id) => `${cls}/${id}`;
export const nodeOf = (rules, cls, id) => classDef(rules, cls)?.nodes.find(n => n.id === id) || null;
export const totalLevel = char => Object.values(char.classLevels || {}).reduce((s, v) => s + v, 0);
export const isSpecialty = (rules, cls) => classDef(rules, cls)?.tier === 'specialty';

/** How many ranks a node has. */
export function nodeMaxRank(rules, node) {
  if (node.kind === 'spell') return maxRankOf(rules, node.spell);
  if (node.kind === 'passive') return node.ranks || 1;
  return 1;
}
/** The highest rank of `node` a class level allows (rank r needs level + rankGap × (r − 1)). */
export function rankCapAt(rules, cls, node, classLevel) {
  const gap = C(rules).rules.rankGap;
  const max = nodeMaxRank(rules, node);
  if (classLevel < node.level) return 0;
  return Math.min(max, 1 + Math.floor((classLevel - node.level) / gap));
}
/** The class level rank `r` of a node needs. */
export const levelForRank = (rules, node, r) => node.level + C(rules).rules.rankGap * (r - 1);

// ---------------------------------------------------------------- taking a class

/**
 * Why `char` cannot put a level into `cls` right now, or null. `flags` = world/quest flags the
 * character has found (world-state.js flagsFor); `attrs` = attribute totals from the sheet
 * (sheet.js attrTotals). Requirements are checked against what the character has NOW.
 */
export function classRefusal(rules, char, cls, { flags = [], attrs = null } = {}) {
  const def = classDef(rules, cls);
  if (!def) return 'There is no such class.';
  const have = char.classLevels?.[cls] || 0;
  if (have >= maxClassLevel(rules, cls)) return `${def.name} is already at its highest level (${maxClassLevel(rules, cls)}).`;
  if (have > 0 || def.open) return null;
  const missing = requirementGaps(rules, char, def.requires || {}, { flags, attrs });
  if (def.round > 1) missing.unshift('it opens in a later round');
  return missing.length ? `${def.name} needs ${missing.join(', ')}.` : null;
}

/** Each unmet requirement as a short phrase ("Warrior 3 (you have 1)"). */
export function requirementGaps(rules, char, req, { flags = [], attrs = null, skills = null, talents = null } = {}) {
  const out = [];
  const names = rules.data.attributes.names;
  for (const [c, n] of Object.entries(req.classes || {})) {
    const h = char.classLevels?.[c] || 0;
    if (h < n) out.push(`${classDef(rules, c)?.name || c} ${n} (you have ${h})`);
  }
  const A = attrs || {};
  for (const [k, n] of Object.entries(req.attrs || {})) {
    const h = A[k] ?? char.attributes?.[k] ?? 0;
    if (h < n) out.push(`${names[k]} ${n} (you have ${h})`);
  }
  const S = skills || char.skills || {};
  for (const [k, n] of Object.entries(req.skills || {})) {
    const h = Math.floor(S[k]?.v || 0);
    if (h < n) out.push(`${rules.data.skillsUse.skills[k]?.name || k} ${n} (you have ${h})`);
  }
  const T = talents || char.talents || {};
  for (const t of req.talents || []) if (!T[t]) out.push(`the ${rules.data.talents.talents[t]?.name || t} talent`);
  for (const f of req.flags || []) if (!flags.includes(f)) out.push(flagText(f));
  if (req.characterLevel && (char.level || 1) < req.characterLevel) out.push(`character level ${req.characterLevel}`);
  return out;
}
const FLAG_TEXT = {
  pact_sealed: 'a pact sealed with something in the Thornmere Wilds',
  barrow_tome: 'the tome hidden in the undead barrow',
  gravecutter_contract: 'a Gravecutter contract (someone in the wilds is hiring)',
  broken_sundial: 'the broken sundial',
  seers_pool: "the seer's pool",
  fallen_star: 'a fallen star',
};
export const flagText = f => FLAG_TEXT[f] || 'something still hidden in the world';

/** Classes this character could level right now. */
export function classChoices(rules, char, opts = {}) {
  return classIds(rules).filter(c => !classRefusal(rules, char, c, opts));
}

// ---------------------------------------------------------------- points

export const pointsEarned = (rules, char, cls) => (char.classLevels?.[cls] || 0) * C(rules).rules.pointsPerLevel;
export function pointsSpent(rules, char, cls) {
  let s = 0;
  for (const node of classDef(rules, cls)?.nodes || []) {
    const r = char.nodes?.[nodeKey(cls, node.id)] || 0;
    s += Math.max(0, r - (node.free ? 1 : 0)) * (node.cost || 1);
  }
  return s;
}
export const pointsLeft = (rules, char, cls) => pointsEarned(rules, char, cls) - pointsSpent(rules, char, cls);

/** Give every free node the class level has reached (rank 1). Safe to run more than once. */
export function grantFree(rules, char, cls) {
  char.nodes = char.nodes || {};
  const lvl = char.classLevels?.[cls] || 0;
  for (const node of classDef(rules, cls)?.nodes || []) {
    if (!node.free || node.level > lvl) continue;
    if (node.path && char.paths?.[cls] !== node.path) continue;
    const k = nodeKey(cls, node.id);
    if (!char.nodes[k]) char.nodes[k] = 1;
    if (node.kind === 'spell') addToBar(rules, char, node.spell);
  }
}

/** Put a newly learned spell on the first free bar slot. */
export function addToBar(rules, char, spellId) {
  char.bar = char.bar || [];
  if (char.bar.includes(spellId)) return;
  if (char.bar.length < C(rules).rules.barSlots) char.bar.push(spellId);
}

/** Why the next rank of `nodeId` cannot be bought now, or null. */
export function nodeRefusal(rules, char, cls, nodeId) {
  const def = classDef(rules, cls);
  const node = nodeOf(rules, cls, nodeId);
  if (!def || !node) return 'There is no such node.';
  const lvl = char.classLevels?.[cls] || 0;
  if (!lvl) return `You have no levels in ${def.name}.`;
  const key = nodeKey(cls, nodeId);
  const have = char.nodes?.[key] || 0;
  const max = nodeMaxRank(rules, node);
  const label = nodeName(rules, node);
  if (have >= max) return `${label} is at its highest rank.`;
  const next = have + 1;
  const needLvl = levelForRank(rules, node, next);
  if (lvl < needLvl) return next === 1 ? `${label} opens at ${def.name} level ${needLvl}.` : `Rank ${next} of ${label} needs ${def.name} level ${needLvl}.`;
  if (node.path) {
    const p = char.paths?.[cls];
    if (!p) return `${label} belongs to the ${def.paths[node.path].name} path — choose a path at ${def.name} level ${C(rules).rules.pathLevel}.`;
    if (p !== node.path) return `${label} belongs to the ${def.paths[node.path].name} path; you chose ${def.paths[p].name}.`;
  }
  if (node.choice) {
    const other = def.nodes.find(n => n.choice === node.choice && n.id !== node.id && (char.nodes?.[nodeKey(cls, n.id)] || 0) > 0);
    if (other) return `You already chose ${nodeName(rules, other)}; only one of these can be taken.`;
  }
  if (node.kind === 'mod') {
    const target = nodeOf(rules, cls, node.on);
    const r = char.nodes?.[nodeKey(cls, node.on)] || 0;
    if (r < (node.needsRank || 1)) return `${label} changes ${nodeName(rules, target)}: it needs ${nodeName(rules, target)} at rank ${node.needsRank || 1} first.`;
  }
  if (node.free && have === 0) return null;   // granted with the level, costs nothing
  const cost = node.cost || 1;
  if (pointsLeft(rules, char, cls) < cost) return `No ${def.name} points left — each ${def.name} level gives ${C(rules).rules.pointsPerLevel}.`;
  return null;
}

export function buyNode(rules, char, cls, nodeId) {
  const why = nodeRefusal(rules, char, cls, nodeId);
  if (why) return { ok: false, why };
  char.nodes = char.nodes || {};
  const key = nodeKey(cls, nodeId);
  char.nodes[key] = (char.nodes[key] || 0) + 1;
  const node = nodeOf(rules, cls, nodeId);
  if (node.kind === 'spell') addToBar(rules, char, node.spell);
  return { ok: true, why: null };
}

export function choosePath(rules, char, cls, pathId) {
  const def = classDef(rules, cls);
  if (!def?.paths?.[pathId]) return { ok: false, why: `${def?.name || 'That class'} has no such path.` };
  if ((char.classLevels?.[cls] || 0) < C(rules).rules.pathLevel) return { ok: false, why: `${def.name} chooses its path at level ${C(rules).rules.pathLevel}.` };
  if (char.paths?.[cls]) return { ok: false, why: `You already walk the ${def.paths[char.paths[cls]].name} path (a shrine respec can change it).` };
  char.paths = char.paths || {};
  char.paths[cls] = pathId;
  grantFree(rules, char, cls);
  return { ok: true, why: null };
}

/** A node's display name (spell nodes take the spell's name). */
export function nodeName(rules, node) {
  if (!node) return '';
  if (node.name) return node.name;
  if (node.kind === 'spell') return rules.spells[node.spell]?.base.name || node.spell;
  return node.id;
}

// ---------------------------------------------------------------- what the character has

/** Every spell the character knows: the best rank across classes, and which class it counts for. */
export function spellSources(rules, char) {
  const out = {};
  for (const [key, rank] of Object.entries(char.nodes || {})) {
    if (!rank) continue;
    const [cls, id] = key.split('/');
    const node = nodeOf(rules, cls, id);
    if (node?.kind !== 'spell') continue;
    const lvl = char.classLevels?.[cls] || 0;
    const cur = out[node.spell];
    if (!cur || rank > cur.rank || (rank === cur.rank && lvl > (char.classLevels?.[cur.cls] || 0))) out[node.spell] = { cls, node: id, rank };
  }
  return out;
}
export const spellRanks = (rules, char) => Object.fromEntries(Object.entries(spellSources(rules, char)).map(([k, v]) => [k, v.rank]));

/** Modifier nodes the character owns that change `spellId`. */
export function modsForSpell(rules, char, spellId) {
  const out = [];
  for (const [key, rank] of Object.entries(char.nodes || {})) {
    if (!rank) continue;
    const [cls, id] = key.split('/');
    const node = nodeOf(rules, cls, id);
    if (node?.kind !== 'mod') continue;
    const target = nodeOf(rules, cls, node.on);
    if (target?.spell === spellId) out.push({ id: node.id, name: node.name, change: node.change, cls });
  }
  return out;
}

/** The share a spell gains from the depth of its class. */
export function classPower(rules, char, cls) {
  const lvl = char.classLevels?.[cls] || 1;
  return 1 + C(rules).rules.classPowerPerLevel * Math.max(0, lvl - 1);
}

/** The row a cast uses: rank, owned modifiers and class depth. null if the spell is not known. */
export function castRow(rules, char, spellId) {
  const src = spellSources(rules, char)[spellId];
  if (!src) return null;
  const row = spellRow(rules, spellId, { rank: src.rank, mods: modsForSpell(rules, char, spellId) });
  row.classPower = classPower(rules, char, src.cls);
  row.cls = src.cls;
  return row;
}

/** Passive nodes (sheet numbers), each multiplied by its rank. */
export function passiveMods(rules, char) {
  const out = [];
  for (const [key, rank] of Object.entries(char.nodes || {})) {
    if (!rank) continue;
    const [cls, id] = key.split('/');
    const node = nodeOf(rules, cls, id);
    if (node?.kind !== 'passive') continue;
    const mods = {};
    for (const [k, v] of Object.entries(node.mods || {})) mods[k] = v * rank;
    out.push({ source: `${node.name} (${classDef(rules, cls).name})`, mods });
  }
  return out;
}

/** Proficiencies from class nodes: { prof: [source names] }. */
export function classProfs(rules, char) {
  const out = {};
  for (const [key, rank] of Object.entries(char.nodes || {})) {
    if (!rank) continue;
    const [cls, id] = key.split('/');
    const node = nodeOf(rules, cls, id);
    if (node?.kind !== 'prof') continue;
    for (const g of node.grants || []) (out[g] = out[g] || []).push(`${node.name} (${classDef(rules, cls).name} ${node.level})`);
  }
  return out;
}

/** Growth the character's class levels give: { hp, mp, attrs: { str: n } } (attributes rounded down). */
export function classGrowth(rules, char) {
  let hp = 0, mp = 0;
  const attrs = {};
  for (const [cls, lvl] of Object.entries(char.classLevels || {})) {
    const g = classDef(rules, cls)?.growth || {};
    hp += (g.hp || 0) * lvl;
    mp += (g.mp || 0) * lvl;
    for (const [k, v] of Object.entries(g.attrs || {})) attrs[k] = (attrs[k] || 0) + v * lvl;
  }
  for (const k of Object.keys(attrs)) attrs[k] = Math.floor(attrs[k]);
  return { hp, mp, attrs };
}

/** Respec (points): every bought rank back, paths cleared, free nodes kept. */
export function refundPoints(rules, char) {
  char.nodes = {};
  char.paths = {};
  char.bar = [];
  for (const cls of Object.keys(char.classLevels || {})) grantFree(rules, char, cls);
}

/**
 * Spend a class's points the simple way (bots, tests, a "suggest" button): new spells first, then
 * ranks of spells already known, then passives, then modifiers, capstone last; choose `path` (or
 * the class's first path) when the level allows. Returns the node ids bought, in order.
 */
export function suggestSpend(rules, char, cls, { path = null } = {}) {
  const def = classDef(rules, cls);
  if (!def) return [];
  if (def.paths && !char.paths?.[cls] && (char.classLevels?.[cls] || 0) >= C(rules).rules.pathLevel) choosePath(rules, char, cls, path || Object.keys(def.paths)[0]);
  const order = node => (node.choice ? 50 : 0) + ({ spell: 0, prof: 1, passive: 3, mod: 4 }[node.kind] ?? 5) + ((char.nodes?.[nodeKey(cls, node.id)] || 0) > 0 ? 2 : 0);
  const bought = [];
  for (let guard = 0; guard < 60 && pointsLeft(rules, char, cls) > 0; guard++) {
    const next = def.nodes.filter(n => !nodeRefusal(rules, char, cls, n.id)).sort((a, b) => order(a) - order(b) || a.level - b.level)[0];
    if (!next) break;
    buyNode(rules, char, cls, next.id);
    bought.push(next.id);
  }
  return bought;
}
