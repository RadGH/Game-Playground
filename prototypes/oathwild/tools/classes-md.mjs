#!/usr/bin/env node
// Print the class-tree tables for docs/CLASSES.md from data/classes.json (paste between the
// <!-- trees --> markers, or run with --write to replace them in place):
//   node prototypes/oathwild/tools/classes-md.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { bootRules } from '../js/rules/boot.js';
import { classIds, classDef, nodeName, nodeNeeds } from '../js/rules/classes.js';
import { describeRequires } from '../js/rules/describe.js';

const rules = await bootRules({ seed: 7 });
const out = [];
const tierName = { base: 'Base', advanced: 'Advanced', specialty: 'Specialty' };
for (const c of classIds(rules)) {
  const d = classDef(rules, c);
  const req = d.requires ? describeRequires(rules, d.requires) : 'open at creation';
  out.push(`### ${d.name} — ${tierName[d.tier]}${d.round > 1 ? ' (later round)' : ''}`);
  out.push(`${d.blurb} *Requires:* ${req}. *Growth a level:* +${d.growth.hp} health, +${d.growth.mp} mana.${d.dualWield ? ' Fights with two weapons.' : ''}`);
  out.push('', '| Lv | Node | Kind | Needs | Choice |', '|---|---|---|---|---|');
  for (const n of [...d.nodes].sort((a, b) => a.level - b.level)) {
    const kind = { spell: 'spell', passive: 'passive', prof: 'training', mod: `modifier of ${nodeName(rules, d.nodes.find(x => x.id === n.on))}` }[n.kind];
    const extra = n.kind === 'prof' ? ` (${n.grants.join(', ')})` : '';
    const shape = n.kind === 'spell' ? ` *(${rules.spells[n.spell].base.shape})*` : '';
    const needs = nodeNeeds(n).map(id => nodeName(rules, d.nodes.find(x => x.id === id))).join(', ');
    out.push(`| ${n.level} | ${nodeName(rules, n)}${shape}${extra} | ${kind}${n.free ? ', free' : ''} | ${needs} | ${n.choice ? 'capstone (pick one)' : ''} |`);
  }
  out.push('');
}
const text = out.join('\n');
if (process.argv.includes('--write')) {
  const file = new URL('../docs/CLASSES.md', import.meta.url);
  const md = readFileSync(file, 'utf8');
  const a = md.indexOf('<!-- trees -->'), b = md.indexOf('<!-- /trees -->');
  writeFileSync(file, `${md.slice(0, a)}<!-- trees -->\n${text}\n${md.slice(b)}`);
  console.log('wrote docs/CLASSES.md');
} else console.log(text);
