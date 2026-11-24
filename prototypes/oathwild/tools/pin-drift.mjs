#!/usr/bin/env node
// Re-pin the numbers Oathwild borrows (tests/rules/drift-pins.json). Run ONLY after reading what
// changed in Farhold / Emberveil / Thousandvale and deciding Oathwild should follow it:
//   node prototypes/oathwild/tools/pin-drift.mjs
import { writeFileSync } from 'node:fs';
import { bootRules } from '../js/rules/boot.js';
import { probe } from '../tests/rules/drift-probe.mjs';
const rules = await bootRules({ seed: 7 });
const out = new URL('../tests/rules/drift-pins.json', import.meta.url);
writeFileSync(out, JSON.stringify({ _doc: 'Pinned by tools/pin-drift.mjs. tests/rules/drift.test.mjs fails when a borrowed number changes.', ...probe(rules) }, null, 1) + '\n');
console.log('pinned', out.pathname);
