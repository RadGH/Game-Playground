#!/usr/bin/env node
// Tree Kit — measure every game tree kind from the drawn tree and write its trunk / crown into data/species.json
// (the numbers Oathwild's server collides with: lessons rule 22). The live server and `tree-edit.mjs save` run this on
// every save; run it by hand after editing species.json in a text editor.
//
//   node treekit/tools/measure.mjs           write the measured sizes (prints what changed)
//   node treekit/tools/measure.mjs --check   change nothing; exit 1 if the file is out of date
import { register } from 'node:module';
import fs from 'node:fs';
register('../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { DATA, SPECIES_FILE, formatSpecies } = await import('../js/species.js');
const { applyMeasure } = await import('../js/measure.js');

const check = process.argv.includes('--check');
const data = structuredClone(DATA);
const changes = applyMeasure(data);
for (const [id, f, a, b] of changes) console.log(`${id} ${f}: ${a} → ${b} m`);
if (check) { if (changes.length) { console.log('species.json is out of date: run node treekit/tools/measure.mjs'); process.exit(1); } console.log('species.json sizes match the drawn trees'); }
else if (changes.length) { fs.writeFileSync(SPECIES_FILE, formatSpecies(data)); console.log(`wrote ${changes.length} sizes`); }
else console.log('nothing to change');
