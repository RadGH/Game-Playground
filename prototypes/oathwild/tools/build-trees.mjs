#!/usr/bin/env node
// Oathwild — build the class trees: tools/trees/<class>.mjs → data/classes.json (nodes, starter tweaks; paths removed)
// + data/spells.json (every tree spell as Oathwild's own row). Safe to run more than once.
//
//   node tools/build-trees.mjs            write both files
//   node tools/build-trees.mjs --check    exit 1 if the files would change (a test runs this)
//
// A class with no tree file (round-2 classes) keeps its nodes, flattened to the new rules: paths dropped, every
// node one rank. Spells no tree uses any more are removed from data/spells.json, except ones a round-2 class still
// uses. The tree rules are in tools/trees/_dsl.mjs.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CLASSES = join(root, 'data/classes.json'), SPELLS = join(root, 'data/spells.json');
const check = process.argv.includes('--check');

const classes = JSON.parse(readFileSync(CLASSES, 'utf8'));
const spells = JSON.parse(readFileSync(SPELLS, 'utf8'));
const before = [JSON.stringify(classes), JSON.stringify(spells)];

const files = readdirSync(join(here, 'trees')).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const treeSpells = {};
const built = new Set();
for (const f of files) {
  const cls = f.replace(/\.mjs$/, '');
  const def = classes.classes[cls];
  if (!def) throw new Error(`tools/trees/${f}: no class "${cls}" in data/classes.json`);
  const t = (await import(join(here, 'trees', f))).default;
  def.nodes = t.nodes;
  delete def.paths;
  for (const k of ['starter', 'blurb', 'role', 'dualWield', 'growth']) if (t[k] !== undefined) def[k] = t[k];
  // `power` on a tree file: the class's balance factor (tools/sim-fights.mjs), baked into every damage number of its
  // spells here so data/spells.json holds the final numbers the tooltips print
  const P = t.power || 1, MPK = t.mpScale || 1;
  const scale = row => {
    const r = structuredClone(row);
    // `mpScale`: mana costs for a class with little mana (the melee hybrids) — a level-10 Paladin had 78 mana and
    // emptied it in one round of its abilities (2026-11-26)
    if (MPK !== 1 && r.mp) r.mp = Math.max(1, Math.round(r.mp * MPK));
    if (P === 1) return r;
    const k = v => Math.round(v * P * 100) / 100;
    if (typeof r.mult === 'number') r.mult = k(r.mult);
    if (r.place?.strike?.mult) r.place.strike.mult = k(r.place.strike.mult);
    if (r.form?.basic?.mult) r.form.basic.mult = k(r.form.basic.mult);
    return r;
  };
  for (const [id, row0] of Object.entries(t.spells || {})) {
    const row = scale(row0);
    if (treeSpells[id]) throw new Error(`spell "${id}" is written by two tree files (${treeSpells[id].cls} and ${cls})`);
    treeSpells[id] = { cls, row };
  }
  built.add(cls);
}

// classes without a tree file (later rounds): flatten to the new rules
for (const [cls, def] of Object.entries(classes.classes)) {
  if (built.has(cls)) continue;
  delete def.paths;
  // old grouped trainings → one kind each (the class gets a node per kind it had)
  const OLD = { martial: ['sword', 'axe'], simple: ['mace', 'dagger'], bows: ['bow'], arcane: ['wand'] };
  const nodes = [];
  for (const n of def.nodes) {
    delete n.path; delete n.ranks; delete n.needsRank;
    if (n.kind === 'prof') {
      const kinds = [...new Set(n.grants.flatMap(g => OLD[g] || [g]))];
      for (const k of kinds) if (!nodes.some(x => x.id === `prof_${k}`)) nodes.push({ id: `prof_${k}`, kind: 'prof', grants: [k], level: n.level, ...(n.free ? { free: true } : {}) });
    } else nodes.push(n);
  }
  def.nodes = nodes;
}

// the rules block: no paths, no rank gap
const R = classes.rules;
delete R.pathLevel; delete R.rankGap;
classes._doc = 'Oathwild classes = MASTERIES. BUILT by tools/build-trees.mjs from tools/trees/<class>.mjs (edit those, then run it) — the tree rules (owner 2026-11-26) are at the top of tools/trees/_dsl.mjs: no paths or subclasses, several choices at every class level, every node ONE rank (a spell\'s rank II / III is its own node that `needs` the rank before), one training node per weapon and armour kind, big passives only (no small percentages except critical chance), few defensive abilities and heals, every ability an area (nova, cone, line, ground circle, leap, charge) — no plain projectiles except wand basics, plain common names. Every character level-up picks a class (js/rules/levels.js); a class level gives its growth and `rules.pointsPerLevel` points to spend in that class. Node kinds: spell (rank 1, or `rank` 2/3 on a rank node), passive (`mods`, js/rules/sheet.js vocabulary), prof (`grants`: one training, js/rules/proficiency.js), mod (`on` = a spell node of this class; `change` = { mult, add, set }). `needs`: node ids owned first. `free`: comes with the class level. `choice`: nodes sharing it exclude each other (capstones). Spells learned from a class get +`classPowerPerLevel` per class level above 1 of that class. `tier`: base (open at creation), advanced (unlocked, 10 levels) or specialty (prestige: unlocked by requirements, 5 levels). `round: 2` = written but not offered yet.';

// spells: every tree spell is Oathwild's own row; drop rows nothing uses
const usedByOthers = new Set();
for (const [cls, def] of Object.entries(classes.classes)) if (!built.has(cls)) for (const n of def.nodes) if (n.spell) usedByOthers.add(n.spell);
const out = {};
for (const [id, entry] of Object.entries(spells.spells)) if (usedByOthers.has(id) && !treeSpells[id]) out[id] = entry;
for (const [id, { row }] of Object.entries(treeSpells)) out[id] = row;
spells.spells = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));

// every spell node points at a spell that exists
for (const [cls, def] of Object.entries(classes.classes)) for (const n of def.nodes) {
  if (n.spell && !spells.spells[n.spell]) throw new Error(`${cls}/${n.id}: spell "${n.spell}" has no row`);
  for (const need of n.needs || []) if (!def.nodes.some(x => x.id === need)) throw new Error(`${cls}/${n.id}: needs "${need}", which is not in the tree`);
  if (n.kind === 'mod' && !def.nodes.some(x => x.id === n.on)) throw new Error(`${cls}/${n.id}: changes "${n.on}", which is not in the tree`);
}

const after = [JSON.stringify(classes), JSON.stringify(spells)];
if (check) {
  if (after[0] !== before[0] || after[1] !== before[1]) { console.error('data/classes.json or data/spells.json is out of date — run node tools/build-trees.mjs'); process.exit(1); }
  console.log('trees up to date');
} else {
  writeFileSync(CLASSES, JSON.stringify(classes, null, 1) + '\n');
  writeFileSync(SPELLS, JSON.stringify(spells, null, 1) + '\n');
  console.log(`built ${built.size} class trees, ${Object.keys(treeSpells).length} tree spells, ${Object.keys(spells.spells).length} spells in all`);
}
