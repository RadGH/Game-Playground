#!/usr/bin/env node
// Check every zone (or the ones named): node tools/zone-check.mjs [id ...]
import { readFileSync } from 'node:fs';
import { checkZone } from '../js/world/check.js';
const rd = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : rd('zones/index.json').zones;
let bad = 0;
for (const id of ids) { const r = checkZone(rd(`zones/${id}.json`)); console.log(`${r.ok ? 'ok ' : 'BAD'} ${id}  ${JSON.stringify(r.stats)}`); for (const p of r.problems) { console.log('    - ' + p); bad++; } }
process.exit(bad ? 1 : 0);
