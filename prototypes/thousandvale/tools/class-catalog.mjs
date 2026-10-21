#!/usr/bin/env node
// Feedback #98 (2026-10-21): the new-character screen's calling picker shows each class's six skills — the words the
// game itself writes for them (js/rules/index.js `bar`: cardText over the skill's own numbers, with Thousandvale's swaps
// and new skills) — before there is any character or server connection to ask. This builds them once into
// data/rules/class-catalog.json; tests/D/feedback-tv21-ui.test.js fails when the file is out of date.
//
//   node tools/class-catalog.mjs            write data/rules/class-catalog.json
//   node tools/class-catalog.mjs --check    exit 1 if it would change
import { readFileSync, writeFileSync } from 'node:fs';
import { createRoom } from '../js/sim/room.js';
import { standInTerrain } from '../js/sim/terrain.js';
import { createRules, rulesEngine } from '../js/rules/index.js';

export function buildCatalog() {
  const eng = rulesEngine();
  const terrain = standInTerrain(2, 2048);
  const out = { _doc: 'MADE by tools/class-catalog.mjs (do not edit): per class, the six skills as the game writes them (name, unlock level, card text, shape, element, cooldown, mana) and the class card line. Read by js/client/ui/calling-picker.js.', classes: {} };
  let n = 0;
  for (const c of eng.classes) {
    const id = `cat-${++n}`;
    const room = createRoom({ id, kind: 'wilds', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
    const e = room.addPlayer({ id: 1, name: 'Catalog', cls: c.id, level: 50, xp: 0, gold: 0, room: id, x: terrain.spawn.x, z: terrain.spawn.z }, null);
    const bar = room.rules.bar ? room.rules.bar(e) : [];
    out.classes[c.id] = {
      name: c.name, role: c.role || '', hook: c.hook || '', signature: c.signature || '', resource: c.resourceName || null, armour: c.armorTier || null, weapons: c.weapons || [], primary: c.primaryAttr || null,
      skills: bar.filter(s => s && s.id).map(s => ({ id: s.id, name: s.name, level: s.level || 1, desc: s.desc || '', shape: s.shape || null, element: s.element || null, cd: s.cd || 0, mp: s.mp || 0, ally: !!s.ally })),
    };
    room.rules.dispose?.();
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = new URL('../data/rules/class-catalog.json', import.meta.url);
  const text = JSON.stringify(buildCatalog(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    let had = ''; try { had = readFileSync(file, 'utf8'); } catch { /* none */ }
    if (had !== text) { console.error('data/rules/class-catalog.json is out of date: run node tools/class-catalog.mjs'); process.exit(1); }
    console.log('class catalog up to date');
  } else { writeFileSync(file, text); console.log('wrote data/rules/class-catalog.json'); }
}
