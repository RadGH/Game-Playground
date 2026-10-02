// node prototypes/farhold/tools/describe-skills.mjs
//
// R28 — rewrite every `desc` in data/skills.json from the row's own numbers (js/skills.js
// `describeSkill`), the same text `createSkillBar` generates at load. Content agents run this after
// adding or changing a row, so the screens that read the file directly (the class builder, the
// title screen's class preview) are right before any bar is built. Talent nodes carry NO `desc` —
// js/skilltalents.js `describeNode` writes theirs at load.
//
// Writes the file back with the same one-space indent it already uses. Safe to run more than once.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describeSkill } from '../js/skills.js';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'data', 'skills.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
let changed = 0;
for (const row of Object.values(data.skills)) {
  const desc = describeSkill(row, data.statuses || {}, { skills: data.skills });
  if (row.desc !== desc) { row.desc = desc; changed++; }
  delete row.descShort;
}
writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(`${changed} descriptions rewritten`);
