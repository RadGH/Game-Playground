// Chibi 2.5 opt-in hash fixture writer. Never use this to rewrite the v2 fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { v2Looks, hashActor } from './chibi2-v2-baseline.mjs';
import { createChibi2Character } from '../avatar-3d/js/chibi2.js';
const looks = await v2Looks(), out = {};
for (const [key, look] of Object.entries(looks)) {
  const actor = await createChibi2Character(look, { v25: true });
  out[key] = hashActor(actor); actor.dispose();
}
const file = new URL('../avatar-3d/tests/fixtures/chibi25-hashes.json', import.meta.url);
if (process.argv.includes('--check')) {
  const want = JSON.parse(readFileSync(file));
  const changed = Object.keys(want).filter(k => out[k] !== want[k]);
  if (changed.length || Object.keys(out).length !== Object.keys(want).length) throw new Error(`2.5 hash changes: ${changed.join(', ') || 'fixture size mismatch'}`);
  console.log(`all ${Object.keys(out).length} Chibi 2.5 hashes unchanged`);
} else {
  writeFileSync(file, JSON.stringify(out, null, 0).replace(/,"/g, ',\n"'));
  console.log(`wrote ${Object.keys(out).length} Chibi 2.5 hashes`);
}
