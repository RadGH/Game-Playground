// Builds prototypes/emberveil/data/*.json from the original Emberveil repo (~/claude/emberveil, read-only).
// Re-run after changing the source: node tools/build-emberveil-data.mjs
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const SRC = process.env.EMBERVEIL_SRC || path.join(os.homedir(), 'claude/emberveil'); const OUT = new URL('../prototypes/emberveil/data/', import.meta.url).pathname;
const read = p => fs.readFileSync(path.join(SRC, p), 'utf8'); const write = (name, obj) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1)); console.log('wrote', name, fs.statSync(path.join(OUT, name)).size, 'bytes'); };
// 1. plain JSON copies (svgIcon stripped from classes: not needed)
const classes = JSON.parse(read('data/classes.json')); for (const c of classes.classes) delete c.svgIcon; write('classes.json', classes);
for (const [src, dst] of [['data/combat/skills.json', 'skills.json'], ['data/combat/status-effects.json', 'status-effects.json'], ['data/build-presets.json', 'build-presets.json'], ['data/entities/enemies.json', 'enemies.json'], ['data/entities/bosses.json', 'bosses.json'], ['data/entities/companions.json', 'companions.json'], ['data/entities/heroes.json', 'heroes.json'], ['data/entities/npcs.json', 'npcs.json'], ['data/combat/encounters.json', 'encounters.json'], ['data/combat/boss-phases.json', 'boss-phases.json'], ['data/combat/enemy-spells.json', 'enemy-spells.json'], ['data/balance/balance.active.json', 'balance.json']]) write(dst, JSON.parse(read(src)));
// 2. map modules are ES modules of plain data (functions are dropped). Imports are stripped and stubbed.
async function dumpModule(file, names) {
  let code = read(file).replace(/^import[^;]*;$/gm, '').replace(/^export\s+function[\s\S]*?\n}\n/gm, '');
  code = `const GameState = new Proxy({}, { get: () => () => null }); const BOSS_TAP_DROPS_CANONICAL = {}; ` + (file.includes('recurringNpcEvents') ? '' : 'const RECURRING_NPC_EVENTS = {};') + '\n' + code;
  let mod; try { mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); } catch (e) { console.error('FAILED', file, e.message.slice(0, 300)); return {}; }
  const out = {}; for (const n of names) out[n] = JSON.parse(JSON.stringify(mod[n] ?? null)); return out;
}
const zones = await dumpModule('src/maps/zones.js', ['PROLOGUE_ZONES', 'ACT1_ZONES', 'ACT2_ZONES', 'ACT3_ZONES', 'ACT4_ZONES', 'ACT5_ZONES', 'ACT6_ZONES', 'ZONE_ENCOUNTER_POOLS']);
const { expandZones, addCrossings } = await import('./expand-emberveil-map.mjs');
console.log('map expansion: +' + expandZones(zones) + ' nodes (≈50% longer zones, mostly combat)');
// crossings are ours, not the original game's: travel hazards spliced into the road (data/crossings.json)
const crossingData = JSON.parse(fs.readFileSync(new URL('../prototypes/emberveil/data/crossings.json', import.meta.url).pathname, 'utf8'));
console.log('crossings: +' + addCrossings(zones, crossingData) + ' nodes');
write('zones.json', zones);
write('random-events.json', await dumpModule('src/maps/randomEvents.js', ['RANDOM_EVENTS']));
write('dungeons.json', await dumpModule('src/maps/dungeons.js', ['DUNGEON_SKILL_CHECKS', 'DUNGEONS']));
// node types come from the original game; `crossing` is ours, so add it back after the dump
const nodeTypes = await dumpModule('src/maps/nodeTypes.js', ['NODE_TYPES']); nodeTypes.NODE_TYPES.CROSSING = 'crossing'; write('node-types.json', nodeTypes);
write('npc-events.json', await dumpModule('src/maps/recurringNpcEvents.js', ['RECURRING_NPC_EVENTS']));
write('dialog-events.json', await dumpModule('src/maps/dialogEvents.js', ['DIALOG_EVENTS']));
write('zone-tables.json', await dumpModule('src/maps/zoneTables.js', ['ZONE_DROP_CHANCE', 'ZONE_FAME_MULT', 'ZONE_UNLOCK_MAP', 'ZONE_NAMES', 'ACT_BOSS_ZONES']));
