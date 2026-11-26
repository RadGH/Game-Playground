// Oathwild — classes as masteries: unlocks, class points, single-rank nodes, modifiers. Pure.
// The ONE reader of data/classes.json. (Rules in its _doc; plain-language version in docs/RULES.md.)
//
// Tree rules (owner 2026-11-26): no paths / subclasses; every node is ONE rank (one icon = one buy); a spell's higher
// ranks are their own nodes deeper in the tree (`rank: 2`, `needs: [the rank before]`); `needs` = node ids that must
// be owned first; each weapon and armour training is its own node. Saved characters from the old ranked trees are
// cleaned on load (cleanNodes): unknown nodes go, every rank is 1, the points come back.
//
// Character fields this module reads and writes (ARCH.md "Character record"):
//   classLevels { cls: n }    classOrder [cls…] (the order classes were first taken)
//   nodes { 'cls/node': 1 }   bar [spellId…]   (paths: gone — cleanNodes clears it)
//
//   classDef(rules, cls) / classIds(rules) / maxClassLevel(rules, cls)
//   classRefusal(rules, char, cls, { flags })   null or why this class cannot be levelled now (player words)
//   pointsLeft(rules, char, cls) / pointsEarned / pointsSpent
//   nodeRefusal(rules, char, cls, nodeId)       null or why the next rank of a node cannot be bought
//   buyNode(rules, char, cls, nodeId)           { ok, why }
//   cleanNodes(rules, char)                     old saves → the current trees (safe to run more than once)
//   grantFree(rules, char, cls)                 gives every free node the class level has reached
//   rankCapAt(rules, cls, node, classLevel)     highest rank a class level allows
//   spellSources(rules, char)                   { spellId: { cls, node, rank } } (the best source wins)
//   castRow(rules, char, spellId)               the row a cast uses (rank + modifiers + class power)
//   passiveMods(rules, char)                    [{ source, mods }] for the sheet
//   classProfs(rules, char)                     { prof: [source names] }
//   refundPoints(rules, char)                   respec: every bought rank back, paths cleared

import { spellRow } from './spells.js';

const C = rules => rules.data.classes;
export const classDef = (rules, cls) => C(rules).classes[cls] || null;
export const classIds = rules => Object.keys(C(rules).classes);
export const classRules = rules => C(rules).rules;
export const maxClassLevel = (rules, cls) => classDef(rules, cls)?.maxLevel || C(rules).rules.maxClassLevel;
export const nodeKey = (cls, id) => `${cls}/${id}`;
export const nodeOf = (rules, cls, id) => classDef(rules, cls)?.nodes.find(n => n.id === id) || null;
export const totalLevel = char => Object.values(char.classLevels || {}).reduce((s, v) => s + v, 0);
export const isSpecialty = (rules, cls) => classDef(rules, cls)?.tier === 'specialty';

