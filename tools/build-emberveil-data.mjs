// Builds prototypes/emberveil/data/*.json from the original Emberveil repo (~/claude/emberveil, read-only).
// Re-run after changing the source: node tools/build-emberveil-data.mjs
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const SRC = process.env.EMBERVEIL_SRC || path.join(os.homedir(), 'claude/emberveil'); const OUT = new URL('../prototypes/emberveil/data/', import.meta.url).pathname;
const read = p => fs.readFileSync(path.join(SRC, p), 'utf8');
// ---------------------------------------------------------------------------------------------
// Two things happen to every file on its way out of the original game and into this rebuild.
//
// 1. Tap weapons are gone. The original's real-time "tap" layer was never rebuilt, so the balance
//    knobs that tune it and the four road events that hand one out are stripped here: an event that
//    used to give a tap charm now rolls a real item instead (`buildLoot`), and its id loses the
//    `tap_` prefix. Doing it in the build means a re-run cannot bring them back.
// 2. Blocks this rebuild added by hand are kept. `balance.json` in particular grew a `world` block
//    (the travel layer) that the original file knows nothing about — without this, one rebuild would
//    silently wipe the night-raid and exhaustion tuning.
const TAP_LOOT = { heal: 'jewelry', cleanse: 'jewelry', phoenix_feather: 'jewelry', haste: 'jewelry', rally: 'jewelry', taunt_totem: 'armor', deflect: 'jewelry' };
function dropTap(node) {
  if (Array.isArray(node)) { for (const x of node) dropTap(x); return node; }
  if (!node || typeof node !== 'object') return node;
  delete node.tap; delete node.tapPower;
  if (typeof node.id === 'string' && node.id.startsWith('tap_')) node.id = 'road_' + node.id.slice(4);
  if (node.reward?.tapItem) { const t = node.reward.tapItem; delete node.reward.tapItem; node.reward.buildLoot = TAP_LOOT[t] || 'jewelry'; node.reward.buildLootRarity = 'rare'; }
  if (typeof node.text === 'string') node.text = node.text.replace('"When you need extra quickness, just tap."', '"Wear it when the road turns mean."');
  for (const v of Object.values(node)) dropTap(v);
  return node;
}
/** Keep the top-level blocks this rebuild wrote itself (they are not in the original file). */
function keepOurs(name, obj) {
  const p = path.join(OUT, name); if (!fs.existsSync(p) || !obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  let old; try { old = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return obj; }
  if (!old || typeof old !== 'object' || Array.isArray(old)) return obj;
  for (const [k, v] of Object.entries(old)) if (!(k in obj)) { obj[k] = v; console.log('  kept our', name, 'block:', k); }
  return obj;
}
const write = (name, obj) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(keepOurs(name, dropTap(obj)), null, 1)); console.log('wrote', name, fs.statSync(path.join(OUT, name)).size, 'bytes'); };
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
const { expandZones, addCrossings, addTowns, normalizeZones } = await import('./expand-emberveil-map.mjs');
console.log('map expansion: +' + expandZones(zones) + ' nodes (≈50% longer zones, mostly combat)');
// crossings are ours, not the original game's: travel hazards spliced into the road (data/crossings.json)
const crossingData = JSON.parse(fs.readFileSync(new URL('../prototypes/emberveil/data/crossings.json', import.meta.url).pathname, 'utf8'));
console.log('crossings: +' + addCrossings(zones, crossingData) + ' nodes');
console.log('settlements: +' + addTowns(zones) + ' nodes (one per act zone — there is no fast travel any more)');
console.log('map shape: ' + normalizeZones(zones) + ' zones rewired into a layered road (max 4 branches, no shortcuts)');
write('zones.json', zones);
write('random-events.json', await dumpModule('src/maps/randomEvents.js', ['RANDOM_EVENTS']));
write('dungeons.json', await dumpModule('src/maps/dungeons.js', ['DUNGEON_SKILL_CHECKS', 'DUNGEONS']));
// node types come from the original game; `crossing` is ours, so add it back after the dump
const nodeTypes = await dumpModule('src/maps/nodeTypes.js', ['NODE_TYPES']); nodeTypes.NODE_TYPES.CROSSING = 'crossing'; write('node-types.json', nodeTypes);
write('npc-events.json', await dumpModule('src/maps/recurringNpcEvents.js', ['RECURRING_NPC_EVENTS']));
write('dialog-events.json', await dumpModule('src/maps/dialogEvents.js', ['DIALOG_EVENTS']));
write('zone-tables.json', await dumpModule('src/maps/zoneTables.js', ['ZONE_DROP_CHANCE', 'ZONE_FAME_MULT', 'ZONE_UNLOCK_MAP', 'ZONE_NAMES', 'ACT_BOSS_ZONES']));