/** Every node is one rank (owner 2026-11-26: "each icon is a single rank"). */
export function nodeMaxRank() { return 1; }
/** 1 once the class level reaches the node, else 0. */
export function rankCapAt(rules, cls, node, classLevel) { return classLevel >= node.level ? 1 : 0; }
/** The class level a node opens at. */
export const levelForRank = (rules, node) => node.level;
/** Ids a node needs owned first: its own `needs`, and for a modifier the spell node it changes. */
export function nodeNeeds(node) {
  const out = [...(node.needs || [])];
  if (node.kind === 'mod' && node.on && !out.includes(node.on)) out.push(node.on);
  return out;
}
const ROMAN = ['', '', ' II', ' III', ' IV', ' V'];
/** "Cleave II" for a spell's rank-2 node. */
export const rankSuffix = r => ROMAN[r] || (r > 1 ? ` ${r}` : '');

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
  if (have >= max) return `You already have ${label}.`;
  if (lvl < node.level) return `${label} opens at ${def.name} level ${node.level}.`;
  const missing = nodeNeeds(node).filter(id => !(char.nodes?.[nodeKey(cls, id)] > 0)).map(id => nodeName(rules, nodeOf(rules, cls, id)));
  if (missing.length) return `${label} needs ${missing.join(' and ')} first.`;
  if (node.choice) {
    const other = def.nodes.find(n => n.choice === node.choice && n.id !== node.id && (char.nodes?.[nodeKey(cls, n.id)] || 0) > 0);
    if (other) return `You already chose ${nodeName(rules, other)}; only one of these can be taken.`;
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

/** Classes have no paths any more (owner 2026-11-26); kept so an old client's message gets a plain answer. */
export function choosePath() { return { ok: false, why: 'Classes no longer have paths — every node is open to you.' }; }

/**
 * Bring a saved character onto the current trees: nodes that no longer exist go, every node is rank 1 (the points
 * of old extra ranks come back), paths are cleared, free nodes are granted, the bar keeps only spells still known.
 * Returns true when anything changed. Safe to run more than once.
 */
export function cleanNodes(rules, char) {
  let changed = false;
  const nodes = {};
  for (const [key, rank] of Object.entries(char.nodes || {})) {
    const [cls, id] = key.split('/');
    if (!rank || !nodeOf(rules, cls, id)) { changed = true; continue; }
    if (rank !== 1) changed = true;
    nodes[key] = 1;
  }
  // a node whose needs are gone is refunded too (repeat: one removal can orphan the next)
  for (let guard = 0; guard < 8; guard++) {
    let drop = false;
    for (const key of Object.keys(nodes)) {
      const [cls, id] = key.split('/');
      const node = nodeOf(rules, cls, id);
      if (node.free) continue;
      if (nodeNeeds(node).some(n => !nodes[nodeKey(cls, n)])) { delete nodes[key]; drop = changed = true; }
    }
    if (!drop) break;
  }
  char.nodes = nodes;
  // talents from the old list (grouped trainings, several ranks) — unknown ones go, every talent is one rank
  const TT = rules.data.talents?.talents || {};
  for (const [id, r] of Object.entries(char.talents || {})) {
    if (!TT[id] || !r) { delete char.talents[id]; changed = true; } else if (r > (TT[id].ranks || 1)) { char.talents[id] = TT[id].ranks || 1; changed = true; }
  }
  if (char.paths && Object.keys(char.paths).length) changed = true;
  char.paths = {};
  for (const cls of Object.keys(char.classLevels || {})) grantFree(rules, char, cls);
  const known = spellSources(rules, char);
  const bar = (char.bar || []).filter(s => s && known[s]);
  if (bar.length !== (char.bar || []).length) changed = true;
  char.bar = bar;
  for (const s of Object.keys(known)) addToBar(rules, char, s);
  return changed;
}

/** A node's display name (spell nodes take the spell's name; a rank node adds II / III). */
export function nodeName(rules, node) {
  if (!node) return '';
  if (node.name) return node.name;
  if (node.kind === 'spell') return (rules.spells[node.spell]?.base.name || node.spell) + rankSuffix(node.rank || 1);
  if (node.kind === 'prof') return rules.data.proficiency.nodeNames?.[node.grants?.[0]] || rules.data.proficiency.names[node.grants?.[0]] || node.id;
  return node.id;
}

// ---------------------------------------------------------------- what the character has

/** Every spell the character knows: the best rank across classes, and which class it counts for. */
export function spellSources(rules, char) {
  const out = {};
  for (let [key, rank] of Object.entries(char.nodes || {})) {
    if (!rank) continue;
    const [cls, id] = key.split('/');
    const node = nodeOf(rules, cls, id);
    if (node?.kind !== 'spell') continue;
    rank = node.rank || 1;   // a rank node raises the spell it belongs to
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
    for (const [k, v] of Object.entries(node.mods || {})) mods[k] = v;
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
    for (const g of node.grants || []) (out[g] = out[g] || []).push(`${nodeName(rules, node)} (${classDef(rules, cls).name} ${node.level})`);
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

/** Respec (points): every bought node back, free nodes kept. */
export function refundPoints(rules, char) {
  char.nodes = {};
  char.paths = {};
  char.bar = [];
  for (const cls of Object.keys(char.classLevels || {})) grantFree(rules, char, cls);
}

/**
 * Spend a class's points the simple way (bots, tests): spells and their ranks first, then passives, modifiers,
 * training last-but-one, capstone last. `prefer`: node ids to buy first when open. Returns the node ids bought.
 */
export function suggestSpend(rules, char, cls, { prefer = [] } = {}) {
  const def = classDef(rules, cls);
  if (!def) return [];
  const order = node => (prefer.includes(node.id) ? -10 : 0) + (node.choice ? 50 : 0) + ({ spell: 0, passive: 2, mod: 3, prof: 4 }[node.kind] ?? 5);
  const bought = [];
  for (let guard = 0; guard < 60 && pointsLeft(rules, char, cls) > 0; guard++) {
    const next = def.nodes.filter(n => !nodeRefusal(rules, char, cls, n.id)).sort((a, b) => order(a) - order(b) || a.level - b.level)[0];
    if (!next) break;
    buyNode(rules, char, cls, next.id);
    bought.push(next.id);
  }
  return bought;
}
